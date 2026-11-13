import { sha256, fail } from './http.js';
import { buildDemandSnapshot } from './demand-snapshot.js';
import { publicCells, isPublicDemandPayload, readAcceptedReleaseAuthorization } from './demand-release-policy.js';

const primary=db=>typeof db.withSession==='function' ? db.withSession('first-primary') : db;
const actorOk=actor=>typeof actor==='string' && actor.length>0 && actor.length<=320;
const uuid=id=>typeof id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const policy=env=>typeof env.PUBLIC_DEMAND_POLICY_VERSION==='string' && env.PUBLIC_DEMAND_POLICY_VERSION.length<=100 ? env.PUBLIC_DEMAND_POLICY_VERSION : '';
const assertInput=(v,m='Invalid demand request')=>{ if(!v) fail(400,m); };
const ensureReady=env=>{ if(env.DEMAND_INTERNAL_READY!=='1') fail(404,'Not found'); };
const guards=(db,condition,...args)=>db.prepare(`INSERT INTO public_demand_assert(ok) SELECT CASE WHEN (${condition}) THEN 1 ELSE 0 END`).bind(...args);
const clear=db=>db.prepare('DELETE FROM public_demand_assert');
const qtime=db=>db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') AS now");
const validSnapshot=async s=>{
  if(!s || await sha256(s.public_payload)!==s.public_sha256) return false;
  try { const p=JSON.parse(s.public_payload); return isPublicDemandPayload(p) && p.id===s.id && p.operation===s.operation && p.as_of===s.as_of && p.valid_until===s.valid_until && p.definition_version===s.definition_version; }
  catch { return false; }
};

export async function getActiveDemandDraft(env,operation,actor) {
  ensureReady(env); assertInput(['rent','buy'].includes(operation)&&actorOk(actor));
  const db=primary(env.DB);
  const row=await db.prepare("SELECT id,version,operation,status FROM public_demand_snapshots WHERE created_by=? AND operation=? AND status IN ('draft','approved')").bind(actor,operation).first();
  return {draft:row ?? null};
}
export async function generateDemandDraft(env,{operation,operation_id},actor) {
  ensureReady(env); assertInput(actorOk(actor)&&['rent','buy'].includes(operation)&&uuid(operation_id));
  const db=primary(env.DB), previous=await db.prepare('SELECT id,version,operation,created_by FROM public_demand_snapshots WHERE id=?').bind(operation_id).first();
  if(previous) { if(previous.created_by!==actor || previous.operation!==operation) fail(409,'Operation belongs to another draft'); return {id:previous.id,version:previous.version}; }
  const draft=await buildDemandSnapshot(env,{operation});
  const id=operation_id, valid_until=new Date(Date.parse(draft.as_of)+31*86400000).toISOString();
  const payload={schema_version:1,id,as_of:draft.as_of,valid_until,definition_version:draft.definition_version,operation,
    cells:publicCells(draft.cells),definition:'Registered property seekers: distinct search contacts with no eligible match, by parish and minimum bedrooms.'};
  const contributions=draft.cells.flatMap(c=>c.contributions.map(item=>({...item,parish:c.parish,bedroom_band:c.bedroom_band})));
  if(draft.cells.some(c=>new Set(c.contributions.map(x=>x.contact_id)).size!==c.count)) fail(503,'Demand contributions unavailable');
  if(contributions.length>5000) fail(503,'Demand draft exceeds review capacity');
  const privateDraft={...draft,cells:draft.cells.map(({contributions,...cell})=>cell)};
  const public_payload=JSON.stringify(payload), hash=await sha256(public_payload);
  const values=[];
  for(let i=0;i<contributions.length;i+=20) {
    const chunk=contributions.slice(i,i+20);
    values.push(db.prepare(`INSERT INTO public_demand_contributions(snapshot_id,contact_id,search_id,parish,bedroom_band) VALUES ${chunk.map(()=>'(?,?,?,?,?)').join(',')}`)
      .bind(...chunk.flatMap(c=>[id,c.contact_id,c.search_id,c.parish,c.bedroom_band])));
  }
  try { await db.batch([
    guards(db,'EXISTS(SELECT 1 FROM admins WHERE email=?)',actor),
    db.prepare(`INSERT INTO public_demand_snapshots(id,created_by,status,schema_version,as_of,valid_until,definition_version,operation,private_payload,public_payload,public_sha256)
      VALUES (?,?,'draft',1,?,?,?,?,?,?,?)`).bind(id,actor,draft.as_of,valid_until,draft.definition_version,operation,JSON.stringify(privateDraft),public_payload,hash),
    ...values,clear(db),
  ]); } catch {
    const receipt=await db.prepare('SELECT id,version,operation,created_by FROM public_demand_snapshots WHERE id=?').bind(id).first();
    if(receipt && receipt.created_by===actor && receipt.operation===operation) return {id:receipt.id,version:receipt.version};
    fail(409,'An active draft or the underlying data changed');
  }
  return {id,version:1};
}

export async function readDemandDraft(env,id,after=0,actor) {
  ensureReady(env); assertInput(uuid(id)&&[0,50].includes(after)&&actorOk(actor));
  const db=primary(env.DB), row=await db.prepare(`SELECT id,status,version,as_of,valid_until,operation,definition_version,private_payload,public_payload,public_sha256 FROM public_demand_snapshots WHERE id=?`).bind(id).first();
  if(!row) fail(404,'Draft not found');
  const draft=row.private_payload && Date.parse(row.as_of)>Date.now()-7*86400000 ? JSON.parse(row.private_payload) : null;
  const reviews=await db.prepare('SELECT page_start FROM public_demand_page_reviews WHERE snapshot_id=? AND version=? AND actor=? ORDER BY page_start').bind(id,row.version,actor).all();
  return {id:row.id,status:row.status,version:row.version,as_of:row.as_of,valid_until:row.valid_until,operation:row.operation,
    definition_version:row.definition_version,public_sha256:row.public_sha256,private_available:!!draft,
    cells:draft ? draft.cells.slice(after,after+50).map(({parish,bedroom_band,count})=>({parish,bedroom_band,count})) : [],
    next:draft && draft.cells.length>after+50 ? after+50 : null, reviewed_pages:reviews.results.map(r=>r.page_start), quality:draft?.quality ?? null,public_payload:JSON.parse(row.public_payload)};
}
export async function markDemandPageReviewed(env,{id,version,after},actor) {
  ensureReady(env); assertInput(uuid(id)&&Number.isSafeInteger(version)&&version>0&&[0,50].includes(after)&&actorOk(actor));
  const db=primary(env.DB);
  try { await db.batch([
    guards(db,`EXISTS(SELECT 1 FROM admins WHERE email=?) AND EXISTS(SELECT 1 FROM public_demand_snapshots s WHERE s.id=? AND s.version=? AND s.status='draft' AND s.private_payload IS NOT NULL AND s.as_of>strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days') AND (?=0 OR json_array_length(json_extract(s.private_payload,'$.cells'))>50))`,actor,id,version,after),
    db.prepare("INSERT OR IGNORE INTO public_demand_page_reviews(snapshot_id,version,actor,page_start,reviewed_at) VALUES(?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(id,version,actor,after),clear(db),
  ]); } catch { fail(409,'Draft changed'); }
  return {id,version,after};
}
export async function approveDemandDraft(env,{id,version,authorization_id},actor) {
  ensureReady(env); assertInput(uuid(id)&&uuid(authorization_id)&&Number.isSafeInteger(version)&&version>0&&actorOk(actor));
  const db=primary(env.DB), [snap,state,time]=await db.batch([
    db.prepare('SELECT * FROM public_demand_snapshots WHERE id=?').bind(id),
    db.prepare('SELECT * FROM public_demand_release_state WHERE id=1'),qtime(db),
  ]).then(r=>r.map(x=>x.results?.[0]));
  if(!snap||!state||!time||snap.status!=='draft'||snap.version!==version||!snap.private_payload||!policy(env)||!await validSnapshot(snap)) fail(409,'Draft or policy changed');
  const expected={authorization_id,policy_version:policy(env),public_sha256:snap.public_sha256,releases_sha256:state.releases_sha256,ledger_version:state.ledger_version};
  const authorization=await readAcceptedReleaseAuthorization(env,expected,time.now);
  if(!authorization) fail(409,'Release review not available');
  try { await db.batch([
    guards(db,`EXISTS(SELECT 1 FROM admins WHERE email=?) AND EXISTS(SELECT 1 FROM public_demand_snapshots s JOIN public_demand_release_state l ON l.id=1 JOIN demand_release_authorizations a ON a.id=? WHERE s.id=? AND s.status='draft' AND s.version=? AND s.private_payload IS NOT NULL AND EXISTS(SELECT 1 FROM public_demand_page_reviews r WHERE r.snapshot_id=s.id AND r.version=s.version AND r.actor=? AND r.page_start=0) AND (json_array_length(json_extract(s.private_payload,'$.cells'))<=50 OR EXISTS(SELECT 1 FROM public_demand_page_reviews r WHERE r.snapshot_id=s.id AND r.version=s.version AND r.actor=? AND r.page_start=50)) AND s.as_of>strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days') AND s.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND l.ledger_version=? AND l.releases_sha256=? AND a.policy_version=? AND a.public_sha256=s.public_sha256 AND a.releases_sha256=l.releases_sha256 AND a.ledger_version=l.ledger_version AND a.identity_checked=1 AND a.inference_review='accepted' AND a.revoked_at IS NULL AND a.accepted_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND a.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND a.source_ref=? AND a.approved_by_ref=? AND a.accepted_at=? AND a.expires_at=?)`,actor,authorization_id,id,version,actor,actor,state.ledger_version,state.releases_sha256,policy(env),authorization.source_ref,authorization.approved_by_ref,authorization.accepted_at,authorization.expires_at),
    db.prepare(`UPDATE public_demand_snapshots SET status='approved',version=version+1,authorization_id=?,ledger_version=?,ledger_hash=?,approved_by=?,approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(authorization_id,state.ledger_version,state.releases_sha256,actor,id),clear(db),
  ]); } catch { fail(409,'Draft or release review changed'); }
  return {id,version:version+1,status:'approved'};
}

export async function publishDemandDraft(env,{id,version},actor) {
  ensureReady(env); assertInput(uuid(id)&&Number.isSafeInteger(version)&&version>0&&actorOk(actor));
  if(env.PUBLIC_DEMAND_READY!=='1' || !policy(env)) fail(409,'Public release not available');
  const db=primary(env.DB), [snap,state,entries,time]=await db.batch([
    db.prepare('SELECT * FROM public_demand_snapshots WHERE id=?').bind(id),
    db.prepare('SELECT * FROM public_demand_release_state WHERE id=1'),
    db.prepare('SELECT id,public_sha256,operation,published_at FROM public_demand_releases ORDER BY ledger_sequence'),qtime(db),
  ]).then(r=>[r[0].results?.[0],r[1].results?.[0],r[2].results,r[3].results?.[0]]);
  if(!snap||!state||!time||snap.status!=='approved'||snap.version!==version||!snap.private_payload||
      snap.ledger_version!==state.ledger_version||snap.ledger_hash!==state.releases_sha256||!Array.isArray(entries)) fail(409,'Approval or ledger changed');
  if(!await validSnapshot(snap)) fail(409,'Snapshot changed');
  const list=entries.map(x=>[x.id,x.public_sha256,x.operation,x.published_at]);
  if(await sha256(JSON.stringify(list))!==state.releases_sha256) fail(409,'Ledger changed');
  const expected={authorization_id:snap.authorization_id,policy_version:policy(env),public_sha256:snap.public_sha256,releases_sha256:state.releases_sha256,ledger_version:state.ledger_version};
  const authorization=await readAcceptedReleaseAuthorization(env,expected,time.now);
  if(!authorization) fail(409,'Release review not available');
  const nextHash=await sha256(JSON.stringify([...list,[id,snap.public_sha256,snap.operation,time.now]]));
  try { await db.batch([
    guards(db,`EXISTS(SELECT 1 FROM admins WHERE email=?) AND EXISTS(SELECT 1 FROM public_demand_snapshots s JOIN public_demand_release_state l ON l.id=1 JOIN demand_release_authorizations a ON a.id=s.authorization_id WHERE s.id=? AND s.status='approved' AND s.version=? AND s.private_payload IS NOT NULL AND s.as_of>strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days') AND s.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND s.public_sha256=? AND s.ledger_version=l.ledger_version AND s.ledger_hash=l.releases_sha256 AND l.ledger_version=? AND l.releases_sha256=? AND a.policy_version=? AND a.public_sha256=s.public_sha256 AND a.releases_sha256=l.releases_sha256 AND a.ledger_version=l.ledger_version AND a.identity_checked=1 AND a.inference_review='accepted' AND a.revoked_at IS NULL AND a.accepted_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND a.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND a.source_ref=? AND a.approved_by_ref=? AND a.accepted_at=? AND a.expires_at=?)`,actor,id,version,snap.public_sha256,state.ledger_version,state.releases_sha256,policy(env),authorization.source_ref,authorization.approved_by_ref,authorization.accepted_at,authorization.expires_at),
    db.prepare('INSERT INTO public_demand_releases(ledger_sequence,id,public_sha256,operation,published_at,public_payload) VALUES(?,?,?,?,?,?)')
      .bind(state.ledger_version+1,id,snap.public_sha256,snap.operation,time.now,snap.public_payload),
    db.prepare(`INSERT INTO public_demand_pointer(operation,current_snapshot_id,version) VALUES(?,?,1)
      ON CONFLICT(operation) DO UPDATE SET current_snapshot_id=excluded.current_snapshot_id,version=version+1`).bind(snap.operation,id),
    db.prepare('UPDATE public_demand_release_state SET ledger_version=ledger_version+1,releases_sha256=? WHERE id=1').bind(nextHash),
    db.prepare("UPDATE public_demand_snapshots SET status='published',version=version+1,published_by=?,published_at=? WHERE id=?").bind(actor,time.now,id),clear(db),
  ]); } catch { fail(409,'Approval or release review changed'); }
  return {id,version:version+1,status:'published'};
}
export async function revokeDemandDraft(env,{id,version},actor) {
  ensureReady(env); assertInput(uuid(id)&&Number.isSafeInteger(version)&&version>0&&actorOk(actor));
  const db=primary(env.DB);
  try { await db.batch([
    guards(db,"EXISTS(SELECT 1 FROM admins WHERE email=?) AND EXISTS(SELECT 1 FROM public_demand_snapshots WHERE id=? AND version=? AND status IN ('draft','approved','published'))",actor,id,version),
    db.prepare('DELETE FROM public_demand_pointer WHERE current_snapshot_id=?').bind(id),
    db.prepare("UPDATE public_demand_snapshots SET status='revoked',version=version+1 WHERE id=?").bind(id),clear(db),
  ]); } catch { fail(409,'Snapshot changed'); }
  return {id,version:version+1,status:'revoked'};
}
export async function currentPublicDemand(env) {
  if(env.PUBLIC_DEMAND_READY!=='1' || !policy(env)) return {status:'not_available'};
  const db=primary(env.DB);
  const [rows,time]=await db.batch([db.prepare(`SELECT s.id,s.operation,s.public_payload,s.public_sha256 FROM public_demand_pointer p
    JOIN public_demand_snapshots s ON s.id=p.current_snapshot_id AND s.operation=p.operation
    JOIN demand_release_authorizations a ON a.id=s.authorization_id
    WHERE s.status='published' AND s.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND a.revoked_at IS NULL AND a.accepted_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND a.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND a.identity_checked=1 AND a.inference_review='accepted' AND a.policy_version=? AND a.public_sha256=s.public_sha256
      AND a.ledger_version=s.ledger_version AND a.releases_sha256=s.ledger_hash AND length(a.source_ref) BETWEEN 1 AND 160 AND length(a.approved_by_ref) BETWEEN 1 AND 160
      AND substr(a.source_ref,1,1) GLOB '[A-Za-z0-9]' AND a.source_ref NOT GLOB '*[^A-Za-z0-9._:-]*'
      AND substr(a.approved_by_ref,1,1) GLOB '[A-Za-z0-9]' AND a.approved_by_ref NOT GLOB '*[^A-Za-z0-9._:-]*'
    ORDER BY s.operation`).bind(policy(env)),qtime(db)]).then(r=>[r[0].results,r[1].results?.[0]]);
  if(!Array.isArray(rows)||!time) return {status:'not_available'};
  const snapshots=[];
  for(const row of rows) {
    if(await sha256(row.public_payload)!==row.public_sha256) continue;
    try { const p=JSON.parse(row.public_payload); if(isPublicDemandPayload(p) && p.id===row.id && p.operation===row.operation && p.as_of<=time.now && p.valid_until>time.now) snapshots.push(p); } catch { /* fail closed */ }
  }
  return snapshots.length ? {status:'available',snapshots} : {status:'not_available'};
}

// Only called by the existing daily retention pass when the proposed schema is explicitly enabled.
export async function prunePrivateDemandMatrices(env) {
  const db=primary(env.DB);
  return db.prepare(`UPDATE public_demand_snapshots SET private_payload=NULL,
    status=CASE WHEN status IN ('draft','approved') THEN 'revoked' ELSE status END,
    version=CASE WHEN status IN ('draft','approved') THEN version+1 ELSE version END
    WHERE private_payload IS NOT NULL AND as_of<=strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')`).run();
}
