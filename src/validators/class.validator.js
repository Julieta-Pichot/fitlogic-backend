import { body, param } from 'express-validator';
export const classIdValidator = [param('id').isInt({ min: 1 })];
export const createClassValidator = [body('nombre').trim().notEmpty().isLength({ max: 100 }), body('cupoMaximo').isInt({ min: 1 }), body('fechaHora').isISO8601(), body('sala').optional({ nullable: true }).isString()];
export const rateClassValidator = [...classIdValidator, body('puntuacion').isInt({ min: 1, max: 5 }), body('comentario').optional({ nullable: true }).isString().isLength({ max: 500 })];
