// ADM-09: rent debt written off and reversed (ADM09_ARREARS_READY, migration 0045), never as a payment. Off, the
// panel answers as before, with or without 0045 applied (0049 is never applied, so it is left out here).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { notificationsPass } from "../../server/notification-reconcile.js";

const T = jerseyToday(), ago = n => plusDays(T, -n);
const ON = { ADM09_ARREARS_READY: "1", NOT05_MISSING_PAYMENTS_READY: "1" };
const env = (flags = ON, skip = [49]) => Object.assign(makeEnv({ skip }), flags);
const req = async (e, method, path, body) => call(e, method, path, { body, cookie: await adminCookie() });
const rows = (e, sql, ...a) => e.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const count = (e, table) => rows(e, `SELECT COUNT(*) AS n FROM ${table}`)[0].n;

// A full-service tenancy with a £1,500 rent charge due 6 days ago and an extra one 20 days ago: £3,000 owed.
async function tenancy(e) {
  const l = await req(e, "POST", "/admin/landlords", { name: "Anne Owner" });
  const r = await req(e, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "1 Rue des Pres",
    parish: "St Helier", service: "full", fee_percent: 10 });
  const t = await req(e, "POST", `/admin/rentals/${r.data.rental.id}/tenancies`,
    { tenant_name: "Tom Tenant", kind: "periodic", regime: "2025", rent: 1500, start_on: ago(6), collect_from: ago(6) });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  e.DB.raw.prepare("INSERT INTO charges (tenancy_id, due_on, amount, kind) VALUES (?, ?, 150000, 'rent')").run(t.data.tenancy.id, ago(20));
  return t.data.tenancy.id;
}
const detail = async (e, id) => (await req(e, "GET", `/admin/tenancies/${id}`)).data;
const writeOff = async (e, id, body = {}) => req(e, "POST", `/admin/tenancies/${id}/writeoffs`,
  { amount: 150000, reason: "Tenant left the island", financial_revision: (await detail(e, id)).tenancy.financial_revision, ...body });
const reverse = async (e, id, wo, body = {}) => req(e, "POST", `/admin/tenancies/${id}/writeoffs/${wo}/reverse`,
  { reason: "Entered by mistake", financial_revision: (await detail(e, id)).tenancy.financial_revision, ...body });

test("switch off: charges, payments, tenancies and arrears steps answer the same with and without migration 0045", async () => {
  const journey = async e => {
    const out = [], log = r => out.push([r.status, r.data]);
    const id = await tenancy(e);
    log(await req(e, "GET", `/admin/tenancies/${id}`));
    log(await req(e, "POST", "/admin/payments", { tenancy_id: id, received_on: T, amount: 50000 }));
    log(await req(e, "PUT", `/admin/tenancies/${id}/arrears/${ago(20)}/letter`, { note: "Posted" }));
    const charge = rows(e, "SELECT id FROM charges WHERE due_on = ?", ago(20))[0].id;
    log(await req(e, "PUT", `/admin/charges/${charge}`, { amount: 140000 }));
    const t = (await detail(e, id)).tenancy;
    log(await req(e, "PUT", `/admin/tenancies/${id}`, { updated_at: t.updated_at, collect_from: ago(3) }));
    log(await req(e, "POST", `/admin/tenancies/${id}/end`, { ended_on: ago(1) }));
    log(await req(e, "GET", "/admin/rentals"));
    log(await req(e, "GET", "/admin/missing-payments"));
    log(await req(e, "GET", "/admin/notifications/counts"));
    log(await req(e, "POST", `/admin/tenancies/${id}/writeoffs`, { amount: 1, reason: "x", financial_revision: 1 }));
    await notificationsPass(e, new Date().toISOString());
    out.push(rows(e, "SELECT title, resolved_at IS NULL AS open FROM notifications WHERE task_key LIKE 'queue:%' ORDER BY id"));
    return JSON.stringify(out).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "<ts>");
  };
  const off = { NOT05_MISSING_PAYMENTS_READY: "1" };
  const before = await journey(env(off, [45, 49])), after = await journey(env(off, [49]));
  assert.equal(after, before);
  assert.match(before, /"Not found"/, "no write-off route while off");
  assert.doesNotMatch(after, /financial_revision/);
});

test("a write-off lowers the debt oldest charge first, as an adjustment, never a payment", async () => {
  const e = env(), id = await tenancy(e), payments = count(e, "payments"), charges = rows(e, "SELECT * FROM charges");
  let d = await detail(e, id);
  assert.equal(d.balance, 300000);
  assert.equal(d.arrears.oldest_unpaid_on, ago(20));
  assert.deepEqual(d.writeoffs, []);
  const r = await writeOff(e, id, { amount: 160000 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  d = r.data;
  assert.equal(d.balance, 140000);
  assert.equal(d.arrears.oldest_unpaid_on, ago(6), "the oldest charge is cleared, the rest of the write-off falls on the next");
  assert.equal(d.writeoffs.length, 1);
  assert.equal(d.writeoffs[0].amount, 160000);
  assert.equal(d.writeoffs[0].reason, "Tenant left the island");
  assert.equal(d.writeoffs[0].reversed_on, null);
  assert.equal(count(e, "payments"), payments, "no payment is made up");
  assert.deepEqual(rows(e, "SELECT * FROM charges"), charges, "charges are kept as they were");
  assert.deepEqual(rows(e, "SELECT amount_pence, kind FROM charge_adjustments ORDER BY id"),
    [{ amount_pence: 150000, kind: "writeoff" }, { amount_pence: 10000, kind: "writeoff" }]);
  const ev = rows(e, "SELECT data FROM rental_events WHERE type = 'charge.written_off'").map(x => JSON.parse(x.data));
  assert.deepEqual(ev, [{ writeoff: d.writeoffs[0].id, amount: 160000, charges: 2 }], "the reason stays out of the history");
  // Every reader follows: the Rentals to-do and total, Missing payments and the Inbox.
  const o = (await req(e, "GET", "/admin/rentals")).data;
  assert.equal(o.totals.owed, 140000);
  assert.equal(o.rentals[0].balance, 140000);
  assert.equal((await req(e, "GET", "/admin/missing-payments")).data.owed, 140000);
  // The rest written off: nothing owed, the Inbox's arrears task closes.
  await notificationsPass(e, new Date().toISOString());
  const open = () => rows(e, "SELECT title FROM notifications WHERE task_key LIKE 'queue:arrears:%' AND resolved_at IS NULL");
  assert.equal(open().length, 1);
  assert.equal((await writeOff(e, id, { amount: 140000 })).data.balance, 0);
  assert.equal((await detail(e, id)).arrears, null);
  await notificationsPass(e, new Date().toISOString());
  assert.equal(open().length, 0);
  assert.equal((await req(e, "GET", "/admin/rentals")).data.todo.arrears.length, 0);
});

test("a write-off is refused when stale, over the debt or without a reason, and writes nothing", async () => {
  const e = env(), id = await tenancy(e), rev = (await detail(e, id)).tenancy.financial_revision;
  await req(e, "POST", "/admin/payments", { tenancy_id: id, received_on: T, amount: 1000 });
  let r = await writeOff(e, id, { financial_revision: rev });
  assert.equal(r.status, 409, "a payment meanwhile");
  r = await writeOff(e, id, { amount: 299001 });
  assert.equal(r.status, 400);
  assert.match(r.data.fields.amount, /£2,990\.00/);
  r = await writeOff(e, id, { amount: 1.5 });
  assert.equal(r.status, 400);
  r = await writeOff(e, id, { reason: "  " });
  assert.deepEqual(Object.keys(r.data.fields), ["reason"]);
  assert.equal(count(e, "charge_adjustments"), 0);
  // Let-only tenancies collect no rent.
  const l = await req(e, "POST", "/admin/rentals", { landlord_id: 1, address: "2 Rue", parish: "St Helier", service: "let_only",
    fee_percent: null });
  const t = await req(e, "POST", `/admin/rentals/${l.data.rental.id}/tenancies`,
    { tenant_name: "Lea", kind: "periodic", regime: "2025", rent: 900, start_on: ago(3) });
  r = await writeOff(e, t.data.tenancy.id, { amount: 1 });
  assert.equal(r.data.fields.amount, "No rent is owed to write off");
  // A payment between the read and the write: the batch finds another revision and writes nothing.
  const batch = e.DB.batch.bind(e.DB);
  e.DB.batch = stmts => {
    if (stmts.some(st => /INSERT INTO charge_adjustments/.test(st.sql)))
      e.DB.raw.prepare("INSERT INTO payments (tenancy_id, received_on, amount, kind, source, created_at) VALUES (?, ?, 100, 'rent', 'manual', ?)")
        .run(id, T, new Date().toISOString());
    return batch(stmts);
  };
  assert.equal((await writeOff(e, id, { amount: 1000 })).status, 409);
  assert.equal(count(e, "charge_adjustments"), 0);
});

test("a reversal brings the debt back once, for the whole write-off", async () => {
  const e = env(), id = await tenancy(e);
  const wo = (await writeOff(e, id, { amount: 160000 })).data.writeoffs[0].id;
  let r = await reverse(e, id, wo, { reason: "" });
  assert.deepEqual(Object.keys(r.data.fields), ["reason"]);
  r = await reverse(e, id, wo);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.balance, 300000);
  assert.equal(r.data.arrears.oldest_unpaid_on, ago(20));
  assert.equal(r.data.writeoffs[0].reversed_on, T);
  assert.equal(r.data.writeoffs[0].reversal_reason, "Entered by mistake");
  assert.equal((await reverse(e, id, wo)).status, 409, "already reversed");
  assert.equal((await reverse(e, id, "00000000-0000-4000-8000-000000000000")).status, 404);
  assert.equal(count(e, "charge_adjustments"), 4);
  assert.equal(rows(e, "SELECT COUNT(*) AS n FROM rental_events WHERE type = 'charge.writeoff_reversed'")[0].n, 1);
});

test("a written-off charge is never deleted nor corrected below what was written off", async () => {
  const e = env(), id = await tenancy(e);
  await writeOff(e, id, { amount: 160000 }); // £1,500 on the charge of 20 days ago, £100 on the one of 6 days ago
  const charges = rows(e, "SELECT * FROM charges ORDER BY id"), recent = rows(e, "SELECT id FROM charges WHERE due_on = ?", ago(6))[0].id;
  let r = await req(e, "PUT", `/admin/charges/${recent}`, { amount: 5000 });
  assert.equal(r.status, 400);
  assert.match(r.data.fields.amount, /£100\.00/);
  assert.equal((await req(e, "PUT", `/admin/charges/${recent}`, { amount: 10000 })).status, 200);
  r = await req(e, "POST", `/admin/tenancies/${id}/end`, { ended_on: ago(6) });
  assert.equal(r.status, 400);
  assert.match(r.data.fields.ended_on, /written off/);
  const t = (await detail(e, id)).tenancy;
  r = await req(e, "PUT", `/admin/tenancies/${id}`, { updated_at: t.updated_at, collect_from: ago(3) });
  assert.equal(r.status, 400);
  assert.match(r.data.fields.collect_from, /written off/);
  assert.deepEqual(rows(e, "SELECT id, due_on, kind FROM charges ORDER BY id"), charges.map(({ id, due_on, kind }) => ({ id, due_on, kind })));
  assert.equal((await req(e, "POST", `/admin/tenancies/${id}/end`, { ended_on: ago(1) })).status, 200, "a later move-out still works");
});

// 0045's foreign key and guards hold whatever the switch: switched off after write-offs, the same field errors, no 500.
test("switched off after write-offs, a written-off charge is still protected with a field error", async () => {
  const e = env(), id = await tenancy(e);
  await writeOff(e, id, { amount: 160000 });
  e.ADM09_ARREARS_READY = "0";
  const recent = rows(e, "SELECT id FROM charges WHERE due_on = ?", ago(6))[0].id;
  let r = await req(e, "PUT", `/admin/charges/${recent}`, { amount: 5000 });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.match(r.data.fields.amount, /£100\.00/);
  r = await req(e, "POST", `/admin/tenancies/${id}/end`, { ended_on: ago(6) });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.match(r.data.fields.ended_on, /written off/);
  const t = (await detail(e, id)).tenancy;
  r = await req(e, "PUT", `/admin/tenancies/${id}`, { updated_at: t.updated_at, collect_from: ago(3) });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.match(r.data.fields.collect_from, /written off/);
  assert.equal(count(e, "charge_adjustments"), 2);
});

test("with a write-off, lowering an earlier charge cannot turn the written-off rent into credit", async () => {
  for (const flag of ["1", "0"]) {
    const e = env(), id = await tenancy(e), older = rows(e, "SELECT id FROM charges WHERE due_on = ?", ago(20))[0].id;
    await req(e, "POST", "/admin/payments", { tenancy_id: id, received_on: T, amount: 150000 }); // the older charge paid
    await writeOff(e, id, { amount: 150000 }); // the recent one written off: nothing owed
    e.ADM09_ARREARS_READY = flag;
    const r = await req(e, "PUT", `/admin/charges/${older}`, { amount: 100000 });
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.match(r.data.fields.amount, /£500\.00/);
    assert.equal((await req(e, "PUT", `/admin/charges/${older}`, { amount: 160000 })).status, 200, "raising it still works");
  }
});

test("with credit after a write-off, raising a charge, saving it unchanged or a reversed write-off never block an edit", async () => {
  const e = env(), id = await tenancy(e), older = rows(e, "SELECT id FROM charges WHERE due_on = ?", ago(20))[0].id;
  await req(e, "POST", "/admin/payments", { tenancy_id: id, received_on: T, amount: 150000 });
  const wo = await writeOff(e, id, { amount: 150000 });
  await req(e, "POST", "/admin/payments", { tenancy_id: id, received_on: T, amount: 10000 }); // £100 credit
  assert.equal((await req(e, "PUT", `/admin/charges/${older}`, { amount: 155000 })).status, 200, "raising a due charge");
  assert.equal((await req(e, "PUT", `/admin/charges/${older}`, { amount: 155000 })).status, 200, "saving it unchanged");
  const rev = await reverse(e, id, wo.data.writeoffs[0].id);
  assert.equal(rev.status, 200, JSON.stringify(rev.data));
  assert.equal((await req(e, "PUT", `/admin/charges/${older}`, { amount: 100000 })).status, 200, "nothing stays written off");
});

test("the website and the clock share the switch, so the Inbox follows the same balance as the panel", () => {
  const flag = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(/^ADM09_ARREARS_READY = "([01])"$/m)?.[1] ?? "0";
  assert.equal(flag("wrangler.toml"), flag("jobs/wrangler.toml"));
});
