// Integración contra la BD real (.env): pagos con Mercado Pago (API MOCKEADA, nunca se llama a la real), recepción,
// ingresos del admin, conciliación, racha de recepción y recetas con información nutricional.
// Crea filas temporales (prefijo TEST-PAG, fechas de 2030 para los ingresos) y las borra al terminar.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import http from 'node:http';
import express from 'express';
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import * as payments from '../src/services/membership-payments.service.js';
import * as quotas from '../src/services/quotas.service.js';
import * as clients from '../src/services/clients.service.js';
import * as ingresos from '../src/services/ingresos.service.js';
import * as receipts from '../src/services/payment-receipts.service.js';
import * as client from '../src/services/cliente.service.js';
import * as content from '../src/services/cliente-content.service.js';
import * as recipes from '../src/services/recipes.service.js';
import pagosRoutes from '../src/routes/pagos.routes.js';
import { errorHandler } from '../src/middlewares/error.middleware.js';
import { generateExpiryReminders } from '../src/services/notification-scheduler.js';
import { gymTodayMs } from '../src/utils/timezone.js';

const realFetch = globalThis.fetch;
let reachable = true;
const suffix = Date.now();
const created = { users: [], clients: [], professors: [] };
let prof;
let plan;
let cashMethod;

const ctx = (c) => ({ ...c, estadoCliente: c.estadoCliente ?? { nombre: 'HABILITADO' } });
const mpResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const guard = (name, fn) => test(name, async (t) => (reachable ? fn(t) : t.skip('BD no disponible')));
const rejectsWith = (status, code) => (error) => error.statusCode === status && error.code === code;
const iso = (date) => date.toISOString().slice(0, 10);

// Mock de Mercado Pago: `handler(url, options)` devuelve el cuerpo; las llamadas a 127.0.0.1 (servidor del test) pasan.
const mockMp = (t, handler) =>
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, options);
    const body = await handler(String(url), options);
    return body instanceof Response ? body : mpResponse(body ?? {});
  });
const prefOk = () => ({ id: 'pref-test', init_point: 'https://mp.test/pay' });

const mkClient = async (tag, { estado = 'HABILITADO', racha = null } = {}) => {
  const rol = await prisma.rol.findUnique({ where: { nombre: 'CLIENTE' } });
  const state = await prisma.estadoCliente.findUnique({ where: { nombre: estado } });
  const user = await prisma.usuario.create({ data: { rolId: rol.id, nombre: `Pag${tag}`, apellido: 'Test', email: `tmp-pag-${tag}-${suffix}@test.local`, passwordHash: 'x', activo: true } });
  const row = await prisma.cliente.create({ data: { usuarioId: user.id, estadoClienteId: state.id, objetivoDiasRacha: racha } });
  created.users.push(user.id);
  created.clients.push(row.id);
  return { ...row, estadoCliente: state, usuario: user };
};

const usedPaymentIds = new Set();
const approved = (cuotaId, over = {}) => {
  const payment = buildApproved(cuotaId, over);
  usedPaymentIds.add(String(payment.id));
  return payment;
};
const buildApproved = (cuotaId, over = {}) => ({
  id: 770000000 + cuotaId,
  status: 'approved',
  status_detail: 'accredited',
  currency_id: 'ARS',
  transaction_amount: 10000,
  external_reference: String(cuotaId),
  date_approved: new Date().toISOString(),
  payment_type_id: 'credit_card',
  payment_method_id: 'visa',
  card: { last_four_digits: '3704', cardholder: { name: 'APRO' } },
  transaction_details: { net_received_amount: 9500 },
  fee_details: [{ type: 'mercadopago_fee', amount: 500, fee_payer: 'collector' }],
  metadata: { cuota_id: cuotaId, expected_amount: 10000 },
  ...over,
});

const checkout = async (t, c) => {
  mockMp(t, () => prefOk());
  return payments.createCheckout(ctx(c), c.usuario, plan.id);
};

before(async () => {
  try {
    cashMethod = await prisma.metodoPago.findUnique({ where: { nombre: 'EFECTIVO' } });
    const rolP = await prisma.rol.findUnique({ where: { nombre: 'PROFESOR' } });
    const user = await prisma.usuario.create({ data: { rolId: rolP.id, nombre: 'ProfPag', apellido: 'Test', email: `tmp-profpag-${suffix}@test.local`, passwordHash: 'x', activo: true } });
    created.users.push(user.id);
    prof = await prisma.profesor.create({ data: { usuarioId: user.id, estadoCuentaStaffId: 1 } });
    plan = await prisma.plan.create({ data: { nombre: `TEST-PAG plan ${suffix}`, duracionDias: 30, precio: 10000 } });
  } catch {
    reachable = false;
  }
});

after(async () => {
  if (!reachable) return;
  const clientIds = created.clients;
  const quotaRows = await prisma.cuota.findMany({ where: { clienteId: { in: clientIds } }, select: { id: true } });
  const quotaIds = quotaRows.map((row) => row.id);
  await prisma.notificacion.deleteMany({ where: { usuarioId: { in: created.users } } });
  await prisma.mpEventoPago.deleteMany({ where: { OR: [{ cuotaId: { in: quotaIds } }, { mpPaymentId: { in: [...usedPaymentIds] } }, { mpPaymentId: { startsWith: 'TESTPAG' } }] } });
  await prisma.pago.deleteMany({ where: { cuotaId: { in: quotaIds } } });
  await prisma.cuota.deleteMany({ where: { clienteId: { in: clientIds } } });
  await prisma.asistencia.deleteMany({ where: { clienteId: { in: clientIds } } });
  const recipeRows = await prisma.receta.findMany({ where: { nombre: { startsWith: 'TEST-PAG' } }, select: { id: true } });
  const recipeIds = recipeRows.map((row) => row.id);
  await prisma.ingredienteReceta.deleteMany({ where: { recetaId: { in: recipeIds } } });
  await prisma.pasoReceta.deleteMany({ where: { recetaId: { in: recipeIds } } });
  await prisma.receta.deleteMany({ where: { id: { in: recipeIds } } });
  await prisma.promocion.deleteMany({ where: { planId: plan.id } });
  await prisma.plan.deleteMany({ where: { nombre: { startsWith: 'TEST-PAG' } } });
  await prisma.cliente.deleteMany({ where: { id: { in: clientIds } } });
  await prisma.profesor.deleteMany({ where: { id: prof.id } });
  await prisma.usuario.deleteMany({ where: { id: { in: created.users } } });
  await prisma.$disconnect();
});

// ------------------------------- Pago aprobado -------------------------------

guard('aprobado: pago con bruto/neto/comisión/medio, cuota ACTIVA, cuota anterior VENCIDA, cliente habilitado, evento y notificación', async (t) => {
  const c = await mkClient('apr', { estado: 'INHABILITADO_PAGO' });
  const active = await prisma.estadoCuota.findUnique({ where: { nombre: 'ACTIVA' } });
  const dayMs = 86_400_000;
  const today = gymTodayMs();
  const previous = await prisma.cuota.create({ data: { clienteId: c.id, planId: plan.id, estadoCuotaId: active.id, fechaInicio: new Date(today - 28 * dayMs), fechaVencimiento: new Date(today + 2 * dayMs) } });

  const { cuotaId, resumen } = await checkout(t, c);
  assert.equal(resumen.monto, 10000);
  const payment = approved(cuotaId);
  mockMp(t, () => payment);
  const result = await payments.handleWebhookPayment(String(payment.id));
  assert.equal(result.estado, 'APROBADO');
  assert.equal(result.comprobante.numeroOperacion, String(payment.id));

  const cuota = await prisma.cuota.findUnique({ where: { id: cuotaId }, include: { estadoCuota: true, pago: { include: { metodoPago: true } } } });
  assert.equal(cuota.estadoCuota.nombre, 'ACTIVA');
  assert.equal(iso(cuota.fechaInicio), iso(new Date(today)));
  // Renovación anticipada: los 2 días que le quedaban se suman a los 30 del plan.
  assert.equal(iso(cuota.fechaVencimiento), iso(new Date(today + 32 * dayMs)));
  const pago = cuota.pago;
  assert.equal(pago.metodoPago.nombre, 'MERCADO_PAGO');
  assert.equal(Number(pago.monto), 10000);
  assert.equal(Number(pago.montoNeto), 9500);
  assert.equal(Number(pago.comision), 500);
  assert.equal(pago.medioPago, 'Tarjeta de crédito VISA');
  assert.equal(pago.ultimosDigitos, '3704');
  assert.equal(pago.referenciaExterna, String(payment.id));
  assert.ok(!JSON.stringify(pago).includes('APRO')); // no se guardan datos del titular

  const old = await prisma.cuota.findUnique({ where: { id: previous.id }, include: { estadoCuota: true } });
  assert.equal(old.estadoCuota.nombre, 'VENCIDA');
  assert.equal(old.fechaInicio.getTime(), previous.fechaInicio.getTime());
  assert.equal(old.fechaVencimiento.getTime(), previous.fechaVencimiento.getTime());
  assert.equal((await prisma.cliente.findUnique({ where: { id: c.id }, include: { estadoCliente: true } })).estadoCliente.nombre, 'HABILITADO');

  const events = await prisma.mpEventoPago.findMany({ where: { mpPaymentId: String(payment.id) } });
  assert.equal(events.length, 1);
  assert.equal(events[0].origen, 'WEBHOOK');
  assert.equal(events[0].procesado, true);
  assert.equal(events[0].estado, 'approved');
  assert.equal(JSON.stringify(events[0].payloadResumen).includes('3704'), false); // el resumen no lleva datos de tarjeta

  const notices = await prisma.notificacion.findMany({ where: { usuarioId: c.usuarioId, tipoNotificacion: { nombre: 'PAGO_ACREDITADO' } } });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].claveDedup, `pago:${payment.id}`);
});

guard('notificación repetida (webhook + vuelta + webhook): un solo pago y una sola notificación', async (t) => {
  const c = await mkClient('dup');
  const { cuotaId } = await checkout(t, c);
  const payment = approved(cuotaId);
  mockMp(t, () => payment);
  const first = await payments.handleWebhookPayment(String(payment.id));
  const second = await payments.verifyReturn(ctx(c), { payment_id: String(payment.id), status: 'rejected' });
  const third = await payments.handleWebhookPayment(String(payment.id));
  assert.equal(first.yaProcesado, false);
  assert.equal(second.yaProcesado, true);
  assert.equal(third.yaProcesado, true);
  assert.equal(await prisma.pago.count({ where: { cuotaId } }), 1);
  assert.equal(await prisma.notificacion.count({ where: { usuarioId: c.usuarioId, tipoNotificacion: { nombre: 'PAGO_ACREDITADO' } } }), 1);
  assert.equal(await prisma.mpEventoPago.count({ where: { mpPaymentId: String(payment.id) } }), 3); // cada aviso queda auditado
});

guard('concurrencia: dos confirmaciones simultáneas del mismo pago => un solo pago', async (t) => {
  const c = await mkClient('conc');
  const { cuotaId } = await checkout(t, c);
  const payment = approved(cuotaId);
  mockMp(t, () => payment);
  const results = await Promise.allSettled([payments.handleWebhookPayment(String(payment.id)), payments.verifyReturn(ctx(c), { payment_id: String(payment.id) })]);
  assert.ok(results.every((r) => r.status === 'fulfilled'));
  assert.equal(await prisma.pago.count({ where: { cuotaId } }), 1);
});

// ------------------------------- Pendiente / rechazado -------------------------------

guard('pendiente: la cuota sigue PENDIENTE con aviso; si luego se aprueba, el webhook la activa aunque el cliente no vuelva', async (t) => {
  const c = await mkClient('pen');
  const { cuotaId } = await checkout(t, c);
  mockMp(t, () => approved(cuotaId, { status: 'in_process', status_detail: 'pending_contingency' }));
  const pending = await payments.verifyReturn(ctx(c), { payment_id: '1' });
  assert.equal(pending.estado, 'PENDIENTE');
  assert.match(pending.mensaje, /Estamos procesando tu pago/);
  assert.equal((await prisma.cuota.findUnique({ where: { id: cuotaId }, include: { estadoCuota: true } })).estadoCuota.nombre, 'PENDIENTE');
  assert.equal(await prisma.pago.count({ where: { cuotaId } }), 0);
  assert.equal((await client.getMembership(c)).solicitudPendiente, true);

  mockMp(t, () => approved(cuotaId));
  assert.equal((await payments.handleWebhookPayment('1')).estado, 'APROBADO');
  assert.equal((await prisma.cuota.findUnique({ where: { id: cuotaId }, include: { estadoCuota: true } })).estadoCuota.nombre, 'ACTIVA');
  const events = await prisma.mpEventoPago.findMany({ where: { cuotaId }, orderBy: { id: 'asc' } });
  assert.deepEqual(events.map((e) => [e.estado, e.origen]), [['in_process', 'VERIFICACION'], ['approved', 'WEBHOOK']]);
});

guard('rechazado: mensaje en español según status_detail, nada se activa y se puede reintentar con otra preferencia', async (t) => {
  const c = await mkClient('rec');
  const first = await checkout(t, c);
  mockMp(t, () => approved(first.cuotaId, { status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' }));
  const rejected = await payments.verifyReturn(ctx(c), { payment_id: '2' });
  assert.equal(rejected.estado, 'RECHAZADO');
  assert.match(rejected.mensaje, /no tiene fondos suficientes/);
  assert.equal(await prisma.pago.count({ where: { cuotaId: first.cuotaId } }), 0);

  const retry = await checkout(t, c); // misma cuota PENDIENTE, preferencia nueva
  assert.equal(retry.cuotaId, first.cuotaId);
  mockMp(t, () => approved(first.cuotaId, { id: 77000099 }));
  assert.equal((await payments.handleWebhookPayment('77000099')).estado, 'APROBADO');
});

// ------------------------------- Seguridad -------------------------------

guard('monto/moneda distintos o cuota inexistente/ajena: no activa, deja el evento inconsistente y avisa', async (t) => {
  const c = await mkClient('seg');
  const other = await mkClient('seg2');
  const { cuotaId } = await checkout(t, c);
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));

  for (const over of [{ transaction_amount: 1 }, { currency_id: 'USD' }]) {
    mockMp(t, () => approved(cuotaId, over));
    await assert.rejects(() => payments.handleWebhookPayment('3'), rejectsWith(409, 'PAGO_NO_COINCIDE'));
  }
  assert.equal(await prisma.pago.count({ where: { cuotaId } }), 0);
  assert.equal((await prisma.cuota.findUnique({ where: { id: cuotaId }, include: { estadoCuota: true } })).estadoCuota.nombre, 'PENDIENTE');
  const bad = await prisma.mpEventoPago.findMany({ where: { cuotaId } });
  assert.ok(bad.length >= 2 && bad.every((e) => e.procesado === false && /INCONSISTENTE:PAGO_NO_COINCIDE/.test(e.detalleEstado)));
  assert.ok(errors.some((line) => /ALERTA/.test(line)));

  mockMp(t, () => approved(cuotaId));
  await assert.rejects(() => payments.verifyReturn(ctx(other), { payment_id: '4' }), { statusCode: 404 }); // cuota de otro cliente
  assert.equal(await prisma.pago.count({ where: { cuotaId } }), 0);

  mockMp(t, () => approved(999999999, { id: 'TESTPAG-1' }));
  await assert.rejects(() => payments.handleWebhookPayment('TESTPAG-1'), rejectsWith(404, 'CUOTA_NO_ENCONTRADA'));
  const orphan = await prisma.mpEventoPago.findFirst({ where: { mpPaymentId: 'TESTPAG-1' } });
  assert.equal(orphan.cuotaId, null);
});

const startWebhookServer = async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/pagos', pagosRoutes);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/api/pagos/mercadopago/webhook` };
};

guard('webhook: firma inválida o vencida => 401 sin procesar; firma válida => 200 y pago acreditado', async (t) => {
  const c = await mkClient('web');
  const { cuotaId } = await checkout(t, c);
  const payment = approved(cuotaId);
  mockMp(t, () => payment);
  const { server, url } = await startWebhookServer();
  const previousSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  process.env.MERCADOPAGO_WEBHOOK_SECRET = 'secreto-de-prueba';
  try {
    const sign = (ts, dataId = payment.id, requestId = 'req-1', secret = 'secreto-de-prueba') =>
      `ts=${ts},v1=${crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex')}`;
    const call = (signature) =>
      realFetch(`${url}?type=payment&data.id=${payment.id}`, { method: 'POST', headers: { 'x-signature': signature, 'x-request-id': 'req-1', 'content-type': 'application/json' }, body: '{}' });

    const forged = await call(sign(Date.now(), payment.id, 'req-1', 'otro-secreto'));
    assert.equal(forged.status, 401);
    const old = await call(sign(Date.now() - 3_600_000)); // firma correcta pero de hace 1 hora
    assert.equal(old.status, 401);
    const missing = await realFetch(`${url}?type=payment&data.id=${payment.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(missing.status, 401);
    assert.equal(await prisma.pago.count({ where: { cuotaId } }), 0);
    assert.equal(await prisma.mpEventoPago.count({ where: { cuotaId } }), 0);

    const ok = await call(sign(Date.now()));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).estado, 'APROBADO');
    assert.equal(await prisma.pago.count({ where: { cuotaId } }), 1);
    assert.equal((await call(sign(Date.now()))).status, 200); // reentrega: idempotente
    assert.equal(await prisma.pago.count({ where: { cuotaId } }), 1);
  } finally {
    if (previousSecret === undefined) delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    else process.env.MERCADOPAGO_WEBHOOK_SECRET = previousSecret;
    server.close();
  }
});

// ------------------------------- Regla de fechas -------------------------------

guard('fechas: la membresía arranca el día de APROBACIÓN en Buenos Aires (23:30 local vs medianoche), no el del intento', async (t) => {
  const early = await mkClient('f1');
  const late = await mkClient('f2');
  const a = await checkout(t, early);
  const b = await checkout(t, late);
  // 02:30 UTC del 05/03/2030 = 23:30 del 04/03 en Buenos Aires; 03:00 UTC = 00:00 del 05/03.
  mockMp(t, () => approved(a.cuotaId, { date_approved: '2030-03-05T02:30:00.000Z' }));
  await payments.handleWebhookPayment('x');
  mockMp(t, () => approved(b.cuotaId, { date_approved: '2030-03-05T03:00:00.000Z' }));
  await payments.handleWebhookPayment('y');
  const qa = await prisma.cuota.findUnique({ where: { id: a.cuotaId }, include: { pago: true } });
  const qb = await prisma.cuota.findUnique({ where: { id: b.cuotaId }, include: { pago: true } });
  assert.equal(iso(qa.fechaInicio), '2030-03-04');
  assert.equal(iso(qa.fechaVencimiento), '2030-04-03');
  assert.equal(iso(qb.fechaInicio), '2030-03-05');
  assert.equal(qa.pago.fechaPago.toISOString(), '2030-03-05T02:30:00.000Z');
});

guard('recepción y Mercado Pago aplican la MISMA regla: mismas fechas para el mismo instante de pago', async (t) => {
  const viaMp = await mkClient('p1');
  const viaCash = await mkClient('p2');
  const instant = new Date('2030-08-10T15:00:00.000Z');
  const mp = await checkout(t, viaMp);
  mockMp(t, () => approved(mp.cuotaId, { date_approved: instant.toISOString() }));
  await payments.handleWebhookPayment('z');

  const pending = await prisma.estadoCuota.findUnique({ where: { nombre: 'PENDIENTE' } });
  const cash = await prisma.cuota.create({ data: { clienteId: viaCash.id, planId: plan.id, estadoCuotaId: pending.id, fechaInicio: new Date('2030-01-01'), fechaVencimiento: new Date('2030-01-31') } });
  await quotas.confirmQuotaPayment(cash.id, cashMethod.id, null, undefined, instant);

  const q1 = await prisma.cuota.findUnique({ where: { id: mp.cuotaId } });
  const q2 = await prisma.cuota.findUnique({ where: { id: cash.id } });
  assert.equal(q1.fechaInicio.getTime(), q2.fechaInicio.getTime());
  assert.equal(q1.fechaVencimiento.getTime(), q2.fechaVencimiento.getTime());
  assert.equal(iso(q2.fechaInicio), '2030-08-10');
});

guard('recepción en efectivo: neto = monto, comisión 0, cuota anterior VENCIDA y notificación', async () => {
  const c = await mkClient('efe');
  const active = await prisma.estadoCuota.findUnique({ where: { nombre: 'ACTIVA' } });
  const pending = await prisma.estadoCuota.findUnique({ where: { nombre: 'PENDIENTE' } });
  const old = await prisma.cuota.create({ data: { clienteId: c.id, planId: plan.id, estadoCuotaId: active.id, fechaInicio: new Date('2030-01-01'), fechaVencimiento: new Date('2030-01-31') } });
  const next = await prisma.cuota.create({ data: { clienteId: c.id, planId: plan.id, estadoCuotaId: pending.id, fechaInicio: new Date('2030-02-01'), fechaVencimiento: new Date('2030-03-03') } });
  // el monto lo calcula el backend (precio del plan 10000): un monto manipulado se rechaza y no se cobra otra cosa
  await assert.rejects(() => quotas.confirmQuotaPayment(next.id, cashMethod.id, null, 9000, new Date('2030-02-10T15:00:00Z')), rejectsWith(400, 'MONTO_INVALIDO'));
  await quotas.confirmQuotaPayment(next.id, cashMethod.id, null, undefined, new Date('2030-02-10T15:00:00Z'));
  const pago = await prisma.pago.findUnique({ where: { cuotaId: next.id } });
  assert.equal(Number(pago.monto), 10000);
  assert.equal(Number(pago.montoNeto), 10000);
  assert.equal(Number(pago.comision), 0);
  assert.equal(pago.medioPago, 'Efectivo');
  assert.equal((await prisma.cuota.findUnique({ where: { id: old.id }, include: { estadoCuota: true } })).estadoCuota.nombre, 'VENCIDA');
  assert.equal(await prisma.notificacion.count({ where: { usuarioId: c.usuarioId, tipoNotificacion: { nombre: 'PAGO_ACREDITADO' } } }), 1);
  await assert.rejects(() => quotas.confirmQuotaPayment(next.id, cashMethod.id), { statusCode: 409 });
});

// ------------------------------- Comprobantes -------------------------------

guard('comprobante: solo el dueño accede; HTML imprimible con datos de la BD y sin HTML inyectado', async (t) => {
  const c = await mkClient('cmp');
  const other = await mkClient('cmp2');
  const { cuotaId } = await checkout(t, c);
  mockMp(t, () => approved(cuotaId));
  await payments.handleWebhookPayment('c');
  const pago = await prisma.pago.findUnique({ where: { cuotaId } });
  const receipt = await receipts.buildReceipt(pago.id, { clienteId: c.id });
  assert.equal(receipt.plan, plan.nombre);
  assert.equal(receipt.monto, 10000);
  assert.equal(receipt.ultimosDigitos, '3704');
  await assert.rejects(() => receipts.buildReceipt(pago.id, { clienteId: other.id }), { statusCode: 404 });
  const html = receipts.renderReceiptHtml({ ...receipt, cliente: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>alert'));
  assert.match(html, /&lt;script&gt;/);
});

// ------------------------------- Mantenimiento -------------------------------

guard('mantenimiento: el sondeo acredita pagos sin webhook; la limpieza elimina/marca solo checkouts vencidos y sin pago', async (t) => {
  const c = await mkClient('mnt');
  const pending = await prisma.estadoCuota.findUnique({ where: { nombre: 'PENDIENTE' } });
  const base = { clienteId: c.id, planId: plan.id, estadoCuotaId: pending.id, fechaInicio: new Date('2030-01-01'), fechaVencimiento: new Date('2030-01-31') };
  const longAgo = new Date(Date.now() - 20 * 86_400_000);
  const clean = await prisma.cuota.create({ data: { ...base, mpExpiraEn: longAgo } });
  const audited = await prisma.cuota.create({ data: { ...base, mpExpiraEn: longAgo } });
  await prisma.mpEventoPago.create({ data: { mpPaymentId: 'TESTPAG-2', cuotaId: audited.id, estado: 'rejected', origen: 'VERIFICACION' } });
  const reception = await prisma.cuota.create({ data: base }); // pendiente del alta en recepción: sin mp_expira_en
  const live = await prisma.cuota.create({ data: { ...base, mpExpiraEn: new Date(Date.now() + 3_600_000) } });

  mockMp(t, (url) => (url.includes('/v1/payments/search') ? { results: [] } : {}));
  const outcome = await payments.cleanupExpiredCheckouts();
  assert.ok(outcome.removed >= 1 && outcome.marked >= 1);
  assert.equal(await prisma.cuota.count({ where: { id: clean.id } }), 0);
  assert.equal((await prisma.cuota.findUnique({ where: { id: audited.id }, include: { estadoCuota: true } })).estadoCuota.nombre, 'VENCIDA');
  assert.ok(await prisma.cuota.findUnique({ where: { id: reception.id } }));
  assert.equal((await prisma.cuota.findUnique({ where: { id: live.id }, include: { estadoCuota: true } })).estadoCuota.nombre, 'PENDIENTE');

  // El sondeo encuentra el pago aprobado de la cuota viva y la activa; no repite eventos idénticos.
  mockMp(t, (url) => (url.includes('/v1/payments/search') ? { results: [approved(live.id, { id: 77000500 })] } : {}));
  assert.ok((await payments.syncPendingCheckouts()) >= 1);
  assert.equal((await prisma.cuota.findUnique({ where: { id: live.id }, include: { estadoCuota: true } })).estadoCuota.nombre, 'ACTIVA');
  await payments.syncPendingCheckouts();
  assert.equal(await prisma.pago.count({ where: { cuotaId: live.id } }), 1);

  // Un pago que se aprueba tarde sobre una solicitud ya marcada VENCIDA la revive y la activa.
  mockMp(t, () => approved(audited.id, { id: 77000501 }));
  assert.equal((await payments.handleWebhookPayment('77000501')).estado, 'APROBADO');
  assert.equal((await prisma.cuota.findUnique({ where: { id: audited.id }, include: { estadoCuota: true } })).estadoCuota.nombre, 'ACTIVA');
});

// ------------------------------- Ingresos (Admin) -------------------------------

const mkPayment = async (c, { at, bruto, neto = null, comision = null, method = 'MERCADO_PAGO', ref = null, planRef = plan }) => {
  const state = await prisma.estadoCuota.findUnique({ where: { nombre: 'VENCIDA' } });
  const metodo = await prisma.metodoPago.findUnique({ where: { nombre: method } });
  const cuota = await prisma.cuota.create({ data: { clienteId: c.id, planId: planRef.id, estadoCuotaId: state.id, fechaInicio: new Date('2030-05-01'), fechaVencimiento: new Date('2030-05-31') } });
  return prisma.pago.create({ data: { cuotaId: cuota.id, metodoPagoId: metodo.id, monto: bruto, montoNeto: neto, comision, fechaPago: new Date(at), referenciaExterna: ref } });
};

guard('ingresos: límites de día/mes en Buenos Aires (23:30 local = mes anterior), bruto/comisión/neto, ticket y desglose', async () => {
  const c = await mkClient('ing');
  const plan2 = await prisma.plan.create({ data: { nombre: `TEST-PAG plan2 ${suffix}`, duracionDias: 90, precio: 30000 } });
  // 02:30Z del 01/06 = 23:30 del 31/05 (mayo); 02:59:59Z también; 03:00:00Z ya es 01/06 (junio).
  await mkPayment(c, { at: '2030-06-01T02:30:00Z', bruto: 10000, neto: 9500, comision: 500 });
  await mkPayment(c, { at: '2030-06-01T02:59:59Z', bruto: 4000, method: 'EFECTIVO', neto: 4000, comision: 0 });
  await mkPayment(c, { at: '2030-06-01T03:00:00Z', bruto: 30000, neto: 28500, comision: 1500, planRef: plan2 });
  await mkPayment(c, { at: '2030-06-15T15:00:00Z', bruto: 6000, method: 'EFECTIVO' }); // sin neto/comisión (dato viejo): neto = bruto

  const now = new Date('2030-06-15T18:00:00Z');
  const summary = await ingresos.getSummary({ desde: '2030-05-31', hasta: '2030-06-01' }, now);
  assert.deepEqual([summary.hoy.cantidad, summary.hoy.bruto], [1, 6000]);
  assert.deepEqual([summary.mes.desde, summary.mes.cantidad, summary.mes.bruto], ['2030-06-01', 2, 36000]);
  assert.equal(summary.mes.comisiones, 1500);
  assert.equal(summary.mes.neto, 34500);
  assert.equal(summary.mes.ticketPromedio, 18000);
  assert.deepEqual([summary.mesAnterior.desde, summary.mesAnterior.hasta, summary.mesAnterior.cantidad, summary.mesAnterior.bruto], ['2030-05-01', '2030-05-31', 2, 14000]);
  assert.deepEqual([summary.rango.cantidad, summary.rango.bruto], [3, 44000]); // 31/05 (2 pagos) + 01/06 (1 pago)

  const breakdown = await ingresos.getBreakdown({ desde: '2030-05-01', hasta: '2030-06-30' }, now);
  assert.equal(breakdown.total.bruto, 50000);
  const mp = breakdown.porMetodo.find((row) => row.clave === 'MERCADO_PAGO');
  assert.deepEqual([mp.cantidad, mp.bruto, mp.porcentaje], [2, 40000, 80]);
  assert.equal(breakdown.porMetodo.find((row) => row.clave === 'EFECTIVO').porcentaje, 20);
  assert.equal(breakdown.porPlan.find((row) => row.nombre === plan2.nombre).bruto, 30000);

  const daily = await ingresos.getChart({ desde: '2030-05-30', hasta: '2030-06-02' }, now);
  assert.equal(daily.agrupacion, 'dia');
  assert.deepEqual(daily.puntos.map((p) => [p.clave, p.bruto]), [['2030-05-30', 0], ['2030-05-31', 14000], ['2030-06-01', 30000], ['2030-06-02', 0]]);
  assert.equal(daily.puntos[1].neto, 13500);
  const monthly = await ingresos.getChart({ desde: '2030-01-01', hasta: '2030-06-30' }, now);
  assert.equal(monthly.agrupacion, 'mes');
  assert.equal(monthly.puntos.length, 6);
  assert.deepEqual(monthly.puntos.slice(-2).map((p) => [p.clave, p.bruto]), [['2030-05', 14000], ['2030-06', 36000]]);

  const empty = await ingresos.getSummary({ desde: '2031-01-01', hasta: '2031-01-31' }, now);
  assert.deepEqual([empty.rango.cantidad, empty.rango.bruto, empty.rango.ticketPromedio], [0, 0, 0]);
  await assert.rejects(() => ingresos.getSummary({ desde: '2030-06-02', hasta: '2030-06-01' }, now), { statusCode: 400 });
  await assert.rejects(() => ingresos.getSummary({ desde: '2030-6-2', hasta: '2030-06-01' }, now), { statusCode: 400 });
});

guard('ingresos: listado paginado, ordenable y filtrable; detalle; CSV con los filtros y a prueba de fórmulas', async () => {
  const c = await mkClient('lst');
  await mkPayment(c, { at: '2031-03-10T15:00:00Z', bruto: 1000, ref: 'TESTPAG-A' });
  await mkPayment(c, { at: '2031-03-11T15:00:00Z', bruto: 3000, method: 'EFECTIVO', ref: '=HYPERLINK("x")' });
  await mkPayment(c, { at: '2031-03-12T15:00:00Z', bruto: 2000, ref: 'TESTPAG-C' });
  const range = { desde: '2031-03-01', hasta: '2031-03-31' };

  const all = await ingresos.listPayments({ ...range, orden: 'bruto', dir: 'desc', limit: '2', page: '1' });
  assert.deepEqual(all.items.map((row) => row.bruto), [3000, 2000]);
  assert.equal(all.pagination.total, 3);
  assert.equal(all.pagination.totalPages, 2);
  const page2 = await ingresos.listPayments({ ...range, orden: 'bruto', dir: 'desc', limit: '2', page: '2' });
  assert.deepEqual(page2.items.map((row) => row.bruto), [1000]);

  const onlyCash = await ingresos.listPayments({ ...range, metodo: 'EFECTIVO' });
  assert.equal(onlyCash.items.length, 1);
  assert.equal((await ingresos.listPayments({ ...range, q: 'TESTPAG-C' })).items[0].bruto, 2000);
  assert.equal((await ingresos.listPayments({ ...range, q: `tmp-pag-lst-${suffix}` })).items.length, 3);
  assert.equal((await ingresos.listPayments({ ...range, q: 'no-existe-xyz' })).items.length, 0);

  const detail = await ingresos.getPayment(all.items[0].id);
  assert.equal(detail.cliente.email, `tmp-pag-lst-${suffix}@test.local`);
  await assert.rejects(() => ingresos.getPayment(999999999), { statusCode: 404 });

  const csv = await ingresos.exportPaymentsCsv({ ...range, metodo: 'MERCADO_PAGO', orden: 'bruto', dir: 'asc' });
  assert.ok(csv.startsWith('﻿Fecha (Buenos Aires),Cliente'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 3); // encabezado + 2 pagos de Mercado Pago
  assert.match(lines[1], /,1000\.00,/);
  const full = await ingresos.exportPaymentsCsv(range);
  assert.ok(full.includes("'=HYPERLINK"));
});

guard('pendientes: lista cuotas con intentos rechazados/pendientes y checkouts sin intento, con antigüedad', async (t) => {
  const c = await mkClient('pnd');
  const { cuotaId } = await checkout(t, c);
  mockMp(t, () => approved(cuotaId, { status: 'rejected', status_detail: 'cc_rejected_bad_filled_security_code' }));
  await payments.verifyReturn(ctx(c), { payment_id: '7' });
  const list = await ingresos.listPendingPayments();
  const row = list.items.find((item) => item.cuotaId === cuotaId);
  assert.equal(row.clasificacion, 'RECHAZADO');
  assert.match(row.mensajeMp, /código de seguridad/);
  assert.equal(row.preferenciaVigente, true);
  assert.ok(row.antiguedadHoras >= 0);

  // "Verificar ahora": consulta a MP y procesa por el mismo servicio idempotente
  mockMp(t, (url) => (url.includes('/v1/payments/search') ? { results: [approved(cuotaId, { id: 77000700 })] } : {}));
  assert.equal((await payments.verifyQuotaAsAdmin(cuotaId)).estado, 'APROBADO');
  assert.equal((await payments.verifyQuotaAsAdmin(cuotaId)).yaProcesado, true);
  await assert.rejects(() => payments.verifyQuotaAsAdmin(999999999), { statusCode: 404 });
});

guard('conciliación (solo lectura): detecta pagos en MP sin registro, registros sin pago en MP y montos distintos; ignora ventas ajenas', async (t) => {
  const c = await mkClient('con');
  const at = '2032-04-10T15:00:00.000Z';
  const okPago = await mkPayment(c, { at, bruto: 10000, neto: 9500, comision: 500, ref: '77000801' });
  const diffPago = await mkPayment(c, { at, bruto: 10000, neto: 9500, comision: 500, ref: '77000802' });
  const ghost = await mkPayment(c, { at, bruto: 7000, ref: '77000803' });
  const mpPayment = (id, amount, cuotaId, extra = {}) => ({ id, status: 'approved', transaction_amount: amount, date_approved: at, metadata: cuotaId === null ? {} : { cuota_id: cuotaId }, transaction_details: { net_received_amount: amount }, ...extra });

  const before = await prisma.pago.count();
  mockMp(t, (url) => {
    if (url.includes('/v1/payments/search')) {
      return {
        results: [
          mpPayment(77000801, 10000, okPago.cuotaId, { transaction_details: { net_received_amount: 9500 } }),
          mpPayment(77000802, 9000, diffPago.cuotaId), // monto distinto
          mpPayment(77000804, 5000, 123456), // en MP y NO registrado localmente
          mpPayment(990001, 1234, null), // venta ajena a FitLogic: se ignora
        ],
      };
    }
    if (url.endsWith('/v1/payments/77000803')) return { id: 77000803, status: 'refunded' };
    return {};
  });
  const report = await ingresos.reconcile({ desde: '2032-04-10', hasta: '2032-04-10' });
  assert.equal(report.soloLectura, true);
  assert.deepEqual(report.enMpSinRegistro.map((row) => row.mpPaymentId), ['77000804']);
  assert.deepEqual(report.localSinPagoEnMp.map((row) => [row.pagoId, row.estadoEnMp]), [[ghost.id, 'refunded']]);
  assert.equal(report.montosDistintos.length, 1);
  assert.deepEqual([report.montosDistintos[0].brutoMp, report.montosDistintos[0].brutoLocal], [9000, 10000]);
  assert.equal(report.resumen.pagosAjenosIgnorados, 1);
  assert.equal(report.resumen.conDiferencias, 3);
  assert.equal(await prisma.pago.count(), before); // no corrigió nada
});

// ------------------------------- Racha en el alta de recepción -------------------------------

guard('alta de cliente: racha 1-7 válida se guarda; 0, 8, texto, decimal y booleano se rechazan; sin valor queda NULL (nunca 3)', async () => {
  let n = 0;
  const create = async (value, extra = {}) => {
    n += 1;
    const email = `tmp-pag-alta${n}-${suffix}@test.local`;
    const payload = { nombre: 'Alta', apellido: 'Test', email, password: '123456', telefono: '1111', planId: plan.id, ...extra };
    if (value !== undefined) payload.objetivoDiasRacha = value;
    const row = await clients.createClient(1, payload);
    created.users.push(row.usuarioId);
    created.clients.push(row.id);
    return row;
  };

  assert.equal((await create(5)).objetivoDiasRacha, 5);
  assert.equal((await create('7')).objetivoDiasRacha, 7);
  assert.equal((await create(1)).objetivoDiasRacha, 1);
  for (const invalid of [0, 8, -1, 'abc', 3.5, '3.5', true, [3]]) {
    await assert.rejects(() => create(invalid), rejectsWith(400, 'RACHA_INVALIDA'), `debió rechazar ${JSON.stringify(invalid)}`);
  }
  const blank = await create(undefined);
  assert.equal(blank.objetivoDiasRacha, null);
  const raw = await prisma.$queryRaw`SELECT objetivo_dias_racha AS v FROM cliente WHERE id = ${blank.id}`;
  assert.equal(raw[0].v, null);
  assert.equal((await create('')).objetivoDiasRacha, null);
  assert.equal((await create(null)).objetivoDiasRacha, null);

  // edición: ver y modificar con la misma validación
  const target = await create(2);
  assert.equal((await clients.updateClient(target.id, { objetivoDiasRacha: 6 })).objetivoDiasRacha, 6);
  for (const invalid of [0, 8, 'x', 2.5, null, '']) {
    await assert.rejects(() => clients.updateClient(target.id, { objetivoDiasRacha: invalid }), rejectsWith(400, 'RACHA_INVALIDA'));
  }
  assert.equal((await prisma.cliente.findUnique({ where: { id: target.id } })).objetivoDiasRacha, 6);
  assert.equal((await clients.updateClient(blank.id, { objetivoDiasRacha: 4 })).objetivoDiasRacha, 4); // completar un cliente sin objetivo
});

guard('racha del cliente con objetivo NULL: marca los días asistidos y devuelve objetivoDias null; el perfil no se rompe', async () => {
  const c = await mkClient('rch', { racha: null });
  const at = (date, time) => new Date(`${date}T${time}:00-03:00`);
  await prisma.asistencia.createMany({ data: [{ clienteId: c.id, fechaHora: at('2030-08-12', '08:00') }, { clienteId: c.id, fechaHora: at('2030-08-14', '19:00') }] });
  const streak = await client.getStreak(c, at('2030-08-14', '12:00'));
  assert.equal(streak.objetivoDias, null);
  assert.equal(streak.diasAsistidos, 2);
  assert.deepEqual(streak.dias.map((d) => d.asistio), [true, false, true, false, false, false, false]);
  const profile = await client.getProfile(c, at('2030-08-14', '12:00'));
  assert.equal(profile.cliente.objetivoDiasRacha, null);
  const withGoal = await client.getStreak({ ...c, objetivoDiasRacha: 3 }, at('2030-08-14', '12:00'));
  assert.equal(withGoal.objetivoDias, 3);
});

guard('los avisos de vencimiento siguen funcionando con la nueva regla (sin renovación adelantada)', async () => {
  const c = await mkClient('avs');
  const active = await prisma.estadoCuota.findUnique({ where: { nombre: 'ACTIVA' } });
  const quota = await prisma.cuota.create({ data: { clienteId: c.id, planId: plan.id, estadoCuotaId: active.id, fechaInicio: new Date('2031-01-01'), fechaVencimiento: new Date('2031-01-17') } });
  await generateExpiryReminders(new Date('2031-01-10T15:00:00Z'));
  const notice = await prisma.notificacion.findFirst({ where: { usuarioId: c.usuarioId, claveDedup: `cuota:${quota.id}` } });
  assert.ok(notice);
});

// ------------------------------- Recetas con información nutricional -------------------------------

guard('profesor: crea y edita una receta con todos los campos nutricionales y valida rangos', async () => {
  const category = await prisma.categoriaReceta.findFirst();
  const body = { nombre: 'TEST-PAG completa', categoriaRecetaId: category.id, calorias: 520, proteinasG: '42,5', carbohidratosG: 55, grasasG: 14.04, porciones: 2, otroDatoNutricional: ' Fibra 6g ', ingredientes: [], pasos: [] };
  const createdRecipe = await recipes.createRecipe(prof.id, body);
  assert.deepEqual([createdRecipe.calorias, createdRecipe.proteinasG, createdRecipe.carbohidratosG, createdRecipe.grasasG, createdRecipe.porciones, createdRecipe.otroDatoNutricional], [520, 42.5, 55, 14, 2, 'Fibra 6g']);
  const stored = await prisma.receta.findUnique({ where: { id: createdRecipe.id } });
  assert.equal(Number(stored.proteinasG), 42.5);

  const edited = await recipes.updateRecipe(prof.id, createdRecipe.id, { ...body, proteinasG: 30, porciones: '', otroDatoNutricional: '' });
  assert.deepEqual([edited.proteinasG, edited.porciones, edited.otroDatoNutricional], [30, null, null]);

  for (const bad of [{ calorias: -1 }, { calorias: 1.5 }, { calorias: 'x' }, { proteinasG: -0.1 }, { grasasG: 1000 }, { carbohidratosG: 'abc' }, { porciones: 0 }, { porciones: 2.5 }, { otroDatoNutricional: 'x'.repeat(151) }]) {
    await assert.rejects(() => recipes.createRecipe(prof.id, { ...body, ...bad }), { statusCode: 400 }, `debió rechazar ${JSON.stringify(bad)}`);
  }
  const empty = await recipes.createRecipe(prof.id, { nombre: 'TEST-PAG vacía', categoriaRecetaId: category.id });
  assert.deepEqual([empty.calorias, empty.proteinasG, empty.porciones], [null, null, null]); // "No informado", nunca 0
  await prisma.receta.deleteMany({ where: { id: { in: [createdRecipe.id, empty.id] } } });
});

guard('cliente: detalle con información nutricional y distribución de macros; listado con filtros y orden resueltos en el backend', async () => {
  const category = await prisma.categoriaReceta.findFirst();
  const mk = (nombre, nutrition) => recipes.createRecipe(prof.id, { nombre: `TEST-PAG ${nombre}`, categoriaRecetaId: category.id, ...nutrition });
  const rich = await mk('Pollo rico', { calorias: 500, proteinasG: 40, carbohidratosG: 50, grasasG: 10, porciones: 2, otroDatoNutricional: 'Fibra 6g' });
  const light = await mk('Ensalada liviana', { calorias: 150, proteinasG: 8, carbohidratosG: 12, grasasG: 5 });
  const caloriesOnly = await mk('Solo calorías', { calorias: 300 });
  const none = await mk('Sin datos', {});

  const detail = await content.getRecipe(rich.id);
  assert.deepEqual([detail.calorias, detail.proteinasG, detail.carbohidratosG, detail.grasasG, detail.porciones, detail.otroDatoNutricional], [500, 40, 50, 10, 2, 'Fibra 6g']);
  // 160 + 200 + 90 = 450 kcal por macros => 35,6 % / 44,4 % / 20 %
  assert.deepEqual(detail.distribucionMacros, { proteinas: 35.6, carbohidratos: 44.4, grasas: 20, kcalCalculadas: 450 });
  assert.equal((await content.getRecipe(caloriesOnly.id)).distribucionMacros, null); // faltan macros: sin gráfico
  const noInfo = await content.getRecipe(none.id);
  assert.deepEqual([noInfo.calorias, noInfo.proteinasG, noInfo.porciones], [null, null, null]);

  const names = (list) => list.filter((r) => r.nombre.startsWith('TEST-PAG ')).map((r) => r.nombre.replace('TEST-PAG ', ''));
  assert.deepEqual(names(await content.listRecipes({ q: 'pollo' })), ['Pollo rico']);
  assert.deepEqual(names(await content.listRecipes({ q: 'TEST-PAG', caloriasMax: '300', orden: 'calorias_asc' })), ['Ensalada liviana', 'Solo calorías']); // sin dato no coincide
  assert.deepEqual(names(await content.listRecipes({ q: 'TEST-PAG', proteinasMin: '10' })), ['Pollo rico']);
  assert.deepEqual(names(await content.listRecipes({ q: 'TEST-PAG', orden: 'proteinas_desc' })), ['Pollo rico', 'Ensalada liviana', 'Sin datos', 'Solo calorías']); // sin dato al final
  assert.deepEqual(names(await content.listRecipes({ q: 'TEST-PAG', orden: 'nombre' })), ['Ensalada liviana', 'Pollo rico', 'Sin datos', 'Solo calorías']);
  assert.deepEqual(names(await content.listRecipes({ q: 'TEST-PAG', caloriasMax: '0' })), []);
  await assert.rejects(() => content.listRecipes({ orden: 'azar' }), { statusCode: 400 });
  await assert.rejects(() => content.listRecipes({ caloriasMax: '-5' }), { statusCode: 400 });
  await assert.rejects(() => content.listRecipes({ categoria: 'INEXISTENTE' }), rejectsWith(400, 'CATEGORIA_INVALIDA'));
  void light;
});

// ------------------------------- "Ya pagué, verificar" sin payment_id -------------------------------

const mkPendingQuota = async (c, data = {}) => {
  const pending = await prisma.estadoCuota.findUnique({ where: { nombre: 'PENDIENTE' } });
  return prisma.cuota.create({ data: { clienteId: c.id, planId: plan.id, estadoCuotaId: pending.id, fechaInicio: new Date('2030-01-01'), fechaVencimiento: new Date('2030-01-31'), ...data } });
};
// El buscador de MP devuelve los pagos de la cuota consultada (external_reference de la URL).
const mockSearch = (t, byQuota) =>
  mockMp(t, (url) => {
    const ref = new URL(url).searchParams.get('external_reference');
    return { results: byQuota[ref] ?? [] };
  });

guard('verificar sin payment_id: busca por external_reference y activa la cuota PENDIENTE aunque no tenga datos de checkout (cuota heredada)', async (t) => {
  const c = await mkClient('vsp');
  const legacy = await mkPendingQuota(c); // sin mp_expira_en: la creó una versión anterior del checkout
  mockSearch(t, { [legacy.id]: [approved(legacy.id)] });
  const first = await payments.verifyReturn(ctx(c), {});
  assert.equal(first.estado, 'APROBADO');
  assert.equal(first.cuotaId, legacy.id);
  assert.equal(first.comprobante.numeroOperacion, String(770000000 + legacy.id));
  assert.equal((await prisma.cuota.findUnique({ where: { id: legacy.id }, include: { estadoCuota: true } })).estadoCuota.nombre, 'ACTIVA');
  assert.equal((await client.getMembership(c)).estado, 'ACTIVA');

  // verificar de nuevo: idempotente (sin pagos ni notificaciones duplicados)
  const events = await prisma.mpEventoPago.count({ where: { cuotaId: legacy.id } });
  const again = await payments.verifyReturn(ctx(c), {});
  assert.equal(again.estado === 'APROBADO' || again.estado === 'SIN_PAGO', true);
  assert.equal(await prisma.pago.count({ where: { cuotaId: legacy.id } }), 1);
  assert.equal(await prisma.notificacion.count({ where: { usuarioId: c.usuarioId, tipoNotificacion: { nombre: 'PAGO_ACREDITADO' } } }), 1);
  assert.ok(events >= 1);
  // también por la vía del payment_id (ya procesado)
  mockMp(t, () => approved(legacy.id));
  assert.equal((await payments.verifyReturn(ctx(c), { payment_id: String(770000000 + legacy.id) })).yaProcesado, true);
  assert.equal(await prisma.pago.count({ where: { cuotaId: legacy.id } }), 1);
});

guard('verificar con dos cuotas PENDIENTE (reintentos): revisa todas y activa la que tiene el pago aprobado, no solo la última', async (t) => {
  const c = await mkClient('vdos');
  const older = await mkPendingQuota(c, { mpExpiraEn: new Date(Date.now() + 3_600_000) });
  const newer = await mkPendingQuota(c, { mpExpiraEn: new Date(Date.now() + 3_600_000) });
  mockSearch(t, { [older.id]: [approved(older.id)], [newer.id]: [] });
  const result = await payments.verifyReturn(ctx(c), {});
  assert.equal(result.estado, 'APROBADO');
  assert.equal(result.cuotaId, older.id);
  assert.equal(result.solicitudesRevisadas, 2);
  assert.equal((await prisma.cuota.findUnique({ where: { id: newer.id }, include: { estadoCuota: true } })).estadoCuota.nombre, 'PENDIENTE');
  assert.equal(await prisma.pago.count({ where: { cuotaId: { in: [older.id, newer.id] } } }), 1);
});

guard('verificar sin pago: mensaje claro; pendiente real y rechazado informan su estado; un cobro ajeno con la misma referencia se ignora', async (t) => {
  const c = await mkClient('vmsg');
  const quota = await mkPendingQuota(c);
  mockSearch(t, {});
  const none = await payments.verifyReturn(ctx(c), {});
  assert.equal(none.estado, 'SIN_PAGO');
  assert.match(none.mensaje, /No encontramos un pago para esta compra todavía/);
  assert.equal(none.solicitudesRevisadas, 1);

  // venta ajena de la cuenta vendedora con la misma referencia y sin metadata de FitLogic: no cuenta
  mockSearch(t, { [quota.id]: [approved(quota.id, { id: 1234567, metadata: {} })] });
  assert.equal((await payments.verifyReturn(ctx(c), {})).estado, 'SIN_PAGO');
  assert.equal(await prisma.pago.count({ where: { cuotaId: quota.id } }), 0);

  mockSearch(t, { [quota.id]: [approved(quota.id, { status: 'in_process', status_detail: 'pending_contingency' })] });
  const pending = await payments.verifyReturn(ctx(c), {});
  assert.equal(pending.estado, 'PENDIENTE');
  assert.match(pending.mensaje, /Estamos procesando tu pago/);

  mockSearch(t, { [quota.id]: [approved(quota.id, { status: 'rejected', status_detail: 'cc_rejected_other_reason' })] });
  const rejected = await payments.verifyReturn(ctx(c), {});
  assert.equal(rejected.estado, 'RECHAZADO');
  assert.match(rejected.mensaje, /no pudo procesar el pago/);
});

guard('verificar: si una validación bloquea un pago aprobado se informa el motivo (nunca un "pendiente" mudo)', async (t) => {
  const c = await mkClient('vval');
  const quota = await mkPendingQuota(c);
  t.mock.method(console, 'error', () => {});
  mockSearch(t, { [quota.id]: [approved(quota.id, { transaction_amount: 1, metadata: { cuota_id: quota.id, expected_amount: 10000 } })] });
  await assert.rejects(() => payments.verifyReturn(ctx(c), {}), (error) => error.statusCode === 409 && error.code === 'PAGO_NO_COINCIDE' && /monto o la moneda/.test(error.message));
  assert.equal(await prisma.pago.count({ where: { cuotaId: quota.id } }), 0);
});

guard('descartar una solicitud impaga: borra sin eventos, conserva como VENCIDA con eventos, activa si MP ya la aprobó, bloquea si está en proceso', async (t) => {
  const c = await mkClient('dsc');
  const other = await mkClient('dsc2');
  const clean = await mkPendingQuota(c);
  const audited = await mkPendingQuota(c);
  await prisma.mpEventoPago.create({ data: { mpPaymentId: `TESTPAG-D${audited.id}`, cuotaId: audited.id, estado: 'rejected', origen: 'VERIFICACION' } });
  const paid = await mkPendingQuota(c);
  const processing = await mkPendingQuota(c);

  mockSearch(t, { [clean.id]: [], [audited.id]: [], [paid.id]: [approved(paid.id)], [processing.id]: [approved(processing.id, { status: 'pending', status_detail: 'pending_waiting_payment' })] });
  await assert.rejects(() => payments.discardRequest(ctx(other), clean.id), { statusCode: 404 }); // solicitud de otro cliente

  assert.equal((await payments.discardRequest(ctx(c), clean.id)).estado, 'DESCARTADA');
  assert.equal(await prisma.cuota.count({ where: { id: clean.id } }), 0);
  await payments.discardRequest(ctx(c), audited.id);
  assert.equal((await prisma.cuota.findUnique({ where: { id: audited.id }, include: { estadoCuota: true } })).estadoCuota.nombre, 'VENCIDA');
  assert.equal((await payments.discardRequest(ctx(c), paid.id)).estado, 'APROBADO'); // ya estaba aprobada en MP: se activa, no se descarta
  await assert.rejects(() => payments.discardRequest(ctx(c), processing.id), rejectsWith(409, 'PAGO_EN_PROCESO'));
});
