import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {publicBoard} from '../coordination/src/public-board.mjs';
import worker from '../coordination/src/public-worker.mjs';
const require=createRequire(import.meta.url),ui=require('../docs/roadmap/tablero-publico.js');
const catalog=JSON.parse(readFileSync(new URL('../docs/roadmap/catalog.json',import.meta.url)));
function fixture(){return {protocolVersion:1,revision:1,serverTime:'2026-11-08T00:00:00Z',catalogSha:'a'.repeat(40),slots:structuredClone(catalog.slots),tasks:structuredClone(catalog.tasks),units:structuredClone(catalog.units),claims:[],evidence:[],blockers:[],release:null,privateValue:'PRIVATE_SENTINEL'};}
test('public projection is an explicit minimal allowlist for all250tasks, with stable numbered lists',()=>{
 const b=fixture();b.slots.reverse();const p=publicBoard(b);
 assert.equal(p.tasks.length,250);assert.deepEqual(p.lists.map(l=>l.name),['Lista 1','Lista 2','Lista 3','Lista 4']);
 assert.deepEqual(Object.keys(p).sort(),['lists','revision','schemaVersion','tasks','updatedAt']);
 assert.deepEqual(Object.keys(p.tasks[0]).sort(),['activity','code','details','list','state','title']);
 assert.deepEqual(Object.keys(p.tasks[0].details).sort(),['dependencies','done','nextStep','pending']);
 assert.deepEqual(Object.keys(p.lists[0]).sort(),['activeCount','capacity','name','number']);
 assert.ok(!JSON.stringify(p).includes('PRIVATE_SENTINEL'));ui.validateBoard(p);
});
test('task details expose only checklist progress and dependency codes, without contacts or operational notes',()=>{
 const b=fixture(),t=b.tasks[0];t.hecho='Trabajo existente para equipo@example.com';t.falta='Completar el recorrido';t.nextStep='Revisar el contrato';
 t.bloqueo=t.externalBlocker=t.responsable='PRIVATE_SENTINEL';t.dependencies=[{id:'NOT-11',requires:'integrated',reason:'PRIVATE_SENTINEL'},{id:'javascript:PRIVATE_SENTINEL'}];
 const p=publicBoard(b),d=p.tasks[0].details;
 assert.deepEqual(d,{done:'Trabajo existente para [correo del equipo]',pending:t.falta,nextStep:t.nextStep,dependencies:['NOT-11']});
 assert.ok(!JSON.stringify(p).includes('PRIVATE_SENTINEL'));assert.ok(!JSON.stringify(p).includes('equipo@example.com'));
 const legacy=structuredClone(p);delete legacy.tasks[0].details;ui.validateBoard(legacy);
 for(const bad of [{...d,done:42},{...d,dependencies:['javascript:alert(1)']},{...d,dependencies:null}]){const invalid=structuredClone(p);invalid.tasks[0].details=bad;assert.throws(()=>ui.validateBoard(invalid),/Detalle incompatible/);}
});
test('public progress changes after closure; planning and obsolete completions never finish build work',()=>{
 const b=fixture(),u=b.units.find(u=>u.enabled);b.units=[u];b.tasks=b.tasks.filter(t=>t.id===u.parentTaskId);
 const c={unitId:u.id,slot:u.preferredSlot,status:'active',mode:'plan',sessionId:'PRIVATE_SENTINEL',resources:[{key:'PRIVATE_SENTINEL'}]};b.claims=[c];
 assert.equal(publicBoard(b).tasks[0].activity,'planning');assert.ok(!JSON.stringify(publicBoard(b)).includes('PRIVATE_SENTINEL'));
 c.status='completed';assert.equal(publicBoard(b).tasks[0].activity,'unreserved');
 c.mode='build';c.completionCurrent=false;assert.equal(publicBoard(b).tasks[0].activity,'unreserved');
 c.completionCurrent=true;assert.equal(publicBoard(b).tasks[0].activity,'completed');u.enabled=false;assert.equal(publicBoard(b).tasks[0].activity,'completed');c.completionCurrent=false;assert.equal(publicBoard(b).tasks[0].activity,'unreserved');b.tasks[0].estado='hecho';assert.equal(publicBoard(b).tasks[0].activity,'completed');assert.equal(publicBoard(b).lists.find(l=>l.number===publicBoard(b).tasks[0].list).activeCount,0);
});
test('public handler permits read only and fetches only the canonical catalogue',async()=>{
 let calls=0,assets=0;const previous=globalThis.fetch;globalThis.fetch=async url=>{calls++;assert.match(url,/raw\.githubusercontent\.com/);return Response.json(catalog);};
 const env={ASSETS:{fetch:async()=>{assets++;return new Response('public');}}};
 try {
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])for(const path of ['/','/v1/board','/v1/claims','/v1/catalog'])assert.equal((await worker.fetch(new Request('https://public.example'+path,{method}),env)).status,405);
  for(const path of ['/v1/claims','/v1/catalog','/.env','/anything'])assert.equal((await worker.fetch(new Request('https://public.example'+path),env)).status,404);
  assert.equal(calls,0);assert.equal(assets,0);
  const r=await worker.fetch(new Request('https://public.example/v1/board'),env);assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.match(r.headers.get('Content-Security-Policy'),/script-src 'self'/);assert.ok(!r.headers.get('Content-Security-Policy').includes('unsafe-inline'));assert.equal((await r.json()).tasks.length,250);assert.equal(calls,1);
  assert.equal((await worker.fetch(new Request('https://public.example/'),env)).status,200);assert.equal(assets,1);
  for(const path of ['/paquetes.json','/tablero-publico.css'])assert.equal((await worker.fetch(new Request('https://public.example'+path),env)).status,200);
  assert.equal(assets,3);
 } finally {globalThis.fetch=previous;}
});
test('public failure is opaque and does not serialize a source exception',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>{throw Error('PRIVATE_SENTINEL');};
 try{const r=await worker.fetch(new Request('https://public.example/v1/board'),{});assert.equal(r.status,503);assert.ok(!(await r.text()).includes('PRIVATE_SENTINEL'));}finally{globalThis.fetch=previous;}
});
test('public browser polls without credentials and updates closure without reload, preserving focus and filters',async()=>{
 const html=readFileSync(new URL('../docs/roadmap/tablero-publico.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://public.example/',pretendToBeVisual:true});const w=dom.window,timers=new Map(),ageTicks=[];let seq=0;
 w.setTimeout=(fn,delay)=>{timers.set(++seq,{fn,delay});return seq;};w.clearTimeout=id=>timers.delete(id);w.setInterval=fn=>{ageTicks.push(fn);return ++seq;};w.clearInterval=()=>{};
 const b=fixture(),u=b.units.find(u=>u.enabled);b.tasks=b.tasks.filter(t=>t.id===u.parentTaskId);b.units=[u];b.claims=[{unitId:u.id,slot:u.preferredSlot,status:'active',mode:'build'}];let payload=publicBoard(b),fail=false;const requests=[];
 w.fetch=async(url,options)=>{requests.push({url,options});if(fail)throw Error('offline');return {ok:true,json:async()=>structuredClone(payload)};};
 const app=ui.mount(w.document,w);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(w.document.querySelectorAll('.column').length,4);assert.equal(w.document.querySelector('.activity').textContent,'En curso');
 assert.equal(requests[0].options.credentials,'omit');assert.equal(requests[0].options.cache,'no-store');
 const input=w.document.getElementById('search');input.value=b.tasks[0].id;input.dispatchEvent(new w.Event('input'));input.focus();const card=w.document.querySelector('details');card.open=true;
 b.claims[0].status='completed';b.claims[0].completionCurrent=true;b.revision=2;payload=publicBoard(b);
 const poll=[...timers.values()].find(t=>t.delay===15000);assert.ok(poll);await poll.fn();
 assert.equal(w.document.querySelector('.activity').textContent,'Trabajo completado');assert.equal(input.value,b.tasks[0].id);assert.equal(w.document.activeElement,input);assert.equal(card.open,true);assert.equal(app.getBoard().revision,2);
 fail=true;await app.refresh();assert.equal(app.getBoard().revision,2);assert.match(w.document.getElementById('connection').textContent,/último dato/);for(const tick of ageTicks)tick();assert.match(w.document.getElementById('connection').textContent,/No se pudo actualizar/);assert.equal(w.document.getElementById('connection').dataset.state,'stale');
 payload.tasks[0].title='<img src=x onerror=alert(1)>';fail=false;b.revision=3;payload.revision=3;await app.refresh();assert.equal(w.document.querySelectorAll('img').length,0);assert.equal(w.document.querySelector('.title').textContent,payload.tasks[0].title);
 app.stop();dom.window.close();
});

test('expanded details refresh safely and dependency links reveal and open tasks across filtered lists',async()=>{
 const dom=new JSDOM(readFileSync(new URL('../docs/roadmap/tablero-publico.html',import.meta.url),'utf8'),{url:'https://public.example/',pretendToBeVisual:true}),w=dom.window;
 let payload=publicBoard(fixture());w.fetch=async()=>({ok:true,json:async()=>structuredClone(payload)});
 const app=ui.mount(w.document,w);await new Promise(resolve=>setImmediate(resolve));
 try{
  const source=payload.tasks.find(t=>t.details.dependencies.some(code=>payload.tasks.some(other=>other.code===code&&other.list!==t.list)));
  assert.ok(source);const target=payload.tasks.find(t=>source.details.dependencies.includes(t.code)&&t.list!==source.list);
  const doc=w.document,card=doc.getElementById('task-'+source.code),destination=doc.getElementById('task-'+target.code);card.open=true;
  for(const [id,value] of [['search',source.code],['list',String(source.list)],['activity',source.activity]]){const field=doc.getElementById(id);field.value=value;field.dispatchEvent(new w.Event(id==='search'?'input':'change'));}
  assert.equal(card.hidden,false);assert.equal(destination.closest('.column').hidden,true);
  assert.deepEqual([...card.querySelectorAll('h3')].map(n=>n.textContent),['Siguiente paso','Qué está hecho','Qué falta','Dependencias entre tareas','Dónde conviene hacerla','Trabajar esta tarea']);
  assert.ok(card.querySelector('.detail').textContent.includes(source.details.nextStep));
  card.querySelector('a[data-jump="'+target.code+'"]').focus();payload.revision++;
  payload.tasks.find(t=>t.code===source.code).details.pending='<img src=x onerror=alert(1)> Nueva información del checklist';
  await app.refresh();assert.equal(card.open,true);assert.equal(doc.getElementById('search').value,source.code);assert.equal(doc.activeElement.dataset.jump,target.code);
  assert.equal(card.querySelector('img'),null);assert.match(card.querySelector('.detail').textContent,/<img src=x onerror=alert\(1\)> Nueva información/);
  doc.activeElement.click();assert.equal(destination.open,true);assert.equal(destination.hidden,false);assert.equal(destination.closest('.column').hidden,false);assert.equal(doc.activeElement,destination.querySelector('summary'));
  for(const id of ['search','list','activity'])assert.equal(doc.getElementById(id).value,'');
 }finally{app.stop();dom.window.close();}
});

test('short cache shares only sanitized JSON; query/cookies cannot bypass it and errors are not cached',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'caches'),oldFetch=globalThis.fetch;const entries=new Map();let now=0,reads=0,fail=false;globalThis.fetch=async()=>{reads++;if(fail)throw Error('PRIVATE_SENTINEL');return Response.json(catalog);};
 globalThis.caches={default:{async match(key){const e=entries.get(key.url);return e&&e.expires>now?e.response.clone():undefined;},async put(key,response){assert.equal(response.headers.get('Cache-Control'),'public, max-age=60');assert.ok(!(await response.clone().text()).includes('PRIVATE_SENTINEL'));entries.set(key.url,{response:response.clone(),expires:now+60000});}}};
 const env={BOARD_SOURCE:{getByName(){return {getWorkBoard:async()=>{reads++;if(fail)throw Error('PRIVATE_SENTINEL');return fixture();}};}}};
 try{
  assert.equal((await worker.fetch(new Request('https://public.example/v1/board?one=1',{headers:{Cookie:'arbitrary'}}),env)).status,200);
  const head=await worker.fetch(new Request('https://public.example/v1/board?other=2',{method:'HEAD'}),env);assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(reads,1);assert.deepEqual([...entries.keys()],['https://public.example/v1/board']);
  now=60001;fail=true;assert.equal((await worker.fetch(new Request('https://public.example/v1/board'),env)).status,503);assert.equal(reads,2);
  fail=false;assert.equal((await worker.fetch(new Request('https://public.example/v1/board'),env)).status,200);assert.equal(reads,3);
 }finally{globalThis.fetch=oldFetch;if(previous)Object.defineProperty(globalThis,'caches',previous);else delete globalThis.caches;}
});


test('package manifest covers every catalogue task once, including deferred work, and recommendations resolve for all tasks',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../docs/roadmap/paquetes.json',import.meta.url)));
 ui.validatePackages(manifest);
 const codes=manifest.packages.flatMap(p=>p.stages.flatMap(s=>s.tasks));
 assert.equal(codes.length,250);assert.equal(new Set(codes).size,250);
 assert.deepEqual([...codes].sort(),catalog.tasks.map(t=>t.id).sort());
 for(const code of codes){const r=ui.taskAdvice(code,manifest);assert.ok(['Hermes','VPS','VS Code'].includes(r.environment));assert.ok(['Baja','Media','Alta'].includes(r.difficulty));assert.ok(r.reason&&r.needs);}
 assert.match(manifest.engines.hermesPrimary,/Sol.*Codex/);assert.match(manifest.engines.hermesFallback,/DeepSeek v4.*max.*OpenCode/);
 for(const mutate of [m=>m.packages[1].stages[0].tasks.push(codes[0]),m=>m.packages[0].stages[0].tasks.push('javascript:bad'),m=>m.packages[0].recommendation.environment='unknown',m=>m.defaultOrder.push('PAQ-99')]){const invalid=structuredClone(manifest);mutate(invalid);assert.throws(()=>ui.validatePackages(invalid));}
});

test('progress measures checklist completion only, without weighting partial work, local closures or deferred work',()=>{
 const tasks=[{state:'hecho'},{state:'parcial',activity:'completed'},{state:'pendiente'},{state:'bloqueado'},{state:'replanteado'},{state:'descartado'}];
 assert.deepEqual(ui.progress(tasks),{done:1,total:4,partial:1,blocked:1,excluded:2,percent:25});
 assert.deepEqual(ui.progress([]),{done:0,total:0,partial:0,blocked:0,excluded:0,percent:0});
 assert.equal(ui.progress([{state:'replanteado'}]).total,0);
 assert.equal(ui.progress([...Array.from({length:200},()=>({state:'hecho'})),{state:'pendiente'}]).percent.toFixed(2),'99.50');
 assert.equal(ui.progress(Array.from({length:201},()=>({state:'hecho'}))).percent,100);
});

test('progress renders two Spanish decimals globally, per list and package, including refresh and boundaries',async()=>{
 const manifest=JSON.parse(readFileSync(new URL('../docs/roadmap/paquetes.json',import.meta.url)));
 const dom=new JSDOM(readFileSync(new URL('../docs/roadmap/tablero-publico.html',import.meta.url),'utf8'),{url:'https://public.example/',pretendToBeVisual:true}),w=dom.window;
 let payload=publicBoard(fixture());
 payload.tasks.forEach((t,i)=>{t.state=i<52?'hecho':i<221?'pendiente':'replanteado';});
 w.fetch=async url=>({ok:true,json:async()=>structuredClone(url==='/paquetes.json'?manifest:payload)});
 const app=ui.mount(w.document,w);await new Promise(resolve=>setImmediate(resolve));
 try{
  const doc=w.document,label=doc.getElementById('progress-label'),bar=doc.getElementById('overall-progress');
  assert.equal(label.textContent,'52 de 221 tareas hechas · 23,53%');
  assert.equal(bar.getAttribute('aria-valuetext'),label.textContent);
  assert.equal(bar.value,52);assert.equal(bar.max,221);
  const labels=[...doc.querySelectorAll('.column-head progress + .muted,.package-count')];
  assert.equal(labels.length,27);
  for(const node of labels)assert.match(node.textContent,/^(?:\d+ de \d+ tareas hechas · \d+,\d{2}%|Sin tareas de alcance vigente)$/);
  const search=doc.getElementById('search');search.value='BUS-14';search.dispatchEvent(new w.Event('input'));search.focus();
  payload.tasks[52].state='hecho';payload.revision++;await app.refresh();
  assert.equal(label.textContent,'53 de 221 tareas hechas · 23,98%');
  assert.equal(doc.activeElement,search);assert.equal(search.value,'BUS-14');assert.equal(bar.max,221);
  payload.tasks.forEach((t,i)=>{if(i<221)t.state='pendiente';});payload.revision++;await app.refresh();
  assert.equal(label.textContent,'0 de 221 tareas hechas · 0,00%');
  payload.tasks.forEach((t,i)=>{if(i<221)t.state='hecho';});payload.revision++;await app.refresh();
  assert.equal(label.textContent,'221 de 221 tareas hechas · 100,00%');
 }finally{app.stop();w.close();}
});

test('package overview, task guidance and progress preserve filters and focus across updates; links reveal exact tasks',async()=>{
 const manifest=JSON.parse(readFileSync(new URL('../docs/roadmap/paquetes.json',import.meta.url)));
 const dom=new JSDOM(readFileSync(new URL('../docs/roadmap/tablero-publico.html',import.meta.url),'utf8'),{url:'https://public.example/',pretendToBeVisual:true}),w=dom.window;
 let payload=publicBoard(fixture());w.fetch=async url=>({ok:true,json:async()=>structuredClone(url==='/paquetes.json'?manifest:payload)});
 const app=ui.mount(w.document,w);await new Promise(resolve=>setImmediate(resolve));
 try{
  const doc=w.document;assert.equal(doc.querySelectorAll('.package').length,23);
  const expected=ui.progress(payload.tasks);assert.equal(Number(doc.getElementById('overall-progress').value),expected.done);assert.equal(Number(doc.getElementById('overall-progress').max),expected.total);
  const group=doc.getElementById('package-PAQ-01');group.open=true;const link=group.querySelector('a[data-jump="NOT-11"]');link.focus();
  const search=doc.getElementById('search');search.value='NOT-11';search.dispatchEvent(new w.Event('input'));
  assert.equal(doc.getElementById('overall-progress').max,expected.total);assert.equal(group.hidden,false);
  payload.revision++;payload.tasks.find(t=>t.code==='NOT-11').state='hecho';await app.refresh();
  assert.equal(group.open,true);assert.equal(doc.activeElement,link);assert.equal(search.value,'NOT-11');assert.equal(doc.getElementById('overall-progress').value,expected.done+1);
  link.click();assert.equal(doc.getElementById('view').value,'lists');const card=doc.getElementById('task-NOT-11');assert.equal(card.open,true);assert.equal(card.hidden,false);assert.equal(doc.activeElement,card.querySelector('summary'));
  assert.match(card.querySelector('.detail').textContent,/Dificultad orientativa: Alta/);assert.match(card.querySelector('.detail').textContent,/VPS/);
  assert.match(card.querySelector('.detail').textContent,/Esta tarea figura como hecha/);payload.revision++;payload.tasks.find(t=>t.code==='NOT-11').state='replanteado';await app.refresh();assert.match(card.querySelector('.detail').textContent,/Fuera del alcance vigente/);assert.ok(!card.querySelector('.detail').textContent.includes('Esta tarea figura como hecha'));payload.revision++;payload.tasks.find(t=>t.code==='NOT-11').state='pendiente';await app.refresh();assert.ok(!card.querySelector('.detail').textContent.includes('Fuera del alcance vigente'));
  doc.getElementById('environment').value='Hermes';doc.getElementById('environment').dispatchEvent(new w.Event('change'));assert.equal(card.hidden,true);
  assert.equal(doc.getElementById('overall-progress').max,expected.total);
  doc.getElementById('reset').click();assert.equal(card.hidden,false);assert.equal(doc.getElementById('environment').value,'');
  doc.getElementById('search').value='nonsense';doc.getElementById('search').dispatchEvent(new w.Event('input'));assert.match(doc.getElementById('result').textContent,/0 de/);
 }finally{app.stop();w.close();}
});

test('failed package metadata retains live lists and progress, and manual refresh recovers packages',async()=>{
 const manifest=JSON.parse(readFileSync(new URL('../docs/roadmap/paquetes.json',import.meta.url)));
 const dom=new JSDOM(readFileSync(new URL('../docs/roadmap/tablero-publico.html',import.meta.url),'utf8'),{url:'https://public.example/',pretendToBeVisual:true}),w=dom.window;let fail=true;
 w.fetch=async url=>{if(url==='/paquetes.json'&&fail)throw Error('offline');return {ok:true,json:async()=>url==='/paquetes.json'?manifest:publicBoard(fixture())};};
 const app=ui.mount(w.document,w);await new Promise(resolve=>setImmediate(resolve));
 try{assert.equal(w.document.getElementById('view').value,'lists');assert.match(w.document.getElementById('package-status').textContent,/No se pudo/);assert.equal(w.document.querySelectorAll('.task').length,250);
 fail=false;await app.refresh();await new Promise(resolve=>setImmediate(resolve));assert.equal(w.document.querySelectorAll('.package').length,23);assert.equal(w.document.getElementById('package-status').textContent,'');
 }finally{app.stop();w.close();}
});


test('local package planner preserves explicit task scope, filters lists and rejects mismatched selections',async()=>{
 const {execFileSync,spawnSync}=await import('node:child_process');
 const script=new URL('../scripts/plan-packages.mjs',import.meta.url);
 const run=(...args)=>JSON.parse(execFileSync(process.execPath,[script.pathname,...args],{encoding:'utf8'}));
 assert.deepEqual(run('--check'),{packages:23,tasks:250,coverage:'exact'});
 const task=run('--task','BUS-14');assert.equal(task.scope,'explicit_task');assert.equal(task.reserved,false);assert.equal(task.buildAuthorized,false);assert.equal(task.packages.length,1);assert.equal(task.packages[0].id,'PAQ-03');
 const list=run('--list','4');assert.ok(list.packages.every(p=>p.stages.some(s=>s.tasks.some(t=>t.list===4))));
 for(const args of [['--package','PAQ-99'],['--task','BUS-999'],['--list','5'],['--package','PAQ-01','--task','BUS-14'],['--claim','NOT-11']])assert.equal(spawnSync(process.execPath,[script.pathname,...args],{encoding:'utf8'}).status,1);
});

test('GitHub board shows current progress and clearly reports unavailable live activity',async()=>{
 const {catalogBoard}=await import('../coordination/src/public-catalog.mjs');
 const payload=await catalogBoard(async()=>Response.json(catalog),()=>new Date('2026-11-12T12:00:00Z'));
 ui.validateBoard(payload);
 const html=readFileSync(new URL('../docs/roadmap/tablero-publico.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://public.example/',pretendToBeVisual:true}),w=dom.window;
 const manifest=JSON.parse(readFileSync(new URL('../docs/roadmap/paquetes.json',import.meta.url)));
 w.fetch=async url=>({ok:true,json:async()=>structuredClone(url==='/paquetes.json'?manifest:payload)});
 const app=ui.mount(w.document,w);
 try{
  await new Promise(resolve=>setTimeout(resolve,100));
  const expected=ui.progress(payload.tasks);assert.ok(w.document.getElementById('progress-label').textContent.includes(`${expected.done} de ${expected.total}`));
  w.document.getElementById('view').value='lists';w.document.getElementById('view').dispatchEvent(new w.Event('change'));
  assert.match(w.document.body.textContent,/Actividad en vivo no disponible/);
  assert.match(w.document.body.textContent,/Actividad no disponible/);
  assert.ok(!w.document.body.textContent.includes('null construcciones'));
 }finally{app.stop();dom.window.close();}
});
