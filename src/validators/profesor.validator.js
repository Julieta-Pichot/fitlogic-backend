import { body, param, query } from 'express-validator';

export const professorPasswordValidator = [
  body('currentPassword').notEmpty().withMessage('La contraseña actual es requerida'),
  body('newPassword')
    .isString()
    .isLength({ min: 8 })
    .withMessage('La nueva contraseña debe tener al menos 8 caracteres')
    .isLength({ max: 72 })
    .withMessage('La nueva contraseña no puede superar los 72 caracteres'),
];

export const notificationListValidator = [
  query('filtro').optional().isIn(['todas', 'no_leidas']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

export const notificationIdValidator = [param('id').isInt({ min: 1 })];
