// Reviewing a match (B6), the keyboard review queue (spec §5 Review) and "Recalculate all" (B12).
import { json, fail, readJson, now } from "../http.js";
import { activeSql } from "../applicants.js";
import { extractFeatures } from "../listing-features.js";
import { afterSave, recomputeForApplicant, closeMatchedNoticeIfEmpty } from "../match-store.js";
import { COVER_ID } from "./listings.js";

const REASONS = ["price", "area", "size", "condition", "other"];
// The reviews a match in each status may get; back to found is Undo.
const NEXT = { found: ["shortlisted", "rejected"], shortlisted: ["found"], rejected: ["found"] };
const STALE = "Someone else reviewed this match. Reload to see it.";

const object = (alias, keys, extra = []) => `json_object(${[...keys.map(k => `'${k}', ${alias}.${k}`), ...extra].join(", ")})`;
// A match as its card shows it (spec §5), with its listing; from matches m JOIN listings l.
const CARD = `m.id, m.applicant_id, m.status, m.score, m.checks, m.reject_reason, m.reviewed_at, ${object("l", ["id", "title",
  "operation", "availability", "price_text", "sale_price", "rent", "rent_period", "currency", "parish", "bedrooms", "bathrooms",
  "published", "archived_at"], [`'cover_id', ${COVER_ID}`])} AS listing`;
export const MATCHES_SQL = `SELECT ${CARD} FROM matches m JOIN listings l ON l.id = m.listing_id`;
export const matchCard = m => ({ ...m, checks: JSON.parse(m.checks), listing: JSON.parse(m.listing) });

// The review queue: the found matches of active searches (spec §5), from matches m JOIN applicants a.
const QUEUED = `m.status = 'found' AND ${activeSql("a")}`;
const QUEUE_COUNT_SQL = `SELECT COUNT(*) AS n FROM matches m JOIN applicants a ON a.id = m.applicant_id WHERE ${QUEUED}`;
// The search shown next to the match, its JSON lists as lists; from applicants a JOIN contacts c.
const LISTS = ["property_types", "outdoor", "pets", "parishes_wanted", "parishes_excluded"];
const APPLICANT = object("a", ["id", "operation", "stage", "budget_min", "budget_max", "budget_stretch", "bedrooms_min",
  "bedrooms_ideal", "bathrooms_min", "parking_spaces", "furnished"],
  ["'name', c.name", ...LISTS.map(k => `'${k}', json(a.${k})`)]);
// Queue order: the oldest search first, then its best matches, ties by id. Bind: the match to resume after, twice;
// one that no longer exists starts the queue again.
const ORDER = "a.created_at, a.id, m.score DESC, m.id";
const AFTER = `AND (NOT EXISTS (SELECT 1 FROM matches WHERE id = ?) OR (a.created_at, a.id, -m.score, m.id) >
  (SELECT pa.created_at, pa.id, -pm.score, pm.id FROM matches pm JOIN applicants pa ON pa.id = pm.applicant_id WHERE pm.id = ?))`;

async function review({ request, env, admin, params: [id] }) {
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "Invalid format");
  const { status, from } = body;
  if (!Object.hasOwn(NEXT, from ?? "") || !NEXT[from].includes(status)) fail(400, "This match can't be moved there. Reload to see it.");
  const reason = status === "rejected" ? body.reject_reason : null;
  if (status === "rejected" && !REASONS.includes(reason)) fail(400, "Choose why the match is rejected");

  const m = await env.DB.prepare(`SELECT m.id, m.applicant_id, m.listing_id, m.status, a.archived_at
    FROM matches m JOIN applicants a ON a.id = m.applicant_id WHERE m.id = ?`).bind(Number(id)).first();
  if (!m) fail(404, "Match not found");
  if (m.archived_at) fail(409, "Restore this search to review its matches");
  if (m.status !== from) fail(409, STALE);

  const ts = now(), reviewed = status !== "found";
  // Written only while the match is in its new status: a found match a recompute removed after our read is not reviewed
  // (hence the event's own INSERT, not logEvent's).
  const ifThere = "EXISTS (SELECT 1 FROM matches WHERE id = ? AND status = ?)";
  let results;
  try {
    results = await env.DB.batch([
      // The status the client saw, checked inside the batch: a review landing after our read sets status to NULL, the
      // NOT NULL constraint fails and the whole batch rolls back.
      env.DB.prepare(`UPDATE matches SET status = CASE WHEN status = ? THEN ? END, reject_reason = ?, reviewed_by = ?,
        reviewed_at = ?, updated_at = ? WHERE id = ?`)
        .bind(from, status, reason, reviewed ? admin : null, reviewed ? ts : null, ts, m.id),
      // B13: the applicant's first review is kept, Undo included.
      ...(reviewed ? [env.DB.prepare(`UPDATE applicants SET first_reviewed_at = ? WHERE id = ? AND first_reviewed_at IS NULL
        AND ${ifThere}`).bind(ts, m.applicant_id, m.id, status)] : []),
      env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
        SELECT ?, ?, 'applicant', ?, 'match.reviewed', ? WHERE ${ifThere}`)
        .bind(ts, admin, String(m.applicant_id), JSON.stringify({ listing_id: m.listing_id, from, to: status, reason }), m.id, status),
      closeMatchedNoticeIfEmpty(env, m.applicant_id, admin),
    ]);
  } catch (e) {
    const cur = await env.DB.prepare("SELECT status FROM matches WHERE id = ?").bind(m.id).first();
    if (cur && cur.status !== from) fail(409, STALE);
    throw e;
  }
  if (!results[0].meta.changes) fail(409, "This match is no longer proposed. Reload to see the current matches.");
  // Undo puts the match back as found; the recompute then decides whether it still is one (listing archived or no longer
  // offered, the 25 best, today's checks), as for any other found match. Its failure leaves the review done.
  if (!reviewed) await afterSave(recomputeForApplicant, env, m.applicant_id, admin);
  // match null: the match is no longer proposed.
  const row = await env.DB.prepare(`${MATCHES_SQL} WHERE m.id = ?`).bind(m.id).first();
  return json({ match: row && matchCard(row) });
}

// The next found match of the queue after `after` (a match id), with its search and listing; remaining counts the whole
// queue, so a pass that skipped some ends with match null and remaining above 0.
async function next({ request, env }) {
  const p = new URL(request.url).searchParams.get("after");
  if (p != null && !/^\d{1,15}$/.test(p)) fail(400, "Invalid match");
  const after = p == null ? [] : [Number(p), Number(p)];
  const [[row], [{ n }]] = (await env.DB.batch([
    env.DB.prepare(`SELECT ${CARD}, ${APPLICANT} AS applicant FROM matches m JOIN listings l ON l.id = m.listing_id
      JOIN applicants a ON a.id = m.applicant_id JOIN contacts c ON c.id = a.contact_id
      WHERE ${QUEUED} ${after.length ? AFTER : ""} ORDER BY ${ORDER} LIMIT 1`).bind(...after),
    env.DB.prepare(QUEUE_COUNT_SQL),
  ])).map(r => r.results);
  if (!row) return json({ match: null, remaining: n });
  const { listing, applicant, ...match } = matchCard(row);
  return json({ match, applicant: JSON.parse(applicant), listing, remaining: n });
}

// "Recalculate all" (B12), one batch per call; the page calls again with `after: next` until next is null, listings
// first. Sized for the Workers free plan's 10 ms of CPU: reading 50 listings' text takes about 2 ms; recomputing one
// applicant against ~300 listings about 1 ms, so 5 per call.
export const RECALC_BATCH = { listings: 50, applicants: 5 };

// listings: reads the features and parish of every listing, offered or not (B10); a parish already set is never
// replaced (B3), and a listing saved meanwhile keeps what its own save read. updated_at is left alone: no false 409s.
async function recalcListings(env, after) {
  const [page, [{ n }]] = (await env.DB.batch([
    env.DB.prepare(`SELECT id, updated_at, location, road_name, specs, summary, description, property_type, title
      FROM listings WHERE id > ? ORDER BY id LIMIT ?`).bind(after ?? "", RECALC_BATCH.listings),
    env.DB.prepare("SELECT COUNT(*) AS n FROM listings"),
  ])).map(r => r.results);
  const ts = now();
  if (page.length) await env.DB.batch(page.map(l => {
    const { parish, ...features } = extractFeatures(l), cols = Object.keys(features);
    return env.DB.prepare(`UPDATE listings SET parish = COALESCE(parish, ?), ${cols.map(c => `${c} = ?`).join(", ")},
      features_at = ? WHERE id = ? AND updated_at = ?`).bind(parish, ...cols.map(c => features[c]), ts, l.id, l.updated_at);
  }));
  return { next: page.length === RECALC_BATCH.listings ? page.at(-1).id : null, total: n };
}

// applicants: recomputes every active search against the listings as they are now.
async function recalcApplicants(env, after, admin) {
  const active = activeSql("a");
  const [page, [{ n }]] = (await env.DB.batch([
    env.DB.prepare(`SELECT a.id FROM applicants a WHERE ${active} AND a.id > ? ORDER BY a.id LIMIT ?`)
      .bind(after ?? 0, RECALC_BATCH.applicants),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM applicants a WHERE ${active}`),
  ])).map(r => r.results);
  for (const { id } of page) await recomputeForApplicant(env, id, admin);
  return { next: page.length === RECALC_BATCH.applicants ? page.at(-1).id : null, total: n };
}

async function recalculate({ request, env, admin }) {
  const body = await readJson(request);
  const { phase, after = null } = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  if (phase === "listings" && (after === null || typeof after === "string"))
    return json({ phase, ...(await recalcListings(env, after)) });
  if (phase === "applicants" && (after === null || Number.isSafeInteger(after)))
    return json({ phase, ...(await recalcApplicants(env, after, admin)) });
  fail(400, "Send phase: listings or applicants, and after: the next value of the previous call");
}

export default [
  ["PUT", /^\/admin\/matches\/(\d+)$/, review, true],
  ["POST", /^\/admin\/matches\/recalculate$/, recalculate, true],
  ["GET", /^\/admin\/review$/, next, true],
];
