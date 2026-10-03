// Restaurar desde un respaldo — la operación más delicada del sistema, así que tiene varias
// capas de protección:
//   1. Siempre hay que "simular" primero (nunca toca la base de datos, solo cuenta qué pasaría).
//   2. Un PIN de seguridad aparte de la contraseña normal (se configura en Render, nunca se
//      guarda en la base de datos — así ni siquiera alguien con acceso a Neon lo puede ver).
//   3. Todo corre dentro de una transacción: si algo falla a la mitad, se deshace TODO, nunca
//      se queda a medias.
//   4. El modo "aditivo" (por defecto) nunca borra nada — solo rellena lo que falte.
import { pool } from './db.js';

// Orden de las tablas — de padres a hijos, para insertar sin violar llaves foráneas.
// Para borrar (modo reemplazo) se recorre al revés.
const ORDEN_TABLAS = ['eventos', 'servidores', 'participantes', 'participantes_excepcion', 'inscripciones', 'inscripciones_historial', 'medallas_manuales', 'configuracion'];

// La mayoría de tablas usan "id" como identificador único, pero "configuracion" es una tabla
// tipo llave-valor que usa "clave" en su lugar.
const CLAVE_POR_TABLA = { configuracion: 'clave' };
const claveDe = (tabla) => CLAVE_POR_TABLA[tabla] || 'id';

// usuarios_admin NUNCA se toca desde aquí — el respaldo no incluye la contraseña (a propósito,
// por seguridad), así que restaurarla dejaría a todo el mundo sin poder entrar. Los usuarios
// se manejan siempre desde la pantalla de Usuarios, nunca desde un respaldo.

function validarPin(pinRecibido) {
  const pinReal = process.env.RESTAURAR_PIN;
  if (!pinReal) return { ok: false, error: 'No hay un PIN de restauración configurado en el servidor. Pide que se configure la variable RESTAURAR_PIN antes de usar esta función.' };
  if (!pinRecibido || String(pinRecibido) !== String(pinReal)) return { ok: false, error: 'PIN de seguridad incorrecto.' };
  return { ok: true };
}

// POST /api/admin/mantenimiento/respaldo/simular  body: { datos }
// Compara el archivo subido contra lo que hay ahora mismo en la base de datos, SIN TOCAR NADA.
export async function simularRestauracion(req, res) {
  const datos = req.body?.datos;
  if (!datos || typeof datos !== 'object') return res.status(400).json({ error: 'Archivo de respaldo inválido.' });

  const resultado = [];
  for (const tabla of ORDEN_TABLAS) {
    const col = claveDe(tabla);
    const filasArchivo = Array.isArray(datos[tabla]) ? datos[tabla] : [];
    const idsArchivo = new Set(filasArchivo.map(f => f[col]));

    const { rows: actuales } = await pool.query(`SELECT ${col} FROM ${tabla}`);
    const idsActuales = new Set(actuales.map(r => r[col]));

    const nuevos = filasArchivo.filter(f => !idsActuales.has(f[col])).length;
    const yaExisten = filasArchivo.length - nuevos;
    const sePerderianSiReemplazo = actuales.filter(r => !idsArchivo.has(r[col])).length;

    resultado.push({ tabla, en_archivo: filasArchivo.length, en_bd_actual: actuales.length, nuevos, ya_existen: yaExisten, se_perderian_si_reemplazo: sePerderianSiReemplazo });
  }
  res.json({ tablas: resultado });
}

// POST /api/admin/mantenimiento/respaldo/aplicar  body: { datos, modo: 'aditivo'|'reemplazo', pin }
export async function aplicarRestauracion(req, res) {
  const { datos, modo, pin } = req.body || {};
  if (!datos || typeof datos !== 'object') return res.status(400).json({ error: 'Archivo de respaldo inválido.' });
  if (!['aditivo', 'reemplazo'].includes(modo)) return res.status(400).json({ error: 'Modo inválido.' });

  const pinCheck = validarPin(pin);
  if (!pinCheck.ok) return res.status(401).json({ error: pinCheck.error });

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    if (modo === 'reemplazo') {
      // Se borra de hijos a padres, para no violar llaves foráneas.
      for (const tabla of [...ORDEN_TABLAS].reverse()) {
        await cliente.query(`DELETE FROM ${tabla}`);
      }
    }

    // Se inserta de padres a hijos — TODAS las filas de cada tabla en UNA sola consulta
    // (jsonb_populate_recordset procesa el lote completo de una vez), en vez de una consulta
    // por fila. Con miles de registros, esto es la diferencia entre segundos y minutos.
    for (const tabla of ORDEN_TABLAS) {
      const col = claveDe(tabla);
      const filas = Array.isArray(datos[tabla]) ? datos[tabla] : [];
      if (!filas.length) continue;
      await cliente.query(
        `INSERT INTO ${tabla} SELECT * FROM jsonb_populate_recordset(NULL::${tabla}, $1::jsonb) ON CONFLICT (${col}) DO NOTHING`,
        [JSON.stringify(filas)]
      );
    }

    await cliente.query('COMMIT');
    res.json({ mensaje: `Restauración (${modo}) completada correctamente.` });
  } catch (e) {
    await cliente.query('ROLLBACK');
    console.error('Error restaurando respaldo:', e);
    res.status(500).json({ error: 'No se pudo restaurar. No se cambió nada — la operación se deshizo por completo.' });
  } finally {
    cliente.release();
  }
}
