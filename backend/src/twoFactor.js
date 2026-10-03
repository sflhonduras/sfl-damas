// Lógica de doble autenticación (2FA) con apps tipo Google Authenticator / Authy.
// Usa el estándar TOTP (código de 6 dígitos que cambia cada 30 segundos) — gratis, sin
// depender de ningún servicio externo de pago (a diferencia de SMS o WhatsApp).
//
// Nota: usa la API actual de otplib v13 (generateSecret / verify / generateURI como
// funciones sueltas) — versiones anteriores usaban un objeto "authenticator" que ya no existe.
import { generateSecret, verify, generateURI } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';

// Cuántos días dura un dispositivo marcado como "confiable" antes de volver a pedir el
// código 2FA — se renueva cada vez que se usa, así que solo expira por inactividad real.
export const DIAS_DISPOSITIVO_CONFIABLE = 7;

// Token de dispositivo: un valor aleatorio largo, sin relación con la contraseña ni el
// secreto de 2FA — se guarda en el navegador (localStorage) y se manda junto con el login.
export function generarTokenDispositivo() {
  return crypto.randomBytes(32).toString('hex');
}

// Se guarda solo el hash en la base de datos (igual que una contraseña) — si algún día se
// filtrara la base de datos, el token guardado no sirve para nada por sí solo.
export function hashTokenDispositivo(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Genera un secreto nuevo y único para un usuario — se guarda una sola vez en la base de
// datos, la primera vez que activa 2FA.
export function generarSecreto() {
  return generateSecret();
}

// Genera la imagen QR (como data URL, lista para meter en un <img src="...">) que la app
// autenticadora escanea para vincularse con la cuenta.
export async function generarQR(email, secreto) {
  const otpauth = generateURI({ issuer: 'SFL FIHNEC', label: email, secret: secreto });
  return QRCode.toDataURL(otpauth);
}

// Verifica que el código de 6 dígitos que escribió la persona sea válido para ese secreto,
// en este momento. (verify() de otplib v13 es asíncrona, por eso esta función también lo es.)
export async function verificarCodigo(codigo, secreto) {
  try {
    const resultado = await verify({ secret: secreto, token: String(codigo || '').trim() });
    return resultado.valid;
  } catch {
    return false;
  }
}
