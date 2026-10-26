// Seguridad y permisos de punta a punta: arranca el servidor REAL (puerto propio, sin scheduler, Mercado Pago simulado),
// crea usuarios temporales de los 4 roles (más estados especiales) y verifica:
//   - matriz endpoint x rol (401 sin token, 403 con rol incorrecto, permitido con el rol correcto)
//   - que ninguna respuesta filtre password_hash
//   - IDOR entre clientes y entre profesores
//   - cuentas inhabilitadas, límite de intentos de login, JWT inválidos, CORS y cabeceras
//   - archivos subidos (tipo real por contenido) y apto físico solo por endpoint autenticado
// Todo lo que crea lleva el prefijo tmp-test-sec- y se borra al terminar.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';

const PORT = 3913;
const BASE = `http://127.0.0.1:${PORT}/api`;
const PREFIX = 'tmp-test-sec-';
const PASSWORD = 'Seguridad1234';
const X = 999999999;
let reachable = true;
let server;
const U = {};
const T = {};
const files = [];

const api = async (route, { method = 'GET', body, token, form, headers = {} } = {}) => {
  const res = await fetch(BASE + route, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* no es JSON */ }
  return { status: res.status, json, text, headers: res.headers };
};
const login = async (email, password = PASSWORD) => (await api('/auth/login', { method: 'POST', body: { email, password } })).json?.data?.token;

const cleanup = async () => {
  const users = await prisma.usuario.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  const cids = (await prisma.cliente.findMany({ where: { usuarioId: { in: uids } }, select: { id: true } })).map((c) => c.id);
  const pids = (await prisma.profesor.findMany({ where: { usuarioId: { in: uids } }, select: { id: true } })).map((p) => p.id);
  const qids = (await prisma.cuota.findMany({ where: { clienteId: { in: cids } }, select: { id: true } })).map((q) => q.id);
  const clids = (await prisma.clase.findMany({ where: { profesorId: { in: pids } }, select: { id: true } })).map((c) => c.id);
  const rids = (await prisma.rutina.findMany({ where: { OR: [{ clienteId: { in: cids } }, { profesorId: { in: pids } }] }, select: { id: true } })).map((r) => r.id);
  const reids = (await prisma.receta.findMany({ where: { profesorId: { in: pids } }, select: { id: true } })).map((r) => r.id);
  await prisma.notificacion.deleteMany({ where: { OR: [{ usuarioId: { in: uids } }, { claseId: { in: clids } }] } });
  await prisma.inscripcionClase.deleteMany({ where: { OR: [{ claseId: { in: clids } }, { clienteId: { in: cids } }] } });
  await prisma.claseDia.deleteMany({ where: { claseId: { in: clids } } });
  await prisma.clase.deleteMany({ where: { id: { in: clids } } });
  await prisma.asistencia.deleteMany({ where: { clienteId: { in: cids } } });
  await prisma.mpEventoPago.deleteMany({ where: { cuotaId: { in: qids } } });
  await prisma.pago.deleteMany({ where: { cuotaId: { in: qids } } });
  await prisma.cuota.deleteMany({ where: { id: { in: qids } } });
  await prisma.rutinaEjercicio.deleteMany({ where: { rutinaId: { in: rids } } });
  await prisma.rutinaDia.deleteMany({ where: { rutinaId: { in: rids } } });
  await prisma.rutina.deleteMany({ where: { id: { in: rids } } });
  await prisma.ingredienteReceta.deleteMany({ where: { recetaId: { in: reids } } });
  await prisma.pasoReceta.deleteMany({ where: { recetaId: { in: reids } } });
  await prisma.receta.deleteMany({ where: { id: { in: reids } } });
  await prisma.plan.deleteMany({ where: { nombre: { startsWith: 'TEST-SEC' } } });
  await prisma.cliente.deleteMany({ where: { id: { in: cids } } });
  await prisma.profesor.deleteMany({ where: { id: { in: pids } } });
  await prisma.recepcionista.deleteMany({ where: { usuarioId: { in: uids } } });
  await prisma.usuario.deleteMany({ where: { id: { in: uids } } });
};

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
    const hash = await bcrypt.hash(PASSWORD, 4);
    const roles = Object.fromEntries((await prisma.rol.findMany()).map((r) => [r.nombre, r.id]));
    const cs = Object.fromEntries((await prisma.estadoCliente.findMany()).map((r) => [r.nombre, r.id]));
    const ss = Object.fromEntries((await prisma.estadoCuentaStaff.findMany()).map((r) => [r.nombre, r.id]));
    const mk = (key, rol, extra = {}) => prisma.usuario.create({ data: { rolId: roles[rol], nombre: `Sec${key}`, apellido: 'Test', email: `${PREFIX}${key}@test.local`, passwordHash: hash, activo: true, ...extra } });
    U.adm = await mk('adm', 'ADMIN');
    for (const k of ['pa', 'pb', 'pdis']) { U[k] = await mk(k, 'PROFESOR'); U[k].prof = await prisma.profesor.create({ data: { usuarioId: U[k].id, estadoCuentaStaffId: ss[k === 'pdis' ? 'INHABILITADO' : 'HABILITADO'] } }); }
    for (const k of ['rec', 'rdis']) { U[k] = await mk(k, 'RECEPCIONISTA'); await prisma.recepcionista.create({ data: { usuarioId: U[k].id, estadoCuentaStaffId: ss[k === 'rdis' ? 'INHABILITADO' : 'HABILITADO'] } }); }
    for (const [k, estado] of Object.entries({ ca: 'HABILITADO', cb: 'HABILITADO', cbaja: 'INHABILITADO_BAJA' })) { U[k] = await mk(k, 'CLIENTE'); U[k].cli = await prisma.cliente.create({ data: { usuarioId: U[k].id, estadoClienteId: cs[estado], objetivoDiasRacha: 3 } }); }
    U.inact = await mk('inact', 'CLIENTE', { activo: false });
    await prisma.cliente.create({ data: { usuarioId: U.inact.id, estadoClienteId: cs.HABILITADO } });

    server = spawn(process.execPath, ['src/server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), DISABLE_SCHEDULER: 'true', NODE_ENV: 'development', MERCADOPAGO_API_URL: 'http://127.0.0.1:1', LOGIN_MAX_FAILURES: '8' }, stdio: 'ignore' });
    for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* arrancando */ } await new Promise((r) => setTimeout(r, 250)); }
    for (const k of ['adm', 'pa', 'pb', 'pdis', 'rec', 'rdis', 'ca', 'cb', 'cbaja']) T[k] = await login(`${PREFIX}${k}@test.local`);
  } catch (error) {
    console.error('Sin BD o servidor:', error.message);
    reachable = false;
  }
});

after(async () => {
  server?.kill();
  for (const file of files) { try { fs.unlinkSync(file); } catch { /* ya no existe */ } }
  if (reachable) await cleanup();
  await prisma.$disconnect();
});

const guard = (name, fn) => test(name, async (t) => (reachable ? fn(t) : t.skip('BD o servidor no disponibles')));

// ---------------------------------------------------------------------------------------------------------------
const ROUTES = [
  // método, ruta, cuerpo, roles permitidos (A admin, P profesor, R recepción, C cliente)
  ['GET', '/auth/me', null, 'APRC'], ['GET', '/config/system', null, 'APRC'],
  ['GET', '/users', null, 'A'], ['POST', '/users', {}, 'A'], ['PATCH', `/users/${X}`, {}, 'A'], ['POST', `/users/${X}/reset-password`, {}, 'A'],
  ['GET', '/plans', null, 'A'], ['POST', '/plans', {}, 'A'], ['DELETE', `/plans/${X}`, null, 'A'],
  ['GET', '/promotions', null, 'A'], ['POST', '/promotions', {}, 'A'],
  ['GET', '/clients/me', null, 'C'], ['GET', '/clients', null, 'AR'], ['POST', '/clients', {}, 'AR'], ['GET', `/clients/${X}`, null, 'AR'], ['PATCH', `/clients/${X}`, {}, 'AR'], ['POST', `/clients/${X}/medical-clearance`, null, 'AR'], ['PATCH', `/clients/${X}/status`, { estado: 'HABILITADO' }, 'A'],
  ['GET', '/attendance', null, 'AR'], ['GET', `/attendance/access/${X}`, null, 'AR'], ['POST', '/attendance', {}, 'AR'],
  ['GET', '/quotas/me', null, 'C'], ['GET', `/quotas/client/${X}`, null, 'AR'], ['POST', '/quotas', {}, 'ARC'], ['POST', `/quotas/${X}/confirm-payment`, {}, 'AR'],
  ['GET', '/routines/me', null, 'C'], ['GET', '/routines', null, 'P'], ['GET', '/routines/exercises', null, 'P'], ['POST', '/routines', {}, 'P'],
  ['GET', '/classes', null, 'APR'], ['GET', '/classes/available', null, 'C'], ['POST', '/classes', {}, 'P'], ['POST', `/classes/${X}/enroll`, {}, 'C'],
  ['GET', '/recipes', null, 'APR'], ['GET', '/recipes/available', null, 'C'], ['POST', '/recipes', {}, 'P'],
  ['GET', '/admin/dashboard/stats', null, 'A'],
  ...['resumen', 'desglose', 'grafico', 'pagos', 'pagos/exportar.csv', 'pendientes', 'conciliacion'].map((s) => ['GET', `/admin/ingresos/${s}`, null, 'A']),
  ['POST', `/admin/ingresos/pendientes/${X}/verificar`, {}, 'A'],
  ['GET', '/recepcion/dashboard/stats', null, 'R'], ['GET', '/recepcion/pagos', null, 'R'], ['POST', '/recepcion/pagos', {}, 'R'], ['GET', '/recepcion/planes', null, 'R'], ['PATCH', '/recepcion/me', {}, 'R'],
  ['GET', '/ejercicios', null, 'P'], ['POST', '/ejercicios', {}, 'P'],
  ...['clientes', 'perfil', 'rutinas', 'clases', 'categorias-receta', 'recetas', 'notificaciones'].map((s) => ['GET', `/profesor/${s}`, null, 'P']),
  ['POST', '/profesor/rutinas', {}, 'P'], ['POST', '/profesor/clases', {}, 'P'], ['POST', '/profesor/recetas', {}, 'P'], ['PUT', '/profesor/perfil/password', {}, 'P'], ['PATCH', '/profesor/notificaciones/leidas', null, 'P'],
  ...['inicio', 'rutinas', 'rutinas/historial', 'clases', 'clases/mias', 'categorias-receta', 'recetas', 'planes', 'membresia/pago/config', 'membresia/pago/verificar', 'perfil', 'pagos', 'asistencias', 'notificaciones'].map((s) => ['GET', `/cliente/${s}`, null, 'C']),
  ['POST', '/cliente/membresia/checkout', {}, 'C'], ['DELETE', `/cliente/membresia/solicitudes/${X}`, null, 'C'], ['PUT', '/cliente/perfil/password', {}, 'C'], ['GET', '/cliente/apto-fisico/archivo', null, 'C'], ['PATCH', '/cliente/notificaciones/leidas', null, 'C'],
];

guard('matriz endpoint x rol: 401 sin token, 403 con rol incorrecto, permitido con el rol correcto, y nunca password_hash', async () => {
  const roleToken = { A: 'adm', P: 'pa', R: 'rec', C: 'ca' };
  const problems = [];
  for (const [method, route, body, allowed] of ROUTES) {
    for (const [letter, key] of [[null, null], ...Object.entries(roleToken)]) {
      const res = await api(route, { method, token: key ? T[key] : undefined, body: body ?? undefined });
      const denied = res.status === 401 || res.status === 403;
      if (!letter && res.status !== 401) problems.push(`${method} ${route} sin token => ${res.status}`);
      if (letter && allowed.includes(letter) && denied) problems.push(`${method} ${route} como ${letter} debería pasar => ${res.status}`);
      if (letter && !allowed.includes(letter) && res.status !== 403) problems.push(`${method} ${route} como ${letter} debería ser 403 => ${res.status}`);
      if (/password_?hash/i.test(res.text)) problems.push(`FUGA de password_hash en ${method} ${route} como ${letter ?? 'sin token'}`);
    }
  }
  assert.deepEqual(problems, []);
});

guard('cuentas: usuario inactivo no entra; profesor y recepcionista INHABILITADOS reciben 403; cliente BAJA no puede pagar ni inscribirse', async () => {
  const lg = await api('/auth/login', { method: 'POST', body: { email: `${PREFIX}inact@test.local`, password: PASSWORD } });
  assert.equal(lg.status, 401);
  assert.equal((await api('/profesor/perfil', { token: T.pdis })).status, 403);
  assert.equal((await api('/recepcion/dashboard/stats', { token: T.rdis })).status, 403);
  assert.equal((await api('/clients', { token: T.rdis })).status, 403);
  assert.equal((await api('/attendance', { token: T.rdis })).status, 403);
  assert.equal((await api('/cliente/membresia/checkout', { method: 'POST', token: T.cbaja, body: { plan_id: 1 } })).status, 403);
  assert.equal((await api(`/cliente/clases/${X}/inscripcion`, { method: 'POST', token: T.cbaja, body: {} })).status, 403);
});

guard('IDOR entre clientes: comprobantes, solicitudes, rutinas, notificaciones, inscripciones y asistencia ajenos', async () => {
  const plan = await prisma.plan.create({ data: { nombre: 'TEST-SEC plan', duracionDias: 30, precio: 1000 } });
  const [active, pending] = await Promise.all(['ACTIVA', 'PENDIENTE'].map((n) => prisma.estadoCuota.findUnique({ where: { nombre: n } })));
  const mp = await prisma.metodoPago.findUnique({ where: { nombre: 'MERCADO_PAGO' } });
  const d0 = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const cuota = await prisma.cuota.create({ data: { clienteId: U.ca.cli.id, planId: plan.id, estadoCuotaId: active.id, fechaInicio: d0, fechaVencimiento: new Date(d0.getTime() + 30 * 86400000) } });
  const pago = await prisma.pago.create({ data: { cuotaId: cuota.id, metodoPagoId: mp.id, monto: 1000, fechaPago: new Date(), referenciaExterna: 'TEST-SEC-1' } });
  const pend = await prisma.cuota.create({ data: { clienteId: U.ca.cli.id, planId: plan.id, estadoCuotaId: pending.id, fechaInicio: d0, fechaVencimiento: d0, mpExpiraEn: new Date(Date.now() + 3600000) } });
  const ej = await prisma.ejercicio.findFirst();
  const rutina = await prisma.rutina.create({ data: { clienteId: U.ca.cli.id, profesorId: U.pa.prof.id, nombre: 'TEST-SEC rutina', dias: { create: [{ diaSemana: 1 }] }, ejercicios: { create: [{ ejercicioId: ej.id, series: 3, repeticiones: 10, ordenVisual: 1 }] } } });
  const tipo = await prisma.tipoNotificacion.findFirst();
  const noti = await prisma.notificacion.create({ data: { usuarioId: U.ca.id, tipoNotificacionId: tipo.id, titulo: 'TEST-SEC', mensaje: 'TEST-SEC' } });

  assert.equal((await api(`/cliente/pagos/${pago.id}/comprobante`, { token: T.cb })).status, 404);
  assert.equal((await api(`/cliente/pagos/${pago.id}/comprobante?formato=json`, { token: T.ca })).status, 200);
  assert.equal((await api(`/cliente/membresia/solicitudes/${pend.id}`, { method: 'DELETE', token: T.cb })).status, 404);
  assert.equal((await api(`/cliente/rutinas/${rutina.id}`, { token: T.cb })).status, 404);
  assert.equal((await api(`/cliente/notificaciones/${noti.id}/leida`, { method: 'PATCH', token: T.cb })).status, 404);
  assert.equal((await api('/cliente/pagos', { token: T.cb })).json.data.items.length, 0);
  assert.ok(!JSON.stringify((await api('/cliente/notificaciones', { token: T.cb })).json).includes('TEST-SEC'));
  assert.equal((await api('/attendance', { method: 'POST', token: T.cb, body: { clienteId: U.ca.cli.id } })).status, 403); // el cliente no registra asistencias
  // el cuerpo no puede cambiar de quién es la cuota ni el monto
  const before = await prisma.cuota.count({ where: { clienteId: U.ca.cli.id } });
  await api('/cliente/membresia/checkout', { method: 'POST', token: T.cb, body: { plan_id: plan.id, cliente_id: U.ca.cli.id, monto: 1 } });
  assert.equal(await prisma.cuota.count({ where: { clienteId: U.ca.cli.id } }), before);
  // un profesor no puede mover lo de otro
  assert.equal((await api(`/profesor/rutinas/${rutina.id}`, { token: T.pb })).status, 404);
  assert.ok(!JSON.stringify((await api('/profesor/rutinas', { token: T.pb })).json).includes('TEST-SEC rutina'));
});

guard('JWT: otra clave, vencido, alg none, sin userId, usuario inexistente y claim "rol" en el token no dan acceso', async () => {
  const secret = process.env.JWT_SECRET;
  const me = (token) => api('/auth/me', { token });
  assert.equal((await me(jwt.sign({ userId: U.ca.id }, 'otra-clave'))).status, 401);
  assert.equal((await me(jwt.sign({ userId: U.ca.id }, secret, { expiresIn: -10 }))).status, 401);
  assert.equal((await me(`${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ userId: U.adm.id })).toString('base64url')}.`)).status, 401);
  assert.equal((await me(jwt.sign({ foo: 1 }, secret))).status, 401);
  assert.equal((await me(jwt.sign({ userId: 987654321 }, secret))).status, 401);
  assert.equal((await me('abc.def.ghi')).status, 401);
  assert.equal((await api('/users', { token: jwt.sign({ userId: U.ca.id, rol: 'ADMIN' }, secret) })).status, 403);
});

guard('login: límite de intentos fallidos por cuenta (429 con Retry-After) sin bloquear a otras cuentas', async () => {
  const email = `${PREFIX}fuerza-bruta@test.local`;
  const codes = [];
  for (let i = 0; i < 10; i += 1) codes.push((await api('/auth/login', { method: 'POST', body: { email, password: `incorrecta${i}` } })).status);
  assert.deepEqual(codes.slice(0, 8), Array(8).fill(401));
  assert.deepEqual(codes.slice(8), [429, 429]);
  const blocked = await api('/auth/login', { method: 'POST', body: { email, password: 'otra-vez' } });
  assert.ok(blocked.headers.get('retry-after'));
  assert.equal(blocked.json.error, 'DEMASIADOS_INTENTOS');
  assert.ok(await login(`${PREFIX}cb@test.local`)); // otra cuenta sigue entrando
});

guard('CORS y cabeceras: orígenes no permitidos sin 500 ni cabeceras CORS; X-Powered-By oculto; nosniff y frame DENY', async () => {
  const pre = (origin) => fetch(`${BASE}/health`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } });
  const ok = await pre('http://localhost:5173');
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal((await pre('http://localhost:5174')).headers.get('access-control-allow-origin'), 'http://localhost:5174'); // Vite en otro puerto
  const evil = await pre('https://evil.example');
  assert.ok(evil.status < 500);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const h = await fetch(`${BASE}/health`);
  assert.equal(h.headers.get('x-powered-by'), null);
  assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(h.headers.get('x-frame-options'), 'DENY');
});

guard('archivos: se valida el CONTENIDO (no el nombre ni el Content-Type) y el apto se sirve solo por endpoint autenticado', async () => {
  const form = (field, name, type, bytes, extra) => { const f = new FormData(); if (extra) f.append('payload', JSON.stringify(extra)); f.append(field, new Blob([bytes], { type }), name); return f; };
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const recipe = { nombre: 'TEST-SEC receta', categoriaRecetaId: 1, ingredientes: [], pasos: [] };
  const good = await api('/profesor/recetas', { method: 'POST', token: T.pa, form: form('foto', 'a.png', 'image/png', png, recipe) });
  assert.equal(good.status, 201);
  if (good.json.data.foto) files.push(path.join('uploads', 'recetas', path.basename(good.json.data.foto)));
  assert.equal((await api('/profesor/recetas', { method: 'POST', token: T.pa, form: form('foto', 'x.php.png', 'image/png', Buffer.from('<?php system($_GET[1]); ?>'), recipe) })).status, 400);
  assert.equal((await api('/profesor/recetas', { method: 'POST', token: T.pa, form: form('foto', 'big.png', 'image/png', Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]), recipe) })).status, 400);

  assert.equal((await api(`/clients/${U.ca.cli.id}/medical-clearance`, { method: 'POST', token: T.ca, form: form('archivo', 'a.pdf', 'application/pdf', pdf) })).status, 403);
  const up = await api(`/clients/${U.ca.cli.id}/medical-clearance`, { method: 'POST', token: T.rec, form: form('archivo', 'mi apto.pdf', 'application/pdf', pdf) });
  assert.equal(up.status, 200);
  const stored = (await prisma.cliente.findUnique({ where: { id: U.ca.cli.id } })).aptoFisicoArchivo;
  files.push(path.join('uploads', stored));
  assert.ok(!/mi apto/.test(stored) && stored.endsWith('.pdf'));
  // un ejecutable disfrazado de PDF, un HTML y un archivo grande se rechazan por contenido/tamaño
  assert.equal((await api(`/clients/${U.cb.cli.id}/medical-clearance`, { method: 'POST', token: T.rec, form: form('archivo', 'a.pdf', 'application/pdf', Buffer.from('MZ\x90 no es pdf')) })).status, 400);
  assert.equal((await api(`/clients/${U.cb.cli.id}/medical-clearance`, { method: 'POST', token: T.rec, form: form('archivo', 'a.html', 'text/html', Buffer.from('<script>1</script>')) })).status, 400);
  assert.equal((await api(`/clients/${U.cb.cli.id}/medical-clearance`, { method: 'POST', token: T.rec, form: form('archivo', 'a.pdf', 'application/pdf', Buffer.concat([pdf, Buffer.alloc(6 * 1024 * 1024)])) })).status, 400);
  // acceso: estático público = 404; endpoint autenticado solo para el dueño; sin token 401
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/uploads/${stored}`)).status, 404);
  const own = await fetch(`${BASE}/cliente/apto-fisico/archivo`, { headers: { Authorization: `Bearer ${T.ca}` } });
  assert.equal(own.status, 200);
  assert.equal((await api('/cliente/apto-fisico/archivo', { token: T.cb })).status, 404);
  assert.equal((await api('/cliente/apto-fisico/archivo')).status, 401);
  assert.ok(!(await (await fetch(`http://127.0.0.1:${PORT}/uploads/recetas/../../.env`)).text()).includes('DATABASE_URL'));
});

guard('errores: JSON mal formado -> 400; ruta inexistente -> 404 JSON; validación sin stack; SQL en búsquedas no rompe nada', async () => {
  const bad = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":' });
  assert.equal(bad.status, 400);
  const nf = await api('/no/existe');
  assert.equal(nf.status, 404);
  assert.ok(nf.json.error);
  const v = await api('/profesor/rutinas/abc', { token: T.pa });
  assert.ok(!/node_modules|\.js:\d+/.test(v.text));
  const sqli = await api(`/clients?search=${encodeURIComponent("' OR 1=1 --")}`, { token: T.rec });
  assert.equal(sqli.status, 200);
  assert.equal(sqli.json.data.length, 0);
  assert.equal((await api(`/admin/ingresos/pagos?q=${encodeURIComponent("'; DROP TABLE pago; --")}&desde=2020-01-01&hasta=2021-01-01`, { token: T.adm })).json.data.items.length, 0);
});

guard('humo por rol: cada panel responde 200 con la forma esperada', async () => {
  const shape = async (token, route, check) => { const r = await api(route, { token }); assert.equal(r.status, 200, route); assert.ok(check(r.json.data), route); };
  await shape(T.adm, '/admin/dashboard/stats', (d) => typeof d.clientesActivos === 'number' && Array.isArray(d.ingresosMensuales));
  await shape(T.adm, '/admin/ingresos/resumen', (d) => d.hoy && d.mes && d.mesAnterior && d.rango);
  await shape(T.adm, '/plans', (d) => Array.isArray(d.items ?? d));
  await shape(T.adm, '/users', (d) => Array.isArray(d.items ?? d));
  await shape(T.rec, '/recepcion/dashboard/stats', (d) => ['clientesActivos', 'pagosPendientes', 'asistenciasHoy', 'ingresosDelDia', 'ingresosDelMes'].every((k) => typeof d[k] === 'number'));
  await shape(T.rec, '/recepcion/planes', (d) => Array.isArray(d) && d.every((p) => typeof p.precioFinal === 'number'));
  await shape(T.rec, '/clients', (d) => Array.isArray(d));
  await shape(T.pa, '/profesor/perfil', (d) => d.email && Array.isArray(d.clases));
  await shape(T.pa, '/profesor/notificaciones', (d) => Array.isArray(d.items) && typeof d.unreadCount === 'number');
  await shape(T.pa, '/ejercicios', (d) => d.length > 0);
  await shape(T.ca, '/cliente/inicio', (d) => d.racha && d.membresia && Array.isArray(d.rutinasHoy));
  await shape(T.ca, '/cliente/perfil', (d) => d.usuario && d.cliente && d.aptoFisico);
  await shape(T.ca, '/cliente/recetas', (d) => Array.isArray(d));
  await shape(T.ca, '/cliente/clases', (d) => Array.isArray(d.clases) && d.dias.length === 7);
});

guard('validaciones del backend: teléfono con letras, email de soporte inválido y racha fuera de rango se rechazan SIN modificar datos', async () => {
  const gymBefore = JSON.stringify(await prisma.gimnasio.findFirst());
  assert.equal((await api('/config/gym', { method: 'PUT', token: T.adm, body: { emailSoporte: 'no-es-email' } })).status, 400);
  assert.equal((await api('/config/gym', { method: 'PUT', token: T.adm, body: { telefono: '9'.repeat(80) } })).status, 400);
  assert.equal(JSON.stringify(await prisma.gimnasio.findFirst()), gymBefore); // la configuración real no cambió
  const plan = await prisma.plan.create({ data: { nombre: 'TEST-SEC plan alta', duracionDias: 30, precio: 1000 } });
  const base = { nombre: 'Alta', apellido: 'Test', email: `${PREFIX}alta@test.local`, password: 'Alta1234', telefono: '+54 11 5555-1111', planId: plan.id };
  assert.equal((await api('/clients', { method: 'POST', token: T.rec, body: { ...base, telefono: 'abc!!' } })).status, 400);
  assert.equal((await api('/clients', { method: 'POST', token: T.rec, body: { ...base, telefono: '12' } })).status, 400);
  assert.equal((await api('/clients', { method: 'POST', token: T.rec, body: { ...base, objetivoDiasRacha: 9 } })).status, 400);
  assert.equal(await prisma.usuario.count({ where: { email: base.email } }), 0);
});

guard('cobro en caja: el monto sale del backend (el campo monto ni se lee), doble envío simultáneo = un solo pago, profesor no puede cobrar', async () => {
  const plan = await prisma.plan.create({ data: { nombre: 'TEST-SEC plan caja', duracionDias: 30, precio: 12345.5 } });
  const cash = await prisma.metodoPago.findUnique({ where: { nombre: 'EFECTIVO' } });
  const body = { clienteId: U.cb.cli.id, planId: plan.id, metodoPagoId: cash.id };
  assert.equal((await api('/recepcion/pagos', { method: 'POST', token: T.pa, body })).status, 403);
  const forged = await api('/recepcion/pagos', { method: 'POST', token: T.rec, body: { ...body, monto: 1 } });
  assert.equal(forged.status, 201);
  const first = await prisma.pago.findFirst({ where: { cuota: { clienteId: U.cb.cli.id } } });
  assert.equal(Number(first.monto), 12345.5);
  const race = await Promise.all([api('/recepcion/pagos', { method: 'POST', token: T.rec, body }), api('/recepcion/pagos', { method: 'POST', token: T.rec, body })]);
  assert.ok(race.every((r) => r.status === 409)); // ya hay un cobro de hace instantes
  assert.equal(await prisma.pago.count({ where: { cuota: { clienteId: U.cb.cli.id } } }), 1);
  assert.equal((await api('/recepcion/pagos', { method: 'POST', token: T.rec, body: { ...body, clienteId: U.cbaja.cli.id } })).status, 409);
  const cash2 = await api(`/quotas/${X}/confirm-payment`, { method: 'POST', token: T.rec, body: { metodoPagoId: cash.id, monto: 5 } });
  assert.equal(cash2.status, 404);
});

guard('asistencia: solo la registra recepción/admin, con motivo claro cuando se deniega', async () => {
  const active = await prisma.estadoCuota.findUnique({ where: { nombre: 'ACTIVA' } });
  const plan = await prisma.plan.create({ data: { nombre: 'TEST-SEC plan asist', duracionDias: 30, precio: 1000 } });
  const d0 = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  await prisma.cuota.create({ data: { clienteId: U.ca.cli.id, planId: plan.id, estadoCuotaId: active.id, fechaInicio: d0, fechaVencimiento: new Date(d0.getTime() + 20 * 86400000) } });
  await prisma.cliente.update({ where: { id: U.ca.cli.id }, data: { aptoFisicoFechaCarga: d0, aptoFisicoFechaVencimiento: new Date(d0.getTime() + 200 * 86400000) } });
  assert.equal((await api('/attendance', { method: 'POST', token: T.pa, body: { clienteId: U.ca.cli.id } })).status, 403);
  assert.equal((await api('/attendance', { method: 'POST', token: T.ca, body: { clienteId: U.ca.cli.id } })).status, 403);
  const ok = await api('/attendance', { method: 'POST', token: T.rec, body: { clienteId: U.ca.cli.id } });
  assert.equal(ok.status, 201);
  assert.ok(!/hash/i.test(JSON.stringify(ok.json)));
  const denied = await api('/attendance', { method: 'POST', token: T.rec, body: { clienteId: U.cbaja.cli.id } });
  assert.equal(denied.status, 403);
  assert.match(denied.json.message, /baja/);
});
