import prisma from '../lib/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError.js';

const findState = async (name) => {
  const state = await prisma.estadoCuota.findUnique({ where: { nombre: name } });
  if (!state) throw new ValidationError(`No existe el estado de cuota ${name}`);
  return state;
};

const quotaInclude = {
  plan: true,
  estadoCuota: true,
  pago: { include: { metodoPago: true } },
  cliente: { include: { usuario: true, estadoCliente: true } },
};

const getClientIdForUser = async (userId) => {
  const client = await prisma.cliente.findUnique({ where: { usuarioId: userId } });
  if (!client) throw new NotFoundError('Perfil de cliente no encontrado');
  return client.id;
};

export const listQuotas = async ({ userId, clientId, activeOnly = false }) => {
  const resolvedClientId = userId ? await getClientIdForUser(userId) : Number(clientId);
  if (!resolvedClientId) throw new ValidationError('El cliente es obligatorio');
  return prisma.cuota.findMany({
    where: { clienteId: resolvedClientId, ...(activeOnly ? { estadoCuota: { nombre: 'ACTIVA' } } : {}) },
    include: quotaInclude,
    orderBy: { fechaVencimiento: 'desc' },
  });
};

export const createPendingQuota = async ({ userId, clientId, planId }) => {
  const resolvedClientId = userId ? await getClientIdForUser(userId) : Number(clientId);
  const plan = await prisma.plan.findUnique({ where: { id: Number(planId) } });
  if (!plan || !plan.activo) throw new NotFoundError('Plan activo no encontrado');
  const pending = await findState('PENDIENTE');

  const existingPending = await prisma.cuota.findFirst({ where: { clienteId: resolvedClientId, planId: plan.id, estadoCuotaId: pending.id } });
  if (existingPending) throw new ConflictError('El cliente ya tiene una solicitud pendiente para este plan');

  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + plan.duracionDias);
  return prisma.cuota.create({
    data: {
      clienteId: resolvedClientId,
      planId: plan.id,
      estadoCuotaId: pending.id,
      fechaInicio: start,
      fechaVencimiento: end,
    },
    include: quotaInclude,
  });
};

export const confirmQuotaPayment = async (quotaId, metodoPagoId, referenciaExterna) => {
  const quota = await prisma.cuota.findUnique({ where: { id: Number(quotaId) }, include: { plan: true, estadoCuota: true, pago: true } });
  if (!quota) throw new NotFoundError('Cuota no encontrada');
  if (quota.pago) throw new ConflictError('La cuota ya tiene un pago registrado');
  if (quota.estadoCuota.nombre !== 'PENDIENTE') throw new ConflictError('La cuota no está pendiente de confirmación');
  const method = await prisma.metodoPago.findUnique({ where: { id: Number(metodoPagoId) } });
  if (!method) throw new ValidationError('Método de pago inválido');
  const active = await findState('ACTIVA');

  return prisma.$transaction(async (tx) => {
    await tx.pago.create({
      data: {
        cuotaId: quota.id,
        metodoPagoId: method.id,
        monto: quota.plan.precio,
        fechaPago: new Date(),
        referenciaExterna: referenciaExterna ? String(referenciaExterna).trim() : null,
      },
    });
    return tx.cuota.update({ where: { id: quota.id }, data: { estadoCuotaId: active.id }, include: quotaInclude });
  });
};

export const getQuotaById = async (quotaId) => {
  const quota = await prisma.cuota.findUnique({ where: { id: Number(quotaId) }, include: quotaInclude });
  if (!quota) throw new NotFoundError('Cuota no encontrada');
  return quota;
};
