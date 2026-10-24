import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { addMonths, paymentRef } from "../../server/rentals.js";
import { ensureCharges } from "../../server/routes/rent.js";

const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args);
const events = (env, type) => rows(env, "SELECT rental_id, tenancy_id, data FROM rental_events WHERE type = ? ORDER BY id", type)
  .map(e => ({ ...e, data: JSON.parse(e.data) }));
const charges = (env, id) => rows(env, "SELECT due_on, amount, kind FROM charges WHERE tenancy_id = ? ORDER BY due_on, kind", id)
  .map(c => [c.due_on, c.amount, c.kind]);
const T = jerseyToday(), M0 = `${T.slice(0, 7)}-01`, month = n => addMonths(M0, n);
// Charges are made up to, not including, the first day of the month after next (Jersey).
const LIMIT = month(2);
// R23: the due dates from `first`, then `day` of each following month, until LIMIT or the move-out.
const rentDues = (first, day, ended = "9999") => {
  const out = [], dd = String(day).padStart(2, "0");
  for (let n = 0, d = first; d < LIMIT && d < ended; d = `${addMonths(`${first.slice(0, 8)}01`, ++n).slice(0, 8)}${dd}`) out.push(d);
  return out;
};

async function rental(env, over = {}) {
  const l = await req(env, "POST", "/admin/landlords", { name: "Anne Owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "1 Rue des Pres",
    parish: "St Helier", service: "full", fee_percent: 10, ...over });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.rental.id;
}
const TENANCY = { tenant_name: "Tom Tenant", kind: "periodic", regime: "2025", rent: 1500 };
// collect_from defaults to the start here (P22: the API asks for it when the start is before this month).
const newTenancy = (env, rentalId, over = {}) => req(env, "POST", `/admin/rentals/${rentalId}/tenancies`,
  { ...TENANCY, start_on: M0, collect_from: over.start_on ?? M0, ...over });
async function tenancy(env, rentalId, over) {
  const r = await newTenancy(env, rentalId, over);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.tenancy.id;
}
const stamp = (env, table, id) => row(env, `SELECT updated_at FROM ${table} WHERE id = ?`, id).updated_at;

test("tenancy: payment reference HE-T plus four digits, unique", async () => {
  const env = makeEnv();
  const a = await rental(env), b = await rental(env, { service: "let_only", fee_percent: null });
  const before = stamp(env, "rentals", a);
  const ta = await newTenancy(env, a, { start_on: "2025-03-01", kind: "fixed", end_on: "2026-03-01" });
  assert.equal(ta.status, 201, JSON.stringify(ta.data));
  const tb = await tenancy(env, b, { start_on: "2025-04-01" });
  const refs = rows(env, "SELECT id, payment_ref FROM tenancies ORDER BY id");
  assert.deepEqual(refs.map(r => r.payment_ref), [paymentRef(ta.data.tenancy.id), paymentRef(tb)]);
  for (const r of refs) assert.match(r.payment_ref, /^HE-T\d{4}$/);
  assert.notEqual(refs[0].payment_ref, refs[1].payment_ref);
  assert.equal(ta.data.tenancy.payment_ref, refs[0].payment_ref);
  assert.deepEqual(rows(env, "SELECT tenancy_id, effective_on, rent FROM rent_changes ORDER BY id").map(Object.values),
    [[ta.data.tenancy.id, "2025-03-01", 1500], [tb, "2025-04-01", 1500]], "the starting rent is the first rent change");
  assert.deepEqual(events(env, "tenancy.created").map(e => [e.rental_id, e.tenancy_id, e.data.tenancy_id]),
    [[a, ta.data.tenancy.id, ta.data.tenancy.id], [b, tb, tb]]);
  assert.notEqual(stamp(env, "rentals", a), before, "the property's lock moves with a new tenancy (R22)");

  const bad = await newTenancy(env, a, { kind: "fixed", tenant_name: "" });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.fields.end_on && bad.data.fields.tenant_name);
  assert.equal((await newTenancy(env, 999)).status, 404);
  assert.equal((await req(env, "GET", "/admin/tenancies/999")).status, 404);
});

test("charges: generated from collect_from to next month, once, even if called twice", async () => {
  const env = makeEnv();
  const start = `${month(-3).slice(0, 8)}10`;
  const id = await tenancy(env, await rental(env), { start_on: start });
  const dues = rentDues(start, 10);
  assert.equal(dues.length, 5);
  assert.deepEqual(charges(env, id), dues.map(d => [d, 150000, "rent"]));
  await ensureCharges(env, T).run();
  await ensureCharges(env, T, id).run();
  const got = await req(env, "GET", `/admin/tenancies/${id}`);
  assert.equal(got.status, 200);
  assert.deepEqual(charges(env, id), dues.map(d => [d, 150000, "rent"]), "no duplicates");
  assert.equal(got.data.charges.length, 5);
  assert.equal(got.data.balance, 150000 * dues.filter(d => d <= T).length, "only charges already due count");

  // R23: the first charge falls on collect_from, the next ones on the due day.
  const from = `${month(-1).slice(0, 8)}20`;
  const late = await tenancy(env, await rental(env), { start_on: start, collect_from: from });
  assert.deepEqual(charges(env, late).map(c => c[0]), [from, `${M0.slice(0, 8)}10`, `${month(1).slice(0, 8)}10`]);
});

test("charges: a 2023 tenancy collected from this month has no backlog; an opening balance is one charge", async () => {
  const env = makeEnv();
  const id = await tenancy(env, await rental(env), { start_on: "2023-05-01", collect_from: M0, opening_balance: 123456 });
  assert.deepEqual(charges(env, id), [[M0, 123456, "opening"], [M0, 150000, "rent"], [month(1), 150000, "rent"]]);
  await ensureCharges(env, T).run();
  assert.equal(charges(env, id).length, 3);
  assert.equal((await req(env, "GET", `/admin/tenancies/${id}`)).data.balance, 273456);
  const zero = await tenancy(env, await rental(env), { start_on: "2023-05-01", collect_from: M0, opening_balance: 0 });
  assert.deepEqual(charges(env, zero).map(c => c[2]), ["rent", "rent"], "a zero opening balance is no charge");
});

test("charges: due_day 28 in February and a BST midnight land on the right Jersey day", async () => {
  const env = makeEnv();
  const rid = await rental(env);
  // Entered as data, so the dates do not depend on the day the test runs.
  const id = run(env, `INSERT INTO tenancies (rental_id, tenant_name, kind, regime, start_on, rent, due_day, collect_from,
    created_at, updated_at) VALUES (?, 'Tom', 'periodic', '2025', '2026-01-31', 1200, 28, '2026-01-31', 'x', 'x')`, rid).lastInsertRowid;
  run(env, `INSERT INTO rent_changes (tenancy_id, effective_on, rent, created_at) VALUES (?, '2026-01-31', 1200, 'x'),
    (?, '2026-05-01', 1300, 'x')`, id, id);
  const bstMidnight = jerseyToday(new Date("2026-06-30T23:30:00Z"));
  assert.equal(bstMidnight, "2026-07-01");
  await ensureCharges(env, bstMidnight, Number(id)).run();
  assert.deepEqual(charges(env, id), [["2026-01-31", 120000], ["2026-02-28", 120000], ["2026-03-28", 120000],
    ["2026-04-28", 120000], ["2026-05-28", 130000], ["2026-06-28", 130000], ["2026-07-28", 130000], ["2026-08-28", 130000]]
    .map(c => [...c, "rent"]), "through August: July is this month in Jersey");
});

test("charges: stop at ended_on; continue past end_on while the tenant stays", async () => {
  const env = makeEnv();
  const rid = await rental(env);
  const start = `${month(-8).slice(0, 8)}15`, end_on = addMonths(start, 6);
  const id = await tenancy(env, rid, { start_on: start, kind: "fixed", end_on, regime: "2011" });
  assert.deepEqual(charges(env, id).map(c => c[0]), rentDues(start, 15), "past end_on, still charged (R24)");
  assert.ok(charges(env, id).at(-1)[0] > end_on);

  assert.equal((await req(env, "POST", `/admin/tenancies/${id}/end`, { ended_on: plusDays(start, -1) })).status, 400);
  const ended_on = plusDays(T, 10), before = stamp(env, "rentals", rid);
  const gone = rentDues(start, 15).filter(d => d >= ended_on);
  const end = await req(env, "POST", `/admin/tenancies/${id}/end`, { ended_on });
  assert.equal(end.status, 200, JSON.stringify(end.data));
  assert.equal(end.data.tenancy.ended_on, ended_on);
  const dues = rentDues(start, 15, ended_on);
  assert.deepEqual(charges(env, id).map(c => c[0]), dues, "nothing due on or after the move-out");
  await ensureCharges(env, T).run();
  await ensureCharges(env, addMonths(T, 3), id).run();
  assert.deepEqual(charges(env, id).map(c => c[0]), dues, "and nothing generated after it");
  assert.notEqual(stamp(env, "rentals", rid), before);
  assert.deepEqual(events(env, "tenancy.ended").map(e => [e.tenancy_id, e.data]),
    [[id, { ended_on, removed: { count: gone.length, amount: 150000 * gone.length } }]], "the history explains the balance");
  const again = await req(env, "POST", `/admin/tenancies/${id}/end`, { ended_on });
  assert.equal(again.status, 200, "the same move-out again changes nothing");
  assert.equal(events(env, "tenancy.ended").length, 1);
  run(env, "UPDATE tenancies SET ended_on = ? WHERE id = ?", plusDays(T, -1), id);
  assert.equal((await req(env, "POST", `/admin/tenancies/${id}/end`, { ended_on })).status, 409, "already ended");
});

test("rent change: only future charges not edited by hand take the new rent; past effective date is 400", async () => {
  const env = makeEnv();
  const id = await tenancy(env, await rental(env), { rent: 1000, due_day: 1 });
  await ensureCharges(env, month(3), id).run();
  const [m3] = rows(env, "SELECT id FROM charges WHERE tenancy_id = ? AND due_on = ?", id, month(3));
  const edit = await req(env, "PUT", `/admin/charges/${m3.id}`, { amount: 99950 });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.equal(row(env, "SELECT edited FROM charges WHERE id = ?", m3.id).edited, 1);
  assert.deepEqual(events(env, "charge.edited").map(e => [e.tenancy_id, e.data.before, e.data.after]), [[id, 100000, 99950]]);
  assert.equal((await req(env, "PUT", `/admin/charges/${m3.id}`, { amount: 0 })).status, 400);
  assert.equal((await req(env, "PUT", `/admin/charges/${m3.id}`, { amount: 10.5 })).status, 400);
  assert.equal((await req(env, "PUT", "/admin/charges/999", { amount: 100 })).status, 404);

  assert.equal((await req(env, "POST", `/admin/tenancies/${id}/rent`, { rent: 1100, effective_on: plusDays(T, -1) })).status, 400);
  assert.equal((await req(env, "POST", `/admin/tenancies/${id}/rent`, { rent: 0, effective_on: month(2) })).status, 400);
  const change = await req(env, "POST", `/admin/tenancies/${id}/rent`, { rent: 1100, effective_on: month(2) });
  assert.equal(change.status, 200, JSON.stringify(change.data));
  assert.deepEqual(charges(env, id).map(c => c.slice(0, 2)), [[month(0), 100000], [month(1), 100000], [month(2), 110000],
    [month(3), 99950], [month(4), 110000]]);
  assert.equal(change.data.tenancy.rent, 1100);
  assert.equal(change.data.tenancy.last_rent_change_on, month(2));
  assert.equal(change.data.current_rent, 1000, "the rent in force today, while the rise waits");
  await ensureCharges(env, month(4), id).run();
  assert.deepEqual(charges(env, id).at(-1).slice(0, 2), [month(5), 110000], "new charges take the rent in force");
  assert.deepEqual(events(env, "rent.changed").map(e => [e.data.before, e.data.rent, e.data.effective_on]), [[1000, 1100, month(2)]]);

  // A change effective on the start date replaces the starting rent (one rent change per date); a charge due today is
  // already due and keeps its amount (R28), the next one takes the new rent.
  const fresh = await tenancy(env, await rental(env), { start_on: T, rent: 1000 });
  assert.equal((await req(env, "POST", `/admin/tenancies/${fresh}/rent`, { rent: 1050, effective_on: T })).status, 200);
  assert.deepEqual(rows(env, "SELECT effective_on, rent FROM rent_changes WHERE tenancy_id = ?", fresh).map(Object.values), [[T, 1050]]);
  assert.equal((await req(env, "GET", `/admin/tenancies/${fresh}`)).data.current_rent, 1050, "a change from today is in force today");
  const ahead = await tenancy(env, await rental(env), { start_on: month(1), rent: 1200 });
  assert.equal((await req(env, "GET", `/admin/tenancies/${ahead}`)).data.current_rent, 1200, "before the start: the starting rent");
  assert.deepEqual(charges(env, fresh).map(c => c.slice(0, 2)), [[T, 100000], [charges(env, fresh)[1][0], 105000]]);
});

test("renew: same reference, new end or periodic, regime 2025 after 15 April 2026", async () => {
  const env = makeEnv();
  const rid = await rental(env);
  const id = await tenancy(env, rid, { start_on: "2025-06-01", kind: "fixed", end_on: "2026-06-01", regime: "2011" });
  const ref = row(env, "SELECT payment_ref FROM tenancies WHERE id = ?", id).payment_ref;
  const path = `/admin/tenancies/${id}/renew`;
  assert.equal((await req(env, "POST", path, { kind: "fixed" })).status, 400, "a fixed term needs its end");
  assert.equal((await req(env, "POST", path, { kind: "fixed", end_on: T })).status, 400, "the end is after today");
  assert.equal((await req(env, "POST", path, { kind: "monthly" })).status, 400);
  const before = stamp(env, "rentals", rid), end_on = addMonths(T, 12);
  const fixed = await req(env, "POST", path, { kind: "fixed", end_on });
  assert.equal(fixed.status, 200, JSON.stringify(fixed.data));
  assert.deepEqual([fixed.data.tenancy.payment_ref, fixed.data.tenancy.end_on, fixed.data.tenancy.regime], [ref, end_on, "2025"]);
  assert.notEqual(stamp(env, "rentals", rid), before);

  assert.equal((await req(env, "POST", path, { kind: "periodic", rent: 1600 })).status, 400, "a new rent needs its date");
  const periodic = await req(env, "POST", path, { kind: "periodic", rent: 1600, effective_on: month(1) });
  assert.equal(periodic.status, 200, JSON.stringify(periodic.data));
  const t = periodic.data.tenancy;
  assert.deepEqual([t.payment_ref, t.kind, t.end_on, t.rent, t.last_rent_change_on], [ref, "periodic", null, 1600, month(1)]);
  assert.equal(charges(env, id).at(-1)[1], 160000, "next month's charge takes the new rent");
  assert.deepEqual(events(env, "tenancy.renewed").map(e => [e.data.after.kind, e.data.after.end_on, e.data.after.regime]),
    [["fixed", end_on, "2025"], ["periodic", null, "2025"]]);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM tenancies").n, 1, "the same tenancy");
});

test("charges: a service switch moving collect_from never charges a month or the opening balance twice", async () => {
  const env = makeEnv();
  const rid = await rental(env);
  const start = `${month(-4).slice(0, 8)}15`;
  const id = await tenancy(env, rid, { start_on: start, rent: 1000, opening_balance: 5000 });
  const before = charges(env, id), balance = (await req(env, "GET", `/admin/tenancies/${id}`)).data.balance;
  assert.equal(balance, 5000 + 100000 * rentDues(start, 15).filter(d => d <= T).length);
  const putRental = body => req(env, "PUT", `/admin/rentals/${rid}`, { updated_at: stamp(env, "rentals", rid), ...body });
  assert.equal((await putRental({ service: "let_only" })).status, 200);
  const back = await putRental({ service: "full", collect_from: T });
  assert.equal(back.status, 200, JSON.stringify(back.data));
  const got = await req(env, "GET", `/admin/tenancies/${id}`);
  await ensureCharges(env, addMonths(T, 2)).run();
  const months = charges(env, id).filter(c => c[2] === "rent").map(c => c[0].slice(0, 7));
  assert.equal(new Set(months).size, months.length, "one rent charge a month");
  assert.equal(charges(env, id).filter(c => c[2] === "opening").length, 1, "one opening charge");
  assert.deepEqual(charges(env, id).slice(0, before.length), before);
  assert.equal(got.data.balance, balance);
});

test("let_only: no charges at all", async () => {
  const env = makeEnv();
  const rid = await rental(env, { service: "let_only", fee_percent: null });
  const id = await tenancy(env, rid, { start_on: "2025-01-01", collect_from: "2025-02-01", opening_balance: 5000 });
  await ensureCharges(env, T).run();
  assert.deepEqual(charges(env, id), []);
  assert.equal(row(env, "SELECT collect_from FROM tenancies WHERE id = ?", id).collect_from, null, "Hampton doesn't collect");
  const got = await req(env, "GET", `/admin/tenancies/${id}`);
  assert.deepEqual([got.data.charges, got.data.balance], [[], 0]);
});

test("second active tenancy on a property is 409; after a future ended_on the next one can be created", async () => {
  const env = makeEnv();
  const rid = await rental(env);
  const first = await tenancy(env, rid, { start_on: "2025-01-01" });
  const second = await newTenancy(env, rid, { start_on: "2026-01-01" });
  assert.equal(second.status, 409, JSON.stringify(second.data));
  const ended_on = plusDays(T, 20);
  assert.equal((await req(env, "POST", `/admin/tenancies/${first}/end`, { ended_on })).status, 200);
  const early = await newTenancy(env, rid, { start_on: plusDays(ended_on, -1) });
  assert.equal(early.status, 400, "no overlap with the tenant moving out");
  assert.ok(early.data.fields.start_on);
  const next = await newTenancy(env, rid, { start_on: ended_on, tenant_name: "Nina Next" });
  assert.equal(next.status, 201, JSON.stringify(next.data));

  // Another tenancy entered between the checks and the write, still open or ending after this start: 409, nothing
  // written.
  for (const sneakEnd of [null, addMonths(M0, 3)]) {
    const other = await rental(env), n = rows(env, "SELECT id FROM rental_events").length;
    const batch = env.DB.batch.bind(env.DB);
    env.DB.batch = async stmts => {
      if (stmts[0].sql.includes("INSERT INTO tenancies")) {
        env.DB.batch = batch;
        run(env, `INSERT INTO tenancies (rental_id, tenant_name, kind, regime, start_on, rent, due_day, ended_on, created_at,
          updated_at) VALUES (?, 'Sneaky', 'periodic', '2025', '2026-01-01', 900, 1, ?, 'x', 'x')`, other, sneakEnd);
      }
      return batch(stmts);
    };
    const raced = await newTenancy(env, other);
    assert.equal(raced.status, 409, JSON.stringify(raced.data));
    assert.equal(row(env, "SELECT COUNT(*) AS n FROM tenancies WHERE rental_id = ?", other).n, 1);
    assert.equal(rows(env, "SELECT id FROM rental_events").length, n);
  }
});

test("tenancy: edit with lock and merged checks, notice, and the detail's deadlines and assistant", async () => {
  const env = makeEnv();
  const start = plusDays(T, -10);
  const id = await tenancy(env, await rental(env), { start_on: start, deposit: 1500, deposit_received_on: plusDays(T, -5) });
  await req(env, "PUT", "/admin/settings/rpi", { percent: 3.2, as_of: "2026-09-30" });
  const got = (await req(env, "GET", `/admin/tenancies/${id}`)).data;
  assert.deepEqual(got.assistant.rpi, { percent: 3.2, as_of: "2026-09-30" });
  assert.equal(got.assistant.max_rent, 1548);
  assert.deepEqual(got.deadlines.map(d => [d.key, d.due_on, d.status]), [["deposit", plusDays(T, 25), "due30"],
    ["inventory_in", plusDays(start, 7), "overdue"]]);
  assert.equal(got.earliest_move_out, null);

  const put = body => req(env, "PUT", `/admin/tenancies/${id}`, { updated_at: stamp(env, "tenancies", id), ...body });
  assert.equal((await req(env, "PUT", `/admin/tenancies/${id}`, { tenant_phone: "07797" })).status, 400, "updated_at needed");
  assert.equal((await req(env, "PUT", `/admin/tenancies/${id}`, { updated_at: "2000-01-01", tenant_phone: "07797" })).status, 409);
  const fixed = await put({ kind: "fixed" });
  assert.equal(fixed.status, 400, "the merged row: fixed needs an end");
  assert.ok(fixed.data.fields.end_on);
  const cur = row(env, "SELECT * FROM tenancies WHERE id = ?", id);
  const locked = { rent: 7, due_day: cur.due_day % 28 + 1, start_on: plusDays(start, 1) };
  for (const [k, v] of Object.entries(locked)) {
    const r = await put({ [k]: v });
    assert.equal(r.status, 400, k);
    assert.ok(r.data.fields[k], k);
  }
  const ok = await put({ tenant_phone: "07797 123456", deposit_protected_on: T, inventory_in_on: start, rent: 1500 });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(ok.data.deadlines.map(d => d.status), ["done", "done"]);
  assert.deepEqual(events(env, "tenancy.updated").map(e => Object.keys(e.data.after)),
    [["tenant_phone", "deposit_protected_on", "inventory_in_on"]]);

  assert.equal((await req(env, "POST", `/admin/tenancies/${id}/notice`, { given_on: T, by: "agent" })).status, 400);
  const notice = await req(env, "POST", `/admin/tenancies/${id}/notice`, { given_on: T, by: "tenant" });
  assert.equal(notice.status, 200, JSON.stringify(notice.data));
  assert.equal(notice.data.earliest_move_out, addMonths(T, 1));
  assert.deepEqual([notice.data.tenancy.notice_given_on, notice.data.tenancy.notice_by], [T, "tenant"]);
  assert.deepEqual(events(env, "notice.recorded").map(e => e.data), [{ given_on: T, by: "tenant", earliest_move_out: addMonths(T, 1) }]);

  const end = await req(env, "POST", `/admin/tenancies/${id}/end`, { ended_on: T });
  assert.deepEqual(end.data.deadlines.at(-1), { key: "inventory_out", label: "Check-out report", due_on: plusDays(T, 7),
    done_on: null, status: "due7" });
});

test("collect_from: a start before this month needs it; this month or later defaults to the start (P22)", async () => {
  const env = makeEnv();
  const missing = await newTenancy(env, await rental(env), { start_on: month(-1), collect_from: undefined });
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.data.fields, { collect_from: "Enter the date Hampton starts collecting the rent" });
  assert.equal(rows(env, "SELECT id FROM tenancies").length, 0);
  const now = await newTenancy(env, await rental(env), { start_on: M0, collect_from: undefined });
  assert.equal(now.status, 201, JSON.stringify(now.data));
  assert.equal(now.data.tenancy.collect_from, M0);
  const letOnly = await newTenancy(env, await rental(env, { service: "let_only", fee_percent: null }),
    { start_on: month(-6), collect_from: undefined });
  assert.equal(letOnly.status, 201, "let only collects nothing");
});

test("collect_from: moved later drops the earlier rent charges not corrected by hand; earlier is 400 (P22)", async () => {
  const env = makeEnv();
  // Entered with the start as collect_from: 30 months charged that Hampton never collected.
  const start = month(-30), id = await tenancy(env, await rental(env), { start_on: start, due_day: 1, opening_balance: 5000 });
  run(env, "UPDATE charges SET amount = 100, edited = 1 WHERE tenancy_id = ? AND due_on = ? AND kind = 'rent'", id, month(-20));
  const put = body => req(env, "PUT", `/admin/tenancies/${id}`, { updated_at: stamp(env, "tenancies", id), ...body });
  const moved = await put({ collect_from: M0 });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.deepEqual(charges(env, id), [[start, 5000, "opening"], [month(-20), 100, "rent"], [M0, 150000, "rent"],
    [month(1), 150000, "rent"]], "the opening charge and the corrected one stay");
  assert.equal(moved.data.balance, 5000 + 100 + 150000);
  assert.deepEqual(events(env, "tenancy.updated").map(e => e.data), [{ before: { collect_from: start }, after: { collect_from: M0 },
    removed: { count: 29, amount: 29 * 150000 } }]);
  await ensureCharges(env, addMonths(T, 2), id).run();
  assert.deepEqual(charges(env, id).slice(2).map(c => c[0]), [M0, month(1), month(2), month(3)], "the series goes on");

  const earlier = await put({ collect_from: month(-1) });
  assert.equal(earlier.status, 400);
  assert.deepEqual(earlier.data.fields, { collect_from: "Add the earlier months to the opening charge with Correct, under Charges" });
  assert.equal((await put({ collect_from: null })).data.fields.collect_from, "Enter the date Hampton starts collecting the rent");

  // Moved to a day that isn't the rent day: its month is charged on it (R23), as a new tenancy would be.
  const mid = await tenancy(env, await rental(env), { start_on: month(-3), due_day: 1 });
  const fifteenth = `${M0.slice(0, 8)}15`, putMid = body => req(env, "PUT", `/admin/tenancies/${mid}`,
    { updated_at: stamp(env, "tenancies", mid), ...body });
  assert.equal((await putMid({ collect_from: fifteenth })).status, 200);
  assert.deepEqual(charges(env, mid).map(c => c[0]), [fifteenth, month(1)]);

  const lo = await tenancy(env, await rental(env, { service: "let_only", fee_percent: null }), { start_on: M0 });
  const loPut = await req(env, "PUT", `/admin/tenancies/${lo}`, { updated_at: stamp(env, "tenancies", lo), collect_from: month(1) });
  assert.deepEqual(loPut.data.fields, { collect_from: "Only full management tenancies collect rent" });
  assert.equal((await req(env, "POST", `/admin/tenancies/${mid}/end`, { ended_on: month(1) })).status, 200);
  assert.deepEqual((await putMid({ collect_from: month(1) })).data.fields, { collect_from: "Use a date before the move-out" });
});

test("opening balance: added later while there is no opening charge, made at once; then corrected on its charge", async () => {
  const env = makeEnv();
  const id = await tenancy(env, await rental(env), { start_on: month(-3), collect_from: M0, due_day: 1 });
  const put = body => req(env, "PUT", `/admin/tenancies/${id}`, { updated_at: stamp(env, "tenancies", id), ...body });
  assert.deepEqual((await put({ collect_from: month(-1) })).data.fields,
    { collect_from: "Enter what was owed for the earlier months in Owed today" });
  // A planned move-out right after the first rent charge: ensureCharges would not make the opening charge any more.
  assert.equal((await req(env, "POST", `/admin/tenancies/${id}/end`, { ended_on: month(1) })).status, 200);
  const ok = await put({ opening_balance: 300000 });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(charges(env, id), [[M0, 300000, "opening"], [M0, 150000, "rent"]]);
  assert.equal(ok.data.balance, 450000);
  assert.equal(ok.data.tenancy.has_opening, 1);
  assert.deepEqual(events(env, "tenancy.updated").map(e => e.data), [{ before: { opening_balance: null }, after: { opening_balance: 300000 } }]);
  const again = await put({ opening_balance: 1000 });
  assert.deepEqual(again.data.fields, { opening_balance: "Its opening charge is already made: use Correct on that charge under Charges" });
  assert.deepEqual((await put({ collect_from: month(-1) })).data.fields,
    { collect_from: "Add the earlier months to the opening charge with Correct, under Charges" });
  const lo = await tenancy(env, await rental(env, { service: "let_only", fee_percent: null }), { start_on: M0 });
  const loPut = await req(env, "PUT", `/admin/tenancies/${lo}`, { updated_at: stamp(env, "tenancies", lo), opening_balance: 500 });
  assert.deepEqual(loPut.data.fields, { opening_balance: "Only full management tenancies collect rent" });
});

test("move-out: a planned one moves (not before today) or is cancelled, and the charges come back (P22)", async () => {
  const env = makeEnv();
  const rid = await rental(env), id = await tenancy(env, rid, { start_on: month(-2), due_day: 1 });
  const end = ended_on => req(env, "POST", `/admin/tenancies/${id}/end`, { ended_on });
  const cancel = () => req(env, "DELETE", `/admin/tenancies/${id}/end`);
  assert.equal((await cancel()).status, 409, "no move-out to cancel");
  assert.equal((await end(month(1))).status, 200);
  assert.deepEqual(charges(env, id).map(c => c[0]), [month(-2), month(-1), M0]);
  assert.deepEqual((await end(plusDays(T, -1))).data.fields, { ended_on: `Use ${T} or a later date` });
  const later = await end(month(3));
  assert.equal(later.status, 200, JSON.stringify(later.data));
  assert.deepEqual(charges(env, id).map(c => c[0]), [month(-2), month(-1), M0, month(1)], "next month is charged again");
  const back = await cancel();
  assert.equal(back.status, 200, JSON.stringify(back.data));
  assert.equal(back.data.tenancy.ended_on, null);
  await ensureCharges(env, addMonths(T, 3), id).run();
  assert.deepEqual(charges(env, id).map(c => c[0]), [-2, -1, 0, 1, 2, 3, 4].map(month), "no gap after the cancelled move-out");
  assert.deepEqual([...events(env, "tenancy.ended"), ...events(env, "tenancy.end_cancelled")].map(e => e.data), [
    { ended_on: month(1), removed: { count: 1, amount: 150000 } },
    { ended_on: month(3), before: month(1), removed: { count: 0, amount: 0 } }, { before: month(3) }]);
  assert.equal((await newTenancy(env, rid, { start_on: month(5) })).status, 409, "the property is taken again");

  // With the next tenancy entered, the move-out can't be cancelled or moved past its start.
  assert.equal((await end(month(2))).status, 200);
  assert.equal((await newTenancy(env, rid, { start_on: month(2), tenant_name: "Nina Next" })).status, 201);
  assert.equal((await cancel()).status, 409);
  assert.deepEqual((await end(month(3))).data.fields, { ended_on: `The next tenancy starts on ${month(2)}: use that date or earlier` });
  assert.equal((await end(month(1))).status, 200, "earlier is fine");
  run(env, "UPDATE tenancies SET ended_on = ? WHERE id = ?", plusDays(T, -1), id);
  assert.equal((await cancel()).status, 409, "already ended");
});

test("current rent: before the start it is the starting rent, not a later agreed one", async () => {
  const env = makeEnv();
  const id = await tenancy(env, await rental(env), { start_on: month(1), rent: 1000 });
  assert.equal((await req(env, "POST", `/admin/tenancies/${id}/rent`, { rent: 1200, effective_on: month(3) })).status, 200);
  const d = (await req(env, "GET", `/admin/tenancies/${id}`)).data;
  assert.deepEqual([d.current_rent, d.tenancy.rent, d.tenancy.last_rent_change_on], [1000, 1200, month(3)]);
});

test("tenancy routes: signed out 401, cross-origin 403", async () => {
  const env = makeEnv();
  const id = await tenancy(env, await rental(env));
  const routes = [["POST", "/admin/rentals/1/tenancies"], ["GET", `/admin/tenancies/${id}`], ["PUT", `/admin/tenancies/${id}`],
    ["POST", `/admin/tenancies/${id}/rent`], ["POST", `/admin/tenancies/${id}/renew`], ["POST", `/admin/tenancies/${id}/notice`],
    ["POST", `/admin/tenancies/${id}/end`], ["PUT", "/admin/charges/1"]];
  for (const [m, p] of routes) {
    const body = m === "GET" ? undefined : {};
    assert.equal((await call(env, m, p, { body })).status, 401, `${m} ${p}`);
    if (m !== "GET") assert.equal((await call(env, m, p, { body, cookie: await adminCookie(), origin: "https://evil.test" }))
      .status, 403, `${m} ${p}`);
  }
});
