import prisma from '../lib/prisma.js';
import { getClassOccurrences } from '../utils/class-schedule.js';
import { getGymParts, gymDateKey, gymMonthRange, gymWallTimeToDate, shiftCalendarDay } from '../utils/timezone.js';

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const toAmount = (value) => {
  if (value === null || value === undefined) return 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

// Todos los límites (mes, semana, meses del gráfico) se calculan en hora de Buenos Aires, no en la zona del servidor.
const monthBuckets = (size, now) => {
  const current = getGymParts(now);
  const buckets = [];
  for (let offset = size - 1; offset >= 0; offset -= 1) {
    const index = current.year * 12 + (current.month - 1) - offset;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    buckets.push({ key: `${year}-${String(month).padStart(2, '0')}`, year, month, label: MONTH_LABELS[month - 1], total: 0 });
  }
  const first = buckets[0];
  const start = gymWallTimeToDate(first.year, first.month, 1, 0, 0);
  return { buckets, start, end: gymMonthRange(now).end };
};

// Semana en curso (lunes a domingo) en hora del gimnasio: [lunes 00:00, lunes siguiente 00:00).
const gymWeekRange = (now) => {
  const today = getGymParts(now);
  const monday = shiftCalendarDay(today, -(today.diaSemana - 1));
  const nextMonday = shiftCalendarDay(monday, 7);
  return { start: gymWallTimeToDate(monday.year, monday.month, monday.day, 0, 0), end: gymWallTimeToDate(nextMonday.year, nextMonday.month, nextMonday.day, 0, 0) };
};

// "Clases de esta semana" = cantidad de clases que OCURREN en la semana: una clase única cuenta si su fecha cae en la
// semana y una recurrente cuenta una vez por cada uno de sus días (clase_dia) que cae en la semana.
export const countClassesInWeek = async (now = new Date()) => {
  const { start, end } = gymWeekRange(now);
  const classes = await prisma.clase.findMany({
    where: { OR: [{ recurrente: true }, { fechaHora: { gte: start, lt: end } }] },
    include: { dias: true },
  });
  return classes.reduce((total, clase) => total + getClassOccurrences(clase, start, new Date(end.getTime() - 1)).length, 0);
};

export const getDashboardStats = async (months = 6, now = new Date()) => {
  const { start: monthStart, end: nextMonth } = gymMonthRange(now);
  const size = Number(months) === 12 ? 12 : 6;
  const { buckets, start: seriesStart, end: seriesEnd } = monthBuckets(size, now);

  const [clientesActivos, ingresosDelMes, planesActivos, clasesEstaSemana, pagosPeriodo] = await Promise.all([
    prisma.cliente.count({ where: { estadoCliente: { nombre: 'HABILITADO' } } }),
    prisma.pago.aggregate({ _sum: { monto: true }, where: { fechaPago: { gte: monthStart, lt: nextMonth } } }),
    prisma.plan.count({ where: { activo: true } }),
    countClassesInWeek(now),
    prisma.pago.findMany({ where: { fechaPago: { gte: seriesStart, lt: seriesEnd } }, select: { monto: true, fechaPago: true } }),
  ]);

  const totalsByMonth = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const pago of pagosPeriodo) {
    const bucket = totalsByMonth.get(gymDateKey(pago.fechaPago).slice(0, 7));
    if (bucket) bucket.total += toAmount(pago.monto);
  }

  return {
    clientesActivos,
    ingresosDelMes: toAmount(ingresosDelMes._sum.monto),
    planesActivos,
    clasesEstaSemana,
    ingresosMensuales: buckets.map(({ key, ...rest }) => ({ ...rest, total: Number(rest.total.toFixed(2)) })),
  };
};
