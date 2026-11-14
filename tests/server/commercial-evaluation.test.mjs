// BUS-12, plan task 3: a commercial or business search against Hampton's own commercial listings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../server/matching.js';
import { recomputeForListing } from '../../server/match-store.js';
import { makeEnv, call, adminCookie, seedListing } from './helpers.mjs';

const search = o => ({ search_category: 'commercial', operation: 'rent', search_operation: null, commercial_rent: 2000,
  commercial_rent_period: 'month', ...o });
const transfer = o => search({ search_operation: 'transfer', commercial_premium: 50000, ...o });
const listing = o => ({ use: 'commercial', operation: 'rent', availability: 'to_let', archived_at: null, rent: 24000, rent_period: 'year',
  currency: 'GBP', parish: 'St Helier', interior_area_sqft: 1200, property_type: 'Office', bedrooms: 3, ...o });
const business = o => listing({ operation: 'business', availability: 'for_sale', premium: 50000, ...o });
const check = (r, key) => r.checks.find(c => c.key === key);

test('a yearly rent is compared per month and both original figures stay as written', () => {
  const fits = evaluate(search(), listing());
  assert.deepEqual([fits.pass, fits.requirements_status], [true, 'meets']);
  assert.deepEqual([check(fits, 'rent').result, check(fits, 'rent').evidence], ['meets', '£24,000 a year']);
  const over = evaluate(search(), listing({ rent: 24012 }));
  assert.deepEqual([over.pass, over.requirements_status], [true, 'alternative']);
  assert.equal(check(over, 'rent').evidence, '£24,012 a year, over £2,000 a month');
  assert.equal(check(evaluate(search({ commercial_rent: 24000, commercial_rent_period: 'year' }), listing({ rent: 2000, rent_period: 'month' })), 'rent').result, 'meets');
});

test('premium and rent are separate limits, never one sum', () => {
  const both = evaluate(transfer(), business());
  assert.deepEqual([check(both, 'premium').result, check(both, 'rent').result, both.requirements_status], ['meets', 'meets', 'meets']);
  assert.equal(check(both, 'premium').evidence, '£50,000');
  const dear = evaluate(transfer(), business({ premium: 60000 }));
  assert.deepEqual([check(dear, 'premium').result, check(dear, 'rent').result, dear.requirements_status], ['fails', 'meets', 'alternative']);
  // A zero premium limit is a limit; a premium the listing does not give is unknown, not zero.
  assert.equal(check(evaluate(transfer({ commercial_premium: 0 }), business()), 'premium').result, 'fails');
  assert.equal(check(evaluate(transfer(), business({ premium: null })), 'premium').result, 'unknown');
});

test('a purchase limit is compared with the sale price only', () => {
  const buy = search({ operation: 'buy', commercial_rent: null, commercial_rent_period: null, commercial_purchase: 400000 });
  const sale = o => listing({ operation: 'sale', availability: 'for_sale', rent: null, rent_period: null, sale_price: 400000, ...o });
  assert.equal(evaluate(buy, sale()).requirements_status, 'meets');
  assert.equal(evaluate(buy, sale({ sale_price: 400001 })).requirements_status, 'alternative');
  assert.equal(evaluate(buy, sale({ sale_price: null })).requirements_status, 'pending');
  assert.equal(check(evaluate(buy, sale()), 'rent'), undefined);
});

test('a term that cannot be compared is unknown and pending, never met or failed', () => {
  for (const [a, l, key] of [[{}, { currency: 'EUR' }, 'rent'], [{}, { currency: null }, 'rent'], [{}, { rent: null }, 'rent'],
    [{}, { rent_period: null }, 'rent'], [{ commercial_rent_period: null }, {}, 'rent'], [{ commercial_expenses: 1500 }, {}, 'expenses'],
    [{ commercial_use: 'Cafe' }, {}, 'use'], [{ area_min: 100, area_unit: 'sqm' }, { interior_area_sqft: null }, 'floor_area'],
    [{ parishes_wanted: '["St Helier"]' }, { parish: null }, 'area'], [{ parishes_excluded: '["Trinity"]' }, { parish: null }, 'area']]) {
    const r = evaluate(search(a), listing(l));
    assert.equal(check(r, key)?.result, 'unknown', JSON.stringify([a, l]));
    assert.deepEqual([r.pass, r.requirements_status], [true, 'pending'], JSON.stringify([a, l]));
  }
  assert.equal(check(evaluate(search({ commercial_use: 'Cafe' }), listing()), 'use').evidence, 'Office');
  assert.equal(check(evaluate(search(), listing({ currency: 'EUR' })), 'rent').evidence, 'Confirm whether the EUR price fits the GBP budget');
});

test('floor area is a range in the unit the search states; 1 sq ft is 0.09290304 sq m', () => {
  const sqm = o => evaluate(search({ area_min: 100, area_max: 120, area_unit: 'sqm' }), listing(o));
  assert.deepEqual([check(sqm({}), 'floor_area').result, check(sqm({}), 'floor_area').evidence], ['meets', '1,200 sq ft (111.5 sq m)']);
  assert.equal(sqm({ interior_area_sqft: 1000 }).requirements_status, 'alternative'); // 92.9 sq m
  assert.equal(sqm({ interior_area_sqft: 1400 }).requirements_status, 'alternative'); // 130.1 sq m
  assert.equal(evaluate(search({ area_min: 1200, area_max: 1200, area_unit: 'sqft' }), listing()).requirements_status, 'meets');
  assert.equal(check(evaluate(search({ area_min: 1200 }), listing()), 'floor_area').result, 'unknown'); // no unit, no guess
});

test('a transfer is a business, not a property sale or let; the kind asked for is checked', () => {
  assert.equal(evaluate(transfer(), listing({ operation: 'sale', availability: 'for_sale', sale_price: 50000 })).requirements_status, 'excluded');
  assert.equal(evaluate(transfer(), listing()).pass, false);
  assert.equal(evaluate(search(), business()).pass, false);
  assert.equal(evaluate(transfer({ commercial_kind: 'business' }), business()).requirements_status, 'meets');
  assert.equal(evaluate(search({ commercial_kind: 'both' }), listing()).requirements_status, 'meets');
  const wrong = evaluate(search({ commercial_kind: 'business' }), listing());
  assert.deepEqual([check(wrong, 'kind').result, wrong.requirements_status], ['fails', 'alternative']);
});

test('exclusions stay exclusions and no residential rule applies', () => {
  for (const [a, l] of [[{ parishes_excluded: '["St Helier"]' }, {}], [{}, { archived_at: '2026-11-14' }], [{}, { availability: 'under_offer' }],
    [{}, { use: 'residential' }]])
    assert.deepEqual([evaluate(search(a), listing(l)).pass, evaluate(search(a), listing(l)).requirements_status], [false, 'excluded'], JSON.stringify([a, l]));
  const away = evaluate(search({ parishes_wanted: '["Trinity"]' }), listing());
  assert.deepEqual([away.pass, check(away, 'area').result, away.requirements_status], [true, 'fails', 'alternative']);
  // Leftover residential answers and the listing's bedrooms are ignored.
  const r = evaluate(search({ bedrooms_min: 5, budget_max: 100, parking_spaces: 3, pets: '[{"kind":"dog","count":1}]', housing_status: 'standard' }),
    listing({ housing_category: 'qualified' }));
  assert.deepEqual(r.checks.map(c => c.key), ['rent']);
  assert.equal(r.requirements_status, 'meets');
});

test('commercial searches get their own matches from commercial listings, by the panel routes', async () => {
  const env = makeEnv();
  const seed = (id, o = {}) => seedListing(env, { id, use: 'commercial', operation: 'rent', availability: 'to_let', sale_price: null, rent: 24000,
    rent_period: 'year', bedrooms: null, parish: 'St Helier', interior_area_sqft: 1200, matchable: 1, ...o });
  seed('COM-1-met');
  seed('COM-2-no-area', { interior_area_sqft: null });
  seed('COM-3-euro', { currency: 'EUR' });
  seed('COM-4-over', { rent: 36000 });
  seed('COM-5-small', { interior_area_sqft: 500 });
  seed('COM-6-vetoed', { parish: 'Trinity' });
  seed('COM-7-business', { operation: 'business', availability: 'for_sale', premium: 50000 });
  seed('HOME-1', { use: 'residential', rent: 1800, rent_period: 'month', bedrooms: 2 });
  const req = async (method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
  const person = { name: 'Test trader', email: 'trader@example.test', source: 'phone' };
  const made = await req('POST', '/admin/applicants', { ...person, search_category: 'commercial', operation: 'rent', commercial_kind: 'property',
    commercial_rent: 2000, commercial_rent_period: 'month', area_min: 100, area_max: 120, area_unit: 'sqm', parishes_excluded: ['Trinity'] });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const found = async id => (await req('GET', `/admin/applicants/${id}/matches?status=found`)).data.matches.map(m => [m.listing.id, m.requirements_status]);
  assert.deepEqual(await found(made.data.id), [['COM-1-met', 'meets'], ['COM-2-no-area', 'pending'], ['COM-3-euro', 'pending'],
    ['COM-4-over', 'alternative'], ['COM-5-small', 'alternative']]);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM notifications WHERE category='matched' AND title='5 new matches for Test trader'").get().n, 1);
  const next = (await req('GET', '/admin/review')).data; // the review queue shows it like any other match
  assert.deepEqual([next.listing.id, next.match.requirements_status], ['COM-1-met', 'meets']);
  // A home search still sees homes only.
  const home = await req('POST', '/admin/applicants', { name: 'Test household', email: 'household@example.test', source: 'phone', operation: 'rent',
    budget_max: 2000 });
  assert.equal(home.status, 201, JSON.stringify(home.data));
  assert.deepEqual((await found(home.data.id)).map(([id]) => id), ['HOME-1']);
  // A change to the listing reaches the commercial search; Recalculate works for it.
  env.DB.raw.prepare("UPDATE listings SET rent=48000 WHERE id='COM-1-met'").run();
  await recomputeForListing(env, 'COM-1-met', 'system');
  assert.deepEqual((await found(made.data.id))[2], ['COM-1-met', 'alternative']);
  assert.equal((await req('POST', `/admin/applicants/${made.data.id}/matches/recalculate`, {})).status, 200);
  assert.deepEqual((await found(home.data.id)).map(([id]) => id), ['HOME-1']);
});
