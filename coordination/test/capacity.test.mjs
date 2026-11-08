import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const SHA='a'.repeat(40),SLOTS=['vps','hermes','vscode','codex-desktop'];
const identities=Object.fromEntries(['vps','hermes-1','hermes-2','hermes-3'].map(id=>[id,{actorId:id,role:id==='vps'?'coordinator':'executor',slots:[id==='vps'?'vps':'hermes']} ]));
const actor=id=>identities[id];
const snapshot=value=>JSON.parse(JSON.stringify(value));
const rpc=raw=>({command:async(...args)=>snapshot(await raw.command(...args)),getBoard:async()=>snapshot(await raw.getBoard())});
let mf,namespace,directory,bundle,canonical,sequence=0;
const operation=()=>`capacity-${++sequence}`;
function catalogue({capacity=2,shared=false,legacy=false}={}) {
  const units=Array.from({length:4},(_,i)=>({id:`CAP-0${i+1}`,parentTaskId:`CAP-0${i+1}`,title:`Unit ${i+1}`,preferredSlot:i<3?'hermes':'vps',priority:i,kind:'development',enabled:true,reviewRequired:false,dependencies:[],resources:[{key:shared&&i<3?'notifications-schema':`task:capacity-${i}`,mode:'write'}],acceptance:['Independent verified work']}));
  return {schemaVersion:1,project:'hampton',slots:SLOTS.map(id=>({id,name:id,area:id,...(id==='hermes'&&!legacy?{capacity}:{})})),tasks:units.map(u=>({id:u.parentTaskId,titulo:u.title,estado:'pendiente',assignedSlot:u.preferredSlot})),units};
}
function options() {return convertV4MiniflareOptions({modules:true,script:bundle,compatibilityDate:'2026-10-01',resourcePersistencePath:join(directory,'sqlite'),durableObjects:{TEAM_COORDINATOR:{className:'TeamCoordinator',useSQLite:true}},bindings:{TEAM_IDENTITIES_JSON:JSON.stringify(identities)},outboundService:async request=>{
  const url=new URL(request.url);assert.equal(url.hostname,'api.github.com');
  if(url.pathname.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:SHA,type:'commit'}});
  if(url.pathname.endsWith('/contents/docs/roadmap/catalog.json'))return Response.json(canonical);
  throw new Error('Unexpected outbound fixture request');
}});}
async function initialized(name,settings={}) {
  canonical=catalogue(settings);const stub=rpc(namespace.get(namespace.idFromName(name)));
  const imported=await stub.command(actor('vps'),'/v1/catalog',{operationId:operation(),expectedRevision:0,sha:SHA});assert.equal(imported.status,200);return stub;
}
async function claim(stub,id,extra={}) {
  for(let attempt=0;attempt<5;attempt++){
    const b=await stub.getBoard();const body={operationId:operation(),expectedRevision:b.revision,slot:actor(id).slots[0],sessionId:`session-${id}`,checkoutId:`checkout-${id}`,hostId:`host-${id}`,mode:'build',baseSha:SHA,...extra};
    const result=await stub.command(actor(id),'/v1/claims',body);if(result.body.error?.code==='REVISION_CONFLICT')continue;return result;
  }
  throw new Error('Fresh revision retry exhausted');
}
const authority=claim=>({generation:claim.generation,sessionId:claim.sessionId});
const target=id=>({actorId:id,slot:'hermes',sessionId:`session-${id}`,checkoutId:`checkout-${id}`,hostId:`host-${id}`});
async function handoff(stub,claim,id) {return stub.command(actor('vps'),`/v1/claims/${claim.id}/handoff`,{operationId:operation(),...authority(claim),target:target(id),evidence:'Saved work and destination explicitly verified'});}
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'hampton-hermes-capacity-'));
  const built=await build({entryPoints:[fileURLToPath(new URL('../src/worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});bundle=built.outputFiles[0].text;
  mf=new Miniflare(options());namespace=await mf.getDurableObjectNamespace('TEAM_COORDINATOR');
});
after(async()=>{await mf?.dispose();if(directory)await rm(directory,{recursive:true,force:true});});

test('Workers SQLite grants concurrent Hermes actors different units and refuses a third actor',async()=>{
  const stub=await initialized('hermes-concurrent');const [first,second]=await Promise.all(['hermes-1','hermes-2'].map(id=>claim(stub,id)));
  assert.equal(first.status,200);assert.equal(second.status,200);assert.notEqual(first.body.claim.unitId,second.body.claim.unitId);
  assert.equal((await claim(stub,'hermes-3')).body.error.code,'CHECKOUT_OCCUPIED');
  const b=await stub.getBoard();assert.equal(b.slots.length,4);assert.equal(b.claims.filter(c=>c.slot==='hermes').length,2);
});

test('Workers SQLite grants a contested unit exactly once even with two Hermes places',async()=>{
  const stub=await initialized('hermes-same-unit');const results=await Promise.all(['hermes-1','hermes-2'].map(id=>claim(stub,id,{taskId:'CAP-01'})));
  assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.body.error?.code==='NO_AVAILABLE_UNIT').length,1);
  assert.equal((await stub.getBoard()).claims.length,1);
});

test('Workers SQLite preserves logical resource exclusion between separate Hermes actors',async()=>{
  const stub=await initialized('hermes-resources',{shared:true});assert.equal((await claim(stub,'hermes-1')).status,200);
  assert.equal((await claim(stub,'hermes-2',{taskId:'CAP-02'})).body.error.code,'NO_AVAILABLE_UNIT');
});

test('Workers SQLite keeps one claim per actor, session and checkout while capacity remains free',async()=>{
  const stub=await initialized('hermes-identity');const first=await claim(stub,'hermes-1');assert.equal(first.status,200);
  assert.equal((await claim(stub,'hermes-1',{sessionId:'different-session',checkoutId:'different-checkout'})).body.error.code,'CHECKOUT_OCCUPIED');
  assert.equal((await claim(stub,'hermes-2',{sessionId:first.body.claim.sessionId})).body.error.code,'CHECKOUT_OCCUPIED');
  assert.equal((await claim(stub,'hermes-2',{checkoutId:first.body.claim.checkoutId})).body.error.code,'CHECKOUT_OCCUPIED');
  assert.equal((await claim(stub,'hermes-2')).status,200);
});

test('Workers SQLite paused and submitted Hermes work continue consuming both places',async()=>{
  const stub=await initialized('hermes-parked');const first=(await claim(stub,'hermes-1')).body.claim;const second=(await claim(stub,'hermes-2')).body.claim;
  assert.equal((await stub.command(actor('hermes-1'),`/v1/claims/${first.id}/pause`,{operationId:operation(),...authority(first),pendingWork:true,evidence:'Private pending work preserved'})).status,200);
  assert.equal((await stub.command(actor('hermes-2'),`/v1/claims/${second.id}/submit`,{operationId:operation(),...authority(second),headSha:SHA,changedPaths:[],evidence:'Independent submission verified'})).status,200);
  assert.equal((await claim(stub,'hermes-3')).body.error.code,'CHECKOUT_OCCUPIED');
});

test('Workers SQLite handoff refuses full or occupied targets without revoking source, but permits replacing its own place',async()=>{
  const stub=await initialized('hermes-transfer');const first=(await claim(stub,'hermes-1')).body.claim;const second=(await claim(stub,'hermes-2')).body.claim;const source=(await claim(stub,'vps')).body.claim;
  assert.equal((await handoff(stub,source,'hermes-3')).body.error.code,'CHECKOUT_OCCUPIED');
  assert.equal((await handoff(stub,first,'hermes-2')).body.error.code,'CHECKOUT_OCCUPIED');
  let b=await stub.getBoard();assert.equal(b.claims.find(c=>c.id===source.id).generation,1);assert.equal(b.claims.find(c=>c.id===first.id).generation,1);
  const moved=await handoff(stub,first,'hermes-3');assert.equal(moved.status,200);assert.equal(moved.body.claim.generation,2);assert.equal(moved.body.claim.actorId,'hermes-3');
  b=await stub.getBoard();assert.equal(b.claims.find(c=>c.id===second.id).generation,1);
});

test('Workers SQLite catalogue capacity decreases reject atomically; omitted legacy capacity stays one',async()=>{
  const stub=await initialized('hermes-reduce');await claim(stub,'hermes-1');await claim(stub,'hermes-2');const prior=await stub.getBoard();
  canonical.slots.find(s=>s.id==='hermes').capacity=1;
  const rejected=await stub.command(actor('vps'),'/v1/catalog',{operationId:operation(),expectedRevision:prior.revision,sha:SHA});assert.equal(rejected.body.error.code,'CATALOG_CAPACITY_CONFLICT');
  const after=await stub.getBoard();assert.equal(after.revision,prior.revision);assert.equal(after.claims.length,2);assert.equal(after.slots.find(s=>s.id==='hermes').capacity,2);
  const legacy=await initialized('hermes-legacy',{legacy:true});assert.equal((await claim(legacy,'hermes-1')).status,200);assert.equal((await claim(legacy,'hermes-2')).body.error.code,'CHECKOUT_OCCUPIED');
});

test('Workers SQLite preserves two Hermes reservations and generations after full runtime restart',async()=>{
  const stub=await initialized('hermes-restart');const first=(await claim(stub,'hermes-1')).body.claim;const second=(await claim(stub,'hermes-2')).body.claim;
  await mf.dispose();mf=new Miniflare(options());namespace=await mf.getDurableObjectNamespace('TEAM_COORDINATOR');
  const restored=rpc(namespace.get(namespace.idFromName('hermes-restart')));const b=await restored.getBoard();
  assert.deepEqual(b.claims.map(c=>[c.id,c.actorId,c.generation]),[[first.id,'hermes-1',1],[second.id,'hermes-2',1]]);
  assert.equal((await claim(restored,'hermes-3')).body.error.code,'CHECKOUT_OCCUPIED');
});

test('Workers SQLite imports a capacity increase without replacing an existing actor or generation',async()=>{
  const stub=await initialized('hermes-increase',{legacy:true});const first=(await claim(stub,'hermes-1')).body.claim;
  Object.assign(canonical.slots.find(s=>s.id==='hermes'),{capacity:2,name:'Hermes 1 y Hermes 2'});
  const imported=await stub.command(actor('vps'),'/v1/catalog',{operationId:operation(),expectedRevision:(await stub.getBoard()).revision,sha:SHA});assert.equal(imported.status,200);
  assert.deepEqual((await stub.getBoard()).claims[0],first);assert.equal((await claim(stub,'hermes-2')).status,200);
});

test('Workers SQLite still grants exactly one publication turn to two Hermes submissions',async()=>{
  const stub=await initialized('hermes-publication');const claims=await Promise.all(['hermes-1','hermes-2'].map(async id=>({id,claim:(await claim(stub,id)).body.claim})));
  for(const item of claims)assert.equal((await stub.command(actor(item.id),`/v1/claims/${item.claim.id}/submit`,{operationId:operation(),...authority(item.claim),headSha:SHA,changedPaths:[],evidence:'Submitted independent work'})).status,200);
  const results=await Promise.all(claims.map(item=>stub.command(actor(item.id),'/v1/release/acquire',{operationId:operation(),claimId:item.claim.id,...authority(item.claim),sha:SHA})));
  assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.body.error?.code==='RELEASE_HELD').length,1);
});
