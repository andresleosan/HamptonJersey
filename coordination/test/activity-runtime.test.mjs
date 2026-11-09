import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
const slots=['vps','hermes','vscode','codex-desktop'];
test('real SQLite serializes two builders, retains a plan, and publishes only safe activity',async()=>{
 const bundles=await Promise.all(['public-worker.mjs','worker.mjs'].map(file=>build({entryPoints:[fileURLToPath(new URL('../src/'+file,import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']})));
 const owner={actorId:'runtime-owner',role:'coordinator',slots},other={actorId:'runtime-other',role:'executor',slots:['hermes']};
 const catalogue={schemaVersion:1,project:'hampton',slots:slots.map((id,i)=>({id,name:'Lista '+(i+1),area:'Test',capacity:2})),tasks:[{id:'REG-08',titulo:'Test registration',estado:'parcial',assignedSlot:'vps',hecho:'Existing work',falta:'Verify',nextStep:'Review',dependencies:[]}],units:[{id:'REG-08',parentTaskId:'REG-08',title:'Test registration',preferredSlot:'vps',priority:1,kind:'development',enabled:true,reviewRequired:false,dependencies:[],resources:[{key:'registration-ui',mode:'write'}],acceptance:['Verified registration']}]};
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'public',modules:true,script:bundles[0].outputFiles[0].text,compatibilityDate:'2026-10-01',durableObjects:{BOARD_SOURCE:{className:'TeamCoordinator',scriptName:'private'}},serviceBindings:{ASSETS:async()=>new Response('asset')}},{name:'private',modules:true,script:bundles[1].outputFiles[0].text,compatibilityDate:'2026-10-01',durableObjects:{TEAM_COORDINATOR:{className:'TeamCoordinator',useSQLite:true}},bindings:{ACCESS_TEAM_DOMAIN:'fixture.cloudflareaccess.com',ACCESS_AUD:'test',TEAM_IDENTITIES_JSON:JSON.stringify({service:owner,second:other})},outboundService:async request=>new URL(request.url).pathname.endsWith('/git/ref/heads/main')?Response.json({object:{sha:'a'.repeat(40)}}):Response.json(catalogue)}]}));
 try {
  const ns=await mf.getDurableObjectNamespace('TEAM_COORDINATOR','private'),raw=ns.get(ns.idFromName('hampton'));
  // Activity must work on a fresh object without importing the historical catalogue.
  const old=JSON.stringify((await raw.getBoard()).claims);
  const start=(actor,operationId,mode='build')=>raw.activity(actor,'start',{operationId,sessionId:'session-'+actor.actorId,task:'REG-08',mode,tool:'codex',slot:actor===owner?'vps':'hermes'});
  const plan=await start(owner,'plan','plan');assert.equal(plan.status,200);
  const planned=await raw.activity(owner,'update',{operationId:'planned',sessionId:'session-'+owner.actorId,id:plan.body.record.id,version:1,status:'planned',milestone:'plan',next:'build',reference:'docs/superpowers/plans/test.md'});assert.equal(planned.status,200);
  const results=await Promise.all([start(owner,'build1'),start(other,'build2')]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const response=await mf.dispatchFetch('https://public.example/v1/board');assert.equal(response.status,200);
  const value=await response.json(),task=value.tasks.find(t=>t.code==='REG-08');assert.equal(value.tasks.length,250);assert.equal(task.state,'parcial');assert.equal(task.activity,'active');assert.equal(task.work.plans[0].status,'planned');assert.ok(task.work.build.team);
  assert.equal(JSON.stringify(value).includes('runtime-owner'),false);assert.equal(JSON.stringify(value).includes('session-'),false);
  assert.equal(JSON.stringify((await raw.getBoard()).claims),old);
  const proof=await raw.getActivity(owner,'plan');assert.equal(proof.operation.recordId,plan.body.record.id);assert.equal(proof.operation.action,'start');
  assert.equal((await raw.getActivity(other,'plan')).operation,null);
  const privateWorker=await mf.getWorker('private');assert.equal((await privateWorker.fetch('https://private.example/v1/activity/start',{method:'POST'})).status,401);
  assert.equal((await mf.dispatchFetch('https://public.example/v1/activity/start',{method:'POST'})).status,405);
 }finally{await mf.dispose();}
});
