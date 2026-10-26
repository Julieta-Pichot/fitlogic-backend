// Dashboard del administrador: los límites de mes y semana son de Buenos Aires y las clases recurrentes cuentan por cada día.
// Usa fechas de 2032 y la hora actual inyectada (parámetro `now`): no depende de la fecha real ni toca datos existentes.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import { countClassesInWeek, getDashboardStats } from '../src/services/dashboard.service.js';

const suffix = Date.now();
let reachable = true;
let prof;
let client;
const created = { users: [] };
const at = (date, time) => new Date(`${date}T${time}:00-03:00`);

before(async () => {
  try {
    const rolP = await prisma.rol.findUnique({ where: { nombre: 'PROFESOR' } });
    const rolC = await prisma.rol.findUnique({ where: { nombre: 'CLIENTE' } });
    const estado = await prisma.estadoCliente.findUnique({ where: { nombre: 'HABILITADO' } });
    const up = await prisma.usuario.create({ data: { rolId: rolP.id, nombre: 'ProfDash', apellido: 'Test', email: `tmp-dash-p-${suffix}@test.local`, passwordHash: 'x', activo: true } });
    const uc = await prisma.usuario.create({ data: { rolId: rolC.id, nombre: 'CliDash', apellido: 'Test', email: `tmp-dash-c-${suffix}@test.local`, passwordHash: 'x', activo: true } });
    created.users.push(up.id, uc.id);
    prof = await prisma.profesor.create({ data: { usuarioId: up.id, estadoCuentaStaffId: 1 } });
    client = await prisma.cliente.create({ data: { usuarioId: uc.id, estadoClienteId: estado.id } });
  } catch {
    reachable = false;
  }
});

after(async () => {
  if (!reachable) return;
  const quotas = await prisma.cuota.findMany({ where: { clienteId: client.id }, select: { id: true } });
  await prisma.pago.deleteMany({ where: { cuotaId: { in: quotas.map((q) => q.id) } } });
  await prisma.cuota.deleteMany({ where: { clienteId: client.id } });
  const classes = await prisma.clase.findMany({ where: { profesorId: prof.id }, select: { id: true } });
  await prisma.claseDia.deleteMany({ where: { claseId: { in: classes.map((c) => c.id) } } });
  await prisma.clase.deleteMany({ where: { profesorId: prof.id } });
  await prisma.plan.deleteMany({ where: { nombre: { startsWith: 'TEST-DASH' } } });
  await prisma.cliente.deleteMany({ where: { id: client.id } });
  await prisma.profesor.deleteMany({ where: { id: prof.id } });
  await prisma.usuario.deleteMany({ where: { id: { in: created.users } } });
  await prisma.$disconnect();
});

const guard = (name, fn) => test(name, async (t) => (reachable ? fn(t) : t.skip('BD no disponible')));

guard('ingresos del mes: el pago de las 23:30 (BA) del 29/02 es de febrero y el de las 00:10 (BA) del 01/03 es de marzo', async () => {
  const plan = await prisma.plan.create({ data: { nombre: `TEST-DASH plan ${suffix}`, duracionDias: 30, precio: 1000 } });
  const vencida = await prisma.estadoCuota.findUnique({ where: { nombre: 'VENCIDA' } });
  const cash = await prisma.metodoPago.findUnique({ where: { nombre: 'EFECTIVO' } });
  const mk = async (when, monto) => {
    const cuota = await prisma.cuota.create({ data: { clienteId: client.id, planId: plan.id, estadoCuotaId: vencida.id, fechaInicio: new Date('2032-01-01'), fechaVencimiento: new Date('2032-01-31') } });
    await prisma.pago.create({ data: { cuotaId: cuota.id, metodoPagoId: cash.id, monto, fechaPago: when } });
  };
  const now = at('2032-03-15', '12:00');
  const before = await getDashboardStats(6, now);
  await mk(at('2032-02-29', '23:30'), 700); // 02:30Z del 01/03: en UTC ya es marzo, en Buenos Aires todavía es febrero
  await mk(at('2032-03-01', '00:10'), 1100);
  const after = await getDashboardStats(6, now);
  assert.equal(Math.round((after.ingresosDelMes - before.ingresosDelMes) * 100) / 100, 1100);
  const feb = after.ingresosMensuales.find((m) => m.month === 2);
  const febBefore = before.ingresosMensuales.find((m) => m.month === 2);
  assert.equal(Math.round((feb.total - febBefore.total) * 100) / 100, 700);
  assert.equal(after.ingresosMensuales.at(-1).total, after.ingresosDelMes); // el gráfico y la card coinciden
});

guard('clases de la semana: única + recurrente cuentan por ocurrencia (semana lunes-domingo de Buenos Aires)', async () => {
  const now = at('2032-03-17', '12:00'); // miércoles; semana del 15 al 21/03/2032
  const base = await countClassesInWeek(now);
  await prisma.clase.create({ data: { profesorId: prof.id, nombre: 'TEST-DASH única', sala: `TEST-DASH ${suffix}`, cupoMaximo: 5, recurrente: false, duracionMinutos: 60, fechaHora: at('2032-03-18', '10:00') } });
  await prisma.clase.create({ data: { profesorId: prof.id, nombre: 'TEST-DASH fuera de semana', sala: `TEST-DASH2 ${suffix}`, cupoMaximo: 5, recurrente: false, duracionMinutos: 60, fechaHora: at('2032-03-22', '10:00') } }); // lunes siguiente: no cuenta
  await prisma.clase.create({ data: { profesorId: prof.id, nombre: 'TEST-DASH recurrente', sala: `TEST-DASH3 ${suffix}`, cupoMaximo: 5, recurrente: true, duracionMinutos: 60, fechaHora: at('2032-02-02', '09:00'), dias: { create: [{ diaSemana: 1 }, { diaSemana: 3 }, { diaSemana: 5 }] } } });
  assert.equal((await countClassesInWeek(now)) - base, 1 + 3);
  // domingo 21/03 a las 23:30 BA todavía pertenece a esa semana; el lunes 22/03 00:10 BA ya es la siguiente
  await prisma.clase.create({ data: { profesorId: prof.id, nombre: 'TEST-DASH domingo noche', sala: `TEST-DASH4 ${suffix}`, cupoMaximo: 5, recurrente: false, duracionMinutos: 30, fechaHora: at('2032-03-21', '23:30') } });
  assert.equal((await countClassesInWeek(now)) - base, 1 + 3 + 1);
});
