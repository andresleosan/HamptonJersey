import test from 'node:test';
import assert from 'node:assert/strict';
import { missingSearchEssentials } from '../../server/registration-result.js';
import { prioritiesFor } from '../../site/requirements.js';
import { evaluate } from '../../server/matching.js';

const search = overrides => ({ search_category: 'residential', operation: 'rent',
  requirement_priorities: { version: 1, values: {}, unknown: [] }, ...overrides });
const compact = result => result.map(({ key, field, reason }) => ({ key, field, reason }));

test('reports unanswered must-haves and answered priorities needing confirmation, not optional blanks', () => {
  const applicant = search({ area_answer: 'unknown', bedrooms_min: 2, pets: [], budget_max: null,
    requirement_priorities: { version: 1, values: { area: 'must', bedrooms: 'unknown', pets: 'must',
      budget: 'must', lease_term_months: 'preferred' }, unknown: ['area', 'pets'] } });
  assert.deepEqual(compact(missingSearchEssentials(applicant)), [
    { key: 'area', field: 'parishes_wanted', reason: 'answer_missing' },
    { key: 'bedrooms', field: 'bedrooms_min', reason: 'priority_missing' },
    { key: 'pets', field: 'pets', reason: 'answer_missing' },
    { key: 'budget', field: 'budget_max', reason: 'answer_missing' },
  ]);
});

test('does not turn explicit none, anywhere, either or rent-only criteria into missing answers', () => {
  const applicant = search({ operation: 'buy', area_answer: 'any', parking_spaces: 0, pets: [{kind:'none'}],
    furnished: 'either', household_children_status: 'known', household_children: 0,
    requirement_priorities: { version: 1, values: { area: 'unknown', parking: 'unknown', pets: 'unknown',
      furnished: 'must', lease_term_months: 'must', children: 'unknown' }, unknown: [] } });
  assert.deepEqual(missingSearchEssentials(applicant), []);
});

test('explicit unknown for a must-have is unresolved even if a contradictory saved answer exists', () => {
  const applicant = search({ area_answer: 'any', budget_max: 2400,
    requirement_priorities: { version: 1, values: { area: 'must', budget: 'must' }, unknown: ['area','budget'] } });
  assert.deepEqual(compact(missingSearchEssentials(applicant)), [
    { key: 'area', field: 'parishes_wanted', reason: 'answer_missing' },
    { key: 'budget', field: 'budget_max', reason: 'answer_missing' },
  ]);
});

test('missing or malformed priority metadata is one unresolved item, not guessed optional', () => {
  for (const requirement_priorities of [null, 'not-json', {version:1,values:{},unknown:'area'},
    {version:1,values:{area:'invented'},unknown:[]}, {version:1,values:{area:'must'},unknown:['no-such-key']},
    {version:1,values:{},unknown:['area','area']}, {version:1,values:{},unknown:[],extra:true}]) {
    assert.deepEqual(compact(missingSearchEssentials(search({requirement_priorities}))), [
      { key: 'requirement_priorities', field: 'requirement_priorities', reason: 'priority_missing' },
    ]);
  }
});

test('only saved searches with a known category and operation are assessed', () => {
  for (const applicant of [null, {}, search({search_category:'other'}), search({operation:'transfer'})])
    assert.equal(missingSearchEssentials(applicant), null);
});

// REG-12: the commercial engine (BUS-12) compares only what the search states, so each comparable detail not given is listed.
const commercial = overrides => ({ search_category: 'commercial', operation: 'rent', search_operation: null, ...overrides });
const fields = applicant => missingSearchEssentials(applicant).map(item => item.field);

test('a commercial search lists the details its matching compares that were not given, by operation', () => {
  assert.deepEqual(fields(commercial()), ['commercial_kind', 'parishes_wanted', 'commercial_use', 'commercial_rent']);
  assert.deepEqual(fields(commercial({ operation: 'buy' })), ['commercial_kind', 'parishes_wanted', 'commercial_use', 'commercial_purchase']);
  assert.deepEqual(fields(commercial({ search_operation: 'transfer' })),
    ['commercial_kind', 'parishes_wanted', 'commercial_use', 'commercial_premium', 'commercial_rent']);
  assert.ok(missingSearchEssentials(commercial()).every(item => item.reason === 'answer_missing' && item.label));
});

test('a complete commercial search lists nothing; a premium of 0 and "anywhere" are answers', () => {
  const complete = { commercial_kind: 'both', commercial_use: 'Cafe', area_answer: 'any' };
  assert.deepEqual(missingSearchEssentials(commercial({ ...complete, commercial_rent: 1200, commercial_rent_period: 'month' })), []);
  assert.deepEqual(missingSearchEssentials(commercial({ ...complete, operation: 'buy', commercial_purchase: 250000,
    area_min: 40, area_unit: 'sqm' })), []);
  assert.deepEqual(missingSearchEssentials(commercial({ ...complete, search_operation: 'transfer', commercial_premium: 0,
    commercial_rent: 15000, commercial_rent_period: 'year', parishes_wanted: '["St Helier"]', area_answer: 'selected' })), []);
});

test('a commercial rent without its period or a floor area without its unit cannot be compared', () => {
  const complete = { commercial_kind: 'property', commercial_use: 'Office', area_answer: 'any' };
  assert.deepEqual(fields(commercial({ ...complete, commercial_rent: 1200, area_max: 90 })), ['area_unit', 'commercial_rent_period']);
  // A rent on a purchase search is not one of its terms.
  assert.deepEqual(fields(commercial({ ...complete, operation: 'buy', commercial_purchase: 1, commercial_rent: 1200 })), []);
});

test('the listed commercial details are the ones the engine compares once they are given', () => {
  const listing = { use: 'commercial', operation: 'rent', parish: 'St Helier', rent: 1000, rent_period: 'month', currency: 'GBP',
    property_type: 'Shop', interior_area_sqft: 800 };
  // Nothing stated: nothing is compared, so every commercial listing of the operation would read as meeting the search.
  assert.deepEqual(evaluate(commercial(), listing).checks, []);
  const given = commercial({ commercial_kind: 'property', commercial_use: 'Cafe', area_answer: 'selected',
    parishes_wanted: '["St Helier"]', commercial_rent: 1200, commercial_rent_period: 'month', area_min: 500, area_unit: 'sqft' });
  assert.deepEqual(missingSearchEssentials(given), []);
  assert.deepEqual(evaluate(given, listing).checks.map(c => [c.key, c.result]),
    [['kind', 'meets'], ['use', 'unknown'], ['floor_area', 'meets'], ['area', 'meets'], ['rent', 'meets']]);
  // The two the engine cannot compare for lack of the client's unit or period.
  const partial = { ...given, area_unit: null, commercial_rent_period: null };
  assert.deepEqual(fields(partial), ['area_unit', 'commercial_rent_period']);
  assert.deepEqual(evaluate(partial, listing).checks.filter(c => ['floor_area', 'rent'].includes(c.key)).map(c => c.result), ['unknown', 'unknown']);
});

test('a commercial search never returns values, residential criteria or priorities', () => {
  const applicant = commercial({ commercial_use: 'SYNTHETIC PRIVATE MARKER', near: 'SYNTHETIC PRIVATE MARKER', requirement_priorities: null });
  const before = JSON.stringify(applicant), result = missingSearchEssentials(applicant);
  assert.equal(JSON.stringify(applicant), before);
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC|priority|Bedrooms|Pets/);
});

test('accepts JSON storage shapes and never returns values or mutates the saved search', () => {
  const applicant = search({ pets: '[]', near: 'SYNTHETIC PRIVATE MARKER',
    requirement_priorities: JSON.stringify({version:1,values:{pets:'must',near:'unknown'},unknown:['pets']}) });
  const before = JSON.stringify(applicant), result = missingSearchEssentials(applicant);
  assert.deepEqual(compact(result), [
    { key: 'pets', field: 'pets', reason: 'answer_missing' },
    { key: 'near', field: 'near', reason: 'priority_missing' },
  ]);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC PRIVATE MARKER'), false);
  assert.equal(JSON.stringify(applicant), before);
});

test('reviewing an answered unknown priority does not turn it into preferred after an unrelated edit', () => {
  const p = {version:1,values:{near:'unknown'},unknown:[]};
  const saved = search({near:'Work',budget_max:2000,requirement_priorities:p});
  const edited = {...saved,budget_max:2100};
  const review = missingSearchEssentials(saved);
  assert.equal(review[0].reason,'priority_missing');
  assert.doesNotMatch(JSON.stringify(review),/optional|preferred/i);
  assert.deepEqual(prioritiesFor(p,edited),prioritiesFor(p,saved));
  assert.equal(prioritiesFor(p,edited).values.near,'unknown');
  assert.deepEqual(p,{version:1,values:{near:'unknown'},unknown:[]});
});

test('unanswered unknown priorities and unknown answers without a priority require review', () => {
  const applicant = search({ near:null, bedrooms_min:null, pets:[],
    requirement_priorities:{version:1,values:{near:'unknown',bedrooms:'unknown'},unknown:['pets']} });
  assert.deepEqual(compact(missingSearchEssentials(applicant)), [
    {key:'bedrooms',field:'bedrooms_min',reason:'priority_missing'},
    {key:'pets',field:'pets',reason:'priority_missing'},
    {key:'near',field:'near',reason:'priority_missing'},
  ]);
});

test('contradictory answer and priority metadata remain open without assuming optional', () => {
  const applicant = search({area_answer:'any',parking_spaces:0,pets:[{kind:'none'}],
    requirement_priorities:{version:1,values:{parking:'must',area:'preferred',pets:'unknown'},unknown:['area','pets']} });
  assert.deepEqual(compact(missingSearchEssentials(applicant)), [
    {key:'parking',field:'parking_spaces',reason:'priority_missing'},
    {key:'area',field:'parishes_wanted',reason:'answer_missing'},
    {key:'pets',field:'pets',reason:'answer_missing'},
    {key:'pets',field:'pets',reason:'priority_missing'},
  ]);
});

test('an explicitly preferred unanswered answer is not promoted to a must-have', () => {
  const applicant=search({pets:[],requirement_priorities:{version:1,values:{pets:'preferred'},unknown:['pets']}});
  assert.deepEqual(missingSearchEssentials(applicant),[]);
});
