import { useEffect, useState, useRef, useMemo } from 'react';
import api, { mensajeError } from '../api';
import {
  ZONAS_FIHNEC, CARGOS_FIHNEC, ESTADOS_CIVILES, TIPOS_TESTIMONIO,
  FORMACION_OFICIAL, OTRAS_PARTICIPACIONES, DEPARTAMENTOS_HONDURAS, MUNICIPIOS_POR_DEPARTAMENTO
} from '../listas';

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const hoy = new Date();
  const nacimiento = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
  return edad >= 0 ? edad : null;
}

// Evita problemas de zona horaria al comparar solo el mes de una fecha "YYYY-MM-DD".
function mesDeFecha(fechaStr) {
  if (!fechaStr) return null;
  const partes = String(fechaStr).split('-');
  if (partes.length < 2) return null;
  return parseInt(partes[1], 10) - 1;
}

function esCumpleanosEsteMes(fechaNacimiento) {
  const mes = mesDeFecha(fechaNacimiento);
  return mes !== null && mes === new Date().getMonth();
}

function ModalEditarServidor({ servidor, onCerrar, onGuardado }) {
  const [form, setForm] = useState({
    cargos_desempenados: [], formacion_oficial: [], otras_participaciones: [],
    dias_asistencia: { viernes: true, sabado: true, domingo: true },
    participara_evento: true,
    ...servidor
  });
  const inputFotoRef = useRef(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    setGuardando(true); setError('');
    try {
      let id = form.id;
      if (id) await api.put(`/admin/servidores/${id}`, form);
      else {
        const { data } = await api.post('/admin/servidores', form);
        id = data.id;
      }
      // El interruptor maestro y los 3 días viven aparte, cada uno en su propio endpoint.
      await api.put(`/admin/servidores/${id}/participacion`, { participa: form.participara_evento });
      await api.put(`/admin/servidores/${id}/dias-asistencia`, form.dias_asistencia);
      onGuardado();
    } catch (err) { setError(mensajeError(err)); } finally { setGuardando(false); }
  };

  const toggleDia = (dia) => setForm(f => ({ ...f, dias_asistencia: { ...f.dias_asistencia, [dia]: !f.dias_asistencia[dia] } }));

  const set = (clave) => (e) => setForm(f => ({ ...f, [clave]: e.target.value }));
  const cambiarDepartamento = (e) => setForm(f => ({ ...f, departamento: e.target.value, municipio: '' }));
  const municipiosDisponibles = useMemo(() => MUNICIPIOS_POR_DEPARTAMENTO[form.departamento] || [], [form.departamento]);

  const campo = (clave, etiqueta, tipo = 'text') => (
    <label className="block text-sm">
      <span className="mb-1 block text-ink/60">{etiqueta}</span>
      <input
        type={tipo}
        className="w-full rounded-lg border border-ink/15 px-3 py-2"
        value={form[clave] ?? ''}
        onChange={set(clave)}
      />
    </label>
  );

  const selectSimple = (clave, etiqueta, opciones) => (
    <label className="block text-sm">
      <span className="mb-1 block text-ink/60">{etiqueta}</span>
      <select className="w-full rounded-lg border border-ink/15 px-3 py-2" value={form[clave] ?? ''} onChange={set(clave)}>
        <option value="">— Seleccionar —</option>
        {opciones.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  const multiSelect = (clave, etiqueta, opciones) => {
    const valores = form[clave] || [];
    const toggle = (op) => setForm(f => {
      const actuales = f[clave] || [];
      return { ...f, [clave]: actuales.includes(op) ? actuales.filter(v => v !== op) : [...actuales, op] };
    });
    return (
      <div className="sm:col-span-2">
        <span className="mb-1.5 block text-sm text-ink/60">{etiqueta}</span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-ink/15 p-3 sm:grid-cols-3">
          {opciones.map(op => (
            <label key={op} className="flex items-center gap-1.5 text-xs text-ink/70">
              <input type="checkbox" checked={valores.includes(op)} onChange={() => toggle(op)} />
              {op}
            </label>
          ))}
        </div>
      </div>
    );
  };

  // Mismo estilo visual que multiSelect (checkboxes en cuadrícula), pero de selección única —
  // "Tipo de testimonio" sigue siendo un solo valor, solo cambia cómo se ve/elige.
  const checkboxUnico = (clave, etiqueta, opciones) => {
    const valorActual = form[clave] || '';
    const elegir = (op) => setForm(f => ({ ...f, [clave]: f[clave] === op ? '' : op }));
    return (
      <div className="sm:col-span-2">
        <span className="mb-1.5 block text-sm text-ink/60">{etiqueta}</span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-ink/15 p-3 sm:grid-cols-3">
          {opciones.map(op => (
            <label key={op} className="flex items-center gap-1.5 text-xs text-ink/70">
              <input type="checkbox" checked={valorActual === op} onChange={() => elegir(op)} />
              {op}
            </label>
          ))}
        </div>
      </div>
    );
  };

  const subirFoto = (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => setForm(f => ({ ...f, foto: lector.result }));
    lector.readAsDataURL(archivo);
  };

  const usuarioActual = JSON.parse(localStorage.getItem('sfl_user') || 'null');
  const puedeVerPin = usuarioActual && ['admin', 'super_admin'].includes(usuarioActual.rol);

  const [pinVisible, setPinVisible] = useState(null);
  const [cargandoPin, setCargandoPin] = useState(false);
  useEffect(() => {
    if (form.id && puedeVerPin) {
      setCargandoPin(true);
      api.get(`/admin/servidores/${form.id}/pin`).then(({ data }) => setPinVisible(data.pin)).finally(() => setCargandoPin(false));
    }
  }, [form.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [regenerandoPin, setRegenerandoPin] = useState(false);
  const regenerarPin = async () => {
    if (!form.id) return; // solo aplica a servidores ya guardados
    if (!confirm('¿Generar un PIN nuevo? El anterior dejará de funcionar de inmediato, y se le pedirá que lo personalice en su próximo ingreso.')) return;
    setRegenerandoPin(true);
    try {
      const { data } = await api.post(`/admin/servidores/${form.id}/regenerar-pin`);
      setPinVisible(data.pin);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setRegenerandoPin(false);
    }
  };

  const edad = calcularEdad(form.fecha_nacimiento);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">{form.id ? 'Editar servidor' : 'Nuevo servidor'}</h2>
          <button onClick={onCerrar} className="text-ink/40 hover:text-ink">✕</button>
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-gold">Datos Generales</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-center gap-4">
            {form.foto ? (
              <img src={form.foto} alt="Foto" className="h-20 w-16 rounded-lg object-cover border border-ink/10" />
            ) : (
              <div className="h-20 w-16 rounded-lg border border-dashed border-ink/20 bg-parchment-2" />
            )}
            <div className="text-sm">
              <input ref={inputFotoRef} type="file" accept="image/*" onChange={subirFoto} className="hidden" />
              <button type="button" onClick={() => inputFotoRef.current?.click()}
                className="rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-semibold text-gold hover:bg-gold/20">
                {form.foto ? '📷 Cambiar foto' : '📷 Subir foto'}
              </button>
              <p className="mt-1 text-[11px] text-ink/40">
                Recomendado: foto vertical tipo carnet (más alta que ancha), proporción aprox. 4:5 —
                por ejemplo 400 × 480 píxeles. Si es cuadrada o panorámica, va a quedar espacio vacío en la ficha.
              </p>
            </div>
          </div>

          {/* Bloque del PIN del Portal del Servidor: oculto en SFL Damas, porque solo sirve
              para el Acceso Servidores (que no es parte del alcance de este sistema). El
              código (pinSeguridad.js, regenerarPin, etc.) sigue intacto. */}

          <div className="sm:col-span-2">{campo('nombre_completo', 'Nombre completo')}</div>
          {campo('dni', 'DNI')}
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Fecha de nacimiento {edad !== null && <span className="text-ink/40">({edad} años)</span>}</span>
            <input type="date" className="w-full rounded-lg border border-ink/15 px-3 py-2" value={form.fecha_nacimiento ? String(form.fecha_nacimiento).slice(0, 10) : ''} onChange={set('fecha_nacimiento')} />
          </label>
          {selectSimple('estado_civil', 'Estado civil', ESTADOS_CIVILES)}
          {campo('nombre_esposa', 'Nombre de la esposa (si aplica)')}
          {campo('hijos_cantidad', 'Hijos', 'number')}
          {campo('nietos_cantidad', 'Nietos', 'number')}
          {campo('profesion', 'Profesión')}
          {campo('celular', 'Celular')}
          {campo('contacto_emergencia_telefono', 'Contacto de emergencia (teléfono)')}
          <div className="sm:col-span-2">{campo('email', 'E-mail', 'email')}</div>
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-gold">Datos Organizacionales</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {campo('capitulo', 'Capítulo')}
          {selectSimple('zona', 'Zona', ZONAS_FIHNEC)}
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Departamento</span>
            <select className="w-full rounded-lg border border-ink/15 px-3 py-2" value={form.departamento ?? ''} onChange={cambiarDepartamento}>
              <option value="">— Seleccionar —</option>
              {DEPARTAMENTOS_HONDURAS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Municipio</span>
            <select className="w-full rounded-lg border border-ink/15 px-3 py-2" value={form.municipio ?? ''} onChange={set('municipio')} disabled={!form.departamento}>
              <option value="">{form.departamento ? '— Seleccionar —' : 'Primero elige un departamento'}</option>
              {municipiosDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Fecha de inscripción al capítulo</span>
            <input type="date" className="w-full rounded-lg border border-ink/15 px-3 py-2" value={form.fecha_inscripcion_capitulo ? String(form.fecha_inscripcion_capitulo).slice(0, 10) : ''} onChange={set('fecha_inscripcion_capitulo')} />
          </label>
          {campo('tiempo_fihnec', 'Tiempo en FIHNEC (ej. "5 años")')}
          {selectSimple('cargo_actual', 'Cargo actual', CARGOS_FIHNEC)}
          {multiSelect('cargos_desempenados', 'Cargos desempeñados (histórico)', CARGOS_FIHNEC)}
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-gold">Testimonio y Formación</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {checkboxUnico('tipo_testimonio', 'Tipo de testimonio', TIPOS_TESTIMONIO)}
          {multiSelect('formacion_oficial', 'Formación oficial', FORMACION_OFICIAL)}
          {multiSelect('otras_participaciones', 'Otras participaciones', OTRAS_PARTICIPACIONES)}
        </div>

        <div className="mt-5">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" checked={!!form.participara_evento}
              onChange={e => {
                const checked = e.target.checked;
                setForm(f => ({
                  ...f,
                  participara_evento: checked,
                  dias_asistencia: checked ? { viernes: true, sabado: true, domingo: true } : f.dias_asistencia
                }));
              }} />
            Participará en el evento actual
          </label>
          <p className="mt-1 text-xs text-ink/50">
            {form.participara_evento
              ? 'Los 3 días vienen marcados de una vez al activar — desmarca abajo el que no le aplique.'
              : 'Apagado — no participa en ningún día. Los días de abajo quedan bloqueados hasta que lo actives de nuevo.'}
          </p>
          <div className={`mt-2 flex gap-4 ${!form.participara_evento ? 'opacity-40' : ''}`}>
            {[['viernes', 'Viernes'], ['sabado', 'Sábado'], ['domingo', 'Domingo']].map(([clave, etiqueta]) => (
              <label key={clave} className={`flex items-center gap-2 text-sm text-ink/80 ${!form.participara_evento ? 'cursor-not-allowed' : ''}`}>
                <input type="checkbox" disabled={!form.participara_evento}
                  checked={!!form.dias_asistencia[clave]} onChange={() => toggleDia(clave)} />
                {etiqueta}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCerrar} className="rounded-full px-5 py-2 text-sm font-medium text-ink/60 hover:bg-ink/5">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="rounded-full bg-gold px-6 py-2 text-sm font-semibold text-night hover:bg-gold-light">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminServidores() {
  const usuario = JSON.parse(localStorage.getItem('sfl_user') || 'null');
  const [nivelServidores, setNivelServidores] = useState(usuario?.rol === 'super_admin' ? 'edicion' : null);
  const soloLectura = nivelServidores !== 'edicion';

  useEffect(() => {
    if (usuario?.rol === 'super_admin' || usuario?.rol === 'cocina') return;
    api.get('/admin/mis-permisos').then(r => {
      const permiso = r.data.find(p => p.modulo === 'servidores');
      setNivelServidores(permiso ? permiso.nivel : 'consulta');
    }).catch(() => setNivelServidores('consulta'));
  }, []);

  const [servidores, setServidores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [seleccionado, setSeleccionado] = useState(null);
  const [descargando, setDescargando] = useState('');
  const [reiniciando, setReiniciando] = useState(false);
  const [cambiandoDia, setCambiandoDia] = useState(null);

  const cargar = () => api.get('/admin/servidores').then(r => setServidores(r.data)).finally(() => setCargando(false));
  useEffect(() => { cargar(); }, []);

  // Interruptor maestro "Participará", independiente de los días — al apagarlo, los 3
  // días quedan deshabilitados en pantalla (no se tocan sus valores guardados).
  const toggleParticipaEnLista = async (s) => {
    const nuevoValor = !s.participara_evento;
    setCambiandoDia(s.id);
    setServidores(actuales => actuales.map(x => x.id === s.id
      ? { ...x, participara_evento: nuevoValor, dias_asistencia: nuevoValor ? { viernes: true, sabado: true, domingo: true } : x.dias_asistencia }
      : x));
    try {
      await api.put(`/admin/servidores/${s.id}/participacion`, { participa: nuevoValor });
    } catch {
      cargar();
    } finally {
      setCambiandoDia(null);
    }
  };

  // Clic directo en V/S/D desde la tabla, sin abrir el modal de edición.
  const toggleDiaEnLista = async (s, dia) => {
    const nuevosDias = { ...s.dias_asistencia, [dia]: !s.dias_asistencia[dia] };
    setCambiandoDia(s.id);
    // Actualización optimista: se ve el cambio de una vez, sin esperar la respuesta.
    setServidores(actuales => actuales.map(x => x.id === s.id
      ? { ...x, dias_asistencia: nuevosDias, participara_evento: nuevosDias.viernes || nuevosDias.sabado || nuevosDias.domingo }
      : x));
    try {
      await api.put(`/admin/servidores/${s.id}/dias-asistencia`, nuevosDias);
    } catch {
      cargar(); // si falla, se revierte trayendo el dato real
    } finally {
      setCambiandoDia(null);
    }
  };

  const eliminar = async (s) => {
    if (!confirm(`¿Eliminar a ${s.nombre_completo} de la lista de servidores?`)) return;
    await api.delete(`/admin/servidores/${s.id}`);
    cargar();
  };

  const reiniciarParticipacion = async () => {
    if (!confirm('¿Volver a marcar los 3 días (Viernes/Sábado/Domingo) de TODOS los servidores? Esto no borra a nadie, solo reinicia los checkboxes a marcados.')) return;
    setReiniciando(true);
    try {
      await api.post('/admin/servidores/reiniciar-participacion');
      cargar();
    } finally {
      setReiniciando(false);
    }
  };

  const descargar = async (tipo) => {
    setDescargando(tipo);
    try {
      const resp = await fetch(`${api.defaults.baseURL}/admin/servidores/${tipo}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('sfl_token')}` }
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `servidores_sfl.${tipo === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando('');
    }
  };

  const descargarFicha = async (s) => {
    const resp = await fetch(`${api.defaults.baseURL}/admin/servidores/${s.id}/ficha`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('sfl_token')}` }
    });
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ficha_${s.nombre_completo.replace(/\s+/g, '_')}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  const COLUMNAS_IMPRESION = [
    ['nombre_completo', 'Nombre Completo'], ['capitulo', 'Capítulo'], ['departamento', 'Departamento'], ['celular', 'Celular'],
    ['estado_civil', 'Estado Civil'], ['hijos_cantidad', 'Hijos'], ['fecha_nacimiento', 'Fecha de Nacimiento'], ['email', 'E-mail']
  ];

  const formatearFechaCorta = (valor) => {
    if (!valor) return '—';
    const f = new Date(valor);
    return isNaN(f) ? '—' : f.toLocaleDateString('es-HN', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const imprimir = () => {
    const filas = servidores.map((s, i) => `
      <tr>
        <td>${i + 1}</td>
        ${COLUMNAS_IMPRESION.map(([clave]) => `<td>${clave === 'fecha_nacimiento' ? formatearFechaCorta(s[clave]) : (s[clave] ?? '—')}</td>`).join('')}
      </tr>`).join('');
    const html = `
      <html><head><title>Servidores</title>
      <style>
        @page { size: letter landscape; margin: 18mm 12mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #2B2118; margin: 0; }
        .banda { background: #241A12; padding: 14px 20px; }
        .linea-oro { height: 3px; background: #C9932F; }
        .marca { color: #FBF6EC; font-size: 10px; letter-spacing: 2px; margin: 0; }
        h1 { color: #C9932F; font-family: Georgia, 'Times New Roman', serif; font-size: 20px; margin: 4px 0 0; }
        .contenido { padding: 16px 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #D8CBAE; padding: 6px 8px; font-size: 10.5px; text-align: left; vertical-align: top; }
        th { background: #F1E6CC; color: #241A12; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
        tr:nth-child(even) td { background: #FBF6EC; }
      </style></head>
      <body>
        <div class="banda">
          <p class="marca">FIHNEC HONDURAS</p>
          <h1>Servidores</h1>
        </div>
        <div class="linea-oro"></div>
        <div class="contenido">
          <table>
            <thead><tr><th>#</th>${COLUMNAS_IMPRESION.map(([, titulo]) => `<th>${titulo}</th>`).join('')}</tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
        <script>window.onload = () => window.print();</script>
      </body></html>`;
    const ventana = window.open('', '_blank');
    ventana.document.write(html);
    ventana.document.close();
  };

  const totalParticipando = servidores.filter(s => s.participara_evento).length;
  const totalCumpleaneros = servidores.filter(s => esCumpleanosEsteMes(s.fecha_nacimiento)).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Servidores</h1>
          <p className="text-sm text-ink/50">
            {servidores.length} servidores registrados · {totalParticipando} participarán en el evento actual
            {totalCumpleaneros > 0 && <> · 🎂 {totalCumpleaneros} de cumpleaños este mes</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={imprimir} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink hover:bg-ink/5">
            🖨️ Imprimir
          </button>
          <button onClick={() => descargar('excel')} disabled={descargando !== ''}
            className="rounded-full bg-palm px-5 py-2 text-sm font-semibold text-white hover:bg-palm-light disabled:opacity-60">
            {descargando === 'excel' ? 'Generando…' : '⬇ Excel'}
          </button>
          <button onClick={() => descargar('pdf')} disabled={descargando !== ''}
            className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-60">
            {descargando === 'pdf' ? 'Generando…' : '⬇ PDF'}
          </button>
          {!soloLectura && (
            <>
              <button onClick={reiniciarParticipacion} disabled={reiniciando}
                className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-60">
                {reiniciando ? 'Reiniciando…' : '↺ Reiniciar participación'}
              </button>
              <button onClick={() => setSeleccionado({ nombre_completo: '', dias_asistencia: { viernes: true, sabado: true, domingo: true } })}
                className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-night hover:bg-gold-light">
                + Agregar servidor
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-parchment-2 text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-4 py-3">Nombre Completo</th>
              <th className="px-4 py-3 text-center">🎂</th>
              <th className="px-4 py-3 text-center">Participará</th>
              <th className="px-4 py-3 text-center">Días de Asistencia</th>
              <th className="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/40">Cargando…</td></tr>}
            {!cargando && [...servidores]
              .sort((a, b) => Number(esCumpleanosEsteMes(b.fecha_nacimiento)) - Number(esCumpleanosEsteMes(a.fecha_nacimiento)))
              .map(s => (
              <tr key={s.id} className="border-t border-ink/5">
                <td className="px-4 py-2.5 font-medium text-ink">{s.nombre_completo}</td>
                <td className="px-4 py-2.5 text-center">
                  {esCumpleanosEsteMes(s.fecha_nacimiento) && (
                    <span title="Cumpleaños este mes" className="inline-flex items-center gap-1">
                      <span className="text-xs text-ink/50">{calcularEdad(s.fecha_nacimiento)} años</span> 🎂
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <input type="checkbox" checked={!!s.participara_evento} disabled={soloLectura || cambiandoDia === s.id}
                    onChange={() => toggleParticipaEnLista(s)}
                    className="h-4 w-4 cursor-pointer accent-gold disabled:cursor-not-allowed" />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <div className="inline-flex items-center gap-1.5">
                    {[['viernes', 'V'], ['sabado', 'S'], ['domingo', 'D']].map(([clave, letra]) => (
                      <button key={clave} type="button" title={clave}
                        disabled={soloLectura || cambiandoDia === s.id || !s.participara_evento}
                        onClick={() => toggleDiaEnLista(s, clave)}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition ${
                          !s.participara_evento
                            ? 'bg-ink/5 text-ink/15 cursor-not-allowed'
                            : s.dias_asistencia?.[clave]
                              ? 'bg-gold/20 text-gold hover:bg-gold/30 cursor-pointer'
                              : 'bg-ink/5 text-ink/30 hover:bg-ink/10 cursor-pointer'
                        } disabled:opacity-50`}>
                        {letra}
                      </button>
                    ))}
                  </div>
                  <p className={`mt-1 text-xs ${s.participara_evento ? 'text-palm font-medium' : 'text-ink/40'}`}>
                    {s.participara_evento ? 'Sí participa' : 'No participa'}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <button onClick={() => descargarFicha(s)} className="text-palm hover:underline">Ficha</button>
                  <button onClick={() => setSeleccionado(s)} className="ml-3 text-gold hover:underline">{soloLectura ? 'Ver' : 'Editar'}</button>
                  {!soloLectura && <button onClick={() => eliminar(s)} className="ml-3 text-ember hover:underline">Eliminar</button>}
                </td>
              </tr>
            ))}
            {!cargando && servidores.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/40">Todavía no hay servidores registrados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {seleccionado && (
        <ModalEditarServidor
          servidor={seleccionado}
          onCerrar={() => setSeleccionado(null)}
          onGuardado={() => { cargar(); setSeleccionado(null); }}
        />
      )}
    </div>
  );
}
