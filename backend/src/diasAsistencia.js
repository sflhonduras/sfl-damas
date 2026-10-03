import { query } from './db.js';

// ---------- Días de asistencia por servidor (Viernes/Sábado/Domingo) ----------
// Por decisión de Carlos, esto NO agrega columnas nuevas a la tabla "servidores" — se guarda
// como un JSON dentro de la tabla "configuracion" (la misma que ya usa ciclo_actual, etc.),
// bajo la clave 'dias_asistencia_evento'. Formato:
//   { "<servidor_id>": { "viernes": true, "sabado": true, "domingo": true }, ... }
// Un servidor que NO aparece en el mapa se asume con los 3 días marcados (el valor por
// defecto al cargar la pantalla, según el diseño acordado).
// Compartido entre el panel admin (servidores.js) y el portal público (servidorPortal.js)
// para que ambos lean/escriban exactamente el mismo dato, sin duplicar lógica.
export const CLAVE_CONFIG_DIAS = 'dias_asistencia_evento';
export const DIAS_POR_DEFECTO = { viernes: true, sabado: true, domingo: true };

export async function obtenerMapaDias() {
  const { rows } = await query('SELECT valor FROM configuracion WHERE clave = $1', [CLAVE_CONFIG_DIAS]);
  if (!rows[0]) return {};
  try { return JSON.parse(rows[0].valor) || {}; } catch { return {}; }
}

export async function guardarMapaDias(mapa) {
  await query(
    `INSERT INTO configuracion (clave, valor, actualizado_en) VALUES ($1, $2, now())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`,
    [CLAVE_CONFIG_DIAS, JSON.stringify(mapa)]
  );
}

export function diasDe(mapa, servidorId) {
  return mapa[String(servidorId)] || DIAS_POR_DEFECTO;
}

// Guarda los 3 días de un servidor y recalcula participara_evento — misma acción tanto si
// la hace Carlos desde el panel como si la hace el propio servidor desde su portal.
export async function guardarDiasServidor(servidorId, dias) {
  const diasLimpios = { viernes: !!dias.viernes, sabado: !!dias.sabado, domingo: !!dias.domingo };
  const participaraEvento = diasLimpios.viernes || diasLimpios.sabado || diasLimpios.domingo;

  const mapa = await obtenerMapaDias();
  mapa[String(servidorId)] = diasLimpios;
  await guardarMapaDias(mapa);

  const { rows } = await query(
    'UPDATE servidores SET participara_evento = $1, actualizado_en = now() WHERE id = $2 RETURNING *',
    [participaraEvento, servidorId]
  );
  return { ...rows[0], dias_asistencia: diasLimpios };
}
