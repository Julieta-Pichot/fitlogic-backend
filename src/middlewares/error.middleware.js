import { AppError, ScheduleConflictError } from '../errors/AppError.js';
import { sendError } from '../utils/response.js';

export const notFoundHandler = (_req, res) => {
  return sendError(res, {
    message: 'Ruta no encontrada',
    statusCode: 404,
    code: 'RUTA_NO_ENCONTRADA',
  });
};

export const errorHandler = (error, _req, res, _next) => {
  if (error instanceof ScheduleConflictError) {
    return sendError(res, {
      message: error.message,
      statusCode: error.statusCode,
      extra: { conflictos: error.conflictos },
      code: error.code,
    });
  }

  if (error instanceof AppError) {
    return sendError(res, {
      message: error.message,
      statusCode: error.statusCode,
      errors: error.errors,
      code: error.code,
    });
  }

  // JSON mal formado o cuerpo demasiado grande: es un error del cliente, no del servidor.
  if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
    return sendError(res, {
      message: error.type === 'entity.too.large' ? 'El cuerpo de la solicitud es demasiado grande' : 'El cuerpo de la solicitud no es un JSON válido',
      statusCode: error.type === 'entity.too.large' ? 413 : 400,
      code: 'CUERPO_INVALIDO',
    });
  }

  if (error?.name === 'MulterError') {
    return sendError(res, {
      message: error.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el máximo de 5 MB' : 'Archivo inválido',
      statusCode: 400,
    });
  }

  if (error?.name === 'PrismaClientKnownRequestError' && error.code === 'P2002') {
    return sendError(res, {
      message: 'El registro ya existe',
      statusCode: 400,
    });
  }

  console.error('Error no controlado:', error);

  // P2021/P2022: tabla o columna inexistente = la BD no tiene aplicadas las migraciones.
  if (error?.name === 'PrismaClientKnownRequestError' && ['P2021', 'P2022'].includes(error.code)) {
    return sendError(res, {
      message: 'La base de datos no está actualizada. Pedí al administrador que aplique las migraciones.',
      statusCode: 500,
    });
  }

  return sendError(res, {
    message: 'Error interno del servidor',
    statusCode: 500,
    code: 'ERROR_INTERNO',
  });
};
