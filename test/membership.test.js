import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { computeMembership, quotaPeriod } from '../src/utils/membership.js';
import { verifyWebhookSignature } from '../src/services/mercadopago.service.js';
import { paymentOutcome } from '../src/services/membership-payments.service.js';

const date = (iso) => new Date(`${iso}T00:00:00Z`); // columnas DATE de Prisma: medianoche UTC
const plan = { id: 1, nombre: 'Mensual', precio: 15000, duracionDias: 30 };
const cuota = (id, estado, inicio, fin, pago = null) => ({ id, plan, estadoCuota: { nombre: estado }, fechaInicio: date(inicio), fechaVencimiento: date(fin), pago });
// 2030-06-10 12:00 en Argentina
const now = new Date('2030-06-10T15:00:00Z');

test('membresía vigente: días restantes y progreso', () => {
  const m = computeMembership([cuota(1, 'ACTIVA', '2030-06-01', '2030-06-21')], now);
  assert.equal(m.estado, 'ACTIVA');
  assert.equal(m.cuota.diasRestantes, 11);
  assert.equal(m.cuota.progreso, 45);
});

test('vence hoy sigue vigente (0 días) y vencida ayer ya no', () => {
  assert.equal(computeMembership([cuota(1, 'ACTIVA', '2030-05-01', '2030-06-10')], now).cuota.diasRestantes, 0);
  const expired = computeMembership([cuota(1, 'ACTIVA', '2030-05-01', '2030-06-09')], now);
  assert.equal(expired.estado, 'VENCIDA');
  assert.equal(expired.cuota.diasRestantes, -1);
});

test('ACTIVA con la fecha vencida => VENCIDA aunque el estado guardado no se haya actualizado', () => {
  assert.equal(computeMembership([cuota(1, 'ACTIVA', '2030-01-01', '2030-02-01')], now).estado, 'VENCIDA');
});

test('una cuota VENCIDA (reemplazada) con fechas futuras nunca es la vigente', () => {
  const sola = computeMembership([cuota(1, 'VENCIDA', '2030-06-01', '2030-06-30', { id: 5 })], now);
  assert.equal(sola.estado, 'VENCIDA');
  const reemplazada = computeMembership([cuota(1, 'VENCIDA', '2030-05-20', '2030-08-18', { id: 5 }), cuota(2, 'ACTIVA', '2030-06-10', '2030-07-10', { id: 6 })], now);
  assert.equal(reemplazada.estado, 'ACTIVA');
  assert.equal(reemplazada.cuota.id, 2); // aunque la anterior vencía más tarde
  assert.equal(reemplazada.cuota.fechaVencimiento, '2030-07-10');
});

test('una solicitud VENCIDA sin pago (abandonada) no cuenta como membresía', () => {
  assert.equal(computeMembership([cuota(1, 'VENCIDA', '2030-06-01', '2030-06-30')], now).estado, 'SIN_MEMBRESIA');
});

test('cuotas PENDIENTE sin pago se ignoran', () => {
  const m = computeMembership([cuota(1, 'PENDIENTE', '2030-06-01', '2030-06-30')], now);
  assert.equal(m.estado, 'SIN_MEMBRESIA');
  assert.equal(m.solicitudPendiente, true);
});

test('nunca tuvo cuota => SIN_MEMBRESIA', () => {
  assert.deepEqual(computeMembership([], now), { estado: 'SIN_MEMBRESIA', cuota: null, solicitudPendiente: false, solicitudesPendientes: [] });
});

test('"hoy" se calcula en Buenos Aires: 01:00 UTC del 11/06 todavía es el 10/06 a la noche en Argentina', () => {
  const lateNight = new Date('2030-06-11T01:00:00Z');
  assert.equal(computeMembership([cuota(1, 'ACTIVA', '2030-06-01', '2030-06-10')], lateNight).cuota.diasRestantes, 0);
});

test('regla única de fechas: la cuota arranca el día del pago (Buenos Aires) y vence inicio + duración', () => {
  const iso = (date) => date.toISOString().slice(0, 10);
  const period = quotaPeriod(new Date('2030-06-10T15:00:00Z'), 30);
  assert.equal(iso(period.fechaInicio), '2030-06-10');
  assert.equal(iso(period.fechaVencimiento), '2030-07-10');
  // 02:30 UTC del 11/06 son las 23:30 del 10/06 en Buenos Aires: el día del pago es el 10.
  assert.equal(iso(quotaPeriod(new Date('2030-06-11T02:30:00Z'), 30).fechaInicio), '2030-06-10');
  // 03:00 UTC del 11/06 ya es medianoche del 11/06 en Buenos Aires.
  assert.equal(iso(quotaPeriod(new Date('2030-06-11T03:00:00Z'), 30).fechaInicio), '2030-06-11');
});

test('estados de pago de Mercado Pago', () => {
  assert.equal(paymentOutcome('approved'), 'APROBADO');
  for (const status of ['pending', 'in_process', 'authorized']) assert.equal(paymentOutcome(status), 'PENDIENTE');
  for (const status of ['rejected', 'cancelled']) assert.equal(paymentOutcome(status), 'RECHAZADO');
});

test('firma del webhook: válida, alterada, sin secret', () => {
  const secret = 'clave-de-prueba';
  const ts = '1700000000';
  const sign = (dataId, requestId) => crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  const args = { dataId: '123456', requestId: 'req-1', secret };
  assert.equal(verifyWebhookSignature({ ...args, signature: `ts=${ts},v1=${sign('123456', 'req-1')}` }), true);
  assert.equal(verifyWebhookSignature({ ...args, signature: `ts=${ts},v1=${sign('999', 'req-1')}` }), false);
  assert.equal(verifyWebhookSignature({ ...args, signature: 'basura' }), false);
  assert.equal(verifyWebhookSignature({ ...args, secret: '', signature: `ts=${ts},v1=${sign('123456', 'req-1')}` }), false);
});
