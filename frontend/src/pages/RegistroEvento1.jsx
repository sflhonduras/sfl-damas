import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { mensajeError } from '../api';
import BotonVolver from '../components/BotonVolver';
import CampoBuscable from '../components/CampoBuscable';
import InfoEvento from '../components/InfoEvento';
import ProximasFechas from '../components/ProximasFechas';
import PromoWhatsApp from '../components/PromoWhatsApp';
import { ZONAS_FIHNEC, DEPARTAMENTOS_HONDURAS, MUNICIPIOS_POR_DEPARTAMENTO, CARGOS_FIHNEC } from '../listas';

const VACIO = {
  nombre_completo: '', dni: '', celular: '', capitulo: '', zona: '', departamento: '', municipio: '',
  cargo_fihnec: '', estado_civil: '', hijos_cantidad: '', comparte_testimonio: '',
  tiempo_comparte_cantidad: '', tiempo_comparte_unidad: 'Meses',
  ha_recibido_sael: '', cantidad_saeles: '', contacto_emergencia_nombre: '', contacto_emergencia_telefono: '', observacion: ''
};

function separarTiempo(texto) {
  if (!texto) return { cantidad: '', unidad: 'Meses' };
  const m = String(texto).match(/(\d+)\s*(\S+)/);
  if (!m) return { cantidad: '', unidad: 'Meses' };
  const unidad = ['día', 'dia'].some(u => m[2].toLowerCase().startsWith(u)) ? 'Días'
    : m[2].toLowerCase().startsWith('año') ? 'Años' : 'Meses';
  return { cantidad: m[1], unidad };
}

function datosParaFormulario(p) {
  const t = separarTiempo(p.tiempo_comparte_testimonio);
  return {
    nombre_completo: p.nombre_completo || '', dni: p.dni || '', celular: p.celular || '',
    capitulo: p.capitulo || '', zona: p.zona || '', departamento: p.departamento || '', municipio: p.municipio || '',
    cargo_fihnec: p.cargo_fihnec || '', estado_civil: p.estado_civil || '',
    hijos_cantidad: p.hijos_cantidad ?? '', comparte_testimonio: p.comparte_testimonio || '',
    tiempo_comparte_cantidad: t.cantidad, tiempo_comparte_unidad: t.unidad,
    ha_recibido_sael: p.ha_recibido_sael || '', cantidad_saeles: p.cantidad_saeles ?? '',
    contacto_emergencia_nombre: p.contacto_emergencia_nombre || '', contacto_emergencia_telefono: p.contacto_emergencia_telefono || '',
    observacion: p.observacion || ''
  };
}

function Campo({ label, children, requerido = true }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink/80">
        {label} {requerido && <span className="text-ember">*</span>}
      </span>
      {children}
    </label>
  );
}

const claseInput = "w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20";
const claseInputDeshabilitado = "w-full rounded-lg border border-ink/10 bg-ink/5 px-3.5 py-2.5 text-ink/40 outline-none cursor-not-allowed";

export default function RegistroEvento1() {
  const [paso, setPaso] = useState('dni'); // 'dni' | 'decision' | 'formulario'
  const [dniConsulta, setDniConsulta] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [errorDni, setErrorDni] = useState('');
  const [participanteExistente, setParticipanteExistente] = useState(null);
  const [actualizarDatos, setActualizarDatos] = useState(null); // true | false | null

  const [form, setForm] = useState(VACIO);
  const [evento, setEvento] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null);
  const [pinAsignado, setPinAsignado] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    api.get('/eventos/1/estado').then(r => setEvento(r.data)).catch(() => {});
  }, []);

  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));
  const soloNumeros = (campo, maxLen) => (e) => {
    const v = e.target.value.replace(/[^\d]/g, '').slice(0, maxLen);
    setForm(f => ({ ...f, [campo]: v }));
  };
  const cambiarDepartamento = (e) => setForm(f => ({ ...f, departamento: e.target.value, municipio: '' }));
  const municipiosDisponibles = useMemo(() => MUNICIPIOS_POR_DEPARTAMENTO[form.departamento] || [], [form.departamento]);

  const verificarDni = async (e) => {
    e.preventDefault();
    setErrorDni(''); setVerificando(true);
    try {
      const { data } = await api.get(`/evento1/verificar/${dniConsulta}`);
      if (!data.existe) {
        setForm(f => ({ ...f, dni: dniConsulta }));
        setPaso('formulario');
      } else if (data.ya_registrado_ciclo_actual) {
        setErrorDni('Ya estás registrado en el Nivel I para el evento actual. No es necesario volver a inscribirte.');
      } else {
        setParticipanteExistente(data.participante);
        setPaso('decision');
      }
    } catch {
      setErrorDni('No se pudo verificar tu DNI. Intenta de nuevo.');
    } finally {
      setVerificando(false);
    }
  };

  const elegirNoActualizar = async () => {
    setActualizarDatos(false);
    setEnviando(true); setError('');
    try {
      const r = await api.post('/registro/evento1', { dni: participanteExistente.dni, actualizar_datos: false });
      setExito(r.data.mensaje);
      setPinAsignado(r.data.pin || null);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const elegirActualizar = () => {
    setActualizarDatos(true);
    setForm(datosParaFormulario(participanteExistente));
    setPaso('formulario');
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const payload = {
        ...form,
        tiempo_comparte_testimonio: form.comparte_testimonio === 'Si'
          ? `${form.tiempo_comparte_cantidad} ${form.tiempo_comparte_unidad}`
          : null,
        ...(actualizarDatos !== null ? { actualizar_datos: actualizarDatos } : {})
      };
      const r = await api.post('/registro/evento1', payload);
      setExito(r.data.mensaje);
      setPinAsignado(r.data.pin || null);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  if (exito) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <p className="text-5xl">🔥</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">{exito}</h1>
        <p className="mt-3 text-ink/60">Guarda tu número de identidad (DNI): lo necesitarás para inscribirte a los siguientes niveles.</p>

        {pinAsignado && (
          <div className="mt-6 rounded-2xl border border-gold/30 bg-gold/10 p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-gold">Tu PIN personal</p>
            <p className="mt-2 font-display text-4xl font-bold tracking-[0.3em] text-ink">{pinAsignado}</p>
            <p className="mt-3 text-sm text-ink/60">
              Junto con tu número de identidad, vas a necesitar este PIN más adelante para consultar tu información,
              tu código QR de asistencia y tus niveles en el portal de autoconsulta. Guárdalo en un lugar seguro —
              lo puedes cambiar cuando quieras desde ahí mismo.
            </p>
          </div>
        )}

        {evento && <div className="mt-4"><InfoEvento evento={evento} /></div>}
        <PromoWhatsApp />
        <button onClick={() => nav('/')} className="mt-8 rounded-full bg-ink px-6 py-2.5 font-semibold text-parchment hover:bg-ember">
          Volver al inicio
        </button>
      </div>
    );
  }

  if (evento && !evento.abierto) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <BotonVolver />
        <p className="text-5xl">🔒</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">Registro cerrado</h1>
        <p className="mt-3 text-ink/60">El registro para el SFL Nivel I no está disponible en este momento.</p>
      </div>
    );
  }

  // PASO 1: pedir el DNI primero
  if (paso === 'dni') {
    return (
      <div className="mx-auto max-w-md px-5 py-24">
        <BotonVolver />
        <p className="text-center text-sm font-semibold uppercase tracking-widest text-gold">Nivel I · Mi Relación con Dios</p>
        <h1 className="mt-1 text-center font-display text-3xl font-bold text-ink">Inscripción</h1>
        <p className="mt-2 text-center text-ink/60">Ingresa tu número de identidad (DNI) para comenzar.</p>
        {evento && <div className="mt-3 text-center"><InfoEvento evento={evento} /></div>}

        <form onSubmit={verificarDni} className="mt-8 space-y-4">
          <input
            required inputMode="numeric" value={dniConsulta}
            onChange={e => setDniConsulta(e.target.value.replace(/[^\d]/g, '').slice(0, 13))}
            placeholder="Número de identidad (DNI)"
            className="w-full rounded-lg border border-ink/15 bg-white px-4 py-3 text-center text-lg outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
          />
          {errorDni && <p className="rounded-lg bg-ember/10 p-3 text-center text-sm text-ember">{errorDni}</p>}
          <button disabled={verificando} className="w-full rounded-full bg-gold py-3.5 font-semibold text-night transition hover:bg-gold-light disabled:opacity-60">
            {verificando ? 'Verificando…' : 'Continuar'}
          </button>
        </form>
        <ProximasFechas />
      </div>
    );
  }

  // PASO 2: si ya existe, preguntar si quiere actualizar sus datos
  if (paso === 'decision') {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <BotonVolver />
        <p className="text-4xl">👋</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">
          Hola, {participanteExistente.nombre_completo.split(' ')[0]}
        </h1>
        <p className="mt-3 text-ink/60">
          Ya tenemos tus datos registrados. ¿Quieres actualizar tu información antes de confirmar tu inscripción a este evento?
        </p>
        {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button onClick={elegirActualizar} className="rounded-full bg-gold px-6 py-3 font-semibold text-night hover:bg-gold-light">
            Sí, quiero actualizar mis datos
          </button>
          <button onClick={elegirNoActualizar} disabled={enviando} className="rounded-full border border-ink/20 px-6 py-3 font-semibold text-ink hover:bg-ink/5 disabled:opacity-60">
            {enviando ? 'Confirmando…' : 'No, mis datos siguen igual'}
          </button>
        </div>
      </div>
    );
  }

  // PASO 3: formulario completo (nuevo participante, o existente actualizando datos)
  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <BotonVolver />
      <p className="text-sm font-semibold uppercase tracking-widest text-gold">Nivel I · Mi Relación con Dios</p>
      <h1 className="mt-1 font-display text-3xl font-bold text-ink">
        {actualizarDatos ? 'Actualiza tus datos' : 'Formulario de inscripción'}
      </h1>
      <p className="mt-2 text-ink/60">
        {actualizarDatos
          ? 'Revisa y corrige lo que necesites. Todos los campos son obligatorios, salvo "Observaciones".'
          : 'Completa tus datos una única vez. Todos los campos son obligatorios, salvo "Observaciones".'}
      </p>
      {evento && <div className="mt-3"><InfoEvento evento={evento} /></div>}
      <ProximasFechas />

      <form onSubmit={enviar} className="mt-8 space-y-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo label="Nombre completo">
              <input required className={claseInput} value={form.nombre_completo} onChange={set('nombre_completo')} placeholder="Ej. Juan Carlos Pérez López" />
            </Campo>
          </div>
          <Campo label="Número de identidad (DNI)">
            <input required disabled inputMode="numeric" className={claseInputDeshabilitado} value={form.dni} />
          </Campo>
          <Campo label="Número de celular">
            <input required inputMode="numeric" minLength={8} maxLength={8} className={claseInput}
              value={form.celular} onChange={soloNumeros('celular', 8)} placeholder="99999999" />
            {form.celular && form.celular.length !== 8 && (
              <p className="mt-1 text-xs text-ember">Debe tener exactamente 8 dígitos.</p>
            )}
          </Campo>
          <Campo label="Capítulo al que pertenece">
            <CampoBuscable id="capitulo" opciones={[]} required value={form.capitulo} onChange={set('capitulo')} placeholder="Escribe el nombre de tu capítulo" />
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
            <input required type="number" min="0" max="30" className={claseInput} value={form.hijos_cantidad} onChange={set('hijos_cantidad')} />
          </Campo>

          <Campo label="¿Comparte testimonio?">
            <select required className={claseInput} value={form.comparte_testimonio}
              onChange={e => setForm(f => ({ ...f, comparte_testimonio: e.target.value }))}>
              <option value="">Selecciona…</option>
              <option value="Si">Sí</option>
              <option value="No">No</option>
            </select>
          </Campo>
          <Campo label="¿Hace cuánto tiempo?" requerido={form.comparte_testimonio === 'Si'}>
            <div className="flex gap-2">
              <input
                type="number" min="1" max="999"
                disabled={form.comparte_testimonio !== 'Si'}
                required={form.comparte_testimonio === 'Si'}
                className={form.comparte_testimonio === 'Si' ? claseInput : claseInputDeshabilitado}
                value={form.tiempo_comparte_cantidad}
                onChange={set('tiempo_comparte_cantidad')}
                placeholder="Ej. 6"
              />
              <select
                disabled={form.comparte_testimonio !== 'Si'}
                className={form.comparte_testimonio === 'Si' ? claseInput : claseInputDeshabilitado}
                value={form.tiempo_comparte_unidad}
                onChange={set('tiempo_comparte_unidad')}
              >
                <option>Días</option>
                <option>Meses</option>
                <option>Años</option>
              </select>
            </div>
          </Campo>

          <Campo label="¿Ha recibido SAEL?">
            <select required className={claseInput} value={form.ha_recibido_sael}
              onChange={e => setForm(f => ({ ...f, ha_recibido_sael: e.target.value }))}>
              <option value="">Selecciona…</option>
              <option value="Si">Sí</option>
              <option value="No">No</option>
            </select>
          </Campo>
          <Campo label="¿Cuántos SAELES ha recibido?" requerido={form.ha_recibido_sael === 'Si'}>
            <input
              type="number" min="1" max="50"
              disabled={form.ha_recibido_sael !== 'Si'}
              required={form.ha_recibido_sael === 'Si'}
              className={form.ha_recibido_sael === 'Si' ? claseInput : claseInputDeshabilitado}
              value={form.cantidad_saeles}
              onChange={set('cantidad_saeles')}
            />
          </Campo>

          <Campo label="Nombre del contacto de emergencia">
            <input required className={claseInput} value={form.contacto_emergencia_nombre} onChange={set('contacto_emergencia_nombre')} />
          </Campo>
          <Campo label="Teléfono del contacto de emergencia">
            <input required inputMode="numeric" minLength={8} maxLength={8} className={claseInput}
              value={form.contacto_emergencia_telefono} onChange={soloNumeros('contacto_emergencia_telefono', 8)} placeholder="99999999" />
            {form.contacto_emergencia_telefono && form.contacto_emergencia_telefono.length !== 8 && (
              <p className="mt-1 text-xs text-ember">Debe tener exactamente 8 dígitos.</p>
            )}
          </Campo>
          <div className="sm:col-span-2">
            <Campo label="Observaciones" requerido={false}>
              <textarea rows={3} className={claseInput} value={form.observacion} onChange={set('observacion')} placeholder="Opcional" />
            </Campo>
          </div>
        </div>

        {error && <p className="rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

        <button disabled={enviando} className="w-full rounded-full bg-gold py-3.5 font-semibold text-night transition hover:bg-gold-light disabled:opacity-60">
          {enviando ? 'Enviando…' : actualizarDatos ? 'Guardar y confirmar inscripción' : 'Completar inscripción'}
        </button>
      </form>
    </div>
  );
}
