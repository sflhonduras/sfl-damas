import { formatearRangoFechas, formatearFechaHora, formatearHora12 } from '../fechas';

export default function InfoEvento({ evento, compacto = false }) {
  if (!evento) return null;
  const tieneFecha = !!evento.fecha_evento;
  const tieneLimite = !!evento.fecha_limite_registro;
  if (!tieneFecha && !tieneLimite) return null;

  return (
    <div className={compacto ? 'text-xs text-ink/50' : 'text-sm text-ink/60'}>
      {tieneFecha && (
        <p>📅 {formatearRangoFechas(evento.fecha_evento, evento.fecha_evento_fin)}{evento.hora_evento ? ` · ${formatearHora12(evento.hora_evento)}` : ''}{evento.lugar ? ` · ${evento.lugar}` : ''}</p>
      )}
      {tieneLimite && (
        <p className={compacto ? '' : 'mt-0.5'}>⏰ Inscripciones hasta el {formatearFechaHora(evento.fecha_limite_registro)}</p>
      )}
    </div>
  );
}
