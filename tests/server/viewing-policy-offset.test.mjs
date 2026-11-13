import test from 'node:test';
import assert from 'node:assert/strict';
import { jerseyViewingInstant } from '../../server/viewing-policy.js';

test('an explicit offset distinguishes the two autumn instants', () => {
  assert.equal(jerseyViewingInstant('2026-10-25','01:30',3600), '2026-10-25T00:30:00.000Z');
  assert.equal(jerseyViewingInstant('2026-10-25','01:30',0), '2026-10-25T01:30:00.000Z');
});

test('missing or incorrect offsets and nonexistent spring times cannot create an instant', () => {
  for (const [date,time,offset] of [
    ['2026-10-25','01:30',null], ['2026-10-25','01:30',7200],
    ['2026-03-29','01:30',0], ['2026-03-29','01:30',3600],
    ['2026-02-30','10:00',0], ['2026-11-13','24:00',0],
    ['2026-11-13','10:00',0.5],
  ]) assert.equal(jerseyViewingInstant(date,time,offset), null);
});

test('historical and normal times use the actual Jersey offset', () => {
  assert.equal(jerseyViewingInstant('1940-07-01','13:00',3600), '1940-07-01T12:00:00.000Z');
  assert.equal(jerseyViewingInstant('1940-07-01','13:00',0), null);
  assert.equal(jerseyViewingInstant('2026-11-13','10:00',0), '2026-11-13T10:00:00.000Z');
});
