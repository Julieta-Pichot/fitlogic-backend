import prisma from '../lib/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError, ScheduleConflictError, ValidationError } from '../errors/AppError.js';
import { cleanText } from '../utils/text.js';
import { getGymParts } from '../utils/timezone.js';
import {
  findConflicts,
  minutesToTime,
  normalizeRoom,
  professorConflictMessage,
  roomConflictMessage,
} from '../utils/class-conflicts.js';

// Estados que ocupan un lugar en la clase (CANCELADO no cuenta).
const COUNTED_STATES = ['INSCRIPTO', 'ASISTIO'];

const classInclude = {
  profesor: { include: { usuario: true } },
  dias: true,
  inscripciones: { include: { cliente: { include: { usuario: true } }, estadoInscripcion: true } },
  puntuaciones: true,
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

// ---------------------------------------------------------------------------
// Profesor
// ---------------------------------------------------------------------------

const professorClassSelect = {
  id: true,
  nombre: true,
  sala: true,
  cupoMaximo: true,
  recurrente: true,
  fechaHora: true,
  duracionMinutos: true,
  dias: { select: { diaSemana: true } },
  _count: {
    select: {
      inscripciones: { where: { estadoInscripcion: { nombre: { in: COUNTED_STATES } } } },
    },
  },
};

// El porcentaje de ocupación lo calcula el backend: inscriptos / cupo, con tope en 100 %.
export const toProfessorClass = (clase) => {
  const inscriptos = clase._count.inscripciones;
  const porcentajeOcupacion =
    clase.cupoMaximo > 0 ? Math.min(100, Math.round((inscriptos / clase.cupoMaximo) * 100)) : 0;
  const { hour, minute } = getGymParts(clase.fechaHora);

  return {
    id: clase.id,
    nombre: clase.nombre,
    sala: clase.sala,
    cupoMaximo: clase.cupoMaximo,
    recurrente: clase.recurrente,
    fechaHora: clase.fechaHora,
    duracionMinutos: clase.duracionMinutos,
    horaFin: minutesToTime(hour * 60 + minute + clase.duracionMinutos),
    diasSemana: clase.dias.map((item) => item.diaSemana).sort((a, b) => a - b),
    inscriptos,
    porcentajeOcupacion,
  };
};

export const professorClassSelectForProfile = professorClassSelect;

const findOwnedClass = async (profesorId, classId, db = prisma) => {
  const clase = await db.clase.findFirst({
    where: { id: Number(classId), profesorId },
    select: professorClassSelect,
  });
  if (!clase) throw new NotFoundError('Clase no encontrada');
  return clase;
};

const HORA_FIN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Datos que definen DÓNDE y CUÁNDO ocurre una clase (los que se validan contra otras clases).
// Sala obligatoria: sin sala no hay forma de saber si dos clases chocan.
export const parseScheduleBody = (payload = {}, defaultDuration = 60) => {
  const sala = cleanText(payload.sala);
  if (!sala) throw new ValidationError('La sala es obligatoria');
  if (sala.length > 100) throw new ValidationError('La sala no puede superar los 100 caracteres');

  const fechaHora = new Date(payload.fechaHora);
  if (!payload.fechaHora || Number.isNaN(fechaHora.getTime())) {
    throw new ValidationError('La fecha y hora de la clase no son válidas');
  }
  const { hour, minute, diaSemana } = getGymParts(fechaHora);
  const start = hour * 60 + minute;

  // La hora de fin llega como HH:mm (hora del gimnasio); la duración se calcula acá.
  let duracionMinutos = defaultDuration;
  if (payload.horaFin !== undefined && payload.horaFin !== null && payload.horaFin !== '') {
    if (!HORA_FIN.test(String(payload.horaFin))) throw new ValidationError('La hora de fin no es válida (HH:mm)');
    const [endHour, endMinute] = String(payload.horaFin).split(':').map(Number);
    duracionMinutos = endHour * 60 + endMinute - start;
    if (duracionMinutos <= 0) {
      throw new ValidationError('La hora de fin debe ser posterior a la de inicio (la clase no puede cruzar la medianoche)');
    }
  }
  if (start + duracionMinutos > 24 * 60) {
    throw new ValidationError('La clase no puede cruzar la medianoche: terminá antes de las 24:00');
  }

  const recurrente = Boolean(payload.recurrente);
  let dias = [];
  if (recurrente) {
    const raw = Array.isArray(payload.diasSemana) ? payload.diasSemana.map(Number) : [];
    if (raw.length === 0) throw new ValidationError('Una clase recurrente necesita al menos un día de repetición');
    if (raw.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) throw new ValidationError('Día de repetición inválido');
    // El día de la primera clase también forma parte de la repetición.
    dias = [...new Set([...raw, diaSemana])].sort((a, b) => a - b);
  }

  return { sala, fechaHora, duracionMinutos, recurrente, dias };
};

const parseClassBody = (payload = {}, defaultDuration = 60) => {
  const nombre = cleanText(payload.nombre);
  if (!nombre) throw new ValidationError('El nombre de la clase es obligatorio');
  if (nombre.length > 100) throw new ValidationError('El nombre de la clase no puede superar los 100 caracteres');

  const cupoMaximo = Number(payload.cupoMaximo);
  if (!Number.isInteger(cupoMaximo) || cupoMaximo < 1 || cupoMaximo > 1000) {
    throw new ValidationError('El cupo máximo debe ser un número entero mayor a 0');
  }

  return { nombre, cupoMaximo, ...parseScheduleBody(payload, defaultDuration) };
};

// Busca choques de SALA (cualquier profesor) y de PROFESOR (la misma persona en otra sala)
// contra todas las clases del sistema, salvo la que se está editando.
export const findScheduleConflicts = async (db, profesorId, candidate, excludeClassId = null) => {
  const others = await db.clase.findMany({
    where: excludeClassId ? { id: { not: excludeClassId } } : {},
    select: {
      id: true, nombre: true, sala: true, recurrente: true, fechaHora: true, duracionMinutos: true, profesorId: true,
      dias: { select: { diaSemana: true } },
      profesor: { select: { usuario: { select: { nombre: true, apellido: true } } } },
    },
  });

  const rows = others.map((other) => ({
    ...other,
    profesorNombre: `${other.profesor.usuario.nombre} ${other.profesor.usuario.apellido}`.trim(),
  }));

  const room = normalizeRoom(candidate.sala);
  const roomConflicts = findConflicts(candidate, rows, (other) => normalizeRoom(other.sala) === room);
  const professorConflicts = findConflicts(
    candidate,
    rows,
    (other) => other.profesorId === profesorId && normalizeRoom(other.sala) !== room
  );

  return { roomConflicts, professorConflicts };
};

const assertNoScheduleConflict = async (db, profesorId, candidate, excludeClassId = null) => {
  const { roomConflicts, professorConflicts } = await findScheduleConflicts(db, profesorId, candidate, excludeClassId);

  if (roomConflicts.length) {
    throw new ScheduleConflictError('SALA_OCUPADA', roomConflictMessage(candidate.sala, roomConflicts), roomConflicts);
  }
  if (professorConflicts.length) {
    throw new ScheduleConflictError('PROFESOR_OCUPADO', professorConflictMessage(professorConflicts), professorConflicts);
  }
};

// Serializa TODAS las altas/ediciones de clases con un lock sobre la única fila de `gimnasio`.
// Un SELECT ... FOR UPDATE sobre las clases de la sala no alcanza: no bloquea INSERTs nuevos
// (fantasmas) y dos profesores podrían guardar a la vez en la misma sala. Con un mutex de fila
// la verificación y el INSERT/UPDATE son atómicos respecto de cualquier otra escritura de clases.
// Las escrituras de clases son poco frecuentes, así que el costo es despreciable.
const lockClassWrites = (tx) => tx.$queryRaw`SELECT id FROM gimnasio ORDER BY id LIMIT 1 FOR UPDATE`;

export const listClassesForProfessor = async (profesorId) => {
  const classes = await prisma.clase.findMany({
    where: { profesorId },
    select: professorClassSelect,
    orderBy: { fechaHora: 'asc' },
  });
  return classes.map(toProfessorClass);
};

// Chequeo previo para el front (no escribe nada). Mismo algoritmo que crear/editar.
export const checkAvailability = async (profesorId, payload = {}) => {
  let excludeId = null;
  let defaultDuration = 60;
  let current = null;
  if (payload.claseId) {
    current = await findOwnedClass(profesorId, payload.claseId);
    excludeId = current.id;
    defaultDuration = current.duracionMinutos;
  }

  const schedule = parseScheduleBody(payload, defaultDuration);

  // Mismo criterio que al guardar: si no cambia el horario de una clase ya existente, no se valida.
  if (current && isSameSchedule(current, schedule)) {
    return { disponible: true, error: null, message: null, conflictos: [] };
  }

  const { roomConflicts, professorConflicts } = await findScheduleConflicts(prisma, profesorId, schedule, excludeId);

  const message = roomConflicts.length
    ? roomConflictMessage(schedule.sala, roomConflicts)
    : professorConflicts.length
      ? professorConflictMessage(professorConflicts)
      : null;

  return {
    disponible: !message,
    error: roomConflicts.length ? 'SALA_OCUPADA' : professorConflicts.length ? 'PROFESOR_OCUPADO' : null,
    message,
    conflictos: [...roomConflicts, ...professorConflicts],
  };
};

// Si la clase ya chocaba con otra y un guardado NO cambia sala, horario, duración ni días (por
// ejemplo solo cambia el nombre o el cupo), no se bloquea: no empeora nada. Cualquier cambio en
// esos campos sí se valida contra el resto.
const isSameSchedule = (current, data) =>
  normalizeRoom(current.sala) === normalizeRoom(data.sala) &&
  current.fechaHora.getTime() === data.fechaHora.getTime() &&
  current.duracionMinutos === data.duracionMinutos &&
  current.recurrente === data.recurrente &&
  current.dias.map((item) => item.diaSemana).sort((a, b) => a - b).join() === data.dias.join();

export const createClass = async (profesorId, payload = {}) => {
  const data = parseClassBody(payload);

  const created = await prisma.$transaction(async (tx) => {
    await lockClassWrites(tx);
    await assertNoScheduleConflict(tx, profesorId, data);

    return tx.clase.create({
      data: {
        profesorId,
        nombre: data.nombre,
        sala: data.sala,
        cupoMaximo: data.cupoMaximo,
        recurrente: data.recurrente,
        fechaHora: data.fechaHora,
        duracionMinutos: data.duracionMinutos,
        dias: { create: data.dias.map((diaSemana) => ({ diaSemana })) },
      },
      select: professorClassSelect,
    });
  });

  return toProfessorClass(created);
};

export const updateClass = async (profesorId, classId, payload = {}) => {
  // Si no viene hora de fin se conserva la duración actual.
  const existing = await findOwnedClass(profesorId, classId);
  const data = parseClassBody(payload, existing.duracionMinutos);

  const updated = await prisma.$transaction(async (tx) => {
    await lockClassWrites(tx);
    const current = await findOwnedClass(profesorId, classId, tx);

    if (data.cupoMaximo < current._count.inscripciones) {
      throw new ConflictError(
        `El cupo no puede ser menor a los ${current._count.inscripciones} alumnos inscriptos actualmente`
      );
    }

    if (!isSameSchedule(current, data)) await assertNoScheduleConflict(tx, profesorId, data, current.id);

    await tx.claseDia.deleteMany({ where: { claseId: current.id } });
    await tx.clase.update({
      where: { id: current.id },
      data: {
        nombre: data.nombre,
        sala: data.sala,
        cupoMaximo: data.cupoMaximo,
        recurrente: data.recurrente,
        fechaHora: data.fechaHora,
        duracionMinutos: data.duracionMinutos,
        dias: { create: data.dias.map((diaSemana) => ({ diaSemana })) },
      },
    });

    // Los avisos pendientes de ocurrencias futuras pudieron quedar desfasados con el
    // nuevo horario: se borran y el scheduler los regenera si siguen correspondiendo.
    await tx.notificacion.deleteMany({
      where: { claseId: current.id, leida: false, fechaOcurrencia: { gte: new Date() } },
    });

    return findOwnedClass(profesorId, current.id, tx);
  });

  return toProfessorClass(updated);
};

export const deleteClass = async (profesorId, classId) =>
  prisma.$transaction(async (tx) => {
    const current = await findOwnedClass(profesorId, classId, tx);

    // Las FK no tienen ON DELETE CASCADE: se borran las dependencias a mano.
    // Notificaciones: las pendientes se eliminan; las ya leídas se conservan sin la referencia.
    await tx.notificacion.deleteMany({ where: { claseId: current.id, leida: false } });
    await tx.notificacion.updateMany({ where: { claseId: current.id }, data: { claseId: null } });
    await tx.puntuacionClase.deleteMany({ where: { claseId: current.id } });
    await tx.inscripcionClase.deleteMany({ where: { claseId: current.id } });
    await tx.claseDia.deleteMany({ where: { claseId: current.id } });
    await tx.clase.delete({ where: { id: current.id } });

    return { id: current.id, inscriptosEliminados: current._count.inscripciones };
  });
