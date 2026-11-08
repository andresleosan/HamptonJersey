import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyState, board } from '../coordination/src/state.mjs';

const sha = 'a'.repeat(40);
const slots = ['vps', 'hermes', 'vscode', 'codex-desktop'];
const actor = (slot='vps', role='executor') => ({ actorId: slot, slots: [slot], role });
const unit = (id, resources=[], extra={}) => ({ id, parentTaskId:id, title:id, preferredSlot:'vps', priority:1, kind:'development', enabled:true, reviewRequired:false, dependencies:[], resources, acceptance:['Works'], ...extra });
const catalog = units => ({schemaVersion:1, project:'hampton', slots:slots.map(id=>({id,name:id,area:id})), tasks:units.map(u=>({id:u.id,code:u.id,assignedSlot:u.preferredSlot})), units});
const initialized = units => ({...emptyState(),catalog:catalog(units),catalogSha:sha,revision:1});
let sequence=0;
function call(state, path, data={}, who=actor(), now=1_000) {
  return applyCommand(state, who, path, {operationId:`op-${++sequence}`, ...data}, path.endsWith('/handoff')?{authorizedTarget:true}:{}, now);
}
function claim(state, data={}, who=actor()) {
  return call(state,'/v1/claims',{expectedRevision:state.revision,slot:who.slots[0],sessionId:who.actorId==='vps'?'session':`session-${who.actorId}`,checkoutId:`checkout-${who.actorId}`,hostId:'host',mode:'build',baseSha:sha,...data},who).claim;
}
const authority = c => ({generation:c.generation,sessionId:c.sessionId});

test('logical and parent/child resources conflict; paused and expired retain occupancy', () => {
  const state=initialized([unit('A',[{key:'path:src/',mode:'write'}]),unit('B',[{key:'path:src/a.js',mode:'read'}],{preferredSlot:'hermes'})]);
  const c=claim(state);
  call(state,`/v1/claims/${c.id}/pause`,{...authority(c),evidence:'Saved patch',pendingWork:true});
  assert.throws(()=>claim(state,{},actor('hermes')), e=>e.code==='NO_AVAILABLE_UNIT');
  assert.equal(board(state,1_000_000).claims[0].status,'stale');
  assert.equal(state.claims[0].generation,1);
  assert.throws(()=>call(state,`/v1/claims/${c.id}/renew`,authority(c),actor(),1_000_000), e=>e.code==='STALE_CLAIM');
});

test('review-required units permit plan only, plan never submits product edits',()=>{
  const state=initialized([unit('A',[{key:'path:src/',mode:'write'}],{reviewRequired:true})]);
  assert.throws(()=>claim(state),e=>e.code==='NO_AVAILABLE_UNIT');
  const c=claim(state,{mode:'plan'});
  assert.throws(()=>call(state,`/v1/claims/${c.id}/submit`,{...authority(c),headSha:sha,changedPaths:['src/a.js'],evidence:'Plan'}),e=>e.code==='PLAN_ONLY');
});

test('typed dependency evidence never substitutes integrated for activated',()=>{
  const state=initialized([unit('A',[],{enabled:false}),unit('B',[],{dependencies:[{unitId:'A',requiredEvidence:'activated'}]})]);
  state.evidence.push({unitId:'A',kind:'integrated',sha});
  assert.throws(()=>claim(state),e=>e.code==='NO_AVAILABLE_UNIT');
  call(state,'/v1/evidence',{expectedRevision:state.revision,unitId:'A',kind:'activated',reference:'Verified'},actor('vps','coordinator'));
  assert.equal(claim(state).unitId,'B');
});

test('handoff increments generation and revokes ownership even for old idempotent commands',()=>{
  const state=initialized([unit('A')]); const c=claim(state);
  call(state,`/v1/claims/${c.id}/renew`,{operationId:'renew-original',...authority(c)});
  call(state,`/v1/claims/${c.id}/handoff`,{...authority(c),target:{actorId:'hermes',slot:'hermes',sessionId:'new',checkoutId:'other',hostId:'host'},evidence:'Private patch verified'},actor('vps','coordinator'));
  assert.equal(state.claims[0].generation,2);
  assert.throws(()=>call(state,`/v1/claims/${c.id}/renew`,{operationId:'renew-original',generation:1,sessionId:'session'}),e=>e.code==='NOT_OWNER'||e.code==='GENERATION_REVOKED');
});

test('scope additive; submit checks write scope; pending work blocks abandon',()=>{
  const state=initialized([unit('A',[{key:'path:src/a.js',mode:'write'}])]); const c=claim(state);
  assert.throws(()=>call(state,`/v1/claims/${c.id}/submit`,{...authority(c),headSha:sha,changedPaths:['src/b.js'],evidence:'Tests'}),e=>e.code==='OUT_OF_SCOPE');
  call(state,`/v1/claims/${c.id}/scope`,{...authority(c),resources:[{key:'path:src/b.js',mode:'write'}]});
  call(state,`/v1/claims/${c.id}/submit`,{...authority(c),headSha:sha,changedPaths:['src/b.js'],evidence:'Tests'});
  assert.throws(()=>call(state,`/v1/claims/${c.id}/abandon`,{...authority(c),clean:true}),e=>e.code==='PENDING_WORK');
  assert.throws(()=>call(state,`/v1/claims/${c.id}/complete`,authority(c)),e=>e.code==='EVIDENCE_REQUIRED');
});

test('history pruning bounds payloads and events while preserving operation-key tombstones',async()=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {pruneHistory,REPLAY_RETENTION_MS,MAX_EVENTS}=await import('../coordination/src/retention.mjs');
  const db=new DatabaseSync(':memory:');
  const sql={exec(query,...bindings){return db.prepare(query).all(...bindings);}};
  db.exec('CREATE TABLE operations (created_at INTEGER NOT NULL,result TEXT,fingerprint TEXT); CREATE TABLE events (id INTEGER PRIMARY KEY)');
  const now=REPLAY_RETENTION_MS+100;
  db.prepare('INSERT INTO operations VALUES(?,?,?)').run(0,'sensitive replay response','old-fingerprint');
  db.prepare('INSERT INTO operations VALUES(?,?,?)').run(now,'current response','current-fingerprint');
  const insert=db.prepare('INSERT INTO events VALUES(?)');for(let id=1;id<=MAX_EVENTS+10;id++)insert.run(id);
  pruneHistory(sql,now);
  assert.equal(db.prepare('SELECT result FROM operations WHERE fingerprint=?').get('old-fingerprint').result,null);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM operations').get().count,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM events').get().count,MAX_EVENTS);
  assert.equal(db.prepare('SELECT result FROM operations WHERE fingerprint=?').get('current-fingerprint').result,'current response');db.close();
});

test('publication can advance held SHA and import disable-only for its matching submitted unit',()=>{
  const state=initialized([unit('A',[{key:'path:src/',mode:'write'}])]);const c=claim(state);
  call(state,`/v1/claims/${c.id}/submit`,{...authority(c),headSha:sha,changedPaths:['src/a.js'],evidence:'Initial tests'});
  call(state,'/v1/release/acquire',{claimId:c.id,...authority(c),sha});
  const finalSha='c'.repeat(40);
  call(state,`/v1/claims/${c.id}/submit`,{...authority(c),headSha:finalSha,changedPaths:['src/a.js'],evidence:'Integrated tests'});
  call(state,'/v1/release/renew',{claimId:c.id,...authority(c),sha:finalSha});
  const updated=structuredClone(state.catalog);updated.units[0].enabled=false;
  const result=applyCommand(state,actor(),'/v1/release/finish',{operationId:'published-final',claimId:c.id,...authority(c),sha:finalSha,outcome:'published',evidence:'Remote verified'},{catalog:updated,publishedSha:finalSha},2000);
  assert.equal(result.release,null);assert.equal(state.catalog.units[0].enabled,false);assert.equal(state.claims[0].status,'submitted');
});

test('design review covers claimed paths and is invalidated by a later unit contract change',()=>{
  const state=initialized([unit('A',[{key:'path:src/',mode:'write'}],{reviewRequired:true})]);const c=claim(state,{mode:'plan'});
  call(state,`/v1/claims/${c.id}/scope`,{...authority(c),resources:[{key:'path:docs/a.md',mode:'write'}]});
  call(state,'/v1/evidence',{expectedRevision:state.revision,unitId:'A',kind:'design',reference:'Scope reviewed'},actor('vps','coordinator'));
  assert.deepEqual(state.evidence[0].reviewedResources,state.claims[0].resources);
  assert.equal(call(state,`/v1/claims/${c.id}/resume`,{...authority(c),mode:'build'}).claim.mode,'build');
  call(state,`/v1/claims/${c.id}/pause`,{...authority(c),evidence:'Clean checkpoint',pendingWork:false});
  call(state,`/v1/claims/${c.id}/abandon`,{...authority(c),clean:true});
  const changed=structuredClone(state.catalog);changed.units[0].acceptance=['A different product contract'];
  applyCommand(state,actor('vps','coordinator'),'/v1/catalog',{operationId:'changed-scope',expectedRevision:state.revision,sha},{catalog:changed},2000);
  assert.throws(()=>claim(state),e=>e.code==='NO_AVAILABLE_UNIT');
  assert.equal(state.evidence[0].reference,'Scope reviewed');
});

test('review-required dynamic product scope is reserved in plan then reviewed before edits',()=>{
  const state=initialized([unit('A',[{key:'task:a',mode:'write'}],{reviewRequired:true})]);const c=claim(state,{mode:'plan'});
  call(state,`/v1/claims/${c.id}/scope`,{...authority(c),resources:[{key:'path:src/a.js',mode:'write'}]});
  call(state,'/v1/evidence',{expectedRevision:state.revision,unitId:'A',kind:'design',reference:'Exact product file reviewed'},actor('vps','coordinator'));
  call(state,`/v1/claims/${c.id}/resume`,{...authority(c),mode:'build'});
  assert.throws(()=>call(state,`/v1/claims/${c.id}/scope`,{...authority(c),resources:[{key:'path:src/b.js',mode:'write'}]}),e=>e.code==='SCOPE_REVIEW_REQUIRED');
  assert.equal(state.claims[0].resources.some(r=>r.key==='path:src/b.js'),false);
  call(state,`/v1/claims/${c.id}/resume`,{...authority(c),mode:'plan'});
  call(state,`/v1/claims/${c.id}/scope`,{...authority(c),resources:[{key:'path:src/b.js',mode:'write'}]});
  assert.throws(()=>call(state,`/v1/claims/${c.id}/resume`,{...authority(c),mode:'build'}),e=>e.code==='UNIT_NOT_REVIEWED');
  call(state,'/v1/evidence',{expectedRevision:state.revision,unitId:'A',kind:'design',reference:'Both files reviewed'},actor('vps','coordinator'));
  assert.equal(call(state,`/v1/claims/${c.id}/resume`,{...authority(c),mode:'build'}).claim.mode,'build');
});

for(const kind of ['design','integrated','research_accepted','activated','decision'])test(`${kind} dependency evidence must match the source unit's current contract`,()=>{
  const state=initialized([unit('A',[{key:'path:src/source.js',mode:'write'}],{reviewRequired:true}),unit('B',[{key:'path:src/dependent.js',mode:'write'}],{dependencies:[{unitId:'A',requiredEvidence:kind}]})]);
  const attest=()=>applyCommand(state,actor('vps','coordinator'),'/v1/evidence',{operationId:`attest-${++sequence}`,expectedRevision:state.revision,unitId:'A',kind,reference:'Explicit current contract evidence',...(kind==='integrated'?{sha}:{})},kind==='integrated'?{integratedSha:sha}:{},1000);
  attest();const original=claim(state,{taskId:'B'});call(state,`/v1/claims/${original.id}/abandon`,{...authority(original),clean:true});
  const changed=structuredClone(state.catalog);changed.units[0].resources=[{key:'path:src/revised-source.js',mode:'write'}];
  applyCommand(state,actor('vps','coordinator'),'/v1/catalog',{operationId:`revised-contract-${++sequence}`,expectedRevision:state.revision,sha},{catalog:changed},2000);
  assert.equal(state.evidence.length,1);assert.equal(state.evidence[0].reference,'Explicit current contract evidence');
  assert.deepEqual(board(state,2000).blockers.find(b=>b.unitId==='B')?.dependencies,[{unitId:'A',requiredEvidence:kind}]);
  assert.throws(()=>claim(state,{taskId:'B'}),error=>error.code==='NO_AVAILABLE_UNIT');
  attest();assert.equal(claim(state,{taskId:'B'}).unitId,'B');
});

test('dependency scope binding survives metadata-only enabled and priority changes',()=>{
  const state=initialized([unit('A',[{key:'path:src/source.js',mode:'write'}],{reviewRequired:true}),unit('B',[{key:'path:src/dependent.js',mode:'write'}],{dependencies:[{unitId:'A',requiredEvidence:'design'}]})]);
  call(state,'/v1/evidence',{expectedRevision:state.revision,unitId:'A',kind:'design',reference:'Scope reviewed'},actor('vps','coordinator'));
  const changed=structuredClone(state.catalog);changed.units[0].enabled=false;changed.units[0].priority=99;
  applyCommand(state,actor('vps','coordinator'),'/v1/catalog',{operationId:'metadata-only',expectedRevision:state.revision,sha},{catalog:changed},2000);
  assert.equal(claim(state,{taskId:'B'}).unitId,'B');
});

test('revised contract reopens completed work while preserving the previous completion history',()=>{
  const state=initialized([unit('A',[{key:'path:src/source.js',mode:'write'}],{kind:'research'})]);const c=claim(state);
  call(state,'/v1/evidence',{expectedRevision:state.revision,unitId:'A',kind:'research_accepted',reference:'Accepted original scope'},actor('vps','coordinator'));
  call(state,`/v1/claims/${c.id}/complete`,authority(c));
  assert.throws(()=>claim(state),error=>error.code==='NO_AVAILABLE_UNIT');
  const changed=structuredClone(state.catalog);changed.units[0].acceptance=['Additional required research'];
  applyCommand(state,actor('vps','coordinator'),'/v1/catalog',{operationId:'reopen-contract',expectedRevision:state.revision,sha},{catalog:changed},2000);
  assert.equal(board(state,2000).claims[0].completionCurrent,false);
  const next=claim(state);assert.notEqual(next.id,c.id);
  assert.throws(()=>call(state,`/v1/claims/${next.id}/complete`,authority(next)),error=>error.code==='EVIDENCE_REQUIRED');
});

test('catalogue cannot invalidate a dependency contract while its dependent build is reserved',()=>{
  const state=initialized([unit('A',[{key:'path:src/source.js',mode:'write'}]),unit('B',[{key:'path:src/dependent.js',mode:'write'}],{dependencies:[{unitId:'A',requiredEvidence:'design'}]})]);
  call(state,'/v1/evidence',{expectedRevision:state.revision,unitId:'A',kind:'design',reference:'Current source contract'},actor('vps','coordinator'));
  const c=claim(state,{taskId:'B'});
  const changed=structuredClone(state.catalog);changed.units[0].acceptance=['Revised source contract'];
  assert.throws(()=>applyCommand(state,actor('vps','coordinator'),'/v1/catalog',{operationId:'invalidate-live-dependency',expectedRevision:state.revision,sha},{catalog:changed},2000),error=>error.code==='CATALOG_DEPENDENCY_CONFLICT');
  assert.deepEqual(state.catalog.units[0].acceptance,['Works']);
  call(state,`/v1/claims/${c.id}/resume`,{...authority(c),mode:'plan'});
  applyCommand(state,actor('vps','coordinator'),'/v1/catalog',{operationId:'review-updated-dependency',expectedRevision:state.revision,sha},{catalog:changed},2000);
  assert.throws(()=>call(state,`/v1/claims/${c.id}/resume`,{...authority(c),mode:'build'}),error=>error.code==='DEPENDENCIES_BLOCKED');
});

test('unbound evidence and incomplete reviewed resources cannot satisfy design dependencies',()=>{
  const state=initialized([unit('A',[{key:'path:src/source.js',mode:'write'}]),unit('B',[{key:'path:src/dependent.js',mode:'write'}],{dependencies:[{unitId:'A',requiredEvidence:'design'}]})]);
  state.evidence.push({unitId:'A',kind:'design',reference:'Legacy record without scope'});
  assert.equal(board(state,1000).evidence[0].evidenceCurrent,false);assert.throws(()=>claim(state,{taskId:'B'}),error=>error.code==='NO_AVAILABLE_UNIT');
  call(state,'/v1/evidence',{expectedRevision:state.revision,unitId:'A',kind:'design',reference:'Stamped scope'},actor('vps','coordinator'));
  state.evidence.at(-1).reviewedResources=[];
  assert.equal(board(state,1000).evidence.at(-1).evidenceCurrent,false);assert.throws(()=>claim(state,{taskId:'B'}),error=>error.code==='NO_AVAILABLE_UNIT');
});
