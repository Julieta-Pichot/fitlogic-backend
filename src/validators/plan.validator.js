import { body, param, query } from 'express-validator';

export const planIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('ID de plan inválido'),
];

export const listPlansValidator = [
  query('search').optional().isString().trim(),
  query('activo').optional().isIn(['0', '1']).withMessage('Estado activo inválido'),
];

export const createPlanValidator = [
  body('nombre').trim().notEmpty().withMessage('El nombre del plan es obligatorio').isLength({ max: 100 }),
  body('duracionDias').isInt({ min: 1 }).withMessage('La duración del plan es inválida'),
  body('precio').isFloat({ min: 0 }).withMessage('El precio del plan es inválido'),
];

export const updatePlanValidator = [
  ...planIdValidator,
  body('nombre').optional().trim().notEmpty().withMessage('El nombre del plan es obligatorio').isLength({ max: 100 }),
  body('duracionDias').optional().isInt({ min: 1 }).withMessage('La duración del plan es inválida'),
  body('precio').optional().isFloat({ min: 0 }).withMessage('El precio del plan es inválido'),
  body('activo').optional().isIn([0, 1]).withMessage('Estado activo inválido'),
];

export const togglePlanActiveValidator = [
  ...planIdValidator,
  body('activo').isIn([0, 1]).withMessage('Estado activo inválido'),
];
