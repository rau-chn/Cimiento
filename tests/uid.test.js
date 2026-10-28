import test from 'node:test';
import assert from 'node:assert/strict';
import { uid } from '../js/db.js';

test('uid crea IDs para lecturas cuando randomUUID no está disponible en HTTP por IP', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues }
  });

  try {
    const first = uid('read');
    const second = uid('read');
    assert.match(first, /^read-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(first, second);
  } finally {
    Object.defineProperty(globalThis, 'crypto', original);
  }
});
