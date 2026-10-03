import crypto from 'crypto';
import { query } from './db.js';

const HORAS_VIGENCIA = 72;

// Los 18 departamentos de Honduras, en orden alfabético — se usa para que SIEMPRE aparezcan
// los 18 en la respuesta (con 0 si nadie ha llegado de ahí todavía), y para partirlos en 9 a
// la izquierda / 9 a la derecha en la pantalla.
export const DEPARTAMENTOS_HONDURAS = [
  'Atlántida', 'Choluteca', 'Colón', 'Comayagua', 'Copán', 'Cortés', 'El Paraíso',
  'Francisco Morazán', 'Gracias a Dios', 'Intibucá', 'Islas de la Bahía', 'La Paz',
  'Lempira', 'Ocotepeque', 'Olancho', 'Santa Bárbara', 'Valle', 'Yoro'
];

export async function obtenerOCrearEnlaceEnVivo(orden, ciclo) {
  const { rows: vigente } = await query(
    `SELECT token, expira_en FROM enlaces_en_vivo
     WHERE evento_orden = $1 AND ciclo = $2 AND expira_en > now()
     ORDER BY generado_en DESC LIMIT 1`,
    [orden, ciclo]
  );
  if (vigente[0]) return vigente[0];

  const token = crypto.randomBytes(18).toString('hex');
  const { rows } = await query(
    `INSERT INTO enlaces_en_vivo (evento_orden, ciclo, token, expira_en)
     VALUES ($1, $2, $3, now() + ($4 * interval '1 hour'))
     RETURNING token, expira_en`,
    [orden, ciclo, token, HORAS_VIGENCIA]
  );
  return rows[0];
}

async function resolverToken(token) {
  const { rows } = await query(
    `SELECT evento_orden, ciclo FROM enlaces_en_vivo WHERE token = $1 AND expira_en > now()`,
    [token]
  );
  return rows[0] || null;
}

function fusionar(listaA, listaB) {
  const mapa = {};
  for (const f of listaA || []) mapa[f.etiqueta] = (mapa[f.etiqueta] || 0) + f.total;
  for (const f of listaB || []) mapa[f.etiqueta] = (mapa[f.etiqueta] || 0) + f.total;
  return Object.entries(mapa).map(([etiqueta, total]) => ({ etiqueta, total })).sort((a, b) => b.total - a.total);
}

async function construirDistribucion(eventoId, orden, ciclo, columna, filtroDepartamento = null) {
  const paramsCon = [eventoId, ciclo];
  let filtroCon = '';
  if (filtroDepartamento) { paramsCon.push(filtroDepartamento); filtroCon = `AND p.departamento = $3`; }

  const conRequisito = await query(
    `SELECT COALESCE(p.${columna}, 'No especifica') AS etiqueta, COUNT(*)::int AS total
     FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
     WHERE i.evento_id = $1 AND i.ciclo = $2 AND i.registrado_presencial = TRUE ${filtroCon}
     GROUP BY etiqueta`,
    paramsCon
  );

  const paramsSin = [orden, ciclo];
  let filtroSin = '';
  if (filtroDepartamento) { paramsSin.push(filtroDepartamento); filtroSin = `AND COALESCE(p.departamento, pe.departamento) = $3`; }

  const sinRequisito = await query(
    `SELECT COALESCE(p.${columna}, pe.${columna}, 'No especifica') AS etiqueta, COUNT(*)::int AS total
     FROM participantes_excepcion pe
     LEFT JOIN participantes p ON p.id = pe.participante_id
     WHERE EXISTS (
       SELECT 1 FROM jsonb_array_elements(pe.eventos_sin_diploma) ev
       WHERE (ev->>'orden')::int = $1 AND (ev->>'ciclo')::int = $2
     ) ${filtroSin}
     GROUP BY etiqueta`,
    paramsSin
  );
  return fusionar(conRequisito.rows, sinRequisito.rows);
}

// GET /registro-en-vivo/:token -> TODO de una sola vez: total general, y los 18
// departamentos completos, cada uno YA CON su desglose de cargos adentro (para que al hacer
// clic no haya que pedir nada nuevo — ni parpadeo, ni "Cargando…").
export async function calcularResumenEnVivo(token) {
  const resuelto = await resolverToken(token);
  if (!resuelto) return null;
  const { evento_orden: orden, ciclo } = resuelto;

  const evRes = await query('SELECT id, nombre FROM eventos WHERE orden = $1', [orden]);
  const evento = evRes.rows[0];
  if (!evento) return null;

  const porDepartamento = await construirDistribucion(evento.id, orden, ciclo, 'departamento');
  const total = porDepartamento.reduce((s, f) => s + f.total, 0);
  const mapaDeptos = Object.fromEntries(porDepartamento.map(f => [f.etiqueta, f.total]));

  // Un desglose de cargos por cada uno de los 18 — en paralelo, para que la respuesta no
  // tarde 18 veces más que una sola consulta.
  const cargosPorDepto = await Promise.all(
    DEPARTAMENTOS_HONDURAS.map(nombre => construirDistribucion(evento.id, orden, ciclo, 'cargo_fihnec', nombre))
  );

  const departamentos = DEPARTAMENTOS_HONDURAS.map((nombre, i) => ({
    etiqueta: nombre,
    total: mapaDeptos[nombre] || 0,
    porcentaje: total ? Math.round(((mapaDeptos[nombre] || 0) / total) * 100) : 0,
    cargos: cargosPorDepto[i]
  }));

  return { nombre: evento.nombre, total, departamentos };
}

