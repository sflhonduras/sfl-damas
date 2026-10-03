import { useEffect, useState, useCallback, useMemo } from 'react';
import api, { mensajeError } from '../api';
import { formatearFechaLarga, formatearHora12 } from '../fechas';
import { DEPARTAMENTOS_HONDURAS, MUNICIPIOS_POR_DEPARTAMENTO } from '../listas';

function textoUbicacion(t) {
  if (t.departamento) return [t.departamento, t.municipio].filter(Boolean).join(' — ');
  return t.ciudad || '—';
}

function TarjetaTransporte({ t, servidores, tipos, soloLectura, onGuardar, onEliminar, onAgregarPasajero, onQuitarPasajero }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({
    conductor_id: t.conductor_id || '', tipo_vehiculo_id: t.tipo_vehiculo_id,
    departamento: t.departamento || '', municipio: t.municipio || '',
    fecha_salida: t.fecha_salida?.slice(0, 10) || '', hora_salida: t.hora_salida || '',
    capacidad_personalizada: t.capacidad_personalizada ?? ''
  });
  const municipiosDisponibles = useMemo(() => MUNICIPIOS_POR_DEPARTAMENTO[form.departamento] || [], [form.departamento]);
  const cambiarDepartamento = (e) => setForm(f => ({ ...f, departamento: e.target.value, municipio: '' }));

  const guardar = async () => {
    await onGuardar(t.id, form);
    setEditando(false);
  };

  const idsYaAgregados = new Set(t.pasajeros.map(p => p.id));
  const lleno = t.pasajeros.length >= t.capacidad;

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${t.conflicto ? 'border-ember/50' : 'border-ink/10'}`}>
      {t.conflicto && (
        <p className="mb-2 rounded-lg bg-ember/10 px-3 py-1.5 text-xs font-medium text-ember">
          ⚠ Alguien en este vehículo también está asignado a otro con la misma fecha y hora de salida.
        </p>
      )}

      {!editando ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-ink">{t.tipo_vehiculo_nombre} · {textoUbicacion(t)}</p>
            <p className="text-xs text-ink/50">{formatearFechaLarga(t.fecha_salida)}{t.hora_salida ? ` · ${formatearHora12(t.hora_salida)}` : ''}</p>
            <p className="mt-1 text-sm text-ink/70">Conductor: <strong>{t.conductor_nombre || 'Sin asignar'}</strong></p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${lleno ? 'bg-ember/10 text-ember' : 'bg-palm/10 text-palm'}`}>
              {t.pasajeros.length}/{t.capacidad} cupos
            </span>
            {!soloLectura && (
              <>
                <button onClick={() => setEditando(true)} className="text-xs text-gold hover:underline">Editar</button>
                <button onClick={() => onEliminar(t.id)} className="text-xs text-ember/70 hover:text-ember hover:underline">Eliminar</button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs">
            <span className="mb-1 block text-ink/50">Conductor</span>
            <select value={form.conductor_id} onChange={e => setForm(f => ({ ...f, conductor_id: e.target.value }))} className="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm">
              <option value="">Sin asignar</option>
              {servidores.map(s => <option key={s.id} value={s.id}>{s.nombre_completo}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-ink/50">Vehículo</span>
            <select value={form.tipo_vehiculo_id} onChange={e => setForm(f => ({ ...f, tipo_vehiculo_id: e.target.value }))} className="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm">
              {tipos.map(tv => <option key={tv.id} value={tv.id}>{tv.nombre} ({tv.capacidad})</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-ink/50">Departamento</span>
            <select value={form.departamento} onChange={cambiarDepartamento} className="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm">
              <option value="">Selecciona…</option>
              {DEPARTAMENTOS_HONDURAS.map(d => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-ink/50">Municipio</span>
            <select value={form.municipio} onChange={e => setForm(f => ({ ...f, municipio: e.target.value }))} disabled={!form.departamento} className="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm disabled:bg-ink/5">
              <option value="">{form.departamento ? 'Selecciona…' : 'Primero elige un departamento'}</option>
              {municipiosDisponibles.map(m => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-ink/50">Fecha salida</span>
            <input type="date" value={form.fecha_salida} onChange={e => setForm(f => ({ ...f, fecha_salida: e.target.value }))} className="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-ink/50">Hora salida</span>
            <input type="time" value={form.hora_salida} onChange={e => setForm(f => ({ ...f, hora_salida: e.target.value }))} className="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-ink/50">Cupos (dejar vacío = capacidad normal del vehículo)</span>
            <input
              type="number" min="0" placeholder={String(tipos.find(tv => tv.id === Number(form.tipo_vehiculo_id))?.capacidad ?? '')}
              value={form.capacidad_personalizada}
              onChange={e => setForm(f => ({ ...f, capacidad_personalizada: e.target.value }))}
              className="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex items-end gap-2">
            <button onClick={guardar} className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-night hover:bg-gold-light">Guardar</button>
            <button onClick={() => setEditando(false)} className="rounded-full border border-ink/15 px-4 py-1.5 text-xs text-ink/50 hover:bg-ink/5">Cancelar</button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/5 pt-3">
        {t.pasajeros.map(p => (
          <span key={p.id} className="flex items-center gap-1 rounded-full bg-parchment-2 px-3 py-1 text-xs text-ink/70">
            {p.nombre_completo}
            {!soloLectura && (
              <button onClick={() => onQuitarPasajero(t.id, p.id)} className="text-ink/40 hover:text-ember">✕</button>
            )}
          </span>
        ))}
        {!soloLectura && !lleno && (
          <select
            onChange={e => { if (e.target.value) onAgregarPasajero(t.id, e.target.value); e.target.value = ''; }}
            defaultValue="" className="rounded-full border border-dashed border-ink/20 px-3 py-1 text-xs text-ink/50"
          >
            <option value="">+ agregar pasajero</option>
            {servidores.filter(s => !idsYaAgregados.has(s.id)).map(s => (
              <option key={s.id} value={s.id}>{s.nombre_completo}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export default function AdminTransporte() {
  const usuario = JSON.parse(localStorage.getItem('sfl_user') || 'null');
  const [nivelTransporte, setNivelTransporte] = useState(usuario?.rol === 'super_admin' ? 'edicion' : null);
  const soloLectura = nivelTransporte !== 'edicion';

  useEffect(() => {
    if (usuario?.rol === 'super_admin' || usuario?.rol === 'cocina') return;
    api.get('/admin/mis-permisos').then(r => {
      const permiso = r.data.find(p => p.modulo === 'transporte');
      setNivelTransporte(permiso ? permiso.nivel : 'consulta');
    }).catch(() => setNivelTransporte('consulta'));
  }, []);

  const [evento, setEvento] = useState(null);
  const [transportes, setTransportes] = useState([]);
  const [servidores, setServidores] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState('');
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [tRes, sRes, tvRes] = await Promise.all([
        api.get('/admin/transporte/transportes'),
        api.get('/admin/servidores').catch(() => ({ data: [] })),
        api.get('/admin/transporte/tipos-vehiculo')
      ]);
      setEvento(tRes.data.evento);
      setTransportes(tRes.data.transportes);
      setServidores(sRes.data);
      setTipos(tvRes.data.tipos);
    } catch {
      setError('No se pudo cargar el transporte.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const nuevoTransporte = async () => {
    if (tipos.length === 0) return;
    setCreando(true);
    try {
      await api.post('/admin/transporte/transportes', {
        tipo_vehiculo_id: tipos[0].id, departamento: DEPARTAMENTOS_HONDURAS[0], fecha_salida: new Date().toISOString().slice(0, 10)
      });
      cargar();
    } catch (err) { setError(mensajeError(err)); } finally { setCreando(false); }
  };

  const guardarTransporte = async (id, datos) => {
    try {
      await api.put(`/admin/transporte/transportes/${id}`, datos);
      cargar();
    } catch (err) { setError(mensajeError(err)); }
  };

  const eliminarTransporte = async (id) => {
    if (!confirm('¿Eliminar este transporte?')) return;
    try {
      await api.delete(`/admin/transporte/transportes/${id}`);
      cargar();
    } catch (err) { setError(mensajeError(err)); }
  };

  const agregarPasajero = async (transporteId, servidorId) => {
    try {
      await api.post(`/admin/transporte/transportes/${transporteId}/pasajeros`, { servidor_id: servidorId });
      cargar();
    } catch (err) { setError(mensajeError(err)); }
  };

  const quitarPasajero = async (transporteId, servidorId) => {
    try {
      await api.delete(`/admin/transporte/transportes/${transporteId}/pasajeros/${servidorId}`);
      cargar();
    } catch (err) { setError(mensajeError(err)); }
  };

  const descargar = async (tipo) => {
    setDescargando(tipo);
    try {
      const resp = await fetch(`${api.defaults.baseURL}/admin/transporte/${tipo}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('sfl_token')}` }
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `transporte_sfl.${tipo === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando('');
    }
  };

  if (cargando) return <p className="text-ink/50">Cargando…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Transporte</h1>
          <p className="text-sm text-ink/50">Coordina quién va en carro propio y quién es pasajero para el traslado de servidores.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => descargar('excel')} disabled={descargando !== ''}
            className="rounded-full bg-palm px-5 py-2 text-sm font-semibold text-white hover:bg-palm-light disabled:opacity-60">
            {descargando === 'excel' ? 'Generando…' : '⬇ Excel'}
          </button>
          <button onClick={() => descargar('pdf')} disabled={descargando !== ''}
            className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-60">
            {descargando === 'pdf' ? 'Generando…' : '⬇ Manifiesto PDF'}
          </button>
          {!soloLectura && (
            <button onClick={nuevoTransporte} disabled={creando}
              className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
              {creando ? 'Creando…' : '+ Nuevo transporte'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 rounded-lg bg-ember/10 p-2 text-sm text-ember">{error}</p>}

      {!evento ? (
        <p className="mt-6 text-sm text-ink/50">Todavía no hay ningún nivel marcado como "evento actual". Ve a <strong>Eventos</strong> y marca cuál nivel se está promoviendo ahora mismo.</p>
      ) : (
        <>
          <p className="mt-4 text-sm text-ink/50">Nivel activo: <strong className="text-ink">{evento.nombre}</strong> · {transportes.length} transporte(s)</p>
          <div className="mt-4 space-y-3">
            {transportes.map(t => (
              <TarjetaTransporte
                key={t.id} t={t} servidores={servidores} tipos={tipos} soloLectura={soloLectura}
                onGuardar={guardarTransporte} onEliminar={eliminarTransporte}
                onAgregarPasajero={agregarPasajero} onQuitarPasajero={quitarPasajero}
              />
            ))}
            {transportes.length === 0 && <p className="text-sm text-ink/40">Sin transportes registrados todavía.</p>}
          </div>
        </>
      )}
    </div>
  );
}
