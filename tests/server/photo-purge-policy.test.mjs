import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPhotoPurge } from '../../server/property-photo-purge.js';

const scope = { state: 'trashed', versionConfirmed: true, trashedOnJersey: '2026-08-31' };
const photo = { role: 'photo', origin: 'external', belongsToScope: true, personalData: false, referencesComplete: true, activeReferences: false };
const assess = (asset, changes = {}, today = '2027-03-01') => assessPhotoPurge({ scope: { ...scope, ...changes }, asset, todayJersey: today });

test('six calendar months clamp at month end; expiry day is retained conservatively', () => {
  assert.equal(assess(photo, {}, '2027-02-28'), 'blocked');
  assert.equal(assess(photo, {}, '2027-03-01'), 'eligible');
  assert.equal(assess(photo, { trashedOnJersey: '2027-08-31' }, '2028-03-01'), 'eligible');
  assert.equal(assess(photo, { trashedOnJersey: '2027-08-31' }, '2028-02-29'), 'blocked');
});

test('only explicitly classified external photos and derivatives are candidates', () => {
  assert.equal(assess(photo), 'eligible');
  assert.equal(assess({ ...photo, role: 'photo_derivative' }), 'eligible');
  for (const role of ['document', 'floorplan', 'snapshot', 'archive', 'unknown', null]) {
    assert.notEqual(assess({ ...photo, role }), 'eligible', String(role));
  }
  assert.equal(assess({ ...photo, origin: 'hampton' }), 'blocked');
});

test('active, incomplete or unknown references and personal data never qualify', () => {
  for (const changes of [
    { activeReferences: true }, { activeReferences: null }, { activeReferences: undefined },
    { referencesComplete: false }, { referencesComplete: null },
    { personalData: true }, { personalData: null }, { origin: null },
    { belongsToScope: false }, { belongsToScope: null },
  ]) assert.equal(assess({ ...photo, ...changes }), 'blocked');
});

test('unknown, invalid, active or unconfirmed scope and dates fail closed', () => {
  for (const changes of [
    { state: 'active' }, { state: null }, { versionConfirmed: false },
    { versionConfirmed: null }, { trashedOnJersey: '2026-02-30' },
    { trashedOnJersey: null },
  ]) assert.equal(assess(photo, changes), 'blocked');
  for (const today of ['2027-02-30', null, '2026-08-30']) assert.equal(assess(photo, {}, today), 'blocked');
  assert.equal(assessPhotoPurge({}), 'blocked');
});
