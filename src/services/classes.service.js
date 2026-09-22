import prisma from '../lib/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError.js';

const classInclude = {
  profesor: { include: { usuario: true } },
  inscripciones: { include: { cliente: { include: { usuario: true } }, estadoInscripcion: true } },
  puntuaciones: true,
};

const getProfessor = async (userId) => {
  const professor = await prisma.profesor.findUnique({ where: { usuarioId: userId } });
  if (!professor) throw new NotFoundError('Perfil de profesor no encontrado');
  return professor;
};
const getClient = async (userId) => {
  const client = await prisma.cliente.findUnique({ where: { usuarioId: userId } });
  if (!client) throw new NotFoundError('Perfil de cliente no encontrado');
  return client;
};
const getEnrollmentState = async (name) => {
  const state = await prisma.estadoInscripcion.findUnique({ where: { nombre: name } });
  if (!state) throw new ValidationError(`No existe el estado de inscripción ${name}`);
  return state;
};

export const listClasses = async (userId, role) => {
  const where = role === 'PROFESOR' ? { profesor: { usuarioId: userId } } : {};
  return prisma.clase.findMany({ where, include: classInclude, orderBy: { fechaHora: 'asc' } });
};

export const createClass = async (userId, payload = {}) => {
  const professor = await getProfessor(userId);
  const nombre = String(payload.nombre ?? '').trim();
  const cupoMaximo = Number(payload.cupoMaximo);
  const fechaHora = new Date(payload.fechaHora);
  if (!nombre || !Number.isInteger(cupoMaximo) || cupoMaximo < 1 || Number.isNaN(fechaHora.getTime())) throw new ValidationError('Datos de clase inválidos');
  return prisma.clase.create({ data: { profesorId: professor.id, nombre, sala: payload.sala ? String(payload.sala).trim() : null, cupoMaximo, recurrente: Boolean(payload.recurrente), fechaHora }, include: classInclude });
};

export const enroll = async (userId, classId) => {
  const client = await getClient(userId);
  const classRecord = await prisma.clase.findUnique({ where: { id: Number(classId) }, include: { inscripciones: true } });
  if (!classRecord) throw new NotFoundError('Clase no encontrada');
  if (classRecord.fechaHora <= new Date()) throw new ConflictError('La clase ya comenzó o finalizó');
  if (classRecord.inscripciones.length >= classRecord.cupoMaximo) throw new ConflictError('La clase no tiene cupos disponibles');
  if (classRecord.inscripciones.some((item) => item.clienteId === client.id)) throw new ConflictError('El cliente ya está inscripto en esta clase');
  const state = await getEnrollmentState('INSCRIPTO');
  return prisma.inscripcionClase.create({ data: { claseId: classRecord.id, clienteId: client.id, estadoInscripcionId: state.id }, include: { clase: true, estadoInscripcion: true } });
};

export const rateClass = async (userId, classId, puntuacion, comentario) => {
  const client = await getClient(userId);
  const value = Number(puntuacion);
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new ValidationError('La puntuación debe estar entre 1 y 5');
  const classRecord = await prisma.clase.findUnique({ where: { id: Number(classId) } });
  if (!classRecord) throw new NotFoundError('Clase no encontrada');
  if (classRecord.fechaHora > new Date()) throw new ConflictError('La clase todavía no finalizó');
  const enrollment = await prisma.inscripcionClase.findUnique({ where: { claseId_clienteId: { claseId: classRecord.id, clienteId: client.id } } });
  if (!enrollment) throw new ForbiddenError('El cliente no estuvo inscripto en esta clase');
  if (await prisma.puntuacionClase.findUnique({ where: { claseId_clienteId: { claseId: classRecord.id, clienteId: client.id } } })) throw new ConflictError('La clase ya fue puntuada');
  return prisma.puntuacionClase.create({ data: { claseId: classRecord.id, clienteId: client.id, puntuacion: value, comentario: comentario ? String(comentario).trim() : null } });
};
