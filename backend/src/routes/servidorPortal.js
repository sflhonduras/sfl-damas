import { Router } from 'express';
import { query } from '../db.js';
import { soloDigitos } from '../texto.js';
import { diasDe, obtenerMapaDias, guardarDiasServidor } from '../diasAsistencia.js';
import { verificarPin, cambiarPin } from '../pinSeguridad.js';
import { obtenerMensajeDelDia } from '../mensajesBiblicos.js';

const router = Router();

// Este router es PÚBLICO (no pasa por requireAuth) — cada endpoint vuelve a verificar
// DNI + PIN en cada llamada, exactamente igual que /api/autoconsulta para Participantes.
// No se usa token de sesión a propósito: mantiene el mismo patrón simple que ya existe,
// sin agregar una capa nueva de expiración/refresh que mantener.

async function verificarServidor(dni, pin) {
  const resultado = await verificarPin('servidores', dni, pin);
  return resultado.ok ? resultado.registro : null;
}

// El resto de rutas (todas menos /consultar y /cambiar-pin) quedan bloqueadas mientras la
// persona no haya cambiado su PIN por uno propio — evita que alguien siga usando
// indefinidamente el PIN que le asignó el administrador.
function bloqueadoPorPinPendiente(servidor, res) {
  if (servidor.debe_cambiar_pin) {
    res.status(403).json({ error: 'Debes cambiar tu PIN antes de continuar.', debe_cambiar_pin: true });
    return true;
  }
  return false;
}

async function construirPerfil(servidor) {
  const mapaDias = await obtenerMapaDias();
  const { pin, ...datos } = servidor;

  // Años en FIHNEC: cálculo real desde la fecha de inscripción al capítulo (si se tiene).
  let años_servicio = null;
  if (servidor.fecha_inscripcion_capitulo) {
    const inicio = new Date(servidor.fecha_inscripcion_capitulo);
    if (!isNaN(inicio)) {
      const hoy = new Date();
      años_servicio = hoy.getFullYear() - inicio.getFullYear() - (
        (hoy.getMonth() < inicio.getMonth() || (hoy.getMonth() === inicio.getMonth() && hoy.getDate() < inicio.getDate())) ? 1 : 0
      );
      if (años_servicio < 0) años_servicio = 0;
    }
  }

  // ¿Hoy es su cumpleaños? Se calcula con SQL (no con JS Date), igual que la lista de
  // cumpleañeros — evita el mismo problema de zona horaria que ya se corrigió en otro
  // módulo antes (comparar fechas con JS Date puede desfasarse un día según el servidor).
  // cumple_mes: true durante TODO el mes de su cumpleaños (incluye el día exacto) — se usa
  // para el confeti ambiental sutil en todo el Portal, distinto de la pantalla de celebración
  // de pantalla completa que solo aparece cumple_hoy.
  let cumple_hoy = false;
  let cumple_mes = false;
  if (servidor.fecha_nacimiento) {
    const { rows: chk } = await query(
      `SELECT
         (EXTRACT(MONTH FROM fecha_nacimiento) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(DAY FROM fecha_nacimiento) = EXTRACT(DAY FROM CURRENT_DATE)) AS es_hoy,
         (EXTRACT(MONTH FROM fecha_nacimiento) = EXTRACT(MONTH FROM CURRENT_DATE)) AS es_mes
       FROM servidores WHERE id = $1`,
      [servidor.id]
    );
    cumple_hoy = chk[0]?.es_hoy || false;
    cumple_mes = chk[0]?.es_mes || false;
  }

  // Historial real de participación (empezó a grabarse a partir de hoy — puede venir vacío
  // durante un tiempo, y eso está bien, no se inventa nada).
  const { rows: historial } = await query(
    `SELECT evento_nombre, ciclo, participo, dias_asistencia, registrado_en
     FROM servidores_historial_participacion WHERE servidor_id = $1 ORDER BY registrado_en DESC LIMIT 12`,
    [servidor.id]
  );
  const totalEventosParticipados = historial.filter(h => h.participo).length;

  // Verso del día: general para todos, o el especial de cumpleaños solo si hoy le toca a
  // él — nunca los dos a la vez. Si el banco de esa categoría está vacío, viene null y
  // el frontend simplemente no muestra la tarjeta (no es un hueco raro).
  const verso_dia = await obtenerMensajeDelDia('general');
  const verso_cumpleanos = cumple_hoy ? await obtenerMensajeDelDia('cumpleanos') : null;

  return {
    ...datos,
    dias_asistencia: diasDe(mapaDias, servidor.id),
    años_servicio,
    cumple_hoy,
    cumple_mes,
    verso_dia,
    verso_cumpleanos,
    total_eventos_participados: totalEventosParticipados,
    historial_participacion: historial
  };
}

// POST /api/servidor-portal/consultar  body: { dni, pin }
router.post('/consultar', async (req, res) => {
  const resultado = await verificarPin('servidores', req.body?.dni, req.body?.pin);
  if (!resultado.ok) return res.status(resultado.bloqueado ? 429 : 401).json({ error: resultado.error });
  res.json(await construirPerfil(resultado.registro));
});

// POST /api/servidor-portal/cambiar-pin  body: { dni, pin_actual, pin_nuevo }
router.post('/cambiar-pin', async (req, res) => {
  const resultado = await verificarPin('servidores', req.body?.dni, req.body?.pin_actual);
  if (!resultado.ok) return res.status(resultado.bloqueado ? 429 : 401).json({ error: resultado.error });
  const pinNuevo = String(req.body?.pin_nuevo || '').trim();
  if (!/^\d{4}$/.test(pinNuevo)) return res.status(400).json({ error: 'El nuevo PIN debe tener exactamente 4 dígitos.' });
  await cambiarPin('servidores', resultado.registro.id, pinNuevo);
  res.json({ mensaje: 'PIN actualizado correctamente.' });
});

// PUT /api/servidor-portal/mis-datos  body: { dni, pin, ...campos }
// Gestión propia: TODA su ficha personal, excepto los 4 campos "oficiales" que debe seguir
// controlando el administrador (identidad y rol dentro de FIHNEC): nombre_completo, dni,
// capitulo, cargo_actual. Todo lo demás lo sabe mejor él mismo que nadie.
const CAMPOS_AUTOEDITABLES = [
  'celular', 'email', 'foto', 'estado_civil', 'hijos_cantidad', 'fecha_nacimiento',
  'nombre_esposa', 'nietos_cantidad', 'profesion', 'contacto_emergencia_telefono',
  'tiempo_fihnec', 'zona', 'departamento', 'municipio', 'tipo_testimonio',
  'cargos_desempenados', 'formacion_oficial', 'otras_participaciones'
];

router.put('/mis-datos', async (req, res) => {
  const servidor = await verificarServidor(req.body?.dni, req.body?.pin);
  if (!servidor) return res.status(401).json({ error: 'Número de identidad o PIN incorrectos.' });
  if (bloqueadoPorPinPendiente(servidor, res)) return;

  const b = req.body || {};
  const cols = [];
  const valores = [];
  for (const campo of CAMPOS_AUTOEDITABLES) {
    if (b[campo] === undefined) continue;
    cols.push(campo);
    valores.push(campo === 'celular' || campo === 'contacto_emergencia_telefono' ? soloDigitos(b[campo]) : b[campo]);
  }
  if (cols.length === 0) return res.status(400).json({ error: 'Nada para actualizar.' });

  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  valores.push(servidor.id);
  const { rows } = await query(`UPDATE servidores SET ${setClause}, actualizado_en = now() WHERE id = $${valores.length} RETURNING *`, valores);
  res.json(await construirPerfil(rows[0]));
});

// PUT /api/servidor-portal/dias-asistencia  body: { dni, pin, viernes, sabado, domingo }
router.put('/dias-asistencia', async (req, res) => {
  const servidor = await verificarServidor(req.body?.dni, req.body?.pin);
  if (!servidor) return res.status(401).json({ error: 'Número de identidad o PIN incorrectos.' });
  if (bloqueadoPorPinPendiente(servidor, res)) return;
  const b = req.body || {};
  const actualizado = await guardarDiasServidor(servidor.id, { viernes: b.viernes, sabado: b.sabado, domingo: b.domingo });
  res.json(actualizado);
});

/* ------------------------------- TRANSPORTE (propio) ------------------------------- */
// Un servidor puede tener, como máximo, UN registro activo (como pasajero) en el evento
// actual — puede unirse, cambiarse a otro vehículo, o salirse, pero nunca queda en dos al
// mismo tiempo. NO pueden crear vehículos nuevos (eso lo sigue controlando Carlos desde el
// panel) — solo unirse/salirse de los que ya existen.

async function obtenerEventoActual() {
  const { rows } = await query('SELECT id, nombre FROM eventos WHERE es_actual = TRUE LIMIT 1');
  return rows[0] || null;
}

// POST /api/servidor-portal/transporte  body: { dni, pin } -> estado actual + opciones disponibles
router.post('/transporte', async (req, res) => {
  const servidor = await verificarServidor(req.body?.dni, req.body?.pin);
  if (!servidor) return res.status(401).json({ error: 'Número de identidad o PIN incorrectos.' });
  if (bloqueadoPorPinPendiente(servidor, res)) return;

  const evento = await obtenerEventoActual();
  if (!evento) return res.json({ evento: null, mi_transporte_id: null, disponibles: [] });

  const { rows: transportes } = await query(
    `SELECT t.id, t.ciudad, t.departamento, t.municipio, t.fecha_salida, t.hora_salida, s.nombre_completo AS conductor_nombre,
            tv.nombre AS tipo_vehiculo_nombre, COALESCE(t.capacidad_personalizada, tv.capacidad) AS capacidad,
            (SELECT COUNT(*)::int FROM transporte_pasajeros WHERE transporte_id = t.id) AS ocupados
     FROM transportes t
     LEFT JOIN servidores s ON s.id = t.conductor_id
     JOIN tipos_vehiculo tv ON tv.id = t.tipo_vehiculo_id
     WHERE t.evento_id = $1
     ORDER BY t.fecha_salida, t.hora_salida NULLS LAST`,
    [evento.id]
  );

  const { rows: miPasajeria } = await query(
    `SELECT tp.transporte_id FROM transporte_pasajeros tp
     JOIN transportes t ON t.id = tp.transporte_id
     WHERE tp.servidor_id = $1 AND t.evento_id = $2`,
    [servidor.id, evento.id]
  );
  const miTransporteId = miPasajeria[0]?.transporte_id || null;

  res.json({
    evento,
    mi_transporte_id: miTransporteId,
    disponibles: transportes.map(t => ({ ...t, lleno: t.ocupados >= t.capacidad }))
  });
});

// POST /api/servidor-portal/transporte/unirme  body: { dni, pin, transporte_id }
router.post('/transporte/unirme', async (req, res) => {
  const servidor = await verificarServidor(req.body?.dni, req.body?.pin);
  if (!servidor) return res.status(401).json({ error: 'Número de identidad o PIN incorrectos.' });
  if (bloqueadoPorPinPendiente(servidor, res)) return;

  const transporteId = req.body?.transporte_id;
  if (!transporteId) return res.status(400).json({ error: 'Falta indicar el vehículo.' });

  const evento = await obtenerEventoActual();
  if (!evento) return res.status(400).json({ error: 'No hay ningún evento activo por ahora.' });

  const { rows: destino } = await query(
    `SELECT t.id, COALESCE(t.capacidad_personalizada, tv.capacidad) AS capacidad,
            (SELECT COUNT(*)::int FROM transporte_pasajeros WHERE transporte_id = t.id) AS ocupados
     FROM transportes t JOIN tipos_vehiculo tv ON tv.id = t.tipo_vehiculo_id
     WHERE t.id = $1 AND t.evento_id = $2`,
    [transporteId, evento.id]
  );
  if (!destino[0]) return res.status(404).json({ error: 'Ese vehículo no existe o no es del evento actual.' });
  if (destino[0].ocupados >= destino[0].capacidad) return res.status(409).json({ error: 'Ese vehículo ya está lleno.' });

  // Máximo 1 activo por evento: primero se sale de cualquier otro que tuviera, luego se une.
  await query(
    `DELETE FROM transporte_pasajeros WHERE servidor_id = $1
     AND transporte_id IN (SELECT id FROM transportes WHERE evento_id = $2)`,
    [servidor.id, evento.id]
  );
  await query('INSERT INTO transporte_pasajeros (transporte_id, servidor_id) VALUES ($1,$2)', [transporteId, servidor.id]);
  res.json({ mensaje: 'Te uniste a este transporte.' });
});

// POST /api/servidor-portal/transporte/salir  body: { dni, pin }
router.post('/transporte/salir', async (req, res) => {
  const servidor = await verificarServidor(req.body?.dni, req.body?.pin);
  if (!servidor) return res.status(401).json({ error: 'Número de identidad o PIN incorrectos.' });
  if (bloqueadoPorPinPendiente(servidor, res)) return;

  const evento = await obtenerEventoActual();
  if (!evento) return res.json({ mensaje: 'No hay ningún evento activo.' });

  await query(
    `DELETE FROM transporte_pasajeros WHERE servidor_id = $1
     AND transporte_id IN (SELECT id FROM transportes WHERE evento_id = $2)`,
    [servidor.id, evento.id]
  );
  res.json({ mensaje: 'Saliste de tu transporte.' });
});

/* -------------------------------- INVENTARIO -------------------------------- */
// Regla: cada servidor SOLO VE las categorías donde Carlos lo asignó como responsable
// (tabla responsables_categoria) — puede tener una, varias, o ninguna. Las categorías donde
// no está asignado ni siquiera se muestran (no es una vista de solo lectura de todo).

// POST /api/servidor-portal/inventario  body: { dni, pin } -> solo las categorías donde es
// responsable, todas editables (si no tiene ninguna, la lista viene vacía).
router.post('/inventario', async (req, res) => {
  const servidor = await verificarServidor(req.body?.dni, req.body?.pin);
  if (!servidor) return res.status(401).json({ error: 'Número de identidad o PIN incorrectos.' });
  if (bloqueadoPorPinPendiente(servidor, res)) return;

  const evento = await obtenerEventoActual();
  const eventoId = evento?.id || null;

  const { rows: misResponsabilidades } = await query(
    `SELECT c.id, c.nombre, c.orden FROM responsables_categoria rc
     JOIN categorias_inventario c ON c.id = rc.categoria_id
     WHERE rc.servidor_id = $1 ORDER BY c.orden`,
    [servidor.id]
  );

  const resultado = [];
  for (const cat of misResponsabilidades) {
    const { rows: items } = await query(
      `SELECT i.id, i.nombre, i.tipo_medida, i.umbral_alerta, ie.cantidad_actual, ie.estado_actual
       FROM items_inventario i
       LEFT JOIN inventario_evento ie ON ie.item_id = i.id AND ie.evento_id = $2
       WHERE i.categoria_id = $1 AND i.conferencia_id IS NULL
       ORDER BY i.nombre`,
      [cat.id, eventoId]
    );
    resultado.push({ ...cat, items, es_responsable: true });
  }
  res.json({ evento, categorias: resultado });
});

// PUT /api/servidor-portal/inventario/:itemId  body: { dni, pin, cantidad_actual?, estado_actual? }
// Solo funciona si es responsable de la categoría a la que pertenece ese ítem.
router.put('/inventario/:itemId', async (req, res) => {
  const servidor = await verificarServidor(req.body?.dni, req.body?.pin);
  if (!servidor) return res.status(401).json({ error: 'Número de identidad o PIN incorrectos.' });
  if (bloqueadoPorPinPendiente(servidor, res)) return;

  const { rows: itemRows } = await query('SELECT categoria_id FROM items_inventario WHERE id = $1', [req.params.itemId]);
  if (!itemRows[0]) return res.status(404).json({ error: 'Ítem no encontrado.' });

  const { rows: esResponsable } = await query(
    'SELECT 1 FROM responsables_categoria WHERE servidor_id = $1 AND categoria_id = $2',
    [servidor.id, itemRows[0].categoria_id]
  );
  if (!esResponsable[0]) return res.status(403).json({ error: 'No estás asignado como responsable de esta categoría.' });

  const evento = await obtenerEventoActual();
  if (!evento) return res.status(400).json({ error: 'No hay ningún evento activo por ahora.' });

  const { cantidad_actual, estado_actual } = req.body || {};
  await query(
    `INSERT INTO inventario_evento (evento_id, item_id, cantidad_actual, estado_actual, actualizado_en)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (evento_id, item_id) DO UPDATE SET
       cantidad_actual = EXCLUDED.cantidad_actual, estado_actual = EXCLUDED.estado_actual, actualizado_en = now()`,
    [evento.id, req.params.itemId, cantidad_actual ?? null, estado_actual || null]
  );
  res.json({ mensaje: 'Actualizado.' });
});

/* ------------------------------ CUMPLEAÑEROS DEL MES ------------------------------ */
// Solo se muestran nombre + día — nunca el año, para no exponer la edad de nadie sin
// querer al resto del equipo.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

// POST /api/servidor-portal/cumpleaneros  body: { dni, pin }
router.post('/cumpleaneros', async (req, res) => {
  const servidor = await verificarServidor(req.body?.dni, req.body?.pin);
  if (!servidor) return res.status(401).json({ error: 'Número de identidad o PIN incorrectos.' });
  if (bloqueadoPorPinPendiente(servidor, res)) return;

  const hoy = new Date();
  const mesActual = hoy.getMonth() + 1;
  const diaHoy = hoy.getDate();

  const { rows } = await query(
    `SELECT nombre_completo, EXTRACT(DAY FROM fecha_nacimiento)::int AS dia
     FROM servidores
     WHERE fecha_nacimiento IS NOT NULL AND EXTRACT(MONTH FROM fecha_nacimiento) = $1
     ORDER BY dia`,
    [mesActual]
  );

  res.json({
    mes: MESES[mesActual - 1],
    cumpleañeros: rows.map(r => ({ nombre_completo: r.nombre_completo, dia: r.dia, es_hoy: r.dia === diaHoy }))
  });
});

export default router;
