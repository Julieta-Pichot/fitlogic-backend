import * as recipesService from '../services/recipes.service.js';
import { sendSuccess } from '../utils/response.js';
export const listRecipes = async (req, res, next) => { try { return sendSuccess(res, { data: await recipesService.listRecipes(req.user.id, req.user.rol.nombre) }); } catch (error) { return next(error); } };
export const createRecipe = async (req, res, next) => { try { return sendSuccess(res, { message: 'Receta creada correctamente', data: await recipesService.createRecipe(req.user.id, req.body), statusCode: 201 }); } catch (error) { return next(error); } };
