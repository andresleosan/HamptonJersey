const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const ui=require('../docs/roadmap/tablero-publico.js');
const manifest=JSON.parse(readFileSync(new URL('../docs/roadmap/paquetes.json',require('node:url').pathToFileURL(__filename))));
const work=(mode,status,extra={})=>({task:'REG-08',packageId:'PAQ-02',mode,status,team:'Codex · a1234567',list:1,milestone:mode==='plan'?'plan':'implementation',next:mode==='plan'?'build':'review',reference:'docs/superpowers/plans/test.md',sha:null,updatedAt:'2026-11-09T12:00:00Z',...extra});
function payload(){return {schemaVersion:1,revision:1,updatedAt:'2026-11-09T12:00:00Z',lists:[1,2,3,4].map(number=>({number,name:'Lista '+number,capacity:2,activeCount:number===1?1:0})),tasks:[{code:'REG-08',title:'Registration requirements',list:1,state:'parcial',activity:'active',details:{done:'Existing requirements',pending:'Review the delivery',nextStep:'Verify',dependencies:[]},work:{build:work('build','active'),plans:[work('plan','planned',{team:'Hermes 2 · b1234567'})]}}]};}
test('prepared plan and active construction remain distinct in tasks and package stages without inflating completion',async()=>{
 const dom=new JSDOM(readFileSync(new URL('../docs/roadmap/tablero-publico.html',require('node:url').pathToFileURL(__filename)),'utf8'),{url:'https://public.example/',pretendToBeVisual:true}),w=dom.window;
 let data=payload(),offline=false;w.fetch=async url=>{if(offline)throw Error('offline');return {ok:true,json:async()=>structuredClone(url==='/paquetes.json'?manifest:data)};};
 const app=ui.mount(w.document,w);await new Promise(r=>setImmediate(r));
 try{
  const card=w.document.getElementById('task-REG-08');card.open=true;
  assert.match(card.querySelector('.activity').textContent,/Codex/);
  assert.match(card.querySelector('.detail').textContent,/Plan preparado.*Hermes 2/s);
  assert.match(w.document.querySelector('#package-PAQ-02 .stage-tasks li').parentNode.textContent,/REG-08.*En curso.*Codex/s);
  assert.equal(w.document.getElementById('overall-progress').value,0);
  assert.equal(card.querySelector('.detail a[data-work-key]'),null,'unpublished document is a reference, not a live link');
  data.tasks[0].work.build.sha='a'.repeat(40);data.tasks[0].work.build.status='published';data.tasks[0].activity='published';data.revision++;
  await app.refresh();const link=card.querySelector('a[data-work-key]');assert.ok(link);link.focus();
  data.revision++;data.tasks[0].work.build.next='done';await app.refresh();assert.equal(w.document.activeElement.dataset.workKey,link.dataset.workKey);assert.equal(card.open,true);
  offline=true;await app.refresh();assert.match(w.document.getElementById('connection').textContent,/último dato válido/);assert.match(card.textContent,/Publicad/);
 }finally{app.stop();w.close();}
});
test('activity validation rejects mode/status mismatch and private or unsafe reference fields',()=>{
 ui.validateBoard(payload());
 for(const change of [r=>r.reference='javascript:alert(1)',r=>r.actorId='private actor',r=>r.milestone='arbitrary text',r=>r.mode='plan',r=>r.team='<img src=x onerror=alert(1)>']){
  const data=payload();change(data.tasks[0].work.build);assert.throws(()=>ui.validateBoard(data));
 }
});
test('new activity supersedes historical claims without treating a prepared plan as construction',async()=>{
 const {publicBoard}=await import('../coordination/src/public-board.mjs');
 const board={revision:1,activityRevision:2,serverTime:'2026-11-09T12:00:00Z',slots:['vps','hermes','vscode','codex-desktop'].map(id=>({id,capacity:2})),tasks:[{id:'REG-08',titulo:'Requirements',assignedSlot:'vps',estado:'parcial'}],units:[{id:'REG-08',parentTaskId:'REG-08'}],claims:[{unitId:'REG-08',slot:'vps',mode:'build',status:'active'}],work:[]};
 assert.equal(publicBoard(board).tasks[0].activity,'unreserved');assert.equal(publicBoard(board).lists[0].activeCount,0);
 board.work=[{...work('plan','planned'),actorId:'private',sessionId:'private-session'}];
 const p=publicBoard(board);assert.equal(p.tasks[0].activity,'planned');assert.equal(p.tasks[0].state,'parcial');assert.equal(p.lists[0].activeCount,0);assert.equal(JSON.stringify(p).includes('private'),false);
});
test('the public task preserves prior publication when the next tranche starts',async()=>{
 const {publicBoard}=await import('../coordination/src/public-board.mjs');
 const delivery=work('build','published',{sha:'b'.repeat(40),next:'validate'}),current=work('build','active',{basedOn:{sha:delivery.sha,reference:delivery.reference,next:'validate'}});
 const board={revision:1,activityRevision:2,serverTime:'2026-11-09T12:00:00Z',slots:['vps','hermes','vscode','codex-desktop'].map(id=>({id,capacity:2})),tasks:[{id:'REG-08',titulo:'Requirements',assignedSlot:'vps',estado:'parcial'}],units:[],claims:[],work:[delivery,current].map(r=>({...r,slot:'vps'}))};
 const result=publicBoard(board);assert.equal(result.tasks[0].activity,'active');assert.equal(result.tasks[0].work.delivery.sha,delivery.sha);assert.equal(result.tasks[0].work.build.basedOn.sha,delivery.sha);ui.validateBoard(result);
});
