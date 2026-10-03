import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireModulo } from '../auth.js';
import { guardarEnPapelera } from '../papelera.js';

const router = Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user.rol === 'cocina') return res.status(403).json({ error: 'No tienes acceso a esta sección.' });
  next();
});
router.use(requireModulo('medallas', 'consulta'));

const TIPOS_VALIDOS = ['Bronce', 'Plata', 'Oro', 'Platino', 'Vuelta Completa'];

// GET /api/admin/medallas-manuales -> lista completa, con nombre del participante
router.get('/', async (req, res) => {
  const { rows } = await query(`
    SELECT mm.id, mm.participante_id, p.nombre_completo, p.dni, mm.tipo, mm.cantidad, mm.nota,
           mm.otorgada_en, u.nombre AS otorgada_por_nombre
    FROM medallas_manuales mm
    JOIN participantes p ON p.id = mm.participante_id
    LEFT JOIN usuarios_admin u ON u.id = mm.otorgada_por
    ORDER BY mm.otorgada_en DESC
  `);
  res.json(rows);
});

// POST /api/admin/medallas-manuales  body: { participante_id, tipo, cantidad, nota }
router.post('/', requireModulo('medallas', 'edicion'), async (req, res) => {
  const { participante_id, tipo, cantidad, nota } = req.body || {};
  if (!participante_id || !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: 'participante_id y un tipo de medalla válido son obligatorios.' });
  }
  const cantidadFinal = parseInt(cantidad, 10) || 1;
  const { rows } = await query(
    `INSERT INTO medallas_manuales (participante_id, tipo, cantidad, nota, otorgada_por)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [participante_id, tipo, cantidadFinal, nota || null, req.user.id]
  );
  res.status(201).json({ id: rows[0].id, mensaje: 'Medalla otorgada.' });
});

// DELETE /api/admin/medallas-manuales/:id
router.delete('/:id', requireModulo('medallas', 'edicion'), async (req, res) => {
  const { rows } = await query(
    `SELECT p.nombre_completo, mm.tipo FROM medallas_manuales mm
     JOIN participantes p ON p.id = mm.participante_id WHERE mm.id = $1`, [req.params.id]);
  if (rows[0]) await guardarEnPapelera('medallas_manuales', req.params.id, `${rows[0].nombre_completo} · ${rows[0].tipo}`, req.user.id);
  const { rowCount } = await query('DELETE FROM medallas_manuales WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'No encontrada.' });
  res.json({ mensaje: 'Medalla eliminada.' });
});

export default router;
