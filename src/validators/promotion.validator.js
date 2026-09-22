import { body, param, query } from 'express-validator';

export const promotionIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('ID de promoción inválido'),
];

export const listPromotionsValidator = [
  query('search').optional().isString().trim(),
  query('activo').optional().isIn(['0', '1']).withMessage('Estado activo inválido'),
];

export const createPromotionValidator = [
  body('planId').isInt({ min: 1 }).withMessage('El plan de la promoción es obligatorio'),
  body('nombre').trim().notEmpty().withMessage('El nombre de la promoción es obligatorio').isLength({ max: 150 }),
  body('descripcion').optional().isString().withMessage('La descripción es inválida'),
  body('descuento').isFloat({ min: 0, max: 100 }).withMessage('El descuento debe estar entre 0 y 100'),
  body('fechaInicio').optional().isISO8601().withMessage('La fecha de inicio es inválida'),
  body('fechaFin').optional().isISO8601().withMessage('La fecha de fin es inválida'),
  body('activa').optional().isIn([0, 1]).withMessage('Estado activo inválido'),
];

export const updatePromotionValidator = [
  ...promotionIdValidator,
  body('planId').optional().isInt({ min: 1 }).withMessage('El plan de la promoción es inválido'),
  body('nombre').optional().trim().notEmpty().withMessage('El nombre de la promoción es obligatorio').isLength({ max: 150 }),
  body('descripcion').optional().isString().withMessage('La descripción es inválida'),
  body('descuento').optional().isFloat({ min: 0, max: 100 }).withMessage('El descuento debe estar entre 0 y 100'),
  body('fechaInicio').optional().isISO8601().withMessage('La fecha de inicio es inválida'),
  body('fechaFin').optional().isISO8601().withMessage('La fecha de fin es inválida'),
  body('activa').optional().isIn([0, 1]).withMessage('Estado activo inválido'),
];

export const togglePromotionActiveValidator = [
  ...promotionIdValidator,
  body('activo').isIn([0, 1]).withMessage('Estado activo inválido'),
];
