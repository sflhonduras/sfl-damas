import { useEffect, useState, useCallback } from 'react';
import api, { mensajeError } from '../api';

function BadgeCantidad({ item, soloLectura, onCambiar }) {
  const bajoUmbral = item.umbral_alerta != null && item.tipo_medida !== 'estado' &&
    Number(item.cantidad_actual ?? 0) < Number(item.umbral_alerta);

  if (item.tipo_medida === 'estado') {
    const listo = item.estado_actual === 'listo';
    return (
      <button
        disabled={soloLectura}
        onClick={() => onCambiar(item.id, { estado_actual: listo ? 'pendiente' : 'listo' })}
        className={`rounded-full px-3 py-1 text-xs font-semibold ${listo ? 'bg-palm/15 text-palm' : 'bg-ember/10 text-ember'}`}
      >
        {listo ? 'Listo' : 'Pendiente'}
      </button>
    );
  }

  if (item.tipo_medida === 'porcentaje') {
    const valor = item.cantidad_actual ?? 0;
    return (
      <div className="flex items-center gap-2">
        <input
          type="range" min="0" max="100" disabled={soloLectura}
          value={valor}
          onChange={e => onCambiar(item.id, { cantidad_actual: e.target.value })}
          className="w-24 accent-gold"
        />
        <span className={`w-10 text-right text-xs font-semibold ${bajoUmbral ? 'text-ember' : 'text-ink/50'}`}>{valor}%</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" min="0" disabled={soloLectura}
        value={item.cantidad_actual ?? ''}
        onChange={e => onCambiar(item.id, { cantidad_actual: e.target.value })}
        className="w-20 rounded-lg border border-ink/15 px-2 py-1 text-sm"
      />
      <span className={`text-xs ${bajoUmbral ? 'font-semibold text-ember' : 'text-ink/40'}`}>unidades</span>
    </div>
  );
}

function FormularioNuevoItem({ onCrear, taller }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [tipoMedida, setTipoMedida] = useState('unidades');
  const [tipoMaterial, setTipoMaterial] = useState('');
  const [umbral, setUmbral] = useState('');

  const crear = async () => {
    if (!nombre.trim()) return;
    await onCrear({ nombre, tipo_medida: tipoMedida, tipo_material: tipoMaterial || null, umbral_alerta: umbral || null });
    setNombre(''); setTipoMaterial(''); setUmbral(''); setAbierto(false);
  };

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="mt-2 text-xs font-semibold text-gold hover:underline">
        + Agregar {taller ? 'material' : 'ítem'}
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-parchment-2 p-3">
      <label className="text-xs">
        <span className="mb-1 block text-ink/50">Nombre</span>
        <input value={nombre} onChange={e => setNombre(e.target.value)} className="w-40 rounded-lg border border-ink/15 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-ink/50">Medida</span>
        <select value={tipoMedida} onChange={e => setTipoMedida(e.target.value)} className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm">
          <option value="unidades">Unidades</option>
          <option value="porcentaje">Porcentaje</option>
          <option value="estado">Listo/Pendiente</option>
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-ink/50">Tipo de material</span>
        <input value={tipoMaterial} onChange={e => setTipoMaterial(e.target.value)} placeholder="Hoja, video, objeto…" className="w-36 rounded-lg border border-ink/15 px-2 py-1.5 text-sm" />
      </label>
      {tipoMedida !== 'estado' && (
        <label className="text-xs">
          <span className="mb-1 block text-ink/50">Umbral de alerta</span>
          <input type="number" value={umbral} onChange={e => setUmbral(e.target.value)} className="w-20 rounded-lg border border-ink/15 px-2 py-1.5 text-sm" />
        </label>
      )}
      <button onClick={crear} className="rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-night hover:bg-gold-light">Guardar</button>
      <button onClick={() => setAbierto(false)} className="rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink/50 hover:bg-ink/5">Cancelar</button>
    </div>
  );
}

function FilaItem({ item, soloLectura, onCambiarCantidad, onEliminar }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-ink/5 py-2">
      <div>
        <p className="text-sm text-ink">{item.nombre}</p>
        {item.tipo_material && <p className="text-[11px] text-ink/40">{item.tipo_material}</p>}
      </div>
      <div className="flex items-center gap-3">
        <BadgeCantidad item={item} soloLectura={soloLectura} onCambiar={onCambiarCantidad} />
        {!soloLectura && (
          <button onClick={() => onEliminar(item.id)} className="text-xs text-ember/70 hover:text-ember hover:underline">Eliminar</button>
        )}
      </div>
    </div>
  );
}

function TarjetaCategoriaFija({ categoria, servidores, soloLectura, onGuardarResponsables, onCrearItem, onCambiarCantidad, onEliminarItem }) {
  const agregarResponsable = (servidorId) => {
    if (!servidorId) return;
    const idsActuales = categoria.responsables.map(r => r.id);
    if (idsActuales.includes(Number(servidorId))) return;
    onGuardarResponsables(categoria.id, [...idsActuales, Number(servidorId)]);
  };
  const quitarResponsable = (servidorId) => {
    onGuardarResponsables(categoria.id, categoria.responsables.filter(r => r.id !== servidorId).map(r => r.id));
  };

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-ink/5 pb-3">
        <p className="font-semibold text-ink">{categoria.nombre}</p>
        <div className="flex flex-wrap items-center gap-2">
          {categoria.responsables.map(r => (
            <span key={r.id} className="flex items-center gap-1 rounded-full bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
              {r.nombre_completo}
              {!soloLectura && (
                <button onClick={() => quitarResponsable(r.id)} className="text-gold/60 hover:text-ember">✕</button>
              )}
            </span>
          ))}
          {!soloLectura && (
            <select onChange={e => { agregarResponsable(e.target.value); e.target.value = ''; }} defaultValue="" className="rounded-full border border-ink/15 px-2 py-1 text-xs">
              <option value="">+ Responsable</option>
              {servidores.map(s => <option key={s.id} value={s.id}>{s.nombre_completo}</option>)}
            </select>
          )}
        </div>
      </div>

      <div>
        {categoria.items.map(item => (
          <FilaItem
            key={item.id} item={item} soloLectura={soloLectura}
            onCambiarCantidad={(id, cambio) => onCambiarCantidad(id, cambio)}
            onEliminar={onEliminarItem}
          />
        ))}
        {categoria.items.length === 0 && <p className="py-3 text-sm text-ink/40">Sin ítems todavía.</p>}
      </div>

      {!soloLectura && <FormularioNuevoItem onCrear={(datos) => onCrearItem(categoria.id, datos)} />}
    </div>
  );
}

function TarjetaConferencia({ conferencia, servidores, soloLectura, onGuardarResponsable, onCrearItem, onCambiarCantidad, onEliminarItem }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{conferencia.numero} · {conferencia.nombre}</p>
        {soloLectura ? (
          <span className="text-xs text-ink/50">{conferencia.responsable_nombre || 'Sin asignar'}</span>
        ) : (
          <select
            value={conferencia.responsable_id || ''}
            onChange={e => onGuardarResponsable(conferencia.id, e.target.value || null)}
            className="rounded-full border border-ink/15 px-2 py-1 text-xs"
          >
            <option value="">Responsable: sin asignar</option>
            {servidores.map(s => <option key={s.id} value={s.id}>{s.nombre_completo}</option>)}
          </select>
        )}
      </div>

      {conferencia.items.length > 0 && (
        <div className="mt-2">
          {conferencia.items.map(item => (
            <FilaItem
              key={item.id} item={item} soloLectura={soloLectura}
              onCambiarCantidad={onCambiarCantidad}
              onEliminar={onEliminarItem}
            />
          ))}
        </div>
      )}
      {!soloLectura && <FormularioNuevoItem taller onCrear={(datos) => onCrearItem(conferencia.id, datos)} />}
    </div>
  );
}

export default function AdminInventario() {
  const usuario = JSON.parse(localStorage.getItem('sfl_user') || 'null');
  const [nivelInventario, setNivelInventario] = useState(usuario?.rol === 'super_admin' ? 'edicion' : null);
  const soloLectura = nivelInventario !== 'edicion';

  useEffect(() => {
    if (usuario?.rol === 'super_admin' || usuario?.rol === 'cocina') return;
    api.get('/admin/mis-permisos').then(r => {
      const permiso = r.data.find(p => p.modulo === 'inventario');
      setNivelInventario(permiso ? permiso.nivel : 'consulta');
    }).catch(() => setNivelInventario('consulta'));
  }, []);

  const [categorias, setCategorias] = useState([]);
  const [talleres, setTalleres] = useState({ evento: null, conferencias: [] });
  const [servidores, setServidores] = useState([]);
  const [pestana, setPestana] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState('');

  const descargar = async (tipo) => {
    setDescargando(tipo);
    try {
      const resp = await fetch(`${api.defaults.baseURL}/admin/inventario/${tipo}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('sfl_token')}` }
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `inventario_sfl.${tipo === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando('');
    }
  };

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [catRes, tallRes, servRes] = await Promise.all([
        api.get('/admin/inventario/categorias'),
        api.get('/admin/inventario/talleres'),
        api.get('/admin/servidores').catch(() => ({ data: [] }))
      ]);
      setCategorias(catRes.data.categorias);
      setTalleres(tallRes.data);
      setServidores(servRes.data);
      setPestana(p => p || (catRes.data.categorias[0]?.id ?? 'talleres'));
    } catch {
      setError('No se pudo cargar el inventario.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const guardarResponsables = async (categoriaId, servidorIds) => {
    try {
      await api.put(`/admin/inventario/categorias/${categoriaId}/responsables`, { servidor_ids: servidorIds });
      cargar();
    } catch (err) { setError(mensajeError(err)); }
  };

  const crearItemCategoria = async (categoriaId, datos) => {
    try {
      await api.post(`/admin/inventario/categorias/${categoriaId}/items`, datos);
      cargar();
    } catch (err) { setError(mensajeError(err)); }
  };

  const crearItemTaller = async (conferenciaId, datos) => {
    try {
      await api.post(`/admin/inventario/conferencias/${conferenciaId}/items`, datos);
      cargar();
    } catch (err) { setError(mensajeError(err)); }
  };

  const eliminarItem = async (itemId) => {
    if (!confirm('¿Eliminar este ítem del inventario?')) return;
    try {
      await api.delete(`/admin/inventario/items/${itemId}`);
      cargar();
    } catch (err) { setError(mensajeError(err)); }
  };

  const cambiarCantidad = async (itemId, cambio) => {
    // Actualiza en pantalla de inmediato (optimista) y guarda en el servidor.
    setCategorias(cs => cs.map(c => ({ ...c, items: c.items.map(i => i.id === itemId ? { ...i, ...cambio } : i) })));
    setTalleres(t => ({ ...t, conferencias: t.conferencias.map(c => ({ ...c, items: c.items.map(i => i.id === itemId ? { ...i, ...cambio } : i) })) }));
    try {
      await api.put(`/admin/inventario/items/${itemId}/cantidad`, cambio);
    } catch (err) { setError(mensajeError(err)); cargar(); }
  };

  const guardarResponsableConferencia = async (conferenciaId, servidorId) => {
    try {
      await api.put(`/admin/inventario/conferencias/${conferenciaId}/responsable`, { servidor_id: servidorId });
      cargar();
    } catch (err) { setError(mensajeError(err)); }
  };

  if (cargando) return <p className="text-ink/50">Cargando…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Inventario</h1>
          <p className="text-sm text-ink/50">Equipo, insumos y materiales del SFL, organizados por categoría. La cantidad se guarda por evento.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => descargar('excel')} disabled={descargando !== ''}
            className="rounded-full bg-palm px-5 py-2 text-sm font-semibold text-white hover:bg-palm-light disabled:opacity-60">
            {descargando === 'excel' ? 'Generando…' : '⬇ Excel'}
          </button>
          <button onClick={() => descargar('pdf')} disabled={descargando !== ''}
            className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-60">
            {descargando === 'pdf' ? 'Generando…' : '⬇ PDF'}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 rounded-lg bg-ember/10 p-2 text-sm text-ember">{error}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {categorias.map(c => (
          <button key={c.id} onClick={() => setPestana(c.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${pestana === c.id ? 'bg-ink text-parchment' : 'border border-ink/15 text-ink/60 hover:bg-ink/5'}`}>
            {c.nombre}
          </button>
        ))}
        <button onClick={() => setPestana('talleres')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${pestana === 'talleres' ? 'bg-ink text-parchment' : 'border border-ink/15 text-ink/60 hover:bg-ink/5'}`}>
          Talleres
        </button>
      </div>

      <div className="mt-5 space-y-4">
        {pestana !== 'talleres' && categorias.filter(c => c.id === pestana).map(c => (
          <TarjetaCategoriaFija
            key={c.id} categoria={c} servidores={servidores} soloLectura={soloLectura}
            onGuardarResponsables={guardarResponsables}
            onCrearItem={crearItemCategoria}
            onCambiarCantidad={cambiarCantidad}
            onEliminarItem={eliminarItem}
          />
        ))}

        {pestana === 'talleres' && (
          <div>
            {!talleres.evento ? (
              <p className="text-sm text-ink/50">Todavía no hay ningún nivel marcado como "evento actual". Ve a <strong>Eventos</strong> y marca cuál nivel se está promoviendo ahora mismo.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-ink/50">
                  Nivel activo: <strong className="text-ink">{talleres.evento.nombre}</strong> · se sincroniza automáticamente desde Eventos · {talleres.conferencias.length} conferencias
                </p>
                <div className="space-y-3">
                  {talleres.conferencias.map(conf => (
                    <TarjetaConferencia
                      key={conf.id} conferencia={conf} servidores={servidores} soloLectura={soloLectura}
                      onGuardarResponsable={guardarResponsableConferencia}
                      onCrearItem={crearItemTaller}
                      onCambiarCantidad={cambiarCantidad}
                      onEliminarItem={eliminarItem}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
