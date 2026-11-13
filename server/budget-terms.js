import { ownMoneyToMinor } from './market-extraction.js';

// Read-only preparation for the disconnected BUS-12 criteria loader. It is not
// a matching, authorization, persistence or currency-exchange decision.
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const present = value => value !== null && value !== undefined;
const residentialFields = ['budget_min', 'budget_max', 'budget_stretch'];
const commercialFields = ['commercial_purchase', 'commercial_rent', 'commercial_premium', 'commercial_expenses'];

function currencyFor(snapshot, criteria) {
  // The existing applicant fields are explicitly in GBP; future sources that
  // carry a currency must provide a consistent, supported currency themselves.
  const declared = [];
  if (has(snapshot, 'currency')) declared.push(snapshot.currency);
  if (has(criteria, 'currency')) declared.push(criteria.currency);
  if (!declared.length) return 'GBP';
  if (declared.some(value => typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) ||
      declared.some(value => value !== declared[0])) return null;
  return declared[0];
}

function originalAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 100 && /^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)) return value;
  return null;
}

const isZero = value => value === 0 || (typeof value === 'string' && value.length <= 100 && /^0+(?:\.0+)?(?:e[+-]?\d+)?$/i.test(value));
const notApplicable = () => ({ state: 'not_applicable', operation: null, original_value: null, amount_minor: null,
  currency: null, original_period: null, period: 'not_applicable', monthly_equivalent: null });

function makeTerm(field, raw, currency, period, { allowZero = false, periodic = false, operation, originalPeriod = null } = {}) {
  const reasons = [];
  const original_value = originalAmount(raw);
  let amount_minor = null;
  if (!present(raw)) reasons.push('not_declared');
  else if (isZero(raw)) {
    // BUS-09's source-listing converter interprets zero as undeclared. Here
    // zero is explicitly permitted only for the existing premium/expenses.
    if (ownMoneyToMinor(1, currency).amount_minor == null) reasons.push('currency_unknown');
    else if (!allowZero) reasons.push('invalid_amount');
    else amount_minor = 0;
  } else if (original_value === null) reasons.push('invalid_amount');
  else {
    const converted = ownMoneyToMinor(raw, currency);
    if (converted.amount_minor == null) reasons.push(converted.issue ?? 'invalid_amount');
    else amount_minor = converted.amount_minor;
  }
  if (period === 'unknown') reasons.push('period_unknown');
  // Keep the fraction exact. Consumers must compare same-currency values by
  // cross-multiplying with BigInt, never by dividing or rounding these numbers.
  const monthly_equivalent = periodic && amount_minor !== null && (period === 'month' || period === 'year')
    ? { numerator_minor: amount_minor, denominator: period === 'month' ? 1 : 12 } : null;
  const original_period = typeof originalPeriod === 'string' && /^[a-z_]{1,32}$/.test(originalPeriod) ? originalPeriod : null;
  return {
    term: { state: reasons.length ? 'unknown' : 'known', operation, original_value, amount_minor, currency,
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
    return { state: 'unknown', operation: terms.budget_max.operation, source_field: null, original_value: null, amount_minor: null, currency,
      original_period: null, period, monthly_equivalent: null };
  }
  if (!present(criteria.budget_stretch) && !present(criteria.budget_max)) {
    unknowns.push({ field: 'budget_ceiling', reason: 'not_declared' });
    return { ...terms.budget_max, source_field: null };
  }
  const source_field = present(criteria.budget_stretch) ? 'budget_stretch' : 'budget_max';
  return { ...terms[source_field], source_field };
}

// Accept the shape returned by loadCriteriaSnapshot; the original form has
// independent rows for rent and buy. No caller's criteria are changed.
export function normalizeBudgetTerms(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      !snapshot.criteria || typeof snapshot.criteria !== 'object' || Array.isArray(snapshot.criteria))
    throw new TypeError('Invalid criteria snapshot');
  const { criteria, search_category: category, operation } = snapshot;
  const terms = {}, unknowns = [];
  if (!['residential', 'commercial'].includes(category))
    return { terms, unknowns: [{ field: 'search_category', reason: 'unknown_category' }] };
  if (!(category === 'residential' ? ['rent', 'buy'] : ['rent', 'buy', 'transfer']).includes(operation))
    return { terms, unknowns: [{ field: 'operation', reason: 'unknown_operation' }] };
  const currency = currencyFor(snapshot, criteria);
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
    if (present(criteria.commercial_rent_period))
      unknowns.push({ field: 'commercial_rent_period', reason: 'category_mismatch' });
    const period = operation === 'rent' ? 'month' : 'not_applicable';
    for (const field of residentialFields) add(field, period, { operation, periodic: operation === 'rent' });
    terms.budget_ceiling = ceiling(criteria, terms, currency, period, unknowns);
  } else {
    terms.budget_ceiling = notApplicable();
    add('commercial_purchase', 'not_applicable', { operation: 'buy' });
    const period = ['month', 'year'].includes(criteria.commercial_rent_period) ? criteria.commercial_rent_period : 'unknown';
    add('commercial_rent', period, { operation: 'rent', periodic: true, originalPeriod: criteria.commercial_rent_period });
    add('commercial_premium', 'not_applicable', { operation: 'transfer', allowZero: true });
    // The schema captures no period for expenses: their amount is preserved,
    // but cannot be presented as monthly or treated as a comparable term.
    add('commercial_expenses', 'unknown', { operation: 'unknown', allowZero: true });
  }
  return { terms, unknowns };
}
