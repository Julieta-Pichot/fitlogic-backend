import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import { cleanText } from '../utils/text.js';
import { macroDistribution, parseCalories, parseGrams, serializeNutrition } from '../utils/nutrition.js';
import { getGymParts, gymTodayMs } from '../utils/timezone.js';

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 30;

const routineInclude = {
  dias: true,
  profesor: { select: { usuario: { select: { nombre: true, apellido: true } } } },
  ejercicios: { include: { ejercicio: true }, orderBy: [{ ordenVisual: 'asc' }, { id: 'asc' }] },
};

const toRoutine = (routine) => ({
  id: routine.id,
  nombre: routine.nombre,
  descripcion: routine.descripcion,
  objetivo: routine.objetivo,
  nivelDificultad: routine.nivelDificultad,
  frecuenciaSemanal: routine.frecuenciaSemanal,
  duracionEstimada: routine.duracionEstimada,
  activa: routine.activa,
  fechaAsignacion: routine.fechaAsignacion.toISOString().slice(0, 10),
  profesor: `${routine.profesor.usuario.nombre} ${routine.profesor.usuario.apellido}`.trim(),
  diasSemana: routine.dias.map((item) => item.diaSemana).sort((a, b) => a - b),
  cantidadEjercicios: routine.ejercicios.length,
  ejercicios: routine.ejercicios.map((item, index) => ({
    id: item.id,
    orden: item.ordenVisual ?? index + 1,
    nombre: item.ejercicio.nombre,
    grupoMuscular: item.ejercicio.grupoMuscular,
    series: item.series,
    repeticiones: item.repeticiones,
    descansoSegundos: item.descansoSegundos,
    observaciones: item.observaciones,
    videoUrl: item.ejercicio.videoUrl,
  })),
});

// Rutinas ACTIVAS del cliente, cada una completa (el front las muestra como tarjetas).
export const listActiveRoutines = async (cliente) => {
  const routines = await prisma.rutina.findMany({
    where: { clienteId: cliente.id, activa: true },
    include: routineInclude,
    orderBy: [{ fechaAsignacion: 'desc' }, { id: 'desc' }],
  });
  return routines.map(toRoutine);
};

// Historial: rutinas asignadas en los últimos 30 días (activas o no), más recientes primero.
export const listRoutineHistory = async (cliente, now = new Date()) => {
  const since = new Date(gymTodayMs(now) - HISTORY_DAYS * DAY_MS);
  const routines = await prisma.rutina.findMany({
    where: { clienteId: cliente.id, fechaAsignacion: { gte: since } },
    include: routineInclude,
    orderBy: [{ fechaAsignacion: 'desc' }, { id: 'desc' }],
  });
  return routines.map(toRoutine);
};

export const getRoutine = async (cliente, routineId) => {
  const routine = await prisma.rutina.findFirst({
    where: { id: Number(routineId), clienteId: cliente.id },
    include: routineInclude,
  });
  if (!routine) throw new NotFoundError('Rutina no encontrada');
  return toRoutine(routine);
};

// Rutinas activas cuyo rutina_dia incluye el día de la semana de hoy (hora del gimnasio).
export const listTodayRoutines = async (cliente, now = new Date()) => {
  const { diaSemana } = getGymParts(now);
  const routines = await prisma.rutina.findMany({
    where: { clienteId: cliente.id, activa: true, dias: { some: { diaSemana } } },
    include: routineInclude,
    orderBy: { id: 'asc' },
  });
  return routines.map(toRoutine);
};

// ---------------------------------------------------------------------------
// Recetas (de todos los profesores)
// ---------------------------------------------------------------------------

export const listRecipeCategories = () =>
  prisma.categoriaReceta.findMany({ select: { id: true, nombre: true }, orderBy: { id: 'asc' } });

const recipeBase = {
  categoriaReceta: true,
  profesor: { select: { usuario: { select: { nombre: true, apellido: true } } } },
};

const toRecipe = (recipe) => ({
  id: recipe.id,
  nombre: recipe.nombre,
  descripcion: recipe.descripcion,
  categoria: { id: recipe.categoriaReceta.id, nombre: recipe.categoriaReceta.nombre },
  ...serializeNutrition(recipe),
  tiempoPreparacion: recipe.tiempoPreparacion,
  foto: recipe.foto,
  profesor: `${recipe.profesor.usuario.nombre} ${recipe.profesor.usuario.apellido}`.trim(),
});

const RECIPE_ORDERS = ['nombre', 'calorias_asc', 'proteinas_desc'];

// Valores NULL ("No informado") van siempre al final en los órdenes numéricos.
const nullsLast = (field, direction) => (a, b) => {
  const x = a[field];
  const y = b[field];
  if (x === null && y === null) return a.nombre.localeCompare(b.nombre, 'es');
  if (x === null) return 1;
  if (y === null) return -1;
  return direction * (x - y) || a.nombre.localeCompare(b.nombre, 'es');
};

// Todos los filtros y el orden se resuelven acá (no en el front): categoría (nombre o "todas"), búsqueda por nombre,
// calorías máximas, proteínas mínimas y orden. Con caloriasMax / proteinasMin las recetas sin ese dato no coinciden.
export const listRecipes = async ({ categoria, q, caloriasMax, proteinasMin, orden } = {}) => {
  const name = String(categoria ?? '').trim().toUpperCase();
  const where = {};
  if (name && name !== 'TODAS') {
    const category = await prisma.categoriaReceta.findUnique({ where: { nombre: name } });
    if (!category) throw new ValidationError('Categoría de receta inválida', null, 'CATEGORIA_INVALIDA');
    where.categoriaRecetaId = category.id;
  }

  const search = cleanText(q);
  if (search) where.nombre = { contains: search };
  if (caloriasMax !== undefined && caloriasMax !== '') where.calorias = { lte: parseCalories(caloriasMax) };
  if (proteinasMin !== undefined && proteinasMin !== '') where.proteinasG = { gte: parseGrams(proteinasMin, 'Las proteínas mínimas') };
  const order = orden ? String(orden) : 'recientes';
  if (order !== 'recientes' && !RECIPE_ORDERS.includes(order)) throw new ValidationError('Orden de recetas inválido', null, 'ORDEN_INVALIDO');

  const recipes = (await prisma.receta.findMany({ where, include: recipeBase, orderBy: { id: 'desc' } })).map(toRecipe);
  if (order === 'nombre') recipes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (order === 'calorias_asc') recipes.sort(nullsLast('calorias', 1));
  if (order === 'proteinas_desc') recipes.sort(nullsLast('proteinasG', -1));
  return recipes;
};

export const getRecipe = async (recipeId) => {
  const recipe = await prisma.receta.findUnique({
    where: { id: Number(recipeId) },
    include: {
      ...recipeBase,
      ingredientes: { orderBy: { id: 'asc' } },
      pasos: { orderBy: { numeroPaso: 'asc' } },
    },
  });
  if (!recipe) throw new NotFoundError('Receta no encontrada');

  return {
    ...toRecipe(recipe),
    distribucionMacros: macroDistribution(serializeNutrition(recipe)),
    ingredientes: recipe.ingredientes.map((item) => ({ id: item.id, nombre: item.nombre, cantidad: item.cantidad, unidad: item.unidad })),
    pasos: recipe.pasos.map((item) => ({ numeroPaso: item.numeroPaso, descripcion: item.descripcion })),
  };
};
