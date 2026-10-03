import { useEffect, useState, useCallback } from 'react';
import api, { mensajeError } from '../api';

const TIPOS = ['Bronce', 'Plata', 'Oro', 'Platino', 'Vuelta Completa'];
const EMOJI = { Bronce: '🥉', Plata: '🥈', Oro: '🥇', Platino: '🏆', 'Vuelta Completa': '🌟' };

export default function AdminMedallas() {
  const usuario = JSON.parse(localStorage.getItem('sfl_user') || 'null');
  const [nivelMedallas, setNivelMedallas] = useState(usuario?.rol === 'super_admin' ? 'edicion' : null);
  const soloLectura = nivelMedallas !== 'edicion';

  useEffect(() => {
    if (usuario?.rol === 'super_admin' || usuario?.rol === 'cocina') return;
    api.get('/admin/mis-permisos').then(r => {
      const permiso = r.data.find(p => p.modulo === 'medallas');
      setNivelMedallas(permiso ? permiso.nivel : 'consulta');
    }).catch(() => setNivelMedallas('consulta'));
  }, []);

  const [medallas, setMedallas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [participantes, setParticipantes] = useState([]);
  const [busquedaParticipante, setBusquedaParticipante] = useState('');
  const [participanteId, setParticipanteId] = useState('');
  const [tipo, setTipo] = useState('Vuelta Completa');
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/admin/medallas-manuales').then(r => setMedallas(r.data)).catch(() => setError('No se pudo cargar la lista.')).finally(() => setCargando(false));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (busquedaParticipante.trim().length < 2) { setParticipantes([]); return; }
    const timeout = setTimeout(() => {
      api.get('/admin/participantes', { params: { buscar: busquedaParticipante, pagina: 1 } })
        .then(r => setParticipantes((r.data.datos || []).slice(0, 8)))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timeout);
  }, [busquedaParticipante]);

  const otorgar = async () => {
    if (!participanteId) { setError('Selecciona un participante de la lista.'); return; }
    setGuardando(true); setError('');
    try {
      await api.post('/admin/medallas-manuales', { participante_id: participanteId, tipo, cantidad, nota });
      setParticipanteId(''); setBusquedaParticipante(''); setCantidad(1); setNota('');
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (id) => {
    if (!confirm('¿Quitar esta medalla otorgada a mano?')) return;
    try {
      await api.delete(`/admin/medallas-manuales/${id}`);
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Medallas manuales</h1>
      <p className="text-sm text-ink/50">
        Para casos que el cálculo automático no detecta bien (datos históricos incompletos, corregidos a mano, etc.) —
        estas medallas se suman a las automáticas en el reporte de "🏅 Repeticiones" de Reportería.
      </p>
      {error && <p className="mt-2 rounded-lg bg-ember/10 p-2 text-sm text-ember">{error}</p>}

      {!soloLectura && (
        <div className="mt-5 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
          <p className="mb-3 font-semibold text-ink">Otorgar una medalla</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-ink/60">Participante</span>
              <input
                value={busquedaParticipante}
                onChange={e => { setBusquedaParticipante(e.target.value); setParticipanteId(''); }}
                placeholder="Escribe el nombre o DNI…"
                className="w-64 rounded-lg border border-ink/15 px-3 py-2 text-sm"
              />
              {participantes.length > 0 && !participanteId && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-ink/10 bg-white shadow-sm">
                  {participantes.map(p => (
                    <button
                      key={p.id} type="button"
                      onClick={() => { setParticipanteId(p.id); setBusquedaParticipante(p.nombre_completo); setParticipantes([]); }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-parchment-2"
                    >
                      {p.nombre_completo} <span className="text-ink/40">· {p.dni}</span>
                    </button>
                  ))}
                </div>
              )}
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-ink/60">Tipo</span>
              <select value={tipo} onChange={e => setTipo(e.target.value)} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                {TIPOS.map(t => <option key={t} value={t}>{EMOJI[t]} {t}</option>)}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-ink/60">Cantidad</span>
              <input type="number" min="1" value={cantidad} onChange={e => setCantidad(e.target.value)} className="w-20 rounded-lg border border-ink/15 px-3 py-2 text-sm" />
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-ink/60">Nota (opcional)</span>
              <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. confirmado por Carlos…" className="w-64 rounded-lg border border-ink/15 px-3 py-2 text-sm" />
            </label>

            <button onClick={otorgar} disabled={guardando || !participanteId}
              className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Otorgar medalla'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-parchment-2 text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-4 py-3">Participante</th>
              <th className="px-4 py-3">Medalla</th>
              <th className="px-4 py-3">Cantidad</th>
              <th className="px-4 py-3">Nota</th>
              <th className="px-4 py-3">Otorgada</th>
              {!soloLectura && <th className="px-4 py-3 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink/40">Cargando…</td></tr>}
            {!cargando && medallas.map(m => (
              <tr key={m.id} className="border-t border-ink/5">
                <td className="px-4 py-2.5 font-medium text-ink">{m.nombre_completo} <span className="text-ink/40">· {m.dni}</span></td>
                <td className="px-4 py-2.5">{EMOJI[m.tipo]} {m.tipo}</td>
                <td className="px-4 py-2.5">{m.cantidad}</td>
                <td className="px-4 py-2.5 text-ink/60">{m.nota || '—'}</td>
                <td className="px-4 py-2.5 text-ink/50">{new Date(m.otorgada_en).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</td>
                {!soloLectura && (
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => eliminar(m.id)} className="text-xs text-ember/70 hover:text-ember hover:underline">Quitar</button>
                  </td>
                )}
              </tr>
            ))}
            {!cargando && medallas.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink/40">Sin medallas otorgadas a mano todavía.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
