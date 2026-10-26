import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma.js';
import { NotFoundError } from '../errors/AppError.js';
import { UPLOADS_PATH } from '../middlewares/upload.middleware.js';
import { buildPaginatedResponse, parsePaginationParams } from '../utils/pagination.js';
import { computeMembership } from '../utils/membership.js';
import { dbDateMs, diffDays, getGymParts, gymDateKey, gymTodayMs, gymWallTimeToDate, msToIsoDate, shiftCalendarDay } from '../utils/timezone.js';
import { getNextClass } from './cliente-classes.service.js';
import { listTodayRoutines } from './cliente-content.service.js';

const APTO_WARNING_DAYS = 10;

export const getMembership = async (cliente, now = new Date()) => {
  const cuotas = await prisma.cuota.findMany({
    where: { clienteId: cliente.id },
    include: { plan: true, estadoCuota: true, pago: true },
    orderBy: { fechaVencimiento: 'desc' },
  });
  return computeMembership(cuotas, now);
};

// Semana en curso (lunes a domingo, hora del gimnasio). Cada día con al menos una asistencia cuenta
// una sola vez: se agrupa por fecha local del gimnasio, no por UTC. Al empezar otra semana se
// reinicia sola porque siempre se calcula sobre la semana actual.
export const getStreak = async (cliente, now = new Date()) => {
  const today = getGymParts(now);
  const monday = shiftCalendarDay(today, -(today.diaSemana - 1));
  const nextMonday = shiftCalendarDay(monday, 7);
  const from = gymWallTimeToDate(monday.year, monday.month, monday.day, 0, 0);
  const to = gymWallTimeToDate(nextMonday.year, nextMonday.month, nextMonday.day, 0, 0);

  const attendances = await prisma.asistencia.findMany({
    where: { clienteId: cliente.id, fechaHora: { gte: from, lt: to } },
    select: { fechaHora: true },
  });
  const attendedDays = new Set(attendances.map((item) => gymDateKey(item.fechaHora)));
  const todayKey = gymDateKey(now);

  const dias = Array.from({ length: 7 }, (_, index) => {
    const day = shiftCalendarDay(monday, index);
    const fecha = `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
    return {
      diaSemana: index + 1,
      fecha,
      asistio: attendedDays.has(fecha),
      esHoy: fecha === todayKey,
      futuro: fecha > todayKey,
    };
  });

  return {
    dias,
    diasAsistidos: dias.filter((day) => day.asistio).length,
    // NULL = el cliente todavía no tiene objetivo definido (la racha igual muestra los días asistidos).
    objetivoDias: cliente.objetivoDiasRacha ?? null,
  };
};

export const getHome = async (cliente, now = new Date()) => {
  const [racha, membresia, rutinasHoy, proximaClase] = await Promise.all([
    getStreak(cliente, now),
    getMembership(cliente, now),
    listTodayRoutines(cliente, now),
    getNextClass(cliente, now),
  ]);

  return { cliente: { estado: cliente.estadoCliente.nombre }, racha, membresia, rutinasHoy, proximaClase };
};

// Estado del apto físico calculado con las fechas (sin cargar / vigente / por vencer / vencido).
export const getMedicalClearance = (cliente, now = new Date()) => {
  const todayMs = gymTodayMs(now);
  if (!cliente.aptoFisicoFechaVencimiento) {
    return { estado: 'SIN_CARGAR', fechaCarga: null, fechaVencimiento: null, diasRestantes: null, tieneArchivo: Boolean(cliente.aptoFisicoArchivo) };
  }

  const expires = dbDateMs(cliente.aptoFisicoFechaVencimiento);
  const days = diffDays(todayMs, expires);
  return {
    estado: days < 0 ? 'VENCIDO' : days <= APTO_WARNING_DAYS ? 'POR_VENCER' : 'VIGENTE',
    fechaCarga: cliente.aptoFisicoFechaCarga ? msToIsoDate(dbDateMs(cliente.aptoFisicoFechaCarga)) : null,
    fechaVencimiento: msToIsoDate(expires),
    diasRestantes: days,
    tieneArchivo: Boolean(cliente.aptoFisicoArchivo),
  };
};

export const getProfile = async (cliente, now = new Date()) => {
  const user = await prisma.usuario.findUnique({
    where: { id: cliente.usuarioId },
    select: { nombre: true, apellido: true, email: true, telefono: true },
  });
  if (!user) throw new NotFoundError('Usuario no encontrado');

  return {
    usuario: user,
    cliente: {
      estado: cliente.estadoCliente.nombre,
      objetivoEntrenamiento: cliente.objetivoEntrenamiento,
      objetivoDiasRacha: cliente.objetivoDiasRacha ?? null,
      fechaAlta: msToIsoDate(dbDateMs(cliente.fechaAlta)),
    },
    membresia: await getMembership(cliente, now),
    aptoFisico: getMedicalClearance(cliente, now),
  };
};

export const listPayments = async (cliente, query = {}) => {
  const pagination = parsePaginationParams(query);
  const where = { cuota: { clienteId: cliente.id } };

  const [total, payments] = await Promise.all([
    prisma.pago.count({ where }),
    prisma.pago.findMany({
      where,
      include: { metodoPago: true, cuota: { include: { plan: true } } },
      orderBy: [{ fechaPago: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);

  const items = payments.map((pago) => ({
    id: pago.id,
    fechaPago: pago.fechaPago,
    plan: pago.cuota.plan.nombre,
    monto: Number(pago.monto),
    metodo: pago.metodoPago.nombre,
    medioPago: pago.medioPago,
    ultimosDigitos: pago.ultimosDigitos,
    referencia: pago.referenciaExterna,
    periodo: {
      desde: msToIsoDate(dbDateMs(pago.cuota.fechaInicio)),
      hasta: msToIsoDate(dbDateMs(pago.cuota.fechaVencimiento)),
    },
  }));

  return buildPaginatedResponse(items, { ...pagination, total });
};

export const listAttendances = async (cliente, query = {}) => {
  const pagination = parsePaginationParams(query);
  const where = { clienteId: cliente.id };

  const [total, rows] = await Promise.all([
    prisma.asistencia.count({ where }),
    prisma.asistencia.findMany({ where, orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }], skip: pagination.skip, take: pagination.limit }),
  ]);

  return buildPaginatedResponse(
    rows.map((row) => ({ id: row.id, fechaHora: row.fechaHora })),
    { ...pagination, total }
  );
};

// Archivo del apto físico: solo el del propio cliente, nunca por una URL pública.
export const getMedicalClearanceFile = (cliente) => {
  if (!cliente.aptoFisicoArchivo) throw new NotFoundError('No tenés un apto físico cargado');

  const root = path.resolve(UPLOADS_PATH);
  const absolute = path.resolve(root, cliente.aptoFisicoArchivo);
  if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute)) {
    throw new NotFoundError('El archivo del apto físico no está disponible');
  }
  return absolute;
};
