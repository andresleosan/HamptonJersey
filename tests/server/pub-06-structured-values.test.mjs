import test from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMIC_FIELDS, economicValue, checkEconomicTerms } from '../../server/listing-economics.js';

const amounts = ['rental_deposit_amount', 'parish_rates_amount', 'service_charge_amount'];
const periods = ['parish_rates_period', 'service_charge_period'];

test('structured optional amounts preserve zero and exact hundredths', () => {
  assert.deepEqual(ECONOMIC_FIELDS, [...amounts, ...periods]);
  for (const field of amounts) {
    for (const value of [null, '', '  ']) assert.equal(economicValue(field, value), null);
    for (const value of [0, 0.01, 0.29, 1250.50, 9999999999.99]) assert.equal(economicValue(field, value), value);
    for (const value of [-1, 1.001, 10000000000, NaN, Infinity, -Infinity, '0.29', true, [], {}])
      assert.throws(() => economicValue(field, value), Error, `${field}: ${String(value)}`);
  }
});

test('only explicit month or year is accepted; an unknown field never becomes a value', () => {
  for (const field of periods) {
    for (const value of [null, '', '  ']) assert.equal(economicValue(field, value), null);
    for (const value of ['month', 'year']) assert.equal(economicValue(field, value), value);
    for (const value of ['week', 'Month', 1, [], {}]) assert.throws(() => economicValue(field, value));
  }
  assert.throws(() => economicValue('rental_deposit', 'existing free text'));
});

test('zero costs require a currency and each recurrent cost needs its own period', () => {
  const row = { rental_deposit_amount: 0, parish_rates_amount: 0, service_charge_amount: 20 };
  assert.deepEqual(Object.keys(checkEconomicTerms(row)).sort(), ['currency', 'parish_rates_period', 'service_charge_period']);
  assert.deepEqual(checkEconomicTerms({ ...row, currency: 'GBP', parish_rates_period: 'year', service_charge_period: 'month' }), {});
  assert.ok(checkEconomicTerms({ ...row, currency: 'XXX', parish_rates_period: 'year', service_charge_period: 'month' }).currency);
  assert.deepEqual(checkEconomicTerms({ currency: null, parish_rates_amount: null, parish_rates_period: 'year' }), {});
});

test('independent periods and merged values reject invalid combinations without mutating inputs', () => {
  const stored = { currency: 'EUR', parish_rates_amount: 100, parish_rates_period: 'year', service_charge_amount: null };
  const before = structuredClone(stored);
  assert.deepEqual(checkEconomicTerms(stored), {});
  assert.ok(checkEconomicTerms({ ...stored, parish_rates_period: null }).parish_rates_period);
  assert.ok(checkEconomicTerms({ ...stored, currency: null }).currency);
  assert.ok(checkEconomicTerms({ ...stored, service_charge_amount: 0 }).service_charge_period);
  assert.deepEqual(stored, before);
});

test('the existing listing validator accepts structured costs only under its explicit server-side capability', async () => {
  const { validateListing, checkPrice } = await import('../../server/listing.js');
  const input = { rental_deposit_amount: 0.29, parish_rates_amount: 0, parish_rates_period: 'year',
    service_charge_amount: 22.5, service_charge_period: 'month' };
  assert.deepEqual(validateListing(input, { partial: true }).value, {});
  const enabled = validateListing(input, { partial: true, structuredEconomics: true });
  assert.deepEqual(enabled.value, input);
  for (const key of amounts) assert.ok(validateListing({ [key]: 0.001 }, { partial: true, structuredEconomics: true }).errors[key]);
  assert.deepEqual(checkPrice({ ...input, currency: 'GBP' }), {});
  assert.ok(checkPrice({ ...input, currency: null }).currency);
  assert.ok(checkPrice({ ...input, currency: 'GBP', parish_rates_period: null }).parish_rates_period);
});

test('structured editing stays disabled unless the explicit switch, columns, marker and audit triggers agree', async () => {
  const { structuredEconomicsReady } = await import('../../server/listing-economics.js');
  let calls = 0;
  assert.equal(await structuredEconomicsReady({ DB: { prepare() { calls++; throw Error('not needed'); } } }), false);
  assert.equal(calls, 0);
  assert.equal(await structuredEconomicsReady({ PUB06_STRUCTURED_ECONOMICS_READY: '1' }), false);
  const fields = ECONOMIC_FIELDS;
  const insert = 'SPR01_AVAILABLE_ON_BEGIN ' + fields.map(field => `'${field}', NEW.${field}, '${field}'`).join(' ');
  const update = 'SPR01_AVAILABLE_ON_BEGIN '.repeat(2) + fields.map(field =>
    `'${field}', OLD.${field}, '${field}', NEW.${field}, '${field}', NEW.${field} IS NOT OLD.${field}`).join(' ');
  const constraints = fields.map(field => `NEW.${field}`).join(' ') + " NEW.currency RAISE(ABORT,'Incomplete structured costs')";
  const guards = [{ name: 'pub06_costs_guard_insert', sql: constraints }, { name: 'pub06_costs_guard_update', sql: constraints }];
  function env({ marker = 1, triggerRows = [{ name: 'listing_event_insert', sql: insert },
    { name: 'listing_event_update', sql: update }, ...guards], failColumns = false } = {}) {
    return { PUB06_STRUCTURED_ECONOMICS_READY: '1', DB: { prepare(sql) {
      if (sql.includes('pub06_structured_costs')) return { first: async () => marker == null ? null : { version: marker } };
      if (sql.includes('sqlite_master')) return { all: async () => ({ results: triggerRows }) };
      return { all: async () => { if (failColumns) throw Error('no schema'); return { results: [] }; } };
    } } };
  }
  assert.equal(await structuredEconomicsReady(env()), true);
  assert.equal(await structuredEconomicsReady(env({ marker: null })), false);
  assert.equal(await structuredEconomicsReady(env({ marker: 2 })), false);
  assert.equal(await structuredEconomicsReady(env({ triggerRows: [] })), false);
  assert.equal(await structuredEconomicsReady(env({ triggerRows: [{ name: 'listing_event_insert', sql: insert },
    { name: 'listing_event_update', sql: update.replace("'service_charge_period', NEW.service_charge_period,", '') }, ...guards] })), false);
  assert.equal(await structuredEconomicsReady(env({ triggerRows: [{ name: 'listing_event_insert', sql: insert },
    { name: 'listing_event_update', sql: update }] })), false);
  assert.equal(await structuredEconomicsReady(env({ failColumns: true })), false);
});

test('the transactional schema guard references every audited term and the exact marker', async () => {
  const { ECONOMICS_GUARD_SQL, hasEconomicInput } = await import('../../server/listing-economics.js');
  assert.ok(ECONOMICS_GUARD_SQL.includes('pub06_structured_costs'));
  assert.ok(ECONOMICS_GUARD_SQL.includes('listing_event_insert'));
  assert.ok(ECONOMICS_GUARD_SQL.includes('listing_event_update'));
  assert.ok(ECONOMICS_GUARD_SQL.includes('pub06_costs_guard_insert'));
  assert.ok(ECONOMICS_GUARD_SQL.includes('pub06_costs_guard_update'));
  for (const field of ECONOMIC_FIELDS) assert.ok(ECONOMICS_GUARD_SQL.includes(field));
  assert.equal(hasEconomicInput({ title: 'Example' }), false);
  for (const field of ECONOMIC_FIELDS) assert.equal(hasEconomicInput({ [field]: null }), true);
});
