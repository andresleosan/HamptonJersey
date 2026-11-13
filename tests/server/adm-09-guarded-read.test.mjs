import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeDb, T0 } from './helpers.mjs';
import * as finance from '../../server/arrears-policy.js';
const {readTenancyBalance}=finance;

const actor = 'admin@example.test', other = 'colleague@example.test';
const params = { tenancy_id: 1, as_of: '2026-02-10' };
const denied = error => error?.status === 403 && !String(error.message).includes('10000');
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();

async function seed(db) {
  await run(db,"INSERT INTO landlords(id,name,created_at,updated_at) VALUES(1,'Fixture',?,?)",T0,T0);
  for (const id of [1,2]) {
    await run(db,"INSERT INTO rentals(id,landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(?,1,'Fixture','St Helier','full',10,?,?)",id,T0,T0);
    await run(db,`INSERT INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
      VALUES(?,?,'Fixture','periodic','2025','2026-01-01',100,1,'2026-01-31',?,?)`,id,id,T0,T0);
    await run(db,"INSERT INTO charges(tenancy_id,due_on,amount) VALUES(?,'2026-01-01',10000)",id);
  }
  await run(db,`INSERT INTO case_purpose_policies(purpose,revision,status,retention_ref,privacy_ref,approval_ref,approved_by,valid_from)
    VALUES('arrears_management',1,'approved','fixture-retention','fixture-privacy','fixture-policy','fixture','2000-01-01T00:00:00.000Z')`);
  await run(db,`INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at)
    VALUES('tenancy',1,?,'active',1,'fixture-membership','fixture','2000-01-01T00:00:00.000Z')`,actor);
  await run(db,`INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from)
    VALUES('fixture-grant','tenancy',1,?,'sensitive_finance','arrears_management','active',1,1,1,
      'fixture-grant','fixture','2000-01-01T00:00:00.000Z')`,actor);
}

test('only a member with the correct case, purpose and sensitive-finance capability can read a balance', async () => {
  const db=makeDb(); await seed(db); const env={DB:db};
  for (const [input,who] of [[params,undefined],[params,other],[{...params,tenancy_id:2},actor],
    [{...params,tenancy_id:999},actor]]) {
    await assert.rejects(readTenancyBalance(env,input,who),denied);
  }
  const result=await readTenancyBalance(env,params,actor);
  assert.equal(result.debt_pence,10000);
  assert.equal(result.oldest_unpaid_on,'2026-01-01');
  assert.equal(result.tenant_name,undefined);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM case_capability_batch_assertions').first()).n,0);
});

test('arrears steps and balance are read together only for the authorized case', async () => {
  assert.equal(typeof finance.readTenancyArrears,'function');
  const db=makeDb(); await seed(db); const env={DB:db};
  await assert.rejects(finance.readTenancyArrears(env,params,other),denied);
  const before=await finance.readTenancyArrears(env,params,actor);
  assert.equal(before.balance,10000); assert.equal(before.next_step,'letter');
  assert.equal(before.oldest_unpaid_on,'2026-01-01');
  assert.ok(Number.isSafeInteger(before.source_revision));
  await run(db,"INSERT INTO arrears_steps(tenancy_id,charge_due_on,step,done_at,done_by) VALUES(1,'2026-01-01','letter',?,'fixture')",T0);
  const after=await finance.readTenancyArrears(env,params,actor);
  assert.equal(after.next_step,null); assert.equal(after.balance,10000);
});

test('fractional legacy amounts fail closed even when the fractional values cancel out', async () => {
  for (const table of ['charges','payments']) {
    const db=makeDb(); await seed(db);
    if (table==='charges') {
      await run(db,'UPDATE charges SET amount=10000.5 WHERE id=1');
      await run(db,"INSERT INTO charges(tenancy_id,due_on,amount) VALUES(1,'2026-01-15',9999.5)");
    } else {
      await run(db,"INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-01-02',1000.5,'rent','manual',?)",T0);
      await run(db,"INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-01-03',999.5,'rent','manual',?)",T0);
    }
    for (const read of [finance.readTenancyBalance,finance.readTenancyArrears])
      await assert.rejects(read({DB:db},params,actor),error=>error?.status===503 && !String(error.message).includes('10000'));
  }
});

test('revocation between preflight and read yields no balance and rolls back the assertion', async () => {
  const db=makeDb(); await seed(db); const batch=db.batch.bind(db); let intercepted=false;
  db.batch=async statements=>{
    if (!intercepted) {
      intercepted=true;
      await run(db,"UPDATE case_capability_grants SET status='revoked',version=version+1 WHERE id='fixture-grant'");
    }
    return batch(statements);
  };
  await assert.rejects(readTenancyBalance({DB:db},params,actor),denied);
  assert.equal(intercepted,true);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM case_capability_batch_assertions').first()).n,0);
});

test('real local D1 rejects a late read when the membership is revoked after preflight', async () => {
  const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'guarded-finance-synthetic'}}));
  try {
    const db=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(sql=>db.prepare(sql)));
    await run(db,"INSERT INTO admins(email,added_by,added_at) VALUES(?,'fixture',?)",actor,T0);
    await seed(db);
    const permitted=await finance.readTenancyArrears({DB:db},params,actor);
    assert.equal(permitted.balance,10000); assert.equal(permitted.next_step,'letter');
    const wrapped={prepare:db.prepare.bind(db),withSession:db.withSession?.bind(db),batch:async statements=>{
      await run(db,"UPDATE case_capability_memberships SET status='revoked',version=version+1 WHERE case_id=1");
      return db.batch(statements);
    }};
    await assert.rejects(readTenancyBalance({DB:wrapped},params,actor),denied);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM case_capability_batch_assertions').first()).n,0);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally { await mf.dispose(); }
});
