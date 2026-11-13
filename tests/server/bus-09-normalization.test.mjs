import test from 'node:test';
import assert from 'node:assert/strict';

let extraction, contracts;
try { extraction = await import('../../server/market-extraction.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
try { contracts = await import('../../server/market-source-contracts.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const needExtraction = () => assert.ok(extraction, 'BUS-09 normalization is not implemented yet');
const needContracts = () => assert.ok(contracts, 'BUS-09 source contracts are not implemented yet');
const observation = overrides => ({ country_code: 'JE', territory_evidence: 'fixture-territory',
  operation: 'rent', observed_at: '2026-11-13T12:00:00.000Z', financial_terms: [], ...overrides });
const term = overrides => ({ kind: 'rent', amount_minor: 12000, currency: 'GBP', period: 'year',
  raw_text: 'fixture annual rent', evidence_ref: 'fixture-evidence', ...overrides });

test('own prices use exact decimal scaling and preserve sub-penny uncertainty', () => {
  needExtraction();
  for (const [value, amount] of [[1.01,101],[0.1,10],[1e3,100000]]) {
    const result = extraction.ownMoneyToMinor(value, 'GBP');
    assert.equal(result.amount_minor, amount);
    assert.equal(result.original_value, value);
    assert.equal(result.original_unit, 'GBP_major');
    assert.equal(result.issue, null);
  }
  const fraction = extraction.ownMoneyToMinor(1.005, 'GBP');
  assert.equal(fraction.amount_minor, null);
  assert.equal(fraction.issue, 'sub_penny_review');
  assert.equal(extraction.ownMoneyToMinor(12, null).amount_minor, null);
  assert.equal(extraction.ownMoneyToMinor(0, 'GBP').amount_minor, null);
  assert.equal(extraction.ownMoneyToMinor(90071992547410, 'GBP').amount_minor, null);
});

test('currency scaling respects each currency minor-unit exponent', () => {
  needExtraction();
  assert.equal(extraction.ownMoneyToMinor(1, 'JPY').amount_minor, 1);
  assert.equal(extraction.ownMoneyToMinor(1, 'KWD').amount_minor, 1000);
  assert.equal(extraction.ownMoneyToMinor(1.001, 'KWD').amount_minor, 1001);
  assert.equal(extraction.ownMoneyToMinor(1.1, 'JPY').amount_minor, null);
});

test('out-of-operation financial fields retain source values but cannot be compared', () => {
  needExtraction();
  const sale = extraction.normalizeOwnListing({ id:'fixture-sale', country:'Jersey', operation:'sale',
    sale_price:200000, rent:1800, rent_period:'month', premium:25000, currency:'GBP',
    updated_at:'2026-11-13T12:00:00.000Z' });
  assert.deepEqual(sale.financial_terms.map(t => t.kind), ['sale_price']);
  for (const [kind, amount] of [['rent', 1800], ['premium', 25000]]) {
    const source = sale.source_financials.find(t => t.kind === kind);
    assert.ok(source, kind);
    assert.equal(source.original_value, amount);
    assert.equal(source.comparison_eligible, false);
    assert.equal(source.amount_minor, null);
  }
  assert.equal(sale.monthly_rent_minor, null);
  assert.ok(sale.issues.includes('out_of_scope_financial_fields'));
});

test('own listings exclude International and map sale and rent by operation and tenure', () => {
  needExtraction();
  const listing = { id:'fixture-own', country:'Jersey', operation:'business', title:'Example',
    premium:5000, rent:12000, rent_period:'year', currency:'GBP', bedrooms:0,
    updated_at:'2026-11-13T12:00:00.000Z', private_notes:'fixture private note' };
  assert.equal(extraction.normalizeOwnListing({...listing,country:'International'}), null);
  const result = extraction.normalizeOwnListing(listing);
  assert.deepEqual(result.financial_terms.map(t=>t.kind), ['rent']);
  assert.equal(result.monthly_rent_minor, 100000);
  assert.equal(result.source_financials[0].original_value, 12000);
  assert.equal(result.source_financials[0].original_unit, 'GBP_major');
  assert.equal(JSON.stringify(result).includes('fixture private note'), false);
  const sale = extraction.normalizeOwnListing({...listing, operation:'sale', sale_price:1.005});
  assert.deepEqual(sale.financial_terms.map(t=>t.kind), ['sale_price']);
  assert.equal(sale.financial_terms[0].amount_minor, null);
  assert.ok(sale.issues.includes('sub_penny_review'));
  assert.ok(sale.issues.includes('out_of_scope_financial_fields'));
});

test('annual and weekly rents compare monthly without changing the original term', () => {
  needExtraction();
  const annual = term({ amount_minor: 12000, period: 'year' });
  const weekly = term({ amount_minor: 100, period: 'week' });
  const a = extraction.normalizeObservation(observation({ financial_terms: [annual] }));
  const w = extraction.normalizeObservation(observation({ financial_terms: [weekly] }));
  assert.equal(a.monthly_rent_minor, 1000);
  assert.equal(w.monthly_rent_minor, 433);
  assert.deepEqual(a.financial_terms, [annual]);
  assert.deepEqual(w.financial_terms, [weekly]);
  assert.equal(extraction.normalizeObservation(observation({ financial_terms: [term({ period: 'unknown' })] })).monthly_rent_minor, null);
  assert.equal(extraction.normalizeObservation(observation({ financial_terms: [term({ currency: null })] })).monthly_rent_minor, null);
});

test('premium, sale price and fees never become rent or get added together', () => {
  needExtraction();
  const terms = [term({kind:'premium',amount_minor:100000,period:'sale'}),
    term({kind:'sale_price',amount_minor:300000,period:'sale'}),
    term({kind:'service_charge',amount_minor:200,period:'month'})];
  const normalized = extraction.normalizeObservation(observation({ operation:'business',financial_terms:terms }));
  assert.equal(normalized.monthly_rent_minor, null);
  assert.deepEqual(normalized.financial_terms, terms);
  const contradictory = extraction.normalizeObservation(observation({financial_terms:[term(),term({amount_minor:24000})]}));
  assert.equal(contradictory.monthly_rent_minor, null);
  assert.ok(contradictory.issues.includes('multiple_rents_review'));
});

test('a sale does not gain a monthly rent from an unrelated financial field', () => {
  needExtraction();
  const result = extraction.normalizeObservation(observation({ operation:'sale', financial_terms:[term()] }));
  assert.equal(result.monthly_rent_minor, null);
  assert.ok(result.issues.includes('rent_not_for_operation_review'));
  assert.equal(result.financial_terms[0].amount_minor, 12000);
});

test('an unrecognized currency is preserved but cannot be compared as monthly rent', () => {
  needExtraction();
  const result = extraction.normalizeObservation(observation({ financial_terms:[term({currency:'ZZZ'})] }));
  assert.equal(result.financial_terms[0].currency, 'ZZZ');
  assert.equal(result.monthly_rent_minor, null);
  assert.ok(result.issues.includes('currency_unknown'));
  assert.equal(extraction.ownMoneyToMinor(12, 'ZZZ').amount_minor, null);
});

test('zero bedrooms is known, absent pets stays unknown, and territory requires evidence', () => {
  needExtraction();
  const normalized = extraction.normalizeObservation(observation({ bedrooms:0 }));
  assert.equal(normalized.fields.bedrooms, 0);
  assert.equal(normalized.fields.pets, null);
  assert.ok(normalized.present_fields.includes('bedrooms'));
  assert.ok(!normalized.present_fields.includes('pets'));
  assert.throws(() => extraction.normalizeObservation(observation({ country_code:'GB' })), /territory/i);
  assert.throws(() => extraction.normalizeObservation(observation({ territory_evidence:null })), /territory/i);
});

test('normalization never overwrites human facts or promotes private contact data', () => {
  needExtraction();
  const input = observation({ bedrooms:0, contact_email:'private@example.test', private_notes:'fixture private note' });
  const snapshot = structuredClone(input);
  const normalized = extraction.normalizeObservation(input);
  assert.deepEqual(input, snapshot);
  assert.equal(JSON.stringify(normalized).includes('private@example.test'), false);
  assert.equal(JSON.stringify(normalized).includes('fixture private note'), false);
  const current = { bedrooms:{value:2,authority:'human',updated_at:'2026-11-14T00:00:00.000Z'},
    pets:{value:true,authority:'human',updated_at:'2026-11-12T00:00:00.000Z'} };
  assert.deepEqual(extraction.mergeObservedFields(current, normalized), current);
});

test('facts with unknown authority are not overwritten by an extracted observation', () => {
  needExtraction();
  const normalized = extraction.normalizeObservation(observation({ bedrooms:0 }));
  const current = { bedrooms:{value:3,updated_at:'2026-01-01T00:00:00.000Z'} };
  assert.deepEqual(extraction.mergeObservedFields(current, normalized), current);
});

test('legacy zero and false facts with unknown authority remain unchanged', () => {
  needExtraction();
  const normalized = extraction.normalizeObservation(observation({ bedrooms:3, pets:true }));
  const current = { bedrooms:0, pets:false };
  assert.deepEqual(extraction.mergeObservedFields(current, normalized), current);
});

test('an empty or synthetic source contract never claims an external reader is ready', () => {
  needContracts();
  const empty = contracts.validateSourceContract({});
  assert.equal(empty.status, 'source_contract_pending');
  assert.ok(empty.missing.length > 0);
  const synthetic = contracts.validateSourceContract({ source_ref:'fixture-source', channel_id:'site',
    manifest_revision:'fixture-revision', policy_version:1, method:'http', allowed_hosts:['fixture.invalid'],
    allowed_paths:['/listings/'], reader_id:'fixture-reader', fixture_path:'tests/fixtures/market/example.json',
    fixture_sha256:'a'.repeat(64), fixture_origin:'synthetic_only', field_map:{title:'title'},
    pagination_test:'fixture-paging', territorial_scope:'JE', duplicate_cases:['fixture-duplicate'],
    error_cases:['fixture-error'], expected_count_behavior:'unknown_on_error', accepted_at:'2026-11-13T12:00:00.000Z',
    reviewer_ref:'fixture-review', annex_sha256:'b'.repeat(64) });
  assert.equal(synthetic.status, 'source_contract_pending');
  assert.ok(synthetic.missing.includes('permitted_provider_fixture'));
});

test('malformed contract fields remain visibly pending without exposing a reader definition', () => {
  needContracts();
  const result = contracts.validateSourceContract({ source_ref:'https://fixture.invalid/private', channel_id:'site',
    manifest_revision:'fixture-revision', policy_version:-1, method:'ftp', allowed_hosts:['127.0.0.1'],
    allowed_paths:['/../private'], reader_id:'../../reader', fixture_path:'../../private.json', fixture_sha256:'bad',
    fixture_origin:'provider_permitted', field_map:{title:'title'}, pagination_test:'fixture-paging', territorial_scope:'JE',
    duplicate_cases:['fixture-duplicate'], error_cases:['fixture-error'], expected_count_behavior:'unknown_on_error',
    accepted_at:'2026-11-13T12:00:00.000Z', reviewer_ref:'fixture-review', annex_sha256:'b'.repeat(64) });
  assert.equal(result.status, 'source_contract_pending');
  assert.equal(result.definition, null);
  for (const field of ['source_ref','policy_version','method','allowed_hosts','allowed_paths','reader_id','fixture_path','fixture_sha256'])
    assert.ok(result.missing.includes(field), field);
  assert.ok(result.missing.includes('independent_evidence_verification'));
});

test('a structurally complete external contract still needs independently verified evidence', () => {
  needContracts();
  const result = contracts.validateSourceContract({ source_ref:'fixture-source', channel_id:'site',
    manifest_revision:'fixture-revision', policy_version:1, method:'http', allowed_hosts:['fixture.invalid'],
    allowed_paths:['/listings/'], reader_id:'fixture_reader_v1', fixture_path:'tests/fixtures/market/example.json',
    fixture_sha256:'a'.repeat(64), fixture_origin:'provider_permitted', field_map:{title:'title'},
    pagination_test:'fixture-paging', territorial_scope:'JE', duplicate_cases:['fixture-duplicate'],
    error_cases:['fixture-error'], expected_count_behavior:'unknown_on_error', accepted_at:'2026-11-13T12:00:00.000Z',
    reviewer_ref:'fixture-review', annex_sha256:'b'.repeat(64) });
  assert.equal(result.status, 'source_contract_pending');
  assert.deepEqual(result.missing, ['independent_evidence_verification']);
  assert.equal(result.definition, null);
});
