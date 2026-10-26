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

const DAY_MS = 86_400_000;

// "Hoy" en el gimnasio como medianoche UTC del día calendario (comparable con columnas DATE de Prisma).
export const gymTodayMs = (now = new Date()) => {
  const { year, month, day } = getGymParts(now);
  return Date.UTC(year, month - 1, day);
};

// Columnas @db.Date llegan como medianoche UTC: se comparan por día calendario, sin zonas.
export const dbDateMs = (date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
export const msToIsoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
export const diffDays = (fromMs, toMs) => Math.round((toMs - fromMs) / DAY_MS);

// Instante de inicio y fin (exclusivo) del día calendario del gimnasio que contiene `date`.
export const gymDayRange = (date) => {
  const { year, month, day } = getGymParts(date);
  const start = gymWallTimeToDate(year, month, day, 0, 0);
  const next = shiftCalendarDay({ year, month, day }, 1);
  return { start, end: gymWallTimeToDate(next.year, next.month, next.day, 0, 0) };
};

// Clave 'YYYY-MM-DD' del día del gimnasio de un instante.
export const gymDateKey = (date) => {
  const { year, month, day } = getGymParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// Instante de inicio y fin (exclusivo) del mes calendario del gimnasio que contiene `date`.
export const gymMonthRange = (date) => {
  const { year, month } = getGymParts(date);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return { start: gymWallTimeToDate(year, month, 1, 0, 0), end: gymWallTimeToDate(next.year, next.month, 1, 0, 0) };
};
