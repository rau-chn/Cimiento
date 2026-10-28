import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateReadingStreak, calculatePrayerStreak, calculateChurchStreak,
  attendedAllScheduledServices, scheduledServicesForDate
} from '../js/streaks.js';

const schedule = {
  0: [
    { id: 'sun-am', time: '10:00', label: 'Mañana', enabled: true },
    { id: 'sun-pm', time: '19:00', label: 'Noche', enabled: true }
  ],
  1: [],
  2: [{ id: 'tue', time: '19:00', label: 'Culto', enabled: true }],
  3: [{ id: 'wed', time: '19:00', label: 'Culto', enabled: true }],
  4: [{ id: 'thu', time: '19:00', label: 'Culto', enabled: true }],
  5: [{ id: 'fri', time: '19:00', label: 'Culto', enabled: true }],
  6: [{ id: 'sat', time: '19:00', label: 'Culto', enabled: true }]
};

const att = (date, serviceId, status = 'attended') => ({ id: `${date}|${serviceId}`, date, serviceId, status });

test('cambio de día: hoy pendiente no rompe, pero ayer pendiente sí rompe al pasar el día', () => {
  const readings = [
    { date: '2026-10-26', book: 'Juan', chapter: 1 },
    { date: '2026-10-27', book: 'Juan', chapter: 2 }
  ];
  assert.equal(calculateReadingStreak('2026-10-28', readings), 2); // hoy aún puede cumplirse
  assert.equal(calculateReadingStreak('2026-10-29', readings), 0); // el 28 quedó faltante
});

test('registrar un día pasado reconstruye la racha', () => {
  const readings = [
    { date: '2026-10-26', book: 'Juan', chapter: 1 },
    { date: '2026-10-28', book: 'Juan', chapter: 3 }
  ];
  assert.equal(calculateReadingStreak('2026-10-28', readings), 1);
  readings.push({ date: '2026-10-27', book: 'Juan', chapter: 2 });
  assert.equal(calculateReadingStreak('2026-10-28', readings), 3);
});

test('domingo con dos cultos: solo cumple si asiste a ambos', () => {
  const sunday = '2026-10-25';
  assert.equal(attendedAllScheduledServices(sunday, schedule, [att(sunday,'sun-am'), att(sunday,'sun-pm')]), true);
  assert.equal(attendedAllScheduledServices(sunday, schedule, [att(sunday,'sun-am')]), false);
  assert.equal(attendedAllScheduledServices(sunday, schedule, []), false);
});

test('lunes sin culto no cuenta ni rompe la racha', () => {
  const attendance = [
    att('2026-10-24','sat'),
    att('2026-10-25','sun-am'), att('2026-10-25','sun-pm'),
    att('2026-10-27','tue')
  ];
  assert.equal(scheduledServicesForDate('2026-10-26', schedule).length, 0);
  assert.equal(calculateChurchStreak('2026-10-27', schedule, attendance), 3);
});

test('cambio del horario modifica la aplicabilidad sin casos especiales', () => {
  const changed = structuredClone(schedule);
  changed[1] = [{ id: 'mon', time: '19:00', label: 'Culto lunes', enabled: true }];
  const attendance = [
    att('2026-10-25','sun-am'), att('2026-10-25','sun-pm'),
    att('2026-10-27','tue')
  ];
  assert.equal(calculateChurchStreak('2026-10-27', schedule, attendance), 2); // dom + mar; lunes se omite
  assert.equal(calculateChurchStreak('2026-10-27', changed, attendance), 1); // lunes ahora era aplicable y faltó
});

test('editar posteriormente un registro recalcula la racha', () => {
  const sunday = '2026-10-25';
  const attendance = [att(sunday,'sun-am'), att(sunday,'sun-pm','missed')];
  assert.equal(calculateChurchStreak('2026-10-25', schedule, attendance), 0);
  attendance[1] = att(sunday,'sun-pm','attended');
  assert.equal(calculateChurchStreak('2026-10-25', schedule, attendance), 1);
});

test('oración rápida o profunda cumplen el día; un No no anula una sesión profunda', () => {
  const days = [{ date:'2026-10-27', quick:true }, { date:'2026-10-28', quick:false }];
  const sessions = [{ id:'s', date:'2026-10-28', completed:true, minutes:12 }];
  assert.equal(calculatePrayerStreak('2026-10-28', days, sessions), 2);
});
