import { json, fail } from "../http.js";
import { activeSql } from "../applicants.js";
import { CANDIDATES_SQL } from "../match-store.js";
import { jerseyToday, plusDays } from "../viewings.js";
import { jerseyDayStart, groupDemand, topUnmet, funnel, responseTime, earliest } from "../insights.js";

const DAYS = ["7", "30", "90"];
// I8: offered to applicants and not archived; each query adds the operation.
const AVAILABLE = `${CANDIDATES_SQL} AND archived_at IS NULL`;
// A match in these statuses on an available listing of the applicant's operation. The listing subquery takes nothing
// from the applicant, so SQLite builds it once instead of scanning listings per match.
const matchIn = statuses => `EXISTS (SELECT 1 FROM matches m WHERE m.applicant_id = a.id AND m.status IN (${statuses})
  AND (m.listing_id, CASE a.operation WHEN 'rent' THEN 'rent' ELSE 'sale' END)
    IN (SELECT id, operation FROM listings WHERE ${AVAILABLE}))`;
const MATCHED = matchIn("'found', 'shortlisted'"); // I6
const OF_APPLICANT = "e.entity_type = 'applicant' AND e.entity_id = CAST(a.id AS TEXT)";
const OF_VIEWING = "e.entity_type = 'viewing' AND e.entity_id = CAST(v.id AS TEXT)";

// Bind order: from, to, since, from, to.
const TOTALS = `SELECT (SELECT COALESCE(SUM(n), 0) FROM daily_stats WHERE metric = 'view' AND day BETWEEN ? AND ?) AS views,
  (SELECT COUNT(*) FROM viewing_requests WHERE created_at >= ?) AS viewing_requests,
  (SELECT COUNT(*) FROM viewing_requests WHERE status = 'completed' AND date BETWEEN ? AND ?) AS viewings_completed,
  (SELECT MIN(day) FROM daily_stats) AS first_day`;
// I6, I7: today's active searches, never who they are.
const DEMAND = `SELECT a.operation, a.parishes_wanted, a.bedrooms_min, a.budget_max, ${MATCHED} AS matched
  FROM applicants a WHERE ${activeSql("a")}`;
const LISTINGS = `SELECT operation, parish, COUNT(*) AS n FROM listings WHERE ${AVAILABLE} GROUP BY operation, parish`;
// I9. Bind order: since, from, to.
const VIEWED = `SELECT s.listing_id, l.title, SUM(CASE s.metric WHEN 'view' THEN s.n ELSE 0 END) AS views,
  SUM(CASE s.metric WHEN 'photos' THEN s.n ELSE 0 END) AS photos, SUM(CASE s.metric WHEN 'tour' THEN s.n ELSE 0 END) AS tour,
  (SELECT COUNT(*) FROM viewing_requests v WHERE v.listing_id = s.listing_id AND v.created_at >= ?) AS viewings
  FROM daily_stats s JOIN listings l ON l.id = s.listing_id WHERE s.day BETWEEN ? AND ?
  GROUP BY s.listing_id HAVING views > 0 ORDER BY views DESC, s.listing_id LIMIT 10`;
// I10, I11 (a), (c): applicants created in the period and not archived, with the stages they were moved to (malformed
// event data skipped), the team's first change to them (applicant.matched comes from saving a listing: not attention)
// and, ruling R7, whether they have matches to review (active, with a found match on an available listing).
const COHORT = `SELECT a.source, a.stage, a.created_at, a.first_reviewed_at,
  (SELECT json_group_array(json_extract(e.data, '$.after.stage')) FROM events e
    WHERE ${OF_APPLICANT} AND e.type = 'applicant.stage_changed' AND json_valid(e.data)) AS stages,
  (SELECT MIN(e.at) FROM events e WHERE ${OF_APPLICANT} AND e.type IN ('applicant.stage_changed', 'applicant.updated')
    AND e.actor NOT IN ('public', 'system')) AS first_touch,
  ${activeSql("a")} AND ${matchIn("'found'")} AS to_review
  FROM applicants a WHERE a.archived_at IS NULL AND a.created_at >= ?`;
// I11 (b): website requests of the period (requested by 'public') and their first answer.
const WEB_VIEWINGS = `SELECT v.created_at, (SELECT MIN(e.at) FROM events e WHERE ${OF_VIEWING}
    AND e.type IN ('viewing.confirmed', 'viewing.cancelled', 'viewing.rescheduled')) AS replied_at
  FROM viewing_requests v WHERE v.created_at >= ?
    AND EXISTS (SELECT 1 FROM events e WHERE ${OF_VIEWING} AND e.type = 'viewing.requested' AND e.actor = 'public')`;

// I5: 7, 30 or 90 days (30 by default) that end today in Jersey and include it. Shared with the owner report (O2).
export function period(request) {
  const days = new URL(request.url).searchParams.get("days") ?? "30";
  if (!DAYS.includes(days)) fail(400, "Choose 7, 30 or 90 days");
  const to = jerseyToday();
  return { days: Number(days), from: plusDays(to, 1 - Number(days)), to };
}

// I12: one batch, counts and medians only.
async function insights({ request, env }) {
  const { days, from, to } = period(request), since = jerseyDayStart(from);
  const [[totals], active, available, viewed, cohort, webViewings] = await env.DB.batch([
    env.DB.prepare(TOTALS).bind(from, to, since, from, to),
    env.DB.prepare(DEMAND),
    env.DB.prepare(LISTINGS),
    env.DB.prepare(VIEWED).bind(since, from, to),
    env.DB.prepare(COHORT).bind(since),
    env.DB.prepare(WEB_VIEWINGS).bind(since),
  ]).then(r => r.map(x => x.results));
  const counts = funnel(cohort);
  return json({
    period: { days, from, to },
    totals: { views: totals.views, viewing_requests: totals.viewing_requests, new_applicants: counts.registered,
      viewings_completed: totals.viewings_completed },
    demand: groupDemand(active, available),
    unmet: topUnmet(active),
    views: { first_day: totals.first_day, rows: viewed },
    funnel: counts,
    times: {
      attend: responseTime(cohort.filter(a => a.source === "web")
        .map(a => [a.created_at, earliest(a.first_touch, a.first_reviewed_at)])),
      viewing_reply: responseTime(webViewings.map(v => [v.created_at, v.replied_at])),
      // R7: an unreviewed applicant waits only while there is something to review.
      first_review: responseTime(cohort.filter(a => a.first_reviewed_at || a.to_review)
        .map(a => [a.created_at, a.first_reviewed_at])),
    },
  });
}

export default [["GET", /^\/admin\/insights$/, insights, true]];
