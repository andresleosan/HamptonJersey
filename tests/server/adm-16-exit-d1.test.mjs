// ADM-16 on local D1 (Miniflare), every migration on a fresh database: the exit inventory and the deposit's record are
// compare-and-set (two saves at once, one wins), the deposit limit and the kept outcomes hold in D1 itself.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { call, adminCookie, SECRET } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { recordDepositOutcome } from "../../server/tenancy-exits.js";

const TS = "2026-10-07T10:00:00.000Z", T = jerseyToday(), START = plusDays(T, -90), END = plusDays(T, 10);
let mf, env;
const one = sql => env.DB.prepare(sql).first();
const n = async table => (await one(`SELECT COUNT(*) AS n FROM ${table}`)).n;
const req = async (method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
before(async () => {
  const require = createRequire(import.meta.url), { Miniflare, convertV4MiniflareOptions } = require("miniflare"),
    { unstable_splitSqlQuery } = require("wrangler");
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('fixture')}}",
    compatibilityDate: "2025-10-01", host: "127.0.0.1", port: 0, d1Databases: { DB: "adm16-exit-fixture" } }));
  const DB = await mf.getD1Database("DB"), dir = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(dir).filter(f => f.endsWith(".sql")).sort())
    await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), "utf8")).map(sql => DB.prepare(sql)));
  await DB.batch([
    DB.prepare("INSERT INTO admins (email, added_by, added_at) VALUES ('admin@example.test', 'setup', ?)").bind(TS),
    DB.prepare("INSERT INTO landlords (name, created_at, updated_at) VALUES ('Synthetic Owner', ?, ?)").bind(TS, TS),
    DB.prepare(`INSERT INTO rentals (landlord_id, address, parish, service, fee_percent, created_at, updated_at)
      VALUES (1, '7 Rue des Exemples', 'St Helier', 'let_only', 10, ?, ?)`).bind(TS, TS),
    DB.prepare(`INSERT INTO tenancies (rental_id, payment_ref, tenant_name, kind, regime, start_on, rent, due_day, deposit, ended_on,
      created_at, updated_at) VALUES (1, 'HE-T0001', 'Rae Example', 'periodic', '2025', ?, 1400, 1, 1400, ?, ?, ?)`).bind(START, END, TS, TS),
    DB.prepare(`INSERT INTO tenancy_entry_inventories (tenancy_id, revision, rooms, meter_readings, evidence_refs, updated_at, updated_by)
      VALUES (1, 1, '[{"name":"Kitchen","observations":""}]', '[]', '[]', ?, 'admin@example.test')`).bind(TS),
  ]);
  env = { DB, SESSION_SECRET: SECRET, ADM16_TENANCY_EXIT_READY: "1" };
});
after(async () => { if (mf) await mf.dispose(); });

test("D1: one exit save and one outcome win at once; the deposit limit and the kept outcomes hold in the database", async () => {
  const body = rooms => ({ expectedRevision: 0, entry_inventory_revision: 1, moved_out_on: T, evidence_refs: ["Check-out photos, folder P-0300"],
    rooms: [{ name: "Kitchen", condition: rooms, observations: rooms === "changed" ? "Oven not cleaned." : "" }] });
  const both = await Promise.all([req("PUT", "/admin/tenancies/1/exit-inventory", body("as_entry")),
    req("PUT", "/admin/tenancies/1/exit-inventory", body("changed"))]);
  assert.deepEqual(both.map(r => r.status).sort(), [200, 409], JSON.stringify(both.map(r => r.data)));
  assert.equal(await n("tenancy_exit_inventories"), 1);
  assert.equal((await one("SELECT revision FROM tenancy_entry_inventories")).revision, 1, "the entry inventory is untouched");
  const over = await req("PUT", "/admin/tenancies/1/deposit-proposal", { expectedRevision: 0, lines: [{ reason: "Clean", amount_pence: 140001 }] });
  assert.equal(over.status, 400);
  const p = await req("PUT", "/admin/tenancies/1/deposit-proposal", { expectedRevision: 0,
    lines: [{ reason: "Oven clean", amount_pence: 12050, evidence_ref: "Check-out photos, folder P-0300" }] });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  await assert.rejects(env.DB.prepare("UPDATE tenancy_deposit_proposals SET total_pence = 140001").run());
  const step = { expectedRevision: 1, status: "requested", evidence_ref: "Repayment request, mydeposits R-3", occurred_on: T };
  const twice = await Promise.all([req("POST", "/admin/tenancies/1/deposit-outcomes", step), req("POST", "/admin/tenancies/1/deposit-outcomes", step)]);
  assert.deepEqual(twice.map(r => r.status).sort(), [200, 409]);
  assert.equal(await n("tenancy_deposit_outcomes"), 1);
  await assert.rejects(env.DB.prepare("DELETE FROM tenancy_deposit_outcomes").run(), /kept as recorded/);
  await assert.rejects(env.DB.prepare("UPDATE tenancy_deposit_outcomes SET status = 'returned'").run(), /kept as recorded/);
  assert.equal(await n("payments"), 0);
  const r = await req("GET", "/admin/tenancies/1/exit");
  assert.deepEqual([r.data.status, r.data.tenancy.planned_move_out, r.data.exit.moved_out_on], ["requested", END, T]);
});

// Review fixes: the keys date and the deposit are re-read inside the write; a move-out with the keys back cannot be cancelled.
test("D1: a step cannot slip past a concurrent keys-back edit, a changed deposit, or a cancelled move-out", async () => {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO rentals (landlord_id, address, parish, service, fee_percent, created_at, updated_at)
      VALUES (1, '9 Rue des Exemples', 'St Helier', 'let_only', 10, ?, ?)`).bind(TS, TS),
    env.DB.prepare(`INSERT INTO tenancies (rental_id, payment_ref, tenant_name, kind, regime, start_on, rent, due_day, deposit, ended_on,
      created_at, updated_at) VALUES (2, 'HE-T0002', 'Sam Example', 'periodic', '2025', ?, 1200, 1, 1200, ?, ?, ?)`).bind(START, END, TS, TS),
  ]);
  const exit = (rev, moved) => ({ expectedRevision: rev, entry_inventory_revision: null, moved_out_on: moved, evidence_refs: [],
    rooms: [{ name: "Kitchen", condition: "not_checked", observations: "" }], meter_readings: [] });
  assert.equal((await req("PUT", "/admin/tenancies/2/exit-inventory", exit(0, T))).status, 200);
  assert.equal((await req("PUT", "/admin/tenancies/2/deposit-proposal", { expectedRevision: 0, lines: [] })).status, 200);
  let once = true;
  const racing = { prepare: (...a) => env.DB.prepare(...a), batch: async stmts => {
    if (once) { once = false; assert.equal((await req("PUT", "/admin/tenancies/2/exit-inventory", exit(1, null))).status, 200); }
    return env.DB.batch(stmts);
  } };
  await assert.rejects(recordDepositOutcome({ DB: racing }, { tenancy_id: 2, expectedRevision: 1, status: "requested",
    evidence_ref: "mydeposits R-9", occurred_on: T }, "admin@example.test"), e => e.status === 409);
  assert.equal((await one("SELECT COUNT(*) AS n FROM tenancy_deposit_outcomes WHERE tenancy_id = 2")).n, 0);

  await env.DB.prepare("UPDATE tenancies SET deposit = 1300 WHERE id = 1").run();
  const moved = await req("POST", "/admin/tenancies/1/deposit-outcomes", { expectedRevision: 2, status: "agreed", evidence_ref: "R-4", occurred_on: T });
  assert.equal(moved.status, 409, JSON.stringify(moved.data));
  await env.DB.prepare("UPDATE tenancies SET deposit = 1400 WHERE id = 1").run();

  const cancel = await req("DELETE", "/admin/tenancies/1/end");
  assert.equal(cancel.status, 409, JSON.stringify(cancel.data));
  assert.equal((await one("SELECT ended_on FROM tenancies WHERE id = 1")).ended_on, END);
});
