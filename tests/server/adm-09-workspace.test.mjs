import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeDb, T0 } from './helpers.mjs';

let workspace;
try { workspace=await import('../../server/finance-workspace.js'); }
catch(error) { if(error.code!=='ERR_MODULE_NOT_FOUND') throw error; }
let cases;
try { cases=await import('../../server/finance-cases.js'); }
catch(error) { if(error.code!=='ERR_MODULE_NOT_FOUND') throw error; }
const actor='admin@example.test',other='colleague@example.test';
const input={tenancy_id:1,as_of:'2026-02-10',limit:2};
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const denied=e=>e?.status===403&&!String(e.message).includes('10000');
async function seed(db) {
  await run(db,"INSERT INTO landlords(id,name,created_at,updated_at) VALUES(1,'Fixture',?,?)",T0,T0);
  for(const id of [1,2]){
    await run(db,"INSERT INTO rentals(id,landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(?,1,'Fixture','St Helier','full',10,?,?)",id,T0,T0);
    await run(db,`INSERT INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
      VALUES(?,?,'Fixture private name','periodic','2025','2026-01-01',100,1,'2026-01-31',?,?)`,id,id,T0,T0);
  }
  await run(db,"INSERT INTO charges(tenancy_id,due_on,amount) VALUES(1,'2026-01-01',10000)");
  await run(db,"INSERT INTO charges(tenancy_id,due_on,amount) VALUES(1,'2026-01-15',5000)");
  await run(db,"INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-01-10',5000,'rent','manual',?)",T0);
  await run(db,`INSERT INTO charge_adjustments(charge_id,amount_pence,kind,effective_on,reason,created_at,created_by,operation_id)
    VALUES(1,2000,'writeoff','2026-02-01','Fixture private reason',?,'fixture','fixture-operation')`,T0);
  await run(db,`INSERT INTO case_purpose_policies(purpose,revision,status,retention_ref,privacy_ref,approval_ref,approved_by,valid_from)
    VALUES('arrears_management',1,'approved','fixture-retention','fixture-privacy','fixture-policy','fixture','2000-01-01T00:00:00.000Z')`);
  await run(db,`INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at,lifecycle_generation)
    VALUES('tenancy',1,?,'active',1,'fixture-membership','fixture','2000-01-01T00:00:00.000Z',1)`,actor);
  await run(db,`INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from)
    VALUES('fixture-grant','tenancy',1,?,'sensitive_finance','arrears_management','active',1,1,1,
      'fixture-grant','fixture','2000-01-01T00:00:00.000Z')`,actor);
}
async function grantSecond(db){
  await run(db,`INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at,lifecycle_generation)
    VALUES('tenancy',2,?,'active',1,'fixture-membership-2','fixture','2000-01-01T00:00:00.000Z',1)`,actor);
  await run(db,`INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from)
    VALUES('fixture-grant-2','tenancy',2,?,'sensitive_finance','arrears_management','active',1,1,1,
      'fixture-grant-2','fixture','2000-01-01T00:00:00.000Z')`,actor);
}
const read=(env,over={},who=actor)=>{
  assert.ok(workspace?.readFinanceWorkspace,'the protected workspace is not implemented');
  return workspace.readFinanceWorkspace(env,{...input,...over},who);
};

test('the snapshot uses one case authority for balance, arrears, count and history without unnecessary private text',async()=>{
  const db=makeDb();await seed(db);const page=await read({DB:db});
  assert.equal(page.financial_status,'recorded_only');
  assert.equal(page.balance.due_pence,15000);assert.equal(page.balance.adjustments_pence,2000);
  assert.equal(page.balance.paid_pence,5000);assert.equal(page.balance.debt_pence,8000);
  assert.equal(page.arrears.oldest_unpaid_on,'2026-01-01');assert.equal(page.arrears.next_step,'letter');
  assert.equal(page.recorded_pending_count,1);assert.equal(page.reconciliation_ready,false);
  assert.equal(page.transactions.length,2);assert.ok(page.next);
  assert.doesNotMatch(JSON.stringify(page),/Fixture private/);
  for(const [over,who] of [[{},other],[{tenancy_id:2},actor],[{tenancy_id:999},actor]])
    await assert.rejects(read({DB:db},over,who),denied);
});

test('missing rent charges are unknown rather than a zero balance or a cleared task',async()=>{
  const db=makeDb();await seed(db);await grantSecond(db);
  const page=await read({DB:db},{tenancy_id:2});
  assert.equal(page.financial_status,'unknown');assert.equal(page.balance,null);
  assert.equal(page.arrears,null);assert.equal(page.recorded_pending_count,null);assert.equal(page.reconciliation_ready,false);
  assert.deepEqual(page.transactions,[]);
});

test('an explicit set of cases is read together with per-case authorization and unknown values preserved',async()=>{
  assert.ok(cases?.readFinanceCases,'the bounded case-set reader is not implemented');
  const db=makeDb();await seed(db);await grantSecond(db);
  const one=await read({DB:db},{limit:1});
  const result=await cases.readFinanceCases({DB:db},{tenancy_ids:[2,1],as_of:input.as_of},actor);
  assert.deepEqual(result.cases.map(item=>item.tenancy_id),[1,2]);
  assert.deepEqual(result.cases[0].balance,one.balance);assert.deepEqual(result.cases[0].arrears,one.arrears);
  assert.equal(result.cases[0].source_revision,one.source_revision);assert.equal(result.cases[0].recorded_pending_count,one.recorded_pending_count);
  assert.equal(result.cases[1].financial_status,'unknown');assert.equal(result.cases[1].balance,null);
  assert.equal(result.cases[1].recorded_pending_count,null);assert.equal(result.cases[1].reconciliation_ready,false);
  assert.doesNotMatch(JSON.stringify(result),/Fixture private/);
});

test('a denied, missing, invalid or revoked case never yields a partial multi-case result',async()=>{
  assert.ok(cases?.readFinanceCases,'the bounded case-set reader is not implemented');
  const db=makeDb();await seed(db);const invoke=ids=>cases.readFinanceCases({DB:db},{tenancy_ids:ids,as_of:input.as_of},actor);
  await assert.rejects(invoke([1,2]),denied);await assert.rejects(invoke([1,999]),denied);
  for(const invalid of [[],[1,1],[0],Array.from({length:11},(_,i)=>i+1)])
    await assert.rejects(invoke(invalid),error=>error.status===400);
  await grantSecond(db);
  const batch=db.batch.bind(db);let revoked=false;
  db.batch=async statements=>{
    if(!revoked){revoked=true;await run(db,"UPDATE case_capability_grants SET status='revoked',version=version+1 WHERE id='fixture-grant-2'");}
    return batch(statements);
  };
  await assert.rejects(invoke([1,2]),denied);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM case_capability_batch_assertions').first()).n,0);
});

test('an invalid selected account fails the whole selection without contaminating other cases',async()=>{
  const db=makeDb();await seed(db);await grantSecond(db);
  await run(db,"INSERT INTO charges(tenancy_id,due_on,amount) VALUES(2,'2026-01-01',100.5)");
  const invoke=ids=>cases.readFinanceCases({DB:db},{tenancy_ids:ids,as_of:input.as_of},actor);
  await assert.rejects(invoke([1,2]),error=>error.status===503);
  assert.equal((await invoke([1])).cases[0].balance.debt_pence,8000);
  await run(db,'DROP TRIGGER finance_arrears_step_insert');
  await assert.rejects(invoke([1]),error=>error.status===503);
});

test('deleting and recreating a tenancy cannot revive its old case capability',async()=>{
  const db=makeDb();await seed(db);await grantSecond(db);
  assert.equal((await read({DB:db},{tenancy_id:2})).financial_status,'unknown');
  await run(db,'DELETE FROM tenancies WHERE id=2');
  await run(db,`INSERT INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
    VALUES(2,2,'Different fixture','periodic','2025','2026-01-01',100,1,'2026-01-31',?,?)`,T0,T0);
  await assert.rejects(read({DB:db},{tenancy_id:2}),denied);
  assert.equal((await db.prepare("SELECT status FROM case_capability_grants WHERE id='fixture-grant-2'").first()).status,'revoked');
});

test('tenancy replacement conflicts and ID changes cannot transfer case access',async()=>{
  const db=makeDb();await seed(db);await grantSecond(db);
  await assert.rejects(run(db,`INSERT OR REPLACE INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
    VALUES(2,2,'Different fixture','periodic','2025','2026-01-01',100,1,'2026-01-31',?,?)`,T0,T0));
  await run(db,"UPDATE tenancies SET payment_ref='fixture-ref' WHERE id=2");
  await assert.rejects(run(db,`INSERT OR REPLACE INTO tenancies(id,rental_id,payment_ref,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
    VALUES(3,2,'fixture-ref','Different fixture','periodic','2025','2026-01-01',100,1,'2026-01-31',?,?)`,T0,T0));
  await run(db,'UPDATE tenancies SET ended_on=NULL WHERE id=2');
  await assert.rejects(run(db,`INSERT OR REPLACE INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,created_at,updated_at)
    VALUES(3,2,'Different fixture','periodic','2025','2026-01-01',100,1,?,?)`,T0,T0));
  await assert.rejects(run(db,'UPDATE tenancies SET id=3 WHERE id=2'));
  assert.equal((await read({DB:db},{tenancy_id:2})).financial_status,'unknown');
});

test('UPDATE OR REPLACE cannot erase a different tenancy through its unique fields',async()=>{
  const db=makeDb();await seed(db);await grantSecond(db);
  await run(db,"UPDATE tenancies SET payment_ref='fixture-ref' WHERE id=1");
  await assert.rejects(run(db,"UPDATE OR REPLACE tenancies SET payment_ref='fixture-ref' WHERE id=2"));
  await run(db,'UPDATE tenancies SET ended_on=NULL WHERE id=2');
  await assert.rejects(run(db,'UPDATE OR REPLACE tenancies SET rental_id=2,ended_on=NULL WHERE id=1'));
  assert.equal((await read({DB:db},{tenancy_id:2})).financial_status,'unknown');
});

test('a calculated zero from recorded transactions is not proof of complete history',async()=>{
  const db=makeDb();await seed(db);
  await run(db,"INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-02-02',8000,'rent','manual',?)",T0);
  const page=await read({DB:db});
  assert.equal(page.balance.debt_pence,0);assert.equal(page.financial_status,'recorded_only');
  assert.equal(page.reconciliation_ready,false);
});

test('bounded pages preserve order without duplicates for an unchanged snapshot',async()=>{
  const db=makeDb();await seed(db);let cursor=null;const entries=[];let pages=0;
  do{const page=await read({DB:db},{cursor});entries.push(...page.transactions.map(x=>`${x.type}:${x.id}`));cursor=page.next;pages++;}while(cursor);
  assert.equal(pages,2);assert.deepEqual(entries,['charge:1','payment:1','charge:2','adjustment:1']);
  assert.equal(new Set(entries).size,4);
});

test('payment or a human step after the first page invalidates the continuation',async()=>{
  for(const change of ['payment','step']){
    const db=makeDb();await seed(db);const first=await read({DB:db});
    if(change==='payment') await run(db,"INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-02-02',100,'rent','manual',?)",T0);
    else await run(db,"INSERT INTO arrears_steps(tenancy_id,charge_due_on,step,done_at,done_by) VALUES(1,'2026-01-01','letter',?,'fixture')",T0);
    await assert.rejects(read({DB:db},{cursor:first.next}),error=>error.status===409);
  }
});

test('a step changed and restored between pages still invalidates the earlier snapshot',async()=>{
  const db=makeDb();await seed(db);const first=await read({DB:db});
  await run(db,"INSERT INTO arrears_steps(tenancy_id,charge_due_on,step,done_at,done_by) VALUES(1,'2026-01-01','letter',?,'fixture')",T0);
  await run(db,"DELETE FROM arrears_steps WHERE tenancy_id=1 AND charge_due_on='2026-01-01' AND step='letter'");
  await assert.rejects(read({DB:db},{cursor:first.next}),error=>error.status===409);
});

test('a missing revision trigger makes the scoped reader unavailable',async()=>{
  const db=makeDb();await seed(db);await run(db,'DROP TRIGGER finance_arrears_step_insert');
  await assert.rejects(read({DB:db}),error=>error.status===503);
});

test('a concurrent receipt cannot make the snapshot and its transaction list disagree',async()=>{
  const db=makeDb();await seed(db);const batch=db.batch.bind(db);let inserted=false;
  db.batch=async statements=>{
    if(!inserted){inserted=true;await run(db,"INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-02-02',100,'rent','manual',?)",T0);}
    return batch(statements);
  };
  const page=await read({DB:db},{limit:50});
  assert.equal(page.balance.paid_pence,5100);
  assert.equal(page.transactions.filter(x=>x.type==='payment'&&x.kind==='rent').reduce((sum,x)=>sum+x.amount_pence,0),5100);
});

test('revocation denies a continuation and malformed or mismatched cursors are rejected',async()=>{
  const db=makeDb();await seed(db);const first=await read({DB:db});
  await assert.rejects(read({DB:db},{cursor:{...first.next,date:'not-a-date'}}),error=>error.status===400);
  await assert.rejects(read({DB:db},{as_of:'2026-02-11',cursor:first.next}),error=>error.status===409);
  await run(db,"UPDATE case_capability_memberships SET status='revoked',version=version+1 WHERE case_id=1");
  await assert.rejects(read({DB:db},{cursor:first.next}),denied);
});

test('a cursor cannot be reused at a different position or after a capability is reissued',async()=>{
  const db=makeDb();await seed(db);const first=await read({DB:db});
  await assert.rejects(read({DB:db},{cursor:{...first.next,id:first.next.id+1}}),error=>error.status===409);
  await run(db,"UPDATE case_capability_grants SET status='revoked',version=version+1 WHERE id='fixture-grant'");
  await run(db,`INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from)
    VALUES('fixture-new-grant','tenancy',1,?,'sensitive_finance','arrears_management','active',1,1,1,
      'fixture-new-grant','fixture','2000-01-01T00:00:00.000Z')`,actor);
  await assert.rejects(read({DB:db},{cursor:first.next}),error=>error.status===409);
});

test('invalid historical pence is an error rather than a zero or a partial response',async()=>{
  const db=makeDb();await seed(db);await run(db,"INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-02-02',100.5,'rent','manual',?)",T0);
  await assert.rejects(read({DB:db}),error=>error.status===503);
});

test('real local D1 rolls back a revoked read and permits a correctly scoped snapshot',async()=>{
  const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'workspace-synthetic'}}));
  try{
    const db=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(sql=>db.prepare(sql)));
    await run(db,"INSERT INTO admins(email,added_by,added_at) VALUES(?,'fixture',?)",actor,T0);await seed(db);
    const revision=async()=>(await db.prepare('SELECT financial_revision AS n FROM tenancies WHERE id=1').first()).n;
    const before=await revision();
    await assert.rejects(db.batch([
      db.prepare("INSERT INTO arrears_steps(tenancy_id,charge_due_on,step,done_at,done_by) VALUES(1,'2026-01-01','letter',?,'fixture')").bind(T0),
      db.prepare("INSERT INTO case_capability_batch_assertions(id,permitted) VALUES('fixture-rollback',0)"),
    ]));
    assert.equal(await revision(),before);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM arrears_steps WHERE tenancy_id=1').first()).n,0);
    await run(db,"INSERT INTO arrears_steps(tenancy_id,charge_due_on,step,done_at,done_by) VALUES(1,'2026-01-01','letter',?,'fixture')",T0);
    assert.equal(await revision(),before+1);
    await run(db,"DELETE FROM arrears_steps WHERE tenancy_id=1 AND charge_due_on='2026-01-01' AND step='letter'");
    assert.equal(await revision(),before+2);
    const first=await read({DB:db});assert.equal(first.balance.debt_pence,8000);
    const [concurrent]=await Promise.all([
      read({DB:db},{limit:50}),
      run(db,"INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-02-02',100,'rent','manual',?)",T0),
    ]);
    assert.equal(concurrent.balance.paid_pence,
      concurrent.transactions.filter(x=>x.type==='payment'&&x.kind==='rent').reduce((sum,x)=>sum+x.amount_pence,0));
    for(let offset=0;offset<105;offset+=35)await db.batch(Array.from({length:35},()=>db.prepare(
      "INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-02-03',1,'rent','manual',?)").bind(T0)));
    const seen=[];let cursor=null,pages=0;
    do{const page=await read({DB:db},{limit:50,cursor});assert.ok(page.transactions.length<=50);
      seen.push(...page.transactions.map(item=>`${item.type}:${item.id}`));cursor=page.next;pages++;
    }while(cursor);
    assert.equal(pages,3);assert.equal(seen.length,110);assert.equal(new Set(seen).size,110);
    await grantSecond(db);
    const selected=await cases.readFinanceCases({DB:db},{tenancy_ids:[1,2],as_of:input.as_of},actor);
    assert.equal(selected.cases.length,2);assert.equal(selected.cases[1].financial_status,'unknown');
    for(let id=3;id<=10;id++)await db.batch([
      db.prepare("INSERT INTO rentals(id,landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(?,1,'Fixture','St Helier','full',10,?,?)").bind(id,T0,T0),
      db.prepare("INSERT INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at) VALUES(?,?,'Fixture','periodic','2025','2026-01-01',100,1,'2026-01-31',?,?)").bind(id,id,T0,T0),
      db.prepare("INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at,lifecycle_generation) VALUES('tenancy',?,?,'active',1,'fixture-membership','fixture','2000-01-01T00:00:00.000Z',1)").bind(id,actor),
      db.prepare(`INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
        membership_version,policy_revision,approval_ref,approved_by,valid_from)
        VALUES(?,'tenancy',?,?,'sensitive_finance','arrears_management','active',1,1,1,
          'fixture-grant','fixture','2000-01-01T00:00:00.000Z')`).bind(`fixture-grant-${id}`,id,actor),
    ]);
    const bounded=await cases.readFinanceCases({DB:db},{tenancy_ids:Array.from({length:10},(_,i)=>i+1),as_of:input.as_of},actor);
    assert.equal(bounded.cases.length,10);assert.equal(new Set(bounded.cases.map(item=>item.tenancy_id)).size,10);
    const setWrapped={prepare:db.prepare.bind(db),withSession:db.withSession?.bind(db),batch:async statements=>{
      await run(db,"UPDATE case_capability_grants SET status='revoked',version=version+1 WHERE id='fixture-grant-2'");
      return db.batch(statements);
    }};
    await assert.rejects(cases.readFinanceCases({DB:setWrapped},{tenancy_ids:[1,2],as_of:input.as_of},actor),denied);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM case_capability_batch_assertions').first()).n,0);
    const wrapped={prepare:db.prepare.bind(db),withSession:db.withSession?.bind(db),batch:async statements=>{
      await run(db,"UPDATE case_capability_grants SET status='revoked',version=version+1 WHERE id='fixture-grant'");
      return db.batch(statements);
    }};
    await assert.rejects(read({DB:wrapped},{cursor:first.next}),denied);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM case_capability_batch_assertions').first()).n,0);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  }finally{await mf.dispose();}
});
