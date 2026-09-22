import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

const include = { plan: true };

const normalizePromotionPayload = (payload = {}, partial = false) => {
  const data = {};
  if (!partial || payload.planId !== undefined) data.planId = Number(payload.planId);
  if (!partial || payload.nombre !== undefined) data.nombre = String(payload.nombre ?? '').trim();
  if (!partial || payload.descripcion !== undefined) data.descripcion = String(payload.descripcion ?? '').trim() || null;
  if (!partial || payload.descuento !== undefined || payload.descuentoPorcentaje !== undefined) {
    data.descuento = Number(payload.descuento ?? payload.descuentoPorcentaje);
  }
  if (!partial || payload.fechaInicio !== undefined) data.fechaInicio = new Date(payload.fechaInicio ?? Date.now());
  if (!partial || payload.fechaFin !== undefined) data.fechaFin = new Date(payload.fechaFin ?? Date.now() + 30 * 86400000);
  if (!partial || payload.activa !== undefined || payload.activo !== undefined) {
    data.activa = Number(payload.activa ?? payload.activo) === 1;
  }

  if (data.planId !== undefined && !Number.isInteger(data.planId)) throw new ValidationError('El plan de la promoción es inválido');
  if (data.nombre !== undefined && !data.nombre) throw new ValidationError('El nombre de la promoción es obligatorio');
  if (data.descuento !== undefined && (!Number.isFinite(data.descuento) || data.descuento < 0 || data.descuento > 100)) {
    throw new ValidationError('El descuento debe estar entre 0 y 100');
  }
  if (data.fechaInicio && Number.isNaN(data.fechaInicio.getTime())) throw new ValidationError('La fecha de inicio es inválida');
  if (data.fechaFin && Number.isNaN(data.fechaFin.getTime())) throw new ValidationError('La fecha de fin es inválida');
  if (data.fechaInicio && data.fechaFin && data.fechaFin < data.fechaInicio) throw new ValidationError('La vigencia de la promoción es inválida');
  return data;
};

const ensurePlan = async (planId) => {
  if (!await prisma.plan.findUnique({ where: { id: planId } })) throw new NotFoundError('Plan no encontrado');
};

export const listPromotions = async (_gimnasioId, query = {}) => {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const activa = query.activo !== undefined ? Number(query.activo) === 1 : undefined;
  return prisma.promocion.findMany({
    where: { ...(activa !== undefined ? { activa } : {}), ...(search ? { nombre: { contains: search } } : {}) },
    include,
    orderBy: { id: 'desc' },
  });
};

export const getPromotionById = async (_gimnasioId, promotionId) => {
  const promotion = await prisma.promocion.findUnique({ where: { id: Number(promotionId) }, include });
  if (!promotion) throw new NotFoundError('Promoción no encontrada');
  return promotion;
};

export const createPromotion = async (_gimnasioId, _actorId, payload = {}) => {
  const data = normalizePromotionPayload(payload);
  await ensurePlan(data.planId);
  return prisma.promocion.create({ data, include });
};

export const updatePromotion = async (_gimnasioId, _actorId, promotionId, payload = {}) => {
  const current = await getPromotionById(null, promotionId);
  const data = normalizePromotionPayload(payload, true);
  if (data.planId !== undefined) await ensurePlan(data.planId);
  return Object.keys(data).length ? prisma.promocion.update({ where: { id: current.id }, data, include }) : current;
};

export const togglePromotionActive = async (_gimnasioId, _actorId, promotionId, activo) => {
  const current = await getPromotionById(null, promotionId);
  const value = Number(activo);
  if (value !== 0 && value !== 1) throw new ValidationError('Estado de la promoción inválido');
  return prisma.promocion.update({ where: { id: current.id }, data: { activa: value === 1 }, include });
};

export const deletePromotion = async (_gimnasioId, _actorId, promotionId) =>
  togglePromotionActive(null, null, promotionId, 0);
