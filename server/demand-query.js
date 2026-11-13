import { activeSql } from './applicants.js';
import { CANDIDATES_SQL } from './match-store.js';

// Match predicate shared with Insights: only available residential listings count.
export const DEMAND_AVAILABLE = `${CANDIDATES_SQL} AND archived_at IS NULL`;
export const demandMatchIn = statuses => `EXISTS (SELECT 1 FROM matches m WHERE m.applicant_id = a.id AND m.status IN (${statuses})
  AND (m.listing_id, CASE a.operation WHEN 'rent' THEN 'rent' ELSE 'sale' END)
    IN (SELECT id, operation FROM listings WHERE ${DEMAND_AVAILABLE}))`;
export const DEMAND_MATCHED = demandMatchIn("'found', 'shortlisted'");
export const INSIGHTS_DEMAND_SQL = `SELECT a.operation, a.area_answer, a.parishes_wanted, a.parishes_excluded, a.bedrooms_min, a.budget_max, ${DEMAND_MATCHED} AS matched
  FROM applicants a WHERE ${activeSql('a')} AND a.search_category = 'residential'`;
export const SNAPSHOT_DEMAND_SQL = `SELECT a.id,a.contact_id,a.operation,a.area_answer,a.parishes_wanted,a.parishes_excluded,a.bedrooms_min,${DEMAND_MATCHED} AS matched
  FROM applicants a WHERE ${activeSql('a')} AND a.search_category = 'residential' AND a.operation = ?`;
export function readDemandSearches(env, operation) {
  if (!['rent','buy'].includes(operation)) throw new TypeError('Invalid operation');
  return env.DB.batch([
    env.DB.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') AS as_of"),
    env.DB.prepare(SNAPSHOT_DEMAND_SQL).bind(operation),
  ]);
}
