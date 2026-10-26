import prisma from '../lib/prisma.js';
import { ForbiddenError, NotFoundError } from '../errors/AppError.js';
import { dbDateMs, gymTodayMs } from '../utils/timezone.js';

const DAY_MS = 86_400_000;
const GRACE_DAYS = 3;

// Las fechas se comparan por día calendario de Buenos Aires (no por la zona del servidor).
export const validateClientAccess = async (clientId, now = new Date()) => {
  const client = await prisma.cliente.findUnique({
    where: { id: Number(clientId) },
    include: {
      estadoCliente: true,
      cuotas: { include: { estadoCuota: true }, orderBy: { fechaVencimiento: 'desc' } },
    },
  });
  if (!client) throw new NotFoundError('Cliente no encontrado');

  const today = gymTodayMs(now);
  const currentQuota = client.cuotas.find((quota) => quota.estadoCuota.nombre === 'ACTIVA');
  // Se tolera hasta 3 días después del vencimiento de la cuota ACTIVA.
  const graceLimit = currentQuota ? dbDateMs(currentQuota.fechaVencimiento) + GRACE_DAYS * DAY_MS : null;
  const quotaAllowed = Boolean(currentQuota && graceLimit >= today);

  if (!quotaAllowed && client.estadoCliente.nombre !== 'INHABILITADO_PAGO') {
    const paymentState = await prisma.estadoCliente.findUnique({ where: { nombre: 'INHABILITADO_PAGO' } });
    if (paymentState) await prisma.cliente.update({ where: { id: client.id }, data: { estadoClienteId: paymentState.id } });
  }

  const medicalAllowed = Boolean(client.aptoFisicoFechaVencimiento && dbDateMs(client.aptoFisicoFechaVencimiento) >= today);
  const allowed = client.estadoCliente.nombre === 'HABILITADO' && quotaAllowed && medicalAllowed;
  return {
    allowed,
    reason: !allowed
      ? client.estadoCliente.nombre === 'INHABILITADO_PAGO'
        ? 'Cliente inhabilitado por falta de pago: la cuota está vencida o sin pagar'
        : client.estadoCliente.nombre === 'INHABILITADO_BAJA'
          ? 'El cliente fue dado de baja'
          : client.estadoCliente.nombre !== 'HABILITADO'
        ? 'El cliente no está habilitado'
        : !quotaAllowed
          ? client.cuotas.some((quota) => quota.estadoCuota.nombre === 'PENDIENTE')
            ? 'La cuota está pendiente de pago'
            : 'La cuota está vencida'
          : 'El apto físico está vencido o no fue cargado'
      : 'Acceso autorizado',
    client,
    cuota: currentQuota,
  };
};

export const registerAttendance = async (clientId, actorUserId = null, now = new Date()) => {
  const access = await validateClientAccess(clientId, now);
  if (!access.allowed) throw new ForbiddenError(access.reason);
  const attendance = await prisma.asistencia.create({
    data: { clienteId: Number(clientId), fechaHora: now },
    include: { cliente: { include: { usuario: true } } },
  });
  return { ...attendance, registradoPorId: actorUserId };
};

export const listAttendance = async (query = {}) => {
  const where = {};
  if (query.clienteId) where.clienteId = Number(query.clienteId);
  if (query.desde || query.hasta) {
    where.fechaHora = {
      ...(query.desde ? { gte: new Date(query.desde) } : {}),
      ...(query.hasta ? { lte: new Date(query.hasta) } : {}),
    };
  }
  return prisma.asistencia.findMany({
    where,
    include: { cliente: { include: { usuario: true } } },
    orderBy: { fechaHora: 'desc' },
  });
};
