import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { ZONAS_FIHNEC, DEPARTAMENTOS_HONDURAS } from '../listas';

const NIVELES = [
  { valor: 'todos', etiqueta: 'Todos los participantes' },
  { valor: 'actual', etiqueta: '⭐ Evento actual' },
  { valor: '1', etiqueta: 'Nivel I' },
  { valor: '2', etiqueta: 'Nivel II' },
  { valor: '3', etiqueta: 'Nivel III' },
  { valor: '4', etiqueta: 'Nivel IV' },
  { valor: 'repeticiones', etiqueta: '🏅 Repeticiones (2da vuelta o más)' },
  { valor: 'sin_requisitos', etiqueta: '📋 Participantes Sin Requisitos' },
];

const MEDALLAS = ['Bronce', 'Plata', 'Oro', 'Platino', 'Vuelta Completa'];

const CAMPOS_POR_DEFECTO = ['nombre_completo', 'dni', 'celular', 'capitulo', 'zona', 'cargo_fihnec'];

// Mismas columnas que en el resto del sistema se tratan como fecha — se formatean igual que
// en AdminParticipantes.jsx ("04 jul. 2026"), en vez de mostrar el timestamp técnico en crudo.
const CAMPOS_FECHA = new Set(['registrado_en', 'fecha_graduacion', 'ultimo_registro_nivel_anterior']);

function formatearValorColumna(clave, valor) {
  if (valor == null || valor === '') return '—';
  if (CAMPOS_FECHA.has(clave)) {
    const d = new Date(valor);
    if (isNaN(d)) return String(valor);
    return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  return String(valor);
}

// Se mudó aquí desde Participantes — mismo componente, mismo comportamiento, tal cual.
function PanelExportarContacto() {
  const [eventoActual, setEventoActual] = useState(null);
  const [modo, setModo] = useState('ciclo'); // 'ciclo' | 'rango'
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');
  const [modalSinRegistrados, setModalSinRegistrados] = useState(false);

  useEffect(() => {
    api.get('/admin/evento-actual-resumen').then(r => setEventoActual(r.data.evento_actual)).catch(() => {});
  }, []);

  const descargar = async () => {
    setError('');
    if (modo === 'rango' && (!desde || !hasta)) {
      setError('Elige la fecha de inicio y fin del rango.');
      return;
    }
    setDescargando(true);
    try {
      const params = new URLSearchParams();
      if (modo === 'ciclo') params.set('ciclo_actual', 'true');
      else { params.set('desde', desde); params.set('hasta', hasta); }

      const resp = await fetch(`${api.defaults.baseURL}/admin/exportar-contacto/${eventoActual.orden}?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('sfl_token')}` },
        cache: 'no-store'
      });
      if (!resp.ok) {
        // Cuando el backend contesta con "sin_registrados", no es un error real — solo
        // significa que todavía nadie llegó físicamente en ese rango/ciclo.
        const cuerpo = await resp.json().catch(() => null);
        if (cuerpo?.error === 'sin_registrados') {
          setModalSinRegistrados(true);
          return;
        }
        throw new Error();
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `contactos_nivel_${eventoActual.orden}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo generar el archivo.');
    } finally {
      setDescargando(false);
    }
  };

  if (!eventoActual) {
    return (
      <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <p className="font-semibold text-ink">📞 Exportar lista para llamadas</p>
        <p className="mt-1 text-sm text-ink/50">
          Marca un nivel como "evento actual" desde <strong>Eventos</strong> para poder exportar su lista de contactos.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <p className="font-semibold text-ink">📞 Exportar lista para llamadas</p>
      <p className="mt-1 text-sm text-ink/50">
        Nombre completo, capítulo, teléfono, zona y cargo — solo de quienes ya se
        <strong> registraron físicamente</strong> (asistencia confirmada), no de todos los
        inscritos. Es la misma lista que ve Diplomas.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <span className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-night">
          ⭐ {eventoActual.nombre}
        </span>

        <label className="text-sm">
          <span className="mb-1 block text-ink/60">¿Qué registros?</span>
          <select value={modo} onChange={e => setModo(e.target.value)} className="rounded-lg border border-ink/15 px-3 py-2">
            <option value="ciclo">Solo el evento actual (ciclo en curso)</option>
            <option value="rango">Elegir un rango de fechas</option>
          </select>
        </label>

        {modo === 'rango' && (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-ink/60">Desde</span>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="rounded-lg border border-ink/15 px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink/60">Hasta</span>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="rounded-lg border border-ink/15 px-3 py-2" />
            </label>
          </>
        )}

        <button onClick={descargar} disabled={descargando}
          className="rounded-full bg-palm px-5 py-2 text-sm font-semibold text-white hover:bg-palm-light disabled:opacity-60">
          {descargando ? 'Generando…' : '⬇ Descargar Excel'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-ember">{error}</p>}

      {modalSinRegistrados && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <p className="text-3xl">📭</p>
            <p className="mt-2 font-display text-lg font-bold text-ink">Todavía no hay nadie registrado</p>
            <p className="mt-1 text-sm text-ink/60">
              Nadie se ha registrado físicamente en {modo === 'ciclo' ? 'el ciclo actual' : 'ese rango de fechas'} de este nivel — por eso no hay nada que exportar todavía.
            </p>
            <button onClick={() => setModalSinRegistrados(false)}
              className="mt-5 w-full rounded-full bg-gold py-2.5 text-sm font-semibold text-night hover:bg-gold-light">
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminReportes() {
  const [parametrosUrl] = useSearchParams();
  const [camposDisponibles, setCamposDisponibles] = useState(null);
  const [nivel, setNivel] = useState(parametrosUrl.get('evento') || 'todos');
  const [alcance, setAlcance] = useState(parametrosUrl.get('alcance') || 'historico');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [zona, setZona] = useState('');
  const [departamento, setDepartamento] = useState(parametrosUrl.get('departamento') || '');
  const [capitulo, setCapitulo] = useState('');
  const [buscar, setBuscar] = useState('');
  const [medalla, setMedalla] = useState('');
  const [incluirSinRequisitos, setIncluirSinRequisitos] = useState(false);
  const [promocion] = useState(parametrosUrl.get('promocion') || '');
  const [campos, setCampos] = useState(CAMPOS_POR_DEFECTO);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [descargando, setDescargando] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/reportes/campos-disponibles').then(r => {
      setCamposDisponibles(r.data);
      if (parametrosUrl.get('evento')) {
        // Viene desde una tarjeta de Estadísticas: genera el reporte de una vez.
        setTimeout(() => generar(), 0);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCampo = (campo) => {
    setCampos(cs => cs.includes(campo) ? cs.filter(c => c !== campo) : [...cs, campo]);
  };

  const construirParametros = () => {
    const params = new URLSearchParams();
    params.set('evento', nivel);
    if (nivel !== 'todos') {
      params.set('alcance', alcance);
    }
    if (alcance === 'rango' && desde && hasta) { params.set('alcance', 'rango'); params.set('desde', desde); params.set('hasta', hasta); }
    if (nivel !== 'todos' && alcance === 'ciclo_actual' && incluirSinRequisitos) params.set('incluir_sin_requisitos', 'true');
    if (promocion) params.set('promocion', promocion);
    if (zona) params.set('zona', zona);
    if (departamento) params.set('departamento', departamento);
    if (capitulo) params.set('capitulo', capitulo);
    if (buscar) params.set('buscar', buscar);
    if (nivel === 'repeticiones' && medalla) params.set('medalla', medalla);
    params.set('campos', campos.join(','));
    return params;
  };

  const generar = async () => {
    setError(''); setCargando(true);
    try {
      const { data } = await api.get(`/admin/reportes?${construirParametros()}`);
      setResultado(data);
    } catch {
      setError('No se pudo generar el reporte.');
    } finally {
      setCargando(false);
    }
  };

  const descargar = async (tipo) => {
    setDescargando(tipo);
    try {
      const resp = await fetch(`${api.defaults.baseURL}/admin/reportes/${tipo}?${construirParametros()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('sfl_token')}` }
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `reporte_sfl.${tipo === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando('');
    }
  };

  const NIVEL_ROMANO = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };
  const tituloImpresion = nivel === 'repeticiones'
    ? 'Reporte de Repeticiones SFL — Medallas 🏅'
    : nivel === 'sin_requisitos'
      ? 'Reporte de Participantes Sin Requisitos'
      : alcance === 'desercion'
        ? `Reporte de Deserción SFL ${NIVEL_ROMANO[nivel]}`
        : (nivel !== 'todos' ? `Reporte SFL Nivel ${NIVEL_ROMANO[nivel] || nivel}${resultado?.incluyeSinRequisitos ? ' (Con y Sin Requisitos)' : ''}` : 'Reporte de Participantes');
  const colorEncabezadoImpresion = alcance === 'desercion' ? '#B23A2E' : '#241A12';
  const colorBandaImpresion = alcance === 'desercion' ? '#F3DAD6' : '#F1E6CC';

  const imprimir = () => {
    if (!resultado) return;
    const filaHtml = (f, i) => `
      <tr><td>${i + 1}</td>${resultado.columnas.map(c => `<td>${formatearValorColumna(c.clave, f[c.clave])}</td>`).join('')}</tr>`;

    let cuerpoTabla;
    if (resultado.incluyeSinRequisitos) {
      const conRequisito = resultado.filas.filter(f => f._seccion === 'Con Requisito');
      const sinRequisito = resultado.filas.filter(f => f._seccion === 'Sin Requisito');
      const colspan = resultado.columnas.length + 1;
      cuerpoTabla = `
        <tr><td colspan="${colspan}" style="background:#DCE9DE;color:#1F4A2C;font-weight:bold;">CON REQUISITO (${conRequisito.length})</td></tr>
        ${conRequisito.map(filaHtml).join('')}
        <tr><td colspan="${colspan}" style="background:#F3DAD6;color:#B23A2E;font-weight:bold;">SIN REQUISITO (${sinRequisito.length})</td></tr>
        ${sinRequisito.map(filaHtml).join('')}
        <tr><td colspan="${colspan}" style="background:#241A12;color:#FBF6EC;font-weight:bold;">TOTAL GENERAL: ${resultado.filas.length} (${conRequisito.length} con requisito + ${sinRequisito.length} sin requisito)</td></tr>`;
    } else {
      cuerpoTabla = resultado.filas.map(filaHtml).join('');
    }

    const html = `
      <html><head><title>${tituloImpresion}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; }
        h1 { font-size: 16px; margin-bottom: 2px; color: ${colorEncabezadoImpresion}; }
        h2 { font-size: 13px; font-weight: normal; color: #555; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 11px; text-align: left; }
        th { background: ${colorBandaImpresion}; }
      </style></head>
      <body>
        <h1>FIHNEC · Seminario para la Formación de Líderes</h1>
        <h2>${tituloImpresion}</h2>
        <table>
          <thead><tr><th>#</th>${resultado.columnas.map(c => `<th>${c.titulo}</th>`).join('')}</tr></thead>
          <tbody>${cuerpoTabla}</tbody>
        </table>
        <script>window.onload = () => window.print();</script>
      </body></html>`;
    const ventana = window.open('', '_blank');
    ventana.document.write(html);
    ventana.document.close();
  };

  if (!camposDisponibles) return <p className="text-ink/50">Cargando…</p>;

  const claseSelect = 'rounded-lg border border-ink/15 px-3 py-2 text-sm';

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Reportería</h1>
      <p className="text-sm text-ink/50">Arma el reporte que necesitas: elige el nivel, los filtros y las columnas, y descárgalo o imprímelo.</p>

      <div className="mt-5">
        <PanelExportarContacto />
      </div>

      <div className="mt-5 space-y-5 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        {/* Filtros principales */}
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-ink/60">Nivel</span>
            <select value={nivel} onChange={e => {
              const nuevoNivel = e.target.value;
              setNivel(nuevoNivel);
              if (alcance === 'desercion' && !['2', '3', '4'].includes(nuevoNivel)) setAlcance('historico');
              if (nuevoNivel === 'todos') setIncluirSinRequisitos(false);
            }} className={claseSelect}>
              {NIVELES.map(n => <option key={n.valor} value={n.valor}>{n.etiqueta}</option>)}
            </select>
          </label>

          {nivel !== 'repeticiones' && nivel !== 'sin_requisitos' && (
            <label className="text-sm">
              <span className="mb-1 block text-ink/60">¿Qué registros?</span>
              <select value={alcance} onChange={e => {
                const nuevoAlcance = e.target.value;
                setAlcance(nuevoAlcance);
                if (nuevoAlcance !== 'ciclo_actual') setIncluirSinRequisitos(false);
              }} className={claseSelect}>
                <option value="historico">Todo el historial</option>
                {nivel !== 'todos' && <option value="ciclo_actual">Solo el ciclo actual</option>}
                <option value="rango">Rango de fechas personalizado</option>
                {['2', '3', '4'].includes(nivel) && (
                  <option value="desercion">Deserción Nivel {{ '2': 'II', '3': 'III', '4': 'IV' }[nivel]}</option>
                )}
              </select>
            </label>
          )}

          {nivel !== 'todos' && nivel !== 'repeticiones' && nivel !== 'sin_requisitos' && alcance === 'ciclo_actual' && (
            <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-ink/70">
              <input type="checkbox" checked={incluirSinRequisitos} onChange={e => setIncluirSinRequisitos(e.target.checked)} />
              Incluir Participantes Sin Requisitos de este nivel/ciclo
            </label>
          )}

          {nivel === 'repeticiones' && (
            <label className="text-sm">
              <span className="mb-1 block text-ink/60">Medalla (opcional)</span>
              <select value={medalla} onChange={e => setMedalla(e.target.value)} className={claseSelect}>
                <option value="">Todas</option>
                {MEDALLAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}

          {nivel !== 'repeticiones' && nivel !== 'sin_requisitos' && alcance === 'rango' && (
            <>
              <label className="text-sm">
                <span className="mb-1 block text-ink/60">Desde</span>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={claseSelect} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-ink/60">Hasta</span>
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={claseSelect} />
              </label>
            </>
          )}

          <label className="text-sm">
            <span className="mb-1 block text-ink/60">Buscar (nombre, DNI, capítulo o celular)</span>
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Escribe para filtrar" className={claseSelect} />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-ink/60">Zona (opcional)</span>
            <select value={zona} onChange={e => setZona(e.target.value)} className={claseSelect}>
              <option value="">Todas</option>
              {ZONAS_FIHNEC.map(z => <option key={z}>{z}</option>)}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-ink/60">Departamento (opcional)</span>
            <select value={departamento} onChange={e => setDepartamento(e.target.value)} className={claseSelect}>
              <option value="">Todos</option>
              {DEPARTAMENTOS_HONDURAS.map(d => <option key={d}>{d}</option>)}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-ink/60">Capítulo contiene (opcional)</span>
            <input value={capitulo} onChange={e => setCapitulo(e.target.value)} placeholder="Ej. Alameda" className={claseSelect} />
          </label>
        </div>

        {nivel !== 'repeticiones' && nivel !== 'sin_requisitos' && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink/70">Columnas a incluir en el reporte</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(camposDisponibles.participante).map(([clave, titulo]) => (
                <label key={clave} className="flex items-center gap-2 text-sm text-ink/70">
                  <input type="checkbox" checked={campos.includes(clave)} onChange={() => toggleCampo(clave)} />
                  {titulo}
                </label>
              ))}
              {nivel !== 'todos' && alcance !== 'desercion' && Object.entries(camposDisponibles.inscripcion).map(([clave, titulo]) => (
                <label key={clave} className="flex items-center gap-2 text-sm text-ink/70">
                  <input type="checkbox" checked={campos.includes(clave)} onChange={() => toggleCampo(clave)} />
                  {titulo}
                </label>
              ))}
            </div>
          </div>
        )}

        <button onClick={generar} disabled={cargando}
          className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-night hover:bg-gold-light disabled:opacity-60">
          {cargando ? 'Generando…' : '📊 Generar reporte'}
        </button>
        {error && <p className="text-sm text-ember">{error}</p>}
      </div>

      {resultado && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink/60">
              {alcance === 'desercion' && (
                <span className="mr-2 rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ember">
                  ⚠ Deserción Nivel {{ '2': 'II', '3': 'III', '4': 'IV' }[nivel]}
                </span>
              )}
              {nivel === 'repeticiones' && (
                <span className="mr-2 rounded-full bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gold">
                  🏅 Repeticiones — Medallas
                </span>
              )}
              {nivel === 'sin_requisitos' && (
                <span className="mr-2 rounded-full bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gold">
                  📋 Participantes Sin Requisitos
                </span>
              )}
              {resultado.total} resultado(s)
            </p>
            <div className="flex gap-2">
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
            </div>
          </div>

          <div className="mt-3 overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-parchment-2 text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-4 py-3">#</th>
                  {resultado.columnas.map(c => <th key={c.clave} className="px-4 py-3">{c.titulo}</th>)}
                </tr>
              </thead>
              <tbody>
                {resultado.incluyeSinRequisitos ? (() => {
                  const conRequisito = resultado.filas.filter(f => f._seccion === 'Con Requisito');
                  const sinRequisito = resultado.filas.filter(f => f._seccion === 'Sin Requisito');
                  const colspan = resultado.columnas.length + 1;
                  const filaDatos = (f, i, key) => (
                    <tr key={key} className="border-t border-ink/5">
                      <td className="px-4 py-2 text-ink/50">{i + 1}</td>
                      {resultado.columnas.map(c => <td key={c.clave} className="px-4 py-2 text-ink/70">{formatearValorColumna(c.clave, f[c.clave])}</td>)}
                    </tr>
                  );
                  return (
                    <>
                      <tr><td colSpan={colspan} className="bg-palm/10 px-4 py-2 text-sm font-semibold text-palm">CON REQUISITO ({conRequisito.length})</td></tr>
                      {conRequisito.map((f, i) => filaDatos(f, i, `cr-${i}`))}
                      <tr><td colSpan={colspan} className="bg-ember/10 px-4 py-2 text-sm font-semibold text-ember">SIN REQUISITO ({sinRequisito.length})</td></tr>
                      {sinRequisito.map((f, i) => filaDatos(f, i, `sr-${i}`))}
                      <tr><td colSpan={colspan} className="bg-night px-4 py-2 text-sm font-semibold text-parchment">
                        TOTAL GENERAL: {resultado.filas.length} ({conRequisito.length} con requisito + {sinRequisito.length} sin requisito)
                      </td></tr>
                    </>
                  );
                })() : resultado.filas.map((f, i) => (
                  <tr key={i} className="border-t border-ink/5">
                    <td className="px-4 py-2 text-ink/50">{i + 1}</td>
                    {resultado.columnas.map(c => <td key={c.clave} className="px-4 py-2 text-ink/70">{formatearValorColumna(c.clave, f[c.clave])}</td>)}
                  </tr>
                ))}
                {resultado.filas.length === 0 && (
                  <tr><td colSpan={resultado.columnas.length + 1} className="px-4 py-8 text-center text-ink/40">Sin resultados con estos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
