import { Router } from 'express';
import PDFDocument from 'pdfkit';
import xlsx from 'xlsx';
import { query } from '../db.js';
import { requireAuth, requireModulo } from '../auth.js';
import { guardarEnPapelera } from '../papelera.js';

const router = Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user.rol === 'cocina') return res.status(403).json({ error: 'No tienes acceso a esta sección.' });
  next();
});
router.use(requireModulo('transporte', 'consulta'));

// Registros nuevos usan departamento/municipio; los viejos que solo tienen "ciudad" (de
// antes de este cambio) se siguen mostrando igual, para no perder nada de lo ya guardado.
function textoUbicacion(t) {
  if (t.departamento) return [t.departamento, t.municipio].filter(Boolean).join(' — ');
  return t.ciudad || '—';
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Formatea una fecha (columna DATE, llega como Date en medianoche UTC) como
// "Viernes 14 de Agosto del 2026", usando los componentes UTC para no recorrerse un día
// por zona horaria — mismo cuidado que ya aplicamos en AdminParticipantes.jsx.
function formatearFechaLarga(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (isNaN(d)) return String(fecha);
  const diaSemana = DIAS_SEMANA[d.getUTCDay()];
  const dia = d.getUTCDate();
  const mes = MESES[d.getUTCMonth()];
  const anio = d.getUTCFullYear();
  return `${diaSemana} ${dia} de ${mes} del ${anio}`;
}

// Formato corto DD/MM/AAAA, mejor para ordenar/filtrar en una hoja de Excel.
function formatearFechaDDMMYYYY(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (isNaN(d)) return String(fecha);
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const anio = d.getUTCFullYear();
  return `${dia}/${mes}/${anio}`;
}

// Convierte una hora en formato 24h ("13:00:00", como la guarda Postgres) a 12h con AM/PM.
function formatearHora12(horaTexto) {
  if (!horaTexto) return '';
  const [hStr, mStr] = String(horaTexto).split(':');
  let horas = parseInt(hStr, 10);
  if (Number.isNaN(horas)) return horaTexto;
  const minutos = (mStr || '00').padStart(2, '0');
  const sufijo = horas >= 12 ? 'PM' : 'AM';
  horas = horas % 12;
  if (horas === 0) horas = 12;
  return `${horas}:${minutos} ${sufijo}`;
}

/* ------------------------------ TIPOS DE VEHÍCULO ------------------------------ */

router.get('/tipos-vehiculo', async (req, res) => {
  const { rows } = await query('SELECT * FROM tipos_vehiculo ORDER BY capacidad');
  res.json({ tipos: rows });
});

router.post('/tipos-vehiculo', requireModulo('transporte', 'edicion'), async (req, res) => {
  const { nombre, capacidad } = req.body || {};
  if (!nombre || !capacidad) return res.status(400).json({ error: 'Nombre y capacidad son obligatorios.' });
  const { rows } = await query(
    'INSERT INTO tipos_vehiculo (nombre, capacidad) VALUES ($1,$2) RETURNING *',
    [nombre.trim(), parseInt(capacidad, 10)]
  );
  res.status(201).json(rows[0]);
});

router.delete('/tipos-vehiculo/:id', requireModulo('transporte', 'edicion'), async (req, res) => {
  const { rows } = await query('SELECT nombre FROM tipos_vehiculo WHERE id = $1', [req.params.id]);
  if (rows[0]) await guardarEnPapelera('tipos_vehiculo', req.params.id, rows[0].nombre, req.user.id);
  const { rowCount } = await query('DELETE FROM tipos_vehiculo WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Tipo de vehículo no encontrado.' });
  res.json({ mensaje: 'Eliminado.' });
});

/* --------------------------------- TRANSPORTES --------------------------------- */

// Agrega, a cada transporte, la lista de servidores que están en OTRO transporte con la
// misma fecha/hora de salida — para pintar la alerta de doble-asignación sin bloquear nada.
async function marcarConflictos(transportes) {
  const porFechaHora = new Map();
  for (const t of transportes) {
    const clave = `${t.fecha_salida}|${t.hora_salida || ''}`;
    if (!porFechaHora.has(clave)) porFechaHora.set(clave, []);
    porFechaHora.get(clave).push(t);
  }
  for (const grupo of porFechaHora.values()) {
    if (grupo.length < 2) continue;
    const vistos = new Map(); // servidor_id -> cuántos transportes de este grupo lo tienen
    for (const t of grupo) {
      for (const p of t.pasajeros) {
        vistos.set(p.id, (vistos.get(p.id) || 0) + 1);
      }
      if (t.conductor_id) vistos.set(t.conductor_id, (vistos.get(t.conductor_id) || 0) + 1);
    }
    for (const t of grupo) {
      const idsEnEsteTransporte = new Set([...t.pasajeros.map(p => p.id), t.conductor_id].filter(Boolean));
      t.conflicto = [...idsEnEsteTransporte].some(id => vistos.get(id) > 1);
    }
  }
  return transportes;
}

// GET /api/admin/transporte/transportes -> todos los viajes del evento actual, con
// conductor, tipo de vehículo y pasajeros ya resueltos.
router.get('/transportes', async (req, res) => {
  const eventoRes = await query('SELECT id, nombre FROM eventos WHERE es_actual = TRUE LIMIT 1');
  const evento = eventoRes.rows[0] || null;
  if (!evento) return res.json({ evento: null, transportes: [] });

  const { rows: transportes } = await query(
    `SELECT t.id, t.ciudad, t.departamento, t.municipio, t.fecha_salida, t.hora_salida, t.conductor_id, t.capacidad_personalizada,
            s.nombre_completo AS conductor_nombre,
            tv.id AS tipo_vehiculo_id, tv.nombre AS tipo_vehiculo_nombre,
            COALESCE(t.capacidad_personalizada, tv.capacidad) AS capacidad
     FROM transportes t
     LEFT JOIN servidores s ON s.id = t.conductor_id
     JOIN tipos_vehiculo tv ON tv.id = t.tipo_vehiculo_id
     WHERE t.evento_id = $1
     ORDER BY t.fecha_salida, t.hora_salida NULLS LAST`,
    [evento.id]
  );

  for (const t of transportes) {
    const pasajerosRes = await query(
      `SELECT s.id, s.nombre_completo FROM transporte_pasajeros tp
       JOIN servidores s ON s.id = tp.servidor_id WHERE tp.transporte_id = $1
       ORDER BY s.nombre_completo`,
      [t.id]
    );
    t.pasajeros = pasajerosRes.rows;
  }

  await marcarConflictos(transportes);
  res.json({ evento, transportes });
});

// POST /api/admin/transporte/transportes
router.post('/transportes', requireModulo('transporte', 'edicion'), async (req, res) => {
  const { conductor_id, tipo_vehiculo_id, departamento, municipio, fecha_salida, hora_salida } = req.body || {};
  const eventoRes = await query('SELECT id FROM eventos WHERE es_actual = TRUE LIMIT 1');
  const evento = eventoRes.rows[0];
  if (!evento) return res.status(400).json({ error: 'No hay ningún evento marcado como actual.' });
  if (!tipo_vehiculo_id || !departamento || !fecha_salida) {
    return res.status(400).json({ error: 'Tipo de vehículo, departamento y fecha de salida son obligatorios.' });
  }

  const { rows } = await query(
    `INSERT INTO transportes (evento_id, conductor_id, tipo_vehiculo_id, departamento, municipio, fecha_salida, hora_salida)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [evento.id, conductor_id || null, tipo_vehiculo_id, departamento, municipio || null, fecha_salida, hora_salida || null]
  );
  res.status(201).json({ id: rows[0].id });
});

// PUT /api/admin/transporte/transportes/:id
router.put('/transportes/:id', requireModulo('transporte', 'edicion'), async (req, res) => {
  const { conductor_id, tipo_vehiculo_id, departamento, municipio, fecha_salida, hora_salida, capacidad_personalizada } = req.body || {};
  const { rowCount } = await query(
    `UPDATE transportes SET conductor_id = $1, tipo_vehiculo_id = $2, departamento = $3, municipio = $4,
       fecha_salida = $5, hora_salida = $6, capacidad_personalizada = $7 WHERE id = $8`,
    [conductor_id || null, tipo_vehiculo_id, departamento, municipio || null, fecha_salida, hora_salida || null,
     capacidad_personalizada === '' || capacidad_personalizada == null ? null : parseInt(capacidad_personalizada, 10),
     req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Transporte no encontrado.' });
  res.json({ mensaje: 'Actualizado.' });
});

// DELETE /api/admin/transporte/transportes/:id
router.delete('/transportes/:id', requireModulo('transporte', 'edicion'), async (req, res) => {
  const { rows } = await query('SELECT ciudad, departamento, municipio, fecha_salida FROM transportes WHERE id = $1', [req.params.id]);
  if (rows[0]) await guardarEnPapelera('transportes', req.params.id, `${textoUbicacion(rows[0])} · ${rows[0].fecha_salida}`, req.user.id);
  const { rowCount } = await query('DELETE FROM transportes WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Transporte no encontrado.' });
  res.json({ mensaje: 'Eliminado.' });
});

// POST /api/admin/transporte/transportes/:id/pasajeros  body: { servidor_id }
// No bloquea si el servidor ya está en otro transporte a la misma fecha/hora — solo se
// pintará la alerta la próxima vez que se pida la lista (GET /transportes).
router.post('/transportes/:id/pasajeros', requireModulo('transporte', 'edicion'), async (req, res) => {
  const { servidor_id } = req.body || {};
  if (!servidor_id) return res.status(400).json({ error: 'servidor_id es obligatorio.' });

  const capacidadRes = await query(
    `SELECT COALESCE(t.capacidad_personalizada, tv.capacidad) AS capacidad,
            (SELECT COUNT(*)::int FROM transporte_pasajeros WHERE transporte_id = t.id) AS ocupados
     FROM transportes t JOIN tipos_vehiculo tv ON tv.id = t.tipo_vehiculo_id WHERE t.id = $1`,
    [req.params.id]
  );
  const info = capacidadRes.rows[0];
  if (!info) return res.status(404).json({ error: 'Transporte no encontrado.' });
  if (info.ocupados >= info.capacidad) {
    return res.status(409).json({ error: `Este vehículo ya está lleno (capacidad ${info.capacidad}).` });
  }

  await query(
    'INSERT INTO transporte_pasajeros (transporte_id, servidor_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [req.params.id, servidor_id]
  );
  res.status(201).json({ mensaje: 'Pasajero agregado.' });
});

// DELETE /api/admin/transporte/transportes/:id/pasajeros/:servidorId
router.delete('/transportes/:id/pasajeros/:servidorId', requireModulo('transporte', 'edicion'), async (req, res) => {
  await query(
    'DELETE FROM transporte_pasajeros WHERE transporte_id = $1 AND servidor_id = $2',
    [req.params.id, req.params.servidorId]
  );
  res.json({ mensaje: 'Pasajero quitado.' });
});

/* ------------------------------ EXPORTACIÓN ------------------------------ */

const NIGHT = '#241A12';
const GOLD = '#C9932F';
const BANNER_BG = '#F1E6CC';
const INK = '#2B2118';
const INK_SOFT = '#6B5F52';
const LINEA = '#D8CBAE';

async function recolectarTransportes() {
  const eventoRes = await query('SELECT id, nombre FROM eventos WHERE es_actual = TRUE LIMIT 1');
  const evento = eventoRes.rows[0] || null;
  if (!evento) return { evento: null, transportes: [] };
  const { rows: transportes } = await query(
    `SELECT t.id, t.ciudad, t.departamento, t.municipio, t.fecha_salida, t.hora_salida, s.nombre_completo AS conductor_nombre,
            tv.nombre AS tipo_vehiculo_nombre, COALESCE(t.capacidad_personalizada, tv.capacidad) AS capacidad
     FROM transportes t
     LEFT JOIN servidores s ON s.id = t.conductor_id
     JOIN tipos_vehiculo tv ON tv.id = t.tipo_vehiculo_id
     WHERE t.evento_id = $1 ORDER BY t.fecha_salida, t.hora_salida NULLS LAST`,
    [evento.id]
  );
  for (const t of transportes) {
    const pasajerosRes = await query(
      `SELECT s.nombre_completo FROM transporte_pasajeros tp JOIN servidores s ON s.id = tp.servidor_id
       WHERE tp.transporte_id = $1 ORDER BY s.nombre_completo`,
      [t.id]
    );
    t.pasajeros = pasajerosRes.rows.map(p => p.nombre_completo);
  }
  return { evento, transportes };
}

router.get('/excel', async (req, res) => {
  const { transportes } = await recolectarTransportes();
  const filas = transportes.map((t, i) => ({
    '#': i + 1,
    'Conductor': t.conductor_nombre || 'Sin asignar',
    'Vehículo': t.tipo_vehiculo_nombre,
    'Ubicación': textoUbicacion(t),
    'Fecha salida': formatearFechaDDMMYYYY(t.fecha_salida),
    'Hora salida': formatearHora12(t.hora_salida),
    'Pasajeros': t.pasajeros.join(', '),
    'Cupos': `${t.pasajeros.length}/${t.capacidad}`
  }));
  const hoja = xlsx.utils.json_to_sheet(filas);
  const libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(libro, hoja, 'Transporte');
  const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="transporte_sfl.xlsx"');
  res.send(buffer);
});

// GET /pdf -> manifiesto: una tarjeta por vehículo con su lista de pasajeros, lista para imprimir
router.get('/pdf', async (req, res) => {
  const { evento, transportes } = await recolectarTransportes();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="transporte_sfl.pdf"');

  const doc = new PDFDocument({ size: 'letter', margin: 40 });
  doc.pipe(res);
  const ANCHO = doc.page.width;
  const MARGEN = 40;

  doc.rect(0, 0, ANCHO, 70).fill(NIGHT);
  doc.fillColor(GOLD).font('Times-Bold').fontSize(17).text('FIHNEC · Seminario para la Formación de Líderes', MARGEN, 20);
  doc.fillColor('#FBF6EC').font('Helvetica').fontSize(10.5).text(`Manifiesto de transporte${evento ? ' · ' + evento.nombre : ''}`, MARGEN, 44);
  doc.y = 90;

  if (transportes.length === 0) {
    doc.fillColor(INK_SOFT).font('Helvetica').fontSize(10).text('No hay transportes registrados todavía.', MARGEN);
  }

  for (const t of transportes) {
    if (doc.y > doc.page.height - 140) { doc.addPage(); doc.y = 40; }
    doc.rect(MARGEN, doc.y, ANCHO - MARGEN * 2, 24).fill(BANNER_BG);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11)
      .text(`${t.tipo_vehiculo_nombre} · ${textoUbicacion(t)} · ${formatearFechaLarga(t.fecha_salida)}${t.hora_salida ? ' · ' + formatearHora12(t.hora_salida) : ''}`, MARGEN + 8, doc.y + 7);
    doc.moveDown(1.6);

    doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9).text(`Conductor: `, MARGEN + 8, doc.y, { continued: true });
    doc.fillColor(INK).font('Helvetica-Bold').text(t.conductor_nombre || 'Sin asignar');
    doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9).text(`Cupos: ${t.pasajeros.length}/${t.capacidad}`, MARGEN + 8);
    doc.moveDown(0.4);

    doc.fillColor(INK_SOFT).font('Helvetica-Bold').fontSize(8.5).text('Pasajeros:', MARGEN + 8, doc.y);
    doc.moveDown(0.2);
    if (t.pasajeros.length === 0) {
      doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9).text('— sin pasajeros asignados —', MARGEN + 16);
    } else {
      t.pasajeros.forEach(p => {
        doc.fillColor(INK).font('Helvetica').fontSize(9).text(`•  ${p}`, MARGEN + 16);
      });
    }
    doc.moveTo(MARGEN, doc.y + 8).lineTo(ANCHO - MARGEN, doc.y + 8).strokeColor(LINEA).lineWidth(0.5).stroke();
    doc.moveDown(1.2);
  }

  doc.end();
});

export default router;
