// Todas las respuestas de error del API llevan { success:false, error, message }.
// `error` es un código estable (por defecto según el status) que el front puede usar.
export class AppError extends Error {
  constructor(message, statusCode = 500, errors = null, code = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado', code = 'NO_AUTORIZADO') {
    super(message, 401, null, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado', code = 'PROHIBIDO') {
    super(message, 403, null, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado', code = 'NO_ENCONTRADO') {
    super(message, 404, null, code);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Datos inválidos', errors = null, code = 'DATOS_INVALIDOS') {
    super(message, 400, errors, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflicto con el estado actual del recurso', code = 'CONFLICTO') {
    super(message, 409, null, code);
  }
}

// Choque de horario de sala o de profesor. `code` (SALA_OCUPADA / PROFESOR_OCUPADO) y
// `conflictos` viajan en el JSON de la respuesta 409.
export class ScheduleConflictError extends ConflictError {
  constructor(code, message, conflictos) {
    super(message, code);
    this.conflictos = conflictos;
  }
}
