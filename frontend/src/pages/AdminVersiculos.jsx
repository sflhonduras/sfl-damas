import { useEffect, useState, useCallback } from 'react';
import api, { mensajeError } from '../api';

const ETIQUETA_CATEGORIA = { general: 'General (todos, cada día)', cumpleanos: 'Especial de cumpleaños' };

export default function AdminVersiculos() {
  const [versiculos, setVersiculos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [texto, setTexto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [categoria, setCategoria] = useState('general');
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/admin/mensajes-biblicos').then(r => setVersiculos(r.data)).catch(() => setError('No se pudo cargar la lista.')).finally(() => setCargando(false));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const limpiarFormulario = () => {
    setTexto(''); setReferencia(''); setCategoria('general'); setEditandoId(null);
  };

  const editar = (v) => {
    setEditandoId(v.id); setTexto(v.texto); setReferencia(v.referencia); setCategoria(v.categoria);
  };

  const guardar = async () => {
    if (!texto.trim() || !referencia.trim()) { setError('Escribe el texto y la referencia (ej. "Salmos 23:1").'); return; }
    setGuardando(true); setError('');
    try {
      if (editandoId) {
        await api.put(`/admin/mensajes-biblicos/${editandoId}`, { texto, referencia, categoria });
      } else {
        await api.post('/admin/mensajes-biblicos', { texto, referencia, categoria });
      }
      limpiarFormulario();
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (v) => {
    try {
      await api.put(`/admin/mensajes-biblicos/${v.id}`, { activo: !v.activo });
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  };

  const eliminar = async (v) => {
    if (!confirm(`¿Eliminar definitivamente este versículo (${v.referencia})? No se puede deshacer.`)) return;
    try {
      await api.delete(`/admin/mensajes-biblicos/${v.id}`);
      if (editandoId === v.id) limpiarFormulario();
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  };

  const general = versiculos.filter(v => v.categoria === 'general');
  const cumpleanos = versiculos.filter(v => v.categoria === 'cumpleanos');
  const contarActivos = (lista) => lista.filter(v => v.activo).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">📖 Versículos del Portal del Servidor</h1>
      <p className="text-sm text-ink/50">
        Dos bancos: el <strong>general</strong> se muestra a todos en el hub del Portal y cambia solo cada día
        (el mismo para todos ese día). El <strong>especial de cumpleaños</strong> reemplaza al general únicamente
        en la pantalla de celebración de quien cumple años. La rotación es automática por fecha — no hay que hacer
        nada para que cambien, solo agregar o desactivar versículos aquí cuando quieras.
      </p>
      {error && <p className="mt-2 rounded-lg bg-ember/10 p-2 text-sm text-ember">{error}</p>}

      <div className="mt-4 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <p className="font-semibold text-ink">{editandoId ? 'Editar versículo' : 'Agregar versículo'}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-ink/60">Texto</span>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3}
              placeholder='Ej. "Jehová es mi pastor; nada me faltará."'
              className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink/60">Referencia</span>
            <input value={referencia} onChange={e => setReferencia(e.target.value)}
              placeholder="Ej. Salmos 23:1"
              className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink/60">Banco</span>
            <select value={categoria} onChange={e => setCategoria(e.target.value)}
              className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm">
              <option value="general">General (todos, cada día)</option>
              <option value="cumpleanos">Especial de cumpleaños</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex gap-3">
          <button onClick={guardar} disabled={guardando}
            className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
            {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : '+ Agregar versículo'}
          </button>
          {editandoId && (
            <button onClick={limpiarFormulario} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink hover:bg-ink/5">
              Cancelar edición
            </button>
          )}
        </div>
      </div>

      {cargando ? (
        <p className="mt-6 text-center text-ink/40">Cargando…</p>
      ) : (
        <>
          <TablaVersiculos titulo={`Banco general (${contarActivos(general)} activo${contarActivos(general) === 1 ? '' : 's'} de ${general.length})`}
            versiculos={general} onEditar={editar} onAlternar={alternarActivo} onEliminar={eliminar} />
          <TablaVersiculos titulo={`Banco especial de cumpleaños (${contarActivos(cumpleanos)} activo${contarActivos(cumpleanos) === 1 ? '' : 's'} de ${cumpleanos.length})`}
            versiculos={cumpleanos} onEditar={editar} onAlternar={alternarActivo} onEliminar={eliminar} />
        </>
      )}
    </div>
  );
}

function TablaVersiculos({ titulo, versiculos, onEditar, onAlternar, onEliminar }) {
  return (
    <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <p className="font-semibold text-ink">{titulo}</p>
      {versiculos.length === 0 ? (
        <p className="mt-3 text-center text-sm text-ink/40">Todavía no hay versículos en este banco.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {versiculos.map(v => (
            <div key={v.id} className={`rounded-xl border p-3 ${v.activo ? 'border-ink/10' : 'border-ink/10 bg-ink/5 opacity-60'}`}>
              <p className="text-sm italic text-ink/80">&ldquo;{v.texto}&rdquo;</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gold">{v.referencia}</span>
                <div className="flex gap-3 text-xs">
                  <button onClick={() => onEditar(v)} className="font-semibold text-gold hover:underline">Editar</button>
                  <button onClick={() => onAlternar(v)} className="font-semibold text-palm hover:underline">
                    {v.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => onEliminar(v)} className="font-semibold text-ember hover:underline">Eliminar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
