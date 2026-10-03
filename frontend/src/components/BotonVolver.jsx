import { Link } from 'react-router-dom';

export default function BotonVolver({ to = '/', texto = 'Volver al inicio' }) {
  return (
    <Link
      to={to}
      className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink/50 transition hover:text-ember"
    >
      <span aria-hidden>←</span> {texto}
    </Link>
  );
}
