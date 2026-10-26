// Red de seguridad: ninguna respuesta de la API puede incluir hashes de contraseña, aunque un servicio devuelva el
// usuario completo. Recorre el resultado (objetos, arrays y fechas) quitando las claves sensibles.
const SENSITIVE_KEYS = new Set(['passwordHash', 'password_hash']);
export const stripSensitive = (value) => {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (value && typeof value === 'object' && !(value instanceof Date) && typeof value.toJSON !== 'function') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE_KEYS.has(key)).map(([key, item]) => [key, stripSensitive(item)]));
  }
  return value;
};

export const sendSuccess = (res, { message = null, data = null, statusCode = 200 } = {}) => {
  const payload = { success: true };

  if (message) payload.message = message;
  if (data !== null && data !== undefined) payload.data = stripSensitive(data);

  return res.status(statusCode).json(payload);
};

export const sendError = (res, { message, statusCode = 500, errors = null, extra = null, code = null } = {}) => {
  const payload = {
    success: false,
    message: message ?? 'Error interno del servidor',
  };

  if (code) payload.error = code;
  if (errors) payload.errors = errors;
  if (extra) Object.assign(payload, extra);

  return res.status(statusCode).json(payload);
};
