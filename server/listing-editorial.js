import {fail,now,sha256} from './http.js';
import {listingBatch,listingClock,updateListingEvent} from './listing-events.js';

export const editorialState = l => l.archived_at ? 'archived' : l.published ? 'published'
  : l.review_requested_at ? 'ready_for_review' : 'draft';
export const isRentalMarketing = value => ['let_agreed','let'].includes(value);

export function checkMarketingEdit(stored,patch) {
  if ((!stored && isRentalMarketing(patch.availability)) || (stored && patch.availability !== undefined
    && patch.availability !== stored.availability && (isRentalMarketing(patch.availability)||isRentalMarketing(stored.availability))))
    return {availability:'Use the rental marketing action with recorded evidence.'};
  if (isRentalMarketing(patch.availability ?? stored?.availability) && (patch.operation ?? stored?.operation)!=='rent')
    return {operation:'Return this rental to market before changing its operation.'};
  return {};
}

export async function transitionEditorialListing(env,{id,command,actor}) {
  if (!command || !['submit_review','return_draft'].includes(command.action) || typeof command.updated_at!=='string')
    fail(400,'Choose a review action and reload the listing version');
  const listing=await env.DB.prepare('SELECT * FROM listings WHERE id=?').bind(id).first();
  if(!listing)fail(404,'Listing not found');
  const expected=command.action==='submit_review'?'draft':'ready_for_review';
  if(editorialState(listing)!==expected)fail(409,'The listing state changed. Reload before trying again.');
  const submit=command.action==='submit_review',ts=now();
  const [r,receipt]=await listingBatch(env,id,{actor,source:'panel',action:submit?'review_requested':'review_returned'},[
    env.DB.prepare(`UPDATE listings SET review_requested_at=?,review_requested_by=?,updated_at=${listingClock},updated_by=?
      WHERE id=? AND updated_at=? AND published=0 AND archived_at IS NULL
      AND review_requested_at IS ${submit?'NULL':'NOT NULL'}`)
      .bind(submit?ts:null,submit?actor:null,ts,actor,id,command.updated_at),
    env.DB.prepare(`SELECT e.id FROM events e JOIN listing_event_context c ON c.listing_id=e.entity_id
      WHERE e.entity_type='listing' AND e.entity_id=? AND CAST(json_extract(e.data,'$.revision') AS INTEGER)>c.previous_revision
      ORDER BY e.id DESC LIMIT 1`).bind(id)
  ]);
  if(!r.meta.changes)fail(409,'Someone else saved changes. Reload before trying again.');
  return {event_id:receipt.results[0]?.id??null};
}

function validateCommand(c) {
  if(!c || typeof c.request_id!=='string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(c.request_id) || typeof c.updated_at!=='string'
    || !['let_agreed','let','return_to_market'].includes(c.action)
    || !['agreement','completed','fell_through','correction'].includes(c.reason_code)
    || typeof c.occurred_at!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(c.occurred_at)
    || !Number.isFinite(Date.parse(c.occurred_at)) || new Date(c.occurred_at).toISOString()!==c.occurred_at
    || c.occurred_at>now() || !Array.isArray(c.evidence_refs) || !c.evidence_refs.length || c.evidence_refs.length>10
    || c.evidence_refs.some(v=>typeof v!=='string'||! /^(media|source):[A-Za-z0-9_.-]{1,128}$/.test(v))
    || new Set(c.evidence_refs).size!==c.evidence_refs.length) fail(400,'Choose an action, a valid past date and recorded evidence');
  if((c.action==='let_agreed'&&c.reason_code!=='agreement')||(c.action==='let'&&c.reason_code!=='completed')
    ||(c.action==='return_to_market'&&!['fell_through','correction'].includes(c.reason_code)))fail(400,'Choose the reason for this action');
  return {request_id:c.request_id,updated_at:c.updated_at,action:c.action,reason_code:c.reason_code,
    occurred_at:c.occurred_at,evidence_refs:[...c.evidence_refs].sort()};
}

export async function recordRentalMarketingState(env,{id,command,actor}) {
  const c=validateCommand(command), operationId=`rental.${id}.${c.request_id}`;
  const requestHash=await sha256(JSON.stringify([id,actor,c]));
  const receipt=await env.DB.prepare('SELECT request_hash,event_id FROM listing_event_operations WHERE actor=? AND operation_id=?')
    .bind(actor,operationId).first();
  if(receipt){if(receipt.request_hash!==requestHash)fail(409,'This request was already used for a different change');
    return {event_id:receipt.event_id,replayed:true};}
  const listing=await env.DB.prepare('SELECT * FROM listings WHERE id=?').bind(id).first();
  if(!listing)fail(404,'Listing not found');
  if(listing.operation!=='rent')fail(400,'Rental marketing is only available for rentals');
  const allowed=c.action==='return_to_market'?['let_agreed','let']:c.action==='let'?['to_let','lease','not_stated','let_agreed']:['to_let','lease','not_stated'];
  if(listing.archived_at||!allowed.includes(listing.availability))fail(409,'The rental state changed. Reload before trying again.');
  const additional=[];
  for(const ref of c.evidence_refs){
    const [kind,key]=ref.split(':');
    const query=kind==='media'?"SELECT id FROM media WHERE id=? AND listing_id=? AND kind='document' AND r2_key IS NOT NULL"
      :'SELECT source_id FROM research_sources WHERE source_id=? AND property_id=?';
    if(!await env.DB.prepare(query).bind(key,id).first())fail(404,'Evidence not available for this listing');
    const snapshot=kind==='media'?`(SELECT json_object('kind','media','id',id,'listing_id',listing_id,'label',label,
      'r2_key',r2_key,'content_type',content_type,'bytes',bytes) FROM media
      WHERE id=? AND listing_id=? AND kind='document' AND r2_key IS NOT NULL)`
      :`(SELECT json_object('kind','source','id',source_id,'listing_id',property_id,'title',title,'url',url,
        'accessed_on',accessed_on,'source_date',source_date,'observed_status',observed_status)
        FROM research_sources WHERE source_id=? AND property_id=?)`;
    // A missing reference aborts this execution; a replay has no context and performs no insert.
    additional.push(env.DB.prepare(`INSERT INTO listing_marketing_evidence(listing_id,event_id,evidence_ref,media_id,source_id,action,reason_code,occurred_at,evidence_snapshot)
      SELECT ?,(SELECT e.id FROM events e WHERE e.entity_type='listing' AND e.entity_id=c.listing_id
        AND CAST(json_extract(e.data,'$.revision') AS INTEGER)>c.previous_revision ORDER BY e.id DESC LIMIT 1),?,?,?,?,?,?,${snapshot}
      FROM listing_event_context c WHERE c.listing_id=?`)
      .bind(id,ref,kind==='media'?key:null,kind==='source'?key:null,c.action,c.reason_code,c.occurred_at,key,id,id));
  }
  // Repeat the loaded state and operation inside the transaction, before the listing write.
  additional.unshift(env.DB.prepare(`INSERT INTO listing_event_context(listing_id) SELECT NULL
    WHERE EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=?)
    AND NOT EXISTS(SELECT 1 FROM listings WHERE id=? AND operation='rent' AND archived_at IS NULL)` ).bind(id,id));
  try{return await updateListingEvent(env,{id,actor,source:'panel',action:'availability_changed',
      patch:{availability:c.action==='return_to_market'?'to_let':c.action,confirmed_at:c.occurred_at},
      expectedAt:c.updated_at,operationId,requestHash,additionalStatements:additional});}
  catch(error){
    if(/NOT NULL constraint failed: listing_marketing_evidence\.(event_id|evidence_snapshot)/.test(String(error?.message)))
      fail(409,'Recorded evidence changed. Reload the listing before trying again.');
    throw error;
  }
}
