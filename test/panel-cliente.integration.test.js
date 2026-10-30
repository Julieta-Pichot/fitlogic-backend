// Integración contra la BD real (.env) del panel del cliente. Crea clientes, profesor, clases, planes y
// cuotas temporales (prefijo TEST-CLI) y los borra al terminar; no toca filas existentes.
// La API de Mercado Pago está mockeada (globalThis.fetch): estos tests nunca la llaman.
import test, { before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import * as classes from '../src/services/cliente-classes.service.js';
import * as content from '../src/services/cliente-content.service.js';
import * as client from '../src/services/cliente.service.js';
import * as payments from '../src/services/membership-payments.service.js';
import { gymTodayMs } from '../src/utils/timezone.js';
import { generateExpiryReminders } from '../src/services/notification-scheduler.js';

let reachable = true;
const suffix = Date.now();
const created = { users: [], clients: [] };
let prof;
let A; // cliente principal
let B; // segundo cliente
let C; // tercero
const ctx = (c) => ({ ...c, estadoCliente: { nombre: 'HABILITADO' } });

const at = (date, time) => new Date(`${date}T${time}:00-03:00`);

const mkClient = async (tag) => {
  const rol = await prisma.rol.findUnique({ where: { nombre: 'CLIENTE' } });
  const estado = await prisma.estadoCliente.findUnique({ where: { nombre: 'HABILITADO' } });
  const user = await prisma.usuario.create({ data: { rolId: rol.id, nombre: `Cli${tag}`, apellido: 'Test', email: `tmp-cli-${tag}-${suffix}@test.local`, passwordHash: 'x', activo: true } });
  const row = await prisma.cliente.create({ data: { usuarioId: user.id, estadoClienteId: estado.id } });
  created.users.push(user.id);
  created.clients.push(row.id);
  return { ...row, estadoCliente: estado, usuario: user };
};

const mkClass = (data) => prisma.clase.create({ data: { profesorId: prof.id, nombre: 'TEST-CLI clase', sala: `TEST-CLI Sala ${suffix}`, cupoMaximo: 10, recurrente: false, duracionMinutos: 60, fechaHora: at('2030-01-08', '10:00'), ...data } });

before(async () => {
  try {
    const rolP = await prisma.rol.findUnique({ where: { nombre: 'PROFESOR' } });
    const user = await prisma.usuario.create({ data: { rolId: rolP.id, nombre: 'ProfCli', apellido: 'Test', email: `tmp-profcli-${suffix}@test.local`, passwordHash: 'x', activo: true } });
    created.users.push(user.id);
    prof = await prisma.profesor.create({ data: { usuarioId: user.id, estadoCuentaStaffId: 1 } });
    A = await mkClient('A');
    B = await mkClient('B');
    C = await mkClient('C');
  } catch {
    reachable = false;
  }
});

after(async () => {
  if (!reachable) return;
  const clientIds = created.clients;
  const classRows = await prisma.clase.findMany({ where: { nombre: { startsWith: 'TEST-CLI' } }, select: { id: true } });
  const classIds = classRows.map((row) => row.id);
  await prisma.notificacion.deleteMany({ where: { usuarioId: { in: created.users } } });
  await prisma.inscripcionClase.deleteMany({ where: { OR: [{ claseId: { in: classIds } }, { clienteId: { in: clientIds } }] } });
  await prisma.claseDia.deleteMany({ where: { claseId: { in: classIds } } });
  await prisma.clase.deleteMany({ where: { id: { in: classIds } } });
  await prisma.asistencia.deleteMany({ where: { clienteId: { in: clientIds } } });
  const quotas = await prisma.cuota.findMany({ where: { clienteId: { in: clientIds } }, select: { id: true } });
  // eventos de pagos simulados: los de cuotas propias y los huérfanos (cuota inexistente) que dejan los tests de seguridad
  await prisma.mpEventoPago.deleteMany({ where: { OR: [{ cuotaId: { in: quotas.map((q) => q.id) } }, { mpPaymentId: '1000776999' }, { mpPaymentId: { startsWith: 'TESTCLI' } }] } });
  await prisma.pago.deleteMany({ where: { cuotaId: { in: quotas.map((q) => q.id) } } });
  await prisma.cuota.deleteMany({ where: { clienteId: { in: clientIds } } });
  const routines = await prisma.rutina.findMany({ where: { clienteId: { in: clientIds } }, select: { id: true } });
  await prisma.rutinaEjercicio.deleteMany({ where: { rutinaId: { in: routines.map((r) => r.id) } } });
  await prisma.rutinaDia.deleteMany({ where: { rutinaId: { in: routines.map((r) => r.id) } } });
  await prisma.rutina.deleteMany({ where: { clienteId: { in: clientIds } } });
  const plans = await prisma.plan.findMany({ where: { nombre: { startsWith: 'TEST-CLI' } }, select: { id: true } });
  await prisma.promocion.deleteMany({ where: { planId: { in: plans.map((p) => p.id) } } });
  await prisma.plan.deleteMany({ where: { id: { in: plans.map((p) => p.id) } } });
  await prisma.cliente.deleteMany({ where: { id: { in: clientIds } } });
  await prisma.profesor.deleteMany({ where: { id: prof.id } });
  await prisma.usuario.deleteMany({ where: { id: { in: created.users } } });
  await prisma.$disconnect();
});

const guard = (name, fn) => test(name, async (t) => (reachable ? fn(t) : t.skip('BD no disponible')));
const rejectsWith = (status, code) => (error) => error.statusCode === status && error.code === code;

// ------------------------------- Clases -------------------------------

guard('cupo: cuenta INSCRIPTO + ASISTIO, NO las CANCELADAS; completa => 409', async () => {
  const clase = await mkClass({ nombre: 'TEST-CLI cupo', cupoMaximo: 2, fechaHora: at('2030-02-05', '09:00') });
  const estados = Object.fromEntries((await prisma.estadoInscripcion.findMany()).map((e) => [e.nombre, e.id]));
  await prisma.inscripcionClase.create({ data: { claseId: clase.id, clienteId: B.id, estadoInscripcionId: estados.CANCELADO } });
  await prisma.inscripcionClase.create({ data: { claseId: clase.id, clienteId: C.id, estadoInscripcionId: estados.ASISTIO } });
  // 1 ASISTIO + 1 CANCELADO de cupo 2: queda un lugar
  await classes.enrollInClass(ctx(A), clase.id);
  await assert.rejects(() => classes.enrollInClass(ctx(B), clase.id), rejectsWith(409, 'CLASE_COMPLETA'));
});

guard('baja libera el cupo, queda CANCELADO (no se borra) y la reinscripción reactiva la misma fila', async () => {
  const clase = await mkClass({ nombre: 'TEST-CLI baja', cupoMaximo: 1, fechaHora: at('2030-02-06', '09:00') });
  await classes.enrollInClass(ctx(A), clase.id);
  await assert.rejects(() => classes.enrollInClass(ctx(B), clase.id), rejectsWith(409, 'CLASE_COMPLETA'));
  await classes.cancelEnrollment(ctx(A), clase.id);
  const row = await prisma.inscripcionClase.findFirst({ where: { claseId: clase.id, clienteId: A.id }, include: { estadoInscripcion: true } });
  assert.equal(row.estadoInscripcion.nombre, 'CANCELADO');
  await classes.enrollInClass(ctx(B), clase.id); // el cupo liberado lo toma otro
  await classes.cancelEnrollment(ctx(B), clase.id);
  await classes.enrollInClass(ctx(A), clase.id); // reactivación con UPDATE
  assert.equal(await prisma.inscripcionClase.count({ where: { claseId: clase.id, clienteId: A.id } }), 1);
  await assert.rejects(() => classes.enrollInClass(ctx(A), clase.id), rejectsWith(409, 'YA_INSCRIPTO'));
  await assert.rejects(() => classes.cancelEnrollment(ctx(C), clase.id), { statusCode: 404 });
});

guard('inscribirse genera la notificación INSCRIPCION_CLASE con datos reales', async () => {
  const clase = await mkClass({ nombre: 'TEST-CLI notif', fechaHora: at('2030-02-07', '18:30') });
  await classes.enrollInClass(ctx(A), clase.id);
  const notification = await prisma.notificacion.findFirst({ where: { usuarioId: A.usuarioId, tipoNotificacion: { nombre: 'INSCRIPCION_CLASE' }, mensaje: { contains: 'TEST-CLI notif' } } });
  assert.ok(notification);
  assert.match(notification.mensaje, /07\/02\/2030.*18:30/);
});

guard('conflicto de horario del cliente: solapadas => 409 con mensaje; contiguas permitidas; única vs recurrente', async () => {
  const base = await mkClass({ nombre: 'TEST-CLI base', fechaHora: at('2030-03-05', '10:00') }); // martes 10-11
  await classes.enrollInClass(ctx(A), base.id);
  const overlapping = await mkClass({ nombre: 'TEST-CLI solapa', sala: 'TEST-CLI otra', fechaHora: at('2030-03-05', '10:30') });
  await assert.rejects(() => classes.enrollInClass(ctx(A), overlapping.id), (error) => {
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, 'CONFLICTO_HORARIO');
    assert.match(error.message, /Ya estás inscripto en 'TEST-CLI base' el 05\/03\/2030 de 10:00 a 11:00, que coincide con esta clase\./);
    return true;
  });
  const contiguous = await mkClass({ nombre: 'TEST-CLI contigua', sala: 'TEST-CLI otra', fechaHora: at('2030-03-05', '11:00') });
  await classes.enrollInClass(ctx(A), contiguous.id);

  const weekly = await mkClass({ nombre: 'TEST-CLI semanal', sala: 'TEST-CLI otra2', recurrente: true, fechaHora: at('2030-03-01', '10:15'), dias: { create: [{ diaSemana: 2 }, { diaSemana: 4 }] } });
  await assert.rejects(() => classes.enrollInClass(ctx(A), weekly.id), rejectsWith(409, 'CONFLICTO_HORARIO')); // el martes 5/3 10:15 choca con la única
});

guard('cliente INHABILITADO_PAGO no puede inscribirse (mensaje que invita a renovar)', async () => {
  const clase = await mkClass({ nombre: 'TEST-CLI inhab', fechaHora: at('2030-04-02', '09:00') });
  await assert.rejects(() => classes.enrollInClass({ ...A, estadoCliente: { nombre: 'INHABILITADO_PAGO' } }, clase.id), (e) => e.statusCode === 403 && e.code === 'MEMBRESIA_REQUERIDA' && /Renová/.test(e.message));
});

guard('concurrencia: dos clientes a la vez en una clase de cupo 1 => una sola inscripción', async () => {
  const clase = await mkClass({ nombre: 'TEST-CLI carrera', cupoMaximo: 1, fechaHora: at('2030-05-07', '09:00') });
  const results = await Promise.allSettled([classes.enrollInClass(ctx(B), clase.id), classes.enrollInClass(ctx(C), clase.id)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(results.find((r) => r.status === 'rejected').reason.code === 'CLASE_COMPLETA');
  assert.equal(await prisma.inscripcionClase.count({ where: { claseId: clase.id } }), 1);
});

guard('listado por día: recurrentes + únicas de esa fecha, estado y "ya comenzó" (hora Buenos Aires)', async () => {
  const now = at('2030-06-11', '10:30'); // martes
  const weekly = await mkClass({ nombre: 'TEST-CLI lista rec', recurrente: true, fechaHora: at('2030-06-04', '10:00'), dias: { create: [{ diaSemana: 2 }, { diaSemana: 4 }] } });
  const single = await mkClass({ nombre: 'TEST-CLI lista unica', fechaHora: at('2030-06-11', '19:00') });
  const other = await mkClass({ nombre: 'TEST-CLI lista otra', fechaHora: at('2030-06-12', '19:00') });
  const today = await classes.listClassesByDay(ctx(A), undefined, now);
  const names = today.clases.map((c) => c.nombre);
  assert.equal(today.hoy, '2030-06-11');
  assert.equal(today.dias.length, 7);
  assert.ok(names.includes('TEST-CLI lista rec') && names.includes('TEST-CLI lista unica') && !names.includes('TEST-CLI lista otra'));
  assert.equal(today.clases.find((c) => c.nombre === 'TEST-CLI lista rec').estado, 'YA_COMENZO');
  assert.equal(today.clases.find((c) => c.nombre === 'TEST-CLI lista unica').estado, 'DISPONIBLE');
  const thursday = await classes.listClassesByDay(ctx(A), '2030-06-13', now);
  assert.ok(thursday.clases.some((c) => c.nombre === 'TEST-CLI lista rec' && c.estado === 'DISPONIBLE'));
  await assert.rejects(() => classes.listClassesByDay(ctx(A), '2030-06-20', now), { statusCode: 400 });
  // la baja de la ocurrencia que ya empezó hoy no se permite
  await prisma.inscripcionClase.create({ data: { claseId: weekly.id, clienteId: B.id, estadoInscripcionId: (await prisma.estadoInscripcion.findUnique({ where: { nombre: 'INSCRIPTO' } })).id } });
  await assert.rejects(() => classes.cancelEnrollment(ctx(B), weekly.id, at('2030-06-11', '10:30')), rejectsWith(409, 'CLASE_EN_CURSO'));
  await classes.cancelEnrollment(ctx(B), weekly.id, at('2030-06-11', '12:00'));
  void single; void other;
});

guard('próxima clase: próxima ocurrencia futura de la recurrente', async () => {
  const mine = await classes.listMyClasses(ctx(A), at('2030-01-01', '08:00'));
  assert.ok(Array.isArray(mine));
  const clase = await mkClass({ nombre: 'TEST-CLI proxima', recurrente: true, sala: 'TEST-CLI prox', fechaHora: at('2030-07-02', '07:00'), dias: { create: [{ diaSemana: 2 }, { diaSemana: 5 }] } });
  await classes.enrollInClass(ctx(C), clase.id);
  const next = await classes.getNextClass(ctx(C), at('2030-07-02', '08:00')); // martes ya pasó: viene el viernes
  assert.equal(next.nombre, 'TEST-CLI proxima');
  assert.equal(next.proximaOcurrencia.toISOString(), at('2030-07-05', '07:00').toISOString());
});

// ------------------------------- Racha y rutinas -------------------------------

guard('racha: semana lunes-domingo en Buenos Aires, un día cuenta una vez, 23:30 local no se corre de día', async () => {
  const now = at('2030-08-14', '12:00'); // miércoles
  // lunes 12/8: dos asistencias (cuenta 1). Martes 13/8 23:30 local = 02:30Z del miércoles (UTC).
  await prisma.asistencia.createMany({ data: [
    { clienteId: A.id, fechaHora: at('2030-08-12', '08:00') },
    { clienteId: A.id, fechaHora: at('2030-08-12', '19:00') },
    { clienteId: A.id, fechaHora: at('2030-08-13', '23:30') },
    { clienteId: A.id, fechaHora: at('2030-08-11', '20:00') }, // domingo de la semana anterior
  ] });
  const streak = await client.getStreak(A, now);
  assert.deepEqual(streak.dias.map((d) => d.asistio), [true, true, false, false, false, false, false]);
  assert.equal(streak.diasAsistidos, 2);
  assert.equal(streak.dias[2].esHoy, true);
  assert.equal(streak.dias[3].futuro, true);
  assert.equal(streak.dias[0].fecha, '2030-08-12');
  const nextWeek = await client.getStreak(A, at('2030-08-19', '09:00')); // lunes siguiente: se reinicia
  assert.equal(nextWeek.diasAsistidos, 0);
});

guard('rutina de hoy: activa con el día de hoy; otro día => ninguna; historial 30 días; detalle solo propio', async () => {
  const ejercicio = await prisma.ejercicio.findFirst();
  const mk = (data) => prisma.rutina.create({ data: { clienteId: A.id, profesorId: prof.id, nombre: 'TEST-CLI rutina', ...data, dias: { create: data.dias }, ejercicios: { create: [{ ejercicioId: ejercicio.id, series: 3, repeticiones: 10, ordenVisual: 1 }] } } });
  const today = await mk({ dias: [{ diaSemana: 2 }], fechaAsignacion: new Date('2030-09-01T00:00:00Z') });
  const old = await mk({ nombre: 'TEST-CLI vieja', activa: false, dias: [{ diaSemana: 2 }], fechaAsignacion: new Date('2030-07-01T00:00:00Z') });
  const now = at('2030-09-10', '10:00'); // martes
  assert.deepEqual((await content.listTodayRoutines(A, now)).map((r) => r.id), [today.id]);
  assert.equal((await content.listTodayRoutines(A, at('2030-09-11', '10:00'))).length, 0); // miércoles
  const history = (await content.listRoutineHistory(A, now)).map((r) => r.id);
  assert.ok(history.includes(today.id) && !history.includes(old.id));
  const detail = await content.getRoutine(A, today.id);
  assert.equal(detail.profesor, 'ProfCli Test');
  assert.equal(detail.ejercicios.length, 1);
  await assert.rejects(() => content.getRoutine(B, today.id), { statusCode: 404 });
});

// ------------------------------- Pagos con Mercado Pago (API mockeada) -------------------------------

const mpResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const approvedPayment = (cuotaId, over = {}) => ({ id: 777000 + cuotaId, status: 'approved', currency_id: 'ARS', transaction_amount: 13500, external_reference: String(cuotaId), date_approved: new Date().toISOString(), metadata: { cuota_id: cuotaId, expected_amount: 13500 }, ...over });

const mkPlan = async () => {
  const plan = await prisma.plan.create({ data: { nombre: `TEST-CLI plan ${Math.random()}`, duracionDias: 30, precio: 15000 } });
  await prisma.promocion.create({ data: { planId: plan.id, nombre: 'TEST-CLI promo', descuento: 10, fechaInicio: new Date(Date.now() - 86_400_000), fechaFin: new Date(Date.now() + 5 * 86_400_000) } });
  return plan;
};

guard('checkout: monto calculado por el backend (promoción en %), preferencia correcta y cuota PENDIENTE reutilizada', async (t) => {
  const plan = await mkPlan();
  let sent;
  t.mock.method(globalThis, 'fetch', async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return mpResponse({ id: 'pref-1', init_point: 'https://mp.test/pay' }); });
  const result = await payments.createCheckout(ctx(A), A.usuario, plan.id);
  assert.equal(result.initPoint, 'https://mp.test/pay');
  assert.match(sent.url, /\/checkout\/preferences$/);
  assert.equal(sent.body.items[0].unit_price, 13500);
  assert.equal(sent.body.items[0].currency_id, 'ARS');
  assert.equal(sent.body.items[0].quantity, 1);
  assert.equal(sent.body.external_reference, String(result.cuotaId));
  assert.equal(sent.body.payer.email, A.usuario.email);
  assert.equal(sent.body.metadata.expected_amount, 13500);
  assert.ok(sent.body.back_urls.success.endsWith('/home/cliente/pago/resultado'));
  const again = await payments.createCheckout(ctx(A), A.usuario, plan.id);
  assert.equal(again.cuotaId, result.cuotaId);
  assert.equal(await prisma.cuota.count({ where: { clienteId: A.id, planId: plan.id } }), 1);
  await assert.rejects(() => payments.createCheckout(ctx(A), A.usuario, 999999999), { statusCode: 404 });
  await assert.rejects(() => payments.createCheckout({ ...A, estadoCliente: { nombre: 'INHABILITADO_BAJA' } }, A.usuario, plan.id), { statusCode: 403 });
  assert.ok(!JSON.stringify(sent).includes(process.env.MERCADOPAGO_ACCESS_TOKEN ?? 'sin-token'));
});

guard('pago aprobado: cuota ACTIVA, pago MERCADO_PAGO, cliente rehabilitado; notificación repetida es idempotente', async (t) => {
  const plan = await mkPlan();
  const inhab = await prisma.estadoCliente.findUnique({ where: { nombre: 'INHABILITADO_PAGO' } });
  await prisma.cliente.update({ where: { id: B.id }, data: { estadoClienteId: inhab.id } });
  t.mock.method(globalThis, 'fetch', async () => mpResponse({ id: 'pref', init_point: 'https://mp.test/pay' }));
  const { cuotaId } = await payments.createCheckout({ ...B, estadoCliente: { nombre: 'INHABILITADO_PAGO' } }, B.usuario, plan.id);

  const payment = approvedPayment(cuotaId);
  t.mock.method(globalThis, 'fetch', async () => mpResponse(payment));
  const first = await payments.verifyReturn(ctx(B), { payment_id: String(payment.id), status: 'rejected' /* lo que diga la URL no importa */ });
  assert.equal(first.estado, 'APROBADO');
  const again = await payments.handleWebhookPayment(String(payment.id)); // llega por la otra vía
  assert.equal(again.estado, 'APROBADO');
  assert.equal(again.yaProcesado, true);

  const quota = await prisma.cuota.findUnique({ where: { id: cuotaId }, include: { estadoCuota: true, pago: { include: { metodoPago: true } } } });
  assert.equal(quota.estadoCuota.nombre, 'ACTIVA');
  assert.equal(quota.pago.metodoPago.nombre, 'MERCADO_PAGO');
  assert.equal(Number(quota.pago.monto), 13500);
  assert.equal(quota.pago.referenciaExterna, String(payment.id));
  assert.equal(await prisma.pago.count({ where: { cuotaId } }), 1);
  assert.equal(Math.round((quota.fechaVencimiento - quota.fechaInicio) / 86_400_000), 30);
  assert.equal((await prisma.cliente.findUnique({ where: { id: B.id }, include: { estadoCliente: true } })).estadoCliente.nombre, 'HABILITADO');
  const membership = await client.getMembership(B);
  assert.equal(membership.estado, 'ACTIVA');
});

guard('pendiente / rechazado: no activan nada; si luego se aprueba, sí', async (t) => {
  const plan = await mkPlan();
  t.mock.method(globalThis, 'fetch', async () => mpResponse({ id: 'pref', init_point: 'https://mp.test/pay' }));
  const { cuotaId } = await payments.createCheckout(ctx(C), C.usuario, plan.id);
  for (const [status, expected] of [['pending', 'PENDIENTE'], ['in_process', 'PENDIENTE'], ['rejected', 'RECHAZADO'], ['cancelled', 'RECHAZADO']]) {
    t.mock.method(globalThis, 'fetch', async () => mpResponse(approvedPayment(cuotaId, { status })));
    assert.equal((await payments.verifyReturn(ctx(C), { payment_id: '1' })).estado, expected);
  }
  assert.equal((await prisma.cuota.findUnique({ where: { id: cuotaId }, include: { estadoCuota: true } })).estadoCuota.nombre, 'PENDIENTE');
  assert.equal(await prisma.pago.count({ where: { cuotaId } }), 0);
  t.mock.method(globalThis, 'fetch', async () => mpResponse(approvedPayment(cuotaId)));
  assert.equal((await payments.handleWebhookPayment('1')).estado, 'APROBADO');
});

guard('seguridad del pago: monto distinto, moneda, cuota inexistente, cuota de otro cliente, pago ya usado', async (t) => {
  const plan = await mkPlan();
  t.mock.method(globalThis, 'fetch', async () => mpResponse({ id: 'pref', init_point: 'https://mp.test/pay' }));
  const { cuotaId } = await payments.createCheckout(ctx(A), A.usuario, plan.id);

  for (const over of [{ transaction_amount: 1 }, { currency_id: 'USD' }, { metadata: { cuota_id: cuotaId, expected_amount: 1, plan_id: 1 } }]) {
    t.mock.method(globalThis, 'fetch', async () => mpResponse(approvedPayment(cuotaId, over)));
    await assert.rejects(() => payments.handleWebhookPayment('5'), rejectsWith(409, 'PAGO_NO_COINCIDE'));
  }
  assert.equal(await prisma.pago.count({ where: { cuotaId } }), 0);
  assert.equal((await prisma.cuota.findUnique({ where: { id: cuotaId }, include: { estadoCuota: true } })).estadoCuota.nombre, 'PENDIENTE');

  t.mock.method(globalThis, 'fetch', async () => mpResponse(approvedPayment(cuotaId)));
  await assert.rejects(() => payments.verifyReturn(ctx(B), { payment_id: '5' }), { statusCode: 404 }); // otro cliente

  t.mock.method(globalThis, 'fetch', async () => mpResponse(approvedPayment(999999999)));
  await assert.rejects(() => payments.handleWebhookPayment('6'), rejectsWith(404, 'CUOTA_NO_ENCONTRADA'));
  await assert.rejects(() => payments.verifyReturn(ctx(A), { payment_id: '6' }), { statusCode: 404 });

  t.mock.method(globalThis, 'fetch', async () => mpResponse(approvedPayment(cuotaId)));
  await payments.handleWebhookPayment('7'); // se aprueba
  t.mock.method(globalThis, 'fetch', async () => mpResponse(approvedPayment(cuotaId, { id: 123 })));
  await assert.rejects(() => payments.handleWebhookPayment('8'), rejectsWith(409, 'CUOTA_YA_PAGA')); // otro pago sobre una cuota ya paga

  t.mock.method(globalThis, 'fetch', async () => mpResponse({ message: 'not_found' }, 404));
  assert.equal((await payments.verifyReturn(ctx(A), { payment_id: 'x' })).estado, 'SIN_PAGO');
});

guard('renovación anticipada (faltan 2 días): la nueva arranca HOY, suma los días que quedaban y la anterior pasa a VENCIDA sin tocar sus fechas', async (t) => {
  const C = await mkClient('E'); // cliente sin pagos previos
  const plan = await mkPlan();
  const active = await prisma.estadoCuota.findUnique({ where: { nombre: 'ACTIVA' } });
  const day = 86_400_000;
  const todayUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const current = await prisma.cuota.create({ data: { clienteId: C.id, planId: plan.id, estadoCuotaId: active.id, fechaInicio: new Date(todayUtc - 28 * day), fechaVencimiento: new Date(todayUtc.getTime() + 2 * day) } });
  t.mock.method(globalThis, 'fetch', async () => mpResponse({ id: 'pref', init_point: 'https://mp.test/pay' }));
  const { cuotaId } = await payments.createCheckout(ctx(C), C.usuario, plan.id);
  t.mock.method(globalThis, 'fetch', async () => mpResponse(approvedPayment(cuotaId)));
  await payments.handleWebhookPayment('9');
  const renewed = await prisma.cuota.findUnique({ where: { id: cuotaId }, include: { estadoCuota: true } });
  const todayGym = new Date(gymTodayMs());
  assert.equal(renewed.estadoCuota.nombre, 'ACTIVA');
  assert.equal(renewed.fechaInicio.getTime(), todayGym.getTime());
  assert.equal(renewed.fechaVencimiento.getTime(), todayGym.getTime() + (2 + plan.duracionDias) * day); // desde el vencimiento actual, no desde hoy
  const old = await prisma.cuota.findUnique({ where: { id: current.id }, include: { estadoCuota: true } });
  assert.equal(old.estadoCuota.nombre, 'VENCIDA');
  assert.equal(old.fechaInicio.getTime(), current.fechaInicio.getTime());
  assert.equal(old.fechaVencimiento.getTime(), current.fechaVencimiento.getTime());
  const membership = await client.getMembership(C);
  assert.equal(membership.estado, 'ACTIVA');
  assert.equal(membership.cuota.id, cuotaId);
});

// ------------------------------- Avisos de vencimiento -------------------------------

guard('avisos de cuota y apto: a 10 días o menos, sin duplicar, claves nuevas con renovación', async () => {
  const D = await mkClient('D');
  const plan = await prisma.plan.create({ data: { nombre: 'TEST-CLI plan aviso', duracionDias: 30, precio: 1000 } });
  const active = await prisma.estadoCuota.findUnique({ where: { nombre: 'ACTIVA' } });
  const now = at('2031-01-10', '12:00');
  const quota = await prisma.cuota.create({ data: { clienteId: D.id, planId: plan.id, estadoCuotaId: active.id, fechaInicio: new Date('2030-12-18T00:00:00Z'), fechaVencimiento: new Date('2031-01-17T00:00:00Z') } });
  await prisma.cliente.update({ where: { id: D.id }, data: { aptoFisicoFechaVencimiento: new Date('2031-01-14T00:00:00Z') } });

  const mine = () => prisma.notificacion.findMany({ where: { usuarioId: D.usuarioId }, include: { tipoNotificacion: true }, orderBy: { id: 'asc' } });
  await generateExpiryReminders(now);
  await generateExpiryReminders(now);
  await generateExpiryReminders(at('2031-01-12', '09:00')); // otro día: tampoco duplica
  const first = await mine();
  assert.deepEqual(first.map((n) => n.tipoNotificacion.nombre).sort(), ['VENCIMIENTO_APTO_FISICO', 'VENCIMIENTO_CUOTA']);
  const cuotaAviso = first.find((n) => n.tipoNotificacion.nombre === 'VENCIMIENTO_CUOTA');
  assert.equal(cuotaAviso.claveDedup, `cuota:${quota.id}`);
  assert.match(cuotaAviso.mensaje, /TEST-CLI plan aviso.*en 7 días.*17\/01\/2031/);
  assert.match(first.find((n) => n.tipoNotificacion.nombre === 'VENCIMIENTO_APTO_FISICO').mensaje, /14\/01\/2031/);

  // fuera de los 10 días no avisa; apto nuevo => clave nueva => aviso nuevo
  await prisma.cliente.update({ where: { id: D.id }, data: { aptoFisicoFechaVencimiento: new Date('2031-06-01T00:00:00Z') } });
  await generateExpiryReminders(now);
  assert.equal((await mine()).length, 2);
  await prisma.cliente.update({ where: { id: D.id }, data: { aptoFisicoFechaVencimiento: new Date('2031-01-15T00:00:00Z') } });
  await generateExpiryReminders(now);
  assert.equal((await mine()).length, 3);

  // renovación paga que empieza al vencer: no se avisa mientras la anterior sigue vigente (ya había aviso) ...
  const renewal = await prisma.cuota.create({ data: { clienteId: D.id, planId: plan.id, estadoCuotaId: active.id, fechaInicio: new Date('2031-01-17T00:00:00Z'), fechaVencimiento: new Date('2031-02-16T00:00:00Z') } });
  await generateExpiryReminders(at('2031-01-16', '09:00'));
  assert.equal((await mine()).filter((n) => n.tipoNotificacion.nombre === 'VENCIMIENTO_CUOTA').length, 1);
  // ... y cuando la renovada está por vencer, su clave nueva genera un aviso nuevo (una sola vez)
  await generateExpiryReminders(at('2031-02-10', '09:00'));
  await generateExpiryReminders(at('2031-02-11', '09:00'));
  const quotaNotices = (await mine()).filter((n) => n.tipoNotificacion.nombre === 'VENCIMIENTO_CUOTA');
  assert.deepEqual(quotaNotices.map((n) => n.claveDedup), [`cuota:${quota.id}`, `cuota:${renewal.id}`]);
});

guard('perfil: apto físico por estado y cuotas ignoradas; historial de pagos paginado', async () => {
  const d = (iso) => new Date(`${iso}T00:00:00Z`);
  const now = at('2031-05-10', '12:00');
  const base = { ...A, aptoFisicoArchivo: null };
  assert.equal(client.getMedicalClearance({ ...base, aptoFisicoFechaVencimiento: null }, now).estado, 'SIN_CARGAR');
  assert.equal(client.getMedicalClearance({ ...base, aptoFisicoFechaVencimiento: d('2031-05-09') }, now).estado, 'VENCIDO');
  assert.equal(client.getMedicalClearance({ ...base, aptoFisicoFechaVencimiento: d('2031-05-20') }, now).estado, 'POR_VENCER');
  assert.equal(client.getMedicalClearance({ ...base, aptoFisicoFechaVencimiento: d('2031-05-21') }, now).estado, 'VIGENTE');
  assert.equal(client.getMedicalClearance({ ...base, aptoFisicoFechaVencimiento: d('2031-05-20') }, now).diasRestantes, 10);
  const page = await client.listPayments(B, { page: 1, limit: 5 });
  assert.ok(page.pagination.total >= 1);
  assert.ok(page.items.every((item) => typeof item.monto === 'number' && item.metodo));
  assert.throws(() => client.getMedicalClearanceFile({ aptoFisicoArchivo: '../../etc/passwd' }), { statusCode: 404 });
});
