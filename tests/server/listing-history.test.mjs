import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {makeEnv,seedListing,seedMedia,call,adminCookie,T0,captured,plan} from './helpers.mjs';
import {jerseyToday,plusDays} from '../../server/viewings.js';
import {mergeHistoryPage} from '../../admin/src/listing-history-window.mjs';
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
test('SPR-01: History exposes only real civil availability dates and distinguishes absent from null',async()=>{
  const {env,cookie}=await fixture(),marker='SYNTHETIC_PRIVATE_MARKER';
  const samples=[
    ['0001-01-01',true],['2000-02-29',true],['2028-02-29',true],['9999-12-31',true],
    ['0000-01-01',false],['0100-02-29',false],['0400-02-29',true],['1900-02-29',false],['2100-02-29',false],
    ['2027-02-29',false],['2026-04-31',false],
    ['2028-2-29',false],['2028-02-29T00:00:00Z',false],['2028-02-29T00:00:00+14:00',false],
    [marker,false],[`2028-02-29\0${marker}`,false],[20280229,false],[true,false],[{},false],[[],false],
  ];
  const ids=samples.map(([value])=>event(env,{fields:['available_on'],before:{available_on:value},after:{available_on:null}}));
  const missing=event(env,{fields:['available_on'],before:{},after:{}});
  const r=await get(env,cookie);assert.equal(r.status,200);
  for(const [index,[value,valid]] of samples.entries()){
    const change=r.data.items.find(item=>item.id===ids[index]).changes[0];
    assert.equal(change.field,'available_on');
    assert.equal(Object.hasOwn(change,'before'),valid,`case ${index}`);
    if(valid)assert.equal(change.before,value);
    assert.equal(Object.hasOwn(change,'after'),true);assert.equal(change.after,null);
  }
  const unknown=r.data.items.find(item=>item.id===missing).changes[0];
  assert.equal(Object.hasOwn(unknown,'before'),false);assert.equal(Object.hasOwn(unknown,'after'),false);
  assert.equal(JSON.stringify(r.data).includes(marker),false);
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

test('B01: a human match review remains in property History after its match row disappears',async()=>{
  const {env,cookie}=await fixture();
  const created=await call(env,'POST','/admin/applicants',{cookie,body:{name:'PRIVATE test applicant',email:'test@example.test',source:'phone',operation:'buy'}});
  assert.equal(created.status,201);
  const applicant=env.DB.raw.prepare('SELECT id FROM applicants LIMIT 1').get().id;
  env.DB.raw.prepare(`INSERT OR IGNORE INTO matches(applicant_id,listing_id,score,checks,status,created_at,updated_at)
    VALUES(?,?,80,'[]','found',?,?)`).run(applicant,ID,T0,T0);
  const match=env.DB.raw.prepare("SELECT id FROM matches WHERE applicant_id=? AND listing_id=? AND status='found'").get(applicant,ID);
  assert.ok(match);
  const reviewed=await call(env,'PUT',`/admin/matches/${match.id}`,{cookie,body:{from:'found',status:'shortlisted'}});
  assert.equal(reviewed.status,200,reviewed.text);
  env.DB.raw.prepare('DELETE FROM matches WHERE id=?').run(match.id);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM matches WHERE id=?').get(match.id).n,0);
  const r=await get(env,cookie);assert.equal(r.status,200);
  const review=r.data.items.find(i=>i.type==='match.reviewed');
  assert.ok(review,'the decision survives a later recompute that removed the match row');
  assert.deepEqual(review.decision,{from:'found',to:'shortlisted',reason:null});
  assert.ok(!r.text.includes('PRIVATE test applicant'));
});

test('B01/B02: a linked viewing request and booking disappear from History when erased',async()=>{
  const {env,cookie}=await fixture();
  const v=Number(env.DB.raw.prepare(`INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
    VALUES(?,'In person','2026-11-12','11:00','PRIVATE visitor','visitor@example.test','requested',?)`).run(ID,T0).lastInsertRowid);
  const insert=env.DB.raw.prepare('INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,?,?,?,?,?)');
  insert.run(T0,'public','viewing',String(v),'viewing.requested',JSON.stringify({listing_id:ID,date:'2026-11-12',name:'PRIVATE visitor'}));
  insert.run(T0,'admin@example.test','viewing',String(v),'viewing.booked',JSON.stringify({listing_id:ID,date:'2026-11-12',email:'visitor@example.test'}));
  const before=await get(env,cookie);assert.equal(before.status,200);
  assert.deepEqual(before.data.items.map(i=>i.type),['viewing.booked','viewing.requested']);
  assert.ok(!before.text.includes('PRIVATE visitor')&&!before.text.includes('visitor@example.test'));
  const removed=await call(env,'DELETE',`/admin/viewings/${v}`,{cookie});assert.equal(removed.status,200);
  const after=await get(env,cookie);assert.equal(after.status,200);assert.deepEqual(after.data.items,[]);
});

test('B02: retention and listing deletion cascade the temporary viewing association',async()=>{
  const {env,cookie}=await fixture();
  const insert=env.DB.raw.prepare(`INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
    VALUES(?,'In person',?,'11:00','Synthetic','view@example.test',?,?)`);
  const log=env.DB.raw.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(?,'public','viewing',?,'viewing.requested',?)`);
  const expired=Number(insert.run(ID,'2025-01-01','completed','2025-01-01T00:00:00.000Z').lastInsertRowid);
  const old=Number(log.run(T0,String(expired),JSON.stringify({listing_id:ID})).lastInsertRowid);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM history_viewing_events WHERE viewing_id=?').get(expired).n,1);
  assert.ok((await get(env,cookie)).data.items.some(i=>i.id===old));
  const {runRetention}=await import('../../server/retention.js');
  assert.equal((await runRetention(env,'2026-11-09T12:00:00.000Z')).viewings,1);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM history_viewing_events WHERE viewing_id=?').get(expired).n,0);
  assert.equal(env.DB.raw.prepare('SELECT data FROM events WHERE id=?').get(old).data,null);
  assert.ok(!(await get(env,cookie)).data.items.some(i=>i.id===old));
  const live=Number(insert.run(ID,'2026-11-12','requested',T0).lastInsertRowid);
  const eventId=Number(log.run(T0,String(live),JSON.stringify({listing_id:ID})).lastInsertRowid);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM history_viewing_events WHERE viewing_id=?').get(live).n,1);
  seedListing(env,{id:'HE-R002'});
  env.DB.raw.prepare('UPDATE viewing_requests SET listing_id=? WHERE id=?').run('HE-R002',live);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM history_viewing_events WHERE viewing_id=?').get(live).n,0,
    'relinking must not rewrite a past viewing event as a fact about the new property');
  env.DB.raw.prepare('UPDATE viewing_requests SET listing_id=? WHERE id=?').run(ID,live);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM history_viewing_events WHERE viewing_id=?').get(live).n,0,
    'a past association does not resurrect when a row is relinked');
  const current=Number(env.DB.raw.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(?,'system','viewing',?,'viewing.booked',NULL)`).run(T0,String(live)).lastInsertRowid);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM history_viewing_events WHERE event_id=?').get(current).n,1);
  const {deleteListing}=await import('../../server/routes/listings.js');
  await deleteListing(env,ID,'admin@example.test');
  assert.equal(env.DB.raw.prepare('SELECT listing_id FROM viewing_requests WHERE id=?').get(live).listing_id,null);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM history_viewing_events WHERE viewing_id=?').get(live).n,0);
  assert.ok(!(await get(env,cookie)).data.items.some(i=>i.id===eventId));
  assert.deepEqual(env.DB.raw.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('B02: viewing event trigger preserves producer event IDs, notices and failed-action gating',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({success:true,hostname:'hampton.test'})));
  const {env,cookie}=await fixture();
  const date=Array.from({length:7},(_,i)=>plusDays(jerseyToday(),i+1))
    .find(d=>{const day=new Date(d+'T12:00:00Z').getUTCDay();return day>=1&&day<=5;});
  const body={listing_id:ID,negotiator_id:1,kind:'In person',date,time:'11:00',name:'Synthetic',
    email:'book@example.test',turnstile:'tok'};
  const requested=await call(env,'POST','/viewings',{body});assert.equal(requested.status,201,requested.text);
  const publicRow=env.DB.raw.prepare('SELECT id FROM viewing_requests ORDER BY id LIMIT 1').get();
  const booked=await call(env,'POST','/admin/viewings',{cookie,body:{...body,time:'12:00'}});
  assert.equal(booked.status,201,booked.text);
  const rows=env.DB.raw.prepare("SELECT id,entity_id,type FROM events WHERE entity_type='viewing' ORDER BY id").all();
  assert.deepEqual(rows.map(r=>r.type),['viewing.requested','viewing.booked']);
  assert.equal(rows[0].entity_id,String(publicRow.id));assert.equal(rows[1].entity_id,String(booked.data.id));
  assert.equal(env.DB.raw.prepare('SELECT event_id FROM notifications WHERE category=?').get('viewing').event_id,rows[0].id);
  assert.deepEqual(env.DB.raw.prepare('SELECT event_id,viewing_id FROM history_viewing_events ORDER BY event_id').all()
    .map(r=>[r.event_id,r.viewing_id]),[[rows[0].id,publicRow.id],[rows[1].id,booked.data.id]]);
  const rejected=await call(env,'PUT',`/admin/viewings/${publicRow.id}`,{cookie,body:{action:'complete',
    outcome:'proceed',updated_at:null}});
  assert.equal(rejected.status,409);assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE entity_type='viewing'").get().n,2);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM history_viewing_events').get().n,2);
});

test('B01/B02: offers and sale events belong to their own property, not an unrelated sale ID',async()=>{
  const {env,cookie}=await fixture();seedListing(env,{id:'HE-R002'});
  const created=await call(env,'POST','/admin/applicants',{cookie,body:{name:'PRIVATE buyer',email:'buyer@example.test',source:'phone',operation:'buy'}});
  assert.equal(created.status,201);const a=env.DB.raw.prepare('SELECT id FROM applicants LIMIT 1').get().id;
  const offer=env.DB.raw.prepare(`INSERT INTO offers(listing_id,applicant_id,amount,status,created_at,updated_at)
    VALUES(?,?,800000,'accepted',?,?)`);
  const own=Number(offer.run(ID,a,T0,T0).lastInsertRowid),other=Number(offer.run('HE-R002',a,T0,T0).lastInsertRowid);
  const sale=Number(env.DB.raw.prepare(`INSERT INTO sales(listing_id,applicant_id,offer_id,price,created_at,updated_at)
    VALUES(?,?,?,?,?,?)`).run(ID,a,own,800000,T0,T0).lastInsertRowid);
  const log=env.DB.raw.prepare('INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,?,?,?,?,?)');
  log.run(T0,'admin@example.test','applicant',String(a),'offer.accepted',JSON.stringify({listing_id:ID,offer_id:own,sale_id:sale,amount:800000,private:'PRIVATE buyer'}));
  log.run(T0,'admin@example.test','applicant',String(a),'sale.milestone',JSON.stringify({listing_id:ID,offer_id:own,sale_id:sale,key:'passing',note:'PRIVATE'}));
  log.run(T0,'admin@example.test','applicant',String(a),'offer.withdrawn',JSON.stringify({listing_id:'HE-R002',offer_id:other,sale_id:sale,note:'PRIVATE'}));
  const r=await get(env,cookie);assert.equal(r.status,200);
  assert.deepEqual(r.data.items.map(i=>i.type),['sale.milestone','offer.accepted']);
  assert.ok(!r.text.includes('PRIVATE buyer')&&!r.text.includes('800000')&&!r.text.includes('HE-R002'));
  const otherHistory=await call(env,'GET','/admin/listings/HE-R002/history',{cookie});
  assert.deepEqual(otherHistory.data.items.map(i=>i.type),['offer.withdrawn']);
});

test('B01/B02: sale milestones expose only the state proved by each event, not notes',async()=>{
  const {env,cookie}=await fixture();
  const buyer=await call(env,'POST','/admin/applicants',{cookie,
    body:{name:'PRIVATE buyer',email:'milestone@example.test',source:'phone',operation:'buy',budget_max:900000}});
  assert.equal(buyer.status,201);
  const offered=await call(env,'POST','/admin/offers',{cookie,
    body:{listing_id:ID,applicant_id:buyer.data.id,amount:750000}});
  assert.equal(offered.status,201);
  const accepted=await call(env,'POST',`/admin/offers/${offered.data.offer.id}/accept`,{cookie});
  assert.equal(accepted.status,201);const saleId=accepted.data.sale_id;
  const update=async(key,body)=>call(env,'PUT',`/admin/sales/${saleId}/milestones/${key}`,{cookie,body});
  assert.equal((await update('mortgage',{planned_on:plusDays(jerseyToday(),7)})).status,200);
  assert.equal((await update('passing',{done_on:jerseyToday()})).status,200);
  assert.equal((await update('searches',{not_needed:true})).status,200);
  assert.equal((await update('lawyers',{note:'PRIVATE solicitor and client'})).status,200);
  const items=(await get(env,cookie)).data.items.filter(i=>i.type==='sale.milestone');
  assert.equal(items.length,4);
  assert.deepEqual(Object.fromEntries(items.map(i=>[i.milestone,i.milestone_state])),
    {mortgage:'planned',passing:'completed',searches:'not_needed',lawyers:null});
  assert.ok(!JSON.stringify(items).includes('PRIVATE'));
  assert.equal((await update('mortgage',{planned_on:null})).status,200);
  assert.equal((await update('passing',{done_on:null})).status,200);
  assert.equal((await update('searches',{not_needed:false})).status,200);
  const changed=(await get(env,cookie)).data.items.filter(i=>i.type==='sale.milestone');
  assert.deepEqual(Object.fromEntries(changed.sort((a,b)=>a.id-b.id).map(i=>[i.milestone,i.milestone_state])),
    {mortgage:'plan_removed',passing:'completion_removed',searches:'needed_again',lawyers:null});
  const malformed=Number(env.DB.raw.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(?,'system','applicant',?,'sale.milestone',?)`).run(T0,String(buyer.data.id),
      JSON.stringify({listing_id:ID,sale_id:saleId,key:'passing',after:{done_on:'2026-99-99',note:'PRIVATE'}})).lastInsertRowid);
  const legacy=(await get(env,cookie)).data.items.find(i=>i.id===malformed);
  assert.equal(legacy.milestone_state,null);
  assert.ok(!JSON.stringify(legacy).includes('PRIVATE'));
});

test('B03: a long legacy timestamp on a related event keeps mixed pagination scoped',async()=>{
  const {env,cookie}=await fixture();
  const created=await call(env,'POST','/admin/applicants',{cookie,body:{name:'Synthetic',email:'synthetic@example.test',source:'phone',operation:'buy'}});
  assert.equal(created.status,201);const a=env.DB.raw.prepare('SELECT id FROM applicants LIMIT 1').get().id;
  const insert=env.DB.raw.prepare('INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,?,?,?,?,?)');
  for(let i=0;i<51;i++)insert.run('legacy-λ','system','applicant',String(a),'match.reviewed',JSON.stringify({listing_id:ID,from:'found',to:'shortlisted'}));
  const first=await get(env,cookie);assert.equal(first.status,200);assert.equal(first.data.items.length,50);
  const cursor=JSON.parse(Buffer.from(first.data.next_cursor,'base64url'));
  assert.equal(cursor.before_at,null);
  const next=await get(env,cookie,first.data.next_cursor);
  assert.equal(next.status,200);assert.equal(next.data.items.length,1);
  assert.equal(new Set([...first.data.items,...next.data.items].map(i=>i.id)).size,51);
  env.DB.raw.prepare('DELETE FROM applicants WHERE id=?').run(a);
  assert.equal((await get(env,cookie,first.data.next_cursor)).status,400,'a removed related anchor cannot be reused');
});

test('B05: related events use the property key instead of scanning another property of the same applicant',async()=>{
  const {env,cookie}=await fixture();
  const created=await call(env,'POST','/admin/applicants',{cookie,body:{name:'Synthetic',email:'perf@example.test',source:'phone',operation:'buy'}});
  assert.equal(created.status,201);const a=env.DB.raw.prepare('SELECT id FROM applicants LIMIT 1').get().id;
  const insert=env.DB.raw.prepare('INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,?,?,?,?,?)');
  env.DB.raw.exec('BEGIN');for(let i=0;i<10000;i++)insert.run(T0,'system','applicant',String(a),'match.reviewed',JSON.stringify({listing_id:'HE-R002',from:'found',to:'shortlisted'}));
  insert.run(T0,'system','applicant',String(a),'match.reviewed',JSON.stringify({listing_id:ID,from:'found',to:'shortlisted'}));env.DB.raw.exec('COMMIT');
  const seen=captured(env,/WITH window AS MATERIALIZED/);
  const r=await get(env,cookie);assert.equal(r.status,200);assert.equal(r.data.items.length,1);assert.equal(seen.length,1);
  const measured=spawnSync('python3',['-c',`
import sys,json,sqlite3,base64
x=json.load(sys.stdin);db=sqlite3.connect(':memory:');db.deserialize(base64.b64decode(x['db']))
steps=[0]
def tick(): steps[0]+=1;return 0
db.set_progress_handler(tick,1);rows=db.execute(x['sql'],x['args']).fetchall();db.set_progress_handler(None,0)
print(json.dumps({'steps':steps[0],'rows':len(rows)}))
`],{input:JSON.stringify({db:Buffer.from(env.DB.raw.serialize()).toString('base64'),...seen[0]}),encoding:'utf8'});
  assert.equal(measured.status,0,measured.stderr);
  const cost=JSON.parse(measured.stdout),queryPlan=plan(env,seen[0]);console.log('B05 related cost:',JSON.stringify({cost,queryPlan}));
  assert.ok(cost.steps<10000,`unrelated applicant events must not drive the page: ${cost.steps} VM steps`);
  assert.match(queryPlan,/events_listing_related/);
  assert.match(queryPlan,/SEARCH a EXISTS USING INTEGER PRIMARY KEY/);
});

test('B03: mixed property and human-review events paginate 50/50/20 without new backdated entries',async()=>{
  const {env,cookie}=await fixture();
  const created=await call(env,'POST','/admin/applicants',{cookie,body:{name:'Synthetic',email:'pages@example.test',source:'phone',operation:'buy'}});
  assert.equal(created.status,201);const a=env.DB.raw.prepare('SELECT id FROM applicants LIMIT 1').get().id;
  const insert=env.DB.raw.prepare('INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,?,?,?,?,?)');
  for(let i=0;i<60;i++){
    event(env,null);
    insert.run(T0,'system','applicant',String(a),'match.reviewed',JSON.stringify({listing_id:ID,from:'found',to:'shortlisted'}));
  }
  const first=(await get(env,cookie)).data;assert.equal(first.items.length,50);
  const late=Number(insert.run('2020-01-01T00:00:00.000Z','system','applicant',String(a),'match.reviewed',JSON.stringify({listing_id:ID,from:'found',to:'rejected'})).lastInsertRowid);
  const second=(await get(env,cookie,first.next_cursor)).data,third=(await get(env,cookie,second.next_cursor)).data;
  assert.deepEqual([second.items.length,third.items.length,third.next_cursor],[50,20,null]);
  const all=[...first.items,...second.items,...third.items],ids=all.map(i=>i.id);
  assert.equal(new Set(ids).size,120);assert.ok(!ids.includes(late));
  assert.equal(all.filter(i=>i.type==='match.reviewed').length,60);
  assert.equal(all.filter(i=>i.type==='listing.updated').length,60);
});

test('B03: deleting a viewing that anchors the next page asks for a fresh History window',async()=>{
  const {env,cookie}=await fixture();
  const v=Number(env.DB.raw.prepare(`INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
    VALUES(?,'In person','2026-11-12','11:00','Synthetic','view@example.test','confirmed',?)`).run(ID,T0).lastInsertRowid);
  const insert=env.DB.raw.prepare('INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,?,?,?,?,?)');
  for(let i=0;i<51;i++)insert.run(T0,'system','viewing',String(v),'viewing.booked',JSON.stringify({listing_id:ID}));
  const first=(await get(env,cookie)).data;assert.equal(first.items.length,50);
  const removed=await call(env,'DELETE',`/admin/viewings/${v}`,{cookie});assert.equal(removed.status,200);
  assert.equal((await get(env,cookie,first.next_cursor)).status,400);
});

test('B03: a deleted nonanchor viewing invalidates the visible rows before appending',async()=>{
  const {env,cookie}=await fixture();
  const v=Number(env.DB.raw.prepare(`INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
    VALUES(?,'In person','2026-11-12','11:00','PRIVATE visitor','view@example.test','requested',?)`).run(ID,T0).lastInsertRowid);
  for(let i=0;i<55;i++)event(env,null,{at:'2026-11-13T12:00:00.000Z'});
  const viewed=Number(env.DB.raw.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(?,'public','viewing',?,'viewing.requested',?)`).run('2026-11-14T12:00:00.000Z',String(v),JSON.stringify({listing_id:ID})).lastInsertRowid);
  const first=(await get(env,cookie)).data;
  assert.ok(first.items.some(i=>i.id===viewed));
  const anchor=JSON.parse(Buffer.from(first.next_cursor,'base64url'));
  assert.equal(env.DB.raw.prepare('SELECT entity_type FROM events WHERE id=?').get(anchor.before_id).entity_type,'listing');
  const pathCheck=`/admin/listings/${ID}/history/validate`;
  assert.equal((await call(env,'POST',pathCheck,{body:{ids:first.items.map(i=>i.id)}})).status,401);
  const before=await call(env,'POST',pathCheck,{cookie,body:{ids:first.items.map(i=>i.id)}});
  assert.equal(before.status,200);assert.equal(before.headers.get('cache-control'),'no-store');
  const extra=event(env,null,{at:'2026-11-13T12:00:00.000Z'});
  assert.equal((await call(env,'POST',pathCheck,{cookie,body:{ids:[...first.items.map(i=>i.id),extra]}})).status,200,
    '51 valid IDs are checked in the same database snapshot, not split across requests');
  assert.equal((await call(env,'DELETE',`/admin/viewings/${v}`,{cookie})).status,200);
  assert.equal((await get(env,cookie,first.next_cursor)).status,200,'unrelated anchor remains valid');
  assert.equal((await call(env,'POST',pathCheck,{cookie,body:{ids:first.items.map(i=>i.id)}})).status,409);
  assert.equal((await call(env,'POST',pathCheck,{cookie,body:{ids:[viewed,viewed]}})).status,400);
});

test('B03: visible-row validation rejects a redacted legacy event without leaking a server error',async()=>{
  const {env,cookie}=await fixture();
  const applicant=await call(env,'POST','/admin/applicants',{cookie,body:{name:'Synthetic',email:'legacy@example.test',
    source:'phone',operation:'buy'}});assert.equal(applicant.status,201);
  const bad=Number(env.DB.raw.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(?,'system','applicant',?,'offer.recorded',NULL)`).run(T0,String(applicant.data.id)).lastInsertRowid);
  const result=await call(env,'POST',`/admin/listings/${ID}/history/validate`,{cookie,body:{ids:[bad]}});
  assert.equal(result.status,409,'unattributable redacted event is stale, not a 500 or a visible fact');
});

test('B03: one validation snapshot covers more than 50 visible rows without a between-batch race',async()=>{
  const {env,cookie}=await fixture();
  const v=Number(env.DB.raw.prepare(`INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
    VALUES(?,'In person','2026-11-12','11:00','Synthetic','race@example.test','requested',?)`).run(ID,T0).lastInsertRowid);
  const viewed=Number(env.DB.raw.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(?,'public','viewing',?,'viewing.requested',?)`).run(T0,String(v),JSON.stringify({listing_id:ID})).lastInsertRowid);
  const ids=[viewed];for(let i=0;i<120;i++)ids.push(event(env,null));
  const pathCheck=`/admin/listings/${ID}/history/validate`;
  assert.equal((await call(env,'POST',pathCheck,{cookie,body:{ids}})).status,200);
  assert.equal((await call(env,'DELETE',`/admin/viewings/${v}`,{cookie})).status,200);
  assert.equal((await call(env,'POST',pathCheck,{cookie,body:{ids}})).status,409,
    'one server-side snapshot detects deletion anywhere in the visible window');
});

test('B05: 0038 upgrades populated 0037 schema without changing events or notifications',()=>{
  const db=new DatabaseSync(':memory:'),migration=new URL('../../migrations/',import.meta.url);
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for(const f of readdirSync(migration).filter(f=>f.endsWith('.sql')&&f<'0038_').sort())
      db.exec(readFileSync(new URL(f,migration),'utf8'));
    seedListing({DB:{raw:db}});
    seedListing({DB:{raw:db}},{id:'HE-R002'});
    const viewing=Number(db.prepare(`INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
      VALUES(?,'In person','2026-11-12','11:00','Synthetic','migration@example.test','requested',?)`).run(ID,T0).lastInsertRowid);
    const firstViewing=Number(db.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      VALUES(?,'public','viewing',?,'viewing.requested',?)`).run(T0,String(viewing),JSON.stringify({listing_id:ID})).lastInsertRowid);
    const legacy=Number(db.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      VALUES(?,'system','viewing',?,'viewing.confirmed',NULL)`).run(T0,String(viewing)).lastInsertRowid);
    const priorOther=Number(db.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      VALUES(?,'public','viewing',?,'viewing.requested',?)`).run(T0,String(viewing),JSON.stringify({listing_id:'HE-R002'})).lastInsertRowid);
    const insert=db.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      VALUES(?,'system','applicant','1','match.reviewed',?)`);
    for(const data of [null,'{',JSON.stringify({listing_id:ID})])insert.run(T0,data);
    db.exec('BEGIN');
    for(let i=0;i<10000;i++)insert.run(T0,JSON.stringify({listing_id:i%2?ID:'HE-R002'}));
    db.exec('COMMIT');
    db.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      VALUES(?,'system','listing',?,'listing.updated',?)`).run(T0,ID,JSON.stringify({revision:1,fields:[]}));
    const events=()=>db.prepare('SELECT id,at,actor,entity_type,entity_id,type,data FROM events ORDER BY id').all();
    const notices=()=>db.prepare('SELECT * FROM notifications ORDER BY id').all();
    const beforeEvents=events(),beforeNotices=notices();assert.ok(beforeNotices.length>0);
    const start=performance.now();db.exec('BEGIN');
    db.exec(readFileSync(new URL('0038_history_related.sql',migration),'utf8'));db.exec('COMMIT');
    console.log('B05 populated upgrade:',JSON.stringify({ms:performance.now()-start,events:beforeEvents.length,notices:beforeNotices.length}));
    assert.deepEqual(events(),beforeEvents);assert.deepEqual(notices(),beforeNotices);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(db.prepare('SELECT event_id,viewing_id,listing_id,at FROM history_viewing_events').all().map(r=>({...r})),
      [{event_id:firstViewing,viewing_id:viewing,listing_id:ID,at:T0}]);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM history_viewing_events WHERE event_id IN (?,?)').get(legacy,priorOther).n,0,
      'backfill cannot guess an unknown property or rewrite an event from a different property');
    const later=Number(db.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      VALUES(?,'system','viewing',?,'viewing.booked',NULL)`).run(T0,String(viewing)).lastInsertRowid);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM history_viewing_events WHERE event_id=?').get(later).n,1);
    db.prepare('DELETE FROM viewing_requests WHERE id=?').run(viewing);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM history_viewing_events').get().n,0,'deletion cascades without a retained link');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM events WHERE id IN (?,?)').get(firstViewing,later).n,2);
    const related=db.prepare(`SELECT id FROM events WHERE entity_type='applicant'
      AND CASE WHEN json_valid(data) THEN json_extract(data,'$.listing_id') END=?`).get(ID);
    assert.equal(JSON.parse(db.prepare('SELECT data FROM events WHERE id=?').get(related.id).data).listing_id,ID);
    assert.match(db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM events WHERE entity_type='applicant'
      AND CASE WHEN json_valid(data) THEN json_extract(data,'$.listing_id') END=?`).all(ID).map(r=>r.detail).join('\n'),/events_listing_related/);
  } finally {db.close();}
});

test('B05: related branches do not rescan many match reviews of the same property',async()=>{
  const {env,cookie}=await fixture();
  const created=await call(env,'POST','/admin/applicants',{cookie,body:{name:'Synthetic',email:'dense@example.test',source:'phone',operation:'buy'}});
  assert.equal(created.status,201);const a=env.DB.raw.prepare('SELECT id FROM applicants LIMIT 1').get().id;
  const insert=env.DB.raw.prepare('INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,?,?,?,?,?)');
  env.DB.raw.exec('BEGIN');for(let i=0;i<10000;i++)insert.run(T0,'system','applicant',String(a),'match.reviewed',JSON.stringify({listing_id:ID,from:'found',to:'shortlisted'}));env.DB.raw.exec('COMMIT');
  const seen=captured(env,/WITH window AS MATERIALIZED/),r=await get(env,cookie);
  assert.equal(r.status,200);assert.equal(r.data.items.length,50);
  const measured=spawnSync('python3',['-c',`
import sys,json,sqlite3,base64
x=json.load(sys.stdin);db=sqlite3.connect(':memory:');db.deserialize(base64.b64decode(x['db']))
steps=[0]
def tick(): steps[0]+=1;return 0
db.set_progress_handler(tick,1);rows=db.execute(x['sql'],x['args']).fetchall();db.set_progress_handler(None,0)
print(json.dumps({'steps':steps[0],'rows':len(rows)}))
`],{input:JSON.stringify({db:Buffer.from(env.DB.raw.serialize()).toString('base64'),...seen[0]}),encoding:'utf8'});
  assert.equal(measured.status,0,measured.stderr);
  const cost=JSON.parse(measured.stdout);console.log('B05 same-property cost:',JSON.stringify(cost));
  assert.equal(cost.rows,51);assert.ok(cost.steps<10000,`same-property type filtering must be bounded: ${cost.steps}`);
  const anchor=env.DB.raw.prepare("SELECT id FROM events WHERE type='match.reviewed' ORDER BY id LIMIT 1 OFFSET 5000").get().id;
  const cursor=Buffer.from(JSON.stringify({v:1,listing_id:ID,snapshot_id:env.DB.raw.prepare('SELECT MAX(id) AS n FROM events').get().n,
    before_at:T0,before_id:anchor})).toString('base64url');
  const deepSeen=captured(env,/WITH window AS MATERIALIZED/),deep=await get(env,cookie,cursor);
  assert.equal(deep.status,200);assert.equal(deep.data.items.length,50);
  const later=spawnSync('python3',['-c',`
import sys,json,sqlite3,base64
x=json.load(sys.stdin);db=sqlite3.connect(':memory:');db.deserialize(base64.b64decode(x['db']))
steps=[0]
def tick(): steps[0]+=1;return 0
db.set_progress_handler(tick,1);rows=db.execute(x['sql'],x['args']).fetchall();db.set_progress_handler(None,0)
print(json.dumps({'steps':steps[0],'rows':len(rows)}))
`],{input:JSON.stringify({db:Buffer.from(env.DB.raw.serialize()).toString('base64'),...deepSeen[0]}),encoding:'utf8'});
  assert.equal(later.status,0,later.stderr);
  const deeper=JSON.parse(later.stdout);console.log('B05 deep-page cost:',JSON.stringify({cost:deeper,queryPlan:plan(env,deepSeen[0])}));
  assert.ok(deeper.steps<10000,`deep-page scan must seek to cursor: ${deeper.steps}`);
});

test('B05: many live viewings of one property have bounded first and deep pages',async()=>{
  const {env,cookie}=await fixture();
  const view=env.DB.raw.prepare(`INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
    VALUES(?,'In person','2026-11-12','11:00','Synthetic','view@example.test','confirmed',?)`);
  const log=env.DB.raw.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(?,'system','viewing',?,'viewing.booked',NULL)`);
  env.DB.raw.exec('BEGIN');
  for(let i=0;i<2500;i++){
    const id=String(view.run(ID,T0).lastInsertRowid);
    for(let j=0;j<4;j++)log.run(T0,id);
  }
  env.DB.raw.exec('COMMIT');
  const measure=q=>{
    const result=spawnSync('python3',['-c',`
import sys,json,sqlite3,base64
x=json.load(sys.stdin);db=sqlite3.connect(':memory:');db.deserialize(base64.b64decode(x['db']))
steps=[0]
def tick(): steps[0]+=1;return 0
db.set_progress_handler(tick,1);rows=db.execute(x['sql'],x['args']).fetchall();db.set_progress_handler(None,0)
print(json.dumps({'steps':steps[0],'rows':len(rows)}))
`],{input:JSON.stringify({db:Buffer.from(env.DB.raw.serialize()).toString('base64'),...q}),encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
  };
  const firstQuery=captured(env,/WITH window AS MATERIALIZED/),first=await get(env,cookie);
  assert.equal(first.status,200);assert.equal(first.data.items.length,50);
  const firstCost=measure(firstQuery[0]);console.log('B05 many viewings first:',JSON.stringify({cost:firstCost,plan:plan(env,firstQuery[0])}));
  assert.ok(firstCost.steps<15000,`first viewing page must not scan all 10000 events: ${firstCost.steps}`);
  const anchor=env.DB.raw.prepare("SELECT id FROM events WHERE type='viewing.booked' ORDER BY id LIMIT 1 OFFSET 5000").get().id;
  const cursor=Buffer.from(JSON.stringify({v:1,listing_id:ID,snapshot_id:env.DB.raw.prepare('SELECT MAX(id) n FROM events').get().n,
    before_at:T0,before_id:anchor})).toString('base64url');
  const deepQuery=captured(env,/WITH window AS MATERIALIZED/),deep=await get(env,cookie,cursor);
  assert.equal(deep.status,200);assert.equal(deep.data.items.length,50);
  const deepCost=measure(deepQuery[0]);console.log('B05 many viewings deep:',JSON.stringify({cost:deepCost,plan:plan(env,deepQuery[0])}));
  assert.ok(deepCost.steps<15000,`deep viewing page must seek to cursor: ${deepCost.steps}`);
  const ids=env.DB.raw.prepare("SELECT id FROM events WHERE entity_type='viewing' ORDER BY id").all().map(r=>r.id);
  const checkQuery=captured(env,/FROM json_each\(\?\) requested/),started=performance.now();
  const validated=await call(env,'POST',`/admin/listings/${ID}/history/validate`,{cookie,body:{ids}});
  const apiMs=performance.now()-started;
  assert.equal(validated.status,200);assert.equal(checkQuery.length,1);
  const checkedCost=measure(checkQuery[0]);console.log('B05 visible validation 10000:',JSON.stringify({cost:checkedCost,
    apiMs,plan:plan(env,checkQuery[0])}));
  assert.ok(checkedCost.steps<300000,`validation must seek by each ID, not scan all events: ${checkedCost.steps}`);
  const startPages=performance.now();let displayed=first.data,pageCursor=first.data.next_cursor,pages=1;
  while(pageCursor){
    const next=await get(env,cookie,pageCursor);assert.equal(next.status,200);
    const candidate=mergeHistoryPage(displayed,next.data);
    assert.equal((await call(env,'POST',`/admin/listings/${ID}/history/validate`,{cookie,
      body:{ids:candidate.items.map(i=>i.id)}})).status,200);
    displayed=candidate;pageCursor=next.data.next_cursor;pages++;
  }
  assert.equal(displayed.items.length,10000);assert.equal(new Set(displayed.items.map(i=>i.id)).size,10000);
  console.log('B05 10000 viewing events full pagination:',JSON.stringify({pages,ms:performance.now()-startPages}));
  const extra=event(env,null);
  assert.equal((await call(env,'POST',`/admin/listings/${ID}/history/validate`,{cookie,body:{ids:[...ids,extra]}})).status,400,
    '10001 valid IDs exceed the explicit single-snapshot input bound');
});

test('B05: a real completed sale and many closed sales stay scoped and indexed',async()=>{
  const {env,cookie}=await fixture();seedListing(env,{id:'HE-R002'});
  const buyer=await call(env,'POST','/admin/applicants',{cookie,body:{name:'Synthetic buyer',email:'closed@example.test',
    source:'phone',operation:'buy',budget_max:900000}});
  assert.equal(buyer.status,201);
  const own=await call(env,'POST','/admin/offers',{cookie,body:{listing_id:ID,applicant_id:buyer.data.id,amount:750000}});
  const other=await call(env,'POST','/admin/offers',{cookie,body:{listing_id:'HE-R002',applicant_id:buyer.data.id,amount:750000}});
  assert.equal(own.status,201);assert.equal(other.status,201);
  const accepted=await call(env,'POST',`/admin/offers/${own.data.offer.id}/accept`,{cookie});assert.equal(accepted.status,201);
  const saleId=accepted.data.sale_id;
  assert.equal((await call(env,'PUT',`/admin/sales/${saleId}/milestones/passing`,{cookie,body:{done_on:jerseyToday()}})).status,200);
  assert.equal((await call(env,'POST',`/admin/sales/${saleId}/complete`,{cookie})).status,200);
  const first=(await get(env,cookie)).data.items;
  assert.ok(first.some(i=>i.type==='sale.completed'&&i.related.sale_id===saleId));
  assert.ok(first.some(i=>i.type==='offer.accepted'&&i.related.offer_id===own.data.offer.id));
  assert.ok(!JSON.stringify(first).includes('Synthetic buyer'));
  const elsewhere=(await call(env,'GET','/admin/listings/HE-R002/history',{cookie})).data.items;
  assert.ok(elsewhere.some(i=>i.type==='offer.withdrawn'&&i.related.offer_id===other.data.offer.id));
  assert.ok(!elsewhere.some(i=>i.type==='sale.completed'),'a sale_id in offer.withdrawn does not reassign the sale');
  const offer=env.DB.raw.prepare(`INSERT INTO offers(listing_id,applicant_id,amount,status,created_at,updated_at)
    VALUES(?,?,750000,'withdrawn',?,?)`),sale=env.DB.raw.prepare(`INSERT INTO sales
    (listing_id,applicant_id,offer_id,price,status,fell_through_reason,created_at,updated_at,closed_at)
    VALUES(?,?,?,750000,'fallen_through','chain',?,?,?)`);
  const log=env.DB.raw.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(?,'system','applicant',?,'sale.fallen_through',?)`);
  env.DB.raw.exec('BEGIN');
  for(let i=0;i<2000;i++){
    const oid=Number(offer.run(ID,buyer.data.id,T0,T0).lastInsertRowid);
    const sid=Number(sale.run(ID,buyer.data.id,oid,T0,T0,T0).lastInsertRowid);
    log.run(T0,String(buyer.data.id),JSON.stringify({listing_id:ID,sale_id:sid,reason:'chain'}));
  }
  env.DB.raw.exec('COMMIT');
  const measure=q=>{
    const r=spawnSync('python3',['-c',`
import sys,json,sqlite3,base64
x=json.load(sys.stdin);db=sqlite3.connect(':memory:');db.deserialize(base64.b64decode(x['db']))
steps=[0]
def tick(): steps[0]+=1;return 0
db.set_progress_handler(tick,1);rows=db.execute(x['sql'],x['args']).fetchall();db.set_progress_handler(None,0)
print(json.dumps({'steps':steps[0],'rows':len(rows)}))
`],{input:JSON.stringify({db:Buffer.from(env.DB.raw.serialize()).toString('base64'),...q}),encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
  };
  const firstQuery=captured(env,/WITH window AS MATERIALIZED/),page=await get(env,cookie);
  assert.equal(page.status,200);assert.equal(page.data.items.length,50);
  const firstCost=measure(firstQuery[0]);console.log('B05 closed sales first:',JSON.stringify(firstCost));
  assert.ok(firstCost.steps<15000,`closed sales first page must be bounded: ${firstCost.steps}`);
  const anchor=env.DB.raw.prepare("SELECT id FROM events WHERE type='sale.fallen_through' ORDER BY id LIMIT 1 OFFSET 1000").get().id;
  const cursor=Buffer.from(JSON.stringify({v:1,listing_id:ID,snapshot_id:env.DB.raw.prepare('SELECT MAX(id) n FROM events').get().n,
    before_at:T0,before_id:anchor})).toString('base64url');
  const deepQuery=captured(env,/WITH window AS MATERIALIZED/),deep=await get(env,cookie,cursor);
  assert.equal(deep.status,200);assert.equal(deep.data.items.length,50);
  const deepCost=measure(deepQuery[0]);console.log('B05 closed sales deep:',JSON.stringify(deepCost));
  assert.ok(deepCost.steps<15000,`closed sales deep page must seek to cursor: ${deepCost.steps}`);
});
