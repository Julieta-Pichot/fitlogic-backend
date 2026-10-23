import { Router } from 'express';
import { authenticateToken, requireProfesorHabilitado } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { recipeUpload, validateRecipeImage } from '../middlewares/upload.middleware.js';
import { discardUploadOnError, parseMultipartPayload } from '../middlewares/multipart-payload.middleware.js';
import * as profesorController from '../controllers/profesor.controller.js';
import * as routinesController from '../controllers/routines.controller.js';
import * as classesController from '../controllers/classes.controller.js';
import * as recipesController from '../controllers/recipes.controller.js';
import { createRoutineValidator, routineIdValidator, updateRoutineValidator } from '../validators/routine.validator.js';
import { classAvailabilityValidator, classIdValidator, createClassValidator, updateClassValidator } from '../validators/class.validator.js';
import { createRecipeValidator, recipeIdValidator, updateRecipeValidator } from '../validators/recipe.validator.js';
import {
  notificationIdValidator,
  notificationListValidator,
  professorPasswordValidator,
} from '../validators/profesor.validator.js';

const router = Router();

// Todo lo de este router exige token válido, rol PROFESOR y cuenta HABILITADA.
// El profesor siempre se resuelve desde el usuario autenticado (req.profesor).
router.use(authenticateToken, ...requireProfesorHabilitado);

// Alumnos y perfil
router.get('/clientes', profesorController.listClients);
router.get('/perfil', profesorController.getProfile);
router.put('/perfil/password', professorPasswordValidator, validateRequest, profesorController.changePassword);

// Rutinas (solo las del profesor autenticado)
router.get('/rutinas', routinesController.listRoutines);
router.get('/rutinas/:id', routineIdValidator, validateRequest, routinesController.getRoutine);
router.post('/rutinas', createRoutineValidator, validateRequest, routinesController.createRoutine);
router.put('/rutinas/:id', updateRoutineValidator, validateRequest, routinesController.updateRoutine);

// Clases
router.get('/clases', classesController.listProfessorClasses);
router.post('/clases/disponibilidad', classAvailabilityValidator, validateRequest, classesController.checkAvailability);
router.post('/clases', createClassValidator, validateRequest, classesController.createClass);
router.put('/clases/:id', updateClassValidator, validateRequest, classesController.updateClass);
router.delete('/clases/:id', classIdValidator, validateRequest, classesController.deleteClass);

// Recetas (multipart: campo `payload` con el JSON y campo `foto` con la imagen)
const withPhoto = [recipeUpload.single('foto'), validateRecipeImage, parseMultipartPayload];
router.get('/categorias-receta', recipesController.listCategories);
router.get('/recetas', recipesController.listProfessorRecipes);
router.post('/recetas', ...withPhoto, createRecipeValidator, validateRequest, recipesController.createRecipe, discardUploadOnError);
router.put('/recetas/:id', ...withPhoto, updateRecipeValidator, validateRequest, recipesController.updateRecipe, discardUploadOnError);
router.delete('/recetas/:id', recipeIdValidator, validateRequest, recipesController.deleteRecipe);

// Notificaciones del usuario autenticado
router.get('/notificaciones', notificationListValidator, validateRequest, profesorController.listNotifications);
router.patch('/notificaciones/leidas', profesorController.markAllNotificationsRead);
router.patch('/notificaciones/:id/leida', notificationIdValidator, validateRequest, profesorController.markNotificationRead);

export default router;
