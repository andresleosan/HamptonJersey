// Pure validation for staff-entered physical details. Persistence and matching
// integration are separate work; unknown is deliberately distinct from zero.
const INTEGER_RANGES = Object.freeze({
  separate_wcs: [0, 100], reception_rooms: [0, 100],
  floor_level: [-20, 200], building_floors: [1, 200], year_built: [1, 9999],
});
const FLAGS = ['has_garage', 'has_storage', 'has_lift', 'double_glazing'];
const LISTS = Object.freeze({
  heating_types: ['oil', 'gas', 'electric', 'heat_pump', 'lpg'],
  amenities: ['pool', 'gym', 'communal_areas'],
});
export const PHYSICAL_FIELDS = Object.freeze([...Object.keys(INTEGER_RANGES), ...FLAGS, ...Object.keys(LISTS)]);
const OUTDOOR = ['garden', 'terrace', 'balcony', 'patio'];
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export function physicalValue(key, input) {
  if (!PHYSICAL_FIELDS.includes(key)) throw new Error('Unknown field');
  if (input == null || (typeof input === 'string' && input.trim() === '')) return null;
  if (Object.hasOwn(INTEGER_RANGES, key)) {
    const [min, max] = INTEGER_RANGES[key];
    if (typeof input !== 'number' || !Number.isInteger(input) || input < min || input > max)
      throw new Error(`Enter a whole number from ${min} to ${max}, or leave blank`);
    return input;
  }
  if (FLAGS.includes(key)) {
    if (input !== 0 && input !== 1) throw new Error('Choose Yes, No or Unknown');
    return input;
  }
  const allowed = LISTS[key];
  if (!Array.isArray(input) || input.some(value => !allowed.includes(value)))
    throw new Error('Choose listed values or Unknown');
  return allowed.filter(value => input.includes(value));
}

export function checkPhysical(row) {
  if (row.floor_level != null && row.building_floors != null && row.floor_level >= 0
    && row.floor_level >= row.building_floors)
    return { floor_level: 'Floor must be below the number of above-ground floors' };
  return {};
}

export function squareMetres(sqft) {
  return typeof sqft === 'number' && Number.isFinite(sqft) && sqft > 0 && sqft < 1e8
    ? sqft * 0.09290304 : null;
}

export function normalizeFeatureOverrides(input) {
  if (input === null) return {};
  if (!plainObject(input)) throw new Error('Must be an object');
  const keys = ['pets', 'parking', 'furnished', 'outdoor'];
  if (Object.keys(input).some(key => !keys.includes(key))) throw new Error('Unknown manual fact');
  const result = {};
  for (const key of keys) {
    if (!Object.hasOwn(input, key)) continue;
    const value = input[key];
    if (value === null) { result[key] = null; continue; }
    if (key === 'parking') {
      if (!Number.isInteger(value) || value < 0 || value > 10000) throw new Error('Invalid parking value');
      result[key] = value;
    } else if (key === 'outdoor') {
      if (!plainObject(value) || Object.keys(value).some(k => !OUTDOOR.includes(k))) throw new Error('Invalid outdoor values');
      result[key] = {};
      for (const k of OUTDOOR) {
        const item = Object.hasOwn(value, k) ? value[k] : 'unknown';
        if (!['yes', 'no', 'unknown'].includes(item)) throw new Error('Invalid outdoor value');
        result[key][k] = item;
      }
    } else {
      if (value !== 'yes' && value !== 'no') throw new Error('Invalid manual value');
      result[key] = value;
    }
  }
  return result;
}

// Return the legacy columns and requirement evidence together, so matching
// cannot see a manual fact paired with stale automatic certainty.
export function applyFeatureOverrides(automatic, overrides) {
  const manual = normalizeFeatureOverrides(overrides);
  if (!Object.keys(manual).length) return { ...automatic };
  const result = { ...automatic };
  const evidence = automatic.feat_evidence ? JSON.parse(automatic.feat_evidence) : {};
  if (!plainObject(evidence)) throw new Error('Invalid feature evidence');
  const prior = evidence._requirements;
  const facts = plainObject(prior) && prior.version === 1 ? { ...prior } : { version: 1 };
  for (const key of ['pets', 'parking', 'furnished']) {
    if (!Object.hasOwn(manual, key)) continue;
    const value = manual[key];
    result[`feat_${key}`] = value;
    evidence[key] = 'Set by staff';
    if (key === 'pets') facts.pets = value ?? 'unknown';
    if (key === 'parking') facts.parking = { value, kind: value === null ? 'unknown' : 'exact' };
  }
  if (Object.hasOwn(manual, 'outdoor')) {
    const value = manual.outdoor;
    const combined = (a, b) => a === 'yes' || b === 'yes' ? 'yes'
      : a === 'no' && b === 'no' ? 'no' : 'unknown';
    const outdoor = value ? { garden: value.garden, terrace: combined(value.terrace, value.patio), balcony: value.balcony }
      : { garden: 'unknown', terrace: 'unknown', balcony: 'unknown' };
    const positive = Object.keys(outdoor).filter(key => outdoor[key] === 'yes');
    result.feat_outdoor = !value || Object.values(value).every(item => item === 'unknown') ? null : JSON.stringify(positive);
    facts.outdoor = outdoor;
    evidence.outdoor = 'Set by staff';
  }
  evidence._requirements = facts;
  result.feat_evidence = JSON.stringify(evidence);
  return result;
}
