// Corrige mayúsculas/minúsculas en departamento y municipio, usando la ortografía oficial
// exacta del mapa municipio_departamento.json como fuente de verdad (evita errores con
// acentos o nombres compuestos como "Santa Rosa de Copán" que un algoritmo genérico
// podría arruinar).
//
// También fusiona el alias conocido: cualquier variante de "Tegucigalpa" se corrige al
// nombre oficial del municipio, "Distrito Central" (son el mismo municipio).
//
// Si un valor no coincide con ningún nombre oficial (typo raro, dato incompleto), se deja
// tal cual y se reporta en la lista de "sin coincidencia" para que Carlos lo revise a mano.
//
// Modo SIMULACIÓN por defecto. Para aplicar:
//   npm run normalizar-ubicaciones -- --aplicar

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapaMunicipioDepartamento = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'municipio_departamento.json'), 'utf8')
);

const aplicar = process.argv.includes('--aplicar');

// Alias conocidos: minúscula sin acentos/espacios de sobra -> nombre oficial del municipio.
const ALIAS_MUNICIPIO = {
  'tegucigalpa': 'Distrito Central'
};

// Quita acentos, colapsa espacios de sobra y pasa a minúscula, para que "copan",
// "COPÁN" y "Copán" (o "santa   barbara" con espacios de más) se reconozcan igual.
function normalizarClave(valor) {
  return valor.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

// Diccionario municipio (clave normalizada) -> ortografía oficial, tomado directo del mapa.
const MUNICIPIOS_OFICIALES = {};
for (const nombre of Object.keys(mapaMunicipioDepartamento)) {
  MUNICIPIOS_OFICIALES[normalizarClave(nombre)] = nombre;
}

// Diccionario departamento (clave normalizada) -> ortografía oficial, tomado de los valores del mapa.
const DEPARTAMENTOS_OFICIALES = {};
for (const depto of new Set(Object.values(mapaMunicipioDepartamento))) {
  DEPARTAMENTOS_OFICIALES[normalizarClave(depto)] = depto;
}

// Lista de departamentos oficiales, más largos primero, para detectar "municipio + departamento
// pegado" (ej. "Choloma Cortes" o "Santa Rita Copan").
const DEPARTAMENTOS_NORMALIZADOS = Object.entries(DEPARTAMENTOS_OFICIALES)
  .map(([normal, oficial]) => ({ normal, oficial }))
  .sort((a, b) => b.normal.length - a.normal.length);

function corregirMunicipio(valor) {
  if (!valor) return { nuevo: valor, coincide: true, departamentoInferido: null };
  const clave = normalizarClave(valor);
  if (ALIAS_MUNICIPIO[clave]) return { nuevo: ALIAS_MUNICIPIO[clave], coincide: true, departamentoInferido: null };
  if (MUNICIPIOS_OFICIALES[clave]) return { nuevo: MUNICIPIOS_OFICIALES[clave], coincide: true, departamentoInferido: null };

  // "Municipio + Departamento pegado": separa el departamento del final y prueba el resto.
  // Aquí SÍ sabemos con certeza el departamento correcto (la persona lo escribió explícitamente),
  // así que lo devolvemos para rellenar el campo departamento en el mismo paso — si lo dejáramos
  // para después, ya se habría perdido esa pista al quedar el municipio "limpio".
  for (const { normal, oficial } of DEPARTAMENTOS_NORMALIZADOS) {
    if (clave.length > normal.length && clave.endsWith(' ' + normal)) {
      const resto = clave.slice(0, clave.length - normal.length - 1).trim();
      if (resto && MUNICIPIOS_OFICIALES[resto]) {
        return { nuevo: MUNICIPIOS_OFICIALES[resto], coincide: true, departamentoInferido: oficial };
      }
    }
  }

  return { nuevo: valor, coincide: false, departamentoInferido: null };
}

function corregirDepartamento(valor) {
  if (!valor) return { nuevo: valor, coincide: true };
  const clave = normalizarClave(valor);
  if (DEPARTAMENTOS_OFICIALES[clave]) return { nuevo: DEPARTAMENTOS_OFICIALES[clave], coincide: true };
  return { nuevo: valor, coincide: false };
}

async function main() {
  console.log(aplicar ? '⚠️  Modo APLICAR: se van a guardar los cambios.' : 'Modo SIMULACIÓN (no se guarda nada). Corre con --aplicar para guardar.');
  console.log('');

  const { rows } = await pool.query(
    `SELECT id, departamento, municipio FROM participantes
     WHERE (departamento IS NOT NULL AND departamento <> '') OR (municipio IS NOT NULL AND municipio <> '')`
  );

  let cambios = 0;
  const sinCoincidenciaDepto = new Set();
  const sinCoincidenciaMuni = new Set();

  for (const fila of rows) {
    const muni = corregirMunicipio(fila.municipio);
    let depto = corregirDepartamento(fila.departamento);

    // Si el departamento está vacío pero al desambiguar el municipio ("Santa Rita Copán")
    // se determinó con certeza el departamento correcto, lo usamos aquí mismo.
    if ((!fila.departamento || !fila.departamento.trim()) && muni.departamentoInferido) {
      depto = { nuevo: muni.departamentoInferido, coincide: true };
    }

    if (!depto.coincide && fila.departamento) sinCoincidenciaDepto.add(fila.departamento);
    if (!muni.coincide && fila.municipio) sinCoincidenciaMuni.add(fila.municipio);

    const cambioDepto = depto.nuevo !== fila.departamento;
    const cambioMuni = muni.nuevo !== fila.municipio;

    if (cambioDepto || cambioMuni) {
      cambios++;
      if (cambioDepto) console.log(`[participantes #${fila.id}] departamento: "${fila.departamento}" -> "${depto.nuevo}"${muni.departamentoInferido ? '  (deducido del municipio)' : ''}`);
      if (cambioMuni) console.log(`[participantes #${fila.id}] municipio: "${fila.municipio}" -> "${muni.nuevo}"`);
      if (aplicar) {
        await pool.query('UPDATE participantes SET departamento = $1, municipio = $2 WHERE id = $3', [depto.nuevo, muni.nuevo, fila.id]);
      }
    }
  }

  console.log('');
  console.log(`Registros revisados: ${rows.length}`);
  console.log(`Registros con cambios: ${cambios}`);
  if (sinCoincidenciaDepto.size) {
    console.log(`\nDepartamentos sin coincidencia oficial (se dejaron igual):`);
    for (const d of sinCoincidenciaDepto) console.log(`  - "${d}"`);
  }
  if (sinCoincidenciaMuni.size) {
    console.log(`\nMunicipios sin coincidencia oficial (se dejaron igual):`);
    for (const m of sinCoincidenciaMuni) console.log(`  - "${m}"`);
  }
  console.log('');
  console.log(aplicar ? '✅ Cambios guardados.' : 'Nada se guardó todavía. Corre "npm run normalizar-ubicaciones -- --aplicar" para aplicar.');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
