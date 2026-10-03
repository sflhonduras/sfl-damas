import { useEffect, useState } from 'react';
import api, { mensajeError } from '../api';

function fechaParaInput(v) {
  if (!v) return '';
  const d = new Date(v);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function horaParaInput(v) {
  if (!v) return '';
  const d = new Date(v);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminEventos() {
  const usuario = JSON.parse(localStorage.getItem('sfl_user') || 'null');
  const soloLectura = usuario?.rol !== 'admin' && usuario?.rol !== 'super_admin';
  const [eventos, setEventos] = useState([]);
  const [guardandoId, setGuardandoId] = useState(null);
  const [mensajes, setMensajes] = useState({});

  const cargar = () => api.get('/admin/eventos').then(r => setEventos(r.data.map(ev => ({
    ...ev,
    _fechaLimite: fechaParaInput(ev.fecha_limite_registro),
    _horaLimite: horaParaInput(ev.fecha_limite_registro) || '23:59',
  }))));
  useEffect(() => { cargar(); }, []);

  const actualizarCampo = (id, campo, valor) => {
    setEventos(evs => evs.map(e => e.id === id ? { ...e, [campo]: valor } : e));
  };

  const guardar = async (ev) => {
    setGuardandoId(ev.id);
    setMensajes(m => ({ ...m, [ev.id]: '' }));
    try {
      const fechaLimiteCompleta = ev._fechaLimite
        ? new Date(`${ev._fechaLimite}T${ev._horaLimite || '23:59'}:00`).toISOString()
        : null;
      await api.put(`/admin/eventos/${ev.orden}`, {
        nombre: ev.nombre, descripcion: ev.descripcion, fecha_evento: ev.fecha_evento || null,
        fecha_evento_fin: ev.fecha_evento_fin || null,
        hora_evento: ev.hora_evento, lugar: ev.lugar,
        fecha_limite_registro: fechaLimiteCompleta,
        activo: ev.activo, cupo_maximo: ev.cupo_maximo || null
      });
      setMensajes(m => ({ ...m, [ev.id]: '✓ Guardado' }));
      setTimeout(() => setMensajes(m => ({ ...m, [ev.id]: '' })), 2000);
    } catch (err) {
      setMensajes(m => ({ ...m, [ev.id]: mensajeError(err) }));
    } finally {
      setGuardandoId(null);
    }
  };

  const iniciarNuevoCiclo = async (ev) => {
    const confirmado = confirm(
      `¿Iniciar un nuevo ciclo para "${ev.nombre}"?\n\n` +
      `Esto NO borra ningún dato — todo el historial se conserva. Pero a partir de ahora, ` +
      `las estadísticas, el contador de registros y la lista de Diplomas de este nivel van a mostrar ` +
      `solo las inscripciones nuevas, como si arrancaras de cero para el próximo evento.\n\n` +
      `Úsalo cuando termines un evento y quieras empezar a contar desde cero para el siguiente.`
    );
    if (!confirmado) return;
    try {
      const { data } = await api.post(`/admin/eventos/${ev.orden}/nuevo-ciclo`);
      setMensajes(m => ({ ...m, [ev.id]: data.mensaje }));
      cargar();

      if (ev.orden === 4) {
        const avanzarPromocion = confirm(
          `El Nivel IV es la graduación final del ciclo. ¿También quieres avanzar a la siguiente promoción?\n\n` +
          `Esto suma +1 al número de promoción que se muestra en Estadísticas Generales.`
        );
        if (avanzarPromocion) {
          const { data: dataPromo } = await api.post('/admin/promocion/avanzar');
          alert(dataPromo.mensaje);
        }
      }
    } catch (err) {
      setMensajes(m => ({ ...m, [ev.id]: mensajeError(err) }));
    }
  };

  const marcarComoActual = async (ev) => {
    try {
      const { data } = await api.post(`/admin/eventos/${ev.orden}/marcar-actual`);
      setMensajes(m => ({ ...m, [ev.id]: data.mensaje }));
      cargar();
    } catch (err) {
      setMensajes(m => ({ ...m, [ev.id]: mensajeError(err) }));
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Configuración de eventos</h1>
      <p className="text-sm text-ink/50">Define fecha, hora, lugar y controla la apertura o cierre del registro de cada nivel.</p>
      <p className="mt-1 text-sm text-ink/50">
        ⭐ El <strong>evento actual</strong> es el que se muestra en el contador del panel y en Diplomas/exportar para llamadas —
        marca aquí cuál nivel es el que se está promoviendo en este momento.
      </p>

      <div className="mt-6 space-y-5">
        {eventos.map(ev => (
          <div key={ev.id} className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-pale font-display font-bold text-ember">{ev.orden}</span>
                <input
                  disabled={soloLectura}
                  className="w-56 sm:w-96 border-b border-transparent bg-transparent font-display text-lg font-semibold text-ink focus:border-gold outline-none disabled:bg-transparent"
                  value={ev.nombre} onChange={e => actualizarCampo(ev.id, 'nombre', e.target.value)}
                />
                <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-medium text-ink/50">Ciclo #{ev.ciclo_actual}</span>
                {ev.es_actual ? (
                  <span className="rounded-full bg-gold px-3 py-1 text-xs font-bold text-night">⭐ Evento actual</span>
                ) : (
                  !soloLectura && (
                    <button onClick={() => marcarComoActual(ev)} type="button"
                      className="rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-ink/50 hover:bg-ink/5">
                      Marcar como evento actual
                    </button>
                  )
                )}
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" disabled={soloLectura} checked={ev.activo} onChange={e => actualizarCampo(ev.id, 'activo', e.target.checked)} />
                {ev.activo ? <span className="text-palm">Registro habilitado</span> : <span className="text-ember">Registro bloqueado</span>}
              </label>
            </div>

            <div className="mt-5 rounded-xl bg-parchment-2 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">📅 Cuándo es el evento</p>
              <div className="grid gap-4 sm:grid-cols-4">
                <label className="block text-sm">
                  <span className="mb-1 block text-ink/60">Fecha inicio</span>
                  <input disabled={soloLectura} type="date" className="w-full rounded-lg border border-ink/15 px-3 py-2 disabled:bg-ink/5"
                    value={ev.fecha_evento ? ev.fecha_evento.slice(0, 10) : ''} onChange={e => actualizarCampo(ev.id, 'fecha_evento', e.target.value)} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-ink/60">Fecha fin (opcional)</span>
                  <input disabled={soloLectura} type="date" className="w-full rounded-lg border border-ink/15 px-3 py-2 disabled:bg-ink/5"
                    value={ev.fecha_evento_fin ? ev.fecha_evento_fin.slice(0, 10) : ''} onChange={e => actualizarCampo(ev.id, 'fecha_evento_fin', e.target.value)} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-ink/60">Hora</span>
                  <input disabled={soloLectura} type="time" className="w-full rounded-lg border border-ink/15 px-3 py-2 disabled:bg-ink/5"
                    value={ev.hora_evento || ''} onChange={e => actualizarCampo(ev.id, 'hora_evento', e.target.value)} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-ink/60">Lugar</span>
                  <input disabled={soloLectura} className="w-full rounded-lg border border-ink/15 px-3 py-2 disabled:bg-ink/5"
                    value={ev.lugar || ''} onChange={e => actualizarCampo(ev.id, 'lugar', e.target.value)} />
                </label>
              </div>
              <p className="mt-2 text-xs text-ink/40">Si dura varios días, deja "Fecha fin" para mostrar el rango completo (ej. "del 10 al 12 de julio").</p>
            </div>

            <div className="mt-4 rounded-xl bg-ember/5 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ember">⏰ Hasta cuándo se puede registrar la gente</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-ink/60">Fecha tope</span>
                  <input disabled={soloLectura} type="date" className="w-full rounded-lg border border-ink/15 px-3 py-2 disabled:bg-ink/5"
                    value={ev._fechaLimite} onChange={e => actualizarCampo(ev.id, '_fechaLimite', e.target.value)} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-ink/60">Hora tope</span>
                  <input disabled={soloLectura} type="time" className="w-full rounded-lg border border-ink/15 px-3 py-2 disabled:bg-ink/5"
                    value={ev._horaLimite} onChange={e => actualizarCampo(ev.id, '_horaLimite', e.target.value)} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-ink/60">Cupo máximo (opcional)</span>
                  <input disabled={soloLectura} type="number" min="0" className="w-full rounded-lg border border-ink/15 px-3 py-2 disabled:bg-ink/5"
                    value={ev.cupo_maximo || ''} onChange={e => actualizarCampo(ev.id, 'cupo_maximo', e.target.value)} />
                </label>
              </div>
              <p className="mt-2 text-xs text-ink/40">Después de esta fecha y hora, el botón de inscripción se bloquea automáticamente para este nivel.</p>
            </div>

            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-ink/60">Descripción</span>
              <textarea disabled={soloLectura} rows={2} className="w-full rounded-lg border border-ink/15 px-3 py-2 disabled:bg-ink/5"
                value={ev.descripcion || ''} onChange={e => actualizarCampo(ev.id, 'descripcion', e.target.value)} />
            </label>

            {!soloLectura && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button onClick={() => guardar(ev)} disabled={guardandoId === ev.id}
                  className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment hover:bg-ember disabled:opacity-60">
                  {guardandoId === ev.id ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button onClick={() => iniciarNuevoCiclo(ev)} type="button"
                  className="rounded-full border border-gold/40 px-5 py-2 text-sm font-semibold text-gold hover:bg-gold/10">
                  🔄 Iniciar nuevo ciclo
                </button>
                {mensajes[ev.id] && <span className="text-sm text-ink/50">{mensajes[ev.id]}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
