import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import { assertGymOwnership, gymScope } from '../utils/scope.js';

const normalizePromotionPayload = (payload = {}) => {
  const nombre = String(payload.nombre ?? '').trim();
  const descripcion = payload.descripcion !== undefined ? String(payload.descripcion).trim() : null;
  const descuentoPorcentaje = Number(payload.descuentoPorcentaje ?? payload.discount ?? 0);
  const tipo = Number(payload.tipo ?? payload.type ?? 1);
  const fechaInicio = payload.fechaInicio ?? payload.startDate ?? new Date().toISOString();
  const fechaFin = payload.fechaFin ?? payload.endDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const activo = payload.activo !== undefined ? Number(payload.activo) : 1;

  if (!nombre) {
    throw new ValidationError('El nombre de la promoción es obligatorio');
  }

  if (!Number.isFinite(descuentoPorcentaje) || descuentoPorcentaje < 0 || descuentoPorcentaje > 100) {
    throw new ValidationError('El descuento debe estar entre 0 y 100');
  }

  if (tipo !== 1 && tipo !== 2) {
    throw new ValidationError('El tipo de promoción es inválido');
  }

  if (activo !== 0 && activo !== 1) {
    throw new ValidationError('El estado activo de la promoción es inválido');
  }

  return {
    nombre,
    descripcion: descripcion || null,
    descuentoPorcentaje: Number(descuentoPorcentaje.toFixed(2)),
    tipo,
    fechaInicio: new Date(fechaInicio),
    fechaFin: new Date(fechaFin),
    activo,
  };
};

export const listPromotions = async (gimnasioId, query = {}) => {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const activo = query.activo !== undefined ? Number(query.activo) : undefined;
  const tipo = query.tipo !== undefined ? Number(query.tipo) : undefined;

  return prisma.promocion.findMany({
    where: {
      ...gymScope(gimnasioId),
      ...(activo !== undefined ? { activo } : {}),
      ...(tipo !== undefined ? { tipo } : {}),
      ...(search ? { nombre: { contains: search } } : {}),
    },
    orderBy: { fechaCreacion: 'desc' },
  });
};

export const getPromotionById = async (gimnasioId, promotionId) => {
  const promotion = await prisma.promocion.findUnique({ where: { id: Number(promotionId) } });

  if (!promotion) {
    throw new NotFoundError('Promoción no encontrada');
  }

  assertGymOwnership(promotion.gimnasioId, gimnasioId, 'Promoción');

  return promotion;
};

export const createPromotion = async (gimnasioId, actorId, payload = {}) => {
  const data = normalizePromotionPayload(payload);

  return prisma.promocion.create({
    data: {
      gimnasioId,
      nombre: data.nombre,
      descripcion: data.descripcion,
      descuentoPorcentaje: data.descuentoPorcentaje,
      tipo: data.tipo,
      fechaInicio: data.fechaInicio,
      fechaFin: data.fechaFin,
      activo: data.activo,
      creadoPorId: actorId,
      actualizadoPorId: actorId,
    },
  });
};

export const updatePromotion = async (gimnasioId, actorId, promotionId, payload = {}) => {
  const promotion = await getPromotionById(gimnasioId, promotionId);
  const nextData = {};

  if (payload.nombre !== undefined) {
    const nombre = String(payload.nombre).trim();
    if (!nombre) {
      throw new ValidationError('El nombre de la promoción es obligatorio');
    }
    nextData.nombre = nombre;
  }

  if (payload.descripcion !== undefined) {
    nextData.descripcion = String(payload.descripcion).trim() || null;
  }

  if (payload.descuentoPorcentaje !== undefined || payload.discount !== undefined) {
    const descuento = Number(payload.descuentoPorcentaje ?? payload.discount ?? 0);
    if (!Number.isFinite(descuento) || descuento < 0 || descuento > 100) {
      throw new ValidationError('El descuento debe estar entre 0 y 100');
    }
    nextData.descuentoPorcentaje = Number(descuento.toFixed(2));
  }

  if (payload.tipo !== undefined || payload.type !== undefined) {
    const tipo = Number(payload.tipo ?? payload.type ?? 1);
    if (tipo !== 1 && tipo !== 2) {
      throw new ValidationError('El tipo de promoción es inválido');
    }
    nextData.tipo = tipo;
  }

  if (payload.fechaInicio !== undefined || payload.startDate !== undefined) {
    nextData.fechaInicio = new Date(payload.fechaInicio ?? payload.startDate);
  }

  if (payload.fechaFin !== undefined || payload.endDate !== undefined) {
    nextData.fechaFin = new Date(payload.fechaFin ?? payload.endDate);
  }

  if (payload.activo !== undefined) {
    const activo = Number(payload.activo);
    if (activo !== 0 && activo !== 1) {
      throw new ValidationError('El estado activo de la promoción es inválido');
    }
    nextData.activo = activo;
  }

  if (Object.keys(nextData).length === 0) {
    return promotion;
  }

  return prisma.promocion.update({
    where: { id: promotion.id },
    data: {
      ...nextData,
      actualizadoPorId: actorId,
    },
  });
};

export const togglePromotionActive = async (gimnasioId, actorId, promotionId, activo) => {
  const promotion = await getPromotionById(gimnasioId, promotionId);
  const safeActivo = Number(activo);

  if (safeActivo !== 0 && safeActivo !== 1) {
    throw new ValidationError('El estado activo de la promoción es inválido');
  }

  return prisma.promocion.update({
    where: { id: promotion.id },
    data: {
      activo: safeActivo,
      actualizadoPorId: actorId,
    },
  });
};

export const deletePromotion = async (gimnasioId, actorId, promotionId) => {
  const promotion = await getPromotionById(gimnasioId, promotionId);

  return prisma.promocion.update({
    where: { id: promotion.id },
    data: {
      activo: 0,
      actualizadoPorId: actorId,
    },
  });
};
