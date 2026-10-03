import { Router } from 'express';
import xlsx from 'xlsx';
import PDFDocument from 'pdfkit';
import { query } from '../db.js';
import { requireAuth, requireModulo } from '../auth.js';
import { normalizarNombre } from '../texto.js';
import { guardarEnPapelera } from '../papelera.js';

const router = Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user.rol === 'cocina') return res.status(403).json({ error: 'No tienes acceso a esta sección.' });
  next();
});
// Se registra y se ve desde Diplomas, así que usa el mismo módulo de permisos que Diplomas.
router.use(requireModulo('diplomas', 'consulta'));

const CAMPOS_PROPIOS = [
  'nombre_completo', 'dni', 'celular', 'capitulo', 'zona', 'departamento', 'municipio',
  'cargo_fihnec', 'estado_civil', 'hijos_cantidad', 'comparte_testimonio', 'tiempo_comparte_testimonio',
  'ha_recibido_sael', 'cantidad_saeles', 'contacto_emergencia_nombre', 'contacto_emergencia_telefono'
];

const TITULOS_EXPORT = {
  nombre_completo: 'Nombre Completo', dni: 'DNI', celular: 'Celular', capitulo: 'Capítulo',
  zona: 'Zona', departamento: 'Departamento', municipio: 'Municipio', cargo_fihnec: 'Cargo en FIHNEC',
  estado_civil: 'Estado Civil', hijos_cantidad: 'Hijos', comparte_testimonio: 'Comparte Testimonio',
  tiempo_comparte_testimonio: 'Tiempo de Testimonio', ha_recibido_sael: 'Ha recibido SAEL',
  cantidad_saeles: 'Cantidad de SAELES', contacto_emergencia_nombre: 'Contacto de Emergencia',
  contacto_emergencia_telefono: 'Teléfono de Emergencia', niveles_resumen: 'Niveles Con Evidencia',
  eventos_sin_diploma: 'Eventos Asistidos Sin Diploma', nota: 'Nota'
};

// Junta los datos "reales" de una fila de excepción: si participante_id existe, trae los
// datos de la tabla participantes; si no, usa los que están guardados aquí mismo.
function normalizarFila(fila, participante) {
  const base = participante || fila;
  const datos = {};
  for (const c of CAMPOS_PROPIOS) datos[c] = base[c] ?? null;
  return {
    id: fila.id,
    participante_id: fila.participante_id,
    ...datos,
    eventos_sin_diploma: fila.eventos_sin_diploma || [],
    nota: fila.nota,
    creado_en: fila.creado_en,
    actualizado_en: fila.actualizado_en
  };
}

// El nivel completado YA NO se escribe a mano: se calcula solo, cruzando evidencia real.
// Un nivel (1 a 4) cuenta como "con evidencia" si:
//   a) el participante ya existía y tiene una inscripción GRADUADA (fecha_graduacion no nula)
//      en ese nivel, o
//   b) hay un evento sin diploma guardado en esta misma ficha para ese nivel.
// Solo cuando los 4 niveles tienen evidencia se habilita el traslado a Participantes.
async function calcularNivelesParaFilas(filas) {
  const idsConParticipante = filas.filter(f => f.participante_id).map(f => f.participante_id);
  let inscripcionesPorParticipante = {};
  if (idsConParticipante.length > 0) {
    const { rows } = await query(
      `SELECT i.participante_id, e.orden, i.fecha_graduacion, i.ciclo, i.promocion_graduacion
       FROM inscripciones i JOIN eventos e ON e.id = i.evento_id
       WHERE i.participante_id = ANY($1::int[]) AND i.fecha_graduacion IS NOT NULL`,
      [idsConParticipante]
    );
    for (const r of rows) {
      (inscripcionesPorParticipante[r.participante_id] ??= []).push(r);
    }
  }

  return filas.map(f => {
    const inscripciones = inscripcionesPorParticipante[f.participante_id] || [];
    const eventosSinDiploma = f.eventos_sin_diploma || [];
    const niveles = [1, 2, 3, 4].map(orden => {
      const graduado = inscripciones.find(i => i.orden === orden);
      if (graduado) {
        return { orden, completo: true, fuente: 'graduado', fecha: graduado.fecha_graduacion, ciclo: graduado.ciclo, promocion: graduado.promocion_graduacion };
      }
      const sinDiploma = eventosSinDiploma.find(e => e.orden === orden);
      if (sinDiploma) {
        return { orden, completo: true, fuente: 'sin_diploma', fecha: sinDiploma.fecha, ciclo: sinDiploma.ciclo || null, promocion: null };
      }
      return { orden, completo: false, fuente: null, fecha: null, ciclo: null, promocion: null };
    });
    const listoParaTrasladar = niveles.every(n => n.completo);
    return { ...f, niveles, listo_para_trasladar: listoParaTrasladar };
  });
}

async function listarConDatos(where = '1=1', params = []) {
  const { rows } = await query(
    `SELECT pe.*, p.nombre_completo AS p_nombre_completo, p.dni AS p_dni, p.celular AS p_celular,
       p.capitulo AS p_capitulo, p.zona AS p_zona, p.departamento AS p_departamento, p.municipio AS p_municipio,
       p.cargo_fihnec AS p_cargo_fihnec, p.estado_civil AS p_estado_civil, p.hijos_cantidad AS p_hijos_cantidad,
       p.comparte_testimonio AS p_comparte_testimonio, p.tiempo_comparte_testimonio AS p_tiempo_comparte_testimonio,
       p.ha_recibido_sael AS p_ha_recibido_sael, p.cantidad_saeles AS p_cantidad_saeles,
       p.contacto_emergencia_nombre AS p_contacto_emergencia_nombre, p.contacto_emergencia_telefono AS p_contacto_emergencia_telefono
     FROM participantes_excepcion pe
     LEFT JOIN participantes p ON p.id = pe.participante_id
     WHERE ${where}
     ORDER BY pe.creado_en DESC`,
    params
  );
  const filas = rows.map(r => {
    const participante = r.participante_id ? {
      nombre_completo: r.p_nombre_completo, dni: r.p_dni, celular: r.p_celular, capitulo: r.p_capitulo,
      zona: r.p_zona, departamento: r.p_departamento, municipio: r.p_municipio, cargo_fihnec: r.p_cargo_fihnec,
      estado_civil: r.p_estado_civil, hijos_cantidad: r.p_hijos_cantidad, comparte_testimonio: r.p_comparte_testimonio,
      tiempo_comparte_testimonio: r.p_tiempo_comparte_testimonio, ha_recibido_sael: r.p_ha_recibido_sael,
      cantidad_saeles: r.p_cantidad_saeles, contacto_emergencia_nombre: r.p_contacto_emergencia_nombre,
      contacto_emergencia_telefono: r.p_contacto_emergencia_telefono
    } : null;
    return normalizarFila(r, participante);
  });
  return calcularNivelesParaFilas(filas);
}

// GET /api/admin/participantes-excepcion?buscar=
router.get('/', async (req, res) => {
  const buscar = (req.query.buscar || '').trim();
  let where = '1=1';
  const params = [];
  if (buscar) {
    params.push(`%${buscar}%`);
    where = `(pe.nombre_completo ILIKE $1 OR pe.dni ILIKE $1 OR p.nombre_completo ILIKE $1 OR p.dni ILIKE $1)`;
  }
  const filas = await listarConDatos(where, params);
  res.json({ total: filas.length, datos: filas });
});

// GET /api/admin/participantes-excepcion/:id/niveles -> vista fresca de "Niveles inscritos"
// para un solo registro (se usa al abrir el modal de edición, por si algo cambió mientras
// tanto — ej. se graduó realmente en otro módulo).
router.get('/:id/niveles', async (req, res) => {
  const { rows } = await query(
    `SELECT pe.*, p.nombre_completo AS p_nombre_completo
     FROM participantes_excepcion pe LEFT JOIN participantes p ON p.id = pe.participante_id
     WHERE pe.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado.' });
  const [conNiveles] = await calcularNivelesParaFilas([normalizarFila(rows[0], null)]);
  res.json({ niveles: conNiveles.niveles, listo_para_trasladar: conNiveles.listo_para_trasladar });
});

// GET /api/admin/participantes-excepcion/verificar/:dni -> revisa si el DNI ya existe en
// participantes, y si es así, trae su historial completo (qué niveles ya hizo).
router.get('/verificar/:dni', async (req, res) => {
  const dni = (req.params.dni || '').trim();
  const { rows } = await query('SELECT * FROM participantes WHERE dni = $1', [dni]);
  if (!rows[0]) return res.json({ existe: false });

  const participante = rows[0];
  const insc = await query(
    `SELECT e.orden, e.nombre, i.ciclo, i.registrado_en, i.fecha_graduacion, i.promocion_graduacion
     FROM inscripciones i JOIN eventos e ON e.id = i.evento_id
     WHERE i.participante_id = $1 ORDER BY e.orden`,
    [participante.id]
  );
  const yaEnExcepcion = await query('SELECT id FROM participantes_excepcion WHERE participante_id = $1', [participante.id]);
  res.json({
    existe: true,
    participante,
    inscripciones: insc.rows,
    ya_tiene_excepcion_abierta: yaEnExcepcion.rows.length > 0
  });
});

// POST /api/admin/participantes-excepcion -> registrar (nunca existió, o ya existía y se enlaza)
// Nota: ya no recibe "nivel_completado" — eso ahora se calcula solo, ver calcularNivelesParaFilas.
router.post('/', requireModulo('diplomas', 'edicion'), async (req, res) => {
  const b = req.body || {};
  const eventoAsistido = b.evento_asistido ? parseInt(b.evento_asistido, 10) : null;
  let eventosSinDiploma = [];
  if (eventoAsistido) {
    const { rows: evRows } = await query('SELECT ciclo_actual FROM eventos WHERE orden = $1', [eventoAsistido]);
    eventosSinDiploma = [{ orden: eventoAsistido, fecha: new Date().toISOString().slice(0, 10), ciclo: evRows[0]?.ciclo_actual || null }];
  }

  if (b.participante_id) {
    // Caso "ya existía": no se duplican datos personales, solo se enlaza.
    const { rows: existe } = await query('SELECT id FROM participantes WHERE id = $1', [b.participante_id]);
    if (!existe[0]) return res.status(404).json({ error: 'El participante enlazado no existe.' });

    const { rows } = await query(
      `INSERT INTO participantes_excepcion (participante_id, eventos_sin_diploma, nota, creado_por)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [b.participante_id, JSON.stringify(eventosSinDiploma), b.nota || null, req.user.id]
    );
    return res.status(201).json(rows[0]);
  }

  // Caso "nunca existió": se guardan todos los datos aquí mismo.
  // El DNI es obligatorio pero SIN validar formato/longitud fija — hay casos de extranjeros
  // con identidades distintas a los 13 dígitos hondureños. Solo se exige un mínimo razonable
  // para atrapar errores de digitación (ej. "123"). El formato estricto (13 dígitos, si aplica)
  // ya se validó del lado del frontend según el checkbox "Es extranjero".
  if (!b.nombre_completo || !b.dni || String(b.dni).trim().length < 5) {
    return res.status(400).json({ error: 'Nombre y DNI son obligatorios (el DNI debe tener al menos 5 caracteres).' });
  }
  const datos = { ...b };
  datos.nombre_completo = normalizarNombre(b.nombre_completo);
  if (b.capitulo) datos.capitulo = normalizarNombre(b.capitulo);
  if (b.contacto_emergencia_nombre) datos.contacto_emergencia_nombre = normalizarNombre(b.contacto_emergencia_nombre);

  // Regla real (no depende del checkbox de extranjero): si nunca existió y el nivel/ciclo
  // ACTUAL activo es Nivel I, no hay ningún requisito previo que pueda faltarle — Nivel I es
  // el punto de partida para todos. En ese caso se crea DIRECTO en Participantes, inscrito
  // en Nivel I, sin pasar nunca por la tabla de excepción.
  const { rows: eventoActualRows } = await query('SELECT id, orden, ciclo_actual FROM eventos WHERE es_actual = TRUE LIMIT 1');
  const eventoActual = eventoActualRows[0];

  if (eventoActual && eventoActual.orden === 1) {
    const colsDirecto = CAMPOS_PROPIOS.filter(c => datos[c] !== undefined && datos[c] !== '');
    const valoresDirecto = colsDirecto.map(c => datos[c]);
    try {
      const { rows: creado } = await query(
        `INSERT INTO participantes (${colsDirecto.join(', ')}) VALUES (${colsDirecto.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        valoresDirecto
      );
      await query(
        `INSERT INTO inscripciones (participante_id, evento_id, origen, ciclo) VALUES ($1,$2,'admin',$3)
         ON CONFLICT (participante_id, evento_id) DO NOTHING`,
        [creado[0].id, eventoActual.id, eventoActual.ciclo_actual]
      );
      return res.status(201).json({
        directo: true,
        participante_id: creado[0].id,
        mensaje: 'El nivel actual es Nivel I — no aplica en Sin Requisitos. Se creó directo en Participantes, inscrito en Nivel I.'
      });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Ya existe un participante con ese DNI/identidad. Revisa antes de registrar de nuevo.' });
      throw e;
    }
  }

  const cols = CAMPOS_PROPIOS.filter(c => datos[c] !== undefined && datos[c] !== '');
  cols.push('eventos_sin_diploma', 'nota', 'creado_por');
  const valores = [
    ...CAMPOS_PROPIOS.filter(c => datos[c] !== undefined && datos[c] !== '').map(c => datos[c]),
    JSON.stringify(eventosSinDiploma), b.nota || null, req.user.id
  ];
  const marcadores = valores.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await query(
    `INSERT INTO participantes_excepcion (${cols.join(', ')}) VALUES (${marcadores}) RETURNING *`,
    valores
  );
  res.status(201).json(rows[0]);
});

// PUT /api/admin/participantes-excepcion/:id -> actualizar nota y/o datos personales.
// Si está enlazado a un participante real (participante_id), los datos personales se
// actualizan en la tabla "participantes" (es la fuente real). Si nunca existió, se
// actualizan aquí mismo en participantes_excepcion.
router.put('/:id', requireModulo('diplomas', 'edicion'), async (req, res) => {
  const b = req.body || {};
  const { rows: filaActual } = await query('SELECT participante_id FROM participantes_excepcion WHERE id = $1', [req.params.id]);
  if (!filaActual[0]) return res.status(404).json({ error: 'No encontrado.' });

  const datos = { ...b };
  if (datos.nombre_completo) datos.nombre_completo = normalizarNombre(datos.nombre_completo);
  if (datos.capitulo) datos.capitulo = normalizarNombre(datos.capitulo);
  if (datos.contacto_emergencia_nombre) datos.contacto_emergencia_nombre = normalizarNombre(datos.contacto_emergencia_nombre);

  const camposPersonales = CAMPOS_PROPIOS.filter(c => datos[c] !== undefined);
  if (camposPersonales.length > 0) {
    if (datos.dni !== undefined && String(datos.dni).trim().length < 5) {
      return res.status(400).json({ error: 'El DNI debe tener al menos 5 caracteres.' });
    }
    const tabla = filaActual[0].participante_id ? 'participantes' : 'participantes_excepcion';
    const idDestino = filaActual[0].participante_id || req.params.id;
    const setClause = camposPersonales.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const valores = [...camposPersonales.map(c => datos[c]), idDestino];
    await query(`UPDATE ${tabla} SET ${setClause} WHERE id = $${valores.length}`, valores);
  }

  if (b.nota !== undefined) {
    await query('UPDATE participantes_excepcion SET nota = $1, actualizado_en = now() WHERE id = $2', [b.nota, req.params.id]);
  } else if (camposPersonales.length > 0) {
    await query('UPDATE participantes_excepcion SET actualizado_en = now() WHERE id = $1', [req.params.id]);
  }

  if (camposPersonales.length === 0 && b.nota === undefined) return res.status(400).json({ error: 'Nada para actualizar.' });
  const { rows } = await query('SELECT * FROM participantes_excepcion WHERE id = $1', [req.params.id]);
  res.json(rows[0]);
});

// POST /api/admin/participantes-excepcion/:id/eventos -> agrega un evento más asistido sin
// diploma. Guarda también el ciclo activo de ese evento en ese momento, para poder mostrarlo
// después en la vista de "Niveles inscritos".
router.post('/:id/eventos', requireModulo('diplomas', 'edicion'), async (req, res) => {
  const orden = parseInt(req.body?.orden, 10);
  if (!orden) return res.status(400).json({ error: 'Falta el número de evento.' });
  const { rows } = await query('SELECT eventos_sin_diploma FROM participantes_excepcion WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado.' });
  const { rows: evRows } = await query('SELECT ciclo_actual FROM eventos WHERE orden = $1', [orden]);
  const lista = rows[0].eventos_sin_diploma || [];
  if (lista.some(e => e.orden === orden)) return res.status(409).json({ error: 'Ya tiene registrado ese evento.' });
  lista.push({ orden, fecha: new Date().toISOString().slice(0, 10), ciclo: evRows[0]?.ciclo_actual || null });
  const { rows: actualizado } = await query(
    'UPDATE participantes_excepcion SET eventos_sin_diploma = $1, actualizado_en = now() WHERE id = $2 RETURNING *',
    [JSON.stringify(lista), req.params.id]
  );
  res.json(actualizado[0]);
});

// DELETE /api/admin/participantes-excepcion/:id/eventos/:orden -> quita un evento sin
// diploma que se agregó por error. Solo afecta esta lista, nunca toca inscripciones reales.
router.delete('/:id/eventos/:orden', requireModulo('diplomas', 'edicion'), async (req, res) => {
  const orden = parseInt(req.params.orden, 10);
  const { rows } = await query('SELECT eventos_sin_diploma FROM participantes_excepcion WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado.' });
  const lista = (rows[0].eventos_sin_diploma || []).filter(e => e.orden !== orden);
  const { rows: actualizado } = await query(
    'UPDATE participantes_excepcion SET eventos_sin_diploma = $1, actualizado_en = now() WHERE id = $2 RETURNING *',
    [JSON.stringify(lista), req.params.id]
  );
  res.json(actualizado[0]);
});

// DELETE /api/admin/participantes-excepcion/:id -> se usa para corregir un registro por error
router.delete('/:id', requireModulo('diplomas', 'edicion'), async (req, res) => {
  const { rows } = await query('SELECT nombre_completo, dni FROM participantes_excepcion WHERE id = $1', [req.params.id]);
  if (rows[0]) await guardarEnPapelera('participantes_excepcion', req.params.id, rows[0].nombre_completo || rows[0].dni || `#${req.params.id}`, req.user.id);
  const { rowCount } = await query('DELETE FROM participantes_excepcion WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'No encontrado.' });
  res.json({ mensaje: 'Eliminado.' });
});

// POST /api/admin/participantes-excepcion/:id/trasladar -> Carlos autoriza el traslado
// manual a la tabla participantes real. SOLO se permite si los 4 niveles tienen evidencia
// real (graduado o asistido sin diploma) — nunca por un número escrito a mano.
router.post('/:id/trasladar', requireModulo('diplomas', 'edicion'), async (req, res) => {
  const { rows } = await query('SELECT * FROM participantes_excepcion WHERE id = $1', [req.params.id]);
  const excepcion = rows[0];
  if (!excepcion) return res.status(404).json({ error: 'No encontrado.' });

  const [conNiveles] = await calcularNivelesParaFilas([normalizarFila(excepcion, null)]);
  if (!conNiveles.listo_para_trasladar) {
    const faltantes = conNiveles.niveles.filter(n => !n.completo).map(n => n.orden).join(', ');
    return res.status(409).json({ error: `Todavía faltan niveles con evidencia real: Nivel(es) ${faltantes}. No se puede trasladar hasta completar los 4.` });
  }

  let participanteId = excepcion.participante_id;

  if (!participanteId) {
    // Nunca existió: se crea de cero en participantes, con lo que se guardó en la excepción.
    const cols = CAMPOS_PROPIOS.filter(c => excepcion[c] !== null && excepcion[c] !== undefined);
    const valores = cols.map(c => excepcion[c]);
    try {
      const { rows: creado } = await query(
        `INSERT INTO participantes (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        valores
      );
      participanteId = creado[0].id;
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Ya existe un participante con ese DNI — probablemente ya se creó por otro lado. Revisa antes de trasladar.' });
      throw e;
    }
  }

  // Inscribe (si no lo estaba ya) en cada evento que asistió sin diploma.
  const eventos = excepcion.eventos_sin_diploma || [];
  for (const ev of eventos) {
    const { rows: evRows } = await query('SELECT id, ciclo_actual FROM eventos WHERE orden = $1', [ev.orden]);
    if (!evRows[0]) continue;
    await query(
      `INSERT INTO inscripciones (participante_id, evento_id, origen, ciclo)
       VALUES ($1,$2,'admin',$3) ON CONFLICT (participante_id, evento_id) DO NOTHING`,
      [participanteId, evRows[0].id, ev.ciclo || evRows[0].ciclo_actual]
    );
  }

  await query('DELETE FROM participantes_excepcion WHERE id = $1', [req.params.id]);
  res.json({ mensaje: 'Trasladado correctamente a Participantes.', participante_id: participanteId });
});

router.get('/excel', async (req, res) => {
  const filas = await listarConDatos();
  const datos = filas.map((f, i) => {
    const fila = { '#': i + 1 };
    for (const c of CAMPOS_PROPIOS) fila[TITULOS_EXPORT[c]] = f[c] ?? '';
    fila[TITULOS_EXPORT.niveles_resumen] = f.niveles.filter(n => n.completo).map(n => n.orden).join(', ') || 'Ninguno';
    fila[TITULOS_EXPORT.eventos_sin_diploma] = (f.eventos_sin_diploma || []).map(e => `Nivel ${e.orden} (${e.fecha})`).join(', ');
    fila[TITULOS_EXPORT.nota] = f.nota || '';
    return fila;
  });
  const hoja = xlsx.utils.json_to_sheet(datos);
  const libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(libro, hoja, 'Sin Requisitos');
  const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="participantes_sin_requisitos.xlsx"');
  res.send(buffer);
});

router.get('/pdf', async (req, res) => {
  const filas = await listarConDatos();
  const columnas = ['nombre_completo', 'dni', 'capitulo', 'niveles_resumen', 'eventos_sin_diploma', 'nota'];

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="participantes_sin_requisitos.pdf"');

  const doc = new PDFDocument({ size: 'letter', margin: 30, layout: 'landscape' });
  doc.pipe(res);
  doc.fontSize(15).font('Helvetica-Bold').text('FIHNEC · Participantes Sin Requisitos', { align: 'center' });
  doc.moveDown(1);

  const anchoDisponible = doc.page.width - 60;
  const anchoCol = anchoDisponible / (columnas.length + 1);
  const valorTexto = (clave, f) => {
    if (clave === 'eventos_sin_diploma') return (f.eventos_sin_diploma || []).map(e => `N${e.orden}`).join(', ') || '—';
    if (clave === 'niveles_resumen') return f.niveles.filter(n => n.completo).map(n => `N${n.orden}`).join(', ') || 'Ninguno';
    return f[clave] ?? '—';
  };
  const dibujarFila = (valores, negrita) => {
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    let x = 30; const y = doc.y;
    valores.forEach(v => { doc.text(String(v ?? ''), x, y, { width: anchoCol - 5 }); x += anchoCol; });
    doc.moveDown(0.6);
  };

  dibujarFila(['#', ...columnas.map(c => TITULOS_EXPORT[c])], true);
  doc.moveTo(30, doc.y).lineTo(30 + anchoDisponible, doc.y).strokeColor('#cccccc').stroke();
  doc.moveDown(0.3);

  filas.forEach((f, i) => {
    if (doc.y > doc.page.height - 60) doc.addPage({ size: 'letter', margin: 30, layout: 'landscape' });
    dibujarFila([i + 1, ...columnas.map(c => valorTexto(c, f))], false);
  });
  doc.end();
});

export default router;
