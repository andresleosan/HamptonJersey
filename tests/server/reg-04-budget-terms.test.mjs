import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBudgetTerms } from '../../server/search-criteria.js';
import * as applicants from '../../server/applicants.js';

const snapshot = (category, operation, criteria, extra = {}) => ({
  search_category: category, operation, criteria, currency: 'GBP', ...extra,
});
const issue = (result, field, reason) => result.unknowns.some(item => item.field === field && item.reason === reason);

test('residential buy and rent are independent and the accepted stretch replaces the maximum', () => {
  const rentInput = snapshot('residential', 'rent', { budget_min: 1200, budget_max: 2000, budget_stretch: 2200,
    requirement_priorities: '{"version":1,"values":{"budget":"must","parking":"must"},"unknown":[]}' });
  const before = structuredClone(rentInput);
  const rent = normalizeBudgetTerms(rentInput);
  const buy = normalizeBudgetTerms(snapshot('residential', 'buy', { budget_max: 650000 }));
  assert.equal(rent.terms.budget_ceiling.amount_minor, 220000);
  assert.equal(rent.terms.budget_ceiling.source_field, 'budget_stretch');
  assert.equal(rent.terms.budget_ceiling.period, 'month');
  assert.deepEqual(rent.terms.budget_ceiling.monthly_equivalent, { numerator_minor: 220000, denominator: 1 });
  assert.equal(buy.terms.budget_ceiling.amount_minor, 65000000);
  assert.equal(buy.terms.budget_ceiling.source_field, 'budget_max');
  assert.equal(buy.terms.budget_ceiling.period, 'not_applicable');
  assert.equal(buy.terms.budget_ceiling.monthly_equivalent, null);
  assert.deepEqual(rentInput, before);
});

test('annual rent uses an exact monthly fraction and never adds transfer, purchase or expenses', () => {
  const input = snapshot('commercial', 'transfer', { commercial_purchase: 400000, commercial_rent: 24000,
    commercial_rent_period: 'year', commercial_premium: 50000, commercial_expenses: 1500 });
  const result = normalizeBudgetTerms(input);
  assert.equal(result.terms.commercial_rent.original_value, 24000);
  assert.equal(result.terms.commercial_rent.amount_minor, 2400000);
  assert.equal(result.terms.commercial_rent.period, 'year');
  assert.deepEqual(result.terms.commercial_rent.monthly_equivalent, { numerator_minor: 2400000, denominator: 12 });
  assert.equal(result.terms.commercial_premium.amount_minor, 5000000);
  assert.equal(result.terms.commercial_purchase.amount_minor, 40000000);
  assert.equal(result.terms.commercial_purchase.monthly_equivalent, null);
  assert.equal(result.terms.commercial_expenses.amount_minor, 150000);
  assert.equal(result.terms.commercial_expenses.period, 'unknown');
  assert.equal(result.terms.commercial_expenses.state, 'unknown');
  assert.ok(issue(result, 'commercial_expenses', 'period_unknown'));
});

test('fraction retains an annual one-penny difference without rounding or crossing currencies', () => {
  const monthly = normalizeBudgetTerms(snapshot('commercial', 'rent', { commercial_rent: 2000, commercial_rent_period: 'month' })).terms.commercial_rent;
  const annual = normalizeBudgetTerms(snapshot('commercial', 'rent', { commercial_rent: 24000.01, commercial_rent_period: 'year' })).terms.commercial_rent;
  const m = monthly.monthly_equivalent, a = annual.monthly_equivalent;
  assert.equal(BigInt(a.numerator_minor) * BigInt(m.denominator) - BigInt(m.numerator_minor) * BigInt(a.denominator), 1n);
  assert.equal(annual.amount_minor, 2400001);
});

test('unknown, explicit zero and not applicable stay different', () => {
  const unknown = normalizeBudgetTerms(snapshot('commercial', 'transfer', {}));
  assert.equal(unknown.terms.commercial_premium.state, 'unknown');
  assert.equal(unknown.terms.commercial_premium.amount_minor, null);
  const zero = normalizeBudgetTerms(snapshot('commercial', 'transfer', { commercial_premium: 0, commercial_expenses: 0 }));
  assert.equal(zero.terms.commercial_premium.state, 'known');
  assert.equal(zero.terms.commercial_premium.original_value, 0);
  assert.equal(zero.terms.commercial_premium.amount_minor, 0);
  assert.equal(zero.terms.commercial_expenses.original_value, 0);
  assert.equal(zero.terms.commercial_expenses.amount_minor, 0);
  assert.equal(zero.terms.commercial_expenses.state, 'unknown');
  const residential = normalizeBudgetTerms(snapshot('residential', 'rent', { budget_max: 2000 }));
  assert.equal(residential.terms.commercial_premium.state, 'not_applicable');
  assert.equal(residential.terms.commercial_premium.amount_minor, null);
  const invalidZero = normalizeBudgetTerms(snapshot('residential', 'rent', { budget_max: 0 }));
  assert.equal(invalidZero.terms.budget_ceiling.state, 'unknown');
  assert.notEqual(invalidZero.terms.budget_ceiling.amount_minor, 0);
});

test('unknown, unsupported and contradictory currency never become GBP by default', () => {
  for (const extra of [{ currency: null }, { currency: 'ZZZ' }, { currency: 'EUR' }]) {
    const criteria = extra.currency === 'EUR' ? { budget_max: 2000, currency: 'GBP' } : { budget_max: 2000 };
    const result = normalizeBudgetTerms(snapshot('residential', 'rent', criteria, extra));
    assert.equal(result.terms.budget_ceiling.state, 'unknown');
    assert.equal(result.terms.budget_ceiling.amount_minor, null);
    assert.ok(issue(result, 'budget_max', 'currency_unknown'));
  }
  const eur = normalizeBudgetTerms(snapshot('commercial', 'rent', { commercial_rent: 12000, commercial_rent_period: 'year' }, { currency: 'EUR' }));
  assert.equal(eur.terms.commercial_rent.currency, 'EUR');
  assert.equal(eur.terms.commercial_rent.amount_minor, 1200000);
});

test('unknown rent period preserves the amount but prevents a monthly equivalent', () => {
  for (const period of [null, 'week', 'unexpected']) {
    const result = normalizeBudgetTerms(snapshot('commercial', 'rent', { commercial_rent: 24000, commercial_rent_period: period }));
    assert.equal(result.terms.commercial_rent.amount_minor, 2400000);
    assert.equal(result.terms.commercial_rent.period, 'unknown');
    assert.equal(result.terms.commercial_rent.state, 'unknown');
    assert.equal(result.terms.commercial_rent.monthly_equivalent, null);
    assert.ok(issue(result, 'commercial_rent', 'period_unknown'));
  }
});

test('invalid or contradictory declared ceilings do not silently fall back to a different amount', () => {
  for (const criteria of [
    { budget_max: 2000, budget_stretch: 1800 },
    { budget_min: 2200, budget_max: 2000 },
    { budget_max: 2000, budget_stretch: 'not a number' },
    { budget_max: 2000.001 },
    { budget_max: 2000, budget_stretch: -1 },
    { budget_max: 2000, budget_stretch: Infinity },
  ]) {
    const result = normalizeBudgetTerms(snapshot('residential', 'rent', criteria));
    assert.equal(result.terms.budget_ceiling.state, 'unknown');
    assert.equal(result.terms.budget_ceiling.amount_minor, null);
  }
});

test('unknown operation and category cannot assign known budget terms', () => {
  for (const [category, operation] of [['residential', 'transfer'], ['residential', 'both'], [null, 'rent'], ['commercial', 'sale']]) {
    const result = normalizeBudgetTerms(snapshot(category, operation, { budget_max: 2000, commercial_rent: 24000 }));
    assert.deepEqual(result.terms, {});
    assert.ok(result.unknowns.length > 0);
  }
});

test('mismatched category fields are not silently converted into another search', () => {
  const result = normalizeBudgetTerms(snapshot('residential', 'rent', { budget_max: 2000, commercial_purchase: 500000 }));
  assert.equal(result.terms.commercial_purchase.state, 'not_applicable');
  assert.ok(issue(result, 'commercial_purchase', 'category_mismatch'));
});

test('each amount identifies its own operation and rent preserves the declared period', () => {
  const result = normalizeBudgetTerms(snapshot('commercial', 'transfer', { commercial_purchase: 500000,
    commercial_rent: 24000, commercial_rent_period: 'year', commercial_premium: 45000, commercial_expenses: 0 }));
  assert.equal(result.terms.commercial_purchase.operation, 'buy');
  assert.equal(result.terms.commercial_rent.operation, 'rent');
  assert.equal(result.terms.commercial_premium.operation, 'transfer');
  assert.equal(result.terms.commercial_expenses.operation, 'unknown');
  assert.equal(result.terms.commercial_rent.original_period, 'year');
  const unsupported = normalizeBudgetTerms(snapshot('commercial', 'rent', { commercial_rent: 100, commercial_rent_period: 'week' }));
  assert.equal(unsupported.terms.commercial_rent.original_period, 'week');
  assert.equal(unsupported.terms.commercial_rent.period, 'unknown');
});

test('numeric representations of explicit zero stay declared in permissible commercial fields', () => {
  for (const amount of [0, '0', '0.00', '0.0e-2']) {
    const result = normalizeBudgetTerms(snapshot('commercial', 'transfer', { commercial_premium: amount }));
    assert.equal(result.terms.commercial_premium.amount_minor, 0);
    assert.equal(result.terms.commercial_premium.state, 'known');
    assert.equal(result.terms.commercial_premium.original_value, amount);
  }
});

test('an undeclared ceiling does not invent which field supplied it', () => {
  const result = normalizeBudgetTerms(snapshot('residential', 'rent', {}));
  assert.equal(result.terms.budget_ceiling.state, 'unknown');
  assert.equal(result.terms.budget_ceiling.amount_minor, null);
  assert.equal(result.terms.budget_ceiling.source_field, null);
  assert.ok(issue(result, 'budget_ceiling', 'not_declared'));
});

test('unbranded criteria with no declared currency remain unknown, regardless of asserted source labels', () => {
  for (const extra of [{}, { source: 'applicants', trusted: true }, { source_contract: 'applicants_gbp' }]) {
    const result = normalizeBudgetTerms({ search_category: 'residential', operation: 'rent', criteria: { budget_max: 2000 }, ...extra });
    assert.equal(result.terms.budget_max.currency, null);
    assert.equal(result.terms.budget_max.state, 'unknown');
    assert.equal(result.terms.budget_max.amount_minor, null);
    assert.ok(issue(result, 'budget_max', 'currency_unknown'));
  }
});

test('residential limits apply independently to minimum, maximum and stretch for each operation', () => {
  for (const [operation, lower, below, upper, above] of [
    ['rent', 100, 99.99, 50000, 50000.01],
    ['buy', 10000, 9999.99, 100000000, 100000000.01],
  ]) for (const field of ['budget_min', 'budget_max', 'budget_stretch']) {
    for (const amount of [lower, upper]) {
      const result = normalizeBudgetTerms(snapshot('residential', operation, { [field]: amount }));
      assert.equal(result.terms[field].state, 'known', `${operation} ${field} ${amount}`);
      assert.equal(result.terms[field].amount_minor, amount * 100);
    }
    for (const amount of [below, above]) {
      const result = normalizeBudgetTerms(snapshot('residential', operation, { [field]: amount }));
      assert.equal(result.terms[field].state, 'unknown', `${operation} ${field} ${amount}`);
      assert.equal(result.terms[field].amount_minor, null);
      assert.equal(result.terms[field].original_value, amount);
      assert.ok(issue(result, field, 'amount_out_of_range'));
      assert.equal(result.terms.budget_ceiling.state, 'unknown');
    }
  }
});

test('commercial limits preserve zero only where it is permitted and reject both adjacent outliers', () => {
  for (const [field, minimum] of [['commercial_purchase', 0.01], ['commercial_rent', 0.01],
    ['commercial_premium', 0], ['commercial_expenses', 0]]) {
    for (const amount of [minimum, 100000000]) {
      const result = normalizeBudgetTerms(snapshot('commercial', 'transfer', { [field]: amount, commercial_rent_period: 'month' }));
      assert.equal(result.terms[field].amount_minor, amount * 100, `${field} ${amount}`);
      assert.equal(result.terms[field].original_value, amount);
    }
    for (const amount of [minimum === 0 ? -0.01 : 0, 100000000.01]) {
      const result = normalizeBudgetTerms(snapshot('commercial', 'transfer', { [field]: amount, commercial_rent_period: 'month' }));
      assert.equal(result.terms[field].state, 'unknown', `${field} ${amount}`);
      assert.equal(result.terms[field].amount_minor, null);
      assert.equal(result.terms[field].original_value, amount);
      assert.ok(issue(result, field, 'amount_out_of_range'));
    }
  }
});

test('invalid originals stay bounded and primitives are preserved without traversing objects', () => {
  const invalid = '1,234.56';
  let invoked = false;
  const object = { toString() { invoked = true; throw new Error('private'); } };
  const long = '7'.repeat(10001);
  for (const [value, original, status] of [[invalid, invalid, 'preserved'], [long, null, 'too_long'], [object, null, 'unsupported_type']]) {
    const result = normalizeBudgetTerms(snapshot('residential', 'rent', { budget_max: value }));
    assert.equal(result.terms.budget_max.state, 'unknown');
    assert.equal(result.terms.budget_max.amount_minor, null);
    assert.equal(result.terms.budget_max.original_value, original);
    assert.equal(result.terms.budget_max.original_status, status);
    assert.ok(issue(result, 'budget_max', 'invalid_amount'));
  }
  assert.equal(invoked, false);
});

test('hostile input properties fail closed without invoking getters or exposing their errors', () => {
  let invoked = false;
  const data = snapshot('residential', 'rent', {});
  Object.defineProperty(data.criteria, 'budget_max', { get() { invoked = true; throw new Error('private'); } });
  assert.throws(() => normalizeBudgetTerms(data), error => error instanceof TypeError && !error.message.includes('private'));
  assert.equal(invoked, false);
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('private'); } });
  assert.throws(() => normalizeBudgetTerms(proxy), error => error instanceof TypeError && !error.message.includes('private'));
});

test('a nonzero amount too small for Number does not become an explicitly declared zero', () => {
  for (const field of ['commercial_premium', 'commercial_expenses']) {
    const result = normalizeBudgetTerms(snapshot('commercial', 'transfer', { [field]: '1e-400' }));
    assert.equal(result.terms[field].original_value, '1e-400');
    assert.equal(result.terms[field].state, 'unknown');
    assert.equal(result.terms[field].amount_minor, null);
    assert.ok(issue(result, field, 'sub_penny_review'));
  }
});

test('commercial validation and normalization share immutable limits at every boundary', () => {
  const limits = applicants.COMMERCIAL_BUDGET_LIMITS;
  assert.ok(limits);
  assert.ok(Object.isFrozen(limits));
  for (const [field, minimum] of [['commercial_purchase', 0.01], ['commercial_rent', 0.01],
    ['commercial_premium', 0], ['commercial_expenses', 0]]) {
    assert.ok(Object.isFrozen(limits[field]));
    assert.deepEqual(limits[field], [minimum, 100000000]);
    for (const amount of [minimum, 100000000, minimum === 0 ? -0.01 : 0, 100000000.01]) {
      const body = { operation: 'rent', search_category: 'commercial', source: 'phone', name: 'Synthetic',
        email: 'limits@example.test', commercial_rent_period: 'month', [field]: amount };
      const valid = !applicants.validateApplicant(body, { publicForm: false }).errors?.[field];
      const result = normalizeBudgetTerms(snapshot('commercial', 'rent', { [field]: amount, commercial_rent_period: 'month' }));
      assert.equal(result.terms[field].amount_minor !== null, valid, `${field} ${amount}`);
    }
  }
});

test('large malformed objects are rejected without copying or accessing their contents', () => {
  let accessed = false;
  const object = { payload: 'x'.repeat(100000) };
  Object.defineProperty(object, 'private', { enumerable: true, get() { accessed = true; throw new Error('private'); } });
  const result = normalizeBudgetTerms(snapshot('commercial', 'transfer', { commercial_premium: object }));
  assert.equal(result.terms.commercial_premium.state, 'unknown');
  assert.equal(result.terms.commercial_premium.amount_minor, null);
  assert.equal(result.terms.commercial_premium.original_value, null);
  assert.equal(result.terms.commercial_premium.original_status, 'unsupported_type');
  assert.equal(accessed, false);
});
