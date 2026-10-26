import crypto from 'crypto';
import { AppError } from '../errors/AppError.js';

// Cliente mínimo de la API REST de Mercado Pago (Checkout Pro). El Access Token solo vive en el
// backend (variable de entorno) y nunca se loguea ni se devuelve al front.
// MERCADOPAGO_API_URL solo existe para que los tests apunten a un Mercado Pago simulado.
const API_URL = process.env.MERCADOPAGO_API_URL || 'https://api.mercadopago.com';
const REQUEST_TIMEOUT_MS = 15_000;

const accessToken = () => {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new AppError('El pago con Mercado Pago no está configurado en el servidor', 503, null, 'MP_NO_CONFIGURADO');
  }
  return token;
};

const request = async (method, path, body) => {
  let response;
  try {
    response = await globalThis.fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        'Content-Type': 'application/json',
        ...(method === 'POST' ? { 'X-Idempotency-Key': crypto.randomUUID() } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error('[mercadopago] No se pudo contactar a Mercado Pago:', error.message);
    throw new AppError('No pudimos comunicarnos con Mercado Pago. Intentá de nuevo en unos minutos.', 502, null, 'MP_NO_DISPONIBLE');
  }

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    // Se loguea el detalle del error de MP (sin credenciales) para diagnosticar.
    console.error(`[mercadopago] ${method} ${path} -> ${response.status}`, text.slice(0, 500));
    throw new AppError('Mercado Pago rechazó la operación. Intentá de nuevo en unos minutos.', 502, null, 'MP_ERROR');
  }
  return json;
};

// Argentina no tiene horario de verano: el offset de Buenos Aires es fijo (-03:00).
export const toGymIso = (date) => `${new Date(date.getTime() - 3 * 3_600_000).toISOString().slice(0, -1)}-03:00`;

export const createPreference = (body) => request('POST', '/checkout/preferences', body);

export const getPayment = (paymentId) => request('GET', `/v1/payments/${encodeURIComponent(paymentId)}`);

// Pagos asociados a una cuota (external_reference), del más reciente al más antiguo.
export const findPaymentsByReference = async (reference, limit = 10) => {
  const result = await request(
    'GET',
    `/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc&limit=${limit}`
  );
  return result?.results ?? [];
};

// De los pagos de una cuota, el aprobado si lo hay; si no, el más reciente.
export const pickRelevantPayment = (payments) => payments.find((payment) => payment.status === 'approved') ?? payments[0] ?? null;

export const findLatestPaymentByReference = async (reference) => pickRelevantPayment(await findPaymentsByReference(reference));

// Pagos APROBADOS en un rango de fechas de aprobación (conciliación). Recorre todas las páginas.
// `from` / `to`: instantes (Date). Las fechas viajan en ISO 8601 con el offset de Buenos Aires.
export const searchApprovedPayments = async (from, to, { pageSize = 100, maxPages = 50 } = {}) => {
  const results = [];
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({
      status: 'approved',
      range: 'date_approved',
      begin_date: toGymIso(from),
      end_date: toGymIso(to),
      sort: 'date_approved',
      criteria: 'asc',
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    const body = await request('GET', `/v1/payments/search?${query}`);
    const batch = body?.results ?? [];
    results.push(...batch);
    if (batch.length < pageSize) return { payments: results, truncated: false };
  }
  return { payments: results, truncated: true };
};

const round2 = (value) => Math.round(value * 100) / 100;

const PAYMENT_TYPES = {
  credit_card: 'Tarjeta de crédito',
  debit_card: 'Tarjeta de débito',
  prepaid_card: 'Tarjeta prepaga',
  account_money: 'Dinero en cuenta',
  ticket: 'Efectivo / ticket',
  bank_transfer: 'Transferencia',
  atm: 'Cajero automático',
};

// Datos normalizados de un pago de MP para guardar en `pago` (bruto, neto, comisión, medio).
// Neto y comisión salen de transaction_details.net_received_amount y fee_details (comisiones a cargo del vendedor).
// fecha_acreditacion = money_release_date (cuándo MP libera el dinero en la cuenta vendedora).
export const extractPaymentDetails = (payment) => {
  const gross = round2(Number(payment.transaction_amount));
  const netRaw = payment.transaction_details?.net_received_amount;
  const net = netRaw === undefined || netRaw === null || !Number.isFinite(Number(netRaw)) ? null : round2(Number(netRaw));
  const fees = Array.isArray(payment.fee_details)
    ? payment.fee_details.filter((fee) => !fee.fee_payer || fee.fee_payer === 'collector').reduce((sum, fee) => sum + Number(fee.amount || 0), 0)
    : 0;
  const commission = fees > 0 ? round2(fees) : net !== null ? Math.max(0, round2(gross - net)) : null;

  const type = PAYMENT_TYPES[payment.payment_type_id] ?? payment.payment_type_id ?? null;
  const brand = payment.payment_method_id && String(payment.payment_type_id ?? '').endsWith('_card') ? ` ${String(payment.payment_method_id).toUpperCase()}` : '';
  const last4 = String(payment.card?.last_four_digits ?? '');
  return {
    monto: gross,
    montoNeto: net ?? (commission !== null ? Math.max(0, round2(gross - commission)) : null),
    comision: commission,
    medioPago: type ? `${type}${brand}`.slice(0, 50) : null,
    ultimosDigitos: /^\d{4}$/.test(last4) ? last4 : null,
    fechaAcreditacion: payment.money_release_date ? new Date(payment.money_release_date) : null,
    fechaAprobacion: payment.date_approved ? new Date(payment.date_approved) : null,
  };
};

// Campos NO sensibles del pago para la auditoría (mp_evento_pago.payload_resumen). Nunca datos de tarjeta.
export const summarizePayment = (payment) => ({
  id: payment.id,
  status: payment.status,
  status_detail: payment.status_detail ?? null,
  transaction_amount: payment.transaction_amount,
  currency_id: payment.currency_id,
  payment_type_id: payment.payment_type_id ?? null,
  payment_method_id: payment.payment_method_id ?? null,
  external_reference: payment.external_reference ?? null,
  date_created: payment.date_created ?? null,
  date_approved: payment.date_approved ?? null,
  net_received_amount: payment.transaction_details?.net_received_amount ?? null,
});

const STATUS_DETAIL_MESSAGES = {
  cc_rejected_insufficient_amount: 'Tu tarjeta no tiene fondos suficientes para este pago.',
  cc_rejected_bad_filled_security_code: 'El código de seguridad de la tarjeta es incorrecto.',
  cc_rejected_bad_filled_date: 'La fecha de vencimiento de la tarjeta es incorrecta.',
  cc_rejected_bad_filled_card_number: 'El número de la tarjeta es incorrecto.',
  cc_rejected_bad_filled_other: 'Revisá los datos de la tarjeta e intentá de nuevo.',
  cc_rejected_call_for_authorize: 'Tenés que autorizar el pago con tu banco o emisor de la tarjeta.',
  cc_rejected_card_disabled: 'Tu tarjeta está deshabilitada. Activala con tu banco o usá otra.',
  cc_rejected_duplicated_payment: 'Ya realizaste un pago por este mismo importe hace instantes.',
  cc_rejected_high_risk: 'Mercado Pago rechazó el pago por seguridad. Probá con otro medio de pago.',
  cc_rejected_max_attempts: 'Superaste el máximo de intentos. Probá con otra tarjeta.',
  cc_rejected_invalid_installments: 'La tarjeta no admite la cantidad de cuotas elegida.',
  cc_rejected_blacklist: 'No pudimos procesar el pago con esta tarjeta. Probá con otra.',
  cc_rejected_other_reason: 'La tarjeta no pudo procesar el pago. Probá con otra tarjeta o medio de pago.',
  rejected_by_bank: 'El banco rechazó la operación.',
  rejected_insufficient_data: 'Faltan datos para procesar el pago.',
  cancelled: 'El pago fue cancelado.',
  expired: 'El pago venció sin acreditarse.',
  pending_waiting_payment: 'Estamos esperando que completes el pago (por ejemplo, en un punto de pago en efectivo).',
  pending_waiting_transfer: 'Estamos esperando tu transferencia.',
  pending_contingency: 'Estamos procesando tu pago. Te avisamos en cuanto se acredite.',
  pending_review_manual: 'Estamos revisando tu pago. Puede demorar hasta 2 días hábiles.',
  pending_challenge: 'Falta validar tu identidad para completar el pago.',
};

export const statusDetailMessage = (status, detail) =>
  STATUS_DETAIL_MESSAGES[detail] ??
  (status === 'approved'
    ? 'Pago aprobado.'
    : ['pending', 'in_process', 'authorized', 'in_mediation'].includes(status)
      ? 'Tu pago está pendiente de acreditación.'
      : 'El pago no pudo completarse. Podés intentarlo de nuevo con otro medio de pago.');

// Firma de las notificaciones: header x-signature = "ts=...,v1=..." y manifest
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" firmado con HMAC SHA256 y la clave secreta del webhook.
// `toleranceSeconds`: si se informa, se rechazan notificaciones cuyo `ts` (milisegundos) difiere más que eso de `now`.
export const verifyWebhookSignature = ({ signature, requestId, dataId, secret, toleranceSeconds = null, now = Date.now() }) => {
  if (!signature || !secret) return false;

  const parts = Object.fromEntries(
    String(signature)
      .split(',')
      .map((part) => part.trim().split('='))
      .filter((pair) => pair.length === 2)
  );
  if (!parts.ts || !parts.v1) return false;
  if (toleranceSeconds !== null) {
    const sentAt = Number(parts.ts);
    if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > toleranceSeconds * 1000) return false;
  }

  const id = /^[a-z0-9]+$/i.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId);
  const manifest = `id:${id};request-id:${requestId ?? ''};ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(String(parts.v1));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
