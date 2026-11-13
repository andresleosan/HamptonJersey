import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePricePerArea, formatPricePerArea } from '../../server/listing-price-area.js';

const sale = { operation: 'sale', sale_price: 500000, interior_area_sqft: 1000, currency: 'GBP' };
test('derives a sale amount from the entered interior area without changing source values', () => {
  const row = { ...sale, price_per_sqft: 'Agent supplied text', price_text: 'Negotiable' };
  const before = structuredClone(row);
  assert.equal(derivePricePerArea(row).amount, 500);
  assert.equal(derivePricePerArea(row).period, null);
  assert.equal(formatPricePerArea(derivePricePerArea(row)), '£500.00 per sq ft');
  assert.deepEqual(row, before);
});
test('keeps monthly and yearly rent separate and formats only at presentation', () => {
  const month = { ...sale, operation: 'rent', rent: 1200, rent_period: 'month', interior_area_sqft: 800 };
  const year = { ...month, rent: 14400, rent_period: 'year', currency: 'EUR' };
  assert.equal(formatPricePerArea(derivePricePerArea(month)), '£1.50 per sq ft pcm');
  assert.equal(formatPricePerArea(derivePricePerArea(year)), '€18.00 per sq ft p.a.');
  const exact = derivePricePerArea({ ...month, rent: 1000, interior_area_sqft: 300 });
  assert.equal(exact.amount, 1000 / 300);
  assert.equal(formatPricePerArea(exact), '£3.33 per sq ft pcm');
});
test('uses the current business price basis and does not add a legacy premium', () => {
  const business = { ...sale, operation: 'business', tenure_type: 'freehold', rent: 1200, rent_period: 'month', premium: 90000 };
  assert.equal(derivePricePerArea(business).amount, 500);
  assert.equal(derivePricePerArea({ ...business, tenure_type: 'leasehold' }).amount, 1.2);
  assert.equal(derivePricePerArea({ ...business, tenure_type: 'leasehold', rent: null }), null);
});
test('returns no calculation for unknown, invalid or inconsistent inputs', () => {
  for (const patch of [
    { interior_area_sqft: null }, { interior_area_sqft: '' }, { interior_area_sqft: 0 },
    { interior_area_sqft: -1 }, { interior_area_sqft: 1.001 }, { interior_area_sqft: 1e8 },
    { interior_area_sqft: true }, { interior_area_sqft: [] }, { sale_price: 0 },
    { sale_price: Infinity }, { sale_price: 1e10 }, { sale_price: 'text' },
    { currency: null }, { currency: 'USD' }, { operation: 'other' },
    { operation: 'rent', rent: 100, rent_period: null }, { operation: 'rent', rent: 100, rent_period: 'week' }
  ]) assert.equal(derivePricePerArea({ ...sale, ...patch }), null, JSON.stringify(patch));
  assert.equal(derivePricePerArea(null), null);
  assert.equal(formatPricePerArea(null), null);
});
test('accepts valid editor numeric strings and avoids displaying a positive amount as zero', () => {
  const values = { ...sale, sale_price: '0.01', interior_area_sqft: '99999999.99' };
  assert.equal(formatPricePerArea(derivePricePerArea(values)), 'Less than £0.01 per sq ft');
});

test('validates the minimum and decimal precision of interior area without binary tolerance errors', async () => {
  const { validateListing } = await import('../../server/listing.js');
  assert.equal(derivePricePerArea({ ...sale, interior_area_sqft: 1e-10 }), null);
  assert.ok(derivePricePerArea({ ...sale, interior_area_sqft: 8495076.03 }));
  assert.equal(validateListing({ interior_area_sqft: 1e-10 }, { partial: true }).errors.interior_area_sqft != null, true);
  assert.equal(validateListing({ interior_area_sqft: 8495076.03 }, { partial: true }).value.interior_area_sqft, 8495076.03);
});
test('rounds decimal inputs exactly and treats one penny as one penny', () => {
  const half = derivePricePerArea({ ...sale, sale_price: 101009.09, interior_area_sqft: 202 });
  const penny = derivePricePerArea({ ...sale, sale_price: 1.13, interior_area_sqft: 113 });
  assert.equal(formatPricePerArea(half), '£500.05 per sq ft');
  assert.equal(formatPricePerArea(penny), '£0.01 per sq ft');
});
test('does not infer a business price basis when tenure is unknown or unrecognised', () => {
  const row = { ...sale, operation: 'business', rent: 12000, rent_period: 'year', interior_area_sqft: 800 };
  for (const tenure_type of ['', null, 'unknown']) assert.equal(derivePricePerArea({ ...row, tenure_type }), null);
});

test('bounds numeric input work and does not coerce unsupported values', () => {
  for (const value of ['1'.repeat(1000), '1e999999', '0x10', true, [10], { value: 10 }])
    assert.equal(derivePricePerArea({ ...sale, sale_price: value }), null);
  assert.equal(formatPricePerArea(derivePricePerArea({ ...sale, sale_price: '1e-300' })), 'Less than £0.01 per sq ft');
});

 test('business premium is calculated independently of tenure and rent', async () => {
  const {formatPremiumPerArea} = await import('../../server/listing-price-area.js');
  const row = {operation:'business', premium:10000, rent:1200, currency:'GBP', interior_area_sqft:800};
  assert.equal(formatPremiumPerArea(row), '£12.50 premium per sq ft');
  assert.equal(formatPremiumPerArea({...row, interior_area_sqft:null}), null);
  assert.equal(formatPremiumPerArea({...row, premium:null}), null);
});
