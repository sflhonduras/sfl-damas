// Carga ÚNICA del historial de participantes de eventos pasados de SFL Damas, desde un
// archivo Excel. Pensado para correrse UNA sola vez, al arrancar el sistema (no es un botón
// del panel — es un script de línea de comandos, a propósito, para que no quede expuesto a
// correrse por accidente más de una vez sobre datos reales).
//
// Uso:
//   node scripts/importar_excel_participantes.js /ruta/al/archivo.xlsx ["Nombre de la hoja"]
//
// Si no se indica el nombre de la hoja, usa la primera hoja del archivo.
//
// Formato esperado (encabezados exactos de columna, en la primera fila de la hoja). Ver
// README_IMPORTACION_INICIAL.md en esta misma carpeta para el detalle completo y ejemplos.
//
// Columnas de datos del participante:
//   Número de Identidad (DNI)   (obligatoria)
//   Nombre completo              (obligatoria)
//   Número de Celular
//   Capítulo al que pertenece
//   Zona
//   Departamento
//   Municipio
//   Cargo en FIHNEC
//   Estado Civil
//   Hijos (Cantidad)
//   Observacion
//
// Columnas de asistencia por nivel (una por cada nivel que la persona ya hizo):
//   SFL 1 / SFL 2 / SFL 3 / SFL 4   -> escribe "Registrado" (o "Si"/"Sí") si esa persona
//     YA ASISTIÓ PRESENCIALMENTE a ese nivel. Vacío o cualquier otro texto = no asistió.
//   SFL 1 Ciclo / SFL 2 Ciclo / SFL 3 Ciclo / SFL 4 Ciclo   (opcionales) -> número de ciclo/
//     edición de ese nivel en la que asistió, si el nivel ya se repitió más de una vez.
//     Si se deja vacío, se asume ciclo 1.
//
// Este script es idempotente: se puede volver a correr sobre el mismo archivo sin duplicar
// participantes (empareja por DNI) ni inscripciones (empareja por participante+evento).

import xlsx from 'xlsx';
import { pool } from '../src/db.js';

const archivo = process.argv[2];
const nombreHoja = process.argv[3];

if (!archivo) {
  console.log('Uso: node scripts/importar_excel_participantes.js /ruta/al/archivo.xlsx ["Nombre de la hoja"]');
  process.exit(1);
}

const norm = v => (v === undefined || v === null || v === '' ? null : String(v).trim());
const soloDigitos = v => (v === undefined || v === null ? null : String(v).replace(/[^\d]/g, ''));
const toInt = v => {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};
const marcaRegistrado = v => {
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'registrado' || s === 'si' || s === 'sí' || s === 'true' || s === 'x';
};

async function main() {
  const wb = xlsx.readFile(archivo);
  const hoja = nombreHoja ? wb.Sheets[nombreHoja] : wb.Sheets[wb.SheetNames[0]];
  if (!hoja) throw new Error(`No se encontró la hoja "${nombreHoja}" en el archivo.`);
  const filas = xlsx.utils.sheet_to_json(hoja, { defval: null });

  if (filas.length === 0) {
    console.log('El archivo no tiene filas de datos. Nada que importar.');
    await pool.end();
    return;
  }

  const eventosRes = await pool.query('SELECT id, orden FROM eventos ORDER BY orden');
  const eventoIdPorOrden = Object.fromEntries(eventosRes.rows.map(e => [e.orden, e.id]));
  if (Object.keys(eventoIdPorOrden).length === 0) {
    throw new Error('No hay eventos en la base de datos. Corre primero "npm run migrate" (crea los 4 niveles base) antes de importar.');
  }

  const dnisVistos = new Set();
  let creados = 0, existentesActualizados = 0, omitidosSinDniONombre = 0, omitidosDuplicadosEnArchivo = 0;
  let inscripcionesCreadas = 0, inscripcionesYaExistian = 0;

  for (const fila of filas) {
    const dni = soloDigitos(fila['Número de Identidad (DNI)']);
    const nombre = norm(fila['Nombre completo']);
    if (!dni || !nombre) { omitidosSinDniONombre++; continue; }
    if (dnisVistos.has(dni)) { omitidosDuplicadosEnArchivo++; continue; }
    dnisVistos.add(dni);

    const existente = await pool.query('SELECT id FROM participantes WHERE dni = $1', [dni]);
    let participanteId;
    if (existente.rows[0]) {
      participanteId = existente.rows[0].id;
      existentesActualizados++;
    } else {
      const ins = await pool.query(
        `INSERT INTO participantes
          (nombre_completo, dni, celular, capitulo, zona, departamento, municipio, cargo_fihnec,
           estado_civil, hijos_cantidad, observacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          nombre, dni,
          norm(fila['Número de Celular']),
          norm(fila['Capítulo al que pertenece']),
          norm(fila['Zona']),
          norm(fila['Departamento']),
          norm(fila['Municipio']),
          norm(fila['Cargo en FIHNEC']),
          norm(fila['Estado Civil']),
          toInt(fila['Hijos (Cantidad)']),
          norm(fila['Observacion'])
        ]
      );
      participanteId = ins.rows[0].id;
      creados++;
    }

    for (const orden of [1, 2, 3, 4]) {
      const columnaAsistencia = `SFL ${orden}`;
      if (!marcaRegistrado(fila[columnaAsistencia])) continue;
      const eventoId = eventoIdPorOrden[orden];
      if (!eventoId) continue; // ese nivel no existe en esta base (no debería pasar tras migrate)

      const ciclo = toInt(fila[`SFL ${orden} Ciclo`]) || 1;

      const yaExiste = await pool.query(
        'SELECT id FROM inscripciones WHERE participante_id = $1 AND evento_id = $2',
        [participanteId, eventoId]
      );
      if (yaExiste.rows[0]) { inscripcionesYaExistian++; continue; }

      await pool.query(
        `INSERT INTO inscripciones (participante_id, evento_id, ciclo, registrado_presencial, origen)
         VALUES ($1, $2, $3, TRUE, 'importado')`,
        [participanteId, eventoId, ciclo]
      );
      inscripcionesCreadas++;
    }
  }

  console.log(JSON.stringify({
    filas_procesadas: filas.length,
    participantes_creados: creados,
    participantes_existentes_encontrados_por_dni: existentesActualizados,
    omitidos_sin_dni_o_nombre: omitidosSinDniONombre,
    omitidos_duplicados_en_archivo: omitidosDuplicadosEnArchivo,
    inscripciones_creadas: inscripcionesCreadas,
    inscripciones_que_ya_existian: inscripcionesYaExistian
  }, null, 2));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
