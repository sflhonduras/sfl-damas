import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import Contador from '../components/Contador';
import InfoEvento from '../components/InfoEvento';
import PromoWhatsApp from '../components/PromoWhatsApp';
import heroFondo from '../assets/hero-fondo.jpg';

const ICONOS = ['🕊️', null, '🤝', '🔥']; // Nivel II usa el SVG de abajo — el emoji de espejo (🪞) no se ve en todas las computadoras

// Espejo de mano dibujado a mano en SVG — se ve igual en cualquier sistema, sin depender
// de qué emojis tenga instalados cada computadora (a diferencia de 🪞, que en algunas
// versiones de Windows se muestra como un cuadrito vacío).
function IconoEspejo({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="9.5" rx="6.5" ry="7.5" stroke="currentColor" strokeWidth="1.7" />
      <ellipse cx="12" cy="9.5" rx="4.3" ry="5.2" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M9.5 20.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 17v3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  const [eventos, setEventos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/eventos')
      .then(r => setEventos(r.data))
      .catch(() => setError('No se pudo cargar la información de los eventos. Intenta recargar la página.'));
  }, []);

  // Cuenta regresiva hacia el cierre de inscripción más próximo entre los niveles abiertos
  const proximoCierre = eventos
    ?.filter(ev => ev.abierto && ev.fecha_limite_registro)
    .sort((a, b) => new Date(a.fecha_limite_registro) - new Date(b.fecha_limite_registro))[0];

  const eventoActivo = eventos?.find(ev => ev.es_actual) || eventos?.[0];

  return (
    <div>
      {/* HERO */}
      <section
        className="relative overflow-hidden bg-night bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(rgba(26,40,56,0.16), rgba(26,40,56,0.16)), url(${heroFondo})` }}
      >
        <div className="mx-auto max-w-5xl px-5 pb-20 pt-16 text-center">
          <p
            className="text-xs font-bold uppercase text-gold-light"
            style={{ letterSpacing: '0.5em', textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}
          >
            FIHNEC
          </p>
          <p
            className="mt-1 mb-4 text-[11px] font-semibold uppercase text-parchment/70"
            style={{ letterSpacing: '0.08em', textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}
          >
            Fraternidad Internacional de Hombres de Negocios del Evangelio Completo
          </p>
          <h1
            className="font-display text-4xl font-bold text-parchment sm:text-6xl"
            style={{ textShadow: '0 3px 10px rgba(0,0,0,0.75)' }}
          >
            Seminario para la <span className="text-gold-light">Formación de Líderes</span>
          </h1>
          <p
            className="mx-auto mt-5 max-w-2xl text-balance text-lg text-parchment/90"
            style={{ textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}
          >
            Una jornada de cuatro encuentros, uno a la vez. Cada nivel abre la puerta al siguiente:
            así como un liderazgo firme, se construye en orden y sobre un fundamento sólido.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#jornada" className="rounded-full bg-[#F5A800] px-7 py-3 font-semibold text-night shadow-md transition hover:bg-[#FFC02E]">
              Ver la jornada SFL
            </a>
            <Link to={`/registro/${eventoActivo?.orden || 1}`} className="rounded-full bg-[#E40521] px-7 py-3 font-semibold text-white shadow-md transition hover:bg-[#F02540]">
              Inscríbete aquí
            </Link>
          </div>

          {proximoCierre && (
            <Contador
              fechaObjetivo={proximoCierre.fecha_limite_registro}
              etiqueta={`Cierre de inscripción · ${proximoCierre.nombre}`}
            />
          )}

          {/* Autoconsulta: oculto en SFL Damas (no es parte del alcance de este sistema).
              La ruta /autoconsulta y su página siguen existiendo — solo se quitó el enlace. */}
        </div>
      </section>

      {/* JORNADA */}
      <section id="jornada" className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="text-center font-display text-3xl font-bold text-ink sm:text-4xl">La jornada, en cuatro niveles</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-ink/60">
          El registro es estrictamente secuencial. Para inscribirte a un nivel, debes haber completado el anterior —
          no es posible saltar pasos.
        </p>

        {error && <p className="mt-8 rounded-lg bg-ember/10 p-4 text-center text-ember">{error}</p>}

        <div className="relative mt-14">
          <div className="absolute left-6 top-6 bottom-6 w-px bg-gradient-to-b from-gold via-gold/40 to-transparent sm:left-1/2 sm:hidden" />
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {(eventos || [1, 2, 3, 4].map(orden => ({ orden, nombre: '', cargando: true }))).map((ev, idx) => (
              <li key={ev.orden} className="relative rounded-2xl border border-ink/10 bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F5A800] font-display text-lg font-bold text-night">
                    {String(ev.orden).padStart(2, '0')}
                  </span>
                  {ICONOS[idx] ? (
                    <span className="text-2xl">{ICONOS[idx]}</span>
                  ) : (
                    <IconoEspejo className="h-6 w-6 text-ink/70" />
                  )}
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold leading-snug text-ink">
                  {ev.cargando ? 'Cargando…' : ev.nombre}
                </h3>
                {!ev.cargando && (
                  <>
                    <p className="mt-2 min-h-10 text-sm text-ink/60">{ev.descripcion}</p>
                    <div className="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                      <span className={`h-2 w-2 rounded-full ${ev.abierto ? 'bg-[#22C55E]' : 'bg-[#E40521]'}`} />
                      <span className={ev.abierto ? 'text-[#16A34A]' : 'text-[#E40521]'}>
                        {ev.abierto ? 'Registro abierto' : 'Registro cerrado'}
                      </span>
                    </div>
                    <div className="mt-2">
                      <InfoEvento evento={ev} compacto />
                    </div>
                    <Link
                      to={`/registro/${ev.orden}`}
                      className={`mt-5 block rounded-full py-2.5 text-center text-sm font-semibold transition ${
                        ev.abierto ? 'bg-ink text-parchment hover:bg-ember' : 'cursor-not-allowed bg-ink/10 text-ink/40'
                      }`}
                    >
                      {ev.orden === 1 ? 'Inscribirme' : 'Verificar / Inscribirme'}
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section className="bg-parchment-2 py-16">
        <div className="mx-auto max-w-4xl px-5">
          <h2 className="text-center font-display text-2xl font-bold text-ink sm:text-3xl">¿Cómo funciona el registro?</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            <div>
              <p className="font-display text-3xl font-bold text-[#F5A800]">1</p>
              <p className="mt-2 font-semibold text-ink">Regístrate una sola vez</p>
              <p className="mt-1 text-sm text-ink/60">En el Nivel I completas tu formulario con tus datos. Quedan guardados para siempre.</p>
            </div>
            <div>
              <p className="font-display text-3xl font-bold text-[#F5A800]">2</p>
              <p className="mt-2 font-semibold text-ink">Del Nivel II en adelante, solo tu DNI</p>
              <p className="mt-1 text-sm text-ink/60">El sistema verifica automáticamente si ya completaste el nivel anterior.</p>
            </div>
            <div>
              <p className="font-display text-3xl font-bold text-[#F5A800]">3</p>
              <p className="mt-2 font-semibold text-ink">Un nivel a la vez</p>
              <p className="mt-1 text-sm text-ink/60">Si aún no estás habilitado, el sistema te lo indicará y no podrás avanzar de paso.</p>
            </div>
          </div>

          <div className="mx-auto mt-10 max-w-xl">
            <PromoWhatsApp />
          </div>
        </div>
      </section>
    </div>
  );
}
