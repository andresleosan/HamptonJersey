// EST-10: the work labels of an active home search, several at once, each from its own fact and none hiding another.
// The match labels (B13, EST-04) come from the list as before; with EST10_LABELS_READY=1 the list also reads, in the
// same query and through indexes, an essential fact still to confirm on a match (requirements_rank 1: a must-have, pets,
// housing or area the property does not answer), a viewing linked to the search by a person (VIS-17's proposal, never an
// email or phone that happens to match) that is pending or booked, and BUS-17's 21-day internal review while its Inbox
// task is open. The obsolete "No matches for 7 days" rule is not kept: absence is BUS-17's review alone.
// A label is a pointer to work, never a decision: it closes no search, changes no criteria and confirms nothing.
// A source switched off or not migrated is not read and its labels are absent, never shown as none (sourceLabels).
// No imports: the panel reads WORK_LABEL_TEXT from here. The two producers' switches, as vis17Ready
// (viewing-coordination.js) and reviewReady (search-review.js) read them:
const vis17Ready = env => env?.VIS17_MULTIPART_READY === "1", reviewReady = env => env?.BUS17_REVIEW_READY === "1";

export const labelsReady = env => env?.EST10_LABELS_READY === "1";

export const WORK_LABEL_TEXT = { new: "New properties found", review: "Waiting for review", shortlisted: "Shortlisted", in_process: "In process",
  essential: "Requirement to confirm", viewing_pending: "Viewing pending", viewing_booked: "Viewing booked", search_review: "Search review due" };

// The labels EST-10 adds, for the sources read.
export const sourceLabels = ({ viewings, review }) =>
  ["essential", ...(viewings ? ["viewing_pending", "viewing_booked"] : []), ...(review ? ["search_review"] : [])];

// row: one listed search, its queue null when it is not in the work queue (not active, archived or commercial).
export function workLabelsFor(row) {
  if (row.queue == null) return null;
  return [row.queue === WORK_LABEL_TEXT.new && "new", row.found > 0 && "review", row.shortlisted > 0 && "shortlisted", !!row.in_process && "in_process",
    ...["essential", "viewing_pending", "viewing_booked", "search_review"].filter(k => !!row[k])].filter(Boolean);
}

// Only for a search in the work queue (as the queue column): the others show no label, so nothing else is read for them.
const QUEUED = "a.search_state = 'active' AND a.archived_at IS NULL AND a.search_category = 'residential'";
const queued = expr => `CASE WHEN ${QUEUED} THEN ${expr} ELSE 0 END`;
// Per search a (applicants a): a match not rejected with requirements_rank 1 (matches_page index): a must-have, pets,
// housing or area the property does not answer, a requirement whose importance is not stated, or an older match ranked
// before priorities existed.
const ESSENTIAL = `EXISTS (SELECT 1 FROM matches m WHERE m.applicant_id = a.id AND m.status IN ('found', 'shortlisted') AND m.requirements_rank = 1)`;
// The viewings linked to this search by a person (viewing_proposals_applicant index): through the viewing's latest proposal
// only, so a viewing re-linked to another search stops labelling the first. Still to come: its end (or start) later than
// now, Jersey time; bind "YYYY-MM-DD HH:MM". Pending: an open proposal whose time is still to come on a viewing requested
// or confirmed, or a request still to come; booked: the viewing itself confirmed and still to come.
const LINKED = `FROM viewing_proposals p JOIN viewing_requests v ON v.id = p.viewing_id WHERE p.applicant_id = a.id
  AND NOT EXISTS (SELECT 1 FROM viewing_proposals q WHERE q.viewing_id = p.viewing_id AND q.revision > p.revision)`;
const AHEAD = t => `${t}.date || ' ' || COALESCE(${t}.end_time, ${t}.time) > ?`;
const PENDING = `EXISTS (SELECT 1 ${LINKED} AND v.status IN ('requested', 'confirmed')
  AND ((p.state = 'open' AND ${AHEAD("p")}) OR (v.status = 'requested' AND ${AHEAD("v")})))`;
const BOOKED = `EXISTS (SELECT 1 ${LINKED} AND v.status = 'confirmed' AND ${AHEAD("v")})`;
// BUS-17's open review (search_reviews_one_open), until the team's Done on its Inbox task.
const REVIEW = `EXISTS (SELECT 1 FROM search_reviews r WHERE r.applicant_id = a.id AND r.closed_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.task_key = 'bus17:review:' || r.id AND n.resolved_at IS NOT NULL))`;

// What the list adds while switched on: its columns (each ", <expr> AS <label>"), their binds and the labels it can show.
// clock: Jersey's { date, time } now. null when off: the list is read exactly as before.
export async function labelColumns(env, clock) {
  if (!labelsReady(env)) return null;
  const wanted = [vis17Ready(env) && "viewing_proposals", reviewReady(env) && "search_reviews"].filter(Boolean);
  const have = new Set(wanted.length ? (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(wanted)).all()).results.map(r => r.name) : []);
  const viewings = have.has("viewing_proposals"), review = have.has("search_reviews"), now = `${clock.date} ${clock.time}`;
  return {
    sql: `, ${queued(ESSENTIAL)} AS essential${viewings ? `, ${queued(PENDING)} AS viewing_pending, ${queued(BOOKED)} AS viewing_booked` : ""}${review
      ? `, ${queued(REVIEW)} AS search_review` : ""}`,
    args: viewings ? [now, now, now] : [],
    labels: sourceLabels({ viewings, review }),
  };
}
