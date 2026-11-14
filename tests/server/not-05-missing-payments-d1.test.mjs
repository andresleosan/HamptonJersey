// NOT-05 on local D1 (Miniflare), every migration on a fresh database: the Missing payments tab agrees with Rentals › To
// do › Arrears row by row and with Rentals' owed total, and two grace-period saves at once leave one. Synthetic fixtures only.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { call, adminCookie, SECRET } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";

const TS = "2026-10-07T10:00:00.000Z", T = jerseyToday(), ago = n => plusDays(T, -n);
let mf, env;
const req = async (method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const counts = async () => Promise.all(["charges", "payments", "arrears_steps", "notifications", "rental_events"]
  .map(async t => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n));

before(async () => {
  const require = createRequire(import.meta.url), { Miniflare, convertV4MiniflareOptions } = require("miniflare"),
    { unstable_splitSqlQuery } = require("wrangler");
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('fixture')}}",
    compatibilityDate: "2025-10-01", host: "127.0.0.1", port: 0, d1Databases: { DB: "not05-missing-payments-fixture" } }));
  const DB = await mf.getD1Database("DB"), dir = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(dir).filter(f => f.endsWith(".sql")).sort())
    await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), "utf8")).map(sql => DB.prepare(sql)));
  await DB.prepare("INSERT INTO admins (email, added_by, added_at) VALUES ('admin@example.test', 'setup', ?)").bind(TS).run();
  env = { DB, SESSION_SECRET: SECRET, NOT05_MISSING_PAYMENTS_READY: "1" };
});
after(async () => { if (mf) await mf.dispose(); });

test("D1: the tab and Rentals › To do › Arrears read the same balances; reading makes nothing", async () => {
  const L = ok(await req("POST", "/admin/landlords", { name: "Synthetic Owner" }), 201).landlord.id;
  const home = async (address, days, service = "full") => {
    const rid = ok(await req("POST", "/admin/rentals", { landlord_id: L, address, parish: "St Helier", service,
      fee_percent: service === "full" ? 10 : null }), 201).rental.id;
    return ok(await req("POST", `/admin/rentals/${rid}/tenancies`, { tenant_name: `Tenant of ${address}`, kind: "periodic",
      regime: "2025", rent: 1250, start_on: ago(days), collect_from: service === "full" ? ago(days) : undefined }), 201).tenancy;
  };
  const late = await home("1 Late Lane", 12), partial = await home("2 Part Paid Row", 8), paid = await home("3 Paid Place", 8);
  await home("4 Fresh Street", 2);
  const left = await home("5 Left Lane", 20);
  const letOnly = await home("6 Let Only Lane", 20, "let_only");
  ok(await req("POST", "/admin/payments", { tenancy_id: partial.id, received_on: ago(1), amount: 25000, kind: "rent" }), 201);
  ok(await req("POST", "/admin/payments", { tenancy_id: paid.id, received_on: ago(1), amount: 125000, kind: "rent" }), 201);
  ok(await req("POST", "/admin/payments", { tenancy_id: letOnly.id, received_on: ago(1), amount: 125000, kind: "deposit" }), 201);
  ok(await req("POST", `/admin/tenancies/${left.id}/end`, { ended_on: ago(3) }));
  ok(await req("PUT", `/admin/tenancies/${late.id}/arrears/${ago(12)}/call`, { note: "Rang, no answer" }));

  const before = await counts();
  const { todo, totals } = ok(await req("GET", "/admin/rentals"));
  const tab = ok(await req("GET", "/admin/missing-payments"));
  assert.equal(tab.grace_days, 3);
  assert.deepEqual(tab.payments.map(p => [p.address, p.balance, p.days_late, p.next_step?.step ?? null, p.done_step?.step ?? null,
    p.ended_on]), [["5 Left Lane", 125000, 20, null, null, ago(3)], ["1 Late Lane", 125000, 12, "landlord", null, null],
    ["2 Part Paid Row", 100000, 8, "call", null, null]]);
  assert.deepEqual([tab.count, tab.owed], [3, 350000]);
  for (const a of todo.arrears.filter(a => a.days_late >= tab.grace_days)) {
    const p = tab.payments.find(x => x.tenancy_id === a.tenancy_id);
    assert.ok(p, a.address);
    assert.deepEqual([p.rental_id, p.address, p.tenant_name, p.payment_ref, p.balance, p.oldest_unpaid_on, p.days_late, p.next_step],
      [a.rental_id, a.address, a.tenant_name, a.payment_ref, a.balance, a.oldest_unpaid_on, a.days_late, a.next_step]);
  }
  assert.deepEqual(todo.arrears.map(a => a.address), ["1 Late Lane", "2 Part Paid Row", "4 Fresh Street"]);

  ok(await req("PUT", "/admin/missing-payments/grace", { grace_days: 0, expectedRevision: 0 }));
  const all = ok(await req("GET", "/admin/missing-payments"));
  assert.equal(all.payments.filter(p => !p.ended_on).reduce((s, p) => s + p.balance, 0), totals.owed);
  assert.deepEqual(all.payments.map(p => p.address), ["5 Left Lane", "1 Late Lane", "2 Part Paid Row", "4 Fresh Street"]);
  assert.deepEqual(await counts(), before, "the tab and its grace period make no charge, payment, step, notice or event");
});

test("D1: two grace-period saves on the same revision at once: one wins, the other is a 409", async () => {
  const { revision } = ok(await req("GET", "/admin/missing-payments"));
  const both = await Promise.all([5, 9].map(grace_days => req("PUT", "/admin/missing-payments/grace", { grace_days,
    expectedRevision: revision })));
  assert.deepEqual(both.map(r => r.status).sort(), [200, 409], JSON.stringify(both.map(r => r.data)));
  const won = both.find(r => r.status === 200).data;
  const row = await env.DB.prepare(`SELECT json_extract(value, '$.grace_days') AS g, json_type(value, '$.grace_days') AS t,
    json_extract(value, '$.revision') AS r FROM app_settings WHERE key = 'missing_payments'`).first();
  assert.deepEqual([row.g, row.t, row.r], [won.grace_days, "integer", revision + 1]);
  assert.equal(ok(await req("GET", "/admin/missing-payments")).grace_days, won.grace_days);
});
