import { HttpError } from './http.js';
import { EMAIL } from './viewings.js';
import { manualScopeAllows, prepareManualObservationPage } from './market-manual-contract.js';
import { commitObservationPage } from './market-inventory-store.js';

// Internal bridge only: caller-supplied actor text is not authentication. No route exposes this function.
const bad=()=>{throw new HttpError(400,'Invalid manual observation page');};
const conflict=()=>{throw new HttpError(409,'Source access or inventory state changed');};
const uuid=value=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const id=value=>typeof value==='string' && value.length>0 && value.length<=160 && !/[\u0000-\u001f\u007f]/.test(value);
const iso=value=>typeof value==='string' && value.length===24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
const primary=db=>typeof db.withSession==='function'?db.withSession('first-primary'):db;
const has=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);

function fields(value,keys) {
  if (!value || typeof value!=='object' || Array.isArray(value) ||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length) bad();
  const descriptors=Object.getOwnPropertyDescriptors(value), out={};
  if (Object.keys(descriptors).length!==keys.length) bad();
  for(const key of keys) {
    const descriptor=descriptors[key];
    if (!descriptor || !descriptor.enumerable || !has(descriptor,'value') || descriptor.value===undefined) bad();
    out[key]=descriptor.value;
  }
  return out;
}

export async function ingestManualObservationPage(env,input,actor,clock=()=>new Date()) {
  const request=fields(input,['lease','page']);
  const lease=fields(request.lease,['run_id','source_ref','channel_id','token','generation','policy_version','run_version','cursor']);
  if (!uuid(lease.run_id) || !uuid(lease.token) || !id(lease.source_ref) || !id(lease.channel_id) ||
      !Number.isSafeInteger(lease.generation) || lease.generation<1 || !Number.isSafeInteger(lease.policy_version) || lease.policy_version<1 ||
      !Number.isSafeInteger(lease.run_version) || lease.run_version<1 || (lease.cursor!==null && !id(lease.cursor)) ||
      typeof actor!=='string' || actor.length>254 || actor!==actor.toLowerCase() || !EMAIL.test(actor)) bad();
  Object.freeze(lease);
  const page=prepareManualObservationPage(request.page);
  if (page.cursor!==lease.cursor) conflict();
  const snapshot=await primary(env.DB).prepare(`SELECT s.source_kind,s.source_class,s.access_status,s.method,s.policy_version,
      s.allowed_hosts,s.allowed_paths,s.evidence_ref,s.retention_ref,s.reviewed_at,s.review_due_at,
      r.kind,r.manifest_revision,r.manifest_sha256,m.status AS manifest_status,m.sha256 AS manifest_sha256_current,
      a.added_at AS actor_added_at,strftime('%Y-%m-%dT%H:%M:%fZ','now') AS database_now
    FROM market_sources s JOIN market_runs r ON r.id=? AND r.manifest_revision=s.directory_revision
    JOIN market_directory_manifests m ON m.revision=r.manifest_revision
    JOIN admins a ON a.email=? WHERE s.source_ref=? AND s.channel_id=?`)
    .bind(lease.run_id,actor,lease.source_ref,lease.channel_id).first();
  if (!snapshot || snapshot.source_kind!=='external' || snapshot.source_class!=='general' ||
      !['allowed','manual_only'].includes(snapshot.access_status) || snapshot.method!=='manual' ||
      snapshot.policy_version!==lease.policy_version || !['initial','daily'].includes(snapshot.kind) ||
      snapshot.manifest_status!=='accepted' || snapshot.manifest_sha256!==snapshot.manifest_sha256_current ||
      typeof snapshot.evidence_ref!=='string' || !snapshot.evidence_ref || typeof snapshot.retention_ref!=='string' || !snapshot.retention_ref ||
      !iso(snapshot.actor_added_at) || !iso(snapshot.reviewed_at) || !iso(snapshot.review_due_at) || !iso(snapshot.database_now) ||
      snapshot.reviewed_at>snapshot.database_now || snapshot.review_due_at<=snapshot.database_now || page.observed_at>snapshot.database_now ||
      !manualScopeAllows(snapshot.allowed_hosts,snapshot.allowed_paths,page.records.map(record=>record.raw.listing_url))) conflict();
  const manual_guard=Object.freeze({actor_added_at:snapshot.actor_added_at,allowed_hosts:snapshot.allowed_hosts,allowed_paths:snapshot.allowed_paths});
  return commitObservationPage(env,{lease,page,manual_guard},actor,clock);
}
