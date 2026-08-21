import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import { assertGymOwnership, gymScope } from '../utils/scope.js';

const normalizePlanPayload = (payload = {}) => {
  const nombre = String(payload.nombre ?? '').trim();
  const duracionDias = Number(payload.duracionDias);
  const precio = Number(payload.precio);

  if (!nombre) {
    throw new ValidationError('El nombre del plan es obligatorio');
  }

  if (!Number.isFinite(duracionDias) || duracionDias <= 0) {
    throw new ValidationError('La duración del plan es inválida');
  }

  if (!Number.isFinite(precio) || precio < 0) {
    throw new ValidationError('El precio del plan es inválido');
  }

  return {
    nombre,
    duracionDias: Number(duracionDias),
    precio: Number(precio.toFixed(2)),
  };
};

export const listPlans = async (gimnasioId, query = {}) => {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const activo = query.activo !== undefined ? Number(query.activo) : undefined;

  return prisma.plan.findMany({
    where: {
      ...gymScope(gimnasioId),
      ...(activo !== undefined ? { activo } : {}),
      ...(search ? { nombre: { contains: search } } : {}),
    },
    orderBy: { fechaCreacion: 'desc' },
  });
};

export const getPlanById = async (gimnasioId, planId) => {
  const plan = await prisma.plan.findUnique({ where: { id: Number(planId) } });

  if (!plan) {
    throw new NotFoundError('Plan no encontrado');
  }

  assertGymOwnership(plan.gimnasioId, gimnasioId, 'Plan');

  return plan;
};

export const createPlan = async (gimnasioId, actorId, payload = {}) => {
  const { nombre, duracionDias, precio } = normalizePlanPayload(payload);

  return prisma.plan.create({
    data: {
      gimnasioId,
      nombre,
      duracionDias,
      precio,
      activo: 1,
      creadoPorId: actorId,
      actualizadoPorId: actorId,
    },
  });
};

export const updatePlan = async (gimnasioId, actorId, planId, payload = {}) => {
  const plan = await getPlanById(gimnasioId, planId);
  const nextData = {};

  if (payload.nombre !== undefined) {
    const nombre = String(payload.nombre).trim();
    if (!nombre) {
      throw new ValidationError('El nombre del plan es obligatorio');
    }
    nextData.nombre = nombre;
  }

  if (payload.duracionDias !== undefined) {
    const duracionDias = Number(payload.duracionDias);
    if (!Number.isFinite(duracionDias) || duracionDias <= 0) {
      throw new ValidationError('La duración del plan es inválida');
    }
    nextData.duracionDias = Number(duracionDias);
  }

  if (payload.precio !== undefined) {
    const precio = Number(payload.precio);
    if (!Number.isFinite(precio) || precio < 0) {
      throw new ValidationError('El precio del plan es inválido');
    }
    nextData.precio = Number(precio.toFixed(2));
  }

  if (payload.activo !== undefined) {
    const activo = Number(payload.activo);
    if (activo !== 0 && activo !== 1) {
      throw new ValidationError('El estado activo del plan es inválido');
    }
    nextData.activo = activo;
  }

  if (Object.keys(nextData).length === 0) {
    return plan;
  }

  return prisma.plan.update({
    where: { id: plan.id },
    data: {
      ...nextData,
      actualizadoPorId: actorId,
    },
  });
};

export const togglePlanActive = async (gimnasioId, actorId, planId, activo) => {
  const plan = await getPlanById(gimnasioId, planId);
  const safeActivo = Number(activo);

  if (safeActivo !== 0 && safeActivo !== 1) {
    throw new ValidationError('El estado activo del plan es inválido');
  }

  return prisma.plan.update({
    where: { id: plan.id },
    data: {
      activo: safeActivo,
      actualizadoPorId: actorId,
      fechaEliminacion: safeActivo === 0 ? new Date() : null,
    },
  });
};

export const deletePlan = async (gimnasioId, actorId, planId) => {
  const plan = await getPlanById(gimnasioId, planId);

  return prisma.plan.update({
    where: { id: plan.id },
    data: {
      activo: 0,
      fechaEliminacion: new Date(),
      actualizadoPorId: actorId,
    },
  });
};
