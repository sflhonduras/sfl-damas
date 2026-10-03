import { Router } from 'express';
import QRCode from 'qrcode';
import { query } from '../db.js';
import { soloDigitos } from '../texto.js';
import { verificarPin, cambiarPin } from '../pinSeguridad.js';

const router = Router();

const NOMBRES_NIVEL = { 1: 'Nivel I', 2: 'Nivel II', 3: 'Nivel III', 4: 'Nivel IV' };
const MEDALLA_POR_NIVEL = { 1: 'Bronce', 2: 'Plata', 3: 'Oro', 4: 'Platino' };

// Mismo cálculo que usa el reporte "🏅 Repeticiones — Medallas" de Reportería, pero acotado
// a un solo participante (más liviano que recalcular todo el sistema en cada consulta).
// Una medalla se gana la 2da vez que alguien se gradúa del mismo nivel — la 1ra graduación
// es la normal, no cuenta para medalla. "Vuelta Completa" es cuando repite los 4 niveles la
// MISMA cantidad de veces (el mínimo compartido entre los 4 conteos).
async function calcularMedallasParticipante(participanteId) {
  const { rows } = await query(
    `WITH graduaciones AS (
       SELECT i.orden AS orden, i.fecha_graduacion FROM (
         SELECT e.orden, i.fecha_graduacion FROM inscripciones i JOIN eventos e ON e.id = i.evento_id
         WHERE i.participante_id = $1 AND i.fecha_graduacion IS NOT NULL AND i.fecha_graduacion <= now()
       ) i
       UNION ALL
       SELECT e.orden, ih.fecha_graduacion FROM inscripciones_historial ih JOIN eventos e ON e.id = ih.evento_id
       WHERE ih.participante_id = $1 AND ih.fecha_graduacion IS NOT NULL AND ih.fecha_graduacion <= now() AND ih.motivo = 'reactivado'
     ),
     numeradas AS (
       SELECT orden, fecha_graduacion, ROW_NUMBER() OVER (PARTITION BY orden ORDER BY fecha_graduacion) AS numero
       FROM graduaciones
     )
     SELECT orden, numero FROM numeradas WHERE numero > 1 ORDER BY orden, numero`,
    [participanteId]
  );

  const porNivel = { 1: [], 2: [], 3: [], 4: [] };
  for (const r of rows) porNivel[r.orden].push(r);

  const conteos = {};
  for (const orden of [1, 2, 3, 4]) {
    if (porNivel[orden].length) conteos[MEDALLA_POR_NIVEL[orden]] = porNivel[orden].length;
  }
  const vueltasCompletas = Math.min(porNivel[1].length, porNivel[2].length, porNivel[3].length, porNivel[4].length);
  if (vueltasCompletas > 0) conteos['Vuelta Completa'] = vueltasCompletas;

  // Suma las medallas otorgadas a mano encima de las automáticas (casos especiales donde
  // el cálculo automático no alcanza, ya usado antes para Mario Nuila y Melvin Godoy).
  const manualesRes = await query('SELECT tipo, cantidad FROM medallas_manuales WHERE participante_id = $1', [participanteId]);
  for (const m of manualesRes.rows) {
    conteos[m.tipo] = (conteos[m.tipo] || 0) + m.cantidad;
  }

  return Object.entries(conteos).map(([tipo, cantidad]) => ({ tipo, cantidad }));
}

// Arma toda la información que ve un participante en su portal: en qué nivel va, cuál sigue,
// sus medallas, y su código QR (generado al vuelo a partir de su DNI — no se guarda ninguna
// imagen en ningún lado, así que no agrega costo de almacenamiento).
async function construirEstado(participante) {
  const inscRes = await query(
    `SELECT e.orden, e.nombre FROM inscripciones i
     JOIN eventos e ON e.id = i.evento_id WHERE i.participante_id = $1 ORDER BY e.orden`,
    [participante.id]
  );
  const nivelesCompletados = inscRes.rows.map(r => r.orden);
  const nivelActual = nivelesCompletados.length ? Math.max(...nivelesCompletados) : 0;

  let proximoNivel = null;
  let proximoEvento = null;
  if (nivelActual < 4) {
    const ordenSiguiente = nivelActual + 1;
    const evRes = await query('SELECT * FROM eventos WHERE orden = $1', [ordenSiguiente]);
    const ev = evRes.rows[0];
    if (ev) {
      proximoNivel = ordenSiguiente;
      proximoEvento = {
        nombre: ev.nombre, fecha_evento: ev.fecha_evento, fecha_evento_fin: ev.fecha_evento_fin,
        lugar: ev.lugar, abierto: ev.activo
      };
    }
  }

  const medallas = await calcularMedallasParticipante(participante.id);

  // El QR solo codifica el DNI con un prefijo — así el equipo lo puede escanear en la entrada
  // del evento y el sistema busca directo al participante por ese dato.
  const qr = await QRCode.toDataURL(`SFL-DNI:${participante.dni}`);

  return {
    nombre_completo: participante.nombre_completo,
    nivel_actual: nivelActual,
    nivel_actual_nombre: nivelActual ? NOMBRES_NIVEL[nivelActual] : null,
    proximo_nivel: proximoNivel,
    proximo_evento: proximoEvento,
    medallas,
    qr
  };
}

// POST /api/autoconsulta/consultar  body: { dni, pin }
router.post('/consultar', async (req, res) => {
  const dni = soloDigitos((req.body || {}).dni) || String((req.body || {}).dni || '').trim();
  const pin = (req.body || {}).pin;

  const resultado = await verificarPin('participantes', dni, pin);
  if (!resultado.ok) return res.status(resultado.bloqueado ? 429 : 401).json({ error: resultado.error });

  const estado = await construirEstado(resultado.registro);
  res.json({ ...estado, debe_cambiar_pin: resultado.registro.debe_cambiar_pin });
});

// POST /api/autoconsulta/cambiar-pin  body: { dni, pin_actual, pin_nuevo }
router.post('/cambiar-pin', async (req, res) => {
  const dni = soloDigitos((req.body || {}).dni) || String((req.body || {}).dni || '').trim();
  const pinActual = (req.body || {}).pin_actual;
  const pinNuevo = String((req.body || {}).pin_nuevo || '').trim();
  if (!/^\d{4}$/.test(pinNuevo)) return res.status(400).json({ error: 'El nuevo PIN debe tener exactamente 4 dígitos.' });

  const resultado = await verificarPin('participantes', dni, pinActual);
  if (!resultado.ok) return res.status(resultado.bloqueado ? 429 : 401).json({ error: resultado.error });

  await cambiarPin('participantes', resultado.registro.id, pinNuevo);
  res.json({ mensaje: 'PIN actualizado correctamente.' });
});

export default router;
