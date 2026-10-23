import { body, param } from 'express-validator';

export const classIdValidator = [param('id').isInt({ min: 1 })];

const classBodyRules = [
  body('nombre').trim().notEmpty().withMessage('El nombre de la clase es obligatorio').isLength({ max: 100 }),
  body('cupoMaximo').isInt({ min: 1, max: 1000 }).withMessage('El cupo máximo debe ser un entero mayor a 0'),
  body('fechaHora').isISO8601().withMessage('La fecha y hora no son válidas'),
  body('sala').trim().notEmpty().withMessage('La sala es obligatoria').isLength({ max: 100 }),
  body('horaFin').optional({ nullable: true, values: 'falsy' }).matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('La hora de fin no es válida (HH:mm)'),
  body('recurrente').optional().isBoolean(),
  body('diasSemana').optional().isArray(),
  body('diasSemana.*').isInt({ min: 1, max: 7 }),
];

export const createClassValidator = classBodyRules;
export const updateClassValidator = [...classIdValidator, ...classBodyRules];
export const rateClassValidator = [...classIdValidator, body('puntuacion').isInt({ min: 1, max: 5 }), body('comentario').optional({ nullable: true }).isString().isLength({ max: 500 })];

export const classAvailabilityValidator = [
  body('sala').trim().notEmpty().withMessage('La sala es obligatoria'),
  body('fechaHora').isISO8601().withMessage('La fecha y hora no son válidas'),
  body('horaFin').optional({ nullable: true, values: 'falsy' }).matches(/^([01]\d|2[0-3]):[0-5]\d$/),
  body('recurrente').optional().isBoolean(),
  body('diasSemana').optional().isArray(),
  body('diasSemana.*').isInt({ min: 1, max: 7 }),
  body('claseId').optional({ nullable: true }).isInt({ min: 1 }),
];
