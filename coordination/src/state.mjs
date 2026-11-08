import { normalizeResource, resourcesConflict, slotCapacity } from '../catalog.mjs';
import { fail, requireThat, text, identifier, gitSha, allowFields } from './errors.mjs';
import { canonicalJson } from './retention.mjs';
export const LEASE_MS=15*60*1000;
const SLOTS=['vps','hermes','vscode','codex-desktop'];
const KINDS=['design','integrated','research_accepted','activated','decision'];
const CLOSED=new Set(['completed','abandoned']);
const scopeDefinition=unit=>canonicalJson({parentTaskId:unit.parentTaskId,preferredSlot:unit.preferredSlot,kind:unit.kind,dependencies:unit.dependencies,resources:unit.resources,acceptance:unit.acceptance});
const designs=(state,unit)=>state.evidence.filter(e=>e.unitId===unit.id&&e.kind==='design'&&evidenceCurrent(state,e,unit));
const covers=(approved,wanted)=>approved.some(r=>(r.mode==='write'||wanted.mode==='read')&&(r.key===wanted.key||(r.key.startsWith('path:')&&r.key.endsWith('/')&&wanted.key.startsWith(r.key))));
const reviewed=(state,unit,wanted=unit.resources)=>!unit.reviewRequired||designs(state,unit).some(e=>wanted.every(r=>covers(e.reviewedResources||[],r)));
function initialResources(state,unit,mode) {
  const latest=mode==='build'?designs(state,unit).at(-1):null;
  const all=[...unit.resources,...(latest?.reviewedResources||[])];
  return all.filter((r,i)=>all.findIndex(other=>r.key===other.key&&r.mode===other.mode)===i);
}
export const emptyState=()=>({revision:0,catalogSha:null,catalog:null,claims:[],evidence:[],release:null});
export const current=claim=>!CLOSED.has(claim.status);
const expired=(claim,now)=>claim.expiresAt<=now;
const unitFor=(state,id)=>state.catalog?.units.find(u=>u.id===id);
export function evidenceCurrent(state,evidence,unit=unitFor(state,evidence.unitId)) {
  return !!unit&&evidence.scopeDefinition===scopeDefinition(unit)&&(evidence.kind!=='design'||unit.resources.every(r=>covers(evidence.reviewedResources||[],r)));
}
const completionCurrent=(state,claim)=>!!unitFor(state,claim.unitId)&&claim.completedScopeDefinition===scopeDefinition(unitFor(state,claim.unitId));
function resources(values) {
  if(!Array.isArray(values)||values.length>200) fail(400,'INVALID_RESOURCES','Expected a bounded resource list.');
  try {return values.map(normalizeResource);} catch {fail(400,'INVALID_RESOURCES','Invalid or ambiguous resource.');}
}
function slot(actor,id) {
  if(!SLOTS.includes(id)) fail(400,'INVALID_SLOT','Unknown team slot.');
  if(!actor.slots.includes(id)) fail(403,'SLOT_FORBIDDEN','Identity is not authorized for this slot.');
}
function coordinator(actor) {if(actor.role!=='coordinator') fail(403,'COORDINATOR_REQUIRED','Coordinator identity required.');}
export function assertRevision(state,revision) {
  if(!Number.isInteger(revision)||revision<0) fail(400,'INVALID_REVISION','Expected revision is required.');
  requireThat(state.revision===revision,'REVISION_CONFLICT','Board revision changed.',{revision:state.revision});
}
export function dependencyBlockers(state,unit) {
  return unit.dependencies.filter(dep=>!state.evidence.some(e=>e.unitId===dep.unitId&&e.kind===dep.requiredEvidence&&evidenceCurrent(state,e)));
}
function buildable(state,unit,wanted=unit.resources) {
  requireThat(unit.enabled&&reviewed(state,unit,wanted),'UNIT_NOT_REVIEWED','Unit is disabled or requires scope review.');
  requireThat(!dependencyBlockers(state,unit).length,'DEPENDENCIES_BLOCKED','Required dependency evidence is missing.',{dependencies:dependencyBlockers(state,unit)});
}
function conflicts(state,wanted,exceptId) {
  return state.claims.filter(c=>current(c)&&c.id!==exceptId&&c.resources.some(r=>wanted.some(w=>resourcesConflict(r,w)))).map(c=>({claimId:c.id,unitId:c.unitId,slot:c.slot}));
}
function availableIdentity(state,target,exceptId) {
  const occupied=state.claims.filter(c=>current(c)&&c.id!==exceptId);
  return occupied.filter(c=>c.slot===target.slot).length<slotCapacity(state.catalog,target.slot)&&!occupied.some(c=>c.sessionId===target.sessionId||c.checkoutId===target.checkoutId||c.actorId===target.actorId);
}
export function assertAuthority(state,actor,path,body,now) {
  const match=path.match(/^\/v1\/claims\/([^/]+)\/(\w+)$/);
  const releaseAction=path.match(/^\/v1\/release\/(\w+)$/)?.[1];
  if(!match&&!releaseAction) return;
  const claimId=match?.[1]||body.claimId||state.release?.claimId;
  const claim=state.claims.find(c=>c.id===claimId);
  requireThat(claim,'CLAIM_NOT_FOUND','Claim does not exist.');
  const action=match?.[2]||releaseAction;
  if(action==='handoff') coordinator(actor);
  else if(claim.actorId!==actor.actorId) fail(403,'NOT_OWNER','Claim belongs to another identity.');
  requireThat(Number.isInteger(body.generation)&&body.generation===claim.generation,'GENERATION_REVOKED','Claim generation is missing or revoked.');
  // Handoff supplies the old session to identify explicitly what is being revoked.
  requireThat(body.sessionId===claim.sessionId,'SESSION_REVOKED','Claim session does not match.');
  if(action!=='handoff') {
    slot(actor,claim.slot);
    if(action!=='finish'&&(!['complete','abandon'].includes(action)||current(claim))) requireThat(!expired(claim,now),'STALE_CLAIM','Lease expired; coordinator recovery is required.');
  }
  return claim;
}
export function board(state,now=Date.now()) {
  return {protocolVersion:1,revision:state.revision,serverTime:new Date(now).toISOString(),catalogSha:state.catalogSha,
    slots:state.catalog?.slots||SLOTS.map(id=>({id,name:id,area:''})),tasks:state.catalog?.tasks||[],units:state.catalog?.units||[],
    claims:state.claims.map(c=>({...c,status:current(c)&&expired(c,now)?'stale':c.status,...(c.status==='completed'&&c.mode==='build'?{completionCurrent:completionCurrent(state,c)}:{})})),evidence:state.evidence.map(e=>({...e,evidenceCurrent:evidenceCurrent(state,e)})),release:state.release?{...state.release,stale:state.release.expiresAt<=now}:null,
    blockers:(state.catalog?.units||[]).flatMap(u=>{const reasons=[];if(!u.enabled)reasons.push('disabled');if(!reviewed(state,u,state.claims.find(c=>current(c)&&c.unitId===u.id)?.resources||u.resources))reasons.push('review_required');const dependencies=dependencyBlockers(state,u);const occupied=conflicts(state,u.resources);return reasons.length||dependencies.length||occupied.length?[{unitId:u.id,reasons,dependencies,conflicts:occupied}]:[];})};
}
function importCatalog(state,catalog,sha,publication=false) {
  for(const slot of catalog.slots) {
    const occupied=state.claims.filter(c=>current(c)&&c.slot===slot.id).length;
    requireThat(occupied<=slotCapacity(catalog,slot.id),'CATALOG_CAPACITY_CONFLICT','Catalogue capacity is below reserved occupancy.',{slot:slot.id,occupied,capacity:slotCapacity(catalog,slot.id)});
  }
  for(const claim of state.claims.filter(current)) {
    const previous=unitFor(state,claim.unitId); const replacement=catalog.units.find(u=>u.id===claim.unitId);
    const identical=replacement&&canonicalJson(previous)===canonicalJson(replacement);
    const integratedDisable=publication&&replacement&&claim.status==='submitted'&&claim.submission?.headSha===sha&&previous.enabled&&!replacement.enabled&&canonicalJson({...previous,enabled:false})===canonicalJson(replacement);
    requireThat(identical||integratedDisable,'CATALOG_CLAIM_CONFLICT','Catalogue changes a unit with reserved work.',{unitId:claim.unitId,claimId:claim.id});
  }
  const prospective={...state,catalog};
  for(const claim of state.claims.filter(c=>current(c)&&c.mode==='build')) {
    const blockers=dependencyBlockers(prospective,unitFor(prospective,claim.unitId));
    requireThat(!blockers.length,'CATALOG_DEPENDENCY_CONFLICT','Catalogue invalidates evidence required by reserved build work.',{claimId:claim.id,unitId:claim.unitId,dependencies:blockers});
  }
  state.catalog=catalog;state.catalogSha=sha;
}
function dispatch(state,actor,path,body,prepared,now) {
  if(!['executor','coordinator'].includes(actor.role)) fail(403,'READ_ONLY','Viewer identity is read only.');
  identifier(body.operationId,'operationId');
  if(path==='/v1/catalog') {
    allowFields(body,['operationId','expectedRevision','sha']);coordinator(actor);assertRevision(state,body.expectedRevision);
    requireThat(prepared.catalog,'CATALOG_NOT_VERIFIED','Canonical catalogue was not verified.');
    importCatalog(state,prepared.catalog,gitSha(body.sha));return {catalogSha:state.catalogSha};
  }
  requireThat(state.catalog,'CATALOG_REQUIRED','Import the verified canonical catalogue first.');
  if(path==='/v1/claims') {
    allowFields(body,['operationId','expectedRevision','slot','sessionId','checkoutId','hostId','taskId','mode','baseSha']);
    assertRevision(state,body.expectedRevision);slot(actor,body.slot);
    identifier(body.sessionId,'sessionId');identifier(body.checkoutId,'checkoutId');identifier(body.hostId,'hostId');gitSha(body.baseSha);
    if(!['plan','build'].includes(body.mode)) fail(400,'INVALID_MODE','Mode must be plan or build.');
    const own=state.claims.find(c=>current(c)&&c.actorId===actor.actorId);
    if(own) {
      requireThat(own.sessionId===body.sessionId&&own.checkoutId===body.checkoutId&&own.hostId===body.hostId&&own.slot===body.slot,'CHECKOUT_OCCUPIED','Resume the existing claim and checkout.',{claimId:own.id});
      requireThat(!expired(own,now),'STALE_CLAIM','Lease expired; coordinator recovery is required.');
      requireThat(!body.taskId||body.taskId===own.unitId||body.taskId===unitFor(state,own.unitId).parentTaskId,'CLAIM_OCCUPIED','Finish or resume the current claim first.');
      requireThat(own.mode===body.mode,'MODE_CONFLICT','Use resume to request a mode change.');return {claim:own};
    }
    requireThat(state.release?.status!=='synchronization_pending','CATALOG_SYNC_PENDING','Reconcile the published catalogue before starting new work.');
    requireThat(availableIdentity(state,{...body,actorId:actor.actorId}),'CHECKOUT_OCCUPIED','Actor, slot capacity, session or checkout contains reserved work.');
    const occupiedOrigins=new Set(state.claims.filter(current).map(c=>c.slot));
    const candidates=state.catalog.units.filter(u=>u.enabled&&!state.claims.some(c=>c.unitId===u.id&&c.status==='completed'&&c.mode==='build'&&completionCurrent(state,c))&&(!body.taskId||u.id===body.taskId||u.parentTaskId===body.taskId))
      .sort((a,b)=>Number(b.preferredSlot===body.slot)-Number(a.preferredSlot===body.slot)||a.priority-b.priority||a.id.localeCompare(b.id));
    const candidate=candidates.find(u=>!state.claims.some(c=>current(c)&&c.unitId===u.id)&&
      (u.preferredSlot===body.slot||!occupiedOrigins.has(u.preferredSlot))&&
      (body.mode==='plan'||(reviewed(state,u,initialResources(state,u,body.mode))&&!dependencyBlockers(state,u).length))&&!conflicts(state,initialResources(state,u,body.mode)).length);
    requireThat(candidate,'NO_AVAILABLE_UNIT','No compatible unit is available.',{blockers:board(state,now).blockers});
    const claim={id:crypto.randomUUID(),unitId:candidate.id,slot:body.slot,originSlot:candidate.preferredSlot,actorId:actor.actorId,sessionId:body.sessionId,checkoutId:body.checkoutId,hostId:body.hostId,generation:1,mode:body.mode,status:'active',resources:resources(initialResources(state,candidate,body.mode)),baseSha:gitSha(body.baseSha),updatedAt:now,expiresAt:now+LEASE_MS,pendingWork:false};
    state.claims.push(claim);return {claim};
  }
  if(path==='/v1/evidence') {
    allowFields(body,['operationId','expectedRevision','unitId','kind','reference','sha']);coordinator(actor);assertRevision(state,body.expectedRevision);
    requireThat(unitFor(state,body.unitId),'UNIT_NOT_FOUND','Evidence unit does not exist.');
    if(!KINDS.includes(body.kind)) fail(400,'INVALID_EVIDENCE','Unknown evidence kind.');text(body.reference,'reference',4000);
    if(body.kind==='integrated') requireThat(prepared.integratedSha===gitSha(body.sha),'UNVERIFIED_EVIDENCE','Commit must be verified on canonical main.');
    else if(body.sha!==undefined) gitSha(body.sha);
    const evidence={id:crypto.randomUUID(),unitId:body.unitId,kind:body.kind,reference:body.reference,...(body.sha?{sha:gitSha(body.sha)}:{}),verification:body.kind==='integrated'?'canonical-main':'coordinator-attestation',actorId:actor.actorId,createdAt:now,scopeDefinition:scopeDefinition(unitFor(state,body.unitId)),...(body.kind==='design'?{reviewedResources:structuredClone(state.claims.find(c=>c.unitId===body.unitId&&current(c))?.resources||unitFor(state,body.unitId).resources)}:{})};
    state.evidence.push(evidence);return {evidence};
  }
  const claim=assertAuthority(state,actor,path,body,now);
  requireThat(claim,'UNKNOWN_ENDPOINT','Unknown coordination endpoint.');
  const action=path.split('/').at(-1);
  if(path.startsWith('/v1/release/')) return release(state,actor,claim,action,body,prepared,now);
  const common=['operationId','generation','sessionId'];
  const specific={renew:[],scope:['resources'],pause:['evidence','pendingWork'],resume:['mode'],handoff:['target','evidence'],submit:['headSha','changedPaths','evidence'],abandon:['clean','pendingWork'],complete:[]};
  if(!Object.hasOwn(specific,action)) fail(400,'UNKNOWN_ENDPOINT','Unknown claim operation.');
  allowFields(body,[...common,...specific[action]]);
  requireThat(current(claim),'CLAIM_CLOSED','Claim is already closed.');
  const unit=unitFor(state,claim.unitId);
  if(action==='handoff') {
    text(body.evidence,'handoff evidence',4000);allowFields(body.target,['actorId','slot','sessionId','checkoutId','hostId']);
    for(const name of ['actorId','sessionId','checkoutId','hostId'])identifier(body.target[name],`target ${name}`);
    requireThat(prepared.authorizedTarget===true,'TARGET_NOT_AUTHORIZED','Target identity and slot must be authorized.');
    requireThat(availableIdentity(state,body.target,claim.id),'CHECKOUT_OCCUPIED','Target actor, slot capacity, session or checkout is occupied.');
    claim.handoffs=[...(claim.handoffs||[]),{from:{actorId:claim.actorId,slot:claim.slot,sessionId:claim.sessionId,checkoutId:claim.checkoutId,hostId:claim.hostId},to:body.target,evidence:body.evidence,at:now}];
    Object.assign(claim,body.target,{generation:claim.generation+1,status:claim.status==='submitted'?'submitted':'paused',updatedAt:now,expiresAt:now+LEASE_MS});
    if(state.release?.claimId===claim.id)Object.assign(state.release,{actorId:claim.actorId,generation:claim.generation,sessionId:claim.sessionId,status:'uncertain',evidence:body.evidence,updatedAt:now,expiresAt:now+LEASE_MS});
  } else if(action==='renew') {
    claim.expiresAt=now+LEASE_MS;
  } else if(action==='scope') {
    const added=resources(body.resources);const busy=conflicts(state,added,claim.id);
    requireThat(!busy.length,'RESOURCE_CONFLICT','New scope conflicts with reserved work.',{conflicts:busy});
    if(claim.mode==='build')requireThat(reviewed(state,unit,[...claim.resources,...added]),'SCOPE_REVIEW_REQUIRED','Expanded scope needs a coordinator design attestation while in plan mode.');
    for(const r of added)if(!claim.resources.some(x=>x.key===r.key&&x.mode===r.mode))claim.resources.push(r);
  } else if(action==='pause') {
    text(body.evidence,'saved work evidence',4000);
    if(typeof body.pendingWork!=='boolean')fail(400,'INVALID_INPUT','Pause must describe pendingWork.');
    claim.status='paused';claim.pendingWork=claim.pendingWork||body.pendingWork;claim.pauseEvidence=body.evidence;
  } else if(action==='resume') {
    requireThat(claim.status!=='submitted','SUBMITTED_CLAIM','Submitted claim remains reserved for integration.');
    const mode=body.mode||claim.mode;if(!['plan','build'].includes(mode))fail(400,'INVALID_MODE','Invalid mode.');
    if(mode==='build')buildable(state,unit,claim.resources);
    claim.status='active';claim.mode=mode;claim.expiresAt=now+LEASE_MS;
  } else if(action==='submit') {
    requireThat(['active','submitted'].includes(claim.status),'CLAIM_NOT_ACTIVE','Resume the claim before submitting.');
    requireThat(!state.release||state.release.claimId!==claim.id||state.release.status==='held','PUBLICATION_UNCERTAIN','Reconcile an uncertain publication before changing the submission.');
    const headSha=gitSha(body.headSha);text(body.evidence,'evidence',4000);
    if(!Array.isArray(body.changedPaths)||body.changedPaths.length>1000)fail(400,'INVALID_PATHS','Changed paths must be a bounded list.');
    if(claim.mode==='plan')requireThat(body.changedPaths.length===0,'PLAN_ONLY','Planning claims cannot authorize product code changes.');
    const changedPaths=body.changedPaths.map(path=>{try {return normalizeResource({key:`path:${path}`,mode:'write'}).key.slice(5);}catch{fail(400,'INVALID_PATHS','Changed paths must be canonical relative file paths.');}});
    requireThat(changedPaths.every(p=>!p.endsWith('/')),'INVALID_PATHS','Changed paths must identify files.');
    requireThat(changedPaths.every(p=>claim.resources.some(r=>r.mode==='write'&&r.key.startsWith('path:')&&(r.key===`path:${p}`||(r.key.endsWith('/')&&`path:${p}`.startsWith(r.key))))),'OUT_OF_SCOPE','Changed files exceed reserved write scope.');
    claim.status='submitted';claim.pendingWork=changedPaths.length>0||headSha!==claim.baseSha;claim.submission={headSha,changedPaths,evidence:body.evidence,at:now};
  } else if(action==='abandon') {
    requireThat(body.clean===true&&body.pendingWork!==true&&!claim.pendingWork,'PENDING_WORK','Abandon requires a clean checkout without pending work.');
    requireThat(!state.release||state.release.claimId!==claim.id,'RELEASE_HELD','Resolve publication turn first.');claim.status='abandoned';claim.resources=[];
  } else if(action==='complete') {
    const evidenceKind=claim.mode==='plan'?'design':unit.kind==='development'?'integrated':unit.kind==='research'?'research_accepted':'decision';
    const evidence=state.evidence.find(e=>e.unitId===claim.unitId&&e.kind===evidenceKind&&evidenceCurrent(state,e,unit)&&(evidenceKind!=='design'||(e.scopeDefinition===scopeDefinition(unit)&&claim.resources.every(r=>covers(e.reviewedResources||[],r))))&&(evidenceKind!=='integrated'||(claim.submission&&e.sha===claim.submission.headSha)));
    requireThat(evidence,'EVIDENCE_REQUIRED','Trusted completion evidence is required.',{requiredEvidence:evidenceKind});
    requireThat(!state.release||state.release.claimId!==claim.id,'RELEASE_HELD','Resolve publication turn first.');
    claim.status='completed';claim.resources=[];claim.pendingWork=false;claim.completedEvidenceId=evidence.id;claim.completedScopeDefinition=scopeDefinition(unit);
  }
  claim.updatedAt=now;return {claim};
}
function release(state,actor,claim,action,body,prepared,now) {
  const common=['operationId','claimId','generation','sessionId','sha'];
  allowFields(body,action==='finish'?[...common,'outcome','evidence']:common);
  requireThat(claim.status==='submitted','CLAIM_NOT_SUBMITTED','Publication requires a submitted claim.');
  requireThat(claim.mode==='build','PLAN_ONLY','Planning claims cannot acquire publication turns.');
  if(action==='acquire') {
    requireThat(!state.release,'RELEASE_HELD','Another publication turn remains reserved.');
    const sha=gitSha(body.sha);requireThat(sha===claim.submission.headSha,'SHA_MISMATCH','Publication SHA differs from submitted SHA.');
    state.release={id:crypto.randomUUID(),claimId:claim.id,actorId:actor.actorId,generation:claim.generation,sessionId:claim.sessionId,sha,status:'held',updatedAt:now,expiresAt:now+LEASE_MS};
  } else {
    requireThat(state.release&&state.release.claimId===claim.id&&state.release.generation===claim.generation&&state.release.sessionId===claim.sessionId,'RELEASE_NOT_OWNER','Publication turn does not belong to this session.');
    if(action==='renew') {
      requireThat(state.release.expiresAt>now,'STALE_RELEASE','Expired publication turn requires explicit reconciliation.');
      if(body.sha!==undefined){const sha=gitSha(body.sha);requireThat(sha===claim.submission.headSha,'SHA_MISMATCH','Publication SHA must match the latest submitted commit.');if(sha!==state.release.sha)requireThat(state.release.status==='held','PUBLICATION_UNCERTAIN','An uncertain publication SHA cannot change.');state.release.sha=sha;}
      state.release.expiresAt=now+LEASE_MS;state.release.updatedAt=now;
    } else if(action==='finish') {
      if(!['published','uncertain','cancelled'].includes(body.outcome))fail(400,'INVALID_OUTCOME','Invalid publication outcome.');
      text(body.evidence,'publication evidence',4000);const sha=gitSha(body.sha);
      requireThat(sha===state.release.sha,'SHA_MISMATCH','Reconcile the exact publication SHA.');
      if(body.outcome==='uncertain')Object.assign(state.release,{status:'uncertain',evidence:body.evidence,updatedAt:now});
      else if(body.outcome==='published') {
        if(prepared.synchronizationError) {
          Object.assign(state.release,{status:'synchronization_pending',evidence:body.evidence,updatedAt:now});
          return {release:state.release,synchronizationPending:true};
        }
        requireThat(sha===claim.submission.headSha,'SHA_MISMATCH','Published SHA differs from the latest submitted commit.');
        requireThat(prepared.catalog&&prepared.publishedSha===sha,'UNVERIFIED_PUBLICATION','Canonical main and catalogue must be verified.');
        importCatalog(state,prepared.catalog,sha,true);
        if(!state.evidence.some(e=>e.unitId===claim.unitId&&e.kind==='integrated'&&e.sha===sha&&evidenceCurrent(state,e)))state.evidence.push({id:crypto.randomUUID(),unitId:claim.unitId,kind:'integrated',sha,scopeDefinition:scopeDefinition(unitFor(state,claim.unitId)),reference:body.evidence,verification:'canonical-main',source:'verified-publication',releaseId:state.release.id,actorId:actor.actorId,createdAt:now});
        state.release=null;
      } else state.release=null;
    } else fail(400,'UNKNOWN_ENDPOINT','Unknown publication operation.');
  }
  return {release:state.release};
}
// The caller persists the entire transition in the same SQLite transaction as its idempotency record.
export function applyCommand(state,actor,path,body,prepared={},now=Date.now()) {
  const next=structuredClone(state);const response=dispatch(next,actor,path,body,prepared,now);next.revision++;
  Object.assign(state,next);return {...response,revision:next.revision};
}
