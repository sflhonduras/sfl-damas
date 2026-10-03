import { Router } from 'express';
import { query } from '../db.js';
import { normalizarNombre, soloDigitos } from '../texto.js';
import { MUNICIPIOS_POR_DEPARTAMENTO } from '../municipios.js';
import { obtenerInformePorToken } from '../informesCierre.js';
import { generarInformePptx } from '../informePptx.js';
import { calcularResumenEnVivo } from '../enlaceEnVivo.js';

const router = Router();

// PIN de 4 dígitos para el portal de autoconsulta — se asigna una sola vez, al inscribirse
// por primera vez en el Nivel I, y se le muestra a la persona en ese momento.
function generarPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Utilidad: estado de un evento (abierto/cerrado) según fecha límite + flag activo
function estadoEvento(ev) {
  const ahora = new Date();
  const limite = ev.fecha_limite_registro ? new Date(ev.fecha_limite_registro) : null;
  const venciDeCierre = limite ? ahora > limite : false;
  const abierto = ev.activo && !venciDeCierre;
  return { ...ev, abierto, venciDeCierre };
}

// Registra (o vuelve a activar) la inscripción de un participante a un evento, respetando
// el "ciclo" actual de ese evento. Si ya tiene una inscripción de un ciclo anterior, la
// reactiva para el ciclo actual (en vez de bloquearlo para siempre). Si ya está inscrito
// en el ciclo actual, avisa que ya está registrado.
async function inscribirEnCicloActual(participanteId, evento, origen = 'web') {
  const existente = await query(
    'SELECT id, ciclo FROM inscripciones WHERE participante_id = $1 AND evento_id = $2',
    [participanteId, evento.id]
  );
  if (existente.rows[0]) {
    if (existente.rows[0].ciclo === evento.ciclo_actual) {
      return { yaRegistrado: true };
    }
    // Antes de sobrescribir, guardamos una copia de cómo estaba (ciclo, fecha de graduación,
    // promoción) en el historial — así nunca se pierde para siempre, aunque se reinscriba.
    const anteriorRes = await query('SELECT * FROM inscripciones WHERE id = $1', [existente.rows[0].id]);
    const anterior = anteriorRes.rows[0];
    await query(
      `INSERT INTO inscripciones_historial
         (participante_id, evento_id, ciclo, fecha_graduacion, promocion_graduacion, registrado_en, origen, motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'reactivado')`,
      [anterior.participante_id, anterior.evento_id, anterior.ciclo, anterior.fecha_graduacion,
        anterior.promocion_graduacion, anterior.registrado_en, anterior.origen]
    );
    await query(
      'UPDATE inscripciones SET ciclo = $1, registrado_en = now(), origen = $2 WHERE id = $3',
      [evento.ciclo_actual, origen, existente.rows[0].id]
    );
    return { yaRegistrado: false, reactivado: true };
  }
  // ON CONFLICT DO NOTHING: si dos peticiones casi simultáneas (doble clic, reintento de red)
  // llegan aquí a la vez, la base de datos garantiza que solo una cree la fila — la otra
  // no truena, simplemente no inserta nada (lo detectamos abajo por RETURNING vacío).
  const insertRes = await query(
    `INSERT INTO inscripciones (participante_id, evento_id, origen, ciclo) VALUES ($1,$2,$3,$4)
     ON CONFLICT (participante_id, evento_id) DO NOTHING RETURNING id`,
    [participanteId, evento.id, origen, evento.ciclo_actual]
  );
  if (!insertRes.rows[0]) {
    // Otra petición concurrente ya insertó esta misma inscripción justo antes.
    return { yaRegistrado: true };
  }
  return { yaRegistrado: false, reactivado: false };
}

const CAMPOS_REQUERIDOS_EVENTO1 = [
  'nombre_completo', 'dni', 'celular', 'capitulo', 'zona', 'departamento', 'municipio',
  'cargo_fihnec', 'estado_civil', 'hijos_cantidad', 'comparte_testimonio',
  'ha_recibido_sael', 'contacto_emergencia_nombre', 'contacto_emergencia_telefono'
];

function validarDatosEvento1(b) {
  for (const campo of CAMPOS_REQUERIDOS_EVENTO1) {
    if (b[campo] === undefined || b[campo] === null || String(b[campo]).trim() === '') {
      return `El campo "${campo}" es obligatorio.`;
    }
  }
  const dni = soloDigitos(b.dni);
  if (!dni || dni.length !== 13) return 'El número de identidad (DNI) debe tener 13 dígitos.';
  const municipiosDelDepartamento = MUNICIPIOS_POR_DEPARTAMENTO[b.departamento];
  if (!municipiosDelDepartamento) return 'El departamento indicado no es válido.';
  if (!municipiosDelDepartamento.includes(b.municipio)) {
    return `El municipio "${b.municipio}" no pertenece al departamento "${b.departamento}".`;
  }
  if (b.comparte_testimonio === 'Si' && !String(b.tiempo_comparte_testimonio || '').trim()) {
    return 'Indica hace cuánto tiempo comparte testimonio.';
  }
  if (b.ha_recibido_sael === 'Si' && !String(b.cantidad_saeles || '').trim()) {
    return 'Indica cuántos SAELES ha recibido.';
  }
  const celular = soloDigitos(b.celular);
  if (!celular || celular.length !== 8) return 'El número de celular debe tener exactamente 8 dígitos.';
  const telefonoEmergencia = soloDigitos(b.contacto_emergencia_telefono);
  if (!telefonoEmergencia || telefonoEmergencia.length !== 8) return 'El teléfono del contacto de emergencia debe tener exactamente 8 dígitos.';
  const hijosCantidad = parseInt(b.hijos_cantidad, 10);
  if (Number.isNaN(hijosCantidad) || hijosCantidad < 0) return 'La cantidad de hijos debe ser un número válido.';
  if (b.ha_recibido_sael === 'Si') {
    const cantidadSaeles = parseInt(b.cantidad_saeles, 10);
    if (Number.isNaN(cantidadSaeles) || cantidadSaeles < 0) return 'La cantidad de SAELES debe ser un número válido.';
  }
  return null;
}

// GET /api/eventos -> lista pública de los 4 eventos con su estado
router.get('/eventos', async (req, res) => {
  const { rows } = await query('SELECT * FROM eventos ORDER BY orden ASC');
  res.json(rows.map(estadoEvento));
});

// GET /api/eventos/:orden/estado -> estado puntual de un evento
router.get('/eventos/:orden/estado', async (req, res) => {
  const orden = parseInt(req.params.orden, 10);
  const { rows } = await query('SELECT * FROM eventos WHERE orden = $1', [orden]);
  if (!rows[0]) return res.status(404).json({ error: 'Evento no encontrado' });
  res.json(estadoEvento(rows[0]));
});

// GET /api/evento1/verificar/:dni -> revisa si ya existe un participante con ese DNI,
// para preguntarle si quiere actualizar sus datos antes de (re)inscribirlo al Nivel I.
router.get('/evento1/verificar/:dni', async (req, res) => {
  const dni = soloDigitos(req.params.dni) || String(req.params.dni).trim();
  const partRes = await query('SELECT * FROM participantes WHERE dni = $1', [dni]);
  const participante = partRes.rows[0];
  if (!participante) return res.json({ existe: false });

  const evRes = await query('SELECT * FROM eventos WHERE orden = 1');
  const evento = evRes.rows[0];
  const inscRes = await query(
    'SELECT ciclo FROM inscripciones WHERE participante_id = $1 AND evento_id = $2',
    [participante.id, evento.id]
  );
  const yaRegistradoCicloActual = inscRes.rows[0]?.ciclo === evento.ciclo_actual;

  delete participante.pin; // dato interno, no se expone
  res.json({ existe: true, ya_registrado_ciclo_actual: yaRegistradoCicloActual, participante });
});

// POST /api/registro/evento1  -> inscribe (o re-inscribe) al Nivel I.
// body.actualizar_datos: true (actualiza sus datos), false (los deja igual), u omitido (nuevo participante).
router.post('/registro/evento1', async (req, res) => {
  const b = req.body || {};
  const dni = soloDigitos(b.dni) || String(b.dni || '').trim();
  if (!dni) return res.status(400).json({ error: 'Debes indicar tu número de identidad (DNI).' });

  const evRes = await query('SELECT * FROM eventos WHERE orden = 1');
  const evento = evRes.rows[0];
  const estado = estadoEvento(evento);
  if (!estado.abierto) {
    return res.status(403).json({ error: 'El registro para el Evento 1 está cerrado en este momento.' });
  }

  const existenteRes = await query('SELECT id FROM participantes WHERE dni = $1', [dni]);
  const existente = existenteRes.rows[0];

  let participanteId;
  let pinAsignado = null;

  if (!existente) {
    // Participante nuevo: se validan todos los campos y se crea su registro.
    const errorValidacion = validarDatosEvento1(b);
    if (errorValidacion) return res.status(400).json({ error: errorValidacion });

    const celular = soloDigitos(b.celular);
    const telefonoEmergencia = soloDigitos(b.contacto_emergencia_telefono);
    const pinNuevo = generarPin();
    // ON CONFLICT (dni) DO NOTHING: si dos peticiones con el mismo DNI llegan casi a la vez
    // (doble clic, reintento por mala conexión), solo una crea el registro; la otra lo detecta
    // abajo y reutiliza el mismo participante en vez de fallar o duplicar.
    const insertParticipante = await query(
      `INSERT INTO participantes
        (nombre_completo, dni, celular, capitulo, zona, departamento, municipio, cargo_fihnec,
         estado_civil, hijos_cantidad, comparte_testimonio, tiempo_comparte_testimonio,
         ha_recibido_sael, cantidad_saeles, contacto_emergencia_nombre, contacto_emergencia_telefono, observacion, pin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (dni) DO NOTHING
       RETURNING id`,
      [
        normalizarNombre(b.nombre_completo), dni, celular, normalizarNombre(b.capitulo), b.zona,
        b.departamento, b.municipio, b.cargo_fihnec, b.estado_civil,
        parseInt(b.hijos_cantidad, 10), b.comparte_testimonio,
        b.comparte_testimonio === 'Si' ? String(b.tiempo_comparte_testimonio).trim() : null,
        b.ha_recibido_sael, b.ha_recibido_sael === 'Si' ? parseInt(b.cantidad_saeles, 10) : null,
        normalizarNombre(b.contacto_emergencia_nombre), telefonoEmergencia, b.observacion ? b.observacion.trim() : null, pinNuevo
      ]
    );
    if (insertParticipante.rows[0]) {
      participanteId = insertParticipante.rows[0].id;
      pinAsignado = pinNuevo;
    } else {
      const yaExiste = await query('SELECT id FROM participantes WHERE dni = $1', [dni]);
      participanteId = yaExiste.rows[0].id;
    }
  } else {
    participanteId = existente.id;

    if (b.actualizar_datos === true) {
      const errorValidacion = validarDatosEvento1(b);
      if (errorValidacion) return res.status(400).json({ error: errorValidacion });

      const celular = soloDigitos(b.celular);
      const telefonoEmergencia = soloDigitos(b.contacto_emergencia_telefono);
      await query(
        `UPDATE participantes SET
           nombre_completo=$1, celular=$2, capitulo=$3, zona=$4, departamento=$5, municipio=$6,
           cargo_fihnec=$7, estado_civil=$8, hijos_cantidad=$9, comparte_testimonio=$10,
           tiempo_comparte_testimonio=$11, ha_recibido_sael=$12, cantidad_saeles=$13,
           contacto_emergencia_nombre=$14, contacto_emergencia_telefono=$15, observacion=$16,
           actualizado_en = now()
         WHERE id = $17`,
        [
          normalizarNombre(b.nombre_completo), celular, normalizarNombre(b.capitulo), b.zona,
          b.departamento, b.municipio, b.cargo_fihnec, b.estado_civil,
          parseInt(b.hijos_cantidad, 10), b.comparte_testimonio,
          b.comparte_testimonio === 'Si' ? String(b.tiempo_comparte_testimonio).trim() : null,
          b.ha_recibido_sael, b.ha_recibido_sael === 'Si' ? parseInt(b.cantidad_saeles, 10) : null,
          normalizarNombre(b.contacto_emergencia_nombre), telefonoEmergencia,
          b.observacion ? b.observacion.trim() : null, participanteId
        ]
      );
    }
  }

  const resultadoInscripcion = await inscribirEnCicloActual(participanteId, evento);
  if (resultadoInscripcion.yaRegistrado) {
    return res.status(409).json({ error: 'Ya estás registrado en el Nivel I para este evento.' });
  }

  res.status(201).json({
    mensaje: existente
      ? (b.actualizar_datos === true ? 'Tus datos fueron actualizados y tu registro quedó confirmado.' : 'Tu registro quedó confirmado.')
      : 'Registro completado. ¡Bienvenido al SFL Nivel I!',
    participante_id: participanteId,
    pin: pinAsignado
  });
});

// POST /api/registro/:orden  (orden = 2, 3, 4) -> solo requiere DNI, valida elegibilidad secuencial
router.post('/registro/:orden', async (req, res) => {
  const orden = parseInt(req.params.orden, 10);
  if (![2, 3, 4].includes(orden)) {
    return res.status(400).json({ error: 'Ruta de registro inválida.' });
  }
  const dni = soloDigitos((req.body || {}).dni) || String((req.body || {}).dni || '').trim();
  if (!dni) return res.status(400).json({ error: 'Debes indicar tu número de identidad (DNI).' });
  if (dni.length !== 13) return res.status(400).json({ error: 'El número de identidad (DNI) debe tener 13 dígitos.' });

  const evActualRes = await query('SELECT * FROM eventos WHERE orden = $1', [orden]);
  const evAnteriorRes = await query('SELECT * FROM eventos WHERE orden = $1', [orden - 1]);
  const evActual = evActualRes.rows[0];
  const evAnterior = evAnteriorRes.rows[0];
  if (!evActual || !evAnterior) return res.status(404).json({ error: 'Evento no encontrado.' });

  const estadoActual = estadoEvento(evActual);
  if (!estadoActual.abierto) {
    return res.status(403).json({ error: `El registro para "${evActual.nombre}" está cerrado en este momento.` });
  }

  const partRes = await query('SELECT id, nombre_completo FROM participantes WHERE dni = $1', [dni]);
  const participante = partRes.rows[0];
  if (!participante) {
    return res.status(404).json({
      error: 'No encontramos tu número de identidad en la base de datos. Debes inscribirte primero en el SFL Nivel I.',
      habilitado: false
    });
  }

  const inscripcionAnterior = await query(
    'SELECT id FROM inscripciones WHERE participante_id = $1 AND evento_id = $2',
    [participante.id, evAnterior.id]
  );
  if (!inscripcionAnterior.rows[0]) {
    return res.status(403).json({
      error: `No estás habilitado para "${evActual.nombre}". Primero debes completar el registro de "${evAnterior.nombre}".`,
      habilitado: false
    });
  }

  const resultadoInscripcion = await inscribirEnCicloActual(participante.id, evActual);
  if (resultadoInscripcion.yaRegistrado) {
    return res.status(409).json({
      error: `Ya estás registrado en "${evActual.nombre}".`,
      habilitado: true,
      ya_registrado: true
    });
  }

  res.status(201).json({
    mensaje: `¡Listo, ${participante.nombre_completo}! Quedaste registrado en "${evActual.nombre}".`,
    habilitado: true
  });
});

// GET /api/consulta/:orden/:dni -> permite validar elegibilidad sin registrar (para UI de "verificar")
router.get('/consulta/:orden/:dni', async (req, res) => {
  const orden = parseInt(req.params.orden, 10);
  const dni = soloDigitos(req.params.dni) || String(req.params.dni).trim();
  const partRes = await query('SELECT id, nombre_completo FROM participantes WHERE dni = $1', [dni]);
  const participante = partRes.rows[0];
  if (!participante) return res.json({ existe: false, habilitado: false });

  if (orden === 1) return res.json({ existe: true, habilitado: false, mensaje: 'Ya estás registrado como participante.' });

  const evAnteriorRes = await query('SELECT * FROM eventos WHERE orden = $1', [orden - 1]);
  const evAnterior = evAnteriorRes.rows[0];
  const insc = await query(
    'SELECT id FROM inscripciones WHERE participante_id = $1 AND evento_id = $2',
    [participante.id, evAnterior.id]
  );
  res.json({ existe: true, nombre: participante.nombre_completo, habilitado: !!insc.rows[0] });
});

// GET /api/informe-publico/:token -> ver un informe de cierre de nivel SIN login, para
// compartir con la Junta Directiva de FIHNEC (u otros externos). El token es la única
// llave — nunca expira, quien lo tenga puede verlo, igual que un enlace de Google Docs.
router.get('/informe-publico/:token', async (req, res) => {
  const informe = await obtenerInformePorToken(req.params.token);
  if (!informe) return res.status(404).json({ error: 'Este enlace no existe o ya no es válido.' });
  res.json(informe);
});

// GET /api/informe-publico/:token/pptx -> arma el PPTX al momento y lo descarga. No se
// guarda nada en disco ni en la base de datos — se genera de nuevo cada vez que lo piden.
router.get('/informe-publico/:token/pptx', async (req, res) => {
  const informe = await obtenerInformePorToken(req.params.token);
  if (!informe) return res.status(404).json({ error: 'Este enlace no existe o ya no es válido.' });

  const nivelRomano = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }[informe.evento_orden] || informe.evento_orden;
  const buffer = await generarInformePptx(informe);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename="Informe_SFL_Nivel_${nivelRomano}.pptx"`);
  res.send(buffer);
});

// GET /api/registro-en-vivo/:token -> resumen en vivo completo (total, y los 18
// departamentos con su desglose de cargos ya incluido). El token vence solo a las 72 horas
// de haberse generado — pasado ese tiempo, esto devuelve 404 como si el enlace nunca hubiera
// existido.
router.get('/registro-en-vivo/:token', async (req, res) => {
  const resumen = await calcularResumenEnVivo(req.params.token);
  if (!resumen) return res.status(404).json({ error: 'Este enlace no existe o ya venció.' });
  res.json(resumen);
});

export default router;
