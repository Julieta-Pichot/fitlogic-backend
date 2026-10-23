import { Router } from 'express';
import { authenticateToken, requireProfesorHabilitado } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import * as routinesController from '../controllers/routines.controller.js';
import { createExerciseValidator } from '../validators/routine.validator.js';

// Catálogo global de ejercicios: lo comparten todos los profesores.
const router = Router();
router.get('/', authenticateToken, ...requireProfesorHabilitado, routinesController.listExercises);
router.post('/', authenticateToken, ...requireProfesorHabilitado, createExerciseValidator, validateRequest, routinesController.createExercise);
export default router;
