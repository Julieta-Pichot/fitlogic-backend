import { body, param, query } from 'express-validator';

export const productIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('ID de producto inválido'),
];

export const listProductsValidator = [
  query('search').optional().isString().trim(),
  query('activo').optional().isIn(['0', '1']).withMessage('Estado activo inválido'),
];

export const createProductValidator = [
  body('nombre').trim().notEmpty().withMessage('El nombre del producto es obligatorio').isLength({ max: 150 }),
  body('precio').isFloat({ min: 0 }).withMessage('El precio del producto es inválido'),
  body('stock').isInt({ min: 0 }).withMessage('El stock del producto es inválido'),
  body('categoria').optional().isString().withMessage('La categoría es inválida'),
  body('descripcion').optional().isString().withMessage('La descripción es inválida'),
];

export const updateProductValidator = [
  ...productIdValidator,
  body('nombre').optional().trim().notEmpty().withMessage('El nombre del producto es obligatorio').isLength({ max: 150 }),
  body('precio').optional().isFloat({ min: 0 }).withMessage('El precio del producto es inválido'),
  body('stock').optional().isInt({ min: 0 }).withMessage('El stock del producto es inválido'),
  body('categoria').optional().isString().withMessage('La categoría es inválida'),
  body('descripcion').optional().isString().withMessage('La descripción es inválida'),
  body('activo').optional().isIn([0, 1]).withMessage('Estado activo inválido'),
];

export const toggleProductActiveValidator = [
  ...productIdValidator,
  body('activo').isIn([0, 1]).withMessage('Estado activo inválido'),
];
