// Normaliza un nombre para compararlo: sin mayúsculas, acentos ni espacios extra.
export const normalizeExerciseName = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Colapsa espacios repetidos y recorta, conservando mayúsculas y acentos.
export const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const optionalText = (value) => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};
