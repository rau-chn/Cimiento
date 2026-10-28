import test from 'node:test';
import assert from 'node:assert/strict';
import { BIBLE_BOOKS, TOTAL_BIBLE_CHAPTERS, chaptersForRange, planProgress } from '../js/bible.js';

test('la Biblia tiene 66 libros y 1.189 capítulos', () => {
  assert.equal(BIBLE_BOOKS.length, 66);
  assert.equal(TOTAL_BIBLE_CHAPTERS, 1189);
});

test('un plan de un solo libro deduplica capítulos registrados varias veces', () => {
  const plan = { startBook: 'Judas', endBook: 'Judas', chaptersPerDay: 1 };
  const readings = [
    { book: 'Judas', chapter: 1, date: '2026-10-01' },
    { book: 'Judas', chapter: 1, date: '2026-10-02' }
  ];
  assert.equal(chaptersForRange('Judas', 'Judas').length, 1);
  assert.deepEqual(planProgress(plan, readings), { completed: 1, total: 1, percent: 100, remaining: 0, estimatedDaysRemaining: 0 });
});
