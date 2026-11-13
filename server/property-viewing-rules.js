// VIS-10 foundation: these calculations do not authenticate staff, validate a
// keyholder or authorize access. They have no route, database writer or sender.
const OPERATIONS = new Set(['sale', 'rent', 'business']);
const ID = /^HE-[A-Z]\d{3,}$/;
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const invalid = () => { throw new TypeError('Invalid property viewing rules'); };

function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some(key => typeof key !== 'string' || !keys.includes(key)) ||
      names.some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) invalid();
  return value;
}
function scopeValue(value) {
  record(value, ['listing_id', 'operation']);
  if (typeof value.listing_id !== 'string' || !ID.test(value.listing_id) || !OPERATIONS.has(value.operation)) invalid();
  return value;
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) invalid();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) invalid();
  return parsed;
}

// A reference is only syntactically valid. No such reference proves that a
// keyholder exists, is active, has keys, or has consented to provide access.
export function validatePropertyViewingRules(value) {
  record(value, ['notice_hours', 'allowed_negotiator_ids', 'keyholder_ref', 'instructions']);
  const { notice_hours, allowed_negotiator_ids, keyholder_ref, instructions } = value;
  if (!Number.isInteger(notice_hours) || notice_hours < 0 || notice_hours > 168 ||
      !Array.isArray(allowed_negotiator_ids) || allowed_negotiator_ids.length > 200 ||
      !allowed_negotiator_ids.every(positiveId) || new Set(allowed_negotiator_ids).size !== allowed_negotiator_ids.length ||
      !(keyholder_ref === null || (typeof keyholder_ref === 'string' && /^negotiator:[1-9]\d*$/.test(keyholder_ref)
        && positiveId(Number(keyholder_ref.slice(11))))) ||
      !(instructions === null || (typeof instructions === 'string' && !instructions.includes('\0') && Array.from(instructions).length <= 2000))) invalid();
  return Object.freeze({notice_hours, allowed_negotiator_ids:Object.freeze([...allowed_negotiator_ids]), keyholder_ref, instructions});
}

// Advisory only. No current producer supplies a scoped, revocable, evidenced
// access check, so even passing conditions requires human review. The result is safe
// to display but must never be treated as booking permission or commit guard.
export function assessPropertyViewingRules(value) {
  record(value, ['scope', 'rules', 'listing', 'negotiator', 'starts_at', 'now']);
  const scope = scopeValue(value.scope), rules = validatePropertyViewingRules(value.rules);
  const listing = record(value.listing, ['id', 'operation', 'occupancy']);
  const negotiator = record(value.negotiator, ['id', 'active']);
  if (typeof listing.id !== 'string' || !ID.test(listing.id) || !OPERATIONS.has(listing.operation) ||
      !['occupied', 'vacant', 'unknown'].includes(listing.occupancy) || !positiveId(negotiator.id) ||
      typeof negotiator.active !== 'boolean') invalid();
  const starts = instant(value.starts_at), now = instant(value.now);
  if (listing.id !== scope.listing_id || listing.operation !== scope.operation) return {status:'ineligible', reasons:['scope_mismatch']};
  if (!negotiator.active) return {status:'ineligible', reasons:['inactive_negotiator']};
  if (!rules.allowed_negotiator_ids.includes(negotiator.id)) return {status:'ineligible', reasons:['negotiator_not_permitted']};
  if (starts - now < rules.notice_hours * 3600000) return {status:'ineligible', reasons:['insufficient_notice']};
  const reasons = [];
  if (listing.occupancy === 'unknown') reasons.push('occupancy_unknown');
  reasons.push('access_review_required');
  return {status:'needs_review', reasons};
}

// SQL is only one precondition for a future owner's atomic write: it checks
// the current rule/scope, active negotiator, whitelist and notice at DB time.
// It does NOT check actor permissions, occupation, opening hours, access proof,
// availability or other reservations. The owning statement must bind the same
// start and scope it inserts, and combine all required guards in one D1 batch.
export function propertyRulesReservationPrecondition(candidate, selectedRule) {
  record(candidate, ['scope', 'negotiator_id', 'starts_at']);
  const scope = scopeValue(candidate.scope), starts = instant(candidate.starts_at);
  record(selectedRule, ['id', 'revision']);
  if (!positiveId(candidate.negotiator_id) || typeof selectedRule.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(selectedRule.id) ||
      !positiveId(selectedRule.revision)) invalid();
  return {
    sql:`EXISTS (SELECT 1 FROM property_viewing_rules r
      JOIN listings l ON l.id=r.listing_id AND l.operation=r.operation AND l.archived_at IS NULL
      JOIN property_viewing_rule_negotiators m ON m.rule_id=r.id
      JOIN negotiators n ON n.id=m.negotiator_id AND n.active=1
      WHERE r.id=? AND r.revision=? AND r.state='active' AND l.id=? AND l.operation=? AND n.id=?
        AND ? >= CAST(strftime('%s','now') AS INTEGER)*1000
          + CAST(substr(strftime('%f','now'),4,3) AS INTEGER) + r.notice_hours*3600000)`,
    binds:[selectedRule.id, selectedRule.revision, scope.listing_id, scope.operation, candidate.negotiator_id, starts],
  };
}
