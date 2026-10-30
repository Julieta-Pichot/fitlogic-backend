import prisma from '../lib/prisma.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError.js';
import { assertCanPay, computeMembershipStatus, quotaPeriod } from '../utils/membership.js';
import { dbDateMs, gymTodayMs, msToIsoDate } from '../utils/timezone.js';
import * as mercadopago from './mercadopago.service.js';
import { activateQuota, supersedePendingQuotas } from './quota-activation.service.js';
import { buildReceipt } from './payment-receipts.service.js';

const RESULT_PATH = '/home/cliente/pago/resultado';
const PREFERENCE_TTL_MS = 48 * 3_600_000;
// Un comprobante de pago en efectivo ya emitido puede pagarse unos días después de vencida la preferencia.
const ABANDON_GRACE_MS = 7 * 86_400_000;

const round2 = (value) => Math.round(value * 100) / 100;

// ---------------------------------------------------------------------------
// Planes con promociones
// ---------------------------------------------------------------------------

// `promocion.descuento` es un PORCENTAJE (0-100), igual que en el panel de administración.
// Una promoción rige si está activa y hoy (hora del gimnasio) está dentro de fecha_inicio..fecha_fin.
// `vigencia` es el resumen de compra calculado por el backend con la regla única de fechas
// (la membresía arranca el día del pago).
export const listPlans = async (now = new Date()) => {
  const todayMs = gymTodayMs(now);
  const today = new Date(todayMs);
  const plans = await prisma.plan.findMany({
    where: { activo: true },
    include: { promociones: { where: { activa: true, fechaInicio: { lte: today }, fechaFin: { gte: today } } } },
    orderBy: [{ precio: 'asc' }, { id: 'asc' }],
  });

  return plans.map((plan) => {
    const best = plan.promociones.sort((a, b) => Number(b.descuento) - Number(a.descuento))[0] ?? null;
    const precio = Number(plan.precio);
    const descuento = best ? Number(best.descuento) : 0;
    const period = quotaPeriod(now, plan.duracionDias);
    return {
      id: plan.id,
      nombre: plan.nombre,
      duracionDias: plan.duracionDias,
      precio,
      promocion: best ? { id: best.id, nombre: best.nombre, descuento } : null,
      precioFinal: round2(precio * (1 - descuento / 100)),
      vigencia: { desde: msToIsoDate(dbDateMs(period.fechaInicio)), hasta: msToIsoDate(dbDateMs(period.fechaVencimiento)) },
    };
  });
};

const getPlanPrice = async (planId, now) => {
  const plan = (await listPlans(now)).find((item) => item.id === Number(planId));
  if (!plan) throw new NotFoundError('Plan no encontrado o no disponible', 'PLAN_NO_ENCONTRADO');
  return plan;
};

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

const publicUrl = (value) => String(value ?? '').trim().replace(/\/$/, '');

// URL del front para las back_urls: FRONTEND_PUBLIC_URL o, si no, el primer valor de FRONTEND_URL (admite lista por comas).
// En producción no hay fallback a localhost: si falta la variable, el checkout falla con un error claro.
const frontendBaseUrl = ({ required = false } = {}) => {
  const url = publicUrl(process.env.FRONTEND_PUBLIC_URL || process.env.FRONTEND_URL?.split(',')[0]);
  if (url) return url;
  if (!required) return '';
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('Falta configurar FRONTEND_URL (o FRONTEND_PUBLIC_URL) en el servidor: no se puede armar el retorno de Mercado Pago.', 500, null, 'CONFIG_FALTANTE');
  }
  return 'http://localhost:5173';
};

const buildPreference = ({ plan, cuota, user, cliente, now, expiresAt }) => {
  const frontend = frontendBaseUrl({ required: true });
  const backend = publicUrl(process.env.BACKEND_PUBLIC_URL);
  const back = `${frontend}${RESULT_PATH}`;

  return {
    items: [
      {
        id: `plan-${plan.id}`,
        title: `Membresía ${plan.nombre}`,
        description: `Plan de ${plan.duracionDias} días`,
        quantity: 1,
        unit_price: plan.precioFinal,
        currency_id: 'ARS',
      },
    ],
    payer: { email: user.email },
    external_reference: String(cuota.id),
    back_urls: { success: back, failure: back, pending: back },
    // auto_return exige back_urls públicas (https): con localhost Mercado Pago lo rechaza.
    ...(frontend.startsWith('https://') ? { auto_return: 'approved' } : {}),
    // Mercado Pago solo puede notificar a una URL https pública (en local, usar un túnel).
    ...(backend.startsWith('https://') ? { notification_url: `${backend}/api/pagos/mercadopago/webhook` } : {}),
    expires: true,
    expiration_date_from: mercadopago.toGymIso(now),
    expiration_date_to: mercadopago.toGymIso(expiresAt),
    metadata: { cuota_id: cuota.id, plan_id: plan.id, cliente_id: cliente.id, expected_amount: plan.precioFinal },
    statement_descriptor: 'FITLOGIC',
  };
};

// Al cambiar de plan, el intento de pago del plan anterior queda invalidado: se vence su preferencia en Mercado Pago.
// Es un mejor esfuerzo (si MP no responde, la cuota igual ya no figura como pendiente); un pago ya en curso
// (p. ej. un cupón de efectivo) se sigue acreditando contra SU plan, nunca contra el nuevo.
export const expirePreferences = async (preferenceIds = []) => {
  await Promise.all(preferenceIds.map((id) => mercadopago.expirePreference(id).catch((error) => console.warn(`[mercadopago] No se pudo vencer la preferencia ${id}: ${error.message}`))));
};

// Crea (o reutiliza) la cuota PENDIENTE del plan elegido y la preferencia de Mercado Pago.
// El monto SIEMPRE lo calcula el backend; del front solo llega plan_id.
// Solo se reutilizan cuotas creadas por un checkout anterior (mp_expira_en): las pendientes del alta en
// recepción no se tocan.
export const createCheckout = async (cliente, user, planId, now = new Date()) => {
  if (cliente.estadoCliente.nombre === 'INHABILITADO_BAJA') {
    throw new ForbiddenError('Tu cuenta fue dada de baja. Consultá en recepción.', 'CUENTA_NO_HABILITADA');
  }
  const plan = await getPlanPrice(planId, now);
  const expiresAt = new Date(now.getTime() + PREFERENCE_TTL_MS);

  let replacedPreferences = [];
  const cuota = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM cliente WHERE id = ${cliente.id} FOR UPDATE`;
    // Misma regla que recepción: con la membresía vigente y más de DIAS_ANTICIPACION_RENOVACION días no se puede renovar.
    assertCanPay(computeMembershipStatus(await tx.cuota.findMany({ where: { clienteId: cliente.id }, include: { plan: true, estadoCuota: true, pago: true } }), now), { propio: true });
    const pending = await tx.estadoCuota.findUnique({ where: { nombre: 'PENDIENTE' } });
    if (!pending) throw new ValidationError('No existe el estado de cuota PENDIENTE');

    const existing = await tx.cuota.findFirst({
      where: { clienteId: cliente.id, planId: plan.id, estadoCuotaId: pending.id, pago: { is: null }, mpExpiraEn: { not: null } },
      orderBy: { id: 'desc' },
    });
    // Fechas provisorias: las definitivas se fijan el día en que se aprueba el pago.
    const target = existing
      ? await tx.cuota.update({ where: { id: existing.id }, data: { mpExpiraEn: expiresAt } })
      : await tx.cuota.create({
          data: { clienteId: cliente.id, planId: plan.id, estadoCuotaId: pending.id, mpExpiraEn: expiresAt, ...quotaPeriod(now, plan.duracionDias) },
        });
    // El plan elegido ahora reemplaza a cualquier solicitud pendiente anterior (incluida la del alta en recepción).
    replacedPreferences = await supersedePendingQuotas(tx, cliente.id, target.id);
    return target;
  });
  await expirePreferences(replacedPreferences);

  const preference = await mercadopago.createPreference(buildPreference({ plan, cuota, user, cliente, now, expiresAt }));
  const useSandbox = process.env.MERCADOPAGO_USE_SANDBOX_URL === 'true';
  const initPoint = (useSandbox ? preference?.sandbox_init_point : preference?.init_point) ?? preference?.init_point;
  if (!initPoint) throw new ConflictError('Mercado Pago no devolvió el enlace de pago', 'MP_ERROR');
  await prisma.cuota.update({ where: { id: cuota.id }, data: { mpPreferenceId: String(preference.id ?? '') || null } });

  return {
    cuotaId: cuota.id,
    preferenceId: preference.id,
    initPoint,
    resumen: { plan: plan.nombre, monto: plan.precioFinal, vigencia: plan.vigencia, expiraEn: expiresAt.toISOString() },
  };
};

// ---------------------------------------------------------------------------
// Confirmación del pago (idempotente; la usan la vuelta del usuario, el webhook y el scheduler)
// ---------------------------------------------------------------------------

const PENDING_STATUSES = new Set(['pending', 'in_process', 'authorized', 'in_mediation']);
const REVERSED_STATUSES = new Set(['refunded', 'charged_back']);

export const paymentOutcome = (status) =>
  status === 'approved' ? 'APROBADO' : PENDING_STATUSES.has(status) ? 'PENDIENTE' : REVERSED_STATUSES.has(status) ? 'REVERTIDO' : 'RECHAZADO';

const parseQuotaId = (payment) => {
  const id = Number(payment?.external_reference);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// Registra la notificación / verificación en mp_evento_pago (auditoría). Con `onlyChanges` no repite un evento
// idéntico al último del mismo pago (lo usa el sondeo periódico para no llenar la tabla).
const recordEvent = async (payment, { origin, cuotaId, onlyChanges = false }) => {
  const paymentId = String(payment.id);
  if (onlyChanges) {
    const last = await prisma.mpEventoPago.findFirst({ where: { mpPaymentId: paymentId }, orderBy: { id: 'desc' } });
    if (last && last.estado === payment.status && (last.detalleEstado ?? null) === (payment.status_detail ?? null)) return last.id;
  }
  const event = await prisma.mpEventoPago.create({
    data: {
      mpPaymentId: paymentId,
      cuotaId,
      estado: String(payment.status ?? 'unknown').slice(0, 30),
      detalleEstado: payment.status_detail ? String(payment.status_detail).slice(0, 100) : null,
      monto: Number.isFinite(Number(payment.transaction_amount)) ? round2(Number(payment.transaction_amount)) : null,
      origen: origin,
      payloadResumen: mercadopago.summarizePayment(payment),
    },
  });
  return event.id;
};

const closeEvent = (eventId, data) => prisma.mpEventoPago.update({ where: { id: eventId }, data });

const loadQuota = (db, id) =>
  db.cuota.findUnique({
    where: { id },
    include: { plan: true, estadoCuota: true, pago: true, cliente: { include: { estadoCliente: true } } },
  });

const baseResult = (payment, cuota, estado) => ({
  estado,
  cuotaId: cuota.id,
  clienteId: cuota.clienteId,
  mpStatus: payment.status,
  mpStatusDetail: payment.status_detail ?? null,
  mensaje: mercadopago.statusDetailMessage(payment.status, payment.status_detail),
});

// Procesa un pago de Mercado Pago YA consultado a su API (nunca el cuerpo de un webhook). Seguro de llamar varias veces.
export const processPayment = async (payment, { origin = 'VERIFICACION', now = new Date(), onlyChanges = false } = {}) => {
  const quotaId = parseQuotaId(payment);
  const exists = quotaId ? await prisma.cuota.findUnique({ where: { id: quotaId }, select: { id: true } }) : null;
  const eventId = await recordEvent(payment, { origin, cuotaId: exists ? quotaId : null, onlyChanges });

  if (!exists) {
    await closeEvent(eventId, { detalleEstado: 'CUOTA_INEXISTENTE' });
    console.error(`[mercadopago] ALERTA: el pago ${payment.id} no corresponde a ninguna cuota (external_reference=${payment.external_reference})`);
    throw new NotFoundError('El pago no corresponde a ninguna membresía', 'CUOTA_NO_ENCONTRADA');
  }

  const outcome = paymentOutcome(payment.status);
  if (outcome !== 'APROBADO') {
    const cuota = await loadQuota(prisma, quotaId);
    await closeEvent(eventId, { procesado: true });
    return baseResult(payment, cuota, outcome);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Primero se bloquea la cuota y después al cliente (lecturas con bloqueo, que ven lo último confirmado): una
      // confirmación simultánea espera acá y al continuar ya ve el pago de la otra (REPEATABLE READ tomaría una foto vieja).
      const [first] = await tx.$queryRaw`SELECT cliente_id AS clienteId FROM cuota WHERE id = ${quotaId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM cliente WHERE id = ${first.clienteId} FOR UPDATE`;

      const cuota = await loadQuota(tx, quotaId);
      const reference = String(payment.id);

      // Ya procesado (webhook + vuelta del usuario, o notificación repetida): respuesta idempotente.
      if (cuota.pago) {
        if (cuota.pago.referenciaExterna === reference) return { cuota, yaProcesado: true, pagoId: cuota.pago.id };
        throw new ConflictError('Esta membresía ya fue pagada con otro pago', 'CUOTA_YA_PAGA');
      }
      const state = cuota.estadoCuota.nombre;
      if (state !== 'PENDIENTE' && !(state === 'VENCIDA' && cuota.mpExpiraEn)) {
        throw new ConflictError('La membresía no está pendiente de pago', 'CUOTA_NO_PENDIENTE');
      }
      if (await tx.pago.findFirst({ where: { referenciaExterna: reference } })) {
        throw new ConflictError('Este pago de Mercado Pago ya se usó en otra membresía', 'PAGO_DUPLICADO');
      }

      // Validaciones contra lo que el backend esperaba cobrar (guardado en la preferencia al crearla).
      const amount = Number(payment.transaction_amount);
      const expected = Number(payment.metadata?.expected_amount ?? NaN);
      const planMatches = payment.metadata?.plan_id === undefined || Number(payment.metadata.plan_id) === cuota.planId;
      if (payment.currency_id !== 'ARS' || !Number.isFinite(expected) || round2(amount) !== round2(expected) || !planMatches) {
        throw new ConflictError('El monto o la moneda del pago no coinciden con la membresía', 'PAGO_NO_COINCIDE');
      }

      const method = await tx.metodoPago.findUnique({ where: { nombre: 'MERCADO_PAGO' } });
      if (!method) throw new ValidationError('Falta el método de pago MERCADO_PAGO');

      const details = mercadopago.extractPaymentDetails(payment);
      // La membresía arranca el día en que se APROBÓ el pago (no el del intento).
      const paidAt = details.fechaAprobacion ?? now;
      const activated = await activateQuota(
        tx,
        {
          cuotaId: cuota.id,
          paidAt,
          dedupKey: `pago:${reference}`,
          pago: {
            metodoPagoId: method.id,
            monto: details.monto,
            montoNeto: details.montoNeto,
            comision: details.comision,
            medioPago: details.medioPago,
            ultimosDigitos: details.ultimosDigitos,
            fechaAcreditacion: details.fechaAcreditacion,
            referenciaExterna: reference,
          },
        },
        { allowAbandoned: true }
      );
      return { cuota, yaProcesado: false, pagoId: activated.pagoId };
    });

    await closeEvent(eventId, { procesado: true, ...(result.yaProcesado ? { detalleEstado: 'YA_PROCESADO' } : {}) });
    return {
      ...baseResult(payment, result.cuota, 'APROBADO'),
      yaProcesado: result.yaProcesado,
      comprobante: await buildReceipt(result.pagoId),
    };
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) {
      await closeEvent(eventId, { detalleEstado: `INCONSISTENTE:${error.code ?? 'ERROR'}`.slice(0, 100) });
      console.error(`[mercadopago] ALERTA: pago ${payment.id} aprobado pero NO activado (${error.code}): ${error.message}`);
    }
    throw error;
  }
};

// Configuración del retorno: sin URLs https públicas Mercado Pago no devuelve al usuario ni avisa por webhook.
export const getCheckoutConfig = () => {
  const frontend = frontendBaseUrl();
  const backend = publicUrl(process.env.BACKEND_PUBLIC_URL);
  return { retornoAutomatico: frontend.startsWith('https://'), webhookActivo: backend.startsWith('https://') };
};

// Solicitudes del cliente que todavía no tienen pago: TODAS las PENDIENTE (incluidas las creadas por versiones anteriores
// del checkout, que no tienen mp_expira_en) y las marcadas VENCIDA por abandono hace poco (un pago puede aprobarse tarde).
const listUnpaidRequests = (cliente, now = new Date()) =>
  prisma.cuota.findMany({
    where: {
      clienteId: cliente.id,
      pago: { is: null },
      OR: [{ estadoCuota: { nombre: 'PENDIENTE' } }, { estadoCuota: { nombre: 'VENCIDA' }, mpExpiraEn: { gte: new Date(now.getTime() - ABANDON_GRACE_MS) } }],
    },
    orderBy: { id: 'desc' },
    take: 20,
    select: { id: true },
  });

// Busca en Mercado Pago el pago de una cuota por external_reference (sin payment_id). Solo se aceptan pagos que el checkout
// de FitLogic marcó con metadata.cuota_id igual a la cuota: la cuenta vendedora puede tener otros cobros con la misma referencia.
const findPaymentOfQuota = async (quotaId) => {
  const own = (await mercadopago.findPaymentsByReference(String(quotaId))).filter((payment) => String(payment.metadata?.cuota_id ?? '') === String(quotaId));
  return mercadopago.pickRelevantPayment(own);
};

const OUTCOME_PRIORITY = { APROBADO: 4, PENDIENTE: 3, REVERTIDO: 2, RECHAZADO: 1 };

// Verificación SIN payment_id ("Ya pagué"): revisa todas las solicitudes impagas del cliente (por reintentos puede haber varias),
// procesa el pago de cada una con el servicio idempotente y devuelve el mejor resultado: aprobado > pendiente > rechazado.
// Si una validación rechaza un pago aprobado (monto, moneda...), el error se informa; nunca se responde un "pendiente" mudo.
const verifyPendingRequests = async (cliente, now) => {
  const requests = await listUnpaidRequests(cliente, now);
  const results = [];
  let failure = null;
  for (const request of requests) {
    const payment = await findPaymentOfQuota(request.id);
    if (!payment) continue;
    try {
      results.push(await processPayment(payment, { origin: 'VERIFICACION', now }));
    } catch (error) {
      if (!(error instanceof AppError) || error.statusCode >= 500) throw error;
      failure ??= error;
    }
  }
  const best = results.sort((x, y) => OUTCOME_PRIORITY[y.estado] - OUTCOME_PRIORITY[x.estado] || y.cuotaId - x.cuotaId)[0];
  if (best) return { ...best, solicitudesRevisadas: requests.length };
  if (failure) throw failure;
  return {
    estado: 'SIN_PAGO',
    mensaje: requests.length
      ? 'No encontramos un pago para esta compra todavía. Si ya pagaste, esperá unos minutos y volvé a verificar.'
      : 'No tenés solicitudes de pago pendientes de verificar.',
    solicitudesRevisadas: requests.length,
    ...getCheckoutConfig(),
  };
};

// Vuelta del usuario desde Mercado Pago (o verificación manual). Nunca se confía en el status de la URL: se consulta el
// pago a la API. Con payment_id se consulta ese pago; con external_reference, los de esa cuota; sin ninguno de los dos
// ("Ya pagué" o entrada manual) se buscan los pagos de todas las solicitudes impagas del propio cliente.
export const verifyReturn = async (cliente, { payment_id: paymentId, collection_id: collectionId, external_reference: reference } = {}, now = new Date()) => {
  const id = paymentId || collectionId;
  const hasId = id && id !== 'null';
  if (!hasId && !reference) return verifyPendingRequests(cliente, now);

  const payment = hasId ? await mercadopago.getPayment(id) : await mercadopago.findLatestPaymentByReference(reference);
  if (!payment) {
    return { estado: 'SIN_PAGO', mensaje: 'No encontramos un pago para esta compra todavía. Si ya pagaste, esperá unos minutos y volvé a verificar.', ...getCheckoutConfig() };
  }

  // El pago debe corresponder a una cuota del propio cliente.
  const cuota = await prisma.cuota.findUnique({ where: { id: Number(payment.external_reference) || 0 }, select: { clienteId: true } });
  if (!cuota || cuota.clienteId !== cliente.id) throw new NotFoundError('No encontramos ese pago en tu cuenta', 'PAGO_NO_ENCONTRADO');

  return processPayment(payment, { origin: 'VERIFICACION', now });
};

// El cliente descarta una solicitud de pago que nunca se pagó (p. ej. un intento abandonado). Antes se consulta a Mercado Pago:
// si hay un pago aprobado se activa en vez de descartar; si hay uno en proceso no se permite. Con eventos asociados se conserva
// como VENCIDA (auditoría); sin eventos se elimina.
export const discardRequest = async (cliente, quotaId, now = new Date()) => {
  const cuota = await prisma.cuota.findFirst({
    where: { id: Number(quotaId), clienteId: cliente.id, pago: { is: null }, estadoCuota: { nombre: 'PENDIENTE' } },
    select: { id: true, mpExpiraEn: true, mpPreferenceId: true },
  });
  if (!cuota) throw new NotFoundError('No encontramos esa solicitud pendiente', 'SOLICITUD_NO_ENCONTRADA');

  // Una solicitud del alta en recepción nunca pasó por Mercado Pago: si la consulta falla, igual se puede descartar.
  const online = Boolean(cuota.mpExpiraEn || cuota.mpPreferenceId);
  const payment = await findPaymentOfQuota(cuota.id).catch((error) => {
    if (online) throw error;
    return null;
  });
  if (payment) {
    const outcome = paymentOutcome(payment.status);
    if (outcome === 'APROBADO') return processPayment(payment, { origin: 'VERIFICACION', now });
    if (outcome === 'PENDIENTE') throw new ConflictError('Hay un pago en proceso para esta solicitud: esperá a que se acredite o se rechace.', 'PAGO_EN_PROCESO');
  }

  const events = await prisma.mpEventoPago.count({ where: { cuotaId: cuota.id } });
  if (events === 0) {
    await prisma.cuota.deleteMany({ where: { id: cuota.id, pago: { is: null } } });
  } else {
    const expired = await prisma.estadoCuota.findUnique({ where: { nombre: 'VENCIDA' } });
    await prisma.cuota.updateMany({ where: { id: cuota.id, pago: { is: null } }, data: { estadoCuotaId: expired.id } });
  }
  return { estado: 'DESCARTADA', cuotaId: cuota.id };
};

// Notificación del webhook: consulta el pago a la API de MP y lo procesa igual que la vuelta del usuario.
export const handleWebhookPayment = async (paymentId, now = new Date()) => {
  const payment = await mercadopago.getPayment(paymentId);
  if (!payment) return { estado: 'IGNORADO', motivo: 'pago inexistente' };
  return processPayment(payment, { origin: 'WEBHOOK', now });
};

// Verificación que dispara el administrador desde "Pagos pendientes": por cuota o por id de pago de MP.
export const verifyQuotaAsAdmin = async (cuotaId, now = new Date()) => {
  const cuota = await prisma.cuota.findUnique({ where: { id: Number(cuotaId) }, select: { id: true } });
  if (!cuota) throw new NotFoundError('Cuota no encontrada', 'CUOTA_NO_ENCONTRADA');
  const payment = await mercadopago.findLatestPaymentByReference(String(cuota.id));
  if (!payment) return { estado: 'SIN_PAGO', cuotaId: cuota.id, mensaje: 'Mercado Pago no tiene pagos para esta cuota.' };
  return processPayment(payment, { origin: 'VERIFICACION', now });
};

// ---------------------------------------------------------------------------
// Mantenimiento (lo ejecuta el scheduler)
// ---------------------------------------------------------------------------

// Sondea Mercado Pago por las cuotas de checkout todavía sin pago (preferencia vigente o vencida hace menos de 7 días):
// sirve cuando el webhook no llega (sin túnel) o cuando un pago pendiente se aprueba más tarde.
export const syncPendingCheckouts = async (now = new Date()) => {
  const since = new Date(now.getTime() - ABANDON_GRACE_MS);
  const quotas = await prisma.cuota.findMany({
    where: { estadoCuota: { nombre: { in: ['PENDIENTE', 'VENCIDA'] } }, pago: { is: null }, mpExpiraEn: { gte: since } },
    select: { id: true },
    take: 50,
  });

  let activated = 0;
  for (const quota of quotas) {
    try {
      const payment = mercadopago.pickRelevantPayment(await mercadopago.findPaymentsByReference(String(quota.id)));
      if (!payment) continue;
      const result = await processPayment(payment, { origin: 'VERIFICACION', now, onlyChanges: true });
      if (result.estado === 'APROBADO' && !result.yaProcesado) activated += 1;
    } catch (error) {
      console.error(`[mercadopago] Sondeo de la cuota ${quota.id} falló: ${error.message}`);
    }
  }
  return activated;
};

// Decisión (la más segura para el esquema): una cuota de checkout sin pago cuya preferencia venció hace más de 7 días
// (margen para comprobantes de pago en efectivo) se limpia solo si Mercado Pago confirma que no tiene ningún pago:
//   - sin eventos asociados   -> se ELIMINA (nunca llegó nada);
//   - con eventos (rechazos)  -> se marca VENCIDA y se conserva (auditoría).
// Jamás se toca una cuota con pago, ni las pendientes del alta en recepción (no tienen mp_expira_en).
export const cleanupExpiredCheckouts = async (now = new Date()) => {
  const limit = new Date(now.getTime() - ABANDON_GRACE_MS);
  const quotas = await prisma.cuota.findMany({
    where: { estadoCuota: { nombre: 'PENDIENTE' }, pago: { is: null }, mpExpiraEn: { lt: limit } },
    select: { id: true },
    take: 100,
  });
  const expired = await prisma.estadoCuota.findUnique({ where: { nombre: 'VENCIDA' } });

  let removed = 0;
  let marked = 0;
  for (const quota of quotas) {
    try {
      if (await mercadopago.findPaymentsByReference(String(quota.id), 1).then((list) => list.length > 0)) continue; // lo toma el sondeo
      const events = await prisma.mpEventoPago.count({ where: { cuotaId: quota.id } });
      if (events === 0) {
        await prisma.cuota.deleteMany({ where: { id: quota.id, pago: { is: null } } });
        removed += 1;
      } else if (expired) {
        await prisma.cuota.updateMany({ where: { id: quota.id, estadoCuotaId: { not: expired.id } }, data: { estadoCuotaId: expired.id } });
        marked += 1;
      }
    } catch (error) {
      console.error(`[mercadopago] Limpieza de la cuota ${quota.id} falló: ${error.message}`);
    }
  }
  return { removed, marked };
};
