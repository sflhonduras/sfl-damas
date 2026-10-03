import { query } from './db.js';

// Elige el verso "de hoy" para una categoría, sin guardar en ningún lado cuál tocó —
// se calcula cada vez con el día del año % cantidad de versos activos. Esto garantiza que:
//  - Es el mismo verso para todo el mundo el mismo día (no aleatorio por persona/visita)
//  - Cambia solo cuando cambia el día
//  - No necesita ninguna tabla de seguimiento ni tarea programada
// Se usa America/Tegucigalpa explícitamente (no la hora del servidor) para que el cambio de
// verso ocurra a medianoche de Honduras, no a medianoche UTC — mismo criterio que ya se usa
// para "¿hoy es tu cumpleaños?" en otros módulos.
export async function obtenerMensajeDelDia(categoria) {
  const { rows: countRows } = await query(
    'SELECT COUNT(*)::int AS total FROM mensajes_biblicos WHERE categoria = $1 AND activo = TRUE',
    [categoria]
  );
  const total = countRows[0]?.total || 0;
  if (total === 0) return null; // banco vacío para esa categoría: no se muestra nada, sin error

  const { rows } = await query(
    `SELECT texto, referencia FROM mensajes_biblicos
     WHERE categoria = $1 AND activo = TRUE
     ORDER BY id
     OFFSET (EXTRACT(DOY FROM (CURRENT_TIMESTAMP AT TIME ZONE 'America/Tegucigalpa'))::int % $2)
     LIMIT 1`,
    [categoria, total]
  );
  return rows[0] || null;
}
