// Busca participantes que existen en la tabla general (participantes) pero que NUNCA
// tienen una inscripción registrada en el Nivel 1 — explica la diferencia entre
// "Total histórico" y el histórico de Nivel 1 en Estadísticas.
// Es de solo lectura, no modifica nada.
//
// Uso:
//   node scripts/buscar_sin_nivel1.js

import { pool } from '../src/db.js';

async function main() {
  const { rows } = await pool.query(`
    SELECT p.id, p.nombre_completo, p.dni, p.capitulo, p.zona, p.observacion, p.creado_en,
      (SELECT array_agg(e.orden ORDER BY e.orden) FROM inscripciones i JOIN eventos e ON e.id = i.evento_id WHERE i.participante_id = p.id) AS niveles_inscritos
    FROM participantes p
    WHERE NOT EXISTS (
      SELECT 1 FROM inscripciones i JOIN eventos e ON e.id = i.evento_id
      WHERE i.participante_id = p.id AND e.orden = 1
    )
    ORDER BY p.id
  `);

  if (rows.length === 0) {
    console.log('No se encontró ningún participante sin Nivel 1 — no hay diferencia por este lado.');
  } else {
    console.log(`Se encontraron ${rows.length} participante(s) sin inscripción en Nivel 1:\n`);
    for (const r of rows) {
      console.log(`#${r.id} · ${r.nombre_completo} · DNI: ${r.dni}`);
      console.log(`   Capítulo: ${r.capitulo || '—'} · Zona: ${r.zona || '—'}`);
      console.log(`   Niveles en los que SÍ está inscrito: ${r.niveles_inscritos ? r.niveles_inscritos.join(', ') : 'ninguno'}`);
      console.log(`   Observación: ${r.observacion || '—'}`);
      console.log(`   Creado el: ${new Date(r.creado_en).toLocaleDateString('es-HN')}`);
      console.log('');
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
