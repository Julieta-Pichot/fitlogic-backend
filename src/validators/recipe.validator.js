import { body } from 'express-validator';
export const createRecipeValidator = [body('nombre').trim().notEmpty().isLength({ max: 150 }), body('categoriaRecetaId').isInt({ min: 1 }), body('ingredientes').optional().isArray(), body('pasos').optional().isArray()];
