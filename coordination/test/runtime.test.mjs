import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
const SHA='a'.repeat(40), OTHER='b'.repeat(40), SLOTS=['vps','hermes','vscode','codex-desktop'];
const actors=Object.fromEntries(SLOTS.map(slot=>[slot,{actorId:slot,role:slot==='vps'?'coordinator':'executor',slots:[slot]}]));
const identities={...Object.fromEntries(SLOTS.map(slot=>[`service-${slot}`,actors[slot]])),'viewer@example.test':{actorId:'reader',role:'viewer',slots:[]}};
function makeCatalog({collision=false,review=false}={}) {return {schemaVersion:1,project:'hampton',slots:SLOTS.map(id=>({id,name:id,area:id})),tasks:SLOTS.map((slot,i)=>({id:`TASK-0${i+1}`,titulo:`Task ${i+1}`,estado:'pendiente',assignedSlot:slot})),units:SLOTS.map((slot,i)=>({id:`TASK-0${i+1}/build`,parentTaskId:`TASK-0${i+1}`,title:`Task ${i+1}`,preferredSlot:slot,priority:i,kind:'development',enabled:true,reviewRequired:review,dependencies:[],resources:[{key:collision?'notifications-schema':`path:src/${slot}/`,mode:'write'}],acceptance:['Works']}))};}
let directory,bundle,mf,ns,privateKey,publicJwk;let catalog=makeCatalog();let mainSha=SHA;let unavailable=false,oversizedComparison=false;let op=0;
const operation=()=>`operation-${++op}`;
const rpc=raw=>({command:async(...args)=>JSON.parse(JSON.stringify(await raw.command(...args))),getBoard:async()=>JSON.parse(JSON.stringify(await raw.getBoard()))});
const config=()=>({modules:true,script:bundle,compatibilityDate:'2026-10-01',durableObjects:{TEAM_COORDINATOR:{className:'TeamCoordinator',useSQLite:true}},resourcePersistencePath:join(directory,'state'),bindings:{ACCESS_TEAM_DOMAIN:'fixture.cloudflareaccess.com',ACCESS_AUD:'test-audience',TEAM_IDENTITIES_JSON:JSON.stringify(identities)},serviceBindings:{ASSETS:async()=>new Response('private asset')},outboundService:async request=>{
  const url=new URL(request.url);
  if(url.hostname==='fixture.cloudflareaccess.com'&&url.pathname==='/cdn-cgi/access/certs')return Response.json({keys:[publicJwk]});
  if(unavailable)return new Response('Unavailable',{status:503});
  assert.equal(url.hostname,'api.github.com');
  if(url.pathname.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:mainSha,type:'commit'}});
  if(url.pathname.endsWith('/contents/docs/roadmap/catalog.json'))return Response.json(catalog);
  if(url.pathname.includes('/compare/')) {
    assert.equal(url.search,'?per_page=1&page=2');
    return Response.json({status:url.pathname.includes(OTHER)?'diverged':'identical',merge_base_commit:{sha:SHA},
      ...(oversizedComparison?{padding:'x'.repeat(1_000_001)}:{})});
  }
  throw new Error(`Unexpected outbound fixture: ${url}`);
}});
async function token(payload={},options={}) {return new SignJWT({common_name:'service-vps',...payload}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer(options.issuer||'https://fixture.cloudflareaccess.com').setAudience(options.audience||'test-audience').setSubject('service-sub').setIssuedAt().setExpirationTime(options.expiration||'10m').sign(privateKey);}
async function http(path,{body,jwt,method=body?'POST':'GET'}={}) {const response=await mf.dispatchFetch(`https://team.example.test${path}`,{method,headers:{...(jwt?{'Cf-Access-Jwt-Assertion':jwt}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await response.json();}catch{data=null;}return {status:response.status,body:data};}
async function initialized(name,{collision=false,review=false}={}) {
  catalog=makeCatalog({collision,review});mainSha=SHA;unavailable=false;oversizedComparison=false;
  const stub=rpc(ns.get(ns.idFromName(name)));
  const result=await stub.command(actors.vps,'/v1/catalog',{operationId:operation(),expectedRevision:0,sha:SHA});
  assert.equal(result.status,200,JSON.stringify(result));return stub;
}
const claimBody=(board,slot,extra={})=>({operationId:operation(),expectedRevision:board.revision,slot,sessionId:`session-${slot}`,checkoutId:`checkout-${slot}`,hostId:'host',mode:'build',baseSha:SHA,...extra});
async function claim(stub,slot='vps',extra={}) {return stub.command(actors[slot],'/v1/claims',claimBody(await stub.getBoard(),slot,extra));}
const authority=c=>({generation:c.generation,sessionId:c.sessionId});
const mutate=(stub,c,action,body={},who=actors[c.actorId])=>stub.command(who,`/v1/claims/${c.id}/${action}`,{operationId:operation(),...authority(c),...body});
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'hampton-coordination-test-'));
  const keys=await generateKeyPair('RS256',{extractable:true});privateKey=keys.privateKey;publicJwk={...await exportJWK(keys.publicKey),kid:'fixture',alg:'RS256',use:'sig'};
  const result=await build({entryPoints:[fileURLToPath(new URL('../src/worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});bundle=result.outputFiles[0].text;
  mf=new Miniflare(convertV4MiniflareOptions(config()));ns=await mf.getDurableObjectNamespace('TEAM_COORDINATOR');
});
after(async()=>{await mf?.dispose();if(directory)await rm(directory,{recursive:true,force:true});});

test('real Workers SQLite serializes simultaneous same-revision claims and commits one reservation',async()=>{
  const stub=await initialized('concurrent');const current=await stub.getBoard();
  const results=await Promise.all(SLOTS.map(slot=>stub.command(actors[slot],'/v1/claims',claimBody(current,slot,{taskId:'TASK-01/build'}))));
  assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,3);
  assert.equal((await stub.getBoard()).claims.length,1);
});
test('four actors obtain independent compatible work using fresh revisions',async()=>{
  const stub=await initialized('four');
  const results=await Promise.all(SLOTS.map(async slot=>{for(let attempt=0;attempt<5;attempt++){const result=await claim(stub,slot);if(result.status===200)return result;assert.equal(result.body.error.code,'REVISION_CONFLICT');}throw new Error('Claim retry exhausted');}));
  assert.equal(results.filter(r=>r.status===200).length,4);
  assert.equal((await stub.getBoard()).claims.filter(c=>c.status==='active').length,4);
});
test('logical write collision prevents overlapping tasks across slots',async()=>{
  const stub=await initialized('logical',{collision:true});assert.equal((await claim(stub)).status,200);
  const result=await claim(stub,'hermes');assert.equal(result.status,409);assert.equal(result.body.error.code,'NO_AVAILABLE_UNIT');
});
test('idempotency returns exact successful response and rejects changed payload',async()=>{
  const stub=await initialized('idempotency');const body=claimBody(await stub.getBoard(),'vps');
  const first=await stub.command(actors.vps,'/v1/claims',body);
  const retry=await stub.command(actors.vps,'/v1/claims',body);assert.deepEqual(retry,first);
  assert.equal((await stub.command(actors.vps,'/v1/claims',{...body,mode:'plan'})).body.error.code,'IDEMPOTENCY_CONFLICT');
  const c=first.body.claim;await mutate(stub,c,'abandon',{clean:true});
  assert.equal((await stub.command(actors.vps,'/v1/claims',body)).body.error.code,'GENERATION_REVOKED');
});
test('review attestation unlocks build; integrated evidence does not impersonate activated',async()=>{
  const stub=await initialized('review',{review:true});assert.equal((await claim(stub)).status,409);
  const before=await stub.getBoard();
  assert.equal((await claim(stub,'vps',{mode:'plan'})).body.error.code,'PLANNING_IS_UNRESERVED');
  const after=await stub.getBoard();assert.deepEqual(after.claims,before.claims);assert.equal(after.revision,before.revision);
  const unitId=catalog.units[0].id;
  const evidence=await stub.command(actors.vps,'/v1/evidence',{operationId:operation(),expectedRevision:before.revision,unitId,kind:'design',reference:'Reviewed without any reservation',resources:catalog.units[0].resources});assert.equal(evidence.status,200);
  assert.equal((await stub.getBoard()).claims.length,0);
  assert.equal((await claim(stub)).body.claim.mode,'build');
});
test('coordinator handoff validates target and revokes previous-generation idempotency',async()=>{
  const stub=await initialized('handoff');const c=(await claim(stub)).body.claim;
  const renew={operationId:operation(),...authority(c)};assert.equal((await stub.command(actors.vps,`/v1/claims/${c.id}/renew`,renew)).status,200);
  const target={actorId:'hermes',slot:'hermes',sessionId:'new-session',checkoutId:'new-checkout',hostId:'other-host'};
  assert.equal((await mutate(stub,c,'handoff',{target:{...target,actorId:'unknown'},evidence:'Private transfer'})).body.error.code,'TARGET_NOT_AUTHORIZED');
  const handoff=await mutate(stub,c,'handoff',{target,evidence:'Private transfer verified'});assert.equal(handoff.status,200);assert.equal(handoff.body.claim.generation,2);
  assert.equal((await stub.command(actors.vps,`/v1/claims/${c.id}/renew`,renew)).status,403);
  assert.equal((await mutate(stub,handoff.body.claim,'resume',{},actors.hermes)).status,200);
});
test('publication serialized, uncertain retained, canonical catalogue import precedes release',async()=>{
  const stub=await initialized('publication');const c=(await claim(stub)).body.claim;
  await mutate(stub,c,'submit',{headSha:SHA,changedPaths:['src/vps/a.js'],evidence:'Tests pass'});
  const releaseBody={operationId:operation(),claimId:c.id,...authority(c),sha:SHA};
  assert.equal((await stub.command(actors.vps,'/v1/release/acquire',releaseBody)).status,200);
  const h=(await claim(stub,'hermes')).body.claim;await mutate(stub,h,'submit',{headSha:SHA,changedPaths:['src/hermes/b.js'],evidence:'Tests pass'});
  assert.equal((await stub.command(actors.hermes,'/v1/release/acquire',{operationId:operation(),claimId:h.id,...authority(h),sha:SHA})).body.error.code,'RELEASE_HELD');
  const finish=body=>stub.command(actors.vps,'/v1/release/finish',{operationId:operation(),claimId:c.id,...authority(c),sha:SHA,evidence:'Remote result',...body});
  assert.equal((await finish({outcome:'uncertain'})).body.release.status,'uncertain');
  unavailable=true;assert.equal((await finish({outcome:'published'})).body.synchronizationPending,true);assert.equal((await stub.getBoard()).release.status,'synchronization_pending');assert.equal((await claim(stub,'vscode')).body.error.code,'CATALOG_SYNC_PENDING');unavailable=false;
  assert.equal((await finish({outcome:'published'})).body.release,null);
  assert.equal((await stub.getBoard()).claims.find(x=>x.id===c.id).status,'submitted');
  const ev=await stub.command(actors.vps,'/v1/evidence',{operationId:operation(),expectedRevision:(await stub.getBoard()).revision,unitId:c.unitId,kind:'integrated',sha:SHA,reference:'Canonical commit verified'});assert.equal(ev.status,200);
  const completed=await mutate(stub,c,'complete');assert.equal(completed.status,200);assert.equal(completed.body.claim.status,'completed');assert.deepEqual(completed.body.claim.resources,[]);
  assert.equal((await stub.getBoard()).evidence.some(e=>e.kind==='activated'),false);
});
test('arbitrary commit evidence and incompatible live catalogue update fail closed',async()=>{
  const stub=await initialized('canonical');const c=(await claim(stub)).body.claim;
  const rejected=await stub.command(actors.vps,'/v1/evidence',{operationId:operation(),expectedRevision:(await stub.getBoard()).revision,unitId:c.unitId,kind:'integrated',sha:OTHER,reference:'Unrelated commit'});assert.equal(rejected.status,409);assert.equal(rejected.body.error.code,'COMMIT_NOT_ON_MAIN');
  catalog.units[0].resources.push({key:'shared-styles',mode:'write'});
  const imported=await stub.command(actors.vps,'/v1/catalog',{operationId:operation(),expectedRevision:(await stub.getBoard()).revision,sha:SHA});assert.equal(imported.body.error.code,'CATALOG_CLAIM_CONFLICT');
});
test('oversized integration proof preserves state and the exact retry records evidence once',async()=>{
  const stub=await initialized('bounded-comparison-retry');const before=await stub.getBoard();
  const body={operationId:operation(),expectedRevision:before.revision,unitId:catalog.units[0].id,kind:'integrated',sha:SHA,reference:'Published ancestry'};
  oversizedComparison=true;
  const rejected=await stub.command(actors.vps,'/v1/evidence',body);
  assert.equal(rejected.status,503);assert.equal(rejected.body.error.code,'CANONICAL_UNAVAILABLE');
  const failed=await stub.getBoard();assert.equal(failed.revision,before.revision);assert.deepEqual(failed.evidence,before.evidence);
  oversizedComparison=false;
  const accepted=await stub.command(actors.vps,'/v1/evidence',body);assert.equal(accepted.status,200);
  assert.deepEqual(await stub.command(actors.vps,'/v1/evidence',body),accepted);
  const after=await stub.getBoard();assert.equal(after.revision,before.revision+1);assert.equal(after.evidence.length,before.evidence.length+1);
});
test('JWT verifies signature, issuer, audience, expiry; viewers cannot mutate; assets require auth',async()=>{
  assert.equal((await http('/v1/board')).status,401);
  assert.equal((await http('/')).status,401);
  assert.equal((await http('/v1/board',{jwt:'fake'})).status,401);
  for(const options of [{issuer:'https://wrong.cloudflareaccess.com'},{audience:'wrong'},{expiration:'-1m'}])assert.equal((await http('/v1/board',{jwt:await token({},options)})).status,401);
  const jwt=await token();assert.equal((await http('/v1/board',{jwt})).status,200);
  const viewer=await token({common_name:undefined,email:'viewer@example.test'});
  assert.equal((await http('/v1/board',{jwt:viewer})).status,200);
  assert.equal((await http('/v1/claims',{jwt:viewer,body:{operationId:operation()}})).status,403);
  assert.equal((await http('/v1/no-such-api',{jwt})).status,404);
  const asset=await mf.dispatchFetch('https://team.example.test/',{headers:{'Cf-Access-Jwt-Assertion':jwt}});assert.equal(asset.status,200);assert.equal(await asset.text(),'private asset');assert.equal(asset.headers.get('cache-control'),'no-store');
});
test('SQLite state and idempotency survive runtime restart',async()=>{
  const stub=await initialized('persist');const body=claimBody(await stub.getBoard(),'vps');const first=await stub.command(actors.vps,'/v1/claims',body);
  await mf.dispose();mf=new Miniflare(convertV4MiniflareOptions(config()));ns=await mf.getDurableObjectNamespace('TEAM_COORDINATOR');
  const restored=rpc(ns.get(ns.idFromName('persist')));const snapshot=await restored.getBoard();assert.equal(snapshot.claims[0].id,first.body.claim.id);
  assert.deepEqual(await restored.command(actors.vps,'/v1/claims',body),first);
});

test('concurrent additive scope requests cannot acquire the same logical writer',async()=>{
  const stub=await initialized('scope-race');const v=(await claim(stub)).body.claim;const h=(await claim(stub,'hermes')).body.claim;
  const results=await Promise.all([v,h].map(c=>mutate(stub,c,'scope',{resources:[{key:'migration-sequence',mode:'write'}]})));
  assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.body.error?.code==='RESOURCE_CONFLICT').length,1);
  assert.equal((await stub.getBoard()).claims.filter(c=>c.resources.some(r=>r.key==='migration-sequence')).length,1);
});

test('missing auth configuration is fail closed on API and private assets',async()=>{
  const options=config();options.bindings.TEAM_IDENTITIES_JSON='';
  const isolated=new Miniflare(convertV4MiniflareOptions({...options,resourcePersistencePath:join(directory,'unconfigured')}));
  try {for(const path of ['/v1/board','/']){const response=await isolated.dispatchFetch(`https://team.example.test${path}`);assert.equal(response.status,503);assert.equal((await response.json()).error.code,'AUTH_CONFIGURATION');}}
  finally{await isolated.dispose();}
});

test('final integrated SHA and disable-only catalogue synchronize under the same publication turn',async()=>{
  const stub=await initialized('final-publication');const c=(await claim(stub)).body.claim;
  await mutate(stub,c,'submit',{headSha:SHA,changedPaths:['src/vps/a.js'],evidence:'Provisional tests'});
  await stub.command(actors.vps,'/v1/release/acquire',{operationId:operation(),claimId:c.id,...authority(c),sha:SHA});
  const finalSha='c'.repeat(40);
  assert.equal((await mutate(stub,c,'submit',{headSha:finalSha,changedPaths:['src/vps/a.js'],evidence:'Final integrated tests'})).status,200);
  assert.equal((await stub.command(actors.vps,'/v1/release/renew',{operationId:operation(),claimId:c.id,...authority(c),sha:finalSha})).body.release.sha,finalSha);
  mainSha=finalSha;catalog.units[0].enabled=false;catalog.tasks[0].estado='hecho';
  const finished=await stub.command(actors.vps,'/v1/release/finish',{operationId:operation(),claimId:c.id,...authority(c),sha:finalSha,outcome:'published',evidence:'Authorized exact SHA on remote'});
  assert.equal(finished.status,200);assert.equal(finished.body.release,null);assert.equal((await stub.getBoard()).catalogSha,finalSha);
  assert.equal((await stub.getBoard()).evidence.some(e=>e.unitId===c.unitId&&e.kind==='integrated'&&e.sha===finalSha&&e.verification==='canonical-main'),true);
  const complete=await mutate(stub,c,'complete');assert.equal(complete.status,200);assert.equal(complete.body.claim.status,'completed');assert.deepEqual(complete.body.claim.resources,[]);
  assert.equal((await stub.getBoard()).evidence.some(e=>e.kind==='activated'),false);
});

test('idempotent replay cannot return obsolete build authority after mode changes',async()=>{
  const stub=await initialized('superseded');const c=(await claim(stub)).body.claim;
  const body={operationId:operation(),...authority(c),mode:'build'};
  assert.equal((await stub.command(actors.vps,`/v1/claims/${c.id}/resume`,body)).status,200);
  assert.equal((await mutate(stub,c,'resume',{mode:'plan'})).body.error.code,'PLANNING_IS_UNRESERVED');
  assert.equal((await mutate(stub,c,'pause',{evidence:'Saved build checkpoint',pendingWork:false})).status,200);
  const replay=await stub.command(actors.vps,`/v1/claims/${c.id}/resume`,body);
  assert.equal(replay.status,409);assert.equal(replay.body.error.code,'OPERATION_SUPERSEDED');
});

test('canonical source contract update invalidates historical dependency design before claim or resume',async()=>{
  const stub=await initialized('dependency-proof-freshness');
  catalog.units[0].reviewRequired=true;
  catalog.units[1].dependencies=[{unitId:catalog.units[0].id,requiredEvidence:'design'}];
  const update=async()=>stub.command(actors.vps,'/v1/catalog',{operationId:operation(),expectedRevision:(await stub.getBoard()).revision,sha:mainSha});
  assert.equal((await update()).status,200);
  const attest=async()=>stub.command(actors.vps,'/v1/evidence',{operationId:operation(),expectedRevision:(await stub.getBoard()).revision,unitId:catalog.units[0].id,kind:'design',reference:'Coordinator reviewed source contract'});
  assert.equal((await attest()).status,200);
  const earlier=(await claim(stub,'hermes',{taskId:catalog.units[1].id})).body.claim;
  await mutate(stub,earlier,'abandon',{clean:true});
  catalog.units[0].resources=[{key:'path:src/revised-vps/',mode:'write'}];mainSha='d'.repeat(40);
  assert.equal((await update()).status,200);
  const snapshot=await stub.getBoard();assert.equal(snapshot.evidence[0].evidenceCurrent,false);
  assert.equal(snapshot.blockers.find(b=>b.unitId===catalog.units[0].id).reasons.includes('review_required'),true);
  assert.deepEqual(snapshot.blockers.find(b=>b.unitId===catalog.units[1].id).dependencies,[{unitId:catalog.units[0].id,requiredEvidence:'design'}]);
  assert.equal((await claim(stub,'hermes',{taskId:catalog.units[1].id})).body.error.code,'NO_AVAILABLE_UNIT');
  assert.equal((await claim(stub,'hermes',{taskId:catalog.units[1].id,mode:'plan'})).body.error.code,'PLANNING_IS_UNRESERVED');
  assert.equal((await attest()).status,200);
  assert.equal((await claim(stub,'hermes',{taskId:catalog.units[1].id})).body.claim.mode,'build');
  assert.equal((await stub.getBoard()).evidence[0].evidenceCurrent,false);
  assert.equal((await stub.getBoard()).evidence.at(-1).evidenceCurrent,true);
});
