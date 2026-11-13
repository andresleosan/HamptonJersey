import test from 'node:test';
import assert from 'node:assert/strict';
import { searchReviewClock } from '../../server/search-review-clock.js';

const absence = (at, source = 'activation') => ({ at, source });
const clock = (overrides = {}) => searchReviewClock({
  now: '2026-02-22T10:30:00.000Z', fullAvailable: false,
  absence: absence('2026-02-01T10:30:00.000Z'), review: null, ...overrides,
});

test('initial deadline is inclusive after 21 Jersey calendar days', () => {
  assert.deepEqual(clock({now:'2026-02-22T10:29:59.999Z'}), {state:'waiting', dueAt:'2026-02-22T10:30:00.000Z'});
  assert.deepEqual(clock(), {state:'due', dueAt:'2026-02-22T10:30:00.000Z'});
});

test('confirmed full option suspends and unknown eligibility cannot start a clock', () => {
  assert.deepEqual(clock({fullAvailable:true}), {state:'held', noFullSince:null});
  assert.deepEqual(clock({fullAvailable:null}), {state:'pending', reason:'eligibility_unknown'});
  assert.deepEqual(clock({fullAvailable:undefined}), {state:'pending', reason:'eligibility_unknown'});
});

test('legacy absence requires explicit baseline and a new loss starts at its evidence', () => {
  assert.deepEqual(clock({absence:null}), {state:'pending', reason:'absence_baseline_required'});
  assert.deepEqual(clock({absence:absence('2026-02-10T12:00:00.000Z','legacy_baseline')}), {state:'waiting',dueAt:'2026-03-03T12:00:00.000Z'});
  assert.deepEqual(clock({absence:absence('2026-02-21T12:00:00.000Z','last_full_lost')}), {state:'waiting',dueAt:'2026-03-14T12:00:00.000Z'});
});

test('one open review is not due again; closure anchors the next cycle at seven days', () => {
  assert.deepEqual(clock({review:{status:'open'}}), {state:'review_open'});
  assert.deepEqual(clock({review:{status:'closed',closedAt:'2026-02-20T10:30:00.000Z'}}), {state:'waiting',dueAt:'2026-02-27T10:30:00.000Z'});
  assert.deepEqual(clock({now:'2026-02-27T10:30:00.000Z',review:{status:'closed',closedAt:'2026-02-20T10:30:00.000Z'}}), {state:'due',dueAt:'2026-02-27T10:30:00.000Z'});
});

test('closure from an earlier absence episode cannot anchor the current cycle', () => {
  assert.deepEqual(clock({absence:absence('2026-02-21T12:00:00.000Z','last_full_lost'),review:{status:'closed',closedAt:'2026-02-20T10:30:00.000Z'}}), {state:'pending',reason:'review_before_absence'});
});

test('calendar deadlines preserve Jersey wall time across spring and autumn transitions', () => {
  assert.deepEqual(clock({now:'2026-04-06T08:30:00.000Z',absence:absence('2026-03-16T09:30:00.000Z')}), {state:'due',dueAt:'2026-04-06T08:30:00.000Z'});
  assert.deepEqual(clock({now:'2026-11-09T09:30:00.000Z',absence:absence('2026-10-19T08:30:00.000Z')}), {state:'due',dueAt:'2026-11-09T09:30:00.000Z'});
});

test('a spring gap resolves to the first valid instant and an autumn fold to the first occurrence', () => {
  assert.deepEqual(clock({now:'2026-03-29T01:00:00.000Z',absence:absence('2026-03-08T01:30:17.123Z')}), {state:'due',dueAt:'2026-03-29T01:00:00.000Z'});
  assert.deepEqual(clock({now:'2026-10-25T00:30:17.123Z',absence:absence('2026-10-03T00:30:17.123Z')}), {state:'due',dueAt:'2026-10-24T00:30:17.123Z'});
  assert.deepEqual(clock({now:'2026-10-25T00:30:17.123Z',absence:absence('2026-10-04T00:30:17.123Z')}), {state:'due',dueAt:'2026-10-25T00:30:17.123Z'});
});

test('repeat deadline also uses Jersey calendar days across DST', () => {
  assert.deepEqual(clock({now:'2026-03-29T01:00:00.000Z',absence:absence('2026-02-01T10:00:00.000Z'),review:{status:'closed',closedAt:'2026-03-22T01:30:00.000Z'}}), {state:'due',dueAt:'2026-03-29T01:00:00.000Z'});
});

test('missing, malformed, future, or unsupported evidence fails closed', () => {
  assert.deepEqual(searchReviewClock(), {state:'pending',reason:'invalid_clock'});
  assert.deepEqual(clock({absence:absence('2026-02-23T10:30:00.000Z')}), {state:'pending',reason:'invalid_absence'});
  assert.deepEqual(clock({absence:absence('2026-02-01T10:30:00.000Z','guessed')}), {state:'pending',reason:'invalid_absence'});
  assert.deepEqual(clock({review:{status:'closed',closedAt:'2026-02-23T10:30:00.000Z'}}), {state:'pending',reason:'invalid_review'});
  assert.deepEqual(clock({review:{status:'something'}}), {state:'pending',reason:'invalid_review'});
});
