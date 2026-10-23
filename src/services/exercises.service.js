import prisma from '../lib/prisma.js';
import { ValidationError } from '../errors/AppError.js';
import { cleanText, normalizeExerciseName, optionalText } from '../utils/text.js';

const exerciseSelect = { id: true, nombre: true, grupoMuscular: true, tipo: true };

// Catálogo global: lo ven todos los profesores (no se filtra por creado_por).
export const listExercises = () =>
  prisma.ejercicio.findMany({
    where: { activo: true },
    select: exerciseSelect,
    orderBy: { nombre: 'asc' },
  });

// Crea un ejercicio nuevo o reutiliza uno existente con el mismo nombre
// (sin distinguir mayúsculas, acentos ni espacios extra).
export const createOrReuseExercise = async (profesorId, payload = {}) => {
  const nombre = cleanText(payload.nombre);
  if (!nombre) throw new ValidationError('El nombre del ejercicio es obligatorio');
  if (nombre.length > 150) throw new ValidationError('El nombre del ejercicio no puede superar los 150 caracteres');

  const key = normalizeExerciseName(nombre);
  const actives = await prisma.ejercicio.findMany({
    where: { activo: true },
    select: exerciseSelect,
  });
  const existing = actives.find((item) => normalizeExerciseName(item.nombre) === key);
  if (existing) return { ejercicio: existing, existente: true };

  const ejercicio = await prisma.ejercicio.create({
    data: {
      nombre,
      grupoMuscular: optionalText(payload.grupoMuscular),
      tipo: optionalText(payload.tipo),
      descripcion: optionalText(payload.descripcion),
      videoUrl: optionalText(payload.videoUrl),
      creadoPor: profesorId,
    },
    select: exerciseSelect,
  });

  return { ejercicio, existente: false };
};
