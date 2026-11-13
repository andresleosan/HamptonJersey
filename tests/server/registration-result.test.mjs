import test from 'node:test';
import assert from 'node:assert/strict';
import { missingSearchEssentials } from '../../server/registration-result.js';
import { prioritiesFor } from '../../site/requirements.js';

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

test('only residential saved searches with a known operation are assessed', () => {
  for (const applicant of [null, {}, search({search_category:'commercial'}), search({operation:'transfer'})])
    assert.equal(missingSearchEssentials(applicant), null);
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
