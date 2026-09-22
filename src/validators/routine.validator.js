import { body, query } from 'express-validator';

export const routineListValidator = [query('clienteId').optional().isInt({ min: 1 })];
export const createRoutineValidator = [
  body('clienteId').isInt({ min: 1 }),
  body('nombre').trim().notEmpty().isLength({ max: 150 }),
  body('diasSemana').isArray({ min: 1 }),
  body('diasSemana.*').isInt({ min: 1, max: 7 }),
  body('ejercicios').optional().isArray(),
];
export const createExerciseValidator = [
  body('nombre').trim().notEmpty().isLength({ max: 150 }),
  body('grupoMuscular').optional({ nullable: true }).isString(),
  body('tipo').optional({ nullable: true }).isString(),
  body('descripcion').optional({ nullable: true }).isString(),
  body('videoUrl').optional({ nullable: true }).isURL(),
];
