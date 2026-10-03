import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin')); // no restringido solo a super_admin, a diferencia de Mantenimiento

const CATEGORIAS_VALIDAS = ['general', 'cumpleanos'];

// GET /api/admin/mensajes-biblicos -> lista completa, ambas categorías, para la pantalla de gestión
router.get('/', async (req, res) => {
  const { rows } = await query('SELECT * FROM mensajes_biblicos ORDER BY categoria, id');
  res.json(rows);
});

// POST /api/admin/mensajes-biblicos  body: { texto, referencia, categoria }
router.post('/', async (req, res) => {
  const { texto, referencia, categoria } = req.body || {};
  if (!texto?.trim() || !referencia?.trim()) return res.status(400).json({ error: 'Falta el texto o la referencia.' });
  if (!CATEGORIAS_VALIDAS.includes(categoria)) return res.status(400).json({ error: 'Categoría inválida.' });

  const { rows } = await query(
    'INSERT INTO mensajes_biblicos (texto, referencia, categoria) VALUES ($1,$2,$3) RETURNING *',
    [texto.trim(), referencia.trim(), categoria]
  );
  res.json(rows[0]);
});

// PUT /api/admin/mensajes-biblicos/:id  body: { texto?, referencia?, categoria?, activo? }
router.put('/:id', async (req, res) => {
  const { texto, referencia, categoria, activo } = req.body || {};
  const cols = [];
  const valores = [];

  if (texto !== undefined) { cols.push(`texto = $${cols.length + 1}`); valores.push(texto.trim()); }
  if (referencia !== undefined) { cols.push(`referencia = $${cols.length + 1}`); valores.push(referencia.trim()); }
  if (categoria !== undefined) {
    if (!CATEGORIAS_VALIDAS.includes(categoria)) return res.status(400).json({ error: 'Categoría inválida.' });
    cols.push(`categoria = $${cols.length + 1}`); valores.push(categoria);
  }
  if (activo !== undefined) { cols.push(`activo = $${cols.length + 1}`); valores.push(!!activo); }
  if (cols.length === 0) return res.status(400).json({ error: 'Nada para actualizar.' });

  valores.push(req.params.id);
  const { rows } = await query(`UPDATE mensajes_biblicos SET ${cols.join(', ')} WHERE id = $${valores.length} RETURNING *`, valores);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado.' });
  res.json(rows[0]);
});

// DELETE /api/admin/mensajes-biblicos/:id -> borrado real (no papelera; es contenido de
// bajo riesgo, y ya existe "activo" para desactivar sin borrar si prefieren eso)
router.delete('/:id', async (req, res) => {
  const { rows } = await query('DELETE FROM mensajes_biblicos WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado.' });
  res.json({ mensaje: 'Eliminado.' });
});

export default router;
