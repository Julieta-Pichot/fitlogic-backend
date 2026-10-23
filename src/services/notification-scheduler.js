import prisma from '../lib/prisma.js';
import { getClassOccurrences } from '../utils/class-schedule.js';
import { GYM_TIMEZONE, formatGymTime } from '../utils/timezone.js';

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

let timer = null;
let running = false;

export const startNotificationScheduler = () => {
  if (timer) return;

  const tick = async () => {
    if (running) return; // evita solapar corridas si una tarda más de un minuto
    running = true;
    try {
      const created = await generateClassReminders();
      if (created > 0) console.log(`[scheduler] ${created} aviso(s) de clase generados`);
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
