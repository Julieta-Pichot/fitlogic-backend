import { normalizeExerciseName } from './text.js';
import { getGymParts } from './timezone.js';

const DAY_NAMES = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo' };
export const dayNameLower = (day) => DAY_NAMES[day];

const pad = (value) => String(value).padStart(2, '0');
export const minutesToTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

// Sala sin distinguir mayúsculas, acentos ni espacios sobrantes: " sala  1 " = "Sala 1".
export const normalizeRoom = (room) => normalizeExerciseName(room);

// Convierte una clase (registro de BD o candidata) en su horario semanal, siempre en hora del
// gimnasio (America/Argentina/Buenos_Aires): el día de la semana NO se calcula en UTC.
//   - única:     una fecha concreta (dateKey) y su día de la semana.
//   - recurrente: conjunto de días; rige desde la fecha de fechaHora en adelante. El día base
//                 (el de fechaHora) siempre forma parte de los días.
export const toSchedule = (clase) => {
  const parts = getGymParts(clase.fechaHora);
  const start = parts.hour * 60 + parts.minute;
  const days = clase.recurrente
    ? new Set([parts.diaSemana, ...(clase.dias ?? []).map((item) => (typeof item === 'number' ? item : item.diaSemana))])
    : new Set();

  return {
    recurrente: Boolean(clase.recurrente),
    dow: parts.diaSemana,
    dateKey: parts.year * 10000 + parts.month * 100 + parts.day,
    dateLabel: `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`,
    days,
    start,
    end: start + (clase.duracionMinutos ?? 60),
  };
};

// Días (y fecha, si interviene una clase única) en que A y B coinciden con horarios solapados.
// Solapamiento: inicioA < finB Y inicioB < finA (terminar a las 11:00 y empezar a las 11:00 NO choca).
export const overlapBetween = (a, b) => {
  if (!(a.start < b.end && b.start < a.end)) return null;

  if (!a.recurrente && !b.recurrente) {
    return a.dateKey === b.dateKey ? { dias: [a.dow], fecha: a.dateLabel } : null;
  }

  if (a.recurrente && b.recurrente) {
    const shared = [...a.days].filter((day) => b.days.has(day)).sort((x, y) => x - y);
    // Ambas rigen "desde su fecha de inicio en adelante" (sin fin), por lo que sus vigencias siempre se cruzan.
    return shared.length > 0 ? { dias: shared, fecha: null } : null;
  }

  const [single, recurring] = a.recurrente ? [b, a] : [a, b];
  if (!recurring.days.has(single.dow) || single.dateKey < recurring.dateKey) return null;
  return { dias: [single.dow], fecha: single.recurrente ? null : single.dateLabel };
};

// Compara una clase candidata contra otras y devuelve los choques.
// `sameRoom(other)` / `sameProfessor(other)` deciden qué tipo de choque se busca.
export const findConflicts = (candidate, others, predicate) => {
  const mine = toSchedule(candidate);
  const found = [];

  for (const other of others) {
    if (!predicate(other)) continue;
    const overlap = overlapBetween(mine, toSchedule(other));
    if (!overlap) continue;

    const schedule = toSchedule(other);
    found.push({
      claseId: other.id,
      nombre: other.nombre,
      profesor: other.profesorNombre ?? null,
      profesorId: other.profesorId,
      sala: other.sala,
      dias: overlap.dias,
      fecha: overlap.fecha,
      horaInicio: minutesToTime(schedule.start),
      horaFin: minutesToTime(schedule.end),
    });
  }

  return found;
};

const describe = (conflict, withProfessor = true) => {
  const when = conflict.fecha
    ? `el ${conflict.fecha} (${dayNameLower(conflict.dias[0])})`
    : `el ${conflict.dias.map(dayNameLower).join(', ')}`;
  return `${when} de ${conflict.horaInicio} a ${conflict.horaFin} por la clase '${conflict.nombre}'${
    withProfessor && conflict.profesor ? ` a cargo de ${conflict.profesor}` : ''
  }`;
};

export const roomConflictMessage = (sala, conflicts) =>
  `La sala ${sala} ya está ocupada ${conflicts.map((conflict) => describe(conflict)).join('; ')}.`;

export const professorConflictMessage = (conflicts) =>
  `Ya tenés otra clase en ese horario: ${conflicts
    .map((conflict) => `${describe(conflict, false)} en ${conflict.sala ?? 'otra sala'}`)
    .join('; ')}.`;
