import prisma from '../lib/prisma.js';
import {
  startOfMonth,
  addMonths,
  startOfWeekMonday,
  endOfWeekMondayExclusive,
  monthKey,
  buildMonthRange,
} from '../utils/dates.js';

const toAmount = (value) => {
  if (value === null || value === undefined) return 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

export const getDashboardStats = async (months = 6) => {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const nextMonth = addMonths(monthStart, 1);
  const weekStart = startOfWeekMonday(now);
  const weekEnd = endOfWeekMondayExclusive(now);
  const { start: seriesStart, end: seriesEnd, buckets } = buildMonthRange(months);

  const [clientesActivos, ingresosDelMes, planesActivos, clasesEstaSemana, pagosPeriodo] = await Promise.all([
    prisma.cliente.count({
      where: { estadoCliente: { nombre: 'HABILITADO' } },
    }),
    prisma.pago.aggregate({
      _sum: { monto: true },
      where: { fechaPago: { gte: monthStart, lt: nextMonth } },
    }),
    prisma.plan.count({
      where: { activo: true },
    }),
    prisma.clase.count({
      where: { fechaHora: { gte: weekStart, lt: weekEnd } },
    }),
    prisma.pago.findMany({
      where: { fechaPago: { gte: seriesStart, lt: seriesEnd } },
      select: { monto: true, fechaPago: true },
    }),
  ]);

  const totalsByMonth = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const pago of pagosPeriodo) {
    const key = monthKey(pago.fechaPago);
    const bucket = totalsByMonth.get(key);
    if (!bucket) continue;
    bucket.total += toAmount(pago.monto);
  }

  return {
    clientesActivos,
    ingresosDelMes: toAmount(ingresosDelMes._sum.monto),
    planesActivos,
    clasesEstaSemana,
    ingresosMensuales: buckets.map(({ key, ...rest }) => ({
      ...rest,
      total: Number(rest.total.toFixed(2)),
    })),
  };
};
