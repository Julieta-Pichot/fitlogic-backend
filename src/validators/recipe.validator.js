import { body, param } from 'express-validator';

export const recipeIdValidator = [param('id').isInt({ min: 1 })];

const recipeBodyRules = [
  body('nombre').trim().notEmpty().withMessage('El nombre de la receta es obligatorio').isLength({ max: 150 }),
  body('categoriaRecetaId').isInt({ min: 1 }).withMessage('Elegí una categoría'),
  body('descripcion').optional({ nullable: true }).isString(),
  // La información nutricional completa se valida en el servicio (utils/nutrition.js), que devuelve el mensaje exacto.
  body('otroDatoNutricional').optional({ nullable: true }).isString().isLength({ max: 150 }),
  body('tiempoPreparacion').optional({ nullable: true, values: 'falsy' }).isInt({ min: 0, max: 10000 }),
  body('ingredientes').optional().isArray(),
  body('pasos').optional().isArray(),
];

export const createRecipeValidator = recipeBodyRules;
export const updateRecipeValidator = [...recipeIdValidator, ...recipeBodyRules];
