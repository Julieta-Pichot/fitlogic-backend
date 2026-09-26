import { AppError } from '../errors/AppError.js';
import { sendError } from '../utils/response.js';

export const notFoundHandler = (_req, res) => {
  return sendError(res, {
    message: 'Ruta no encontrada',
    statusCode: 404,
  });
};

export const errorHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    return sendError(res, {
      message: error.message,
      statusCode: error.statusCode,
      errors: error.errors,
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

  return sendError(res, {
    message: 'Error interno del servidor',
    statusCode: 500,
  });
};
