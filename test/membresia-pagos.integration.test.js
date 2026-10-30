// Integración contra la BD real (.env): estado único de la membresía, plan pendiente del alta en recepción, reemplazo de
// solicitudes, bloqueo de pagos/renovaciones anticipadas, renovación desde el vencimiento, doble envío y lista de pendientes.
// Mercado Pago está MOCKEADO (nunca se llama a la API real). Crea filas con prefijo TEST-MEM y las borra al terminar.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import * as quotas from '../src/services/quotas.service.js';
import * as clients from '../src/services/clients.service.js';
import * as client from '../src/services/cliente.service.js';
import * as payments from '../src/services/membership-payments.service.js';
import * as recepcion from '../src/services/recepcion.service.js';
import { gymTodayMs } from '../src/utils/timezone.js';

const DAY = 86_400_000;
const suffix = Date.now();
const created = { users: [], clients: [] };
let reachable = true;
let plan;
let plan2;
let cash;
let states;

const guard = (name, fn) => test(name, async (t) => (reachable ? fn(t) : t.skip('BD no disponible')));
const iso = (date) => date.toISOString().slice(0, 10);
const inDays = (days) => new Date(gymTodayMs() + days * DAY);
const ctx = (c) => ({ ...c, estadoCliente: c.estadoCliente ?? { nombre: 'HABILITADO' } });
const mpResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const mockPreference = (t) => t.mock.method(globalThis, 'fetch', async () => mpResponse({ id: 'pref-mem', init_point: 'https://mp.test/pay' }));

const mkClient = async (tag) => {
  const rol = await prisma.rol.findUnique({ where: { nombre: 'CLIENTE' } });
  const state = await prisma.estadoCliente.findUnique({ where: { nombre: 'HABILITADO' } });
  const user = await prisma.usuario.create({ data: { rolId: rol.id, nombre: `Mem${tag}`, apellido: 'Test', email: `tmp-mem-${tag}-${suffix}@test.local`, passwordHash: 'x', activo: true } });
  const row = await prisma.cliente.create({ data: { usuarioId: user.id, estadoClienteId: state.id } });
  created.users.push(user.id);
  created.clients.push(row.id);
  return { ...row, estadoCliente: state, usuario: user };
};

// Membresía ACTIVA que vence dentro de `days` días (negativo = ya venció, aunque siga marcada ACTIVA).
const mkActive = (c, days, planRow = plan) =>
  prisma.cuota.create({ data: { clienteId: c.id, planId: planRow.id, estadoCuotaId: states.ACTIVA, fechaInicio: inDays(Math.min(days - 30, -1)), fechaVencimiento: inDays(days) } });
const mkPending = (c, over = {}) =>
  prisma.cuota.create({ data: { clienteId: c.id, planId: plan.id, estadoCuotaId: states.PENDIENTE, fechaInicio: inDays(0), fechaVencimiento: inDays(30), ...over } });
const pay = (c, planRow = plan, now) => quotas.registerReceptionPayment({ clienteId: c.id, planId: planRow.id, metodoPagoId: cash.id }, now);
const vigente = (error) => error.statusCode === 409 && error.code === 'MEMBRESIA_VIGENTE';
const payments_of = (c) => prisma.pago.count({ where: { cuota: { clienteId: c.id } } });

before(async () => {
  try {
    cash = await prisma.metodoPago.findUnique({ where: { nombre: 'EFECTIVO' } });
    states = Object.fromEntries((await prisma.estadoCuota.findMany()).map((state) => [state.nombre, state.id]));
    plan = await prisma.plan.create({ data: { nombre: `TEST-MEM plan ${suffix}`, duracionDias: 30, precio: 10000 } });
    plan2 = await prisma.plan.create({ data: { nombre: `TEST-MEM plan largo ${suffix}`, duracionDias: 90, precio: 25000 } });
  } catch {
    reachable = false;
  }
});

after(async () => {
  if (!reachable) return;
  const quotaIds = (await prisma.cuota.findMany({ where: { clienteId: { in: created.clients } }, select: { id: true } })).map((row) => row.id);
  await prisma.notificacion.deleteMany({ where: { usuarioId: { in: created.users } } });
  await prisma.mpEventoPago.deleteMany({ where: { cuotaId: { in: quotaIds } } });
  await prisma.pago.deleteMany({ where: { cuotaId: { in: quotaIds } } });
  await prisma.cuota.deleteMany({ where: { clienteId: { in: created.clients } } });
  await prisma.plan.deleteMany({ where: { nombre: { startsWith: 'TEST-MEM' } } });
  await prisma.cliente.deleteMany({ where: { id: { in: created.clients } } });
  await prisma.usuario.deleteMany({ where: { id: { in: created.users } } });
  await prisma.$disconnect();
});

// ------------------------------- 1) Plan elegido por recepción => pendiente_pago -------------------------------

guard('cliente nuevo con plan elegido en recepción: pendiente_pago con plan, monto y cómo pagar (no "sin membresía")', async () => {
  const email = `tmp-mem-alta-${suffix}@test.local`;
  const row = await clients.createClient(1, { nombre: 'Alta', apellido: 'Mem', email, password: 'Clave123', telefono: '1155550000', planId: plan.id });
  created.clients.push(row.id);
  created.users.push(row.usuarioId);

  const m = await client.getMembership(ctx(row));
  assert.equal(m.estadoMembresia, 'pendiente_pago');
  assert.equal(m.pendiente.plan.nombre, plan.nombre);
  assert.equal(m.pendiente.monto, 10000);
  assert.equal(m.pendiente.origen, 'RECEPCION');
  assert.equal(m.puedeVerificarPago, false, 'sin pago en línea no hay nada que verificar');
  assert.equal(m.renovacion.permitida, true);
  // Recepción ve el mismo estado, calculado por la misma función.
  const listed = (await clients.listClients({ search: email })).find((item) => item.id === row.id);
  assert.equal(listed.membresia.estadoMembresia, 'pendiente_pago');
});

guard('pendiente que elige otro plan: el nuevo REEMPLAZA al anterior (no se acumulan) y el estado se actualiza', async (t) => {
  const c = await mkClient('rep');
  const fromReception = await mkPending(c);
  mockPreference(t);
  const { cuotaId } = await payments.createCheckout(ctx(c), c.usuario, plan2.id);

  const unpaid = await prisma.cuota.findMany({ where: { clienteId: c.id, pago: { is: null }, estadoCuota: { nombre: 'PENDIENTE' } } });
  assert.deepEqual(unpaid.map((row) => row.id), [cuotaId]);
  assert.equal(await prisma.cuota.count({ where: { id: fromReception.id } }), 0, 'la del alta en recepción se reemplazó');
  const m = await client.getMembership(ctx(c));
  assert.equal(m.estadoMembresia, 'pendiente_pago');
  assert.equal(m.pendiente.plan.nombre, plan2.nombre);
  assert.equal(m.pendiente.origen, 'MERCADOPAGO');
  assert.equal(m.puedeVerificarPago, true);

  // Elegir un tercero por el otro camino (POST /quotas) también reemplaza y conserva la de Mercado Pago como VENCIDA (auditoría).
  await quotas.createPendingQuota({ userId: c.usuarioId, planId: plan.id });
  const after = await prisma.cuota.findMany({ where: { clienteId: c.id }, include: { estadoCuota: true } });
  assert.equal(after.filter((row) => row.estadoCuota.nombre === 'PENDIENTE').length, 1);
  assert.equal(after.find((row) => row.id === cuotaId).estadoCuota.nombre, 'VENCIDA');
});

guard('descartar el plan pendiente del alta funciona aunque Mercado Pago no responda, y el cliente queda sin_plan', async (t) => {
  const c = await mkClient('dsc');
  const pending = await mkPending(c);
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('sin conexión');
  });
  assert.equal((await payments.discardRequest(ctx(c), pending.id)).estado, 'DESCARTADA');
  assert.equal((await client.getMembership(ctx(c))).estadoMembresia, 'sin_plan');
});

// ------------------------------- 2 y 3) Renovar / registrar pago solo desde 3 días antes -------------------------------

guard('activa con 90 y 4 días: registrar pago, confirmar cuota y renovar en línea se rechazan en el BACKEND', async (t) => {
  for (const days of [90, 4]) {
    const c = await mkClient(`blk${days}`);
    const active = await mkActive(c, days);
    const pending = await mkPending(c);

    const m = await client.getMembership(ctx(c));
    assert.equal(m.estadoMembresia, 'activa');
    assert.equal(m.renovacion.permitida, false);
    assert.equal(m.renovacion.diasParaRenovar, days - 3);

    await assert.rejects(() => pay(c), (error) => vigente(error) && error.message.includes(`vigente hasta el ${iso(inDays(days)).split('-').reverse().join('/')}`));
    await assert.rejects(() => quotas.registerReceptionPayment({ clienteId: c.id, cuotaId: pending.id, metodoPagoId: cash.id }), vigente);
    await assert.rejects(() => quotas.confirmQuotaPayment(pending.id, cash.id), vigente);
    mockPreference(t);
    await assert.rejects(() => payments.createCheckout(ctx(c), c.usuario, plan.id), (error) => vigente(error) && /Podrás renovar a partir del/.test(error.message));
    await assert.rejects(() => quotas.createPendingQuota({ userId: c.usuarioId, planId: plan.id }), vigente);

    assert.equal(await payments_of(c), 0);
    assert.equal((await prisma.cuota.findUnique({ where: { id: active.id }, include: { estadoCuota: true } })).estadoCuota.nombre, 'ACTIVA', 'nada cambió');
  }
});

guard('activa con exactamente 3, 2 y 0 días restantes: se habilita y el pago se registra', async () => {
  for (const days of [3, 2, 0]) {
    const c = await mkClient(`ok${days}`);
    await mkActive(c, days);
    const m = await client.getMembership(ctx(c));
    assert.equal(m.estadoMembresia, 'por_vencer', `${days} días`);
    assert.equal(m.renovacion.permitida, true);
    await pay(c);
    assert.equal(await payments_of(c), 1, `${days} días`);
  }
});

guard('membresía vencida (ayer y hace un mes): se habilita', async () => {
  for (const days of [-1, -30]) {
    const c = await mkClient(`ven${-days}`);
    await mkActive(c, days); // sigue marcada ACTIVA pero la fecha ya pasó
    assert.equal((await client.getMembership(ctx(c))).estadoMembresia, 'vencida');
    await pay(c);
    assert.equal(await payments_of(c), 1);
  }
});

guard('sin plan y pendiente_pago: se puede registrar el primer pago', async () => {
  const none = await mkClient('sp');
  assert.equal((await client.getMembership(ctx(none))).estadoMembresia, 'sin_plan');
  await pay(none);
  const pend = await mkClient('pp');
  const pending = await mkPending(pend);
  await quotas.registerReceptionPayment({ clienteId: pend.id, cuotaId: pending.id, metodoPagoId: cash.id });
  assert.equal((await client.getMembership(ctx(pend))).estadoMembresia, 'activa');
});

// ------------------------------- Renovación anticipada -------------------------------

guard('renovación anticipada: el nuevo vencimiento se cuenta desde el vencimiento actual y la anterior queda VENCIDA', async () => {
  const c = await mkClient('ext');
  const old = await mkActive(c, 2);
  await pay(c, plan2); // 90 días
  const renewed = await prisma.cuota.findFirst({ where: { clienteId: c.id, id: { not: old.id }, pago: { isNot: null } } });
  assert.equal(iso(renewed.fechaInicio), iso(inDays(0)));
  assert.equal(iso(renewed.fechaVencimiento), iso(inDays(2 + 90))); // 2 días que quedaban + 90
  assert.equal((await prisma.cuota.findUnique({ where: { id: old.id }, include: { estadoCuota: true } })).estadoCuota.nombre, 'VENCIDA');
  const m = await client.getMembership(ctx(c));
  assert.equal(m.estadoMembresia, 'activa');
  assert.equal(m.cuota.diasRestantes, 92);
});

guard('si ya venció, los días cuentan desde hoy (no desde el vencimiento viejo)', async () => {
  const c = await mkClient('exp');
  await mkActive(c, -10);
  await pay(c);
  const renewed = await prisma.cuota.findFirst({ where: { clienteId: c.id, pago: { isNot: null } } });
  assert.equal(iso(renewed.fechaVencimiento), iso(inDays(30)));
});

guard('vence hoy (0 días): la renovación suma desde hoy, sin perder ni regalar días', async () => {
  const c = await mkClient('hoy');
  await mkActive(c, 0);
  await pay(c);
  const renewed = await prisma.cuota.findFirst({ where: { clienteId: c.id, pago: { isNot: null } } });
  assert.equal(iso(renewed.fechaVencimiento), iso(inDays(30)));
});

// ------------------------------- Doble envío -------------------------------

guard('doble solicitud simultánea (doble clic): se registra un solo pago y la otra recibe un error claro', async () => {
  const c = await mkClient('dbl');
  const pending = await mkPending(c);
  const body = { clienteId: c.id, cuotaId: pending.id, metodoPagoId: cash.id };
  const results = await Promise.allSettled([quotas.registerReceptionPayment(body), quotas.registerReceptionPayment(body), quotas.registerReceptionPayment(body)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  for (const r of results.filter((item) => item.status === 'rejected')) assert.equal(r.reason.statusCode, 409);
  assert.equal(await payments_of(c), 1);

  // Pasado el instante de protección, un segundo cobro tampoco entra: la membresía quedó vigente.
  await assert.rejects(() => quotas.registerReceptionPayment({ clienteId: c.id, planId: plan.id, metodoPagoId: cash.id }, new Date(Date.now() + 120_000)), vigente);
  assert.equal(await payments_of(c), 1);
});

// ------------------------------- 4) Lista de pagos pendientes -------------------------------

guard('pagos pendientes: la lista y el contador salen de la misma lógica; incluye plan, monto, antigüedad y si se puede cobrar', async () => {
  const waiting = await mkClient('lp1');
  await mkPending(waiting, { fechaInicio: inDays(-5) });
  const blocked = await mkClient('lp2');
  await mkActive(blocked, 60);
  await mkPending(blocked, { planId: plan2.id });
  const paid = await mkClient('lp3');
  await mkActive(paid, 60); // sin solicitud pendiente: no aparece

  const { total, items } = await recepcion.listPendingPayments();
  assert.equal(total, items.length);
  const row = (c) => items.find((item) => item.clienteId === c.id);
  assert.equal(row(paid), undefined);

  assert.deepEqual(
    [row(waiting).plan, row(waiting).monto, row(waiting).diasEspera, row(waiting).pendienteDesde, row(waiting).puedeRegistrarPago, row(waiting).estadoMembresia],
    [plan.nombre, 10000, 5, iso(inDays(-5)), true, 'pendiente_pago'],
  );
  assert.equal(row(blocked).puedeRegistrarPago, false);
  assert.equal(row(blocked).estadoMembresia, 'activa');
  assert.match(row(blocked).motivoBloqueo, /membresía vigente hasta el/);
  // Más antiguo primero.
  assert.ok(items.findIndex((item) => item.clienteId === waiting.id) < items.length);
  const dates = items.map((item) => item.pendienteDesde);
  assert.deepEqual(dates, [...dates].sort());

  // Registrar el pago saca al cliente de la lista (y del contador, que usa la misma función).
  await pay(waiting);
  assert.equal((await recepcion.listPendingPayments()).items.some((item) => item.clienteId === waiting.id), false);
  const stats = await recepcion.getDashboardStats();
  assert.equal(typeof stats.pagosPendientes, 'number');
});

// ------------------------------- Pagar con Mercado Pago el plan pendiente / cambiar de plan -------------------------------

guard('cambiar de plan tras iniciar un pago: se vence la preferencia anterior y solo el plan nuevo queda pendiente y se puede activar', async (t) => {
  const c = await mkClient('chg');
  await mkPending(c); // plan elegido por recepción
  const calls = [];
  let n = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ method: options?.method, url: String(url), body: options?.body ? JSON.parse(options.body) : null });
    return String(url).includes('/checkout/preferences') ? mpResponse({ id: `pref-chg-${++n}`, init_point: 'https://mp.test/pay' }) : mpResponse({});
  });

  // "Pagar" el plan pendiente: se reutiliza el flujo de checkout (monto desde la BD).
  const first = await payments.createCheckout(ctx(c), c.usuario, plan.id);
  assert.equal(calls.find((call) => call.method === 'POST').body.items[0].unit_price, 10000);
  assert.equal((await client.getMembership(ctx(c))).pendiente.cuotaId, first.cuotaId);

  // "Cambiar plan": reemplaza al pendiente y vence la preferencia del anterior.
  const second = await payments.createCheckout(ctx(c), c.usuario, plan2.id);
  const expire = calls.find((call) => call.method === 'PUT');
  assert.ok(expire && expire.url.endsWith('/checkout/preferences/pref-chg-1'));
  assert.equal(expire.body.expires, true);
  const m = await client.getMembership(ctx(c));
  assert.equal(m.estadoMembresia, 'pendiente_pago');
  assert.equal(m.pendiente.cuotaId, second.cuotaId);
  assert.equal(await prisma.cuota.count({ where: { clienteId: c.id, pago: { is: null }, estadoCuota: { nombre: 'PENDIENTE' } } }), 1);

  // Aprobado el pago del plan nuevo: un único pago, membresía activa y fuera de la lista de pendientes.
  const approvedPayment = { id: 880000000 + second.cuotaId, status: 'approved', currency_id: 'ARS', transaction_amount: 25000, external_reference: String(second.cuotaId), date_approved: new Date().toISOString(), metadata: { cuota_id: second.cuotaId, plan_id: plan2.id, expected_amount: 25000 } };
  t.mock.method(globalThis, 'fetch', async () => mpResponse(approvedPayment));
  assert.equal((await payments.handleWebhookPayment(String(approvedPayment.id))).estado, 'APROBADO');
  assert.equal((await payments.handleWebhookPayment(String(approvedPayment.id))).yaProcesado, true); // webhook duplicado
  assert.equal(await payments_of(c), 1);
  const after = await client.getMembership(ctx(c));
  assert.equal(after.estadoMembresia, 'activa');
  assert.equal(after.cuota.plan.nombre, plan2.nombre);
  assert.equal((await recepcion.listPendingPayments()).items.some((item) => item.clienteId === c.id), false);
});

guard('un pago de Mercado Pago rechazado deja el plan pendiente y "Pagar" reutiliza la misma solicitud para reintentar', async (t) => {
  const c = await mkClient('rej');
  mockPreference(t);
  const first = await payments.createCheckout(ctx(c), c.usuario, plan.id);
  t.mock.method(globalThis, 'fetch', async () => mpResponse({ id: 880100001, status: 'rejected', status_detail: 'cc_rejected_other_reason', currency_id: 'ARS', transaction_amount: 10000, external_reference: String(first.cuotaId), metadata: { cuota_id: first.cuotaId } }));
  assert.equal((await payments.verifyReturn(ctx(c), { payment_id: '880100001' })).estado, 'RECHAZADO');
  assert.equal((await client.getMembership(ctx(c))).estadoMembresia, 'pendiente_pago');
  mockPreference(t);
  assert.equal((await payments.createCheckout(ctx(c), c.usuario, plan.id)).cuotaId, first.cuotaId);
});
