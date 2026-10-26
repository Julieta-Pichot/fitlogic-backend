// Prueba de integración "de verdad": arranca el servidor real (proceso aparte, mismo código que npm run dev),
// siembra un cliente demo propio (etiqueta "ci", no pisa tu demo), inicia sesión por HTTP y recorre el panel del
// cliente: racha, membresía, notificaciones (listar, filtrar, leer una, leer todas), perfil, planes, checkout y
// verificación manual del pago. Mercado Pago es un servidor falso local: nunca se llama a la API real.
// Se salta si no hay BD alcanzable.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import { gymTodayMs } from '../src/utils/timezone.js';
import { seedDemo, unseedDemo, DEMO_PASSWORD } from './helpers/demo-fixture.js';

const PORT = 3911;
const MP_PORT = 3912;
const BASE = `http://127.0.0.1:${PORT}/api`;
let reachable = true;
let server;
let fakeMp;
let demo;
let token;
const mpCalls = [];
let fakePayment = null;

const api = async (path, { method = 'GET', body, auth = token } = {}) => {
  const response = await fetch(BASE + path, {
    method,
    headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, ...(await response.json()) };
};

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      /* todavía arrancando */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('El servidor de prueba no arrancó');
};

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  // Mercado Pago simulado
  fakeMp = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      mpCalls.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null, auth: req.headers.authorization });
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST' && req.url === '/checkout/preferences') return res.end(JSON.stringify({ id: 'pref-ci', init_point: 'https://mp.test/checkout?pref=pref-ci' }));
      if (req.url.startsWith('/v1/payments/search')) return res.end(JSON.stringify({ results: fakePayment ? [fakePayment] : [] }));
      const byId = req.url.match(/^\/v1\/payments\/(\d+)$/);
      if (byId && fakePayment && String(fakePayment.id) === byId[1]) return res.end(JSON.stringify(fakePayment));
      res.statusCode = 404;
      return res.end('{}');
    });
  });
  await new Promise((resolve) => fakeMp.listen(MP_PORT, '127.0.0.1', resolve));

  demo = await seedDemo({ tag: 'ci' });

  server = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(PORT), DISABLE_SCHEDULER: 'true', MERCADOPAGO_API_URL: `http://127.0.0.1:${MP_PORT}`, MERCADOPAGO_ACCESS_TOKEN: 'TEST-token-falso', FRONTEND_URL: 'http://localhost:5173', BACKEND_PUBLIC_URL: '' },
    stdio: 'ignore',
  });
  await waitForHealth();
  const login = await api('/auth/login', { method: 'POST', body: { email: demo.email, password: DEMO_PASSWORD }, auth: null });
  token = login.data?.token;
});

after(async () => {
  server?.kill();
  await new Promise((resolve) => (fakeMp ? fakeMp.close(resolve) : resolve()));
  if (reachable) await unseedDemo({ tag: 'ci' });
  await prisma.$disconnect();
});

const guard = (name, fn) => test(name, async (t) => (reachable ? fn(t) : t.skip('BD no disponible')));

guard('el servidor real arranca con el código actual y el login del cliente demo devuelve token', async () => {
  const health = await (await fetch(`${BASE}/health`)).json();
  assert.ok(health.data.startedAt && health.data.pid);
  assert.ok(token);
});

guard('autenticación y rol: sin token 401, token de profesor 403 en /cliente/*', async () => {
  assert.equal((await api('/cliente/inicio', { auth: null })).status, 401);
  const professor = await prisma.usuario.findFirst({ where: { email: 'ci.profesor@fitlogic.test' } });
  const jwt = (await import('jsonwebtoken')).default;
  const professorToken = jwt.sign({ userId: professor.id }, process.env.JWT_SECRET);
  const forbidden = await api('/cliente/inicio', { auth: professorToken });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.error, 'PROHIBIDO');
});

guard('racha: semana lunes-domingo, días con asistencia marcados, hoy y futuros distinguidos, objetivo desde la BD', async () => {
  const { data } = await api('/cliente/inicio');
  assert.equal(data.racha.dias.length, 7);
  assert.deepEqual(data.racha.dias.map((d) => d.diaSemana), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(data.racha.objetivoDias, 4);
  const today = data.racha.dias.find((d) => d.esHoy);
  assert.equal(today.asistio, true); // el seed registra una asistencia hoy
  assert.ok(data.racha.dias.filter((d) => d.futuro).every((d) => d.asistio === false));
  assert.equal(data.racha.diasAsistidos, data.racha.dias.filter((d) => d.asistio).length);
  assert.ok(data.racha.diasAsistidos >= 1);
});

guard('membresía: plan, fechas, estado efectivo y días restantes desde la cuota de la BD', async () => {
  const { data } = await api('/cliente/inicio');
  assert.equal(data.membresia.estado, 'ACTIVA');
  assert.equal(data.membresia.cuota.plan.nombre, 'TESTDEMO-ci Plan Mensual');
  assert.equal(data.membresia.cuota.diasRestantes, 8);
  assert.match(data.membresia.cuota.fechaInicio, /^\d{4}-\d{2}-\d{2}$/);
  const quota = await prisma.cuota.findFirst({ where: { cliente: { usuario: { email: demo.email } }, estadoCuota: { nombre: 'ACTIVA' } }, include: { plan: true } });
  assert.equal(data.membresia.cuota.plan.duracionDias, quota.plan.duracionDias);
  assert.equal(data.membresia.cuota.fechaVencimiento, quota.fechaVencimiento.toISOString().slice(0, 10));
});

guard('notificaciones: los 3 tipos, filtro, contador, marcar una y marcar todas', async () => {
  const all = await api('/cliente/notificaciones?filtro=todas');
  assert.equal(all.status, 200);
  assert.deepEqual(all.data.items.map((n) => n.tipo).sort(), ['INSCRIPCION_CLASE', 'VENCIMIENTO_APTO_FISICO', 'VENCIMIENTO_CUOTA']);
  assert.equal(all.data.unreadCount, 3);

  const one = all.data.items.find((n) => n.tipo === 'VENCIMIENTO_CUOTA');
  assert.match(one.mensaje, /TESTDEMO-ci Plan Mensual vence en 8 días/);
  assert.equal((await api(`/cliente/notificaciones/${one.id}/leida`, { method: 'PATCH' })).status, 200);

  const unread = await api('/cliente/notificaciones?filtro=no_leidas');
  assert.equal(unread.data.items.length, 2);
  assert.ok(unread.data.items.every((n) => n.leida === false));
  assert.equal(unread.data.unreadCount, 2);

  const readAll = await api('/cliente/notificaciones/leidas', { method: 'PATCH' });
  assert.equal(readAll.status, 200);
  assert.equal((await api('/cliente/notificaciones?filtro=no_leidas')).data.unreadCount, 0);
  assert.equal((await api('/cliente/notificaciones?filtro=todas')).data.items.length, 3);

  // las notificaciones de otro usuario no se pueden tocar
  const foreign = await prisma.notificacion.findFirst({ where: { usuarioId: { not: (await prisma.usuario.findUnique({ where: { email: demo.email } })).id } } });
  if (foreign) assert.equal((await api(`/cliente/notificaciones/${foreign.id}/leida`, { method: 'PATCH' })).status, 404);
});

guard('perfil: datos personales, membresía y apto físico desde la BD (sin valores fijos)', async () => {
  const { data } = await api('/cliente/perfil');
  assert.equal(data.usuario.email, demo.email);
  assert.equal(data.cliente.objetivoEntrenamiento, 'Ganar masa muscular (demo)');
  assert.equal(data.cliente.objetivoDiasRacha, 4);
  assert.equal(data.aptoFisico.estado, 'POR_VENCER');
  assert.equal(data.aptoFisico.diasRestantes, 5);
  assert.equal(data.membresia.estado, 'ACTIVA');
  const payments = await api('/cliente/pagos');
  assert.equal(payments.data.items[0].metodo, 'EFECTIVO');
  assert.equal(payments.data.items[0].monto, 15000);
  assert.equal(payments.data.items[1].metodo, 'MERCADO_PAGO');
  assert.equal(payments.data.items[1].medioPago, 'Tarjeta de crédito VISA');
  assert.equal(payments.data.items[1].ultimosDigitos, '3704');
  const attendance = await api('/cliente/asistencias?limit=5');
  assert.equal(attendance.data.items.length, 5);
  assert.ok(attendance.data.pagination.total > 5);
});

guard('planes y checkout: monto del backend, sin token de MP en la respuesta y verificación manual "Ya pagué"', async () => {
  // Los planes son un catálogo global: se miran solo los de este test.
  const plans = await api('/cliente/planes');
  plans.data = plans.data.filter((p) => p.nombre.startsWith('TESTDEMO-ci '));
  assert.deepEqual(plans.data.map((p) => p.nombre), ['TESTDEMO-ci Plan Mensual', 'TESTDEMO-ci Plan Trimestral']);
  const quarterly = plans.data.find((p) => /Trimestral/.test(p.nombre));
  assert.equal(quarterly.precioFinal, 34000);

  const checkout = await api('/cliente/membresia/checkout', { method: 'POST', body: { plan_id: quarterly.id, precio: 1, amount: 1 } });
  assert.equal(checkout.status, 201);
  assert.equal(checkout.data.initPoint, 'https://mp.test/checkout?pref=pref-ci');
  assert.ok(!JSON.stringify(checkout).includes('TEST-token-falso'));
  const preference = mpCalls.find((c) => c.url === '/checkout/preferences');
  assert.equal(preference.body.items[0].unit_price, 34000); // el precio del front se ignora
  assert.equal(preference.auth, 'Bearer TEST-token-falso'); // el token solo viaja backend -> MP
  assert.equal(preference.body.auto_return, undefined); // sin URL https pública no hay auto_return
  assert.equal(preference.body.notification_url, undefined);

  const config = await api('/cliente/membresia/pago/config');
  assert.deepEqual(config.data, { retornoAutomatico: false, webhookActivo: false });

  // El usuario no volvió automáticamente: sin pago registrado => SIN_PAGO con el aviso de configuración
  fakePayment = null;
  const none = await api('/cliente/membresia/pago/verificar');
  assert.equal(none.data.estado, 'SIN_PAGO');
  assert.equal(none.data.retornoAutomatico, false);

  // Mercado Pago ya aprobó el pago: "Ya pagué, verificar" lo encuentra sin parámetros y activa la membresía
  fakePayment = { id: 99001, status: 'approved', currency_id: 'ARS', transaction_amount: 34000, external_reference: String(checkout.data.cuotaId), date_approved: new Date().toISOString(), metadata: { cuota_id: checkout.data.cuotaId, plan_id: quarterly.id, expected_amount: 34000 } };
  const verified = await api('/cliente/membresia/pago/verificar');
  assert.equal(verified.data.estado, 'APROBADO');
  const again = await api('/cliente/membresia/pago/verificar?payment_id=99001');
  assert.equal(again.data.estado, 'APROBADO');
  assert.equal(await prisma.pago.count({ where: { referenciaExterna: '99001' } }), 1);

  // La nueva cuota arranca HOY (día del pago) y reemplaza a la anterior, que queda VENCIDA.
  const { data: home } = await api('/cliente/inicio');
  assert.equal(home.membresia.cuota.plan.nombre, 'TESTDEMO-ci Plan Trimestral');
  assert.equal(home.membresia.cuota.fechaInicio, new Date(gymTodayMs()).toISOString().slice(0, 10));
  assert.equal(home.membresia.cuota.diasRestantes, 90);
  assert.equal(await prisma.cuota.count({ where: { cliente: { usuario: { email: demo.email } }, estadoCuota: { nombre: 'ACTIVA' } } }), 1);

  // Comprobante propio (HTML) y de otro cliente (404)
  const receiptPago = await prisma.pago.findFirst({ where: { referenciaExterna: '99001' } });
  const html = await fetch(BASE + '/cliente/pagos/' + receiptPago.id + '/comprobante', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Comprobante de pago/);
  const foreignPago = await prisma.pago.findFirst({ where: { cuota: { cliente: { usuario: { email: { not: demo.email } } } } } });
  if (foreignPago) assert.equal((await api('/cliente/pagos/' + foreignPago.id + '/comprobante')).status, 404);
});

guard('errores con el formato { error, message }', async () => {
  const bad = await api('/cliente/clases/999999999/inscripcion', { method: 'POST', body: {} });
  assert.equal(bad.status, 404);
  assert.ok(bad.error && bad.message);
  const invalid = await api('/cliente/membresia/checkout', { method: 'POST', body: {} });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.error && invalid.message);
});

// ------------------------------- Admin: Ingresos por HTTP -------------------------------

guard('admin /api/admin/ingresos/*: solo ADMIN (401/403), resumen, desglose, gráfico, listado, CSV, pendientes y conciliación', async () => {
  const bcrypt = (await import('bcryptjs')).default;
  const role = await prisma.rol.findUnique({ where: { nombre: 'ADMIN' } });
  const email = `tmp-admin-ci-${Date.now()}@test.local`;
  const admin = await prisma.usuario.create({ data: { rolId: role.id, nombre: 'Admin', apellido: 'CI', email, passwordHash: await bcrypt.hash('Admin1234', 4), activo: true } });
  try {
    const adminToken = (await api('/auth/login', { method: 'POST', body: { email, password: 'Admin1234' }, auth: null })).data.token;
    for (const path of ['/resumen', '/desglose', '/grafico', '/pagos', '/pagos/exportar.csv', '/pendientes', '/conciliacion']) {
      assert.equal((await api(`/admin/ingresos${path}`, { auth: null })).status, 401, `${path} sin token`);
      assert.equal((await api(`/admin/ingresos${path}`)).status, 403, `${path} con token de cliente`);
    }
    assert.equal((await api('/admin/ingresos/pendientes/1/verificar', { method: 'POST' })).status, 403);

    const range = '?desde=2026-01-01&hasta=2027-12-31';
    const summary = await api('/admin/ingresos/resumen' + range, { auth: adminToken });
    assert.equal(summary.status, 200);
    assert.ok(summary.data.rango.cantidad >= 2); // los 2 pagos del cliente demo (efectivo + Mercado Pago)
    assert.equal(summary.data.zonaHoraria, 'America/Argentina/Buenos_Aires');
    const breakdown = await api('/admin/ingresos/desglose' + range, { auth: adminToken });
    assert.ok(breakdown.data.porMetodo.some((row) => row.clave === 'MERCADO_PAGO') && breakdown.data.porMetodo.some((row) => row.clave === 'EFECTIVO'));
    const chart = await api('/admin/ingresos/grafico' + range, { auth: adminToken });
    assert.equal(chart.data.agrupacion, 'mes'); // 24 meses: se agrupa por mes
    const list = await api(`/admin/ingresos/pagos${range}&q=ci.cliente&orden=bruto&dir=desc&limit=5`, { auth: adminToken });
    assert.equal(list.status, 200);
    assert.ok(list.data.items.length >= 2 && list.data.items.every((row) => row.cliente.email.includes('ci.cliente')));
    const mp = list.data.items.find((row) => row.ultimosDigitos === '3704');
    assert.deepEqual([mp.bruto, mp.comision, mp.neto, mp.ultimosDigitos], [15000, 662.5, 14337.5, '3704']);

    const csv = await fetch(`${BASE}/admin/ingresos/pagos/exportar.csv${range}&metodo=MERCADO_PAGO&q=ci.cliente`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    const lines = (await csv.text()).replace(/^﻿/, '').trim().split('\r\n');
    assert.equal(lines.length, 3); // encabezado + pago con VISA + pago aprobado por el simulador de MP
    assert.ok(lines.some((line) => /Tarjeta de crédito VISA/.test(line) && /,15000.00,662.50,14337.50,/.test(line)));

    assert.equal((await api('/admin/ingresos/pendientes', { auth: adminToken })).status, 200);
    assert.equal((await api('/admin/ingresos/resumen?desde=2026-10-31&hasta=2026-10-01', { auth: adminToken })).status, 400);
    assert.equal((await api('/admin/ingresos/pagos?orden=hack', { auth: adminToken })).status, 400);

    // Conciliación contra el Mercado Pago simulado (búsqueda vacía): el pago local de MP aparece como "sin pago en MP"
    fakePayment = null;
    const report = await api(`/admin/ingresos/conciliacion?desde=2026-01-01&hasta=2027-12-31`, { auth: adminToken });
    assert.equal(report.status, 200);
    assert.equal(report.data.soloLectura, true);
    assert.ok(report.data.localSinPagoEnMp.some((row) => row.referenciaExterna?.startsWith('800000')));
  } finally {
    await prisma.usuario.delete({ where: { id: admin.id } });
  }
});
