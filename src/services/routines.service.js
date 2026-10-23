import prisma from '../lib/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js';
import { cleanText, optionalText } from '../utils/text.js';
import { getGymParts } from '../utils/timezone.js';

const DAY_NAMES = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo' };

const routineInclude = {
  cliente: { include: { usuario: true } },
  profesor: { include: { usuario: true } },
  dias: true,
  ejercicios: { include: { ejercicio: true }, orderBy: { ordenVisual: 'asc' } },
};

const detailInclude = {
  cliente: { include: { usuario: { select: { nombre: true, apellido: true } } } },
  dias: true,
  ejercicios: { include: { ejercicio: true }, orderBy: [{ ordenVisual: 'asc' }, { id: 'asc' }] },
};

// ---------------------------------------------------------------------------
// Helpers de validación
// ---------------------------------------------------------------------------

const toOptionalInt = (value, label, { min = 0, max = 100000 } = {}) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ValidationError(`${label} debe ser un número entero entre ${min} y ${max}`);
  }
  return number;
};

const normalizeDays = (days) => {
  if (!Array.isArray(days) || days.length === 0) throw new ValidationError('La rutina debe tener al menos un día');
  const unique = [...new Set(days.map(Number))];
  if (unique.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) throw new ValidationError('Día de rutina inválido');
  return unique.sort((a, b) => a - b);
};

const todayInGym = () => {
  const { year, month, day } = getGymParts(new Date());
  return new Date(Date.UTC(year, month - 1, day));
};

// Valida y limpia el cuerpo de crear/editar. No incluye el cliente (no se cambia al editar).
const parseRoutineBody = (payload = {}) => {
  const nombre = cleanText(payload.nombre);
  if (!nombre) throw new ValidationError('El nombre de la rutina es obligatorio');
  if (nombre.length > 150) throw new ValidationError('El nombre de la rutina no puede superar los 150 caracteres');

  const objetivo = optionalText(payload.objetivo);
  if (objetivo && objetivo.length > 150) throw new ValidationError('El objetivo no puede superar los 150 caracteres');

  const nivelDificultad = optionalText(payload.nivelDificultad);
  if (nivelDificultad && nivelDificultad.length > 50) throw new ValidationError('El nivel no puede superar los 50 caracteres');

  const dias = normalizeDays(payload.diasSemana);

  const rawExercises = Array.isArray(payload.ejercicios) ? payload.ejercicios : [];
  if (rawExercises.length === 0) throw new ValidationError('Agregá al menos un ejercicio a la rutina');

  const ejercicios = rawExercises.map((item, index) => {
    const ejercicioId = Number(item?.ejercicioId);
    if (!Number.isInteger(ejercicioId) || ejercicioId < 1) throw new ValidationError(`Ejercicio ${index + 1} inválido`);
    return {
      ejercicioId,
      series: toOptionalInt(item.series, 'Las series', { min: 1, max: 100 }),
      repeticiones: toOptionalInt(item.repeticiones, 'Las repeticiones', { min: 1, max: 1000 }),
      descansoSegundos: toOptionalInt(item.descansoSegundos, 'El descanso', { min: 0, max: 3600 }),
      ordenVisual: index + 1,
      observaciones: optionalText(item.observaciones),
    };
  });

  return {
    nombre,
    descripcion: optionalText(payload.descripcion),
    objetivo,
    nivelDificultad,
    frecuenciaSemanal: dias.length,
    duracionEstimada: toOptionalInt(payload.duracionEstimada, 'La duración estimada', { min: 1, max: 1440 }),
    activa: payload.activa === undefined ? true : Boolean(payload.activa),
    dias,
    ejercicios,
  };
};

const assertExercisesExist = async (db, ejercicios) => {
  const ids = [...new Set(ejercicios.map((item) => item.ejercicioId))];
  const found = await db.ejercicio.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (found.length !== ids.length) throw new NotFoundError('Alguno de los ejercicios no existe en el catálogo');
};

// Regla de negocio (el esquema no la expresa): un mismo día no puede estar en dos
// rutinas ACTIVAS distintas del mismo cliente.
const assertNoDayConflict = async (db, clienteId, dias, excludeRoutineId = null) => {
  const others = await db.rutina.findMany({
    where: { clienteId, activa: true, ...(excludeRoutineId ? { id: { not: excludeRoutineId } } : {}) },
    select: { nombre: true, dias: { select: { diaSemana: true } } },
  });

  const conflicts = dias
    .map((day) => ({ day, routine: others.find((other) => other.dias.some((item) => item.diaSemana === day)) }))
    .filter((item) => item.routine);

  if (conflicts.length) {
    const detail = conflicts.map(({ day, routine }) => `el ${DAY_NAMES[day]} ya está en la rutina activa «${routine.nombre}»`).join('; ');
    throw new ConflictError(`Conflicto de días: ${detail}. Quitá el día o desactivá esa rutina.`);
  }
};

// Serializa un registro de rutina para el panel del profesor.
const toDetail = (routine) => ({
  id: routine.id,
  clienteId: routine.clienteId,
  cliente: {
    id: routine.cliente.id,
    nombre: routine.cliente.usuario.nombre,
    apellido: routine.cliente.usuario.apellido,
  },
  nombre: routine.nombre,
  descripcion: routine.descripcion,
  objetivo: routine.objetivo,
  nivelDificultad: routine.nivelDificultad,
  frecuenciaSemanal: routine.frecuenciaSemanal,
  duracionEstimada: routine.duracionEstimada,
  activa: routine.activa,
  fechaAsignacion: routine.fechaAsignacion,
  diasSemana: routine.dias.map((item) => item.diaSemana).sort((a, b) => a - b),
  ejercicios: routine.ejercicios.map((item) => ({
    id: item.id,
    ejercicioId: item.ejercicioId,
    nombre: item.ejercicio.nombre,
    grupoMuscular: item.ejercicio.grupoMuscular,
    series: item.series,
    repeticiones: item.repeticiones,
    descansoSegundos: item.descansoSegundos,
    ordenVisual: item.ordenVisual,
    observaciones: item.observaciones,
  })),
});

const findOwnedRoutine = async (profesorId, routineId, db = prisma) => {
  const routine = await db.rutina.findFirst({
    where: { id: Number(routineId), profesorId },
    include: detailInclude,
  });
  if (!routine) throw new NotFoundError('Rutina no encontrada');
  return routine;
};

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Profesor
// ---------------------------------------------------------------------------

// Solo las rutinas creadas por este profesor, agrupadas por cliente.
export const listRoutinesForProfessor = async (profesorId) => {
  const routines = await prisma.rutina.findMany({
    where: { profesorId },
    select: {
      id: true,
      clienteId: true,
      nombre: true,
      objetivo: true,
      nivelDificultad: true,
      frecuenciaSemanal: true,
      duracionEstimada: true,
      activa: true,
      fechaAsignacion: true,
      dias: { select: { diaSemana: true } },
      _count: { select: { ejercicios: true } },
      cliente: {
        select: {
          id: true,
          estadoCliente: { select: { nombre: true } },
          usuario: { select: { nombre: true, apellido: true } },
        },
      },
    },
    orderBy: [{ activa: 'desc' }, { fechaAsignacion: 'desc' }, { id: 'desc' }],
  });

  const groups = new Map();
  for (const routine of routines) {
    if (!groups.has(routine.clienteId)) {
      groups.set(routine.clienteId, {
        cliente: {
          id: routine.cliente.id,
          nombre: routine.cliente.usuario.nombre,
          apellido: routine.cliente.usuario.apellido,
          estado: routine.cliente.estadoCliente.nombre,
        },
        rutinas: [],
      });
    }
    groups.get(routine.clienteId).rutinas.push({
      id: routine.id,
      nombre: routine.nombre,
      objetivo: routine.objetivo,
      nivelDificultad: routine.nivelDificultad,
      frecuenciaSemanal: routine.frecuenciaSemanal,
      duracionEstimada: routine.duracionEstimada,
      activa: routine.activa,
      fechaAsignacion: routine.fechaAsignacion,
      diasSemana: routine.dias.map((item) => item.diaSemana).sort((a, b) => a - b),
      cantidadEjercicios: routine._count.ejercicios,
    });
  }

  return [...groups.values()].sort((a, b) =>
    `${a.cliente.apellido} ${a.cliente.nombre}`.localeCompare(`${b.cliente.apellido} ${b.cliente.nombre}`, 'es')
  );
};

export const getRoutineForProfessor = async (profesorId, routineId) =>
  toDetail(await findOwnedRoutine(profesorId, routineId));

export const createRoutine = async (profesorId, payload = {}) => {
  const clienteId = Number(payload.clienteId);
  if (!Number.isInteger(clienteId) || clienteId < 1) throw new ValidationError('Elegí un alumno para la rutina');
  const data = parseRoutineBody(payload);

  const routineId = await prisma.$transaction(async (tx) => {
    const client = await tx.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
    if (!client) throw new NotFoundError('Cliente no encontrado');

    // Serializa altas/ediciones concurrentes de rutinas del mismo cliente.
    await tx.$queryRaw`SELECT id FROM cliente WHERE id = ${clienteId} FOR UPDATE`;

    await assertExercisesExist(tx, data.ejercicios);
    if (data.activa) await assertNoDayConflict(tx, clienteId, data.dias);

    const routine = await tx.rutina.create({
      data: {
        clienteId,
        profesorId,
        nombre: data.nombre,
        descripcion: data.descripcion,
        objetivo: data.objetivo,
        frecuenciaSemanal: data.frecuenciaSemanal,
        duracionEstimada: data.duracionEstimada,
        nivelDificultad: data.nivelDificultad,
        activa: data.activa,
        fechaAsignacion: todayInGym(),
        dias: { create: data.dias.map((diaSemana) => ({ diaSemana })) },
        ejercicios: { create: data.ejercicios },
      },
      select: { id: true },
    });

    return routine.id;
  });

  return getRoutineForProfessor(profesorId, routineId);
};

export const updateRoutine = async (profesorId, routineId, payload = {}) => {
  const data = parseRoutineBody(payload);

  await prisma.$transaction(async (tx) => {
    const current = await findOwnedRoutine(profesorId, routineId, tx);

    await tx.$queryRaw`SELECT id FROM cliente WHERE id = ${current.clienteId} FOR UPDATE`;

    await assertExercisesExist(tx, data.ejercicios);
    // Al validar el conflicto se excluye la propia rutina.
    if (data.activa) await assertNoDayConflict(tx, current.clienteId, data.dias, current.id);

    await tx.rutinaDia.deleteMany({ where: { rutinaId: current.id } });
    await tx.rutinaEjercicio.deleteMany({ where: { rutinaId: current.id } });

    await tx.rutina.update({
      where: { id: current.id },
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion,
        objetivo: data.objetivo,
        frecuenciaSemanal: data.frecuenciaSemanal,
        duracionEstimada: data.duracionEstimada,
        nivelDificultad: data.nivelDificultad,
        activa: data.activa,
        dias: { create: data.dias.map((diaSemana) => ({ diaSemana })) },
        ejercicios: { create: data.ejercicios },
      },
    });
  });

  return getRoutineForProfessor(profesorId, routineId);
};
