import { body, param } from 'express-validator';

export const clientIdValidator = [param('clientId').isInt({ min: 1 }).withMessage('ID de cliente inválido')];
export const quotaIdValidator = [param('id').isInt({ min: 1 }).withMessage('ID de cuota inválido')];
export const createQuotaValidator = [
  body('planId').isInt({ min: 1 }).withMessage('El plan es obligatorio'),
  body('clientId').optional().isInt({ min: 1 }).withMessage('ID de cliente inválido'),
];
export const confirmPaymentValidator = [
  ...quotaIdValidator,
  body('metodoPagoId').isInt({ min: 1 }).withMessage('El método de pago es obligatorio'),
  body('monto').optional({ nullable: true }).isFloat({ gt: 0, max: 99999999.99 }).withMessage('El monto debe ser mayor a 0'),
  body('referenciaExterna').optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
];
