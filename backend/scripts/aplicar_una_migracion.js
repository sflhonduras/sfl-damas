// Aplica UNA sola migración por nombre, sin volver a correr las demás.
// Uso: node scripts/aplicar_una_migracion.js 013_participantes_excepcion.sql
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const nombre = process.argv[2];
  if (!nombre) {
    console.error('Falta el nombre del archivo. Ejemplo:\n  node scripts/aplicar_una_migracion.js 013_participantes_excepcion.sql');
    process.exit(1);
  }
  const ruta = path.join(__dirname, '..', 'migrations', nombre);
  if (!fs.existsSync(ruta)) {
    console.error(`No existe el archivo: ${ruta}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(ruta, 'utf8');
  console.log(`Aplicando ${nombre}...`);
  await pool.query(sql);
  console.log('Listo. Se aplicó correctamente.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
