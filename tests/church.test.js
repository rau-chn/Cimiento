import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateChurchStreak,
  scheduledServicesForDate,
  attendedAllScheduledServices
} from '../js/streaks.js';

// Horario con un domingo de dos cultos, igual al usado en streaks.test.js
const schedule = {
  0: [
    { id: 'sun-am', time: '10:00', label: 'Mañana', enabled: true },
    { id: 'sun-pm', time: '19:00', label: 'Noche',  enabled: true }
  ],
  1: [], 2: [], 3: [], 4: [], 5: [], 6: []
};

const att = (date, serviceId, status = 'attended') =>
  ({ id: `${date}|${serviceId}`, date, serviceId, status });

const SUNDAY = '2026-10-25'; // domingo conocido

// ---------------------------------------------------------------------------
// Requisito 8: domingo con dos cultos, solo uno asistido → racha = 0
// ---------------------------------------------------------------------------

test('req-8: domingo dos cultos — solo mañana asistido → racha 0', () => {
  const attendance = [att(SUNDAY, 'sun-am')]; // falta sun-pm
  assert.equal(calculateChurchStreak(SUNDAY, schedule, attendance), 0);
});

test('req-8: domingo dos cultos — solo noche asistida → racha 0', () => {
  const attendance = [att(SUNDAY, 'sun-pm')]; // falta sun-am
  assert.equal(calculateChurchStreak(SUNDAY, schedule, attendance), 0);
});

test('req-8: attendedAllScheduledServices confirma false cuando falta un culto', () => {
  const attendance = [att(SUNDAY, 'sun-am')];
  assert.equal(attendedAllScheduledServices(SUNDAY, schedule, attendance), false);
});

// ---------------------------------------------------------------------------
// Requisito 9: domingo con dos cultos, ninguno asistido → racha = 0
// ---------------------------------------------------------------------------

test('req-9: domingo dos cultos — ninguno asistido → racha 0', () => {
  assert.equal(calculateChurchStreak(SUNDAY, schedule, []), 0);
});

test('req-9: attendedAllScheduledServices confirma false cuando no hay registros', () => {
  assert.equal(attendedAllScheduledServices(SUNDAY, schedule, []), false);
});

// ---------------------------------------------------------------------------
// Confirmación req-10: día sin culto — scheduledServicesForDate devuelve []
// y attendedAllScheduledServices devuelve null (no aplicable)
// ---------------------------------------------------------------------------

test('req-10: lunes sin culto — scheduledServicesForDate devuelve lista vacía', () => {
  assert.equal(scheduledServicesForDate('2026-10-26', schedule).length, 0);
});

test('req-10: lunes sin culto — attendedAllScheduledServices devuelve null', () => {
  assert.equal(attendedAllScheduledServices('2026-10-26', schedule, []), null);
});

// ---------------------------------------------------------------------------
// Servicio con enabled:false no cuenta como programado
// ---------------------------------------------------------------------------

test('servicio con enabled:false se ignora para rachas', () => {
  const scheduleWithDisabled = {
    0: [
      { id: 'sun-am', time: '10:00', label: 'Mañana', enabled: true },
      { id: 'sun-pm', time: '19:00', label: 'Noche',  enabled: false } // deshabilitado
    ],
    1: [], 2: [], 3: [], 4: [], 5: [], 6: []
  };
  // Solo hay un culto aplicable (sun-am); asistir a él cumple el día.
  const attendance = [att(SUNDAY, 'sun-am')];
  assert.equal(attendedAllScheduledServices(SUNDAY, scheduleWithDisabled, attendance), true);
});
