import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api, { mensajeError } from '../api';

const ORDEN_MODULOS = ['estadisticas', 'participantes', 'diplomas', 'reportes', 'medallas', 'servidores', 'inventario', 'transporte', 'eventos'];
const RUTA_POR_MODULO = {
  estadisticas: '/admin/panel', participantes: '/admin/participantes', diplomas: '/admin/diplomas',
  reportes: '/admin/reportes', medallas: '/admin/medallas', servidores: '/admin/servidores',
  inventario: '/admin/inventario', transporte: '/admin/transporte', eventos: '/admin/eventos'
};

// Misma firma visual que el Portal del Servidor: una llama pequeña que parpadea suave —
// usa la animación .flame-flicker, ya definida en el sistema.
function LlamaFirma({ className = '' }) {
  return (
    <svg viewBox="0 0 24 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="llamaFueraAdmin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E7B85C" />
          <stop offset="1" stopColor="#C9932F" />
        </linearGradient>
        <linearGradient id="llamaDentroAdmin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBF6EC" />
          <stop offset="1" stopColor="#E7B85C" />
        </linearGradient>
      </defs>
      <path d="M12 2C7 9 4 13 4 19a8 8 0 0 0 16 0c0-4-2-6-3-9-.5 3-2 4-3 3 .5-4-1-8-2-11z" fill="url(#llamaFueraAdmin)" />
      <path d="M12 12c-2 3-3 5-3 7a3 3 0 0 0 6 0c0-1.5-.5-2.5-1-4-.3 1-1 1.3-1.3.8.3-1.5-.2-2.8-.7-3.8z" fill="url(#llamaDentroAdmin)" />
    </svg>
  );
}

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const nav = useNavigate();

  // 'credenciales' -> 'pregunta_clave' (cada 90 días, si aplica) -> 'cambiar_clave' (opcional)
  // -> 'configurar' (primera vez con 2FA) o 'codigo' (2FA ya activado)
  const [paso, setPaso] = useState('credenciales');
  const [qr, setQr] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nombrePendiente, setNombrePendiente] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveNuevaConfirmar, setClaveNuevaConfirmar] = useState('');

  // Manda a la persona al primer módulo al que sí tiene acceso, en vez de asumir que todos
  // empiezan en Estadísticas.
  const irADestinoFinal = async (usuario) => {
    if (usuario.rol === 'cocina') { nav('/admin/cocina'); return; }
    if (usuario.rol === 'super_admin') { nav('/admin/panel'); return; }
    try {
      const { data: permisos } = await api.get('/admin/mis-permisos');
      const misModulos = new Set(permisos.map(p => p.modulo));
      const primerModulo = ORDEN_MODULOS.find(m => misModulos.has(m));
      nav(primerModulo ? RUTA_POR_MODULO[primerModulo] : '/admin/panel');
    } catch {
      nav('/admin/panel');
    }
  };

  const guardarSesionCompleta = async (data) => {
    localStorage.setItem('sfl_token', data.token);
    localStorage.setItem('sfl_user', JSON.stringify(data.usuario));
    if (data.dispositivo_token) localStorage.setItem('sfl_dispositivo_token', data.dispositivo_token);
    await irADestinoFinal(data.usuario);
  };

  // Cualquiera de los 3 puntos de entrada (login normal, posponer clave, cambiar clave)
  // puede terminar en el mismo abanico de resultados — se procesa igual en todos lados.
  const procesarRespuestaLogin = async (data) => {
    if (data.requiere_cambio_clave) {
      localStorage.setItem('sfl_token', data.token);
      setNombrePendiente(data.usuario?.nombre || '');
      setPaso('pregunta_clave');
      return;
    }
    if (data.requiere_configurar_2fa) {
      localStorage.setItem('sfl_token', data.token);
      setNombrePendiente(data.usuario?.nombre || '');
      const { data: qrData } = await api.get('/auth/2fa/qr');
      setQr(qrData.qr);
      setPaso('configurar');
      return;
    }
    if (data.requiere_codigo_2fa) {
      localStorage.setItem('sfl_token', data.token);
      setNombrePendiente(data.usuario?.nombre || '');
      setPaso('codigo');
      return;
    }
    await guardarSesionCompleta(data);
  };

  const entrar = async (e) => {
    e.preventDefault();
    setError(''); setCargando(true);
    try {
      const { data } = await api.post('/auth/login', { email, password, dispositivo_token: localStorage.getItem('sfl_dispositivo_token') });
      await procesarRespuestaLogin(data);
    } catch (err) {
      setError(mensajeError(err, 'Correo o contraseña incorrectos.'));
    } finally {
      setCargando(false);
    }
  };

  const omitirCambioClave = async () => {
    setError(''); setCargando(true);
    try {
      const { data } = await api.post('/auth/posponer-cambio-clave', { dispositivo_token: localStorage.getItem('sfl_dispositivo_token') });
      await procesarRespuestaLogin(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  };

  const cambiarClave = async (e) => {
    e.preventDefault();
    setError('');
    if (claveNueva !== claveNuevaConfirmar) { setError('La nueva contraseña no coincide en ambos campos.'); return; }
    if (claveNueva.length < 6) { setError('La nueva contraseña debe tener al menos 6 caracteres.'); return; }
    setCargando(true);
    try {
      const { data } = await api.post('/auth/cambiar-clave-login', { clave_nueva: claveNueva, dispositivo_token: localStorage.getItem('sfl_dispositivo_token') });
      setClaveNueva(''); setClaveNuevaConfirmar('');
      await procesarRespuestaLogin(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  };

  const confirmarConfiguracion = async (e) => {
    e.preventDefault();
    setError(''); setCargando(true);
    try {
      const { data } = await api.post('/auth/2fa/confirmar-setup', { codigo });
      await guardarSesionCompleta(data);
    } catch (err) {
      setError(mensajeError(err, 'Código incorrecto.'));
    } finally {
      setCargando(false);
    }
  };

  const enviarCodigo = async (e) => {
    e.preventDefault();
    setError(''); setCargando(true);
    try {
      const { data } = await api.post('/auth/2fa/verificar', { codigo });
      await guardarSesionCompleta(data);
    } catch (err) {
      setError(mensajeError(err, 'Código incorrecto.'));
    } finally {
      setCargando(false);
    }
  };

  const claseInput = 'w-full rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-ink outline-none focus:border-gold focus:ring-2 focus:ring-gold/20';

  return (
    <section className="relative min-h-[85vh] overflow-hidden bg-night grain-overlay">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-ember/20 blur-3xl" />
      <div className="relative mx-auto flex min-h-[85vh] max-w-md flex-col justify-center px-5 py-16">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-parchment/50 transition hover:text-parchment">
            <span aria-hidden>←</span> Volver al sitio principal
          </Link>
          {/* Acceso Servidores: oculto en SFL Damas (no es parte del alcance de este sistema).
              La ruta /servidores/portal y su página siguen existiendo — solo se quitó el enlace. */}
        </div>

        <div className="text-center">
          <LlamaFirma className="flame-flicker mx-auto h-9 w-7" />
          <p className="mt-4 inline-block rounded-full border border-gold/30 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold-light">
            Acceso restringido
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold text-parchment">Panel administrativo SFL</h1>
          <p className="mx-auto mt-3 max-w-sm text-balance text-parchment/70">
            Ingresa tu correo y tu contraseña para entrar al panel.
          </p>
        </div>

        {paso === 'credenciales' && (
          <form onSubmit={entrar} autoComplete="off" className="mt-8 space-y-4 rounded-2xl border border-gold/15 bg-parchment p-6 shadow-xl">
            <input
              required type="text" name="usuario_sfl" autoComplete="off"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo electrónico o usuario"
              className={claseInput}
            />
            <input
              required type="password" name="clave_sfl" autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña"
              className={claseInput}
            />
            {error && <p className="rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}
            <button disabled={cargando} className="w-full rounded-full bg-gold py-2.5 font-semibold text-night hover:bg-gold-light disabled:opacity-60">
              {cargando ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        )}

        {paso === 'pregunta_clave' && (
          <div className="mt-8 space-y-4 rounded-2xl border border-gold/15 bg-parchment p-6 shadow-xl">
            <p className="text-center text-sm text-ink/70">
              Hola {nombrePendiente} — por seguridad, cada cierto tiempo te sugerimos cambiar tu contraseña. ¿Quieres hacerlo ahora?
            </p>
            {error && <p className="rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={omitirCambioClave} disabled={cargando}
                className="flex-1 rounded-full border border-ink/20 py-2.5 text-sm font-semibold text-ink/60 transition hover:bg-ink/5 disabled:opacity-60">
                Más tarde
              </button>
              <button type="button" onClick={() => setPaso('cambiar_clave')} disabled={cargando}
                className="flex-1 rounded-full bg-gold py-2.5 text-sm font-semibold text-night transition hover:bg-gold-light disabled:opacity-60">
                Cambiar ahora
              </button>
            </div>
          </div>
        )}

        {paso === 'cambiar_clave' && (
          <form onSubmit={cambiarClave} autoComplete="off" className="mt-8 space-y-4 rounded-2xl border border-gold/15 bg-parchment p-6 shadow-xl">
            <p className="text-center text-sm text-ink/70">Escribe tu nueva contraseña:</p>
            <input
              required type="password" name="clave_nueva_sfl" autoComplete="new-password" minLength={6}
              value={claveNueva} onChange={e => setClaveNueva(e.target.value)} placeholder="Nueva contraseña"
              className={claseInput}
            />
            <input
              required type="password" name="clave_nueva_confirmar_sfl" autoComplete="new-password" minLength={6}
              value={claveNuevaConfirmar} onChange={e => setClaveNuevaConfirmar(e.target.value)} placeholder="Confirma la nueva contraseña"
              className={claseInput}
            />
            {error && <p className="rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => { setPaso('pregunta_clave'); setError(''); }} disabled={cargando}
                className="flex-1 rounded-full border border-ink/20 py-2.5 text-sm font-semibold text-ink/60 transition hover:bg-ink/5 disabled:opacity-60">
                Volver
              </button>
              <button disabled={cargando} className="flex-1 rounded-full bg-gold py-2.5 text-sm font-semibold text-night transition hover:bg-gold-light disabled:opacity-60">
                {cargando ? 'Guardando…' : 'Guardar y continuar'}
              </button>
            </div>
          </form>
        )}

        {paso === 'configurar' && (
          <form onSubmit={confirmarConfiguracion} autoComplete="off" className="mt-8 space-y-4 rounded-2xl border border-gold/15 bg-parchment p-6 shadow-xl">
            <p className="text-center text-sm text-ink/70">
              Hola {nombrePendiente} — tu cuenta requiere doble autenticación. Es la primera vez, así que hay que configurarla:
            </p>
            <ol className="space-y-1 text-xs text-ink/50">
              <li>1. Abre Google Authenticator (o cualquier app similar) en tu celular.</li>
              <li>2. Escanea este código QR:</li>
            </ol>
            {qr ? (
              <img src={qr} alt="Código QR para 2FA" className="mx-auto h-44 w-44 rounded-lg border border-ink/10 bg-white p-2" />
            ) : (
              <p className="text-center text-sm text-ink/50">Cargando código QR…</p>
            )}
            <p className="text-center text-xs text-ink/50">3. Escribe aquí el código de 6 dígitos que te muestra la app:</p>
            <input
              required maxLength={6} inputMode="numeric" autoComplete="off" placeholder="123456" value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              className={`${claseInput} text-center text-2xl tracking-[0.3em]`}
            />
            {error && <p className="rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}
            <button disabled={cargando || codigo.length !== 6} className="w-full rounded-full bg-gold py-2.5 font-semibold text-night hover:bg-gold-light disabled:opacity-60">
              {cargando ? 'Verificando…' : 'Activar y entrar'}
            </button>
          </form>
        )}

        {paso === 'codigo' && (
          <form onSubmit={enviarCodigo} autoComplete="off" className="mt-8 space-y-4 rounded-2xl border border-gold/15 bg-parchment p-6 shadow-xl">
            <p className="text-center text-sm text-ink/70">
              Hola {nombrePendiente} — abre tu app autenticadora y escribe el código de 6 dígitos:
            </p>
            <input
              required maxLength={6} inputMode="numeric" autoComplete="off" autoFocus placeholder="123456" value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              className={`${claseInput} text-center text-2xl tracking-[0.3em]`}
            />
            {error && <p className="rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}
            <button disabled={cargando || codigo.length !== 6} className="w-full rounded-full bg-gold py-2.5 font-semibold text-night hover:bg-gold-light disabled:opacity-60">
              {cargando ? 'Verificando…' : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
