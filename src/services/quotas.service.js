import prisma from '../lib/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js';
import { activateQuota, supersedePendingQuotas } from './quota-activation.service.js';
import { expirePreferences, listPlans } from './membership-payments.service.js';
import { assertCanPay, computeMembershipStatus, quotaPeriod } from '../utils/membership.js';

const findState = async (name) => {
  const state = await prisma.estadoCuota.findUnique({ where: { nombre: name } });
  if (!state) throw new ValidationError(`No existe el estado de cuota ${name}`);
  return state;
};

const membershipInclude = { plan: true, estadoCuota: true, pago: true };

// Regla de negocio única (cliente y recepción): no se registra un nuevo pago mientras la membresía esté vigente con más de
// DIAS_ANTICIPACION_RENOVACION días. Va SIEMPRE dentro de la transacción que ya bloqueó la fila del cliente.
const assertClientCanPay = async (tx, clienteId, now, options) => {
  const cuotas = await tx.cuota.findMany({ where: { clienteId }, include: membershipInclude });
  assertCanPay(computeMembershipStatus(cuotas, now), options);
};

const quotaInclude = {
  plan: true,
  estadoCuota: true,
  pago: { include: { metodoPago: true } },
  cliente: { include: { usuario: true, estadoCliente: true } },
};

const getClientIdForUser = async (userId) => {
  const client = await prisma.cliente.findUnique({ where: { usuarioId: userId } });
  if (!client) throw new NotFoundError('Perfil de cliente no encontrado');
  return client.id;
};

export const listQuotas = async ({ userId, clientId, activeOnly = false }) => {
  const resolvedClientId = userId ? await getClientIdForUser(userId) : Number(clientId);
  if (!resolvedClientId) throw new ValidationError('El cliente es obligatorio');
  return prisma.cuota.findMany({
    where: { clienteId: resolvedClientId, ...(activeOnly ? { estadoCuota: { nombre: 'ACTIVA' } } : {}) },
    include: quotaInclude,
    orderBy: { fechaVencimiento: 'desc' },
  });
};

export const createPendingQuota = async ({ userId, clientId, planId }, now = new Date()) => {
  const resolvedClientId = userId ? await getClientIdForUser(userId) : Number(clientId);
  const plan = await prisma.plan.findUnique({ where: { id: Number(planId) } });
  if (!plan || !plan.activo) throw new NotFoundError('Plan activo no encontrado');
  const pending = await findState('PENDIENTE');

  let replacedPreferences = [];
  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM cliente WHERE id = ${resolvedClientId} FOR UPDATE`;
    await assertClientCanPay(tx, resolvedClientId, now, { propio: Boolean(userId) });
    const existingPending = await tx.cuota.findFirst({ where: { clienteId: resolvedClientId, planId: plan.id, estadoCuotaId: pending.id, pago: { is: null } } });
    if (existingPending) throw new ConflictError('El cliente ya tiene una solicitud pendiente para este plan');

    const row = await tx.cuota.create({
      data: { clienteId: resolvedClientId, planId: plan.id, estadoCuotaId: pending.id, ...quotaPeriod(now, plan.duracionDias) },
      include: quotaInclude,
    });
    // El plan nuevo reemplaza al pendiente anterior (no se acumulan).
    replacedPreferences = await supersedePendingQuotas(tx, resolvedClientId, row.id);
    return row;
  });
  await expirePreferences(replacedPreferences);
  return created;
};

// El monto lo calcula SIEMPRE el backend: precio del plan con la promoción vigente (el mismo que cobra Mercado Pago).
// El front puede enviar `monto` solo para confirmar lo que vio: si no coincide con el precio actual se rechaza (400) en vez de cobrar otra cosa.
// Las fechas siguen la regla única (activateQuota): la cuota arranca HOY (día del pago, hora Buenos Aires).
export const confirmQuotaPayment = async (quotaId, metodoPagoId, referenciaExterna, monto, now = new Date()) => {
  const quota = await prisma.cuota.findUnique({
    where: { id: Number(quotaId) },
    include: { plan: true, estadoCuota: true, pago: true },
  });
  if (!quota) throw new NotFoundError('Cuota no encontrada');
  if (quota.pago) throw new ConflictError('La cuota ya tiene un pago registrado');
  if (quota.estadoCuota.nombre !== 'PENDIENTE') throw new ConflictError('La cuota no está pendiente de confirmación');
  const method = await prisma.metodoPago.findUnique({ where: { id: Number(metodoPagoId) } });
  if (!method) throw new ValidationError('Método de pago inválido');

  const priced = (await listPlans(now)).find((plan) => plan.id === quota.planId);
  const rounded = Number((priced ? priced.precioFinal : Number(quota.plan.precio)).toFixed(2));
  if (!Number.isFinite(rounded) || rounded <= 0) throw new ValidationError('El plan no tiene un precio válido');
  if (monto !== undefined && monto !== null && monto !== '' && Number(Number(monto).toFixed(2)) !== rounded) {
    throw new ValidationError(`El monto no coincide con el precio actual del plan ($${rounded.toLocaleString('es-AR', { minimumFractionDigits: 2 })}). Actualizá la pantalla y volvé a intentar.`, null, 'MONTO_INVALIDO');
  }
  const cash = method.nombre === 'EFECTIVO';

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM cliente WHERE id = ${quota.clienteId} FOR UPDATE`;
    await assertClientCanPay(tx, quota.clienteId, now);
    await activateQuota(tx, {
      cuotaId: quota.id,
      paidAt: now,
      pago: {
        metodoPagoId: method.id,
        monto: rounded,
        // Efectivo en recepción: lo recibido es el monto completo y sin comisión.
        montoNeto: cash ? rounded : null,
        comision: cash ? 0 : null,
        medioPago: cash ? 'Efectivo' : null,
        fechaAcreditacion: cash ? now : null,
        referenciaExterna: referenciaExterna ? String(referenciaExterna).trim() : null,
      },
    });
    await supersedePendingQuotas(tx, quota.clienteId, quota.id, { includeOnline: false });
  });
  return getQuotaById(quota.id);
};

export const getQuotaById = async (quotaId) => {
  const quota = await prisma.cuota.findUnique({ where: { id: Number(quotaId) }, include: quotaInclude });
  if (!quota) throw new NotFoundError('Cuota no encontrada');
  return quota;
};

// Cobro en caja (recepción): el recepcionista elige cliente + (cuota pendiente | plan) + método y el backend hace todo en UNA
// transacción: bloquea al cliente, valida, crea la cuota PENDIENTE si todavía no existía (renovación sin solicitud previa),
// calcula el monto (plan + promoción vigente) y la activa con la regla única de fechas (día del pago, hora Buenos Aires).
const DUPLICATE_WINDOW_MS = 30_000;

export const registerReceptionPayment = async ({ clienteId, cuotaId, planId, metodoPagoId }, now = new Date()) => {
  if ((cuotaId ? 1 : 0) + (planId ? 1 : 0) !== 1) throw new ValidationError('Elegí la cuota pendiente o el plan a cobrar', null, 'DATOS_INVALIDOS');
  const method = await prisma.metodoPago.findUnique({ where: { id: Number(metodoPagoId) } });
  if (!method) throw new ValidationError('Método de pago inválido');
  const [pendingState, plans] = await Promise.all([findState('PENDIENTE'), listPlans(now)]);
  const cash = method.nombre === 'EFECTIVO';

  const quotaId = await prisma.$transaction(async (tx) => {
    // Primera lectura de la transacción = bloqueo: dos cobros simultáneos del mismo cliente se serializan.
    await tx.$queryRaw`SELECT id FROM cliente WHERE id = ${Number(clienteId)} FOR UPDATE`;
    const client = await tx.cliente.findUnique({ where: { id: Number(clienteId) }, include: { estadoCliente: true } });
    if (!client) throw new NotFoundError('Cliente no encontrado');
    if (client.estadoCliente.nombre === 'INHABILITADO_BAJA') throw new ConflictError('El cliente está dado de baja: reactivalo desde el panel de administración antes de cobrar', 'CLIENTE_BAJA');

    // Regla de negocio (validada acá, no solo en el front): pendiente_pago, vencida, sin plan o activa a 3 días o menos del vencimiento.
    await assertClientCanPay(tx, client.id, now);

    // Anti doble clic / doble envío: no se acepta otro cobro del mismo cliente en los últimos segundos.
    const recent = await tx.pago.findFirst({ where: { cuota: { clienteId: client.id }, fechaPago: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) } } });
    if (recent) throw new ConflictError('Ya se registró un pago de este cliente hace instantes. Revisá el historial antes de volver a cobrar.', 'PAGO_DUPLICADO');

    let quota;
    if (cuotaId) {
      quota = await tx.cuota.findFirst({ where: { id: Number(cuotaId), clienteId: client.id }, include: { plan: true, estadoCuota: true, pago: true } });
      if (!quota) throw new NotFoundError('Cuota no encontrada para este cliente');
      if (quota.pago || quota.estadoCuota.nombre !== 'PENDIENTE') throw new ConflictError('La cuota no está pendiente de pago', 'CUOTA_NO_PENDIENTE');
    } else {
      const plan = await tx.plan.findUnique({ where: { id: Number(planId) } });
      if (!plan || !plan.activo) throw new NotFoundError('Plan activo no encontrado');
      quota = await tx.cuota.findFirst({ where: { clienteId: client.id, planId: plan.id, estadoCuotaId: pendingState.id, pago: { is: null } }, orderBy: { id: 'desc' }, include: { plan: true, estadoCuota: true, pago: true } });
      if (!quota) {
        quota = await tx.cuota.create({
          data: { clienteId: client.id, planId: plan.id, estadoCuotaId: pendingState.id, ...quotaPeriod(now, plan.duracionDias) },
          include: { plan: true, estadoCuota: true, pago: true },
        });
      }
    }

    const priced = plans.find((plan) => plan.id === quota.planId);
    const amount = Number((priced ? priced.precioFinal : Number(quota.plan.precio)).toFixed(2));
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('El plan no tiene un precio válido');

    await activateQuota(tx, {
      cuotaId: quota.id,
      paidAt: now,
      pago: {
        metodoPagoId: method.id,
        monto: amount,
        montoNeto: cash ? amount : null,
        comision: cash ? 0 : null,
        medioPago: cash ? 'Efectivo' : null,
        fechaAcreditacion: cash ? now : null,
        referenciaExterna: null,
      },
    });
    // Cobrada una cuota, las demás solicitudes del alta en recepción quedan obsoletas (las de Mercado Pago siguen su propio ciclo).
    await supersedePendingQuotas(tx, client.id, quota.id, { includeOnline: false });
    return quota.id;
  });
  return getQuotaById(quotaId);
};
