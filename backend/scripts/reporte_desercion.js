// Genera un Excel con la "lista de llamadas": participantes que se quedaron a medias del
// camino (no llegaron al Nivel IV, o llegaron pero nunca se graduaron) y que YA NO forman
// parte del grupo activo de su nivel (su ciclo quedó desfasado del ciclo en vivo) — es decir,
// gente que empezó, no regresó, y probablemente necesita una llamada para retomar.
//
// No modifica nada en la base de datos, solo genera el archivo.
//
// Uso:
//   node scripts/reporte_desercion.js
//
// El archivo se guarda en backend/reportes/desercion_<fecha>.xlsx

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import { pool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('Buscando participantes que no completaron los 4 niveles y ya no están activos...\n');

  const { rows: eventos } = await pool.query('SELECT id, orden, nombre, ciclo_actual FROM eventos ORDER BY orden');
  const eventoPorId = new Map(eventos.map(e => [e.id, e]));

  // Para cada participante, su inscripción en el nivel MÁS ALTO que alcanzó.
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (p.id)
      p.id, p.nombre_completo, p.dni, p.celular, p.capitulo, p.zona,
      e.orden AS nivel_maximo, e.nombre AS nivel_nombre, e.ciclo_actual AS ciclo_actual_nivel,
      i.ciclo, i.registrado_en, i.fecha_graduacion
    FROM participantes p
    JOIN inscripciones i ON i.participante_id = p.id
    JOIN eventos e ON e.id = i.evento_id
    ORDER BY p.id, e.orden DESC
  `);

  const lista = rows.filter(r => {
    const noLlegoAlFinal = r.nivel_maximo < 4;
    const llegoPeroNoGraduo = r.nivel_maximo === 4 && !r.fecha_graduacion;
    const yaNoEstaActivo = r.ciclo !== r.ciclo_actual_nivel; // se quedó en un ciclo viejo, no en el actual
    return (noLlegoAlFinal || llegoPeroNoGraduo) && yaNoEstaActivo;
  });

  lista.sort((a, b) => b.nivel_maximo - a.nivel_maximo || new Date(b.registrado_en) - new Date(a.registrado_en));

  const datos = lista.map((r, i) => ({
    '#': i + 1,
    'Nombre Completo': r.nombre_completo,
    'DNI': r.dni,
    'Celular': r.celular,
    'Capítulo': r.capitulo,
    'Zona': r.zona,
    'Nivel máximo alcanzado': `${r.nivel_maximo} - ${r.nivel_nombre}`,
    'Se quedó en el ciclo': r.ciclo,
    '¿Ese nivel sigue activo hoy?': 'No (ciclo viejo)',
    'Fecha en que se registró ahí': r.registrado_en ? new Date(r.registrado_en).toLocaleDateString('es-HN') : ''
  }));

  console.log(`Se encontraron ${datos.length} participante(s) para la lista de llamadas.\n`);
  datos.forEach(d => console.log(`- ${d['Nombre Completo']} (${d['Celular'] || 'sin celular'}) · quedó en ${d['Nivel máximo alcanzado']}`));

  const hoja = xlsx.utils.json_to_sheet(datos);
  const libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(libro, hoja, 'Lista de llamadas');
  const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });

  const carpetaSalida = path.join(__dirname, '../reportes');
  if (!fs.existsSync(carpetaSalida)) fs.mkdirSync(carpetaSalida, { recursive: true });
  const fecha = new Date().toISOString().slice(0, 10);
  const rutaArchivo = path.join(carpetaSalida, `desercion_${fecha}.xlsx`);
  fs.writeFileSync(rutaArchivo, buffer);

  console.log(`\n✅ Archivo generado: backend/reportes/desercion_${fecha}.xlsx`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
