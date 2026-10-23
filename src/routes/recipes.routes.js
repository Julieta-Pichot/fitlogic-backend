import { Router } from 'express';
import { authenticateToken, requireCliente, requireProfesorHabilitado, requireStaff } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { recipeUpload, validateRecipeImage } from '../middlewares/upload.middleware.js';
import { discardUploadOnError, parseMultipartPayload } from '../middlewares/multipart-payload.middleware.js';
import * as recipesController from '../controllers/recipes.controller.js';
import { createRecipeValidator, recipeIdValidator, updateRecipeValidator } from '../validators/recipe.validator.js';

const router = Router();
// authenticateToken y el rol van antes que multer: no se aceptan archivos de usuarios sin permiso.
const withPhoto = [recipeUpload.single('foto'), validateRecipeImage, parseMultipartPayload];

router.get('/', authenticateToken, requireStaff, recipesController.listRecipes);
router.get('/available', authenticateToken, requireCliente, recipesController.listRecipes);
router.post('/', authenticateToken, ...requireProfesorHabilitado, ...withPhoto, createRecipeValidator, validateRequest, recipesController.createRecipe, discardUploadOnError);
router.put('/:id', authenticateToken, ...requireProfesorHabilitado, ...withPhoto, updateRecipeValidator, validateRequest, recipesController.updateRecipe, discardUploadOnError);
router.delete('/:id', authenticateToken, ...requireProfesorHabilitado, recipeIdValidator, validateRequest, recipesController.deleteRecipe);
export default router;
