import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupDocument, validateBackupDocument } from '../js/backup.js';
import { STORES } from '../js/db.js';

test('un respaldo JSON conserva exactamente el contenido de todos los almacenes', () => {
  const data = Object.fromEntries(STORES.map(store => [store, []]));
  data.readings.push({ id: 'r1', date: '2026-10-01', book: 'Juan', chapter: 3 });
  data.settings.push({ key: 'churchSchedule', value: { 0: [{ id: 's1', time: '10:00', label: 'Culto' }] } });
  const doc = createBackupDocument(data, '2026-10-28T20:00:00.000Z');
  validateBackupDocument(doc);
  const parsed = JSON.parse(JSON.stringify(doc));
  validateBackupDocument(parsed);
  assert.deepEqual(parsed.data, data);
});
