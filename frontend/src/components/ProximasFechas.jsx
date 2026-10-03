import { useEffect, useState } from 'react';
import api from '../api';
import { formatearRangoFechas } from '../fechas';

export default function ProximasFechas() {
  const [eventos, setEventos] = useState(null);

  useEffect(() => {
    api.get('/eventos').then(r => setEventos(r.data)).catch(() => {});
  }, []);

  const conFecha = eventos?.filter(ev => ev.fecha_evento) || [];
  if (!conFecha.length) return null;

  return (
    <div className="mt-8 rounded-2xl border border-ink/10 bg-parchment-2 p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">📅 Fechas de todos los niveles</p>
      <ul className="space-y-1.5 text-sm">
        {conFecha.map(ev => (
          <li key={ev.orden} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="font-medium text-ink">Nivel {ev.orden} · {ev.nombre.split(':')[1]?.trim() || ev.nombre}</span>
            <span className="text-ink/60">{formatearRangoFechas(ev.fecha_evento, ev.fecha_evento_fin)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
