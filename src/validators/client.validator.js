import { body, param, query } from 'express-validator';

export const clientIdValidator = [param('id').isInt({ min: 1 }).withMessage('ID de cliente inválido')];

export const listClientsValidator = [
  query('search').optional().isString().trim(),
  query('estadoClienteId').optional().isInt({ min: 1 }).withMessage('Estado de cliente inválido'),
];

export const createClientValidator = [
  body('nombre').trim().notEmpty().isLength({ max: 100 }),
  body('apellido').trim().notEmpty().isLength({ max: 100 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('telefono').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('objetivoEntrenamiento').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
];

export const updateClientValidator = [
  ...clientIdValidator,
  body('nombre').optional().trim().notEmpty().isLength({ max: 100 }),
  body('apellido').optional().trim().notEmpty().isLength({ max: 100 }),
  body('telefono').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('objetivoEntrenamiento').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
  body('estadoClienteId').optional().isInt({ min: 1 }),
];

export const clearanceValidator = [
  ...clientIdValidator,
  body('archivo').trim().notEmpty().isLength({ max: 255 }),
  body('fechaCarga').optional().isISO8601(),
];

export const statusValidator = [
  ...clientIdValidator,
  body('estado').isIn(['HABILITADO', 'INHABILITADO_PAGO', 'INHABILITADO_BAJA']),
];
