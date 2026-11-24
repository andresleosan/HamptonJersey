import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editTimestamp, listingsPage, passesEditedWithin, compareListings } from '../admin/src/listing-filters.js';

const DAY = 86_400_000;
const now = Date.parse('2026-11-24T10:00:00Z');
const at = days => new Date(now - days * DAY).toISOString();

test('Last edited uses the displayed edit timestamp, not Checked or material change', () => {
  assert.equal(editTimestamp('2026-11-24 10:00:00.123'), now + 123);
  assert.equal(editTimestamp('2026-11-24T11:00:00+01:00'), now);
  assert.equal(editTimestamp('bad'), null);
  assert.equal(passesEditedWithin({ updated_at: at(7), confirmed_at: at(2) }, '7', now), true);
  assert.equal(passesEditedWithin({ updated_at: at(8), material_change_at: at(1) }, '7', now), false);
  assert.equal(passesEditedWithin({ updated_at: at(30) }, '30', now), true);
  assert.equal(passesEditedWithin({ updated_at: at(31) }, '30', now), false);
  assert.equal(passesEditedWithin({ updated_at: at(-1) }, '30', now), false);
  assert.equal(passesEditedWithin({}, '30', now), false);
  assert.equal(passesEditedWithin({}, '', now), true);
});

test('sorting is stable, with invalid and missing edit dates last in both directions', () => {
  const rows = [{ id: 'D' }, { id: 'B', updated_at: at(1) }, { id: 'A', updated_at: at(1) },
    { id: 'E', updated_at: 'bad' }, { id: 'C', updated_at: at(3) }];
  assert.deepEqual(rows.toSorted((a,b) => compareListings(a,b,'desc')).map(r => r.id), ['A','B','C','D','E']);
  assert.deepEqual(rows.toSorted((a,b) => compareListings(a,b,'asc')).map(r => r.id), ['C','A','B','D','E']);
  assert.deepEqual(rows.toSorted((a,b) => compareListings(a,b,'')).map(r => r.id), ['A','B','C','D','E']);
});

test('paging slices the full ordered result, clamps after a reload and handles an empty result', () => {
  const rows = Array.from({ length: 103 }, (_, i) => i);
  for (const [index, start, end] of [[0,0,25],[1,25,50],[3,75,100],[4,100,103],[12,100,103]]) {
    const p = listingsPage(rows, index);
    assert.equal(p.start, start);
    assert.equal(p.end, end);
    assert.deepEqual(p.rows, rows.slice(start, end));
  }
  assert.deepEqual(listingsPage([], 4), { index: 0, start: 0, end: 0, rows: [], hasNext: false });
});
