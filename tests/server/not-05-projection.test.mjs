import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, T0 } from './helpers.mjs';

let missing;
try { missing = await import('../../server/missing-payments.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const needMissing = () => assert.ok(missing, 'La proyección NOT-05 todavía no existe');
const run = (env, sql, ...params) => env.DB.raw.prepare(sql).run(...params);
const count = (env, sql) => env.DB.raw.prepare(sql).get().n;

function fixture() {
  const env = makeEnv();
  run(env, "INSERT INTO landlords(name,created_at,updated_at) VALUES('Fixture owner',?,?)", T0, T0);
  run(env, "INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(1,'Fixture','St Helier','full',10,?,?)", T0, T0);
  run(env, `INSERT INTO tenancies(rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
    VALUES(1,'Fixture tenant','periodic','2025','2026-01-01',100,1,'2026-11-02',?,?)`, T0,T0);
  run(env, "INSERT INTO charges(tenancy_id,due_on,amount) VALUES(1,'2026-11-01',10000)");
  return env;
}

test('default grace displays a 1 November debt on 4 November, including an ended tenancy', async () => {
  needMissing(); const env=fixture();
  assert.deepEqual((await missing.missingPaymentRows(env,{today:'2026-11-03'})).rows, []);
  const result=await missing.missingPaymentRows(env,{today:'2026-11-04'});
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].tenancy_id,1); assert.equal(result.rows[0].rental_id,1);
  assert.equal(result.rows[0].oldest_unpaid_on,'2026-11-01');
  assert.equal(result.rows[0].debt_pence,10000); assert.equal(result.rows[0].visible_on,'2026-11-04');
  assert.equal(result.rows[0].tenant_name,undefined);
});

test('a real payment or writeoff removes only that debt; neither creates a payment', async () => {
  needMissing(); const env=fixture();
  const before=count(env,'SELECT COUNT(*) AS n FROM payments');
  run(env,`INSERT INTO charge_adjustments(charge_id,amount_pence,kind,effective_on,reason,created_at,created_by,operation_id)
    VALUES(1,10000,'writeoff','2026-11-04','Fixture',?,'fixture-staff',?)`,T0,crypto.randomUUID());
  assert.deepEqual((await missing.missingPaymentRows(env,{today:'2026-11-04'})).rows, []);
  assert.equal(count(env,'SELECT COUNT(*) AS n FROM payments'),before);
});

test('fractional financial records fail the scan instead of silently reporting no debt',async()=>{
  const env=fixture();
  run(env,'UPDATE charges SET amount=10000.5 WHERE id=1');
  run(env,"INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-11-03',10000.5,'rent','manual',?)",T0);
  await assert.rejects(missing.missingPaymentRows(env,{today:'2026-11-04'}),error=>error.status===503);
});

test('grace is bounded and does not change charges or arrears-step history', async () => {
  needMissing(); const env=fixture();
  run(env,"INSERT INTO arrears_steps(tenancy_id,charge_due_on,step,done_at,done_by) VALUES(1,'2026-11-01','reminder',?,'fixture-staff')",T0);
  assert.equal((await missing.missingPaymentRows(env,{today:'2026-11-02',grace_days:0})).rows.length,1);
  assert.equal((await missing.missingPaymentRows(env,{today:'2026-11-02',grace_days:30})).rows.length,0);
  for(const grace_days of [-1,31,1.5,'3']) await assert.rejects(missing.missingPaymentRows(env,{today:'2026-11-04',grace_days}),error=>error.status===400);
  assert.equal(env.DB.raw.prepare('SELECT due_on FROM charges').get().due_on,'2026-11-01');
  assert.equal(count(env,'SELECT COUNT(*) AS n FROM arrears_steps'),1);
});

test('the stored grace policy changes visibility and invalid configuration does not silently fall back', async () => {
  needMissing(); const env=fixture();
  run(env,"INSERT INTO app_settings(key,value,updated_at) VALUES('missing_payments',?,?)",JSON.stringify({grace_days:5,revision:2}),T0);
  assert.equal((await missing.missingPaymentRows(env,{today:'2026-11-04'})).rows.length,0);
  const later=await missing.missingPaymentRows(env,{today:'2026-11-06'});
  assert.equal(later.rows.length,1); assert.equal(later.policy_revision,2);
  run(env,"UPDATE app_settings SET value=? WHERE key='missing_payments'",JSON.stringify({grace_days:31,revision:3}));
  await assert.rejects(missing.missingPaymentRows(env,{today:'2026-11-06'}),error=>error.status===503);
});

test('the descriptor links the existing rental and tenancy without pretending a payment exists', async () => {
  needMissing(); const env=fixture();
  const result=(await missing.missingPaymentRows(env,{today:'2026-11-04'})).rows[0];
  const descriptor=missing.missingPaymentDescriptor(result);
  assert.equal(descriptor.taskKey,'rental:1:2026-11-01');
  assert.equal(descriptor.category,'payment');
  assert.deepEqual(descriptor.target,{kind:'rental',id:'1',context:{tenancy_id:1}});
  assert.equal(descriptor.resolved,false); assert.equal(descriptor.preserveDone,true);
  // Notification source versions come from observation event IDs. A finance
  // revision is a separate CAS token and must never be used as that clock.
  assert.equal(descriptor.sourceVersion,undefined);
  assert.equal(descriptor.observedFinancialRevision,result.source_revision);
  assert.equal(count(env,'SELECT COUNT(*) AS n FROM payments'),0);
  assert.throws(()=>missing.missingPaymentDescriptor({...result,debt_pence:0}),error=>error.status===400);
});

test('cursor pagination returns each matching tenancy once', async () => {
  needMissing(); const env=fixture();
  for(let i=0;i<2;i++){
    run(env,`INSERT INTO tenancies(rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
      VALUES(1,'Other fixture','periodic','2025','2026-01-01',100,1,'2026-11-02',?,?)`,T0,T0);
    run(env,"INSERT INTO charges(tenancy_id,due_on,amount) VALUES(?,'2026-11-01',10000)",i+2);
  }
  const seen=[];let after=null;
  do {const page=await missing.missingPaymentRows(env,{today:'2026-11-04',after,limit:1});seen.push(...page.rows.map(r=>r.tenancy_id));after=page.next;} while(after!==null);
  assert.deepEqual(seen,[1,2,3]);
});
