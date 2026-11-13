import { PUB06_TRIGGER_SQL } from './listing-economics-contract.js';
// Structured staff-only amounts are distinct from the existing public text.
// Values are in the listing's declared major currency, not a converted total.
const AMOUNTS = Object.freeze(['rental_deposit_amount', 'parish_rates_amount', 'service_charge_amount']);
const PERIODS = Object.freeze(['parish_rates_period', 'service_charge_period']);
export const ECONOMIC_FIELDS = Object.freeze([...AMOUNTS, ...PERIODS]);
const blank = value => value == null || (typeof value === 'string' && !value.trim());
const amountError = 'Enter an amount from 0 with up to 2 decimal places, or leave blank if unknown';
const periodError = 'Choose month or year';

export function economicValue(field, value) {
  if (!ECONOMIC_FIELDS.includes(field)) throw new TypeError('Unknown economic field');
  if (blank(value)) return null;
  if (AMOUNTS.includes(field)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1e10 || Number(value.toFixed(2)) !== value)
      throw new TypeError(amountError);
    return value === 0 ? 0 : value;
  }
  if (!['month', 'year'].includes(value)) throw new TypeError(periodError);
  return value;
}

// Apply after a partial update is merged with the stored row. Never invent a
// currency, period, conversion or cost from an existing public text field.
export function checkEconomicTerms(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError('Invalid economic details');
  const errors = {}, values = {};
  for (const field of ECONOMIC_FIELDS) {
    try { values[field] = economicValue(field, row[field]); }
    catch (error) { errors[field] = error.message; }
  }
  if (AMOUNTS.some(field => values[field] != null) && !['GBP', 'EUR'].includes(row.currency))
    errors.currency = 'Choose the price currency';
  if (values.parish_rates_amount != null && values.parish_rates_period == null) errors.parish_rates_period = periodError;
  if (values.service_charge_amount != null && values.service_charge_period == null) errors.service_charge_period = periodError;
  return errors;
}

// Verify the complete reviewed trigger definitions, never comments or field
// fragments alone. This compatibility check does not authorize an action.
const TRIGGER_NAMES = Object.freeze(['listing_event_insert', 'listing_event_update', 'pub06_costs_guard_insert', 'pub06_costs_guard_update']);
export const ECONOMICS_GUARD_ARGS = Object.freeze(TRIGGER_NAMES.map(name => PUB06_TRIGGER_SQL[name]));
export const ECONOMICS_GUARD_SQL = `(EXISTS(SELECT 1 FROM pub06_structured_costs WHERE singleton=1 AND version=1)
  ${TRIGGER_NAMES.map(name => `AND EXISTS(SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='${name}' AND sql = ?)`).join('\n  ')})`;
export const hasEconomicInput = body => Boolean(body && typeof body === 'object' && !Array.isArray(body) &&
  ECONOMIC_FIELDS.some(field => Object.hasOwn(body, field)));

export async function structuredEconomicsReady(env) {
  if (env?.PUB06_STRUCTURED_ECONOMICS_READY !== '1') return false;
  try {
    const db = typeof env?.DB?.withSession === 'function' ? env.DB.withSession('first-primary') : env?.DB;
    if (!db || typeof db.prepare !== 'function') return false;
    const marker = await db.prepare('SELECT version FROM pub06_structured_costs WHERE singleton = 1').first();
    if (marker?.version !== 1) return false;
    await db.prepare(`SELECT ${ECONOMIC_FIELDS.join(', ')} FROM listings LIMIT 0`).all();
    const rows = (await db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger'
      AND name IN ('listing_event_insert', 'listing_event_update', 'pub06_costs_guard_insert', 'pub06_costs_guard_update')`).all()).results;
    return Array.isArray(rows) && rows.length === TRIGGER_NAMES.length &&
      TRIGGER_NAMES.every(name => rows.some(row => row.name === name && row.sql === PUB06_TRIGGER_SQL[name]));
  } catch { return false; }
}

// A parsed JavaScript number can already have lost a non-zero JSON token. Use
// the engine's original source text; without source support, reject numeric
// amounts rather than guess. Limits are bounded before any BigInt operation.
function exactAmountToken(token) {
  if (typeof token !== 'string' || token.length > 128) return false;
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) return false;
  const digits = BigInt(match[2] + (match[3] ?? ''));
  if (digits === 0n) return true;
  if (match[1] === '-') return false;
  const exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0) + 2;
  if (!Number.isSafeInteger(exponent) || exponent > 400 || exponent < -400) return false;
  let minor;
  if (exponent >= 0) minor = digits * 10n ** BigInt(exponent);
  else {
    const divisor = 10n ** BigInt(-exponent);
    if (digits % divisor !== 0n) return false;
    minor = digits / divisor;
  }
  return minor < 1000000000000n;
}

export function parseEconomicJson(text) {
  const invalid = new WeakMap();
  const body = JSON.parse(text, function (key, value, context) {
    if (AMOUNTS.includes(key) && typeof value === 'number' && !exactAmountToken(context?.source)) {
      const keys = invalid.get(this) ?? [];
      keys.push(key);
      invalid.set(this, keys);
    }
    return value;
  });
  if (body && typeof body === 'object' && !Array.isArray(body))
    for (const key of invalid.get(body) ?? []) body[key] = {};
  return body;
}

// The caller's confirmation is a staff assertion, not proof of identity or a
// substitute for the route's authentication and optimistic concurrency check.
export function checkEconomicCurrencyReview(stored, input) {
  if (!stored || !input || !Object.hasOwn(input, 'currency') || input.currency === stored.currency ||
      !AMOUNTS.some(field => stored[field] != null)) return null;
  if (input.confirm_structured_currency_change !== true || !ECONOMIC_FIELDS.every(field => Object.hasOwn(input, field)))
    return 'Review all staff-only costs and confirm the currency change';
  return null;
}
