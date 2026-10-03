// Genera un Excel con los servidores SFL y sus "años en FIHNEC" calculados a partir de su
// fecha de inscripción al capítulo. No modifica nada en la base de datos, solo genera el archivo.
//
// Uso:
//   node scripts/reporte_anos_fihnec.js
//
// El archivo se guarda en backend/reportes/anos_fihnec_<fecha>.xlsx

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import { pool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function calcularAnios(fechaInscripcion) {
  if (!fechaInscripcion) return null;
  const hoy = new Date();
  const inicio = new Date(fechaInscripcion);
  let anios = hoy.getFullYear() - inicio.getFullYear();
  const m = hoy.getMonth() - inicio.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < inicio.getDate())) anios--;
  return anios >= 0 ? anios : null;
}

async function main() {
  console.log('Calculando años en FIHNEC para cada servidor...\n');

  const { rows } = await pool.query(`
    SELECT nombre_completo, capitulo, zona, cargo_actual, fecha_inscripcion_capitulo, tiempo_fihnec
    FROM servidores
    ORDER BY nombre_completo ASC
  `);

  const datos = rows.map((s, i) => {
    const anios = calcularAnios(s.fecha_inscripcion_capitulo);
    return {
      '#': i + 1,
      'Nombre Completo': s.nombre_completo,
      'Capítulo': s.capitulo,
      'Zona': s.zona,
      'Cargo actual': s.cargo_actual,
      'Fecha de inscripción al capítulo': s.fecha_inscripcion_capitulo
        ? new Date(s.fecha_inscripcion_capitulo).toLocaleDateString('es-HN') : '',
      'Años en FIHNEC (calculado)': anios ?? '',
      'Tiempo en FIHNEC (texto capturado a mano)': s.tiempo_fihnec || ''
    };
  });

  const sinFecha = datos.filter(d => d['Años en FIHNEC (calculado)'] === '').length;
  console.log(`Total de servidores: ${datos.length}`);
  console.log(`Sin fecha de inscripción al capítulo (no se pudo calcular): ${sinFecha}`);

  const hoja = xlsx.utils.json_to_sheet(datos);
  const libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(libro, hoja, 'Años en FIHNEC');
  const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });

  const carpetaSalida = path.join(__dirname, '../reportes');
  if (!fs.existsSync(carpetaSalida)) fs.mkdirSync(carpetaSalida, { recursive: true });
  const fecha = new Date().toISOString().slice(0, 10);
  const rutaArchivo = path.join(carpetaSalida, `anos_fihnec_${fecha}.xlsx`);
  fs.writeFileSync(rutaArchivo, buffer);

  console.log(`\n✅ Archivo generado: backend/reportes/anos_fihnec_${fecha}.xlsx`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
