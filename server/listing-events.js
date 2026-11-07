import { fail, now, sha256 } from './http.js';

import { EDITABLE } from './listing.js';

const SOURCES = ['panel', 'queue', 'sales', 'media', 'recalculate'];
const ACTIONS = ['created', 'updated', 'published', 'unpublished', 'archived', 'restored', 'confirmed',
  'availability_changed', 'featured_changed', 'cover_changed', 'recalculated', 'deleted'];
const DERIVED = ['parish', 'feat_pets', 'feat_parking', 'feat_furnished', 'feat_outdoor', 'feat_type', 'feat_evidence'];

// The row exists only within this batch. The triggers see the real OLD/NEW; cleanup goes
// after any caller statements that consume changes() from the listing write.
function contextStatement(env, id, { actor, source, action, derivedFields = [], related = {} }, only = '', args = []) {
  if (!/^HE-[A-Z]\d{3,}$/.test(id) || typeof actor !== 'string' || !actor.trim()
    || !SOURCES.includes(source) || !ACTIONS.includes(action)
    || !Array.isArray(derivedFields) || derivedFields.some(k => !DERIVED.includes(k))
    || !related || typeof related !== 'object' || Array.isArray(related)
    || Object.entries(related).some(([k, v]) => !['offer_id', 'sale_id', 'import_id'].includes(k) || !Number.isSafeInteger(v) || v <= 0))
    fail(400, 'Invalid listing event context');
  return env.DB.prepare(`INSERT INTO listing_event_context(listing_id,actor,source,action,at,derived_fields,related,previous_revision)
    SELECT ?,?,?,?,?,?,?,(SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0)
      FROM events WHERE entity_type='listing' AND entity_id=?) ${only}`)
    .bind(id, actor, source, action, now(), JSON.stringify(derivedFields), JSON.stringify(related), id, ...args);
}

export function listingEventStatements(env, id, context, statements) {
  return [contextStatement(env, id, context), ...statements,
    env.DB.prepare('DELETE FROM listing_event_context WHERE listing_id=?').bind(id)];
}

export async function listingBatch(env, id, context, statements) {
  return (await env.DB.batch(listingEventStatements(env, id, context, statements))).slice(1, -1);
}

export const derivedListingFields = patch => DERIVED.filter(k => Object.hasOwn(patch, k));

// Keep editor versions distinct even when Date.now has not moved between two saves.
export const listingClock = "MAX(?, strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'))";

// DB-ready patches from trusted writers: HTTP validation/feature extraction stays with the route.
// An operation identity is internal only; the current panel does not send one.
export async function updateListingEvent(env, { id, actor, source, action, patch, expectedAt, operationId,
  derivedFields = [], related = {} }) {
  const cols = Object.keys(patch ?? {}).sort();
  const allowed = [...EDITABLE, ...DERIVED, 'confirmed_at', 'features_at'];
  if (!cols.length || cols.some(k => !allowed.includes(k)) || cols.some(k => patch[k] !== null
    && typeof patch[k] !== 'string' && !(typeof patch[k] === 'number' && Number.isFinite(patch[k])))
    || typeof expectedAt !== 'string' || (operationId !== undefined && !/^[A-Za-z0-9_.-]{1,128}$/.test(operationId)))
    fail(400, 'Invalid internal listing update');
  const context = { actor, source, action, derivedFields, related };
  const identity = operationId ?? null;
  const hash = await sha256(JSON.stringify([id, actor, source, action, expectedAt, cols.map(k => [k, patch[k]]),
    [...derivedFields].sort(), Object.entries(related).sort(([a], [b]) => a.localeCompare(b))]));
  const absent = 'NOT EXISTS(SELECT 1 FROM listing_event_operations WHERE actor=? AND operation_id=?)';
  const start = contextStatement(env, id, context, `WHERE ${absent}`, [actor, identity]);
  // The guard aborts a stale/missing update, but does not abort a replay (which wrote no context).
  const stmts = [start, env.DB.prepare(`UPDATE listings SET ${cols.map(k => `${k}=?`).join(',')},
    updated_at=${listingClock}, updated_by=? WHERE id=? AND updated_at=?
    AND EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=?)`)
    .bind(...cols.map(k => patch[k]), now(), actor, id, expectedAt, id),
  env.DB.prepare(`INSERT INTO listing_event_context(listing_id) SELECT NULL WHERE changes()=0
    AND EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=?)`).bind(id),
  env.DB.prepare(`SELECT id FROM events WHERE entity_type='listing' AND entity_id=?
    AND CAST(json_extract(data,'$.revision') AS INTEGER) >
      (SELECT previous_revision FROM listing_event_context WHERE listing_id=?) ORDER BY id DESC LIMIT 1`).bind(id, id)];
  if (identity !== null) stmts.push(env.DB.prepare(`INSERT INTO listing_event_operations(actor,operation_id,request_hash,event_id)
    SELECT ?,?,?,(SELECT id FROM events WHERE entity_type='listing' AND entity_id=c.listing_id
      AND CAST(json_extract(data,'$.revision') AS INTEGER)>c.previous_revision ORDER BY id DESC LIMIT 1)
    FROM listing_event_context c WHERE c.listing_id=?`).bind(actor, identity, hash, id));
  stmts.push(env.DB.prepare('DELETE FROM listing_event_context WHERE listing_id=?').bind(id));
  let results;
  try { results = await env.DB.batch(stmts); }
  catch (e) {
    if (!/NOT NULL constraint failed: listing_event_context/.test(String(e?.message))) throw e;
    const row = await env.DB.prepare('SELECT updated_at FROM listings WHERE id=?').bind(id).first();
    if (!row) fail(404, 'Listing not found');
    fail(409, 'Someone else saved changes to this listing. Reload to see them (your changes were not saved).');
  }
  const receipt = identity === null ? null : await env.DB.prepare(
    'SELECT request_hash,event_id FROM listing_event_operations WHERE actor=? AND operation_id=?').bind(actor, identity).first();
  if (receipt && receipt.request_hash !== hash) fail(409, 'Operation identity already used for a different listing change');
  const event_id = receipt?.event_id ?? results[3].results[0]?.id ?? null;
  return { event_id, replayed: results[0].meta.changes === 0, changed: event_id !== null };
}
