import { ConflictError } from '../errors/AppError.js';
import { DIAS_ANTICIPACION_RENOVACION } from '../constants/index.js';
import { dbDateMs, diffDays, gymTodayMs, msToIsoDate } from './timezone.js';

const DAY_MS = 86_400_000;

const toPlan = (plan) => ({ id: plan.id, nombre: plan.nombre, precio: Number(plan.precio), duracionDias: plan.duracionDias });

const toQuota = (cuota, todayMs) => {
  const start = dbDateMs(cuota.fechaInicio);
  const end = dbDateMs(cuota.fechaVencimiento);
  const total = Math.max(1, diffDays(start, end));
  return {
    id: cuota.id,
    plan: toPlan(cuota.plan),
    fechaInicio: msToIsoDate(start),
    fechaVencimiento: msToIsoDate(end),
    diasRestantes: diffDays(todayMs, end),
    progreso: Math.min(100, Math.max(0, Math.round((diffDays(start, todayMs) / total) * 100))),
  };
};

// Una cuota "cuenta" para la membresía si está paga (tiene `pago`) o figura ACTIVA. Las PENDIENTE sin pago
// (solicitudes nunca pagadas) y las VENCIDA sin pago (solicitudes abandonadas) se ignoran.
const counts = (cuota) => Boolean(cuota.pago) || cuota.estadoCuota.nombre === 'ACTIVA';

// Estado EFECTIVO de la membresía, calculado con las fechas (hora del gimnasio) y el estado de reemplazo:
//   - Vigente: fecha_inicio <= hoy <= fecha_vencimiento y la cuota NO fue reemplazada. Una cuota
//     pasa a VENCIDA con fechas todavía futuras solo cuando una cuota nueva la reemplaza (ver activateQuota),
//     por eso una VENCIDA nunca es la vigente. Si hay varias vigentes se toma la que empezó más tarde.
//   - Una ACTIVA cuyo vencimiento ya pasó figura VENCIDA aunque el estado guardado no se haya actualizado.
// `cuotas` debe incluir plan, estadoCuota y pago.
export const computeMembership = (cuotas, now = new Date()) => {
  const todayMs = gymTodayMs(now);
  const counted = cuotas.filter(counts);
  const range = (cuota) => ({ start: dbDateMs(cuota.fechaInicio), end: dbDateMs(cuota.fechaVencimiento) });

  const current = counted
    .filter((cuota) => cuota.estadoCuota.nombre !== 'VENCIDA' && range(cuota).start <= todayMs && range(cuota).end >= todayMs)
    .sort((a, b) => range(b).start - range(a).start || b.id - a.id)[0];
  const lastExpired = counted
    .filter((cuota) => cuota !== current && (range(cuota).end < todayMs || cuota.estadoCuota.nombre === 'VENCIDA'))
    .sort((a, b) => range(b).end - range(a).end || b.id - a.id)[0];
  const pendingRequests = cuotas.filter((cuota) => cuota.estadoCuota.nombre === 'PENDIENTE' && !cuota.pago).sort((a, b) => b.id - a.id);

  const reference = current ?? lastExpired ?? null;
  return {
    estado: current ? 'ACTIVA' : lastExpired ? 'VENCIDA' : 'SIN_MEMBRESIA',
    cuota: reference ? toQuota(reference, todayMs) : null,
    solicitudPendiente: pendingRequests.length > 0,
    // Solicitudes de pago sin pago (el cliente puede verificarlas o descartarlas).
    solicitudesPendientes: pendingRequests.map((cuota) => ({ id: cuota.id, plan: cuota.plan.nombre })),
  };
};

// Regla ÚNICA de fechas de una cuota paga (recepción y Mercado Pago):
//   fecha_inicio = día del pago (hora Buenos Aires; el de aprobación, no el del intento)
//   fecha_vencimiento = fecha_inicio + duracion_dias.
// Renovación anticipada: si la membresía anterior todavía no venció (`extendFromMs` = su vencimiento, medianoche UTC),
// los días nuevos se suman a ESE vencimiento y el cliente no pierde los días que le quedaban.
// Devuelve fechas listas para columnas @db.Date (medianoche UTC del día calendario).
export const quotaPeriod = (paidAt, durationDays, extendFromMs = null) => {
  const start = gymTodayMs(paidAt);
  const base = extendFromMs !== null && extendFromMs > start ? extendFromMs : start;
  return { fechaInicio: new Date(start), fechaVencimiento: new Date(base + durationDays * DAY_MS) };
};

const ddmmyyyy = (iso) => iso.split('-').reverse().join('/');
const plural = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;

// FUENTE ÚNICA del estado de la membresía (la usan el panel del cliente, recepción y las validaciones de pago):
//   sin_plan        no hay plan vigente, vencido ni pendiente
//   pendiente_pago  hay un plan elegido sin pago confirmado y no hay una membresía vigente
//   activa          vigente y faltan MÁS de DIAS_ANTICIPACION_RENOVACION días
//   por_vencer      vigente y faltan DIAS_ANTICIPACION_RENOVACION días o menos (incluye el día del vencimiento)
//   vencida         la última membresía paga ya venció
// Extiende `computeMembership` (que se conserva tal cual). Todo se compara por FECHA, con "hoy" en hora de Buenos Aires.
// `renovacion.permitida` es la regla de "renovar / registrar un nuevo pago": solo se bloquea con la membresía `activa`.
export const computeMembershipStatus = (cuotas, now = new Date()) => {
  const base = computeMembership(cuotas, now);
  const todayMs = gymTodayMs(now);
  const pendings = cuotas.filter((cuota) => cuota.estadoCuota.nombre === 'PENDIENTE' && !cuota.pago).sort((a, b) => b.id - a.id);
  const originOf = (cuota) => (cuota.mpExpiraEn || cuota.mpPreferenceId ? 'MERCADOPAGO' : 'RECEPCION');
  const latest = pendings[0] ?? null;
  const days = base.cuota?.diasRestantes ?? null;

  const estadoMembresia =
    base.estado === 'ACTIVA'
      ? days <= DIAS_ANTICIPACION_RENOVACION ? 'por_vencer' : 'activa'
      : latest ? 'pendiente_pago' : base.estado === 'VENCIDA' ? 'vencida' : 'sin_plan';

  const blocked = estadoMembresia === 'activa';
  const renovableDesde = blocked ? msToIsoDate(Date.parse(`${base.cuota.fechaVencimiento}T00:00:00Z`) - DIAS_ANTICIPACION_RENOVACION * DAY_MS) : null;
  const diasParaRenovar = blocked ? days - DIAS_ANTICIPACION_RENOVACION : 0;

  return {
    ...base,
    estadoMembresia,
    diasRestantes: days,
    pendiente: latest
      ? {
          cuotaId: latest.id,
          plan: toPlan(latest.plan),
          desde: msToIsoDate(dbDateMs(latest.fechaInicio)),
          diasEspera: Math.max(0, diffDays(dbDateMs(latest.fechaInicio), todayMs)),
          origen: originOf(latest),
        }
      : null,
    // El botón "Ya pagué, verificar" solo tiene sentido para solicitudes que nacieron de un pago online.
    puedeVerificarPago: pendings.some((cuota) => originOf(cuota) === 'MERCADOPAGO'),
    renovacion: {
      permitida: !blocked,
      fechaVencimiento: blocked ? base.cuota.fechaVencimiento : null,
      renovableDesde,
      diasParaRenovar,
      mensajeCliente: blocked ? `Tu membresía está vigente hasta el ${ddmmyyyy(base.cuota.fechaVencimiento)}. Podrás renovar a partir del ${ddmmyyyy(renovableDesde)} (faltan ${plural(diasParaRenovar)}).` : null,
      mensajeRecepcion: blocked ? `Este cliente tiene una membresía vigente hasta el ${ddmmyyyy(base.cuota.fechaVencimiento)}. Podrás registrar un nuevo pago desde el ${ddmmyyyy(renovableDesde)}.` : null,
    },
  };
};

// Rechaza (409) un nuevo pago / renovación mientras la membresía esté `activa` con más de DIAS_ANTICIPACION_RENOVACION días.
// `propio`: el mensaje habla en primera persona (cliente) en vez de hablar del cliente en tercera (recepción).
export const assertCanPay = (membership, { propio = false } = {}) => {
  const { permitida, mensajeCliente, mensajeRecepcion } = membership.renovacion;
  if (!permitida) throw new ConflictError(propio ? mensajeCliente : mensajeRecepcion, 'MEMBRESIA_VIGENTE');
};
