import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { paymentRef, nextStep, occurrences } from "../../server/rentals.js";
import { ARREARS_SQL } from "../../server/routes/rent.js";

const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args);
const events = (env, type) => rows(env, "SELECT rental_id, tenancy_id, data FROM rental_events WHERE type = ? ORDER BY id", type)
  .map(e => ({ ...e, data: JSON.parse(e.data) }));
const T = jerseyToday(), ago = n => plusDays(T, -n);

async function rental(env, over = {}) {
  const l = await req(env, "POST", "/admin/landlords", { name: "Anne Owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "1 Rue des Pres",
    parish: "St Helier", service: "full", fee_percent: 10, ...over });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.rental.id;
}
// One rent charge of £1,500 due `days` ago (the next one is next month, not yet due), plus `older` extra rent charges
// due that many days ago, inserted by hand.
async function tenancy(env, { days = 6, older = [], service = "full" } = {}) {
  const r = await req(env, "POST", `/admin/rentals/${await rental(env, service === "full" ? {} : { service, fee_percent: null })}/tenancies`,
    { tenant_name: "Tom Tenant", kind: "periodic", regime: "2025", rent: 1500, start_on: ago(days) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  for (const d of older) run(env, "INSERT INTO charges (tenancy_id, due_on, amount, kind) VALUES (?, ?, 150000, 'rent')", r.data.tenancy.id, ago(d));
  return r.data.tenancy.id;
}
const detail = async (env, id) => {
  const r = await req(env, "GET", `/admin/tenancies/${id}`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const pay = async (env, tenancy_id, amount, over = {}) => {
  const r = await req(env, "POST", "/admin/payments", { tenancy_id, received_on: T, amount, ...over });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
};
const STEP = Object.fromEntries([[1, "reminder", "Friendly reminder"], [5, "firm", "Firm reminder"], [7, "call", "Call the tenant"],
  [10, "landlord", "Tell the landlord"], [14, "letter", "Formal letter"]].map(([days, step, label]) => [step, { days, step, label }]));
const mark = (env, id, due_on, step, body = {}) => req(env, "PUT", `/admin/tenancies/${id}/arrears/${due_on}/${step}`, body);
const imp = (env, rows, dry_run = false) => req(env, "POST", "/admin/payments/import", { rows, dry_run });
const payments = env => rows(env, "SELECT tenancy_id, received_on, amount, description, kind, source, import_hash FROM payments ORDER BY id");

test("FIFO: a partial payment covers the oldest charge first; days late count from the oldest uncovered one", async () => {
  const env = makeEnv();
  const id = await tenancy(env, { days: 6, older: [20] });
  let d = await detail(env, id);
  assert.equal(d.balance, 300000);
  assert.deepEqual(d.arrears, { oldest_unpaid_on: ago(20), days_late: 20, next_step: STEP.letter, done: [] });

  d = await pay(env, id, 100000);
  assert.equal(d.balance, 200000);
  assert.equal(d.arrears.oldest_unpaid_on, ago(20), "a partial payment leaves the oldest charge unpaid");
  d = await pay(env, id, 60000);
  assert.equal(d.balance, 140000);
  assert.deepEqual([d.arrears.oldest_unpaid_on, d.arrears.days_late], [ago(6), 6]);
  assert.deepEqual(d.arrears.next_step, STEP.firm);
  assert.deepEqual(d.arrears.next_step, (([days, step, label]) => ({ days, step, label }))(nextStep(6, [])));

  // ARREARS_SQL: one row per running full tenancy (?1 = Jersey today, ?2 = NULL: all); let_only and ended ones have none.
  const paid = await tenancy(env, { days: 3 });
  await pay(env, paid, 200000);
  const let_only = await tenancy(env, { service: "let_only" });
  const ended = await tenancy(env, { days: 40 });
  run(env, "UPDATE tenancies SET ended_on = ? WHERE id = ?", T, ended);
  const all = (await env.DB.prepare(`WITH ${ARREARS_SQL} SELECT * FROM arrears ORDER BY tenancy_id`).bind(T, null).all()).results;
  assert.deepEqual(all.map(a => [a.tenancy_id, a.balance, a.oldest_unpaid_on, a.days_late, a.next_step]),
    [[id, 140000, ago(6), 6, "firm"], [paid, -50000, null, null, null]]);
  assert.ok(!all.some(a => [let_only, ended].includes(a.tenancy_id)));
  assert.equal((await detail(env, ended)).arrears, null);
});

test("arrears: the next step is the latest due one; marking it done; a full payment clears it", async () => {
  const env = makeEnv();
  const id = await tenancy(env, { days: 6 });
  assert.deepEqual((await detail(env, id)).arrears.next_step, STEP.firm, "the reminder (day 1) needs no marking");

  assert.equal((await mark(env, id, ago(6), "letter")).status, 409, "not due yet");
  assert.equal((await mark(env, id, ago(7), "firm")).status, 409, "not the oldest unpaid charge");
  assert.equal((await mark(env, id, ago(6), "party")).status, 400);
  assert.equal((await mark(env, id, ago(6), "firm", { note: "x".repeat(301) })).status, 400);
  const r = await mark(env, id, ago(6), "firm", { note: "Texted on Monday" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.arrears.next_step, null);
  assert.deepEqual(r.data.arrears.done.map(s => [s.step, s.note, s.done_by]), [["firm", "Texted on Monday", "luismadef45@gmail.com"]]);
  const again = await mark(env, id, ago(6), "firm", { note: "Twice" });
  assert.equal(again.status, 200, "marking it again changes nothing");
  assert.deepEqual(again.data.arrears, r.data.arrears);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM arrears_steps").n, 1);
  const all = (await env.DB.prepare(`WITH ${ARREARS_SQL} SELECT next_step FROM arrears`).bind(T, id).all()).results;
  assert.deepEqual(all.map(a => a.next_step), [null]);
  assert.deepEqual(events(env, "arrears.step_done").map(e => [e.tenancy_id, e.data]),
    [[id, { charge_due_on: ago(6), step: "firm", note: "Texted on Monday" }]]);

  const d = await pay(env, id, 150000);
  assert.equal(d.balance, 0);
  assert.equal(d.arrears, null, "a payment covering the debt closes the sequence");
  assert.equal((await mark(env, id, ago(6), "call")).status, 409);
});

test("arrears: a partial payment that covers the oldest charge restarts the sequence on the next one", async () => {
  const env = makeEnv();
  const id = await tenancy(env, { days: 6, older: [20] });
  assert.equal((await mark(env, id, ago(20), "letter")).status, 200);
  assert.equal((await mark(env, id, ago(20), "landlord")).status, 200, "an earlier due step may be marked too");
  let d = await detail(env, id);
  assert.equal(d.arrears.next_step, null);
  assert.deepEqual(d.arrears.done.map(s => s.step).sort(), ["landlord", "letter"]);

  d = await pay(env, id, 150000);
  assert.deepEqual(d.arrears, { oldest_unpaid_on: ago(6), days_late: 6, next_step: STEP.firm, done: [] });
  assert.equal((await mark(env, id, ago(20), "call")).status, 409, "the old charge's sequence is closed");
});

test("deposit and other payments don't reduce arrears", async () => {
  const env = makeEnv();
  const id = await tenancy(env, { days: 6 });
  await pay(env, id, 150000, { kind: "deposit", description: "Deposit" });
  const d = await pay(env, id, 150000, { kind: "other" });
  assert.equal(d.balance, 150000);
  assert.equal(d.arrears.oldest_unpaid_on, ago(6));
  assert.deepEqual(d.payments.map(p => [p.kind, p.source, p.amount]), [["other", "manual", 150000], ["deposit", "manual", 150000]]);
  assert.equal(events(env, "payment.recorded").length, 2);

  const bad = await req(env, "POST", "/admin/payments", { tenancy_id: id, received_on: plusDays(T, 1), amount: 0, kind: "gift" });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.data.fields).sort(), ["amount", "kind", "received_on"]);
  assert.equal((await req(env, "POST", "/admin/payments", { tenancy_id: 999, received_on: T, amount: 1 })).status, 404);
  // P10: a let-only tenancy may hold a deposit or other money, never rent.
  const lo = await tenancy(env, { service: "let_only" });
  assert.equal((await req(env, "POST", "/admin/payments", { tenancy_id: lo, received_on: T, amount: 1 })).status, 409);
  const loDeposit = await req(env, "POST", "/admin/payments", { tenancy_id: lo, received_on: T, amount: 90000, kind: "deposit" });
  assert.equal(loDeposit.status, 201, JSON.stringify(loDeposit.data));
  assert.deepEqual(loDeposit.data.payments.map(p => [p.kind, p.amount]), [["deposit", 90000]]);
  assert.equal(loDeposit.data.arrears, null);
  const loId = loDeposit.data.payments[0].id;
  assert.equal((await req(env, "PUT", `/admin/payments/${loId}`, { kind: "rent" })).status, 409);

  // Corrected to rent, it counts (R26).
  const deposit = row(env, "SELECT id FROM payments WHERE kind = 'deposit' AND tenancy_id = ?", id).id;
  const r = await req(env, "PUT", `/admin/payments/${deposit}`, { kind: "rent" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.balance, 0);
  assert.equal(r.data.arrears, null);
  assert.deepEqual(events(env, "payment.updated").map(e => [e.tenancy_id, e.data]),
    [[id, { payment_id: deposit, before: { tenancy_id: id, kind: "deposit" }, after: { tenancy_id: id, kind: "rent" } }]]);
  assert.equal((await req(env, "PUT", `/admin/payments/${deposit}`, { kind: "gift" })).status, 400);
  assert.equal((await req(env, "PUT", "/admin/payments/999", { kind: "rent" })).status, 404);
});

const ROW = (over = {}) => ({ date: ago(2), amount: 150000, description: "Rent", n: 1, ...over });

test("import: dry run counts matched, unmatched, ignored without writing", async () => {
  const env = makeEnv();
  const id = await tenancy(env), ref = paymentRef(id);
  const input = [
    ROW({ description: `TOM TENANT ${ref.toLowerCase().replace("-", " ")} OCT` }),
    ROW({ description: "HE-T9999 rent" }),
    ROW({ description: null }),
    ROW({ amount: -5000, description: "Card payment" }),
    ROW({ amount: null, description: "Paid in blank" }),
    ROW({ date: "2026-02-30" }),
    ROW({ amount: 12.5 }),
    ROW({ date: plusDays(T, 1) }),
  ];
  const r = await imp(env, input, true);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const { rows: out, ...counts } = r.data;
  assert.deepEqual(counts, { matched: 1, unmatched: 2, duplicate: 0, by_hand: 0, ignored: 5 });
  assert.deepEqual(out.map(o => [o.status, o.payment_ref]),
    [["matched", ref], ["unmatched", null], ["unmatched", null], ["ignored", null], ["ignored", null], ["ignored", null],
      ["ignored", null], ["ignored", null]]);
  assert.equal(out.at(-1).reason, "Future date", "P11");
  assert.deepEqual(out[0], { ...input[0], status: "matched", payment_ref: ref });
  for (const o of out.filter(o => o.status === "ignored")) assert.ok(o.reason, JSON.stringify(o));
  assert.equal(payments(env).length, 0);
  assert.equal(events(env, "payments.imported").length, 0);

  // Only false or no dry_run writes; anything else that isn't a boolean is refused.
  for (const bad of ["yes", "false", 1, null]) assert.equal((await imp(env, input, bad)).status, 400, String(bad));
  assert.equal(payments(env).length, 0);
  assert.equal((await imp(env, input, undefined)).status, 200);
  assert.equal(payments(env).length, 3);
});

test("import: occurrences() numbers rows by date, pence and tidied description; the hash uses the same", async () => {
  const rowsIn = [ROW({ description: "Rent  HE-T0001 " }), ROW({ description: "Rent HE-T0001" }), ROW({ amount: 1 }),
    ROW({ description: " Rent\tHE-T0001" })];
  assert.deepEqual(occurrences(rowsIn).map(r => r.n), [1, 2, 1, 3]);
  const strip = list => list.map(({ n, ...r }) => r);
  assert.deepEqual(strip(occurrences(rowsIn)), strip(rowsIn), "the rows are otherwise unchanged");

  const env = makeEnv();
  const clash = await imp(env, [ROW({ description: "Rent  x" }), ROW({ description: "Rent x" })], true);
  assert.equal(clash.status, 400, "two rows with the same key and n");
  // A file sent in two chunks, numbered over the whole file: the second chunk's rows are new, not duplicates.
  const file = occurrences([ROW(), ROW(), ROW({ description: "Rent " })]);
  assert.equal((await imp(env, file.slice(0, 2))).data.unmatched, 2);
  const second = await imp(env, file.slice(2));
  assert.deepEqual([second.data.unmatched, second.data.duplicate], [1, 0]);
  assert.deepEqual(payments(env).map(p => p.description), ["Rent", "Rent", "Rent"]);
  const respaced = await imp(env, [ROW({ description: "  Rent ", n: 3 })], true);
  assert.equal(respaced.data.duplicate, 1, "spacing doesn't change the hash");
});

test("import: the same file twice adds nothing; two identical rows in one file are two payments", async () => {
  const env = makeEnv();
  const id = await tenancy(env, { days: 6, older: [20] }), ref = paymentRef(id);
  const file = [ROW({ description: `Rent ${ref}` }), ROW({ description: `Rent ${ref}`, n: 2 }), ROW({ description: "No ref" })];
  const r = await imp(env, file);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual([r.data.matched, r.data.unmatched, r.data.duplicate], [2, 1, 0]);
  const got = payments(env);
  assert.deepEqual(got.map(p => [p.tenancy_id, p.amount, p.kind, p.source]),
    [[id, 150000, "rent", "import"], [id, 150000, "rent", "import"], [null, 150000, "rent", "import"]]);
  assert.equal(new Set(got.map(p => p.import_hash)).size, 3);
  for (const p of got) assert.match(p.import_hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(events(env, "payments.imported").map(e => [e.tenancy_id, e.data]),
    [[null, { added: 1, amount: 150000, by_hand: 0 }], [id, { added: 2, amount: 300000, by_hand: 0 }]]);
  assert.equal((await detail(env, id)).balance, 0);

  const again = await imp(env, file);
  assert.deepEqual([again.data.matched, again.data.unmatched, again.data.duplicate], [0, 0, 3]);
  assert.equal(payments(env).length, 3);
  assert.equal(events(env, "payments.imported").length, 2, "nothing written, nothing logged");
});

test("import: a row matching a manual payment of the same amount within 7 days takes its place", async () => {
  const env = makeEnv();
  const id = await tenancy(env), ref = paymentRef(id);
  await pay(env, id, 150000, { received_on: ago(9) });
  await pay(env, id, 150000, { received_on: ago(30) });
  const file = [ROW({ date: ago(2), description: ref }), ROW({ date: ago(2), amount: 99, description: ref })];
  const dry = await imp(env, file, true);
  assert.deepEqual(dry.data.rows.map(o => o.status), ["by_hand", "matched"]);
  assert.equal(dry.data.by_hand, 1);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM payments WHERE import_hash IS NOT NULL").n, 0);

  assert.equal((await imp(env, file)).status, 200);
  const got = payments(env);
  assert.deepEqual(got.map(p => [p.received_on, p.amount, p.source, !!p.import_hash]),
    [[ago(9), 150000, "manual", true], [ago(30), 150000, "manual", false], [ago(2), 99, "import", true]]);
  assert.deepEqual(events(env, "payments.imported").map(e => e.data), [{ added: 1, amount: 99, by_hand: 1 }]);
  const again = await imp(env, file, true);
  assert.deepEqual(again.data.rows.map(o => o.status), ["duplicate", "duplicate"], "re-importing doesn't duplicate either");
});

test("import: a reference of a let_only or unknown tenancy is unmatched; assigning it later counts", async () => {
  const env = makeEnv();
  const id = await tenancy(env, { days: 6 }), lo = await tenancy(env, { service: "let_only" });
  const r = await imp(env, [ROW({ description: `Rent ${paymentRef(lo)}` }), ROW({ description: "HE-T0999" })]);
  assert.deepEqual(r.data.rows.map(o => [o.status, o.payment_ref]), [["unmatched", null], ["unmatched", null]]);
  const [a, b] = rows(env, "SELECT id, tenancy_id FROM payments ORDER BY id");
  assert.deepEqual([a.tenancy_id, b.tenancy_id], [null, null]);

  assert.equal((await req(env, "PUT", `/admin/payments/${a.id}`, { tenancy_id: lo })).status, 409, "let_only takes no payments");
  assert.equal((await req(env, "PUT", `/admin/payments/${a.id}`, { tenancy_id: 999 })).status, 404);
  const kind = await req(env, "PUT", `/admin/payments/${b.id}`, { kind: "other" });
  assert.equal(kind.status, 200, JSON.stringify(kind.data));
  assert.deepEqual([kind.data.payment.tenancy_id, kind.data.payment.kind], [null, "other"]);
  const put = await req(env, "PUT", `/admin/payments/${a.id}`, { tenancy_id: id });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  assert.equal(put.data.balance, 0);
  assert.equal(put.data.arrears, null);
  assert.equal((await req(env, "PUT", `/admin/payments/${a.id}`, { tenancy_id: lo })).status, 409, "rent can't go to let_only");

  // P9: moved to another full tenancy, then back to Unmatched; each move logged before/after.
  const other = await tenancy(env, { days: 6 });
  const moved = await req(env, "PUT", `/admin/payments/${a.id}`, { tenancy_id: other });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.tenancy.id, other);
  assert.equal(moved.data.balance, 0);
  assert.equal((await detail(env, id)).balance, 150000, "the first tenancy owes again");
  const back = await req(env, "PUT", `/admin/payments/${a.id}`, { tenancy_id: null });
  assert.equal(back.status, 200, JSON.stringify(back.data));
  assert.equal(back.data.payment.tenancy_id, null);
  assert.equal((await detail(env, other)).balance, 150000);
  const otherRental = row(env, "SELECT rental_id FROM tenancies WHERE id = ?", other).rental_id;
  assert.deepEqual(events(env, "payment.updated").map(e => [e.rental_id, e.tenancy_id, e.data.before, e.data.after]), [
    [null, null, { tenancy_id: null, kind: "rent" }, { tenancy_id: null, kind: "other" }],
    [row(env, "SELECT rental_id FROM tenancies WHERE id = ?", id).rental_id, id, { tenancy_id: null, kind: "rent" }, { tenancy_id: id, kind: "rent" }],
    [otherRental, other, { tenancy_id: id, kind: "rent" }, { tenancy_id: other, kind: "rent" }],
    [otherRental, other, { tenancy_id: other, kind: "rent" }, { tenancy_id: null, kind: "rent" }],
  ]);
  assert.equal((await req(env, "PUT", `/admin/payments/${a.id}`, { tenancy_id: "x" })).status, 400);
});

test("import: 501 rows is 400; a cell starting with = is stored as plain text", async () => {
  const env = makeEnv();
  const many = Array.from({ length: 501 }, (_, i) => ROW({ n: i + 1 }));
  const big = await imp(env, many, true);
  assert.equal(big.status, 400);
  assert.equal((await imp(env, many.slice(0, 500), true)).status, 200);
  assert.equal((await imp(env, [ROW({ n: 0 })], true)).status, 400);
  assert.equal((await imp(env, "rows", true)).status, 400);

  const evil = '=HYPERLINK("http://x","<b>click</b>")';
  const r = await imp(env, [ROW({ description: evil })]);
  assert.equal(r.status, 200);
  assert.equal(r.data.rows[0].description, evil);
  assert.equal(payments(env)[0].description, evil);
  assert.equal(r.data.unmatched, 1);
});

test("payment routes: signed out 401", async () => {
  const env = makeEnv();
  for (const [m, p] of [["POST", "/admin/payments"], ["PUT", "/admin/payments/1"], ["POST", "/admin/payments/import"],
    ["PUT", `/admin/tenancies/1/arrears/${T}/firm`]]) assert.equal((await call(env, m, p, { body: {} })).status, 401);
});
