import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'express-async-errors'; // hace que los errores en rutas async lleguen al manejador de errores, en vez de tumbar el proceso
import { query } from './db.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/admin.js';
import reportesRoutes from './routes/reportes.js';
import servidoresRoutes from './routes/servidores.js';
import cocinaRoutes from './routes/cocina.js';
import mantenimientoRoutes from './routes/mantenimiento.js';
import inventarioRoutes from './routes/inventario.js';
import transporteRoutes from './routes/transporte.js';
import auditoriaRoutes from './routes/auditoriaRoutes.js';
import medallasManualesRoutes from './routes/medallasManuales.js';
import autoconsultaRoutes from './routes/autoconsulta.js';
import participantesExcepcionRoutes from './routes/participantesExcepcion.js';
import servidorPortalRoutes from './routes/servidorPortal.js';
import mensajesBiblicosRoutes from './routes/mensajesBiblicos.js';
import { auditoriaMiddleware } from './auditoria.js';

// Red de seguridad: si algo se escapa igual, se registra pero NO se cae el servidor.
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));
process.on('uncaughtException', (err) => console.error('uncaughtException:', err));

const app = express();

// Render coloca la app detrás de un solo proxy inverso. Sin esto, Express no confía
// en el header X-Forwarded-For y express-rate-limit lanza ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// en cada petición (no tumba el servidor, pero no identifica bien la IP real de cada visitante).
app.set('trust proxy', 1);

// Permite varios dominios separados por coma en CORS_ORIGIN (ej. dominio propio + subdominio de Netlify)
const origenesPermitidos = (process.env.CORS_ORIGIN || '*').split(',').map(o => o.trim());
app.use(cors({
  origin: origenesPermitidos.includes('*') ? '*' : origenesPermitidos
}));
// El límite normal de Express (100 KB) es muy poco para un respaldo completo de la base de
// datos (participantes, inscripciones, etc.), que se sube entero como JSON al restaurar.
app.use(express.json({ limit: '25mb' }));
app.use(auditoriaMiddleware);

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use('/api/registro', limiter);
app.use('/api/auth/login', rateLimit({ windowMs: 60 * 1000, max: 10 }));
// El PIN es de solo 4 dígitos (10,000 combinaciones) — sin este límite, alguien podría
// intentar adivinarlo a la fuerza probando muchas combinaciones seguidas.
app.use('/api/autoconsulta/consultar', rateLimit({ windowMs: 60 * 1000, max: 10 }));
app.use('/api/autoconsulta/cambiar-pin', rateLimit({ windowMs: 60 * 1000, max: 10 }));

app.get('/api/salud', (req, res) => res.json({ ok: true, servicio: 'SFL Damas FIHNEC API' }));

// /api/salud NO toca la base de datos — mantiene despierto Render, pero no Neon, que tiene
// su propio temporizador de suspensión independiente en el plan gratis. Este endpoint hace
// una consulta mínima real, para que el "keep-alive" mantenga despiertos a los dos a la vez.
app.get('/api/salud-completa', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, servicio: 'SFL Damas FIHNEC API', base_de_datos: 'despierta' });
  } catch (e) {
    res.status(503).json({ ok: false, error: 'La base de datos no respondió a tiempo.' });
  }
});

app.use('/api', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/reportes', reportesRoutes);
app.use('/api/admin/servidores', servidoresRoutes);
app.use('/api/cocina', cocinaRoutes);
app.use('/api/admin/mantenimiento', mantenimientoRoutes);
app.use('/api/admin/inventario', inventarioRoutes);
app.use('/api/admin/transporte', transporteRoutes);
app.use('/api/admin/auditoria', auditoriaRoutes);
app.use('/api/admin/medallas-manuales', medallasManualesRoutes);
app.use('/api/admin/participantes-excepcion', participantesExcepcionRoutes);
app.use('/api/autoconsulta', autoconsultaRoutes);
app.use('/api/servidor-portal', servidorPortalRoutes);
app.use('/api/admin/mensajes-biblicos', mensajesBiblicosRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API SFL Damas FIHNEC escuchando en puerto ${PORT}`));
