import { body, param, query } from 'express-validator';

export const clientIdValidator = [param('id').isInt({ min: 1 }).withMessage('ID de cliente inválido')];

export const listClientsValidator = [
  query('search').optional().isString().trim(),
  query('estadoClienteId').optional().isInt({ min: 1 }).withMessage('Estado de cliente inválido'),
];

export const createClientValidator = [
  body('nombre')
    .trim()
    .notEmpty()
    .withMessage('El nombre es obligatorio')
    .bail()
    .isLength({ max: 100 })
    .withMessage('El nombre no puede superar los 100 caracteres'),
  body('apellido')
    .trim()
    .notEmpty()
    .withMessage('El apellido es obligatorio')
    .bail()
    .isLength({ max: 100 })
    .withMessage('El apellido no puede superar los 100 caracteres'),
  // Sin normalizeEmail(): removía los puntos de las casillas gmail y el cliente
  // ya no podía loguearse con el mail tal cual lo escribió (el login solo hace lowercase).
  body('email')
    .trim()
    .notEmpty()
    .withMessage('El email es obligatorio')
    .bail()
    .isEmail()
    .withMessage('El email no es válido')
    .bail()
    .isLength({ max: 150 })
    .withMessage('El email no puede superar los 150 caracteres')
    .customSanitizer((value) => value.toLowerCase()),
  body('password')
    .notEmpty()
    .withMessage('La contraseña inicial es obligatoria')
    .bail()
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('telefono')
    .trim()
    .notEmpty()
    .withMessage('El teléfono es obligatorio')
    .bail()
    .isLength({ max: 50 })
    .withMessage('El teléfono no puede superar los 50 caracteres'),
  body('objetivoEntrenamiento')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage('El objetivo no puede superar los 255 caracteres'),
  body('planId')
    .notEmpty()
    .withMessage('Seleccioná un plan')
    .bail()
    .isInt({ min: 1 })
    .withMessage('El plan es inválido')
    .toInt(),
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
