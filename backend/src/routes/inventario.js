import { Router } from 'express';
import PDFDocument from 'pdfkit';
import xlsx from 'xlsx';
import { query } from '../db.js';
import { requireAuth, requireModulo } from '../auth.js';
import { guardarItemInventarioEnPapelera } from '../papelera.js';

const router = Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user.rol === 'cocina') return res.status(403).json({ error: 'No tienes acceso a esta sección.' });
  next();
});
// Nivel mínimo para siquiera VER este módulo (admin/consulta pasan igual que siempre;
// un usuario "estandar" necesita que el admin le haya dado permiso de consulta o edición).
router.use(requireModulo('inventario', 'consulta'));

/* ----------------------------- CATEGORÍAS FIJAS ----------------------------- */

// GET /api/admin/inventario/categorias -> las 4 categorías fijas, cada una con su(s)
// responsable(s) y sus ítems con la cantidad del evento actual (es_actual = TRUE).
router.get('/categorias', async (req, res) => {
  const eventoRes = await query('SELECT id FROM eventos WHERE es_actual = TRUE LIMIT 1');
  const eventoId = eventoRes.rows[0]?.id || null;

  const { rows: categorias } = await query(
    `SELECT id, nombre, orden FROM categorias_inventario WHERE tipo = 'fija' ORDER BY orden`
  );

  const resultado = [];
  for (const cat of categorias) {
    const responsablesRes = await query(
      `SELECT s.id, s.nombre_completo FROM responsables_categoria rc
       JOIN servidores s ON s.id = rc.servidor_id WHERE rc.categoria_id = $1`,
      [cat.id]
    );
    const itemsRes = await query(
      `SELECT i.id, i.nombre, i.tipo_medida, i.tipo_material, i.umbral_alerta,
              ie.cantidad_actual, ie.estado_actual
       FROM items_inventario i
       LEFT JOIN inventario_evento ie ON ie.item_id = i.id AND ie.evento_id = $2
       WHERE i.categoria_id = $1 AND i.conferencia_id IS NULL
       ORDER BY i.nombre`,
      [cat.id, eventoId]
    );
    resultado.push({ ...cat, responsables: responsablesRes.rows, items: itemsRes.rows });
  }

  res.json({ evento_id: eventoId, categorias: resultado });
});

// PUT /api/admin/inventario/categorias/:id/responsables  body: { servidor_ids: [1,2,...] }
router.put('/categorias/:id/responsables', requireModulo('inventario', 'edicion'), async (req, res) => {
  const { servidor_ids } = req.body || {};
  if (!Array.isArray(servidor_ids)) return res.status(400).json({ error: 'servidor_ids debe ser una lista.' });
  await query('DELETE FROM responsables_categoria WHERE categoria_id = $1', [req.params.id]);
  for (const sid of servidor_ids) {
    await query('INSERT INTO responsables_categoria (categoria_id, servidor_id) VALUES ($1,$2)', [req.params.id, sid]);
  }
  res.json({ mensaje: 'Responsables actualizados.' });
});

/* --------------------------------- ÍTEMS --------------------------------- */

// POST /api/admin/inventario/categorias/:id/items -> crear ítem en una categoría fija
router.post('/categorias/:id/items', requireModulo('inventario', 'edicion'), async (req, res) => {
  const { nombre, tipo_medida, tipo_material, umbral_alerta } = req.body || {};
  if (!nombre || !tipo_medida) return res.status(400).json({ error: 'Nombre y tipo de medida son obligatorios.' });
  if (!['porcentaje', 'unidades', 'estado'].includes(tipo_medida)) {
    return res.status(400).json({ error: 'Tipo de medida inválido.' });
  }
  const { rows } = await query(
    `INSERT INTO items_inventario (categoria_id, nombre, tipo_medida, tipo_material, umbral_alerta)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, nombre.trim(), tipo_medida, tipo_material || null, umbral_alerta || null]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/admin/inventario/items/:id -> editar nombre/tipo/umbral de un ítem (no la cantidad)
router.put('/items/:id', requireModulo('inventario', 'edicion'), async (req, res) => {
  const { nombre, tipo_medida, tipo_material, umbral_alerta } = req.body || {};
  const { rows } = await query(
    `UPDATE items_inventario SET nombre = COALESCE($1, nombre), tipo_medida = COALESCE($2, tipo_medida),
       tipo_material = $3, umbral_alerta = $4 WHERE id = $5 RETURNING *`,
    [nombre, tipo_medida, tipo_material || null, umbral_alerta || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Ítem no encontrado.' });
  res.json(rows[0]);
});

// DELETE /api/admin/inventario/items/:id
router.delete('/items/:id', requireModulo('inventario', 'edicion'), async (req, res) => {
  const { rows } = await query('SELECT nombre FROM items_inventario WHERE id = $1', [req.params.id]);
  if (rows[0]) await guardarItemInventarioEnPapelera(req.params.id, rows[0].nombre, req.user.id);
  const { rowCount } = await query('DELETE FROM items_inventario WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Ítem no encontrado.' });
  res.json({ mensaje: 'Ítem eliminado.' });
});

// PUT /api/admin/inventario/items/:id/cantidad  body: { cantidad_actual } o { estado_actual }
// Guarda la cantidad/estado para el evento actual y deja rastro en inventario_historial.
router.put('/items/:id/cantidad', async (req, res) => {
  const { cantidad_actual, estado_actual } = req.body || {};
  const eventoRes = await query('SELECT id FROM eventos WHERE es_actual = TRUE LIMIT 1');
  const evento = eventoRes.rows[0];
  if (!evento) return res.status(400).json({ error: 'No hay ningún evento marcado como actual.' });

  const anteriorRes = await query(
    'SELECT cantidad_actual, estado_actual FROM inventario_evento WHERE evento_id = $1 AND item_id = $2',
    [evento.id, req.params.id]
  );
  const anterior = anteriorRes.rows[0];

  await query(
    `INSERT INTO inventario_evento (evento_id, item_id, cantidad_actual, estado_actual, actualizado_en)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (evento_id, item_id) DO UPDATE SET
       cantidad_actual = EXCLUDED.cantidad_actual, estado_actual = EXCLUDED.estado_actual, actualizado_en = now()`,
    [evento.id, req.params.id, cantidad_actual ?? null, estado_actual || null]
  );

  await query(
    `INSERT INTO inventario_historial (item_id, evento_id, valor_anterior, valor_nuevo, cambiado_por)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      req.params.id, evento.id,
      anterior ? String(anterior.cantidad_actual ?? anterior.estado_actual ?? '') : null,
      String(cantidad_actual ?? estado_actual ?? ''),
      req.user.id
    ]
  );

  res.json({ mensaje: 'Actualizado.' });
});

/* --------------------------------- TALLERES --------------------------------- */

// GET /api/admin/inventario/talleres -> conferencias del NIVEL activo (es_actual = TRUE en
// eventos), todas juntas, cada una con su responsable y sus ítems.
router.get('/talleres', async (req, res) => {
  const eventoRes = await query('SELECT id, orden, nombre FROM eventos WHERE es_actual = TRUE LIMIT 1');
  const evento = eventoRes.rows[0];
  if (!evento) return res.json({ evento: null, conferencias: [] });

  const { rows: conferencias } = await query(
    `SELECT c.id, c.numero, c.nombre, c.responsable_id, s.nombre_completo AS responsable_nombre
     FROM conferencias c LEFT JOIN servidores s ON s.id = c.responsable_id
     WHERE c.evento_id = $1 ORDER BY c.numero`,
    [evento.id]
  );

  for (const conf of conferencias) {
    const itemsRes = await query(
      `SELECT i.id, i.nombre, i.tipo_medida, i.tipo_material, i.umbral_alerta,
              ie.cantidad_actual, ie.estado_actual
       FROM items_inventario i
       LEFT JOIN inventario_evento ie ON ie.item_id = i.id AND ie.evento_id = $2
       WHERE i.conferencia_id = $1 ORDER BY i.nombre`,
      [conf.id, evento.id]
    );
    conf.items = itemsRes.rows;
  }

  res.json({ evento, conferencias });
});

// PUT /api/admin/inventario/conferencias/:id/responsable  body: { servidor_id }
router.put('/conferencias/:id/responsable', requireModulo('inventario', 'edicion'), async (req, res) => {
  const { servidor_id } = req.body || {};
  const { rows } = await query(
    'UPDATE conferencias SET responsable_id = $1 WHERE id = $2 RETURNING *',
    [servidor_id || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Conferencia no encontrada.' });
  res.json({ mensaje: 'Responsable actualizado.' });
});

// POST /api/admin/inventario/conferencias/:id/items -> agregar ítem/material a un taller
router.post('/conferencias/:id/items', requireModulo('inventario', 'edicion'), async (req, res) => {
  const { nombre, tipo_medida, tipo_material, umbral_alerta } = req.body || {};
  if (!nombre || !tipo_medida) return res.status(400).json({ error: 'Nombre y tipo de medida son obligatorios.' });
  const tallerRes = await query("SELECT id FROM categorias_inventario WHERE tipo = 'taller' LIMIT 1");
  const { rows } = await query(
    `INSERT INTO items_inventario (categoria_id, conferencia_id, nombre, tipo_medida, tipo_material, umbral_alerta)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tallerRes.rows[0].id, req.params.id, nombre.trim(), tipo_medida, tipo_material || null, umbral_alerta || null]
  );
  res.status(201).json(rows[0]);
});

/* ------------------------------ PERMISOS ESPECIALES ------------------------------ */

// GET /api/admin/inventario/permisos -> quién tiene el permiso especial de cambiar nivel activo
router.get('/permisos', requireModulo('inventario', 'edicion'), async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.rol FROM permisos_especiales pe
     JOIN usuarios_admin u ON u.id = pe.usuario_admin_id
     WHERE pe.permiso = 'cambiar_nivel_activo_inventario'`
  );
  res.json(rows);
});

// POST /api/admin/inventario/permisos  body: { usuario_admin_id }
router.post('/permisos', requireModulo('inventario', 'edicion'), async (req, res) => {
  const { usuario_admin_id } = req.body || {};
  if (!usuario_admin_id) return res.status(400).json({ error: 'usuario_admin_id es obligatorio.' });
  await query(
    `INSERT INTO permisos_especiales (usuario_admin_id, permiso) VALUES ($1, 'cambiar_nivel_activo_inventario')
     ON CONFLICT DO NOTHING`,
    [usuario_admin_id]
  );
  res.status(201).json({ mensaje: 'Permiso otorgado.' });
});

// DELETE /api/admin/inventario/permisos/:usuarioAdminId
router.delete('/permisos/:usuarioAdminId', requireModulo('inventario', 'edicion'), async (req, res) => {
  await query(
    `DELETE FROM permisos_especiales WHERE usuario_admin_id = $1 AND permiso = 'cambiar_nivel_activo_inventario'`,
    [req.params.usuarioAdminId]
  );
  res.json({ mensaje: 'Permiso revocado.' });
});

/* ------------------------------ EXPORTACIÓN ------------------------------ */

const NIGHT = '#241A12';
const GOLD = '#C9932F';
const BANNER_BG = '#F1E6CC';
const PARCHMENT = '#FBF6EC';
const INK = '#2B2118';
const INK_SOFT = '#6B5F52';
const LINEA = '#D8CBAE';

function textoCantidad(item) {
  if (item.tipo_medida === 'estado') return item.estado_actual === 'listo' ? 'Listo' : 'Pendiente';
  if (item.tipo_medida === 'porcentaje') return `${item.cantidad_actual ?? 0}%`;
  return `${item.cantidad_actual ?? 0} unidades`;
}

// Recolecta TODO el inventario (categorías fijas + Talleres del nivel activo) en una sola
// estructura, para reutilizar tanto en Excel como en PDF.
async function recolectarInventarioCompleto() {
  const eventoRes = await query('SELECT id, orden, nombre FROM eventos WHERE es_actual = TRUE LIMIT 1');
  const evento = eventoRes.rows[0] || null;
  const eventoId = evento?.id || null;

  const { rows: categorias } = await query(
    `SELECT id, nombre, orden FROM categorias_inventario WHERE tipo = 'fija' ORDER BY orden`
  );
  for (const cat of categorias) {
    const responsablesRes = await query(
      `SELECT s.nombre_completo FROM responsables_categoria rc
       JOIN servidores s ON s.id = rc.servidor_id WHERE rc.categoria_id = $1`,
      [cat.id]
    );
    cat.responsables = responsablesRes.rows.map(r => r.nombre_completo);
    const itemsRes = await query(
      `SELECT i.nombre, i.tipo_medida, i.tipo_material, i.umbral_alerta, ie.cantidad_actual, ie.estado_actual
       FROM items_inventario i
       LEFT JOIN inventario_evento ie ON ie.item_id = i.id AND ie.evento_id = $2
       WHERE i.categoria_id = $1 AND i.conferencia_id IS NULL ORDER BY i.nombre`,
      [cat.id, eventoId]
    );
    cat.items = itemsRes.rows;
  }

  let conferencias = [];
  if (eventoId) {
    const confRes = await query(
      `SELECT c.id, c.numero, c.nombre, s.nombre_completo AS responsable_nombre
       FROM conferencias c LEFT JOIN servidores s ON s.id = c.responsable_id
       WHERE c.evento_id = $1 ORDER BY c.numero`,
      [eventoId]
    );
    conferencias = confRes.rows;
    for (const conf of conferencias) {
      const itemsRes = await query(
        `SELECT i.nombre, i.tipo_medida, i.tipo_material, i.umbral_alerta, ie.cantidad_actual, ie.estado_actual
         FROM items_inventario i
         LEFT JOIN inventario_evento ie ON ie.item_id = i.id AND ie.evento_id = $2
         WHERE i.conferencia_id = $1 ORDER BY i.nombre`,
        [conf.id, eventoId]
      );
      conf.items = itemsRes.rows;
    }
  }

  return { evento, categorias, conferencias };
}

// GET /api/admin/inventario/excel -> una hoja por categoría fija + una hoja "Talleres"
router.get('/excel', async (req, res) => {
  const { evento, categorias, conferencias } = await recolectarInventarioCompleto();
  const libro = xlsx.utils.book_new();

  for (const cat of categorias) {
    const filas = cat.items.map((it, i) => ({
      '#': i + 1,
      'Ítem': it.nombre,
      'Tipo de material': it.tipo_material || '',
      'Cantidad': textoCantidad(it),
      'Umbral de alerta': it.umbral_alerta ?? '',
      'Responsable(s)': cat.responsables.join(', ')
    }));
    const hoja = xlsx.utils.json_to_sheet(filas);
    xlsx.utils.book_append_sheet(libro, hoja, cat.nombre.slice(0, 31));
  }

  if (conferencias.length > 0) {
    const filasTalleres = [];
    for (const conf of conferencias) {
      if (conf.items.length === 0) {
        filasTalleres.push({ 'Conferencia': `${conf.numero}. ${conf.nombre}`, 'Responsable': conf.responsable_nombre || '', 'Ítem': '', 'Cantidad': '' });
      }
      for (const it of conf.items) {
        filasTalleres.push({
          'Conferencia': `${conf.numero}. ${conf.nombre}`,
          'Responsable': conf.responsable_nombre || '',
          'Ítem': it.nombre,
          'Cantidad': textoCantidad(it)
        });
      }
    }
    const hojaTalleres = xlsx.utils.json_to_sheet(filasTalleres);
    xlsx.utils.book_append_sheet(libro, hojaTalleres, `Talleres ${evento ? '- ' + evento.nombre : ''}`.slice(0, 31));
  }

  const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="inventario_sfl.xlsx"');
  res.send(buffer);
});

// GET /api/admin/inventario/pdf -> reporte con el mismo estilo marrón/dorado de la ficha del servidor
router.get('/pdf', async (req, res) => {
  const { evento, categorias, conferencias } = await recolectarInventarioCompleto();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="inventario_sfl.pdf"');

  const doc = new PDFDocument({ size: 'letter', margin: 40 });
  doc.pipe(res);

  const ANCHO = doc.page.width;
  const MARGEN = 40;

  function encabezado(titulo) {
    doc.rect(0, 0, ANCHO, 70).fill(NIGHT);
    doc.fillColor(GOLD).font('Times-Bold').fontSize(17).text('FIHNEC · Seminario para la Formación de Líderes', MARGEN, 20);
    doc.fillColor('#FBF6EC').font('Helvetica').fontSize(10.5).text(titulo, MARGEN, 44);
    doc.y = 90;
  }

  function tituloSeccion(texto) {
    if (doc.y > doc.page.height - 100) { doc.addPage(); doc.y = 40; }
    doc.moveDown(0.5);
    doc.rect(MARGEN, doc.y, ANCHO - MARGEN * 2, 22).fill(BANNER_BG);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(texto, MARGEN + 8, doc.y + 6);
    doc.moveDown(1.4);
  }

  encabezado(`Inventario general${evento ? ' · Nivel activo: ' + evento.nombre : ''}`);

  for (const cat of categorias) {
    tituloSeccion(`${cat.nombre}${cat.responsables.length ? '  ·  Responsable(s): ' + cat.responsables.join(', ') : ''}`);
    if (cat.items.length === 0) {
      doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9).text('Sin ítems registrados.', MARGEN + 8);
      doc.moveDown(0.6);
      continue;
    }
    for (const it of cat.items) {
      if (doc.y > doc.page.height - 50) { doc.addPage(); doc.y = 40; }
      doc.fillColor(INK).font('Helvetica').fontSize(9).text(it.nombre, MARGEN + 8, doc.y, { continued: true, width: 300 });
      doc.fillColor(GOLD).font('Helvetica-Bold').text(`  ${textoCantidad(it)}`, { continued: false });
      doc.moveTo(MARGEN, doc.y + 2).lineTo(ANCHO - MARGEN, doc.y + 2).strokeColor(LINEA).lineWidth(0.5).stroke();
      doc.moveDown(0.4);
    }
  }

  if (conferencias.length > 0) {
    doc.addPage();
    encabezado(`Talleres · ${evento.nombre}`);
    for (const conf of conferencias) {
      tituloSeccion(`${conf.numero}. ${conf.nombre}  ·  Responsable: ${conf.responsable_nombre || 'sin asignar'}`);
      if (conf.items.length === 0) {
        doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9).text('Sin materiales registrados.', MARGEN + 8);
        doc.moveDown(0.6);
        continue;
      }
      for (const it of conf.items) {
        if (doc.y > doc.page.height - 50) { doc.addPage(); doc.y = 40; }
        doc.fillColor(INK).font('Helvetica').fontSize(9).text(it.nombre, MARGEN + 8, doc.y, { continued: true, width: 300 });
        doc.fillColor(GOLD).font('Helvetica-Bold').text(`  ${textoCantidad(it)}`, { continued: false });
        doc.moveTo(MARGEN, doc.y + 2).lineTo(ANCHO - MARGEN, doc.y + 2).strokeColor(LINEA).lineWidth(0.5).stroke();
        doc.moveDown(0.4);
      }
    }
  }

  doc.end();
});

export default router;
