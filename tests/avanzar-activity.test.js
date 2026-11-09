const test=require('node:test');
const assert=require('node:assert/strict');
let api;
test.before(async()=>{api=await import('../coordination/src/activity.mjs');});
const actors={a:{actorId:'actor-a',role:'executor',slots:['vps']},b:{actorId:'actor-b',role:'executor',slots:['hermes']}};
const catalog={tasks:[{id:'REG-08',estado:'parcial'},{id:'REG-01',estado:'hecho'}]};
let n=0;
const start=(state,who='a',mode='build',extra={})=>api.applyActivity(state,actors[who],'start',{operationId:'op-'+(++n),task:'REG-08',mode,slot:who==='a'?'vps':'hermes',sessionId:'session-'+who,tool:'codex',...extra},catalog,{},1000+n);
const update=(state,r,extra={},who='a')=>api.applyActivity(state,actors[who],'update',{operationId:'op-'+(++n),id:r.id,version:r.version,sessionId:'session-'+who,status:r.mode==='plan'?'planned':'built',milestone:'implementation',next:'review',reference:'docs/superpowers/plans/example.md',...extra},catalog,{},2000+n);
test('plans finish as prepared, never reserve construction or become product done',()=>{
 const s=api.emptyActivity(),p=start(s,'a','plan').record;
 const planned=update(s,p,{milestone:'plan',next:'build'}).record;
 assert.equal(planned.status,'planned');assert.equal(start(s,'b').record.status,'active');
 assert.equal(s.records.length,2);assert.equal(catalog.tasks[0].estado,'parcial');
 assert.equal(api.publicActivities(s.records).find(r=>r.mode==='plan').status,'planned');
});
test('only one builder per task, including a second session with same identity',()=>{
 const s=api.emptyActivity();start(s);
 for(const who of ['a','b'])assert.throws(()=>start(s,who,'build',{sessionId:'another'}),{code:'TASK_IN_PROGRESS'});
 assert.equal(s.records.filter(r=>r.mode==='build').length,1);
});
test('paused, review and built preserve ownership without expiry',()=>{
 for(const status of ['paused','review','built']){
  const s=api.emptyActivity(),r=start(s).record;update(s,r,{status});
  assert.throws(()=>start(s,'b'),{code:'TASK_IN_PROGRESS'});
 }
});
test('idempotency returns original operation; altered payload is rejected',()=>{
 const s=api.emptyActivity(),r=start(s).record,op=s.operations[0];
 const again=api.applyActivity(s,actors.a,'start',op.body,catalog,{},9000);
 assert.deepEqual(again.record,r);assert.equal(s.records.length,1);
 assert.throws(()=>api.applyActivity(s,actors.a,'start',{...op.body,mode:'plan'},catalog,{},9000),{code:'IDEMPOTENCY_CONFLICT'});
});
test('another actor, session and obsolete version cannot overwrite progress',()=>{
 const s=api.emptyActivity(),r=start(s).record;
 assert.throws(()=>update(s,r,{},'b'),{code:'ACTIVITY_NOT_OWNER'});
 assert.throws(()=>update(s,r,{sessionId:'other'}),{code:'ACTIVITY_NOT_OWNER'});
 const changed=update(s,r).record;
 assert.throws(()=>update(s,r),{code:'ACTIVITY_VERSION_CHANGED'});
 assert.equal(s.records[0].version,changed.version);
});
test('handoff requires owner offer, authorized target and explicit acceptance',()=>{
 const s=api.emptyActivity(),r=start(s).record;
 const body={operationId:'offer-'+(++n),id:r.id,version:r.version,sessionId:'session-a',target:{actorId:'actor-b',slot:'hermes'}};
 assert.throws(()=>api.applyActivity(s,actors.a,'offer-handoff',body,catalog,{},3000),{code:'TARGET_FORBIDDEN'});
 const offered=api.applyActivity(s,actors.a,'offer-handoff',body,catalog,{authorizedTarget:true},3000).record;
 assert.throws(()=>update(s,offered,{},'b'),{code:'ACTIVITY_NOT_OWNER'});
 const accepted=api.applyActivity(s,actors.b,'accept-handoff',{operationId:'accept-'+(++n),id:r.id,version:offered.version,sessionId:'session-b',tool:'hermes2'},catalog,{},4000).record;
 assert.equal(accepted.actorId,actors.b.actorId);assert.equal(accepted.handoff,null);
 assert.throws(()=>update(s,accepted),{code:'ACTIVITY_NOT_OWNER'});
 assert.equal(update(s,accepted,{},'b').record.status,'built');
});
test('publication needs verified SHA and cannot turn a plan into a build',()=>{
 const s=api.emptyActivity(),r=start(s).record,sha='a'.repeat(40);
 assert.throws(()=>update(s,r,{status:'published',sha}),{code:'PUBLICATION_UNVERIFIED'});
 const result=api.applyActivity(s,actors.a,'update',{operationId:'pub-'+(++n),id:r.id,version:r.version,sessionId:'session-a',status:'published',milestone:'release',next:'done',sha,reference:'https://github.com/andresleosan/HamptonJersey/commit/'+sha},catalog,{verifiedSha:sha},4000);
 assert.equal(result.record.status,'published');assert.equal(start(s,'b').record.status,'active');
 const p=start(s,'a','plan').record;assert.throws(()=>update(s,p,{status:'built'}),{code:'INVALID_ACTIVITY_STATUS'});
});
test('a new tranche retains an explicit link to the published delivery and its remaining step',()=>{
 const s=api.emptyActivity(),r=start(s).record,sha='b'.repeat(40),reference='https://github.com/andresleosan/HamptonJersey/commit/'+sha;
 const published=api.applyActivity(s,actors.a,'update',{operationId:'published-'+(++n),id:r.id,version:1,sessionId:'session-a',status:'published',milestone:'release',next:'validate',sha,reference},catalog,{verifiedSha:sha},5000).record;
 const next=start(s,'b').record;assert.deepEqual(next.basedOn,{sha:published.sha,reference:published.reference,next:'validate'});
 assert.deepEqual(api.publicActivities([next])[0].basedOn,next.basedOn);
});
test('a terminal delivery cannot be taken over through an older handoff offer',()=>{
 const s=api.emptyActivity(),r=start(s,'a','plan').record;
 const offer=api.applyActivity(s,actors.a,'offer-handoff',{operationId:'offer-closed-'+(++n),id:r.id,version:1,sessionId:'session-a',target:{actorId:'actor-b',slot:'hermes'}},catalog,{authorizedTarget:true},5000).record;
 const closed=update(s,offer,{status:'planned',milestone:'plan',next:'build'}).record;
 assert.throws(()=>api.applyActivity(s,actors.b,'accept-handoff',{operationId:'accept-closed-'+(++n),id:r.id,version:closed.version,sessionId:'session-b',tool:'hermes2'},catalog,{},6000),{code:'ACTIVITY_CLOSED'});
});
test('a publication reference cannot claim a different commit than its verified SHA',()=>{
 const s=api.emptyActivity(),r=start(s).record,sha='a'.repeat(40);
 assert.throws(()=>api.applyActivity(s,actors.a,'update',{operationId:'wrong-ref-'+(++n),id:r.id,version:1,sessionId:'session-a',status:'published',milestone:'release',next:'done',sha,reference:'https://github.com/andresleosan/HamptonJersey/commit/'+'b'.repeat(40)},catalog,{verifiedSha:sha},5000),{code:'REFERENCE_SHA_MISMATCH'});
});
test('snapshot capacity refuses a new record without partial mutation or an unreadable client response',()=>{
 const s=api.emptyActivity(),r=start(s,'a','plan').record;
 s.records=Array.from({length:4000},(_,i)=>({...r,id:'prior-'+i,status:'planned',reference:'docs/superpowers/plans/'+'a'.repeat(240)+'.md'}));
 const revision=s.revision;assert.throws(()=>start(s,'a','plan'),{code:'ACTIVITY_CAPACITY'});
 assert.equal(s.records.length,4000);assert.equal(s.revision,revision);
});
test('strict fields reject private text, unsafe references, unknown tasks and forged authority',()=>{
 for(const extra of [{summary:'private text'},{task:'BOGUS-01'},{task:'REG-01'},{slot:'hermes'},{mode:'other'}])assert.throws(()=>start(api.emptyActivity(),'a','build',extra));
 for(const reference of ['/root/work.md','docs/../private.md','javascript:alert(1)','https://other.example/file','docs/audits/local.md','docs/roadmap/Hampton APP.md']){
  const s=api.emptyActivity(),r=start(s).record;assert.throws(()=>update(s,r,{reference}));
 }
 const s=api.emptyActivity(),r=start(s).record;assert.throws(()=>update(s,r,{milestone:'arbitrary private text'}));
 assert.throws(()=>api.applyActivity(s,{...actors.a,role:'viewer'},'start',{},catalog,{},1));
 const publicRow=api.publicActivities(s.records)[0];
 for(const key of ['actorId','sessionId','handoff','operations','id'])assert.equal(publicRow[key],undefined);
 assert.match(publicRow.team,/Codex/);assert.ok(publicRow.packageId);
});
