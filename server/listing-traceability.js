import { fail, now, sha256 } from './http.js';
import { listingBatch, listingClock } from './listing-events.js';
import { publicAddressReviewStatement, readListingDetails } from './listing-details.js';

const REASONS = ['owner_request','let_elsewhere','sold_elsewhere','data_correction','other'];
const ID = /^HE-[A-Z]\d{3,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const primary = db => typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
const validActor = actor => typeof actor === 'string' && actor.length > 0 && actor.length <= 254;
async function requireStaff(db, actor) {
  if (!validActor(actor) || !await db.prepare('SELECT 1 FROM admins WHERE email=?').bind(actor).first())
    fail(401, 'Please sign in to continue');
}

function validated({ reason_code, note }, allowUnknown = false) {
  if (!(REASONS.includes(reason_code) || (allowUnknown && reason_code === null)) ||
      !(note === undefined || note === null || typeof note === 'string')) fail(400, 'Choose a valid withdrawal reason');
  const clean = typeof note === 'string' ? note.trim() : null;
  if ((clean?.length ?? 0) > 1000 || (reason_code === 'other' && !clean)) fail(400, 'Add a note of up to 1,000 characters for Other');
  return { reason_code, note: clean || null };
}

async function receipt(env, actor, operation, hash, action, listingId, system = false) {
  const db = primary(env.DB);
  const row = await db.prepare(`SELECT r.request_hash,r.action,r.withdrawal_id,r.revision,r.event_id,w.listing_id,
    CASE WHEN r.revision=1 THEN w.reason_code ELSE v.reason_code END AS reason_code,
    CASE WHEN r.revision=1 THEN w.private_note ELSE v.private_note END AS private_note
    FROM listing_withdrawal_receipts r JOIN listing_withdrawals w ON w.id=r.withdrawal_id
    JOIN listings alive ON alive.id=w.listing_id
    LEFT JOIN listing_withdrawal_revisions v ON v.withdrawal_id=w.id AND v.revision=r.revision
    WHERE r.actor=? AND r.operation_id=? AND (?=1 OR EXISTS(SELECT 1 FROM admins WHERE email=?))`)
    .bind(actor, operation, system ? 1 : 0, actor).first();
  if (!row) { if (!system) await requireStaff(db, actor); return null; }
  if (row.request_hash !== hash || row.action !== action || row.listing_id !== listingId) fail(409, 'Operation ID was used for a different change');
  return { event_id: row.event_id, withdrawal: { id: row.withdrawal_id, revision: row.revision,
    reason_code: row.reason_code, note: row.private_note }, replayed: true };
}

export async function recordListingWithdrawal(env, input, actor, options = {}) {
  if (!input || !ID.test(input.listing_id ?? '') || typeof input.expected_at !== 'string' || input.expected_at.length > 128 ||
      !UUID.test(input.operation_id ?? '') || !validActor(actor)) fail(400, 'Invalid withdrawal request');
  const allowUnknown = options.allowSystemUnknown === true && actor === 'system' && options.source === 'recalculate';
  const reason = validated(input, allowUnknown);
  const hash = await sha256(JSON.stringify(['withdraw', input.listing_id, input.expected_at, reason.reason_code, reason.note]));
  const prior = await receipt(env, actor, input.operation_id, hash, 'withdraw', input.listing_id, allowUnknown);
  if (prior) return prior;
  const listing = await primary(env.DB).prepare('SELECT published,archived_at,updated_at FROM listings WHERE id=?').bind(input.listing_id).first();
  if (!listing) fail(404, 'Listing not found');
  if (listing.updated_at !== input.expected_at || listing.published !== 1 || listing.archived_at) fail(409, 'The listing state changed. Reload before trying again.');
  const details = await readListingDetails(env, input.listing_id);
  const clearAddress = !!details.public_address_snapshot;
  const ts = now(), withdrawalId = crypto.randomUUID(), id = input.listing_id;
  const statements = [env.DB.prepare(`UPDATE listings SET published=0,review_requested_at=NULL,review_requested_by=NULL,
    updated_at=${listingClock},updated_by=? WHERE id=? AND updated_at=? AND published=1 AND archived_at IS NULL
    AND (?=1 OR EXISTS(SELECT 1 FROM admins WHERE email=?))`)
    .bind(ts, actor, id, input.expected_at, allowUnknown ? 1 : 0, actor)];
  if (clearAddress) statements.push(publicAddressReviewStatement(env, id));
  statements.push(env.DB.prepare('INSERT INTO listing_event_context(listing_id) SELECT NULL WHERE changes()=0'));
  statements.push(env.DB.prepare(`INSERT INTO listing_withdrawals(id,listing_id,occurred_at,source_revision,event_id,reason_code,private_note,actor)
    SELECT ?,?,?,CAST(json_extract(e.data,'$.revision') AS INTEGER),e.id,?,?,?
    FROM events e JOIN listing_event_context c ON c.listing_id=e.entity_id
    WHERE c.listing_id=? AND e.entity_type='listing' AND e.type='listing.unpublished'
      AND CAST(json_extract(e.data,'$.revision') AS INTEGER)>c.previous_revision ORDER BY e.id DESC LIMIT 1`)
    .bind(withdrawalId, id, ts, reason.reason_code, reason.note, actor, id));
  statements.push(env.DB.prepare('INSERT INTO listing_event_context(listing_id) SELECT NULL WHERE changes()=0'));
  statements.push(env.DB.prepare(`UPDATE events SET data=json_set(data,'$.withdrawal_id',?,'$.reason_code',?)
    WHERE id=(SELECT event_id FROM listing_withdrawals WHERE id=?)`).bind(withdrawalId, reason.reason_code, withdrawalId));
  statements.push(env.DB.prepare(`INSERT INTO listing_withdrawal_receipts(actor,operation_id,request_hash,action,withdrawal_id,revision,event_id)
    SELECT ?,?,?,'withdraw',id,1,event_id FROM listing_withdrawals WHERE id=?`).bind(actor, input.operation_id, hash, withdrawalId));
  try {
    await listingBatch(env, id, { actor, source: options.source ?? 'panel', action: 'unpublished',
      extraFields: clearAddress ? ['public_address_publication'] : [] }, statements);
  } catch (error) {
    const found = await receipt(env, actor, input.operation_id, hash, 'withdraw', id, allowUnknown);
    if (found) return found;
    if (/NOT NULL constraint failed: listing_event_context/i.test(String(error?.message))) fail(409, 'The listing state changed. Reload before trying again.');
    throw error;
  }
  const result = await receipt(env, actor, input.operation_id, hash, 'withdraw', id, allowUnknown);
  if (!result) throw new Error('Withdrawal receipt unavailable');
  return { ...result, replayed: false };
}

export async function correctListingWithdrawal(env, input, actor) {
  if (!input || !ID.test(input.listing_id ?? '') || !UUID.test(input.withdrawal_id ?? '') || !UUID.test(input.operation_id ?? '') ||
      !Number.isSafeInteger(input.expected_revision) || input.expected_revision < 1 || !validActor(actor)) fail(400, 'Invalid correction request');
  const reason = validated(input);
  const hash = await sha256(JSON.stringify(['correct', input.listing_id, input.withdrawal_id, input.expected_revision, reason.reason_code, reason.note]));
  const prior = await receipt(env, actor, input.operation_id, hash, 'correct', input.listing_id);
  if (prior) return prior;
  const { DB } = env, at = now(), revisionId = crypto.randomUUID(), guard = crypto.randomUUID();
  if (!await primary(DB).prepare('SELECT 1 AS present FROM listings WHERE id=?').bind(input.listing_id).first()) fail(404, 'Listing not found');
  const eligible = `SELECT 1 FROM listing_withdrawals w JOIN listings l ON l.id=w.listing_id
    WHERE w.id=? AND w.listing_id=? AND w.current_revision=? AND l.published=0
      AND EXISTS(SELECT 1 FROM admins WHERE email=?)`;
  const args = [input.withdrawal_id, input.listing_id, input.expected_revision, actor];
  try {
    await DB.batch([
      DB.prepare(`INSERT INTO listing_withdrawal_guard(id,allowed) SELECT ?,CASE WHEN EXISTS (${eligible}) THEN 1 ELSE 0 END`).bind(guard, ...args),
      DB.prepare(`INSERT INTO listing_withdrawal_revisions(id,withdrawal_id,revision,previous_revision,reason_code,private_note,actor,at)
        VALUES (?,?,?,?,?,?,?,?)`).bind(revisionId, input.withdrawal_id, input.expected_revision+1, input.expected_revision, reason.reason_code, reason.note, actor, at),
      DB.prepare('UPDATE listing_withdrawals SET current_revision=current_revision+1 WHERE id=? AND current_revision=?')
        .bind(input.withdrawal_id, input.expected_revision),
      DB.prepare(`INSERT INTO listing_withdrawal_receipts(actor,operation_id,request_hash,action,withdrawal_id,revision,event_id)
        SELECT ?,?,?,'correct',id,current_revision,event_id FROM listing_withdrawals WHERE id=?`).bind(actor, input.operation_id, hash, input.withdrawal_id),
      DB.prepare('DELETE FROM listing_withdrawal_guard WHERE id=?').bind(guard),
    ]);
  } catch (error) {
    const found = await receipt(env, actor, input.operation_id, hash, 'correct', input.listing_id);
    if (found) return found;
    if (!await primary(DB).prepare(eligible).bind(...args).first()) fail(409, 'Withdrawal changed. Reload before trying again.');
    throw error;
  }
  const result = await receipt(env, actor, input.operation_id, hash, 'correct', input.listing_id);
  if (!result) throw new Error('Correction receipt unavailable');
  return { ...result, replayed: false };
}

const encodeCursor = value => btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function decodeCursor(value, listingId) {
  if (value == null) return null;
  try {
    if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error();
    const c = JSON.parse(atob(value.replace(/-/g,'+').replace(/_/g,'/')));
    if (c.v !== 1 || c.listing_id !== listingId || !UUID.test(c.id) ||
        typeof c.at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(c.at)) throw Error();
    return c;
  } catch { fail(400, 'Invalid withdrawal cursor'); }
}

export async function readListingTraceability(env, { listing_id, cursor = null }, actor) {
  if (!ID.test(listing_id ?? '')) fail(404, 'Listing not found');
  const db = primary(env.DB);
  await requireStaff(db, actor);
  const c = decodeCursor(cursor, listing_id);
  const listing = await db.prepare(`SELECT l.published,l.published_at,l.archived_at,l.review_requested_at,
    EXISTS (SELECT 1 FROM media m WHERE m.listing_id=l.id AND m.kind='photo' AND m.public=1
      AND m.origin<>'external' AND m.r2_key IS NOT NULL AND m.r2_key<>'') AS has_photo
    FROM listings l WHERE l.id=?`).bind(listing_id).first();
  if (!listing) fail(404, 'Listing not found');
  const { results } = await db.prepare(`WITH versions AS (
    SELECT w.id,w.id AS withdrawal_id,w.listing_id,w.occurred_at AS at,1 AS revision,w.current_revision,w.reason_code,w.private_note,w.actor FROM listing_withdrawals w
    UNION ALL SELECT r.id,w.id,w.listing_id,r.at,r.revision,w.current_revision,r.reason_code,r.private_note,r.actor
      FROM listing_withdrawal_revisions r JOIN listing_withdrawals w ON w.id=r.withdrawal_id)
    SELECT id,withdrawal_id,at,revision,current_revision,reason_code,private_note,actor FROM versions
    WHERE listing_id=? AND (? IS NULL OR at<? OR (at=? AND id<?))
      AND EXISTS(SELECT 1 FROM admins WHERE email=?) ORDER BY at DESC,id DESC LIMIT 51`)
    .bind(listing_id, c?.at ?? null, c?.at ?? null, c?.at ?? null, c?.id ?? null, actor).all();
  const items = results.slice(0,50), last = items.at(-1);
  const metrics = await db.prepare("SELECT SUM(n) AS value,MIN(day) AS since FROM daily_stats WHERE listing_id=? AND metric='view'").bind(listing_id).first();
  await requireStaff(db, actor);
  return { current_publication: { published: listing.published === 1, published_at: listing.published_at,
    visible_with_photo: listing.published === 1 && !listing.archived_at && !!listing.has_photo,
    editorial_state: listing.archived_at ? 'archived' : listing.published === 1 ? 'published' : listing.review_requested_at ? 'ready_for_review' : 'draft' },
    withdrawal_history: items, next_cursor: results.length > 50 ? encodeCursor({ v:1,listing_id,at:last.at,id:last.id }) : null,
    metrics: { views: { value: metrics?.value ?? null, since: metrics?.since ?? null, unit:'recorded_actions', source:'daily_stats' },
      saved: { state:'not_tracked',value:null }, calls: { state:'not_tracked',value:null } } };
}
