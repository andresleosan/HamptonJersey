// Recomputes and stores the matches of an applicant or of a listing (spec §4 «Recálculo», B2, B11, B14).
// evaluate() decides every rule; this file only gates the candidates, keeps the best MAX_FOUND found and writes them,
// with the applicant.matched event and the applicant's matched Inbox notice, in one batch.
import { now } from "./http.js";
import { logEvent } from "./events.js";
import { activeSql, isActive } from "./applicants.js";
import { evaluate, MIN_SCORE, MAX_FOUND } from "./matching.js";

// Listings that may be offered (B2): archived ones too. The applicant's operation is evaluate()'s first filter.
export const CANDIDATES_SQL = `matchable = 1 AND use = 'residential' AND availability IN ('for_sale','to_let','lease')
  AND operation IN ('sale','rent') AND (country IS NULL OR country = 'Jersey') AND (currency IS NULL OR currency = 'GBP')`;
const LISTING_OPERATION = { rent: "rent", buy: "sale" };

// Only the columns evaluate() reads (never the listing's text: B10), plus whether the listing is a candidate.
const LISTING = `id, operation, archived_at, bedrooms, bathrooms, parish, published, sale_price, rent, rent_period,
  feat_pets, feat_parking, feat_furnished, feat_outdoor, feat_type, feat_evidence, (${CANDIDATES_SQL}) AS candidate`;
// The applicant's search as evaluate() reads it, whether it is active, and the contact's name for the notice.
const APPLICANT = `a.id, a.archived_at, a.stage, a.operation, a.budget_min, a.budget_max, a.budget_stretch,
  a.property_types, a.bedrooms_min, a.bedrooms_ideal, a.bathrooms_min, a.parking_spaces, a.outdoor, a.furnished, a.pets,
  a.parishes_wanted, a.parishes_excluded, c.name FROM applicants a JOIN contacts c ON c.id = a.contact_id`;

// The applicant's open matched notice; notices find their applicant through their event. Bind: the applicant id.
const OPEN_NOTICE = `resolved_at IS NULL AND category = 'matched'
  AND event_id IN (SELECT id FROM events WHERE entity_type = 'applicant' AND entity_id = ?)`;
// "<N> new matches for <name>" with N the found matches stored now (B14). Bind: the applicant id, the name.
const TITLE = `(SELECT COUNT(*) || CASE WHEN COUNT(*) = 1 THEN ' new match for ' ELSE ' new matches for ' END
  FROM matches WHERE applicant_id = ? AND status = 'found') || ?`;

// Resolves the applicant's open matched notice once none of its matches is found any more (B14).
export const closeMatchedNoticeIfEmpty = (env, applicantId, by) => env.DB.prepare(
  `UPDATE notifications SET resolved_at = ?, resolved_by = ? WHERE ${OPEN_NOTICE}
   AND NOT EXISTS (SELECT 1 FROM matches WHERE applicant_id = ? AND status = 'found')`)
  .bind(now(), by, String(applicantId), applicantId);

// The writes for one applicant (a: an APPLICANT row).
// results: the listings evaluated now, [{ listing_id, score, checks (JSON text), passing }].
// stored: Map listing_id → this applicant's match for those listings (or all of its matches when all were evaluated:
//   a found one without a result then no longer passes).
// others: found matches left as they are but counted against MAX_FOUND, [{ id, listing_id, score }].
function writesFor(env, a, results, stored, others, actor, ts) {
  const stmts = [], pool = [];
  const del = m => stmts.push(env.DB.prepare("DELETE FROM matches WHERE id = ? AND status = 'found'").bind(m.id));
  const refresh = (m, r) => (m.score !== r.score || m.checks !== r.checks) && stmts.push(env.DB.prepare(
    "UPDATE matches SET score = ?, checks = ?, updated_at = ? WHERE id = ? AND status <> 'rejected'")
    .bind(r.score, r.checks, ts, m.id));
  const evaluated = new Set();
  for (const r of results) {
    evaluated.add(r.listing_id);
    const m = stored.get(r.listing_id);
    if (m?.status === "rejected") continue; // never re-proposed nor touched
    if (m?.status === "shortlisted") refresh(m, r); // stays even when it stops passing, showing what fails now
    else if (r.passing) pool.push({ ...r, match: m });
    else if (m) del(m); // never reviewed
  }
  for (const m of stored.values()) if (m.status === "found" && !evaluated.has(m.listing_id)) del(m);
  pool.push(...others.map(m => ({ listing_id: m.listing_id, score: m.score, match: m, kept: true })));

  // The best MAX_FOUND found (B11), ties by listing id.
  pool.sort((x, y) => y.score - x.score || (x.listing_id < y.listing_id ? -1 : 1));
  let created = 0;
  pool.forEach((p, i) => {
    if (i >= MAX_FOUND) { if (p.match) del(p.match); }
    else if (!p.match) {
      created++;
      // A recompute running at the same time may have inserted the pair already.
      stmts.push(env.DB.prepare(`INSERT INTO matches (applicant_id, listing_id, score, checks, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'found', ?, ?) ON CONFLICT (applicant_id, listing_id) DO NOTHING`)
        .bind(a.id, p.listing_id, p.score, p.checks, ts, ts));
    } else if (!p.kept) refresh(p.match, p);
  });
  if (!stmts.length) return { stmts, created };

  // B14: the event when there are new ones; one open notice, created on its event when none is open, titled with the
  // total found now; closed at zero found.
  const id = String(a.id);
  if (created) stmts.push(
    ...logEvent(env, { actor, entity_type: "applicant", entity_id: id, type: "applicant.matched", data: { new: created } }),
    env.DB.prepare(`INSERT INTO notifications (event_id, category, title, action_required, created_at)
      SELECT last_insert_rowid(), 'matched', ${TITLE}, 1, ? WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE ${OPEN_NOTICE})`)
      .bind(a.id, a.name, ts, id));
  stmts.push(env.DB.prepare(`UPDATE notifications SET title = ${TITLE} WHERE ${OPEN_NOTICE}
    AND EXISTS (SELECT 1 FROM matches WHERE applicant_id = ? AND status = 'found')`).bind(a.id, a.name, id, a.id),
  closeMatchedNoticeIfEmpty(env, a.id, actor));
  return { stmts, created };
}

// A listing row (with its candidate flag) against an applicant.
function result(a, l) {
  const r = evaluate(a, l);
  return { listing_id: l.id, score: r.score, checks: JSON.stringify(r.checks),
    passing: l.candidate === 1 && r.pass && r.score >= MIN_SCORE };
}

const byListing = list => new Map(list.map(m => [m.listing_id, m]));

// After an applicant is saved. actor: an admin email, 'public' or 'system'.
export async function recomputeForApplicant(env, applicantId, actor) {
  const a = await env.DB.prepare(`SELECT ${APPLICANT} WHERE a.id = ?`).bind(applicantId).first();
  if (!a) return { created: 0 };
  if (!isActive(a)) {
    await env.DB.batch([env.DB.prepare("DELETE FROM matches WHERE applicant_id = ? AND status = 'found'").bind(a.id),
      closeMatchedNoticeIfEmpty(env, a.id, actor)]);
    return { created: 0 };
  }
  // The candidates, and the shortlisted ones that left them (their checks still show what fails now).
  const [listings, stored] = (await env.DB.batch([
    env.DB.prepare(`SELECT ${LISTING} FROM listings WHERE (${CANDIDATES_SQL} AND operation = ?)
      OR id IN (SELECT listing_id FROM matches WHERE applicant_id = ? AND status = 'shortlisted')`)
      .bind(LISTING_OPERATION[a.operation], a.id),
    env.DB.prepare("SELECT id, listing_id, status, score, checks FROM matches WHERE applicant_id = ?").bind(a.id),
  ])).map(r => r.results);
  const { stmts, created } = writesFor(env, a, listings.map(l => result(a, l)), byListing(stored), [], actor, now());
  if (stmts.length) await env.DB.batch(stmts);
  return { created };
}

// After a listing is saved, archived or restored: its pair with every active applicant, in one batch.
export async function recomputeForListing(env, listingId, actor) {
  const l = await env.DB.prepare(`SELECT ${LISTING} FROM listings WHERE id = ?`).bind(listingId).first();
  if (!l) return;
  // A listing that is not offered only concerns the applicants already matched with it.
  const [applicants, stored] = (await env.DB.batch([
    env.DB.prepare(`SELECT ${APPLICANT} WHERE ${activeSql("a")}
      ${l.candidate ? "" : "AND a.id IN (SELECT applicant_id FROM matches WHERE listing_id = ?)"}`)
      .bind(...(l.candidate ? [] : [listingId])),
    env.DB.prepare("SELECT id, applicant_id, listing_id, status, score, checks FROM matches WHERE listing_id = ?")
      .bind(listingId),
  ])).map(r => r.results);
  const mine = new Map(stored.map(m => [m.applicant_id, m]));
  const results = new Map(applicants.map(a => [a.id, result(a, l)]));
  // Where it passes, the applicant's other found matches decide whether it is among the best MAX_FOUND.
  const passing = applicants.filter(a => results.get(a.id).passing).map(a => a.id);
  const others = new Map();
  if (passing.length) {
    const { results: rows } = await env.DB.prepare(`SELECT id, applicant_id, listing_id, score FROM matches
      WHERE status = 'found' AND listing_id <> ? AND applicant_id IN (SELECT value FROM json_each(?))`)
      .bind(listingId, JSON.stringify(passing)).all();
    for (const m of rows) others.has(m.applicant_id) ? others.get(m.applicant_id).push(m) : others.set(m.applicant_id, [m]);
  }
  // ponytail: an offered listing is evaluated against every active applicant in one JS loop and one batch, and the
  // others read holds up to MAX_FOUND rows per passing applicant. Fine for hundreds of applicants; at tens of
  // thousands this moves to a queue, in batches.
  const ts = now(), stmts = [];
  for (const a of applicants) {
    const m = mine.get(a.id);
    stmts.push(...writesFor(env, a, [results.get(a.id)], byListing(m ? [m] : []), others.get(a.id) ?? [], actor, ts).stmts);
  }
  if (stmts.length) await env.DB.batch(stmts);
}
