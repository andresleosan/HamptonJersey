import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPhotoPurge } from '../../server/property-photo-purge.js';

const scope = { state: 'trashed', versionConfirmed: true, enteredAt: '2026-08-31T12:00:00.000Z' };
const photo = { role: 'photo', origin: 'external', belongsToScope: true, personalData: false, referencesComplete: true, activeReferences: false };
const assess = (asset = photo, changes = {}, now = '2027-03-01T12:00:00.000Z') => assessPhotoPurge({ scope: { ...scope, ...changes }, asset, now });

test('time eligibility stays pending without an approved Jersey time and DST resolution rule', () => {
  for (const now of ['2027-02-28T11:59:59.999Z', '2027-02-28T12:00:00.000Z', '2027-03-01T12:00:00.000Z']) {
    assert.equal(assess(photo, {}, now), 'pending');
  }
  assert.equal(assess({ ...photo, role: 'photo_derivative', originalRole: 'photo' }), 'pending');
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
