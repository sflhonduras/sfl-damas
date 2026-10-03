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
//   SFL 1 Fecha / SFL 2 Fecha / SFL 3 Fecha / SFL 4 Fecha   (opcionales, pero MUY
//     recomendadas) -> fecha en que completó ese nivel. Se guarda en el mismo campo que el
//     resto del sistema llama internamente "fecha_graduacion" (nombre heredado del código),
//     pero OJO: a nivel de negocio esto NO significa que hubo una ceremonia de graduación en
//     ese nivel — la única graduación real es al completar los 4 niveles de forma secuencial.
//     El campo se llena en cada nivel simplemente porque la deserción, Reportería y otras
//     estadísticas de ESTE sistema lo necesitan por nivel para calcular bien (mismo criterio
//     que ya usa SFL-Hombres con sus propias promociones históricas). Acepta fecha de Excel
//     (celda con formato de fecha) o texto en formato AAAA-MM-DD o DD/MM/AAAA.
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
// Acepta: fecha nativa de Excel (con cellDates:true ya llega como objeto Date), número de
// serie de Excel (por si algún lector no la convirtió), o texto en AAAA-MM-DD / DD/MM/AAAA.
// Devuelve 'AAAA-MM-DD' (lo que espera la columna DATE) o null si no se pudo leer.
const parseFecha = v => {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    const base = Date.UTC(1899, 11, 30); // época de Excel
    const fecha = new Date(base + v * 24 * 60 * 60 * 1000);
    return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
};

async function main() {
  const wb = xlsx.readFile(archivo, { cellDates: true });
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
  let inscripcionesCreadas = 0, inscripcionesYaExistian = 0, fechasNoReconocidas = 0;

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

      const valorFecha = fila[`SFL ${orden} Fecha`];
      const fechaCompletado = parseFecha(valorFecha);
      if (valorFecha && !fechaCompletado) fechasNoReconocidas++; // venía algo pero no se pudo leer

      const yaExiste = await pool.query(
        'SELECT id FROM inscripciones WHERE participante_id = $1 AND evento_id = $2',
        [participanteId, eventoId]
      );
      if (yaExiste.rows[0]) { inscripcionesYaExistian++; continue; }

      await pool.query(
        `INSERT INTO inscripciones (participante_id, evento_id, ciclo, registrado_presencial, fecha_graduacion, origen)
         VALUES ($1, $2, $3, TRUE, $4, 'importado')`,
        [participanteId, eventoId, ciclo, fechaCompletado]
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
    inscripciones_que_ya_existian: inscripcionesYaExistian,
    fechas_de_nivel_no_reconocidas: fechasNoReconocidas
  }, null, 2));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
