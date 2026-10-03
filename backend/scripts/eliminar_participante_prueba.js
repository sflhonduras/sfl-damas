// Elimina POR COMPLETO a un participante de prueba y todo lo relacionado con él:
// inscripciones actuales, historial, y medallas otorgadas a mano (si tuviera).
//
// Modo SIMULACIÓN por defecto (no borra nada, solo muestra qué encontraría).
// Para aplicar de verdad:
//   node scripts/eliminar_participante_prueba.js <DNI> --aplicar

import { pool } from '../src/db.js';

const dni = process.argv[2];
const aplicar = process.argv.includes('--aplicar');

async function main() {
  if (!dni) {
    console.log('Uso: node scripts/eliminar_participante_prueba.js <DNI> [--aplicar]');
    await pool.end();
    return;
  }

  const { rows: participantes } = await pool.query('SELECT * FROM participantes WHERE dni = $1', [dni]);
  const p = participantes[0];
  if (!p) {
    console.log(`No se encontró ningún participante con DNI ${dni}. No hay nada que borrar.`);
    await pool.end();
    return;
  }

  const { rows: insc } = await pool.query('SELECT id FROM inscripciones WHERE participante_id = $1', [p.id]);
  const { rows: hist } = await pool.query('SELECT id FROM inscripciones_historial WHERE participante_id = $1', [p.id]);
  const { rows: med } = await pool.query('SELECT id FROM medallas_manuales WHERE participante_id = $1', [p.id]);

  console.log(aplicar ? '⚠️  Modo APLICAR: se va a borrar de verdad.' : 'Modo SIMULACIÓN (no se borra nada). Corre con --aplicar para borrar de verdad.');
  console.log('');
  console.log(`Participante encontrado: ${p.nombre_completo} (#${p.id}, DNI ${p.dni})`);
  console.log(`  - ${insc.length} inscripción(es) actual(es)`);
  console.log(`  - ${hist.length} registro(s) en el historial`);
  console.log(`  - ${med.length} medalla(s) otorgada(s) a mano`);
  console.log('');

  if (!aplicar) {
    console.log('Nada se borró todavía. Revisa que sea la persona correcta, y corre de nuevo con --aplicar para borrarlo de verdad.');
    await pool.end();
    return;
  }

  await pool.query('DELETE FROM medallas_manuales WHERE participante_id = $1', [p.id]);
  await pool.query('DELETE FROM inscripciones_historial WHERE participante_id = $1', [p.id]);
  await pool.query('DELETE FROM inscripciones WHERE participante_id = $1', [p.id]);
  await pool.query('DELETE FROM participantes WHERE id = $1', [p.id]);

  console.log(`✅ Eliminado por completo: ${p.nombre_completo} (DNI ${p.dni}) y todos sus datos relacionados.`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
