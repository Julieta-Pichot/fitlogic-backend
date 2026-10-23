import { getGymParts, gymWallTimeToDate, shiftCalendarDay } from './timezone.js';

// Ocurrencias (instantes de inicio) de una clase que caen en [from, to].
// - No recurrente: solo `fechaHora`.
// - Recurrente: cada día de `clase.dias` (1=Lunes ... 7=Domingo) a la hora de `fechaHora`
//   (hora del gimnasio), desde la fecha de `fechaHora` en adelante.
export const getClassOccurrences = (clase, from, to) => {
  if (!clase.recurrente) {
    return clase.fechaHora >= from && clase.fechaHora <= to ? [clase.fechaHora] : [];
  }

  const days = new Set((clase.dias ?? []).map((item) => item.diaSemana));
  if (days.size === 0) return [];

  const { hour, minute } = getGymParts(clase.fechaHora);
  const first = getGymParts(from);
  const occurrences = [];

  // Un día de margen a cada lado cubre clases cerca de la medianoche.
  const spanDays = Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 2;
  for (let offset = -1; offset <= spanDays; offset += 1) {
    const day = shiftCalendarDay(first, offset);
    if (!days.has(day.diaSemana)) continue;

    const start = gymWallTimeToDate(day.year, day.month, day.day, hour, minute);
    if (start >= from && start <= to && start >= clase.fechaHora) occurrences.push(start);
  }

  return occurrences;
};

// "diaSemana-HH:mm" de cada horario semanal de una clase, para detectar choques de horario.
export const getWeeklySlots = (clase) => {
  const { hour, minute, diaSemana } = getGymParts(clase.fechaHora);
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const days = clase.recurrente
    ? [...new Set([diaSemana, ...(clase.dias ?? []).map((item) => item.diaSemana)])]
    : [diaSemana];

  return days.map((day) => `${day}-${time}`);
};
