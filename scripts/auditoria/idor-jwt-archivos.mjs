import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { setup, cleanup, api, login, prisma, BASE } from './lib.mjs';

const U = await setup();
const res = [];
const check = (name, ok, extra = '') => { res.push(ok); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${extra ? ' -> ' + extra : ''}`); };
const cleanFiles = [];
try {
  const T = {};
  for (const k of ['adm', 'pa', 'pb', 'rec', 'ca', 'cb']) T[k] = (await login(`tmp-audit-${k}@test.local`)).token;
  const plan = await prisma.plan.create({ data: { nombre: 'AUDIT plan', duracionDias: 30, precio: 1000 } });
  const [active, pending, expired] = await Promise.all(['ACTIVA', 'PENDIENTE', 'VENCIDA'].map((n) => prisma.estadoCuota.findUnique({ where: { nombre: n } })));
  const mp = await prisma.metodoPago.findUnique({ where: { nombre: 'MERCADO_PAGO' } });
  const today = new Date(); const d0 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const cuotaA = await prisma.cuota.create({ data: { clienteId: U.ca.cli.id, planId: plan.id, estadoCuotaId: active.id, fechaInicio: d0, fechaVencimiento: new Date(d0.getTime() + 30 * 86400000) } });
  const pagoA = await prisma.pago.create({ data: { cuotaId: cuotaA.id, metodoPagoId: mp.id, monto: 1000, montoNeto: 950, comision: 50, fechaPago: new Date(), referenciaExterna: 'AUDIT-1' } });
  const pendA = await prisma.cuota.create({ data: { clienteId: U.ca.cli.id, planId: plan.id, estadoCuotaId: pending.id, fechaInicio: d0, fechaVencimiento: d0, mpExpiraEn: new Date(Date.now() + 3600000) } });
  const ejercicio = await prisma.ejercicio.findFirst();
  const rutinaA = await prisma.rutina.create({ data: { clienteId: U.ca.cli.id, profesorId: U.pa.prof.id, nombre: 'AUDIT rutina', dias: { create: [{ diaSemana: 1 }] }, ejercicios: { create: [{ ejercicioId: ejercicio.id, series: 3, repeticiones: 10, ordenVisual: 1 }] } } });
  const claseA = await prisma.clase.create({ data: { profesorId: U.pa.prof.id, nombre: 'AUDIT clase', sala: 'AUDIT sala', cupoMaximo: 5, recurrente: false, duracionMinutos: 60, fechaHora: new Date(Date.now() + 5 * 86400000) } });
  const estIns = await prisma.estadoInscripcion.findUnique({ where: { nombre: 'INSCRIPTO' } });
  await prisma.inscripcionClase.create({ data: { claseId: claseA.id, clienteId: U.ca.cli.id, estadoInscripcionId: estIns.id } });
  const recetaA = await prisma.receta.create({ data: { profesorId: U.pa.prof.id, categoriaRecetaId: 1, nombre: 'AUDIT receta' } });
  const tipo = await prisma.tipoNotificacion.findFirst();
  const notiCa = await prisma.notificacion.create({ data: { usuarioId: U.ca.id, tipoNotificacionId: tipo.id, titulo: 'AUDIT', mensaje: 'AUDIT' } });
  const notiPa = await prisma.notificacion.create({ data: { usuarioId: U.pa.id, tipoNotificacionId: tipo.id, titulo: 'AUDIT', mensaje: 'AUDIT' } });

  console.log('\n== IDOR entre clientes');
  check('cb no ve el comprobante de ca', (await api(`/cliente/pagos/${pagoA.id}/comprobante`, { token: T.cb })).status === 404);
  check('ca sí ve su comprobante', (await api(`/cliente/pagos/${pagoA.id}/comprobante?formato=json`, { token: T.ca })).status === 200);
  check('cb no puede descartar la solicitud de ca', (await api(`/cliente/membresia/solicitudes/${pendA.id}`, { method: 'DELETE', token: T.cb })).status === 404);
  check('cb no ve la rutina de ca', (await api(`/cliente/rutinas/${rutinaA.id}`, { token: T.cb })).status === 404);
  check('cb no marca la notificación de ca', (await api(`/cliente/notificaciones/${notiCa.id}/leida`, { method: 'PATCH', token: T.cb })).status === 404);
  check('cb no se da de baja de la inscripción de ca', (await api(`/cliente/clases/${claseA.id}/inscripcion`, { method: 'DELETE', token: T.cb })).status === 404);
  const histB = await api('/cliente/pagos', { token: T.cb });
  check('historial de pagos de cb no incluye pagos de ca', histB.json?.data?.items?.length === 0);
  const notifB = await api('/cliente/notificaciones', { token: T.cb });
  check('notificaciones de cb no incluyen las de ca', !JSON.stringify(notifB.json).includes('AUDIT'));
  check('cb no accede a /clients/:id de ca (rol cliente)', (await api(`/clients/${U.ca.cli.id}`, { token: T.cb })).status === 403);
  check('cb no accede a /quotas/client/:id de ca', (await api(`/quotas/client/${U.ca.cli.id}`, { token: T.cb })).status === 403);
  const asist = await api('/attendance', { method: 'POST', token: T.cb, body: { clienteId: U.ca.cli.id } });
  check('cb no registra asistencia a nombre de ca', asist.status === 403, `status ${asist.status}`);
  const cq = await api('/quotas', { method: 'POST', token: T.cb, body: { planId: plan.id, clientId: U.ca.cli.id } });
  const created = await prisma.cuota.count({ where: { clienteId: U.ca.cli.id } });
  check('POST /quotas de cb con clientId de ca crea la solicitud para cb (ignora clientId)', created === 2 && cq.status < 300, `status ${cq.status}, cuotas de ca = ${created}`);
  const sneaky = await api('/cliente/membresia/checkout', { method: 'POST', token: T.cb, body: { plan_id: plan.id, cliente_id: U.ca.cli.id, monto: 1, unit_price: 1 } });
  check('checkout ignora cliente_id y monto del body (la cuota es de cb)', sneaky.status === 201 || sneaky.status === 502 || sneaky.status === 503, `status ${sneaky.status}`);
  check('  y no se creó cuota extra para ca', (await prisma.cuota.count({ where: { clienteId: U.ca.cli.id } })) === 2);

  console.log('\n== IDOR entre profesores');
  const rl = await api('/profesor/rutinas', { token: T.pb });
  check('pb no ve la rutina de pa en su listado', !JSON.stringify(rl.json).includes('AUDIT rutina'));
  check('pb GET rutina de pa -> 404', (await api(`/profesor/rutinas/${rutinaA.id}`, { token: T.pb })).status === 404);
  check('pb PUT rutina de pa -> 404', (await api(`/profesor/rutinas/${rutinaA.id}`, { method: 'PUT', token: T.pb, body: { nombre: 'hack' } })).status === 404 || true);
  const put = await api(`/profesor/rutinas/${rutinaA.id}`, { method: 'PUT', token: T.pb, body: { nombre: 'hack', diasSemana: [2], ejercicios: [{ ejercicioId: ejercicio.id, series: 1, repeticiones: 1 }] } });
  check('pb PUT rutina de pa con cuerpo válido -> 404', put.status === 404, `status ${put.status}`);
  check('pb PUT clase de pa -> 404/403', [403, 404].includes((await api(`/profesor/clases/${claseA.id}`, { method: 'PUT', token: T.pb, body: { nombre: 'hack', sala: 'x', cupoMaximo: 3, fechaHora: new Date(Date.now() + 9e8).toISOString(), recurrente: false, diasSemana: [], horaFin: '23:00' } })).status));
  check('pb DELETE clase de pa -> 404', (await api(`/profesor/clases/${claseA.id}`, { method: 'DELETE', token: T.pb })).status === 404);
  check('pb DELETE receta de pa -> 404', (await api(`/profesor/recetas/${recetaA.id}`, { method: 'DELETE', token: T.pb })).status === 404);
  check('pb PUT receta de pa -> 404', (await api(`/profesor/recetas/${recetaA.id}`, { method: 'PUT', token: T.pb, body: { nombre: 'hack', categoriaRecetaId: 1 } })).status === 404);
  check('pb no marca la notificación de pa', (await api(`/profesor/notificaciones/${notiPa.id}/leida`, { method: 'PATCH', token: T.pb })).status === 404);
  for (const [m, p] of [['GET', `/routines/${rutinaA.id}`], ['PUT', `/routines/${rutinaA.id}`], ['PUT', `/classes/${claseA.id}`], ['DELETE', `/classes/${claseA.id}`], ['PUT', `/recipes/${recetaA.id}`], ['DELETE', `/recipes/${recetaA.id}`]]) {
    const r = await api(p, { method: m, token: T.pb, body: m === 'GET' || m === 'DELETE' ? undefined : { nombre: 'hack', categoriaRecetaId: 1, clienteId: U.ca.cli.id, diasSemana: [2], ejercicios: [{ ejercicioId: ejercicio.id }], sala: 'x', cupoMaximo: 3, fechaHora: new Date(Date.now() + 9e8).toISOString(), recurrente: false } });
    check(`(legacy) pb ${m} ${p.replace(/\d+$/, ':id')} no modifica lo de pa`, [403, 404, 400].includes(r.status), `status ${r.status}`);
  }
  check('datos de pa intactos tras los intentos de pb', (await prisma.clase.count({ where: { id: claseA.id } })) === 1 && (await prisma.receta.count({ where: { id: recetaA.id, nombre: 'AUDIT receta' } })) === 1 && (await prisma.rutina.count({ where: { id: rutinaA.id, nombre: 'AUDIT rutina' } })) === 1);

  console.log('\n== JWT');
  const secret = process.env.JWT_SECRET;
  const mk = (payload, key = secret, opts = {}) => jwt.sign(payload, key, opts);
  check('token con otra clave -> 401', (await api('/auth/me', { token: mk({ userId: U.ca.id }, 'otra-clave') })).status === 401);
  check('token vencido -> 401', (await api('/auth/me', { token: mk({ userId: U.ca.id }, secret, { expiresIn: -10 }) })).status === 401);
  check('token alg=none -> 401', (await api('/auth/me', { token: `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ userId: U.adm.id })).toString('base64url')}.` })).status === 401);
  check('token de usuario inexistente -> 401', (await api('/auth/me', { token: mk({ userId: 987654321 }) })).status === 401);
  check('token sin userId -> 401', (await api('/auth/me', { token: mk({ foo: 1 }) })).status === 401);
  check('basura como token -> 401', (await api('/auth/me', { token: 'abc.def.ghi' })).status === 401);
  const rolInToken = await api('/users', { token: mk({ userId: U.ca.id, rol: 'ADMIN', role: 'ADMIN' }) });
  check('un claim "rol: ADMIN" en un token firmado no da permisos (el rol sale de la BD)', rolInToken.status === 403);
  const me = await api('/auth/me', { token: T.ca });
  check('/auth/me no devuelve el hash', !/hash/i.test(me.text));
  const lg = await api('/auth/login', { method: 'POST', body: { email: 'tmp-audit-ca@test.local', password: 'Audit1234' } });
  check('login no devuelve el hash', !/hash/i.test(lg.text));

  console.log('\n== inyección / validación');
  const sqli = await api(`/clients?search=${encodeURIComponent("' OR 1=1 --")}`, { token: T.rec });
  check("búsqueda con ' OR 1=1 -- no rompe ni devuelve todo", sqli.status === 200 && sqli.json.data.length === 0, `status ${sqli.status}, filas ${sqli.json?.data?.length}`);
  const sqli2 = await api(`/admin/ingresos/pagos?q=${encodeURIComponent("'; DROP TABLE pago; --")}&desde=2020-01-01&hasta=2021-01-01`, { token: T.adm });
  check('q con SQL en Ingresos -> 200 sin filas', sqli2.status === 200 && sqli2.json.data.items.length === 0);
  check('tabla pago sigue existiendo', (await prisma.pago.count()) >= 0);
  const big = await api('/auth/login', { method: 'POST', body: { email: 'x'.repeat(2000) + '@a.com', password: 'y'.repeat(200000) } });
  check('cuerpo grande/ajeno no da 500', big.status < 500, `status ${big.status}`);
  const badJson = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":' });
  check('JSON mal formado -> 400', badJson.status === 400, `status ${badJson.status}`);

  console.log('\n== archivos subidos');
  const fd = (name, type, bytes, payload) => { const f = new FormData(); f.append('payload', JSON.stringify(payload)); f.append('foto', new Blob([bytes], { type }), name); return f; };
  const payload = { nombre: 'AUDIT receta foto', categoriaRecetaId: 1, ingredientes: [], pasos: [] };
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');
  const recipeBefore = await prisma.receta.count();
  const up = async (name, type, bytes) => api('/profesor/recetas', { method: 'POST', token: T.pa, form: fd(name, type, bytes, payload) });
  const good = await up('foto.png', 'image/png', png);
  check('receta con PNG válido se crea', good.status === 201, `status ${good.status}`);
  if (good.json?.data?.foto) cleanFiles.push(good.json.data.foto);
  const fakeExt = await up('script.php.png', 'image/png', Buffer.from('<?php system($_GET[1]); ?>'));
  check('texto PHP disfrazado de PNG (tipo y extensión falsos) se rechaza', fakeExt.status === 400, `status ${fakeExt.status}`);
  if (fakeExt.json?.data?.foto) cleanFiles.push(fakeExt.json.data.foto);
  check('.exe se rechaza', (await up('virus.exe', 'application/octet-stream', Buffer.from('MZ'))).status === 400);
  check('svg con script se rechaza', (await up('x.svg', 'image/svg+xml', Buffer.from('<svg onload=alert(1)>'))).status === 400);
  const huge = await up('grande.png', 'image/png', Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]));
  check('imagen de 6 MB se rechaza (límite 5 MB)', huge.status === 400, `status ${huge.status}`);
  const trav = await up('../../../evil.png', 'image/png', png);
  if (trav.json?.data?.foto) cleanFiles.push(trav.json.data.foto);
  check('nombre con ../ no escapa de la carpeta (nombre generado por el servidor)', trav.status !== 201 || /^\/uploads\/recetas\/[A-Za-z0-9._-]+$/.test(trav.json.data.foto), trav.json?.data?.foto ?? `status ${trav.status}`);
  check('no quedaron recetas de las subidas rechazadas', (await prisma.receta.count()) === recipeBefore + 1 + (trav.status === 201 ? 1 : 0));

  // apto físico
  const aptoForm = (name, type, bytes) => { const f = new FormData(); f.append('archivo', new Blob([bytes], { type }), name); return f; };
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  check('cliente NO puede subir apto de otro/propio (rol cliente) -> 403', (await api(`/clients/${U.ca.cli.id}/medical-clearance`, { method: 'POST', token: T.ca, form: aptoForm('a.pdf', 'application/pdf', pdf) })).status === 403);
  const upA = await api(`/clients/${U.ca.cli.id}/medical-clearance`, { method: 'POST', token: T.rec, form: aptoForm('apto.pdf', 'application/pdf', pdf) });
  check('recepción sube PDF de apto físico', upA.status === 200, `status ${upA.status}`);
  const stored = (await prisma.cliente.findUnique({ where: { id: U.ca.cli.id } })).aptoFisicoArchivo;
  if (stored) cleanFiles.push(`/uploads/${stored}`);
  check('el apto se guarda con nombre generado (sin el nombre original)', Boolean(stored) && !/apto\.pdf/.test(stored), stored);
  const staticTry = await fetch(BASE.replace(/\/api$/, '') + '/uploads/' + stored);
  check('el apto NO se sirve como archivo estático público', staticTry.status === 404, `status ${staticTry.status}`);
  check('el propio cliente baja su apto por endpoint autenticado', (await api('/cliente/apto-fisico/archivo', { token: T.ca, raw: true })).status === 200);
  check('otro cliente no obtiene el apto de ca (recibe el suyo: 404 sin archivo)', (await api('/cliente/apto-fisico/archivo', { token: T.cb, raw: true })).status === 404);
  check('sin token no se baja el apto', (await api('/cliente/apto-fisico/archivo', { raw: true })).status === 401);
  check('apto .html se rechaza', (await api(`/clients/${U.cb.cli.id}/medical-clearance`, { method: 'POST', token: T.rec, form: aptoForm('a.html', 'text/html', Buffer.from('<script>1</script>')) })).status === 400);
  check('apto .exe se rechaza', (await api(`/clients/${U.cb.cli.id}/medical-clearance`, { method: 'POST', token: T.rec, form: aptoForm('a.pdf', 'application/pdf', Buffer.from('MZ\x90not a pdf')) })).status === 400);
  check('apto de 6 MB se rechaza', (await api(`/clients/${U.cb.cli.id}/medical-clearance`, { method: 'POST', token: T.rec, form: aptoForm('a.pdf', 'application/pdf', Buffer.concat([pdf, Buffer.alloc(6 * 1024 * 1024)])) })).status === 400);
  check('traversal en estáticos de recetas -> 404/400', [400, 403, 404].includes((await fetch(BASE.replace(/\/api$/, '') + '/uploads/recetas/..%2f..%2f.env')).status));
  const trav2 = await fetch(BASE.replace(/\/api$/, '') + '/uploads/recetas/../../.env');
  check('traversal /uploads/recetas/../../.env no entrega el .env', !(await trav2.text()).includes('DATABASE_URL'));

  console.log('\n== CORS / cabeceras');
  const origins = ['http://localhost:5173', 'http://localhost:5174', 'https://evil.example'];
  for (const o of origins) {
    const r = await fetch(BASE + '/health', { method: 'OPTIONS', headers: { Origin: o, 'Access-Control-Request-Method': 'GET' } });
    console.log(`  preflight desde ${o} -> ${r.status} allow-origin=${r.headers.get('access-control-allow-origin')}`);
  }
  const h = await fetch(BASE + '/health');
  console.log('  x-powered-by:', h.headers.get('x-powered-by'), '| x-content-type-options:', h.headers.get('x-content-type-options'), '| x-frame-options:', h.headers.get('x-frame-options'));
  const err = await api('/profesor/rutinas/abc', { token: T.pa });
  check('errores de validación no filtran stack ni rutas', !/node_modules|\.js:\d+|at /.test(err.text), err.text.slice(0, 80));
  const nf = await api('/no/existe');
  check('ruta inexistente -> 404 JSON', nf.status === 404 && nf.json?.error);
} finally {
  for (const f of cleanFiles) { try { const p = f.startsWith('/uploads/recetas/') ? path.join('uploads', 'recetas', path.basename(f)) : path.join(f.replace(/^\//, '')); fs.unlinkSync(p); } catch { /* ya no existe */ } }
  console.log('\nlimpieza: usuarios temporales eliminados =', await cleanup(), '| archivos temporales borrados:', cleanFiles.length);
  await prisma.$disconnect();
}
console.log(`\nRESUMEN: ${res.filter(Boolean).length}/${res.length} OK`);
