const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let stateApi,resourcesConflict;
test.before(async()=>{
  stateApi=await import('../coordination/src/state.mjs');
  ({resourcesConflict}=await import('../coordination/catalog.mjs'));
});
function initial(){return {...stateApi.emptyState(),catalog:JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/roadmap/catalog.json'))),catalogSha:'a'.repeat(40),revision:1};}
function reviewedFixture(){const state=initial();for(const u of state.catalog.units){u.reviewRequired=false;u.dependencies=[];}return state;}
function reserve(state,slot,extra={}){
  return stateApi.applyCommand(state,{actorId:slot,role:'executor',slots:[slot]},'/v1/claims',{
    operationId:`operation-${slot}-${state.revision}`,expectedRevision:state.revision,slot,
    sessionId:`session-${slot}`,checkoutId:`checkout-${slot}`,hostId:'test-host',mode:'build',baseSha:'a'.repeat(40),...extra
  },{},1000).claim;
}
test('the real 250-point allocation can reserve compatible build work after review and dependency gates for all four slots',()=>{
  const state=reviewedFixture(),claims=[];
  for(const slot of ['vps','hermes','vscode','codex-desktop'])claims.push(reserve(state,slot));
  assert.equal(new Set(claims.map(c=>c.unitId)).size,4);
  for(let i=0;i<claims.length;i++)for(let j=i+1;j<claims.length;j++){
    assert.equal(claims[i].resources.some(a=>claims[j].resources.some(b=>resourcesConflict(a,b))),false,
      `Conflicting catalogue reservations: ${claims[i].unitId}, ${claims[j].unitId}`);
  }
  const view=stateApi.board(state,1000);
  assert.equal(view.tasks.length,250);assert.equal(view.claims.length,4);
  assert.equal(view.units.length,250);
});
test('Hermes second phone cannot create a second active worker or reuse another slot',()=>{
  const state=reviewedFixture();reserve(state,'hermes');
  assert.throws(()=>reserve(state,'hermes',{sessionId:'other-phone',checkoutId:'other-checkout'}));
  assert.throws(()=>stateApi.applyCommand(state,{actorId:'hermes',role:'executor',slots:['hermes']},'/v1/claims',{
    operationId:'forged-slot',expectedRevision:state.revision,slot:'vps',sessionId:'other-phone',checkoutId:'other-checkout',hostId:'test-host',mode:'build',baseSha:'a'.repeat(40)
  },{},1000+16*60*1000));
});
test('a lost build client retains its real catalogue resources and cannot resume an expired lease',()=>{
  const state=reviewedFixture(),c=reserve(state,'vps');
  const taskId=state.catalog.units.find(u=>u.id===c.unitId).parentTaskId;
  assert.equal(stateApi.board(state,1000+16*60*1000).claims[0].status,'stale');
  assert.throws(()=>reserve(state,'vscode',{taskId}));
  assert.throws(()=>stateApi.applyCommand(state,{actorId:'vps',role:'executor',slots:['vps']},`/v1/claims/${c.id}/resume`,{
    operationId:'resume-expired-build',generation:c.generation,sessionId:c.sessionId,mode:'build'
  },{},1000+16*60*1000));
});
