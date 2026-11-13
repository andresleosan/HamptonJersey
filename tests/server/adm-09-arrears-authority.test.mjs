import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, T0 } from './helpers.mjs';
import * as finance from '../../server/arrears-policy.js';

const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
async function fixture() {
  const db=makeDb();
  await run(db,"INSERT INTO landlords(name,created_at,updated_at) VALUES('Fixture',?,?)",T0,T0);
  await run(db,"INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(1,'Fixture','St Helier','full',10,?,?)",T0,T0);
  await run(db,`INSERT INTO tenancies(rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
    VALUES(1,'Fixture','periodic','2025','2026-01-01',100,1,'2026-01-31',?,?)`,T0,T0);
  await run(db,"INSERT INTO charges(tenancy_id,due_on,amount) VALUES(1,'2026-01-01',10000)");
  await run(db,"INSERT INTO charges(tenancy_id,due_on,amount) VALUES(1,'2026-01-15',5000)");
  await run(db,"INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-01-02',7000,'rent','manual',?)",T0);
  await run(db,`INSERT INTO charge_adjustments(charge_id,amount_pence,kind,effective_on,reason,created_at,created_by,operation_id)
    VALUES(1,2000,'writeoff','2026-02-10','Fixture',?,'fixture','fixture-operation')`,T0);
  return db;
}
test('the internal arrears projection derives from the same balance, including adjustments and ended tenancies',async()=>{
  assert.ok(finance.ARREARS_BALANCE_CTES,'The common arrears projection is not implemented');
  const db=await fixture();
  const balance=await first(db,`WITH ${finance.FINANCIAL_BALANCE_CTES} SELECT * FROM finance_balances`,'2026-02-10',1,null);
  const arrears=await first(db,`WITH ${finance.ARREARS_BALANCE_CTES} SELECT * FROM arrears`,'2026-02-10',1);
  assert.equal(arrears.tenancy_id,1); assert.equal(arrears.balance,balance.debt_pence-balance.credit_pence);
  assert.equal(arrears.balance,6000); assert.equal(arrears.oldest_unpaid_on,balance.oldest_unpaid_on);
  assert.equal(arrears.source_revision,balance.source_revision); assert.equal(arrears.next_step,'letter');
  await run(db,"INSERT INTO arrears_steps(tenancy_id,charge_due_on,step,done_at,done_by) VALUES(1,'2026-01-01','letter',?,'fixture')",T0);
  const done=await first(db,`WITH ${finance.ARREARS_BALANCE_CTES} SELECT * FROM arrears`,'2026-02-10',1);
  assert.equal(done.next_step,null); assert.equal(done.balance,6000);
});

test('the arrears projection reserves later bind parameters for the calling statement',async()=>{
  assert.ok(finance.ARREARS_BALANCE_CTES,'The common arrears projection is not implemented');
  const db=await fixture();
  const row=await first(db,`WITH ${finance.ARREARS_BALANCE_CTES} SELECT balance,?3 AS caller_value FROM arrears WHERE oldest_unpaid_on=?3`,
    '2026-02-10',1,'2026-01-01');
  assert.equal(row.balance,6000); assert.equal(row.caller_value,'2026-01-01');
});
