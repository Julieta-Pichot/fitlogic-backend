import { ValidationError } from '../errors/AppError.js';

export const STREAK_GOAL_MESSAGE = 'Los días de racha por semana deben ser un número entero entre 1 y 7';

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

// Objetivo de racha semanal. Sin valor => null (nunca se asume 3). Con valor debe ser un entero de 1 a 7:
// se rechazan 0, 8, decimales, texto y booleanos.
export const parseStreakGoal = (value) => {
  if (isBlank(value)) return null;
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^[1-7]$/.test(text)) throw new ValidationError(STREAK_GOAL_MESSAGE, null, 'RACHA_INVALIDA');
  return Number(text);
};

// Para express-validator: valida sin transformar (el servicio vuelve a parsear).
export const streakGoalRule = (value) => {
  parseStreakGoal(value);
  return true;
};
