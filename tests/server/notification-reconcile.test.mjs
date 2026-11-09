import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,seedListing,T0} from './helpers.mjs';
import {mutateTask} from '../../server/notification-tasks.js';
import {rentalEvent} from '../../server/routes/rentals.js';
import {createRequire} from 'node:module';
import {readdirSync,readFileSync} from 'node:fs';

const AT='2026-11-09T12:00:00.000Z',ADMIN='admin@example.test';
function fixture(){const env=makeEnv();seedListing(env);env.DB.raw.exec(`
  INSERT INTO landlords(name,created_at,updated_at) VALUES('Fixture','${T0}','${T0}');
  INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at)
    VALUES(1,'Fixture rental','St Helier','full',10,'${T0}','${T0}');
  INSERT INTO tenancies(rental_id,tenant_name,kind,regime,start_on,end_on,rent,due_day,payment_ref,created_at,updated_at)
    VALUES(1,'Fixture tenant','fixed','2025','2026-11-08','2026-12-31',100,1,'FIXTURE','${T0}','${T0}');
  INSERT INTO repairs(rental_id,title,urgency,created_at,updated_at) VALUES(1,'Private repair','emergency','${T0}','${T0}');
  INSERT INTO payments(received_on,amount,kind,source,created_at) VALUES('2026-11-08',100,'rent','manual','${T0}');`);return env;}
const rows=(env,sql,...args)=>env.DB.raw.prepare(sql).all(...args);
const tasks=env=>rows(env,"SELECT * FROM notifications WHERE task_key LIKE 'queue:%' ORDER BY id");
const pass=async(env,at=AT)=>(await import('../../server/notification-reconcile.js')).notificationsPass(env,at);

test('current queues reconcile once, retain human Done on context edits and close disappeared predicates',async()=>{
  const env=fixture();await pass(env);let ts=tasks(env);
  assert.ok(ts.some(t=>t.title==='Emergency repair'));assert.ok(ts.some(t=>t.title==='Unmatched payment'));assert.ok(ts.some(t=>t.title==='Decide renewal'));
  const before=rows(env,'SELECT COUNT(*) AS n FROM events')[0].n;await pass(env);assert.equal(rows(env,'SELECT COUNT(*) AS n FROM events')[0].n,before);
  const task=ts.find(t=>t.title==='Emergency repair');await mutateTask(env,task.id,ADMIN,{operation_id:crypto.randomUUID(),revision:task.revision,action:'done'});
  env.DB.raw.exec("UPDATE repairs SET title='Changed title' WHERE id=1");await pass(env);assert.ok(tasks(env).find(t=>t.id===task.id).resolved_at);
  const revision=tasks(env).find(t=>t.id===task.id).revision;
  env.DB.raw.exec("UPDATE repairs SET status='in_progress' WHERE id=1");await pass(env);
  const updated=tasks(env).find(t=>t.id===task.id);assert.ok(updated.resolved_at);assert.equal(updated.closed_by_source,0);assert.ok(updated.revision>revision);
  env.DB.raw.exec("UPDATE repairs SET urgency='routine' WHERE id=1");await pass(env);const closed=tasks(env).find(t=>t.id===task.id);assert.equal(closed.closed_by_source,1);
  env.DB.raw.exec("UPDATE repairs SET urgency='emergency' WHERE id=1");await pass(env);assert.equal(tasks(env).find(t=>t.id===task.id).resolved_at,null);
});

test('the Jersey midnight boundary, including BST, controls warning entry and overdue dates',async()=>{
  const env=fixture();env.DB.raw.exec(`UPDATE tenancies SET start_on='2026-06-24',end_on='2027-12-31';
    INSERT INTO compliance_items(rental_id,kind,done_on,expires_on) VALUES(1,'eicr','2025-08-31','2026-08-31');`);
  await pass(env,'2026-07-01T22:59:00.000Z');assert.ok(!tasks(env).some(t=>t.title==='Check: Electrical safety (EICR)'));assert.ok(!tasks(env).some(t=>t.title==='Check-in report overdue'));
  await pass(env,'2026-07-01T23:01:00.000Z');assert.ok(tasks(env).some(t=>t.title==='Check: Electrical safety (EICR)'));assert.ok(tasks(env).some(t=>t.title==='Check-in report overdue'));
});

test('a newer source event between the grouped read and CAS aborts the stale pass before any observations',async()=>{
  const env=fixture(),original=env.DB.batch.bind(env.DB);let injected=false;
  env.DB.batch=stmts=>{if(!injected&&stmts.some(s=>/UPDATE notification_cursor/.test(s.sql))){injected=true;
    env.DB.raw.exec(`INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES('${AT}','system','rental','1','fixture.race')`);
  }return original(stmts);};
  assert.equal((await pass(env)).contended,true);assert.equal(tasks(env).length,0);assert.equal(rows(env,'SELECT * FROM notification_observations').length,0);
  env.DB.batch=original;await pass(env);assert.ok(tasks(env).length>0);
});

test('archival closes rental predicates and deletion clears its managed observation atomically',async()=>{
  const env=fixture();await pass(env);env.DB.raw.exec(`UPDATE rentals SET archived_at='${AT}' WHERE id=1`);await pass(env);
  assert.ok(tasks(env).filter(t=>t.target_kind==='rental').every(t=>t.resolved_at));
  env.DB.raw.exec('DELETE FROM payments WHERE id=1');const p=tasks(env).find(t=>t.title==='Deleted payment');assert.ok(p.resolved_at);assert.equal(p.target_deleted,1);
  assert.equal(rows(env,"SELECT * FROM notification_observations WHERE kind='payment'").length,0);
});

test('real exit and reentry between ticks reopens Done; a mere source edit does not',async()=>{
  const env=fixture();await pass(env);const repair=tasks(env).find(t=>t.title==='Emergency repair'),payment=tasks(env).find(t=>t.title==='Unmatched payment');
  for(const t of [repair,payment])await mutateTask(env,t.id,ADMIN,{operation_id:crypto.randomUUID(),revision:t.revision,action:'done'});
  await env.DB.batch([rentalEvent(env,{rental_id:1,actor:ADMIN,type:'repair.updated',data:{repair_id:1,before:{title:'Old'},after:{title:'New'}}})]);
  await pass(env);assert.ok(tasks(env).find(t=>t.id===repair.id).resolved_at);
  await env.DB.batch([rentalEvent(env,{rental_id:1,actor:ADMIN,type:'repair.updated',data:{repair_id:1,after:{urgency:'routine'}}}),
    rentalEvent(env,{rental_id:1,actor:ADMIN,type:'repair.updated',data:{repair_id:1,after:{urgency:'emergency'}}})]);
  env.DB.raw.exec('UPDATE payments SET tenancy_id=1 WHERE id=1');
  await env.DB.batch([rentalEvent(env,{rental_id:1,tenancy_id:1,actor:ADMIN,type:'payment.updated',data:{payment_id:1,after:{tenancy_id:1}}})]);
  env.DB.raw.exec('UPDATE payments SET tenancy_id=NULL WHERE id=1');
  await env.DB.batch([rentalEvent(env,{rental_id:1,tenancy_id:1,actor:ADMIN,type:'payment.updated',data:{payment_id:1,before:{tenancy_id:1},after:{tenancy_id:null}}})]);
  await pass(env);for(const t of [repair,payment])assert.equal(tasks(env).find(x=>x.id===t.id).resolved_at,null);
});

test('arrears, checks, tenancy deadlines, waiting offers, milestones and To confirm use actual domain cycles',async()=>{
  const env=fixture();env.DB.raw.exec(`
    UPDATE tenancies SET start_on='2026-10-01',deposit_received_on='2026-10-01' WHERE id=1;
    INSERT INTO charges(tenancy_id,due_on,amount) VALUES(1,'2026-10-01',10000);
    INSERT INTO compliance_items(rental_id,kind,done_on,expires_on) VALUES(1,'licence',NULL,NULL),(1,'gas','2025-11-01','2026-11-15');
    INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES('Fixture','buyer@example.test','${T0}','${T0}','${T0}');
    INSERT INTO applicants(contact_id,operation,source,created_at,updated_at) VALUES(1,'buy','phone','${T0}','${T0}');
    INSERT INTO offers(listing_id,applicant_id,amount,created_at,updated_at) VALUES('HE-R001',1,100,'${T0}','${T0}');
    UPDATE listings SET published=1,availability='for_sale',operation='sale',confirmed_at='2026-01-01T00:00:00.000Z' WHERE id='HE-R001';`);
  await pass(env);const titles=tasks(env).map(t=>t.title);
  for(const title of ['Arrears: Formal letter','Check: Rental dwelling licence','Check: Gas safety','Deposit protected overdue','Check-in report overdue','Waiting offer','Confirm property availability'])assert.ok(titles.includes(title),title);
  env.DB.raw.exec(`INSERT INTO sales(listing_id,applicant_id,offer_id,price,created_at,updated_at) VALUES('HE-R001',1,1,100,'${T0}','${T0}');
    INSERT INTO sale_milestones(sale_id,key,planned_on) VALUES(1,'mortgage','2026-11-01');`);
  await pass(env);assert.ok(tasks(env).find(t=>t.title==='Waiting offer').resolved_at);assert.ok(tasks(env).some(t=>t.target_kind==='sale'&&!t.resolved_at));
  const gas=tasks(env).find(t=>t.title==='Check: Gas safety');env.DB.raw.exec("UPDATE compliance_items SET expires_on='2026-12-01' WHERE kind='gas'");
  await pass(env);assert.equal(tasks(env).filter(t=>t.title==='Check: Gas safety').length,1);assert.ok(tasks(env).find(t=>t.id===gas.id).revision>gas.revision);
});

test('a race changing a predicate without an event cannot insert stale pending work or close a returned predicate',async()=>{
  const env=fixture(),original=env.DB.batch.bind(env.DB);let injected=false;
  env.DB.batch=stmts=>{if(!injected&&stmts.some(s=>/UPDATE notification_cursor/.test(s.sql))){injected=true;env.DB.raw.exec("UPDATE repairs SET urgency='routine' WHERE id=1");}return original(stmts);};
  await pass(env);assert.ok(!tasks(env).some(t=>t.title==='Emergency repair'&&!t.resolved_at));
  env.DB.batch=original;env.DB.raw.exec("UPDATE repairs SET urgency='emergency' WHERE id=1");await pass(env);
  env.DB.raw.exec("UPDATE repairs SET urgency='routine' WHERE id=1");injected=false;
  env.DB.batch=stmts=>{if(!injected&&stmts.some(s=>/UPDATE notification_cursor/.test(s.sql))){injected=true;env.DB.raw.exec("UPDATE repairs SET urgency='emergency' WHERE id=1");}return original(stmts);};
  await pass(env);assert.equal(tasks(env).find(t=>t.title==='Emergency repair').resolved_at,null);
});

test('cursor CAS loss and a failing projection roll back observations and event writes; old time cannot regress the cursor',async()=>{
  const env=fixture(),original=env.DB.batch.bind(env.DB);let injected=false;
  env.DB.batch=stmts=>{if(!injected&&stmts.some(s=>/UPDATE notification_cursor/.test(s.sql))){injected=true;env.DB.raw.exec('UPDATE notification_cursor SET revision=revision+1');}return original(stmts);};
  assert.equal((await pass(env)).contended,true);assert.equal(tasks(env).length,0);assert.equal(rows(env,'SELECT * FROM notification_observations').length,0);
  env.DB.batch=original;env.DB.raw.exec("CREATE TRIGGER fail_projection BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'projection failed');END;");
  await assert.rejects(pass(env),/projection failed/);assert.equal(rows(env,'SELECT * FROM events').length,0);
  env.DB.raw.exec('DROP TRIGGER fail_projection');await pass(env);const cursor=rows(env,'SELECT * FROM notification_cursor')[0];
  assert.equal((await pass(env,'2026-11-08T00:00:00.000Z')).contended,true);assert.deepEqual(rows(env,'SELECT * FROM notification_cursor')[0],cursor);
});

test('more than50 distributed identities advance in bounded passes without daily duplicate observations',async()=>{
  const env=fixture();for(let i=0;i<60;i++)env.DB.raw.prepare("INSERT INTO payments(received_on,amount,kind,source,created_at) VALUES('2026-11-08',100,'rent','manual',?)").run(T0);
  const a=await pass(env);assert.equal(a.processed,50);assert.equal(a.hasMore,true);assert.ok(tasks(env).length<=50);
  const b=await pass(env);assert.ok(b.processed<=50);assert.equal(b.hasMore,false);assert.equal(tasks(env).filter(t=>t.title==='Unmatched payment').length,61);
  const before=rows(env,'SELECT COUNT(*) AS n FROM events')[0].n;await pass(env,'2026-11-10T12:00:00.000Z');await pass(env,'2026-11-10T12:00:00.000Z');
  assert.equal(rows(env,'SELECT COUNT(*) AS n FROM events')[0].n,before);
});

test('actual D1 runtime handles the grouped predicates and fifty real projections within its SQL limits',async()=>{
  const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'not01-runtime-fixture'}}));
  try{
    const DB=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())
      await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(sql=>DB.prepare(sql)));
    await DB.batch(Array.from({length:61},()=>DB.prepare(`INSERT INTO payments(received_on,amount,kind,source,created_at)
      VALUES('2026-11-09',100,'rent','manual','${T0}')`)));
    const first=await pass({DB}),second=await pass({DB},'2026-11-09T12:01:00.000Z');
    assert.equal(first.processed,50);assert.equal(first.hasMore,true);assert.equal(second.processed,11);assert.equal(second.hasMore,false);
    assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE task_key LIKE 'queue:payment:%'").first()).n,61);
    const before=(await DB.prepare('SELECT COUNT(*) AS n FROM events').first()).n;
    await pass({DB},'2026-11-09T12:02:00.000Z');assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM events').first()).n,before);
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
  }finally{await mf.dispose();}
});
