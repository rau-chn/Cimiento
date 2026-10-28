import test from 'node:test';
import assert from 'node:assert/strict';
import { limaToday, addDays, dayOfWeek, minutesBetweenEpoch } from '../js/dates.js';

// ---------------------------------------------------------------------------
// limaToday — cambio de día en Lima (UTC-5)
// ---------------------------------------------------------------------------

test('limaToday: un instante antes de medianoche Lima devuelve el día anterior', () => {
  // 2026-10-28T04:59:59Z = 2026-10-27T23:59:59 Lima
  const instant = new Date('2026-10-28T04:59:59Z');
  assert.equal(limaToday(instant), '2026-10-27');
});

test('limaToday: exactamente medianoche Lima devuelve el día nuevo', () => {
  // 2026-10-28T05:00:00Z = 2026-10-28T00:00:00 Lima
  const instant = new Date('2026-10-28T05:00:00Z');
  assert.equal(limaToday(instant), '2026-10-28');
});

test('limaToday: mediodía UTC sigue siendo el mismo día Lima', () => {
  // 2026-10-28T12:00:00Z = 2026-10-28T07:00:00 Lima
  const instant = new Date('2026-10-28T12:00:00Z');
  assert.equal(limaToday(instant), '2026-10-28');
});

test('limaToday: cambio de año — 2026-01-01T04:59:59Z aún es 2025-12-31 en Lima', () => {
  const instant = new Date('2026-01-01T04:59:59Z');
  assert.equal(limaToday(instant), '2025-12-31');
});

test('limaToday: cambio de año — 2026-01-01T05:00:00Z ya es 2026-01-01 en Lima', () => {
  const instant = new Date('2026-01-01T05:00:00Z');
  assert.equal(limaToday(instant), '2026-01-01');
});

// ---------------------------------------------------------------------------
// addDays — aritmética de fechas segura
// ---------------------------------------------------------------------------

test('addDays: día siguiente simple', () => {
  assert.equal(addDays('2026-10-28', 1), '2026-10-29');
});

test('addDays: día anterior simple', () => {
  assert.equal(addDays('2026-10-28', -1), '2026-10-27');
});

test('addDays: cruce de fin de mes octubre → noviembre', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
});

test('addDays: cruce de inicio de año (hacia atrás)', () => {
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('addDays: febrero bisiesto — día anterior al 29', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('addDays: febrero bisiesto — día posterior al 29', () => {
  assert.equal(addDays('2028-02-29', 1), '2028-03-01');
});

test('addDays: año bisiesto cruce diciembre → enero', () => {
  assert.equal(addDays('2028-12-31', 1), '2029-01-01');
});

test('addDays: +0 devuelve la misma fecha', () => {
  assert.equal(addDays('2026-06-15', 0), '2026-06-15');
});

// ---------------------------------------------------------------------------
// dayOfWeek — verificación de días concretos conocidos
// ---------------------------------------------------------------------------

test('dayOfWeek: 2026-10-25 es domingo (0)', () => {
  assert.equal(dayOfWeek('2026-10-25'), 0);
});

test('dayOfWeek: 2026-10-26 es lunes (1)', () => {
  assert.equal(dayOfWeek('2026-10-26'), 1);
});

test('dayOfWeek: 2026-10-27 es martes (2)', () => {
  assert.equal(dayOfWeek('2026-10-27'), 2);
});

test('dayOfWeek: 2026-10-28 es miércoles (3)', () => {
  assert.equal(dayOfWeek('2026-10-28'), 3);
});

test('dayOfWeek: 2026-10-31 es sábado (6)', () => {
  assert.equal(dayOfWeek('2026-10-31'), 6);
});

// ---------------------------------------------------------------------------
// minutesBetweenEpoch — cronómetro resistente al bloqueo de pantalla
// ---------------------------------------------------------------------------

test('minutesBetweenEpoch: 90 minutos de diferencia devuelve 90', () => {
  const start = 1_000_000_000_000;
  const end   = start + 90 * 60 * 1000;
  assert.equal(minutesBetweenEpoch(start, end), 90);
});

test('minutesBetweenEpoch: segundos parciales se truncan hacia abajo', () => {
  const start = 1_000_000_000_000;
  const end   = start + 89 * 60 * 1000 + 59_999; // 89min 59.999s
  assert.equal(minutesBetweenEpoch(start, end), 89);
});

test('minutesBetweenEpoch: diferencia negativa devuelve 0 (nunca negativo)', () => {
  assert.equal(minutesBetweenEpoch(2_000, 1_000), 0);
});
