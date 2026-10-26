import { setup, cleanup, api, login, prisma, PWD } from './lib.mjs';

const U = await setup();
const out = [];
const log = (...a) => { out.push(a.join(' ')); console.log(...a); };
try {
  const T = {};
  for (const k of ['adm', 'pa', 'pb', 'pdis', 'rec', 'rdis', 'ca', 'cb', 'cbaja', 'cpago', 'cinact']) {
    const r = await login(`tmp-audit-${k}@test.local`);
    T[k] = r.token;
    log(`login ${k.padEnd(6)} -> ${r.status} ${r.token ? 'token' : (r.json?.message ?? '')}`);
  }
  // ------------------------------------------------------------------ matriz endpoint x rol
  const X = 999999999;
  // [método, ruta, cuerpo, roles permitidos (A=admin, P=profesor, R=recepción, C=cliente)]
  const M = [
    ['GET', '/auth/me', null, 'APRC'], ['POST', '/auth/change-password', {}, 'APRC'], ['GET', '/config/system', null, 'APRC'],
    ['PUT', '/config/gym', 'FORBID', 'A'],
    ['GET', '/users', null, 'A'], ['GET', `/users/${X}`, null, 'A'], ['POST', '/users', {}, 'A'], ['PATCH', `/users/${X}`, {}, 'A'], ['PATCH', `/users/${X}/active`, { activo: 1 }, 'A'], ['POST', `/users/${X}/reset-password`, {}, 'A'],
    ['GET', '/plans', null, 'A'], ['GET', `/plans/${X}`, null, 'A'], ['POST', '/plans', {}, 'A'], ['PATCH', `/plans/${X}`, {}, 'A'], ['PATCH', `/plans/${X}/active`, { activo: 1 }, 'A'], ['DELETE', `/plans/${X}`, null, 'A'],
    ['GET', '/promotions', null, 'A'], ['GET', `/promotions/${X}`, null, 'A'], ['POST', '/promotions', {}, 'A'], ['PATCH', `/promotions/${X}`, {}, 'A'], ['PATCH', `/promotions/${X}/active`, { activo: 1 }, 'A'], ['DELETE', `/promotions/${X}`, null, 'A'],
    ['GET', '/clients/me', null, 'C'], ['GET', '/clients', null, 'AR'], ['POST', '/clients', {}, 'AR'], ['GET', `/clients/${X}`, null, 'AR'], ['PATCH', `/clients/${X}`, {}, 'AR'], ['POST', `/clients/${X}/medical-clearance`, null, 'AR'], ['PATCH', `/clients/${X}/status`, { estado: 'HABILITADO' }, 'A'],
    ['GET', '/attendance', null, 'AR'], ['GET', `/attendance/access/${X}`, null, 'AR'], ['POST', '/attendance', {}, 'AR'],
    ['GET', '/quotas/me', null, 'C'], ['GET', `/quotas/client/${X}`, null, 'AR'], ['POST', '/quotas', {}, 'ARC'], ['POST', `/quotas/${X}/confirm-payment`, {}, 'AR'],
    ['GET', '/routines/me', null, 'C'], ['GET', '/routines', null, 'P'], ['GET', '/routines/exercises', null, 'P'], ['POST', '/routines/exercises', {}, 'P'], ['GET', `/routines/${X}`, null, 'P'], ['POST', '/routines', {}, 'P'], ['PUT', `/routines/${X}`, {}, 'P'],
    ['GET', '/classes', null, 'APR'], ['GET', '/classes/available', null, 'C'], ['POST', '/classes', {}, 'P'], ['PUT', `/classes/${X}`, {}, 'P'], ['DELETE', `/classes/${X}`, null, 'P'], ['POST', `/classes/${X}/enroll`, {}, 'C'], ['POST', `/classes/${X}/rate`, {}, 'C'],
    ['GET', '/recipes', null, 'APR'], ['GET', '/recipes/available', null, 'C'], ['POST', '/recipes', {}, 'P'], ['PUT', `/recipes/${X}`, {}, 'P'], ['DELETE', `/recipes/${X}`, null, 'P'],
    ['GET', '/admin/dashboard/stats', null, 'A'],
    ...['resumen', 'desglose', 'grafico', 'pagos', 'pagos/exportar.csv', 'pendientes', 'conciliacion'].map((s) => ['GET', `/admin/ingresos/${s}`, null, 'A']),
    ['GET', `/admin/ingresos/pagos/${X}`, null, 'A'], ['POST', `/admin/ingresos/pendientes/${X}/verificar`, {}, 'A'],
    ['GET', '/recepcion/dashboard/stats', null, 'R'], ['GET', '/recepcion/pagos', null, 'R'], ['GET', '/recepcion/planes', null, 'R'], ['PATCH', '/recepcion/me', {}, 'R'],
    ['GET', '/ejercicios', null, 'P'], ['POST', '/ejercicios', {}, 'P'],
    ...['clientes', 'perfil', 'rutinas', 'clases', 'categorias-receta', 'recetas', 'notificaciones'].map((s) => ['GET', `/profesor/${s}`, null, 'P']),
    ['GET', `/profesor/rutinas/${X}`, null, 'P'], ['POST', '/profesor/rutinas', {}, 'P'], ['PUT', `/profesor/rutinas/${X}`, {}, 'P'], ['POST', '/profesor/clases', {}, 'P'], ['POST', '/profesor/clases/disponibilidad', {}, 'P'], ['PUT', `/profesor/clases/${X}`, {}, 'P'], ['DELETE', `/profesor/clases/${X}`, null, 'P'],
    ['POST', '/profesor/recetas', {}, 'P'], ['PUT', `/profesor/recetas/${X}`, {}, 'P'], ['DELETE', `/profesor/recetas/${X}`, null, 'P'], ['PUT', '/profesor/perfil/password', {}, 'P'], ['PATCH', '/profesor/notificaciones/leidas', null, 'P'], ['PATCH', `/profesor/notificaciones/${X}/leida`, null, 'P'],
    ...['inicio', 'rutinas', 'rutinas/historial', 'clases', 'clases/mias', 'categorias-receta', 'recetas', 'planes', 'membresia/pago/config', 'membresia/pago/verificar', 'perfil', 'pagos', 'asistencias', 'notificaciones'].map((s) => ['GET', `/cliente/${s}`, null, 'C']),
    ['GET', `/cliente/rutinas/${X}`, null, 'C'], ['GET', `/cliente/recetas/${X}`, null, 'C'], ['POST', `/cliente/clases/${X}/inscripcion`, {}, 'C'], ['DELETE', `/cliente/clases/${X}/inscripcion`, null, 'C'],
    ['POST', '/cliente/membresia/checkout', {}, 'C'], ['DELETE', `/cliente/membresia/solicitudes/${X}`, null, 'C'], ['PUT', '/cliente/perfil/password', {}, 'C'], ['GET', `/cliente/pagos/${X}/comprobante`, null, 'C'], ['GET', '/cliente/apto-fisico/archivo', null, 'C'],
    ['PATCH', '/cliente/notificaciones/leidas', null, 'C'], ['PATCH', `/cliente/notificaciones/${X}/leida`, null, 'C'],
  ];
  const roleToken = { A: 'adm', P: 'pa', R: 'rec', C: 'ca' };
  let bad = 0; let total = 0;
  const failures = [];
  for (const [method, path, body, allowed] of M) {
    const checks = [['none', undefined, ''], ...Object.entries(roleToken).map(([r, k]) => [r, T[k], r])];
    for (const [who, token, letter] of checks) {
      if (body === 'FORBID' && who === allowed) continue; // evitar mutar la config real: solo se prueba que los demás roles sean rechazados
      const res = await api(path, { method, token, body: body === 'FORBID' ? {} : body ?? undefined });
      const denied = res.status === 401 || res.status === 403;
      const shouldPass = letter && allowed.includes(letter);
      total += 1;
      const expectedOk = who === 'none' ? res.status === 401 : shouldPass ? !denied : res.status === 403;
      if (!expectedOk) { bad += 1; failures.push(`${method} ${path.replace(String(X), ':id')} como ${who}: esperado ${who === 'none' ? '401' : shouldPass ? 'permitido' : '403'}, recibió ${res.status}`); }
      if (shouldPass && res.status >= 200 && res.status < 300 && method !== 'GET') failures.push(`  (aviso) ${method} ${path} como ${who} devolvió ${res.status} con id inexistente/cuerpo vacío`);
      if (/password_?hash|passwordHash/i.test(res.text)) { bad += 1; failures.push(`FUGA password_hash en ${method} ${path} como ${who}`); }
    }
  }
  log(`\nMATRIZ endpoint x rol: ${total} pruebas, ${bad} desvíos`);
  failures.forEach((f) => log('  -', f));

  // ------------------------------------------------------------------ staff inhabilitado / cliente BAJA / PAGO / usuario inactivo
  log('\n== estados de cuenta (login + endpoints)');
  const lg = await login('tmp-audit-cinact@test.local');
  log('usuario inactivo (activo=0) login ->', lg.status, lg.json?.message);
  for (const [k, p] of [['pdis', '/profesor/perfil'], ['rdis', '/recepcion/dashboard/stats'], ['cbaja', '/cliente/inicio'], ['cpago', '/cliente/inicio']]) {
    const r = await api(p, { token: T[k] });
    log(`${k.padEnd(6)} ${p} -> ${r.status} ${r.json?.message ?? ''}`);
  }
  const rdisPay = await api('/recepcion/pagos', { token: T.rdis });
  log('recepcionista INHABILITADA /recepcion/pagos ->', rdisPay.status);
  const baja = await api('/cliente/membresia/checkout', { method: 'POST', token: T.cbaja, body: { plan_id: 1 } });
  log('cliente BAJA checkout ->', baja.status, baja.json?.error);
  const bajaClass = await api(`/cliente/clases/${X}/inscripcion`, { method: 'POST', token: T.cbaja, body: {} });
  log('cliente BAJA inscripción ->', bajaClass.status, bajaClass.json?.error ?? bajaClass.json?.message);

  // ------------------------------------------------------------------ rate limit en login
  const t0 = Date.now(); const codes = [];
  for (let i = 0; i < 25; i += 1) codes.push((await api('/auth/login', { method: 'POST', body: { email: 'tmp-audit-nadie@test.local', password: `mala${i}` } })).status);
  log(`\nlogin con contraseña mala x25 en ${Date.now() - t0} ms -> estados: ${[...new Set(codes)].join(',')} (429 = hay rate limit)`);
  const okAfter = await login('tmp-audit-ca@test.local');
  log('login correcto después de 25 fallos ->', okAfter.status);
} finally {
  log('\nlimpieza: usuarios temporales eliminados =', await cleanup());
  await prisma.$disconnect();
}
