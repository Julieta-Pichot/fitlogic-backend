import test from 'node:test';
import assert from 'node:assert/strict';
import { getGymParts, gymWallTimeToDate, formatGymTime } from '../src/utils/timezone.js';
import { getClassOccurrences, getWeeklySlots } from '../src/utils/class-schedule.js';

// Argentina es UTC-3 todo el año: 10:00 en Buenos Aires = 13:00 UTC.
const at = (iso) => new Date(iso);

test('getGymParts usa la zona horaria del gimnasio, no la del servidor', () => {
  const parts = getGymParts(at('2026-10-27T13:00:00Z')); // martes 27/10/2026
  assert.deepEqual(parts, { year: 2026, month: 10, day: 27, hour: 10, minute: 0, diaSemana: 2 });
});

test('cerca de la medianoche el día del gimnasio puede diferir del día UTC', () => {
  const parts = getGymParts(at('2026-10-28T02:30:00Z')); // todavía martes 23:30 en Argentina
  assert.equal(parts.diaSemana, 2);
  assert.equal(parts.hour, 23);
});

test('gymWallTimeToDate es la inversa de getGymParts', () => {
  const date = gymWallTimeToDate(2026, 10, 27, 9, 45);
  assert.equal(date.toISOString(), '2026-10-27T12:45:00.000Z');
  assert.equal(formatGymTime(date), '09:45');
});

test('clase no recurrente: una sola ocurrencia, en su fecha y hora exactas', () => {
  const clase = { recurrente: false, fechaHora: at('2026-10-27T13:00:00Z'), dias: [] };
  assert.equal(getClassOccurrences(clase, at('2026-10-27T12:00:00Z'), at('2026-10-27T14:00:00Z')).length, 1);
  assert.equal(getClassOccurrences(clase, at('2026-10-28T12:00:00Z'), at('2026-10-28T14:00:00Z')).length, 0);
});

test('clase recurrente: solo ocurre los días de clase_dia, a la hora de fecha_hora', () => {
  // Martes y jueves a las 10:00 (hora Argentina), desde el 6/10/2026.
  const clase = { recurrente: true, fechaHora: at('2026-10-06T13:00:00Z'), dias: [{ diaSemana: 2 }, { diaSemana: 4 }] };

  const tuesday = getClassOccurrences(clase, at('2026-10-27T12:40:00Z'), at('2026-10-27T13:05:00Z'));
  assert.deepEqual(tuesday.map((d) => d.toISOString()), ['2026-10-27T13:00:00.000Z']);

  const wednesday = getClassOccurrences(clase, at('2026-10-28T12:40:00Z'), at('2026-10-28T13:05:00Z'));
  assert.equal(wednesday.length, 0);
});

test('clase recurrente: no hay ocurrencias antes de la fecha de inicio', () => {
  const clase = { recurrente: true, fechaHora: at('2026-11-03T13:00:00Z'), dias: [{ diaSemana: 2 }] };
  assert.equal(getClassOccurrences(clase, at('2026-10-27T12:40:00Z'), at('2026-10-27T13:05:00Z')).length, 0);
});

test('clase recurrente a las 00:10: el aviso de la noche anterior se ubica en el día correcto', () => {
  // Miércoles 00:10 en Argentina = miércoles 03:10 UTC.
  const clase = { recurrente: true, fechaHora: at('2026-10-07T03:10:00Z'), dias: [{ diaSemana: 3 }] };
  const found = getClassOccurrences(clase, at('2026-10-28T02:50:00Z'), at('2026-10-28T03:15:00Z'));
  assert.deepEqual(found.map((d) => d.toISOString()), ['2026-10-28T03:10:00.000Z']);
});

test('getWeeklySlots incluye el día de la primera clase y los días de repetición', () => {
  const clase = { recurrente: true, fechaHora: at('2026-10-27T13:00:00Z'), dias: [{ diaSemana: 4 }] };
  assert.deepEqual(getWeeklySlots(clase).sort(), ['2-10:00', '4-10:00']);
  assert.deepEqual(getWeeklySlots({ ...clase, recurrente: false }), ['2-10:00']);
});
