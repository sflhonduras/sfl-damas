import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';
import { HONDURAS_GEO } from '../hondurasGeo';
import logoFihnec from '../assets/logo-navbar.png';

const IZQUIERDA = ['Atlántida', 'Choluteca', 'Colón', 'Comayagua', 'Copán', 'Cortés', 'El Paraíso', 'Francisco Morazán', 'Gracias a Dios'];
const DERECHA = ['Intibucá', 'Islas de la Bahía', 'La Paz', 'Lempira', 'Ocotepeque', 'Olancho', 'Santa Bárbara', 'Valle', 'Yoro'];

function colorPara(total, maxTotal) {
  if (!total) return '#EDE6D3';
  const intensidad = total / maxTotal;
  const r1 = 231, g1 = 184, b1 = 92, r2 = 178, g2 = 58, b2 = 46;
  return `rgb(${Math.round(r1 + (r2 - r1) * intensidad)},${Math.round(g1 + (g2 - g1) * intensidad)},${Math.round(b1 + (b2 - b1) * intensidad)})`;
}

function TarjetaDepartamento({ info }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-ink">{info.etiqueta}</span>
        <span className="text-xs font-bold text-gold">{info.total}</span>
      </div>
      <div className="border-t border-ink/10 px-3 py-2">
        <p className="mb-1.5 text-[10px] text-ink/40">{info.porcentaje}% del total</p>
        {info.cargos.length === 0 ? (
          <p className="text-[10px] text-ink/30">Sin datos todavía.</p>
        ) : (
          <div className="space-y-1">
            {info.cargos.map(c => (
              <div key={c.etiqueta} className="flex items-center gap-1.5">
                <span className="w-16 shrink-0 truncate text-[10px] text-ink/50">{c.etiqueta}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-gold-pale">
                  <div className="h-full bg-gold" style={{ width: `${info.total ? (c.total / info.total) * 100 : 0}%` }} />
                </div>
                <span className="w-3 shrink-0 text-[10px] text-ink/60">{c.total}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RegistroEnVivo() {
  const { token } = useParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  // Array, no Set — así se conserva el orden real en que se fue dando clic.
  const [seleccionados, setSeleccionados] = useState([]);
  const [hover, setHover] = useState(null);
  const primeraCarga = useRef(true);

  useEffect(() => {
    const cargar = () => {
      api.get(`/registro-en-vivo/${token}`)
        .then(r => setDatos(r.data))
        .catch(() => { if (primeraCarga.current) setError('Este enlace no existe o ya venció.'); })
        .finally(() => { primeraCarga.current = false; });
    };
    cargar();
    const intervalo = setInterval(cargar, 30000);
    return () => clearInterval(intervalo);
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
        <p className="text-ink/40">Cargando…</p>
      </div>
    );
  }

  const [tituloNivel, subtitulo] = (datos.nombre || '').split(/:\s*/, 2);
  const porNombre = Object.fromEntries(datos.departamentos.map(d => [d.etiqueta, d]));
  const maxTotal = Math.max(1, ...datos.departamentos.map(d => d.total));
  const [vbX, vbY, vbW, vbH] = HONDURAS_GEO.viewBox.split(' ').map(Number);

  const alClicar = (nombre) => {
    if (!porNombre[nombre]?.total) return;
    setSeleccionados(prev =>
      prev.includes(nombre) ? prev.filter(n => n !== nombre) : [...prev, nombre]
    );
  };

  return (
    <div className="min-h-screen bg-parchment">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="text-center">
          <img src={logoFihnec} alt="FIHNEC" className="mx-auto h-10 opacity-90" />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr_220px]">
          <div className="space-y-2">
            {seleccionados.filter(n => IZQUIERDA.includes(n)).map(nombre => (
              <TarjetaDepartamento key={nombre} info={porNombre[nombre]} />
            ))}
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-ink/10 bg-white p-3">
            <div className="absolute inset-x-0 top-0 flex h-1.5">
              <div className="flex-1 bg-[#C9932F]" />
              <div className="flex-1 bg-[#9A6136]" />
              <div className="flex-1 bg-[#F59D24]" />
              <div className="flex-1 bg-[#2F5D3A]" />
            </div>
            <span className="absolute right-3 top-4 inline-flex items-center gap-1.5 rounded-full bg-ember/10 px-3 py-1 text-[10px] font-semibold text-ember">
              <span className="h-1.5 w-1.5 rounded-full bg-ember" />
              En vivo
            </span>

            <div className="pt-4 text-center">
              <p className="font-display text-2xl font-bold text-ink">{tituloNivel}</p>
              {subtitulo && <p className="text-sm text-ink/50">{subtitulo}</p>}
            </div>

            <p className="mt-2 text-center font-display text-5xl font-bold text-ink">{datos.total}</p>
            <p className="text-center text-sm text-ink/50">Participantes</p>

            <svg viewBox={HONDURAS_GEO.viewBox} className="-mt-2 w-full" style={{ maxHeight: 420 }}>
              {Object.entries(HONDURAS_GEO.departamentos).map(([nombre, geo]) => {
                const info = porNombre[nombre];
                return (
                  <path key={nombre} d={geo.path} fill={colorPara(info?.total || 0, maxTotal)}
                    stroke="#FBF6EC" strokeWidth={1.5}
                    className="cursor-pointer"
                    onMouseEnter={() => setHover({ nombre, x: geo.centroid[0], y: geo.centroid[1] })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => alClicar(nombre)} />
                );
              })}
              {/* Rojo tenue encima del departamento sobre el que está el mouse — una capa
                  aparte, para no pelear con el color de intensidad de fondo. */}
              {hover && (
                <path d={HONDURAS_GEO.departamentos[hover.nombre].path} fill="#B23A2E" fillOpacity={0.28} className="pointer-events-none" />
              )}
              {Object.entries(HONDURAS_GEO.departamentos).map(([nombre, geo]) => {
                const info = porNombre[nombre];
                if (!info?.total) return null;
                return (
                  <text key={nombre + '-label'} x={geo.centroid[0]} y={geo.centroid[1]}
                    textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="700"
                    fill={info.total / maxTotal > 0.4 ? '#FBF6EC' : '#1B140E'} className="pointer-events-none">
                    {info.total}
                  </text>
                );
              })}
            </svg>

            {hover && porNombre[hover.nombre] && (
              <div
                className="pointer-events-none absolute z-10 min-w-[160px] rounded-lg border border-ink/10 bg-white px-3 py-2 text-xs shadow-lg"
                style={{ left: `${(hover.x / vbW) * 100}%`, top: `${(hover.y / vbH) * 100}%`, transform: 'translate(-50%, -115%)' }}
              >
                <p className="font-semibold text-ink">{hover.nombre}</p>
                <p className="text-ink/60">
                  {porNombre[hover.nombre].total} participante(s) · {porNombre[hover.nombre].porcentaje}% del total
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {seleccionados.filter(n => DERECHA.includes(n)).map(nombre => (
              <TarjetaDepartamento key={nombre} info={porNombre[nombre]} />
            ))}
          </div>
        </div>

        {seleccionados.length === 0 && (
          <p className="mt-3 text-center text-xs text-ink/30">Toca un departamento en el mapa para ver su detalle aquí a los lados.</p>
        )}
      </div>
    </div>
  );
}
