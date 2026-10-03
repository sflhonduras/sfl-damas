import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function AdminDiplomas() {
  const [eventoActual, setEventoActual] = useState(null);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [descargando, setDescargando] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/evento-actual-resumen').then(r => {
      const actual = r.data.evento_actual;
      setEventoActual(actual);
      if (!actual) { setCargando(false); return; }
      api.get(`/admin/diplomas/${actual.orden}`).then(r2 => setDatos(r2.data)).finally(() => setCargando(false));
    }).catch(() => { setError('No se pudo cargar la información.'); setCargando(false); });
  }, []);

  const nivel = eventoActual?.orden;

  const descargar = async (tipo) => {
    setDescargando(tipo);
    try {
      const resp = await fetch(`${api.defaults.baseURL}/admin/diplomas/${nivel}/${tipo}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('sfl_token')}` }
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diplomas_nivel_${nivel}.${tipo === 'excel' ? 'xlsx' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando('');
    }
  };

  const imprimir = () => {
    if (!datos) return;
    const filas = datos.participantes.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${p.nombre_completo}</td>
        <td>${p.capitulo || '—'}</td>
        <td>${p.cargo_fihnec || '—'}</td>
      </tr>`).join('');
    const html = `
      <html><head><title>Diplomas - ${eventoActual.nombre}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; }
        h1 { font-size: 18px; margin-bottom: 2px; }
        h2 { font-size: 14px; font-weight: normal; color: #555; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 12px; text-align: left; }
        th { background: #f0ede4; }
      </style></head>
      <body>
        <h1>FIHNEC · Seminario para la Formación de Líderes</h1>
        <h2>${eventoActual.nombre} — ${datos.total} participante(s)</h2>
        <table>
          <thead><tr><th>#</th><th>Nombre Completo</th><th>Capítulo</th><th>Cargo</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <script>window.onload = () => { window.print(); }</script>
      </body></html>`;
    const ventana = window.open('', '_blank');
    ventana.document.write(html);
    ventana.document.close();
  };

  if (cargando) return <p className="text-ink/50">Cargando…</p>;
  if (error) return <p className="text-ember">{error}</p>;
  if (!eventoActual) {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Diplomas</h1>
        <p className="mt-3 text-ink/50">
          Todavía no hay ningún nivel marcado como "evento actual". Ve a <strong>Eventos</strong> y marca cuál nivel
          se está promoviendo ahora mismo.
        </p>
        <Link to="/admin/diplomas/sin-requisitos"
          className="mt-4 inline-block rounded-full border border-gold/40 px-5 py-2 text-sm font-semibold text-gold hover:bg-gold/10">
          📋 Participantes Sin Requisitos
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Diplomas</h1>
      <p className="text-sm text-ink/50">Solo participantes marcados como "Registrado" (asistencia confirmada) en el evento actual, listos para exportar y preparar diplomas.</p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-night">
          ⭐ Evento actual: {eventoActual.nombre}
        </span>

        <div className="flex gap-2">
          <Link to="/admin/diplomas/sin-requisitos"
            className="rounded-full bg-[#9A6136] px-5 py-2 text-sm font-semibold text-parchment hover:bg-[#B57A4A]">
            📋 Participantes Sin Requisitos
          </Link>
          <button onClick={imprimir} disabled={!datos}
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment hover:bg-ink/80 disabled:opacity-60">
            🖨️ Imprimir
          </button>
          <button onClick={() => descargar('excel')} disabled={descargando !== ''}
            className="rounded-full bg-palm px-5 py-2 text-sm font-semibold text-white hover:bg-palm-light disabled:opacity-60">
            {descargando === 'excel' ? 'Generando…' : '⬇ Descargar Excel'}
          </button>
          <button onClick={() => descargar('pdf')} disabled={descargando !== ''}
            className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-60">
            {descargando === 'pdf' ? 'Generando…' : '⬇ Descargar PDF'}
          </button>
        </div>
      </div>

      <p className="mt-4 text-sm text-ink/50">
        {datos ? (
          datos.sin_requisitos > 0
            ? `${datos.total} registrado(s) + ${datos.sin_requisitos} sin requisitos (de este nivel y ciclo) = ${datos.total_general} en total`
            : `${datos.total} participante(s) registrado(s) en el ciclo actual`
        ) : '…'}
      </p>

      <div className="mt-3 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gold text-xs font-semibold uppercase tracking-wide text-night">
            <tr>
              <th className="w-16 px-4 py-3">#</th>
              <th className="px-4 py-3">Nombre Completo</th>
              <th className="px-4 py-3">Capítulo</th>
              <th className="px-4 py-3">Cargo</th>
            </tr>
          </thead>
          <tbody>
            {datos?.participantes.map((p, i) => (
              <tr key={i} className={`border-t border-ink/5 hover:bg-gold/10 ${i % 2 === 1 ? 'bg-gold-pale/25' : 'bg-white'}`}>
                <td className="px-4 py-2.5 text-ink/50">{i + 1}</td>
                <td className="px-4 py-2.5 font-medium text-ink">{p.nombre_completo}</td>
                <td className="px-4 py-2.5 text-ink/60">{p.capitulo || '—'}</td>
                <td className="px-4 py-2.5 text-ink/60">{p.cargo_fihnec || '—'}</td>
              </tr>
            ))}
            {datos?.participantes.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-ink/40">Todavía no hay participantes marcados como "Registrado" en el ciclo actual de este nivel.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
