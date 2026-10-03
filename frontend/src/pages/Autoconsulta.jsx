import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { mensajeError } from '../api';
import BotonVolver from '../components/BotonVolver';
import { formatearFechaLarga } from '../fechas';

const EMOJI_MEDALLA = { Bronce: '🥉', Plata: '🥈', Oro: '🥇', Platino: '🏆', 'Vuelta Completa': '🌟' };

export default function Autoconsulta() {
  const [dni, setDni] = useState('');
  const [pin, setPin] = useState('');
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const [mostrarCambiarPin, setMostrarCambiarPin] = useState(false);
  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinNuevoConfirmar, setPinNuevoConfirmar] = useState('');
  const [mensajePin, setMensajePin] = useState('');
  const [errorPin, setErrorPin] = useState('');
  const [guardandoPin, setGuardandoPin] = useState(false);

  const consultar = async (e) => {
    e.preventDefault();
    setError(''); setCargando(true);
    try {
      const { data } = await api.post('/autoconsulta/consultar', { dni, pin });
      setEstado(data);
    } catch (err) {
      setError(mensajeError(err, 'Número de identidad o PIN incorrectos.'));
    } finally {
      setCargando(false);
    }
  };

  const cambiarPin = async (e) => {
    e.preventDefault();
    setErrorPin(''); setMensajePin('');
    if (pinNuevo !== pinNuevoConfirmar) { setErrorPin('El nuevo PIN no coincide en ambos campos.'); return; }
    if (!/^\d{4}$/.test(pinNuevo)) { setErrorPin('El nuevo PIN debe tener exactamente 4 dígitos.'); return; }
    setGuardandoPin(true);
    try {
      await api.post('/autoconsulta/cambiar-pin', { dni, pin_actual: pinActual, pin_nuevo: pinNuevo });
      setMensajePin('✓ Tu PIN quedó actualizado.');
      setPin(pinNuevo);
      setPinActual(''); setPinNuevo(''); setPinNuevoConfirmar('');
      setEstado(e => e ? { ...e, debe_cambiar_pin: false } : e);
    } catch (err) {
      setErrorPin(mensajeError(err));
    } finally {
      setGuardandoPin(false);
    }
  };

  const claseInput = 'w-full rounded-lg border border-ink/15 bg-white px-4 py-3 text-center text-lg outline-none focus:border-gold focus:ring-2 focus:ring-gold/20';

  // Pantalla 1: pedir DNI + PIN
  if (!estado) {
    return (
      <div className="mx-auto max-w-md px-5 py-24">
        <BotonVolver />
        <p className="text-center text-sm font-semibold uppercase tracking-widest text-gold">Portal de autoconsulta</p>
        <h1 className="mt-1 text-center font-display text-3xl font-bold text-ink">Consulta tu información</h1>
        <p className="mt-2 text-center text-ink/60">Ingresa tu número de identidad y tu PIN personal para ver tu estatus, tus medallas y tu código QR.</p>

        <form onSubmit={consultar} autoComplete="off" className="mt-8 space-y-4">
          <input
            required inputMode="numeric" name="identidad_participante" autoComplete="off" value={dni}
            onChange={e => setDni(e.target.value.replace(/[^\d]/g, '').slice(0, 13))}
            placeholder="Número de identidad (DNI)"
            className={claseInput}
          />
          <input
            required type="password" name="pin_participante" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pin}
            onChange={e => setPin(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            placeholder="PIN (4 dígitos)"
            className={`${claseInput} tracking-[0.3em]`}
          />
          {error && <p className="rounded-lg bg-ember/10 p-3 text-center text-sm text-ember">{error}</p>}
          <button disabled={cargando} className="w-full rounded-full bg-gold py-3.5 font-semibold text-night transition hover:bg-gold-light disabled:opacity-60">
            {cargando ? 'Buscando…' : 'Consultar'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-ink/40">
          ¿No tienes tu PIN? Recuerda que se te mostró al inscribirte por primera vez en el Nivel I. Si no lo encuentras,
          pídele al equipo de FIHNEC que te ayude a recuperarlo.
        </p>
      </div>
    );
  }

  // Pantalla obligatoria: si el sistema indica que debe cambiar su PIN, no ve nada más
  // hasta que lo haga — sin botón para saltarla, sin acceso a nivel/QR/medallas todavía.
  if (estado && estado.debe_cambiar_pin) {
    return (
      <div className="mx-auto max-w-md px-5 py-24">
        <p className="text-center text-sm font-semibold uppercase tracking-widest text-gold">Portal de autoconsulta</p>
        <h1 className="mt-1 text-center font-display text-3xl font-bold text-ink">Elige tu propio PIN</h1>
        <p className="mt-2 text-center text-ink/60">
          Por seguridad, antes de continuar debes cambiar el PIN por uno que solo tú conozcas.
        </p>

        <form onSubmit={cambiarPin} autoComplete="off" className="mt-8 space-y-4 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <input
            required type="password" name="pin_actual_participante" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pinActual}
            onChange={e => setPinActual(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            placeholder="PIN actual" className={`${claseInput} tracking-[0.2em]`}
          />
          <input
            required type="password" name="pin_nuevo_participante" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pinNuevo}
            onChange={e => setPinNuevo(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            placeholder="PIN nuevo (4 dígitos)" className={`${claseInput} tracking-[0.2em]`}
          />
          <input
            required type="password" name="pin_confirmar_participante" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pinNuevoConfirmar}
            onChange={e => setPinNuevoConfirmar(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            placeholder="Confirma el PIN nuevo" className={`${claseInput} tracking-[0.2em]`}
          />
          {errorPin && <p className="rounded-lg bg-ember/10 p-2 text-center text-sm text-ember">{errorPin}</p>}
          <button disabled={guardandoPin} className="w-full rounded-full bg-gold py-3 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
            {guardandoPin ? 'Guardando…' : 'Guardar mi nuevo PIN'}
          </button>
        </form>
      </div>
    );
  }

  // Pantalla 2: estado del participante
  return (
    <div className="mx-auto max-w-lg px-5 py-24">
      <BotonVolver />
      <p className="text-center text-sm font-semibold uppercase tracking-widest text-gold">Portal de autoconsulta</p>
      <h1 className="mt-1 text-center font-display text-3xl font-bold text-ink">Hola, {estado.nombre_completo.split(' ')[0]}</h1>

      <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Nivel actual</p>
        <p className="mt-1 font-display text-2xl font-bold text-ink">
          {estado.nivel_actual_nombre || 'Todavía no has completado ningún nivel'}
        </p>

        {estado.proximo_evento ? (
          <div className="mt-4 rounded-xl bg-parchment-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Próximo nivel habilitado</p>
            <p className="mt-1 font-semibold text-ink">{estado.proximo_evento.nombre}</p>
            {estado.proximo_evento.fecha_evento && (
              <p className="mt-1 text-sm text-ink/60">{formatearFechaLarga(estado.proximo_evento.fecha_evento)}</p>
            )}
            {estado.proximo_evento.lugar && <p className="text-sm text-ink/50">{estado.proximo_evento.lugar}</p>}
            {!estado.proximo_evento.abierto && (
              <p className="mt-2 text-xs text-ember">El registro para este nivel está cerrado por ahora.</p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-palm">🎓 ¡Completaste los 4 niveles del SFL!</p>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-ink/10 bg-white p-6 text-center shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">Tu código QR de asistencia</p>
        <img src={estado.qr} alt="Tu código QR" className="mx-auto h-48 w-48 rounded-lg border border-ink/10 p-2" />
        <p className="mt-3 text-xs text-ink/40">Muéstralo en la entrada del evento para que registren tu asistencia más rápido.</p>
      </div>

      {estado.medallas.length > 0 && (
        <div className="mt-5 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-ink/50">Tus medallas</p>
          <div className="flex flex-wrap justify-center gap-2">
            {estado.medallas.map((m, i) => (
              <span key={i} className="rounded-full bg-gold/10 px-3 py-1.5 text-sm font-semibold text-gold">
                {EMOJI_MEDALLA[m.tipo] || '🏅'} {m.tipo}{m.cantidad > 1 ? ` ×${m.cantidad}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 text-center">
        <button onClick={() => setMostrarCambiarPin(v => !v)} className="text-sm text-ink/50 underline hover:text-ink">
          {mostrarCambiarPin ? 'Ocultar' : '¿Quieres cambiar tu PIN?'}
        </button>
      </div>

      {mostrarCambiarPin && (
        <form onSubmit={cambiarPin} autoComplete="off" className="mt-4 space-y-3 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <input
            required type="password" name="pin_actual_participante" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pinActual}
            onChange={e => setPinActual(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            placeholder="PIN actual" className={`${claseInput} tracking-[0.2em]`}
          />
          <input
            required type="password" name="pin_nuevo_participante" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pinNuevo}
            onChange={e => setPinNuevo(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            placeholder="PIN nuevo (4 dígitos)" className={`${claseInput} tracking-[0.2em]`}
          />
          <input
            required type="password" name="pin_confirmar_participante" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pinNuevoConfirmar}
            onChange={e => setPinNuevoConfirmar(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            placeholder="Confirma el PIN nuevo" className={`${claseInput} tracking-[0.2em]`}
          />
          {errorPin && <p className="rounded-lg bg-ember/10 p-2 text-center text-sm text-ember">{errorPin}</p>}
          {mensajePin && <p className="rounded-lg bg-palm/10 p-2 text-center text-sm text-palm">{mensajePin}</p>}
          <button disabled={guardandoPin} className="w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-parchment hover:bg-ember disabled:opacity-60">
            {guardandoPin ? 'Guardando…' : 'Cambiar PIN'}
          </button>
        </form>
      )}

      <div className="mt-8 text-center">
        <button onClick={() => setEstado(null)} className="text-sm text-ink/40 underline hover:text-ink">
          Consultar con otro DNI
        </button>
      </div>
    </div>
  );
}
