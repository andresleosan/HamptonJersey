import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAccountingCsv } from '../../server/rental-accounting-csv.js';
import { parseCsv } from '../../server/rentals.js';

const row = (overrides = {}) => ({ schema_version: 1, record_type: 'rent_charges', record_id: 'id-1', tenancy_ref: 'T-1', date: '2026-11-01', kind: 'rent', currency: 'GBP', amount_pence: 12500, direction: 'debit', related_id: null, revision: 1, ...overrides });
const read = bytes => parseCsv(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

test('encodes the fixed columns as UTF-8 RFC4180 with reversible quotes and line breaks', () => {
  const bytes = encodeAccountingCsv([row({ tenancy_ref: '£, "flat"\r\nJersey' })]);
  assert.ok(bytes instanceof Uint8Array);
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.endsWith('\r\n'));
  assert.deepEqual(read(bytes), [
    ['schema_version','record_type','record_id','tenancy_ref','date','kind','currency','amount_pence','direction','related_id','revision'],
    ['1','rent_charges','id-1','£, "flat"\r\nJersey','2026-11-01','rent','GBP','12500','debit','','1']
  ]);
});

test('protects external text beginning with formula markers or control characters', () => {
  for (const input of ['=1+1', '+1', '-1', '@x', '\tvalue', '\rvalue', '\nvalue', ' =1', '\u0000value', '\u0085value']) {
    assert.equal(read(encodeAccountingCsv([row({ tenancy_ref: input })]))[1][3], "'" + input);
  }
  assert.equal(read(encodeAccountingCsv([row({ amount_pence: -1 })]))[1][7], '-1');
});

test('accepts only the four record types and bounded integer GBP pence', () => {
  for (const record_type of ['rent_charges','rent_payments','rent_adjustments','landlord_statement_lines']) {
    assert.equal(read(encodeAccountingCsv([row({ record_type })]))[1][1], record_type);
  }
  for (const overrides of [{ record_type: 'other' }, { currency: 'USD' }, { amount_pence: 0.1 }, { amount_pence: 100000001 }, { amount_pence: -100000001 }, { amount_pence: NaN }]) {
    assert.throws(() => encodeAccountingCsv([row(overrides)]));
  }
});

test('rejects invalid dates, missing or additional fields and malformed text', () => {
  for (const overrides of [{ date: '2026-02-29' }, { date: '2026-1-01' }, { revision: 0 }, { schema_version: 1.5 }, { tenancy_ref: '\ud800' }, { bank_account: 'secret' }]) {
    assert.throws(() => encodeAccountingCsv([row(overrides)]));
  }
  const missing = row(); delete missing.kind;
  assert.throws(() => encodeAccountingCsv([missing]));
});

test('rejects more than 50000 rows rather than truncating', () => {
  assert.throws(() => encodeAccountingCsv(Array(50001).fill(row())));
});

test('accepts the 50000-row boundary and rejects sparse rows', () => {
  assert.equal(read(encodeAccountingCsv(Array(50000).fill(row()))).length, 50001);
  assert.throws(() => encodeAccountingCsv(Array(1)));
});
