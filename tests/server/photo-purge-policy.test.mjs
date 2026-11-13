import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPhotoPurge } from '../../server/property-photo-purge.js';

const scope = { state: 'trashed', versionConfirmed: true, enteredAt: '2026-08-31T12:00:00.000Z', enteredAtReliable: true };
const photo = { role: 'photo', origin: 'external', belongsToScope: true, personalData: false, referencesComplete: true, activeReferences: false };
const assess = (asset = photo, changes = {}, now = '2027-03-01T12:00:00.000Z') => assessPhotoPurge({ scope: { ...scope, ...changes }, asset, now, clockReliable: true });

test('six months in Jersey become eligible at the exact clamped deadline', () => {
  assert.equal(assess(photo, {}, '2027-02-28T12:59:59.999Z'), 'blocked');
  assert.equal(assess(photo, {}, '2027-02-28T13:00:00.000Z'), 'eligible');
  assert.equal(assess(photo, {}, '2027-02-28T13:00:00.001Z'), 'eligible');
  assert.equal(assess(photo, { enteredAt: '2027-08-31T12:00:00.000Z' }, '2028-02-29T13:00:00.000Z'), 'eligible');
  assert.equal(assess({ ...photo, role: 'photo_derivative', originalRole: 'photo' }), 'eligible');
});

test('spring gap resolves to first valid instant and autumn fold to first occurrence', () => {
  const gap = { enteredAt: '2025-09-29T00:30:00.000Z' };
  assert.equal(assess(photo, gap, '2026-03-29T00:59:59.999Z'), 'blocked');
  assert.equal(assess(photo, gap, '2026-03-29T01:00:00.000Z'), 'eligible');
  const fold = { enteredAt: '2026-04-25T00:30:00.000Z' };
  assert.equal(assess(photo, fold, '2026-10-25T00:29:59.999Z'), 'blocked');
  assert.equal(assess(photo, fold, '2026-10-25T00:30:00.000Z'), 'eligible');
  assert.equal(assess(photo, fold, '2026-10-25T01:30:00.000Z'), 'eligible');
});

test('declared reliability of both entry and clock is required', () => {
  assert.equal(assess(photo, { enteredAtReliable: false }), 'blocked');
  assert.equal(assess(photo, { enteredAtReliable: null }), 'blocked');
  assert.equal(assessPhotoPurge({scope, asset: photo, now: '2027-03-01T12:00:00.000Z'}), 'blocked');
});

test('a derivative requires explicit evidence that its original is a photo', () => {
  for (const originalRole of ['document', 'floorplan', 'unknown', null, undefined]) {
    assert.equal(assess({ ...photo, role: 'photo_derivative', originalRole }), 'blocked');
  }
});

test('documents, unknown roles, archives and Hampton media are blocked', () => {
  for (const role of ['document', 'floorplan', 'snapshot', 'archive', 'unknown', null]) {
    assert.equal(assess({ ...photo, role }), 'blocked');
  }
  assert.equal(assess({ ...photo, origin: 'hampton' }), 'blocked');
});

test('active, incomplete or unknown references, scope or personal data are blocked', () => {
  for (const changes of [
    { activeReferences: true }, { activeReferences: null }, { activeReferences: undefined },
    { referencesComplete: false }, { referencesComplete: null },
    { personalData: true }, { personalData: null }, { origin: null },
    { belongsToScope: false }, { belongsToScope: null },
  ]) assert.equal(assess({ ...photo, ...changes }), 'blocked');
  for (const changes of [{ state: 'active' }, { state: null }, { versionConfirmed: false }, { versionConfirmed: null }]) {
    assert.equal(assess(photo, changes), 'blocked');
  }
  assert.equal(assessPhotoPurge({}), 'blocked');
});

test('missing, malformed or future entry timestamps and invalid clocks are blocked', () => {
  for (const enteredAt of [null, '2026-08-31', '2026-02-30T12:00:00.000Z', '2028-01-01T00:00:00.000Z']) {
    assert.equal(assess(photo, { enteredAt }), 'blocked');
  }
  for (const now of [null, '2027-02-30T12:00:00.000Z', '2027-03-01', '2027-03-01T12:00:00+00:00']) {
    assert.equal(assess(photo, {}, now), 'blocked');
  }
});

test('legacy date-only input cannot make a document derivative eligible', () => {
  assert.equal(assessPhotoPurge({
    scope: { state: 'trashed', versionConfirmed: true, trashedOnJersey: '2026-08-31' },
    asset: { ...photo, role: 'photo_derivative', originalRole: 'document' },
    todayJersey: '2027-03-01',
  }), 'blocked');
});
