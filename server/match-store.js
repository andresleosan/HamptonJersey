// Recomputes and stores the matches of an applicant or of a listing (spec §4 «Recálculo», B2, B11, B14).
// evaluate() decides every rule; this file only gates the candidates, stores all passing candidates,
// with the applicant.matched event and the applicant's matched Inbox notice, in one batch.
import { now, fail } from "./http.js";
import { activeSql, isActive } from "./applicants.js";
import { evaluate } from "./matching.js";
import { areaPreferenceRank } from "./requirements.js";

// Listings that may be offered: archived listings are excluded. The applicant's operation is evaluate()'s first filter.
export const CANDIDATES_SQL = `archived_at IS NULL AND matchable = 1 AND use = 'residential' AND availability IN ('for_sale','to_let','lease')
  AND operation IN ('sale','rent') AND (country IS NULL OR country = 'Jersey') AND (currency IS NULL OR currency = 'GBP')`;
export const LISTING_OPERATION = { rent: "rent", buy: "sale" };

// Keep each JSON binding below D1's 2,000,000-byte string limit, including the larger event payload form.
export const MATCH_SNAPSHOT_MAX_BYTES = 1900000;
export const MATCH_SNAPSHOT_LIMIT_MESSAGE = "The comparison exceeds the safe processing limit. Contact support.";
export const MATCH_SNAPSHOT_INVALID_MESSAGE = "The comparison inputs could not be verified. Contact support.";
export const MATCH_INCOMPLETE_MESSAGE = "The recalculation could not be confirmed. Refresh before trying again.";
export const MATCH_RESULT_UNKNOWN_MESSAGE = "The recalculation outcome is unknown; it may have completed. Refresh before trying again.";
const snapshotEncoder = new TextEncoder();
export function encodeMatchSnapshot(listings, maxBytes=MATCH_SNAPSHOT_MAX_BYTES) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<2||maxBytes>MATCH_SNAPSHOT_MAX_BYTES) throw new RangeError('Invalid snapshot limit');
  const parts=[]; let bytes=2,eventBytes=2;
  for(const listing of listings) {
    if(typeof listing.id!=='string'||!listing.id.length||!Number.isSafeInteger(listing.match_inputs_revision)||listing.match_inputs_revision<0)
      return {issue:'snapshot_invalid'};
    const part=JSON.stringify({id:listing.id,version:listing.match_inputs_revision});
    const size=snapshotEncoder.encode(part).byteLength+(parts.length?1:0);
    bytes+=size; eventBytes+=size+8; // "listing_id" is eight ASCII bytes longer than "id".
    if(bytes>maxBytes||eventBytes>maxBytes)return {issue:'snapshot_too_large'};
    parts.push(part);
  }
  return {json:`[${parts.join(',')}]`};
}

export const matchSnapshotMessage = reason => reason==='snapshot_too_large'
  ? MATCH_SNAPSHOT_LIMIT_MESSAGE : MATCH_SNAPSHOT_INVALID_MESSAGE;

// Only the columns evaluate() reads (never the listing's text: B10), plus whether the listing is a candidate.
export const LISTING = `COALESCE((SELECT version FROM listing_match_inputs WHERE listing_id=listings.id),0) AS match_inputs_revision, id, operation, availability, archived_at, bedrooms, bathrooms, parish, published, sale_price, rent, rent_period, currency,
  feat_pets, feat_parking, feat_furnished, feat_outdoor, feat_type, feat_evidence, tenure_type, housing_category, restriction,
  (${CANDIDATES_SQL}) AS candidate`;
// The applicant's search as evaluate() reads it, whether it is active, and the contact's name for the notice.
export const APPLICANT = `a.match_inputs_revision, a.matches_revision, a.requirement_priorities, a.household_children, a.household_children_status, a.move_in_date, a.lease_term_months, a.near, a.requirements, a.id, a.archived_at, a.stage, a.search_state, a.search_category, a.updated_at, a.operation, a.budget_min, a.budget_max, a.budget_stretch,
  a.property_types, a.bedrooms_min, a.bedrooms_max, a.bedrooms_ideal, a.bathrooms_min, a.parking_spaces, a.outdoor, a.furnished, a.pets,
  a.area_answer, a.preferred_parish, a.parishes_wanted, a.parishes_excluded, a.housing_status, a.buyer_position, c.name FROM applicants a JOIN contacts c ON c.id = a.contact_id`;

// The applicant's open matched notice; notices find their applicant through their event, so the lookup starts from the
// applicant's events (events_entity, then notifications_event), never from every open notice: CROSS JOIN keeps that
// order in SQLite, which would otherwise start from notifications_open. Bind: the applicant id.
const matchedNotice = condition => `id IN (SELECT n.id FROM events e CROSS JOIN notifications n ON n.event_id = e.id
  WHERE e.entity_type = 'applicant' AND e.entity_id = ? AND n.category = 'matched' AND ${condition})`;
const OPEN_NOTICE = matchedNotice('n.resolved_at IS NULL');
const SOURCE_CLOSABLE_NOTICE = matchedNotice('(n.resolved_at IS NULL OR n.closed_by_source = 0)');
// "<N> new matches for <name>" with N the found matches stored now (B14). Bind: the applicant id, the name.
const TITLE = `(SELECT COUNT(*) || CASE WHEN COUNT(*) = 1 THEN ' new match for ' ELSE ' new matches for ' END
  FROM matches WHERE applicant_id = ? AND status = 'found') || ?`;

// Resolves the applicant's open matched notice once none of its matches is found any more (B14).
export const closeMatchedNoticeIfEmpty = (env, applicantId, by) => env.DB.prepare(
  `UPDATE notifications SET resolved_at = COALESCE(resolved_at, ?), resolved_by = COALESCE(resolved_by, ?),
    closed_by_source = 1, task_actor = ?, task_action = 'source_resolved' WHERE ${SOURCE_CLOSABLE_NOTICE}
   AND NOT EXISTS (SELECT 1 FROM matches WHERE applicant_id = ? AND status = 'found')`)
  .bind(now(), by, by, String(applicantId), applicantId);

// Every mutation rechecks the search inputs and the evaluated property's input revision inside the transaction.
function writesFor(env, a, results, stored, actor, ts) {
  const search = `EXISTS (SELECT 1 FROM applicants a WHERE a.id = ? AND a.updated_at = ?
    AND a.match_inputs_revision = ? AND ${activeSql("a")})`;
  const guarded = (sql, ...args) => env.DB.prepare(sql).bind(...args,a.id,a.updated_at,a.match_inputs_revision);
  const validListing = `EXISTS (SELECT 1 FROM listings WHERE id = ? AND COALESCE((SELECT version FROM listing_match_inputs WHERE listing_id=listings.id),0) = ?)`;
  const stmts=[];
  let newEventIndex=null;
  const fresh=results.filter(r=>r.passing&&!stored.has(r.listing_id));
  if(fresh.length) {
    // Count absent pairs in SQL, before inserting them. A second serialized transaction sees zero, even when
    // both callers evaluated the same absent pairs. Triggers preserve changes() for the immediately following notice.
    const missing=`(SELECT COUNT(*) FROM json_each(?) r JOIN listings l ON l.id=json_extract(r.value,'$.listing_id')
      AND COALESCE((SELECT version FROM listing_match_inputs WHERE listing_id=l.id),0)=json_extract(r.value,'$.version') WHERE NOT EXISTS
      (SELECT 1 FROM matches WHERE applicant_id=? AND listing_id=l.id))`;
    const payload=JSON.stringify(fresh.map(r=>({listing_id:r.listing_id,version:r.version})));
    newEventIndex=stmts.length;
    stmts.push(guarded(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT ?,?,'applicant',?,'applicant.matched',json_object('new',${missing}) WHERE ${missing}>0 AND ${search}`,
      ts,actor,String(a.id),payload,a.id,payload,a.id));
    stmts.push(guarded(`INSERT INTO notifications(event_id,category,title,action_required,created_at)
      SELECT last_insert_rowid(),'matched',${TITLE},1,? WHERE changes()>0
      AND NOT EXISTS(SELECT 1 FROM notifications WHERE ${OPEN_NOTICE}) AND ${search}`,a.id,a.name,ts,String(a.id)));
  }
  for(const r of results) {
    const m=stored.get(r.listing_id);
    if(m?.status==='rejected')continue;
    const guard=`${validListing} AND ${search}`;
    const args=[r.listing_id,r.version];
    if(m?.status==='shortlisted'||(m&&r.passing)) {
      if(m.score!==r.score||m.checks!==r.checks||m.requirements_rank!==r.requirements_rank||m.area_preference_rank!==r.area_preference_rank)
        stmts.push(guarded(`UPDATE matches SET score=?,checks=?,requirements_rank=?,area_preference_rank=?,updated_at=?
          WHERE id=? AND status<>'rejected' AND ${guard}`,r.score,r.checks,r.requirements_rank,r.area_preference_rank,ts,m.id,...args));
    } else if(m) {
      stmts.push(guarded(`DELETE FROM matches WHERE id=? AND status='found' AND ${guard}`,m.id,...args));
    } else if(r.passing) {
      stmts.push(guarded(`INSERT INTO matches(applicant_id,listing_id,score,checks,requirements_rank,area_preference_rank,status,created_at,updated_at)
        SELECT ?,?,?,?,?,?,'found',?,? WHERE ${guard} ON CONFLICT(applicant_id,listing_id) DO NOTHING`,
        a.id,r.listing_id,r.score,r.checks,r.requirements_rank,r.area_preference_rank,ts,ts,...args));
    }
  }
  if(!fresh.length&&!results.some(r=>!r.passing&&stored.get(r.listing_id)?.status==='found'))return {stmts,search,guarded,newEventIndex};
  stmts.push(guarded(`UPDATE notifications SET title=${TITLE} WHERE ${OPEN_NOTICE}
    AND EXISTS(SELECT 1 FROM matches WHERE applicant_id=? AND status='found') AND ${search}`,a.id,a.name,String(a.id),a.id),
    guarded(`UPDATE notifications SET resolved_at=COALESCE(resolved_at,?),resolved_by=COALESCE(resolved_by,?),
    closed_by_source=1,task_actor=?,task_action='source_resolved' WHERE ${SOURCE_CLOSABLE_NOTICE}
    AND NOT EXISTS(SELECT 1 FROM matches WHERE applicant_id=? AND status='found') AND ${search}`,ts,actor,actor,String(a.id),a.id));
  return {stmts,search,guarded,newEventIndex};
}

// A listing row (with its candidate flag) against an applicant.
function result(a, l) {
  const r = evaluate(a, l);
  return { listing_id: l.id, version:l.match_inputs_revision, score: r.score, requirements_rank:r.requirements_rank, area_preference_rank:areaPreferenceRank(a,l), checks: JSON.stringify(r.checks),
    passing: l.candidate === 1 && r.pass };
}

const byListing = list => new Map(list.map(m => [m.listing_id, m]));

// Runs a recompute once its save has committed. A failure is logged and leaves the save saved and its answer as
// usual: the next save, or "Recalculate all", repairs the matches.
export async function afterSave(recompute, ...args) {
  try { await recompute(...args); } catch (e) { console.error("Match recompute failed", e); }
}

// After an applicant is saved. actor: an admin email, 'public' or 'system'.
export async function recomputeForApplicantWithStatus(env, applicantId, actor, restoreNotice = false) {
  const a = await env.DB.prepare(`SELECT ${APPLICANT} WHERE a.id = ?`).bind(applicantId).first();
  if (!a || !isActive(a) || a.search_category !== "residential")
    return { created: 0, completed: false, reason: 'not_applicable' }; // Commercial matching belongs to M04.
  if (!Number.isSafeInteger(a.matches_revision) || a.matches_revision < 0)
    return { created: 0, completed: false, reason: 'snapshot_invalid' };
  // The candidates, and the shortlisted ones that left them (their checks still show what fails now).
  const [listings, stored] = (await env.DB.batch([
    env.DB.prepare(`SELECT ${LISTING} FROM listings WHERE (${CANDIDATES_SQL} AND operation = ?)
      OR id IN (SELECT listing_id FROM matches WHERE applicant_id = ? AND status <> 'rejected')`)
      .bind(LISTING_OPERATION[a.operation], a.id),
    env.DB.prepare("SELECT id, listing_id, status, score, checks, requirements_rank, area_preference_rank FROM matches WHERE applicant_id = ?").bind(a.id),
  ])).map(r => r.results);
  const encoded=encodeMatchSnapshot(listings);
  if(encoded.issue)return {created:0,completed:false,reason:encoded.issue};
  const versions=encoded.json;
  const { stmts, search, guarded, newEventIndex } = writesFor(env, a, listings.map(l => result(a, l)), byListing(stored), actor, now());
  // The event's count is computed inside this transaction before the corresponding inserts. Read it directly:
  // D1's metadata can include trigger writes, and a SELECT preserves changes() for the following notice statement.
  let createdIndex=null;
  if(newEventIndex!==null) {
    createdIndex=newEventIndex+1;
    stmts.splice(createdIndex,0,env.DB.prepare(`SELECT CASE WHEN changes()=1 THEN
      COALESCE((SELECT json_extract(data,'$.new') FROM events WHERE id=last_insert_rowid()),0) ELSE 0 END AS created`));
  }
  // A full run must cover the current candidate set, not only the rows that happened to be read. A guard at the
  // start of the batch prevents partial matches and notices if that set or an evaluated input has changed.
  const snapshot = `NOT EXISTS
    (SELECT 1 FROM json_each(?) v LEFT JOIN listings l ON l.id=json_extract(v.value,'$.id')
    WHERE l.id IS NULL OR COALESCE((SELECT version FROM listing_match_inputs WHERE listing_id=l.id),0)<>json_extract(v.value,'$.version'))
    AND NOT EXISTS (SELECT id FROM listings WHERE ${CANDIDATES_SQL} AND operation=?
      EXCEPT SELECT json_extract(value,'$.id') FROM json_each(?))`;
  const initialSearch = `${search} AND (SELECT matches_revision FROM applicants WHERE id=?) = ?`;
  const snapshotArgs=[versions,LISTING_OPERATION[a.operation],versions,a.id,a.updated_at,a.match_inputs_revision,a.id,a.matches_revision];
  // The existing NOT NULL constraint is an atomic rollback barrier, not a progress record or a timestamp update.
  // Match writes advance matches_revision, so compare it only at this initial barrier.
  stmts.unshift(env.DB.prepare(`UPDATE applicants SET updated_at=CASE WHEN ${snapshot} AND ${initialSearch} THEN updated_at END WHERE id=?`)
    .bind(...snapshotArgs,a.id));
  if(createdIndex!==null)createdIndex++;
  stmts.push(guarded(`UPDATE applicants SET match_ranking_version=1 WHERE id=? AND NOT EXISTS
    (SELECT 1 FROM json_each(?) v LEFT JOIN listings l ON l.id=json_extract(v.value,'$.id')
    WHERE l.id IS NULL OR COALESCE((SELECT version FROM listing_match_inputs WHERE listing_id=l.id),0)<>json_extract(v.value,'$.version')) AND ${search}`,a.id,versions));
  // A ranking trigger may add to D1 meta.changes; SQLite changes() reports this statement's direct row count.
  const completion=stmts.length;
  stmts.push(env.DB.prepare('SELECT changes() AS direct_changes'));
  // Reopening may retain exactly the same Found matches. Give that decision its own Inbox notice even when
  // recalculation creates nothing, leaving the old resolved notice and its event intact.
  if (restoreNotice) stmts.push(env.DB.prepare(`INSERT INTO notifications (event_id, category, title, action_required, created_at)
    SELECT e.id, 'matched', ${TITLE}, 1, ? FROM events e
    WHERE e.entity_type = 'applicant' AND e.entity_id = ? AND e.type = 'applicant.search_reopened' AND changes() = 1
      AND EXISTS (SELECT 1 FROM applicants a WHERE a.id = ? AND a.updated_at = ? AND a.match_inputs_revision = ? AND ${activeSql("a")})
      AND EXISTS (SELECT 1 FROM matches WHERE applicant_id = ? AND status = 'found')
      AND NOT EXISTS (SELECT 1 FROM notifications WHERE ${OPEN_NOTICE})
    ORDER BY e.id DESC LIMIT 1`).bind(a.id, a.name, now(), String(a.id), a.id, a.updated_at, a.match_inputs_revision, a.id, String(a.id)));
  let written;
  try { written = await env.DB.batch(stmts); }
  catch (error) {
    if (/NOT NULL constraint failed: applicants\.updated_at/i.test(String(error?.message))) {
      // A later unrelated constraint can have the same message. Only classify a conflict when the saved snapshot
      // is still demonstrably stale; otherwise preserve the original error.
      let state=null;
      try { state=await env.DB.prepare(`SELECT CASE WHEN ${snapshot} AND ${initialSearch} THEN 1 ELSE 0 END AS valid,
        EXISTS(SELECT 1 FROM applicants a WHERE a.id=? AND ${activeSql("a")} AND a.search_category='residential') AS applicable`)
        .bind(...snapshotArgs,a.id).first(); } catch { /* preserve the original batch failure */ }
      if (state?.valid===0) return state.applicable===0 ? {created:0,completed:false,reason:'not_applicable'} : {created:0,completed:false};
    }
    // A transport failure may happen after the database committed; never claim it rolled back.
    for (let cause=error, depth=0; cause && depth<4; cause=cause.cause, depth++)
      if (cause.name === 'AbortError' || ['UND_ERR_SOCKET','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ECONNRESET','ETIMEDOUT'].includes(cause.code))
        fail(503,MATCH_RESULT_UNKNOWN_MESSAGE);
    throw error;
  }
  const created=createdIndex===null ? 0 : written?.[createdIndex]?.results?.[0]?.created;
  if(!Number.isSafeInteger(created)||created<0) fail(503,`Match insertion count unavailable. ${MATCH_RESULT_UNKNOWN_MESSAGE}`);
  const direct=written?.[completion]?.results?.[0]?.direct_changes;
  if (!Number.isSafeInteger(direct) || (direct !== 0 && direct !== 1)) fail(503,MATCH_RESULT_UNKNOWN_MESSAGE);
  return {created,completed:direct===1};
}

export async function recomputeForApplicant(env, applicantId, actor, restoreNotice = false) {
  const {created,completed,reason}=await recomputeForApplicantWithStatus(env, applicantId, actor, restoreNotice);
  if(reason==='not_applicable')return {created:0};
  if(reason)fail(409,matchSnapshotMessage(reason));
  if(!completed)fail(409,MATCH_INCOMPLETE_MESSAGE);
  return {created};
}

// After a listing is saved, archived or restored: its pair with every active applicant, in one batch.
export async function recomputeForListing(env, listingId, actor) {
  const l = await env.DB.prepare(`SELECT ${LISTING} FROM listings WHERE id = ?`).bind(listingId).first();
  if (!l) return;
  // A listing that is not offered only concerns the applicants already matched with it.
  const [applicants, stored] = (await env.DB.batch([
    env.DB.prepare(`SELECT ${APPLICANT} WHERE ${activeSql("a")} AND a.search_category = 'residential'
      ${l.candidate ? "" : "AND a.id IN (SELECT applicant_id FROM matches WHERE listing_id = ?)"}`)
      .bind(...(l.candidate ? [] : [listingId])),
    env.DB.prepare("SELECT id, applicant_id, listing_id, status, score, checks, requirements_rank, area_preference_rank FROM matches WHERE listing_id = ?")
      .bind(listingId),
  ])).map(r => r.results);
  const mine = new Map(stored.map(m => [m.applicant_id, m]));
  const results = new Map(applicants.map(a => [a.id, result(a, l)]));
  // Only the evaluated pair is affected; there is no global Found quota.
  const ts = now(), stmts = [];
  for (const a of applicants) {
    const m = mine.get(a.id);
    stmts.push(...writesFor(env, a, [results.get(a.id)], byListing(m ? [m] : []), actor, ts).stmts);
  }
  if (stmts.length) await env.DB.batch(stmts);
}
