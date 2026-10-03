// URGENTE / caso especial: cuando un informe YA estaba marcado como "congelado" desde antes
// (ej. datos de prueba de cuando se construyó el sistema, con el mismo evento_orden + ciclo
// que el cierre real de hoy porque nunca se le dio "Nuevo Ciclo" a ese nivel), el cierre real
// de hoy termina reutilizando esa fila vieja sin tocarla, en vez de calcular los datos
// verdaderos del evento actual.
//
// Este script FUERZA el recálculo — sin importar si ya estaba congelado — y sobrescribe el
// snapshot con los datos reales de AHORA MISMO.
//
// Uso: node scripts/recalcular_informe_forzado.js 2
//                                                  ^ el número de orden del nivel (ej. 2 para Nivel II)
import { calcularSnapshot } from '../src/informesCierre.js';
import { pool, query } from '../src/db.js';

async function main() {
  const orden = parseInt(process.argv[2], 10);
  if (!orden) {
    console.error('Falta el número de nivel. Ejemplo:\n  node scripts/recalcular_informe_forzado.js 2');
    process.exit(1);
  }

  const { rows: eventoRows } = await query('SELECT ciclo_actual, nombre FROM eventos WHERE orden = $1', [orden]);
  const evento = eventoRows[0];
  if (!evento) {
    console.error(`No existe ningún nivel con orden ${orden}.`);
    process.exit(1);
  }

  const { rows: filaExistente } = await query(
    'SELECT id, generado_en, congelado_en, token FROM informes_cierre_nivel WHERE evento_orden = $1 AND ciclo = $2',
    [orden, evento.ciclo_actual]
  );
  if (!filaExistente[0]) {
    console.error(`No existe ningún informe para Nivel ${orden}, ciclo ${evento.ciclo_actual}. Usa cerrar_informe_de_nivel.js en su lugar.`);
    process.exit(1);
  }

  console.log(`Nivel ${orden} — ${evento.nombre} — ciclo ${evento.ciclo_actual}`);
  console.log('Informe encontrado (antes de recalcular):', filaExistente[0]);

  const snapshotNuevo = await calcularSnapshot(orden, evento.ciclo_actual);
  console.log('\nNuevo snapshot calculado:', {
    inscritos: snapshotNuevo.inscritos,
    registrados: snapshotNuevo.registrados,
    sin_requisitos: snapshotNuevo.sin_requisitos,
    desercion: snapshotNuevo.desercion
  });

  await query(
    'UPDATE informes_cierre_nivel SET congelado = TRUE, snapshot = $1, congelado_en = now() WHERE id = $2',
    [JSON.stringify(snapshotNuevo), filaExistente[0].id]
  );

  console.log('\n✓ Snapshot sobrescrito con los datos reales de ahora mismo.');
  console.log('Enlace público (el mismo de siempre, no cambió): https://sflhonduras.com/informe/' + filaExistente[0].token);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
