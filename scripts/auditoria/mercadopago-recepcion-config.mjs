import { setup, cleanup, api, login, prisma } from './lib.mjs';
const U = await setup();
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${extra !== '' ? ' -> ' + extra : ''}`); };
try {
  const T = {};
  for (const k of ['rec', 'ca', 'cb']) T[k] = (await login(`tmp-audit-${k}@test.local`)).token;
  const plan = await prisma.plan.create({ data: { nombre: 'AUDIT plan misc', duracionDias: 30, precio: 5000 } });

  console.log('== 5.5 Mercado Pago: credenciales del proceso en marcha (sin mostrar el token)');
  const co = await api('/cliente/membresia/checkout', { method: 'POST', token: T.ca, body: { plan_id: plan.id } });
  check('checkout real contra la API de MP -> 201', co.status === 201, `${co.status} ${co.json?.message ?? ''}`);
  const prefix = String(co.json?.data?.preferenceId ?? '').split('-')[0];
  check('el id de la preferencia empieza con el User ID del vendedor de prueba (3793578006)', prefix === '3793578006', `prefijo ${prefix}`);
  check('  el initPoint es de mercadopago.com.ar y la respuesta no contiene tokens', /mercadopago\.com\.ar/.test(co.json?.data?.initPoint ?? '') && !/APP_USR|TEST-/.test(co.text));
  check('  el monto de la preferencia lo calculó el backend (5000) y el resumen dice "desde hoy"', co.json.data.resumen.monto === 5000);
  const cuota = await prisma.cuota.findUnique({ where: { id: co.json.data.cuotaId } });
  check('  cuota PENDIENTE con mp_preference_id y mp_expira_en (~48 h)', Boolean(cuota.mpPreferenceId) && cuota.mpExpiraEn && Math.abs(cuota.mpExpiraEn.getTime() - Date.now() - 48 * 3600_000) < 120_000);
  const ver = await api('/cliente/membresia/pago/verificar', { token: T.ca });
  check('"Ya pagué" sin pago en MP -> SIN_PAGO con mensaje claro', ver.json.data.estado === 'SIN_PAGO' && /No encontramos un pago/.test(ver.json.data.mensaje));
  const cfg = (await api('/cliente/membresia/pago/config', { token: T.ca })).json.data;
  check('sin túneles: retorno automático y webhook desactivados (auto_return / notification_url omitidos)', cfg.retornoAutomatico === false && cfg.webhookActivo === false);
  const disc = await api(`/cliente/membresia/solicitudes/${cuota.id}`, { method: 'DELETE', token: T.ca });
  check('descartar la solicitud abandonada -> 200 y desaparece', disc.status === 200 && (await prisma.cuota.count({ where: { id: cuota.id } })) === 0);

  console.log('\n== 5.3 Recepción: Configuración (datos propios)');
  const me = await api('/recepcion/me', { method: 'PATCH', token: T.rec, body: { nombre: 'Editada', telefono: '+54 11 2222-3333' } });
  const row = await prisma.usuario.findUnique({ where: { id: U.rec.id } });
  check('PATCH /recepcion/me actualiza usuario (UPDATE real)', me.status === 200 && row.nombre === 'Editada' && row.telefono === '+54 11 2222-3333', `${me.status}`);
  check('  email inválido -> 400; email de otro usuario -> 409', (await api('/recepcion/me', { method: 'PATCH', token: T.rec, body: { email: 'mal' } })).status === 400 && (await api('/recepcion/me', { method: 'PATCH', token: T.rec, body: { email: 'tmp-audit-ca@test.local' } })).status === 409);
  check('  nombre vacío -> 400; teléfono con letras -> 400', (await api('/recepcion/me', { method: 'PATCH', token: T.rec, body: { nombre: '  ' } })).status === 400 && (await api('/recepcion/me', { method: 'PATCH', token: T.rec, body: { telefono: 'hola' } })).status === 400);
  await prisma.plan.deleteMany({ where: { nombre: 'AUDIT plan misc' } });
} finally {
  await prisma.cuota.deleteMany({ where: { plan: { nombre: 'AUDIT plan misc' } } });
  await prisma.plan.deleteMany({ where: { nombre: 'AUDIT plan misc' } });
  console.log('\nlimpieza: usuarios temporales eliminados =', await cleanup());
  await prisma.$disconnect();
}
console.log(`RESUMEN: ${results.filter(Boolean).length}/${results.length} OK`);
