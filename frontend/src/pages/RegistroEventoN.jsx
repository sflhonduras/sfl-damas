import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { mensajeError } from '../api';
import BotonVolver from '../components/BotonVolver';
import InfoEvento from '../components/InfoEvento';
import ProximasFechas from '../components/ProximasFechas';
import PromoWhatsApp from '../components/PromoWhatsApp';

export default function RegistroEventoN() {
  const { orden } = useParams();
  const [dni, setDni] = useState('');
  const [evento, setEvento] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  useEffect(() => {
    api.get(`/eventos/${orden}/estado`).then(r => setEvento(r.data)).catch(() => {});
    setDni(''); setError(''); setExito('');
  }, [orden]);

  const enviar = async (e) => {
    e.preventDefault();
    setError(''); setExito('');
    setEnviando(true);
    try {
      const r = await api.post(`/registro/${orden}`, { dni });
      setExito(r.data.mensaje);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  if (orden === '1') {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <BotonVolver />
        <p className="text-ink/60">El Nivel I requiere el formulario completo.</p>
        <Link to="/registro/1" className="mt-4 inline-block rounded-full bg-ink px-6 py-2.5 font-semibold text-parchment">Ir al formulario</Link>
      </div>
    );
  }

  if (evento && !evento.abierto) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <BotonVolver />
        <p className="text-5xl">🔒</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">Registro cerrado</h1>
        <p className="mt-3 text-ink/60">El registro para "{evento.nombre}" no está disponible en este momento.</p>
        <ProximasFechas />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 py-24">
      <BotonVolver />
      <p className="text-center text-sm font-semibold uppercase tracking-widest text-gold">Nivel {orden}</p>
      <h1 className="mt-1 text-center font-display text-3xl font-bold text-ink">{evento ? evento.nombre : 'Cargando…'}</h1>
      <p className="mt-2 text-center text-ink/60">Ingresa tu número de identidad (DNI) para verificar tu habilitación e inscribirte.</p>
      {evento && <div className="mt-3 text-center"><InfoEvento evento={evento} /></div>}

      {exito ? (
        <div className="mt-8 rounded-2xl border border-palm/30 bg-palm/5 p-6 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-3 font-semibold text-palm">{exito}</p>
          <PromoWhatsApp />
        </div>
      ) : (
        <form onSubmit={enviar} className="mt-8 space-y-4">
          <input
            required inputMode="numeric"
            value={dni}
            onChange={e => setDni(e.target.value.replace(/[^\d]/g, '').slice(0, 13))}
            placeholder="Número de identidad (DNI)"
            className="w-full rounded-lg border border-ink/15 bg-white px-4 py-3 text-center text-lg outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
          />
          {error && <p className="rounded-lg bg-ember/10 p-3 text-center text-sm text-ember">{error}</p>}
          <button disabled={enviando} className="w-full rounded-full bg-gold py-3.5 font-semibold text-night transition hover:bg-gold-light disabled:opacity-60">
            {enviando ? 'Verificando…' : 'Verificar e inscribirme'}
          </button>
        </form>
      )}

      <ProximasFechas />
    </div>
  );
}
