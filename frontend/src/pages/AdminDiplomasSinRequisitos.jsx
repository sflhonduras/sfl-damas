import { useEffect, useMemo, useState } from 'react';
import api, { mensajeError } from '../api';
import { numeroARomano } from '../romano';
import { ZONAS_FIHNEC, DEPARTAMENTOS_HONDURAS, MUNICIPIOS_POR_DEPARTAMENTO, CARGOS_FIHNEC } from '../listas';

const VACIO = {
  nombre_completo: '', dni: '', celular: '', capitulo: '', zona: '', departamento: '', municipio: '',
  cargo_fihnec: '', estado_civil: '', hijos_cantidad: '', comparte_testimonio: '',
  tiempo_comparte_cantidad: '', tiempo_comparte_unidad: 'Meses',
  ha_recibido_sael: '', cantidad_saeles: '', contacto_emergencia_nombre: '', contacto_emergencia_telefono: ''
};

const claseInput = 'w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20';

function Campo({ label, children, requerido = true }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-ink/80">
        {label} {requerido && <span className="text-ember">*</span>}
      </span>
      {children}
    </label>
  );
}

// Vista de "Niveles inscritos" — igual patrón que en Participantes normal, pero combinando
// dos fuentes: inscripciones reales graduadas (si la persona ya existía) + eventos asistidos
// sin diploma guardados en esta ficha. El sistema hala esta información sola, nunca se
// escribe a mano.
function NivelesInscritos({ niveles, onEliminar }) {
  if (!niveles) return <p className="text-sm text-ink/40">Cargando niveles…</p>;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {niveles.map(n => (
          <span key={n.orden}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              n.completo
                ? (n.fuente === 'graduado' ? 'bg-palm/15 text-palm' : 'bg-gold/15 text-gold')
                : 'bg-ink/5 text-ink/40'
            }`}>
            Nivel {n.orden} {n.completo && '✓'}
          </span>
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {niveles.map(n => (
          <div key={n.orden} className="flex items-center justify-between gap-2 rounded-lg bg-parchment-2 px-3 py-2 text-xs text-ink/60">
            <span>
              <strong className="text-ink/80">Nivel {n.orden}:</strong>{' '}
              {n.completo
                ? (n.fuente === 'graduado'
                    ? `graduado realmente (${n.fecha ? new Date(n.fecha).toLocaleDateString('es-HN', { timeZone: 'UTC' }) : '—'})${n.promocion ? `, promoción ${n.promocion}` : ''}`
                    : `asistido sin diploma (${n.fecha ? new Date(n.fecha).toLocaleDateString('es-HN', { timeZone: 'UTC' }) : '—'})${n.ciclo ? `, ciclo ${n.ciclo}` : ''}`)
                : 'sin evidencia todavía'}
            </span>
            {n.completo && n.fuente === 'sin_diploma' && onEliminar && (
              <button onClick={() => onEliminar(n.orden)} className="shrink-0 font-semibold text-ember hover:underline">
                Quitar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Modal paso a paso: DNI -> (si existe, historial) -> formulario de datos que falten -> guardar
function ModalRegistrar({ onCerrar, onGuardado }) {
  const [paso, setPaso] = useState('dni'); // 'dni' | 'historial' | 'formulario'
  const [esExtranjero, setEsExtranjero] = useState(false);
  const [dniConsulta, setDniConsulta] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [errorDni, setErrorDni] = useState('');
  const [participanteExistente, setParticipanteExistente] = useState(null);
  const [inscripcionesExistente, setInscripcionesExistente] = useState([]);

  const [form, setForm] = useState(VACIO);
  // Sin valor por defecto: el usuario debe elegir a propósito, nunca queda algo preseleccionado.
  const [eventoAsistido, setEventoAsistido] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));
  const cambiarDepartamento = (e) => setForm(f => ({ ...f, departamento: e.target.value, municipio: '' }));
  const municipiosDisponibles = useMemo(() => MUNICIPIOS_POR_DEPARTAMENTO[form.departamento] || [], [form.departamento]);

  const verificarDni = async (e) => {
    e.preventDefault();
    setErrorDni(''); setVerificando(true);
    try {
      const { data } = await api.get(`/admin/participantes-excepcion/verificar/${encodeURIComponent(dniConsulta)}`);
      if (!data.existe) {
        setForm(f => ({ ...f, dni: dniConsulta }));
        setPaso('formulario');
      } else if (data.ya_tiene_excepcion_abierta) {
        setErrorDni('Este participante ya tiene un registro abierto en Participantes Sin Requisitos. Búscalo en la lista para actualizarlo, en vez de crear uno nuevo.');
      } else {
        setParticipanteExistente(data.participante);
        setInscripcionesExistente(data.inscripciones);
        setPaso('historial');
      }
    } catch {
      setErrorDni('No se pudo verificar el DNI. Intenta de nuevo.');
    } finally {
      setVerificando(false);
    }
  };

  const guardarNuevoDesdeExistente = async () => {
    setGuardando(true); setError('');
    try {
      const evento = eventoAsistido ? parseInt(eventoAsistido, 10) : null;
      await api.post('/admin/participantes-excepcion', {
        participante_id: participanteExistente.id,
        evento_asistido: evento,
        nota
      });
      onGuardado();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const guardarNuevoDesdeCero = async (e) => {
    e.preventDefault();
    setGuardando(true); setError('');
    try {
      const evento = eventoAsistido ? parseInt(eventoAsistido, 10) : null;
      const { data } = await api.post('/admin/participantes-excepcion', {
        ...form,
        tiempo_comparte_testimonio: form.comparte_testimonio === 'Si'
          ? `${form.tiempo_comparte_cantidad} ${form.tiempo_comparte_unidad}`
          : null,
        evento_asistido: evento,
        nota
      });
      if (data?.directo) {
        alert(data.mensaje);
      }
      onGuardado();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Registrar en Participantes Sin Requisitos</h2>
          <button onClick={onCerrar} className="text-ink/40 hover:text-ink">✕</button>
        </div>

        {paso === 'dni' && (
          <form onSubmit={verificarDni} className="mt-5 space-y-4">
            <p className="text-sm text-ink/60">
              Primero verificamos si esta persona ya está en el sistema, para no duplicar sus datos.
            </p>

            <label className="flex items-center gap-2 rounded-lg border border-ink/15 bg-parchment-2 px-3.5 py-2.5 text-sm">
              <input type="checkbox" checked={esExtranjero}
                onChange={e => { setEsExtranjero(e.target.checked); setDniConsulta(''); }} />
              <span className="text-ink/80">¿Es extranjero o tiene identificación distinta al DNI hondureño?</span>
            </label>

            {esExtranjero ? (
              <Campo label="Número de identidad (pasaporte u otro documento)">
                <input required minLength={5} className={claseInput} value={dniConsulta}
                  onChange={e => setDniConsulta(e.target.value)} placeholder="Ej. pasaporte" />
                <p className="mt-1 text-xs text-ink/40">Sin formato fijo — admite identidades de extranjeros.</p>
              </Campo>
            ) : (
              <Campo label="Número de identidad (DNI)">
                <input required inputMode="numeric" pattern="\d{13}" title="El DNI debe tener exactamente 13 dígitos"
                  className={claseInput} value={dniConsulta}
                  onChange={e => setDniConsulta(e.target.value.replace(/[^\d]/g, '').slice(0, 13))} placeholder="0801199912345" />
                <p className="mt-1 text-xs text-ink/40">13 dígitos exactos.</p>
              </Campo>
            )}

            {errorDni && <p className="rounded-lg bg-ember/10 p-3 text-sm text-ember">{errorDni}</p>}
            <button disabled={verificando} className="w-full rounded-full bg-gold py-3 font-semibold text-night hover:bg-gold-light disabled:opacity-60">
              {verificando ? 'Verificando…' : 'Verificar DNI'}
            </button>
          </form>
        )}

        {paso === 'historial' && participanteExistente && (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-gold/30 bg-gold/5 p-4">
              <p className="font-semibold text-ink">{participanteExistente.nombre_completo}</p>
              <p className="text-sm text-ink/60">DNI: {participanteExistente.dni} · Capítulo: {participanteExistente.capitulo || '—'}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink/70">Historial de niveles ya cursados</p>
              {inscripcionesExistente.length === 0 && <p className="text-sm text-ink/40">Sin inscripciones registradas todavía.</p>}
              <ul className="space-y-1">
                {inscripcionesExistente.map((i, idx) => (
                  <li key={idx} className="rounded-lg bg-parchment-2 px-3 py-2 text-sm text-ink/70">
                    Nivel {numeroARomano(i.orden)} — {i.fecha_graduacion ? `graduado (${new Date(i.fecha_graduacion).toLocaleDateString('es-HN', { timeZone: 'UTC' })})` : 'registrado, sin graduar'}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-ink/50">
              Si el historial confirma que en realidad sí cumple el requisito, ciérralo aquí e inscríbelo directo y normal desde Participantes.
              El nivel completado ya no se escribe a mano — el sistema lo calcula solo, cruzando este historial con los eventos que asista de aquí en adelante.
            </p>
            <Campo label="Evento al que asiste ahora sin diploma" requerido={false}>
              <select className={claseInput} value={eventoAsistido} onChange={e => setEventoAsistido(e.target.value)}>
                <option value="">No aplica todavía</option>
                <option value="2">Nivel II</option>
                <option value="3">Nivel III</option>
                <option value="4">Nivel IV</option>
              </select>
            </Campo>
            <Campo label="Nota / observación" requerido={false}>
              <textarea rows={2} className={claseInput} value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional" />
            </Campo>
            {error && <p className="rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setPaso('dni')} className="rounded-full px-5 py-2 text-sm font-medium text-ink/60 hover:bg-ink/5">Volver</button>
              <button onClick={guardarNuevoDesdeExistente} disabled={guardando}
                className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
                {guardando ? 'Guardando…' : 'Registrar en Sin Requisitos'}
              </button>
            </div>
          </div>
        )}

        {paso === 'formulario' && (
          <form onSubmit={guardarNuevoDesdeCero} className="mt-5 space-y-5">
            <p className="text-sm text-ink/60">No existe en el sistema todavía — completa sus datos igual que en el registro normal del Evento 1.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Campo label="Nombre completo">
                  <input required className={claseInput} value={form.nombre_completo} onChange={set('nombre_completo')} />
                </Campo>
              </div>
              <Campo label="DNI">
                <input required disabled className="w-full rounded-lg border border-ink/10 bg-ink/5 px-3.5 py-2.5 text-ink/60" value={form.dni} />
              </Campo>
              <Campo label="Celular">
                <input required className={claseInput} value={form.celular} onChange={set('celular')} />
              </Campo>
              <Campo label="Capítulo">
                <input required className={claseInput} value={form.capitulo} onChange={set('capitulo')} />
              </Campo>
              <Campo label="Zona">
                <select required className={claseInput} value={form.zona} onChange={set('zona')}>
                  <option value="">Selecciona…</option>
                  {ZONAS_FIHNEC.map(z => <option key={z}>{z}</option>)}
                </select>
              </Campo>
              <Campo label="Departamento">
                <select required className={claseInput} value={form.departamento} onChange={cambiarDepartamento}>
                  <option value="">Selecciona…</option>
                  {DEPARTAMENTOS_HONDURAS.map(d => <option key={d}>{d}</option>)}
                </select>
              </Campo>
              <Campo label="Municipio">
                <select required className={claseInput} value={form.municipio} onChange={set('municipio')} disabled={!form.departamento}>
                  <option value="">{form.departamento ? 'Selecciona…' : 'Primero elige un departamento'}</option>
                  {municipiosDisponibles.map(m => <option key={m}>{m}</option>)}
                </select>
              </Campo>
              <div className="sm:col-span-2">
                <Campo label="Cargo en FIHNEC">
                  <select required className={claseInput} value={form.cargo_fihnec} onChange={set('cargo_fihnec')}>
                    <option value="">Selecciona…</option>
                    {CARGOS_FIHNEC.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Campo>
              </div>
              <Campo label="Estado civil">
                <select required className={claseInput} value={form.estado_civil} onChange={set('estado_civil')}>
                  <option value="">Selecciona…</option>
                  {['Soltero', 'Casado', 'Unión libre', 'Divorciado', 'Viudo'].map(o => <option key={o}>{o}</option>)}
                </select>
              </Campo>
              <Campo label="Cantidad de hijos">
                <input required type="number" min="0" className={claseInput} value={form.hijos_cantidad} onChange={set('hijos_cantidad')} />
              </Campo>
              <Campo label="Contacto de emergencia">
                <input required className={claseInput} value={form.contacto_emergencia_nombre} onChange={set('contacto_emergencia_nombre')} />
              </Campo>
              <Campo label="Teléfono de emergencia">
                <input required className={claseInput} value={form.contacto_emergencia_telefono} onChange={set('contacto_emergencia_telefono')} />
              </Campo>
            </div>

            <div className="border-t border-ink/10 pt-4">
              <Campo label="Evento al que asiste ahora sin diploma" requerido={false}>
                <select className={claseInput} value={eventoAsistido} onChange={e => setEventoAsistido(e.target.value)}>
                  <option value="">No aplica todavía</option>
                  <option value="2">Nivel II</option>
                  <option value="3">Nivel III</option>
                  <option value="4">Nivel IV</option>
                </select>
              </Campo>
            </div>
            <Campo label="Nota / observación" requerido={false}>
              <textarea rows={2} className={claseInput} value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional" />
            </Campo>

            {error && <p className="rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setPaso('dni')} className="rounded-full px-5 py-2 text-sm font-medium text-ink/60 hover:bg-ink/5">Volver</button>
              <button disabled={guardando} className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
                {guardando ? 'Guardando…' : 'Registrar en Sin Requisitos'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ModalEditar({ fila, onCerrar, onGuardado }) {
  const [niveles, setNiveles] = useState(fila.niveles || null);
  const [listoParaTrasladar, setListoParaTrasladar] = useState(fila.listo_para_trasladar || false);
  const [nota, setNota] = useState(fila.nota || '');
  const [evento, setEvento] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [agregandoEvento, setAgregandoEvento] = useState(false);
  const [error, setError] = useState('');
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [datos, setDatos] = useState({
    nombre_completo: fila.nombre_completo || '', dni: fila.dni || '', celular: fila.celular || '',
    capitulo: fila.capitulo || '', zona: fila.zona || '', departamento: fila.departamento || '', municipio: fila.municipio || '',
    cargo_fihnec: fila.cargo_fihnec || '', estado_civil: fila.estado_civil || '', hijos_cantidad: fila.hijos_cantidad ?? '',
    contacto_emergencia_nombre: fila.contacto_emergencia_nombre || '', contacto_emergencia_telefono: fila.contacto_emergencia_telefono || ''
  });
  const setDato = (campo) => (e) => setDatos(d => ({ ...d, [campo]: e.target.value }));
  const cambiarDepartamentoDatos = (e) => setDatos(d => ({ ...d, departamento: e.target.value, municipio: '' }));
  const municipiosDisponiblesDatos = useMemo(() => MUNICIPIOS_POR_DEPARTAMENTO[datos.departamento] || [], [datos.departamento]);

  const refrescarNiveles = async () => {
    const { data } = await api.get(`/admin/participantes-excepcion/${fila.id}/niveles`);
    setNiveles(data.niveles);
    setListoParaTrasladar(data.listo_para_trasladar);
  };
  useEffect(() => { refrescarNiveles(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const guardarNota = async () => {
    setGuardando(true); setError('');
    try {
      await api.put(`/admin/participantes-excepcion/${fila.id}`, { nota });
      onGuardado();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const guardarDatos = async () => {
    setGuardando(true); setError('');
    try {
      await api.put(`/admin/participantes-excepcion/${fila.id}`, datos);
      setEditandoDatos(false);
      onGuardado();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const agregarEvento = async () => {
    if (!evento) return;
    setAgregandoEvento(true); setError('');
    try {
      await api.post(`/admin/participantes-excepcion/${fila.id}/eventos`, { orden: parseInt(evento, 10) });
      setEvento('');
      await refrescarNiveles();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setAgregandoEvento(false);
    }
  };

  const eliminarEvento = async (orden) => {
    if (!confirm(`¿Quitar el Nivel ${orden} de "asistido sin diploma"? Esto no afecta a la persona en ningún otro módulo, solo corrige este registro.`)) return;
    setAgregandoEvento(true); setError('');
    try {
      await api.delete(`/admin/participantes-excepcion/${fila.id}/eventos/${orden}`);
      await refrescarNiveles();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setAgregandoEvento(false);
    }
  };

  const trasladar = async () => {
    if (!confirm(`¿Confirmas que ${fila.nombre_completo} ya se puso al día y quieres trasladarlo a Participantes? Esto lo crea/actualiza en Participantes y lo quita de esta lista.`)) return;
    setGuardando(true); setError('');
    try {
      await api.post(`/admin/participantes-excepcion/${fila.id}/trasladar`);
      onGuardado();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">{fila.nombre_completo}</h2>
          <button onClick={onCerrar} className="text-ink/40 hover:text-ink">✕</button>
        </div>
        <p className="mt-1 text-sm text-ink/50">DNI: {fila.dni || '—'} · Capítulo: {fila.capitulo || '—'}</p>
        {fila.participante_id && (
          <p className="mt-1 text-xs text-gold">Enlazado a un participante real — editar aquí actualiza su registro en Participantes.</p>
        )}

        {listoParaTrasladar && (
          <div className="mt-4 rounded-xl border border-palm/30 bg-palm/10 p-4">
            <p className="text-sm font-semibold text-palm">✅ Los 4 niveles ya tienen evidencia real.</p>
            <p className="mt-1 text-xs text-ink/60">Confirma con Carlos y traslada este registro a Participantes cuando esté listo.</p>
            <button onClick={trasladar} disabled={guardando} className="mt-3 rounded-full bg-palm px-5 py-2 text-sm font-semibold text-white hover:bg-palm-light disabled:opacity-60">
              {guardando ? 'Procesando…' : '→ Trasladar a Participantes'}
            </button>
          </div>
        )}

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink/70">Datos personales</p>
            <button onClick={() => setEditandoDatos(v => !v)} className="text-sm font-semibold text-gold hover:underline">
              {editandoDatos ? 'Cancelar edición' : 'Editar datos'}
            </button>
          </div>

          {!editandoDatos && (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-parchment-2 p-3 text-xs text-ink/60">
              <p><strong className="text-ink/80">Nombre:</strong> {fila.nombre_completo || '—'}</p>
              <p><strong className="text-ink/80">DNI:</strong> {fila.dni || '—'}</p>
              <p><strong className="text-ink/80">Celular:</strong> {fila.celular || '—'}</p>
              <p><strong className="text-ink/80">Capítulo:</strong> {fila.capitulo || '—'}</p>
              <p><strong className="text-ink/80">Zona:</strong> {fila.zona || '—'}</p>
              <p><strong className="text-ink/80">Departamento:</strong> {fila.departamento || '—'}</p>
              <p><strong className="text-ink/80">Municipio:</strong> {fila.municipio || '—'}</p>
              <p><strong className="text-ink/80">Cargo:</strong> {fila.cargo_fihnec || '—'}</p>
              <p><strong className="text-ink/80">Estado civil:</strong> {fila.estado_civil || '—'}</p>
              <p><strong className="text-ink/80">Hijos:</strong> {fila.hijos_cantidad ?? '—'}</p>
              <p><strong className="text-ink/80">Emergencia:</strong> {fila.contacto_emergencia_nombre || '—'}</p>
              <p><strong className="text-ink/80">Tel. emergencia:</strong> {fila.contacto_emergencia_telefono || '—'}</p>
            </div>
          )}

          {editandoDatos && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Campo label="Nombre completo">
                <input className={claseInput} value={datos.nombre_completo} onChange={setDato('nombre_completo')} />
              </Campo>
              <Campo label="DNI">
                <input className={claseInput} value={datos.dni} onChange={setDato('dni')} />
              </Campo>
              <Campo label="Celular" requerido={false}>
                <input className={claseInput} value={datos.celular} onChange={setDato('celular')} />
              </Campo>
              <Campo label="Capítulo" requerido={false}>
                <input className={claseInput} value={datos.capitulo} onChange={setDato('capitulo')} />
              </Campo>
              <Campo label="Zona" requerido={false}>
                <select className={claseInput} value={datos.zona} onChange={setDato('zona')}>
                  <option value="">Selecciona…</option>
                  {ZONAS_FIHNEC.map(z => <option key={z}>{z}</option>)}
                </select>
              </Campo>
              <Campo label="Departamento" requerido={false}>
                <select className={claseInput} value={datos.departamento} onChange={cambiarDepartamentoDatos}>
                  <option value="">Selecciona…</option>
                  {DEPARTAMENTOS_HONDURAS.map(d => <option key={d}>{d}</option>)}
                </select>
              </Campo>
              <Campo label="Municipio" requerido={false}>
                <select className={claseInput} value={datos.municipio} onChange={setDato('municipio')} disabled={!datos.departamento}>
                  <option value="">{datos.departamento ? 'Selecciona…' : 'Elige un departamento'}</option>
                  {municipiosDisponiblesDatos.map(m => <option key={m}>{m}</option>)}
                </select>
              </Campo>
              <Campo label="Cargo en FIHNEC" requerido={false}>
                <select className={claseInput} value={datos.cargo_fihnec} onChange={setDato('cargo_fihnec')}>
                  <option value="">Selecciona…</option>
                  {CARGOS_FIHNEC.map(c => <option key={c}>{c}</option>)}
                </select>
              </Campo>
              <Campo label="Estado civil" requerido={false}>
                <select className={claseInput} value={datos.estado_civil} onChange={setDato('estado_civil')}>
                  <option value="">Selecciona…</option>
                  {['Soltero', 'Casado', 'Unión libre', 'Divorciado', 'Viudo'].map(o => <option key={o}>{o}</option>)}
                </select>
              </Campo>
              <Campo label="Cantidad de hijos" requerido={false}>
                <input type="number" min="0" className={claseInput} value={datos.hijos_cantidad} onChange={setDato('hijos_cantidad')} />
              </Campo>
              <Campo label="Contacto de emergencia" requerido={false}>
                <input className={claseInput} value={datos.contacto_emergencia_nombre} onChange={setDato('contacto_emergencia_nombre')} />
              </Campo>
              <Campo label="Teléfono de emergencia" requerido={false}>
                <input className={claseInput} value={datos.contacto_emergencia_telefono} onChange={setDato('contacto_emergencia_telefono')} />
              </Campo>
              <div className="sm:col-span-2">
                <button onClick={guardarDatos} disabled={guardando}
                  className="w-full rounded-full bg-gold py-2.5 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
                  {guardando ? 'Guardando…' : 'Guardar datos personales'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 space-y-5 border-t border-ink/10 pt-5">
          <div>
            <p className="mb-2 text-sm font-medium text-ink/70">Niveles inscritos</p>
            <p className="mb-2 text-xs text-ink/40">Se calcula solo, cruzando graduaciones reales (si ya existía) con los eventos que asista sin diploma. No se edita a mano.</p>
            <NivelesInscritos niveles={niveles} onEliminar={eliminarEvento} />
          </div>

          <div className="flex items-end gap-2">
            <Campo label="Agregar evento nuevo asistido sin diploma" requerido={false}>
              <select className={claseInput} value={evento} onChange={e => setEvento(e.target.value)}>
                <option value="">Selecciona un nivel…</option>
                <option value="1">Nivel I</option>
                <option value="2">Nivel II</option>
                <option value="3">Nivel III</option>
                <option value="4">Nivel IV</option>
              </select>
            </Campo>
            <button onClick={agregarEvento} disabled={!evento || agregandoEvento}
              className="mb-0.5 shrink-0 rounded-full border border-gold/40 px-4 py-2.5 text-sm font-semibold text-gold hover:bg-gold/10 disabled:opacity-50">
              {agregandoEvento ? 'Agregando…' : '+ Agregar'}
            </button>
          </div>

          <Campo label="Nota / observación" requerido={false}>
            <textarea rows={2} className={claseInput} value={nota} onChange={e => setNota(e.target.value)} />
          </Campo>
        </div>

        {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCerrar} className="rounded-full px-5 py-2 text-sm font-medium text-ink/60 hover:bg-ink/5">Cerrar</button>
          <button onClick={guardarNota} disabled={guardando} className="rounded-full bg-gold px-6 py-2 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Guardar nota'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDiplomasSinRequisitos() {
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [mostrarRegistrar, setMostrarRegistrar] = useState(false);
  const [editando, setEditando] = useState(null);
  const [descargando, setDescargando] = useState('');

  const cargar = () => {
    setCargando(true);
    api.get('/admin/participantes-excepcion', { params: buscar ? { buscar } : {} })
      .then(r => setDatos(r.data.datos))
      .finally(() => setCargando(false));
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const buscarAhora = (e) => { e.preventDefault(); cargar(); };

  const eliminar = async (fila) => {
    if (!confirm(`¿Eliminar el registro de ${fila.nombre_completo || fila.dni} de Participantes Sin Requisitos? (Se guarda en la papelera por si fue un error).`)) return;
    await api.delete(`/admin/participantes-excepcion/${fila.id}`);
    cargar();
  };

  const descargar = async (tipo) => {
    setDescargando(tipo);
    try {
      const resp = await fetch(`${api.defaults.baseURL}/admin/participantes-excepcion/${tipo}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('sfl_token')}` }
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `sin_requisitos.${tipo === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando('');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Participantes Sin Requisitos</h1>
          <p className="text-sm text-ink/50">Asisten a un evento sin cumplir el requisito normal — no reciben diploma hasta ponerse al día.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => descargar('excel')} disabled={descargando !== ''}
            className="rounded-full bg-palm px-5 py-2 text-sm font-semibold text-white hover:bg-palm-light disabled:opacity-60">
            {descargando === 'excel' ? 'Generando…' : '⬇ Excel (todos los campos)'}
          </button>
          <button onClick={() => descargar('pdf')} disabled={descargando !== ''}
            className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-60">
            {descargando === 'pdf' ? 'Generando…' : '⬇ PDF (todos los campos)'}
          </button>
          <button onClick={() => setMostrarRegistrar(true)} className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-night hover:bg-gold-light">
            + Registrar
          </button>
        </div>
      </div>

      <form onSubmit={buscarAhora} className="mt-5 flex gap-2">
        <div className="relative w-full max-w-sm">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30">🔍</span>
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre o DNI"
            className="w-full rounded-full border border-gold/30 bg-white py-2.5 pl-9 pr-3.5 text-sm shadow-sm outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20" />
        </div>
        <button className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment hover:bg-ink/80">Buscar</button>
      </form>

      <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gold text-xs font-semibold uppercase tracking-wide text-night">
            <tr>
              <th className="px-4 py-3">Nombre Completo</th>
              <th className="px-4 py-3">DNI</th>
              <th className="px-4 py-3">Capítulo</th>
              <th className="px-4 py-3 text-center">Niveles con evidencia</th>
              <th className="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/40">Cargando…</td></tr>}
            {!cargando && datos.map((f, i) => (
              <tr key={f.id} className={`border-t border-ink/5 hover:bg-gold/10 ${i % 2 === 1 ? 'bg-gold-pale/25' : 'bg-white'}`}>
                <td className="px-4 py-2.5 font-medium text-ink">
                  {f.nombre_completo}
                  {f.participante_id && <span className="ml-2 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold">enlazado</span>}
                </td>
                <td className="px-4 py-2.5 text-ink/60">{f.dni || '—'}</td>
                <td className="px-4 py-2.5 text-ink/60">{f.capitulo || '—'}</td>
                <td className="px-4 py-2.5 text-center">
                  <div className="inline-flex items-center gap-1.5">
                    {(f.niveles || []).map(n => (
                      <span key={n.orden} title={`Nivel ${n.orden}${n.completo ? ` — ${n.fuente === 'graduado' ? 'graduado' : 'asistido sin diploma'}` : ' — sin evidencia'}`}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                          n.completo
                            ? (n.fuente === 'graduado' ? 'bg-palm/20 text-palm' : 'bg-gold/20 text-gold')
                            : 'bg-ink/5 text-ink/30'
                        }`}>
                        {n.orden}
                      </span>
                    ))}
                  </div>
                  {f.listo_para_trasladar && <p className="mt-1 text-xs font-medium text-palm">Listo para trasladar</p>}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <button onClick={() => setEditando(f)} className="text-gold hover:underline">Ver / editar</button>
                  <button onClick={() => eliminar(f)} className="ml-3 text-ember hover:underline">Eliminar</button>
                </td>
              </tr>
            ))}
            {!cargando && datos.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/40">No hay participantes registrados en esta lista.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {mostrarRegistrar && (
        <ModalRegistrar onCerrar={() => setMostrarRegistrar(false)} onGuardado={() => { setMostrarRegistrar(false); cargar(); }} />
      )}
      {editando && (
        <ModalEditar fila={editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar(); }} />
      )}
    </div>
  );
}
