import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function CocinaDashboard() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const nav = useNavigate();
  const usuario = JSON.parse(localStorage.getItem('sfl_user') || 'null');

  useEffect(() => {
    api.get('/cocina/resumen').then(r => setDatos(r.data)).catch(() => setError('No se pudo cargar la información.'));
  }, []);

  const salir = () => {
    localStorage.removeItem('sfl_token');
    localStorage.removeItem('sfl_user');
    nav('/admin');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-night grain-overlay px-5 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-light">SFL · FIHNEC</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-parchment">Resumen para cocina</h1>
      {usuario && <p className="mt-1 text-sm text-parchment/50">Sesión: {usuario.nombre}</p>}

      {error && <p className="mt-8 rounded-lg bg-ember/10 p-4 text-ember">{error}</p>}

      {datos && (
        <div className="mt-10 w-full max-w-md space-y-4">
          <div className="rounded-2xl border border-gold/30 bg-gold/10 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold-light">Evento activo</p>
            <p className="mt-1 font-display text-2xl font-bold text-parchment">
              {datos.evento_actual ? datos.evento_actual.nombre : 'Ningún evento marcado como actual'}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-parchment/15 bg-night-2 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-parchment/50">Participantes</p>
              <p className="mt-1 font-display text-5xl font-bold text-parchment">{datos.participantes}</p>
            </div>
            <div className="rounded-2xl border border-parchment/15 bg-night-2 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-parchment/50">Servidores</p>
              <p className="mt-1 font-display text-5xl font-bold text-parchment">{datos.servidores}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-ember/40 bg-ember/10 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ember-light">Total de personas</p>
            <p className="mt-1 font-display text-6xl font-bold text-parchment">{datos.total}</p>
          </div>
        </div>
      )}

      <button onClick={salir} className="mt-12 rounded-full border border-parchment/20 px-6 py-2 text-sm text-parchment/60 hover:bg-parchment/5">
        Cerrar sesión
      </button>
    </div>
  );
}
