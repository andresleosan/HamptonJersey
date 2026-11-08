import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
const SHA='a'.repeat(40),slots=['vps','hermes','vscode','codex-desktop'];
test('public Worker reads the SAME private SQLite object; authenticated completion appears next fetch',async()=>{
 const entries=['public-worker.mjs','worker.mjs'];const bundles=await Promise.all(entries.map(file=>build({entryPoints:[fileURLToPath(new URL('../src/'+file,import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']})));
 const catalogue={schemaVersion:1,project:'hampton',slots:slots.map((id,i)=>({id,name:'Lista '+(i+1),area:'Test',capacity:2})),tasks:[{id:'PUB-01',titulo:'Public test task',estado:'parcial',assignedSlot:'vps'}],units:[{id:'PUB-01',parentTaskId:'PUB-01',title:'Test task',preferredSlot:'vps',priority:1,kind:'research',enabled:true,reviewRequired:false,dependencies:[],resources:[{key:'task:public-test',mode:'write'}],acceptance:['Accepted test research']}]};
 const owner={actorId:'operator',role:'coordinator',slots};
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'public-view',modules:true,script:bundles[0].outputFiles[0].text,compatibilityDate:'2026-10-01',durableObjects:{BOARD_SOURCE:{className:'TeamCoordinator',scriptName:'private-coordinator'}},serviceBindings:{ASSETS:async()=>new Response('public asset')}},{name:'private-coordinator',modules:true,script:bundles[1].outputFiles[0].text,compatibilityDate:'2026-10-01',durableObjects:{TEAM_COORDINATOR:{className:'TeamCoordinator',useSQLite:true}},bindings:{ACCESS_TEAM_DOMAIN:'fixture.cloudflareaccess.com',ACCESS_AUD:'test',TEAM_IDENTITIES_JSON:JSON.stringify({service:owner})},outboundService:async request=>new URL(request.url).pathname.endsWith('/git/ref/heads/main')?Response.json({object:{sha:SHA}}):Response.json(catalogue)}]}));
 try{
  const ns=await mf.getDurableObjectNamespace('TEAM_COORDINATOR','private-coordinator'),raw=ns.getByName('hampton');let op=0;
  const command=async(path,body)=>JSON.parse(JSON.stringify(await raw.command(owner,path,{operationId:'public-test-'+(++op),...body})));
  const imported=await command('/v1/catalog',{expectedRevision:0,sha:SHA});assert.equal(imported.status,200,JSON.stringify(imported));
  const fetchBoard=async()=>{const r=await mf.dispatchFetch('https://public.example/v1/board');assert.equal(r.status,200);return r.json();};
  assert.equal((await fetchBoard()).tasks[0].activity,'unreserved');
  const claim=await command('/v1/claims',{expectedRevision:1,slot:'vps',sessionId:'PRIVATE_SENTINEL',checkoutId:'checkout-test',hostId:'host-test',mode:'build',baseSha:SHA});assert.equal(claim.status,200);const c=claim.body.claim;
  await new Promise(resolve=>setTimeout(resolve,5100));const running=await fetchBoard();assert.equal(running.tasks[0].activity,'active');assert.equal(running.lists[0].activeCount,1);assert.ok(!JSON.stringify(running).includes('PRIVATE_SENTINEL'));
  const privateWorker=await mf.getWorker('private-coordinator');assert.equal((await privateWorker.fetch('https://private.example/v1/board')).status,401);
  assert.equal((await mf.dispatchFetch('https://public.example/v1/claims',{method:'POST'})).status,405);
  assert.equal((await command('/v1/evidence',{expectedRevision:(await raw.getBoard()).revision,unitId:'PUB-01',kind:'research_accepted',reference:'Trusted synthetic acceptance'})).status,200);
  assert.equal((await command('/v1/claims/'+c.id+'/complete',{generation:c.generation,sessionId:c.sessionId})).status,200);
  await new Promise(resolve=>setTimeout(resolve,5100));const closed=await fetchBoard();assert.equal(closed.tasks[0].activity,'completed');assert.equal(closed.lists[0].activeCount,0);assert.ok(closed.revision>running.revision);
  catalogue.units[0].enabled=false;catalogue.tasks[0].estado='hecho';assert.equal((await command('/v1/catalog',{expectedRevision:(await raw.getBoard()).revision,sha:SHA})).status,200);await new Promise(resolve=>setTimeout(resolve,5100));const published=await fetchBoard();assert.equal(published.tasks[0].state,'hecho');assert.equal(published.tasks[0].activity,'completed');
 }finally{await mf.dispose();}
});
