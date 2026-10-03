// Lista de solo lectura: TODOS los participantes que alguna vez tuvieron una fila en el
// Nivel de origen, categorizados según su situación real frente al Nivel siguiente:
//   1) Activos HOY en el ciclo en vivo del nivel de origen (aún no les toca avanzar)
//   2) Completaron el nivel de origen en un ciclo cerrado, Y SÍ tienen alguna fila en el
//      nivel siguiente (avanzaron, sin importar en qué ciclo)
//   3) Completaron el nivel de origen en un ciclo cerrado, y NUNCA tienen fila en el nivel
//      siguiente (deserción real)
// No modifica nada.
//
// Uso:
//   node scripts/listar_estado_nivel_a_nivel.js <nivelOrigen>   (1, 2 o 3)

import { pool } from '../src/db.js';

const nivelOrigen = parseInt(process.argv[2], 10);
if (![1, 2, 3].includes(nivelOrigen)) {
  console.error('Uso: node scripts/listar_estado_nivel_a_nivel.js <1|2|3>');
  process.exit(1);
}
const nivelSiguiente = nivelOrigen + 1;

async function main() {
  const { rows: eventos } = await pool.query('SELECT id, orden, ciclo_actual FROM eventos ORDER BY orden');
  const evOrigen = eventos.find(e => e.orden === nivelOrigen);
  const evSiguiente = eventos.find(e => e.orden === nivelSiguiente);

  const { rows: filasOrigen } = await pool.query(
    `SELECT p.id, p.nombre_completo, p.dni, i.ciclo, i.registrado_en
     FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
     WHERE i.evento_id = $1 ORDER BY p.nombre_completo`,
    [evOrigen.id]
  );

  const idsOrigen = filasOrigen.map(f => f.id);
  const { rows: filasSiguiente } = idsOrigen.length
    ? await pool.query(
        `SELECT participante_id, ciclo, registrado_en FROM inscripciones
         WHERE evento_id = $1 AND participante_id = ANY($2::int[])`,
        [evSiguiente.id, idsOrigen]
      )
    : { rows: [] };
  const siguientePorParticipante = new Map(filasSiguiente.map(f => [f.participante_id, f]));

  const activosHoy = [];
  const avanzaron = [];
  const deserciones = [];

  for (const f of filasOrigen) {
    const esCicloEnVivo = f.ciclo === evOrigen.ciclo_actual;
    const filaSiguiente = siguientePorParticipante.get(f.id);
    if (esCicloEnVivo) {
      activosHoy.push({ ...f, filaSiguiente });
    } else if (filaSiguiente) {
      avanzaron.push({ ...f, filaSiguiente });
    } else {
      deserciones.push(f);
    }
  }

  const fmt = d => d ? new Date(d).toISOString().slice(0, 10) : '(sin fecha)';

  console.log(`=== Nivel ${nivelOrigen} -> Nivel ${nivelSiguiente} — total ${filasOrigen.length} ===\n`);

  console.log(`--- 1) Activos HOY en el ciclo en vivo de Nivel ${nivelOrigen} (${activosHoy.length}) ---`);
  activosHoy.forEach(f => {
    const extra = f.filaSiguiente ? ` · YA tiene Nivel ${nivelSiguiente} también (ciclo ${f.filaSiguiente.ciclo}, ${fmt(f.filaSiguiente.registrado_en)}) — probablemente repitiendo Nivel ${nivelOrigen}` : '';
    console.log(`  - ${f.nombre_completo} (#${f.id}, DNI ${f.dni})${extra}`);
  });

  console.log(`\n--- 2) Completaron Nivel ${nivelOrigen} (ciclo cerrado) Y SÍ avanzaron a Nivel ${nivelSiguiente} (${avanzaron.length}) ---`);
  avanzaron.forEach(f => {
    console.log(`  - ${f.nombre_completo} (#${f.id}) · Nivel ${nivelOrigen}: ciclo ${f.ciclo}, ${fmt(f.registrado_en)} · Nivel ${nivelSiguiente}: ciclo ${f.filaSiguiente.ciclo}, ${fmt(f.filaSiguiente.registrado_en)}`);
  });

  console.log(`\n--- 3) DESERCIÓN REAL: completaron Nivel ${nivelOrigen} (ciclo cerrado) y NUNCA tienen Nivel ${nivelSiguiente} (${deserciones.length}) ---`);
  deserciones.forEach(f => {
    console.log(`  - ${f.nombre_completo} (#${f.id}, DNI ${f.dni}) · Nivel ${nivelOrigen}: ciclo ${f.ciclo}, registrado ${fmt(f.registrado_en)}`);
  });

  console.log(`\nResumen: ${activosHoy.length} activos hoy + ${avanzaron.length} avanzaron + ${deserciones.length} desertaron = ${activosHoy.length + avanzaron.length + deserciones.length} (debe coincidir con el total de ${filasOrigen.length})`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
