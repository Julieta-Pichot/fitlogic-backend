import { body } from 'express-validator';

// PUT /config/gym: todos los campos son opcionales, pero los que lleguen se validan (antes se guardaba cualquier texto).
export const updateGymValidator = [
  body('nombre').optional().isString().trim().notEmpty().withMessage('El nombre del gimnasio es obligatorio').isLength({ max: 100 }).withMessage('El nombre no puede superar los 100 caracteres'),
  body('direccion').optional({ nullable: true }).isString().trim().isLength({ max: 200 }).withMessage('La dirección no puede superar los 200 caracteres'),
  body('telefono').optional({ nullable: true }).isString().trim().isLength({ max: 50 }).withMessage('El teléfono no puede superar los 50 caracteres'),
  body('emailSoporte')
    .optional({ nullable: true })
    .isString()
    .trim()
    .custom((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    .withMessage('El email de soporte no es válido')
    .isLength({ max: 150 })
    .withMessage('El email no puede superar los 150 caracteres'),
  body('identidadVisual').optional({ nullable: true }).isString().trim().isLength({ max: 255 }).withMessage('La identidad visual no puede superar los 255 caracteres'),
];
