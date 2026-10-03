// Corrige mayúsculas en campos de texto libre: nombre completo, nombre de contacto de
// emergencia (título tipo "Juan Pérez") y observación (solo primera letra, es texto libre).
// No toca departamento/municipio/zona/cargo_fihnec porque esos ya vienen de listas fijas.
//
// Por seguridad corre en modo SIMULACIÓN por defecto (solo muestra qué cambiaría, no
// modifica nada). Para aplicar los cambios de verdad:
//   npm run normalizar-textos -- --aplicar
//
// Recomendado: descarga un respaldo desde Mantenimiento antes de aplicar.

import { pool } from '../src/db.js';
import { normalizarNombre } from '../src/texto.js';

const aplicar = process.argv.includes('--aplicar');

function normalizarObservacion(texto) {
  if (!texto) return texto;
  const t = String(texto).trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function procesarTabla({ tabla, campos }) {
  const { rows } = await pool.query(`SELECT id, ${campos.map(c => c.columna).join(', ')} FROM ${tabla}`);
  let cambios = 0;

  for (const fila of rows) {
    const sets = [];
    const vals = [];
    for (const { columna, transformar } of campos) {
      const original = fila[columna];
      const nuevo = transformar(original);
      if (nuevo !== undefined && nuevo !== original && !(nuevo == null && original == null)) {
        vals.push(nuevo);
        sets.push(`${columna} = $${vals.length}`);
        if (!aplicar) {
          console.log(`[${tabla} #${fila.id}] ${columna}: "${original}" -> "${nuevo}"`);
        }
      }
    }
    if (sets.length) {
      cambios++;
      if (aplicar) {
        vals.push(fila.id);
        await pool.query(`UPDATE ${tabla} SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
      }
    }
  }
  return cambios;
}

async function main() {
  console.log(aplicar ? '⚠️  Modo APLICAR: se van a guardar los cambios.' : 'Modo SIMULACIÓN (no se guarda nada). Corre con --aplicar para guardar.');
  console.log('');

  const cambiosParticipantes = await procesarTabla({
    tabla: 'participantes',
    campos: [
      { columna: 'nombre_completo', transformar: normalizarNombre },
      { columna: 'contacto_emergencia_nombre', transformar: normalizarNombre },
      { columna: 'observacion', transformar: normalizarObservacion }
    ]
  });

  const cambiosServidores = await procesarTabla({
    tabla: 'servidores',
    campos: [
      { columna: 'nombre_completo', transformar: normalizarNombre }
    ]
  });

  console.log('');
  console.log(`Participantes con cambios: ${cambiosParticipantes}`);
  console.log(`Servidores con cambios: ${cambiosServidores}`);
  console.log(aplicar ? '✅ Cambios guardados.' : 'Nada se guardó todavía. Corre "npm run normalizar-textos -- --aplicar" para aplicar.');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
