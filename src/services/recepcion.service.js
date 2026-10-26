import prisma from '../lib/prisma.js';
import { ConflictError, NotFoundError } from '../errors/AppError.js';
import { gymDayRange, gymMonthRange } from '../utils/timezone.js';
import { getCurrentUser } from './auth.service.js';
import { listPlans } from './membership-payments.service.js';

const toAmount = (value) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

export const getDashboardStats = async () => {
  const now = new Date();
  // Límites de día y mes en hora de Buenos Aires (no la zona del servidor).
  const { start: dayStart, end: dayEnd } = gymDayRange(now);
  const { start: monthStart, end: monthEnd } = gymMonthRange(now);

  const [clientesActivos, clientesInactivos, pagosPendientes, asistenciasHoy, ingresosDia, ingresosMes] =
    await Promise.all([
      prisma.cliente.count({ where: { estadoCliente: { nombre: 'HABILITADO' } } }),
      prisma.cliente.count({
        where: { estadoCliente: { nombre: { in: ['INHABILITADO_PAGO', 'INHABILITADO_BAJA'] } } },
      }),
      // "Pagos pendientes" = CLIENTES con alguna cuota PENDIENTE sin pago (el mismo criterio que el filtro de la pantalla Clientes).
      prisma.cliente.count({ where: { cuotas: { some: { estadoCuota: { nombre: 'PENDIENTE' }, pago: { is: null } } } } }),
      prisma.asistencia.count({ where: { fechaHora: { gte: dayStart, lt: dayEnd } } }),
      prisma.pago.aggregate({ _sum: { monto: true }, where: { fechaPago: { gte: dayStart, lt: dayEnd } } }),
      prisma.pago.aggregate({ _sum: { monto: true }, where: { fechaPago: { gte: monthStart, lt: monthEnd } } }),
    ]);

  return {
    clientesActivos,
    clientesInactivos,
    pagosPendientes,
    asistenciasHoy,
    ingresosDelDia: toAmount(ingresosDia._sum.monto),
    ingresosDelMes: toAmount(ingresosMes._sum.monto),
  };
};

export const listRecentPayments = async (limit = 10) => {
  const payments = await prisma.pago.findMany({
    orderBy: [{ fechaPago: 'desc' }, { id: 'desc' }],
    take: limit,
    include: {
      metodoPago: true,
      cuota: { include: { plan: true, cliente: { include: { usuario: true } } } },
    },
  });

  return payments.map((pago) => ({
    id: pago.id,
    monto: toAmount(pago.monto),
    fechaPago: pago.fechaPago,
    metodoPago: pago.metodoPago.nombre,
    plan: pago.cuota.plan.nombre,
    cliente: {
      id: pago.cuota.cliente.id,
      nombre: `${pago.cuota.cliente.usuario.nombre} ${pago.cuota.cliente.usuario.apellido}`.trim(),
    },
  }));
};

// Planes activos con el precio final (promoción vigente incluida): es lo que se cobra en caja y por Mercado Pago.
export const listActivePlans = async () => {
  return (await listPlans()).map((plan) => ({ id: plan.id, nombre: plan.nombre, duracionDias: plan.duracionDias, precio: plan.precio, precioFinal: plan.precioFinal, promocion: plan.promocion }));
};

export const updateMyProfile = async (userId, payload = {}) => {
  const current = await prisma.usuario.findUnique({ where: { id: userId } });
  if (!current) throw new NotFoundError('Usuario no encontrado');

  const data = {};
  if (payload.nombre !== undefined) data.nombre = String(payload.nombre).trim();
  if (payload.apellido !== undefined) data.apellido = String(payload.apellido).trim();
  if (payload.telefono !== undefined) data.telefono = String(payload.telefono ?? '').trim() || null;
  if (payload.email !== undefined) {
    const email = String(payload.email).trim().toLowerCase();
    if (email !== current.email) {
      if (await prisma.usuario.findUnique({ where: { email } })) {
        throw new ConflictError('Ya existe un usuario con ese email');
      }
      data.email = email;
    }
  }

  if (Object.keys(data).length) await prisma.usuario.update({ where: { id: userId }, data });
  return getCurrentUser(userId);
};
