// Otorga manualmente 2 medallas de "Vuelta Completa" a Mario Nuila y Melvin Godoy —
// confirmados directamente por Carlos. Busca por nombre COMPLETO exacto (no solo el
// apellido), para no atrapar por error a alguien más con el mismo apellido (ej. ya sabemos
// que existe un "Ángel Andrés Godoy Ávila" en el sistema, que es alguien distinto).
//
// Si no encuentra una coincidencia EXACTA de nombre, o encuentra más de una, no aplica nada
// para esa persona y te avisa — para que confirmes el nombre completo correcto.
//
// Modo SIMULACIÓN por defecto. Para aplicar:
//   node scripts/otorgar_medallas_manuales_iniciales.js --aplicar

import { pool } from '../src/db.js';

const aplicar = process.argv.includes('--aplicar');

// Ajusta estos nombres si no coinciden exactamente con cómo están escritos en el sistema.
const PERSONAS = [
  { nombreBuscar: 'Mario Nuila', tipo: 'Vuelta Completa', cantidad: 2 },
  { nombreBuscar: 'Melvin Godoy', tipo: 'Vuelta Completa', cantidad: 2 }
];

async function main() {
  console.log(aplicar ? '⚠️  Modo APLICAR: se van a guardar los cambios.' : 'Modo SIMULACIÓN (no se guarda nada). Corre con --aplicar para guardar.');
  console.log('');

  for (const persona of PERSONAS) {
    console.log(`--- Buscando: "${persona.nombreBuscar}" ---`);
    const { rows: coincidencias } = await pool.query(
      `SELECT id, nombre_completo, dni FROM participantes WHERE nombre_completo ILIKE $1`,
      [`%${persona.nombreBuscar}%`]
    );

    if (coincidencias.length === 0) {
      console.log(`  ⚠ No se encontró a nadie con ese nombre. No se aplica nada. Revisa el nombre exacto.`);
    } else if (coincidencias.length > 1) {
      console.log(`  ⚠ Se encontraron ${coincidencias.length} coincidencias — ambiguo, no se aplica nada:`);
      coincidencias.forEach(c => console.log(`      - ${c.nombre_completo} (#${c.id}, DNI ${c.dni})`));
      console.log(`  Ajusta "nombreBuscar" en el script para que sea más específico (ej. el nombre completo exacto).`);
    } else {
      const p = coincidencias[0];
      console.log(`  ✅ Coincidencia única: ${p.nombre_completo} (#${p.id}, DNI ${p.dni})`);
      console.log(`     Se otorgará: ${persona.cantidad}x "${persona.tipo}"`);
      if (aplicar) {
        await pool.query(
          `INSERT INTO medallas_manuales (participante_id, tipo, cantidad, nota)
           VALUES ($1, $2, $3, $4)`,
          [p.id, persona.tipo, persona.cantidad, 'Registrado manualmente — confirmado por Carlos, dato histórico anterior a la limpieza de datos.']
        );
      }
    }
    console.log('');
  }

  console.log(aplicar ? '✅ Cambios guardados.' : 'Nada se guardó todavía. Corre con --aplicar para guardar.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
