import { Router } from 'express';
import PDFDocument from 'pdfkit';
import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');

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
  // Repeticiones (medallas): es un tipo de reporte totalmente aparte, no filtra por nivel
  // como los demás — se maneja aquí mismo, antes de la resolución normal de "evento".
  if (q.evento === 'repeticiones') {
    const filasMedallas = await calcularMedallas();
    const filasVueltas = calcularVueltasCompletas(filasMedallas);

    let filas;
    if (q.medalla === 'Vuelta Completa') {
      filas = filasVueltas;
    } else if (q.medalla && ['Bronce', 'Plata', 'Oro', 'Platino'].includes(q.medalla)) {
      filas = filasMedallas.filter(f => f.medalla === q.medalla);
    } else {
      filas = [...filasMedallas, ...filasVueltas];
    }

    const idsParticipantes = filas.map(f => f.participante_id);
    let datosParticipantes = new Map();
    if (idsParticipantes.length > 0) {
      const partRes = await query(
        `SELECT id, nombre_completo, dni, capitulo, zona, departamento FROM participantes WHERE id = ANY($1::int[])`,
        [idsParticipantes]
      );
      datosParticipantes = new Map(partRes.rows.map(p => [p.id, p]));
    }

    // Filtros comunes (zona/departamento/capítulo/buscar) aplicados sobre los datos del
    // participante, ya que esos campos no vienen en el cálculo de medallas en sí.
    filas = filas.filter(f => {
      const p = datosParticipantes.get(f.participante_id);
      if (!p) return false;
      if (q.zona && p.zona !== q.zona) return false;
      if (q.departamento && p.departamento !== q.departamento) return false;
      if (q.capitulo && !(p.capitulo || '').toLowerCase().includes(q.capitulo.toLowerCase())) return false;
      if (q.buscar) {
        const texto = q.buscar.toLowerCase();
        const coincide = [p.nombre_completo, p.dni, p.capitulo].some(v => (v || '').toLowerCase().includes(texto));
        if (!coincide) return false;
      }
      return true;
    });

    const columnas = [
      { clave: 'nombre_completo', titulo: 'Nombre Completo' },
      { clave: 'dni', titulo: 'DNI' },
      { clave: 'capitulo', titulo: 'Capítulo' },
      { clave: 'nivel', titulo: 'Nivel Repetido' },
      { clave: 'tema', titulo: 'Tema' },
      { clave: 'repeticion', titulo: 'Repetición #' },
      { clave: 'promocion_graduacion', titulo: 'Promoción' },
      { clave: 'fecha_graduacion', titulo: 'Fecha de Graduación' },
      { clave: 'medalla', titulo: 'Medalla' }
    ];

    const filasFinal = filas
      .map(f => {
        const p = datosParticipantes.get(f.participante_id);
        if (f.esVueltaCompleta) {
          return {
            nombre_completo: p.nombre_completo,
            dni: p.dni,
            capitulo: p.capitulo,
            nivel: 'SFL I-IV',
            tema: 'Vuelta Completa',
            repeticion: f.repeticion_numero + 2,
            promocion_graduacion: f.promocion_graduacion,
            fecha_graduacion: f.fecha_graduacion,
            medalla: `🌟 Vuelta ${f.repeticion_numero + 2}`
          };
        }
        return {
          nombre_completo: p.nombre_completo,
          dni: p.dni,
          capitulo: p.capitulo,
          nivel: `SFL ${NIVEL_ROMANO[f.nivel_orden]}`,
          tema: f.medalla_tema,
          repeticion: f.repeticion_numero,
          promocion_graduacion: f.promocion_graduacion,
          fecha_graduacion: f.fecha_graduacion,
          medalla: `${MEDALLA_POR_NIVEL[f.nivel_orden].emoji} ${f.medalla}`
        };
      })
      .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo) || a.nivel.localeCompare(b.nivel));

    return { columnas, filas: filasFinal, evento_resuelto: 'repeticiones', esDesercion: false, esRepeticiones: true };
  }

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
    return { columnas, filas: rows, evento_resuelto: evento, esDesercion: true, esRepeticiones: false };
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
  return { columnas, filas: rows, evento_resuelto: evento, esDesercion: false, esRepeticiones: false };
}

const NIVEL_ROMANO = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
const MEDALLA_POR_NIVEL = {
  1: { nombre: 'Bronce', emoji: '🥉', tema: 'Mi Relación con Dios' },
  2: { nombre: 'Plata', emoji: '🥈', tema: 'Mi Relación conmigo mismo' },
  3: { nombre: 'Oro', emoji: '🥇', tema: 'Mi Relación con los demás' },
  4: { nombre: 'Platino', emoji: '🏆', tema: 'Salvación y Legado' }
};

// Calcula las medallas: cada NIVEL tiene su propio color/tema fijo (I=Bronce, II=Plata,
// III=Oro, IV=Platino). Cada vez que alguien se GRADÚA de nuevo en ese mismo nivel (no basta
// con solo registrarse otra vez), gana una medalla de ese color — y si lo repite varias
// veces, se le suman varias medallas iguales. Usa ROW_NUMBER() para identificar cuál
// graduación es la "repetida" (la 2da en adelante; la 1ra es la graduación original, no
// cuenta como medalla). Combina inscripciones (actual) + inscripciones_historial (archivado),
// porque cada reinscripción archiva el registro anterior ahí.
async function calcularMedallas() {
  const { rows } = await query(`
    WITH graduaciones AS (
      SELECT i.participante_id, e.orden, i.fecha_graduacion, i.promocion_graduacion
      FROM inscripciones i JOIN eventos e ON e.id = i.evento_id
      WHERE i.fecha_graduacion IS NOT NULL
      UNION ALL
      -- Solo cuenta reactivaciones REALES (alguien se volvió a inscribir de verdad, vía
      -- registro público). Las filas con motivo 'editado' son solo historial de auditoría de
      -- cuando se corrigió un dato a mano — no representan una graduación repetida real, y
      -- contarlas infla el número muy por encima de lo posible (ya lo confirmamos: salían 233
      -- "repetidores" cuando el total histórico de graduados es apenas 260).
      SELECT ih.participante_id, e.orden, ih.fecha_graduacion, ih.promocion_graduacion
      FROM inscripciones_historial ih JOIN eventos e ON e.id = ih.evento_id
      WHERE ih.fecha_graduacion IS NOT NULL AND ih.motivo = 'reactivado'
    ),
    numeradas AS (
      SELECT participante_id, orden, fecha_graduacion, promocion_graduacion,
             ROW_NUMBER() OVER (PARTITION BY participante_id, orden ORDER BY fecha_graduacion) AS numero
      FROM graduaciones
    )
    SELECT participante_id, orden, fecha_graduacion, promocion_graduacion, numero
    FROM numeradas
    WHERE numero > 1
    ORDER BY participante_id, orden, numero
  `);

  return rows.map(r => ({
    participante_id: r.participante_id,
    nivel_orden: r.orden,
    repeticion_numero: r.numero - 1, // 1ra medalla de ese nivel, 2da, etc.
    promocion_graduacion: r.promocion_graduacion,
    fecha_graduacion: r.fecha_graduacion,
    medalla: MEDALLA_POR_NIVEL[r.orden].nombre,
    medalla_tema: MEDALLA_POR_NIVEL[r.orden].tema
  }));
}

// Una "vuelta completa" es cuando alguien repite los 4 niveles la MISMA cantidad de veces —
// no basta con tener varios Platino si no tiene también esa misma cantidad de Bronce, Plata
// y Oro. El número de vueltas completas es el MÍNIMO compartido entre los 4 conteos. Por
// ejemplo: 3 Platino pero solo 1 Bronce = apenas 1 vuelta completa (los otros 2 Platino
// quedan sueltos, sin "pareja" en los demás niveles, hasta que los complete).
// Para la fecha de cada vuelta, se usa la más TARDÍA entre las 4 graduaciones de esa
// repetición (el último nivel en completarse es el que de verdad cierra la vuelta).
function calcularVueltasCompletas(filasMedallas) {
  const porParticipante = new Map();
  for (const f of filasMedallas) {
    if (!porParticipante.has(f.participante_id)) porParticipante.set(f.participante_id, { 1: [], 2: [], 3: [], 4: [] });
    porParticipante.get(f.participante_id)[f.nivel_orden].push(f);
  }

  const vueltas = [];
  for (const [participanteId, porNivel] of porParticipante) {
    const minVueltas = Math.min(porNivel[1].length, porNivel[2].length, porNivel[3].length, porNivel[4].length);
    for (let k = 0; k < minVueltas; k++) {
      const repeticionesDeEstaVuelta = [porNivel[1][k], porNivel[2][k], porNivel[3][k], porNivel[4][k]];
      const masReciente = repeticionesDeEstaVuelta.reduce((a, b) =>
        new Date(a.fecha_graduacion) > new Date(b.fecha_graduacion) ? a : b
      );
      vueltas.push({
        participante_id: participanteId,
        esVueltaCompleta: true,
        repeticion_numero: k,
        promocion_graduacion: masReciente.promocion_graduacion,
        fecha_graduacion: masReciente.fecha_graduacion
      });
    }
  }
  return vueltas;
}

function construirTitulo(eventoResuelto, esDesercion, esRepeticiones) {
  if (esRepeticiones) return 'Reporte de Repeticiones SFL — Medallas 🏅';
  if (esDesercion) return `Reporte de Deserción SFL ${NIVEL_ROMANO[eventoResuelto]}`;
  if (eventoResuelto) return `Reporte SFL Nivel ${NIVEL_ROMANO[eventoResuelto]}`;
  return 'Reporte de Participantes';
}

function nombreArchivo(titulo, extension) {
  const sinAcentos = titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const slug = sinAcentos.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `${slug}.${extension}`;
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
  const { columnas, filas, evento_resuelto, esDesercion, esRepeticiones } = await construirConsulta(req.query);
  const titulo = construirTitulo(evento_resuelto, esDesercion, esRepeticiones);
  const datos = filas.map((f, i) => {
    const fila = { '#': i + 1 };
    for (const c of columnas) fila[c.titulo] = formatearValorExport(c.clave, f[c.clave]);
    return fila;
  });
  // Nota: la librería gratuita de Excel que usamos no soporta colores de fondo en las
  // celdas (eso requiere la versión de pago) — por eso aquí el diseño de marca se limita a
  // las dos filas de título en texto, sin la banda de color que sí lleva el PDF.
  const hoja = xlsx.utils.aoa_to_sheet([
    ['FIHNEC · Seminario para la Formación de Líderes'],
    [titulo],
    []
  ]);
  xlsx.utils.sheet_add_json(hoja, datos, { origin: -1 });
  const libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(libro, hoja, 'Reporte');
  const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo(titulo, 'xlsx')}"`);
  res.send(buffer);
});

const NIGHT = '#241A12';
const GOLD = '#C9932F';
const EMBER = '#B23A2E'; // rojo distintivo, solo para reportes de deserción
const PARCHMENT = '#FBF6EC';
const BANNER_BG_NORMAL = '#F1E6CC';
const BANNER_BG_DESERCION = '#F3DAD6';
const INK = '#2B2118';
const LINEA = '#D8CBAE';

router.get('/pdf', async (req, res) => {
  const { columnas, filas, evento_resuelto, esDesercion, esRepeticiones } = await construirConsulta(req.query);
  const titulo = construirTitulo(evento_resuelto, esDesercion, esRepeticiones);
  const colorTitulo = esDesercion ? EMBER : GOLD;
  const colorBandaTabla = esDesercion ? BANNER_BG_DESERCION : BANNER_BG_NORMAL;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo(titulo, 'pdf')}"`);

  const layout = columnas.length > 4 ? 'landscape' : 'portrait';
  const doc = new PDFDocument({ size: 'letter', layout, margin: 0 });
  doc.pipe(res);

  const ANCHO = doc.page.width;
  const MARGEN = 34;
  const ANCHO_UTIL = ANCHO - MARGEN * 2;
  const ALTO_HEADER = 70;

  // pdfkit usa fuentes básicas (Helvetica) que no soportan emoji — se quitan aquí para que
  // no salgan como símbolos rotos, y en su lugar se usa color para distinguir la medalla.
  const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
  const quitarEmojis = (texto) => String(texto ?? '').replace(EMOJI_REGEX, '').trim();

  const COLOR_MEDALLA = { Bronce: '#A0622D', Plata: '#8C97A6', Oro: '#C9932F', Platino: '#4E6E81', Vuelta: '#6B4FA0' };
  function colorParaValor(texto) {
    const limpio = quitarEmojis(texto);
    for (const [nombre, color] of Object.entries(COLOR_MEDALLA)) {
      if (limpio.includes(nombre)) return color;
    }
    return null;
  }

  function dibujarEncabezadoMarca() {
    // Mismo encabezado exacto que la ficha del servidor — no se cambia nada aquí.
    doc.rect(0, 0, ANCHO, ALTO_HEADER).fill(NIGHT);
    doc.rect(0, ALTO_HEADER, ANCHO, 3).fill(GOLD);
    try { doc.image(LOGO_PATH, MARGEN, 8, { height: 54 }); } catch { /* logo opcional */ }
    doc.fillColor(PARCHMENT).font('Helvetica').fontSize(8).text('FIHNEC HONDURAS', MARGEN + 68, 18, { characterSpacing: 2 });
    doc.fillColor(GOLD).font('Times-Bold').fontSize(18).text('Reportería SFL', MARGEN + 68, 29);
    doc.fillColor(PARCHMENT).font('Helvetica').fontSize(9).text('Seminario para la Formación de Líderes', MARGEN + 68, 51);

    // Título específico del reporte, aparte del encabezado — rojo si es deserción.
    doc.y = ALTO_HEADER + 14;
    doc.fillColor(colorTitulo).font('Helvetica-Bold').fontSize(12).text(quitarEmojis(titulo), MARGEN, doc.y);
    doc.y += 18;
  }

  dibujarEncabezadoMarca();

  const anchoCol = ANCHO_UTIL / (columnas.length + 1);

  // Calcula cuánto espacio necesita la fila más alta (cuando el texto se envuelve a varias
  // líneas) para no encimarse con la fila de abajo — antes se usaba un espacio fijo.
  function alturaFila(valores) {
    return Math.max(12, ...valores.map(v => doc.heightOfString(quitarEmojis(v), { width: anchoCol - 6 })));
  }

  function dibujarFilaEncabezado() {
    const titulos = ['#', ...columnas.map(c => c.titulo)];
    doc.font('Helvetica-Bold').fontSize(9);
    const alto = alturaFila(titulos);
    doc.rect(MARGEN, doc.y, ANCHO_UTIL, alto + 8).fill(colorBandaTabla);
    doc.y += 4;
    doc.fillColor(NIGHT);
    let x = MARGEN;
    const y = doc.y;
    titulos.forEach(v => { doc.text(quitarEmojis(v), x, y, { width: anchoCol - 6 }); x += anchoCol; });
    doc.y = y + alto + 6;
  }

  function dibujarFilaDato(valores) {
    const alto = alturaFila(valores);
    let x = MARGEN;
    const y = doc.y;
    valores.forEach((v, idx) => {
      const colorEspecial = colorParaValor(v);
      doc.font(colorEspecial ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(colorEspecial || INK);
      doc.text(quitarEmojis(v), x, y, { width: anchoCol - 6 });
      x += anchoCol;
    });
    doc.y = y + alto + 6;
    doc.moveTo(MARGEN, doc.y - 3).lineTo(ANCHO - MARGEN, doc.y - 3).lineWidth(0.5).strokeColor(LINEA).stroke();
  }

  dibujarFilaEncabezado();

  filas.forEach((f, i) => {
    const valores = [i + 1, ...columnas.map(c => formatearValorExport(c.clave, f[c.clave]))];
    if (doc.y + alturaFila(valores) > doc.page.height - 40) {
      doc.addPage({ size: 'letter', layout, margin: 0 });
      dibujarEncabezadoMarca();
      dibujarFilaEncabezado();
    }
    dibujarFilaDato(valores);
  });

  doc.end();
});

export default router;
