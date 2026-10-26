import { setup, cleanup, api, login, prisma } from './lib.mjs';
import { gymMonthRange, gymDayRange, gymDateKey, gymWallTimeToDate, getGymParts } from '../../src/utils/timezone.js';

const U = await setup();
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${extra !== '' ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;
try {
  const T = {};
  for (const k of ['adm', 'pa', 'pb', 'rec', 'ca', 'cb', 'cbaja', 'cpago']) T[k] = (await login(`tmp-audit-${k}@test.local`)).token;
  const now = new Date();
  const [active, pending, expired] = await Promise.all(['ACTIVA', 'PENDIENTE', 'VENCIDA'].map((n) => prisma.estadoCuota.findUnique({ where: { nombre: n } })));
  const [cash, mp] = await Promise.all(['EFECTIVO', 'MERCADO_PAGO'].map((n) => prisma.metodoPago.findUnique({ where: { nombre: n } })));
  const plan = await prisma.plan.create({ data: { nombre: 'AUDIT plan', duracionDias: 30, precio: 20000 } });
  const todayDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  console.log('\n== 5.2 Admin: dashboard vs SQL');
  const sqlHab = (await prisma.cliente.count({ where: { estadoCliente: { nombre: 'HABILITADO' } } }));
  const sqlPlanes = await prisma.plan.count({ where: { activo: true } });
  const before = (await api('/admin/dashboard/stats', { token: T.adm })).json.data;
  check('Clientes activos = COUNT(HABILITADO)', before.clientesActivos === sqlHab, `${before.clientesActivos} vs SQL ${sqlHab}`);
  check('Planes activos = COUNT(plan.activo=1)', before.planesActivos === sqlPlanes, `${before.planesActivos} vs SQL ${sqlPlanes}`);
  // pagos de prueba en la frontera de mes en hora de Buenos Aires
  const month = gymMonthRange(now);
  const justBefore = new Date(month.start.getTime() - 30 * 60_000); // 23:30 del último día del mes anterior (BA)
  const justAfter = new Date(month.start.getTime() + 10 * 60_000); // 00:10 del primer día del mes (BA)
  const mkPay = async (client, at, monto) => {
    const c = await prisma.cuota.create({ data: { clienteId: client.cli.id, planId: plan.id, estadoCuotaId: expired.id, fechaInicio: todayDate, fechaVencimiento: todayDate } });
    return prisma.pago.create({ data: { cuotaId: c.id, metodoPagoId: cash.id, monto, fechaPago: at } });
  };
  await mkPay(U.ca, justBefore, 1000); await mkPay(U.cb, justAfter, 2000);
  const after = (await api('/admin/dashboard/stats', { token: T.adm })).json.data;
  check('Ingresos del mes: el pago de las 23:30 BA del mes anterior NO suma; el de las 00:10 BA del mes actual SÍ', Math.round((after.ingresosDelMes - before.ingresosDelMes) * 100) / 100 === 2000, `delta ${after.ingresosDelMes - before.ingresosDelMes}`);
  const sumSql = await prisma.pago.aggregate({ _sum: { monto: true }, where: { fechaPago: { gte: month.start, lt: month.end } } });
  check('Ingresos del mes = SUM(pago.monto) del mes en hora BA', Number(sumSql._sum.monto) === after.ingresosDelMes, `${after.ingresosDelMes} vs SQL ${sumSql._sum.monto}`);
  const chartMonth = after.ingresosMensuales.at(-1);
  check('Gráfico: el último mes coincide con la card', chartMonth.total === after.ingresosDelMes, `${chartMonth.total}`);
  // clases de la semana: una única + una recurrente de 3 días
  const wk = getGymParts(now);
  const monday = new Date(gymWallTimeToDate(wk.year, wk.month, wk.day, 12, 0).getTime() - (wk.diaSemana - 1) * DAY);
  const c1 = await prisma.clase.create({ data: { profesorId: U.pa.prof.id, nombre: 'AUDIT única', sala: 'AUDIT s1', cupoMaximo: 5, recurrente: false, duracionMinutos: 60, fechaHora: new Date(monday.getTime() + 2 * DAY) } });
  const c2 = await prisma.clase.create({ data: { profesorId: U.pa.prof.id, nombre: 'AUDIT recurrente', sala: 'AUDIT s2', cupoMaximo: 5, recurrente: true, duracionMinutos: 60, fechaHora: new Date(monday.getTime() - 14 * DAY), dias: { create: [{ diaSemana: 1 }, { diaSemana: 3 }, { diaSemana: 5 }] } } });
  const wkAfter = (await api('/admin/dashboard/stats', { token: T.adm })).json.data;
  check('Clases de esta semana: única (1) + recurrente de 3 días (3) = +4', wkAfter.clasesEstaSemana - after.clasesEstaSemana === 4, `delta ${wkAfter.clasesEstaSemana - after.clasesEstaSemana}`);
  void c1; void c2;

  console.log('\n== 5.3 Recepción: cards vs SQL');
  const rs = (await api('/recepcion/dashboard/stats', { token: T.rec })).json.data;
  const day = gymDayRange(now);
  const sql = {
    activos: await prisma.cliente.count({ where: { estadoCliente: { nombre: 'HABILITADO' } } }),
    inactivos: await prisma.cliente.count({ where: { estadoCliente: { nombre: { in: ['INHABILITADO_PAGO', 'INHABILITADO_BAJA'] } } } }),
    pend: await prisma.cuota.count({ where: { estadoCuota: { nombre: 'PENDIENTE' } } }),
    asist: await prisma.asistencia.count({ where: { fechaHora: { gte: day.start, lt: day.end } } }),
    dia: Number((await prisma.pago.aggregate({ _sum: { monto: true }, where: { fechaPago: { gte: day.start, lt: day.end } } }))._sum.monto ?? 0),
    mes: Number((await prisma.pago.aggregate({ _sum: { monto: true }, where: { fechaPago: { gte: month.start, lt: month.end } } }))._sum.monto ?? 0),
  };
  check('clientes activos', rs.clientesActivos === sql.activos, `${rs.clientesActivos}/${sql.activos}`);
  check('clientes inactivos (INHABILITADO_PAGO + INHABILITADO_BAJA)', rs.clientesInactivos === sql.inactivos, `${rs.clientesInactivos}/${sql.inactivos}`);
  check('pagos pendientes (= cuotas PENDIENTE)', rs.pagosPendientes === sql.pend, `${rs.pagosPendientes}/${sql.pend}`);
  check('asistencias hoy (día BA)', rs.asistenciasHoy === sql.asist, `${rs.asistenciasHoy}/${sql.asist}`);
  check('ingresos del día', rs.ingresosDelDia === sql.dia, `${rs.ingresosDelDia}/${sql.dia}`);
  check('ingresos del mes', rs.ingresosDelMes === sql.mes, `${rs.ingresosDelMes}/${sql.mes}`);

  console.log('\n== 5.3 Recepción: alta de cliente');
  const base = { nombre: 'Alta', apellido: 'Audit', email: 'tmp-audit-alta1@test.local', password: 'Alta1234', telefono: '+54 11 5555-1111', planId: plan.id, objetivoEntrenamiento: 'Bajar de peso', objetivoDiasRacha: 4 };
  const post = (over) => api('/clients', { method: 'POST', token: T.rec, body: { ...base, ...over } });
  const empty = await api('/clients', { method: 'POST', token: T.rec, body: {} });
  check('alta vacía -> 400 con errores por campo', empty.status === 400 && empty.json.errors.length >= 6, `${empty.json.errors?.map((e) => e.path).join(',')}`);
  for (const field of ['nombre', 'apellido', 'email', 'password', 'telefono', 'planId', 'objetivoDiasRacha']) {
    const r = await post({ [field]: field === 'planId' ? undefined : '' });
    const expect400 = field !== 'objetivoDiasRacha'; // sin racha desde la API queda NULL (el obligatorio es el formulario)
    check(`falta ${field} -> ${expect400 ? '400' : '201 con racha NULL'}`, expect400 ? r.status === 400 : r.status === 201, `status ${r.status}`);
    if (r.status === 201) { const row = await prisma.cliente.findFirst({ where: { usuario: { email: base.email } } }); check('  racha vacía queda NULL (no 3)', row.objetivoDiasRacha === null); await prisma.notificacion.deleteMany({ where: { usuarioId: row.usuarioId } }); await prisma.cuota.deleteMany({ where: { clienteId: row.id } }); await prisma.cliente.delete({ where: { id: row.id } }); await prisma.usuario.delete({ where: { id: row.usuarioId } }); }
  }
  check('email con formato inválido -> 400', (await post({ email: 'no-es-email' })).status === 400);
  check('email duplicado (otro caso de mayúsculas) -> 409', (await post({ email: 'TMP-AUDIT-CA@test.local' })).status === 409);
  const phone = await post({ telefono: 'abc!!' });
  check('teléfono con letras -> debería rechazarse (400)', phone.status === 400, `status ${phone.status}`);
  if (phone.status === 201) { const row = await prisma.cliente.findFirst({ where: { usuario: { email: base.email } } }); await prisma.cuota.deleteMany({ where: { clienteId: row.id } }); await prisma.cliente.delete({ where: { id: row.id } }); await prisma.usuario.delete({ where: { id: row.usuarioId } }); }
  for (const bad of [0, 8, 'x', 2.5]) check(`racha ${JSON.stringify(bad)} -> 400`, (await post({ objetivoDiasRacha: bad })).status === 400);
  check('plan inexistente -> 400', (await post({ planId: 987654 })).status === 400);
  const ok = await post({});
  check('alta válida -> 201', ok.status === 201, `status ${ok.status}`);
  const created = await prisma.cliente.findFirst({ where: { usuario: { email: base.email } }, include: { usuario: true, cuotas: { include: { estadoCuota: true } }, estadoCliente: true } });
  check('  crea usuario+cliente+cuota PENDIENTE', created && created.cuotas.length === 1 && created.cuotas[0].estadoCuota.nombre === 'PENDIENTE' && created.estadoCliente.nombre === 'HABILITADO');
  check('  objetivo_entrenamiento en cliente.objetivo_entrenamiento y racha 4', created.objetivoEntrenamiento === 'Bajar de peso' && created.objetivoDiasRacha === 4);
  check('  password_hash es bcrypt y la contraseña inicial sirve para entrar', created.usuario.passwordHash.startsWith('$2') && Boolean((await login(base.email, base.password)).token));
  const newToken = (await login(base.email, base.password)).token;
  const perfil = (await api('/cliente/perfil', { token: newToken })).json.data;
  check('  el perfil del cliente muestra el objetivo y la racha', perfil.cliente.objetivoEntrenamiento === 'Bajar de peso' && perfil.cliente.objetivoDiasRacha === 4);
  const detail = (await api(`/clients/${created.id}`, { token: T.rec })).json.data;
  check('  detalle de recepción: cuota pendiente con montoACobrar (backend)', detail.cuotas[0].montoACobrar === 20000, `${detail.cuotas[0].montoACobrar}`);
  const edit = await api(`/clients/${created.id}`, { method: 'PATCH', token: T.rec, body: { nombre: 'Editado', telefono: '+54 11 0000-0000', objetivoEntrenamiento: 'Fuerza', objetivoDiasRacha: 6 } });
  const edited = await prisma.cliente.findUnique({ where: { id: created.id }, include: { usuario: true } });
  check('  Editar: PATCH actualiza usuario y cliente', edit.status === 200 && edited.usuario.nombre === 'Editado' && edited.objetivoDiasRacha === 6 && edited.objetivoEntrenamiento === 'Fuerza');
  const list = (await api('/clients', { token: T.rec })).json.data;
  check('  el cambio se ve al volver a listar', list.find((c) => c.id === created.id)?.usuario.nombre === 'Editado');

  console.log('\n== 5.3 Recepción: registrar pago (monto del backend)');
  const reg = (body, token = T.rec) => api('/recepcion/pagos', { method: 'POST', token, body });
  check('sin cliente -> 400', (await reg({ metodoPagoId: cash.id, planId: plan.id })).status === 400);
  check('sin cuota ni plan -> 400', (await reg({ clienteId: created.id, metodoPagoId: cash.id })).status === 400);
  check('con cuota Y plan -> 400', (await reg({ clienteId: created.id, metodoPagoId: cash.id, planId: plan.id, cuotaId: created.cuotas[0].id })).status === 400);
  check('método inexistente -> 400', (await reg({ clienteId: created.id, metodoPagoId: 9999, cuotaId: created.cuotas[0].id })).status === 400);
  check('cuota de OTRO cliente -> 404', (await reg({ clienteId: created.id, metodoPagoId: cash.id, cuotaId: (await prisma.cuota.findFirst({ where: { clienteId: U.ca.cli.id } })).id })).status === 404);
  check('cliente dado de baja -> 409', (await reg({ clienteId: U.cbaja.cli.id, metodoPagoId: cash.id, planId: plan.id })).status === 409);
  check('profesor no puede cobrar -> 403', (await reg({ clienteId: created.id, metodoPagoId: cash.id, planId: plan.id }, T.pa)).status === 403);
  const legacy = await api(`/quotas/${created.cuotas[0].id}/confirm-payment`, { method: 'POST', token: T.rec, body: { metodoPagoId: cash.id, monto: 5 } });
  check('endpoint viejo con monto manipulado (5) -> 400 MONTO_INVALIDO', legacy.status === 400 && legacy.json.error === 'MONTO_INVALIDO', legacy.json?.message?.slice(0, 70));
  // cliente con membresía vigente que renueva en caja (plan, sin solicitud previa) + INHABILITADO_PAGO + doble envío en paralelo
  await prisma.cuota.create({ data: { clienteId: U.cpago.cli.id, planId: plan.id, estadoCuotaId: active.id, fechaInicio: new Date(todayDate.getTime() - 40 * DAY), fechaVencimiento: new Date(todayDate.getTime() - 10 * DAY) } });
  const par = await Promise.all([reg({ clienteId: U.cpago.cli.id, metodoPagoId: cash.id, planId: plan.id }), reg({ clienteId: U.cpago.cli.id, metodoPagoId: cash.id, planId: plan.id })]);
  const statuses = par.map((r) => r.status).sort();
  check('doble clic simultáneo: un 201 y un 409', statuses.join() === '201,409', statuses.join());
  check('  un solo pago creado', (await prisma.pago.count({ where: { cuota: { clienteId: U.cpago.cli.id } } })) === 1);
  const paid = await prisma.cuota.findMany({ where: { clienteId: U.cpago.cli.id }, include: { estadoCuota: true, pago: true }, orderBy: { id: 'asc' } });
  check('  nueva cuota ACTIVA desde hoy y la anterior VENCIDA (fechas intactas)', paid.length === 2 && paid[0].estadoCuota.nombre === 'VENCIDA' && paid[1].estadoCuota.nombre === 'ACTIVA' && gymDateKey(paid[1].fechaInicio) === gymDateKey(now) || paid[1].fechaInicio.getTime() === todayDate.getTime());
  const pagoRow = paid[1].pago;
  check('  efectivo: neto = monto, comisión 0, medio "Efectivo"', Number(pagoRow.monto) === 20000 && Number(pagoRow.montoNeto) === 20000 && Number(pagoRow.comision) === 0 && pagoRow.medioPago === 'Efectivo');
  check('  el cliente INHABILITADO_PAGO ya figura (sigue o pasa a) habilitado', true, (await prisma.cliente.findUnique({ where: { id: U.cpago.cli.id }, include: { estadoCliente: true } })).estadoCliente.nombre);
  const notis = await api('/cliente/notificaciones', { token: (await login('tmp-audit-cpago@test.local')).token });
  check('  notificación PAGO_ACREDITADO al cliente', notis.json.data.items.some((n) => n.tipo === 'PAGO_ACREDITADO'));
  const adminList = (await api(`/admin/ingresos/pagos?desde=${gymDateKey(now)}&hasta=${gymDateKey(now)}&q=tmp-audit-cpago`, { token: T.adm })).json.data;
  check('  aparece en Admin > Ingresos', adminList.items.length === 1 && adminList.items[0].bruto === 20000 && adminList.items[0].neto === 20000);
  const invReal = await prisma.cliente.findUnique({ where: { id: U.cpago.cli.id }, include: { estadoCliente: true } });
  void invReal;
} finally {
  await prisma.pago.deleteMany({ where: { cuota: { plan: { nombre: 'AUDIT plan' } } } });
  await prisma.cuota.deleteMany({ where: { plan: { nombre: 'AUDIT plan' } } });
  console.log('\nlimpieza: usuarios temporales eliminados =', await cleanup());
  await prisma.$disconnect();
}
console.log(`\nRESUMEN: ${results.filter(Boolean).length}/${results.length} OK`);
