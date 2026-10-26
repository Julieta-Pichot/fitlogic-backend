import 'dotenv/config';
import fs from 'fs';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const realUrl = process.env.DATABASE_URL;
const urlFor = (name) => { const u = new URL(realUrl); u.pathname = '/' + name; return u.toString(); };
const NAME = 'fitlogic_audit_seeds';
const admin = new PrismaClient();
await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${NAME}\``);
await admin.$executeRawUnsafe(`CREATE DATABASE \`${NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
const sql = fs.readFileSync('../fitLogic real.sql', 'utf8').replace(/^CREATE DATABASE[\s\S]*?;\s*\r?\nUSE fitlogic;/m, '');
if (/USE fitlogic|CREATE DATABASE/.test(sql)) throw new Error('aborto: el SQL todavía tiene USE/CREATE DATABASE');
fs.writeFileSync('_tmp_seed.sql', sql);
const env = { ...process.env, DATABASE_URL: urlFor(NAME), NODE_ENV: 'development' };
const run = (cmd) => execSync(cmd, { env, stdio: 'pipe' }).toString();
run(`npx prisma db execute --file _tmp_seed.sql --url "${urlFor(NAME)}"`);
const p = new PrismaClient({ datasources: { db: { url: urlFor(NAME) } } });
const counts = async () => Object.fromEntries(await Promise.all(['rol', 'estado_cliente', 'estado_cuota', 'metodo_pago', 'categoria_receta', 'tipo_notificacion', 'usuario', 'cliente', 'profesor', 'recepcionista', 'gimnasio', 'ejercicio', 'plan'].map(async (t) => [t, Number((await p.$queryRawUnsafe(`SELECT COUNT(*) n FROM \`${t}\``))[0].n)])));
console.log('base nueva (solo fitLogic real.sql):', JSON.stringify(await counts()));
const hashAdmin = async () => (await p.$queryRawUnsafe("SELECT password_hash h FROM usuario WHERE email='admin@fitlogic.com'"))[0]?.h;
const hashBefore = await hashAdmin();
for (const [label, cmd] of [['db:seed', 'node prisma/seed.js'], ['db:seed:ejercicios', 'node prisma/seed-ejercicios.js'], ['db:seed:planes', 'node prisma/seed-planes.js']]) {
  run(cmd);
  const first = await counts();
  const out = run(cmd).split('\n').filter(Boolean).slice(-2).join(' | ');
  const second = await counts();
  console.log(`${label.padEnd(20)} 1ª ${JSON.stringify(first)}\n${''.padEnd(20)} 2ª idéntica: ${JSON.stringify(first) === JSON.stringify(second)}  (${out.slice(0, 90)})`);
}
// el seed no debe pisar la contraseña de un usuario que ya existe
await p.$executeRawUnsafe("UPDATE usuario SET password_hash='HASH-ELEGIDO-POR-EL-ADMIN' WHERE email='admin@fitlogic.com'");
run('node prisma/seed.js');
console.log('re-ejecutar db:seed NO pisa la contraseña del admin existente:', (await hashAdmin()) === 'HASH-ELEGIDO-POR-EL-ADMIN');
const planes = await p.$queryRawUnsafe('SELECT nombre, duracion_dias, precio FROM plan ORDER BY duracion_dias');
console.log('planes sembrados:', planes.map((x) => `${x.nombre} ${x.duracion_dias}d $${Number(x.precio)}`).join(' | '));
const metodos = (await p.$queryRawUnsafe('SELECT nombre FROM metodo_pago ORDER BY nombre')).map((r) => r.nombre);
console.log('metodo_pago:', metodos.join(','));
// tipos de notificación que usa el código
const used = ['VENCIMIENTO_CUOTA', 'CLASE_PROXIMA', 'PUNTUAR_CLASE', 'VENCIMIENTO_APTO_FISICO', 'INSCRIPCION_CLASE', 'PAGO_ACREDITADO'];
const present = (await p.$queryRawUnsafe('SELECT nombre FROM tipo_notificacion')).map((r) => r.nombre);
console.log('tipos de notificación faltantes tras db:seed:', used.filter((t) => !present.includes(t)).join(',') || 'ninguno');
await p.$disconnect();
await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${NAME}\``);
await admin.$disconnect();
fs.unlinkSync('_tmp_seed.sql');
console.log('base temporal eliminada');
