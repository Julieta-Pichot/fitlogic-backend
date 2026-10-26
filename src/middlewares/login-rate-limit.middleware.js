import { sendError } from '../utils/response.js';

// Límite de intentos fallidos de login, en memoria (sin dependencias). Se cuentan solo las respuestas 401:
//   - por email + IP: 8 fallos cada 15 minutos
//   - por IP: 40 fallos cada 15 minutos
// Un login correcto limpia el contador del email. Al reiniciar el servidor los contadores arrancan de cero.
const WINDOW_MS = 15 * 60_000;
const MAX_PER_ACCOUNT = Number(process.env.LOGIN_MAX_FAILURES) || 8;
const MAX_PER_IP = MAX_PER_ACCOUNT * 10;
const failures = new Map(); // clave -> [timestamps]

const recent = (key, now) => {
  const list = (failures.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
};

export const loginRateLimit = (req, res, next) => {
  const now = Date.now();
  const ip = req.ip ?? 'desconocida';
  const email = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 150);
  const accountKey = `a:${ip}:${email}`;
  const ipKey = `i:${ip}`;

  const accountList = recent(accountKey, now);
  const ipList = recent(ipKey, now);
  if (accountList.length >= MAX_PER_ACCOUNT || ipList.length >= MAX_PER_IP) {
    const oldest = Math.min(...(accountList.length >= MAX_PER_ACCOUNT ? accountList : ipList));
    const minutes = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 60_000));
    res.setHeader('Retry-After', String(minutes * 60));
    return sendError(res, { statusCode: 429, code: 'DEMASIADOS_INTENTOS', message: `Demasiados intentos fallidos. Probá de nuevo en ${minutes} minuto${minutes === 1 ? '' : 's'}.` });
  }

  res.on('finish', () => {
    if (res.statusCode === 401) {
      failures.set(accountKey, [...recent(accountKey, Date.now()), Date.now()]);
      failures.set(ipKey, [...recent(ipKey, Date.now()), Date.now()]);
    } else if (res.statusCode === 200) {
      failures.delete(accountKey);
    }
  });
  return next();
};

// Solo para tests.
export const resetLoginRateLimit = () => failures.clear();
