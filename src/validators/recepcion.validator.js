import { body, query } from 'express-validator';
import { optionalPhoneRule } from '../utils/phone.js';

export const recentPaymentsValidator = [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100'),
];

// Cobro en caja: cliente + (cuota pendiente | plan) + método. El monto NO se envía: lo calcula el backend.
export const registerPaymentValidator = [
  body('clienteId').isInt({ min: 1 }).withMessage('Elegí un cliente').toInt(),
  body('cuotaId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Cuota inválida').toInt(),
  body('planId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Plan inválido').toInt(),
  body('metodoPagoId').isInt({ min: 1 }).withMessage('Elegí un método de pago').toInt(),
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
  body('telefono').optional({ nullable: true }).isString().trim().isLength({ max: 50 }).bail().custom(optionalPhoneRule),
];
