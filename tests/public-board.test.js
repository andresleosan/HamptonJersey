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
test('public handler permits read only and never forwards unknown paths or write commands',async()=>{
 let calls=0,assets=0;const env={BOARD_SOURCE:{getByName(name){assert.equal(name,'hampton');return {getBoard:async()=>{calls++;return fixture();},command(){throw Error('write must never run');}};}},ASSETS:{fetch:async()=>{assets++;return new Response('public');}}};
 for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])for(const path of ['/','/v1/board','/v1/claims','/v1/catalog'])assert.equal((await worker.fetch(new Request('https://public.example'+path,{method}),env)).status,405);
 for(const path of ['/v1/claims','/v1/catalog','/.env','/anything'])assert.equal((await worker.fetch(new Request('https://public.example'+path),env)).status,404);
 assert.equal(calls,0);assert.equal(assets,0);
 const r=await worker.fetch(new Request('https://public.example/v1/board'),env);assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.match(r.headers.get('Content-Security-Policy'),/script-src 'self'/);assert.ok(!r.headers.get('Content-Security-Policy').includes('unsafe-inline'));assert.equal((await r.json()).tasks.length,250);assert.equal(calls,1);
 assert.equal((await worker.fetch(new Request('https://public.example/'),env)).status,200);assert.equal(assets,1);
});
test('public failure is opaque and does not serialize a source exception',async()=>{
 const r=await worker.fetch(new Request('https://public.example/v1/board'),{BOARD_SOURCE:{getByName(){throw Error('PRIVATE_SENTINEL');}}});assert.equal(r.status,503);assert.ok(!(await r.text()).includes('PRIVATE_SENTINEL'));
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
  assert.deepEqual([...card.querySelectorAll('h3')].map(n=>n.textContent),['Siguiente paso','Qué está hecho','Qué falta','Dependencias entre tareas','Trabajar esta tarea']);
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
 const previous=Object.getOwnPropertyDescriptor(globalThis,'caches');const entries=new Map();let now=0,reads=0,fail=false;
 globalThis.caches={default:{async match(key){const e=entries.get(key.url);return e&&e.expires>now?e.response.clone():undefined;},async put(key,response){assert.equal(response.headers.get('Cache-Control'),'public, max-age=5');assert.ok(!(await response.clone().text()).includes('PRIVATE_SENTINEL'));entries.set(key.url,{response:response.clone(),expires:now+5000});}}};
 const env={BOARD_SOURCE:{getByName(){return {getBoard:async()=>{reads++;if(fail)throw Error('PRIVATE_SENTINEL');return fixture();}};}}};
 try{
  assert.equal((await worker.fetch(new Request('https://public.example/v1/board?one=1',{headers:{Cookie:'arbitrary'}}),env)).status,200);
  const head=await worker.fetch(new Request('https://public.example/v1/board?other=2',{method:'HEAD'}),env);assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(reads,1);assert.deepEqual([...entries.keys()],['https://public.example/v1/board']);
  now=5001;fail=true;assert.equal((await worker.fetch(new Request('https://public.example/v1/board'),env)).status,503);assert.equal(reads,2);
  fail=false;assert.equal((await worker.fetch(new Request('https://public.example/v1/board'),env)).status,200);assert.equal(reads,3);
 }finally{if(previous)Object.defineProperty(globalThis,'caches',previous);else delete globalThis.caches;}
});
