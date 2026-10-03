import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import api from '../api';
import { numeroARomano } from '../romano';
import HondurasMapa from '../components/HondurasMapa';

function Kpi({ valor, etiqueta, color }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5 text-center shadow-sm">
      <p className="font-display text-4xl font-bold" style={{ color }}>{valor}</p>
      <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-ink/50">{etiqueta}</p>
    </div>
  );
}

function MiniGrafica({ datos, color, alto }) {
  if (!datos || datos.length === 0) {
    return <p className="py-8 text-center text-sm text-ink/30">Sin datos en esta categoría.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={alto ?? Math.max(140, datos.length * 40)}>
      <BarChart data={datos} layout="vertical" margin={{ left: 10, right: 30 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E7DCC3" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#8A7B5E' }} />
        <YAxis type="category" dataKey="etiqueta" width={140} tick={{ fontSize: 12, fill: '#2B2118' }} />
        <Tooltip cursor={{ fill: '#F1E6CC' }} />
        <Bar dataKey="total" radius={[0, 6, 6, 0]} fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Cada categoría demográfica se separa en dos columnas — Con Requisito y Sin Requisito —
// mismo criterio que ya usa Reportería, para que ambos coincidan si alguien los compara.
function TarjetaCategoria({ titulo, conRequisito, sinRequisito, color }) {
  const totalCR = (conRequisito || []).reduce((s, f) => s + f.total, 0);
  const totalSR = (sinRequisito || []).reduce((s, f) => s + f.total, 0);
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">{titulo}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold text-palm">Con Requisito ({totalCR})</p>
          <MiniGrafica datos={conRequisito} color={color} />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-ember">Sin Requisito ({totalSR})</p>
          <MiniGrafica datos={sinRequisito} color="#B23A2E" />
        </div>
      </div>
    </div>
  );
}

function fusionarPorDepartamento(conRequisito, sinRequisito) {
  const mapa = {};
  for (const f of conRequisito || []) mapa[f.etiqueta] = (mapa[f.etiqueta] || 0) + f.total;
  for (const f of sinRequisito || []) mapa[f.etiqueta] = (mapa[f.etiqueta] || 0) + f.total;
  return Object.entries(mapa).map(([departamento, total]) => ({ departamento, total }));
}

function formatearFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function InformeCierreNivel() {
  const { token } = useParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/informe-publico/${token}`)
      .then(r => setDatos(r.data))
      .catch(() => setError('Este enlace no existe o ya no es válido. Verifica que lo copiaste completo.'));
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-parchment px-6 text-center">
        <p className="text-ink/60">{error}</p>
      </div>
    );
  }
  if (!datos) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-parchment">
        <p className="text-ink/40">Cargando informe…</p>
      </div>
    );
  }

  const [tituloNivel, subtitulo] = (datos.evento_nombre || '').split(/:\s*/, 2);
  const nivelRomano = numeroARomano(datos.evento_orden);
  const urlPptx = `${api.defaults.baseURL}/informe-publico/${token}/pptx`;
  const mapaDatos = fusionarPorDepartamento(datos.departamento?.con_requisito, datos.departamento?.sin_requisito);

  return (
    <div className="min-h-screen bg-parchment">
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* Encabezado */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
            Informe Ejecutivo · Junta Directiva de FIHNEC
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold text-ink">
            SFL Nivel {nivelRomano || datos.evento_orden}
          </h1>
          {subtitulo && <p className="mt-1 text-lg text-ink/60">{subtitulo}</p>}
          <div className="mt-4 flex justify-center">
            {datos.congelado ? (
              <span className="rounded-full bg-ink/5 px-4 py-1.5 text-xs font-semibold text-ink/60">
                Cerrado el {formatearFecha(datos.congelado_en)} · los datos no cambian
              </span>
            ) : (
              <span className="rounded-full bg-palm/10 px-4 py-1.5 text-xs font-semibold text-palm">
                ● En vivo — se actualiza automáticamente hasta que este nivel vuelva a cerrar
              </span>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi valor={datos.inscritos} etiqueta="Inscritos" color="#C9932F" />
          <Kpi valor={datos.registrados} etiqueta="Registrados" color="#F59D24" />
          <Kpi valor={datos.desercion ?? '—'} etiqueta="Deserción" color="#B23A2E" />
          <Kpi valor={datos.porcentaje_desercion != null ? `${datos.porcentaje_desercion}%` : '—'} etiqueta="% Deserción" color="#8A6A3C" />
        </div>
        {datos.sin_requisitos > 0 && (
          <p className="mt-2 text-center text-xs italic text-ink/40">
            Registrados = {datos.registrados_con_requisito} con requisito + {datos.sin_requisitos} sin requisito
          </p>
        )}

        {/* Perfil demográfico */}
        <p className="mb-1 mt-10 font-display text-xl font-bold text-ink">Perfil de los participantes</p>
        <p className="mb-3 text-sm text-ink/50">De los {datos.registrados} registrados en este nivel (con y sin requisito)</p>
        <div className="space-y-4">
          <TarjetaCategoria titulo="Estado civil"
            conRequisito={datos.estado_civil?.con_requisito} sinRequisito={datos.estado_civil?.sin_requisito} color="#F59D24" />
          <TarjetaCategoria titulo="Cargo en FIHNEC"
            conRequisito={datos.cargo_fihnec?.con_requisito} sinRequisito={datos.cargo_fihnec?.sin_requisito} color="#C9932F" />
        </div>

        {/* Distribución geográfica: mapa con el total real (con + sin requisito), y el
            desglose separado debajo para el detalle exacto. */}
        <p className="mb-1 mt-8 font-display text-xl font-bold text-ink">Distribución por departamento</p>
        <p className="mb-3 text-sm text-ink/50">Total real de asistentes (con y sin requisito)</p>
        <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
          <HondurasMapa datos={mapaDatos} />
        </div>
        <div className="mt-4">
          <TarjetaCategoria titulo="Desglose por departamento"
            conRequisito={datos.departamento?.con_requisito} sinRequisito={datos.departamento?.sin_requisito} color="#2F5D3A" />
        </div>

        {/* Descarga */}
        <div className="mt-10 flex justify-center">
          <a href={urlPptx} download
            className="rounded-full bg-night px-8 py-3 text-sm font-semibold text-parchment shadow-sm transition hover:bg-ink">
            ⬇ Descargar como PPTX
          </a>
        </div>

        <p className="mt-10 text-center text-xs text-ink/30">
          FIHNEC · Seminario para la Formación de Líderes · Generado automáticamente al cierre del nivel
        </p>
      </div>
    </div>
  );
}
