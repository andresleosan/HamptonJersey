// BUS-09 normalization is pure: it neither reads a source nor changes a listing.
// Amounts remain in their original currency and no access decision is inferred.
const MAX_MINOR = BigInt(Number.MAX_SAFE_INTEGER);
const KINDS = new Set(['sale_price', 'rent', 'premium', 'business_price', 'service_charge']);
const PERIODS = new Set(['sale', 'week', 'month', 'quarter', 'year', 'unknown']);
const OPERATIONS = new Set(['sale', 'rent', 'business']);
const FIELDS = ['title', 'parish', 'bedrooms', 'bathrooms', 'pets', 'parking'];
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const currencyTag = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const currencies = (() => {
  try { return new Set(Intl.supportedValuesOf('currency')); }
  catch { return new Set(['GBP', 'EUR']); }
})();
const knownCurrency = value => currencyTag(value) && value !== 'XXX' && currencies.has(value);
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function ownMoneyToMinor(value, currency) {
  const unit = knownCurrency(currency) ? (currency === 'GBP' ? 'GBP_major' : 'known_currency_major') : null;
  const result = { original_value: value ?? null, original_unit: unit, amount_minor: null, issue: null };
  if (value == null || value === 0 || value === '0') return { ...result, issue: 'not_declared' };
  if (!unit) return { ...result, issue: 'currency_unknown' };
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)))
    return { ...result, issue: 'invalid_amount' };
  const text = String(value);
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || text.length > 100) return { ...result, issue: 'invalid_amount' };
  const digits = BigInt(match[1] + (match[2] ?? ''));
  if (digits === 0n) return { ...result, issue: 'not_declared' };
  const minorDigits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  const exponent = Number(match[3] ?? 0) - (match[2]?.length ?? 0) + minorDigits;
  if (!Number.isSafeInteger(exponent) || exponent > 400) return { ...result, issue: 'amount_out_of_range' };
  if (exponent < -400) return { ...result, issue: 'sub_penny_review' };
  let minor;
  if (exponent >= 0) minor = digits * (10n ** BigInt(exponent));
  else {
    const divisor = 10n ** BigInt(-exponent);
    if (digits % divisor !== 0n) return { ...result, issue: 'sub_penny_review' };
    minor = digits / divisor;
  }
  if (minor > MAX_MINOR) return { ...result, issue: 'amount_out_of_range' };
  return { ...result, amount_minor: Number(minor) };
}

function monthlyRent(term) {
  if (term.amount_minor == null || !knownCurrency(term.currency)) return null;
  const factors = { month: [1n, 1n], year: [1n, 12n], quarter: [1n, 3n], week: [52n, 12n] };
  const factor = factors[term.period];
  if (!factor) return null;
  const numerator = BigInt(term.amount_minor) * factor[0], denominator = factor[1];
  const rounded = (2n * numerator + denominator) / (2n * denominator);
  return rounded <= MAX_MINOR ? Number(rounded) : null;
}

function normalizeTerm(term) {
  if (!term || typeof term !== 'object' || Array.isArray(term) || !KINDS.has(term.kind) || !PERIODS.has(term.period))
    throw new TypeError('Invalid financial term');
  if (term.amount_minor != null && (!Number.isSafeInteger(term.amount_minor) || term.amount_minor < 0))
    throw new TypeError('Invalid financial amount');
  if (term.currency != null && !currencyTag(term.currency)) throw new TypeError('Invalid currency');
  if (term.raw_text != null && (typeof term.raw_text !== 'string' || term.raw_text.length > 4000))
    throw new TypeError('Invalid financial evidence');
  if (term.evidence_ref != null && (typeof term.evidence_ref !== 'string' || term.evidence_ref.length > 1024))
    throw new TypeError('Invalid financial evidence');
  const result = { kind: term.kind, amount_minor: term.amount_minor ?? null, currency: term.currency ?? null, period: term.period };
  if (has(term, 'raw_text')) result.raw_text = term.raw_text;
  if (has(term, 'evidence_ref')) result.evidence_ref = term.evidence_ref;
  return result;
}

export function normalizeObservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.country_code !== 'JE' ||
      typeof input.territory_evidence !== 'string' || !input.territory_evidence.trim() || input.territory_evidence.length > 1024)
    throw new TypeError('Jersey territory and evidence required');
  if (!OPERATIONS.has(input.operation) || !validTime(input.observed_at)) throw new TypeError('Invalid observation');
  const inputTerms = input.financial_terms ?? [];
  if (!Array.isArray(inputTerms) || inputTerms.length > 50) throw new TypeError('Invalid financial terms');
  const financial_terms = inputTerms.map(normalizeTerm), rents = financial_terms.filter(item => item.kind === 'rent');
  const issues = [], fields = {}, present_fields = [];
  for (const field of FIELDS) {
    const value = has(input, field) ? input[field] : null;
    if (has(input, field)) present_fields.push(field);
    if (['bedrooms', 'bathrooms'].includes(field) && value != null && (!Number.isSafeInteger(value) || value < 0))
      throw new TypeError('Invalid room count');
    if (['title', 'parish'].includes(field) && value != null && (typeof value !== 'string' || value.length > 1000))
      throw new TypeError('Invalid observation field');
    if (['pets', 'parking'].includes(field) && value != null && typeof value !== 'boolean') {
      fields[field] = null;
      issues.push(`${field}_review`);
    } else fields[field] = value ?? null;
  }
  if (rents.length > 1) issues.push('multiple_rents_review');
  if (rents.some(rent => rent.amount_minor != null && !knownCurrency(rent.currency))) issues.push('currency_unknown');
  if (input.operation === 'sale' && rents.length) issues.push('rent_not_for_operation_review');
  const monthly_rent_minor = input.operation !== 'sale' && rents.length === 1 ? monthlyRent(rents[0]) : null;
  return { country_code: 'JE', territory_evidence: input.territory_evidence, operation: input.operation,
    observed_at: input.observed_at, fields, present_fields, financial_terms, monthly_rent_minor,
    monthly_rent_currency: monthly_rent_minor == null ? null : rents[0].currency, issues };
}

export function normalizeOwnListing(listing) {
  if (!listing || typeof listing !== 'object' || Array.isArray(listing) || listing.country !== 'Jersey') return null;
  if (typeof listing.id !== 'string' || !listing.id || !OPERATIONS.has(listing.operation) || !validTime(listing.updated_at))
    throw new TypeError('Invalid own listing');
  const mapping = listing.operation === 'sale' ? [['sale_price', 'sale_price', 'sale']]
    : listing.operation === 'rent' ? [['rent', 'rent', listing.rent_period]]
    : [['premium', 'premium', 'sale'], ['rent', 'rent', listing.rent_period]];
  const used = new Set(mapping.map(([field]) => field)), financial_terms = [], source_financials = [], ownIssues = [];
  for (const [field, kind, proposedPeriod] of mapping) {
    if (!has(listing, field) || listing[field] == null) continue;
    const converted = ownMoneyToMinor(listing[field], listing.currency);
    const period = PERIODS.has(proposedPeriod) ? proposedPeriod : 'unknown';
    const currency = currencyTag(listing.currency) ? listing.currency : null;
    source_financials.push({ kind, ...converted, currency, period });
    financial_terms.push({ kind, amount_minor: converted.amount_minor, currency, period,
      raw_text: String(listing[field]), evidence_ref: `own_listing.${field}` });
    if (converted.issue && converted.issue !== 'not_declared') ownIssues.push(converted.issue);
  }
  for (const field of ['sale_price', 'rent', 'premium']) {
    if (used.has(field) || !has(listing, field) || listing[field] == null) continue;
    const converted = ownMoneyToMinor(listing[field], listing.currency);
    const proposedPeriod = field === 'rent' ? listing.rent_period : 'sale';
    source_financials.push({ kind: field, ...converted, amount_minor: null, comparison_eligible: false,
      currency: currencyTag(listing.currency) ? listing.currency : null,
      period: PERIODS.has(proposedPeriod) ? proposedPeriod : 'unknown' });
    if (listing[field] !== 0 && listing[field] !== '0') ownIssues.push('out_of_scope_financial_fields');
  }
  const fields = Object.fromEntries(FIELDS.filter(field => has(listing, field)).map(field => [field, listing[field]]));
  const normalized = normalizeObservation({ country_code: 'JE', territory_evidence: 'own_listing.country',
    operation: listing.operation, observed_at: listing.updated_at, financial_terms, ...fields });
  return { ...normalized, source_financials, issues: [...new Set([...normalized.issues, ...ownIssues])] };
}

// Conservative helper for a future guarded consumer: human facts, absent facts
// and source facts with unknown/newer timestamps are never overwritten.
export function mergeObservedFields(current, normalized) {
  if (!current || typeof current !== 'object' || Array.isArray(current) || !normalized ||
      !Array.isArray(normalized.present_fields) || !validTime(normalized.observed_at)) throw new TypeError('Invalid facts');
  const result = structuredClone(current);
  for (const field of normalized.present_fields) {
    if (!FIELDS.includes(field)) continue;
    const value = normalized.fields?.[field], previous = current[field];
    if (value == null || (has(current, field) && (!previous || typeof previous !== 'object' || previous.authority !== 'source'))) continue;
    if (previous && (!validTime(previous.updated_at) || previous.updated_at >= normalized.observed_at)) continue;
    result[field] = { value: structuredClone(value), authority: 'source', updated_at: normalized.observed_at };
  }
  return result;
}
