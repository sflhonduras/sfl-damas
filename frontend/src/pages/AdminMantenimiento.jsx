import { useEffect, useState, useRef } from 'react';
import api from '../api';
import { VERSION, FECHA_VERSION } from '../version';

export default function AdminMantenimiento() {
  const [resumen, setResumen] = useState(null);
  const [descargando, setDescargando] = useState('');
  const [error, setError] = useState('');
  const [ultimoArchivo, setUltimoArchivo] = useState('');

  const [papelera, setPapelera] = useState([]);
  const [cargandoPapelera, setCargandoPapelera] = useState(true);
  const [accionandoId, setAccionandoId] = useState(null);
  const [mensajePapelera, setMensajePapelera] = useState('');

  const [archivoRestaurar, setArchivoRestaurar] = useState(null);
  const inputArchivoRef = useRef(null);
  const [datosRestaurar, setDatosRestaurar] = useState(null);
  const [simulacion, setSimulacion] = useState(null);
  const [modoRestaurar, setModoRestaurar] = useState('aditivo');
  const [pinRestaurar, setPinRestaurar] = useState('');
  const [cargandoRestaurar, setCargandoRestaurar] = useState(false);
  const [segundosAplicando, setSegundosAplicando] = useState(0);
  const [errorRestaurar, setErrorRestaurar] = useState('');
  const [exitoRestaurar, setExitoRestaurar] = useState('');

  const NOMBRE_TABLA_RESTAURAR = {
    eventos: 'Eventos', servidores: 'Servidores', participantes: 'Participantes',
    inscripciones: 'Inscripciones', inscripciones_historial: 'Historial de inscripciones',
    medallas_manuales: 'Medallas manuales', configuracion: 'Configuración'
  };

  const elegirArchivoRestaurar = (e) => {
    const archivo = e.target.files?.[0];
    setErrorRestaurar(''); setExitoRestaurar(''); setSimulacion(null); setDatosRestaurar(null); setArchivoRestaurar(null);
    if (!archivo) return;
    if (!archivo.name.endsWith('.json')) {
      setErrorRestaurar('Solo se aceptan archivos .json (el respaldo Excel no sirve para restaurar).');
      return;
    }
    const lector = new FileReader();
    lector.onload = async (ev) => {
      try {
        const contenido = JSON.parse(ev.target.result);
        const datos = contenido.tablas || contenido; // soporta tanto el archivo completo como solo la parte de tablas
        setArchivoRestaurar(archivo.name);
        setDatosRestaurar(datos);
        setCargandoRestaurar(true);
        const { data } = await api.post('/admin/mantenimiento/respaldo/simular', { datos });
        setSimulacion(data.tablas);
      } catch {
        setErrorRestaurar('No se pudo leer el archivo. Confirma que sea un respaldo .json generado por este mismo sistema.');
      } finally {
        setCargandoRestaurar(false);
      }
    };
    lector.readAsText(archivo);
  };

  const aplicarRestauracion = async () => {
    if (!pinRestaurar.trim()) { setErrorRestaurar('Ingresa el PIN de seguridad.'); return; }

    const resumenTexto = simulacion.map(t =>
      `• ${NOMBRE_TABLA_RESTAURAR[t.tabla] || t.tabla}: ${t.nuevos} nuevo(s)` +
      (modoRestaurar === 'reemplazo' ? `, ${t.se_perderian_si_reemplazo} registro(s) actual(es) se BORRARÍAN` : '')
    ).join('\n');

    const mensajeConfirmacion = modoRestaurar === 'aditivo'
      ? `MODO ADITIVO — no se borra nada, solo se agrega lo que falte:\n\n${resumenTexto}\n\n¿Confirmas que quieres aplicar esto?`
      : `⚠️ MODO REEMPLAZO COMPLETO — esto va a BORRAR todo lo que no esté en el archivo, y lo reemplaza con el contenido del respaldo:\n\n${resumenTexto}\n\nEsta acción no se puede deshacer. ¿Estás completamente seguro?`;

    if (!confirm(mensajeConfirmacion)) return;
    if (modoRestaurar === 'reemplazo' && !confirm('Última confirmación: se van a BORRAR los registros que no estén en el archivo. ¿Continuar de todas formas?')) return;

    setCargandoRestaurar(true); setErrorRestaurar(''); setExitoRestaurar('');
    setSegundosAplicando(0);
    const intervalo = setInterval(() => setSegundosAplicando(s => s + 1), 1000);
    try {
      const { data } = await api.post('/admin/mantenimiento/respaldo/aplicar', { datos: datosRestaurar, modo: modoRestaurar, pin: pinRestaurar });
      setExitoRestaurar(data.mensaje);
      setSimulacion(null); setDatosRestaurar(null); setArchivoRestaurar(null); setPinRestaurar('');
      api.get('/admin/mantenimiento/resumen').then(r => setResumen(r.data)).catch(() => {});
    } catch (err) {
      setErrorRestaurar(err.response?.data?.error || 'No se pudo restaurar.');
    } finally {
      clearInterval(intervalo);
      setCargandoRestaurar(false);
    }
  };

  const cargarPapelera = () => {
    setCargandoPapelera(true);
    api.get('/admin/mantenimiento/papelera').then(r => setPapelera(r.data)).finally(() => setCargandoPapelera(false));
  };
  useEffect(() => { cargarPapelera(); }, []);

  const NOMBRE_TABLA = {
    servidores: 'Servidor', usuarios_admin: 'Usuario del panel', items_inventario: 'Ítem de inventario',
    tipos_vehiculo: 'Tipo de vehículo', transportes: 'Transporte', medallas_manuales: 'Medalla manual',
    participantes: 'Participante'
  };

  const restaurar = async (item) => {
    if (!confirm(`¿Restaurar "${item.resumen}"? Va a volver a aparecer en el sistema tal como estaba.`)) return;
    setAccionandoId(item.id); setMensajePapelera('');
    try {
      await api.post(`/admin/mantenimiento/papelera/${item.id}/restaurar`);
      setMensajePapelera(`✓ "${item.resumen}" fue restaurado.`);
      cargarPapelera();
    } catch (err) {
      setMensajePapelera(err.response?.data?.error || 'No se pudo restaurar.');
    } finally {
      setAccionandoId(null);
    }
  };

  const purgar = async (item) => {
    if (!confirm(`¿Eliminar "${item.resumen}" de la papelera de forma DEFINITIVA? Esto ya no se puede deshacer.`)) return;
    setAccionandoId(item.id);
    try {
      await api.delete(`/admin/mantenimiento/papelera/${item.id}`);
      cargarPapelera();
    } catch (err) {
      setMensajePapelera(err.response?.data?.error || 'No se pudo eliminar.');
    } finally {
      setAccionandoId(null);
    }
  };

  useEffect(() => {
    api.get('/admin/mantenimiento/resumen').then(r => setResumen(r.data)).catch(() => {});
  }, []);

  const descargarRespaldo = async (formato) => {
    setDescargando(formato);
    setError('');
    try {
      const ruta = formato === 'excel' ? 'respaldo-excel' : 'respaldo';
      const extension = formato === 'excel' ? 'xlsx' : 'json';
      const resp = await fetch(`${api.defaults.baseURL}/admin/mantenimiento/${ruta}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('sfl_token')}` }
      });
      if (!resp.ok) throw new Error();
      const blob = await resp.blob();
      const nombre = `respaldo_sfl_${new Date().toISOString().slice(0, 10)}.${extension}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombre; a.click();
      URL.revokeObjectURL(url);
      setUltimoArchivo(nombre);
    } catch {
      setError('No se pudo generar el respaldo. Intenta de nuevo.');
    } finally {
      setDescargando('');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-ink">Mantenimiento</h1>
        <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold text-ink/50" title={`Actualizado el ${FECHA_VERSION}`}>
          Sistema {VERSION}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink/50">
        Descarga un respaldo completo de la base de datos (eventos, participantes, inscripciones,
        servidores y configuración) en el formato que prefieras.
      </p>

      {resumen && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Participantes', resumen.participantes],
            ['Inscripciones', resumen.inscripciones],
            ['Servidores', resumen.servidores],
            ['Eventos', resumen.eventos]
          ].map(([etiqueta, valor]) => (
            <div key={etiqueta} className="rounded-2xl border border-ink/10 bg-white p-4 text-center shadow-sm">
              <p className="font-display text-2xl font-bold text-ink">{valor}</p>
              <p className="text-xs text-ink/50">{etiqueta}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <p className="font-semibold text-ink">💾 Respaldo completo</p>
        <p className="mt-1 text-sm text-ink/50">
          Elige el formato: <strong>.xlsx</strong> para revisar los datos fácilmente en Excel (una hoja
          por cada tabla), o <strong>.json</strong> si necesitas el respaldo técnico completo. Guárdalo
          en un lugar seguro — por ejemplo, súbelo manualmente a tu carpeta de Google Drive de respaldos.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={() => descargarRespaldo('excel')} disabled={descargando !== ''}
            className="rounded-full bg-palm px-5 py-2 text-sm font-semibold text-white hover:bg-palm-light disabled:opacity-60">
            {descargando === 'excel' ? 'Generando…' : '⬇ Descargar Excel (.xlsx)'}
          </button>
          <button onClick={() => descargarRespaldo('json')} disabled={descargando !== ''}
            className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-60">
            {descargando === 'json' ? 'Generando…' : '⬇ Descargar JSON (.json)'}
          </button>
        </div>

        {ultimoArchivo && !error && (
          <p className="mt-3 text-sm text-palm">
            ✓ Se descargó <strong>{ultimoArchivo}</strong>. Ahora puedes subirlo a tu carpeta de Drive.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-ember">{error}</p>}
      </div>

      <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <p className="font-semibold text-ink">♻️ Restaurar desde respaldo</p>
        <p className="mt-1 text-sm text-ink/50">
          Sube un archivo <strong>.json</strong> generado por este mismo sistema (el de Excel no sirve para restaurar).
          Primero se revisa qué contiene, sin cambiar nada — tú decides si aplicarlo después.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <input ref={inputArchivoRef} type="file" accept=".json" onChange={elegirArchivoRestaurar} className="hidden" />
          <button type="button" onClick={() => inputArchivoRef.current?.click()}
            className="rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold hover:bg-gold/20">
            📂 Elegir archivo .json
          </button>
          {archivoRestaurar && <span className="text-sm text-ink/60">{archivoRestaurar}</span>}
        </div>

        {cargandoRestaurar && !simulacion && <p className="mt-3 text-sm text-ink/40">Revisando el archivo…</p>}
        {errorRestaurar && <p className="mt-3 rounded-lg bg-ember/10 p-2 text-sm text-ember">{errorRestaurar}</p>}
        {exitoRestaurar && <p className="mt-3 rounded-lg bg-palm/10 p-2 text-sm text-palm">✓ {exitoRestaurar}</p>}

        {simulacion && (
          <div className="mt-4">
            <p className="text-sm text-ink/60">Archivo: <strong>{archivoRestaurar}</strong></p>

            <div className="mt-3 overflow-hidden rounded-xl border border-ink/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-parchment-2 uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-3 py-2">Tabla</th>
                    <th className="px-3 py-2">En el archivo</th>
                    <th className="px-3 py-2 text-palm">Se agregarían</th>
                    <th className="px-3 py-2 text-ember">Se borrarían si es Reemplazo</th>
                  </tr>
                </thead>
                <tbody>
                  {simulacion.map(t => (
                    <tr key={t.tabla} className="border-t border-ink/5">
                      <td className="px-3 py-2 font-medium text-ink">{NOMBRE_TABLA_RESTAURAR[t.tabla] || t.tabla}</td>
                      <td className="px-3 py-2 text-ink/60">{t.en_archivo}</td>
                      <td className="px-3 py-2 text-palm">{t.nuevos}</td>
                      <td className="px-3 py-2 text-ember">{modoRestaurar === 'reemplazo' ? t.se_perderian_si_reemplazo : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="modo" checked={modoRestaurar === 'aditivo'} onChange={() => setModoRestaurar('aditivo')} className="mt-0.5" />
                <span><strong className="text-ink">Aditivo (recomendado)</strong> — solo agrega lo que falte, nunca borra nada existente.</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="modo" checked={modoRestaurar === 'reemplazo'} onChange={() => setModoRestaurar('reemplazo')} className="mt-0.5" />
                <span><strong className="text-ember">Reemplazo completo</strong> — borra todo lo que no esté en el archivo y lo sustituye. No se puede deshacer.</span>
              </label>
            </div>

            {modoRestaurar === 'reemplazo' && (
              <p className="mt-2 rounded-lg bg-ember/10 p-2 text-xs text-ember">
                ⚠️ Este modo va a eliminar registros que existen ahora mismo y no estén en el archivo — revisa bien la columna "Se borrarían" arriba antes de continuar.
              </p>
            )}

            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-ink/60">PIN de seguridad</span>
              <input type="password" value={pinRestaurar} onChange={e => setPinRestaurar(e.target.value)}
                placeholder="PIN configurado por el Super Administrador"
                className="w-56 rounded-lg border border-ink/15 px-3 py-2 text-sm" />
            </label>

            <button onClick={aplicarRestauracion} disabled={cargandoRestaurar}
              className="mt-4 rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-60">
              {cargandoRestaurar ? `Aplicando… (${segundosAplicando}s)` : `Aplicar restauración (${modoRestaurar === 'aditivo' ? 'aditivo' : 'reemplazo completo'})`}
            </button>
            {cargandoRestaurar && (
              <p className="mt-2 text-xs text-ink/40">No cierres esta pantalla — está procesando cada registro con cuidado, puede tardar 1-2 minutos con muchos datos.</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <p className="font-semibold text-ink">🗑️ Papelera</p>
        <p className="mt-1 text-sm text-ink/50">
          Todo lo que se elimina en el sistema (Servidores, Usuarios, Inventario, Transporte, Medallas manuales
          y Participantes) queda guardado aquí — puedes restaurarlo si fue un error, o borrarlo para siempre.
        </p>

        {mensajePapelera && <p className="mt-3 rounded-lg bg-parchment-2 p-2 text-sm text-ink/70">{mensajePapelera}</p>}

        <div className="mt-4 overflow-hidden rounded-xl border border-ink/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-parchment-2 text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3">Eliminado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargandoPapelera && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink/40">Cargando…</td></tr>}
              {!cargandoPapelera && papelera.map(item => (
                <tr key={item.id} className="border-t border-ink/5">
                  <td className="px-4 py-2.5 text-ink/60">{NOMBRE_TABLA[item.tabla] || item.tabla}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">{item.resumen || '—'}</td>
                  <td className="px-4 py-2.5 text-ink/50">
                    {new Date(item.eliminado_en).toLocaleString('es-HN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {item.eliminado_por_nombre && <span className="block text-xs text-ink/40">por {item.eliminado_por_nombre}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => restaurar(item)} disabled={accionandoId === item.id} className="text-gold hover:underline disabled:opacity-50">
                      Restaurar
                    </button>
                    <button onClick={() => purgar(item)} disabled={accionandoId === item.id} className="ml-3 text-ember hover:underline disabled:opacity-50">
                      Eliminar definitivamente
                    </button>
                  </td>
                </tr>
              ))}
              {!cargandoPapelera && papelera.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-ink/40">La papelera está vacía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
