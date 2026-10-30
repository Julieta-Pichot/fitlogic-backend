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

// ------------------------------- Estado único de la membresía (computeMembershipStatus) -------------------------------

import { computeMembershipStatus, assertCanPay } from '../src/utils/membership.js';
import { DIAS_ANTICIPACION_RENOVACION } from '../src/constants/index.js';

const status = (cuotas, at = now) => computeMembershipStatus(cuotas, at);
// Membresía ACTIVA que vence dentro de `days` días (hoy del test = 2030-06-10).
const activeIn = (days) => cuota(1, 'ACTIVA', '2030-05-01', new Date(Date.UTC(2030, 5, 10 + days)).toISOString().slice(0, 10));

test('la anticipación de renovación es una sola constante: 3 días', () => {
  assert.equal(DIAS_ANTICIPACION_RENOVACION, 3);
});

test('activa con 90 y con 4 días: no se puede renovar ni registrar pago, con fecha y días para habilitarse', () => {
  for (const days of [90, 4]) {
    const m = status([activeIn(days)]);
    assert.equal(m.estadoMembresia, 'activa');
    assert.equal(m.renovacion.permitida, false);
    assert.equal(m.renovacion.diasParaRenovar, days - 3);
    assert.throws(() => assertCanPay(m), (error) => error.statusCode === 409 && error.code === 'MEMBRESIA_VIGENTE');
  }
  const m = status([activeIn(4)]);
  assert.equal(m.renovacion.renovableDesde, '2030-06-11');
  assert.match(m.renovacion.mensajeRecepcion, /vigente hasta el 14\/06\/2030\. Podrás registrar un nuevo pago desde el 11\/06\/2030/);
  assert.match(m.renovacion.mensajeCliente, /Podrás renovar a partir del 11\/06\/2030 \(faltan 1 día\)/);
});

test('con exactamente 3, 2 y 0 días restantes queda por_vencer y se habilita', () => {
  for (const days of [3, 2, 1, 0]) {
    const m = status([activeIn(days)]);
    assert.equal(m.estadoMembresia, 'por_vencer', `${days} días`);
    assert.equal(m.renovacion.permitida, true);
    assert.doesNotThrow(() => assertCanPay(m));
  }
});

test('vencida: se habilita; vencida ayer cuenta como vencida (comparación por fecha, no por hora)', () => {
  const m = status([cuota(1, 'ACTIVA', '2030-05-01', '2030-06-09')]);
  assert.equal(m.estadoMembresia, 'vencida');
  assert.equal(m.renovacion.permitida, true);
});

test('el borde del día usa hora de Buenos Aires: a las 22:00 del 10/06 (01:00 UTC del 11) el que vence el 13 todavía tiene 3 días', () => {
  const lateNight = new Date('2030-06-11T01:00:00Z');
  const m = status([cuota(1, 'ACTIVA', '2030-05-01', '2030-06-13')], lateNight);
  assert.equal(m.diasRestantes, 3);
  assert.equal(m.estadoMembresia, 'por_vencer');
});

test('plan elegido sin pago => pendiente_pago (no sin_plan) con plan, antigüedad y origen; sin cuotas => sin_plan', () => {
  const pending = { ...cuota(7, 'PENDIENTE', '2030-06-07', '2030-07-07'), mpExpiraEn: null, mpPreferenceId: null };
  const m = status([pending]);
  assert.equal(m.estadoMembresia, 'pendiente_pago');
  assert.equal(m.estado, 'SIN_MEMBRESIA'); // el estado histórico no cambia
  assert.deepEqual([m.pendiente.cuotaId, m.pendiente.plan.nombre, m.pendiente.desde, m.pendiente.diasEspera, m.pendiente.origen], [7, 'Mensual', '2030-06-07', 3, 'RECEPCION']);
  assert.equal(m.puedeVerificarPago, false); // se paga en recepción: no hay nada que verificar
  assert.equal(m.renovacion.permitida, true);
  assert.equal(status([]).estadoMembresia, 'sin_plan');
  const online = status([{ ...pending, mpExpiraEn: new Date('2030-06-12T00:00:00Z') }]);
  assert.equal(online.pendiente.origen, 'MERCADOPAGO');
  assert.equal(online.puedeVerificarPago, true);
});

test('vencida + plan pendiente => pendiente_pago; activa + renovación pendiente => sigue activa', () => {
  const pending = cuota(9, 'PENDIENTE', '2030-06-09', '2030-07-09');
  assert.equal(status([cuota(1, 'ACTIVA', '2030-05-01', '2030-06-01'), pending]).estadoMembresia, 'pendiente_pago');
  const active = status([activeIn(40), pending]);
  assert.equal(active.estadoMembresia, 'activa');
  assert.equal(active.renovacion.permitida, false);
  assert.equal(active.solicitudPendiente, true);
});

test('con varias pendientes manda la más reciente (no se acumulan en pantalla)', () => {
  const m = status([cuota(3, 'PENDIENTE', '2030-06-01', '2030-07-01'), cuota(8, 'PENDIENTE', '2030-06-09', '2030-07-09')]);
  assert.equal(m.pendiente.cuotaId, 8);
});

test('renovación anticipada: el vencimiento se suma al vigente; si ya venció, cuenta desde hoy', () => {
  const iso = (date) => date.toISOString().slice(0, 10);
  const ms = (day) => Date.parse(`${day}T00:00:00Z`);
  const early = quotaPeriod(now, 30, ms('2030-06-12'));
  assert.equal(iso(early.fechaInicio), '2030-06-10');
  assert.equal(iso(early.fechaVencimiento), '2030-07-12'); // 12/06 + 30 días, no 10/06 + 30
  assert.equal(iso(quotaPeriod(now, 30, ms('2030-06-10')).fechaVencimiento), '2030-07-10'); // vence hoy
  assert.equal(iso(quotaPeriod(now, 30, ms('2030-06-01')).fechaVencimiento), '2030-07-10'); // ya venció
  assert.equal(iso(quotaPeriod(now, 90, ms('2030-06-12')).fechaVencimiento), '2030-09-10'); // otra duración
  assert.equal(iso(quotaPeriod(now, 30).fechaVencimiento), '2030-07-10');
});
