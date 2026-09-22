import { body, param, query } from 'express-validator';

export const listAttendanceValidator = [
  query('clienteId').optional().isInt({ min: 1 }),
  query('desde').optional().isISO8601(),
  query('hasta').optional().isISO8601(),
];

export const clientIdValidator = [param('clientId').isInt({ min: 1 }).withMessage('ID de cliente inválido')];

export const registerAttendanceValidator = [body('clienteId').isInt({ min: 1 }).withMessage('ID de cliente inválido')];
