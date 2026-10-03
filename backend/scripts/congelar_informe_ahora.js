// Congela AHORA MISMO el informe de un nivel que se quedó atascado "vivo" por el bug del
// orden de operaciones en marcar-actual (corregido en el código, pero esto no repara lo que
// ya quedó mal desde antes). Guarda la foto fija con los datos de este momento.
//
// Uso: node scripts/congelar_informe_ahora.js 2
//                                               ^ el número de orden del nivel (ej. 2 para Nivel II)
import { congelarInformesDeNivel } from '../src/informesCierre.js';
import { pool, query } from '../src/db.js';

async function main() {
  const orden = parseInt(process.argv[2], 10);
  if (!orden) {
    console.error('Falta el número de nivel. Ejemplo:\n  node scripts/congelar_informe_ahora.js 2');
    process.exit(1);
  }

  const { rows: antes } = await query(
    'SELECT id, ciclo, congelado FROM informes_cierre_nivel WHERE evento_orden = $1',
    [orden]
  );
  console.log(`Encontrados ${antes.length} informe(s) para el Nivel ${orden}:`, antes);

  await congelarInformesDeNivel(orden);

  const { rows: despues } = await query(
    'SELECT id, ciclo, congelado, congelado_en FROM informes_cierre_nivel WHERE evento_orden = $1',
    [orden]
  );
  console.log('Después de congelar:', despues);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
