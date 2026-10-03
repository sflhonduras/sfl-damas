// Diagnóstico de solo lectura: compara la resta simple (total histórico Nivel N-1 menos
// total histórico Nivel N) contra el cálculo preciso de "deserción" (completó Nivel N-1 en
// un ciclo YA CERRADO, y nunca tiene ninguna fila de Nivel N) — para un nivel dado.
// Muestra ejemplos de personas que quedan "de más" en la resta simple pero SÍ tienen alguna
// fila en el nivel siguiente (para ver si esa fila es real o un dato sucio).
//
// Uso:
//   node scripts/diagnostico_desercion.js <nivelDestino>   (2, 3 o 4)

import { pool } from '../src/db.js';

const nivelDestino = parseInt(process.argv[2], 10);
if (![2, 3, 4].includes(nivelDestino)) {
  console.error('Uso: node scripts/diagnostico_desercion.js <2|3|4>');
  process.exit(1);
}
const nivelAnterior = nivelDestino - 1;

async function main() {
  const { rows: eventos } = await pool.query('SELECT id, orden, ciclo_actual FROM eventos ORDER BY orden');
  const evAnterior = eventos.find(e => e.orden === nivelAnterior);
  const evDestino = eventos.find(e => e.orden === nivelDestino);

  const totalAnteriorRes = await pool.query('SELECT COUNT(*)::int AS total FROM inscripciones WHERE evento_id = $1', [evAnterior.id]);
  const totalDestinoRes = await pool.query('SELECT COUNT(*)::int AS total FROM inscripciones WHERE evento_id = $1', [evDestino.id]);
  const totalAnterior = totalAnteriorRes.rows[0].total;
  const totalDestino = totalDestinoRes.rows[0].total;

  console.log(`=== Nivel ${nivelAnterior} -> Nivel ${nivelDestino} ===`);
  console.log(`Total histórico Nivel ${nivelAnterior}: ${totalAnterior}`);
  console.log(`Total histórico Nivel ${nivelDestino}: ${totalDestino}`);
  console.log(`Resta simple (lo que esperaba Carlos): ${totalAnterior - totalDestino}\n`);

  // Grupo A: completaron Nivel anterior en un ciclo YA CERRADO (no el ciclo en vivo actual)
  const grupoARes = await pool.query(
    `SELECT p.id, p.nombre_completo, p.dni, i.ciclo, i.registrado_en
     FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
     WHERE i.evento_id = $1 AND i.ciclo <> $2
     ORDER BY p.nombre_completo`,
    [evAnterior.id, evAnterior.ciclo_actual]
  );
  console.log(`Grupo A — completaron Nivel ${nivelAnterior} en ciclo cerrado: ${grupoARes.rows.length}`);

  // De ese grupo A, ¿cuántos SÍ tienen alguna fila en el nivel destino (cualquier ciclo)?
  const idsGrupoA = grupoARes.rows.map(r => r.id);
  let conFilaDestino = [];
  if (idsGrupoA.length > 0) {
    const conFilaRes = await pool.query(
      `SELECT p.id, p.nombre_completo, i.ciclo, i.registrado_en
       FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
       WHERE i.evento_id = $1 AND i.participante_id = ANY($2::int[])`,
      [evDestino.id, idsGrupoA]
    );
    conFilaDestino = conFilaRes.rows;
  }
  console.log(`De esos, cuántos SÍ tienen alguna fila en Nivel ${nivelDestino} (cualquier ciclo): ${conFilaDestino.length}`);
  console.log(`Deserción real (Grupo A sin ninguna fila en Nivel ${nivelDestino}): ${grupoARes.rows.length - conFilaDestino.length}\n`);

  console.log(`=== Muestra de hasta 15 personas del Grupo A que SÍ tienen fila en Nivel ${nivelDestino} (revisar si es dato real o sucio) ===`);
  conFilaDestino.slice(0, 15).forEach(r => {
    console.log(`  - ${r.nombre_completo} (#${r.id}) · Nivel ${nivelDestino}: ciclo ${r.ciclo}, registrado ${r.registrado_en ? r.registrado_en.toISOString().slice(0,10) : '(sin fecha)'}`);
  });

  // Participantes que aparecen en el nivel destino pero NO tienen ninguna fila en el nivel
  // anterior — dato sospechoso (¿cómo llegaron al nivel destino sin haber pasado el anterior?).
  const sinNivelAnteriorRes = await pool.query(
    `SELECT p.id, p.nombre_completo, i.ciclo
     FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
     WHERE i.evento_id = $1
       AND NOT EXISTS (SELECT 1 FROM inscripciones i2 WHERE i2.participante_id = p.id AND i2.evento_id = $2)
     ORDER BY p.nombre_completo`,
    [evDestino.id, evAnterior.id]
  );
  console.log(`\n=== Personas en Nivel ${nivelDestino} SIN ninguna fila en Nivel ${nivelAnterior} (${sinNivelAnteriorRes.rows.length}) ===`);
  sinNivelAnteriorRes.rows.slice(0, 15).forEach(r => console.log(`  - ${r.nombre_completo} (#${r.id}) · ciclo ${r.ciclo}`));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
