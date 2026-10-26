import { body, param, query } from 'express-validator';

export const idParam = [param('id').isInt({ min: 1 })];

export const dayQuery = [query('fecha').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Fecha inválida (YYYY-MM-DD)')];

export const enrollValidator = [
  ...idParam,
  body('fecha').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Fecha inválida (YYYY-MM-DD)'),
];

export const pageQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

export const checkoutValidator = [body('plan_id').isInt({ min: 1 }).withMessage('Elegí un plan')];

// Misma política que el componente compartido de cambio de contraseña y que el login: mínimo 6.
export const clientPasswordValidator = [
  body('currentPassword').notEmpty().withMessage('La contraseña actual es requerida'),
  body('newPassword').isString().isLength({ min: 6, max: 72 }).withMessage('La nueva contraseña debe tener entre 6 y 72 caracteres'),
];

// Filtros del listado de recetas: se validan tipos y rangos (el filtrado en sí lo hace el servicio).
export const recipesQuery = [
  query('categoria').optional().isString().trim().isLength({ max: 50 }).withMessage('Categoría inválida'),
  query('q').optional().isString().trim().isLength({ max: 100 }).withMessage('La búsqueda no puede superar los 100 caracteres'),
  query('caloriasMax').optional({ values: 'falsy' }).isInt({ min: 0, max: 10000 }).withMessage('Las calorías máximas deben ser un entero entre 0 y 10000'),
  query('proteinasMin').optional({ values: 'falsy' }).isFloat({ min: 0, max: 999.9 }).withMessage('Las proteínas mínimas deben estar entre 0 y 999,9 g'),
  query('orden').optional().isIn(['nombre', 'calorias_asc', 'proteinas_desc']).withMessage('Orden inválido'),
];
