import { test } from 'node:test';
import assert from 'node:assert/strict';
import { physicalValue, checkPhysical, squareMetres, normalizeFeatureOverrides } from '../../server/listing-physical.js';

test('physical values distinguish unknown, no, zero and empty selections', () => {
  assert.equal(physicalValue('separate_wcs', 0), 0);
  assert.equal(physicalValue('has_lift', 0), 0);
  assert.equal(physicalValue('has_lift', null), null);
  assert.equal(physicalValue('heating_types', null), null);
  assert.deepEqual(physicalValue('heating_types', []), []);
  assert.deepEqual(physicalValue('heating_types', ['gas', 'oil', 'gas']), ['oil', 'gas']);
  assert.equal(physicalValue('year_built', 9999), 9999);
  assert.throws(() => physicalValue('separate_wcs', 1.2));
  assert.throws(() => physicalValue('has_lift', '0'));
  assert.throws(() => physicalValue('year_built', 10000));
  assert.throws(() => physicalValue('amenities', '["pool"]'));
  assert.throws(() => physicalValue('heating_types', ['solar']));
  assert.throws(() => physicalValue('separate_wcs', Infinity));
});

test('floor relationship and conversion retain their meaning', () => {
  assert.deepEqual(checkPhysical({ floor_level: 0, building_floors: 1 }), {});
  assert.deepEqual(checkPhysical({ floor_level: -1, building_floors: 1 }), {});
  assert.ok(checkPhysical({ floor_level: 1, building_floors: 1 }).floor_level);
  assert.deepEqual(checkPhysical({ floor_level: 1, building_floors: null }), {});
  assert.equal(squareMetres(1000), 92.90304);
  assert.equal(squareMetres(0), null);
});

test('manual facts preserve explicit unknown and canonicalize without extra keys', () => {
  assert.deepEqual(normalizeFeatureOverrides(null), {});
  assert.deepEqual(normalizeFeatureOverrides({ parking: 0, pets: null, outdoor: { patio: 'yes' } }), {
    pets: null, parking: 0, outdoor: { garden: 'unknown', terrace: 'unknown', balcony: 'unknown', patio: 'yes' },
  });
  for (const bad of [[], '', { pets: 'conditional' }, { parking: -1 }, { outdoor: { roof: 'yes' } }, { other: true }]) {
    assert.throws(() => normalizeFeatureOverrides(bad));
  }
});

test('manual facts override automatic values and matching certainty together', async () => {
  const { applyFeatureOverrides } = await import('../../server/listing-physical.js');
  const automatic = { parish: 'St Helier', feat_pets: 'no', feat_parking: 2, feat_outdoor: '["garden"]',
    feat_evidence: JSON.stringify({ pets: 'No pets', type: 'Flat', _requirements: {
      version: 1, pets: 'no', parking: { value: 2, kind: 'exact' }, outdoor: { garden: 'yes' },
    } }) };
  const manual = applyFeatureOverrides(automatic, normalizeFeatureOverrides({ pets: 'yes', parking: 0,
    outdoor: { terrace: 'no', patio: 'yes' } }));
  const facts = JSON.parse(manual.feat_evidence);
  assert.equal(manual.feat_pets, 'yes');
  assert.equal(manual.feat_parking, 0);
  assert.deepEqual(JSON.parse(manual.feat_outdoor), ['terrace']);
  assert.equal(facts._requirements.pets, 'yes');
  assert.deepEqual(facts._requirements.parking, { value: 0, kind: 'exact' });
  assert.deepEqual(facts._requirements.outdoor, { garden: 'unknown', terrace: 'yes', balcony: 'unknown' });
  assert.equal(facts.type, 'Flat');
  assert.equal(manual.parish, 'St Helier');
  const unknown = applyFeatureOverrides(automatic, normalizeFeatureOverrides({ pets: null, parking: null, outdoor: null }));
  assert.equal(unknown.feat_pets, null);
  assert.equal(unknown.feat_outdoor, null);
  assert.equal(JSON.parse(unknown.feat_evidence)._requirements.pets, 'unknown');
  assert.deepEqual(JSON.parse(unknown.feat_evidence)._requirements.parking, { value: null, kind: 'unknown' });
  const partlyKnown = applyFeatureOverrides(automatic, normalizeFeatureOverrides({ outdoor: { terrace: 'no' } }));
  assert.deepEqual(JSON.parse(partlyKnown.feat_outdoor), []);
  assert.equal(JSON.parse(partlyKnown.feat_evidence)._requirements.outdoor.terrace, 'unknown');
  assert.deepEqual(applyFeatureOverrides(automatic, {}), automatic);
});
