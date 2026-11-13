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

// This is a schema-compatibility check, not an authorization or activation.
// The switch is deliberately off until the combined, reviewed SQL is applied.
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
    if (!Array.isArray(rows) || rows.length !== 4) return false;
    const insert = rows.find(row => row.name === 'listing_event_insert')?.sql;
    const update = rows.find(row => row.name === 'listing_event_update')?.sql;
    const guards = ['pub06_costs_guard_insert', 'pub06_costs_guard_update']
      .map(name => rows.find(row => row.name === name)?.sql);
    if (guards.some(sql => typeof sql !== 'string' || !sql.includes('NEW.currency') ||
        !sql.includes("RAISE(ABORT,'Incomplete structured costs')") || ECONOMIC_FIELDS.some(field => !sql.includes(`NEW.${field}`)))) return false;
    if (typeof insert !== 'string' || typeof update !== 'string' ||
        !insert.includes('SPR01_AVAILABLE_ON_BEGIN') || !update.includes('SPR01_AVAILABLE_ON_BEGIN')) return false;
    return ECONOMIC_FIELDS.every(field => insert.includes(`'${field}', NEW.${field},`) &&
      insert.split(`'${field}'`).length >= 3 && update.includes(`'${field}', OLD.${field},`) &&
      update.includes(`'${field}', NEW.${field},`) && update.includes(`'${field}', NEW.${field} IS NOT OLD.${field}`));
  } catch { return false; }
}

// Rechecked inside the listing INSERT/UPDATE statement so a replaced trigger or
// revoked schema marker between the read and the write fails closed.
const sqlLiteral = value => `'${value.replaceAll("'", "''")}'`;
const hasText = text => `INSTR(COALESCE(sql, ''), ${sqlLiteral(text)}) > 0`;
const twice = text => `(LENGTH(COALESCE(sql, '')) - LENGTH(REPLACE(COALESCE(sql, ''), ${sqlLiteral(text)}, ''))) >= ${2 * text.length}`;
const insertGuard = [hasText('SPR01_AVAILABLE_ON_BEGIN'), ...ECONOMIC_FIELDS.flatMap(field =>
  [hasText(`'${field}', NEW.${field},`), twice(`'${field}'`)])].join(' AND ');
const constraintGuard = [hasText('NEW.currency'), hasText("RAISE(ABORT,'Incomplete structured costs')"),
  ...ECONOMIC_FIELDS.map(field => hasText(`NEW.${field}`))].join(' AND ');
const updateGuard = [hasText('SPR01_AVAILABLE_ON_BEGIN'), ...ECONOMIC_FIELDS.flatMap(field => [
  hasText(`'${field}', OLD.${field},`), hasText(`'${field}', NEW.${field},`),
  hasText(`'${field}', NEW.${field} IS NOT OLD.${field}`)])].join(' AND ');
export const ECONOMICS_GUARD_SQL = `(EXISTS(SELECT 1 FROM pub06_structured_costs WHERE singleton=1 AND version=1)
  AND EXISTS(SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='listing_event_insert' AND ${insertGuard})
  AND EXISTS(SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='listing_event_update' AND ${updateGuard})
  AND EXISTS(SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='pub06_costs_guard_insert' AND ${constraintGuard})
  AND EXISTS(SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='pub06_costs_guard_update' AND ${constraintGuard}))`;
export const hasEconomicInput = body => Boolean(body && typeof body === 'object' && !Array.isArray(body) &&
  ECONOMIC_FIELDS.some(field => Object.hasOwn(body, field)));
