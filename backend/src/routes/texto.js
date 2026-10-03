import { Router } from 'express';
import PDFDocument from 'pdfkit';
import xlsx from 'xlsx';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user.rol === 'cocina') return res.status(403).json({ error: 'No tienes acceso a esta sección.' });
  next();
});

// Campos disponibles del participante (siempre se pueden pedir)
const CAMPOS_PARTICIPANTE = {
  nombre_completo: 'Nombre Completo',
  dni: 'DNI',
  celular: 'Celular',
  capitulo: 'Capítulo',
  zona: 'Zona',
  departamento: 'Departamento',
  municipio: 'Municipio',
  cargo_fihnec: 'Cargo en FIHNEC',
  estado_civil: 'Estado Civil',
  hijos_cantidad: 'Hijos',
  comparte_testimonio: 'Comparte Testimonio',
  tiempo_comparte_testimonio: 'Tiempo de Testimonio',
  ha_recibido_sael: 'Ha recibido SAEL',
  cantidad_saeles: 'Cantidad de SAELES',
  contacto_emergencia_nombre: 'Contacto de Emergencia',
  contacto_emergencia_telefono: 'Teléfono de Emergencia',
  observacion: 'Observación'
};

// Campos que solo existen cuando se filtra por un nivel específico (vienen de la inscripción)
const CAMPOS_INSCRIPCION = {
  registrado_en: 'Fecha de Registro',
  fecha_graduacion: 'Fecha de Graduación',
  promocion_graduacion: 'Promoción'
};

router.get('/campos-disponibles', (req, res) => {
  res.json({ participante: CAMPOS_PARTICIPANTE, inscripcion: CAMPOS_INSCRIPCION });
});

// Construye la consulta SQL de forma segura a partir de los filtros recibidos.
async function construirConsulta(q) {
  let evento = q.evento && q.evento !== 'todos' ? q.evento : null;

  // "Evento actual": resuelve en tiempo real cuál nivel está marcado como activo.
  if (evento === 'actual') {
    const { rows } = await query('SELECT orden FROM eventos WHERE es_actual = TRUE LIMIT 1');
    evento = rows[0] ? rows[0].orden : null;
  } else if (evento) {
    evento = parseInt(evento, 10);
  }

  const camposPedidos = (q.campos || 'nombre_completo,dni,celular,capitulo,zona,cargo_fihnec')
    .split(',').map(c => c.trim()).filter(Boolean);

  const columnas = [];
  const selects = [];

  // Deserción: participantes que completaron el nivel ANTERIOR en un ciclo ya cerrado
  // (no el que se está inscribiendo justo ahora), pero que NUNCA se registraron en el
  // nivel actual, en ningún ciclo. Es una consulta distinta a las demás porque busca
  // gente que NO tiene fila en el nivel pedido, así que no se puede hacer con un JOIN
  // normal a ese nivel — se arma aparte.
  const esDesercion = q.alcance === 'desercion' && evento && [2, 3, 4].includes(evento);

  if (esDesercion) {
    for (const campo of camposPedidos) {
      if (CAMPOS_PARTICIPANTE[campo]) {
        columnas.push({ clave: campo, titulo: CAMPOS_PARTICIPANTE[campo] });
        selects.push(`p.${campo} AS "${campo}"`);
      }
    }
    if (selects.length === 0) {
      columnas.push({ clave: 'nombre_completo', titulo: 'Nombre Completo' });
      selects.push('p.nombre_completo AS "nombre_completo"');
    }
    // Se agrega siempre, aparte de lo que el usuario haya marcado: para qué sirve un
    // reporte de deserción si no dice desde cuándo dejaron de participar.
    columnas.push({ clave: 'ultimo_registro_nivel_anterior', titulo: `Último registro Nivel ${evento - 1}` });
    selects.push('i_prev.registrado_en AS "ultimo_registro_nivel_anterior"');

    const params = [evento - 1, evento];
    const condiciones = [
      'i_prev.ciclo <> e_prev.ciclo_actual',
      `NOT EXISTS (
        SELECT 1 FROM inscripciones i_cur
        JOIN eventos e_cur ON e_cur.id = i_cur.evento_id
        WHERE i_cur.participante_id = p.id AND e_cur.orden = $2
      )`
    ];
    if (q.zona) { params.push(q.zona); condiciones.push(`p.zona = $${params.length}`); }
    if (q.departamento) { params.push(q.departamento); condiciones.push(`p.departamento = $${params.length}`); }
    if (q.capitulo) { params.push(`%${q.capitulo}%`); condiciones.push(`p.capitulo ILIKE $${params.length}`); }
    if (q.buscar) {
      params.push(`%${q.buscar}%`);
      const idx = params.length;
      condiciones.push(`(p.nombre_completo ILIKE $${idx} OR p.dni ILIKE $${idx} OR p.capitulo ILIKE $${idx} OR p.celular ILIKE $${idx})`);
    }

    const sql = `
      SELECT ${selects.join(', ')}
      FROM participantes p
      JOIN inscripciones i_prev ON i_prev.participante_id = p.id
      JOIN eventos e_prev ON e_prev.id = i_prev.evento_id AND e_prev.orden = $1
      WHERE ${condiciones.join(' AND ')}
      ORDER BY p.nombre_completo ASC`;

    const { rows } = await query(sql, params);
    return { columnas, filas: rows, evento_resuelto: evento };
  }

  for (const campo of camposPedidos) {
    if (CAMPOS_PARTICIPANTE[campo]) {
      columnas.push({ clave: campo, titulo: CAMPOS_PARTICIPANTE[campo] });
      selects.push(`p.${campo} AS "${campo}"`);
    } else if (evento && CAMPOS_INSCRIPCION[campo]) {
      columnas.push({ clave: campo, titulo: CAMPOS_INSCRIPCION[campo] });
      selects.push(`i.${campo} AS "${campo}"`);
    }
  }
  if (selects.length === 0) {
    columnas.push({ clave: 'nombre_completo', titulo: 'Nombre Completo' });
    selects.push('p.nombre_completo AS "nombre_completo"');
  }

  const params = [];
  const condiciones = [];
  let desdeJoin = 'FROM participantes p';

  if (evento) {
    params.push(evento);
    desdeJoin += ` JOIN inscripciones i ON i.participante_id = p.id
                   JOIN eventos e ON e.id = i.evento_id AND e.orden = $${params.length}`;

    if (q.alcance === 'ciclo_actual') {
      condiciones.push('i.ciclo = e.ciclo_actual');
    } else if (q.alcance === 'rango' && q.desde && q.hasta) {
      params.push(q.desde, `${q.hasta} 23:59:59`);
      condiciones.push(`i.registrado_en BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    // alcance 'historico' (o sin especificar) = sin filtro extra de fecha

    if (q.promocion) {
      params.push(q.promocion);
      condiciones.push(`i.promocion_graduacion = $${params.length}`);
    }
  } else if (q.alcance === 'rango' && q.desde && q.hasta) {
    // Sin nivel específico ("todos"): el rango de fechas filtra por fecha de registro al sistema.
    params.push(q.desde, `${q.hasta} 23:59:59`);
    condiciones.push(`p.creado_en BETWEEN $${params.length - 1} AND $${params.length}`);
  }

  if (q.zona) { params.push(q.zona); condiciones.push(`p.zona = $${params.length}`); }
  if (q.departamento) { params.push(q.departamento); condiciones.push(`p.departamento = $${params.length}`); }
  if (q.capitulo) { params.push(`%${q.capitulo}%`); condiciones.push(`p.capitulo ILIKE $${params.length}`); }

  // Búsqueda general: nombre, DNI, capítulo o celular contienen el texto buscado.
  if (q.buscar) {
    params.push(`%${q.buscar}%`);
    const idx = params.length;
    condiciones.push(`(p.nombre_completo ILIKE $${idx} OR p.dni ILIKE $${idx} OR p.capitulo ILIKE $${idx} OR p.celular ILIKE $${idx})`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const sql = `SELECT ${selects.join(', ')} ${desdeJoin} ${where} ORDER BY p.nombre_completo ASC`;

  const { rows } = await query(sql, params);
  return { columnas, filas: rows, evento_resuelto: evento };
}

router.get('/', async (req, res) => {
  const { columnas, filas } = await construirConsulta(req.query);
  res.json({ columnas, filas, total: filas.length });
});

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const CAMPOS_FECHA = new Set(['registrado_en', 'fecha_graduacion', 'ultimo_registro_nivel_anterior']);

// Mismo formato que se ve en pantalla ("04 jul. 2026"), usando componentes UTC para no
// recorrerse un día por zona horaria — igual que en AdminParticipantes.jsx.
function formatearValorExport(clave, valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (CAMPOS_FECHA.has(clave)) {
    const d = new Date(valor);
    if (isNaN(d)) return String(valor);
    const dia = String(d.getUTCDate()).padStart(2, '0');
    const mes = MESES_CORTOS[d.getUTCMonth()];
    return `${dia} ${mes}. ${d.getUTCFullYear()}`;
  }
  return valor;
}

router.get('/excel', async (req, res) => {
  const { columnas, filas } = await construirConsulta(req.query);
  const datos = filas.map((f, i) => {
    const fila = { '#': i + 1 };
    for (const c of columnas) fila[c.titulo] = formatearValorExport(c.clave, f[c.clave]);
    return fila;
  });
  const hoja = xlsx.utils.json_to_sheet(datos);
  const libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(libro, hoja, 'Reporte');
  const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="reporte_sfl.xlsx"');
  res.send(buffer);
});

router.get('/pdf', async (req, res) => {
  const { columnas, filas } = await construirConsulta(req.query);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="reporte_sfl.pdf"');

  const doc = new PDFDocument({ size: 'letter', margin: 30, layout: columnas.length > 4 ? 'landscape' : 'portrait' });
  doc.pipe(res);

  doc.fontSize(15).font('Helvetica-Bold').text('FIHNEC · Seminario para la Formación de Líderes', { align: 'center' });
  doc.fontSize(11).font('Helvetica').text('Reporte de participantes', { align: 'center' });
  doc.moveDown(1);

  const anchoDisponible = doc.page.width - 60;
  const anchoCol = anchoDisponible / (columnas.length + 1);

  const dibujarFila = (valores, negrita) => {
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    let x = 30;
    const y = doc.y;
    valores.forEach(v => {
      doc.text(String(v ?? ''), x, y, { width: anchoCol - 5 });
      x += anchoCol;
    });
    doc.moveDown(0.6);
  };

  dibujarFila(['#', ...columnas.map(c => c.titulo)], true);
  doc.moveTo(30, doc.y).lineTo(30 + anchoDisponible, doc.y).strokeColor('#cccccc').stroke();
  doc.moveDown(0.3);

  filas.forEach((f, i) => {
    if (doc.y > doc.page.height - 60) doc.addPage({ size: 'letter', margin: 30, layout: columnas.length > 4 ? 'landscape' : 'portrait' });
    dibujarFila([i + 1, ...columnas.map(c => formatearValorExport(c.clave, f[c.clave]))], false);
  });

  doc.end();
});

export default router;
