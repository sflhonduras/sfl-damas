import { Router } from 'express';
import bcrypt from 'bcryptjs';
import PDFDocument from 'pdfkit';
import xlsx from 'xlsx';
import { query } from '../db.js';
import { requireAuth, requireRole, requireModulo, requireSuperAdmin, requireEditarPresencial } from '../auth.js';
import { normalizarNombre } from '../texto.js';
import { guardarEnPapelera, guardarParticipanteEnPapelera } from '../papelera.js';
import { regenerarPin } from '../pinSeguridad.js';
import { obtenerOCrearEnlaceEnVivo } from '../enlaceEnVivo.js';
import {
  obtenerOCrearInforme, congelarInformesDeNivel, congelarTodosLosNoCongelados, obtenerInformePorToken
} from '../informesCierre.js';

// Cuenta cuántos Participantes Sin Requisitos tienen evidencia guardada de un nivel (orden)
// en un ciclo específico — mismo criterio en Diplomas y en el resumen del panel lateral,
// para que ambos números siempre coincidan.
async function contarSinRequisitos(orden, ciclo) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total
     FROM participantes_excepcion pe, jsonb_array_elements(pe.eventos_sin_diploma) AS ev
     WHERE (ev->>'orden')::int = $1 AND (ev->>'ciclo')::int = $2`,
    [orden, ciclo]
  );
  return rows[0]?.total || 0;
}

const router = Router();
router.use(requireAuth); // todas las rutas de admin requieren sesión
router.use((req, res, next) => {
  if (req.user.rol === 'cocina') return res.status(403).json({ error: 'No tienes acceso a esta sección.' });
  next();
});

/* ---------------------------- PARTICIPANTES ---------------------------- */

// GET /api/admin/participantes?buscar=&pagina=&limite=&evento=
router.get('/participantes', requireModulo('participantes', 'consulta'), async (req, res) => {
  const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
  const limite = Math.min(parseInt(req.query.limite, 10) || 50, 200);
  const offset = (pagina - 1) * limite;
  const buscar = (req.query.buscar || '').trim();
  const eventoOrden = req.query.evento ? parseInt(req.query.evento, 10) : null;
  const soloCicloActual = req.query.solo_ciclo_actual === 'true';

  const params = [];
  let where = '1=1';
  if (buscar) {
    params.push(`%${buscar}%`);
    where += ` AND (p.nombre_completo ILIKE $${params.length} OR p.dni ILIKE $${params.length} OR p.capitulo ILIKE $${params.length})`;
  }
  let joinEvento = '';
  let ordenPor = 'p.id ASC';
  let indiceParamEvento = null;
  if (eventoOrden) {
    params.push(eventoOrden);
    indiceParamEvento = params.length;
    const filtroCiclo = soloCicloActual ? ' AND i.ciclo = e.ciclo_actual' : '';
    joinEvento = `AND EXISTS (SELECT 1 FROM inscripciones i JOIN eventos e ON e.id=i.evento_id WHERE i.participante_id=p.id AND e.orden=$${indiceParamEvento}${filtroCiclo})`;
    if (soloCicloActual) {
      ordenPor = `(SELECT i.registrado_en FROM inscripciones i JOIN eventos e ON e.id=i.evento_id WHERE i.participante_id=p.id AND e.orden=$${indiceParamEvento}) DESC`;
    }
  }

  const campoPresencial = indiceParamEvento
    ? `(SELECT i.registrado_presencial FROM inscripciones i JOIN eventos e ON e.id=i.evento_id WHERE i.participante_id=p.id AND e.orden=$${indiceParamEvento}) AS registrado_presencial`
    : 'NULL AS registrado_presencial';
  const paramsTotal = [...params];
  const paramsData = [...params, limite, offset];
  const [totalRes, dataRes] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM participantes p WHERE ${where} ${joinEvento}`, paramsTotal),
    query(
      `SELECT p.*, ${campoPresencial},
         (SELECT array_agg(e.orden ORDER BY e.orden) FROM inscripciones i JOIN eventos e ON e.id = i.evento_id WHERE i.participante_id = p.id) AS eventos_inscritos
       FROM participantes p
       WHERE ${where} ${joinEvento}
       ORDER BY ${ordenPor}
       LIMIT $${paramsData.length - 1} OFFSET $${paramsData.length}`,
      paramsData
    )
  ]);

  const datosSinPin = dataRes.rows.map(({ pin, ...resto }) => resto); // el PIN nunca viaja en el listado general
  res.json({ total: totalRes.rows[0].total, pagina, limite, datos: datosSinPin });
});

router.get('/participantes/:id', requireModulo('participantes', 'consulta'), async (req, res) => {
  const { rows } = await query('SELECT * FROM participantes WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Participante no encontrado.' });
  const insc = await query(
    `SELECT e.orden, e.nombre, e.fecha_evento, e.fecha_evento_fin, e.ciclo_actual, i.ciclo, i.registrado_en, i.fecha_graduacion, i.promocion_graduacion, i.origen FROM inscripciones i
     JOIN eventos e ON e.id = i.evento_id WHERE i.participante_id = $1 ORDER BY e.orden`,
    [req.params.id]
  );
  const historial = await query(
    `SELECT e.orden, e.nombre, h.ciclo, h.fecha_graduacion, h.promocion_graduacion, h.registrado_en, h.motivo, h.archivado_en
     FROM inscripciones_historial h JOIN eventos e ON e.id = h.evento_id
     WHERE h.participante_id = $1 ORDER BY h.archivado_en DESC`,
    [req.params.id]
  );
  const promocionRes = await query("SELECT valor FROM configuracion WHERE clave = 'promocion_actual'");
  const { pin, ...sinPin } = rows[0]; // el PIN nunca viaja en el detalle general
  res.json({ ...sinPin, inscripciones: insc.rows, historial: historial.rows, promocion_actual: promocionRes.rows[0]?.valor || null });
});

// POST /api/admin/participantes/:id/regenerar-pin -> genera un PIN nuevo de 4 dígitos y
// marca que debe personalizarlo en su próximo ingreso. Solo Administrador o Super
// Administrador pueden ver o regenerar PINes — ningún otro rol.
router.post('/participantes/:id/regenerar-pin', requireRole('admin', 'super_admin'), async (req, res) => {
  const { rows: existe } = await query('SELECT id FROM participantes WHERE id = $1', [req.params.id]);
  if (!existe[0]) return res.status(404).json({ error: 'Participante no encontrado.' });
  const pinNuevo = await regenerarPin('participantes', req.params.id);
  res.json({ id: req.params.id, pin: pinNuevo });
});

// GET /api/admin/participantes/:id/pin -> ver el PIN actual (sin regenerarlo), mismo
// candado de rol que regenerar-pin.
router.get('/participantes/:id/pin', requireRole('admin', 'super_admin'), async (req, res) => {
  const { rows } = await query('SELECT pin FROM participantes WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Participante no encontrado.' });
  res.json({ pin: rows[0].pin });
});

const CAMPOS_PARTICIPANTE = [
  'nombre_completo', 'dni', 'celular', 'capitulo', 'zona', 'departamento', 'municipio',
  'cargo_fihnec', 'estado_civil', 'hijos_cantidad', 'comparte_testimonio', 'tiempo_comparte_testimonio',
  'ha_recibido_sael', 'cantidad_saeles', 'contacto_emergencia_nombre', 'contacto_emergencia_telefono',
  'observacion'
];

// POST /api/admin/participantes  (crear manualmente) - requiere edición en participantes
router.post('/participantes', requireModulo('participantes', 'edicion'), async (req, res) => {
  const b = req.body || {};
  if (!b.nombre_completo || !b.dni) return res.status(400).json({ error: 'Nombre y DNI son obligatorios.' });
  if (b.nombre_completo) b.nombre_completo = normalizarNombre(b.nombre_completo);
  if (b.contacto_emergencia_nombre) b.contacto_emergencia_nombre = normalizarNombre(b.contacto_emergencia_nombre);
  if (b.capitulo) b.capitulo = normalizarNombre(b.capitulo);
  const cols = CAMPOS_PARTICIPANTE.filter(c => b[c] !== undefined);
  const vals = cols.map(c => b[c]);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
  try {
    const { rows } = await query(
      `INSERT INTO participantes (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    const { pin, ...sinPin } = rows[0];
    res.status(201).json(sinPin);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya existe un participante con ese DNI.' });
    throw e;
  }
});

// PUT /api/admin/participantes/:id - requiere edición en participantes
router.put('/participantes/:id', requireModulo('participantes', 'edicion'), async (req, res) => {
  const b = req.body || {};
  if (b.nombre_completo) b.nombre_completo = normalizarNombre(b.nombre_completo);
  if (b.contacto_emergencia_nombre) b.contacto_emergencia_nombre = normalizarNombre(b.contacto_emergencia_nombre);
  if (b.capitulo) b.capitulo = normalizarNombre(b.capitulo);
  const cols = CAMPOS_PARTICIPANTE.filter(c => b[c] !== undefined);
  if (cols.length === 0) return res.status(400).json({ error: 'Nada para actualizar.' });
  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const vals = cols.map(c => b[c]);
  vals.push(req.params.id);
  const { rows } = await query(
    `UPDATE participantes SET ${setClause}, actualizado_en = now() WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'Participante no encontrado.' });
  const { pin, ...sinPin } = rows[0];
  res.json(sinPin);
});

// DELETE /api/admin/participantes/:id - solo admin
// PUT /api/admin/participantes/:id/inscripciones/:orden/presencial - marcar asistencia presencial
// Permiso especial: además de quien tenga edición en 'participantes', el rol 'registro'
// también puede tocar ESTA acción puntual, aunque no tenga edición general del módulo.
router.put('/participantes/:id/inscripciones/:orden/presencial', requireEditarPresencial, async (req, res) => {
  const orden = parseInt(req.params.orden, 10);
  const { registrado_presencial } = req.body || {};
  const { rowCount } = await query(
    `UPDATE inscripciones SET registrado_presencial = $1
     WHERE participante_id = $2 AND evento_id = (SELECT id FROM eventos WHERE orden = $3)`,
    [!!registrado_presencial, req.params.id, orden]
  );
  if (!rowCount) return res.status(404).json({ error: 'Inscripción no encontrada.' });
  res.json({ mensaje: 'Actualizado.' });
});

router.delete('/participantes/:id', requireModulo('participantes', 'edicion'), async (req, res) => {
  const { rows } = await query('SELECT nombre_completo FROM participantes WHERE id = $1', [req.params.id]);
  if (rows[0]) await guardarParticipanteEnPapelera(req.params.id, rows[0].nombre_completo, req.user.id);
  const { rowCount } = await query('DELETE FROM participantes WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Participante no encontrado.' });
  res.json({ mensaje: 'Participante eliminado.' });
});

// POST /api/admin/participantes/:id/inscripciones/:orden - inscribir manualmente a un evento
router.post('/participantes/:id/inscripciones/:orden', requireModulo('participantes', 'edicion'), async (req, res) => {
  const orden = parseInt(req.params.orden, 10);
  const evRes = await query('SELECT id, ciclo_actual FROM eventos WHERE orden = $1', [orden]);
  if (!evRes.rows[0]) return res.status(404).json({ error: 'Evento no encontrado.' });
  try {
    await query(
      'INSERT INTO inscripciones (participante_id, evento_id, origen, ciclo) VALUES ($1,$2,$3,$4)',
      [req.params.id, evRes.rows[0].id, 'admin', evRes.rows[0].ciclo_actual]
    );
    res.status(201).json({ mensaje: 'Inscripción agregada.' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya estaba inscrito en ese evento.' });
    throw e;
  }
});

// DELETE /api/admin/participantes/:id/inscripciones/:orden - quitar inscripción
router.delete('/participantes/:id/inscripciones/:orden', requireModulo('participantes', 'edicion'), async (req, res) => {
  const orden = parseInt(req.params.orden, 10);
  const existente = await query(
    `SELECT i.* FROM inscripciones i JOIN eventos e ON e.id = i.evento_id
     WHERE i.participante_id = $1 AND e.orden = $2`,
    [req.params.id, orden]
  );
  if (existente.rows[0]) {
    const a = existente.rows[0];
    // Se guarda una copia antes de borrar, para no perder la fecha de graduación/promoción
    // que pudiera tener esa inscripción, aunque el admin la elimine de la vista actual.
    await query(
      `INSERT INTO inscripciones_historial
         (participante_id, evento_id, ciclo, fecha_graduacion, promocion_graduacion, registrado_en, origen, motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'eliminado')`,
      [a.participante_id, a.evento_id, a.ciclo, a.fecha_graduacion, a.promocion_graduacion, a.registrado_en, a.origen]
    );
  }
  await query(
    `DELETE FROM inscripciones WHERE participante_id = $1 AND evento_id = (SELECT id FROM eventos WHERE orden = $2)`,
    [req.params.id, orden]
  );
  res.json({ mensaje: 'Inscripción eliminada.' });
});

/* ------------------------------- EVENTOS -------------------------------- */

router.get('/eventos', requireSuperAdmin, async (req, res) => {
  const { rows } = await query('SELECT * FROM eventos ORDER BY orden');
  res.json(rows);
});

router.put('/eventos/:orden', requireSuperAdmin, async (req, res) => {
  const b = req.body || {};
  const campos = ['nombre', 'descripcion', 'fecha_evento', 'fecha_evento_fin', 'hora_evento', 'lugar', 'fecha_limite_registro', 'activo', 'cupo_maximo'];
  const cols = campos.filter(c => b[c] !== undefined);
  if (cols.length === 0) return res.status(400).json({ error: 'Nada para actualizar.' });
  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const vals = cols.map(c => b[c]);
  vals.push(req.params.orden);
  const { rows } = await query(
    `UPDATE eventos SET ${setClause}, actualizado_en = now() WHERE orden = $${vals.length} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'Evento no encontrado.' });
  res.json(rows[0]);
});

// POST /api/admin/eventos/:orden/nuevo-ciclo
// Marca un nuevo ciclo/edición de este nivel. Las inscripciones anteriores quedan intactas
// en el historial, pero dejan de contarse como "del evento actual" en estadísticas y diplomas.
router.post('/eventos/:orden/nuevo-ciclo', requireSuperAdmin, async (req, res) => {
  // Si este nivel tenía un informe de cierre todavía "vivo" (sin congelar), este es el
  // momento en que su ciclo termina de verdad — se congela la foto fija ANTES de avanzar
  // el ciclo, con los datos tal como quedaron.
  await congelarInformesDeNivel(parseInt(req.params.orden, 10));

  const { rows } = await query(
    'UPDATE eventos SET ciclo_actual = ciclo_actual + 1, actualizado_en = now() WHERE orden = $1 RETURNING *',
    [req.params.orden]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Evento no encontrado.' });
  res.json({ mensaje: `Nuevo ciclo iniciado (ciclo #${rows[0].ciclo_actual}). Los contadores de este nivel arrancan de cero.`, evento: rows[0] });
});

// POST /api/admin/eventos/:orden/marcar-actual
// Marca este nivel como "el evento actual" (el único que se muestra en el contador principal
// del panel). Desmarca automáticamente cualquier otro nivel que lo tuviera antes.
router.post('/eventos/:orden/marcar-actual', requireSuperAdmin, async (req, res) => {
  // El nivel que va a dejar de ser "el actual" es el que se está cerrando ahora mismo —
  // se captura ANTES de tocar nada, para poder crear su informe con el ciclo correcto.
  const { rows: actualPrevio } = await query('SELECT * FROM eventos WHERE es_actual = TRUE');

  // IMPORTANTE: primero se CREA el informe del nivel que se cierra (si nunca se había
  // generado antes, nace aquí mismo) — y SOLO DESPUÉS se congela todo lo que siga sin
  // congelar. Si el orden fuera al revés, un nivel que nunca tuvo su informe generado
  // mientras estaba activo se quedaría "vivo" para siempre, porque el barrido de
  // congelamiento ya habría pasado antes de que su fila existiera.
  if (actualPrevio[0] && actualPrevio[0].orden !== parseInt(req.params.orden, 10)) {
    await obtenerOCrearInforme(actualPrevio[0].orden, actualPrevio[0].ciclo_actual);
  }

  // Este cambio de nivel actual es, por definición, "el evento siguiente" para cualquier
  // informe de un cierre anterior que siguiera vivo — se congelan todos ahora que el de
  // arriba ya existe también.
  await congelarTodosLosNoCongelados();

  await query('UPDATE eventos SET es_actual = FALSE');
  const { rows } = await query(
    'UPDATE eventos SET es_actual = TRUE WHERE orden = $1 RETURNING *',
    [req.params.orden]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Evento no encontrado.' });
  res.json({ mensaje: `"${rows[0].nombre}" ahora es el evento actual.`, evento: rows[0] });
});

// GET /api/admin/informes/:token -> ver un informe de cierre (autenticado, desde el panel)
router.get('/informes/:token', async (req, res) => {
  const informe = await obtenerInformePorToken(req.params.token);
  if (!informe) return res.status(404).json({ error: 'Informe no encontrado.' });
  res.json(informe);
});

// POST /api/admin/promocion/avanzar -> avanza la promoción actual en +1 (ej. de V a VI)
router.post('/promocion/avanzar', requireSuperAdmin, async (req, res) => {
  const actual = await query("SELECT valor FROM configuracion WHERE clave = 'promocion_actual'");
  const nuevoValor = (parseInt(actual.rows[0]?.valor || '0', 10) + 1);
  await query(
    `INSERT INTO configuracion (clave, valor, actualizado_en) VALUES ('promocion_actual', $1, now())
     ON CONFLICT (clave) DO UPDATE SET valor = $1, actualizado_en = now()`,
    [String(nuevoValor)]
  );
  res.json({ mensaje: `Ahora se está cursando la Promoción ${nuevoValor}.`, promocion_actual: nuevoValor });
});

/* ------------------------------- ESTADÍSTICAS ---------------------------- */

// GET /api/admin/evento-actual-resumen -> versión liviana, solo para el contador del panel
// lateral (AdminLayout). A diferencia de /estadisticas, NO calcula zonas, departamentos,
// mapa ni promociones — solo una consulta puntual, para que entrar al panel se sienta rápido.
router.get('/evento-actual-resumen', async (req, res) => {
  // Este es el que alimenta los números en vivo del navbar (Inscritos, Registrados, TP) —
  // se pide cada 30 segundos y cada vez que cambias de pantalla; nunca debe quedar en caché.
  res.set('Cache-Control', 'no-store');

  const { rows } = await query(`
    SELECT e.orden, e.nombre, e.ciclo_actual,
      COUNT(i.id) FILTER (WHERE i.ciclo = e.ciclo_actual)::int AS total_ciclo_actual,
      COUNT(i.id) FILTER (WHERE i.ciclo = e.ciclo_actual AND i.registrado_presencial = TRUE)::int AS total_registrados
    FROM eventos e LEFT JOIN inscripciones i ON i.evento_id = e.id
    WHERE e.es_actual = TRUE
    GROUP BY e.id
  `);
  const evento = rows[0] || null;
  if (evento) {
    // Mismo desglose que en Diplomas: registrados con asistencia confirmada + Sin
    // Requisitos con evidencia de este nivel y ciclo — para que ambos números coincidan
    // siempre entre el panel lateral y la pantalla de Diplomas.
    evento.total_sin_requisitos = await contarSinRequisitos(evento.orden, evento.ciclo_actual);
    evento.total_registrados_general = evento.total_registrados + evento.total_sin_requisitos;
  }
  res.json({ evento_actual: evento });
});

// GET /api/admin/enlace-en-vivo -> genera (o reutiliza si sigue vigente) el enlace público
// de "registro en vivo" para el nivel que esté marcado como actual ahora mismo. Vence solo
// a las 72 horas de haberse generado — si ya pasó ese tiempo, se genera uno nuevo.
router.get('/enlace-en-vivo', requireModulo('estadisticas', 'consulta'), async (req, res) => {
  const { rows } = await query('SELECT orden, ciclo_actual FROM eventos WHERE es_actual = TRUE');
  const evento = rows[0];
  if (!evento) return res.status(404).json({ error: 'Ningún nivel está marcado como actual todavía.' });
  const enlace = await obtenerOCrearEnlaceEnVivo(evento.orden, evento.ciclo_actual);
  res.json(enlace);
});

router.get('/estadisticas', requireModulo('estadisticas', 'consulta'), async (req, res) => {
  // Estos números cambian todo el tiempo (inscritos, registrados, qué informe es el más
  // reciente) — nunca deben quedar guardados en caché del navegador ni de Cloudflare/Render.
  res.set('Cache-Control', 'no-store');

  const [porEvento, porZona, porDepartamento, porCapitulo, porDia, porMunicipio, embudo, totalParticipantes, promocionRes, porPromocion, totalGraduadosNivel4, porDesercion, totalSinRequisitos, ultimoInformeRes] = await Promise.all([
    query(`
      SELECT e.orden, e.codigo, e.nombre, e.ciclo_actual, e.es_actual,
        COUNT(i.id)::int AS total_inscritos,
        COUNT(i.id) FILTER (WHERE i.ciclo = e.ciclo_actual)::int AS total_ciclo_actual
      FROM eventos e LEFT JOIN inscripciones i ON i.evento_id = e.id
      GROUP BY e.id ORDER BY e.orden`),
    query(`
      SELECT COALESCE(zona,'Sin zona') AS zona, COUNT(*)::int AS total
      FROM participantes GROUP BY zona ORDER BY total DESC`),
    query(`
      SELECT COALESCE(departamento,'Sin depto.') AS departamento, COUNT(*)::int AS total
      FROM participantes GROUP BY departamento ORDER BY total DESC`),
    query(`
      SELECT COALESCE(capitulo,'Sin capítulo') AS capitulo, COUNT(*)::int AS total
      FROM participantes GROUP BY capitulo ORDER BY total DESC LIMIT 15`),
    query(`
      SELECT to_char(registrado_en, 'YYYY-MM-DD') AS dia, COUNT(*)::int AS total
      FROM inscripciones GROUP BY dia ORDER BY dia`),
    query(`
      SELECT COALESCE(departamento,'Sin depto.') AS departamento, COALESCE(municipio,'Sin municipio') AS municipio, COUNT(*)::int AS total
      FROM participantes GROUP BY departamento, municipio ORDER BY departamento, total DESC`),
    query(`
      SELECT e.orden, e.nombre, COUNT(i.id)::int AS total
      FROM eventos e LEFT JOIN inscripciones i ON i.evento_id = e.id
      GROUP BY e.id ORDER BY e.orden`),
    query('SELECT COUNT(*)::int AS total FROM participantes'),
    query("SELECT valor FROM configuracion WHERE clave = 'promocion_actual'"),
    query(`
      SELECT i.promocion_graduacion AS promocion, COUNT(*)::int AS total
      FROM inscripciones i JOIN eventos e ON e.id = i.evento_id
      WHERE e.orden = 4 AND i.fecha_graduacion IS NOT NULL
        AND i.promocion_graduacion IS NOT NULL AND i.promocion_graduacion <> ''
      GROUP BY i.promocion_graduacion
      ORDER BY (CASE WHEN i.promocion_graduacion ~ '^[0-9]+$' THEN i.promocion_graduacion::int ELSE 999999 END)`),
    query(`
      SELECT COUNT(*)::int AS total
      FROM inscripciones i JOIN eventos e ON e.id = i.evento_id
      WHERE e.orden = 4 AND i.fecha_graduacion IS NOT NULL`),
    // Deserción por nivel: para cada nivel de destino (2, 3, 4), cuenta a quienes SE
    // GRADUARON del nivel ANTERIOR (fecha_graduacion no nula — dato individual, el mismo
    // que ya usa Participantes Sin Requisitos) y todavía NUNCA tienen ninguna fila en el
    // nivel de destino. Se actualiza en vivo, persona por persona, sin esperar a que se
    // cierre el ciclo completo — antes esperaba el cierre del ciclo, lo cual retrasaba el
    // conteo aunque la persona ya llevara tiempo sin avanzar.
    query(`
      SELECT e_dest.orden AS orden, COUNT(*)::int AS total
      FROM eventos e_prev
      JOIN inscripciones i_prev ON i_prev.evento_id = e_prev.id AND i_prev.fecha_graduacion IS NOT NULL
      JOIN eventos e_dest ON e_dest.orden = e_prev.orden + 1
      WHERE e_prev.orden IN (1, 2, 3)
        AND NOT EXISTS (
          SELECT 1 FROM inscripciones i_cur
          WHERE i_cur.participante_id = i_prev.participante_id AND i_cur.evento_id = e_dest.id
        )
      GROUP BY e_dest.orden`),
    query('SELECT COUNT(*)::int AS total FROM participantes_excepcion'),
    query(`
      SELECT ic.token, ic.congelado, ic.generado_en, ic.evento_orden, e.nombre AS evento_nombre
      FROM informes_cierre_nivel ic JOIN eventos e ON e.orden = ic.evento_orden
      ORDER BY COALESCE(ic.congelado_en, ic.generado_en) DESC LIMIT 1`)
  ]);

  const totalCicloActual = porEvento.rows.reduce((suma, e) => suma + e.total_ciclo_actual, 0);
  const eventoActual = porEvento.rows.find(e => e.es_actual) || null;
  const promocionActual = promocionRes.rows[0] ? parseInt(promocionRes.rows[0].valor, 10) : null;

  const desercionPorOrden = new Map(porDesercion.rows.map(r => [r.orden, r.total]));
  const porEventoConDesercion = porEvento.rows.map(e => ({
    ...e,
    desercion: desercionPorOrden.has(e.orden) ? desercionPorOrden.get(e.orden) : null
  }));

  // Agrupa municipios bajo cada departamento (para el mapa de Honduras)
  const mapaDepartamentos = {};
  for (const fila of porMunicipio.rows) {
    if (!mapaDepartamentos[fila.departamento]) mapaDepartamentos[fila.departamento] = { departamento: fila.departamento, total: 0, municipios: [] };
    mapaDepartamentos[fila.departamento].total += fila.total;
    mapaDepartamentos[fila.departamento].municipios.push({ municipio: fila.municipio, total: fila.total });
  }

  res.json({
    total_participantes: totalParticipantes.rows[0].total,
    total_ciclo_actual: totalCicloActual,
    evento_actual: eventoActual,
    promocion_actual: promocionActual,
    por_evento: porEventoConDesercion,
    por_zona: porZona.rows,
    por_departamento: porDepartamento.rows,
    por_capitulo: porCapitulo.rows,
    inscripciones_por_dia: porDia.rows,
    mapa_departamentos: Object.values(mapaDepartamentos),
    embudo: embudo.rows,
    graduados_por_promocion: porPromocion.rows,
    total_graduados_nivel_4: totalGraduadosNivel4.rows[0].total,
    total_sin_requisitos: totalSinRequisitos.rows[0].total,
    ultimo_informe: ultimoInformeRes.rows[0] || null
  });
});

// GET /api/admin/estadisticas/mapa?vista=historico|ciclo_actual|nivel|desercion&nivel=1-4
// Ruta aparte y liviana: solo recalcula el mapa cuando cambias la vista, sin repetir todo
// lo demás de Estadísticas cada vez (menos consultas a la base de datos).
router.get('/estadisticas/mapa', requireModulo('estadisticas', 'consulta'), async (req, res) => {
  const vista = req.query.vista || 'historico';
  const nivel = parseInt(req.query.nivel, 10) || null;

  let filas;
  let sufijo = '';

  if (vista === 'ciclo_actual') {
    const { rows } = await query(`
      SELECT COALESCE(p.departamento,'Sin depto.') AS departamento, COALESCE(p.municipio,'Sin municipio') AS municipio, COUNT(DISTINCT p.id)::int AS total
      FROM participantes p
      JOIN inscripciones i ON i.participante_id = p.id
      JOIN eventos e ON e.id = i.evento_id AND e.es_actual = TRUE
      WHERE i.ciclo = e.ciclo_actual
      GROUP BY p.departamento, p.municipio`);
    filas = rows;
  } else if (vista === 'nivel' && nivel >= 1 && nivel <= 4) {
    const { rows } = await query(`
      SELECT COALESCE(p.departamento,'Sin depto.') AS departamento, COALESCE(p.municipio,'Sin municipio') AS municipio, COUNT(DISTINCT p.id)::int AS total
      FROM participantes p
      JOIN inscripciones i ON i.participante_id = p.id
      JOIN eventos e ON e.id = i.evento_id AND e.orden = $1
      GROUP BY p.departamento, p.municipio`, [nivel]);
    filas = rows;
  } else if (vista === 'desercion' && nivel >= 2 && nivel <= 4) {
    sufijo = '%';
    const { rows } = await query(`
      WITH elegibles AS (
        SELECT DISTINCT i_prev.participante_id, COALESCE(p.departamento,'Sin depto.') AS departamento, COALESCE(p.municipio,'Sin municipio') AS municipio
        FROM inscripciones i_prev
        JOIN eventos e_prev ON e_prev.id = i_prev.evento_id AND e_prev.orden = $1 - 1 AND i_prev.fecha_graduacion IS NOT NULL
        JOIN participantes p ON p.id = i_prev.participante_id
      ),
      desertores AS (
        SELECT el.participante_id FROM elegibles el
        WHERE NOT EXISTS (
          SELECT 1 FROM inscripciones i_cur JOIN eventos e_cur ON e_cur.id = i_cur.evento_id AND e_cur.orden = $1
          WHERE i_cur.participante_id = el.participante_id
        )
      )
      SELECT el.departamento, el.municipio,
        COUNT(DISTINCT el.participante_id)::int AS total_elegibles,
        COUNT(DISTINCT d.participante_id)::int AS total_desertores
      FROM elegibles el LEFT JOIN desertores d ON d.participante_id = el.participante_id
      GROUP BY el.departamento, el.municipio`, [nivel]);

    // Se calcula la tasa (%) por municipio Y se guardan los conteos crudos, para poder sacar
    // después el promedio ponderado real por departamento (no un promedio simple de %).
    const mapaDepartamentos = {};
    for (const r of rows) {
      if (!mapaDepartamentos[r.departamento]) mapaDepartamentos[r.departamento] = { departamento: r.departamento, elegibles: 0, desertores: 0, municipios: [] };
      mapaDepartamentos[r.departamento].elegibles += r.total_elegibles;
      mapaDepartamentos[r.departamento].desertores += r.total_desertores;
      mapaDepartamentos[r.departamento].municipios.push({
        municipio: r.municipio,
        total: r.total_elegibles > 0 ? Math.round((r.total_desertores / r.total_elegibles) * 100) : 0
      });
    }
    const resultado = Object.values(mapaDepartamentos).map(d => ({
      departamento: d.departamento,
      total: d.elegibles > 0 ? Math.round((d.desertores / d.elegibles) * 100) : 0,
      municipios: d.municipios
    }));
    return res.json({ mapa: resultado, sufijo });
  } else {
    // 'historico' (por defecto): todos los participantes, sin filtrar por inscripción —
    // exactamente el mismo cálculo que ya usaba el mapa antes de este cambio.
    const { rows } = await query(`
      SELECT COALESCE(departamento,'Sin depto.') AS departamento, COALESCE(municipio,'Sin municipio') AS municipio, COUNT(*)::int AS total
      FROM participantes GROUP BY departamento, municipio ORDER BY departamento, total DESC`);
    filas = rows;
  }

  const mapaDepartamentos = {};
  for (const fila of filas) {
    if (!mapaDepartamentos[fila.departamento]) mapaDepartamentos[fila.departamento] = { departamento: fila.departamento, total: 0, municipios: [] };
    mapaDepartamentos[fila.departamento].total += fila.total;
    mapaDepartamentos[fila.departamento].municipios.push({ municipio: fila.municipio, total: fila.total });
  }

  res.json({ mapa: Object.values(mapaDepartamentos), sufijo });
});

// GET /api/admin/estadisticas/excel -> descarga un libro de Excel con varias hojas
router.get('/estadisticas/excel', requireModulo('estadisticas', 'consulta'), async (req, res) => {
  const [porEvento, porZona, porDepartamento, porCapitulo, porDia] = await Promise.all([
    query(`
      SELECT e.orden AS "Nivel", e.nombre AS "Nombre", e.ciclo_actual AS "Ciclo actual",
        COUNT(i.id)::int AS "Total histórico",
        COUNT(i.id) FILTER (WHERE i.ciclo = e.ciclo_actual)::int AS "Total ciclo actual"
      FROM eventos e LEFT JOIN inscripciones i ON i.evento_id = e.id
      GROUP BY e.id ORDER BY e.orden`),
    query(`
      SELECT COALESCE(zona,'Sin zona') AS "Zona", COUNT(*)::int AS "Total"
      FROM participantes GROUP BY zona ORDER BY "Total" DESC`),
    query(`
      SELECT COALESCE(departamento,'Sin depto.') AS "Departamento", COUNT(*)::int AS "Total"
      FROM participantes GROUP BY departamento ORDER BY "Total" DESC`),
    query(`
      SELECT COALESCE(capitulo,'Sin capítulo') AS "Capítulo", COUNT(*)::int AS "Total"
      FROM participantes GROUP BY capitulo ORDER BY "Total" DESC`),
    query(`
      SELECT to_char(registrado_en, 'YYYY-MM-DD') AS "Fecha", COUNT(*)::int AS "Inscripciones"
      FROM inscripciones GROUP BY "Fecha" ORDER BY "Fecha"`)
  ]);

  const libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(libro, xlsx.utils.json_to_sheet(porEvento.rows), 'Por Nivel');
  xlsx.utils.book_append_sheet(libro, xlsx.utils.json_to_sheet(porZona.rows), 'Por Zona');
  xlsx.utils.book_append_sheet(libro, xlsx.utils.json_to_sheet(porDepartamento.rows), 'Por Departamento');
  xlsx.utils.book_append_sheet(libro, xlsx.utils.json_to_sheet(porCapitulo.rows), 'Por Capítulo');
  xlsx.utils.book_append_sheet(libro, xlsx.utils.json_to_sheet(porDia.rows), 'Inscripciones por Día');
  const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="estadisticas_sfl.xlsx"');
  res.send(buffer);
});

/* ---------------------------- USUARIOS ADMIN ----------------------------- */

router.get('/usuarios', requireSuperAdmin, async (req, res) => {
  const { rows } = await query('SELECT id, nombre, email, rol, activo, requiere_2fa, two_factor_enabled, creado_en FROM usuarios_admin ORDER BY id');
  res.json(rows);
});

router.post('/usuarios', requireSuperAdmin, async (req, res) => {
  const { nombre, email, password, rol } = req.body || {};
  if (!nombre || !email || !password || !rol) return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  if (!['admin', 'consulta', 'cocina', 'estandar', 'registro'].includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query(
      'INSERT INTO usuarios_admin (nombre, email, password_hash, rol) VALUES ($1,$2,$3,$4) RETURNING id, nombre, email, rol, activo',
      [nombre, email.toLowerCase().trim(), hash, rol]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    throw e;
  }
});

router.put('/usuarios/:id', requireSuperAdmin, async (req, res) => {
  const { nombre, rol, activo, password, requiere_2fa } = req.body || {};
  const sets = [];
  const vals = [];
  if (nombre !== undefined) { vals.push(nombre); sets.push(`nombre = $${vals.length}`); }
  if (rol !== undefined) { vals.push(rol); sets.push(`rol = $${vals.length}`); }
  if (activo !== undefined) { vals.push(activo); sets.push(`activo = $${vals.length}`); }
  if (password) { vals.push(await bcrypt.hash(password, 10)); sets.push(`password_hash = $${vals.length}`); }
  if (requiere_2fa !== undefined) { vals.push(requiere_2fa); sets.push(`requiere_2fa = $${vals.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nada para actualizar.' });
  vals.push(req.params.id);
  const { rows } = await query(
    `UPDATE usuarios_admin SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id, nombre, email, rol, activo, requiere_2fa, two_factor_enabled`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json(rows[0]);
});

// POST /api/admin/usuarios/:id/resetear-2fa -> por si alguien pierde el celular: borra su
// secreto y lo desactiva, para que la próxima vez que entre tenga que escanear un QR nuevo.
router.post('/usuarios/:id/resetear-2fa', requireSuperAdmin, async (req, res) => {
  const { rowCount } = await query(
    'UPDATE usuarios_admin SET two_factor_secret = NULL, two_factor_enabled = FALSE WHERE id = $1',
    [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json({ mensaje: 'Se reinició el 2FA de este usuario. La próxima vez que entre, va a tener que configurarlo de nuevo.' });
});

router.delete('/usuarios/:id', requireSuperAdmin, async (req, res) => {
  if (String(req.user.id) === req.params.id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
  const { rows } = await query('SELECT nombre, email FROM usuarios_admin WHERE id = $1', [req.params.id]);
  if (rows[0]) await guardarEnPapelera('usuarios_admin', req.params.id, `${rows[0].nombre} · ${rows[0].email}`, req.user.id);
  const { rowCount } = await query('DELETE FROM usuarios_admin WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json({ mensaje: 'Usuario eliminado.' });
});

// Lista de módulos que se pueden asignar, módulo por módulo, a CUALQUIER usuario (sin
// importar su rol) desde el panel de permisos. Los 12 módulos del sistema existen, pero
// Usuarios, Auditoría y Mantenimiento NUNCA aparecen aquí — esas tres pantallas quedan
// exclusivas del Super Administrador siempre, sin excepción ni configuración posible.
// "Registrado (checkbox)" es un permiso especial y puntual: solo controla el checkbox de
// asistencia presencial en Participantes, sin dar edición sobre el resto de sus datos.
const MODULOS_CON_PERMISOS = [
  { clave: 'estadisticas', etiqueta: 'Estadísticas', activo: true },
  { clave: 'participantes', etiqueta: 'Participantes', activo: true },
  { clave: 'participantes_presencial', etiqueta: 'Registrado (checkbox de asistencia)', activo: true },
  { clave: 'diplomas', etiqueta: 'Diplomas', activo: true },
  { clave: 'reportes', etiqueta: 'Reportería', activo: true },
  { clave: 'medallas', etiqueta: 'Medallas', activo: true },
  { clave: 'servidores', etiqueta: 'Servidores SFL', activo: true },
  { clave: 'inventario', etiqueta: 'Inventario', activo: true },
  { clave: 'transporte', etiqueta: 'Transporte', activo: true },
  { clave: 'eventos', etiqueta: 'Eventos', activo: true }
];

router.get('/modulos-disponibles', requireSuperAdmin, (req, res) => {
  res.json(MODULOS_CON_PERMISOS);
});

// GET /api/admin/mis-permisos -> cualquier usuario logueado puede ver SUS PROPIOS permisos
// (a diferencia de /usuarios/:id/permisos, que es solo para que el admin vea los de otros).
// Lo usa el menú lateral para saber qué mostrar/ocultar.
router.get('/mis-permisos', async (req, res) => {
  const { rows } = await query('SELECT modulo, nivel FROM permisos_modulo WHERE usuario_admin_id = $1', [req.user.id]);
  res.json(rows);
});

// GET /api/admin/usuarios/:id/permisos -> permisos actuales de un usuario "estandar"
router.get('/usuarios/:id/permisos', requireSuperAdmin, async (req, res) => {
  const { rows } = await query(
    'SELECT modulo, nivel FROM permisos_modulo WHERE usuario_admin_id = $1',
    [req.params.id]
  );
  res.json(rows);
});

// PUT /api/admin/usuarios/:id/permisos  body: { permisos: [{ modulo, nivel }, ...] }
// Reemplaza TODOS los permisos del usuario de una sola vez, más simple que ir sumando/
// restando módulo por módulo — la pantalla manda la lista completa cada vez que se guarda.
router.put('/usuarios/:id/permisos', requireSuperAdmin, async (req, res) => {
  const { permisos } = req.body || {};
  if (!Array.isArray(permisos)) return res.status(400).json({ error: 'permisos debe ser una lista.' });

  const clavesValidas = MODULOS_CON_PERMISOS.map(m => m.clave);
  for (const p of permisos) {
    if (!clavesValidas.includes(p.modulo)) return res.status(400).json({ error: `Módulo inválido: ${p.modulo}` });
    if (!['consulta', 'edicion'].includes(p.nivel)) return res.status(400).json({ error: `Nivel inválido: ${p.nivel}` });
  }

  await query('DELETE FROM permisos_modulo WHERE usuario_admin_id = $1', [req.params.id]);
  for (const p of permisos) {
    await query(
      'INSERT INTO permisos_modulo (usuario_admin_id, modulo, nivel) VALUES ($1,$2,$3)',
      [req.params.id, p.modulo, p.nivel]
    );
  }
  res.json({ mensaje: 'Permisos actualizados.' });
});

// PUT /api/admin/participantes/:id/inscripciones/:orden/graduacion - fijar/quitar fecha de graduación
// PUT /api/admin/participantes/:id/inscripciones/:orden/graduacion
// Permite corregir a mano fecha de graduación, promoción y ciclo de una inscripción puntual.
// Pensado sobre todo para las 4 promociones que vivieron en Excel antes de este sistema:
// asignarles un ciclo "histórico" (ej. 0) evita que se mezclen con el ciclo en vivo actual.
router.put('/participantes/:id/inscripciones/:orden/graduacion', requireModulo('participantes', 'edicion'), async (req, res) => {
  const orden = parseInt(req.params.orden, 10);
  const { fecha_graduacion, promocion_graduacion, ciclo } = req.body || {};

  const existente = await query(
    `SELECT i.* FROM inscripciones i JOIN eventos e ON e.id = i.evento_id
     WHERE i.participante_id = $1 AND e.orden = $2`,
    [req.params.id, orden]
  );
  if (!existente.rows[0]) return res.status(404).json({ error: 'Inscripción no encontrada.' });
  const anterior = existente.rows[0];

  const campos = ['fecha_graduacion = $1', 'promocion_graduacion = $2'];
  const valores = [fecha_graduacion || null, promocion_graduacion || null];

  if (ciclo !== undefined && ciclo !== null && ciclo !== '') {
    const cicloNum = parseInt(ciclo, 10);
    if (Number.isNaN(cicloNum)) return res.status(400).json({ error: 'El ciclo debe ser un número.' });
    campos.push(`ciclo = $${valores.length + 1}`);
    valores.push(cicloNum);
  }

  // Se guarda una copia de cómo estaba antes de sobrescribirla a mano, para no perder el dato
  // anterior si alguien se equivoca al editar. Si antes estaba vacía (ej. el auto-relleno la
  // completa por primera vez), no hay nada que preservar, así que no se archiva.
  const habiaAlgoQuePreservar = anterior.fecha_graduacion || anterior.promocion_graduacion;
  if (habiaAlgoQuePreservar) {
    await query(
      `INSERT INTO inscripciones_historial
         (participante_id, evento_id, ciclo, fecha_graduacion, promocion_graduacion, registrado_en, origen, motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'editado')`,
      [anterior.participante_id, anterior.evento_id, anterior.ciclo, anterior.fecha_graduacion,
        anterior.promocion_graduacion, anterior.registrado_en, anterior.origen]
    );
  }

  valores.push(req.params.id, orden);
  const { rowCount } = await query(
    `UPDATE inscripciones SET ${campos.join(', ')}
     WHERE participante_id = $${valores.length - 1} AND evento_id = (SELECT id FROM eventos WHERE orden = $${valores.length})`,
    valores
  );
  if (!rowCount) return res.status(404).json({ error: 'Inscripción no encontrada.' });
  res.json({ mensaje: 'Datos guardados.' });
});

/* -------------------------------- DIPLOMAS -------------------------------- */

// GET /api/admin/diplomas/:orden -> lista de participantes registrados en ese nivel
router.get('/diplomas/:orden', requireModulo('diplomas', 'consulta'), async (req, res) => {
  const orden = parseInt(req.params.orden, 10);
  const evRes = await query('SELECT * FROM eventos WHERE orden = $1', [orden]);
  const evento = evRes.rows[0];
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado.' });

  const { rows } = await query(
    `SELECT p.nombre_completo, p.capitulo, p.cargo_fihnec, i.registrado_en, i.fecha_graduacion
     FROM inscripciones i
     JOIN participantes p ON p.id = i.participante_id
     WHERE i.evento_id = $1 AND i.ciclo = $2 AND i.registrado_presencial = TRUE
     ORDER BY p.nombre_completo ASC`,
    [evento.id, evento.ciclo_actual]
  );

  // Participantes Sin Requisitos que tienen evidencia guardada de ESTE nivel en ESTE ciclo
  // específico (no cuenta si quedó marcado en un ciclo anterior del mismo nivel). Solo se
  // suma al conteo — la tabla y las exportaciones (Excel/PDF/Imprimir) no cambian.
  const sin_requisitos = await contarSinRequisitos(evento.orden, evento.ciclo_actual);

  res.json({ evento, total: rows.length, sin_requisitos, total_general: rows.length + sin_requisitos, participantes: rows });
});

// GET /api/admin/diplomas/:orden/excel -> descarga .xlsx con Numero, Nombre, Capítulo, Cargo
router.get('/diplomas/:orden/excel', requireModulo('diplomas', 'consulta'), async (req, res) => {
  const orden = parseInt(req.params.orden, 10);
  const evRes = await query('SELECT * FROM eventos WHERE orden = $1', [orden]);
  const evento = evRes.rows[0];
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado.' });

  const { rows } = await query(
    `SELECT p.nombre_completo, p.capitulo, p.cargo_fihnec
     FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
     WHERE i.evento_id = $1 AND i.ciclo = $2 AND i.registrado_presencial = TRUE
     ORDER BY p.nombre_completo ASC`,
    [evento.id, evento.ciclo_actual]
  );

  const datos = rows.map((r, i) => ({
    '#': i + 1,
    'Nombre Completo': r.nombre_completo,
    'Capítulo': r.capitulo || '',
    'Cargo': r.cargo_fihnec || ''
  }));

  const hoja = xlsx.utils.json_to_sheet(datos);
  hoja['!cols'] = [{ wch: 8 }, { wch: 36 }, { wch: 26 }, { wch: 30 }];
  const libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(libro, hoja, `Diplomas ${evento.codigo}`);
  const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="diplomas_${evento.codigo}.xlsx"`);
  res.send(buffer);
});

// GET /api/admin/diplomas/:orden/pdf -> descarga PDF con la misma lista
router.get('/diplomas/:orden/pdf', requireModulo('diplomas', 'consulta'), async (req, res) => {
  const orden = parseInt(req.params.orden, 10);
  const evRes = await query('SELECT * FROM eventos WHERE orden = $1', [orden]);
  const evento = evRes.rows[0];
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado.' });

  const { rows } = await query(
    `SELECT p.nombre_completo, p.capitulo, p.cargo_fihnec
     FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
     WHERE i.evento_id = $1 AND i.ciclo = $2 AND i.registrado_presencial = TRUE
     ORDER BY p.nombre_completo ASC`,
    [evento.id, evento.ciclo_actual]
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="diplomas_${evento.codigo}.pdf"`);

  const doc = new PDFDocument({ size: 'letter', margin: 40, layout: 'landscape' });
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('FIHNEC · Seminario para la Formación de Líderes', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text(evento.nombre, { align: 'center' });
  doc.moveDown(1);

  const colX = [50, 100, 420, 620];
  const colW = [50, 300, 190, 170];
  const y0 = doc.y;
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('#', colX[0], y0, { width: colW[0] });
  doc.text('Nombre Completo', colX[1], y0, { width: colW[1] });
  doc.text('Capítulo', colX[2], y0, { width: colW[2] });
  doc.text('Cargo', colX[3], y0, { width: colW[3] });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(762, doc.y).strokeColor('#cccccc').stroke();
  doc.moveDown(0.3);

  doc.font('Helvetica').fontSize(10);
  rows.forEach((r, i) => {
    if (doc.y > 500) { doc.addPage({ size: 'letter', margin: 40, layout: 'landscape' }); doc.y = 40; }
    const y = doc.y;
    doc.text(String(i + 1), colX[0], y, { width: colW[0] });
    doc.text(r.nombre_completo, colX[1], y, { width: colW[1] });
    doc.text(r.capitulo || '—', colX[2], y, { width: colW[2] });
    doc.text(r.cargo_fihnec || '—', colX[3], y, { width: colW[3] });
    doc.moveDown(0.6);
  });

  doc.end();
});

/* ---------------------- EXPORTAR LISTA PARA LLAMADAS ---------------------- */

// GET /api/admin/exportar-contacto/:orden?ciclo_actual=true|false&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Descarga .xlsx con Nombre Completo, Capítulo, Teléfono, Zona, Cargo de quienes se
// registraron a ese nivel, ya sea en el ciclo actual o en un rango de fechas elegido.
router.get('/exportar-contacto/:orden', requireModulo('participantes', 'consulta'), async (req, res) => {
  // Esta respuesta cambia todo el tiempo (según quién esté registrado en ese momento) —
  // nunca debe quedar guardada en caché del navegador ni de ningún proxy en el camino.
  res.set('Cache-Control', 'no-store');

  const orden = parseInt(req.params.orden, 10);
  const evRes = await query('SELECT * FROM eventos WHERE orden = $1', [orden]);
  const evento = evRes.rows[0];
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado.' });

  const { ciclo_actual, desde, hasta } = req.query;
  let filtroFecha = '';
  const params = [evento.id];

  if (ciclo_actual === 'true') {
    params.push(evento.ciclo_actual);
    filtroFecha = `AND i.ciclo = $${params.length}`;
  } else if (desde && hasta) {
    params.push(desde, `${hasta} 23:59:59`);
    filtroFecha = `AND i.registrado_en BETWEEN $${params.length - 1} AND $${params.length}`;
  }

  const { rows } = await query(
    `SELECT p.nombre_completo, p.capitulo, p.celular, p.zona, p.cargo_fihnec
     FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
     WHERE i.evento_id = $1 ${filtroFecha}
     ORDER BY p.nombre_completo ASC`,
    params
  );

  const datos = rows.map(r => ({
    'Nombre Completo': r.nombre_completo,
    'Capítulo': r.capitulo || '',
    'Teléfono': r.celular || '',
    'Zona': r.zona || '',
    'Cargo': r.cargo_fihnec || ''
  }));

  const hoja = xlsx.utils.json_to_sheet(datos);
  hoja['!cols'] = [{ wch: 32 }, { wch: 24 }, { wch: 14 }, { wch: 22 }, { wch: 30 }];
  const libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(libro, hoja, `Nivel ${orden}`);
  const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="contactos_nivel_${orden}.xlsx"`);
  res.send(buffer);
});

/* ------------------------------ EXPORTAR CSV ------------------------------ */


router.get('/exportar/participantes.csv', requireModulo('participantes', 'consulta'), async (req, res) => {
  const { rows } = await query(`
    SELECT p.*,
      (SELECT string_agg(e.codigo, ',' ORDER BY e.orden) FROM inscripciones i JOIN eventos e ON e.id=i.evento_id WHERE i.participante_id=p.id) AS eventos_inscritos
    FROM participantes p ORDER BY p.id`);
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const esc = v => v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="participantes_sfl.csv"');
  res.send('\uFEFF' + csv);
});

export default router;
