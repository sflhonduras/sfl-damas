// Diagnóstico de solo lectura: muestra los cambios más recientes archivados en el historial
// de inscripciones (útil para ver qué se tocó hoy y detectar si algo se movió sin querer,
// como el ciclo de alguien que sí estaba activo en el ciclo en vivo).
//
// También compara el total de participantes actual contra lo esperado.
//
// Uso:
//   node scripts/diagnostico_cambios_recientes.js

import { pool } from '../src/db.js';

async function main() {
  console.log('=== Cambios archivados en las últimas 6 horas ===\n');
  const { rows: cambiosRecientes } = await pool.query(`
    SELECT h.id, p.nombre_completo, p.dni, e.orden AS nivel, h.ciclo, h.fecha_graduacion,
      h.promocion_graduacion, h.registrado_en, h.motivo, h.archivado_en
    FROM inscripciones_historial h
    JOIN participantes p ON p.id = h.participante_id
    JOIN eventos e ON e.id = h.evento_id
    WHERE h.archivado_en > now() - interval '6 hours'
    ORDER BY h.archivado_en DESC
  `);

  if (cambiosRecientes.length === 0) {
    console.log('No hay cambios archivados en las últimas 6 horas.');
  } else {
    for (const c of cambiosRecientes) {
      console.log(`[#${c.id}] ${c.nombre_completo} (DNI ${c.dni}) · Nivel ${c.nivel}`);
      console.log(`   Ciclo anterior archivado: ${c.ciclo} ${c.ciclo === 5 ? '⚠️  (era el ciclo EN VIVO — esta persona sí estaba activa)' : ''}`);
      console.log(`   Motivo: ${c.motivo} · Archivado: ${new Date(c.archivado_en).toLocaleString('es-HN')}`);
      console.log('');
    }
  }

  console.log('\n=== Verificación de los 2 participantes agregados hoy ===\n');
  for (const dni of ['PENDIENTE-JOSE-ADRIAN-FRANCO', 'PENDIENTE-MARIO-SANCHEZ']) {
    const { rows } = await pool.query('SELECT id, nombre_completo FROM participantes WHERE dni = $1', [dni]);
    console.log(rows[0] ? `✓ Existe: ${rows[0].nombre_completo} (#${rows[0].id})` : `✗ NO existe ningún participante con DNI ${dni}`);
  }

  console.log('\n=== Conteo actual ===\n');
  const { rows: total } = await pool.query('SELECT COUNT(*)::int AS total FROM participantes');
  console.log('Total de participantes:', total[0].total);

  const { rows: nivel1 } = await pool.query(`
    SELECT e.ciclo_actual, COUNT(*) FILTER (WHERE i.ciclo = e.ciclo_actual)::int AS activos_ciclo_actual
    FROM eventos e LEFT JOIN inscripciones i ON i.evento_id = e.id
    WHERE e.orden = 1 GROUP BY e.ciclo_actual
  `);
  console.log('Nivel 1, ciclo actual:', nivel1[0]?.ciclo_actual, '· activos en ese ciclo:', nivel1[0]?.activos_ciclo_actual);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
