import { ValidationError } from '../errors/AppError.js';

// Límites de la información nutricional de una receta (valores POR PORCIÓN).
export const NUTRITION_LIMITS = { calorias: 10000, macroG: 999.9, porciones: 100, otroDato: 150 };

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const toNumber = (value, label) => {
  const text = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const number = typeof text === 'number' ? text : /^\d+(\.\d+)?$/.test(String(text)) ? Number(text) : NaN;
  if (!Number.isFinite(number)) throw new ValidationError(`${label} debe ser un número`, null, 'NUTRICION_INVALIDA');
  return number;
};

export const parseCalories = (value) => {
  if (isBlank(value)) return null;
  const number = toNumber(value, 'Las calorías');
  if (!Number.isInteger(number) || number < 0 || number > NUTRITION_LIMITS.calorias) {
    throw new ValidationError(`Las calorías deben ser un número entero entre 0 y ${NUTRITION_LIMITS.calorias}`, null, 'NUTRICION_INVALIDA');
  }
  return number;
};

// Gramos con un decimal (DECIMAL(6,1)): se redondea a 0,1 g.
export const parseGrams = (value, label) => {
  if (isBlank(value)) return null;
  const number = toNumber(value, label);
  if (number < 0 || number > NUTRITION_LIMITS.macroG) {
    throw new ValidationError(`${label} debe estar entre 0 y ${String(NUTRITION_LIMITS.macroG).replace('.', ',')} g`, null, 'NUTRICION_INVALIDA');
  }
  return Math.round(number * 10) / 10;
};

export const parsePortions = (value) => {
  if (isBlank(value)) return null;
  const number = toNumber(value, 'Las porciones');
  if (!Number.isInteger(number) || number < 1 || number > NUTRITION_LIMITS.porciones) {
    throw new ValidationError(`Las porciones deben ser un número entero entre 1 y ${NUTRITION_LIMITS.porciones}`, null, 'NUTRICION_INVALIDA');
  }
  return number;
};

export const parseOtherNutrition = (value) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length > NUTRITION_LIMITS.otroDato) {
    throw new ValidationError(`El otro dato nutricional no puede superar los ${NUTRITION_LIMITS.otroDato} caracteres`, null, 'NUTRICION_INVALIDA');
  }
  return text;
};

// Campos nutricionales validados listos para guardar en `receta`.
export const parseNutritionBody = (payload = {}) => ({
  calorias: parseCalories(payload.calorias),
  proteinasG: parseGrams(payload.proteinasG, 'Las proteínas'),
  carbohidratosG: parseGrams(payload.carbohidratosG, 'Los carbohidratos'),
  grasasG: parseGrams(payload.grasasG, 'Las grasas'),
  porciones: parsePortions(payload.porciones),
  otroDatoNutricional: parseOtherNutrition(payload.otroDatoNutricional),
});

const num = (value) => (value === null || value === undefined ? null : Number(value));

// Campos nutricionales de una receta de la BD tal como viajan en la API (null = "No informado", nunca 0).
export const serializeNutrition = (recipe) => ({
  calorias: recipe.calorias ?? null,
  proteinasG: num(recipe.proteinasG),
  carbohidratosG: num(recipe.carbohidratosG),
  grasasG: num(recipe.grasasG),
  porciones: recipe.porciones ?? null,
  otroDatoNutricional: recipe.otroDatoNutricional ?? null,
});

// Distribución de calorías por macro (4/4/9 kcal por gramo), en % del total calculado por macros.
// Si falta algún macro no hay gráfico (null): no se inventan valores.
export const macroDistribution = ({ proteinasG, carbohidratosG, grasasG }) => {
  if (proteinasG === null || carbohidratosG === null || grasasG === null) return null;
  const kcal = { proteinas: proteinasG * 4, carbohidratos: carbohidratosG * 4, grasas: grasasG * 9 };
  const total = kcal.proteinas + kcal.carbohidratos + kcal.grasas;
  if (total <= 0) return null;
  const pct = (value) => Math.round((value / total) * 1000) / 10;
  return { proteinas: pct(kcal.proteinas), carbohidratos: pct(kcal.carbohidratos), grasas: pct(kcal.grasas), kcalCalculadas: Math.round(total) };
};
