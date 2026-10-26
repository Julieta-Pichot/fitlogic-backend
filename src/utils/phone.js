// Teléfono: solo dígitos, espacios, + - ( ) y punto; al menos 6 dígitos y hasta 50 caracteres. Vacío = sin teléfono (donde es opcional).
export const PHONE_MESSAGE = 'El teléfono solo puede tener números, espacios y los símbolos + - ( ) y debe tener al menos 6 dígitos';

export const isValidPhone = (value) => {
  const text = String(value ?? '').trim();
  return text.length <= 50 && /^[0-9+()\-.\s]+$/.test(text) && (text.match(/\d/g) ?? []).length >= 6;
};

// Para express-validator (.custom): permite vacío/NULL (opcional) o un teléfono válido.
export const optionalPhoneRule = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return true;
  if (!isValidPhone(value)) throw new Error(PHONE_MESSAGE);
  return true;
};
