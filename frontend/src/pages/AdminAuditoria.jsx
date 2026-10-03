import { useEffect, useState, useCallback } from 'react';
import api from '../api';

const ETIQUETA_TIPO = { login: '🔑 Inicio de sesión', accion: '✏️ Acción' };

export default function AdminAuditoria() {
  const [usuarios, setUsuarios] = useState([]);
  const [usuarioFiltro, setUsuarioFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [resultado, setResultado] = useState({ datos: [], total: 0, limite: 50 });
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(false);

  useEffect(() => { api.get('/admin/auditoria/usuarios').then(r => setUsuarios(r.data)); }, []);

  const cargar = useCallback(() => {
    setCargando(true);
    const params = { pagina };
    if (usuarioFiltro) params.usuario = usuarioFiltro;
    if (tipoFiltro) params.tipo = tipoFiltro;
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    api.get('/admin/auditoria', { params }).then(r => setResultado(r.data)).finally(() => setCargando(false));
  }, [pagina, usuarioFiltro, tipoFiltro, desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const totalPaginas = Math.max(Math.ceil(resultado.total / resultado.limite), 1);
  const claseSelect = 'rounded-lg border border-ink/15 px-3 py-2 text-sm';

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Auditoría del panel</h1>
      <p className="text-sm text-ink/50">Quién hizo qué y cuándo — inicios de sesión y acciones que crean, editan o eliminan datos.</p>

      <div className="mt-5 flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-ink/60">Usuario</span>
          <select value={usuarioFiltro} onChange={e => { setUsuarioFiltro(e.target.value); setPagina(1); }} className={claseSelect}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink/60">Tipo</span>
          <select value={tipoFiltro} onChange={e => { setTipoFiltro(e.target.value); setPagina(1); }} className={claseSelect}>
            <option value="">Todos</option>
            <option value="login">Inicios de sesión</option>
            <option value="accion">Acciones</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink/60">Desde</span>
          <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPagina(1); }} className={claseSelect} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink/60">Hasta</span>
          <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPagina(1); }} className={claseSelect} />
        </label>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-parchment-2 text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-4 py-3">Fecha y hora</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink/40">Cargando…</td></tr>}
            {!cargando && resultado.datos.map(a => (
              <tr key={a.id} className="border-t border-ink/5">
                <td className="px-4 py-2.5 text-ink/60">{new Date(a.creado_en).toLocaleString('es-HN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-4 py-2.5 font-medium text-ink">{a.usuario_nombre || 'Usuario eliminado'}</td>
                <td className="px-4 py-2.5 text-ink/70">{ETIQUETA_TIPO[a.tipo] || a.tipo}</td>
                <td className="px-4 py-2.5 text-ink/60">
                  {a.tipo === 'accion' ? (
                    <>
                      <span className="font-mono text-xs text-ink/40">{a.metodo} {a.ruta}</span>
                      {a.resumen && <span className="ml-2">— {a.resumen}</span>}
                    </>
                  ) : (a.resumen || '—')}
                </td>
              </tr>
            ))}
            {!cargando && resultado.datos.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-ink/40">Sin resultados con estos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-ink/50">
        <span>Página {pagina} de {totalPaginas} · {resultado.total} registro(s)</span>
        <div className="flex gap-2">
          <button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className="rounded-lg border border-ink/15 px-3 py-1 disabled:opacity-40">Anterior</button>
          <button disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)} className="rounded-lg border border-ink/15 px-3 py-1 disabled:opacity-40">Siguiente</button>
        </div>
      </div>
    </div>
  );
}
