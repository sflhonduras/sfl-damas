import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import api from '../api';
import { numeroARomano } from '../romano';
import HondurasMapa from '../components/HondurasMapa';

const COLORES = ['#C9932F', '#B23A2E', '#2F5D3A', '#8A6A3C', '#6B7280'];

function Tarjeta({ titulo, valor, nota, desercion, onClick, color = '#9A6136' }) {
  return (
    <button
      onClick={onClick}
      style={{ borderLeftColor: color }}
      className={`rounded-2xl border border-ink/10 border-l-4 bg-white p-3 text-left shadow-sm transition ${onClick ? 'hover:border-gold/40 hover:shadow-md cursor-pointer' : ''}`}
    >
      <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-ink/50">{titulo}</p>
      <p className="mt-1.5 font-display text-2xl font-bold text-ink">{valor}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        {nota && <p className="text-[10px] text-ink/40">{nota}</p>}
        {desercion != null && (
          <p className="rounded-full bg-ember/10 px-2 py-0.5 text-[10px] font-semibold text-ember">
            ⚠ {desercion} deserción
          </p>
        )}
      </div>
    </button>
  );
}

export default function AdminDashboard() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [enlaceCopiado, setEnlaceCopiado] = useState(false);
  const [enlaceEnVivo, setEnlaceEnVivo] = useState(null);
  const [enlaceEnVivoCopiado, setEnlaceEnVivoCopiado] = useState(false);
  const nav = useNavigate();
  const [vistaMapa, setVistaMapa] = useState('historico');
  const [nivelMapa, setNivelMapa] = useState(2);
  const [mapaDatos, setMapaDatos] = useState(null);
  const [mapaError, setMapaError] = useState('');
  const [mapaSufijo, setMapaSufijo] = useState('');
  const [cargandoMapa, setCargandoMapa] = useState(false);

  useEffect(() => {
    api.get('/admin/estadisticas').then(r => setDatos(r.data)).catch(() => setError('No se pudieron cargar las estadísticas.'));
    api.get('/admin/enlace-en-vivo').then(r => setEnlaceEnVivo(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setCargandoMapa(true);
    setMapaError('');
    const params = { vista: vistaMapa };
    if (vistaMapa === 'nivel' || vistaMapa === 'desercion') params.nivel = nivelMapa;
    api.get('/admin/estadisticas/mapa', { params })
      .then(r => { setMapaDatos(r.data.mapa); setMapaSufijo(r.data.sufijo || ''); })
      .catch(() => setMapaError('No se pudo cargar el mapa con esta vista.'))
      .finally(() => setCargandoMapa(false));
  }, [vistaMapa, nivelMapa]);

  if (error) return <p className="text-ember">{error}</p>;
  if (!datos) return <p className="text-ink/50">Cargando estadísticas…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Estadísticas generales</h1>
        <p className="text-sm text-ink/50">Vista en tiempo real de la base de datos SFL. Haz clic en una tarjeta o barra para ver el detalle.</p>
      </div>

      {(datos.promocion_actual || datos.total_graduados_nivel_4 != null || datos.ultimo_informe || enlaceEnVivo) && (
        <div className="flex flex-wrap gap-4">
          {datos.promocion_actual && (
            <div className="flex flex-1 min-w-[260px] items-center gap-4 rounded-2xl border border-gold/30 bg-gold/10 px-6 py-4">
              <span className="font-display text-4xl font-bold text-gold">{numeroARomano(datos.promocion_actual)}</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Promoción actual</p>
                <p className="text-sm text-ink/60">Se está cursando la Promoción {numeroARomano(datos.promocion_actual)} ({datos.promocion_actual}ª)</p>
              </div>
            </div>
          )}
          {datos.total_graduados_nivel_4 != null && (
            <button
              onClick={() => nav('/admin/reportes?evento=4')}
              className="flex flex-1 min-w-[260px] items-center gap-4 rounded-2xl border border-palm/30 bg-palm/10 px-6 py-4 text-left transition hover:border-palm/60 hover:shadow-md"
            >
              <span className="font-display text-4xl font-bold text-palm">🎓</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Total graduados</p>
                <p className="text-sm text-ink/60"><span className="font-display text-xl font-bold text-palm">{datos.total_graduados_nivel_4}</span> personas han completado el Nivel IV en toda la historia</p>
              </div>
            </button>
          )}
          {datos.total_sin_requisitos != null && (
            <button
              onClick={() => nav('/admin/diplomas/sin-requisitos')}
              className="flex flex-1 min-w-[260px] items-center gap-4 rounded-2xl border border-gold/30 bg-gold/10 px-6 py-4 text-left transition hover:border-gold/60 hover:shadow-md"
            >
              <span className="font-display text-4xl font-bold text-gold">📋</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Sin requisitos</p>
                <p className="text-sm text-ink/60"><span className="font-display text-xl font-bold text-gold">{datos.total_sin_requisitos}</span> participante(s) esperando ponerse al día</p>
              </div>
            </button>
          )}
          {datos.ultimo_informe && (
            <div className="flex flex-1 min-w-[260px] items-center gap-4 rounded-2xl border border-ember/30 bg-ember/10 px-6 py-4">
              <span className="font-display text-4xl font-bold text-ember">📊</span>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                  Informe {datos.ultimo_informe.congelado ? 'de cierre' : 'en vivo'}
                </p>
                <p className="text-sm text-ink/60">
                  SFL Nivel {numeroARomano(datos.ultimo_informe.evento_orden)} — para la Junta Directiva de FIHNEC
                </p>
                <div className="mt-1.5 flex items-center gap-3">
                  <a
                    href={`${window.location.origin}/informe/${datos.ultimo_informe.token}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs font-semibold text-ember hover:underline"
                  >
                    Ver informe →
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/informe/${datos.ultimo_informe.token}`);
                      setEnlaceCopiado(true);
                      setTimeout(() => setEnlaceCopiado(false), 2000);
                    }}
                    className="text-xs font-semibold text-ember hover:underline"
                  >
                    {enlaceCopiado ? '✓ ¡Copiado!' : '📋 Copiar enlace'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {enlaceEnVivo && (
            <div className="flex flex-1 min-w-[260px] items-center gap-4 rounded-2xl border border-palm/30 bg-palm/10 px-6 py-4">
              <span className="font-display text-4xl font-bold text-palm">📍</span>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Registro en vivo</p>
                <p className="text-sm text-ink/60">Mapa y conteo en tiempo real — enlace público, vence en 72 horas</p>
                <div className="mt-1.5 flex items-center gap-3">
                  <a
                    href={`${window.location.origin}/en-vivo/${enlaceEnVivo.token}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs font-semibold text-palm hover:underline"
                  >
                    Ver en vivo →
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/en-vivo/${enlaceEnVivo.token}`);
                      setEnlaceEnVivoCopiado(true);
                      setTimeout(() => setEnlaceEnVivoCopiado(false), 2000);
                    }}
                    className="text-xs font-semibold text-palm hover:underline"
                  >
                    {enlaceEnVivoCopiado ? '✓ ¡Copiado!' : '📋 Copiar enlace'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tarjeta titulo="Total histórico" valor={datos.total_participantes} nota="Todos los registros" color="#9A6136"
          onClick={() => nav('/admin/reportes?evento=todos')} />
        {datos.por_evento.map((e, i) => (
          <Tarjeta key={e.orden} titulo={`${e.es_actual ? '⭐ ' : ''}Nivel ${e.orden} · Ciclo #${e.ciclo_actual}`} valor={e.total_ciclo_actual}
            nota={`${e.total_inscritos} histórico`} desercion={e.desercion}
            color={['#C9932F', '#F59D24', '#2F5D3A', '#9A6136'][i % 4]}
            onClick={() => nav(`/admin/reportes?evento=${e.orden}&alcance=ciclo_actual`)} />
        ))}
      </div>
      <a
        href={`${api.defaults.baseURL}/admin/estadisticas/excel`}
        onClick={(e) => {
          e.preventDefault();
          fetch(`${api.defaults.baseURL}/admin/estadisticas/excel`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('sfl_token')}` }
          }).then(r => r.blob()).then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'estadisticas_sfl.xlsx'; a.click();
          });
        }}
        className="inline-block rounded-full bg-palm px-5 py-2 text-sm font-semibold text-white hover:bg-palm-light"
      >
        ⬇ Exportar estadísticas a Excel
      </a>

      {datos.graduados_por_promocion && datos.graduados_por_promocion.length > 0 && (
        <div className="rounded-2xl border border-ink/10 border-l-4 border-l-[#C9932F] bg-white p-5 shadow-sm">
          <p className="mb-1 font-semibold text-ink">🎓 Graduados por Promoción</p>
          <p className="mb-4 text-xs text-ink/40">Graduados del Nivel IV agrupados por promoción. Haz clic para ver el reporte completo de esa promoción.</p>
          <div className="flex flex-wrap gap-3">
            {datos.graduados_por_promocion.map(p => (
              <button
                key={p.promocion}
                onClick={() => nav(`/admin/reportes?evento=4&promocion=${encodeURIComponent(p.promocion)}`)}
                className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-center hover:border-gold/60 hover:shadow-md"
              >
                <p className="font-display text-xl font-bold text-gold">{/^\d+$/.test(p.promocion) ? numeroARomano(parseInt(p.promocion, 10)) : p.promocion}</p>
                <p className="text-[10px] text-ink/50">{p.total} graduado(s)</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-ink/10 border-l-4 border-l-[#2F5D3A] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 font-semibold text-ink">🗺️ Mapa de Honduras</p>
            <p className="text-xs text-ink/40">Pasa el mouse para ver los municipios, o haz clic en un departamento para ver el reporte completo.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={vistaMapa} onChange={e => setVistaMapa(e.target.value)} className="rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs">
              <option value="historico">Total histórico</option>
              <option value="ciclo_actual">Solo ciclo actual</option>
              <option value="nivel">Por nivel específico</option>
              <option value="desercion">Tasa de deserción</option>
            </select>
            {vistaMapa === 'nivel' && (
              <select value={nivelMapa} onChange={e => setNivelMapa(Number(e.target.value))} className="rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs">
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>Nivel {n}</option>)}
              </select>
            )}
            {vistaMapa === 'desercion' && (
              <select value={nivelMapa === 1 ? 2 : nivelMapa} onChange={e => setNivelMapa(Number(e.target.value))} className="rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs">
                {[2, 3, 4].map(n => <option key={n} value={n}>Deserción Nivel {n}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="mt-4">
          {cargandoMapa ? (
            <p className="py-10 text-center text-sm text-ink/40">Cargando mapa…</p>
          ) : mapaError ? (
            <p className="py-10 text-center text-sm text-ember">{mapaError}</p>
          ) : !mapaDatos ? (
            <p className="py-10 text-center text-sm text-ink/40">Sin datos para mostrar.</p>
          ) : (
            <HondurasMapa
              datos={mapaDatos}
              sufijo={mapaSufijo}
              onDepartamentoClick={(departamento) => nav(`/admin/reportes?evento=todos&departamento=${encodeURIComponent(departamento)}`)}
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink/10 border-l-4 border-l-[#C9932F] bg-white p-5 shadow-sm">
          <p className="mb-4 font-semibold text-ink">Embudo de avance por nivel</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={datos.embudo} onClick={(e) => e?.activeLabel && nav(`/admin/participantes?evento=${e.activeLabel}`)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
              <XAxis dataKey="orden" tickFormatter={v => `Nivel ${v}`} fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip labelFormatter={v => `Nivel ${v}`} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="#C9932F" className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-ink/10 border-l-4 border-l-[#9A6136] bg-white p-5 shadow-sm">
          <p className="mb-4 font-semibold text-ink">Distribución de participantes por nivel</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={datos.por_evento}
                dataKey="total_inscritos"
                nameKey="nombre"
                cx="50%" cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                onClick={(d) => nav(`/admin/participantes?evento=${d.orden}`)}
                className="cursor-pointer"
              >
                {datos.por_evento.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-ink/10 border-l-4 border-l-[#2F5D3A] bg-white p-5 shadow-sm">
          <p className="mb-4 font-semibold text-ink">Participantes por zona</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={datos.por_zona.slice(0, 12)} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
              <XAxis type="number" fontSize={12} allowDecimals={false} />
              <YAxis type="category" dataKey="zona" fontSize={10} width={110} />
              <Tooltip />
              <Bar dataKey="total" radius={[0, 6, 6, 0]} fill="#2F5D3A" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-ink/10 border-l-4 border-l-ember bg-white p-5 shadow-sm">
          <p className="mb-4 font-semibold text-ink">Participantes por departamento</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={datos.por_departamento} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
              <XAxis type="number" fontSize={12} allowDecimals={false} />
              <YAxis type="category" dataKey="departamento" fontSize={10} width={130} />
              <Tooltip />
              <Bar dataKey="total" radius={[0, 6, 6, 0]} fill="#B23A2E" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
