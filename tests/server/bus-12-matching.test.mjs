// BUS-12 acceptance on Hampton's own listings: must-haves, exclusions, ranges and unknown data stay apart.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../server/matching.js';
import { extractFeatures } from '../../server/listing-features.js';
import { makeEnv, call, adminCookie, seedListing } from './helpers.mjs';

const MUST = { budget: 'must', bedrooms: 'must', parking: 'must' };
const applicant = o => ({ operation: 'rent', budget_max: 2000, bedrooms_min: 2, parking_spaces: 2, pets: '[{"kind":"none"}]',
  requirement_priorities: JSON.stringify({ version: 1, values: MUST, unknown: [] }), ...o });
const listing = (description = 'Parking for two cars', o = {}) => ({ operation: 'rent', availability: 'to_let', rent: 1800, rent_period: 'month',
  currency: 'GBP', bedrooms: 2, bathrooms: 2, published: 1, archived_at: null, ...extractFeatures({ description }), parish: 'St Helier', ...o });
const status = (a, l) => evaluate(applicant(a), l).requirements_status;

test('two must-have spaces: one space is an alternative, unknown parking is pending, whatever else is favourable', () => {
  const one = evaluate(applicant(), listing('Parking for one car')), unknown = evaluate(applicant(), listing(''));
  const two = evaluate(applicant(), listing());
  assert.deepEqual([two, unknown, one].map(r => r.requirements_status), ['meets', 'pending', 'alternative']);
  for (const r of [one, unknown]) {
    assert.equal(r.pass, true);
    assert.equal(r.score, two.score); // the same favourable rest and the same score: only parking decides
    assert.ok(r.checks.every(c => c.key === 'parking' || c.result === 'meets'));
  }
  // The same shortfall on a preferred requirement stays visible and does not undo the must-haves that are met.
  const flexible = evaluate(applicant({ requirement_priorities: JSON.stringify({ version: 1, values: { ...MUST, parking: 'preferred' }, unknown: [] }) }),
    listing('Parking for one car'));
  assert.equal(flexible.checks.find(c => c.key === 'parking').result, 'fails');
  assert.equal(flexible.requirements_status, 'meets');
});

test('a range is met, failed or unknown; an unknown bound is never a failure', () => {
  assert.equal(status({}, listing(undefined, { rent: 2001 })), 'alternative');
  assert.equal(status({ budget_stretch: 2200 }, listing(undefined, { rent: 2200 })), 'meets');
  assert.equal(status({}, listing(undefined, { rent: null })), 'pending');
  assert.equal(status({}, listing(undefined, { bedrooms: 1 })), 'alternative');
  assert.equal(status({ bedrooms_max: 3 }, listing(undefined, { bedrooms: 3 })), 'meets');
  assert.equal(status({ bedrooms_max: 3 }, listing(undefined, { bedrooms: 4 })), 'alternative');
  assert.equal(status({}, listing(undefined, { bedrooms: null })), 'pending');
});

test('unknown housing eligibility is pending: neither met nor excluded', () => {
  const work = { housing_status: 'entitled_work_only' };
  assert.equal(status(work, listing(undefined, { housing_category: 'registered' })), 'meets');
  assert.equal(status(work, listing(undefined, { housing_category: 'qualified' })), 'excluded');
  for (const [a, l] of [[work, {}], [{}, { housing_category: 'qualified' }], [{}, { restriction: 'over_55' }]]) {
    const r = evaluate(applicant(a), listing(undefined, l));
    assert.equal(r.checks.find(c => c.key === 'housing').result, 'unknown');
    assert.equal(r.pass, true);
    assert.equal(r.requirements_status, 'pending', JSON.stringify([a, l]));
  }
});

test('the found list separates met, pending and alternative, and leaves exclusions out', async () => {
  const env = makeEnv();
  const seed = (id, description, o = {}) => seedListing(env, { id, operation: 'rent', availability: 'to_let', rent: 1800, rent_period: 'month',
    sale_price: null, bedrooms: 2, bathrooms: 2, housing_category: 'registered', matchable: 1,
    ...extractFeatures({ description }), parish: 'St Helier', ...o });
  seed('BUS12-1-met', 'Parking for two cars. Pets allowed');
  seed('BUS12-2-housing', 'Parking for two cars. Pets allowed', { housing_category: null });
  seed('BUS12-3-parking', 'Pets allowed');
  seed('BUS12-4-pets', 'Parking for two cars');
  seed('BUS12-5-one-space', 'Parking for one car. Pets allowed');
  seed('BUS12-6-over-budget', 'Parking for two cars. Pets allowed', { rent: 2500 });
  seed('BUS12-7-excluded-area', 'Parking for two cars. Pets allowed', { parish: 'Trinity' });
  seed('BUS12-8-not-eligible', 'Parking for two cars. Pets allowed', { housing_category: 'qualified' });
  seed('BUS12-9-no-pets', 'Parking for two cars. No pets');
  const req = async (method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
  const made = await req('POST', '/admin/applicants', { name: 'Test household', email: 'household@example.test', operation: 'rent',
    source: 'phone', budget_max: 2000, bedrooms_min: 2, parking_spaces: 2, pets: [{ kind: 'dog', count: 1 }],
    housing_status: 'entitled_work_only', parishes_excluded: ['Trinity'],
    requirement_priorities: { version: 1, values: { ...MUST, pets: 'must' }, unknown: [] } });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const { matches } = (await req('GET', `/admin/applicants/${made.data.id}/matches?status=found`)).data;
  assert.deepEqual(matches.map(m => [m.listing.id, m.requirements_status]), [
    ['BUS12-1-met', 'meets'], ['BUS12-2-housing', 'pending'], ['BUS12-3-parking', 'pending'], ['BUS12-4-pets', 'pending'],
    ['BUS12-5-one-space', 'alternative'], ['BUS12-6-over-budget', 'alternative']]);
  const result = (id, key) => matches.find(m => m.listing.id === id).checks.find(c => c.key === key).result;
  assert.equal(result('BUS12-2-housing', 'housing'), 'unknown');
  assert.equal(result('BUS12-3-parking', 'parking'), 'unknown');
  assert.equal(result('BUS12-4-pets', 'pets'), 'unknown');
  assert.equal(result('BUS12-5-one-space', 'parking'), 'fails');
  assert.equal(result('BUS12-6-over-budget', 'budget'), 'fails');
});
