import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();
import { query } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// Los tokens normales llevan paso:'completo'. Los tokens temporales del flujo de 2FA (5
// minutos de vida) llevan un paso distinto y SOLO sirven para las rutas de /auth/2fa/*,
// nunca para el resto del panel — así, aunque alguien intercepte uno, no puede usarlo para
// nada más que terminar de iniciar sesión.
export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre, paso: 'completo' },
    SECRET,
    { expiresIn: '12h' }
  );
}

export function signTokenTemporal(user, paso) {
  return jwt.sign(
    { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre, paso },
    SECRET,
    { expiresIn: '5m' }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado. Falta token.' });
  try {
    const payload = jwt.verify(token, SECRET);
    // Tokens temporales de 2FA (paso distinto de 'completo') nunca pasan aquí. Un token
    // viejo sin el campo 'paso' (emitido antes de este cambio) se trata como completo, para
    // no cerrarle la sesión a nadie que ya estaba conectado el día del despliegue.
    if (payload.paso && payload.paso !== 'completo') {
      return res.status(401).json({ error: 'Sesión inválida o expirada.' });
    }
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
}

// Exige específicamente un token temporal del paso indicado ('requiere_configurar_2fa' o
// 'requiere_codigo_2fa') — lo usan solo las rutas de /auth/2fa/*.
export function requireTokenPaso(pasoEsperado) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No autorizado. Falta token.' });
    try {
      const payload = jwt.verify(token, SECRET);
      if (payload.paso !== pasoEsperado) {
        return res.status(403).json({ error: 'Token no válido para este paso. Vuelve a iniciar sesión.' });
      }
      req.user = payload;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' });
    }
  };
}

// Se mantiene por compatibilidad con rutas que todavía la usan tal cual.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autorizado.' });
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
    next();
  };
}

// Solo el Super Administrador puede tocar Usuarios, Auditoría y Mantenimiento — ni siquiera
// un Administrador con todos los permisos configurados llega aquí.
export function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autorizado.' });
  if (req.user.rol !== 'super_admin') {
    return res.status(403).json({ error: 'Solo el Super Administrador puede hacer esto.' });
  }
  next();
}

// A partir de ahora, TODOS los roles (excepto Super Administrador, que siempre tiene acceso
// total, y Cocina, que tiene su propia pantalla dedicada aparte) usan el mismo sistema:
// permisos configurables módulo por módulo, guardados en la tabla permisos_modulo. Ya no hay
// paquetes fijos cableados en el código — el Super Administrador asigna libremente qué ve o
// edita cada persona, sin importar qué rol tenga.
//
// Comportamiento por rol:
//   - 'super_admin' -> siempre pasa, sin excepción, en cualquier módulo.
//   - 'cocina'      -> bloqueado aquí, tiene su propia pantalla aparte (no usa módulos).
//   - cualquier otro rol ('admin', 'consulta', 'estandar', 'registro', o futuros roles)
//                    -> se revisa su fila en permisos_modulo para ese módulo específico.
export function requireModulo(modulo, nivelMinimo = 'consulta') {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autorizado.' });
    const rol = req.user.rol;

    if (rol === 'super_admin') return next();
    if (rol === 'cocina') return res.status(403).json({ error: 'No tienes acceso a esta sección.' });

    try {
      const { rows } = await query(
        'SELECT nivel FROM permisos_modulo WHERE usuario_admin_id = $1 AND modulo = $2',
        [req.user.id, modulo]
      );
      const permiso = rows[0];
      if (!permiso) return res.status(403).json({ error: 'No tienes permiso para acceder a esta sección.' });
      if (nivelMinimo === 'edicion' && permiso.nivel !== 'edicion') {
        return res.status(403).json({ error: 'Solo tienes acceso de consulta a esta sección, no puedes editar.' });
      }
      return next();
    } catch (e) {
      console.error('Error verificando permisos de módulo:', e);
      return res.status(500).json({ error: 'Error interno verificando permisos.' });
    }
  };
}

// Permiso especial y muy puntual: el checkbox "Registrado" (asistencia presencial) en
// Participantes. Se controla con su propio módulo dinámico "participantes_presencial" —
// el Super Administrador se lo puede dar a cualquiera sin necesidad de darle edición
// completa sobre el resto de los datos del participante.
export function requireEditarPresencial(req, res, next) {
  return requireModulo('participantes_presencial', 'edicion')(req, res, next);
}
