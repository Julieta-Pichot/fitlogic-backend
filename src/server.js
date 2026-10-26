import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './lib/prisma.js';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { sendSuccess } from './utils/response.js';
import { verifySchemaOnStartup } from './lib/schema-check.js';
import { RECIPES_UPLOADS_PATH } from './middlewares/upload.middleware.js';
import { getCheckoutConfig } from './services/membership-payments.service.js';
import { startNotificationScheduler, stopNotificationScheduler } from './services/notification-scheduler.js';

dotenv.config();

const app = express();
const STARTED_AT = new Date();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
// En desarrollo, Vite pasa a otro puerto (5174, 5175...) si el 5173 está ocupado: se acepta cualquier puerto de localhost.
const isDevLocalOrigin = (origin) => process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(origin);

// FRONTEND_PUBLIC_URL: URL https del front (túnel) usada en las back_urls de Mercado Pago.
for (const value of [process.env.FRONTEND_URL, process.env.FRONTEND_PUBLIC_URL]) {
  const origin = value?.trim().replace(/\/$/, '');
  if (origin && !allowedOrigins.includes(origin)) allowedOrigins.push(origin);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || isDevLocalOrigin(origin)) return callback(null, true);
      if (origin.endsWith('.vercel.app')) return callback(null, true);
      // Origen no permitido: sin cabeceras CORS (el navegador lo bloquea). No es un error del servidor, así que no se responde 500.
      return callback(null, false);
    },
    credentials: true,
  })
);

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
// El webhook de Mercado Pago llega detrás de un túnel/proxy: se confía en el primer proxy para obtener la IP real.
app.set('trust proxy', 1);
app.use(express.json());

// Fotos de recetas (imágenes públicas, con nombre único generado por el servidor).
app.use('/uploads/recetas', express.static(RECIPES_UPLOADS_PATH, { index: false, dotfiles: 'deny' }));

app.get('/api/health', (_req, res) => {
  return sendSuccess(res, {
    message: 'FitLogic API funcionando correctamente',
    data: {
      timestamp: new Date().toISOString(),
      startedAt: STARTED_AT.toISOString(),
      pid: process.pid,
      scheduler: process.env.DISABLE_SCHEDULER !== 'true',
      environment: process.env.NODE_ENV || 'development',
    },
  });
});

app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// Avisa al arrancar qué parte del circuito de Mercado Pago está disponible (sin imprimir credenciales).
const logMercadoPagoConfig = () => {
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()) {
    console.warn('[mercadopago] Sin MERCADOPAGO_ACCESS_TOKEN: el pago con Mercado Pago está deshabilitado.');
    return;
  }
  const { retornoAutomatico, webhookActivo } = getCheckoutConfig();
  if (!retornoAutomatico) console.warn('[mercadopago] FRONTEND_PUBLIC_URL no es https: se omiten auto_return y el retorno automático (el cliente usa "Ya pagué, verificar").');
  if (!webhookActivo) console.warn('[mercadopago] BACKEND_PUBLIC_URL no es https: se omite notification_url (webhook). El sondeo del scheduler acredita los pagos igual.');
  if (!process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim()) console.warn('[mercadopago] Sin MERCADOPAGO_WEBHOOK_SECRET: no se valida la firma x-signature del webhook.');
};

const server = app.listen(PORT, () => {
  console.log(`FitLogic API escuchando en puerto ${PORT}`);
  logMercadoPagoConfig();
  verifySchemaOnStartup().then((ok) => {
    if (ok && process.env.DISABLE_SCHEDULER !== 'true') startNotificationScheduler();
  });
});

const shutdown = async (signal) => {
  console.log(`${signal} recibido. Cerrando servidor...`);
  stopNotificationScheduler();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
