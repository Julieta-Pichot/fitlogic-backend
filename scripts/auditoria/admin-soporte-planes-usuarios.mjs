import fs from 'fs';
import path from 'path';
import { setup, cleanup, api, login, prisma, PWD } from './lib.mjs';

const U = await setup();
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${extra !== '' ? ' -> ' + extra : ''}`); };
const original = await prisma.gimnasio.findFirst();
const cleanFiles = [];
try {
  const T = {};
  for (const k of ['adm', 'pa', 'pb', 'rec', 'ca']) T[k] = (await login(`tmp-audit-${k}@test.local`)).token;

  console.log('\n== 5.2 Admin > Soporte (tabla gimnasio)');
  const sys = (await api('/config/system', { token: T.adm })).json.data;
  check('GET /config/system devuelve el gimnasio real y los catálogos', sys.gimnasio?.id === original.id && sys.metodosPago.map((m) => m.nombre).sort().join() === 'EFECTIVO,MERCADO_PAGO', JSON.stringify(sys.metodosPago.map((m) => m.nombre)));
  check('  método de pago "Tarjeta" ya no existe', !sys.metodosPago.some((m) => /tarjeta/i.test(m.nombre)));
  const put = (body, token = T.adm) => api('/config/gym', { method: 'PUT', token, body });
  check('PUT /config/gym con email inválido -> 400', (await put({ emailSoporte: 'no-es-email', telefono: '123456' })).status === 400);
  check('PUT con teléfono de 300 caracteres -> 400', (await put({ telefono: '9'.repeat(300) })).status === 400);
  check('PUT como profesor/recepción/cliente -> 403', [T.pa, T.rec, T.ca].every(async () => true) && (await put({ telefono: '1' }, T.pa)).status === 403 && (await put({ telefono: '1' }, T.rec)).status === 403 && (await put({ telefono: '1' }, T.ca)).status === 403);
  const upd = await put({ telefono: '+54 11 4000-0000', emailSoporte: 'soporte.audit@fitlogic.com' });
  const row = await prisma.gimnasio.findFirst();
  check('PUT válido -> 200 y UPDATE real en la tabla gimnasio', upd.status === 200 && row.telefono === '+54 11 4000-0000' && row.emailSoporte === 'soporte.audit@fitlogic.com', `${upd.status}`);
  check('  el cliente ve los datos nuevos en su perfil/pie (lee del mismo registro)', (await api('/config/system', { token: T.ca })).json.data.gimnasio.telefono === '+54 11 4000-0000');
  // restaurar EXACTAMENTE lo que había
  await prisma.gimnasio.update({ where: { id: original.id }, data: { telefono: original.telefono, emailSoporte: original.emailSoporte, nombre: original.nombre, direccion: original.direccion, identidadVisual: original.identidadVisual } });
  const back = await prisma.gimnasio.findFirst();
  check('  datos de soporte restaurados a los originales', back.telefono === original.telefono && back.emailSoporte === original.emailSoporte);

  console.log('\n== 5.2 Admin: planes y usuarios (sin regresiones)');
  const plan = await api('/plans', { method: 'POST', token: T.adm, body: { nombre: 'AUDIT plan admin', duracionDias: 45, precio: 9999.5 } });
  check('crear plan -> 201', plan.status === 201, `${plan.status} ${plan.json?.message ?? ''}`);
  const pid = plan.json?.data?.id;
  check('  validaciones: precio negativo/duración 0 -> 400', (await api('/plans', { method: 'POST', token: T.adm, body: { nombre: 'x', duracionDias: 0, precio: 1 } })).status === 400 && (await api('/plans', { method: 'POST', token: T.adm, body: { nombre: 'x', duracionDias: 30, precio: -5 } })).status === 400);
  check('  editar plan -> 200', (await api(`/plans/${pid}`, { method: 'PATCH', token: T.adm, body: { precio: 12000 } })).status === 200 && Number((await prisma.plan.findUnique({ where: { id: pid } })).precio) === 12000);
  check('  desactivar plan -> deja de verse en /cliente/planes', (await api(`/plans/${pid}/active`, { method: 'PATCH', token: T.adm, body: { activo: 0 } })).status === 200 && !(await api('/cliente/planes', { token: T.ca })).json.data.some((p) => p.id === pid));
  check('  reactivar -> se ve en planes de cliente y de recepción', (await api(`/plans/${pid}/active`, { method: 'PATCH', token: T.adm, body: { activo: 1 } })).status === 200 && (await api('/cliente/planes', { token: T.ca })).json.data.some((p) => p.id === pid) && (await api('/recepcion/planes', { token: T.rec })).json.data.some((p) => p.id === pid));
  const delPlan = await api(`/plans/${pid}`, { method: 'DELETE', token: T.adm });
  check('  borrar plan (baja lógica) -> 200', delPlan.status === 200, `${delPlan.status} ${delPlan.json?.message ?? ''}`);
  check('  DELETE /plans/:id es una baja lógica (activo=0), no borra la fila', (await prisma.plan.findUnique({ where: { id: pid } }))?.activo === false, 'el plan sigue en la BD con activo=0');

  const newUser = { nombre: 'Audit', apellido: 'Nuevo', email: 'tmp-audit-nuevo@test.local', password: 'Nuevo1234', rolId: 3, telefono: '+54 11 5555-0000' };
  const cu = await api('/users', { method: 'POST', token: T.adm, body: newUser });
  check('crear usuario recepcionista -> 201 con fila en recepcionista', cu.status === 201 && (await prisma.recepcionista.count({ where: { usuario: { email: newUser.email } } })) === 1, `${cu.status} ${cu.json?.message ?? ''}`);
  check('  email duplicado -> 409', (await api('/users', { method: 'POST', token: T.adm, body: newUser })).status === 409);
  check('  contraseña corta -> 400', (await api('/users', { method: 'POST', token: T.adm, body: { ...newUser, email: 'tmp-audit-n2@test.local', password: '123' } })).status === 400);
  const uid = cu.json?.data?.user?.id ?? cu.json?.data?.id;
  const nu = await prisma.usuario.findFirst({ where: { email: newUser.email } });
  check('  el nuevo usuario puede iniciar sesión', Boolean((await login(newUser.email, newUser.password)).token));
  check('  editar nombre -> 200', (await api(`/users/${nu.id}`, { method: 'PATCH', token: T.adm, body: { nombre: 'Editado' } })).status === 200 && (await prisma.usuario.findUnique({ where: { id: nu.id } })).nombre === 'Editado');
  check('  desactivar -> ya no puede iniciar sesión', (await api(`/users/${nu.id}/active`, { method: 'PATCH', token: T.adm, body: { activo: 0 } })).status === 200 && !(await login(newUser.email, newUser.password)).token);
  check('  restablecer contraseña -> 200 y entra con la nueva', (await api(`/users/${nu.id}/active`, { method: 'PATCH', token: T.adm, body: { activo: 1 } })).status === 200 && (await api(`/users/${nu.id}/reset-password`, { method: 'POST', token: T.adm, body: { newPassword: 'Reset12345' } })).status === 200 && Boolean((await login(newUser.email, 'Reset12345')).token));
  check('  el admin no puede desactivarse a sí mismo (cuenta de administrador protegida)', [400, 403].includes((await api(`/users/${U.adm.id}/active`, { method: 'PATCH', token: T.adm, body: { activo: 0 } })).status));
  const adminTarget = await prisma.usuario.findFirst({ where: { email: 'admin@fitlogic.com' } });
  check('  no se puede editar a otro administrador desde estas operaciones', [400, 403].includes((await api(`/users/${adminTarget.id}`, { method: 'PATCH', token: T.adm, body: { nombre: 'Hack' } })).status));
  void uid;

  console.log('\n== 5.4 Profesor: perfil y contraseña');
  const perfil = (await api('/profesor/perfil', { token: T.pa })).json.data;
  check('perfil con datos reales (email, estado, clases)', perfil.email === 'tmp-audit-pa@test.local' && Array.isArray(perfil.clases) && perfil.estadoCuenta, JSON.stringify({ e: perfil.estadoCuenta }));
  const pw = (body) => api('/profesor/perfil/password', { method: 'PUT', token: T.pa, body });
  check('contraseña actual incorrecta -> 400/401', [400, 401].includes((await pw({ currentPassword: 'Incorrecta1', newPassword: 'NuevaClave1', confirmPassword: 'NuevaClave1' })).status));
  check('nueva contraseña corta -> 400', (await pw({ currentPassword: PWD, newPassword: 'abc', confirmPassword: 'abc' })).status === 400);
  const okPw = await pw({ currentPassword: PWD, newPassword: 'NuevaClave1', confirmPassword: 'NuevaClave1' });
  check('cambio válido -> 200, el hash cambia y entra con la nueva', okPw.status === 200 && Boolean((await login('tmp-audit-pa@test.local', 'NuevaClave1')).token) && !(await login('tmp-audit-pa@test.local', PWD)).token, `${okPw.status} ${okPw.json?.message ?? ''}`);
  const cl = (body) => api('/cliente/perfil/password', { method: 'PUT', token: T.ca, body });
  check('cliente: actual incorrecta -> 400', (await cl({ currentPassword: 'Mala12345', newPassword: 'ClaveNueva1' })).status === 400);
  check('cliente: nueva igual a la actual -> 400', (await cl({ currentPassword: PWD, newPassword: PWD })).status === 400);
  check('cliente: cambio válido -> 200', (await cl({ currentPassword: PWD, newPassword: 'ClaveNueva1' })).status === 200);
  const rp = (body) => api('/auth/change-password', { method: 'POST', token: T.rec, body });
  check('recepción: /auth/change-password con actual incorrecta -> 400', (await rp({ currentPassword: 'Mala12345', newPassword: 'ClaveNueva1' })).status === 400);
  check('recepción: cambio válido -> 200', (await rp({ currentPassword: PWD, newPassword: 'ClaveNueva1' })).status === 200);

  console.log('\n== 5.4 Profesor: recetas y archivos');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');
  const form = (payload, withFile = true) => { const f = new FormData(); f.append('payload', JSON.stringify(payload)); if (withFile) f.append('foto', new Blob([png], { type: 'image/png' }), 'f.png'); return f; };
  const body = { nombre: 'AUDIT receta completa', categoriaRecetaId: 1, descripcion: 'x', calorias: 400, proteinasG: 30, carbohidratosG: 40, grasasG: 10, porciones: 2, otroDatoNutricional: 'Fibra 5g', ingredientes: [{ nombre: 'Avena', cantidad: '50', unidad: 'g' }], pasos: [{ descripcion: 'Mezclar' }] };
  const t = (await login('tmp-audit-pa@test.local', 'NuevaClave1')).token;
  const c1 = await api('/profesor/recetas', { method: 'POST', token: t, form: form(body) });
  check('crear receta con foto, ingredientes, pasos y nutrición -> 201', c1.status === 201, `${c1.status} ${c1.json?.message ?? ''}`);
  const rid = c1.json.data.id;
  const photo1 = c1.json.data.foto; cleanFiles.push(photo1);
  const file1 = path.join('uploads', 'recetas', path.basename(photo1));
  check('  archivo guardado en disco con nombre del servidor', fs.existsSync(file1));
  const stored = await prisma.receta.findUnique({ where: { id: rid }, include: { ingredientes: true, pasos: true } });
  check('  persisten receta + ingrediente_receta + paso_receta + campos nutricionales', stored.ingredientes.length === 1 && stored.pasos.length === 1 && Number(stored.proteinasG) === 30 && stored.porciones === 2 && stored.otroDatoNutricional === 'Fibra 5g');
  const e1 = await api(`/profesor/recetas/${rid}`, { method: 'PUT', token: t, form: form({ ...body, nombre: 'AUDIT receta editada', proteinasG: 35, ingredientes: [{ nombre: 'Banana' }, { nombre: 'Leche' }], pasos: [{ descripcion: 'Licuar' }, { descripcion: 'Servir' }] }) });
  check('editar con foto nueva -> 200, reemplaza ingredientes/pasos y borra el archivo anterior', e1.status === 200 && !fs.existsSync(file1) && fs.existsSync(path.join('uploads', 'recetas', path.basename(e1.json.data.foto))) && e1.json.data.ingredientes.length === 2 && e1.json.data.pasos.length === 2, `${e1.status}`);
  cleanFiles.push(e1.json.data.foto);
  const pre = (await api('/profesor/recetas', { token: t })).json.data.find((r) => r.id === rid);
  check('  al editar se precargan los campos nutricionales', pre.proteinasG === 35 && pre.porciones === 2 && pre.otroDatoNutricional === 'Fibra 5g');
  const photo2 = path.join('uploads', 'recetas', path.basename(e1.json.data.foto));
  const d1 = await api(`/profesor/recetas/${rid}`, { method: 'DELETE', token: t });
  check('borrar receta -> 200, sin filas huérfanas y sin archivo', d1.status === 200 && (await prisma.ingredienteReceta.count({ where: { recetaId: rid } })) === 0 && (await prisma.pasoReceta.count({ where: { recetaId: rid } })) === 0 && !fs.existsSync(photo2));
} finally {
  for (const f of cleanFiles) { try { fs.unlinkSync(path.join('uploads', 'recetas', path.basename(f))); } catch { /* ya no existe */ } }
  await prisma.plan.deleteMany({ where: { nombre: 'AUDIT plan admin' } });
  const g = await prisma.gimnasio.findFirst();
  console.log('\nsoporte final:', g.telefono === original.telefono && g.emailSoporte === original.emailSoporte ? 'idéntico al original' : 'DIFERENTE');
  console.log('limpieza: usuarios temporales eliminados =', await cleanup());
  await prisma.$disconnect();
}
console.log(`\nRESUMEN: ${results.filter(Boolean).length}/${results.length} OK`);
