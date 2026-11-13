import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../server/matching.js';
import { widen } from '../../server/widen.js';
import { compareRequirements } from '../../server/requirements.js';

const priorities = JSON.stringify({ version: 1, values: { budget: 'must' }, unknown: [] });
const applicant = overrides => ({ operation: 'buy', budget_max: 1000000, pets: '[{"kind":"none"}]',
  area_answer: 'any', requirement_priorities: priorities, ...overrides });
const listing = overrides => ({ operation: 'sale', sale_price: 900000, currency: 'GBP',
  availability: 'for_sale', archived_at: null, ...overrides });
const budget = result => result.checks.find(check => check.key === 'budget');

test('a required budget stays pending when a price has no confirmed GBP currency', () => {
  for (const currency of [null, undefined, '', 'EUR', 'ZZZ']) {
    const a = applicant(), l = listing({ currency, sale_price: 1200000 });
    const before = structuredClone({ a, l });
    const result = evaluate(a, l);
    assert.equal(result.pass, true, String(currency));
    assert.equal(budget(result).result, 'unknown', String(currency));
    assert.equal(result.requirements_status, 'pending', String(currency));
    assert.equal(result.requirements_rank, 1);
    assert.doesNotMatch(budget(result).evidence ?? '', /£/);
    assert.deepEqual({ a, l }, before);
  }
});

test('confirmed GBP retains the existing ceiling and stretch behavior', () => {
  assert.equal(budget(evaluate(applicant(), listing())).result, 'meets');
  const tooHigh = evaluate(applicant(), listing({ sale_price: 1000001 }));
  assert.equal(budget(tooHigh).result, 'fails');
  assert.equal(tooHigh.requirements_status, 'alternative');
  const stretch = evaluate(applicant({ budget_max: 1000000, budget_stretch: 1100000 }), listing({ sale_price: 1050000 }));
  assert.equal(budget(stretch).result, 'meets');
  assert.equal(stretch.requirements_status, 'meets');
});

test('monthly and yearly rents with unknown or non-GBP currency stay pending above and below the ceiling', () => {
  const a = applicant({ operation: 'rent', budget_max: 2000 });
  for (const currency of [null, 'EUR']) for (const [rent, rent_period] of [[1800, 'month'], [2500, 'month'], [21600, 'year'], [30000, 'year']]) {
    const r = evaluate(a, listing({ operation: 'rent', availability: 'to_let', currency, rent, rent_period }));
    assert.equal(r.pass, true, `${currency} ${rent}/${rent_period}`);
    assert.equal(budget(r).result, 'unknown');
    assert.equal(r.requirements_status, 'pending');
    assert.equal(r.requirements_rank, 1);
  }
});

test('confirmed annual GBP rent compares its unrounded monthly amount with the ceiling', () => {
  const a = applicant({ operation:'rent', budget_max:2000 });
  const annual = rent => listing({ operation:'rent', availability:'to_let', rent_period:'year', rent });
  assert.equal(budget(evaluate(a,annual(24000))).result,'meets');
  assert.equal(budget(evaluate(a,annual(24000.01))).result,'fails');
});

test('missing, malformed or nonpositive prices cannot be certified as meeting a budget', () => {
  for (const sale_price of [null, 0, -1, NaN, Infinity, '900000', {}]) {
    const result = evaluate(applicant(), listing({ sale_price }));
    assert.equal(budget(result).result, 'unknown', String(sale_price));
    assert.equal(result.requirements_status, 'pending', String(sale_price));
    assert.equal(result.pass, true);
  }
});

test('unknown currency does not turn a legacy hard price filter into a false exclusion', () => {
  const legacy = applicant({ requirement_priorities: null });
  const unknown = evaluate(legacy, listing({ currency: null, sale_price: 1200000 }));
  assert.equal(unknown.pass, true);
  assert.equal(budget(unknown).result, 'unknown');
  assert.equal(unknown.requirements_status, 'pending');
  assert.equal(evaluate(legacy, listing({ currency: 'GBP', sale_price: 1200000 })).pass, false);
});

test('an unknown currency cannot trigger the legacy minimum-price exclusion', () => {
  for (const currency of [null,'EUR']) {
    const legacy = applicant({ budget_min:800000, requirement_priorities:null });
    const result = evaluate(legacy,listing({ currency, sale_price:100000 }));
    assert.equal(result.pass,true);
    assert.equal(budget(result).result,'unknown');
    assert.equal(result.requirements_status,'pending');
    assert.equal(evaluate(legacy,listing({currency:'GBP',sale_price:100000})).pass,false);
  }
});

test('a required budget with unknown currency cannot outrank a confirmed requirement through score', () => {
  const known = evaluate(applicant(),listing());
  const uncertain = evaluate(applicant(),listing({currency:null}));
  assert.equal(known.requirements_rank,0);
  assert.equal(uncertain.requirements_rank,1);
  assert.ok(compareRequirements({...known,score:0,id:'known'},{...uncertain,score:100,id:'uncertain'}) < 0);
});

test('widening does not count an unconfirmed currency as an additional complete match', () => {
  const a = applicant({ budget_max: 900000 });
  const homes = [
    listing({ id:'GBP', sale_price:950000 }),
    listing({ id:'UNKNOWN', sale_price:950000, currency:null }),
    listing({ id:'EUR', sale_price:950000, currency:'EUR' }),
  ];
  const budgetChange = widen(a, homes).find(change => change.key === 'budget');
  assert.deepEqual({added:budgetChange.added, fresh:budgetChange.fresh, improved:budgetChange.improved},
    {added:1, fresh:1, improved:0});
});
