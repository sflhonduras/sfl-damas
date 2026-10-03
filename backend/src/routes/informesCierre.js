import crypto from 'crypto';
import { query } from '../db.js';

// ---------- Cálculo de los datos del informe (en vivo, a partir de la base real) ----------
// Se usa tanto para mostrar el informe mientras está "vivo" como para congelar la foto fija
// en el momento exacto del cierre.
export async function calcularSnapshot(orden, ciclo) {
  const { rows: eventoRows } = await query('SELECT * FROM eventos WHERE orden = $1', [orden]);
  const evento = eventoRows[0];
  if (!evento) return null;

  const { rows: kpiRows } = await query(
    `SELECT
       COUNT(*)::int AS inscritos,
       COUNT(*) FILTER (WHERE i.registrado_presencial = TRUE)::int AS registrados
     FROM inscripciones i
     WHERE i.evento_id = $1 AND i.ciclo = $2`,
    [evento.id, ciclo]
  );
  const inscritos = kpiRows[0]?.inscritos || 0;
  const registradosConRequisito = kpiRows[0]?.registrados || 0;

  // Participantes Sin Requisitos con evidencia de ESTE nivel y ESTE ciclo — mismo criterio
  // que ya usa Diplomas y Reportería. Cuentan como parte del total real de asistentes:
  // "Registrados" en este informe es la gente que de verdad estuvo ahí, con o sin requisito.
  const { rows: srCountRows } = await query(
    `SELECT COUNT(*)::int AS total
     FROM participantes_excepcion pe, jsonb_array_elements(pe.eventos_sin_diploma) ev
     WHERE (ev->>'orden')::int = $1 AND (ev->>'ciclo')::int = $2`,
    [orden, ciclo]
  );
  const sinRequisitos = srCountRows[0]?.total || 0;
  const registrados = registradosConRequisito + sinRequisitos;

  // Deserción hacia este nivel: gente que SE GRADUÓ del nivel anterior (fecha_graduacion
  // no nula — dato individual, no depende de que cierre el ciclo completo) y todavía nunca
  // tiene ninguna fila en este nivel, en ningún ciclo. Se actualiza en vivo, persona por
  // persona. Mismo criterio ahora en Estadísticas generales y Reportería.
  let desercion = null;
  if (orden >= 2) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total
       FROM eventos e_prev
       JOIN inscripciones i_prev ON i_prev.evento_id = e_prev.id AND i_prev.fecha_graduacion IS NOT NULL
       WHERE e_prev.orden = $1
         AND NOT EXISTS (
           SELECT 1 FROM inscripciones i_cur
           WHERE i_cur.participante_id = i_prev.participante_id AND i_cur.evento_id = $2
         )`,
      [orden - 1, evento.id]
    );
    desercion = rows[0]?.total || 0;
  }
  const porcentajeDesercion = (desercion !== null && (registrados + desercion) > 0)
    ? Math.round((desercion / (registrados + desercion)) * 1000) / 10
    : null;

  // Perfil demográfico, separado en dos: Con Requisito (registrados normales) y Sin
  // Requisito (participantes_excepcion) — mismo criterio de separación que ya usa
  // Reportería, para que ambos coincidan si alguien los compara.
  const construirDistribucionConRequisito = async (columna) => {
    const { rows } = await query(
      `SELECT COALESCE(p.${columna}, 'No especifica') AS etiqueta, COUNT(*)::int AS total
       FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
       WHERE i.evento_id = $1 AND i.ciclo = $2 AND i.registrado_presencial = TRUE
       GROUP BY etiqueta ORDER BY total DESC`,
      [evento.id, ciclo]
    );
    return rows;
  };

  const construirDistribucionSinRequisito = async (columna) => {
    const { rows } = await query(
      `SELECT COALESCE(p.${columna}, pe.${columna}, 'No especifica') AS etiqueta, COUNT(*)::int AS total
       FROM participantes_excepcion pe
       LEFT JOIN participantes p ON p.id = pe.participante_id
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(pe.eventos_sin_diploma) ev
         WHERE (ev->>'orden')::int = $1 AND (ev->>'ciclo')::int = $2
       )
       GROUP BY etiqueta ORDER BY total DESC`,
      [orden, ciclo]
    );
    return rows;
  };

  const [
    estadoCivilCR, cargoCR, departamentoCR,
    estadoCivilSR, cargoSR, departamentoSR
  ] = await Promise.all([
    construirDistribucionConRequisito('estado_civil'),
    construirDistribucionConRequisito('cargo_fihnec'),
    construirDistribucionConRequisito('departamento'),
    construirDistribucionSinRequisito('estado_civil'),
    construirDistribucionSinRequisito('cargo_fihnec'),
    construirDistribucionSinRequisito('departamento')
  ]);

  return {
    evento_orden: orden,
    evento_nombre: evento.nombre,
    ciclo,
    inscritos,
    registrados,
    registrados_con_requisito: registradosConRequisito,
    sin_requisitos: sinRequisitos,
    desercion,
    porcentaje_desercion: porcentajeDesercion,
    estado_civil: { con_requisito: estadoCivilCR, sin_requisito: estadoCivilSR },
    cargo_fihnec: { con_requisito: cargoCR, sin_requisito: cargoSR },
    departamento: { con_requisito: departamentoCR, sin_requisito: departamentoSR },
    calculado_en: new Date().toISOString()
  };
}

// ---------- Obtener (o crear) el informe vivo de un nivel+ciclo ----------
// Se llama al momento en que un nivel deja de ser "el actual" — ahí nace su informe.
export async function obtenerOCrearInforme(orden, ciclo) {
  const { rows: existentes } = await query(
    'SELECT * FROM informes_cierre_nivel WHERE evento_orden = $1 AND ciclo = $2',
    [orden, ciclo]
  );
  if (existentes[0]) return existentes[0];

  const token = crypto.randomBytes(18).toString('hex'); // 36 caracteres, imposible de adivinar
  const { rows } = await query(
    'INSERT INTO informes_cierre_nivel (evento_orden, ciclo, token) VALUES ($1,$2,$3) RETURNING *',
    [orden, ciclo, token]
  );
  return rows[0];
}

// ---------- Congelar informes (guardar la foto fija) ----------
async function congelarFila(fila) {
  const snapshot = await calcularSnapshot(fila.evento_orden, fila.ciclo);
  await query(
    'UPDATE informes_cierre_nivel SET congelado = TRUE, snapshot = $1, congelado_en = now() WHERE id = $2',
    [JSON.stringify(snapshot), fila.id]
  );
}

// Congela cualquier informe sin congelar de UN nivel específico (cuando ese nivel cierra
// su propio ciclo otra vez — "Nuevo ciclo").
export async function congelarInformesDeNivel(orden) {
  const { rows } = await query(
    'SELECT * FROM informes_cierre_nivel WHERE evento_orden = $1 AND congelado = FALSE',
    [orden]
  );
  for (const fila of rows) await congelarFila(fila);
}

// Congela TODOS los informes sin congelar de cualquier nivel (cuando cambia cuál nivel es
// el actual — ese cambio es, por definición, "el evento siguiente" para cualquier informe
// que siguiera vivo de un cierre anterior).
export async function congelarTodosLosNoCongelados() {
  const { rows } = await query('SELECT * FROM informes_cierre_nivel WHERE congelado = FALSE');
  for (const fila of rows) await congelarFila(fila);
}

// ---------- Leer un informe por token (para la página pública y el panel) ----------
// Si está congelado, devuelve la foto fija guardada. Si sigue vivo, lo recalcula al momento.
export async function obtenerInformePorToken(token) {
  const { rows } = await query('SELECT * FROM informes_cierre_nivel WHERE token = $1', [token]);
  const fila = rows[0];
  if (!fila) return null;
  const datos = fila.congelado ? fila.snapshot : await calcularSnapshot(fila.evento_orden, fila.ciclo);
  return { token: fila.token, congelado: fila.congelado, generado_en: fila.generado_en, congelado_en: fila.congelado_en, ...datos };
}
