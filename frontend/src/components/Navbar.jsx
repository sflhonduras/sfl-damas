import { Link } from 'react-router-dom';
import logo from '../logo.png';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-gold/20 bg-night/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="FIHNEC" className="h-11 w-auto" />
          <div className="leading-tight">
            <p className="font-display text-lg font-semibold text-parchment">SFL · FIHNEC</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-gold-light">Seminario para la Formación de Líderes</p>
          </div>
        </Link>
        <Link
          to="/admin"
          className="rounded-full border border-gold/40 px-4 py-1.5 text-sm font-medium text-gold-pale transition hover:border-gold hover:bg-gold/10"
        >
          Panel administrativo
        </Link>
      </div>
    </header>
  );
}
