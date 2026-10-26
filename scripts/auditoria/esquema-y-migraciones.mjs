import 'dotenv/config';
import fs from 'fs';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const realUrl = process.env.DATABASE_URL;
const dbName = new URL(realUrl).pathname.slice(1);
const urlFor = (name) => { const u = new URL(realUrl); u.pathname = '/' + name; return u.toString(); };
const clean = (e) => String(e.stderr || e.stdout || e.message).split(realUrl).join('***').replace(/mysql:\/\/\S+/g, 'mysql://***').slice(0, 500);
const run = (file, url) => {
  try { return execSync(`npx prisma db execute --file ${file} --url "${url}"`, { stdio: 'pipe' }).toString(); } catch (e) { throw new Error(clean(e)); }
};
const admin = new PrismaClient();
const T1 = 'fitlogic_audit_a';
const T2 = 'fitlogic_audit_b';
for (const n of [T1, T2]) {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${n}\``);
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${n}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
}
console.log('BD real =', dbName, '| temporales creadas:', T1, T2);

// A: fitLogic real.sql sin CREATE DATABASE / USE (así nunca toca la BD real)
let sql = fs.readFileSync('../fitLogic real.sql', 'utf8').replace(/^CREATE DATABASE[\s\S]*?;\s*\r?\nUSE fitlogic;/m, '');
if (/USE fitlogic|CREATE DATABASE/.test(sql)) throw new Error('quedó USE/CREATE DATABASE: aborto');
fs.writeFileSync('_tmp_real.sql', sql);
run('_tmp_real.sql', urlFor(T1));
console.log('A: fitLogic real.sql aplicado');

// B: migraciones de Prisma
try { execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: urlFor(T2) }, stdio: 'pipe' }); } catch (e) { throw new Error(clean(e)); }
console.log('B: prisma migrate deploy aplicado');

// Idempotencia: migraciones SQL sueltas dos veces sobre A (que ya tiene todo)
for (let pass = 1; pass <= 2; pass += 1) {
  for (const f of fs.readdirSync('db/migrations').sort()) {
    try { run('db/migrations/' + f, urlFor(T1)); } catch (e) { console.log(`  pasada ${pass} ${f}: FALLA -> ${e.message.split('\n').slice(0, 3).join(' | ')}`); }
  }
}
console.log('idempotencia: db/migrations/001..007 aplicadas 2 veces sobre A (sin FALLA arriba = OK)');

const snap = async (name) => {
  const p = new PrismaClient({ datasources: { db: { url: urlFor(name) } } });
  const cols = await p.$queryRawUnsafe(`SELECT table_name t, column_name c, column_type ty, is_nullable n, column_default d, extra e FROM information_schema.columns WHERE table_schema='${name}' ORDER BY 1,2`);
  const idx = await p.$queryRawUnsafe(`SELECT table_name t, index_name c, non_unique u, GROUP_CONCAT(column_name ORDER BY seq_in_index) cs FROM information_schema.statistics WHERE table_schema='${name}' GROUP BY 1,2,3 ORDER BY 1,2`);
  const fks = await p.$queryRawUnsafe(`SELECT table_name t, column_name c, referenced_table_name rt, referenced_column_name rc FROM information_schema.key_column_usage WHERE table_schema='${name}' AND referenced_table_name IS NOT NULL ORDER BY 1,2`);
  const chk = await p.$queryRawUnsafe(`SELECT table_name t, constraint_name c FROM information_schema.table_constraints WHERE table_schema='${name}' AND constraint_type='CHECK' ORDER BY 1,2`);
  const seeds = {};
  for (const t of ['rol', 'estado_cliente', 'estado_cuenta_staff', 'estado_cuota', 'metodo_pago', 'estado_inscripcion', 'categoria_receta', 'tipo_notificacion']) {
    seeds[t] = (await p.$queryRawUnsafe(`SELECT nombre FROM \`${t}\` ORDER BY nombre`)).map((r) => r.nombre);
  }
  await p.$disconnect();
  return { cols, idx, fks, chk, seeds };
};
const norm = (v) => JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? Number(x) : typeof x === 'string' ? x.toLowerCase() : x));
const S = { real: await snap(dbName), a: await snap(T1), b: await snap(T2) };
const key = (r) => `${r.t}.${r.c}`;
for (const [label, other] of [['fitLogic real.sql (+001..007 x2)', S.a], ['prisma migrate deploy', S.b]]) {
  console.log(`\n=== BD real vs ${label} ===`);
  let diffs = 0;
  for (const kind of ['cols', 'idx', 'fks', 'chk']) {
    const mr = new Map(S.real[kind].map((r) => [key(r), norm(r)]));
    const mo = new Map(other[kind].map((r) => [key(r), norm(r)]));
    for (const [k, v] of mr) {
      if (!mo.has(k)) { diffs += 1; console.log(`  [${kind}] solo en la real: ${k}`); }
      else if (mo.get(k) !== v) { diffs += 1; console.log(`  [${kind}] distinto ${k}\n     real: ${v}\n     otra: ${mo.get(k)}`); }
    }
    for (const k of mo.keys()) if (!mr.has(k)) { diffs += 1; console.log(`  [${kind}] solo en la otra: ${k}`); }
  }
  for (const t of Object.keys(S.real.seeds)) {
    if (norm(S.real.seeds[t]) !== norm(other.seeds[t])) { diffs += 1; console.log(`  [datos base] ${t}: real=${S.real.seeds[t]} otra=${other.seeds[t]}`); }
  }
  console.log(diffs === 0 ? '  sin diferencias' : `  ${diffs} diferencias`);
}
for (const n of [T1, T2]) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${n}\``);
console.log('\nbases temporales eliminadas');
await admin.$disconnect();
fs.unlinkSync('_tmp_real.sql');
