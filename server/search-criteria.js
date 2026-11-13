// Internal, read-only foundation for BUS-12. No route calls this yet: callers
// must revalidate identity, permissions, state and both revisions in the same
// transaction as any write, notification or dispatch authorization.
// JSON columns remain in their stored form, as expected by the existing matcher;
// null is not converted to an empty answer or a preferred priority.
const CRITERIA_FIELDS = Object.freeze([
  'requirement_priorities', 'budget_min', 'budget_max', 'budget_stretch',
  'property_types', 'bedrooms_min', 'bedrooms_max', 'bedrooms_ideal',
  'bathrooms_min', 'parking_spaces', 'outdoor', 'furnished', 'pets',
  'area_answer', 'preferred_parish', 'parishes_wanted', 'parishes_excluded',
  'near', 'move_in_date', 'lease_term_months', 'buyer_position', 'mortgage_aip',
  'housing_status', 'household_adults', 'household_children', 'household_total',
  'household_children_status', 'household_children_ages', 'household_ages_at',
  'requirements', 'commercial_kind', 'commercial_use', 'area_min', 'area_max',
  'area_unit', 'commercial_purchase', 'commercial_rent', 'commercial_rent_period',
  'commercial_premium', 'commercial_expenses',
]);

export async function loadCriteriaSnapshot(env, applicantId) {
  if (!Number.isSafeInteger(applicantId) || applicantId < 1)
    throw new TypeError('Invalid applicant ID');
  const db = typeof env?.DB?.withSession === 'function' ? env.DB.withSession('first-primary') : env?.DB;
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Database unavailable');

  // Deliberately fail if the revision schema is absent. Guessing revision 0
  // would make a snapshot look concurrency-safe where it is not.
  const row = await db.prepare(`SELECT id, criteria_revision, match_inputs_revision, search_state, search_category,
    operation, search_operation, archived_at, ${CRITERIA_FIELDS.join(', ')} FROM applicants WHERE id = ?`)
    .bind(applicantId).first();
  if (!row) return null;
  if (!Number.isSafeInteger(row.criteria_revision) || row.criteria_revision < 0)
    throw new Error('Invalid criteria revision');
  if (!Number.isSafeInteger(row.match_inputs_revision) || row.match_inputs_revision < 0)
    throw new Error('Invalid match inputs revision');
  return {
    applicant_id: row.id,
    criteria_revision: row.criteria_revision,
    match_inputs_revision: row.match_inputs_revision,
    search_state: row.search_state,
    search_category: row.search_category,
    operation: row.search_operation ?? row.operation,
    archived_at: row.archived_at,
    criteria: Object.fromEntries(CRITERIA_FIELDS.map(field => [field, row[field]])),
  };
}

export { normalizeBudgetTerms } from "./budget-terms.js";
