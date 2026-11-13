import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, T0 } from './helpers.mjs';

let finance;
try { finance = await import('../../server/arrears-policy.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const needFinance = () => assert.ok(finance, 'La proyección financiera ADM-09 todavía no existe');
const run = (env, sql, ...params) => env.DB.raw.prepare(sql).run(...params);
const row = (env, sql, ...params) => env.DB.raw.prepare(sql).get(...params);

function fixture({ ended = true } = {}) {
  const env = makeEnv();
  run(env, "INSERT INTO landlords(name,created_at,updated_at) VALUES('Fixture landlord',?,?)", T0, T0);
  run(env, "INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(1,'Fixture address','St Helier','full',10,?,?)", T0, T0);
  run(env, `INSERT INTO tenancies(rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
    VALUES(1,'Fixture tenant','periodic','2025','2026-01-01',100,1,?,?,?)`, ended ? '2026-01-31' : null, T0, T0);
  return env;
}
function charge(env, date, amount) {
  return Number(run(env, 'INSERT INTO charges(tenancy_id,due_on,amount) VALUES(1,?,?)', date, amount).lastInsertRowid);
}
function payment(env, date, amount, kind = 'rent') {
  return Number(run(env, "INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,?,?,?,'manual',?)", date, amount, kind, T0).lastInsertRowid);
}
function adjustment(env, chargeId, amount, kind = 'writeoff', original = null, date = '2026-02-10') {
  return Number(run(env, `INSERT INTO charge_adjustments(charge_id,amount_pence,kind,original_adjustment_id,
    effective_on,reason,created_at,created_by,operation_id) VALUES(?,?,?,?,?,'Fixture reason',?,'fixture-staff',?)`,
    chargeId, amount, kind, original, date, T0, crypto.randomUUID()).lastInsertRowid);
}
// Arithmetic fixtures query the common projection directly. Access-control
// behavior is tested separately through the guarded reader.
const balance = (env, id = 1, date = '2026-02-10') => env.DB.prepare(`WITH ${finance.FINANCIAL_BALANCE_CTES}
  SELECT due_pence,adjustments_pence,paid_pence,debt_pence,credit_pence,oldest_unpaid_on,source_revision
  FROM finance_balances`).bind(date,id,null).first();

test('ended tenancy retains its debt and only rent payments reduce the balance', async () => {
  needFinance(); const env = fixture();
  charge(env, '2026-01-01', 10000); charge(env, '2026-01-15', 5000);
  payment(env, '2026-01-02', 7000); payment(env, '2026-01-03', 9000, 'deposit');
  payment(env, '2026-01-04', 2000, 'other'); payment(env, '2026-03-01', 10000);
  const got = await balance(env);
  assert.equal(got.due_pence, 15000); assert.equal(got.adjustments_pence, 0);
  assert.equal(got.paid_pence, 7000); assert.equal(got.debt_pence, 8000); assert.equal(got.credit_pence, 0);
  assert.equal(got.oldest_unpaid_on, '2026-01-01');
  assert.equal(got.tenant_name, undefined);
});

test('writeoff changes debt without inventing a payment and FIFO remains correct', async () => {
  needFinance(); const env = fixture();
  const first = charge(env, '2026-01-01', 10000); charge(env, '2026-01-15', 5000);
  payment(env, '2026-01-02', 7000); const before = await balance(env);
  adjustment(env, first, 2000); const after = await balance(env);
  assert.equal(after.adjustments_pence, 2000); assert.equal(after.paid_pence, 7000);
  assert.equal(after.debt_pence, 6000); assert.equal(after.oldest_unpaid_on, '2026-01-01');
  assert.ok(after.source_revision > before.source_revision);
  assert.equal(row(env, 'SELECT COUNT(*) AS n FROM payments').n, 1);
});

test('writeoff cannot exceed the unpaid amount of its charge after FIFO', async () => {
  needFinance(); const env = fixture();
  const first = charge(env, '2026-01-01', 10000), second = charge(env, '2026-01-15', 5000);
  payment(env, '2026-01-02', 12000);
  assert.throws(() => adjustment(env, first, 1));
  assert.throws(() => adjustment(env, second, 3001));
  adjustment(env, second, 3000);
  assert.equal((await balance(env)).debt_pence, 0);
  assert.equal(row(env, 'SELECT COUNT(*) AS n FROM charge_adjustments').n, 1);
});

test('adjustments cannot contain fractional pence', async () => {
  needFinance(); const env=fixture(); const id=charge(env,'2026-01-01',10000);
  assert.throws(()=>adjustment(env,id,1.5));
  assert.equal(row(env,'SELECT COUNT(*) AS n FROM charge_adjustments').n,0);
});

test('one reversal restores debt without altering payments and cannot exceed the original', async () => {
  needFinance(); const env = fixture();
  const id = charge(env, '2026-01-01', 10000), original = adjustment(env, id, 4000);
  assert.throws(() => adjustment(env, id, 4001, 'reversal', original));
  adjustment(env, id, 4000, 'reversal', original);
  assert.throws(() => adjustment(env, id, 1, 'reversal', original));
  const got = await balance(env);
  assert.equal(got.adjustments_pence, 0); assert.equal(got.debt_pence, 10000);
  assert.equal(row(env, 'SELECT COUNT(*) AS n FROM payments').n, 0);
});

test('a real later rent payment becomes credit after a full writeoff', async () => {
  needFinance(); const env = fixture();
  const id = charge(env, '2026-01-01', 10000); adjustment(env, id, 10000);
  payment(env, '2026-02-10', 4500);
  const got = await balance(env);
  assert.equal(got.debt_pence, 0); assert.equal(got.credit_pence, 4500);
  assert.equal(got.oldest_unpaid_on, null); assert.equal(row(env, 'SELECT COUNT(*) AS n FROM payments').n, 1);
});

test('FIFO projections match an independent allocation across varied synthetic accounts',async()=>{
  needFinance(); const env=fixture(); let seed=2039;
  const random=max=>{seed=(seed*16807)%2147483647;return seed%max;};
  for(let id=1;id<=40;id++){
    if(id>1) run(env,`INSERT INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
      VALUES(?,1,'Fixture','periodic','2025','2026-01-01',100,1,'2026-01-31',?,?)`,id,T0,T0);
    const charges=[];
    for(let n=1;n<=5;n++){
      const date=`2026-01-0${n}`,amount=100+random(9901);
      const inserted=run(env,'INSERT INTO charges(tenancy_id,due_on,amount) VALUES(?,?,?)',id,date,amount);
      charges.push({id:Number(inserted.lastInsertRowid),date,amount,adjusted:0});
    }
    const total=charges.reduce((sum,c)=>sum+c.amount,0),paid=random(total+10001);
    if(paid)run(env,"INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(?,'2026-01-10',?,'rent','manual',?)",id,paid,T0);
    let remaining=paid;
    for(const c of charges){const applied=Math.min(c.amount,remaining);remaining-=applied;c.unpaid=c.amount-applied;}
    const candidate=charges.find(c=>c.unpaid>0);
    if(candidate){
      candidate.adjusted=1+random(candidate.unpaid);
      adjustment(env,candidate.id,candidate.adjusted);
    }
    let available=paid,oldest=null;
    for(const c of charges){const net=c.amount-c.adjusted,applied=Math.min(net,available);available-=applied;if(oldest===null&&applied<net)oldest=c.date;}
    const adjusted=charges.reduce((sum,c)=>sum+c.adjusted,0),net=total-adjusted,actual=await balance(env,id);
    assert.equal(actual.debt_pence,Math.max(0,net-paid));
    assert.equal(actual.credit_pence,Math.max(0,paid-net));
    assert.equal(actual.adjustments_pence,adjusted);
    assert.equal(actual.oldest_unpaid_on,oldest);
  }
});

test('a backdated writeoff cannot bypass an existing later adjustment', async () => {
  needFinance(); const env = fixture();
  const id = charge(env, '2026-01-01', 10000); adjustment(env, id, 10000);
  assert.throws(() => adjustment(env, id, 10000, 'writeoff', null, '2026-01-31'));
  assert.equal(row(env, 'SELECT COUNT(*) AS n FROM charge_adjustments').n, 1);
  assert.equal((await balance(env)).adjustments_pence, 10000);
});

test('adjustment history cannot be replaced through unique key conflicts', async () => {
  needFinance(); const env = fixture();
  env.DB.raw.exec('PRAGMA recursive_triggers = OFF');
  const chargeId=charge(env,'2026-01-01',10000);
  const writeoff=adjustment(env,chargeId,2000);
  const original=row(env,'SELECT * FROM charge_adjustments WHERE id=?',writeoff);
  const replace=(id,kind,originalId,op)=>run(env,`INSERT OR REPLACE INTO charge_adjustments
    (id,charge_id,amount_pence,kind,original_adjustment_id,effective_on,reason,created_at,created_by,operation_id)
    VALUES(?,?,1000,?,?,'2026-02-10','Fixture',?,'fixture-staff',?)`,id,chargeId,kind,originalId,T0,op);
  assert.doesNotThrow(()=>replace(null,'writeoff',null,crypto.randomUUID()));
  assert.throws(()=>replace(writeoff,'writeoff',null,crypto.randomUUID()));
  assert.deepEqual(row(env,'SELECT * FROM charge_adjustments WHERE id=?',writeoff),original);
  assert.throws(()=>replace(null,'writeoff',null,original.operation_id));
  const reversal=adjustment(env,chargeId,1000,'reversal',writeoff);
  const reversed=row(env,'SELECT * FROM charge_adjustments WHERE id=?',reversal);
  assert.throws(()=>replace(null,'reversal',writeoff,crypto.randomUUID()));
  assert.deepEqual(row(env,'SELECT * FROM charge_adjustments WHERE id=?',reversal),reversed);
  assert.equal(row(env,'SELECT COUNT(*) AS n FROM charge_adjustments').n,3);
});

test('a charge cannot be reduced below its effective adjustments', async () => {
  needFinance(); const env = fixture();
  const id = charge(env, '2026-01-01', 10000); adjustment(env, id, 8000);
  assert.throws(() => run(env, 'UPDATE charges SET amount=1000 WHERE id=?', id));
  assert.equal(row(env, 'SELECT amount FROM charges WHERE id=?', id).amount, 10000);
});

test('reversing a writeoff does not permit a charge edit to invalidate an earlier adjustment', async () => {
  needFinance(); const env = fixture();
  const id = charge(env, '2026-01-01', 10000);
  const writeoff = adjustment(env, id, 8000, 'writeoff', null, '2026-01-31');
  adjustment(env, id, 8000, 'reversal', writeoff, '2026-02-10');
  assert.throws(() => run(env, 'UPDATE charges SET amount=1000 WHERE id=?', id));
  assert.equal(row(env, 'SELECT amount FROM charges WHERE id=?', id).amount, 10000);
  assert.equal((await balance(env, 1, '2026-01-31')).adjustments_pence, 8000);
});

test('source revision advances for charges, payments and adjustments and moves with a payment', async () => {
  needFinance(); const env = fixture();
  run(env, `INSERT INTO tenancies(rental_id,tenant_name,kind,regime,start_on,rent,due_day,created_at,updated_at)
    VALUES(1,'Other fixture','periodic','2025','2026-02-01',100,1,?,?)`, T0, T0);
  let before = await balance(env), other = await balance(env, 2);
  const id = charge(env, '2026-01-01', 10000); let after = await balance(env);
  assert.ok(after.source_revision > before.source_revision); before = after;
  const p = payment(env, '2026-01-02', 1000); after = await balance(env);
  assert.ok(after.source_revision > before.source_revision); before = after;
  adjustment(env, id, 1000); after = await balance(env);
  assert.ok(after.source_revision > before.source_revision);
  run(env, 'UPDATE payments SET tenancy_id=2 WHERE id=?', p);
  assert.ok((await balance(env)).source_revision > after.source_revision);
  assert.ok((await balance(env, 2)).source_revision > other.source_revision);
});

test('financial revisions cannot be reset or set to fractional values',async()=>{
  needFinance(); const env=fixture(); charge(env,'2026-01-01',10000);
  const before=(await balance(env)).source_revision;
  assert.throws(()=>run(env,'UPDATE tenancies SET financial_revision=1 WHERE id=1'));
  assert.throws(()=>run(env,'UPDATE tenancies SET financial_revision=2.5 WHERE id=1'));
  assert.equal((await balance(env)).source_revision,before);
});

test('unknown tenancy has no projection and invalid dates are rejected by the guarded reader', async () => {
  needFinance(); const env = fixture();
  assert.equal(await balance(env, 999),null);
  await assert.rejects(finance.readTenancyBalance(env,{tenancy_id:1,as_of:'2026-02-31'},'admin@example.test'),error=>error.status===400);
});

test('real local D1 serializes a payment and writeoff without fabricating or losing money', async () => {
  needFinance();
  const require = createRequire(import.meta.url);
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const { unstable_splitSqlQuery } = require('wrangler');
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: "export default {fetch(){return new Response('fixture')}}", compatibilityDate: '2025-10-01',
    host: '127.0.0.1', port: 0, d1Databases: { DB: 'finance-synthetic' } }));
  try {
    const db = await mf.getD1Database('DB'), dir = new URL('../../migrations/', import.meta.url);
    for (const name of readdirSync(dir).filter(name => name.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), 'utf8')).map(query => db.prepare(query)));
    await db.batch([
      db.prepare("INSERT INTO landlords(name,created_at,updated_at) VALUES('Fixture',?,?)").bind(T0,T0),
      db.prepare("INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(1,'Fixture','St Helier','full',10,?,?)").bind(T0,T0),
      db.prepare("INSERT INTO tenancies(rental_id,tenant_name,kind,regime,start_on,rent,due_day,created_at,updated_at) VALUES(1,'Fixture','periodic','2025','2026-01-01',100,1,?,?)").bind(T0,T0),
      db.prepare("INSERT INTO charges(tenancy_id,due_on,amount) VALUES(1,'2026-01-01',10000)"),
    ]);
    await assert.rejects(db.prepare(`INSERT INTO charge_adjustments(charge_id,amount_pence,kind,effective_on,reason,created_at,created_by,operation_id)
      VALUES(1,1.5,'writeoff','2026-02-10','Fixture reason',?,'fixture-staff',?)`).bind(T0,crypto.randomUUID()).run());
    const pay = db.prepare("INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-02-10',5000,'rent','manual',?)").bind(T0);
    const writeoff = db.prepare(`INSERT INTO charge_adjustments(charge_id,amount_pence,kind,effective_on,reason,created_at,created_by,operation_id)
      VALUES(1,10000,'writeoff','2026-02-10','Fixture reason',?,'fixture-staff',?)`).bind(T0,crypto.randomUUID());
    const [received, adjusted] = await Promise.allSettled([pay.run(), writeoff.run()]);
    assert.equal(received.status, 'fulfilled');
    const got = await balance({ DB: db });
    assert.equal(got.paid_pence, 5000);
    if (adjusted.status === 'fulfilled') {
      assert.equal(got.adjustments_pence, 10000); assert.equal(got.debt_pence, 0); assert.equal(got.credit_pence, 5000);
    } else {
      assert.equal(got.adjustments_pence, 0); assert.equal(got.debt_pence, 5000); assert.equal(got.credit_pence, 0);
    }
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM payments').first()).n, 1);
    for (let offset=0; offset<120; offset+=30) {
      await db.batch(Array.from({length:30},()=>db.prepare(`INSERT INTO tenancies
        (rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
        VALUES(1,'Fixture','periodic','2025','2026-01-01',100,1,'2026-01-31',?,?)`).bind(T0,T0)));
    }
    await db.prepare("INSERT INTO charges(tenancy_id,due_on,amount) SELECT id,'2026-01-15',10000 FROM tenancies WHERE id>1").run();
    const { missingPaymentRows } = await import('../../server/missing-payments.js');
    const seen=[];let after=null;
    do {
      const page=await missingPaymentRows({DB:db},{today:'2026-02-10',grace_days:0,after,limit:50});
      assert.ok(page.rows.length<=50);seen.push(...page.rows.map(item=>item.tenancy_id));after=page.next;
    } while(after!==null);
    assert.equal(seen.length,120+(got.debt_pence>0?1:0));
    assert.equal(new Set(seen).size,seen.length);
    // Real local D1 must reject a replacement even when a unique operation id collides.
    const second=await db.prepare('SELECT id FROM charges WHERE tenancy_id=2').first();
    await db.prepare(`INSERT INTO charge_adjustments(charge_id,amount_pence,kind,effective_on,reason,created_at,created_by,operation_id)
      VALUES(?,2000,'writeoff','2026-02-10','Fixture',?,'fixture-staff','fixture-operation')`).bind(second.id,T0).run();
    const before=await db.prepare("SELECT id,amount_pence FROM charge_adjustments WHERE operation_id='fixture-operation'").first();
    await assert.rejects(db.prepare(`INSERT OR REPLACE INTO charge_adjustments(charge_id,amount_pence,kind,effective_on,reason,created_at,created_by,operation_id)
      VALUES(?,1000,'writeoff','2026-02-10','Fixture',?,'fixture-staff','fixture-operation')`).bind(second.id,T0).run());
    assert.deepEqual(await db.prepare("SELECT id,amount_pence FROM charge_adjustments WHERE operation_id='fixture-operation'").first(),before);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  } finally { await mf.dispose(); }
});
