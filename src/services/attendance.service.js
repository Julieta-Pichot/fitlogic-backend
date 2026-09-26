import prisma from '../lib/prisma.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError.js';

const getClientWithAccessData = async (clientId) => {
  const client = await prisma.cliente.findUnique({
    where: { id: Number(clientId) },
    include: {
      usuario: true,
      estadoCliente: true,
      cuotas: {
        include: { estadoCuota: true, plan: true },
        orderBy: { fechaVencimiento: 'desc' },
      },
    },
  });
  if (!client) throw new NotFoundError('Cliente no encontrado');
  return client;
};

const dateOnly = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const validateClientAccess = async (clientId) => {
  const client = await prisma.cliente.findUnique({
    where: { id: Number(clientId) },
    include: {
      estadoCliente: true,
      cuotas: { include: { estadoCuota: true }, orderBy: { fechaVencimiento: 'desc' } },
    },
  });
  if (!client) throw new NotFoundError('Cliente no encontrado');

  const today = dateOnly(new Date());
  const currentQuota = client.cuotas.find((quota) => quota.estadoCuota.nombre === 'ACTIVA');
  const graceLimit = currentQuota ? dateOnly(new Date(currentQuota.fechaVencimiento)) : null;
  if (graceLimit) graceLimit.setDate(graceLimit.getDate() + 3);
  const quotaAllowed = Boolean(currentQuota && graceLimit >= today);

  if (!quotaAllowed && client.estadoCliente.nombre !== 'INHABILITADO_PAGO') {
    const paymentState = await prisma.estadoCliente.findUnique({ where: { nombre: 'INHABILITADO_PAGO' } });
    if (paymentState) await prisma.cliente.update({ where: { id: client.id }, data: { estadoClienteId: paymentState.id } });
  }

  const medicalAllowed = Boolean(client.aptoFisicoFechaVencimiento && dateOnly(new Date(client.aptoFisicoFechaVencimiento)) >= today);
  const allowed = client.estadoCliente.nombre === 'HABILITADO' && quotaAllowed && medicalAllowed;
  return {
    allowed,
    reason: !allowed
      ? client.estadoCliente.nombre !== 'HABILITADO'
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

export const registerAttendance = async (clientId, actorUserId = null) => {
  const access = await validateClientAccess(clientId);
  if (!access.allowed) throw new ForbiddenError(access.reason);
  const attendance = await prisma.asistencia.create({
    data: { clienteId: Number(clientId), fechaHora: new Date() },
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
