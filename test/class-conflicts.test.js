import test from 'node:test';
import assert from 'node:assert/strict';
import { findConflicts, normalizeRoom, overlapBetween, toSchedule } from '../src/utils/class-conflicts.js';

// 2030-01-08 es martes. Las horas se escriben en hora Argentina (UTC-3).
const at = (date, time) => new Date(`${date}T${time}:00-03:00`);
const clase = (date, time, duracionMinutos, extra = {}) => ({
  id: 1, nombre: 'X', sala: 'Sala 1', profesorId: 1, recurrente: false, dias: [], duracionMinutos, fechaHora: at(date, time), ...extra,
});
const overlap = (a, b) => overlapBetween(toSchedule(a), toSchedule(b));

test('misma sala, mismo día y hora => conflicto', () => {
  assert.ok(overlap(clase('2030-01-08', '10:00', 60), clase('2030-01-08', '10:00', 60)));
});

test('solapamiento parcial 10:00-11:00 vs 10:30-11:30 => conflicto', () => {
  assert.ok(overlap(clase('2030-01-08', '10:00', 60), clase('2030-01-08', '10:30', 60)));
});

test('horarios contiguos (fin 11:00 / inicio 11:00) => permitido', () => {
  assert.equal(overlap(clase('2030-01-08', '10:00', 60), clase('2030-01-08', '11:00', 60)), null);
  assert.equal(overlap(clase('2030-01-08', '11:00', 60), clase('2030-01-08', '10:00', 60)), null);
});

test('una clase dentro de otra más larga => conflicto', () => {
  assert.ok(overlap(clase('2030-01-08', '09:00', 180), clase('2030-01-08', '10:00', 30)));
});

test('única vs única en fechas distintas => permitido', () => {
  assert.equal(overlap(clase('2030-01-08', '10:00', 60), clase('2030-01-15', '10:00', 60)), null);
});

test('la sala se compara sin mayúsculas, acentos ni espacios sobrantes', () => {
  assert.equal(normalizeRoom(' sala  1 '), normalizeRoom('Sala 1'));
  assert.equal(normalizeRoom('SALA ÚNICA'), normalizeRoom('sala unica'));
  assert.notEqual(normalizeRoom('Sala 1'), normalizeRoom('Sala 2'));
});

test('única vs recurrente: coincide el día de semana (Buenos Aires) y la fecha es posterior al inicio', () => {
  const recurrente = clase('2030-01-01', '10:00', 60, { recurrente: true, dias: [{ diaSemana: 2 }, { diaSemana: 4 }] });
  assert.deepEqual(overlap(clase('2030-01-08', '10:00', 60), recurrente), { dias: [2], fecha: '08/01/2030' }); // martes
  assert.equal(overlap(clase('2030-01-09', '10:00', 60), recurrente), null); // miércoles: no es día de la recurrente
  assert.equal(overlap(clase('2029-12-25', '10:00', 60), recurrente), null); // martes anterior a su vigencia
  assert.equal(overlap(clase('2030-01-08', '11:00', 60), recurrente), null); // contiguo
});

test('recurrente vs recurrente: se necesita al menos un día compartido', () => {
  const a = clase('2030-01-01', '10:00', 60, { recurrente: true, dias: [{ diaSemana: 2 }, { diaSemana: 4 }] });
  const compartida = clase('2030-01-02', '10:30', 60, { recurrente: true, dias: [{ diaSemana: 4 }, { diaSemana: 5 }] });
  const sinCompartir = clase('2030-01-02', '10:30', 60, { recurrente: true, dias: [{ diaSemana: 5 }, { diaSemana: 6 }] });
  assert.deepEqual(overlap(a, compartida)?.dias, [4]);
  assert.equal(overlap(a, sinCompartir), null);
});

test('en las recurrentes el día base (el de fecha_hora) siempre se incluye', () => {
  // fecha_hora es martes aunque clase_dia solo tenga jueves
  const rec = clase('2030-01-08', '10:00', 60, { recurrente: true, dias: [{ diaSemana: 4 }] });
  assert.deepEqual([...toSchedule(rec).days].sort(), [2, 4]);
});

test('el día de la semana se calcula en Buenos Aires, no en UTC (cerca de medianoche)', () => {
  // Martes 23:30 en Argentina = miércoles 02:30 UTC.
  const lateTuesday = clase('2030-01-08', '23:30', 20);
  assert.equal(toSchedule(lateTuesday).dow, 2);
  assert.equal(lateTuesday.fechaHora.getUTCDay(), 3);
  const recurrenteMartes = clase('2030-01-01', '23:00', 50, { recurrente: true, dias: [{ diaSemana: 2 }] });
  assert.ok(overlap(lateTuesday, recurrenteMartes));
  const recurrenteMiercoles = clase('2030-01-02', '23:00', 50, { recurrente: true, dias: [{ diaSemana: 3 }] });
  assert.equal(overlap(lateTuesday, recurrenteMiercoles), null);
});

test('findConflicts filtra por sala y devuelve datos para el mensaje', () => {
  const candidate = clase('2030-01-08', '10:00', 60);
  const others = [
    { ...clase('2030-01-08', '10:30', 60), id: 7, nombre: 'Spinning', profesorNombre: 'Ana Pérez' },
    { ...clase('2030-01-08', '10:30', 60), id: 8, sala: 'Sala 2' },
  ];
  const found = findConflicts(candidate, others, (other) => normalizeRoom(other.sala) === normalizeRoom('SALA 1'));
  assert.equal(found.length, 1);
  assert.deepEqual(
    { id: found[0].claseId, prof: found[0].profesor, ini: found[0].horaInicio, fin: found[0].horaFin, dias: found[0].dias },
    { id: 7, prof: 'Ana Pérez', ini: '10:30', fin: '11:30', dias: [2] }
  );
});
