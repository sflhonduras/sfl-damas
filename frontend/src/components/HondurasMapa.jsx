import { useMemo, useState, useRef } from 'react';
import { HONDURAS_GEO } from '../hondurasGeo';

export default function HondurasMapa({ datos, onDepartamentoClick, sufijo = '' }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const [descargando, setDescargando] = useState(false);

  const descargarComoImagen = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    setDescargando(true);

    const [, , vbWidth, vbHeight] = HONDURAS_GEO.viewBox.split(' ').map(Number);
    const escala = 3; // resolución más alta que la pantalla, para que se vea nítido al imprimir

    const clon = svgEl.cloneNode(true);
    clon.setAttribute('width', vbWidth);
    clon.setAttribute('height', vbHeight);
    clon.style.background = '#FBF6EC'; // fondo parchment, para que no quede transparente

    const svgTexto = new XMLSerializer().serializeToString(clon);
    const svgBlob = new Blob([svgTexto], { type: 'image/svg+xml;charset=utf-8' });
    const urlSvg = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = vbWidth * escala;
      canvas.height = vbHeight * escala;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FBF6EC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(urlSvg);

      canvas.toBlob((blob) => {
        const urlPng = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlPng;
        a.download = `mapa_participantes_sfl_${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
        URL.revokeObjectURL(urlPng);
        setDescargando(false);
      }, 'image/png');
    };
    img.onerror = () => setDescargando(false);
    img.src = urlSvg;
  };

  const maxTotal = useMemo(() => Math.max(1, ...datos.map(d => d.total)), [datos]);
  const totalGeneral = useMemo(() => datos.reduce((s, d) => s + d.total, 0), [datos]);

  const colorPara = (total) => {
    if (!total) return '#EDE6D3'; // sin datos: tono neutro claro
    const intensidad = total / maxTotal;
    const r1 = 231, g1 = 184, b1 = 92;   // gold-light
    const r2 = 178, g2 = 58, b2 = 46;    // ember
    const r = Math.round(r1 + (r2 - r1) * intensidad);
    const g = Math.round(g1 + (g2 - g1) * intensidad);
    const b = Math.round(b1 + (b2 - b1) * intensidad);
    return `rgb(${r},${g},${b})`;
  };

  const [vbX, vbY, vbW, vbH] = HONDURAS_GEO.viewBox.split(' ').map(Number);

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={HONDURAS_GEO.viewBox} className="w-full" style={{ maxHeight: 400 }}>
        {Object.entries(HONDURAS_GEO.departamentos).map(([nombre, geo]) => {
          const info = datos.find(d => d.departamento === nombre) || { departamento: nombre, total: 0, municipios: [] };
          return (
            <path
              key={nombre}
              d={geo.path}
              fill={colorPara(info.total)}
              stroke="#FBF6EC"
              strokeWidth={1.5}
              className="cursor-pointer transition-opacity hover:opacity-80"
              onMouseEnter={() => setHover({ ...info, x: geo.centroid[0], y: geo.centroid[1] })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onDepartamentoClick?.(nombre)}
            />
          );
        })}
        {Object.entries(HONDURAS_GEO.departamentos).map(([nombre, geo]) => {
          const info = datos.find(d => d.departamento === nombre);
          if (!info?.total) return null;
          return (
            <text
              key={nombre + '-label'}
              x={geo.centroid[0]}
              y={geo.centroid[1]}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="13"
              fontWeight="700"
              fill={info.total / maxTotal > 0.4 ? '#FBF6EC' : '#1B140E'}
              className="pointer-events-none"
            >
              {info.total}{sufijo}
            </text>
          );
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 min-w-[160px] rounded-lg border border-ink/10 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(hover.x / vbW) * 100}%`, top: `${(hover.y / vbH) * 100}%`, transform: 'translate(-50%, -115%)' }}
        >
          <p className="font-semibold text-ink">{hover.departamento}</p>
          <p className="text-ink/60">
            {sufijo === '%'
              ? `${hover.total}% de deserción`
              : `${hover.total} participante(s) · ${totalGeneral ? Math.round((hover.total / totalGeneral) * 100) : 0}% del total`}
          </p>
          {hover.municipios?.length > 0 && (
            <ul className="mt-1 space-y-0.5 border-t border-ink/10 pt-1 text-ink/50">
              {hover.municipios.slice(0, 5).map(m => (
                <li key={m.municipio} className="flex justify-between gap-3">
                  <span>{m.municipio}</span><span className="font-medium">{m.total}{sufijo}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-2 text-center text-xs text-ink/40">Pasa el mouse para ver el detalle por municipio, o haz clic para ver el reporte completo de ese departamento</p>

      <div className="mt-2 text-center">
        <button
          onClick={descargarComoImagen}
          disabled={descargando}
          className="rounded-full border border-ink/15 px-4 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5 disabled:opacity-50"
        >
          {descargando ? 'Generando…' : '⬇ Descargar mapa como imagen'}
        </button>
      </div>
    </div>
  );
}
