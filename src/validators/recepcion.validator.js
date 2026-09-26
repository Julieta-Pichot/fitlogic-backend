import { body, query } from 'express-validator';

export const recentPaymentsValidator = [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100'),
];

export const updateProfileValidator = [
  body('nombre').optional().trim().notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 100 }),
  body('apellido').optional().trim().notEmpty().withMessage('El apellido es obligatorio').isLength({ max: 100 }),
  body('email')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('El email es obligatorio')
    .bail()
    .isEmail()
    .withMessage('El email no es válido')
    .isLength({ max: 150 }),
  body('telefono').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
];
