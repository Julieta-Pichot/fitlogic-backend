import prisma from '../lib/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError.js';
import { getClassOccurrences } from '../utils/class-schedule.js';
import { dayNameLower, findConflicts, minutesToTime } from '../utils/class-conflicts.js';
import { getGymParts, gymDateKey, gymWallTimeToDate, shiftCalendarDay } from '../utils/timezone.js';

// Estados que ocupan un lugar en la clase (CANCELADO no cuenta).
const COUNTED_STATES = ['INSCRIPTO', 'ASISTIO'];
const MINUTE_MS = 60_000;

const classSelect = (clienteId) => ({
  id: true,
  nombre: true,
  sala: true,
  cupoMaximo: true,
  recurrente: true,
  fechaHora: true,
  duracionMinutos: true,
  dias: { select: { diaSemana: true } },
  profesor: { select: { usuario: { select: { nombre: true, apellido: true } } } },
  _count: { select: { inscripciones: { where: { estadoInscripcion: { nombre: { in: COUNTED_STATES } } } } } },
  inscripciones: { where: { clienteId }, select: { estadoInscripcion: { select: { nombre: true } } } },
});

const professorName = (clase) => `${clase.profesor.usuario.nombre} ${clase.profesor.usuario.apellido}`.trim();
const endOf = (start, clase) => new Date(start.getTime() + clase.duracionMinutos * MINUTE_MS);
const timeOf = (date) => {
  const { hour, minute } = getGymParts(date);
  return minutesToTime(hour * 60 + minute);
};
const myState = (clase) => clase.inscripciones[0]?.estadoInscripcion.nombre ?? null;
const isEnrolled = (clase) => myState(clase) === 'INSCRIPTO';

// Los 7 días que muestran las pestañas: de hoy a hoy+6, calculados en hora del gimnasio.
export const getWeekDays = (now = new Date()) => {
  const today = getGymParts(now);
  return Array.from({ length: 7 }, (_, offset) => {
    const day = shiftCalendarDay(today, offset);
    return {
      fecha: `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`,
      diaSemana: day.diaSemana,
      esHoy: offset === 0,
    };
  });
};

const dateRange = (fecha) => {
  const [year, month, day] = fecha.split('-').map(Number);
  const next = shiftCalendarDay({ year, month, day }, 1);
  return { from: gymWallTimeToDate(year, month, day, 0, 0), to: new Date(gymWallTimeToDate(next.year, next.month, next.day, 0, 0).getTime() - 1) };
};

const toListItem = (clase, start, now) => {
  const started = start <= now;
  const end = endOf(start, clase);
  const inscriptos = clase._count.inscripciones;
  const enrolled = isEnrolled(clase);
  const full = inscriptos >= clase.cupoMaximo;
  const estado = enrolled ? 'INSCRIPTO' : started ? 'YA_COMENZO' : full ? 'COMPLETA' : 'DISPONIBLE';

  return {
    id: clase.id,
    nombre: clase.nombre,
    profesor: professorName(clase),
    sala: clase.sala,
    recurrente: clase.recurrente,
    inicio: start,
    horaInicio: timeOf(start),
    horaFin: timeOf(end),
    cupoMaximo: clase.cupoMaximo,
    inscriptos,
    estado,
    puedeInscribirse: estado === 'DISPONIBLE',
    puedeDarseDeBaja: enrolled && !(started && now < end),
  };
};

// Clases de un día (por defecto hoy). Recurrentes que tengan ese día + únicas de esa fecha.
export const listClassesByDay = async (cliente, fecha, now = new Date()) => {
  const days = getWeekDays(now);
  const selected = fecha ?? days[0].fecha;
  if (!days.some((day) => day.fecha === selected)) {
    throw new ValidationError('Elegí un día entre hoy y los próximos 6 días', null, 'FECHA_INVALIDA');
  }

  const { from, to } = dateRange(selected);
  const classes = await prisma.clase.findMany({ select: classSelect(cliente.id) });

  const items = [];
  for (const clase of classes) {
    for (const start of getClassOccurrences(clase, from, to)) items.push(toListItem(clase, start, now));
  }
  items.sort((a, b) => a.inicio - b.inicio || a.nombre.localeCompare(b.nombre, 'es'));

  return { hoy: days[0].fecha, dias: days, fecha: selected, clases: items };
};

const nextOccurrence = (clase, now) => {
  const occurrences = getClassOccurrences(clase, now, new Date(now.getTime() + 8 * 86_400_000)).filter((start) => start > now);
  return occurrences.sort((a, b) => a - b)[0] ?? null;
};

const toMineItem = (clase, now) => {
  const next = nextOccurrence(clase, now);
  const start = next ?? clase.fechaHora;
  const days = clase.recurrente ? [...new Set([getGymParts(clase.fechaHora).diaSemana, ...clase.dias.map((item) => item.diaSemana)])].sort((a, b) => a - b) : [getGymParts(clase.fechaHora).diaSemana];
  const end = endOf(start, clase);
  const todayStart = getClassOccurrences(clase, new Date(now.getTime() - 24 * 3_600_000), now).find((s) => s <= now && now < endOf(s, clase) && gymDateKey(s) === gymDateKey(now));

  return {
    id: clase.id,
    nombre: clase.nombre,
    profesor: professorName(clase),
    sala: clase.sala,
    recurrente: clase.recurrente,
    dias: days,
    fecha: clase.recurrente ? null : gymDateKey(clase.fechaHora),
    horaInicio: timeOf(clase.fechaHora),
    horaFin: timeOf(endOf(clase.fechaHora, clase)),
    proximaOcurrencia: next,
    minutosRestantes: next ? Math.max(0, Math.round((next.getTime() - now.getTime()) / MINUTE_MS)) : null,
    finalizada: !clase.recurrente && end <= now,
    puedeDarseDeBaja: !todayStart,
  };
};

export const listMyClasses = async (cliente, now = new Date()) => {
  const classes = await prisma.clase.findMany({
    where: { inscripciones: { some: { clienteId: cliente.id, estadoInscripcion: { nombre: 'INSCRIPTO' } } } },
    select: classSelect(cliente.id),
  });
  // Las clases únicas ya terminadas no se muestran como activas.
  return classes
    .map((clase) => toMineItem(clase, now))
    .filter((item) => !item.finalizada)
    .sort((a, b) => (a.proximaOcurrencia?.getTime() ?? Infinity) - (b.proximaOcurrencia?.getTime() ?? Infinity));
};

// La clase INSCRIPTO más próxima (próxima ocurrencia futura).
export const getNextClass = async (cliente, now = new Date()) => {
  const mine = await listMyClasses(cliente, now);
  const next = mine.find((item) => item.proximaOcurrencia);
  return next ?? null;
};

const getNotificationType = async (tx, name) =>
  (await tx.tipoNotificacion.findUnique({ where: { nombre: name } })) ?? tx.tipoNotificacion.create({ data: { nombre: name } });

const scheduleLabel = (clase) => {
  const days = clase.recurrente ? [...new Set([getGymParts(clase.fechaHora).diaSemana, ...clase.dias.map((item) => item.diaSemana)])].sort((a, b) => a - b) : [getGymParts(clase.fechaHora).diaSemana];
  const when = clase.recurrente ? `los ${days.map(dayNameLower).join(', ')}` : `el ${gymDateKey(clase.fechaHora).split('-').reverse().join('/')} (${dayNameLower(days[0])})`;
  return `${when} a las ${timeOf(clase.fechaHora)}`;
};

// Inscripción en transacción: se bloquean el cliente y la clase (SELECT ... FOR UPDATE, siempre en ese
// orden para evitar deadlocks) para que dos inscripciones simultáneas no superen el cupo ni se solapen.
export const enrollInClass = async (cliente, classId, { fecha } = {}, now = new Date()) => {
  const id = Number(classId);

  if (cliente.estadoCliente.nombre === 'INHABILITADO_PAGO') {
    throw new ForbiddenError('Tu membresía está vencida o impaga. Renová tu membresía para inscribirte a clases.', 'MEMBRESIA_REQUERIDA');
  }
  if (cliente.estadoCliente.nombre !== 'HABILITADO') {
    throw new ForbiddenError('Tu cuenta no está habilitada para inscribirse a clases.', 'CUENTA_NO_HABILITADA');
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM cliente WHERE id = ${cliente.id} FOR UPDATE`;
    const locked = await tx.$queryRaw`SELECT id FROM clase WHERE id = ${id} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError('Clase no encontrada');

    const clase = await tx.clase.findUnique({ where: { id }, select: classSelect(cliente.id) });

    // Clase única que ya empezó/terminó, o la ocurrencia de la fecha pedida que ya empezó.
    if (!clase.recurrente && clase.fechaHora <= now) {
      throw new ConflictError('La clase ya comenzó o finalizó', 'CLASE_FINALIZADA');
    }
    if (fecha && clase.recurrente) {
      const { from, to } = dateRange(fecha);
      const occurrence = getClassOccurrences(clase, from, to)[0];
      if (occurrence && occurrence <= now) throw new ConflictError('La clase de hoy ya comenzó', 'CLASE_FINALIZADA');
    }

    const state = myState(clase);
    if (state === 'INSCRIPTO' || state === 'ASISTIO') throw new ConflictError('Ya estás inscripto en esta clase', 'YA_INSCRIPTO');

    if (clase._count.inscripciones >= clase.cupoMaximo) {
      throw new ConflictError('La clase está completa: no quedan cupos disponibles', 'CLASE_COMPLETA');
    }

    // Choque de horario con otras clases en las que el cliente ya está INSCRIPTO.
    const mine = await tx.clase.findMany({
      where: { id: { not: id }, inscripciones: { some: { clienteId: cliente.id, estadoInscripcion: { nombre: 'INSCRIPTO' } } } },
      select: { id: true, nombre: true, sala: true, recurrente: true, fechaHora: true, duracionMinutos: true, profesorId: true, dias: { select: { diaSemana: true } } },
    });
    const [clash] = findConflicts(clase, mine, () => true);
    if (clash) {
      const when = clash.fecha ? `el ${clash.fecha}` : `el ${clash.dias.map(dayNameLower).join(', ')}`;
      throw new ConflictError(
        `Ya estás inscripto en '${clash.nombre}' ${when} de ${clash.horaInicio} a ${clash.horaFin}, que coincide con esta clase.`,
        'CONFLICTO_HORARIO'
      );
    }

    const inscripto = await tx.estadoInscripcion.findUnique({ where: { nombre: 'INSCRIPTO' } });
    if (!inscripto) throw new ValidationError('No existe el estado de inscripción INSCRIPTO');

    // UNIQUE(clase_id, cliente_id): si ya hubo una inscripción CANCELADA se reactiva, no se inserta otra.
    if (state === 'CANCELADO') {
      await tx.inscripcionClase.updateMany({
        where: { claseId: id, clienteId: cliente.id },
        data: { estadoInscripcionId: inscripto.id, fechaInscripcion: new Date() },
      });
    } else {
      await tx.inscripcionClase.create({ data: { claseId: id, clienteId: cliente.id, estadoInscripcionId: inscripto.id } });
    }

    const type = await getNotificationType(tx, 'INSCRIPCION_CLASE');
    await tx.notificacion.create({
      data: {
        usuarioId: cliente.usuarioId,
        tipoNotificacionId: type.id,
        titulo: 'Inscripción confirmada',
        mensaje: `Tu inscripción a «${clase.nombre}» quedó confirmada: ${scheduleLabel(clase)}${clase.sala ? ` · ${clase.sala}` : ''}.`,
        fechaEnvio: now,
      },
    });

    return { claseId: id, estado: 'INSCRIPTO' };
  });
};

// Baja: la inscripción pasa a CANCELADO (no se borra la fila) y se libera el cupo.
export const cancelEnrollment = async (cliente, classId, now = new Date()) => {
  const id = Number(classId);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM cliente WHERE id = ${cliente.id} FOR UPDATE`;
    const clase = await tx.clase.findUnique({ where: { id }, select: classSelect(cliente.id) });
    if (!clase || myState(clase) === null) throw new NotFoundError('No estás inscripto en esta clase');
    if (!isEnrolled(clase)) throw new ConflictError('Tu inscripción a esta clase ya no está activa', 'INSCRIPCION_NO_ACTIVA');

    const day = getClassOccurrences(clase, new Date(now.getTime() - 24 * 3_600_000), now).find(
      (start) => gymDateKey(start) === gymDateKey(now) && start <= now && now < endOf(start, clase)
    );
    if (day) throw new ConflictError('La clase ya comenzó: no podés darte de baja ahora', 'CLASE_EN_CURSO');

    const cancelled = await tx.estadoInscripcion.findUnique({ where: { nombre: 'CANCELADO' } });
    if (!cancelled) throw new ValidationError('No existe el estado de inscripción CANCELADO');
    await tx.inscripcionClase.updateMany({
      where: { claseId: id, clienteId: cliente.id },
      data: { estadoInscripcionId: cancelled.id },
    });

    return { claseId: id, estado: 'CANCELADO' };
  });
};
