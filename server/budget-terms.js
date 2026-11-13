import { BUDGET, COMMERCIAL_BUDGET_LIMITS } from './applicants.js';
import { ownMoneyToMinor } from './market-extraction.js';

// Internal read-only preparation. Provenance indicates units, never permission,
// currentness, identity, or authorization to use a snapshot for an action.
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const present = value => value !== null && value !== undefined;
const residentialFields = ['budget_min', 'budget_max', 'budget_stretch'];
const commercialFields = ['commercial_purchase', 'commercial_rent', 'commercial_premium', 'commercial_expenses'];
const inputFields = [...residentialFields, ...commercialFields, 'commercial_rent_period', 'currency'];
const residentialLimits = { rent: [...BUDGET.rent], buy: [...BUDGET.buy] };

// Only own data properties are accepted. Do not execute caller-provided getters
// or let a hostile proxy's thrown value escape to a log or response.
function dataProperty(object, key) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor) return { exists: false, value: undefined };
    if (!has(descriptor, 'value')) throw new TypeError();
    return { exists: true, value: descriptor.value };
  } catch { throw new TypeError('Invalid criteria snapshot'); }
}

function capture(snapshot) {
  try {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new TypeError();
    const criteria = dataProperty(snapshot, 'criteria').value;
    if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) throw new TypeError();
    const safe = { criteria: {} };
    for (const field of ['search_category', 'operation', 'currency']) {
      const entry = dataProperty(snapshot, field);
      if (entry.exists) safe[field] = entry.value;
    }
    for (const field of inputFields) {
      const entry = dataProperty(criteria, field);
      if (entry.exists) safe.criteria[field] = entry.value;
    }
    return safe;
  } catch { throw new TypeError('Invalid criteria snapshot'); }
}

// The loader creates a plain snapshot whose criteria are database primitives.
// Capture every own data property so additions, replacements, nested changes,
// getters and non-primitive DB values cannot retain the loader's units hint.
function signature(snapshot) {
  try {
    const inspect = object => {
      if (!object || typeof object !== 'object' || Array.isArray(object) || Object.getPrototypeOf(object) !== Object.prototype) return null;
      const keys = Reflect.ownKeys(object);
      if (keys.some(key => typeof key !== 'string')) return null;
      const values = [];
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (!descriptor || !has(descriptor, 'value')) return null;
        values.push([key, descriptor.value]);
      }
      return values;
    };
    const outer = inspect(snapshot);
    const criteria = outer?.find(([key]) => key === 'criteria')?.[1];
    const inner = inspect(criteria);
    const primitive = value => value == null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value);
    if (!outer || !inner || outer.some(([key, value]) => key !== 'criteria' && !primitive(value)) ||
        inner.some(([, value]) => !primitive(value))) return null;
    return { outer, inner };
  } catch { return null; }
}

function sameSignature(before, after) {
  const same = (a, b) => a.length === b.length && a.every(([key, value], index) =>
    key === b[index][0] && Object.is(value, b[index][1]));
  return Boolean(before && after && same(before.outer, after.outer) && same(before.inner, after.inner));
}

function currencyFor(snapshot, criteria, loaderCurrency, invalidated) {
  if (invalidated) return null;
  const declared = loaderCurrency ? [loaderCurrency] : [];
  if (has(snapshot, 'currency')) declared.push(snapshot.currency);
  if (has(criteria, 'currency')) declared.push(criteria.currency);
  if (!declared.length || declared.some(value => typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) ||
      declared.some(value => value !== declared[0])) return null;
  return declared[0];
}

function originalAmount(value) {
  if (!present(value)) return { original_value: null, original_status: 'not_declared' };
  if (typeof value === 'number' && Number.isFinite(value)) return { original_value: value, original_status: 'preserved' };
  if (typeof value === 'boolean') return { original_value: value, original_status: 'preserved' };
  if (typeof value === 'string') return value.length <= 100 ? { original_value: value, original_status: 'preserved' }
    : { original_value: null, original_status: 'too_long' };
  return { original_value: null, original_status: 'unsupported_type' };
}

const numeric = value => (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.length <= 100 && /^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value));
const exactlyZero = value => value === 0 || (typeof value === 'string' && value.length <= 100 &&
  /^0+(?:\.0+)?(?:e[+-]?\d+)?$/i.test(value));
const notApplicable = () => ({ state: 'not_applicable', operation: null, original_value: null, original_status: 'not_applicable',
  amount_minor: null, currency: null, original_period: null, period: 'not_applicable', monthly_equivalent: null });

function makeTerm(field, raw, currency, period, { limits, periodic = false, operation, originalPeriod = null }) {
  const reasons = [], original = originalAmount(raw);
  let amount_minor = null;
  if (!present(raw)) reasons.push('not_declared');
  else if (!numeric(raw)) reasons.push('invalid_amount');
  else {
    const major = Number(raw);
    if (!Number.isFinite(major) || major < limits[0] || major > limits[1]) reasons.push('amount_out_of_range');
    else if (exactlyZero(raw)) {
      // BUS-09 treats source-listing zero as undeclared; premium and expenses
      // permit an explicit zero under the applicant validation contract.
      if (ownMoneyToMinor(1, currency).amount_minor == null) reasons.push('currency_unknown');
      else amount_minor = 0;
    } else {
      const converted = ownMoneyToMinor(raw, currency);
      if (converted.amount_minor == null) reasons.push(converted.issue ?? 'invalid_amount');
      else amount_minor = converted.amount_minor;
    }
  }
  if (period === 'unknown') reasons.push('period_unknown');
  // A future consumer must compare same-currency fractions by cross-multiplying
  // with BigInt, never by dividing or rounding their numbers.
  const monthly_equivalent = periodic && amount_minor !== null && (period === 'month' || period === 'year')
    ? { numerator_minor: amount_minor, denominator: period === 'month' ? 1 : 12 } : null;
  const original_period = typeof originalPeriod === 'string' && /^[a-z_]{1,32}$/.test(originalPeriod) ? originalPeriod : null;
  return {
    term: { state: reasons.length ? 'unknown' : 'known', operation, ...original, amount_minor, currency,
      original_period, period, monthly_equivalent },
    unknowns: reasons.map(reason => ({ field, reason })),
  };
}

function ceiling(criteria, terms, currency, period, unknowns) {
  const presentBounds = residentialFields.filter(field => present(criteria[field]));
  const invalid = presentBounds.some(field => terms[field].state !== 'known');
  const min = terms.budget_min.amount_minor, max = terms.budget_max.amount_minor, stretch = terms.budget_stretch.amount_minor;
  const contradictory = (min !== null && max !== null && min > max) ||
    (stretch !== null && ((max !== null && stretch < max) || (min !== null && stretch < min)));
  if (invalid || contradictory) {
    unknowns.push({ field: 'budget_ceiling', reason: contradictory ? 'contradictory_bounds' : 'invalid_bounds' });
    return { state: 'unknown', operation: terms.budget_max.operation, source_field: null, original_value: null,
      original_status: 'unknown', amount_minor: null, currency, original_period: null, period, monthly_equivalent: null };
  }
  if (!present(criteria.budget_stretch) && !present(criteria.budget_max)) {
    unknowns.push({ field: 'budget_ceiling', reason: 'not_declared' });
    return { ...terms.budget_max, source_field: null };
  }
  const source_field = present(criteria.budget_stretch) ? 'budget_stretch' : 'budget_max';
  return { ...terms[source_field], source_field };
}

function normalize(snapshot, loaderCurrency, invalidated) {
  const { criteria, search_category: category, operation } = snapshot;
  const terms = {}, unknowns = [];
  if (!['residential', 'commercial'].includes(category))
    return { terms, unknowns: [{ field: 'search_category', reason: 'unknown_category' }] };
  if (!(category === 'residential' ? ['rent', 'buy'] : ['rent', 'buy', 'transfer']).includes(operation))
    return { terms, unknowns: [{ field: 'operation', reason: 'unknown_operation' }] };
  const currency = currencyFor(snapshot, criteria, loaderCurrency, invalidated);
  const add = (field, period, options) => {
    const result = makeTerm(field, criteria[field], currency, period, options);
    terms[field] = result.term;
    unknowns.push(...result.unknowns);
  };
  const inactive = category === 'residential' ? commercialFields : residentialFields;
  for (const field of inactive) {
    terms[field] = notApplicable();
    if (present(criteria[field])) unknowns.push({ field, reason: 'category_mismatch' });
  }
  if (category === 'residential') {
    if (present(criteria.commercial_rent_period)) unknowns.push({ field: 'commercial_rent_period', reason: 'category_mismatch' });
    const period = operation === 'rent' ? 'month' : 'not_applicable';
    for (const field of residentialFields) add(field, period, { operation, limits: residentialLimits[operation], periodic: operation === 'rent' });
    terms.budget_ceiling = ceiling(criteria, terms, currency, period, unknowns);
  } else {
    terms.budget_ceiling = notApplicable();
    add('commercial_purchase', 'not_applicable', { operation: 'buy', limits: COMMERCIAL_BUDGET_LIMITS.commercial_purchase });
    const period = ['month', 'year'].includes(criteria.commercial_rent_period) ? criteria.commercial_rent_period : 'unknown';
    add('commercial_rent', period, { operation: 'rent', limits: COMMERCIAL_BUDGET_LIMITS.commercial_rent,
      periodic: true, originalPeriod: criteria.commercial_rent_period });
    add('commercial_premium', 'not_applicable', { operation: 'transfer', limits: COMMERCIAL_BUDGET_LIMITS.commercial_premium });
    // Expenses have neither an operation nor a period in the current schema.
    add('commercial_expenses', 'unknown', { operation: 'unknown', limits: COMMERCIAL_BUDGET_LIMITS.commercial_expenses });
  }
  return { terms, unknowns };
}

// Each loader gets its own private weak registry. Objects copied, serialized or
// changed since loading cannot inherit the current applicant schema's GBP unit.
export function createBudgetNormalizer() {
  const issued = new WeakMap();
  function recordLoadedSnapshot(snapshot) {
    const current = signature(snapshot);
    if (current) issued.set(snapshot, { current, invalidated: false });
    return snapshot;
  }
  function normalizeBudgetTerms(snapshot) {
    let record;
    try { record = snapshot && typeof snapshot === 'object' ? issued.get(snapshot) : undefined; }
    catch { record = undefined; }
    if (record && !record.invalidated && !sameSignature(record.current, signature(snapshot))) {
      record.invalidated = true;
      record.current = null;
    }
    return normalize(capture(snapshot), record && !record.invalidated ? 'GBP' : null, Boolean(record?.invalidated));
  }
  return { recordLoadedSnapshot, normalizeBudgetTerms };
}
