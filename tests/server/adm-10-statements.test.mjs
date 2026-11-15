// ADM-10: a landlord's monthly statement closed as a frozen revision, marked sent and paid by hand, and an Inbox task
// at the start of the month (ADM10_STATEMENTS_READY, migration 0090). Off, the statement answers as before.
// Production has neither 0046 nor 0049, so both are left out here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday } from "../../server/viewings.js";
import { addMonths } from "../../server/rentals.js";
import { notificationsPass } from "../../server/notification-reconcile.js";

const T = jerseyToday(), THIS = T.slice(0, 7), PREV = addMonths(`${THIS}-01`, -1).slice(0, 7);
const ON = { ADM10_STATEMENTS_READY: "1", ADM09_ARREARS_READY: "1" };
const env = (flags = ON, skip = [46, 49]) => Object.assign(makeEnv({ skip }), flags);
const req = async (e, method, path, body) => call(e, method, path, { body, cookie: await adminCookie() });
const run = (e, sql, ...a) => e.DB.raw.prepare(sql).run(...a);
const rows = (e, sql, ...a) => e.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

// A landlord with one full-management property (10% fee) and its tenancy, from before this month.
async function setup(e) {
  const L = ok(await req(e, "POST", "/admin/landlords", { name: "Sam Owner" }), 201).landlord.id;
  const R = ok(await req(e, "POST", "/admin/rentals", { landlord_id: L, address: "A House", parish: "St Helier",
    service: "full", fee_percent: 10 }), 201).rental.id;
  const t = ok(await req(e, "POST", `/admin/rentals/${R}/tenancies`, { tenant_name: "Tom Tenant", kind: "periodic",
    regime: "2025", rent: 1500, start_on: `${PREV}-01`, collect_from: `${PREV}-01` }), 201).tenancy;
  run(e, "UPDATE rentals SET created_at = ? WHERE id = ?", `${PREV}-01T00:00:00.000Z`, R);
  return { L, R, t };
}
const pay = (e, t, received_on, amount, kind = "rent") => run(e, `INSERT INTO payments (tenancy_id, received_on, amount, kind,
  source, created_at) VALUES (?, ?, ?, ?, 'manual', ?)`, t.id, received_on, amount, kind, T);
const get = (e, L, month = PREV) => req(e, "GET", `/admin/statements?landlord=${L}&month=${month}`);
const close = async (e, L, month = PREV, digest) =>
  req(e, "POST", "/admin/statements", { landlord: L, month, digest: digest ?? (await get(e, L, month)).data.digest });

test("switch off: the statement answers as before and nothing can be closed", async () => {
  const e = env({}), { L, t } = await setup(e);
  pay(e, t, `${PREV}-05`, 150000);
  const s = ok(await get(e, L));
  assert.equal(s.digest, undefined);
  assert.equal(s.runs, undefined);
  assert.deepEqual(s.totals, { rent: 150000, fee: 15000, gst: null, repairs: 0, net: 135000 });
  assert.equal((await req(e, "POST", "/admin/statements", { landlord: L, month: PREV, digest: "x" })).status, 404);
});

test("closing keeps the month as it was: a later correction shows as changed and needs a new revision", async () => {
  const e = env(), { L, t } = await setup(e);
  pay(e, t, `${PREV}-05`, 150000);
  pay(e, t, `${PREV}-06`, 200000, "deposit");
  let s = ok(await get(e, L));
  assert.match(s.digest, /^[0-9a-f]{64}$/);
  assert.deepEqual(s.runs, []);
  assert.equal(s.closed, null);

  assert.equal((await close(e, L, PREV, "0".repeat(64))).status, 409, "a preview that is not the current figures");
  assert.equal((await close(e, L, THIS)).status, 400, "the month has not ended");
  assert.equal((await req(e, "POST", "/admin/statements", { landlord: 999, month: PREV, digest: s.digest })).status, 404);
  const first = ok(await close(e, L), 201).run;
  assert.equal(first.revision, 1);
  assert.equal(first.net_pence, 135000);
  assert.equal((await close(e, L)).status, 409, "already closed with these figures");

  // A payment for that month recorded late: the live figures change, the closed statement does not.
  pay(e, t, `${PREV}-20`, 10000);
  s = ok(await get(e, L));
  assert.equal(s.totals.rent, 160000);
  assert.equal(s.closed.revision, 1);
  assert.equal(s.closed.statement.totals.rent, 150000);
  assert.equal(s.closed.statement.rentals[0].other_received, 200000);
  assert.notEqual(s.closed.source_digest, s.digest, "the panel shows the figures changed");

  const second = ok(await close(e, L), 201).run;
  assert.equal(second.revision, 2);
  s = ok(await get(e, L));
  assert.deepEqual(s.runs.map(r => [r.revision, r.net_pence]), [[2, 144000], [1, 135000]]);
  assert.equal(s.closed.revision, 2);
  assert.equal(s.closed.source_digest, s.digest);
  const kept = rows(e, "SELECT snapshot FROM statement_runs WHERE revision = 1")[0];
  assert.equal(JSON.parse(kept.snapshot).totals.rent, 150000, "revision 1 stays as it was closed");
});

test("a closed statement cannot be rewritten or deleted in the database", async () => {
  const e = env(), { L } = await setup(e);
  const { id } = ok(await close(e, L), 201).run;
  assert.throws(() => run(e, "UPDATE statement_runs SET net_pence = 1 WHERE id = ?", id), /statement_run_closed/);
  assert.throws(() => run(e, "UPDATE statement_runs SET snapshot = '{}' WHERE id = ?", id), /statement_run_closed/);
  assert.throws(() => run(e, "DELETE FROM statement_runs WHERE id = ?", id), /statement_run_closed/);
});

test("sent and paid to the landlord are recorded by hand, once each, with who and when", async () => {
  const e = env(), { L } = await setup(e);
  const { id } = ok(await close(e, L), 201).run;
  for (const what of ["sent", "paid"]) {
    const r = ok(await req(e, "PUT", `/admin/statement-runs/${id}/${what}`, {})).run;
    assert.equal(r[`${what}_on`], T);
    assert.match(r[`${what}_by`], /@/);
    assert.equal((await req(e, "PUT", `/admin/statement-runs/${id}/${what}`, {})).status, 409);
  }
  assert.equal((await req(e, "PUT", "/admin/statement-runs/999/sent", {})).status, 404);
  assert.throws(() => run(e, "UPDATE statement_runs SET sent_on = NULL WHERE id = ?", id), /statement_run_closed/);
  assert.equal((await call(e, "PUT", `/admin/statement-runs/${id}/paid`, { body: {} })).status, 401);
});

test("write-offs of the month show apart: no fee and not in the net", async () => {
  const e = env(), { L, t } = await setup(e);
  pay(e, t, `${THIS}-01`, 50000);
  const fin = (await req(e, "GET", `/admin/tenancies/${t.id}`)).data.tenancy.financial_revision;
  ok(await req(e, "POST", `/admin/tenancies/${t.id}/writeoffs`, { amount: 30000, reason: "Agreed with the landlord",
    financial_revision: fin }));
  const s = ok(await get(e, L, THIS));
  assert.equal(s.rentals[0].written_off, 30000);
  assert.equal(s.totals.written_off, 30000);
  assert.equal(s.totals.net, 50000 - 5000);
});

test("the Inbox asks to close last month's statements and the task resolves once they are closed", async () => {
  const e = env(), { L } = await setup(e);
  const task = () => rows(e, `SELECT title, target_kind, target_id, resolved_at IS NULL AS open FROM notifications
    WHERE task_key LIKE 'queue:statement:%'`);
  await notificationsPass(e, new Date().toISOString());
  assert.deepEqual(task(), [{ title: "Close landlord statements", target_kind: "collection",
    target_id: `landlord-statements:${PREV}`, open: 1 }]);
  const item = ok(await req(e, "GET", "/admin/notifications?box=action&category=task")).notifications
    .find(n => n.title === "Close landlord statements");
  assert.equal(item?.link, `#/rentals/statements?month=${PREV}`);
  ok(await close(e, L), 201);
  await notificationsPass(e, new Date().toISOString());
  assert.equal(task()[0].open, 0);

  const off = env({}), o = await setup(off);
  await notificationsPass(off, new Date().toISOString());
  assert.equal(rows(off, "SELECT COUNT(*) AS n FROM notifications WHERE task_key LIKE 'queue:statement:%'")[0].n, 0);
  assert.ok(o.L);
});

test("the website and the clock share the switch, so the Inbox task follows the panel", () => {
  const flag = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(/^ADM10_STATEMENTS_READY = "([01])"$/m)?.[1] ?? "0";
  assert.equal(flag("wrangler.toml"), flag("jobs/wrangler.toml"));
});
