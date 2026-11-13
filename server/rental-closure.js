// PUB-16: this proposed schema is never read unless explicitly enabled after deployment review.
export const rentalClosureEnabled = env => env.PUB16_TIMED_CLOSURE_READY === '1';
const DB_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const ABORT = `INSERT INTO listing_event_context(listing_id) SELECT NULL
  WHERE EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=?)`;

export const unresolvedRentalClosure = (env,id) => env.DB.prepare(`SELECT * FROM rental_closure_windows
  WHERE listing_id=? AND state IS NOT 'corrected'
  ORDER BY CASE WHEN state='open' THEN 1 ELSE 0 END,opened_at DESC LIMIT 1`).bind(id).first();

// A missing, invalid or expired deadline is never a reason to expose a pending closure.
// A withdrawn window stays closed even if another writer republishes the listing: reopening
// after withdrawal needs an explicitly designed and recorded transition that does not exist yet.
export const rentalClosureVisibleSql = alias => `NOT EXISTS (SELECT 1 FROM rental_closure_windows w
  WHERE w.listing_id=${alias}.id AND COALESCE(w.state,'')<>'corrected' AND
    (w.state IS NOT 'open' OR w.opened_at IS NULL OR w.due_at IS NULL
      OR w.opened_at IS NOT strftime('%Y-%m-%dT%H:%M:%fZ',w.opened_at,'+0 seconds')
      OR w.due_at IS NOT strftime('%Y-%m-%dT%H:%M:%fZ',w.opened_at,'+24 hours') OR w.due_at<=${DB_NOW}))`;

export const noUnresolvedRentalClosureSql = alias => `NOT EXISTS (SELECT 1 FROM rental_closure_windows w
  WHERE w.listing_id=${alias}.id AND COALESCE(w.state,'')<>'corrected')`;

// Called inside updateListingEvent's transaction, after the operation context has been created. The snapshot
// includes fields whose writers may deliberately leave updated_at untouched (notably confirmed_at).
export function startClosureGuard(env,id,listing) {
  return env.DB.prepare(`${ABORT} AND (EXISTS(SELECT 1 FROM rental_closure_windows WHERE listing_id=? AND state='open')
    OR NOT EXISTS(SELECT 1 FROM listings WHERE id=? AND operation='rent' AND archived_at IS NULL
      AND updated_at=? AND availability IS ? AND published IS ? AND viewings_enabled IS ? AND confirmed_at IS ?
      AND ?=(SELECT COALESCE(MAX(CAST(json_extract(e.data,'$.revision') AS INTEGER)),0) FROM events e
        WHERE e.entity_type='listing' AND e.entity_id=listings.id)))`)
    .bind(id,id,id,listing.updated_at,listing.availability,listing.published,listing.viewings_enabled,listing.confirmed_at,listing.pub16_event_revision);
}

export function startClosureStatements(env,{id,closureId,listing,appliedConfirmedAt}) {
  const insert=env.DB.prepare(`INSERT INTO rental_closure_windows(closure_id,listing_id,close_event_id,state,opened_at,due_at,
    previous_availability,previous_published,previous_viewings_enabled,previous_confirmed_at,applied_confirmed_at,applied_updated_at)
    SELECT ?,?,(SELECT e.id FROM events e WHERE e.entity_type='listing' AND e.entity_id=c.listing_id
      AND CAST(json_extract(e.data,'$.revision') AS INTEGER)>c.previous_revision ORDER BY e.id DESC LIMIT 1),
      'open',${DB_NOW},strftime('%Y-%m-%dT%H:%M:%fZ','now','+24 hours'),?,?,?,?,?,l.updated_at
    FROM listing_event_context c JOIN listings l ON l.id=c.listing_id WHERE c.listing_id=?
      AND NOT EXISTS(SELECT 1 FROM rental_closure_windows w WHERE w.listing_id=c.listing_id AND w.state='open')`)
    .bind(closureId,id,listing.availability,listing.published,listing.viewings_enabled,listing.confirmed_at,appliedConfirmedAt,id);
  const guard=env.DB.prepare(`${ABORT} AND changes()=0`).bind(id);
  return [insert,guard];
}

export function correctionGuard(env,id,closure) {
  return env.DB.prepare(`${ABORT} AND NOT EXISTS(SELECT 1 FROM rental_closure_windows w JOIN listings l ON l.id=w.listing_id
    WHERE w.closure_id=? AND w.listing_id=? AND w.state='open' AND w.due_at>${DB_NOW}
      AND l.operation='rent' AND l.archived_at IS NULL AND l.availability='let_agreed'
      AND l.updated_at=w.applied_updated_at AND l.published IS w.previous_published
      AND l.viewings_enabled IS w.previous_viewings_enabled AND l.confirmed_at IS w.applied_confirmed_at
      AND (SELECT CAST(json_extract(e.data,'$.revision') AS INTEGER) FROM events e
        WHERE e.id=w.close_event_id AND e.entity_type='listing' AND e.entity_id=l.id)=
        (SELECT COALESCE(MAX(CAST(json_extract(e.data,'$.revision') AS INTEGER)),0) FROM events e
          WHERE e.entity_type='listing' AND e.entity_id=l.id))`)
    .bind(id,closure.closure_id,id);
}

export function correctionStatements(env,id,closure) {
  const update=env.DB.prepare(`UPDATE rental_closure_windows SET state='corrected',corrected_at=${DB_NOW}
    WHERE closure_id=? AND listing_id=? AND state='open' AND due_at>${DB_NOW}
      AND EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=?)`)
    .bind(closure.closure_id,id,id);
  const guard=env.DB.prepare(`${ABORT} AND changes()=0`).bind(id);
  return [update,guard];
}
