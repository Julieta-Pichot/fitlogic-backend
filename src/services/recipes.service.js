import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import { parseNutritionBody, serializeNutrition } from '../utils/nutrition.js';
import { cleanText, optionalText } from '../utils/text.js';
import { RECIPE_PHOTO_URL_PREFIX, removeRecipePhoto } from '../middlewares/upload.middleware.js';

const include = { categoriaReceta: true, ingredientes: true, pasos: { orderBy: { numeroPaso: 'asc' } }, profesor: { include: { usuario: true } } };

const professorInclude = {
  categoriaReceta: true,
  ingredientes: { orderBy: { id: 'asc' } },
  pasos: { orderBy: { numeroPaso: 'asc' } },
};

// Listado para clientes y staff (sin cambios).
export const listRecipes = async (userId, role) =>
  prisma.receta.findMany({
    where: role === 'PROFESOR' ? { profesor: { usuarioId: userId } } : {},
    include,
    orderBy: { id: 'desc' },
  });

export const listCategories = () =>
  prisma.categoriaReceta.findMany({ select: { id: true, nombre: true }, orderBy: { id: 'asc' } });

const toProfessorRecipe = (recipe) => ({
  id: recipe.id,
  nombre: recipe.nombre,
  descripcion: recipe.descripcion,
  categoria: { id: recipe.categoriaReceta.id, nombre: recipe.categoriaReceta.nombre },
  ...serializeNutrition(recipe),
  tiempoPreparacion: recipe.tiempoPreparacion,
  foto: recipe.foto,
  ingredientes: recipe.ingredientes.map((item) => ({ id: item.id, nombre: item.nombre, cantidad: item.cantidad, unidad: item.unidad })),
  pasos: recipe.pasos.map((item) => ({ numeroPaso: item.numeroPaso, descripcion: item.descripcion })),
});

const toOptionalInt = (value, label, max) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) {
    throw new ValidationError(`${label} debe ser un número entero entre 0 y ${max}`);
  }
  return number;
};

const parseRecipeBody = async (payload = {}) => {
  const nombre = cleanText(payload.nombre);
  if (!nombre) throw new ValidationError('El nombre de la receta es obligatorio');
  if (nombre.length > 150) throw new ValidationError('El nombre de la receta no puede superar los 150 caracteres');

  const categoriaRecetaId = Number(payload.categoriaRecetaId);
  if (!Number.isInteger(categoriaRecetaId) || categoriaRecetaId < 1) throw new ValidationError('Elegí una categoría');
  const category = await prisma.categoriaReceta.findUnique({ where: { id: categoriaRecetaId } });
  if (!category) throw new NotFoundError('Categoría de receta no encontrada');

  const ingredientes = (Array.isArray(payload.ingredientes) ? payload.ingredientes : [])
    .map((item) => ({
      nombre: cleanText(item?.nombre),
      cantidad: optionalText(item?.cantidad),
      unidad: optionalText(item?.unidad),
    }))
    .filter((item) => item.nombre);
  for (const item of ingredientes) {
    if (item.nombre.length > 150) throw new ValidationError('Un ingrediente supera los 150 caracteres');
    if (item.cantidad && item.cantidad.length > 50) throw new ValidationError('La cantidad de un ingrediente supera los 50 caracteres');
    if (item.unidad && item.unidad.length > 30) throw new ValidationError('La unidad de un ingrediente supera los 30 caracteres');
  }

  // numero_paso consecutivo desde 1 (hay UNIQUE(receta_id, numero_paso)).
  const pasos = (Array.isArray(payload.pasos) ? payload.pasos : [])
    .map((item) => optionalText(item?.descripcion))
    .filter(Boolean)
    .map((descripcion, index) => ({ numeroPaso: index + 1, descripcion }));

  return {
    categoriaRecetaId: category.id,
    nombre,
    descripcion: optionalText(payload.descripcion),
    ...parseNutritionBody(payload),
    tiempoPreparacion: toOptionalInt(payload.tiempoPreparacion, 'El tiempo de preparación', 10000),
    ingredientes,
    pasos,
  };
};

export const listRecipesForProfessor = async (profesorId) => {
  const recipes = await prisma.receta.findMany({
    where: { profesorId },
    include: professorInclude,
    orderBy: { id: 'desc' },
  });
  return recipes.map(toProfessorRecipe);
};

export const createRecipe = async (profesorId, payload = {}, file = null) => {
  const newPhoto = file ? `${RECIPE_PHOTO_URL_PREFIX}${file.filename}` : null;

  try {
    const data = await parseRecipeBody(payload);

    const recipe = await prisma.$transaction((tx) =>
      tx.receta.create({
        data: {
          profesorId,
          categoriaRecetaId: data.categoriaRecetaId,
          nombre: data.nombre,
          descripcion: data.descripcion,
          calorias: data.calorias,
          proteinasG: data.proteinasG,
          carbohidratosG: data.carbohidratosG,
          grasasG: data.grasasG,
          porciones: data.porciones,
          otroDatoNutricional: data.otroDatoNutricional,
          tiempoPreparacion: data.tiempoPreparacion,
          foto: newPhoto,
          ingredientes: { create: data.ingredientes },
          pasos: { create: data.pasos },
        },
        include: professorInclude,
      })
    );

    return toProfessorRecipe(recipe);
  } catch (error) {
    await removeRecipePhoto(newPhoto);
    throw error;
  }
};

export const updateRecipe = async (profesorId, recipeId, payload = {}, file = null) => {
  const newPhoto = file ? `${RECIPE_PHOTO_URL_PREFIX}${file.filename}` : null;

  try {
    const data = await parseRecipeBody(payload);
    let previousPhoto = null;

    const recipe = await prisma.$transaction(async (tx) => {
      const current = await tx.receta.findFirst({ where: { id: Number(recipeId), profesorId } });
      if (!current) throw new NotFoundError('Receta no encontrada');

      const removePhoto = Boolean(payload.quitarFoto);
      const foto = newPhoto ?? (removePhoto ? null : current.foto);
      if (foto !== current.foto) previousPhoto = current.foto;

      await tx.ingredienteReceta.deleteMany({ where: { recetaId: current.id } });
      await tx.pasoReceta.deleteMany({ where: { recetaId: current.id } });

      return tx.receta.update({
        where: { id: current.id },
        data: {
          categoriaRecetaId: data.categoriaRecetaId,
          nombre: data.nombre,
          descripcion: data.descripcion,
          calorias: data.calorias,
          proteinasG: data.proteinasG,
          carbohidratosG: data.carbohidratosG,
          grasasG: data.grasasG,
          porciones: data.porciones,
          otroDatoNutricional: data.otroDatoNutricional,
          tiempoPreparacion: data.tiempoPreparacion,
          foto,
          ingredientes: { create: data.ingredientes },
          pasos: { create: data.pasos },
        },
        include: professorInclude,
      });
    });

    // Recién con la transacción confirmada se borra la imagen anterior del servidor.
    await removeRecipePhoto(previousPhoto);
    return toProfessorRecipe(recipe);
  } catch (error) {
    await removeRecipePhoto(newPhoto);
    throw error;
  }
};

export const deleteRecipe = async (profesorId, recipeId) => {
  const foto = await prisma.$transaction(async (tx) => {
    const current = await tx.receta.findFirst({ where: { id: Number(recipeId), profesorId } });
    if (!current) throw new NotFoundError('Receta no encontrada');

    await tx.ingredienteReceta.deleteMany({ where: { recetaId: current.id } });
    await tx.pasoReceta.deleteMany({ where: { recetaId: current.id } });
    await tx.receta.delete({ where: { id: current.id } });

    return current.foto;
  });

  await removeRecipePhoto(foto);
  return { id: Number(recipeId) };
};
