// Papelera: red de seguridad para las eliminaciones del sistema. Antes de borrar cualquier
// registro, se guarda una copia completa como JSON — así, si fue un error, se puede
// restaurar exactamente como estaba, sin tener que escribir un script cada vez.
//
// Usa un truco de PostgreSQL: row_to_json() para capturar la fila completa sin tener que
// enumerar sus columnas a mano, y jsonb_populate_record() para reconstruirla exacta al
// restaurar — funciona igual sin importar qué tabla sea.
import { query } from './db.js';

// Solo estas tablas pueden pasar por la papelera — nunca se arma el nombre de tabla a partir
// de algo que venga del usuario, siempre de esta lista fija (evita inyección SQL).
const TABLAS_PERMITIDAS = new Set([
  'servidores', 'usuarios_admin', 'items_inventario', 'tipos_vehiculo', 'transportes', 'medallas_manuales',
  'participantes_excepcion'
]);

// Guarda una copia de una fila (de una tabla "simple", de un solo registro) en la papelera,
// justo antes de que la ruta que llama a esto la borre de verdad.
export async function guardarEnPapelera(tabla, id, resumen, usuarioId) {
  if (!TABLAS_PERMITIDAS.has(tabla)) throw new Error(`Tabla no permitida para papelera: ${tabla}`);
  const { rows } = await query(
    `SELECT row_to_json(t) AS datos FROM (SELECT * FROM ${tabla} WHERE id = $1) t`,
    [id]
  );
  if (!rows[0]) return; // ya no existe, nada que guardar
  await query(
    `INSERT INTO papelera (tabla, resumen, datos, eliminado_por) VALUES ($1,$2,$3,$4)`,
    [tabla, resumen, JSON.stringify({ tipo: 'simple', fila: rows[0].datos }), usuarioId]
  );
}

// Caso especial: un participante arrastra inscripciones, historial y medallas manuales
// (se borran en cascada). Se guardan las 4 tablas juntas, para poder restaurar todo de una vez.
export async function guardarParticipanteEnPapelera(participanteId, resumen, usuarioId) {
  const [participante, inscripciones, historial, medallas] = await Promise.all([
    query(`SELECT row_to_json(t) AS d FROM (SELECT * FROM participantes WHERE id = $1) t`, [participanteId]),
    query(`SELECT row_to_json(t) AS d FROM (SELECT * FROM inscripciones WHERE participante_id = $1) t`, [participanteId]),
    query(`SELECT row_to_json(t) AS d FROM (SELECT * FROM inscripciones_historial WHERE participante_id = $1) t`, [participanteId]),
    query(`SELECT row_to_json(t) AS d FROM (SELECT * FROM medallas_manuales WHERE participante_id = $1) t`, [participanteId])
  ]);
  if (!participante.rows[0]) return;
  await query(
    `INSERT INTO papelera (tabla, resumen, datos, eliminado_por) VALUES ($1,$2,$3,$4)`,
    ['participantes', resumen, JSON.stringify({
      tipo: 'participante',
      participante: participante.rows[0].d,
      inscripciones: inscripciones.rows.map(r => r.d),
      inscripciones_historial: historial.rows.map(r => r.d),
      medallas_manuales: medallas.rows.map(r => r.d)
    }), usuarioId]
  );
}

// Caso especial: un ítem de inventario tiene su cantidad/estado guardados en una tabla
// aparte (inventario_evento, uno por cada evento), más su historial de cambios
// (inventario_historial) — hay que guardar las 3 tablas juntas para restaurarlo completo.
export async function guardarItemInventarioEnPapelera(itemId, resumen, usuarioId) {
  const [item, eventos, historial] = await Promise.all([
    query(`SELECT row_to_json(t) AS d FROM (SELECT * FROM items_inventario WHERE id = $1) t`, [itemId]),
    query(`SELECT row_to_json(t) AS d FROM (SELECT * FROM inventario_evento WHERE item_id = $1) t`, [itemId]),
    query(`SELECT row_to_json(t) AS d FROM (SELECT * FROM inventario_historial WHERE item_id = $1) t`, [itemId])
  ]);
  if (!item.rows[0]) return;
  await query(
    `INSERT INTO papelera (tabla, resumen, datos, eliminado_por) VALUES ($1,$2,$3,$4)`,
    ['items_inventario', resumen, JSON.stringify({
      tipo: 'item_inventario',
      item: item.rows[0].d,
      inventario_evento: eventos.rows.map(r => r.d),
      inventario_historial: historial.rows.map(r => r.d)
    }), usuarioId]
  );
}


export async function listarPapelera(req, res) {
  const { rows } = await query(`
    SELECT p.id, p.tabla, p.resumen, p.eliminado_en, u.nombre AS eliminado_por_nombre
    FROM papelera p LEFT JOIN usuarios_admin u ON u.id = p.eliminado_por
    WHERE p.restaurado = FALSE ORDER BY p.eliminado_en DESC LIMIT 200`);
  res.json(rows);
}

// POST /api/admin/mantenimiento/papelera/:id/restaurar
export async function restaurarDePapelera(req, res) {
  const { rows } = await query('SELECT * FROM papelera WHERE id = $1 AND restaurado = FALSE', [req.params.id]);
  const entrada = rows[0];
  if (!entrada) return res.status(404).json({ error: 'No encontrado, o ya fue restaurado antes.' });

  try {
    if (entrada.datos.tipo === 'participante') {
      const d = entrada.datos;
      await query(`INSERT INTO participantes SELECT * FROM jsonb_populate_record(NULL::participantes, $1::jsonb)`, [JSON.stringify(d.participante)]);
      for (const fila of d.inscripciones) {
        await query(`INSERT INTO inscripciones SELECT * FROM jsonb_populate_record(NULL::inscripciones, $1::jsonb)`, [JSON.stringify(fila)]);
      }
      for (const fila of d.inscripciones_historial) {
        await query(`INSERT INTO inscripciones_historial SELECT * FROM jsonb_populate_record(NULL::inscripciones_historial, $1::jsonb)`, [JSON.stringify(fila)]);
      }
      for (const fila of d.medallas_manuales) {
        await query(`INSERT INTO medallas_manuales SELECT * FROM jsonb_populate_record(NULL::medallas_manuales, $1::jsonb)`, [JSON.stringify(fila)]);
      }
    } else if (entrada.datos.tipo === 'item_inventario') {
      const d = entrada.datos;
      await query(`INSERT INTO items_inventario SELECT * FROM jsonb_populate_record(NULL::items_inventario, $1::jsonb)`, [JSON.stringify(d.item)]);
      for (const fila of d.inventario_evento) {
        await query(`INSERT INTO inventario_evento SELECT * FROM jsonb_populate_record(NULL::inventario_evento, $1::jsonb)`, [JSON.stringify(fila)]);
      }
      for (const fila of d.inventario_historial) {
        await query(`INSERT INTO inventario_historial SELECT * FROM jsonb_populate_record(NULL::inventario_historial, $1::jsonb)`, [JSON.stringify(fila)]);
      }
    } else {
      if (!TABLAS_PERMITIDAS.has(entrada.tabla)) throw new Error('Tabla no permitida.');
      await query(
        `INSERT INTO ${entrada.tabla} SELECT * FROM jsonb_populate_record(NULL::${entrada.tabla}, $1::jsonb)`,
        [JSON.stringify(entrada.datos.fila)]
      );
    }
  } catch (e) {
    console.error('Error restaurando de papelera:', e);
    return res.status(500).json({ error: 'No se pudo restaurar — es posible que ya exista un registro con el mismo id o algún dato relacionado ya no exista.' });
  }

  await query('UPDATE papelera SET restaurado = TRUE WHERE id = $1', [req.params.id]);
  res.json({ mensaje: 'Restaurado correctamente.' });
}

// DELETE /api/admin/mantenimiento/papelera/:id -> borra la copia de la papelera para siempre
// (el registro original YA estaba borrado desde antes; esto solo limpia el respaldo).
export async function purgarDePapelera(req, res) {
  const { rowCount } = await query('DELETE FROM papelera WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'No encontrado.' });
  res.json({ mensaje: 'Eliminado de la papelera de forma permanente.' });
}
