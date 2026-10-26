import prisma from '../lib/prisma.js';
import { getClassOccurrences } from '../utils/class-schedule.js';
import { cleanupExpiredCheckouts, syncPendingCheckouts } from './membership-payments.service.js';
import { computeMembership } from '../utils/membership.js';
import { GYM_TIMEZONE, dbDateMs, diffDays, formatGymTime, gymTodayMs, msToIsoDate } from '../utils/timezone.js';

const LEAD_MINUTES = 15;
const CHECK_INTERVAL_MS = 60_000;
// El aviso se emite si ya pasó su momento (inicio - 15 min) hace menos de esta ventana.
// Así, si el proceso estuvo caído unos minutos, el aviso igual sale al volver (siempre
// antes de que la clase empiece, porque la ventana es menor que el adelanto).
const CATCH_UP_WINDOW_MINUTES = 10;

const TIPO_CLASE_PROXIMA = 'CLASE_PROXIMA';

let tipoClaseProximaId = null;

const getTipoClaseProximaId = async () => {
  if (tipoClaseProximaId) return tipoClaseProximaId;
  const tipo = await prisma.tipoNotificacion.upsert({
    where: { nombre: TIPO_CLASE_PROXIMA },
    update: {},
    create: { nombre: TIPO_CLASE_PROXIMA },
  });
  tipoClaseProximaId = tipo.id;
  return tipoClaseProximaId;
};

// Genera los avisos "tu clase empieza en 15 minutos" que corresponden a este instante.
// Es seguro ejecutarlo todas las veces que haga falta: la restricción UNIQUE
// (usuario, tipo, clase, ocurrencia) más skipDuplicates (INSERT IGNORE) evita duplicados.
export const generateClassReminders = async (now = new Date()) => {
  const leadMs = LEAD_MINUTES * 60_000;
  const windowStart = new Date(now.getTime() - CATCH_UP_WINDOW_MINUTES * 60_000);

  // Ocurrencias cuyo aviso (inicio - 15 min) cae en [now - ventana, now]
  // => inicio entre (now - ventana + 15 min) y (now + 15 min).
  const from = new Date(windowStart.getTime() + leadMs);
  const to = new Date(now.getTime() + leadMs);

  const classes = await prisma.clase.findMany({
    where: {
      profesor: { estadoCuentaStaff: { nombre: 'HABILITADO' }, usuario: { activo: true } },
      OR: [{ recurrente: true }, { fechaHora: { gte: from, lte: to } }],
    },
    include: { dias: true, profesor: { select: { usuarioId: true } } },
  });

  const data = [];
  for (const clase of classes) {
    for (const start of getClassOccurrences(clase, from, to)) {
      const time = formatGymTime(start);
      data.push({
        usuarioId: clase.profesor.usuarioId,
        claseId: clase.id,
        fechaOcurrencia: start,
        titulo: `Tu clase ${clase.nombre} empieza en ${LEAD_MINUTES} minutos`,
        mensaje: `${clase.nombre} comienza a las ${time}${clase.sala ? ` en ${clase.sala}` : ''}.`,
        fechaEnvio: now,
      });
    }
  }

  if (data.length === 0) return 0;

  const tipoNotificacionId = await getTipoClaseProximaId();
  const result = await prisma.notificacion.createMany({
    data: data.map((item) => ({ ...item, tipoNotificacionId })),
    skipDuplicates: true,
  });

  return result.count;
};

// ---------------------------------------------------------------------------
// Vencimientos del cliente: cuota y apto físico, 10 días antes.
// ---------------------------------------------------------------------------

const EXPIRY_WARNING_DAYS = 10;

const ddmmyyyy = (isoDate) => isoDate.split('-').reverse().join('/');
const whenText = (days) => (days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`);

// Se crea el aviso mientras 0 <= días restantes <= 10 y todavía no exista para esa cuota / ese vencimiento
// (no depende de que el scheduler corra justo el día 10). La clave de deduplicación (cuota:<id>,
// apto:<fecha>) + UNIQUE + INSERT IGNORE evita duplicados; una renovación o un apto nuevo generan clave nueva.
export const generateExpiryReminders = async (now = new Date()) => {
  const todayMs = gymTodayMs(now);
  const clients = await prisma.cliente.findMany({
    where: { estadoCliente: { nombre: { not: 'INHABILITADO_BAJA' } }, usuario: { activo: true } },
    select: {
      usuarioId: true,
      aptoFisicoFechaVencimiento: true,
      cuotas: { include: { plan: true, estadoCuota: true, pago: true } },
    },
  });

  const data = [];
  for (const client of clients) {
    const membership = computeMembership(client.cuotas, now);
    const quota = membership.cuota;
    // Si ya hay una renovación paga que empieza al vencer, no hace falta avisar.
    if (membership.estado === 'ACTIVA' && quota && quota.diasRestantes >= 0 && quota.diasRestantes <= EXPIRY_WARNING_DAYS) {
      data.push({
        usuarioId: client.usuarioId,
        tipo: 'VENCIMIENTO_CUOTA',
        claveDedup: `cuota:${quota.id}`,
        titulo: quota.diasRestantes === 0 ? 'Tu membresía vence hoy' : 'Tu membresía está por vencer',
        mensaje: `Tu plan ${quota.plan.nombre} vence ${whenText(quota.diasRestantes)} (${ddmmyyyy(quota.fechaVencimiento)}). Renová tu membresía para seguir entrenando.`,
      });
    }

    if (client.aptoFisicoFechaVencimiento) {
      const expires = dbDateMs(client.aptoFisicoFechaVencimiento);
      const days = diffDays(todayMs, expires);
      if (days >= 0 && days <= EXPIRY_WARNING_DAYS) {
        const iso = msToIsoDate(expires);
        data.push({
          usuarioId: client.usuarioId,
          tipo: 'VENCIMIENTO_APTO_FISICO',
          claveDedup: `apto:${iso}`,
          titulo: days === 0 ? 'Tu apto físico vence hoy' : 'Tu apto físico está por vencer',
          mensaje: `Tu apto físico vence ${whenText(days)} (${ddmmyyyy(iso)}). Entregá uno nuevo en recepción.`,
        });
      }
    }
  }

  if (data.length === 0) return 0;

  const types = await prisma.tipoNotificacion.findMany({ where: { nombre: { in: ['VENCIMIENTO_CUOTA', 'VENCIMIENTO_APTO_FISICO'] } } });
  const typeId = Object.fromEntries(types.map((type) => [type.nombre, type.id]));
  const rows = data.filter((item) => typeId[item.tipo]).map(({ tipo, ...item }) => ({ ...item, tipoNotificacionId: typeId[tipo], fechaEnvio: now }));
  const result = await prisma.notificacion.createMany({ data: rows, skipDuplicates: true });
  return result.count;
};

let timer = null;
let ticks = 0;
let running = false;

export const startNotificationScheduler = () => {
  if (timer) return;

  const tick = async () => {
    if (running) return; // evita solapar corridas si una tarda más de un minuto
    running = true;
    try {
      const created = await generateClassReminders();
      if (created > 0) console.log(`[scheduler] ${created} aviso(s) de clase generados`);
      // Los vencimientos son por día: alcanza con revisarlos cada 10 minutos (y al arrancar).
      if (ticks % 10 === 0) {
        const expiries = await generateExpiryReminders();
        if (expiries > 0) console.log(`[scheduler] ${expiries} aviso(s) de vencimiento generados`);
      }
      // Pagos de Mercado Pago: sondeo cada 2 minutos (cubre webhooks que no llegan) y limpieza cada hora.
      if (process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()) {
        if (ticks % 2 === 0) {
          const activated = await syncPendingCheckouts();
          if (activated > 0) console.log('[scheduler] ' + activated + ' pago(s) de Mercado Pago acreditados por sondeo');
        }
        if (ticks % 60 === 0) {
          const cleaned = await cleanupExpiredCheckouts();
          if (cleaned.removed || cleaned.marked) console.log('[scheduler] Checkouts vencidos: ' + cleaned.removed + ' eliminados, ' + cleaned.marked + ' marcados VENCIDA');
        }
      }
      ticks += 1;
    } catch (error) {
      console.error('[scheduler] Error generando avisos de clase:', error.message);
    } finally {
      running = false;
    }
  };

  tick();
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref();
  console.log(`[scheduler] Avisos de clase activos (zona horaria ${GYM_TIMEZONE})`);
};

export const stopNotificationScheduler = () => {
  if (timer) clearInterval(timer);
  timer = null;
};
