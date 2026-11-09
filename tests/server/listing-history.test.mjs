import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {makeEnv,seedListing,seedMedia,call,adminCookie,T0,captured,plan} from './helpers.mjs';
const ID='HE-R001', path=`/admin/listings/${ID}/history`;
async function fixture(){const env=makeEnv();seedListing(env);return {env,cookie:await adminCookie()};}
function event(env,data={},over={}){return Number(env.DB.raw.prepare('INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,?,?,?,?,?)').run(
  over.at??T0,'admin@example.test','listing',over.id??ID,over.type??'listing.updated',data===null?null:JSON.stringify(data)).lastInsertRowid);}
const get=(env,cookie,cursor)=>call(env,'GET',path+(cursor?'?cursor='+encodeURIComponent(cursor):''),{cookie});

test('A01: authenticated no-store, unknown ID and empty history',async()=>{
  const {env,cookie}=await fixture();
  assert.equal((await get(env)).status,401);
  const r=await get(env,cookie);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.deepEqual(r.data,{listing:{id:ID,state:'present'},items:[],next_cursor:null});
  assert.equal((await call(env,'GET','/admin/listings/HE-R999/history',{cookie})).status,404);
});
test('A02: closed projection preserves real differences without free text or private payload',async()=>{
  const {env,cookie}=await fixture();
  const r=await call(env,'PUT',`/admin/listings/${ID}`,{cookie,body:{updated_at:T0,sale_price:800000,description:'PRIVATE secret note'}});
  assert.equal(r.status,200);
  const item=(await get(env,cookie)).data.items[0];
  assert.equal(item.actor,'admin@example.test');assert.equal(item.source,'panel');assert.equal(item.revision,1);
  assert.ok(item.changes.some(c=>c.field==='sale_price'&&c.before===779000&&c.after===800000));
  assert.deepEqual(item.changes.find(c=>c.field==='description'),{field:'description',derived:false});
  event(env,{fields:['bedrooms','matchable','description','unknown','availability'],before:{bedrooms:null,matchable:false},after:{bedrooms:0,matchable:0,description:'PRIVATE',unknown:'PRIVATE',availability:'PRIVATE'},related:{offer_id:3,email:'PRIVATE'},source:'PRIVATE'});
  const safe=(await get(env,cookie)).data.items.find(i=>i.revision===null);
  assert.deepEqual(safe.changes.find(c=>c.field==='bedrooms'),{field:'bedrooms',derived:false,before:null,after:0});
  assert.equal(safe.changes.find(c=>c.field==='matchable').before,false);
  assert.deepEqual(safe.related,{offer_id:3});assert.ok(!JSON.stringify(safe).includes('PRIVATE'));
});
test('A02: null, unexpected and unknown legacy events have safe fallbacks; DB errors stay errors',async()=>{
  const {env,cookie}=await fixture();event(env,null);event(env,[]);event(env,{fields:['<img>'],secret:'PRIVATE'},{type:'private.unrecognized'});
  const r=await get(env,cookie);assert.equal(r.status,200);
  assert.equal(r.data.items[0].type,'listing.unknown');assert.ok(r.data.items.every(i=>i.details_unavailable));
  env.DB.raw.exec('DROP INDEX listing_marketing_listing; DROP TABLE listing_marketing_evidence');
  assert.equal((await get(env,cookie)).status,500);
});
test('A03: stable 50/50/20 pages exclude new events with equal or older clocks',async()=>{
  const {env,cookie}=await fixture();for(let i=1;i<=120;i++)event(env,{revision:i,fields:[]});
  const first=await get(env,cookie);assert.equal(first.status,200);assert.equal(first.data.items.length,50);
  const newer=event(env,{revision:121,fields:[]}),backdated=event(env,{revision:122,fields:[]},{at:'2020-01-01T00:00:00.000Z'});
  const second=await get(env,cookie,first.data.next_cursor),third=await get(env,cookie,second.data.next_cursor);
  assert.deepEqual([second.data.items.length,third.data.items.length,third.data.next_cursor],[50,20,null]);
  const ids=[...first.data.items,...second.data.items,...third.data.items].map(i=>i.id);
  assert.equal(new Set(ids).size,120);assert.ok(!ids.includes(newer)&&!ids.includes(backdated));
  assert.equal((await get(env,cookie)).data.items[0].id,newer);
  for(const cursor of ['garbage','x'.repeat(513),Buffer.from(JSON.stringify({v:2})).toString('base64url'),
    Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(first.data.next_cursor,'base64url')),listing_id:'HE-R002'})).toString('base64url')])
    assert.equal((await get(env,cookie,cursor)).status,400,cursor);
  const valid=JSON.parse(Buffer.from(first.data.next_cursor,'base64url'));
  for(const patch of [{snapshot_id:0},{snapshot_id:Number.MAX_SAFE_INTEGER+1},{before_id:-1},{before_id:valid.snapshot_id+1},
    {before_at:'x'.repeat(129)},{before_at:'legacy\ndate'},{before_at:1},{before_at:{}}])
    assert.equal((await get(env,cookie,Buffer.from(JSON.stringify({...valid,...patch})).toString('base64url'))).status,400);
  assert.equal((await call(env,'GET',path+'?cursor=',{cookie})).status,400);
});
test('P2-1: legacy event timestamps paginate without requiring an ISO date',async()=>{
  const {env,cookie}=await fixture();for(let i=0;i<51;i++)event(env,null,{at:'legacy-date'});
  const first=await get(env,cookie);assert.equal(first.status,200);assert.equal(first.data.items.length,50);
  const second=await get(env,cookie,first.data.next_cursor);assert.equal(second.status,200);
  assert.equal(second.data.items.length,1);assert.equal(second.data.next_cursor,null);
  assert.equal(new Set([...first.data.items,...second.data.items].map(i=>i.id)).size,51);
  assert.ok([...first.data.items,...second.data.items].every(i=>i.at==='legacy-date'));
  const cursor=JSON.parse(Buffer.from(first.data.next_cursor,'base64url'));
  const arbitrary=await get(env,cookie,Buffer.from(JSON.stringify({...cursor,before_at:"' OR 1=1 --"})).toString('base64url'));
  assert.equal(arbitrary.status,200,'printable strings are bound values, not SQL authority');
  assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM events').get().n,51);
  for(const at of ['legacy-λ','x'.repeat(300),'legacy\ndate']){
    const {env:edge,cookie:edgeCookie}=await fixture();for(let i=0;i<51;i++)event(edge,null,{at});
    const a=await get(edge,edgeCookie);assert.equal(a.status,200,`unrepresentable legacy timestamp: ${JSON.stringify(at)}`);
    assert.ok(a.data.next_cursor.length<=512,'legacy timestamp size does not enlarge the cursor');
    const b=await get(edge,edgeCookie,a.data.next_cursor);assert.equal(b.status,200);assert.equal(b.data.items.length,1);
    assert.equal(new Set([...a.data.items,...b.data.items].map(i=>i.id)).size,51);
    assert.equal(b.data.items[0].at,at);
  }
  const {env:scoped,cookie:scopedCookie}=await fixture(),other=event(scoped,null,{id:'HE-R002'});
  for(let i=0;i<51;i++)event(scoped,null,{at:'legacy-date'});
  const own=(await get(scoped,scopedCookie)).data;
  const foreignAnchor={...JSON.parse(Buffer.from(own.next_cursor,'base64url')),before_at:null,before_id:other};
  assert.equal((await get(scoped,scopedCookie,Buffer.from(JSON.stringify(foreignAnchor)).toString('base64url'))).status,400);
});
test('A07/A04: evidence metadata survives files and deleted property, without snapshot or links',async()=>{
  const {env,cookie}=await fixture();seedMedia(env,{origin:'upload'});
  const eid=event(env,{revision:1,source:'panel',fields:[]});
  env.DB.raw.prepare(`INSERT INTO listing_marketing_evidence(listing_id,event_id,evidence_ref,media_id,action,reason_code,occurred_at,evidence_snapshot)
    VALUES(?,?,?,?,?,?,?,?)`).run(ID,eid,'media:A00001','A00001','let_agreed','agreement','2026-03-29T00:30:00.000Z','{"r2_key":"PRIVATE","label":"PRIVATE"}');
  const before=(await get(env,cookie)).data.items;
  assert.deepEqual(before[0].evidence,[{evidence_ref:'media:A00001',kind:'media',action:'let_agreed',reason_code:'agreement',occurred_at:'2026-03-29T00:30:00.000Z'}]);
  const {deleteListing}=await import('../../server/routes/listings.js');env.MEDIA.delete=async()=>{throw Error('fixture R2 unavailable');};
  await assert.rejects(deleteListing(env,ID,'admin@example.test'),/fixture R2/);
  const deleted=(await get(env,cookie)).data;assert.deepEqual(deleted.listing,{id:ID,state:'deleted'});
  assert.deepEqual(deleted.items.filter(i=>i.id===eid),before);assert.equal(deleted.items[0].type,'listing.deleted');
  assert.ok(!JSON.stringify(deleted).includes('PRIVATE'));assert.deepEqual(env.DB.raw.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('A02: malformed JSON is handled only in an isolated reader mock',async()=>{
  const {readListingHistory}=await import('../../server/listing-history.js');
  const env={DB:{prepare(sql){return {bind(){return this;},async first(){return {state:'present'};},async all(){return {results:sql.includes('FROM events')?[{id:1,at:T0,actor:'system',type:'listing.updated',data:'{',snapshot_id:1}]:[]};}};}}};
  const r=await readListingHistory(env,{id:ID});assert.equal(r.items[0].details_unavailable,true);assert.deepEqual(r.items[0].changes,[]);
});
test('A09/A05: reads do not write or recover retained personal payload',async()=>{
  const {env,cookie}=await fixture();event(env,{fields:[],source:'panel'});
  await call(env,'POST','/admin/applicants',{cookie,body:{name:'Synthetic retention',email:'retention@example.test',source:'phone',operation:'buy'}});
  env.DB.raw.exec("UPDATE applicants SET search_state='resolved',resolved_at='2025-01-01T00:00:00.000Z',resolved_by='system',resolution_reason='Synthetic'; UPDATE contacts SET last_activity_at='2025-01-01T00:00:00.000Z'");
  env.DB.raw.prepare("INSERT INTO viewing_requests(kind,date,time,end_time,name,email,status,created_at) VALUES('In person','2025-01-01','11:00','11:30','Synthetic','view@example.test','completed',?)").run(T0);
  const {runRetention}=await import('../../server/retention.js');const result=await runRetention(env,'2026-11-09T12:00:00.000Z');
  assert.equal(result.contacts,1);assert.equal(result.viewings,1);
  const snapshot=()=>JSON.stringify(['events','notifications','listing_event_operations','listings'].map(t=>env.DB.raw.prepare(`SELECT * FROM ${t}`).all()));
  const before=snapshot();assert.equal((await get(env,cookie)).data.items.length,1);await get(env,cookie);assert.equal(snapshot(),before);
  assert.ok(!JSON.stringify((await get(env,cookie)).data).includes('retention@example.test'));assert.deepEqual(env.DB.raw.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('A03: bounded indexed reads with 10000 property and 10000 unrelated events',async()=>{
  const {env,cookie}=await fixture();const insert=env.DB.raw.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,'system','listing',?,'listing.updated',NULL)");
  env.DB.raw.exec('BEGIN');for(let i=0;i<10000;i++){insert.run(T0,ID);insert.run(T0,'HE-R002');}env.DB.raw.exec('COMMIT');
  const seen=captured(env,/FROM events|FROM listing_marketing_evidence/),start=performance.now();const r=await get(env,cookie);
  assert.equal(r.data.items.length,50);assert.equal(seen.length,2);
  assert.equal(seen[1].args.length,51,'one evidence query bounded to the displayed 50 event IDs');
  for(const q of seen){const p=plan(env,q);assert.match(p,q.sql.includes('FROM events')?/events_entity/:/listing_marketing_listing/);assert.doesNotMatch(p,/SCAN events|SCAN listing_marketing_evidence/);}
  console.log('History volume:',JSON.stringify({ms:performance.now()-start,bytes:Buffer.byteLength(r.text),plans:seen.map(q=>plan(env,q))}));
  // Replay the actual emitted query on this exact fixture with SQLite's instruction counter.
  // Wall time and a covering-index plan alone would miss a linear MAX(id) scan.
  const measured=spawnSync('python3',['-c',`
import sys,json,sqlite3,base64,time
d=json.load(sys.stdin)
db=sqlite3.connect(':memory:'); db.deserialize(base64.b64decode(d['db']))
steps=[0]
def tick():
 steps[0]+=1
 return 0
db.set_progress_handler(tick,1)
start=time.perf_counter(); rows=db.execute(d['sql'],d['args']).fetchall()
db.set_progress_handler(None,0)
print(json.dumps({'vm_steps':steps[0],'rows':len(rows),'ms':(time.perf_counter()-start)*1000,'sqlite':sqlite3.sqlite_version}))
`],{input:JSON.stringify({db:Buffer.from(env.DB.raw.serialize()).toString('base64'),...seen[0]}),encoding:'utf8'});
  assert.equal(measured.status,0,measured.stderr);
  const cost=JSON.parse(measured.stdout),bytecode=env.DB.raw.prepare('EXPLAIN '+seen[0].sql).all(...seen[0].args);
  const begin=bytecode.findIndex(op=>op.opcode==='BeginSubrtn'),end=bytecode.findIndex((op,i)=>i>begin&&op.opcode==='Return');
  const snapshotProgram=bytecode.slice(begin,end+1).map(({addr,opcode,p1,p2})=>({addr,opcode,p1,p2}));
  console.log('P2-2 snapshot cost:',JSON.stringify({cost,snapshotProgram}));
  assert.equal(cost.rows,51);
  assert.ok(cost.vm_steps<5000,`initial page must not iterate 10000 events to compute its snapshot: ${cost.vm_steps} VM steps`);
  assert.ok(snapshotProgram.some(op=>op.opcode==='Last'),'snapshot seeks the PK maximum directly');
  assert.equal(JSON.parse(Buffer.from(r.data.next_cursor,'base64url')).snapshot_id,20000,'global ceiling includes the final unrelated event');
  assert.ok(!r.text.includes('HE-R002'),'no unrelated entity ID or payload is projected');
});
test('A02: derived feature enums and arrays are retained, objects and unknown enum strings are suppressed',async()=>{
  const {env,cookie}=await fixture();event(env,{fields:['feat_pets','feat_furnished','feat_type','feat_outdoor','viewing_hours','sale_price'],derived_fields:['feat_pets'],
    after:{feat_pets:'yes',feat_furnished:'no',feat_type:'cottage',feat_outdoor:['garden','terrace'],viewing_hours:[{day:1,start:'09:00',end:'12:00',secret:'PRIVATE'}],sale_price:{secret:'PRIVATE'}}});
  const changes=(await get(env,cookie)).data.items[0].changes;
  assert.deepEqual(changes.find(c=>c.field==='feat_pets'),{field:'feat_pets',derived:true,after:'yes'});
  assert.equal(changes.find(c=>c.field==='feat_furnished').after,'no');assert.equal(changes.find(c=>c.field==='feat_type').after,'cottage');
  assert.deepEqual(changes.find(c=>c.field==='feat_outdoor').after,['garden','terrace']);assert.ok(!JSON.stringify(changes).includes('PRIVATE'));
});
test('A09: History reflects a single CAS winner, replayed identity and two legitimate confirmations',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date(T0)});
  const {env,cookie}=await fixture();const {updateListingEvent}=await import('../../server/listing-events.js');
  const op={id:ID,actor:'admin@example.test',source:'panel',action:'updated',expectedAt:T0,patch:{sale_price:800000},operationId:'history-replay'};
  const winner=await updateListingEvent(env,op);assert.equal(winner.replayed,false);
  await get(env,cookie);
  assert.equal((await updateListingEvent(env,op)).replayed,true);
  const stale=await call(env,'PUT',`/admin/listings/${ID}`,{cookie,body:{updated_at:T0,sale_price:900000}});assert.equal(stale.status,409);
  for(let i=0;i<2;i++)assert.equal((await call(env,'POST',`/admin/listings/${ID}/confirm`,{cookie})).status,200);
  const h=(await get(env,cookie)).data;assert.equal(h.items.length,3);assert.equal(h.items.filter(i=>i.type==='listing.confirmed').length,2);
  assert.equal(h.items.filter(i=>i.type==='listing.updated').length,1);assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM listing_event_operations').get().n,1);
});
test('A03/A09: real concurrent saves with intervening reads preserve the sole successful event',async t=>{
  const {env,cookie}=await fixture(),batch=env.DB.batch.bind(env.DB);
  let held=false,signal,release;const reached=new Promise(r=>{signal=r;}),gate=new Promise(r=>{release=r;});t.after(()=>release());
  env.DB.batch=async stmts=>{if(!held&&stmts.some(s=>s.sql.includes('UPDATE listings SET'))){held=true;signal();await gate;}return batch(stmts);};
  const pending=call(env,'PUT',`/admin/listings/${ID}`,{cookie,body:{updated_at:T0,sale_price:810000}});await reached;
  assert.equal((await get(env,cookie)).data.items.length,0);
  const winner=await call(env,'PUT',`/admin/listings/${ID}`,{cookie,body:{updated_at:T0,sale_price:820000}});assert.equal(winner.status,200);
  const visible=(await get(env,cookie)).data;release();assert.equal((await pending).status,409);
  assert.deepEqual((await get(env,cookie)).data,visible);assert.equal(visible.items.length,1);
  assert.equal(visible.items[0].changes.find(c=>c.field==='sale_price').after,820000);
});
