import { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { mensajeError } from '../api';
import {
  ZONAS_FIHNEC, CARGOS_FIHNEC, ESTADOS_CIVILES, TIPOS_TESTIMONIO,
  FORMACION_OFICIAL, OTRAS_PARTICIPACIONES, DEPARTAMENTOS_HONDURAS, MUNICIPIOS_POR_DEPARTAMENTO
} from '../listas';

const claseInput = 'w-full rounded-lg border border-ink/15 bg-white px-4 py-3 text-center text-lg outline-none focus:border-gold focus:ring-2 focus:ring-gold/20';
const claseCampo = 'w-full rounded-lg border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20';

function formatearFechaHora(fecha, hora) {
  if (!fecha) return '';
  const d = new Date(fecha);
  const fechaTexto = isNaN(d) ? fecha : d.toLocaleDateString('es-HN', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long' });
  return hora ? `${fechaTexto} · ${hora.slice(0, 5)}` : fechaTexto;
}

// Firma visual del portal: una llama pequeña — servicio silencioso y constante.
function LlamaFirma({ className = '' }) {
  return (
    <svg viewBox="0 0 24 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="llamaFuera" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E7B85C" />
          <stop offset="1" stopColor="#C9932F" />
        </linearGradient>
        <linearGradient id="llamaDentro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBF6EC" />
          <stop offset="1" stopColor="#E7B85C" />
        </linearGradient>
      </defs>
      <path d="M12 2C7 9 4 13 4 19a8 8 0 0 0 16 0c0-4-2-6-3-9-.5 3-2 4-3 3 .5-4-1-8-2-11z" fill="url(#llamaFuera)" />
      <path d="M12 12c-2 3-3 5-3 7a3 3 0 0 0 6 0c0-1.5-.5-2.5-1-4-.3 1-1 1.3-1.3.8.3-1.5-.2-2.8-.7-3.8z" fill="url(#llamaDentro)" />
    </svg>
  );
}

// Confeti cayendo, hecho con CSS puro — sin agregar ninguna librería nueva al proyecto.
const COLORES_CONFETI = ['#C9932F', '#E7B85C', '#B23A2E', '#4C7A5C', '#FBF6EC'];
function Confeti() {
  const piezas = useMemo(() => Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: COLORES_CONFETI[i % COLORES_CONFETI.length],
    duracion: 2.5 + Math.random() * 2,
    retraso: Math.random() * 1.5,
    ancho: 6 + Math.random() * 6,
    alto: 10 + Math.random() * 8,
    redondo: Math.random() > 0.6
  })), []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {piezas.map(p => (
        <span key={p.id} className="confeti-pieza" style={{
          left: `${p.left}%`, width: p.ancho, height: p.alto, backgroundColor: p.color,
          animationDuration: `${p.duracion}s`, animationDelay: `${p.retraso}s`,
          borderRadius: p.redondo ? '50%' : '2px'
        }} />
      ))}
    </div>
  );
}

// Confeti ambiental: se muestra durante TODO el mes del cumpleaños (perfil.cumple_mes),
// en cualquier pestaña del Portal — a diferencia de Confeti(), que es el efecto grande de
// pantalla completa reservado solo para el día exacto. Pocas piezas, confinadas a las
// esquinas izquierda/derecha, opacidad baja y caída lenta: decorativo, no invasivo.
function ConfetiAmbiente() {
  const piezas = useMemo(() => {
    const generar = (ladoIzquierdo) => Array.from({ length: 7 }, (_, i) => ({
      id: `${ladoIzquierdo ? 'i' : 'd'}-${i}`,
      left: ladoIzquierdo ? Math.random() * 14 : 86 + Math.random() * 14,
      color: COLORES_CONFETI[i % COLORES_CONFETI.length],
      duracion: 9 + Math.random() * 6,
      retraso: Math.random() * 10,
      ancho: 5 + Math.random() * 4,
      alto: 8 + Math.random() * 6,
      redondo: Math.random() > 0.5
    }));
    return [...generar(true), ...generar(false)];
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {piezas.map(p => (
        <span key={p.id} className="confeti-ambiente-pieza" style={{
          left: `${p.left}%`, width: p.ancho, height: p.alto, backgroundColor: p.color,
          animationDuration: `${p.duracion}s`, animationDelay: `${p.retraso}s`,
          borderRadius: p.redondo ? '50%' : '2px'
        }} />
      ))}
    </div>
  );
}

// Cajas de regalo cayendo: mismo criterio de sutileza que el confeti ambiental, pero con
// emoji de regalo — más grandes, muchas menos piezas y caída más lenta, para que se noten
// sin competir con el confeti.
function CajasRegaloAmbiente() {
  const piezas = useMemo(() => {
    const generar = (izquierda) => Array.from({ length: 3 }, (_, i) => ({
      id: `${izquierda ? 'i' : 'd'}-${i}`,
      left: izquierda ? Math.random() * 12 : 88 + Math.random() * 12,
      tamaño: 18 + Math.random() * 8,
      duracion: 14 + Math.random() * 8,
      retraso: Math.random() * 14
    }));
    return [...generar(true), ...generar(false)];
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {piezas.map(p => (
        <span key={p.id} className="regalo-ambiente-pieza" style={{
          left: `${p.left}%`, fontSize: p.tamaño,
          animationDuration: `${p.duracion}s`, animationDelay: `${p.retraso}s`
        }}>🎁</span>
      ))}
    </div>
  );
}

// Destellos dorados: el efecto más discreto de los cuatro — parpadeo suave y fijo, sin
// caída ni desplazamiento, esparcidos cerca de los bordes.
function DestellosAmbiente() {
  const piezas = useMemo(() => Array.from({ length: 10 }, (_, i) => {
    const izquierda = i % 2 === 0;
    return {
      id: i,
      left: izquierda ? Math.random() * 16 : 84 + Math.random() * 16,
      top: 5 + Math.random() * 90,
      tamaño: 10 + Math.random() * 8,
      duracion: 2.5 + Math.random() * 2.5,
      retraso: Math.random() * 4
    };
  }), []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {piezas.map(p => (
        <span key={p.id} className="destello-ambiente-pieza text-gold-light" style={{
          left: `${p.left}%`, top: `${p.top}%`, fontSize: p.tamaño,
          animationDuration: `${p.duracion}s`, animationDelay: `${p.retraso}s`
        }}>✦</span>
      ))}
    </div>
  );
}

// Globos subiendo: flotan desde abajo con balanceo lateral, confinados a los costados para
// no cruzar nunca el contenido central.
function GlobosAmbiente() {
  const piezas = useMemo(() => {
    const generar = (izquierda) => Array.from({ length: 3 }, (_, i) => ({
      id: `${izquierda ? 'i' : 'd'}-${i}`,
      left: izquierda ? Math.random() * 10 : 90 + Math.random() * 10,
      tamaño: 20 + Math.random() * 10,
      duracion: 16 + Math.random() * 8,
      retraso: Math.random() * 16
    }));
    return [...generar(true), ...generar(false)];
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {piezas.map(p => (
        <span key={p.id} className="globo-ambiente-pieza" style={{
          left: `${p.left}%`, fontSize: p.tamaño,
          animationDuration: `${p.duracion}s`, animationDelay: `${p.retraso}s`
        }}>🎈</span>
      ))}
    </div>
  );
}

// Agrupa los 4 efectos ambientales del mes de cumpleaños, para no repetir la condición
// perfil.cumple_mes cuatro veces en el JSX principal.
function EfectosMesCumpleanos() {
  return (
    <>
      <ConfetiAmbiente />
      <CajasRegaloAmbiente />
      <DestellosAmbiente />
      <GlobosAmbiente />
    </>
  );
}

function CelebracionCumpleanos({ nombre, verso, onContinuar }) {
  const primerNombre = nombre?.split(' ')[0] || '';
  return (
    <section className="relative min-h-[85vh] overflow-hidden bg-night grain-overlay">
      <Confeti />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-ember/25 blur-3xl" />
      <div className="relative mx-auto flex min-h-[85vh] max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <span className="text-6xl">🎂</span>
        <p className="mt-4 inline-block rounded-full border border-gold/30 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold-light">
          FIHNEC · Portal del Servidor
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold text-parchment">
          ¡Feliz cumpleaños, <span className="text-gold-light">{primerNombre}</span>!
        </h1>
        {/* Verso especial de cumpleaños: rota por fecha, sacado de un banco distinto al
            verso general del día. Si todavía no hay versos activos en esa categoría, se
            mantiene el mensaje genérico original — la pantalla nunca se ve rota. */}
        {verso ? (
          <div className="mx-auto mt-4 max-w-sm">
            <p className="text-balance font-display text-lg italic leading-snug text-parchment/90">
              &ldquo;{verso.texto}&rdquo;
            </p>
            <p className="mt-2 text-sm font-semibold text-gold-light">{verso.referencia}</p>
          </div>
        ) : (
          <p className="mx-auto mt-3 max-w-sm text-balance text-parchment/70">
            Gracias por tu servicio y por ser parte de esta familia. Que este nuevo año esté lleno de bendición.
          </p>
        )}
        <button onClick={onContinuar}
          className="mt-8 rounded-full bg-gold px-8 py-3 font-semibold text-night transition hover:bg-gold-light">
          Continuar
        </button>
      </div>
    </section>
  );
}

export default function PortalServidor() {
  const [params] = useSearchParams();
  const [dni, setDni] = useState(params.get('dni') || '');
  const [pin, setPin] = useState('');
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [pestaña, setPestaña] = useState(null); // null (hub) | 'datos' | 'transporte' | 'inventario'

  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinNuevoConfirmar, setPinNuevoConfirmar] = useState('');
  const [errorPin, setErrorPin] = useState('');
  const [guardandoPin, setGuardandoPin] = useState(false);
  const [celebrando, setCelebrando] = useState(true);

  const credenciales = () => ({ dni, pin });

  const entrar = async (e) => {
    e.preventDefault();
    setError(''); setCargando(true);
    try {
      const { data } = await api.post('/servidor-portal/consultar', credenciales());
      setPerfil(data);
    } catch (err) {
      setError(mensajeError(err, 'Número de identidad o PIN incorrectos.'));
    } finally {
      setCargando(false);
    }
  };

  const cambiarPinObligatorio = async (e) => {
    e.preventDefault();
    setErrorPin('');
    if (pinNuevo !== pinNuevoConfirmar) { setErrorPin('El nuevo PIN no coincide en ambos campos.'); return; }
    if (!/^\d{4}$/.test(pinNuevo)) { setErrorPin('El nuevo PIN debe tener exactamente 4 dígitos.'); return; }
    setGuardandoPin(true);
    try {
      await api.post('/servidor-portal/cambiar-pin', { dni, pin_actual: pinActual, pin_nuevo: pinNuevo });
      setPin(pinNuevo);
      setPinActual(''); setPinNuevo(''); setPinNuevoConfirmar('');
      setPerfil(p => ({ ...p, debe_cambiar_pin: false }));
    } catch (err) {
      setErrorPin(mensajeError(err));
    } finally {
      setGuardandoPin(false);
    }
  };

  if (!perfil) {
    return (
      <section className="relative -mb-1 overflow-hidden bg-night grain-overlay">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-ember/20 blur-3xl" />
        <div className="relative mx-auto max-w-md px-5 py-20">
          <div className="text-center">
            <LlamaFirma className="flame-flicker mx-auto h-9 w-7" />
            <p className="mt-4 inline-block rounded-full border border-gold/30 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold-light">
              FIHNEC · Portal del Servidor
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold leading-snug text-parchment">
              …A quien me sirva, <span className="text-gold-light">mi Padre lo honrará.</span>
            </h1>
            <p className="mt-1 text-right text-sm font-medium text-gold-light">Juan 12:26</p>
            <p className="mx-auto mt-4 max-w-sm text-balance text-parchment/70">
              Ingresa tu DNI y tu PIN para ver y actualizar tu información del evento.
            </p>
          </div>

          <form onSubmit={entrar} autoComplete="off" className="mt-8 space-y-4 rounded-2xl border border-gold/15 bg-parchment p-6 shadow-xl">
            <input required name="identidad_servidor" autoComplete="off" inputMode="numeric" pattern="\d{13}" title="El DNI debe tener exactamente 13 dígitos" value={dni}
              onChange={e => setDni(e.target.value.replace(/[^\d]/g, '').slice(0, 13))}
              placeholder="Número de identidad (DNI)" className={claseInput} />
            <input
              required type="password" name="pin_servidor" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pin}
              onChange={e => setPin(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
              placeholder="PIN (4 dígitos)" className={`${claseInput} tracking-[0.3em]`}
            />
            {error && <p className="rounded-lg bg-ember/10 p-3 text-center text-sm text-ember">{error}</p>}
            <button disabled={cargando} className="w-full rounded-full bg-gold py-3.5 font-semibold text-night transition hover:bg-gold-light disabled:opacity-60">
              {cargando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-parchment/40">
            ¿No tienes tu PIN? Contacta al administrador.
          </p>
        </div>
      </section>
    );
  }

  // Pantalla obligatoria: si el sistema indica que debe cambiar su PIN, no ve nada del
  // portal todavía — sin botón para saltarla.
  if (perfil.debe_cambiar_pin) {
    return (
      <div className="mx-auto max-w-md px-5 py-24">
        <p className="text-center text-sm font-semibold uppercase tracking-widest text-gold">Portal del Servidor</p>
        <h1 className="mt-1 text-center font-display text-3xl font-bold text-ink">Elige tu propio PIN</h1>
        <p className="mt-2 text-center text-ink/60">
          Por seguridad, antes de continuar debes cambiar el PIN por uno que solo tú conozcas.
        </p>

        <form onSubmit={cambiarPinObligatorio} autoComplete="off" className="mt-8 space-y-4 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <input
            required type="password" name="pin_actual_servidor" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pinActual}
            onChange={e => setPinActual(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            placeholder="PIN actual" className={`${claseInput} tracking-[0.2em]`}
          />
          <input
            required type="password" name="pin_nuevo_servidor" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pinNuevo}
            onChange={e => setPinNuevo(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            placeholder="PIN nuevo (4 dígitos)" className={`${claseInput} tracking-[0.2em]`}
          />
          <input
            required type="password" name="pin_confirmar_servidor" autoComplete="new-password" inputMode="numeric" maxLength={4} value={pinNuevoConfirmar}
            onChange={e => setPinNuevoConfirmar(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            placeholder="Confirma el PIN nuevo" className={`${claseInput} tracking-[0.2em]`}
          />
          {errorPin && <p className="rounded-lg bg-ember/10 p-2 text-center text-sm text-ember">{errorPin}</p>}
          <button disabled={guardandoPin} className="w-full rounded-full bg-gold py-3 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
            {guardandoPin ? 'Guardando…' : 'Guardar mi nuevo PIN'}
          </button>
        </form>
      </div>
    );
  }

  // Celebración: si hoy es su cumpleaños y no la ha cerrado todavía, ve esto primero —
  // solo él la ve, nadie más entra a esta pantalla.
  if (perfil.cumple_hoy && celebrando) {
    return <CelebracionCumpleanos nombre={perfil.nombre_completo} verso={perfil.verso_cumpleanos} onContinuar={() => setCelebrando(false)} />;
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      {/* Efectos ambientales: todo el mes de su cumpleaños, persisten sin importar la
          pestaña activa porque viven fuera del bloque condicional de abajo. */}
      {perfil.cumple_mes && <EfectosMesCumpleanos />}

      {/* Barra de herramientas: botones reales, no enlaces de texto */}
      <div className="flex items-center justify-between gap-2">
        {pestaña !== null ? (
          <button onClick={() => setPestaña(null)}
            className="rounded-full bg-palm px-5 py-2 text-sm font-semibold text-white transition hover:bg-palm-light">
            ← Volver
          </button>
        ) : <span />}
        <button onClick={() => { setPerfil(null); setPin(''); setPestaña(null); }}
          className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white transition hover:bg-ember-light">
          Salir
        </button>
      </div>

      {/* Credencial horizontal */}
      <div className="mt-4 flex items-center gap-4 overflow-hidden rounded-2xl border border-gold/25 bg-night grain-overlay px-6 py-5">
        <LlamaFirma className="h-9 w-7 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-light">Servidor SFL</p>
          <h1 className="mt-0.5 font-display text-xl font-bold leading-tight text-parchment sm:text-2xl">{perfil.nombre_completo}</h1>
          {perfil.capitulo && (
            <p className="mt-1 text-sm text-parchment/60">{perfil.capitulo}</p>
          )}
          {perfil.cumple_mes && (
            <span className="brillo-festivo mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gold-light">
              🎉 Mes de cumpleaños
            </span>
          )}
        </div>
      </div>

      {/* Tarjetas de acceso / contenido */}
      <div className="mt-4 space-y-3">
        {pestaña === null && (
          <>
            <TarjetaVersoDia verso={perfil.verso_dia} />
            <PanelEstadisticas perfil={perfil} />
            <TarjetaCumpleañeros credenciales={credenciales} />
            <TarjetaDiasInline perfil={perfil} setPerfil={setPerfil} credenciales={credenciales} />
            <TarjetaAcceso icono="📇" color="palm" titulo="Mis datos de contacto"
              subtitulo="Toda tu ficha — nadie la conoce mejor que tú" onClick={() => setPestaña('datos')} />
            <TarjetaAcceso icono="🚐" color="ember" titulo="Transporte"
              subtitulo="Ver vehículos y unirte a uno" onClick={() => setPestaña('transporte')} />
            <TarjetaAcceso icono="📦" color="gold" titulo="Inventario"
              subtitulo="Tus categorías asignadas" onClick={() => setPestaña('inventario')} />
          </>
        )}

        {pestaña === 'datos' && <TabDatos perfil={perfil} setPerfil={setPerfil} credenciales={credenciales} />}
        {pestaña === 'transporte' && <TabTransporte credenciales={credenciales} />}
        {pestaña === 'inventario' && <TabInventario credenciales={credenciales} />}
      </div>
    </div>
  );
}

function Tarjeta({ children }) {
  return <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">{children}</div>;
}

function resumenDias(dias) {
  if (!dias) return 'Cargando…';
  const activos = [['viernes', 'Viernes'], ['sabado', 'Sábado'], ['domingo', 'Domingo']].filter(([c]) => dias[c]).map(([, l]) => l);
  if (activos.length === 3) return 'Participando los 3 días';
  if (activos.length === 0) return 'No participarás esta vez';
  return `Participas: ${activos.join(', ')}`;
}

// Tarjeta de acceso — extiende el mismo lenguaje de la credencial (pergamino, línea dorada
// fina, ícono suelto sin caja de color) en vez de una cajita de color tipo app genérica.
// Panel de estadísticas personales — con datos reales, no inventados. El historial de
// participación empezó a grabarse hoy, así que puede estar vacío por un tiempo; eso se
// muestra como una invitación ("aquí vas a ver tu evolución"), no como un hueco raro.
function PanelEstadisticas({ perfil }) {
  const totalOpciones = FORMACION_OFICIAL.length + OTRAS_PARTICIPACIONES.length;
  const totalCompletadas = (perfil.formacion_oficial?.length || 0) + (perfil.otras_participaciones?.length || 0);
  const preparacionPct = totalOpciones > 0 ? Math.round((totalCompletadas / totalOpciones) * 100) : 0;
  const cargosCount = perfil.cargos_desempenados?.length || 0;
  const historial = perfil.historial_participacion || [];

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Tus estadísticas</p>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gold/20 bg-gold/10 p-3 text-center">
          <p className="font-display text-2xl font-bold text-gold">{perfil.años_servicio ?? '—'}</p>
          <p className="mt-0.5 text-[11px] text-ink/50">años en FIHNEC</p>
        </div>
        <div className="rounded-xl border border-palm/20 bg-palm/10 p-3 text-center">
          <p className="font-display text-2xl font-bold text-palm">{perfil.total_eventos_participados}</p>
          <p className="mt-0.5 text-[11px] text-ink/50">eventos en tu historial</p>
        </div>
        <div className="rounded-xl border border-ember/20 bg-ember/10 p-3 text-center">
          <p className="font-display text-2xl font-bold text-ember">{cargosCount}</p>
          <p className="mt-0.5 text-[11px] text-ink/50">cargos desempeñados</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-xl bg-parchment-2 p-4">
        <div className="relative h-16 w-16 shrink-0 rounded-full"
          style={{ background: `conic-gradient(#C9932F ${preparacionPct * 3.6}deg, #EFE6D3 0deg)` }}>
          <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-parchment">
            <span className="text-sm font-bold text-ink">{preparacionPct}%</span>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Tu preparación</p>
          <p className="mt-0.5 text-xs text-ink/50">Formación y participaciones completadas de las que existen hoy</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Tu historial de participación</p>
        {historial.length === 0 ? (
          <p className="rounded-xl bg-parchment-2 p-3 text-xs text-ink/50">
            Aquí vas a ver tu evolución evento a evento — empieza a construirse a partir de ahora.
          </p>
        ) : (
          <div className="space-y-1.5">
            {historial.map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-parchment-2 px-3 py-2 text-xs">
                <span className="text-ink/70">{h.evento_nombre}{h.ciclo ? ` · Ciclo ${h.ciclo}` : ''}</span>
                <span className={h.participo ? 'font-semibold text-palm' : 'text-ink/40'}>
                  {h.participo ? 'Participó' : 'No participó'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Cumpleañeros del mes — todo el equipo, no solo el que entró. Solo nombre + día, nunca
// el año, para no exponer la edad de nadie sin querer.
function TarjetaCumpleañeros({ credenciales }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.post('/servidor-portal/cumpleaneros', credenciales()).then(r => setDatos(r.data)).finally(() => setCargando(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (cargando) return null;
  if (!datos || datos.cumpleañeros.length === 0) return null;

  const iconos = ['🎈', '🎁', '🎊', '🧁', '🍰'];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-white to-ember/5 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gold">
        🎉 Cumpleañeros de {datos.mes}
      </p>
      <div className="mt-3 space-y-2">
        {datos.cumpleañeros.map((c, i) => (
          <div key={i}
            className={`flex items-center justify-between gap-3 rounded-full px-4 py-2.5 text-sm transition ${
              c.es_hoy
                ? 'brillo-festivo border border-gold bg-gradient-to-r from-gold/25 to-ember/15 shadow-sm'
                : 'bg-white/70'
            }`}>
            <span className="flex items-center gap-2">
              <span className="text-lg">{c.es_hoy ? '🎂' : iconos[i % iconos.length]}</span>
              <span className={c.es_hoy ? 'font-bold text-ink' : 'text-ink/70'}>
                {c.nombre_completo}{c.es_hoy && ' — ¡Hoy!'}
              </span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${c.es_hoy ? 'bg-gold text-night font-bold' : 'bg-parchment-2 text-ink/50'}`}>
              Día {c.dia}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Verso general del día — el mismo para todos, distinto del lema fijo del login (Juan
// 12:26, que no se toca ni se reemplaza). Si el banco "general" todavía no tiene versos
// activos, no se muestra nada — no es un hueco raro, la tarjeta simplemente no aparece.
function TarjetaVersoDia({ verso }) {
  if (!verso) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-night p-5 shadow-sm grain-overlay">
      <p className="text-xs font-semibold uppercase tracking-wide text-gold-light">📖 Verso del día</p>
      <p className="mt-2 text-balance font-display italic leading-snug text-parchment/90">
        &ldquo;{verso.texto}&rdquo;
      </p>
      <p className="mt-2 text-sm font-semibold text-gold">{verso.referencia}</p>
    </div>
  );
}

const TONOS = {
  gold: { icono: 'text-gold', circulo: 'bg-gold text-night' },
  palm: { icono: 'text-palm', circulo: 'bg-palm text-white' },
  ember: { icono: 'text-ember', circulo: 'bg-ember text-white' },
};

function TarjetaAcceso({ icono, titulo, subtitulo, color = 'gold', onClick }) {
  const t = TONOS[color];
  return (
    <button onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-2xl border border-ink/10 bg-white p-5 text-left shadow-sm transition hover:border-ink/20">
      <span className={`font-display text-3xl ${t.icono}`} aria-hidden>{icono}</span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-bold text-ink">{titulo}</p>
        <p className="mt-0.5 truncate text-sm text-ink/50">{subtitulo}</p>
      </div>
      <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold ${t.circulo}`}>→</span>
    </button>
  );
}

// "Mis días de asistencia" NO navega a otro lado — se edita ahí mismo, en la tarjeta,
// porque es la acción que más van a repetir y no vale la pena esconderla detrás de un clic.
function TarjetaDiasInline({ perfil, setPerfil, credenciales }) {
  const [diasLocal, setDiasLocal] = useState(perfil.dias_asistencia);
  const [guardando, setGuardando] = useState(false);

  const toggleDia = async (dia) => {
    const nuevos = { ...diasLocal, [dia]: !diasLocal[dia] };
    setDiasLocal(nuevos);
    setGuardando(true);
    try {
      const { data } = await api.put('/servidor-portal/dias-asistencia', { ...credenciales(), ...nuevos });
      setDiasLocal(data.dias_asistencia);
      setPerfil(p => ({ ...p, participara_evento: data.participara_evento }));
    } catch {
      setDiasLocal(diasLocal); // revierte si falla
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="flame-flicker font-display text-3xl text-gold" aria-hidden>🔥</span>
        <div className="min-w-0 flex-1 border-l border-gold/20 pl-4">
          <p className="font-display text-base font-bold text-ink">Mis días de asistencia</p>
          <p className="mt-0.5 text-sm text-ink/50">{resumenDias(diasLocal)}</p>
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-3">
        {[['viernes', 'Viernes'], ['sabado', 'Sábado'], ['domingo', 'Domingo']].map(([clave, etiqueta]) => (
          <button key={clave} type="button" disabled={guardando} onClick={() => toggleDia(clave)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              diasLocal[clave] ? 'bg-gold text-night' : 'bg-ink/5 text-ink/50'
            }`}>
            {etiqueta}
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-ink/40">Toca el día que NO te aplique para desmarcarlo. Se guarda al instante.</p>
    </div>
  );
}

// Checkboxes de selección múltiple, mismo patrón que usa el panel admin.
function MultiSelect({ etiqueta, opciones, valores, onCambiar }) {
  const seleccion = valores || [];
  const alternar = (op) => {
    onCambiar(seleccion.includes(op) ? seleccion.filter(v => v !== op) : [...seleccion, op]);
  };
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink/60">{etiqueta}</p>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map(op => (
          <button key={op} type="button" onClick={() => alternar(op)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              seleccion.includes(op)
                ? 'border-gold bg-gold text-night'
                : 'border-ink/15 text-ink/50 hover:border-gold hover:bg-gold/20 hover:text-gold'
            }`}>
            {op}
          </button>
        ))}
      </div>
    </div>
  );
}

// "Mis datos de contacto" ahora hala TODA la ficha personal (menos nombre, DNI, capítulo y
// cargo, que siguen siendo oficiales) — nadie conoce estos datos mejor que el propio servidor.
function TabDatos({ perfil, setPerfil, credenciales }) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const inputFotoRef = useRef(null);

  const [form, setForm] = useState({
    celular: perfil.celular || '', email: perfil.email || '', foto: perfil.foto || '',
    estado_civil: perfil.estado_civil || '', hijos_cantidad: perfil.hijos_cantidad ?? '',
    fecha_nacimiento: perfil.fecha_nacimiento ? String(perfil.fecha_nacimiento).slice(0, 10) : '',
    nombre_esposa: perfil.nombre_esposa || '', nietos_cantidad: perfil.nietos_cantidad ?? '',
    profesion: perfil.profesion || '', contacto_emergencia_telefono: perfil.contacto_emergencia_telefono || '',
    tiempo_fihnec: perfil.tiempo_fihnec || '', zona: perfil.zona || '',
    departamento: perfil.departamento || '', municipio: perfil.municipio || '',
    tipo_testimonio: perfil.tipo_testimonio || '',
    cargos_desempenados: perfil.cargos_desempenados || [], formacion_oficial: perfil.formacion_oficial || [],
    otras_participaciones: perfil.otras_participaciones || []
  });
  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));
  const cambiarDepartamento = (e) => setForm(f => ({ ...f, departamento: e.target.value, municipio: '' }));
  const municipiosDisponibles = useMemo(() => MUNICIPIOS_POR_DEPARTAMENTO[form.departamento] || [], [form.departamento]);

  const subirFoto = (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => setForm(f => ({ ...f, foto: lector.result }));
    lector.readAsDataURL(archivo);
  };

  const guardarDatos = async () => {
    setGuardando(true); setError(''); setMensaje('');
    try {
      const { data } = await api.put('/servidor-portal/mis-datos', { ...credenciales(), ...form });
      setPerfil(data);
      setMensaje('✓ Tus datos quedaron actualizados.');
      setEditando(false);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  if (!editando) {
    return (
      <Tarjeta>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Mis datos de contacto</p>
          <button onClick={() => setEditando(true)} className="text-sm font-semibold text-gold hover:underline">Editar</button>
        </div>
        <div className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <p><strong className="text-ink/70">Celular:</strong> {perfil.celular || '—'}</p>
          <p><strong className="text-ink/70">Email:</strong> {perfil.email || '—'}</p>
          <p><strong className="text-ink/70">Estado civil:</strong> {perfil.estado_civil || '—'}</p>
          <p><strong className="text-ink/70">Hijos:</strong> {perfil.hijos_cantidad ?? '—'}</p>
          <p><strong className="text-ink/70">Profesión:</strong> {perfil.profesion || '—'}</p>
          <p><strong className="text-ink/70">Contacto emergencia:</strong> {perfil.contacto_emergencia_telefono || '—'}</p>
          <p><strong className="text-ink/70">Tiempo en FIHNEC:</strong> {perfil.tiempo_fihnec || '—'}</p>
          <p><strong className="text-ink/70">Zona:</strong> {perfil.zona || '—'}</p>
          <p><strong className="text-ink/70">Departamento:</strong> {perfil.departamento || '—'}</p>
          <p><strong className="text-ink/70">Municipio:</strong> {perfil.municipio || '—'}</p>
        </div>
        {mensaje && <p className="mt-3 rounded-lg bg-palm/10 p-2 text-center text-sm text-palm">{mensaje}</p>}
      </Tarjeta>
    );
  }

  return (
    <Tarjeta>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Editar mis datos</p>
        <button onClick={() => setEditando(false)}
          className="rounded-full border border-ink/20 bg-ink/5 px-4 py-1.5 text-sm font-semibold text-ink/70 transition hover:bg-ink/10">Cancelar</button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        {form.foto && <img src={form.foto} alt="Foto" className="h-16 w-14 rounded-lg border border-ink/10 object-cover" />}
        <input ref={inputFotoRef} type="file" accept="image/*" onChange={subirFoto} className="hidden" />
        <button type="button" onClick={() => inputFotoRef.current?.click()}
          className="rounded-full border border-ink/20 px-4 py-2 text-sm font-medium hover:bg-ink/5">
          {form.foto ? '📷 Cambiar foto' : '📷 Subir foto'}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input value={form.celular} onChange={set('celular')} placeholder="Celular" className={claseCampo} />
        <input value={form.email} onChange={set('email')} placeholder="Email" type="email" className={claseCampo} />

        <select value={form.estado_civil} onChange={set('estado_civil')} className={claseCampo}>
          <option value="">Estado civil…</option>
          {ESTADOS_CIVILES.map(o => <option key={o}>{o}</option>)}
        </select>
        <input value={form.hijos_cantidad} onChange={set('hijos_cantidad')} type="number" min="0" placeholder="Cantidad de hijos" className={claseCampo} />

        <input value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')} type="date" className={claseCampo} />
        <input value={form.profesion} onChange={set('profesion')} placeholder="Profesión" className={claseCampo} />

        <input value={form.nombre_esposa} onChange={set('nombre_esposa')} placeholder="Nombre de la esposa (si aplica)" className={claseCampo} />
        <input value={form.nietos_cantidad} onChange={set('nietos_cantidad')} type="number" min="0" placeholder="Cantidad de nietos" className={claseCampo} />

        <input value={form.contacto_emergencia_telefono} onChange={set('contacto_emergencia_telefono')} placeholder="Teléfono de emergencia" className={claseCampo} />
        <input value={form.tiempo_fihnec} onChange={set('tiempo_fihnec')} placeholder='Tiempo en FIHNEC (ej. "5 años")' className={claseCampo} />

        <select value={form.zona} onChange={set('zona')} className={claseCampo}>
          <option value="">Zona…</option>
          {ZONAS_FIHNEC.map(z => <option key={z}>{z}</option>)}
        </select>
        <select value={form.tipo_testimonio} onChange={set('tipo_testimonio')} className={claseCampo}>
          <option value="">Tipo de testimonio…</option>
          {TIPOS_TESTIMONIO.map(t => <option key={t}>{t}</option>)}
        </select>

        <select value={form.departamento} onChange={cambiarDepartamento} className={claseCampo}>
          <option value="">Departamento…</option>
          {DEPARTAMENTOS_HONDURAS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select value={form.municipio} onChange={set('municipio')} disabled={!form.departamento} className={claseCampo}>
          <option value="">{form.departamento ? 'Municipio…' : 'Primero elige departamento'}</option>
          {municipiosDisponibles.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      <div className="mt-4 space-y-3">
        <MultiSelect etiqueta="Cargos desempeñados (histórico)" opciones={CARGOS_FIHNEC}
          valores={form.cargos_desempenados} onCambiar={v => setForm(f => ({ ...f, cargos_desempenados: v }))} />
        <MultiSelect etiqueta="Formación oficial" opciones={FORMACION_OFICIAL}
          valores={form.formacion_oficial} onCambiar={v => setForm(f => ({ ...f, formacion_oficial: v }))} />
        <MultiSelect etiqueta="Otras participaciones" opciones={OTRAS_PARTICIPACIONES}
          valores={form.otras_participaciones} onCambiar={v => setForm(f => ({ ...f, otras_participaciones: v }))} />
      </div>

      {error && <p className="mt-3 rounded-lg bg-ember/10 p-2 text-sm text-ember">{error}</p>}
      <button onClick={guardarDatos} disabled={guardando}
        className="mt-4 w-full rounded-full bg-palm py-2.5 text-sm font-semibold text-white hover:bg-palm-light disabled:opacity-60">
        {guardando ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </Tarjeta>
  );
}

function TabTransporte({ credenciales }) {
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  const cargar = () => {
    setCargando(true);
    api.post('/servidor-portal/transporte', credenciales())
      .then(r => setEstado(r.data))
      .catch(err => setError(mensajeError(err)))
      .finally(() => setCargando(false));
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unirme = async (transporteId) => {
    setProcesando(true); setError('');
    try {
      await api.post('/servidor-portal/transporte/unirme', { ...credenciales(), transporte_id: transporteId });
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setProcesando(false);
    }
  };

  const salir = async () => {
    setProcesando(true); setError('');
    try {
      await api.post('/servidor-portal/transporte/salir', credenciales());
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setProcesando(false);
    }
  };

  if (cargando) return <Tarjeta><p className="text-center text-ink/40">Cargando…</p></Tarjeta>;
  if (!estado?.evento) return <Tarjeta><p className="text-center text-ink/40">No hay ningún evento activo por ahora.</p></Tarjeta>;

  return (
    <Tarjeta>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{estado.evento.nombre}</p>
      <p className="mt-1 mb-4 text-sm text-ink/60">Puedes estar en un solo vehículo a la vez — únete al que te convenga, y puedes cambiarte cuando quieras.</p>

      {error && <p className="mb-3 rounded-lg bg-ember/10 p-2 text-sm text-ember">{error}</p>}

      {estado.disponibles.length === 0 && (
        <p className="text-center text-sm text-ink/40">Todavía no hay vehículos registrados para este evento — pregúntale al administrador.</p>
      )}

      <div className="space-y-3">
        {estado.disponibles.map(t => {
          const esMio = t.id === estado.mi_transporte_id;
          return (
            <div key={t.id} className={`rounded-xl border p-4 ${esMio ? 'border-gold bg-gold/5' : 'border-ink/10'}`}>
              <p className="font-semibold text-ink">{t.departamento ? [t.departamento, t.municipio].filter(Boolean).join(' — ') : t.ciudad} · {t.tipo_vehiculo_nombre}</p>
              <p className="text-sm text-ink/60">{formatearFechaHora(t.fecha_salida, t.hora_salida)}</p>
              {t.conductor_nombre && <p className="text-sm text-ink/50">Conductor: {t.conductor_nombre}</p>}
              <p className="mt-1 text-xs text-ink/40">{t.ocupados}/{t.capacidad} ocupados{t.lleno ? ' · LLENO' : ''}</p>
              {esMio ? (
                <button onClick={salir} disabled={procesando}
                  className="mt-2 rounded-full bg-ember px-4 py-1.5 text-xs font-semibold text-white hover:bg-ember-light disabled:opacity-50">
                  Salir de este transporte
                </button>
              ) : (
                <button onClick={() => unirme(t.id)} disabled={procesando || t.lleno}
                  className="mt-2 rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-night hover:bg-gold-light disabled:opacity-50">
                  {t.lleno ? 'Lleno' : 'Unirme'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Tarjeta>
  );
}

// Inventario: solo se puede editar la cantidad/estado de una categoría si el servidor está
// asignado como responsable de ella (lo decide Carlos en el panel). Las demás siempre son
// de solo lectura, sin importar cuál sea.
function TabInventario({ credenciales }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState(null);
  const [valoresLocal, setValoresLocal] = useState({});

  const cargar = () => {
    api.post('/servidor-portal/inventario', credenciales())
      .then(r => {
        setDatos(r.data);
        const iniciales = {};
        for (const cat of r.data.categorias) for (const it of cat.items) iniciales[it.id] = it.cantidad_actual ?? '';
        setValoresLocal(iniciales);
      })
      .finally(() => setCargando(false));
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const guardarItem = async (itemId) => {
    setGuardandoId(itemId);
    try {
      await api.put(`/servidor-portal/inventario/${itemId}`, { ...credenciales(), cantidad_actual: valoresLocal[itemId] });
    } finally {
      setGuardandoId(null);
    }
  };

  if (cargando) return <Tarjeta><p className="text-center text-ink/40">Cargando…</p></Tarjeta>;

  if ((datos?.categorias || []).length === 0) {
    return (
      <Tarjeta>
        <p className="text-center text-sm text-ink/50">
          Todavía no estás asignado como responsable de ninguna categoría de Inventario — pregúntale al administrador.
        </p>
      </Tarjeta>
    );
  }

  return (
    <>
      {datos.categorias.map(cat => (
        <Tarjeta key={cat.id}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{cat.nombre}</p>
          <div className="mt-2 space-y-2">
            {cat.items.map(it => (
              <div key={it.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink/80">{it.nombre}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <input type="number" min="0" value={valoresLocal[it.id] ?? ''}
                    onChange={e => setValoresLocal(v => ({ ...v, [it.id]: e.target.value }))}
                    className="w-20 rounded-lg border border-ink/15 px-2 py-1 text-right" />
                  <span className={`w-4 text-center text-ink/40 ${it.tipo_medida === 'porcentaje' ? '' : 'invisible'}`}>%</span>
                  <button onClick={() => guardarItem(it.id)} disabled={guardandoId === it.id}
                    className="w-20 shrink-0 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-night hover:bg-gold-light disabled:opacity-50">
                    {guardandoId === it.id ? '…' : 'Guardar'}
                  </button>
                </div>
              </div>
            ))}
            {cat.items.length === 0 && <p className="text-sm text-ink/40">Sin ítems.</p>}
          </div>
        </Tarjeta>
      ))}
    </>
  );
}
