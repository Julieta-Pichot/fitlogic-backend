import { Router } from 'express';
import { authenticateToken, requireCliente, requireProfesor } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as routinesController from '../controllers/routines.controller.js';
import { createExerciseValidator, createRoutineValidator, routineListValidator } from '../validators/routine.validator.js';

const router = Router();
router.get('/me', authenticateToken, requireCliente, routinesController.listMyRoutines);
router.get('/', authenticateToken, requireProfesor, routineListValidator, validateRequest, routinesController.listRoutines);
router.post('/', authenticateToken, requireProfesor, createRoutineValidator, validateRequest, routinesController.createRoutine);
router.get('/exercises', authenticateToken, routinesController.listExercises);
router.post('/exercises', authenticateToken, requireProfesor, createExerciseValidator, validateRequest, routinesController.createExercise);
export default router;
