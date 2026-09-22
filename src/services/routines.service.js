import prisma from '../lib/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js';

const routineInclude = {
  cliente: { include: { usuario: true } },
  profesor: { include: { usuario: true } },
  dias: true,
  ejercicios: { include: { ejercicio: true }, orderBy: { ordenVisual: 'asc' } },
};

const getProfessor = async (userId) => {
  const professor = await prisma.profesor.findUnique({ where: { usuarioId: userId } });
  if (!professor) throw new NotFoundError('Perfil de profesor no encontrado');
  return professor;
};

const normalizeDays = (days) => {
  if (!Array.isArray(days) || days.length === 0) throw new ValidationError('La rutina debe tener al menos un día');
  const unique = [...new Set(days.map(Number))];
  if (unique.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) throw new ValidationError('Día de rutina inválido');
  return unique;
};

export const listRoutinesForProfessor = async (userId, query = {}) => {
  const professor = await getProfessor(userId);
  return prisma.rutina.findMany({
    where: { profesorId: professor.id, ...(query.clienteId ? { clienteId: Number(query.clienteId) } : {}) },
    include: routineInclude,
    orderBy: { fechaAsignacion: 'desc' },
  });
};

export const listRoutinesForClient = async (userId, query = {}) => {
  const client = await prisma.cliente.findUnique({ where: { usuarioId: userId } });
  if (!client) throw new NotFoundError('Perfil de cliente no encontrado');
  if (query.history === 'previous-month') {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return prisma.rutina.findMany({ where: { clienteId: client.id, fechaAsignacion: { gte: start, lt: end } }, include: routineInclude, orderBy: { fechaAsignacion: 'desc' } });
  }
  return prisma.rutina.findMany({ where: { clienteId: client.id, activa: true }, include: routineInclude, orderBy: { fechaAsignacion: 'desc' } });
};

export const createRoutine = async (userId, payload = {}) => {
  const professor = await getProfessor(userId);
  const clientId = Number(payload.clienteId);
  const days = normalizeDays(payload.diasSemana);
  const exercises = Array.isArray(payload.ejercicios) ? payload.ejercicios : [];
  if (!clientId || !String(payload.nombre ?? '').trim()) throw new ValidationError('Cliente y nombre son obligatorios');
  if (!await prisma.cliente.findUnique({ where: { id: clientId } })) throw new NotFoundError('Cliente no encontrado');

  const activeRoutines = await prisma.rutina.findMany({ where: { clienteId: clientId, activa: true }, include: { dias: true } });
  const occupied = new Set(activeRoutines.flatMap((routine) => routine.dias.map((day) => day.diaSemana)));
  if (days.some((day) => occupied.has(day))) throw new ConflictError('Uno de los días ya pertenece a otra rutina activa del cliente');

  for (const item of exercises) {
    if (!item.ejercicioId) throw new ValidationError('Ejercicio inválido');
    if (!await prisma.ejercicio.findUnique({ where: { id: Number(item.ejercicioId) } })) throw new NotFoundError('Ejercicio no encontrado');
  }

  return prisma.rutina.create({
    data: {
      clienteId: clientId,
      profesorId: professor.id,
      nombre: String(payload.nombre).trim(),
      descripcion: payload.descripcion ? String(payload.descripcion).trim() : null,
      objetivo: payload.objetivo ? String(payload.objetivo).trim() : null,
      frecuenciaSemanal: payload.frecuenciaSemanal ? Number(payload.frecuenciaSemanal) : null,
      duracionEstimada: payload.duracionEstimada ? Number(payload.duracionEstimada) : null,
      nivelDificultad: payload.nivelDificultad ? String(payload.nivelDificultad).trim() : null,
      dias: { create: days.map((diaSemana) => ({ diaSemana })) },
      ejercicios: { create: exercises.map((item, index) => ({ ejercicioId: Number(item.ejercicioId), series: item.series ? Number(item.series) : null, repeticiones: item.repeticiones ? Number(item.repeticiones) : null, descansoSegundos: item.descansoSegundos ? Number(item.descansoSegundos) : null, ordenVisual: index + 1, observaciones: item.observaciones ? String(item.observaciones).trim() : null })) },
    },
    include: routineInclude,
  });
};

export const listExercises = async () => prisma.ejercicio.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } });

export const createExercise = async (userId, payload = {}) => {
  const professor = await getProfessor(userId);
  const nombre = String(payload.nombre ?? '').trim();
  if (!nombre) throw new ValidationError('El nombre del ejercicio es obligatorio');
  return prisma.ejercicio.create({
    data: {
      nombre,
      grupoMuscular: payload.grupoMuscular ? String(payload.grupoMuscular).trim() : null,
      tipo: payload.tipo ? String(payload.tipo).trim() : null,
      descripcion: payload.descripcion ? String(payload.descripcion).trim() : null,
      videoUrl: payload.videoUrl ? String(payload.videoUrl).trim() : null,
      creadoPor: professor.id,
    },
  });
};
