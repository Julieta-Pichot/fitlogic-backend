import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import { assertGymOwnership, gymScope } from '../utils/scope.js';

const CATEGORY_MAP = {
  'Proteínas': 1,
  'Proteinas': 1,
  'Suplementos': 2,
  'Ropa': 3,
  'Accesorios': 4,
};

const normalizeProductPayload = (payload = {}) => {
  const nombre = String(payload.nombre ?? '').trim();
  const descripcion = payload.descripcion !== undefined ? String(payload.descripcion).trim() : null;
  const categoria = payload.categoria ?? payload.category;
  const categoryId = CATEGORY_MAP[String(categoria ?? 'Proteínas')] ?? 1;
  const precio = Number(payload.precio);
  const stock = Number(payload.stock);

  if (!nombre) {
    throw new ValidationError('El nombre del producto es obligatorio');
  }

  if (!Number.isFinite(precio) || precio < 0) {
    throw new ValidationError('El precio del producto es inválido');
  }

  if (!Number.isFinite(stock) || stock < 0) {
    throw new ValidationError('El stock del producto es inválido');
  }

  return {
    nombre,
    descripcion: descripcion || null,
    categoria: categoryId,
    precio: Number(precio.toFixed(2)),
    stock: Number(Math.floor(stock)),
  };
};

export const listProducts = async (gimnasioId, query = {}) => {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const activo = query.activo !== undefined ? Number(query.activo) : undefined;

  return prisma.producto.findMany({
    where: {
      ...gymScope(gimnasioId),
      ...(activo !== undefined ? { activo } : {}),
      ...(search ? { nombre: { contains: search } } : {}),
    },
    orderBy: { fechaCreacion: 'desc' },
  });
};

export const getProductById = async (gimnasioId, productId) => {
  const product = await prisma.producto.findUnique({ where: { id: Number(productId) } });

  if (!product) {
    throw new NotFoundError('Producto no encontrado');
  }

  assertGymOwnership(product.gimnasioId, gimnasioId, 'Producto');

  return product;
};

export const createProduct = async (gimnasioId, actorId, payload = {}) => {
  const { nombre, descripcion, categoria, precio, stock } = normalizeProductPayload(payload);

  return prisma.producto.create({
    data: {
      gimnasioId,
      nombre,
      descripcion,
      categoria,
      precio,
      stock,
      activo: 1,
      creadoPorId: actorId,
      actualizadoPorId: actorId,
    },
  });
};

export const updateProduct = async (gimnasioId, actorId, productId, payload = {}) => {
  const product = await getProductById(gimnasioId, productId);
  const nextData = {};

  if (payload.nombre !== undefined) {
    const nombre = String(payload.nombre).trim();
    if (!nombre) {
      throw new ValidationError('El nombre del producto es obligatorio');
    }
    nextData.nombre = nombre;
  }

  if (payload.categoria !== undefined || payload.category !== undefined) {
    const categoria = payload.categoria ?? payload.category;
    nextData.categoria = CATEGORY_MAP[String(categoria)] ?? 1;
  }

  if (payload.precio !== undefined) {
    const precio = Number(payload.precio);
    if (!Number.isFinite(precio) || precio < 0) {
      throw new ValidationError('El precio del producto es inválido');
    }
    nextData.precio = Number(precio.toFixed(2));
  }

  if (payload.stock !== undefined) {
    const stock = Number(payload.stock);
    if (!Number.isFinite(stock) || stock < 0) {
      throw new ValidationError('El stock del producto es inválido');
    }
    nextData.stock = Number(Math.floor(stock));
  }

  if (payload.descripcion !== undefined) {
    nextData.descripcion = String(payload.descripcion).trim() || null;
  }

  if (payload.activo !== undefined) {
    const activo = Number(payload.activo);
    if (activo !== 0 && activo !== 1) {
      throw new ValidationError('El estado activo del producto es inválido');
    }
    nextData.activo = activo;
  }

  if (Object.keys(nextData).length === 0) {
    return product;
  }

  return prisma.producto.update({
    where: { id: product.id },
    data: {
      ...nextData,
      actualizadoPorId: actorId,
    },
  });
};

export const toggleProductActive = async (gimnasioId, actorId, productId, activo) => {
  const product = await getProductById(gimnasioId, productId);
  const safeActivo = Number(activo);

  if (safeActivo !== 0 && safeActivo !== 1) {
    throw new ValidationError('El estado activo del producto es inválido');
  }

  return prisma.producto.update({
    where: { id: product.id },
    data: {
      activo: safeActivo,
      actualizadoPorId: actorId,
      fechaEliminacion: safeActivo === 0 ? new Date() : null,
    },
  });
};

export const deleteProduct = async (gimnasioId, actorId, productId) => {
  const product = await getProductById(gimnasioId, productId);

  return prisma.producto.update({
    where: { id: product.id },
    data: {
      activo: 0,
      fechaEliminacion: new Date(),
      actualizadoPorId: actorId,
    },
  });
};
