// Crea (si todavía no existe) Y congela el informe de un nivel específico — resuelve de un
// solo golpe el caso de un nivel que cerró pero cuyo informe nunca se generó ni se congeló.
// Al final imprime el enlace público listo para compartir.
//
// Uso: node scripts/cerrar_informe_de_nivel.js 3
//                                               ^ el número de orden del nivel (ej. 3 para Nivel III)
import { obtenerOCrearInforme, congelarInformesDeNivel } from '../src/informesCierre.js';
import { pool, query } from '../src/db.js';

async function main() {
  const orden = parseInt(process.argv[2], 10);
  if (!orden) {
    console.error('Falta el número de nivel. Ejemplo:\n  node scripts/cerrar_informe_de_nivel.js 3');
    process.exit(1);
  }

  const { rows: eventoRows } = await query('SELECT ciclo_actual, nombre FROM eventos WHERE orden = $1', [orden]);
  const evento = eventoRows[0];
  if (!evento) {
    console.error(`No existe ningún nivel con orden ${orden}.`);
    process.exit(1);
  }

  console.log(`Nivel ${orden} — ${evento.nombre} — ciclo actual: ${evento.ciclo_actual}`);

  // Se crea (si no existía) con el ciclo actual del nivel — es el mismo ciclo que estaba
  // corriendo cuando el nivel dejó de ser "el actual".
  const informe = await obtenerOCrearInforme(orden, evento.ciclo_actual);
  console.log('Informe (antes de congelar):', { token: informe.token, congelado: informe.congelado, generado_en: informe.generado_en });

  await congelarInformesDeNivel(orden);

  const { rows: final } = await query(
    'SELECT token, congelado, congelado_en FROM informes_cierre_nivel WHERE evento_orden = $1 AND ciclo = $2',
    [orden, evento.ciclo_actual]
  );
  console.log('Después de congelar:', final[0]);
  console.log('\nEnlace público: https://sflhonduras.com/informe/' + final[0].token);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
