import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();

// GET /api/cocina/resumen -> lo único que ve el usuario "cocina": el evento activo,
// cuántos participantes y cuántos servidores van a asistir.
router.get('/resumen', requireAuth, requireRole('cocina', 'admin'), async (req, res) => {
  const eventoRes = await query('SELECT * FROM eventos WHERE es_actual = TRUE LIMIT 1');
  const evento = eventoRes.rows[0] || null;

  let participantes = 0;
  if (evento) {
    const r = await query(
      'SELECT COUNT(*)::int AS total FROM inscripciones WHERE evento_id = $1 AND ciclo = $2',
      [evento.id, evento.ciclo_actual]
    );
    participantes = r.rows[0].total;
  }

  const servidoresRes = await query('SELECT COUNT(*)::int AS total FROM servidores WHERE participara_evento = TRUE');
  const servidores = servidoresRes.rows[0].total;

  res.json({
    evento_actual: evento ? { orden: evento.orden, nombre: evento.nombre } : null,
    participantes,
    servidores,
    total: participantes + servidores
  });
});

export default router;
