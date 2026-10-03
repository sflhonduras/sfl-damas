import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken, signTokenTemporal, requireAuth, requireTokenPaso } from '../auth.js';
import { registrarLogin } from '../auditoria.js';
import { generarSecreto, generarQR, verificarCodigo, generarTokenDispositivo, hashTokenDispositivo, DIAS_DISPOSITIVO_CONFIABLE } from '../twoFactor.js';

const router = Router();

// Solo el Super Administrador tiene 2FA obligatorio de forma fija en el código (no se puede
// desactivar desde el panel). Para cualquier otro rol, lo decide el Super Administrador
// persona por persona, con la columna requiere_2fa — así un Estándar o Consulta con acceso
// de edición también puede quedar protegido, sin tener que dárselo a todo su rol.
function requiere2FA(user) {
  return user.rol === 'super_admin' || user.requiere_2fa === true;
}

// Cada 90 días se le pregunta a todos (menos al Super Administrador) si quieren cambiar su
// contraseña — es una sugerencia, no obligatoria: puede decir "Más tarde" y se pospone otros
// 90 días desde ese momento, sin que haya cambiado nada de verdad.
const DIAS_ENTRE_RECORDATORIOS = 90;
function debePreguntarCambioClave(user) {
  if (user.rol === 'super_admin') return false;
  const base = user.password_cambio_pospuesto_en || user.password_actualizada_en;
  if (!base) return false;
  const diasTranscurridos = (Date.now() - new Date(base).getTime()) / (1000 * 60 * 60 * 24);
  return diasTranscurridos >= DIAS_ENTRE_RECORDATORIOS;
}

// Una vez que ya se resolvió (o se saltó) la pregunta de cambio de contraseña, sigue el
// flujo normal de siempre: dispositivo confiable (se salta el código), 2FA si aplica, o
// sesión completa. Se comparte entre el login normal y los dos endpoints nuevos (posponer /
// cambiar), para no duplicar esta lógica.
async function continuarLogin(user, req, res) {
  if (!requiere2FA(user)) {
    const token = signToken(user);
    await registrarLogin(user.id);
    return res.json({ token, usuario: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, two_factor_enabled: !!user.two_factor_enabled } });
  }
  if (!user.two_factor_enabled) {
    const tokenTemporal = signTokenTemporal(user, 'requiere_configurar_2fa');
    return res.json({ requiere_configurar_2fa: true, token: tokenTemporal, usuario: { nombre: user.nombre, email: user.email } });
  }

  // "Recordar este dispositivo": si el navegador ya mandó un token válido y sin vencer
  // para este mismo usuario, nos saltamos el código de 2FA — la contraseña se sigue
  // pidiendo siempre, solo se salta este paso. Se renueva la vigencia otros N días cada
  // vez que se usa.
  const tokenDispositivo = req.body?.dispositivo_token;
  if (tokenDispositivo) {
    const hash = hashTokenDispositivo(tokenDispositivo);
    const { rows: dispositivo } = await query(
      `UPDATE dispositivos_confiables SET expira_en = now() + ($3 * interval '1 day')
       WHERE usuario_admin_id = $1 AND token_hash = $2 AND expira_en > now() RETURNING id`,
      [user.id, hash, DIAS_DISPOSITIVO_CONFIABLE]
    );
    if (dispositivo[0]) {
      const token = signToken(user);
      await registrarLogin(user.id);
      return res.json({ token, usuario: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, two_factor_enabled: true } });
    }
  }

  const tokenTemporal = signTokenTemporal(user, 'requiere_codigo_2fa');
  res.json({ requiere_codigo_2fa: true, token: tokenTemporal, usuario: { nombre: user.nombre, email: user.email } });
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });

  const { rows } = await query('SELECT * FROM usuarios_admin WHERE email = $1 AND activo = TRUE', [email.toLowerCase().trim()]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas.' });

  // Justo después de validar la contraseña, antes de pedir 2FA: si ya pasaron 90 días desde
  // la última vez que cambió su clave (o que pospuso la pregunta), se le pregunta ahora.
  if (debePreguntarCambioClave(user)) {
    const tokenTemporal = signTokenTemporal(user, 'requiere_cambio_clave');
    return res.json({ requiere_cambio_clave: true, token: tokenTemporal, usuario: { nombre: user.nombre, email: user.email } });
  }

  await continuarLogin(user, req, res);
});

// POST /api/auth/posponer-cambio-clave -> el usuario eligió "Más tarde". Se pospone otros
// 90 días desde ahora y sigue el login normal (2FA si aplica).
router.post('/posponer-cambio-clave', requireTokenPaso('requiere_cambio_clave'), async (req, res) => {
  const { rows } = await query(
    'UPDATE usuarios_admin SET password_cambio_pospuesto_en = now() WHERE id = $1 RETURNING *',
    [req.user.id]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  await continuarLogin(user, req, res);
});

// POST /api/auth/cambiar-clave-login  body: { clave_nueva } -> el usuario decidió cambiarla
// aquí mismo, en el momento del login. Guarda la nueva clave y sigue el login normal.
router.post('/cambiar-clave-login', requireTokenPaso('requiere_cambio_clave'), async (req, res) => {
  const claveNueva = String(req.body?.clave_nueva || '');
  if (claveNueva.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });

  const hash = await bcrypt.hash(claveNueva, 10);
  const { rows } = await query(
    'UPDATE usuarios_admin SET password_hash = $1, password_actualizada_en = now(), password_cambio_pospuesto_en = NULL WHERE id = $2 RETURNING *',
    [hash, req.user.id]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  await continuarLogin(user, req, res);
});

// GET /api/auth/2fa/qr -> genera (o reutiliza) el secreto y devuelve el QR para escanear.
router.get('/2fa/qr', requireTokenPaso('requiere_configurar_2fa'), async (req, res) => {
  const { rows } = await query('SELECT email, two_factor_secret FROM usuarios_admin WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

  let secreto = user.two_factor_secret;
  if (!secreto) {
    secreto = generarSecreto();
    await query('UPDATE usuarios_admin SET two_factor_secret = $1 WHERE id = $2', [secreto, req.user.id]);
  }
  const qr = await generarQR(user.email, secreto);
  res.json({ qr });
});

// POST /api/auth/2fa/confirmar-setup  body: { codigo } -> valida el primer código y activa
// 2FA de forma definitiva. De aquí en adelante, esta cuenta SIEMPRE va a pedir el código.
router.post('/2fa/confirmar-setup', requireTokenPaso('requiere_configurar_2fa'), async (req, res) => {
  const { rows } = await query('SELECT * FROM usuarios_admin WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user?.two_factor_secret) return res.status(400).json({ error: 'Primero solicita el código QR.' });
  if (!(await verificarCodigo(req.body?.codigo, user.two_factor_secret))) {
    return res.status(401).json({ error: 'Código incorrecto. Revisa la hora de tu celular e intenta de nuevo.' });
  }
  await query('UPDATE usuarios_admin SET two_factor_enabled = TRUE WHERE id = $1', [user.id]);
  const token = signToken(user);
  await registrarLogin(user.id);

  const tokenDispositivo = generarTokenDispositivo();
  await query(
    `INSERT INTO dispositivos_confiables (usuario_admin_id, token_hash, expira_en)
     VALUES ($1, $2, now() + ($3 * interval '1 day'))`,
    [user.id, hashTokenDispositivo(tokenDispositivo), DIAS_DISPOSITIVO_CONFIABLE]
  );

  res.json({ token, dispositivo_token: tokenDispositivo, usuario: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, two_factor_enabled: true } });
});

// POST /api/auth/2fa/verificar  body: { codigo } -> el paso normal en cada login posterior,
// una vez que 2FA ya está activado.
router.post('/2fa/verificar', requireTokenPaso('requiere_codigo_2fa'), async (req, res) => {
  const { rows } = await query('SELECT * FROM usuarios_admin WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user?.two_factor_secret) return res.status(400).json({ error: 'Este usuario no tiene 2FA configurado.' });
  if (!(await verificarCodigo(req.body?.codigo, user.two_factor_secret))) {
    return res.status(401).json({ error: 'Código incorrecto.' });
  }
  const token = signToken(user);
  await registrarLogin(user.id);

  const tokenDispositivo = generarTokenDispositivo();
  await query(
    `INSERT INTO dispositivos_confiables (usuario_admin_id, token_hash, expira_en)
     VALUES ($1, $2, now() + ($3 * interval '1 day'))`,
    [user.id, hashTokenDispositivo(tokenDispositivo), DIAS_DISPOSITIVO_CONFIABLE]
  );

  res.json({ token, dispositivo_token: tokenDispositivo, usuario: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, two_factor_enabled: true } });
});

// DELETE /api/auth/2fa/dispositivos -> "Olvidar todos los dispositivos confiables" — borra
// todos los que tenga guardados ESTE usuario (el de la sesión ya iniciada). Desde ese
// momento, cualquier navegador (incluido el que se está usando ahora mismo) va a volver a
// pedir el código 2FA en el siguiente login.
router.delete('/2fa/dispositivos', requireAuth, async (req, res) => {
  await query('DELETE FROM dispositivos_confiables WHERE usuario_admin_id = $1', [req.user.id]);
  res.json({ mensaje: 'Se olvidaron todos los dispositivos confiables. La próxima vez que se inicie sesión, se pedirá el código 2FA de nuevo, en cualquier navegador.' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ usuario: req.user });
});

export default router;
