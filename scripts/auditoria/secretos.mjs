import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve('..');
const patterns = [
  ['MP APP_USR token', /APP_USR-[0-9A-Za-z-]{16,}/],
  ['MP TEST token', /TEST-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|TEST-\d{10,}-\d+-[0-9a-f]{20,}/],
  ['bcrypt hash', /\$2[aby]\$\d{2}\$[A-Za-z0-9./]{50,}/],
  ['clave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['URL con contraseña', /mysql:\/\/[^:\s/]+:[^@\s]+@/],
  ['JWT_SECRET con valor', /JWT_SECRET\s*=\s*["']?[^\s"'<][^\s"']{6,}/],
  ['password literal', /(password|contraseña)\s*[:=]\s*["'][^"'\s]{4,}["']/i],
];
const skipDirs = new Set(['node_modules', '.git', 'dist', 'uploads', '.dev-logs']);
const skipFiles = new Set(['package-lock.json', '.env']);
const mask = (s) => s.replace(/(APP_USR-|TEST-)[0-9A-Za-z-]{4}[0-9A-Za-z-]*/g, '$1<oculto>').replace(/(\$2[aby]\$\d{2}\$).{6}[A-Za-z0-9./]*/g, '$1<hash>').replace(/(mysql:\/\/[^:\s/]+:)[^@\s]+@/g, '$1***@').replace(/(JWT_SECRET\s*=\s*["']?).*/, '$1<valor>').replace(/((password|contraseña)\s*[:=]\s*["'])[^"']+/i, '$1<valor>');
const hits = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!skipDirs.has(entry.name)) walk(path.join(dir, entry.name)); continue; }
    if (skipFiles.has(entry.name) || /\.(png|jpg|jpeg|webp|pdf|docx|ico|svg|woff2?)$/i.test(entry.name)) continue;
    const file = path.join(dir, entry.name);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => { for (const [name, re] of patterns) if (re.test(line)) hits.push(`${path.relative(ROOT, file)}:${i + 1} [${name}] ${mask(line.trim()).slice(0, 110)}`); });
  }
};
walk(ROOT);
console.log('=== archivos actuales ===');
console.log(hits.length ? hits.join('\n') : 'sin coincidencias');

console.log('\n=== historial git (líneas agregadas) ===');
for (const repo of ['backend', 'frontend']) {
  let log = '';
  try { log = execSync('git log --all -p --no-color --pretty=format:"@@%h %ad" --date=short', { cwd: path.join(ROOT, repo), maxBuffer: 1 << 28 }).toString(); } catch (e) { console.log(repo, 'sin git log:', e.message.slice(0, 80)); continue; }
  const found = [];
  let commit = '', file = '';
  for (const line of log.split('\n')) {
    if (line.startsWith('@@')) commit = line.slice(2);
    else if (line.startsWith('+++ ')) file = line.slice(6);
    else if (line.startsWith('+') && !line.startsWith('+++') && !/package-lock/.test(file)) for (const [name, re] of patterns) if (re.test(line)) found.push(`${repo} ${commit} ${file} [${name}] ${mask(line.slice(1).trim()).slice(0, 100)}`);
  }
  console.log(`[${repo}] commits: ${(log.match(/^@@/gm) || []).length}`);
  console.log(found.length ? [...new Set(found)].slice(0, 25).join('\n') : '  sin coincidencias');
}
const ignored = (cwd, p) => { try { execSync(`git check-ignore -q ${p}`, { cwd }); return true; } catch { return false; } };
console.log('\n.env ignorado por git: backend', ignored(path.join(ROOT, 'backend'), '.env'), '| frontend', ignored(path.join(ROOT, 'frontend'), '.env'));
console.log('.env versionado en backend:', execSync('git ls-files', { cwd: path.join(ROOT, 'backend') }).toString().split('\n').filter((f) => /(^|\/)\.env$/.test(f)).length > 0, '| en frontend:', execSync('git ls-files', { cwd: path.join(ROOT, 'frontend') }).toString().split('\n').filter((f) => /(^|\/)\.env$/.test(f)).length > 0);
