import { query } from './db.js';

// Campos que NUNCA se guardan en el resumen de auditoría, aunque vengan en el body de la
// petición (contraseñas, tokens, etc.) — por seguridad, ni siquiera enmascarados.
const CAMPOS_SENSIBLES = ['password', 'password_hash', 'token', 'pin'];

function resumirBody(body) {
  if (!body || typeof body !== 'object') return '';
  const partes = [];
  for (const [clave, valor] of Object.entries(body)) {
    if (CAMPOS_SENSIBLES.includes(clave)) continue;
    if (valor === undefined || valor === null || valor === '') continue;
    const texto = Array.isArray(valor) ? `[${valor.length} elemento(s)]` : String(valor);
    partes.push(`${clave}=${texto.slice(0, 60)}`);
  }
  return partes.slice(0, 6).join(', ');
}

const ETIQUETA_METODO = { POST: 'Creó', PUT: 'Editó', DELETE: 'Eliminó' };

export function resumirAccion(req) {
  const accion = ETIQUETA_METODO[req.method] || req.method;
  const detalle = resumirBody(req.body);
  return detalle ? `${accion} · ${detalle}` : accion;
}

// Si la ruta trae "/participantes/<id>/...", busca el nombre de esa persona para que
// Auditoría lo muestre directo — así ya no hay que ir a Neon a traducir el ID a un nombre
// cada vez. Si no encuentra nada (ID inválido, participante borrado, etc.) simplemente no
// agrega nada, sin romper el registro de auditoría por eso.
async function nombreDesdeRuta(ruta) {
  const coincide = ruta.match(/\/participantes\/(\d+)/);
  if (!coincide) return null;
  try {
    const { rows } = await query('SELECT nombre_completo, dni FROM participantes WHERE id = $1', [coincide[1]]);
    if (!rows[0]) return null;
    return rows[0].dni ? `${rows[0].nombre_completo} (${rows[0].dni})` : rows[0].nombre_completo;
  } catch {
    return null;
  }
}

// Middleware global: registra cualquier POST/PUT/DELETE exitoso dentro de /api/admin.
// Se engancha a res.on('finish') para leer req.user (lo llena requireAuth más abajo en la
// cadena) y el código de estado real de la respuesta, sin bloquear ni retrasar la petición
// (el guardado en sí sigue pasando después de que la respuesta ya se le mandó al usuario).
export function auditoriaMiddleware(req, res, next) {
  if (req.path.startsWith('/api/admin') && req.method !== 'GET' && !req.path.startsWith('/api/admin/auditoria')) {
    res.on('finish', async () => {
      if (res.statusCode >= 400 || !req.user) return;
      const nombre = await nombreDesdeRuta(req.originalUrl);
      const resumen = nombre ? `${resumirAccion(req)} — ${nombre}` : resumirAccion(req);
      query(
        `INSERT INTO auditoria (usuario_admin_id, tipo, metodo, ruta, resumen) VALUES ($1,'accion',$2,$3,$4)`,
        [req.user.id, req.method, req.originalUrl, resumen]
      ).catch(e => console.error('No se pudo registrar auditoría:', e));
    });
  }
  next();
}

export async function registrarLogin(usuarioId) {
  try {
    await query(`INSERT INTO auditoria (usuario_admin_id, tipo, resumen) VALUES ($1,'login','Inicio de sesión')`, [usuarioId]);
  } catch (e) {
    console.error('No se pudo registrar el inicio de sesión en auditoría:', e);
  }
}
