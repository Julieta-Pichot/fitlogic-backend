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
// Devuelve fechas listas para columnas @db.Date (medianoche UTC del día calendario).
export const quotaPeriod = (paidAt, durationDays) => {
  const start = new Date(gymTodayMs(paidAt));
  return { fechaInicio: start, fechaVencimiento: new Date(start.getTime() + durationDays * DAY_MS) };
};
