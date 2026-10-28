import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { minutesBetweenEpoch } from '../js/dates.js';

// Ejecuta el handler real sin iniciar la app ni depender de un navegador o IndexedDB.
const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '')
  .replace(/\ninit\(\)\.catch\([\s\S]*$/, '');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness(active = true) {
  const writes = [];
  const persistence = deferred();
  const refreshed = deferred();
  let refreshCount = 0;
  const context = vm.createContext({
    limaToday: () => '2026-10-28',
    minutesBetweenEpoch,
    uid: () => 'new-session',
    put: (store, value) => { writes.push({ type: 'put', store, value }); return persistence.promise; },
    remove: (store, id) => { writes.push({ type: 'remove', store, id }); return persistence.promise; },
    document: { querySelector: () => ({ value: 'nota' }) },
    __refresh: () => { refreshCount++; return refreshed.promise; },
    __toast: () => {}
  });
  vm.runInContext(appSource, context);
  vm.runInContext('refresh = __refresh', context);
  vm.runInContext('toast = __toast', context);
  const state = vm.runInContext('state', context);
  state.data = {
    prayerSessions: active ? [{ id: 'session-1', completed: false, startEpochMs: Date.now() - 120000 }] : []
  };
  const handleClick = vm.runInContext('handleClick', context);
  const click = action => handleClick({ target: { closest: () => ({ dataset: { action, id: 'session-1' } }) } });
  return { state, writes, persistence, refreshed, click, refreshCount: () => refreshCount };
}

for (const action of ['recover-finish', 'recover-discard', 'stop-prayer-timer', 'start-prayer-timer']) {
  test(`${action}: ignora doble clic durante escritura y refresh`, async () => {
    const h = harness(action !== 'start-prayer-timer');
    const first = h.click(action);
    await h.click(action);
    assert.equal(h.writes.length, 1);
    assert.equal(h.state.prayerActionPending, true);

    h.persistence.resolve();
    await new Promise(setImmediate);
    assert.equal(h.refreshCount(), 1);
    await h.click(action);
    assert.equal(h.writes.length, 1);
    assert.equal(h.state.prayerActionPending, true);

    h.refreshed.resolve();
    await first;
    assert.equal(h.state.prayerActionPending, false);
  });
}

test('finalizar y descartar no pueden ejecutarse a la vez', async () => {
  const h = harness();
  const first = h.click('recover-finish');
  await h.click('recover-discard');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].type, 'put');
  h.persistence.resolve();
  h.refreshed.resolve();
  await first;
});

test('continuar no crea otra sesión y bloquea iniciar durante refresh', async () => {
  const h = harness();
  const first = h.click('recover-continue');
  await h.click('start-prayer-timer');
  assert.equal(h.writes.length, 0);
  assert.equal(h.state.data.prayerSessions.length, 1);
  h.refreshed.resolve();
  await first;
  await h.click('start-prayer-timer');
  assert.equal(h.writes.length, 0);
});
