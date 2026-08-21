import { validationResult } from 'express-validator';
import { ValidationError } from '../errors/AppError.js';

export const validateRequest = (req, _res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return next(new ValidationError('Datos inválidos', errors.array()));
  }

  return next();
};
