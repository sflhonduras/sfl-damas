import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../api';
import logoNavbar from '../assets/logo-navbar.png';

// "Carlos Marcia" -> "CM". Si solo hay un nombre, usa las 2 primeras letras de ese nombre.
function iniciales(nombre) {
  if (!nombre) return '?';
  const partes = nombre.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const enlaces = [
  { to: '/admin/panel', label: 'Estadísticas', icon: '📊', modulo: 'estadisticas' },
  { to: '/admin/participantes', label: 'Participantes', icon: '👥', modulo: 'participantes' },
  { to: '/admin/diplomas', label: 'Diplomas', icon: '🎓', modulo: 'diplomas' },
  { to: '/admin/reportes', label: 'Reportería', icon: '📋', modulo: 'reportes' },
  // Medallas: oculto en SFL Damas (no es parte del alcance de este sistema). El código,
  // la ruta y la página siguen existiendo — solo se quitó del menú.
  // { to: '/admin/medallas', label: 'Medallas', icon: '🏅', modulo: 'medallas' },
  { to: '/admin/servidores', label: 'Servidores', icon: '🙌', modulo: 'servidores' },
  { to: '/admin/inventario', label: 'Inventario', icon: '📦', modulo: 'inventario' },
  { to: '/admin/transporte', label: 'Transporte', icon: '🚐', modulo: 'transporte' },
  { to: '/admin/eventos', label: 'Eventos', icon: '🗓️', soloSuperAdmin: true },
  { to: '/admin/usuarios', label: 'Usuarios', icon: '🔑', soloSuperAdmin: true },
  { to: '/admin/auditoria', label: 'Auditoría', icon: '🕵️', soloSuperAdmin: true },
  { to: '/admin/mantenimiento', label: 'Mantenimiento', icon: '🛠️', soloSuperAdmin: true },
];

// Reportería ahora es grupo (Reportería + Medallas adentro), ya no queda suelta.
const GRUPOS_MENU = [
  { nombre: 'Dashboard', hijos: ['/admin/panel'] },
  { nombre: 'Registro', hijos: ['/admin/participantes', '/admin/diplomas'] },
  { nombre: 'Reportería', hijos: ['/admin/reportes'] }, // Medallas oculto en SFL Damas
  { nombre: 'Operativo', hijos: ['/admin/servidores', '/admin/inventario', '/admin/transporte'] },
  { nombre: 'Configuración', hijos: ['/admin/eventos', '/admin/usuarios', '/admin/auditoria', '/admin/mantenimiento'] },
];

// Etiquetas para mostrar el rol en la barra lateral.

const ETIQUETA_ROL = {
  super_admin: 'Super Administrador',
  admin: 'Administrador',
  consulta: 'Consulta (solo lectura)',
  cocina: 'Cocina',
  estandar: 'Usuario Estándar',
  registro: 'Registro'
};

export default function AdminLayout() {
  const nav = useNavigate();
  const location = useLocation();
  const usuario = JSON.parse(localStorage.getItem('sfl_user') || 'null');
  const [eventoActual, setEventoActual] = useState(null);
  const [misModulos, setMisModulos] = useState(null);
  const [modalDispositivos, setModalDispositivos] = useState(null); // null | 'confirmar' | 'procesando' | 'listo' | 'error'
  const [confirmarSalirAlSitio, setConfirmarSalirAlSitio] = useState(false);
  const [grupoAbierto, setGrupoAbierto] = useState(null);
  const [menuEngranaje, setMenuEngranaje] = useState(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [vistaMenu, setVistaMenu] = useState(() => localStorage.getItem('sfl_vista_menu') || 'horizontal');

  const cambiarVista = (v) => {
    setVistaMenu(v);
    localStorage.setItem('sfl_vista_menu', v);
    setGrupoAbierto(null);
  };

  useEffect(() => {
    // Se vuelve a pedir cada vez que se navega a otra pantalla (no solo una vez al entrar
    // al panel) — así, si marcas/desmarcas a alguien en Participantes y luego miras el
    // navbar, ya trae el número actualizado en vez de quedarse con el de antes.
    const cargarResumen = () => {
      api.get('/admin/evento-actual-resumen').then(r => {
        setEventoActual(r.data.evento_actual);
      }).catch(() => {});
    };
    cargarResumen();
    // También se refresca sin necesidad de cambiar de pantalla — Participantes (y
    // cualquier otra pantalla que toque estos números) avisa con este evento apenas
    // termina de marcar/desmarcar a alguien.
    window.addEventListener('sfl:refrescar-evento-actual', cargarResumen);
    return () => window.removeEventListener('sfl:refrescar-evento-actual', cargarResumen);
  }, [location.pathname]);

  useEffect(() => {
    if (usuario?.rol && usuario.rol !== 'super_admin' && usuario.rol !== 'cocina') {
      api.get('/admin/mis-permisos').then(r => setMisModulos(new Set(r.data.map(p => p.modulo)))).catch(() => setMisModulos(new Set()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const puedeVer = (l) => {
    const rol = usuario?.rol;
    if (l.soloSuperAdmin) return rol === 'super_admin';
    if (rol === 'super_admin') return true;
    if (rol === 'cocina') return false;
    if (!l.modulo) return true;
    return misModulos ? misModulos.has(l.modulo) : false;
  };
  const enlacesVisibles = enlaces.filter(puedeVer);

  // Cada grupo se arma con los enlaces reales que ya pasaron el filtro de permisos — si a
  // alguien no le queda ningún hijo visible en un grupo (ej. un admin sin acceso a nada de
  // Configuración), el grupo completo no aparece, en vez de mostrarse vacío.
  const gruposConHijos = GRUPOS_MENU.map(g => ({
    ...g,
    items: g.hijos.map(to => enlacesVisibles.find(e => e.to === to)).filter(Boolean)
  })).filter(g => g.items.length > 0);

  const salir = () => {
    localStorage.removeItem('sfl_token');
    localStorage.removeItem('sfl_user');
    nav('/admin');
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* NAVBAR — arriba de todo, fuera del sidebar. Iniciales + nombre + rol a la
          izquierda, logo de FIHNEC centrado, "Cerrar sesión" a la derecha. */}
      <header className="sticky top-0 z-40 hidden items-center justify-between border-b border-gold/15 bg-parchment px-6 py-2.5 sm:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-xs font-semibold text-night">
            {iniciales(usuario?.nombre)}
          </div>
          <div>
            <p className="font-display text-sm font-semibold leading-tight text-ink">{usuario?.nombre}</p>
            <span className="inline-block rounded bg-gold-pale px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6B4E1E]">
              {ETIQUETA_ROL[usuario?.rol] || usuario?.rol}
            </span>
          </div>
        </div>
        <button onClick={() => setConfirmarSalirAlSitio(true)} className="transition hover:opacity-75">
          <img src={logoNavbar} alt="FIHNEC — volver al sitio principal" className="h-9" />
        </button>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setMenuEngranaje(a => !a)}
              aria-label="Configuración"
              className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${menuEngranaje ? 'border-gold bg-gold/10 text-gold' : 'border-ink/10 text-ink/50 hover:bg-ink/5'}`}
            >
              ⚙️
            </button>
            {menuEngranaje && (
              <div className="absolute right-0 top-full z-10 mt-2 min-w-[210px] rounded-lg border border-ink/10 bg-white py-1.5 shadow-xl">
                <button onClick={() => { cambiarVista('horizontal'); setMenuEngranaje(false); }}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-xs ${vistaMenu === 'horizontal' ? 'font-semibold text-gold' : 'text-ink/70 hover:bg-ink/5'}`}>
                  Vista horizontal {vistaMenu === 'horizontal' && '✓'}
                </button>
                <button onClick={() => { cambiarVista('vertical'); setMenuEngranaje(false); }}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-xs ${vistaMenu === 'vertical' ? 'font-semibold text-gold' : 'text-ink/70 hover:bg-ink/5'}`}>
                  Vista vertical {vistaMenu === 'vertical' && '✓'}
                </button>
                <div className="my-1.5 border-t border-ink/10" />
                <button onClick={() => { setMenuEngranaje(false); setConfirmarSalirAlSitio(true); }}
                  className="flex w-full items-center px-4 py-2 text-left text-xs text-ink/70 hover:bg-ink/5">
                  Sitio Principal
                </button>
                {usuario?.two_factor_enabled && (
                  <button onClick={() => { setMenuEngranaje(false); setModalDispositivos('confirmar'); }}
                    className="flex w-full items-center px-4 py-2 text-left text-xs text-ink/70 hover:bg-ink/5">
                    Olvidar Dispositivos Confiables
                  </button>
                )}
              </div>
            )}
          </div>
          <button onClick={salir} className="rounded-lg bg-[#9A6136] px-4 py-2 text-xs font-semibold text-parchment transition hover:bg-[#B57A4A]">
            Cerrar sesión
          </button>
        </div>
      </header>

      {(menuEngranaje) && <div className="fixed inset-0 z-20" onClick={() => setMenuEngranaje(false)} />}

      {vistaMenu === 'horizontal' && (
        <div className="sticky top-[52px] z-30 hidden grid-cols-3 items-center border-b-2 border-gold bg-night px-6 py-2 sm:grid">
          {eventoActual ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="flex h-4 w-1 shrink-0 flex-col overflow-hidden rounded-full">
                <span className="flex-1 bg-[#C9932F]" />
                <span className="flex-1 bg-[#9A6136]" />
                <span className="flex-1 bg-[#F59D24]" />
                <span className="flex-1 bg-[#2F5D3A]" />
              </span>
              <span className="truncate text-xs font-semibold text-gold-light">{eventoActual.nombre}</span>
            </div>
          ) : <div />}

          <div className="flex justify-center gap-5">
            {gruposConHijos.map(g => {
              const esGrupoActivo = g.items.some(item => location.pathname.startsWith(item.to));
              return (
              <div key={g.nombre} className="relative"
                onMouseEnter={() => setGrupoAbierto(g.nombre)}
                onMouseLeave={() => setGrupoAbierto(a => a === g.nombre ? null : a)}
              >
                <button
                  onClick={() => setGrupoAbierto(a => a === g.nombre ? null : g.nombre)}
                  className={`text-xs font-semibold transition ${grupoAbierto === g.nombre || esGrupoActivo ? 'text-gold-light' : 'text-parchment/80 hover:text-parchment'}`}
                >
                  {g.nombre} <span className="text-[9px]">▾</span>
                </button>
                {grupoAbierto === g.nombre && (
                  <div className="absolute left-1/2 top-full z-10 min-w-[190px] -translate-x-1/2 rounded-lg border border-gold/20 bg-night py-1.5 shadow-xl">
                    {g.items.map(item => (
                      <NavLink key={item.to} to={item.to} onClick={() => setGrupoAbierto(null)}
                        className="flex items-center gap-2 px-4 py-2 text-xs text-parchment/80 hover:bg-parchment/5 hover:text-parchment">
                        <span>{item.icon}</span> {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {eventoActual && (
            <div className="flex items-center justify-end gap-3 text-xs">
              <span className="whitespace-nowrap text-parchment/40">Inscritos <strong className="text-parchment">{eventoActual.total_ciclo_actual ?? '…'}</strong></span>
              <span className="whitespace-nowrap text-parchment/40">Registrados <strong className="text-gold-light">{eventoActual.total_registrados ?? '…'}</strong></span>
              <span className="whitespace-nowrap text-parchment/40">Sin Requisitos <strong className="text-[#E88C4D]">{eventoActual.total_sin_requisitos ?? 0}</strong></span>
              <span className="whitespace-nowrap text-parchment/40">TP <strong className="text-gold-light">{eventoActual.total_registrados_general ?? '…'}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Clic afuera de un menú abierto lo cierra */}
      {grupoAbierto && <div className="fixed inset-0 z-20" onClick={() => setGrupoAbierto(null)} />}

    <div className="flex min-h-[85vh] flex-col bg-parchment-2 sm:flex-row">
      <div className="flex items-center justify-between border-b border-ink/10 bg-night px-4 py-3 sm:hidden">
        <button onClick={() => setMenuMovilAbierto(true)} aria-label="Abrir menú" className="text-xl text-parchment">☰</button>
        <div className="flex items-center gap-2.5 text-xs font-semibold text-gold-light">
          <span>{eventoActual?.total_ciclo_actual ?? '…'} insc.</span>
          <span className="text-parchment/30">|</span>
          <span>{eventoActual?.total_registrados_general ?? '…'} reg.</span>
        </div>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-[10px] font-semibold text-night">
          {iniciales(usuario?.nombre)}
        </div>
      </div>

      {/* Drawer móvil: menú completo a pantalla completa, patrón estándar (☰ para abrir,
          ✕ o tocar afuera para cerrar) — evita apretar un sidebar de 256px en una
          pantalla angosta. */}
      {menuMovilAbierto && (
        <div className="fixed inset-0 z-50 bg-night sm:hidden">
          <div className="flex items-center justify-between border-b border-parchment/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-xs font-semibold text-night">
                {iniciales(usuario?.nombre)}
              </div>
              <div>
                <p className="text-sm font-semibold text-parchment">{usuario?.nombre}</p>
                <p className="text-[10px] text-parchment/50">{ETIQUETA_ROL[usuario?.rol] || usuario?.rol}</p>
              </div>
            </div>
            <button onClick={() => setMenuMovilAbierto(false)} aria-label="Cerrar menú" className="text-2xl text-parchment/60">✕</button>
          </div>

          <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(100vh - 64px)' }}>
            {eventoActual && (
              <div className="mb-4 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-center">
                <p className="text-xs uppercase tracking-wide text-gold-light">Evento actual</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-parchment/40">Inscritos</p>
                    <p className="font-display text-2xl font-bold text-parchment">{eventoActual.total_ciclo_actual ?? '…'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-parchment/40">Registrados</p>
                    <p className="font-display text-2xl font-bold text-parchment">{eventoActual.total_registrados_general ?? '…'}</p>
                    {eventoActual.total_sin_requisitos > 0 && (
                      <p className="text-[10px] text-parchment/40">={eventoActual.total_registrados} R + {eventoActual.total_sin_requisitos} SR</p>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-parchment/50">{eventoActual.nombre}</p>
              </div>
            )}

            <nav className="space-y-1">
              {enlacesVisibles.map(l => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={() => setMenuMovilAbierto(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      isActive ? 'bg-gold/15 text-gold-light' : 'text-parchment/70 hover:bg-parchment/5'
                    }`
                  }
                >
                  <span>{l.icon}</span>{l.label}
                </NavLink>
              ))}
            </nav>

            <div className="mt-6 space-y-2 border-t border-parchment/10 pt-4">
              <button
                onClick={() => { setMenuMovilAbierto(false); setConfirmarSalirAlSitio(true); }}
                className="w-full rounded-lg border border-parchment/15 py-2.5 text-sm text-parchment/70"
              >
                Sitio Principal
              </button>
              {usuario?.two_factor_enabled && (
                <button
                  onClick={() => { setMenuMovilAbierto(false); setModalDispositivos('confirmar'); }}
                  className="w-full rounded-lg border border-parchment/15 py-2.5 text-sm text-parchment/70"
                >
                  Olvidar Dispositivos Confiables
                </button>
              )}
              <button onClick={salir} className="w-full rounded-lg bg-[#9A6136] py-2.5 text-sm font-semibold text-parchment">
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className={vistaMenu === 'vertical' ? "hidden w-64 shrink-0 border-r border-ink/10 bg-night p-5 sm:block" : "hidden"}>
        {/* Vista, Sitio principal y nombre/rol ya viven en el ⚙️ del navbar — no se
            repiten aquí. La tarjeta de Evento actual sube a ser lo primero que se ve. */}
        <div className="rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-center">
          <p className="text-xs uppercase tracking-wide text-gold-light">Evento actual</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-parchment/40">Inscritos</p>
              <p className="font-display text-2xl font-bold text-parchment">{eventoActual?.total_ciclo_actual ?? '…'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-parchment/40">Registrados</p>
              <p className="font-display text-2xl font-bold text-parchment">{eventoActual?.total_registrados_general ?? '…'}</p>
              {eventoActual && (
                <p className="text-[10px] text-parchment/40">
                  ={eventoActual.total_registrados} R{eventoActual.total_sin_requisitos > 0 ? ` + ${eventoActual.total_sin_requisitos} SR` : ''}
                </p>
              )}
            </div>
          </div>
          {eventoActual && (() => {
            const [titulo, subtitulo] = eventoActual.nombre.split(/:\s*/, 2);
            return (
              <p className="mt-2 text-xs text-parchment/50">
                {titulo}{subtitulo && <><br />{subtitulo}</>}
              </p>
            );
          })()}
        </div>

        <nav className="mt-8 space-y-1">
          {enlacesVisibles.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-gold/15 text-gold-light' : 'text-parchment/70 hover:bg-parchment/5'
                }`
              }
            >
              <span>{l.icon}</span>{l.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-x-auto p-6">
        <Outlet />
      </main>

      {confirmarSalirAlSitio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-ink">Volver al sitio principal</h2>
              <button onClick={() => setConfirmarSalirAlSitio(false)} className="text-ink/40 hover:text-ink">✕</button>
            </div>
            <p className="mt-3 text-sm text-ink/60">
              Vas a salir del panel administrativo. Tu sesión sigue activa — puedes volver a entrar cuando quieras.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmarSalirAlSitio(false)}
                className="flex-1 rounded-full border border-ink/20 py-2.5 text-sm font-semibold text-ink/60 hover:bg-ink/5">
                Cancelar
              </button>
              <button onClick={() => nav('/')}
                className="flex-1 rounded-full bg-gold py-2.5 text-sm font-semibold text-night hover:bg-gold-light">
                Sí, salir
              </button>
            </div>
          </div>
        </div>
      )}

      {modalDispositivos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            {modalDispositivos === 'confirmar' && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-ink">Olvidar dispositivos confiables</h2>
                  <button onClick={() => setModalDispositivos(null)} className="text-ink/40 hover:text-ink">✕</button>
                </div>
                <p className="mt-3 text-sm text-ink/60">
                  Esto borra la confianza de <strong>todos</strong> los navegadores donde hayas iniciado sesión con 2FA —
                  incluido este mismo. La próxima vez que alguien entre a tu cuenta, desde cualquier lado, se le va a
                  pedir el código de la app autenticadora otra vez.
                </p>
                <div className="mt-5 flex gap-3">
                  <button onClick={() => setModalDispositivos(null)}
                    className="flex-1 rounded-full border border-ink/20 py-2.5 text-sm font-semibold text-ink/60 hover:bg-ink/5">
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      setModalDispositivos('procesando');
                      try {
                        await api.delete('/auth/2fa/dispositivos');
                        localStorage.removeItem('sfl_dispositivo_token');
                        setModalDispositivos('listo');
                      } catch {
                        setModalDispositivos('error');
                      }
                    }}
                    className="flex-1 rounded-full bg-ember py-2.5 text-sm font-semibold text-parchment hover:bg-ember-light">
                    Sí, olvidar todos
                  </button>
                </div>
              </>
            )}

            {modalDispositivos === 'procesando' && (
              <p className="py-6 text-center text-sm text-ink/50">Procesando…</p>
            )}

            {modalDispositivos === 'listo' && (
              <>
                <p className="text-center text-3xl">✓</p>
                <p className="mt-2 text-center text-sm font-semibold text-ink">Listo, dispositivos olvidados</p>
                <p className="mt-1 text-center text-xs text-ink/50">
                  La próxima vez que se inicie sesión (en cualquier navegador) se pedirá el código 2FA de nuevo.
                </p>
                <button onClick={() => setModalDispositivos(null)}
                  className="mt-5 w-full rounded-full bg-gold py-2.5 text-sm font-semibold text-night hover:bg-gold-light">
                  Cerrar
                </button>
              </>
            )}

            {modalDispositivos === 'error' && (
              <>
                <p className="text-center text-sm text-ember">No se pudo completar la acción. Intenta de nuevo.</p>
                <button onClick={() => setModalDispositivos('confirmar')}
                  className="mt-5 w-full rounded-full bg-gold py-2.5 text-sm font-semibold text-night hover:bg-gold-light">
                  Reintentar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
