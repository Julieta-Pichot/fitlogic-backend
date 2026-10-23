// Zona horaria del gimnasio. Se usa de forma explícita: nunca se depende de la
// zona del servidor ni de la del navegador.
export const GYM_TIMEZONE = 'America/Argentina/Buenos_Aires';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: GYM_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
});

const WEEKDAY_TO_ISO = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Fecha/hora "de pared" del gimnasio para un instante. diaSemana: 1=Lunes ... 7=Domingo.
export const getGymParts = (date) => {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    diaSemana: WEEKDAY_TO_ISO[parts.weekday],
  };
};

// Instante (UTC) que corresponde a una fecha/hora de pared del gimnasio.
export const gymWallTimeToDate = (year, month, day, hour, minute) => {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const wall = getGymParts(new Date(guess));
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  return new Date(guess - (wallAsUtc - guess));
};

// Día calendario (y/m/d + día de semana ISO) desplazado `offset` días respecto de y/m/d.
export const shiftCalendarDay = ({ year, month, day }, offset) => {
  const shifted = new Date(Date.UTC(year, month - 1, day + offset));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    diaSemana: ((shifted.getUTCDay() + 6) % 7) + 1,
  };
};

export const formatGymTime = (date) => {
  const { hour, minute } = getGymParts(date);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};
