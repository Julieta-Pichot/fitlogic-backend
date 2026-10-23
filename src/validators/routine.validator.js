import { body, param } from 'express-validator';

export const routineIdValidator = [param('id').isInt({ min: 1 })];

const routineBodyRules = [
  body('nombre').trim().notEmpty().withMessage('El nombre de la rutina es obligatorio').isLength({ max: 150 }),
  body('descripcion').optional({ nullable: true }).isString(),
  body('objetivo').optional({ nullable: true }).isString().isLength({ max: 150 }),
  body('nivelDificultad').optional({ nullable: true }).isString().isLength({ max: 50 }),
  body('duracionEstimada').optional({ nullable: true, values: 'falsy' }).isInt({ min: 1, max: 1440 }),
  body('activa').optional().isBoolean(),
  body('diasSemana').isArray({ min: 1 }).withMessage('Elegí al menos un día'),
  body('diasSemana.*').isInt({ min: 1, max: 7 }),
  body('ejercicios').isArray({ min: 1 }).withMessage('Agregá al menos un ejercicio'),
  body('ejercicios.*.ejercicioId').isInt({ min: 1 }),
];

export const createRoutineValidator = [body('clienteId').isInt({ min: 1 }).withMessage('Elegí un alumno'), ...routineBodyRules];
export const updateRoutineValidator = [...routineIdValidator, ...routineBodyRules];

export const createExerciseValidator = [
  body('nombre').trim().notEmpty().withMessage('El nombre del ejercicio es obligatorio').isLength({ max: 150 }),
  body('grupoMuscular').optional({ nullable: true }).isString(),
  body('tipo').optional({ nullable: true }).isString(),
  body('descripcion').optional({ nullable: true }).isString(),
  body('videoUrl').optional({ nullable: true }).isURL(),
];
