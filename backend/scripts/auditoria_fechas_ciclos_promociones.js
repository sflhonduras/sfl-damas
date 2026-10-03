// Auditoría de solo lectura: revisa TODAS las inscripciones (los 4 niveles) buscando datos
// que no cuadran — ciclos fuera de lo esperado, promoción y ciclo que no coinciden, fechas
// futuras, fechas de graduación sin promoción (o al revés), y el orden de las fechas de
// registro entre niveles de una misma persona. No modifica nada.
//
// Uso:
//   node scripts/auditoria_fechas_ciclos_promociones.js

import { pool } from '../src/db.js';

async function main() {
  const hoy = new Date();

  const { rows: eventos } = await pool.query('SELECT id, orden, ciclo_actual FROM eventos ORDER BY orden');
  const cicloActualPorEvento = new Map(eventos.map(e => [e.id, e.ciclo_actual]));
  const ordenPorEvento = new Map(eventos.map(e => [e.id, e.orden]));

  const { rows: inscripciones } = await pool.query(`
    SELECT i.id, i.participante_id, p.nombre_completo, p.dni, i.evento_id, i.ciclo,
      i.fecha_graduacion, i.promocion_graduacion, i.registrado_en
    FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
    ORDER BY p.id, i.evento_id
  `);

  const hallazgos = { cicloRaro: [], promoCicloDesajustado: [], incompleto: [], fechaFutura: [], ordenIlogico: [], posibleDobleNoDetectado: [] };

  // 1-4: revisión por fila individual
  for (const i of inscripciones) {
    const orden = ordenPorEvento.get(i.evento_id);

    // Ciclo fuera del rango esperado (0 a 5 hoy en día; ajusta si en el futuro hay más ciclos en vivo)
    if (i.ciclo !== null && (i.ciclo < 0 || i.ciclo > 5)) {
      hallazgos.cicloRaro.push(`${i.nombre_completo} (#${i.participante_id}) · Nivel ${orden} · ciclo ${i.ciclo} (fuera de 0-5)`);
    }

    // Promoción y ciclo no coinciden en los históricos (1-4) — deberían ser el mismo número
    if (i.promocion_graduacion && /^[0-9]+$/.test(i.promocion_graduacion) && i.ciclo >= 1 && i.ciclo <= 4) {
      if (parseInt(i.promocion_graduacion, 10) !== i.ciclo) {
        hallazgos.promoCicloDesajustado.push(
          `${i.nombre_completo} (#${i.participante_id}) · Nivel ${orden} · ciclo ${i.ciclo} pero promoción "${i.promocion_graduacion}"`
        );
      }
    }

    // Fecha de graduación sin promoción, o promoción sin fecha (solo raro en Nivel IV, que es donde "graduarse" tiene sentido pleno)
    if (orden === 4) {
      if (i.fecha_graduacion && !i.promocion_graduacion) {
        hallazgos.incompleto.push(`${i.nombre_completo} (#${i.participante_id}) · Nivel IV · tiene graduación (${i.fecha_graduacion?.toISOString().slice(0,10)}) pero SIN promoción`);
      }
      if (!i.fecha_graduacion && i.promocion_graduacion) {
        hallazgos.incompleto.push(`${i.nombre_completo} (#${i.participante_id}) · Nivel IV · tiene promoción "${i.promocion_graduacion}" pero SIN fecha de graduación`);
      }
    }

    // Fechas en el futuro
    if (i.fecha_graduacion && new Date(i.fecha_graduacion) > hoy) {
      hallazgos.fechaFutura.push(`${i.nombre_completo} (#${i.participante_id}) · Nivel ${orden} · graduación futura: ${i.fecha_graduacion.toISOString().slice(0,10)}`);
    }
    if (i.registrado_en && new Date(i.registrado_en) > hoy) {
      hallazgos.fechaFutura.push(`${i.nombre_completo} (#${i.participante_id}) · Nivel ${orden} · registro futuro: ${i.registrado_en.toISOString().slice(0,10)}`);
    }

    // Ciclo histórico (1-4) pero fecha de registro muy reciente (últimos 90 días) — posible
    // caso de "doble registro" no detectado (alguien activo hoy que también tiene historial viejo).
    if (i.ciclo >= 1 && i.ciclo <= 4 && i.registrado_en) {
      const diasDesdeRegistro = (hoy - new Date(i.registrado_en)) / (1000 * 60 * 60 * 24);
      if (diasDesdeRegistro >= 0 && diasDesdeRegistro < 90) {
        hallazgos.posibleDobleNoDetectado.push(
          `${i.nombre_completo} (#${i.participante_id}) · Nivel ${orden} · ciclo histórico (${i.ciclo}) pero registrado hace solo ${Math.round(diasDesdeRegistro)} día(s) (${i.registrado_en.toISOString().slice(0,10)}) — revisar si está activo hoy en este nivel.`
        );
      }
    }
  }

  // 5: orden ilógico entre niveles de una misma persona (Nivel N+1 registrado ANTES que Nivel N)
  const porParticipante = new Map();
  for (const i of inscripciones) {
    if (!porParticipante.has(i.participante_id)) porParticipante.set(i.participante_id, []);
    porParticipante.get(i.participante_id).push({ ...i, orden: ordenPorEvento.get(i.evento_id) });
  }
  for (const [, filas] of porParticipante) {
    filas.sort((a, b) => a.orden - b.orden);
    for (let k = 1; k < filas.length; k++) {
      const previo = filas[k - 1], actual = filas[k];
      if (previo.registrado_en && actual.registrado_en && new Date(actual.registrado_en) < new Date(previo.registrado_en)) {
        hallazgos.ordenIlogico.push(
          `${actual.nombre_completo} (#${actual.participante_id}) · Nivel ${actual.orden} registrado el ${actual.registrado_en.toISOString().slice(0,10)}, ` +
          `ANTES que su Nivel ${previo.orden} (${previo.registrado_en.toISOString().slice(0,10)})`
        );
      }
    }
  }

  const totalHallazgos = Object.values(hallazgos).reduce((s, arr) => s + arr.length, 0);
  console.log(`=== Auditoría de fechas, ciclos y promociones ===`);
  console.log(`Total de inscripciones revisadas: ${inscripciones.length}`);
  console.log(`Total de hallazgos: ${totalHallazgos}\n`);

  const secciones = [
    ['1. Ciclo fuera de rango esperado (0-5)', hallazgos.cicloRaro],
    ['2. Promoción y ciclo no coinciden (deberían ser el mismo número, para históricos 1-4)', hallazgos.promoCicloDesajustado],
    ['3. Nivel IV incompleto (graduación sin promoción, o promoción sin graduación)', hallazgos.incompleto],
    ['4. Fechas en el futuro', hallazgos.fechaFutura],
    ['5. Orden ilógico (un nivel más alto registrado antes que uno más bajo)', hallazgos.ordenIlogico],
    ['6. Ciclo histórico con registro muy reciente (posible doble registro no detectado)', hallazgos.posibleDobleNoDetectado],
  ];

  for (const [titulo, lista] of secciones) {
    console.log(`--- ${titulo} (${lista.length}) ---`);
    if (lista.length === 0) console.log('  (nada raro encontrado)');
    else lista.forEach(l => console.log('  - ' + l));
    console.log('');
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
