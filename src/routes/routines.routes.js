import { Router } from 'express';
import { authenticateToken, requireCliente, requireProfesorHabilitado } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as routinesController from '../controllers/routines.controller.js';
import { createExerciseValidator, createRoutineValidator, routineIdValidator, updateRoutineValidator } from '../validators/routine.validator.js';

const router = Router();
router.get('/me', authenticateToken, requireCliente, routinesController.listMyRoutines);
router.get('/', authenticateToken, ...requireProfesorHabilitado, routinesController.listRoutines);
router.get('/exercises', authenticateToken, ...requireProfesorHabilitado, routinesController.listExercises);
router.post('/exercises', authenticateToken, ...requireProfesorHabilitado, createExerciseValidator, validateRequest, routinesController.createExercise);
router.get('/:id', authenticateToken, ...requireProfesorHabilitado, routineIdValidator, validateRequest, routinesController.getRoutine);
router.post('/', authenticateToken, ...requireProfesorHabilitado, createRoutineValidator, validateRequest, routinesController.createRoutine);
router.put('/:id', authenticateToken, ...requireProfesorHabilitado, updateRoutineValidator, validateRequest, routinesController.updateRoutine);
export default router;
