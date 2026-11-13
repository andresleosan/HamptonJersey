import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommercialFacts } from '../../server/property-facts.js';

const scope = { property_id: 'property-1', operation: 'sale', advertiser_id: null, publication_id: null };
const at = day => `2026-01-${String(day).padStart(2, '0')}T12:00:00.000Z`;
const fact = (id, dimension, status, source_kind, observed_at, extra = {}) =>
  ({ id, scope, dimension, status, source_kind, observed_at, received_at: observed_at, ...extra });
const resolve = (facts, options = {}) => resolveCommercialFacts(facts, { scope, as_of: at(20), ...options });

test('a missing advertisement or a failed source is not commercial unavailability', () => {
  for (const status of ['not_found', 'source_failed']) {
    const result = resolve([fact('web-1', 'publication', status, 'web', at(10))]);
    assert.equal(result.publication.status, status);
    assert.equal(result.availability.status, 'unknown');
    assert.equal(result.availability.confirmed_at, null);
  }
});

test('a late-arriving older web observation cannot override a later human confirmation', () => {
  const result = resolve([
    fact('human-1', 'availability', 'available', 'human', at(10)),
    fact('web-1', 'publication', 'not_found', 'web', at(9), { received_at: at(19) }),
  ]);
  assert.equal(result.availability.status, 'available');
  assert.equal(result.availability.confirmed_at, at(10));
  assert.equal(result.needs_review, false);
});

test('new material contradiction needs review and never silently reactivates a withdrawn scope', () => {
  const result = resolve([
    fact('human-1', 'availability', 'unavailable', 'human', at(10)),
    fact('web-1', 'publication', 'visible', 'web', at(11)),
  ]);
  assert.equal(result.availability.status, 'unknown');
  assert.equal(result.availability.last_confirmed, 'unavailable');
  assert.equal(result.needs_review, true);
  assert.ok(result.reasons.includes('publication_conflicts_with_confirmation'));
});

test('a failed source never erases a confirmation or claims a contradiction', () => {
  const result = resolve([
    fact('human-1', 'availability', 'available', 'human', at(10)),
    fact('web-1', 'publication', 'source_failed', 'web', at(11)),
  ]);
  assert.equal(result.availability.status, 'available');
  assert.equal(result.publication.status, 'source_failed');
  assert.equal(result.needs_review, false);
});

test('confirmation remains dated with no invented seven- or thirty-day expiry', () => {
  const result = resolve([fact('human-1', 'availability', 'available', 'human', at(1))],
    { as_of: '2028-01-01T00:00:00.000Z' });
  assert.equal(result.availability.status, 'available');
  assert.equal(result.availability.confirmed_at, at(1));
});

test('facts do not cross property, operation, advertiser or publication scopes', () => {
  for (const changed of [
    { property_id: 'property-2' }, { operation: 'rent' },
    { advertiser_id: 'advertiser-2' }, { publication_id: 'publication-2' },
  ]) {
    const other = { ...scope, ...changed };
    const result = resolve([fact('human-1', 'availability', 'available', 'human', at(10), { scope: other })]);
    assert.equal(result.availability.status, 'unknown');
    assert.equal(result.needs_review, false);
  }
});

test('conflicting confirmations at the same instant fail closed independently of input order', () => {
  const facts = [fact('human-1', 'availability', 'available', 'human', at(10)),
    fact('human-2', 'availability', 'unavailable', 'human', at(10))];
  for (const input of [facts, [...facts].reverse()]) {
    const result = resolve(input);
    assert.equal(result.availability.status, 'unknown');
    assert.equal(result.needs_review, true);
    assert.ok(result.reasons.includes('conflicting_confirmations'));
  }
});

test('future facts do not affect an as-of result and receipt time is not fact time', () => {
  const result = resolve([
    fact('human-1', 'availability', 'available', 'human', at(5), { received_at: at(19) }),
    fact('human-2', 'availability', 'unavailable', 'human', at(21)),
  ]);
  assert.equal(result.availability.status, 'available');
  assert.equal(result.availability.confirmed_at, at(5));
});

test('invalid instants, duplicated ids and attempted web confirmations fail closed', () => {
  assert.throws(() => resolve([], { as_of: '2026-02-30T12:00:00.000Z' }));
  assert.throws(() => resolve([fact('bad', 'availability', 'available', 'web', at(5))]));
  const one = fact('same', 'availability', 'available', 'human', at(5));
  assert.throws(() => resolve([one, { ...one, status: 'unavailable' }]));
  assert.throws(() => resolve([fact('bad', 'availability', 'available', 'human', '2026-02-30T12:00:00.000Z')]));
});

test('a later source failure does not erase an unresolved material contradiction', () => {
  const result = resolve([
    fact('human-1', 'availability', 'unavailable', 'human', at(10)),
    fact('web-1', 'publication', 'visible', 'web', at(11)),
    fact('web-2', 'publication', 'source_failed', 'web', at(12)),
  ]);
  assert.equal(result.publication.status, 'source_failed');
  assert.equal(result.availability.status, 'unknown');
  assert.equal(result.availability.last_confirmed, 'unavailable');
  assert.equal(result.needs_review, true);
});

test('a newer human confirmation resolves an older contradiction without changing its date', () => {
  const result = resolve([
    fact('human-1', 'availability', 'unavailable', 'human', at(5)),
    fact('web-1', 'publication', 'visible', 'web', at(8)),
    fact('human-2', 'availability', 'available', 'human', at(10)),
  ]);
  assert.equal(result.availability.status, 'available');
  assert.equal(result.availability.confirmed_at, at(10));
  assert.equal(result.needs_review, false);
});

test('contradictory publication reports at one instant do not depend on input order', () => {
  const observations = [fact('web-1', 'publication', 'visible', 'web', at(10)),
    fact('web-2', 'publication', 'not_found', 'web', at(10))];
  for (const input of [observations, [...observations].reverse()]) {
    const result = resolve(input);
    assert.equal(result.publication.status, 'unknown');
    assert.equal(result.availability.status, 'unknown');
    assert.ok(result.reasons.includes('conflicting_publication_observations'));
  }
});

test('editorial dates and extra scope fields are never accepted as commercial facts', () => {
  assert.throws(() => resolve([fact('human-1', 'availability', 'available', 'human', at(10),
    { confirmed_at: at(10) })]));
  assert.throws(() => resolve([], { scope: { ...scope, household_id: 'household-1' } }));
});


test('as-of results exclude facts not yet received and reject impossible receipt ordering', () => {
  const delayed = fact('human-1', 'availability', 'available', 'human', at(5), { received_at: at(19) });
  assert.equal(resolve([delayed], { as_of: at(10) }).availability.status, 'unknown');
  assert.equal(resolve([delayed], { as_of: at(20) }).availability.status, 'available');
  assert.throws(() => resolve([fact('human-2', 'availability', 'available', 'human', at(5), { received_at: at(4) })]));
  assert.throws(() => resolve([fact('human-3', 'availability', 'available', 'human', at(5), { received_at: null })]));
});
