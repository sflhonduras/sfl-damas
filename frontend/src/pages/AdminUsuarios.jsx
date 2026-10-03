import { useEffect, useState } from 'react';
import api, { mensajeError } from '../api';

const ETIQUETA_ROL = {
  super_admin: 'Super Administrador',
  admin: 'Administrador',
  consulta: 'Consulta',
  cocina: 'Cocina',
  estandar: 'Usuario Estándar',
  registro: 'Registro'
};

const COLOR_ROL = {
  super_admin: 'bg-night text-gold-light',
  admin: 'bg-ember/10 text-ember',
  cocina: 'bg-palm/10 text-palm',
  estandar: 'bg-gold/10 text-gold',
  registro: 'bg-palm/10 text-palm',
  consulta: 'bg-ink/10 text-ink/60'
};

const ETIQUETA_NIVEL = { consulta: 'Consulta (solo ver)', edicion: 'Edición (ver y modificar)' };

// Roles asignables — "Super Administrador" nunca aparece como opción (solo Carlos lo tiene).
// Todos estos roles ahora usan permisos configurables módulo por módulo (excepto Cocina, que
// tiene su propia pantalla dedicada y no usa el sistema de módulos).
// Cocina: oculto en SFL Damas (no es parte del alcance de este sistema) — no se ofrece
// como opción al crear/editar usuarios, así nadie termina con ese rol por error. El resto
// del código que maneja 'cocina' (pantalla, chequeos defensivos) sigue intacto.
const ROLES_EDITABLES = [
  { valor: 'registro', etiqueta: 'Registro' },
  { valor: 'consulta', etiqueta: 'Consulta' },
  { valor: 'estandar', etiqueta: 'Usuario Estándar' },
  { valor: 'admin', etiqueta: 'Administrador' }
];

const DESCRIPCION_ROL = {
  consulta: 'Tú le configuras, módulo por módulo, qué puede ver.',
  admin: 'Tú le configuras, módulo por módulo, qué ve o edita.',
  cocina: 'Solo ve el resumen de asistentes — no usa módulos.',
  estandar: 'Tú le configuras, módulo por módulo, qué ve o edita.',
  registro: 'Tú le configuras, módulo por módulo, qué ve o edita.'
};

function ModalEditarUsuario({ usuario, onCerrar, onGuardado }) {
  const esSuperAdmin = usuario.rol === 'super_admin';
  const [nombre, setNombre] = useState(usuario.nombre);
  const [rol, setRol] = useState(usuario.rol);
  const [activo, setActivo] = useState(usuario.activo);
  const [password, setPassword] = useState('');
  const [requiere2fa, setRequiere2fa] = useState(esSuperAdmin ? true : !!usuario.requiere_2fa);
  const [guardando, setGuardando] = useState(false);
  const [reiniciando2fa, setReiniciando2fa] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    if (password && password.trim().length > 0 && password.trim().length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres, o déjala en blanco para no cambiarla.');
      return;
    }
    setGuardando(true); setError('');
    try {
      const cuerpo = { nombre, activo };
      if (!esSuperAdmin) { cuerpo.rol = rol; cuerpo.requiere_2fa = requiere2fa; }
      if (password.trim()) cuerpo.password = password.trim();
      await api.put(`/admin/usuarios/${usuario.id}`, cuerpo);
      const rolCambio = !esSuperAdmin && rol !== 'cocina' && rol !== usuario.rol;
      onGuardado(rolCambio);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const reiniciar2fa = async () => {
    if (!confirm(`¿Reiniciar el 2FA de ${usuario.nombre}? La próxima vez que entre, va a tener que escanear un código QR nuevo (útil si perdió el celular).`)) return;
    setReiniciando2fa(true); setError('');
    try {
      await api.post(`/admin/usuarios/${usuario.id}/resetear-2fa`);
      alert('2FA reiniciado. La próxima vez que esta persona entre, va a configurar uno nuevo.');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setReiniciando2fa(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <p className="font-display text-lg font-bold text-ink">Editar usuario</p>
        <p className="mt-1 text-xs text-ink/50">{usuario.email}</p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Nombre</span>
            <input value={nombre} onChange={e => setNombre(e.target.value)} className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm" />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Rol</span>
            {esSuperAdmin ? (
              <p className="rounded-lg bg-ink/5 px-3 py-2 text-sm text-ink/50">Super Administrador (no se puede cambiar)</p>
            ) : (
              <>
                <select value={rol} onChange={e => setRol(e.target.value)} className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm">
                  {ROLES_EDITABLES.map(r => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
                </select>
                <p className="mt-1 text-xs text-ink/40">{DESCRIPCION_ROL[rol]}</p>
              </>
            )}
          </label>

          {!esSuperAdmin && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
              <span className="text-ink/70">Usuario activo</span>
            </label>
          )}

          <div className="rounded-xl border border-ink/10 bg-parchment-2 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requiere2fa}
                disabled={esSuperAdmin}
                onChange={e => setRequiere2fa(e.target.checked)}
              />
              <span className="font-medium text-ink/70">Requiere doble autenticación (2FA)</span>
            </label>
            <p className="mt-1 text-xs text-ink/40">
              {esSuperAdmin
                ? 'El Super Administrador siempre la tiene activa, no se puede quitar.'
                : 'Actívalo para cualquier persona que pueda editar datos sensibles, sin importar su rol.'}
            </p>

            {usuario.two_factor_enabled && (
              <div className="mt-2 flex items-center justify-between border-t border-ink/10 pt-2">
                <span className="text-xs text-palm">✓ Ya lo configuró</span>
                <button type="button" onClick={reiniciar2fa} disabled={reiniciando2fa}
                  className="text-xs text-ember/70 hover:text-ember hover:underline disabled:opacity-50">
                  {reiniciando2fa ? 'Reiniciando…' : 'Reiniciar (perdió el celular)'}
                </button>
              </div>
            )}
            {!usuario.two_factor_enabled && (requiere2fa || esSuperAdmin) && (
              <p className="mt-2 border-t border-ink/10 pt-2 text-xs text-ink/40">Aún no lo ha configurado — se lo va a pedir en su próximo inicio de sesión.</p>
            )}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Nueva contraseña (opcional)</span>
            <input type="password" name="clave_editar_usuario_sfl" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Dejar en blanco para no cambiarla"
              className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm" />
          </label>
        </div>

        {error && <p className="mt-3 rounded-lg bg-ember/10 p-2 text-xs text-ember">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => onCerrar()} className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink/60 hover:bg-ink/5">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando}
            className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelPermisos({ usuario, modulos, onCerrar }) {
  const [permisos, setPermisos] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/admin/usuarios/${usuario.id}/permisos`).then(r => {
      const mapa = {};
      r.data.forEach(p => { mapa[p.modulo] = p.nivel; });
      setPermisos(mapa);
    }).catch(() => setError('No se pudieron cargar los permisos actuales.')).finally(() => setCargando(false));
  }, [usuario.id]);

  const guardar = async () => {
    setGuardando(true); setError('');
    const lista = Object.entries(permisos)
      .filter(([, nivel]) => nivel)
      .map(([modulo, nivel]) => ({ modulo, nivel }));
    try {
      await api.put(`/admin/usuarios/${usuario.id}/permisos`, { permisos: lista });
      onCerrar(true);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <p className="font-display text-lg font-bold text-ink">Permisos de {usuario.nombre}</p>
        <p className="mt-1 text-xs text-ink/50">
          Elige, módulo por módulo, si {usuario.nombre} puede solo ver, o también editar. Si dejas "Sin acceso", no le va a
          aparecer esa sección en el panel. Usuarios, Auditoría y Mantenimiento nunca aparecen aquí — esas son exclusivas
          del Super Administrador.
        </p>

        {cargando ? (
          <p className="mt-4 text-sm text-ink/50">Cargando…</p>
        ) : (
          <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
            {modulos.map(m => (
              <label key={m.clave} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink/70">{m.etiqueta}</span>
                <select
                  value={permisos[m.clave] || ''}
                  onChange={e => setPermisos(p => ({ ...p, [m.clave]: e.target.value }))}
                  className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
                >
                  <option value="">Sin acceso</option>
                  <option value="consulta">{ETIQUETA_NIVEL.consulta}</option>
                  <option value="edicion">{ETIQUETA_NIVEL.edicion}</option>
                </select>
              </label>
            ))}
          </div>
        )}

        {error && <p className="mt-3 rounded-lg bg-ember/10 p-2 text-xs text-ember">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => onCerrar(false)} className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink/60 hover:bg-ink/5">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando || cargando}
            className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Guardar permisos'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'consulta' });
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);
  const [usuarioPermisos, setUsuarioPermisos] = useState(null);
  const [usuarioEditando, setUsuarioEditando] = useState(null);

  const cargar = () => api.get('/admin/usuarios').then(r => setUsuarios(r.data));
  useEffect(() => {
    cargar();
    api.get('/admin/modulos-disponibles').then(r => setModulos(r.data)).catch(() => {});
  }, []);

  const crear = async (e) => {
    e.preventDefault();
    setError(''); setCreando(true);
    try {
      const { data: nuevoUsuario } = await api.post('/admin/usuarios', form);
      const rolCreado = form.rol;
      setForm({ nombre: '', email: '', password: '', rol: 'consulta' });
      cargar();
      // Cocina no usa módulos (tiene su propia pantalla dedicada) — para cualquier otro rol,
      // hay que asignarle sus módulos de una vez o se queda sin acceso a nada.
      if (rolCreado !== 'cocina' && nuevoUsuario?.id) {
        setUsuarioPermisos({ id: nuevoUsuario.id, nombre: nuevoUsuario.nombre });
      }
    } catch (err) { setError(mensajeError(err)); } finally { setCreando(false); }
  };

  const eliminar = async (u) => {
    if (!confirm(`¿Eliminar el usuario ${u.email}?`)) return;
    await api.delete(`/admin/usuarios/${u.id}`);
    cargar();
  };

  const cerrarEdicion = (rolCambio) => {
    const usuarioEditado = usuarioEditando;
    setUsuarioEditando(null);
    cargar();
    if (rolCambio && usuarioEditado) {
      setUsuarioPermisos({ id: usuarioEditado.id, nombre: usuarioEditado.nombre });
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Usuarios del panel</h1>
      <p className="text-sm text-ink/50">
        El <strong>Super Administrador</strong> tiene control total, incluyendo Usuarios, Auditoría y Mantenimiento.
        Para cualquier otro rol, tú configuras módulo por módulo qué puede ver o editar cada persona con el botón
        {' '}<strong>"Permisos"</strong>. <strong>Cocina</strong> es la única excepción — tiene su propia pantalla dedicada y no usa módulos.
      </p>

      <div className="mt-6 space-y-6">
        <form onSubmit={crear} autoComplete="off" className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
          <p className="mb-3 font-semibold text-ink">Nuevo usuario</p>
          <div className="flex flex-wrap items-start gap-3">
            <label className="min-w-[160px] flex-1 text-sm">
              <span className="mb-1 block text-ink/60">Nombre</span>
              <input required autoComplete="off" placeholder="Nombre completo" className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
                value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </label>
            <label className="min-w-[200px] flex-1 text-sm">
              <span className="mb-1 block text-ink/60">Correo electrónico</span>
              <input required type="email" name="correo_nuevo_usuario_sfl" autoComplete="off" placeholder="correo@ejemplo.com" className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </label>
            <label className="min-w-[160px] flex-1 text-sm">
              <span className="mb-1 block text-ink/60">Contraseña</span>
              <input required type="password" name="clave_nuevo_usuario_sfl" autoComplete="new-password" placeholder="Contraseña" className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </label>
            <label className="min-w-[180px] flex-1 text-sm">
              <span className="mb-1 block text-ink/60">Rol</span>
              <select className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
                value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                {ROLES_EDITABLES.map(r => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
              </select>
            </label>
            <button disabled={creando} className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
              {creando ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink/40">{DESCRIPCION_ROL[form.rol]}</p>
          {error && <p className="mt-2 rounded-lg bg-ember/10 p-2 text-xs text-ember">{error}</p>}
        </form>

        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-parchment-2 text-xs uppercase tracking-wide text-ink/50">
              <tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Correo</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3 text-right">Acciones</th></tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} className="border-t border-ink/5">
                  <td className="px-4 py-3 font-medium text-ink">{u.nombre}</td>
                  <td className="px-4 py-3 text-ink/60">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR_ROL[u.rol] || 'bg-ink/10 text-ink/60'}`}>
                      {ETIQUETA_ROL[u.rol] || u.rol}
                    </span>
                    {(u.rol === 'super_admin' || u.requiere_2fa) && (
                      <span className={`ml-2 text-xs ${u.two_factor_enabled ? 'text-palm' : 'text-ember/70'}`} title={u.two_factor_enabled ? '2FA activado' : '2FA pendiente de configurar'}>
                        {u.two_factor_enabled ? '🔒 2FA' : '🔓 2FA pendiente'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.rol !== 'super_admin' && u.rol !== 'cocina' && (
                      <button onClick={() => setUsuarioPermisos(u)} className="text-gold hover:underline">Permisos</button>
                    )}
                    <button onClick={() => setUsuarioEditando(u)} className="ml-3 text-ink/60 hover:underline">Editar</button>
                    {u.rol !== 'super_admin' && (
                      <button onClick={() => eliminar(u)} className="ml-3 text-ember hover:underline">Eliminar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {usuarioPermisos && (
        <PanelPermisos
          usuario={usuarioPermisos}
          modulos={modulos}
          onCerrar={() => setUsuarioPermisos(null)}
        />
      )}

      {usuarioEditando && (
        <ModalEditarUsuario
          usuario={usuarioEditando}
          onCerrar={() => setUsuarioEditando(null)}
          onGuardado={cerrarEdicion}
        />
      )}
    </div>
  );
}
