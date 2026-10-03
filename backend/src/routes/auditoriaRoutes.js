import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireSuperAdmin } from '../auth.js';

const router = Router();
router.use(requireAuth);
router.use(requireSuperAdmin); // solo super_admin puede ver la auditoría

// GET /api/admin/auditoria?usuario=&desde=&hasta=&pagina=&limite=
router.get('/', async (req, res) => {
  const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
  const limite = Math.min(parseInt(req.query.limite, 10) || 50, 200);
  const offset = (pagina - 1) * limite;

  const params = [];
  const condiciones = [];
  if (req.query.usuario) { params.push(req.query.usuario); condiciones.push(`a.usuario_admin_id = $${params.length}`); }
  if (req.query.desde) { params.push(req.query.desde); condiciones.push(`a.creado_en >= $${params.length}`); }
  if (req.query.hasta) { params.push(`${req.query.hasta} 23:59:59`); condiciones.push(`a.creado_en <= $${params.length}`); }
  if (req.query.tipo && ['login', 'accion'].includes(req.query.tipo)) {
    params.push(req.query.tipo); condiciones.push(`a.tipo = $${params.length}`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const [totalRes, dataRes] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM auditoria a ${where}`, params),
    query(
      `SELECT a.id, a.tipo, a.metodo, a.ruta, a.resumen, a.creado_en, u.nombre AS usuario_nombre, u.email AS usuario_email
       FROM auditoria a LEFT JOIN usuarios_admin u ON u.id = a.usuario_admin_id
       ${where} ORDER BY a.creado_en DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limite, offset]
    )
  ]);

  res.json({ total: totalRes.rows[0].total, pagina, limite, datos: dataRes.rows });
});

// GET /api/admin/auditoria/usuarios -> lista simple para el filtro por usuario
router.get('/usuarios', async (req, res) => {
  const { rows } = await query('SELECT id, nombre, email FROM usuarios_admin ORDER BY nombre');
  res.json(rows);
});

export default router;
