import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {makeEnv,seedListing,seedMedia,adminCookie,call,T0} from './helpers.mjs';
import {passesExtra} from '../../admin/src/listing-filters.js';
import {stateOf} from '../../admin/src/format.js';

// No application route loads this proposal. Tests apply it only to disposable databases.
const proposal=new URL('../../docs/roadmap/work/SPR-01/available-on-history.proposed.sql',import.meta.url);
const install=db=>{if(existsSync(proposal))db.exec(readFileSync(proposal,'utf8'));};
const history=(db,id)=>db.prepare("SELECT id,data FROM events WHERE entity_type='listing' AND entity_id=? ORDER BY id")
  .all(id).map(row=>({id:row.id,data:JSON.parse(row.data)}));
const listRow=async(env,cookie,id='HE-R001')=>{
  const result=await call(env,'GET','/admin/listings',{cookie});
  assert.equal(result.status,200);
  return result.data.listings.find(row=>row.id===id);
};

test('SPR-01 A4: date-only save preserves state and filters while recency follows the edit time',async()=>{
  const env=makeEnv(), initial='2000-01-01T00:00:00.000Z';
  seedListing(env,{available_on:'2026-11-12',updated_at:initial,confirmed_at:initial,published:1,availability:'for_sale',parish:'St Saviour'});
  seedMedia(env);
  const cookie=await adminCookie(),before=await listRow(env,cookie);
  const publicRow=async()=>{
    const response=await call(env,'GET','/listings');assert.equal(response.status,200);
    return response.data.find(row=>row.id==='HE-R001');
  };
  const publicBefore=await publicRow();assert.ok(publicBefore,'the synthetic listing is public');
  assert.equal(before.to_confirm,1);
  const result=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:initial,available_on:'2027-02-28'}});
  assert.equal(result.status,200);
  const after=await listRow(env,cookie);
  for(const key of ['availability','published','archived_at','confirmed_at','to_confirm','operation','bedrooms','sale_price','parish'])
    assert.equal(after[key],before[key],key);
  assert.equal(stateOf(after),stateOf(before));
  const filters=[
    {op:'sale',bedsFrom:'2',bedsTo:'4',min:'700000',max:'900000',recent:false},
    {op:'rent',bedsFrom:'',bedsTo:'',min:'',max:'',recent:false},
    {op:'sale',bedsFrom:'4',bedsTo:'',min:'',max:'',recent:false},
  ];
  for(const filter of filters)assert.equal(passesExtra(after,filter),passesExtra(before,filter));
  const publicAfter=await publicRow();assert.ok(publicAfter,'the synthetic listing remains public');
  const withoutDate=row=>({...row,specs:row.specs.filter(item=>item.label!=='Available from')});
  assert.deepEqual(withoutDate(publicAfter),withoutDate(publicBefore));
  assert.equal(publicBefore.specs.find(item=>item.label==='Available from').value,'2026-11-12');
  assert.equal(publicAfter.specs.find(item=>item.label==='Available from').value,'2027-02-28');
  const recent={op:'',bedsFrom:'',bedsTo:'',min:'',max:'',recent:true},today=new Date();
  assert.equal(passesExtra(before,recent,today),false);
  assert.equal(passesExtra(after,recent,today),true,'the existing recent filter uses updated_at');
  const events=history(env.DB.raw,'HE-R001');
  assert.equal(events.length,1);
  assert.deepEqual(events[0].data.fields,['available_on']);
  assert.equal(after.available_on,'2027-02-28');
});

test('SPR-01 A4: date-only save can derive a previously unknown parish and affect its filter',async()=>{
  const env=makeEnv(),initial='2000-01-01T00:00:00.000Z';
  seedListing(env,{available_on:'2026-11-12',updated_at:initial,confirmed_at:initial,parish:null,location:'St Saviour'});
  const cookie=await adminCookie(),before=await listRow(env,cookie);
  const filtered=async()=>{
    const result=await call(env,'GET','/admin/listings?parish=St%20Saviour',{cookie});
    assert.equal(result.status,200);return result.data.listings.some(row=>row.id==='HE-R001');
  };
  assert.equal(before.parish,null);assert.equal(await filtered(),false);
  const result=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:initial,available_on:'2027-02-28'}});
  assert.equal(result.status,200);
  const after=await listRow(env,cookie);
  assert.equal(after.parish,'St Saviour');assert.equal(await filtered(),true);
  for(const key of ['availability','published','confirmed_at','to_confirm'])assert.equal(after[key],before[key],key);
  const event=history(env.DB.raw,'HE-R001').at(-1).data;
  assert.deepEqual([...event.fields].sort(),['available_on','parish']);
  assert.deepEqual(event.derived_fields,['parish']);
});

test('SPR-01 A5 proposal preserves the deployed triggers and existing history while adding date values',async()=>{
  const env=makeEnv(),db=env.DB.raw,cookie=await adminCookie();
  seedListing(env,{available_on:'2026-11-12'});
  const previous=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,sale_price:800000}});
  assert.equal(previous.status,200);
  const oldHistory=history(db,'HE-R001');
  assert.equal(oldHistory.length,1);
  const oldEvents=db.prepare('SELECT * FROM events ORDER BY id').all();
  const oldNotices=db.prepare('SELECT * FROM notifications ORDER BY id').all();
  const definitions=()=>Object.fromEntries(db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name IN ('listing_event_insert','listing_event_update') ORDER BY name").all().map(row=>[row.name,row.sql]));
  const oldTriggers=definitions();
  assert.deepEqual(Object.keys(oldTriggers),['listing_event_insert','listing_event_update']);
  install(db);
  assert.deepEqual(history(db,'HE-R001'),oldHistory,'installing the proposal does not rewrite old events');
  assert.deepEqual(db.prepare('SELECT * FROM events ORDER BY id').all(),oldEvents);
  assert.deepEqual(db.prepare('SELECT * FROM notifications ORDER BY id').all(),oldNotices);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const modified=definitions(),strip=s=>s.replace(/\/\* SPR01_AVAILABLE_ON_BEGIN \*\/[\s\S]*?\/\* SPR01_AVAILABLE_ON_END \*\//g,'').replace(/\s+/g,' ').trim();
  assert.equal((modified.listing_event_insert.match(/SPR01_AVAILABLE_ON_BEGIN/g)||[]).length,1);
  assert.equal((modified.listing_event_update.match(/SPR01_AVAILABLE_ON_BEGIN/g)||[]).length,2);
  for(const name of Object.keys(oldTriggers))assert.equal(strip(modified[name]),strip(oldTriggers[name]),name);
  const created=await call(env,'POST','/admin/listings',{cookie,body:{title:'Synthetic listing',use:'residential',country:'Jersey',
    operation:'sale',availability:'for_sale',available_on:'2028-02-29'}});
  assert.equal(created.status,201);
  const creation=history(db,created.data.id).at(-1).data;
  assert.equal(creation.after.available_on,'2028-02-29');
  const save=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:previous.data.listing.updated_at,available_on:'2027-02-28'}});
  assert.equal(save.status,200);
  const changed=history(db,'HE-R001').at(-1).data;
  assert.deepEqual(changed.fields,['available_on']);
  assert.equal(changed.before.available_on,'2026-11-12');
  assert.equal(changed.after.available_on,'2027-02-28');
  const clear=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:save.data.listing.updated_at,available_on:null}});
  assert.equal(clear.status,200);
  const cleared=history(db,'HE-R001').at(-1).data;
  assert.equal(cleared.before.available_on,'2027-02-28');assert.equal(cleared.after.available_on,null);
});

test('SPR-01 A5: structured date values do not expose free-text fields in history',async()=>{
  const env=makeEnv(),db=env.DB.raw,cookie=await adminCookie();
  seedListing(env,{available_on:'2026-11-12'});install(db);
  const result=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,
    available_on:'2027-02-28',description:'Synthetic private prose'}});
  assert.equal(result.status,200);
  const event=history(db,'HE-R001').at(-1).data;
  assert.ok(event.fields.includes('description'));
  assert.equal(event.before.available_on,'2026-11-12');assert.equal(event.after.available_on,'2027-02-28');
  assert.equal(JSON.stringify(event).includes('Synthetic private prose'),false);
});

test('SPR-01 A5: invalid legacy availability is not copied into new events or History',async()=>{
  const marker='SYNTHETIC_PRIVATE_AVAILABILITY';
  for(const legacy of [marker,`2028-02-29\0${marker}`])for(const next of ['2028-02-29',null]){
    const env=makeEnv(),db=env.DB.raw,cookie=await adminCookie();
    seedListing(env,{available_on:legacy,parish:'St Saviour'});install(db);
    const result=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,available_on:next}});
    assert.equal(result.status,200);
    const raw=history(db,'HE-R001').at(-1).data;
    assert.equal(JSON.stringify(raw).includes(marker),false);
    assert.deepEqual(raw.before.available_on,{unknown:true});
    assert.equal(raw.after.available_on,next);
    const response=await call(env,'GET','/admin/listings/HE-R001/history',{cookie});
    assert.equal(response.status,200);assert.equal(JSON.stringify(response.data).includes(marker),false);
    const date=response.data.items[0].changes.find(change=>change.field==='available_on');
    assert.equal(Object.hasOwn(date,'before'),false,'unknown is not an explicit null');
    assert.equal(Object.hasOwn(date,'after'),true);assert.equal(date.after,next);
  }
});

test('SPR-01 A5: new snapshots accept only valid calendar dates or explicit null',()=>{
  const env=makeEnv(),db=env.DB.raw,marker='SYNTHETIC_PRIVATE_AVAILABILITY';install(db);
  const samples=[
    ['0001-01-01','0001-01-01'],['2000-02-29','2000-02-29'],['2028-02-29','2028-02-29'],
    ['9999-12-31','9999-12-31'],['0400-02-29','0400-02-29'],[null,null],['0000-01-01',{unknown:true}],
    ['0100-02-29',{unknown:true}],['1900-02-29',{unknown:true}],['2100-02-29',{unknown:true}],
    ['2027-02-29',{unknown:true}],['2026-04-31',{unknown:true}],['2028-2-29',{unknown:true}],
    ['2028-02-29T00:00:00Z',{unknown:true}],['2028-02-29T00:00:00+14:00',{unknown:true}],[marker,{unknown:true}],
    [`2028-02-29\0${marker}`,{unknown:true}],[20280229,{unknown:true}],[Buffer.from('2028-02-29'),{unknown:true}],
  ];
  const context=db.prepare(`INSERT INTO listing_event_context(listing_id,actor,source,action,at,derived_fields,related,previous_revision,extra_fields)
    VALUES(?,'admin@example.test','panel','created',?,'[]','{}',0,'[]')`);
  for(const [index,[input,expected]] of samples.entries()){
    const id=`HE-R${String(index+1).padStart(3,'0')}`;
    context.run(id,T0);seedListing(env,{id,available_on:input});
    db.prepare('DELETE FROM listing_event_context WHERE listing_id=?').run(id);
    const event=history(db,id)[0].data;
    assert.deepEqual(event.after.available_on,expected,`case ${index}`);
    assert.equal(JSON.stringify(event).includes(marker),false);
  }
});

test('SPR-01 A5: no-op, stale write and event failure cannot append or leave a partial edit',async()=>{
  const env=makeEnv(),db=env.DB.raw,cookie=await adminCookie();
  seedListing(env,{available_on:'2026-11-12'});install(db);
  const saved=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,available_on:'2027-02-28'}});
  assert.equal(saved.status,200);assert.equal(history(db,'HE-R001').length,1);
  const noop=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:saved.data.listing.updated_at,available_on:'2027-02-28'}});
  assert.equal(noop.status,200);assert.equal(history(db,'HE-R001').length,1);
  const stale=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,available_on:'2029-01-01'}});
  assert.equal(stale.status,409);assert.equal(history(db,'HE-R001').length,1);
  const before={...db.prepare('SELECT available_on,updated_at FROM listings WHERE id=?').get('HE-R001')};
  db.exec("CREATE TRIGGER fixture_reject_listing_event BEFORE INSERT ON events WHEN NEW.entity_type='listing' BEGIN SELECT RAISE(ABORT,'synthetic event failure'); END");
  const failed=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:before.updated_at,available_on:'2030-01-01'}});
  assert.equal(failed.status,500);
  assert.deepEqual({...db.prepare('SELECT available_on,updated_at FROM listings WHERE id=?').get('HE-R001')},before);
  assert.equal(history(db,'HE-R001').length,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM listing_event_context').get().n,0);
});

test('SPR-01 A5 proposal preserves old history and atomic behavior in local D1',async()=>{
  const require=createRequire(import.meta.url);
  const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,
    script:"export default {fetch(){return new Response('fixture')}}",compatibilityDate:'2025-10-01',
    host:'127.0.0.1',port:0,d1Databases:{DB:'spr01-history-fixture'}}));
  try{
    const DB=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())
      await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(sql=>DB.prepare(sql)));
    await DB.prepare("INSERT INTO admins(email,added_by,added_at) VALUES('admin@example.test','fixture',?)").bind(T0).run();
    const env=makeEnv();env.DB=DB;
    const cookie=await adminCookie(),body={title:'Synthetic listing',use:'residential',country:'Jersey',
      operation:'sale',availability:'for_sale',available_on:'2026-11-12'};
    const original=await call(env,'POST','/admin/listings',{cookie,body});
    assert.equal(original.status,201);
    const id=original.data.id;
    const events=async()=> (await DB.prepare("SELECT * FROM events WHERE entity_type='listing' AND entity_id=? ORDER BY id").bind(id).all()).results;
    const oldHistory=await events();assert.equal(oldHistory.length,1);
    const notices=async()=> (await DB.prepare('SELECT * FROM notifications ORDER BY id').all()).results;
    const oldNotices=await notices();
    const definitions=async()=>Object.fromEntries((await DB.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name IN ('listing_event_insert','listing_event_update') ORDER BY name").all()).results.map(row=>[row.name,row.sql]));
    const oldTriggers=await definitions();
    assert.deepEqual(Object.keys(oldTriggers),['listing_event_insert','listing_event_update']);
    if(existsSync(proposal))await DB.batch(unstable_splitSqlQuery(readFileSync(proposal,'utf8')).map(sql=>DB.prepare(sql)));
    assert.deepEqual(await events(),oldHistory);assert.deepEqual(await notices(),oldNotices);
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
    const changedTriggers=await definitions(),strip=s=>s.replace(/\/\* SPR01_AVAILABLE_ON_BEGIN \*\/[\s\S]*?\/\* SPR01_AVAILABLE_ON_END \*\//g,'').replace(/\s+/g,' ').trim();
    assert.equal((changedTriggers.listing_event_insert.match(/SPR01_AVAILABLE_ON_BEGIN/g)||[]).length,1);
    assert.equal((changedTriggers.listing_event_update.match(/SPR01_AVAILABLE_ON_BEGIN/g)||[]).length,2);
    for(const name of Object.keys(oldTriggers))assert.equal(strip(changedTriggers[name]),strip(oldTriggers[name]),name);
    const created=await call(env,'POST','/admin/listings',{cookie,body:{...body,title:'Another synthetic listing',available_on:'2028-02-29'}});
    assert.equal(created.status,201);
    const createdEvent=await DB.prepare("SELECT data FROM events WHERE entity_type='listing' AND entity_id=? ORDER BY id DESC LIMIT 1").bind(created.data.id).first();
    assert.equal(JSON.parse(createdEvent.data).after.available_on,'2028-02-29');
    const marker='SYNTHETIC_PRIVATE_AVAILABILITY',invalidId='HE-R888',invalidDate=`2028-02-29\0${marker}`;
    await DB.batch([
      DB.prepare(`INSERT INTO listing_event_context(listing_id,actor,source,action,at,derived_fields,related,previous_revision,extra_fields)
        VALUES(?,'admin@example.test','panel','created',?,'[]','{}',0,'[]')`).bind(invalidId,T0),
      DB.prepare(`INSERT INTO listings(id,use,title,operation,availability,country,created_at,updated_at,updated_by,available_on)
        VALUES(?,'residential','Synthetic legacy','sale','for_sale','Jersey',?,?,'fixture',?)`).bind(invalidId,T0,T0,invalidDate),
      DB.prepare('DELETE FROM listing_event_context WHERE listing_id=?').bind(invalidId),
    ]);
    const invalidCreated=JSON.parse((await DB.prepare("SELECT data FROM events WHERE entity_type='listing' AND entity_id=? ORDER BY id DESC LIMIT 1").bind(invalidId).first()).data);
    assert.deepEqual(invalidCreated.after.available_on,{unknown:true});assert.equal(JSON.stringify(invalidCreated).includes(marker),false);
    const repaired=await call(env,'PUT',`/admin/listings/${invalidId}`,{cookie,body:{updated_at:T0,available_on:null}});
    assert.equal(repaired.status,200);
    const invalidChanged=JSON.parse((await DB.prepare("SELECT data FROM events WHERE entity_type='listing' AND entity_id=? ORDER BY id DESC LIMIT 1").bind(invalidId).first()).data);
    assert.deepEqual(invalidChanged.before.available_on,{unknown:true});assert.equal(invalidChanged.after.available_on,null);
    assert.equal(JSON.stringify(invalidChanged).includes(marker),false);
    const safeHistory=await call(env,'GET',`/admin/listings/${invalidId}/history`,{cookie});
    assert.equal(safeHistory.status,200);assert.equal(JSON.stringify(safeHistory.data).includes(marker),false);
    const safeChange=safeHistory.data.items[0].changes.find(change=>change.field==='available_on');
    assert.equal(Object.hasOwn(safeChange,'before'),false);assert.equal(safeChange.after,null);
    const initial=await DB.prepare('SELECT updated_at FROM listings WHERE id=?').bind(id).first();
    const saved=await call(env,'PUT',`/admin/listings/${id}`,{cookie,body:{updated_at:initial.updated_at,available_on:'2027-02-28'}});
    assert.equal(saved.status,200);
    const changed=JSON.parse((await events()).at(-1).data);
    assert.deepEqual(changed.fields,['available_on']);
    assert.equal(changed.before.available_on,'2026-11-12');assert.equal(changed.after.available_on,'2027-02-28');
    const cleared=await call(env,'PUT',`/admin/listings/${id}`,{cookie,body:{updated_at:saved.data.listing.updated_at,available_on:null}});
    assert.equal(cleared.status,200);
    const afterClear=JSON.parse((await events()).at(-1).data);
    assert.equal(afterClear.before.available_on,'2027-02-28');assert.equal(afterClear.after.available_on,null);
    const count=(await events()).length;
    const noop=await call(env,'PUT',`/admin/listings/${id}`,{cookie,body:{updated_at:cleared.data.listing.updated_at,available_on:null}});
    assert.equal(noop.status,200);assert.equal((await events()).length,count);
    const stale=await call(env,'PUT',`/admin/listings/${id}`,{cookie,body:{updated_at:initial.updated_at,available_on:'2029-01-01'}});
    assert.equal(stale.status,409);assert.equal((await events()).length,count);
    const before=await DB.prepare('SELECT available_on,updated_at FROM listings WHERE id=?').bind(id).first();
    await DB.prepare("CREATE TRIGGER fixture_reject_listing_event BEFORE INSERT ON events WHEN NEW.entity_type='listing' BEGIN SELECT RAISE(ABORT,'synthetic event failure'); END").run();
    const failed=await call(env,'PUT',`/admin/listings/${id}`,{cookie,body:{updated_at:before.updated_at,available_on:'2030-01-01'}});
    assert.equal(failed.status,500);
    assert.deepEqual(await DB.prepare('SELECT available_on,updated_at FROM listings WHERE id=?').bind(id).first(),before);
    assert.equal((await events()).length,count);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM listing_event_context').first()).n,0);
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
  }finally{await mf.dispose();}
});
