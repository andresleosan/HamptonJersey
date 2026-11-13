import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {makeEnv} from './helpers.mjs';
import {mutateTask} from '../../server/notification-tasks.js';
import {prepareSaleFollowup,closeSaleFollowup} from '../../server/sale-followup-store.js';

const ACTOR='staff@example.test',OTHER='other@example.test',AT='2026-11-02T10:00:00.000Z',T0='2020-01-01T00:00:00.000Z';
const GEN='00000000-0000-4000-8000-000000000001',GEN2='00000000-0000-4000-8000-000000000002';
const schedule={enabled:true,day:'mon',time:'09:00',activatedAt:'2026-11-02T08:00:00.000Z'};
const input={saleId:1,weekStart:'2026-11-02',sourceGeneration:GEN,sourceRevision:1,at:AT,schedule};
const proposal=readFileSync(new URL('../../docs/roadmap/work/OFE-06/store-prototype.sql',import.meta.url),'utf8');
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const count=async(db,table)=>Number((await first(db,`SELECT COUNT(*) n FROM ${table}`)).n);

async function seed(db){
  const statements=[
    ["INSERT INTO admins(email,added_at) VALUES(?,?),(?,?)",ACTOR,T0,OTHER,T0],
    ["INSERT INTO listings(id,use,title,operation,availability,created_at,updated_at) VALUES('HE-R001','residential','Fixture','sale','for_sale',?,?),('HE-R002','residential','Fixture','sale','for_sale',?,?)",T0,T0,T0,T0],
    ["INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at) VALUES(1,'Fixture','fixture1@example.test',?,?,?),(2,'Fixture','fixture2@example.test',?,?,?)",T0,T0,T0,T0,T0,T0],
    ["INSERT INTO applicants(id,contact_id,operation,source,created_at,updated_at) VALUES(1,1,'buy','phone',?,?),(2,2,'buy','phone',?,?)",T0,T0,T0,T0],
    ["INSERT INTO offers(id,listing_id,applicant_id,amount,created_at,updated_at) VALUES(1,'HE-R001',1,100,?,?),(2,'HE-R002',2,100,?,?)",T0,T0,T0,T0],
    ["INSERT INTO sales(id,listing_id,applicant_id,offer_id,price,created_at,updated_at) VALUES(1,'HE-R001',1,1,100,?,?),(2,'HE-R002',2,2,100,?,?)",T0,T0,T0,T0],
    ["INSERT INTO ofe06_sale_sources(sale_id,generation,revision) VALUES(1,?,1),(2,?,1)",GEN,GEN2],
    ["INSERT INTO case_purpose_policies(purpose,revision,status,retention_ref,privacy_ref,approval_ref,approved_by,valid_from) VALUES('sale_review',1,'approved','fixture','fixture','fixture','fixture',?)",T0],
    ["INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at,lifecycle_generation) VALUES('sale',1,?,'active',1,'fixture','fixture',?,1)",ACTOR,T0],
    ["INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,membership_version,policy_revision,approval_ref,approved_by,valid_from) VALUES('fixture-grant','sale',1,?,'case_data_write','sale_review','active',1,1,1,'fixture','fixture',?)",ACTOR,T0],
  ];
  await db.batch(statements.map(([sql,...args])=>db.prepare(sql).bind(...args)));
}
async function fixture(){const env=makeEnv();env.DB.raw.exec(proposal);await seed(env.DB);return env;}
const create=env=>prepareSaleFollowup(env,input,ACTOR);
const followupEvents=db=>first(db,"SELECT COUNT(*) n FROM events WHERE type IN ('sale.followup_due','sale.followup_closed')");

test('one sale and week yield one task on repeated or concurrent ticks without outbound effects',async()=>{
  const env=await fixture();
  const [a,b]=await Promise.all([create(env),create(env)]);
  assert.deepEqual([a.state,b.state].sort(),['created','existing']);
  assert.equal(a.followupId,b.followupId);assert.equal(a.taskId,b.taskId);
  assert.equal(await count(env.DB,'ofe06_followups'),1);
  assert.equal((await followupEvents(env.DB)).n,1);
  assert.equal(await count(env.DB,'outbound'),0);assert.equal(await count(env.DB,'email_attempts'),0);
  assert.equal(await count(env.DB,'ofe06_pending'),0);assert.equal(await count(env.DB,'ofe06_batch_assertions'),0);
});

test('stale revisions, wrong generation and closed sales do not create events or tasks',async()=>{
  for(const change of [
    "UPDATE sales SET price=101 WHERE id=1",
    "INSERT INTO sale_milestones(sale_id,key) VALUES(1,'mortgage')",
    "UPDATE sales SET status='completed',closed_at='2026-11-02T10:01:00.000Z' WHERE id=1",
    "UPDATE sales SET status='fallen_through',fell_through_reason='other',closed_at='2026-11-02T10:01:00.000Z' WHERE id=1",
  ]){
    const env=await fixture();env.DB.raw.exec(change);
    assert.equal((await create(env)).state,'unavailable');
    assert.equal((await followupEvents(env.DB)).n,0);assert.equal(await count(env.DB,'ofe06_followups'),0);
  }
  const env=await fixture();
  assert.equal((await prepareSaleFollowup(env,{...input,sourceGeneration:GEN2},ACTOR)).state,'unavailable');
  assert.equal((await followupEvents(env.DB)).n,0);
});

test('a sale closing between authorization and the transaction cannot create stale work',async()=>{
  const env=await fixture(),original=env.DB.batch.bind(env.DB);let injected=false;
  env.DB.batch=stmts=>{
    if(!injected&&stmts.some(s=>s.sql.includes('ofe06_pending'))){injected=true;
      env.DB.raw.exec("UPDATE sales SET status='completed',closed_at='2026-11-02T10:01:00.000Z' WHERE id=1");}
    return original(stmts);
  };
  assert.equal((await create(env)).state,'unavailable');assert.equal(injected,true);
  assert.equal((await followupEvents(env.DB)).n,0);assert.equal(await count(env.DB,'ofe06_followups'),0);
});

test('a failing task projection rolls back event, receipt and assertions',async()=>{
  const env=await fixture();env.DB.raw.exec("CREATE TRIGGER ofe06_fail_fixture BEFORE INSERT ON notifications WHEN NEW.task_key LIKE 'sale-followup:%' BEGIN SELECT RAISE(ABORT,'fixture projection failed'); END");
  await assert.rejects(create(env));
  assert.equal((await followupEvents(env.DB)).n,0);assert.equal(await count(env.DB,'ofe06_followups'),0);
  assert.equal(await count(env.DB,'ofe06_pending'),0);assert.equal(await count(env.DB,'ofe06_batch_assertions'),0);
});

test('a repeated tick preserves human Done, assignment and revision',async()=>{
  const env=await fixture(),created=await create(env);
  await mutateTask(env,created.taskId,ACTOR,{operation_id:crypto.randomUUID(),revision:1,action:'deadline',due_at:'2026-11-03T10:00:00.000Z'});
  await mutateTask(env,created.taskId,ACTOR,{operation_id:crypto.randomUUID(),revision:2,action:'claim'});
  await mutateTask(env,created.taskId,ACTOR,{operation_id:crypto.randomUUID(),revision:3,action:'done'});
  const read=()=>first(env.DB,'SELECT resolved_at,resolved_by,revision,due_at,assigned_to FROM notifications WHERE id=?',created.taskId);
  const before=await read(),again=await create(env);
  assert.equal(again.state,'existing');assert.deepEqual(await read(),before);
  assert.equal((await followupEvents(env.DB)).n,1);
});

test('source changes request review and closure preserves a human decision without duplicate events',async()=>{
  const env=await fixture(),created=await create(env);
  await mutateTask(env,created.taskId,ACTOR,{operation_id:crypto.randomUUID(),revision:1,action:'done'});
  const before=await first(env.DB,'SELECT resolved_at,resolved_by FROM notifications WHERE id=?',created.taskId);
  env.DB.raw.exec('INSERT INTO sale_milestones(sale_id,key) VALUES(1,\'mortgage\')');
  assert.equal((await prepareSaleFollowup(env,{...input,sourceRevision:2},ACTOR)).state,'needs_review');
  env.DB.raw.exec("UPDATE sales SET status='completed',closed_at='2026-11-02T10:01:00.000Z' WHERE id=1");
  const close={saleId:1,weekStart:input.weekStart,sourceGeneration:GEN,sourceRevision:3,at:'2026-11-02T10:02:00.000Z'};
  assert.equal((await closeSaleFollowup(env,{...close,sourceRevision:2},ACTOR)).state,'unavailable');
  assert.equal((await closeSaleFollowup(env,close,ACTOR)).state,'closed');
  assert.equal((await closeSaleFollowup(env,close,ACTOR)).state,'closed');
  const after=await first(env.DB,'SELECT resolved_at,resolved_by,closed_by_source FROM notifications WHERE id=?',created.taskId);
  assert.equal(after.resolved_at,before.resolved_at);assert.equal(after.resolved_by,before.resolved_by);
  assert.equal(after.closed_by_source,1);assert.equal((await followupEvents(env.DB)).n,2);
});

test('wrong sale, missing authority and revocation before commit fail without a new event',async()=>{
  const env=await fixture();
  await assert.rejects(prepareSaleFollowup(env,{...input,saleId:2,sourceGeneration:GEN2},ACTOR),e=>e.status===403);
  await assert.rejects(prepareSaleFollowup(env,input,OTHER),e=>e.status===403);
  const original=env.DB.batch.bind(env.DB);let injected=false;
  env.DB.batch=stmts=>{
    if(!injected&&stmts.some(s=>s.sql.includes('ofe06_pending'))){injected=true;
      env.DB.raw.exec("UPDATE case_capability_grants SET status='revoked',version=version+1 WHERE id='fixture-grant'");}
    return original(stmts);
  };
  await assert.rejects(create(env),e=>e.status===403);
  assert.equal(injected,true);assert.equal((await followupEvents(env.DB)).n,0);assert.equal(await count(env.DB,'ofe06_followups'),0);
});

test('a disabled, stale or unactivated schedule cannot select a week',async()=>{
  const env=await fixture();
  for(const altered of [
    {...input,schedule:{enabled:false}}, {...input,schedule:{...schedule,activatedAt:'2026-11-02T09:01:00.000Z'}},
    {...input,weekStart:'2026-10-26'}, {...input,at:'2026-02-30T00:00:00.000Z'},
  ])await assert.rejects(prepareSaleFollowup(env,altered,ACTOR),e=>e.status===400);
  assert.equal((await followupEvents(env.DB)).n,0);
});

test('the disconnected transaction and uniqueness work in disposable local D1',async()=>{
  const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'ofe06-store-fixture'}}));
  try{
    const DB=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())
      await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(sql=>DB.prepare(sql)));
    await DB.batch(unstable_splitSqlQuery(proposal).map(sql=>DB.prepare(sql)));await seed(DB);
    const env={DB};
    await run(DB,'UPDATE sales SET created_at=? WHERE id=1','2026-11-02T09:00:00.001Z');
    assert.equal((await prepareSaleFollowup(env,{...input,sourceRevision:2},ACTOR)).state,'unavailable');
    await run(DB,'UPDATE sales SET created_at=? WHERE id=1','2026-11-02T08:59:59.999Z');
    const valid={...input,sourceRevision:3};
    const previous={...valid,weekStart:'2026-10-26',schedule:{...schedule,activatedAt:'2026-10-26T08:00:00.000Z'}};
    assert.equal((await prepareSaleFollowup(env,previous,ACTOR)).state,'unavailable');
    assert.equal((await followupEvents(DB)).n,0);assert.equal(await count(DB,'ofe06_followups'),0);
    await run(DB,"CREATE TRIGGER ofe06_ignore_d1_fixture BEFORE INSERT ON notifications WHEN NEW.task_key LIKE 'sale-followup:%' BEGIN SELECT RAISE(IGNORE); END");
    await assert.rejects(prepareSaleFollowup(env,valid,ACTOR));
    assert.equal((await followupEvents(DB)).n,0);assert.equal(await count(DB,'ofe06_followups'),0);
    await run(DB,'DROP TRIGGER ofe06_ignore_d1_fixture');
    const [a,b]=await Promise.all([prepareSaleFollowup(env,valid,ACTOR),prepareSaleFollowup(env,valid,ACTOR)]);
    assert.deepEqual([a.state,b.state].sort(),['created','existing']);assert.equal(a.taskId,b.taskId);
    assert.equal((await followupEvents(DB)).n,1);assert.equal(await count(DB,'ofe06_followups'),1);
    await run(DB,"UPDATE sales SET status='completed',closed_at=? WHERE id=1",AT);
    const closed=await closeSaleFollowup(env,{saleId:1,weekStart:input.weekStart,sourceGeneration:GEN,sourceRevision:4,at:AT},ACTOR);
    assert.equal(closed.state,'closed');assert.equal((await followupEvents(DB)).n,2);
    assert.ok((await first(DB,'SELECT resolved_at FROM notifications WHERE id=?',a.taskId)).resolved_at);
    assert.equal(await count(DB,'outbound'),0);
  }finally{await mf.dispose();}
});

test('an inconsistent existing task or source event is never returned or closed as this sale',async()=>{
  for(const corruption of [
    "UPDATE notifications SET target_id='2' WHERE task_key LIKE 'sale-followup:%'",
    "UPDATE events SET data=json_set(data,'$.sale_id',2) WHERE type='sale.followup_due'",
    "UPDATE events SET type='fixture.other' WHERE type='sale.followup_due'",
  ]){
    const env=await fixture(),created=await create(env);env.DB.raw.exec(corruption);
    assert.deepEqual(await create(env),{state:'unavailable'});
    env.DB.raw.exec("UPDATE sales SET status='completed',closed_at='2026-11-02T10:01:00.000Z' WHERE id=1");
    const close={saleId:1,weekStart:input.weekStart,sourceGeneration:GEN,sourceRevision:2,at:'2026-11-02T10:02:00.000Z'};
    assert.deepEqual(await closeSaleFollowup(env,close,ACTOR),{state:'unavailable'});
    assert.equal((await first(env.DB,'SELECT resolved_at FROM notifications WHERE id=?',created.taskId)).resolved_at,null);
    assert.equal((await first(env.DB,"SELECT COUNT(*) n FROM events WHERE type='sale.followup_closed'")).n,0);
  }
});

test('a changed schedule for an already created week requests review without overwriting the task',async()=>{
  const env=await fixture(),created=await create(env);
  const before=await first(env.DB,'SELECT revision,due_at,resolved_at FROM notifications WHERE id=?',created.taskId);
  const revised={...schedule,time:'09:30',activatedAt:'2026-11-02T08:30:00.000Z'};
  const result=await prepareSaleFollowup(env,{...input,schedule:revised},ACTOR);
  assert.equal(result.state,'needs_review');assert.deepEqual(await first(env.DB,
    'SELECT revision,due_at,resolved_at FROM notifications WHERE id=?',created.taskId),before);
  assert.equal((await followupEvents(env.DB)).n,1);
});

test('a silently skipped task projection rolls back its event and receipt',async()=>{
  const env=await fixture();env.DB.raw.exec("CREATE TRIGGER ofe06_ignore_fixture BEFORE INSERT ON notifications WHEN NEW.task_key LIKE 'sale-followup:%' BEGIN SELECT RAISE(IGNORE); END");
  await assert.rejects(create(env));
  assert.equal((await followupEvents(env.DB)).n,0);assert.equal(await count(env.DB,'ofe06_followups'),0);
  assert.equal(await count(env.DB,'ofe06_pending'),0);assert.equal(await count(env.DB,'ofe06_batch_assertions'),0);
});

test('different authorized sales have separate weekly tasks',async()=>{
  const env=await fixture();
  await run(env.DB,"INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at,lifecycle_generation) VALUES('sale',2,?,'active',1,'fixture','fixture',?,1)",ACTOR,T0);
  await run(env.DB,"INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,membership_version,policy_revision,approval_ref,approved_by,valid_from) VALUES('fixture-grant-2','sale',2,?,'case_data_write','sale_review','active',1,1,1,'fixture','fixture',?)",ACTOR,T0);
  const a=await create(env),b=await prepareSaleFollowup(env,{...input,saleId:2,sourceGeneration:GEN2},ACTOR);
  assert.equal(a.state,'created');assert.equal(b.state,'created');assert.notEqual(a.taskId,b.taskId);
  assert.equal(await count(env.DB,'ofe06_followups'),2);assert.equal((await followupEvents(env.DB)).n,2);
});

test('a changed source during close leaves the task untouched until a fresh revision is used',async()=>{
  const env=await fixture(),created=await create(env);
  env.DB.raw.exec("UPDATE sales SET status='completed',closed_at='2026-11-02T10:01:00.000Z' WHERE id=1");
  const current={saleId:1,weekStart:input.weekStart,sourceGeneration:GEN,sourceRevision:2,at:'2026-11-02T10:02:00.000Z'};
  assert.equal((await closeSaleFollowup(env,{...current,at:AT},ACTOR)).state,'unavailable');
  const original=env.DB.batch.bind(env.DB);let injected=false;
  env.DB.batch=stmts=>{
    if(!injected&&stmts.some(s=>s.sql.includes('ofe06_pending'))){injected=true;env.DB.raw.exec('UPDATE sales SET price=101 WHERE id=1');}
    return original(stmts);
  };
  assert.equal((await closeSaleFollowup(env,current,ACTOR)).state,'unavailable');
  assert.equal(injected,true);assert.equal((await followupEvents(env.DB)).n,1);
  assert.equal((await first(env.DB,'SELECT resolved_at FROM notifications WHERE id=?',created.taskId)).resolved_at,null);
  env.DB.batch=original;
  assert.equal((await closeSaleFollowup(env,{...current,sourceRevision:3},ACTOR)).state,'closed');
  assert.ok((await first(env.DB,'SELECT resolved_at FROM notifications WHERE id=?',created.taskId)).resolved_at);
});

test('follow-up events contain only the minimal synthetic identifiers and schedule instant',async()=>{
  const env=await fixture();await create(env);
  const event=await first(env.DB,"SELECT data FROM events WHERE type='sale.followup_due'");
  const data=JSON.parse(event.data);
  assert.deepEqual(Object.keys(data).sort(),['due_at','sale_id','version','week_start']);
  assert.equal(await count(env.DB,'outbound'),0);
});

test('a chosen previous week and current week remain distinct and close independently',async()=>{
  const env=await fixture(),active={...schedule,activatedAt:'2026-10-26T08:00:00.000Z'};
  const previous={...input,weekStart:'2026-10-26',schedule:active};
  const current={...input,schedule:active};
  const a=await prepareSaleFollowup(env,previous,ACTOR),b=await prepareSaleFollowup(env,current,ACTOR);
  assert.equal(a.state,'created');assert.equal(b.state,'created');assert.notEqual(a.taskId,b.taskId);
  env.DB.raw.exec("UPDATE sales SET status='completed',closed_at='2026-11-02T10:01:00.000Z' WHERE id=1");
  const closing={saleId:1,sourceGeneration:GEN,sourceRevision:2,at:'2026-11-02T10:02:00.000Z'};
  assert.equal((await closeSaleFollowup(env,{...closing,weekStart:previous.weekStart},ACTOR)).state,'closed');
  assert.equal((await first(env.DB,'SELECT resolved_at FROM notifications WHERE id=?',b.taskId)).resolved_at,null);
  assert.equal((await closeSaleFollowup(env,{...closing,weekStart:current.weekStart},ACTOR)).state,'closed');
  assert.equal(await count(env.DB,'ofe06_followups'),2);assert.equal((await followupEvents(env.DB)).n,4);
});

test('a follow-up claiming a future source revision is not closed or silently repaired',async()=>{
  const env=await fixture(),created=await create(env);
  env.DB.raw.exec("UPDATE ofe06_followups SET source_revision=9 WHERE sale_id=1; UPDATE sales SET status='completed',closed_at='2026-11-02T10:01:00.000Z' WHERE id=1");
  const close={saleId:1,weekStart:input.weekStart,sourceGeneration:GEN,sourceRevision:2,at:'2026-11-02T10:02:00.000Z'};
  assert.deepEqual(await closeSaleFollowup(env,close,ACTOR),{state:'unavailable'});
  assert.equal((await first(env.DB,'SELECT resolved_at FROM notifications WHERE id=?',created.taskId)).resolved_at,null);
  assert.equal((await followupEvents(env.DB)).n,1);
});

test('invalid calendar identities and processing times fail before any write',async()=>{
  const env=await fixture();
  await assert.rejects(closeSaleFollowup(env,{...input,weekStart:'0000-01-03'},ACTOR),e=>e.status===400);
  await assert.rejects(closeSaleFollowup(env,{...input,at:'2026-02-30T10:00:00.000Z'},ACTOR),e=>e.status===400);
  assert.equal((await followupEvents(env.DB)).n,0);assert.equal(await count(env.DB,'ofe06_followups'),0);
});

test('a weekly candidate must be strictly after the sale creation instant',async()=>{
  for(const [createdAt,expected] of [
    ['2026-11-02T08:59:59.999Z','created'],
    ['2026-11-02T09:00:00.000Z','unavailable'],
    ['2026-11-02T09:00:00.001Z','unavailable'],
    ['2026-11-02T10:01:00.000Z','unavailable'],
  ]){
    const env=await fixture();
    await run(env.DB,'UPDATE sales SET created_at=? WHERE id=1',createdAt);
    const result=await prepareSaleFollowup(env,{...input,sourceRevision:2},ACTOR);
    assert.equal(result.state,expected);
    assert.equal((await followupEvents(env.DB)).n,expected==='created'?1:0);
    assert.equal(await count(env.DB,'ofe06_followups'),expected==='created'?1:0);
    assert.equal(await count(env.DB,'notifications'),expected==='created'?1:0);
    assert.equal(await count(env.DB,'case_capability_batch_assertions'),0);assert.equal(await count(env.DB,'outbound'),0);
  }
});

test('a prior-week candidate is excluded when the sale did not yet exist',async()=>{
  const env=await fixture();await run(env.DB,'UPDATE sales SET created_at=? WHERE id=1','2026-11-01T12:00:00.000Z');
  const active={...schedule,activatedAt:'2026-10-26T08:00:00.000Z'};
  const base={...input,sourceRevision:2,schedule:active};
  assert.equal((await prepareSaleFollowup(env,{...base,weekStart:'2026-10-26'},ACTOR)).state,'unavailable');
  assert.equal((await followupEvents(env.DB)).n,0);
  assert.equal((await prepareSaleFollowup(env,base,ACTOR)).state,'created');
  assert.equal((await followupEvents(env.DB)).n,1);assert.equal(await count(env.DB,'ofe06_followups'),1);
});

test('missing, malformed or impossible creation dates fail closed without side effects',async()=>{
  for(const createdAt of ['', 'invalid', '2026-02-30T09:00:00.000Z', '0000-01-01T00:00:00.000Z',
    '2026-11-02T08:00:00Z', '2026-11-02T08:00:00+00:00']){
    const env=await fixture();await run(env.DB,'UPDATE sales SET created_at=? WHERE id=1',createdAt);
    assert.equal((await prepareSaleFollowup(env,{...input,sourceRevision:2},ACTOR)).state,'unavailable');
    assert.equal((await followupEvents(env.DB)).n,0);assert.equal(await count(env.DB,'ofe06_followups'),0);
    assert.equal(await count(env.DB,'notifications'),0);assert.equal(await count(env.DB,'case_capability_batch_assertions'),0);
    assert.equal(await count(env.DB,'ofe06_pending'),0);assert.equal(await count(env.DB,'outbound'),0);
  }
});

test('creation date or source identity changed after the read cannot create stale work',async()=>{
  for(const kind of ['created_at','generation']){
    const env=await fixture(),original=env.DB.batch.bind(env.DB);let injected=false;
    env.DB.batch=stmts=>{
      if(!injected&&stmts.some(s=>s.sql.includes('ofe06_pending'))){
        injected=true;
        if(kind==='created_at'){
          env.DB.raw.exec('DROP TRIGGER ofe06_sale_changed');
          env.DB.raw.prepare('UPDATE sales SET created_at=? WHERE id=1').run('2026-11-01T00:00:00.000Z');
        }else{
          env.DB.raw.exec('DROP TRIGGER ofe06_source_no_rewind');
          env.DB.raw.prepare('UPDATE ofe06_sale_sources SET generation=? WHERE sale_id=1')
            .run('00000000-0000-4000-8000-000000000003');
        }
      }
      return original(stmts);
    };
    assert.deepEqual(await create(env),{state:'unavailable'});
    assert.equal(injected,true);assert.equal((await followupEvents(env.DB)).n,0);
    assert.equal(await count(env.DB,'ofe06_followups'),0);assert.equal(await count(env.DB,'outbound'),0);
  }
});

test('an existing follow-up is not returned if the creation date changes after the read',async()=>{
  const env=await fixture(),created=await create(env),original=env.DB.batch.bind(env.DB);let injected=false;
  env.DB.batch=stmts=>{
    if(!injected&&stmts.some(s=>s.sql.includes('ofe06_pending'))){
      injected=true;env.DB.raw.exec('DROP TRIGGER ofe06_sale_changed');
      env.DB.raw.prepare('UPDATE sales SET created_at=? WHERE id=1').run('2026-11-01T00:00:00.000Z');
    }
    return original(stmts);
  };
  assert.deepEqual(await create(env),{state:'unavailable'});assert.equal(injected,true);
  assert.equal((await followupEvents(env.DB)).n,1);assert.equal(await count(env.DB,'ofe06_followups'),1);
  assert.equal((await first(env.DB,'SELECT resolved_at FROM notifications WHERE id=?',created.taskId)).resolved_at,null);
});

test('an existing premature follow-up is not treated as valid after creation-date correction',async()=>{
  const env=await fixture(),created=await create(env);
  await run(env.DB,'UPDATE sales SET created_at=? WHERE id=1','2026-11-02T09:00:00.001Z');
  assert.deepEqual(await prepareSaleFollowup(env,{...input,sourceRevision:2},ACTOR),{state:'unavailable'});
  assert.equal((await followupEvents(env.DB)).n,1);assert.equal(await count(env.DB,'ofe06_followups'),1);
  assert.equal((await first(env.DB,'SELECT resolved_at FROM notifications WHERE id=?',created.taskId)).resolved_at,null);
});

test('an absent creation date in the guarded source read fails closed',async()=>{
  const env=await fixture(),original=env.DB.batch.bind(env.DB);let substituted=false;
  env.DB.batch=async stmts=>{
    const results=await original(stmts);
    const index=stmts.findIndex(s=>s.sql.includes('SELECT s.created_at FROM sales s'));
    if(index>=0){substituted=true;results[index].results[0].created_at=null;}
    return results;
  };
  assert.deepEqual(await create(env),{state:'unavailable'});assert.equal(substituted,true);
  assert.equal((await followupEvents(env.DB)).n,0);assert.equal(await count(env.DB,'notifications'),0);
  assert.equal(await count(env.DB,'ofe06_followups'),0);assert.equal(await count(env.DB,'case_capability_batch_assertions'),0);
});

test('a later schedule cannot legitimize an existing task due before the sale was born',async()=>{
  const env=await fixture();await create(env);
  await run(env.DB,'UPDATE sales SET created_at=? WHERE id=1','2026-11-02T09:15:00.000Z');
  const revised={...schedule,time:'09:30',activatedAt:'2026-11-02T08:30:00.000Z'};
  assert.deepEqual(await prepareSaleFollowup(env,{...input,sourceRevision:2,schedule:revised},ACTOR),{state:'unavailable'});
  assert.equal((await followupEvents(env.DB)).n,1);assert.equal(await count(env.DB,'ofe06_followups'),1);
});
