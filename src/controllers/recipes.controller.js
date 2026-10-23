import * as recipesService from '../services/recipes.service.js';
import { sendSuccess } from '../utils/response.js';

export const listRecipes = async (req, res) =>
  sendSuccess(res, { data: await recipesService.listRecipes(req.user.id, req.user.rol.nombre) });

export const listCategories = async (_req, res) =>
  sendSuccess(res, { data: await recipesService.listCategories() });

export const listProfessorRecipes = async (req, res) =>
  sendSuccess(res, { data: await recipesService.listRecipesForProfessor(req.profesor.id) });

export const createRecipe = async (req, res) =>
  sendSuccess(res, {
    message: 'Receta creada correctamente',
    data: await recipesService.createRecipe(req.profesor.id, req.body, req.file),
    statusCode: 201,
  });

export const updateRecipe = async (req, res) =>
  sendSuccess(res, {
    message: 'Receta actualizada correctamente',
    data: await recipesService.updateRecipe(req.profesor.id, req.params.id, req.body, req.file),
  });

export const deleteRecipe = async (req, res) =>
  sendSuccess(res, { message: 'Receta eliminada correctamente', data: await recipesService.deleteRecipe(req.profesor.id, req.params.id) });
