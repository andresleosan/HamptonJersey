import test from 'node:test';
import assert from 'node:assert/strict';
import { purgeDueAt, DOCUMENT_EXTENSIONS } from '../../server/property-photo-purge.js';
import { DOCUMENT_NAME } from '../../server/visibility.js';

test('six calendar months in Jersey, capped at the end of the month', () => {
  assert.equal(purgeDueAt('2026-08-31T12:00:00.000Z'), '2027-02-28T13:00:00.000Z');
  assert.equal(purgeDueAt('2027-08-31T12:00:00.000Z'), '2028-02-29T13:00:00.000Z');
  assert.equal(purgeDueAt('2026-01-10T10:00:00.000Z'), '2026-07-10T09:00:00.000Z');
});

test('spring gap resolves to first valid instant and autumn fold to first occurrence', () => {
  assert.equal(purgeDueAt('2025-09-29T00:30:00.000Z'), '2026-03-29T01:00:00.000Z');
  assert.equal(purgeDueAt('2026-04-25T00:30:00.000Z'), '2026-10-25T00:30:00.000Z');
});

test('missing or malformed entry timestamps are never due', () => {
  for (const enteredAt of [null, undefined, '2026-08-31', '2026-02-30T12:00:00.000Z', '2026-08-31T12:00:00+00:00'])
    assert.equal(purgeDueAt(enteredAt), null);
});

test('the purge names documents by the same rule as the website (server/visibility.js DOCUMENT_NAME)', () => {
  // Every extension of one to four letters: the purge's list is exactly the ones DOCUMENT_NAME treats as documents.
  let words = [''], all = [];
  for (let n = 1; n <= 4; n++) { words = words.flatMap(w => [...'abcdefghijklmnopqrstuvwxyz'].map(c => w + c)); all = all.concat(words); }
  assert.deepEqual(all.filter(x => DOCUMENT_NAME.test(`a.${x}`)).sort(), [...DOCUMENT_EXTENSIONS].sort());
});
