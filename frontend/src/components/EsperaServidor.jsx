import { useEffect, useState } from 'react';
import api from '../api';

// Envuelve cualquier página que dependa del backend nada más cargar. Mientras Render/Neon
// no hayan respondido, tapa TODO el contenido con una pantalla de espera — así, sin importar
// qué haga la página de adentro mientras carga sus propios datos, nadie ve nunca un estado a
// medias ni datos viejos/incorrectos (ej. "Evento 1 cerrado" antes de que cargue el real).
// Usa /api/salud-completa porque revisa Render Y Neon en una sola llamada mínima.
const REINTENTO_MS = 3000;
const LIMITE_MS = 60000; // si pasa de esto, algo más serio que un cold-start está fallando

export default function EsperaServidor({ children, tema = 'claro', mensaje = 'para tu sesión' }) {
  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const inicio = Date.now();

    const intentar = () => {
      api.get('/salud-completa')
        .then(() => { if (!cancelado) setListo(true); })
        .catch(() => {
          if (cancelado) return;
          if (Date.now() - inicio > LIMITE_MS) { setFallo(true); return; }
          setTimeout(intentar, REINTENTO_MS);
        });
    };
    intentar();

    return () => { cancelado = true; };
  }, []);

  if (listo) return children;

  const oscuro = tema === 'oscuro';
  const colorFondo = oscuro ? '#1B140E' : '#FBF6EC';
  const colorCirculo = oscuro ? '#2E2115' : '#F1E6CC';
  const colorIcono = oscuro ? '#E7B85C' : '#9A6136';
  const colorTitulo = oscuro ? '#FBF6EC' : '#241A12';
  const colorSubtitulo = oscuro ? '#C9BFA8' : '#8A7B5E';
  const colorMensaje = oscuro ? '#A79A80' : '#8A7B5E';
  const colorBotonTexto = oscuro ? '#1B140E' : '#FBF6EC';

  return (
    <div style={{ minHeight: '100vh', background: colorFondo, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: 320, textAlign: 'center' }}>
        <div style={{
          height: 6, borderRadius: 999, overflow: 'hidden', display: 'flex', marginBottom: 28
        }}>
          <div style={{ flex: 1, background: '#C9932F' }} />
          <div style={{ flex: 1, background: '#9A6136' }} />
          <div style={{ flex: 1, background: '#F59D24' }} />
          <div style={{ flex: 1, background: '#2F5D3A' }} />
        </div>

        <div style={{
          width: 52, height: 52, borderRadius: '50%', background: colorCirculo,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
        }}>
          <span style={{ fontSize: 24, color: colorIcono }} aria-hidden="true">🔥</span>
        </div>

        <p style={{ fontFamily: 'Fraunces, serif', fontSize: 19, fontWeight: 500, color: colorTitulo, margin: '0 0 2px' }}>
          SFL · FIHNEC
        </p>
        <p style={{ fontSize: 12, color: colorSubtitulo, margin: '0 0 24px' }}>
          Seminario para la Formación de Líderes
        </p>

        {fallo ? (
          <>
            <p style={{ fontSize: 13, color: colorMensaje, lineHeight: 1.6, margin: '0 0 14px' }}>
              Esto está tardando más de lo normal. Puede ser tu conexión, o el servidor está
              teniendo un problema.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#C9932F', border: 'none', borderRadius: 999, padding: '10px 24px',
                fontSize: 13, fontWeight: 600, color: colorBotonTexto, cursor: 'pointer'
              }}
            >
              Reintentar
            </button>
          </>
        ) : (
          <>
            <div style={{
              width: 28, height: 28, margin: '0 auto 16px', borderRadius: '50%',
              border: `3px solid ${oscuro ? '#4A3B28' : '#E7DCC3'}`, borderTopColor: '#C9932F',
              animation: 'espera-servidor-spin 0.9s linear infinite'
            }} />
            <p style={{ fontSize: 13, color: colorMensaje, lineHeight: 1.6, margin: 0 }}>
              Preparando el entorno {mensaje}. Estaremos listos en un máximo de 50 segundos.
            </p>
          </>
        )}
      </div>
      <style>{`@keyframes espera-servidor-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
