import { Router } from 'express';
import xlsx from 'xlsx';
import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { query } from '../db.js';
import { requireAuth, requireModulo, requireRole } from '../auth.js';
import { normalizarNombre, soloDigitos } from '../texto.js';
import { guardarEnPapelera } from '../papelera.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');

const router = Router();
router.use(requireAuth);
// Esta sección no es visible para el rol "cocina" (solo tiene su propio resumen dedicado).
router.use((req, res, next) => {
  if (req.user.rol === 'cocina') return res.status(403).json({ error: 'No tienes acceso a esta sección.' });
  next();
});
router.use(requireModulo('servidores', 'consulta'));

const COLUMNAS_EXPORT = {
  nombre_completo: 'Nombre Completo',
  dni: 'DNI',
  capitulo: 'Capítulo',
  departamento: 'Departamento',
  celular: 'Celular',
  estado_civil: 'Estado Civil',
  hijos_cantidad: 'Hijos',
  fecha_nacimiento: 'Fecha de Nacimiento',
  cargo_actual: 'Cargo Actual',
  email: 'E-mail'
};

// Campos editables desde el panel (además de los de siempre).
// Nota: "participara_evento" YA NO se edita directo — se calcula solo a partir de los 3
// checkboxes de días (Viernes/Sábado/Domingo), ver más abajo.
const CAMPOS_ARRAY = ['cargos_desempenados', 'formacion_oficial', 'otras_participaciones'];
const CAMPOS_EDITABLES = [
  'nombre_completo', 'dni', 'capitulo', 'celular', 'estado_civil', 'hijos_cantidad',
  'fecha_nacimiento', 'email',
  'nombre_esposa', 'nietos_cantidad', 'profesion', 'contacto_emergencia_telefono', 'foto',
  'fecha_inscripcion_capitulo', 'tiempo_fihnec', 'cargo_actual', 'zona', 'departamento', 'municipio', 'tipo_testimonio',
  ...CAMPOS_ARRAY
];

import { obtenerMapaDias, guardarMapaDias, diasDe, guardarDiasServidor, DIAS_POR_DEFECTO } from '../diasAsistencia.js';
import { regenerarPin } from '../pinSeguridad.js';

// (Los días de asistencia por servidor ahora viven en backend/src/diasAsistencia.js,
// compartido con el portal público — ver ese archivo para el diseño completo.)

router.get('/excel', async (req, res) => {
  const { rows } = await query('SELECT * FROM servidores ORDER BY nombre_completo ASC');
  const datos = rows.map((s, i) => {
    const fila = { '#': i + 1 };
    for (const [clave, titulo] of Object.entries(COLUMNAS_EXPORT)) fila[titulo] = s[clave] ?? '';
    return fila;
  });
  const hoja = xlsx.utils.json_to_sheet(datos);
  const libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(libro, hoja, 'Servidores SFL');
  const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="servidores_sfl.xlsx"');
  res.send(buffer);
});

router.get('/pdf', async (req, res) => {
  const { rows } = await query('SELECT * FROM servidores ORDER BY nombre_completo ASC');
  const columnas = Object.entries(COLUMNAS_EXPORT);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="servidores_sfl.pdf"');

  const MARGEN = 30;
  const doc = new PDFDocument({ size: 'letter', margin: MARGEN, layout: 'landscape' });
  doc.pipe(res);

  const ANCHO = doc.page.width;
  const ANCHO_TABLA = ANCHO - MARGEN * 2;

  // Encabezado con el mismo estilo de marca que la Ficha individual (banda oscura + línea dorada).
  const dibujarEncabezado = () => {
    doc.rect(0, 0, ANCHO, 50).fill(NIGHT);
    doc.rect(0, 50, ANCHO, 3).fill(GOLD);
    doc.fillColor(PARCHMENT).font('Helvetica').fontSize(8).text('FIHNEC HONDURAS', MARGEN, 14, { characterSpacing: 2 });
    doc.fillColor(GOLD).font('Times-Bold').fontSize(16).text('Servidores del SFL', MARGEN, 25);
    doc.y = 68;
  };
  dibujarEncabezado();

  // Anchos de columna proporcionales — ajustados para que, con nombres/capítulos/correos
  // típicos, el texto quede en aproximadamente: Nombre 2 líneas (nombres/apellidos),
  // DNI 1 línea, Capítulo 2 líneas, Correo 2 líneas. La altura real de cada fila igual
  // se sigue midiendo abajo, así que un valor más largo de lo normal nunca se corta.
  const PROPORCIONES = {
    '#': 0.32, nombre_completo: 1.3, dni: 1.05, capitulo: 1.0, departamento: 0.75, celular: 0.58,
    estado_civil: 0.55, hijos_cantidad: 0.42, fecha_nacimiento: 0.65, cargo_actual: 0.82, email: 1.15
  };
  const clavesConNumero = ['#', ...columnas.map(([clave]) => clave)];
  const sumaProporciones = clavesConNumero.reduce((acc, c) => acc + (PROPORCIONES[c] || 0.8), 0);
  const anchosCol = clavesConNumero.map(c => ((PROPORCIONES[c] || 0.8) / sumaProporciones) * ANCHO_TABLA);

  // Rótulos abreviados SOLO para el encabezado del PDF (el Excel sigue usando el nombre
  // completo de COLUMNAS_EXPORT, ahí sí hay espacio de sobra).
  const TITULOS_PDF = { fecha_nacimiento: 'F.D.N.', departamento: 'Depto.' };

  // Nombre completo en 2 líneas fijas: nombres (primer y segundo nombre) en la línea 1,
  // apellidos en la línea 2 — en vez de dejar que el ancho de columna decida dónde corta.
  const partirNombre = (nombreCompleto) => {
    const partes = String(nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length <= 2) return partes.join(' ');
    return `${partes.slice(0, 2).join(' ')}\n${partes.slice(2).join(' ')}`;
  };

  const formatearValor = (clave, valor) => {
    if (clave === 'nombre_completo') return partirNombre(valor);
    if (valor === null || valor === undefined || valor === '') return '—';
    if (clave === 'fecha_nacimiento') {
      const f = new Date(valor);
      return isNaN(f) ? '—' : f.toLocaleDateString('es-HN', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return String(valor);
  };

  const PAD_X = 6;
  const PAD_Y = 5;
  const encabezadoColumnas = ['#', ...columnas.map(([clave, titulo]) => TITULOS_PDF[clave] || titulo)];

  // Calcula cuánto mide cada celda de la fila (puede tener varias líneas) y usa la más
  // alta para avanzar — así ninguna fila se monta sobre la siguiente, sin importar cuán
  // largo sea un correo, un capítulo o cualquier otro campo.
  const dibujarFila = (valores, { negrita = false, fondo = null, colorTexto = INK, esEncabezadoTabla = false } = {}) => {
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    const alturas = valores.map((v, i) => doc.heightOfString(String(v ?? ''), { width: anchosCol[i] - PAD_X * 2 }));
    const alturaFila = Math.max(...alturas, 9) + PAD_Y * 2;

    if (!esEncabezadoTabla && doc.y + alturaFila > doc.page.height - MARGEN) {
      doc.addPage({ size: 'letter', margin: MARGEN, layout: 'landscape' });
      dibujarEncabezado();
      // Repite el encabezado de columnas (nombres de campo) en cada página nueva, y
      // vuelve a fijar la letra normal — dibujarEncabezado() dejó activa la letra grande
      // dorada del título, que si no se resetea aquí se "hereda" en la siguiente fila.
      dibujarFila(encabezadoColumnas, { negrita: true, fondo: BANNER_BG, colorTexto: NIGHT, esEncabezadoTabla: true });
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    }
    const y = doc.y;
    if (fondo) doc.rect(MARGEN, y, ANCHO_TABLA, alturaFila).fill(fondo);
    doc.fillColor(colorTexto);
    let x = MARGEN;
    valores.forEach((v, i) => {
      doc.text(String(v ?? ''), x + PAD_X, y + PAD_Y, { width: anchosCol[i] - PAD_X * 2 });
      x += anchosCol[i];
    });
    doc.y = y + alturaFila;
    doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO_TABLA, doc.y).lineWidth(0.5).strokeColor(LINEA).stroke();
  };

  dibujarFila(encabezadoColumnas, { negrita: true, fondo: BANNER_BG, colorTexto: NIGHT, esEncabezadoTabla: true });

  rows.forEach((s, i) => {
    dibujarFila(
      [i + 1, ...columnas.map(([clave]) => formatearValor(clave, s[clave]))],
      { fondo: i % 2 === 1 ? PARCHMENT : null }
    );
  });
  doc.end();
});

router.get('/', async (req, res) => {
  const [{ rows }, mapaDias] = await Promise.all([
    query('SELECT * FROM servidores ORDER BY nombre_completo ASC'),
    obtenerMapaDias()
  ]);

  // Autocorrección: servidores que NUNCA han tocado los 3 checkboxes de días (no están en
  // el mapa) deben tener participara_evento = TRUE, porque el valor por defecto de los 3
  // días es "marcados". Si la columna en la base quedó con un valor viejo de antes de este
  // cambio (algunos en false), se corrige aquí mismo — así el conteo que usa Cocina y el
  // resumen de esta pantalla siempre coinciden con lo que se ve en los círculos V/S/D.
  const idsSinTocar = rows.filter(s => !mapaDias[String(s.id)] && s.participara_evento !== true).map(s => s.id);
  if (idsSinTocar.length > 0) {
    await query('UPDATE servidores SET participara_evento = TRUE WHERE id = ANY($1::int[])', [idsSinTocar]);
    for (const s of rows) if (idsSinTocar.includes(s.id)) s.participara_evento = true;
  }

  const conDias = rows.map(s => {
    const { pin, ...sinPin } = s; // el PIN nunca viaja en el listado general
    return { ...sinPin, dias_asistencia: diasDe(mapaDias, s.id) };
  });
  res.json(conDias);
});

router.post('/', requireModulo('servidores', 'edicion'), async (req, res) => {
  const b = req.body || {};
  if (!b.nombre_completo) return res.status(400).json({ error: 'El nombre completo es obligatorio.' });

  const datos = { ...b };
  datos.nombre_completo = normalizarNombre(b.nombre_completo);
  if (b.capitulo) datos.capitulo = normalizarNombre(b.capitulo);
  if (b.celular) datos.celular = soloDigitos(b.celular);
  if (b.contacto_emergencia_telefono) datos.contacto_emergencia_telefono = soloDigitos(b.contacto_emergencia_telefono);
  if (b.nombre_esposa) datos.nombre_esposa = normalizarNombre(b.nombre_esposa);

  const cols = CAMPOS_EDITABLES.filter(c => datos[c] !== undefined);
  cols.push('pin');
  const pinNuevo = String(Math.floor(1000 + Math.random() * 9000));
  const nombresCols = cols.join(', ');
  const marcadores = cols.map((_, i) => `$${i + 1}`).join(', ');
  const vals = [...CAMPOS_EDITABLES.filter(c => datos[c] !== undefined).map(c => datos[c]), pinNuevo];

  const { rows } = await query(
    `INSERT INTO servidores (${nombresCols}) VALUES (${marcadores}) RETURNING *`,
    vals
  );
  const { pin: _pin, ...sinPin } = rows[0];
  res.status(201).json(sinPin);
});

router.put('/:id', requireModulo('servidores', 'edicion'), async (req, res) => {
  const b = req.body || {};
  const datos = { ...b };
  if (b.nombre_completo) datos.nombre_completo = normalizarNombre(b.nombre_completo);
  if (b.capitulo) datos.capitulo = normalizarNombre(b.capitulo);
  if (b.celular) datos.celular = soloDigitos(b.celular);
  if (b.contacto_emergencia_telefono) datos.contacto_emergencia_telefono = soloDigitos(b.contacto_emergencia_telefono);
  if (b.nombre_esposa) datos.nombre_esposa = normalizarNombre(b.nombre_esposa);

  const cols = CAMPOS_EDITABLES.filter(c => datos[c] !== undefined);
  if (cols.length === 0) return res.status(400).json({ error: 'Nada para actualizar.' });
  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const vals = cols.map(c => datos[c]);
  vals.push(req.params.id);
  const { rows } = await query(
    `UPDATE servidores SET ${setClause}, actualizado_en = now() WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'Servidor no encontrado.' });
  const { pin: _pin, ...sinPin } = rows[0];
  res.json(sinPin);
});

// PUT /api/admin/servidores/:id/participacion body: { participa: boolean }
// Interruptor maestro "Participará en el evento", independiente de los 3 días.
// - Al APAGARLO: solo se apaga participara_evento, los días guardados no se tocan.
// - Al ENCENDERLO: se rellenan los 3 días (Viernes/Sábado/Domingo) marcados de una vez.
router.put('/:id/participacion', requireModulo('servidores', 'edicion'), async (req, res) => {
  const participa = !!req.body?.participa;
  const mapa = await obtenerMapaDias();
  if (participa) {
    mapa[String(req.params.id)] = { ...DIAS_POR_DEFECTO };
    await guardarMapaDias(mapa);
  }
  const { rows } = await query(
    'UPDATE servidores SET participara_evento = $1, actualizado_en = now() WHERE id = $2 RETURNING *',
    [participa, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Servidor no encontrado.' });
  res.json({ ...rows[0], dias_asistencia: diasDe(mapa, req.params.id) });
});

// PUT /api/admin/servidores/:id/dias-asistencia body: { viernes, sabado, domingo }
// Guarda los 3 checkboxes de días en el mapa de configuración y recalcula automáticamente
// "participara_evento" (Sí si al menos 1 de los 3 días está marcado, No si los 3 están
// desmarcados) — los 3 checkboxes son la única fuente real del dato, "participara_evento"
// es solo la etiqueta calculada a partir de ellos.
// POST /api/admin/servidores/:id/regenerar-pin -> genera un PIN nuevo de 4 dígitos para
// el portal del servidor (por si lo perdió o quiere que se lo compartas de nuevo). Marca
// que debe personalizarlo en su próximo ingreso — nunca queda usando uno que tú generaste.
// Solo Administrador o Super Administrador pueden ver o regenerar PINes — ningún otro rol,
// aunque tenga edición en Servidores por otro motivo.
router.post('/:id/regenerar-pin', requireRole('admin', 'super_admin'), async (req, res) => {
  const { rows: existe } = await query('SELECT id FROM servidores WHERE id = $1', [req.params.id]);
  if (!existe[0]) return res.status(404).json({ error: 'Servidor no encontrado.' });
  const pinNuevo = await regenerarPin('servidores', req.params.id);
  res.json({ id: req.params.id, pin: pinNuevo });
});

// GET /api/admin/servidores/:id/pin -> ver el PIN actual (sin regenerarlo), mismo candado
// de rol que regenerar-pin.
router.get('/:id/pin', requireRole('admin', 'super_admin'), async (req, res) => {
  const { rows } = await query('SELECT pin FROM servidores WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Servidor no encontrado.' });
  res.json({ pin: rows[0].pin });
});

router.put('/:id/dias-asistencia', requireModulo('servidores', 'edicion'), async (req, res) => {
  const b = req.body || {};
  const actualizado = await guardarDiasServidor(req.params.id, { viernes: b.viernes, sabado: b.sabado, domingo: b.domingo });
  if (!actualizado.id) return res.status(404).json({ error: 'Servidor no encontrado.' });
  res.json(actualizado);
});

// POST /api/admin/servidores/reiniciar-participacion -> vuelve a marcar los 3 días
// (Viernes/Sábado/Domingo) de TODOS los servidores, y por lo tanto "participara_evento"
// vuelve a Sí para todos (ej. antes de un evento nuevo, para que todos arranquen marcados
// y cada quien desmarque el día que no le aplique).
// Antes de reiniciar, guarda una foto de cómo quedó el ciclo que está terminando en
// servidores_historial_participacion — así se va construyendo el historial real, ciclo por
// ciclo, para poder mostrar gráficas de evolución más adelante (hoy no existen, empiezan aquí).
router.post('/reiniciar-participacion', requireModulo('servidores', 'edicion'), async (req, res) => {
  const { rows: eventoActualRows } = await query('SELECT id, nombre, ciclo_actual FROM eventos WHERE es_actual = TRUE LIMIT 1');
  const eventoActual = eventoActualRows[0] || null;

  if (eventoActual) {
    const [{ rows: servidoresRows }, mapaDias] = await Promise.all([
      query('SELECT id, participara_evento FROM servidores'),
      obtenerMapaDias()
    ]);
    for (const s of servidoresRows) {
      const dias = diasDe(mapaDias, s.id);
      await query(
        `INSERT INTO servidores_historial_participacion (servidor_id, evento_id, evento_nombre, ciclo, participo, dias_asistencia)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [s.id, eventoActual.id, eventoActual.nombre, eventoActual.ciclo_actual, !!s.participara_evento, JSON.stringify(dias)]
      );
    }
  }

  await guardarMapaDias({}); // vacío = todos vuelven al valor por defecto (3 días marcados)
  const { rowCount } = await query('UPDATE servidores SET participara_evento = TRUE');
  res.json({ mensaje: 'Se reinició la participación: todos los servidores vuelven a tener los 3 días marcados.', actualizados: rowCount });
});

// ---------- Colores de marca (mismos de la web) ----------
const NIGHT = '#241A12';
const GOLD = '#C9932F';
const BANNER_BG = '#F1E6CC';
const PARCHMENT = '#FBF6EC';
const INK = '#2B2118';
const INK_SOFT = '#6B5F52';
const LINEA = '#D8CBAE';

const TIPOS_TESTIMONIO_LISTA = ['No comparte', 'Personal', 'Familiar', 'Matrimonio', 'Internacional', 'Otro'];
const FORMACION_OFICIAL_LISTA = ['Escuela de la Visión', 'LGMFT', 'SAEL', 'SFL I', 'SFL II', 'SFL III', 'SFL IV', 'SEMAT', 'SEPREL'];
const OTRAS_PARTICIPACIONES_LISTA = [
  'Encuentros Zonales', 'Encuentros Nacionales', 'Convenciones Nacionales', 'Convención Internacional',
  'Vigilias de Capítulo', 'Vigilias de Equipo', 'Vigilias Zonales'
];

function calcularEdad(fecha) {
  if (!fecha) return null;
  const hoy = new Date();
  const nac = new Date(fecha);
  if (isNaN(nac)) return null;
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad >= 0 ? edad : null;
}

function formatearFecha(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d)) return fecha;
  // timeZone: 'UTC' evita que la fecha se recorra un día si el servidor alguna vez corre en
  // otra zona horaria distinta a UTC (mismo tipo de bug que se corrigió en el frontend, ver
  // AdminParticipantes.jsx).
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// GET /api/admin/servidores/:id/ficha -> PDF de una sola persona, en 1 página horizontal,
// con el logo y los colores de marca de FIHNEC.
router.get('/:id/ficha', async (req, res) => {
  const { rows } = await query('SELECT * FROM servidores WHERE id = $1', [req.params.id]);
  const s = rows[0];
  if (!s) return res.status(404).json({ error: 'Servidor no encontrado.' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ficha_${(s.nombre_completo || 'servidor').replace(/\s+/g, '_')}.pdf"`);

  const doc = new PDFDocument({ size: 'letter', layout: 'landscape', margin: 0 });
  doc.pipe(res);

  const ANCHO = doc.page.width, ALTO_PAG = doc.page.height, MARGEN = 34, ANCHO_UTIL = ANCHO - MARGEN * 2;
  const ALTO_HEADER = 70;

  // ---------- Encabezado ----------
  doc.rect(0, 0, ANCHO, ALTO_HEADER).fill(NIGHT);
  doc.rect(0, ALTO_HEADER, ANCHO, 3).fill(GOLD);
  try { doc.image(LOGO_PATH, MARGEN, 8, { height: 54 }); } catch { /* logo opcional */ }
  doc.fillColor(PARCHMENT).font('Helvetica').fontSize(8).text('FIHNEC HONDURAS', MARGEN + 68, 18, { characterSpacing: 2 });
  doc.fillColor(GOLD).font('Times-Bold').fontSize(18).text('Ficha del Servidor SFL', MARGEN + 68, 29);
  doc.fillColor(PARCHMENT).font('Helvetica').fontSize(9).text('Seminario para la Formación de Líderes', MARGEN + 68, 51);

  let y = ALTO_HEADER + 16;

  // Casilla de verificación dibujada (evita depender de símbolos unicode que la fuente no soporta)
  function casilla(x, yPos, marcada, tam = 8) {
    doc.rect(x, yPos, tam, tam).lineWidth(1).strokeColor(NIGHT).stroke();
    if (marcada) doc.rect(x + 1.6, yPos + 1.6, tam - 3.2, tam - 3.2).fill(GOLD);
  }

  // ---------- Columna izquierda: foto ----------
  const FOTO_ANCHO = 118, FOTO_ALTO = 138;
  const xFoto = MARGEN;
  if (s.foto) {
    try {
      const base64 = s.foto.split(',').pop();
      const buffer = Buffer.from(base64, 'base64');
      doc.image(buffer, xFoto, y, { width: FOTO_ANCHO, height: FOTO_ALTO, fit: [FOTO_ANCHO, FOTO_ALTO] });
      doc.rect(xFoto, y, FOTO_ANCHO, FOTO_ALTO).lineWidth(1.2).strokeColor(NIGHT).stroke();
    } catch {
      doc.rect(xFoto, y, FOTO_ANCHO, FOTO_ALTO).fill('#F3ECDD');
      doc.rect(xFoto, y, FOTO_ANCHO, FOTO_ALTO).lineWidth(1.2).strokeColor(NIGHT).stroke();
    }
  } else {
    const iniciales = (s.nombre_completo || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
    doc.rect(xFoto, y, FOTO_ANCHO, FOTO_ALTO).fill('#F3ECDD');
    doc.fillColor(GOLD).font('Times-Bold').fontSize(34).text(iniciales, xFoto, y + FOTO_ALTO / 2 - 20, { width: FOTO_ANCHO, align: 'center' });
    doc.rect(xFoto, y, FOTO_ANCHO, FOTO_ALTO).lineWidth(1.2).strokeColor(NIGHT).stroke();
  }

  // Nombre/cargo/capítulo debajo de la foto, con alto dinámico (evita que se encimen si el nombre es largo)
  let yTexto = y + FOTO_ALTO + 8;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5);
  const altoNombre = doc.heightOfString(s.nombre_completo || '', { width: FOTO_ANCHO, align: 'center' });
  doc.text(s.nombre_completo || '', xFoto, yTexto, { width: FOTO_ANCHO, align: 'center' });
  yTexto += altoNombre + 3;
  if (s.cargo_actual) {
    doc.fillColor(NIGHT).font('Helvetica-Bold').fontSize(8.5);
    const altoCargo = doc.heightOfString(s.cargo_actual, { width: FOTO_ANCHO, align: 'center' });
    doc.text(s.cargo_actual, xFoto, yTexto, { width: FOTO_ANCHO, align: 'center' });
    yTexto += altoCargo + 3;
  }
  if (s.capitulo) doc.fillColor(INK_SOFT).font('Helvetica').fontSize(8).text(`Capítulo ${s.capitulo}`, xFoto, yTexto, { width: FOTO_ANCHO, align: 'center' });

  // ---------- Columna derecha: recuadros ----------
  const xCaja = xFoto + FOTO_ANCHO + 22;
  const anchoCaja = ANCHO - MARGEN - xCaja;

  function bannerCaja(titulo, alturaCaja) {
    doc.rect(xCaja, y, anchoCaja, alturaCaja).lineWidth(1).strokeColor(NIGHT).stroke();
    doc.rect(xCaja, y, anchoCaja, 16).fill(BANNER_BG);
    doc.rect(xCaja, y, anchoCaja, 16).lineWidth(1).strokeColor(NIGHT).stroke();
    doc.fillColor(NIGHT).font('Helvetica-Bold').fontSize(9).text(titulo, xCaja, y + 4, { width: anchoCaja, align: 'center', characterSpacing: 0.5 });
    y += 16;
  }

  // Grid de N columnas con alto de fila dinámico (evita traslapes si un valor es largo)
  function filasCampos(campos, numCols) {
    const GAP = 16;
    const colAncho = (anchoCaja - 16 - GAP * (numCols - 1)) / numCols;
    for (let i = 0; i < campos.length; i += numCols) {
      const inicio = y;
      let alturaMax = 0;
      for (let c = 0; c < numCols; c++) {
        const campo = campos[i + c];
        if (!campo) continue;
        const [etiqueta, valor] = campo;
        const x = xCaja + 8 + c * (colAncho + GAP);
        doc.fillColor(INK_SOFT).font('Helvetica').fontSize(8).text(etiqueta, x, inicio, { width: colAncho });
        const texto = valor === undefined || valor === null || valor === '' ? '—' : String(valor);
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(8.8);
        doc.text(texto, x, inicio + 10, { width: colAncho });
        alturaMax = Math.max(alturaMax, 10 + doc.heightOfString(texto, { width: colAncho, font: 'Helvetica-Bold', fontSize: 8.8 }));
      }
      y = inicio + alturaMax + 8;
    }
  }

  function medirFilas(campos, numCols) {
    const GAP = 16;
    const colAncho = (anchoCaja - 16 - GAP * (numCols - 1)) / numCols;
    let total = 0;
    for (let i = 0; i < campos.length; i += numCols) {
      let alturaMax = 0;
      for (let c = 0; c < numCols; c++) {
        const campo = campos[i + c];
        if (!campo) continue;
        const texto = campo[1] === undefined || campo[1] === null || campo[1] === '' ? '—' : String(campo[1]);
        alturaMax = Math.max(alturaMax, 10 + doc.heightOfString(texto, { width: colAncho, font: 'Helvetica-Bold', fontSize: 8.8 }));
      }
      total += alturaMax + 8;
    }
    return total;
  }

  // --- Datos Generales ---
  const edad = calcularEdad(s.fecha_nacimiento);
  const camposGenerales = [
    ['Nombre completo:', s.nombre_completo],
    ['Fecha nacimiento:', formatearFecha(s.fecha_nacimiento) + (edad != null ? `  (${edad} años)` : '')],
    ['Identidad (DNI):', s.dni],
    ['Estado civil:', s.estado_civil],
    ['Profesión:', s.profesion],
    [s.nombre_esposa ? 'Nombre de la esposa:' : 'Hijos:', s.nombre_esposa || s.hijos_cantidad],
    ['Celular:', s.celular],
    ['Contacto de emergencia:', s.contacto_emergencia_telefono],
  ];
  bannerCaja('DATOS GENERALES', 16 + 6 + medirFilas(camposGenerales, 3) + 4);
  y += 6;
  filasCampos(camposGenerales, 3);
  y += 2;

  // --- Datos Organizacionales ---
  const camposOrg = [
    ['Capítulo inscrito:', s.capitulo],
    ['Zona:', s.zona],
    ['Departamento:', s.departamento],
    ['Fecha inscripción capítulo:', formatearFecha(s.fecha_inscripcion_capitulo)],
    ['Cargo actual:', s.cargo_actual],
    ['Tiempo en FIHNEC:', s.tiempo_fihnec],
    ['E-mail:', s.email],
  ];
  const cargos = s.cargos_desempenados && s.cargos_desempenados.length ? s.cargos_desempenados : null;
  const filasCargos = cargos ? Math.ceil(cargos.length / 3) : 1;
  bannerCaja('DATOS ORGANIZACIONALES', 16 + 6 + medirFilas(camposOrg, 3) + 4 + 13 + filasCargos * 12 + 8);
  y += 6;
  filasCampos(camposOrg, 3);
  y += 2;

  doc.fillColor(INK_SOFT).font('Helvetica').fontSize(8).text('Cargos desempeñados (histórico):', xCaja + 8, y, { width: anchoCaja - 16 });
  y += 13;
  if (cargos) {
    const colCargoAncho = (anchoCaja - 16 - 16 * 2) / 3;
    for (let i = 0; i < cargos.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        if (!cargos[i + c]) continue;
        const x = xCaja + 8 + c * (colCargoAncho + 16);
        casilla(x, y + 1, true);
        doc.fillColor(INK).font('Helvetica').fontSize(7.8).text(cargos[i + c], x + 13, y, { width: colCargoAncho - 13 });
      }
      y += 12;
    }
  } else {
    casilla(xCaja + 8, y + 1, false);
    doc.fillColor(INK_SOFT).font('Helvetica').fontSize(8.2).text('Sin cargos registrados', xCaja + 21, y);
    y += 12;
  }
  y += 10;

  // ---------- Franjas horizontales tipo checklist (todas las opciones visibles) ----------
  function franjaChecklist(titulo, opciones, seleccionadas) {
    const seleccion = new Set(seleccionadas || []);
    doc.rect(MARGEN, y, ANCHO_UTIL, 14).fill(BANNER_BG);
    doc.rect(MARGEN, y, ANCHO_UTIL, 14).lineWidth(1).strokeColor(NIGHT).stroke();
    doc.fillColor(NIGHT).font('Helvetica-Bold').fontSize(8.5).text(titulo, MARGEN, y + 3, { width: ANCHO_UTIL, align: 'center', characterSpacing: 0.5 });
    y += 14;
    const colAncho2 = ANCHO_UTIL / opciones.length;
    const alturaEtiquetas = 22;
    doc.rect(MARGEN, y, ANCHO_UTIL, alturaEtiquetas + 16).lineWidth(1).strokeColor(NIGHT).stroke();
    opciones.forEach((op, i) => {
      const x = MARGEN + i * colAncho2;
      if (i > 0) doc.moveTo(x, y).lineTo(x, y + alturaEtiquetas + 16).lineWidth(0.5).strokeColor(LINEA).stroke();
      doc.fillColor(INK_SOFT).font('Helvetica').fontSize(6.8).text(op, x + 3, y + 3, { width: colAncho2 - 6, align: 'center' });
      casilla(x + colAncho2 / 2 - 4, y + alturaEtiquetas, seleccion.has(op), 9);
    });
    y += alturaEtiquetas + 16 + 10;
  }

  franjaChecklist('TIPO DE TESTIMONIO', TIPOS_TESTIMONIO_LISTA, [s.tipo_testimonio]);
  franjaChecklist('FORMACIÓN OFICIAL', FORMACION_OFICIAL_LISTA, s.formacion_oficial);
  franjaChecklist('OTRAS PARTICIPACIONES', OTRAS_PARTICIPACIONES_LISTA, s.otras_participaciones);

  // ---------- Pie de página ----------
  const yPie = ALTO_PAG - 22;
  doc.moveTo(MARGEN, yPie).lineTo(ANCHO - MARGEN, yPie).lineWidth(0.5).strokeColor(LINEA).stroke();
  doc.fillColor(INK_SOFT).font('Helvetica').fontSize(7.5).text(`Generado el ${formatearFecha(new Date())} · Sistema SFL FIHNEC`, MARGEN, yPie + 5);

  // QR de acceso directo al Portal del Servidor (autoconsulta + gestión). Solo lleva a la
  // pantalla de acceso con el DNI ya escrito — el servidor todavía necesita su PIN para
  // entrar, así que un tercero que vea la ficha no puede acceder solo con el QR.
  if (s.pin) {
    try {
      const urlPortal = `https://sflhonduras.com/servidores/portal?dni=${encodeURIComponent(s.dni || '')}`;
      const qrBuffer = await QRCode.toBuffer(urlPortal, { margin: 0, width: 200 });
      const QR_TAM = 46;
      doc.image(qrBuffer, ANCHO - MARGEN - QR_TAM, yPie - QR_TAM - 4, { width: QR_TAM, height: QR_TAM });
      doc.fillColor(INK_SOFT).font('Helvetica').fontSize(6).text('Portal del Servidor', ANCHO - MARGEN - QR_TAM - 20, yPie - 14, { width: QR_TAM + 16, align: 'center' });
    } catch { /* si falla el QR, la ficha se genera igual sin él */ }
  }

  doc.end();
});

router.delete('/:id', requireModulo('servidores', 'edicion'), async (req, res) => {
  const { rows } = await query('SELECT nombre_completo FROM servidores WHERE id = $1', [req.params.id]);
  if (rows[0]) await guardarEnPapelera('servidores', req.params.id, rows[0].nombre_completo, req.user.id);
  const { rowCount } = await query('DELETE FROM servidores WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Servidor no encontrado.' });
  res.json({ mensaje: 'Servidor eliminado.' });
});

export default router;
