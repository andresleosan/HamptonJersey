import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {makeEnv,T0} from './helpers.mjs';

// These fragments are deliberately disconnected; only a disposable SQLite fixture executes them.
const guard=readFileSync(new URL('../../docs/roadmap/work/ADM-03/repair-source-guard.prototype.sql',import.meta.url),'utf8');
const episodes=readFileSync(new URL('../../docs/roadmap/work/ADM-03/repair-episode.prototype.sql',import.meta.url),'utf8');
function fixture(){
  const env=makeEnv();env.DB.raw.exec(`
    INSERT INTO landlords(name,created_at,updated_at) VALUES('Fixture','${T0}','${T0}');
    INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES
      (1,'Fixture A','St Helier','full',10,'${T0}','${T0}'),
      (1,'Fixture B','St Helier','full',10,'${T0}','${T0}'),
      (1,'Fixture C','St Helier','full',10,'${T0}','${T0}');
    INSERT INTO tenancies(rental_id,tenant_name,kind,regime,start_on,end_on,rent,due_day,payment_ref,created_at,updated_at) VALUES
      (1,'Fixture A','fixed','2025','2026-11-08','2026-12-31',100,1,'FIXTURE-A','${T0}','${T0}'),
      (2,'Fixture B','fixed','2025','2026-11-08','2026-12-31',100,1,'FIXTURE-B','${T0}','${T0}');
    INSERT INTO repairs(rental_id,tenancy_id,title,urgency,created_at,updated_at) VALUES(1,1,'Fixture','emergency','${T0}','${T0}');
    CREATE TEMP TABLE selected_repairs(repair_id INTEGER NOT NULL);`);
  return env;
}
const snapshot=env=>Object.values(env.DB.raw.prepare('SELECT id,rental_id,tenancy_id,status,urgency,updated_at FROM repairs WHERE id=1').get());
const eligible=(env,args)=>env.DB.raw.prepare(`SELECT (${guard}) AS eligible`).get(...args).eligible===1;
const insertIfCurrent=(env,args)=>env.DB.raw.prepare(`INSERT INTO selected_repairs SELECT ?1 WHERE (${guard})`).run(...args).changes;
const episode=(env,rental)=>({...env.DB.raw.prepare(episodes).get(1,rental)});
function prior(env,{key,rental,active=1,deleted=0,context={repair_id:1}}){
  const db=env.DB.raw;
  const event=db.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES(?,'system','rental',?,'fixture.repair')")
    .run(T0,String(rental)).lastInsertRowid;
  db.prepare(`INSERT INTO notifications(task_key,event_id,source_version,category,title,action_required,created_at,target_kind,target_id,target_context,target_deleted)
    VALUES(?,?,?,'task','Emergency repair',1,?,'rental',?,?,?)`)
    .run(key,event,event,T0,String(rental),JSON.stringify(context),deleted);
  const cycle=key.endsWith(':current')?'current':`rental:${rental}`;
  db.prepare(`INSERT INTO notification_observations(task_key,kind,entity_id,cycle,signature,active,target_kind,target_id,event_id)
    VALUES(?,'repair','1',?,'fixture',?,'rental',?,?)`).run(key,cycle,active,String(rental),event);
}

test('inactive observation cannot make an open or merely source-closed other episode safe',()=>{
  const env=fixture(),key='queue:repair:1:current';
  prior(env,{key,rental:1,active:0});
  assert.equal(env.DB.raw.prepare('SELECT resolved_at FROM notifications WHERE task_key=?').get(key).resolved_at,null);
  let selected=episode(env,2);
  assert.equal(selected.task_key,null,'an open task still blocks a different property');
  assert.equal(selected.other_active,0);
  assert.equal(selected.other_episode,1);
  env.DB.raw.prepare("UPDATE notifications SET resolved_at=?,resolved_by='system',task_action='source_resolved' WHERE task_key=?").run(T0,key);
  const closed=env.DB.raw.prepare('SELECT resolved_at,closed_by_source FROM notifications WHERE task_key=?').get(key);
  assert.equal(closed.resolved_at,T0);assert.equal(closed.closed_by_source,1);
  selected=episode(env,2);
  assert.equal(selected.other_episode,1);
  assert.equal(selected.task_key,null,'source-closure metadata alone does not prove a safe transition');
});

test('unobserved tasks on another property block a new candidate even outside canonical keys',()=>{
  for(const key of ['queue:repair:1:current','queue:repair:1:rental:2','fixture:unexpected-key']){
    const env=fixture();prior(env,{key,rental:2,active:0});
    env.DB.raw.prepare('DELETE FROM notification_observations WHERE task_key=?').run(key);
    const selected=episode(env,1);
    assert.equal(selected.task_key,null,key);
    assert.equal(selected.other_episode,1,key);
    assert.equal(selected.identity_conflict,1,key);
  }
  const unrelated=fixture(),key='queue:repair:2:rental:2';
  prior(unrelated,{key,rental:2,active:0,context:{repair_id:2}});
  unrelated.DB.raw.prepare('DELETE FROM notification_observations WHERE task_key=?').run(key);
  assert.equal(episode(unrelated,1).task_key,'queue:repair:1:current');
  const inconsistent=fixture(),badKey='queue:repair:1:rental:2';
  prior(inconsistent,{key:badKey,rental:2,active:0,context:{repair_id:2}});
  inconsistent.DB.raw.prepare('DELETE FROM notification_observations WHERE task_key=?').run(badKey);
  assert.equal(episode(inconsistent,1).task_key,null,'a repair key still blocks when its context is inconsistent');
  assert.equal(episode(inconsistent,1).identity_conflict,1);
});

test('disconnected source guard checks actual repair, property and tenancy together',()=>{
  const env=fixture(),selected=snapshot(env);
  assert.equal(eligible(env,selected),true);
  assert.equal(eligible(env,[selected[0],2,...selected.slice(2)]),false,'different property');
  assert.equal(eligible(env,[selected[0],selected[1],null,...selected.slice(3)]),false,'stale missing tenancy');
  env.DB.raw.exec('UPDATE repairs SET tenancy_id=2 WHERE id=1');
  assert.equal(eligible(env,snapshot(env)),false,'tenancy belongs to another property');
  env.DB.raw.exec('UPDATE repairs SET tenancy_id=NULL WHERE id=1');
  assert.equal(eligible(env,snapshot(env)),true,'repair without tenancy remains valid');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM charges').get().n,0);
});

test('guarded write rechecks changed, revoked or deleted source at the write statement',()=>{
  for(const change of [
    "UPDATE repairs SET tenancy_id=NULL WHERE id=1",
    "UPDATE repairs SET status='in_progress' WHERE id=1",
    "UPDATE repairs SET urgency='routine' WHERE id=1",
    "UPDATE repairs SET updated_at='2026-11-10T00:00:00.000Z' WHERE id=1",
    "UPDATE rentals SET archived_at='2026-11-10T00:00:00.000Z' WHERE id=1",
    'UPDATE tenancies SET rental_id=3 WHERE id=1',
    'DELETE FROM repairs WHERE id=1',
  ]){
    const env=fixture(),selected=snapshot(env);
    env.DB.raw.exec(change);
    assert.equal(insertIfCurrent(env,selected),0,change.split(' SET ')[0]);
    assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM selected_repairs').get().n,0);
  }
  const env=fixture();assert.equal(insertIfCurrent(env,snapshot(env)),1,'unchanged valid source can pass the structural guard');
});

test('episode selection keeps the same task and blocks any unreconciled different episode',()=>{
  const env=fixture(),legacy='queue:repair:1:current',other='queue:repair:1:rental:2';
  assert.equal(episode(env,1).task_key,legacy);
  prior(env,{key:legacy,rental:1});
  assert.deepEqual(episode(env,1),{task_key:legacy,other_active:0,other_episode:0,identity_conflict:0,previously_observed:1});
  assert.deepEqual(episode(env,2),{task_key:null,other_active:1,other_episode:1,identity_conflict:0,previously_observed:0});
  env.DB.raw.prepare('UPDATE notification_observations SET active=0 WHERE task_key=?').run(legacy);
  assert.deepEqual(episode(env,2),{task_key:null,other_active:0,other_episode:1,identity_conflict:0,previously_observed:0});
  prior(env,{key:other,rental:2});
  assert.deepEqual(episode(env,1),{task_key:null,other_active:1,other_episode:1,identity_conflict:0,previously_observed:1});
});

test('episode selection reports a tombstone or incompatible identity instead of recycling it',()=>{
  const env=fixture(),legacy='queue:repair:1:current';
  prior(env,{key:legacy,rental:1,deleted:1});
  assert.equal(episode(env,1).identity_conflict,1);
  const other=fixture();prior(other,{key:legacy,rental:1,context:{repair_id:2}});
  assert.equal(episode(other,1).identity_conflict,1);
});

test('episode candidates are read-only and do not copy or erase a human decision',()=>{
  const env=fixture(),legacy='queue:repair:1:current';
  prior(env,{key:legacy,rental:1});
  env.DB.raw.prepare("UPDATE notifications SET resolved_at=?,resolved_by=?,due_at=? WHERE task_key=?")
    .run(T0,'admin@example.test','2026-11-12T00:00:00.000Z',legacy);
  const read=()=>env.DB.raw.prepare('SELECT id,revision,resolved_at,resolved_by,due_at FROM notifications WHERE task_key=?').get(legacy);
  const before={...read()};
  for(let n=0;n<3;n++){
    assert.equal(episode(env,1).task_key,legacy);
    assert.equal(episode(env,2).other_active,1);
  }
  assert.deepEqual({...read()},before);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE task_key LIKE 'queue:repair:%'").get().n,1);
});

test('episode prototype fails closed for incompatible scoped tasks and invalid numeric IDs',()=>{
  const env=fixture(),legacy='queue:repair:1:current',scoped='queue:repair:1:rental:2';
  prior(env,{key:legacy,rental:1,active:0});
  prior(env,{key:scoped,rental:1,active:0});
  assert.equal(episode(env,2).identity_conflict,1,'existing key belongs to another property');
  for(const [repair,rental] of [[0,1],[1,-1],[1.5,1],[1,1.5],[1,Number.MAX_SAFE_INTEGER+1]]){
    const result=env.DB.raw.prepare(episodes).get(repair,rental);
    assert.equal(result.identity_conflict,1);
  }
});

test('unchanged snapshots cannot establish that an unlogged source transition never happened',()=>{
  const env=fixture(),selected=snapshot(env);
  env.DB.raw.exec("UPDATE repairs SET urgency='routine' WHERE id=1; UPDATE repairs SET urgency='emergency' WHERE id=1");
  assert.equal(eligible(env,selected),true,'matching fields alone cannot detect an unlogged change and reversal');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM events').get().n,0);
});

test('disconnected source and episode queries also run against local D1',async()=>{
  const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'adm03-repair-fixture'}}));
  try{
    const DB=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())
      await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(sql=>DB.prepare(sql)));
    await DB.batch([
      DB.prepare('INSERT INTO landlords(name,created_at,updated_at) VALUES(?,?,?)').bind('Fixture',T0,T0),
      DB.prepare("INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(1,'Fixture','St Helier','full',10,?,?)").bind(T0,T0),
      DB.prepare("INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(1,'Fixture B','St Helier','full',10,?,?)").bind(T0,T0),
      DB.prepare("INSERT INTO tenancies(rental_id,tenant_name,kind,regime,start_on,end_on,rent,due_day,payment_ref,created_at,updated_at) VALUES(1,'Fixture','fixed','2025','2026-11-08','2026-12-31',100,1,'FIXTURE',?,?)").bind(T0,T0),
      DB.prepare("INSERT INTO repairs(rental_id,tenancy_id,title,urgency,created_at,updated_at) VALUES(1,1,'Fixture','emergency',?,?)").bind(T0,T0),
      DB.prepare('CREATE TABLE local_guard_fixture(repair_id INTEGER NOT NULL)'),
    ]);
    const args=[1,1,1,'reported','emergency',T0];
    assert.equal((await DB.prepare(`SELECT (${guard}) AS eligible`).bind(...args).first()).eligible,1);
    const candidate=await DB.prepare(episodes).bind(1,1).first();
    assert.equal(candidate.task_key,'queue:repair:1:current');
    assert.equal(candidate.other_active,0);assert.equal(candidate.identity_conflict,0);
    const priorEvent=await DB.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES(?,'system','rental','1','fixture.repair') RETURNING id").bind(T0).first();
    const legacy='queue:repair:1:current';
    await DB.batch([
      DB.prepare(`INSERT INTO notifications(task_key,event_id,source_version,category,title,action_required,created_at,target_kind,target_id,target_context)
        VALUES(?,?,?,'task','Emergency repair',1,?,'rental','1',?)`).bind(legacy,priorEvent.id,priorEvent.id,T0,JSON.stringify({repair_id:1})),
      DB.prepare(`INSERT INTO notification_observations(task_key,kind,entity_id,cycle,signature,active,target_kind,target_id,event_id)
        VALUES(?,'repair','1','current','fixture',0,'rental','1',?)`).bind(legacy,priorEvent.id),
    ]);
    const inactive=await DB.prepare(episodes).bind(1,2).first();
    assert.equal(inactive.task_key,null);assert.equal(inactive.other_active,0);
    assert.equal(inactive.other_episode,1);assert.equal(inactive.identity_conflict,0);
    await DB.prepare('DELETE FROM notification_observations WHERE task_key=?').bind(legacy).run();
    const unobserved=await DB.prepare(episodes).bind(1,2).first();
    assert.equal(unobserved.task_key,null);assert.equal(unobserved.other_episode,1);assert.equal(unobserved.identity_conflict,1);
    await DB.prepare("UPDATE repairs SET tenancy_id=NULL WHERE id=1").run();
    const inserted=await DB.prepare(`INSERT INTO local_guard_fixture SELECT ?1 WHERE (${guard})`).bind(...args).run();
    assert.equal(inserted.meta.changes,0);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM charges').first()).n,0);
  }finally{await mf.dispose();}
});

test('an existing candidate with missing or inconsistent observation needs manual reconciliation',()=>{
  for(const change of [
    "DELETE FROM notification_observations WHERE task_key='queue:repair:1:current'",
    "UPDATE notification_observations SET target_id='2' WHERE task_key='queue:repair:1:current'",
    "UPDATE notification_observations SET event_id=event_id+1000 WHERE task_key='queue:repair:1:current'",
  ]){
    const env=fixture(),key='queue:repair:1:current';prior(env,{key,rental:1});
    if(change.includes('event_id=event_id+1000')){
      const second=env.DB.raw.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES(?,'system','rental','1','fixture.repair')").run(T0).lastInsertRowid;
      env.DB.raw.prepare('UPDATE notification_observations SET event_id=? WHERE task_key=?').run(second,key);
    }else env.DB.raw.exec(change);
    assert.equal(episode(env,1).identity_conflict,1,'an unproven prior projection must not be reused');
  }
});
