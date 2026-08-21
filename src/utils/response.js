export const sendSuccess = (res, { message = null, data = null, statusCode = 200 } = {}) => {
  const payload = { success: true };

  if (message) payload.message = message;
  if (data !== null && data !== undefined) payload.data = data;

  return res.status(statusCode).json(payload);
};

export const sendError = (res, { message, statusCode = 500, errors = null } = {}) => {
  const payload = {
    success: false,
    message: message ?? 'Error interno del servidor',
  };

  if (errors) payload.errors = errors;

  return res.status(statusCode).json(payload);
};
