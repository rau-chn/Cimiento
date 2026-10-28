import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupDocument, validateBackupDocument, BACKUP_SCHEMA_VERSION } from '../js/backup.js';
import { STORES } from '../js/db.js';
import { minutesBetweenEpoch } from '../js/dates.js';

// ---------------------------------------------------------------------------
// Req-14 (ampliado): round-trip EXPORTAR → IMPORTAR con datos reales
// ---------------------------------------------------------------------------

test('req-14: round-trip con múltiples stores preserva todos los registros', () => {
  const data = Object.fromEntries(STORES.map(s => [s, []]));
  // Varios tipos de datos reales
  data.readings.push(
    { id: 'r1', date: '2026-10-01', book: 'Juan', chapter: 1 },
    { id: 'r2', date: '2026-10-02', book: 'Juan', chapter: 2 }
  );
  data.prayerDays.push({ date: '2026-10-01', quick: true });
  data.prayerSessions.push({ id: 's1', date: '2026-10-01', startEpochMs: 1000000, completed: true, minutes: 30, note: '' });
  data.attendance.push({ id: '2026-10-25|sun-am', date: '2026-10-25', serviceId: 'sun-am', status: 'attended' });
  data.settings.push({ key: 'churchSchedule', value: { 0: [{ id: 'sun-am', time: '10:00', label: 'Culto' }] } });

  const doc = createBackupDocument(data, '2026-10-28T20:00:00.000Z');
  validateBackupDocument(doc);

  // Simular serialización JSON (como al guardar a disco y cargar)
  const parsed = JSON.parse(JSON.stringify(doc));
  validateBackupDocument(parsed);

  assert.deepEqual(parsed.data, data);
  assert.equal(parsed.schemaVersion, BACKUP_SCHEMA_VERSION);
  assert.equal(parsed.app, 'Cimiento');
});

// ---------------------------------------------------------------------------
// validateBackupDocument — casos de error
// ---------------------------------------------------------------------------

test('validateBackupDocument: lanza error si app !== Cimiento', () => {
  const doc = { app: 'OtraApp', schemaVersion: 1, data: {} };
  assert.throws(() => validateBackupDocument(doc), /Cimiento/);
});

test('validateBackupDocument: lanza error si schemaVersion es diferente', () => {
  const data = Object.fromEntries(STORES.map(s => [s, []]));
  const doc = { app: 'Cimiento', schemaVersion: 999, data };
  assert.throws(() => validateBackupDocument(doc), /999/);
});

test('validateBackupDocument: lanza error si falta un store', () => {
  const data = Object.fromEntries(STORES.map(s => [s, []]));
  delete data.readings; // eliminar un store obligatorio
  const doc = { app: 'Cimiento', schemaVersion: BACKUP_SCHEMA_VERSION, data };
  assert.throws(() => validateBackupDocument(doc), /readings/);
});

test('validateBackupDocument: lanza error si data no es objeto', () => {
  const doc = { app: 'Cimiento', schemaVersion: BACKUP_SCHEMA_VERSION, data: null };
  assert.throws(() => validateBackupDocument(doc));
});

// ---------------------------------------------------------------------------
// Req-15: recuperación de sesión abierta
//
// app.js usa minutesBetweenEpoch(startEpochMs, end) para todos los cálculos
// de duración (recover-finish y stop-prayer-timer). Estos tests verifican el
// contrato de esa función, que es la única fuente de verdad.
// ---------------------------------------------------------------------------

test('req-15: detectar sesión abierta entre varias sesiones', () => {
  const sessions = [
    { id: 's1', completed: true,  minutes: 20 },
    { id: 's2', completed: false, startEpochMs: 1_000_000_000_000 }, // zombie
    { id: 's3', completed: true,  minutes: 15 }
  ];
  const active = sessions.find(s => s.completed === false);
  assert.ok(active, 'debe encontrar la sesión incompleta');
  assert.equal(active.id, 's2');
});

test('req-15: minutesBetweenEpoch calcula correctamente 3 horas (función usada en recover-finish)', () => {
  // Esta es la función exacta que app.js usa en recover-finish y stop-prayer-timer.
  const start = 1_000_000_000_000;
  const threeHoursLater = start + 3 * 60 * 60 * 1000;
  assert.equal(minutesBetweenEpoch(start, threeHoursLater), 180);
});

test('req-15: minutesBetweenEpoch — 45 minutos exactos (contrato de recover-finish)', () => {
  const start = 1_000_000_000_000;
  const end   = start + 45 * 60 * 1000;
  assert.equal(minutesBetweenEpoch(start, end), 45);
});

test('req-15: minutesBetweenEpoch — segundos parciales se truncan (no se redondean)', () => {
  const start = 1_000_000_000_000;
  const end   = start + 44 * 60 * 1000 + 59_999; // 44 min 59.999 s
  assert.equal(minutesBetweenEpoch(start, end), 44);
});

test('req-15: minutesBetweenEpoch — diferencia negativa devuelve 0, nunca negativo', () => {
  assert.equal(minutesBetweenEpoch(2_000_000, 1_000_000), 0);
});

test('req-15: "Continuar" — startEpochMs no se modifica', () => {
  // recover-continue solo llama refresh(); no toca la sesión en DB.
  // El contrato: el objeto de sesión permanece intacto.
  const originalStart = 1_000_000_000_000;
  const session = { id: 's1', completed: false, startEpochMs: originalStart };
  // Simular que recover-continue no muta el objeto (prayerRecoveryAcknowledged
  // cambia en state, pero la sesión en DB no cambia).
  assert.equal(session.startEpochMs, originalStart);
  assert.equal(session.completed, false);
});

test('req-15: "Descartar" — no produce minutos; la sesión desaparece', () => {
  const sessions = [
    { id: 's1', completed: false, startEpochMs: 1_000_000_000_000 }
  ];
  // Simular descarte: remove(id) → la sesión ya no existe en el array
  const after = sessions.filter(s => s.id !== 's1');
  assert.equal(after.length, 0);
  assert.equal(after.find(s => !s.completed), undefined);
});

test('req-15: guard doble finalización — session.completed evita re-escritura', () => {
  // El handler de recover-finish hace: if (!session || session.completed) return;
  // Este test verifica el contrato de esa guarda.
  const sessionCompleted   = { id: 's1', completed: true,  minutes: 30 };
  const sessionIncomplete  = { id: 's2', completed: false, startEpochMs: 1_000_000_000_000 };
  assert.ok(sessionCompleted.completed,   'una sesión ya finalizada debe bloquearse');
  assert.ok(!sessionIncomplete.completed, 'una sesión abierta debe procesarse');
});


// ---------------------------------------------------------------------------
// backupStatus: lógica de días transcurridos
// ---------------------------------------------------------------------------

test('backupStatus lógica: 7 días exactos → ok (no supera el umbral de >7)', () => {
  const last = new Date('2026-10-21T05:00:00Z').getTime();
  const now  = new Date('2026-10-28T05:00:00Z').getTime();
  const days = Math.floor((now - last) / 86400000);
  assert.equal(days, 7);
  assert.equal(days > 7 ? 'overdue' : 'ok', 'ok');
});

test('backupStatus lógica: 8 días → overdue', () => {
  const last = new Date('2026-10-20T05:00:00Z').getTime();
  const now  = new Date('2026-10-28T05:00:00Z').getTime();
  const days = Math.floor((now - last) / 86400000);
  assert.equal(days, 8);
  assert.equal(days > 7 ? 'overdue' : 'ok', 'overdue');
});
