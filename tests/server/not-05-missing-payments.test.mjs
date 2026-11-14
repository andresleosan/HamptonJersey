// NOT-05: the Inbox's Missing payments tab. Rent charges due and not paid in full, from the balances Rentals › To do ›
// Arrears already shows, after a configurable grace period. Read only, behind NOT05_MISSING_PAYMENTS_READY. Synthetic
// fixtures only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { paymentRef } from "../../server/rentals.js";
import { ARREARS_SQL } from "../../server/routes/rent.js";
import { missingPayments } from "../../server/missing-payments.js";
import routes from "../../server/routes/missing-payments.js";

const on = () => ({ ...makeEnv(), NOT05_MISSING_PAYMENTS_READY: "1" });
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const one = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const T = jerseyToday(), ago = n => plusDays(T, -n);
const STEP = { reminder: { days: 1, step: "reminder", label: "Friendly reminder" }, firm: { days: 5, step: "firm", label: "Firm reminder" },
  call: { days: 7, step: "call", label: "Call the tenant" } };

// Fixed dates, straight into the tables: a full-management property and tenancy with one rent charge due 1 November.
function fixture({ ended_on = null, service = "full" } = {}) {
  const env = on();
  run(env, "INSERT INTO landlords (name, created_at, updated_at) VALUES ('Synthetic Owner', ?, ?)", T0, T0);
  run(env, `INSERT INTO rentals (landlord_id, address, parish, service, fee_percent, created_at, updated_at)
    VALUES (1, '1 Rue des Exemples', 'St Helier', ?, ?, ?, ?)`, service, service === "full" ? 10 : null, T0, T0);
  run(env, `INSERT INTO tenancies (rental_id, payment_ref, tenant_name, kind, regime, start_on, rent, due_day, ended_on, created_at, updated_at)
    VALUES (1, 'HE-T0001', 'Rae Example', 'periodic', '2025', '2026-10-01', 100, 1, ?, ?, ?)`, ended_on, T0, T0);
  run(env, "INSERT INTO charges (tenancy_id, due_on, amount, kind) VALUES (1, '2026-11-01', 10000, 'rent')");
  return env;
}
const pay = (env, amount, kind = "rent", on_ = "2026-11-02") => run(env, `INSERT INTO payments (tenancy_id, received_on, amount, kind,
  source, created_at) VALUES (1, ?, ?, ?, 'manual', ?)`, on_, amount, kind, T0);
const grace = (env, days, revision = 1) => run(env, `INSERT INTO app_settings (key, value, updated_at) VALUES ('missing_payments', ?, ?)
  ON CONFLICT (key) DO UPDATE SET value = excluded.value`, JSON.stringify({ grace_days: days, revision }), T0);
const arrears = (env, today) => env.DB.raw.prepare(`WITH ${ARREARS_SQL} SELECT * FROM arrears WHERE balance > 0`).all(today, null);

test("flag off: no route; on: staff session, same origin and no-store; the switch ships off", async () => {
  const off = makeEnv();
  for (const [method, path] of [["GET", "/admin/missing-payments"], ["PUT", "/admin/missing-payments/grace"]])
    assert.equal((await req(off, method, path, method === "PUT" ? { grace_days: 3, expectedRevision: 0 } : undefined)).status, 404, path);
  const env = on();
  assert.equal((await call(env, "GET", "/admin/missing-payments")).status, 401);
  assert.equal((await call(env, "PUT", "/admin/missing-payments/grace", { body: { grace_days: 3, expectedRevision: 0 } })).status, 401);
  const foreign = await call(env, "PUT", "/admin/missing-payments/grace", { body: { grace_days: 3, expectedRevision: 0 },
    cookie: await adminCookie(), origin: "https://evil.example" });
  assert.equal(foreign.status, 403);
  const ok = await req(env, "GET", "/admin/missing-payments");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual(ok.data, { as_of: T, grace_days: 3, revision: 0, count: 0, owed: 0, payments: [] });
  assert.match(readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8"), /^NOT05_MISSING_PAYMENTS_READY = "[01]"$/m);
});

test("routes: one read and the grace period only; nothing sends, pays, adjusts or marks a step", () => {
  assert.deepEqual(routes.map(([m, re]) => [m, re.source]), [["GET", "^\\/admin\\/missing-payments$"],
    ["PUT", "^\\/admin\\/missing-payments\\/grace$"]]);
  assert.ok(routes.every(([, , , auth]) => auth === true), "staff session");
});

test("default_three_days: a 1 November charge shows on 4 November, from the Arrears balance and step", async () => {
  const env = fixture();
  assert.deepEqual((await missingPayments(env, "2026-11-03")).payments, []);
  const r = await missingPayments(env, "2026-11-04");
  assert.deepEqual(r, { as_of: "2026-11-04", grace_days: 3, revision: 0, count: 1, owed: 10000, payments: [{
    tenancy_id: 1, rental_id: 1, address: "1 Rue des Exemples", tenant_name: "Rae Example", payment_ref: "HE-T0001", ended_on: null,
    balance: 10000, oldest_unpaid_on: "2026-11-01", days_late: 3, next_step: STEP.reminder, done_step: null }] });
  const [a] = arrears(env, "2026-11-04");
  assert.deepEqual([a.balance, a.oldest_unpaid_on, a.days_late, a.next_step], [10000, "2026-11-01", 3, "reminder"]);
});

test("partial_payment: what is still owed stays; full payment: gone; a deposit is not rent", async () => {
  const env = fixture();
  pay(env, 4000);
  assert.deepEqual((await missingPayments(env, "2026-11-06")).payments.map(p => [p.balance, p.oldest_unpaid_on, p.days_late, p.next_step]),
    [[6000, "2026-11-01", 5, STEP.firm]]);
  pay(env, 6000, "deposit");
  assert.equal((await missingPayments(env, "2026-11-06")).owed, 6000, "a deposit pays no rent");
  pay(env, 6000);
  assert.deepEqual(await missingPayments(env, "2026-11-06"), { as_of: "2026-11-06", grace_days: 3, revision: 0, count: 0, owed: 0,
    payments: [] });
  assert.deepEqual(arrears(env, "2026-11-06"), [], "Arrears agrees");
});

test("grace_does_not_move_charge_or_arrears_sequence: grace changes what shows, not the due date or the steps", async () => {
  const env = fixture();
  grace(env, 0);
  const due = (await missingPayments(env, "2026-11-01")).payments[0];
  assert.deepEqual([due.days_late, due.next_step, due.done_step], [0, null, null], "due today: no step yet");
  grace(env, 30, 2);
  assert.deepEqual((await missingPayments(env, "2026-11-20")).payments, []);
  assert.equal((await missingPayments(env, "2026-12-01")).payments[0]?.days_late, 30);
  grace(env, 5, 3);
  assert.equal((await missingPayments(env, "2026-11-05")).payments.length, 0);
  assert.equal((await missingPayments(env, "2026-11-06")).revision, 3);
  assert.equal(one(env, "SELECT due_on FROM charges").due_on, "2026-11-01");
  assert.equal(arrears(env, "2026-11-02")[0].next_step, "reminder", "the +1 step does not wait for the grace period");
  assert.equal(one(env, "SELECT COUNT(*) AS n FROM arrears_steps").n, 0);
});

test("done_not_proof_of_payment: a step marked done leaves the debt in the tab", async () => {
  const env = fixture();
  run(env, `INSERT INTO arrears_steps (tenancy_id, charge_due_on, step, done_at, done_by) VALUES (1, '2026-11-01', 'reminder', ?,
    'admin@example.test')`, T0);
  const [p] = (await missingPayments(env, "2026-11-04")).payments;
  assert.deepEqual([p.balance, p.next_step, p.done_step], [10000, null, STEP.reminder]);
  assert.equal(arrears(env, "2026-11-04")[0].next_step, null, "Arrears has nothing more to do today either");
});

test("ended_tenancy_debt_remains_visible: an ended tenancy still owes; it has no arrears step", async () => {
  const env = fixture({ ended_on: "2026-11-02" });
  const [p] = (await missingPayments(env, "2026-11-10")).payments;
  assert.deepEqual([p.ended_on, p.balance, p.days_late, p.next_step, p.done_step], ["2026-11-02", 10000, 9, null, null]);
  assert.deepEqual(arrears(env, "2026-11-10"), [], "Arrears lists running tenancies only");
  const planned = fixture({ ended_on: "2026-12-31" });
  assert.deepEqual((await missingPayments(planned, "2026-11-10")).payments[0].next_step, STEP.call, "a move-out ahead: still running");
});

test("let_only_without_rent: a let-only tenancy is never in the tab, not even with a stray charge", async () => {
  const env = fixture({ service: "let_only" });
  pay(env, 150000, "deposit");
  assert.deepEqual((await missingPayments(env, "2026-11-20")).payments, []);
});

test("order, totals and bad data: longest overdue first; an invalid policy or a fractional amount is a 503", async () => {
  const env = fixture();
  run(env, `INSERT INTO rentals (landlord_id, address, parish, service, fee_percent, created_at, updated_at)
    VALUES (1, '2 Rue des Exemples', 'St Helier', 'full', 10, ?, ?)`, T0, T0);
  run(env, `INSERT INTO tenancies (rental_id, payment_ref, tenant_name, kind, regime, start_on, rent, due_day, created_at, updated_at)
    VALUES (2, 'HE-T0002', 'Sam Example', 'periodic', '2025', '2026-10-01', 200, 1, ?, ?)`, T0, T0);
  run(env, "INSERT INTO charges (tenancy_id, due_on, amount, kind) VALUES (2, '2026-10-25', 20000, 'rent')");
  const r = await missingPayments(env, "2026-11-04");
  assert.deepEqual(r.payments.map(p => [p.tenancy_id, p.days_late]), [[2, 10], [1, 3]]);
  assert.deepEqual([r.count, r.owed], [2, 30000]);
  grace(env, 31, 2);
  await assert.rejects(missingPayments(env, "2026-11-04"), e => e.status === 503);
  run(env, "UPDATE app_settings SET value = ? WHERE key = 'missing_payments'", JSON.stringify({ grace_days: "3", revision: 2 }));
  await assert.rejects(missingPayments(env, "2026-11-04"), e => e.status === 503);
  run(env, "DELETE FROM app_settings WHERE key = 'missing_payments'");
  run(env, "UPDATE charges SET amount = 10000.5 WHERE tenancy_id = 1");
  await assert.rejects(missingPayments(env, "2026-11-04"), e => e.status === 503);
});

test("the tab matches Rentals › To do › Arrears through the API, and makes nothing", async () => {
  const env = on();
  const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
  const L = ok(await req(env, "POST", "/admin/landlords", { name: "Synthetic Owner" }), 201).landlord.id;
  const home = async (address, over = {}, days = 6) => {
    const rid = ok(await req(env, "POST", "/admin/rentals", { landlord_id: L, address, parish: "St Helier", service: "full",
      fee_percent: 10, ...over }), 201).rental.id;
    return ok(await req(env, "POST", `/admin/rentals/${rid}/tenancies`, { tenant_name: `Tenant of ${address}`, kind: "periodic",
      regime: "2025", rent: 1500, start_on: ago(days), collect_from: over.service === "let_only" ? undefined : ago(days) }), 201).tenancy;
  };
  const late = await home("1 Late Lane"), partial = await home("2 Part Paid Row"), paid = await home("3 Paid Place");
  await home("4 Fresh Street", {}, 1);
  const left = await home("5 Left Lane");
  await home("6 Let Only Lane", { service: "let_only", fee_percent: null });
  ok(await req(env, "POST", "/admin/payments", { tenancy_id: partial.id, received_on: ago(1), amount: 50000, kind: "rent" }), 201);
  ok(await req(env, "POST", "/admin/payments", { tenancy_id: paid.id, received_on: ago(1), amount: 150000, kind: "rent" }), 201);
  ok(await req(env, "POST", `/admin/tenancies/${left.id}/end`, { ended_on: ago(2) }));
  ok(await req(env, "PUT", `/admin/tenancies/${late.id}/arrears/${ago(6)}/firm`, { note: "Called" }));

  const before = ["charges", "payments", "arrears_steps", "notifications", "rental_events"]
    .map(t => one(env, `SELECT COUNT(*) AS n FROM ${t}`).n);
  const { todo, totals } = ok(await req(env, "GET", "/admin/rentals"));
  const tab = ok(await req(env, "GET", "/admin/missing-payments"));
  assert.deepEqual(tab.payments.map(p => [p.address, p.balance, p.days_late, p.next_step?.step ?? null, p.done_step?.step ?? null, p.ended_on]), [
    ["1 Late Lane", 150000, 6, null, "firm", null], ["2 Part Paid Row", 100000, 6, "firm", null, null],
    ["5 Left Lane", 150000, 6, null, null, ago(2)]]);
  assert.equal(tab.payments[1].payment_ref, paymentRef(partial.id));
  // Every Arrears row past the grace period is in the tab with the same figures; the tab adds the step already done and
  // the ended tenancy, and leaves out the charge due yesterday until its grace period is over.
  for (const a of todo.arrears.filter(a => a.days_late >= tab.grace_days)) {
    const p = tab.payments.find(x => x.tenancy_id === a.tenancy_id);
    assert.deepEqual([p.rental_id, p.address, p.tenant_name, p.payment_ref, p.balance, p.oldest_unpaid_on, p.days_late, p.next_step],
      [a.rental_id, a.address, a.tenant_name, a.payment_ref, a.balance, a.oldest_unpaid_on, a.days_late, a.next_step]);
  }
  assert.deepEqual(todo.arrears.map(a => a.address), ["2 Part Paid Row", "4 Fresh Street"]);
  ok(await req(env, "PUT", "/admin/missing-payments/grace", { grace_days: 0, expectedRevision: 0 }));
  const all = ok(await req(env, "GET", "/admin/missing-payments"));
  const running = all.payments.filter(p => !p.ended_on);
  assert.equal(running.reduce((s, p) => s + p.balance, 0), totals.owed, "with no grace, the running debts are Rentals' owed total");
  assert.equal(all.owed, totals.owed + 150000);
  assert.deepEqual(["charges", "payments", "arrears_steps", "notifications", "rental_events"]
    .map(t => one(env, `SELECT COUNT(*) AS n FROM ${t}`).n), before, "reading and the grace period make nothing");
});

test("grace period: 0 to 30 whole days, compare-and-set on its revision, kept with who changed it", async () => {
  const env = on(), put = body => req(env, "PUT", "/admin/missing-payments/grace", body);
  for (const grace_days of [-1, 31, 1.5, "3", null])
    assert.deepEqual((await put({ grace_days, expectedRevision: 0 })).data.fields, { grace_days: "Enter a whole number of days from 0 to 30" });
  for (const body of [[], "x", { grace_days: 3 }, { grace_days: 3, expectedRevision: -1 }, { grace_days: 3, expectedRevision: "0" }])
    assert.equal((await put(body)).status, 400, JSON.stringify(body));
  assert.equal(one(env, "SELECT COUNT(*) AS n FROM app_settings WHERE key = 'missing_payments'").n, 0);
  const r = await put({ grace_days: 7, expectedRevision: 0 });
  assert.deepEqual([r.status, r.data], [200, { grace_days: 7, revision: 1 }]);
  const stale = await put({ grace_days: 1, expectedRevision: 0 });
  assert.equal(stale.status, 409);
  assert.match(stale.data.error, /changed the grace period meanwhile/);
  const row = one(env, "SELECT value, updated_by FROM app_settings WHERE key = 'missing_payments'");
  assert.deepEqual([JSON.parse(row.value), row.updated_by], [{ grace_days: 7, revision: 1 }, "admin@example.test"]);
  assert.equal(one(env, "SELECT json_type(value, '$.grace_days') AS t FROM app_settings WHERE key = 'missing_payments'").t, "integer");
  assert.deepEqual((await req(env, "GET", "/admin/missing-payments")).data.grace_days, 7);
  assert.deepEqual((await put({ grace_days: 0, expectedRevision: 1 })).data, { grace_days: 0, revision: 2 });
});
