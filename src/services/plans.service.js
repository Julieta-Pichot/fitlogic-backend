import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

const normalizePlanPayload = (payload = {}) => {
  const nombre = String(payload.nombre ?? '').trim();
  const duracionDias = Number(payload.duracionDias);
  const precio = Number(payload.precio);
  if (!nombre) throw new ValidationError('El nombre del plan es obligatorio');
  if (!Number.isInteger(duracionDias) || duracionDias <= 0) throw new ValidationError('La duración del plan es inválida');
  if (!Number.isFinite(precio) || precio < 0) throw new ValidationError('El precio del plan es inválido');
  return { nombre, duracionDias, precio: Number(precio.toFixed(2)) };
};

export const listPlans = async (_gimnasioId, query = {}) => {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const activo = query.activo !== undefined ? Number(query.activo) === 1 : undefined;
  return prisma.plan.findMany({
    where: { ...(activo !== undefined ? { activo } : {}), ...(search ? { nombre: { contains: search } } : {}) },
    include: { promociones: true },
    orderBy: { id: 'desc' },
  });
};

export const getPlanById = async (_gimnasioId, planId) => {
  const plan = await prisma.plan.findUnique({ where: { id: Number(planId) }, include: { promociones: true } });
  if (!plan) throw new NotFoundError('Plan no encontrado');
  return plan;
};

export const createPlan = async (_gimnasioId, _actorId, payload = {}) =>
  prisma.plan.create({ data: { ...normalizePlanPayload(payload), activo: true } });

export const updatePlan = async (_gimnasioId, _actorId, planId, payload = {}) => {
  const current = await getPlanById(null, planId);
  const data = {};
  if (payload.nombre !== undefined || payload.duracionDias !== undefined || payload.precio !== undefined) {
    Object.assign(data, normalizePlanPayload({
      nombre: payload.nombre ?? current.nombre,
      duracionDias: payload.duracionDias ?? current.duracionDias,
      precio: payload.precio ?? current.precio,
    }));
  }
  if (payload.activo !== undefined) {
    const activo = Number(payload.activo);
    if (activo !== 0 && activo !== 1) throw new ValidationError('Estado del plan inválido');
    data.activo = activo === 1;
  }
  return Object.keys(data).length ? prisma.plan.update({ where: { id: current.id }, data }) : current;
};

export const togglePlanActive = async (_gimnasioId, _actorId, planId, activo) =>
  updatePlan(null, null, planId, { activo });

export const deletePlan = async (_gimnasioId, _actorId, planId) => {
  const plan = await getPlanById(null, planId);
  return prisma.plan.update({ where: { id: plan.id }, data: { activo: false } });
};
