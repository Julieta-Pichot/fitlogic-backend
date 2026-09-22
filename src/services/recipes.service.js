import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

const include = { categoriaReceta: true, ingredientes: true, pasos: { orderBy: { numeroPaso: 'asc' } }, profesor: { include: { usuario: true } } };
const getProfessor = async (userId) => {
  const professor = await prisma.profesor.findUnique({ where: { usuarioId: userId } });
  if (!professor) throw new NotFoundError('Perfil de profesor no encontrado');
  return professor;
};
export const listRecipes = async (userId, role) => prisma.receta.findMany({ where: role === 'PROFESOR' ? { profesor: { usuarioId: userId } } : {}, include, orderBy: { id: 'desc' } });
export const createRecipe = async (userId, payload = {}) => {
  const professor = await getProfessor(userId);
  const nombre = String(payload.nombre ?? '').trim();
  if (!nombre || !payload.categoriaRecetaId) throw new ValidationError('Nombre y categoría son obligatorios');
  const category = await prisma.categoriaReceta.findUnique({ where: { id: Number(payload.categoriaRecetaId) } });
  if (!category) throw new NotFoundError('Categoría de receta no encontrada');
  const ingredients = Array.isArray(payload.ingredientes) ? payload.ingredientes.filter((item) => String(item.nombre ?? '').trim()) : [];
  const steps = Array.isArray(payload.pasos) ? payload.pasos.filter((item) => String(item.descripcion ?? '').trim()) : [];
  return prisma.receta.create({ data: { profesorId: professor.id, categoriaRecetaId: category.id, nombre, descripcion: payload.descripcion ? String(payload.descripcion).trim() : null, calorias: payload.calorias ? Number(payload.calorias) : null, tiempoPreparacion: payload.tiempoPreparacion ? Number(payload.tiempoPreparacion) : null, ingredientes: { create: ingredients.map((item) => ({ nombre: String(item.nombre).trim(), cantidad: item.cantidad ? String(item.cantidad).trim() : null, unidad: item.unidad ? String(item.unidad).trim() : null })) }, pasos: { create: steps.map((item, index) => ({ numeroPaso: index + 1, descripcion: String(item.descripcion).trim() })) } }, include });
};
