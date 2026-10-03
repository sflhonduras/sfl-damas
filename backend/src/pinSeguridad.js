import { query } from './db.js';

// Reglas iguales para Participantes y Servidores: 3 intentos fallidos bloquean el acceso
// por 30 minutos, y todos deben cambiar su PIN la primera vez que entren (esto último
// aplica también a los PIN que ya existían antes de este cambio, no solo a los nuevos).
const MAX_INTENTOS = 3;
const MINUTOS_BLOQUEO = 30;

// tabla: 'participantes' | 'servidores'
export async function verificarPin(tabla, dni, pin) {
  const dniLimpio = String(dni || '').trim();
  const pinLimpio = String(pin || '').trim();
  if (!dniLimpio || !pinLimpio) return { ok: false, error: 'Debes indicar tu número de identidad y tu PIN.' };

  const { rows } = await query(`SELECT * FROM ${tabla} WHERE dni = $1`, [dniLimpio]);
  const registro = rows[0];
  if (!registro) return { ok: false, error: 'Número de identidad o PIN incorrectos.' };

  if (registro.bloqueado_hasta && new Date(registro.bloqueado_hasta) > new Date()) {
    const minutosRestantes = Math.max(1, Math.ceil((new Date(registro.bloqueado_hasta) - new Date()) / 60000));
    return { ok: false, error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutosRestantes} minuto(s).`, bloqueado: true };
  }

  if (!registro.pin || registro.pin !== pinLimpio) {
    const intentos = (registro.intentos_fallidos_pin || 0) + 1;
    if (intentos >= MAX_INTENTOS) {
      await query(
        `UPDATE ${tabla} SET intentos_fallidos_pin = 0, bloqueado_hasta = now() + interval '${MINUTOS_BLOQUEO} minutes' WHERE id = $1`,
        [registro.id]
      );
      return { ok: false, error: `Demasiados intentos fallidos. Tu acceso quedó bloqueado por ${MINUTOS_BLOQUEO} minutos.`, bloqueado: true };
    }
    await query(`UPDATE ${tabla} SET intentos_fallidos_pin = $1 WHERE id = $2`, [intentos, registro.id]);
    return { ok: false, error: 'Número de identidad o PIN incorrectos.' };
  }

  // Acceso correcto: limpia cualquier rastro de intentos fallidos previos.
  if (registro.intentos_fallidos_pin || registro.bloqueado_hasta) {
    await query(`UPDATE ${tabla} SET intentos_fallidos_pin = 0, bloqueado_hasta = NULL WHERE id = $1`, [registro.id]);
  }
  return { ok: true, registro };
}

// Cambia el PIN y apaga la bandera de "debe cambiarlo" — se usa tanto la primera vez
// obligatoria como cualquier cambio voluntario posterior.
export async function cambiarPin(tabla, id, pinNuevo) {
  await query(`UPDATE ${tabla} SET pin = $1, debe_cambiar_pin = FALSE WHERE id = $2`, [pinNuevo, id]);
}

// Genera un PIN nuevo de 4 dígitos y marca que la persona debe personalizarlo en su
// próximo ingreso — se usa cuando un administrador regenera el PIN de alguien.
export async function regenerarPin(tabla, id) {
  const pinNuevo = String(Math.floor(1000 + Math.random() * 9000));
  await query(`UPDATE ${tabla} SET pin = $1, debe_cambiar_pin = TRUE, intentos_fallidos_pin = 0, bloqueado_hasta = NULL WHERE id = $2`, [pinNuevo, id]);
  return pinNuevo;
}
