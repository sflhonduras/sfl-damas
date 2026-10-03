// Alinea el "ciclo" de los 4 niveles del SFL con el número de Promoción actual (5):
// - Para cada nivel, a quienes están inscritos en el ciclo actual (la gente en proceso ahora
//   mismo) se les cambia su ciclo al nuevo número, para que sigan contando como "activos".
// - Avanza el contador de ciclo de cada nivel al nuevo número.
// - Actualiza "Promoción actual" (configuracion) al mismo número.
//
// Si un nivel ya está en el ciclo destino, se omite (no rompe nada si se corre de más).
//
// Modo SIMULACIÓN por defecto. Para aplicar:
//   node scripts/sincronizar_ciclo_promocion.js --aplicar

import { pool } from '../src/db.js';

const aplicar = process.argv.includes('--aplicar');
const CICLO_DESTINO = 5;
const PROMOCION_DESTINO = '5';

async function main() {
  console.log(aplicar ? '⚠️  Modo APLICAR: se van a guardar los cambios.' : 'Modo SIMULACIÓN (no se guarda nada). Corre con --aplicar para guardar.');
  console.log('');

  const { rows: eventos } = await pool.query('SELECT id, orden, nombre, ciclo_actual FROM eventos ORDER BY orden');

  for (const ev of eventos) {
    if (ev.ciclo_actual === CICLO_DESTINO) {
      console.log(`Nivel ${ev.orden} (${ev.nombre}): ya está en ciclo #${CICLO_DESTINO}, se omite.`);
      continue;
    }
    const { rows: afectados } = await pool.query(
      'SELECT COUNT(*)::int AS total FROM inscripciones WHERE evento_id = $1 AND ciclo = $2',
      [ev.id, ev.ciclo_actual]
    );
    console.log(`Nivel ${ev.orden} (${ev.nombre}): ciclo #${ev.ciclo_actual} -> #${CICLO_DESTINO} · ${afectados[0].total} persona(s) inscrita(s) ahora se re-etiquetan.`);
    if (aplicar) {
      await pool.query('UPDATE inscripciones SET ciclo = $1 WHERE evento_id = $2 AND ciclo = $3', [CICLO_DESTINO, ev.id, ev.ciclo_actual]);
      await pool.query('UPDATE eventos SET ciclo_actual = $1 WHERE id = $2', [CICLO_DESTINO, ev.id]);
    }
  }

  const { rows: promoRows } = await pool.query("SELECT valor FROM configuracion WHERE clave = 'promocion_actual'");
  const promoActual = promoRows[0]?.valor;
  if (promoActual === PROMOCION_DESTINO) {
    console.log(`\nPromoción actual: ya está en ${PROMOCION_DESTINO}, se omite.`);
  } else {
    console.log(`\nPromoción actual: "${promoActual ?? '(sin definir)'}" -> "${PROMOCION_DESTINO}"`);
    if (aplicar) {
      if (promoRows.length) {
        await pool.query("UPDATE configuracion SET valor = $1 WHERE clave = 'promocion_actual'", [PROMOCION_DESTINO]);
      } else {
        await pool.query("INSERT INTO configuracion (clave, valor) VALUES ('promocion_actual', $1)", [PROMOCION_DESTINO]);
      }
    }
  }

  console.log('');
  console.log(aplicar ? '✅ Cambios guardados.' : 'Nada se guardó todavía. Corre "node scripts/sincronizar_ciclo_promocion.js --aplicar" para aplicar.');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
