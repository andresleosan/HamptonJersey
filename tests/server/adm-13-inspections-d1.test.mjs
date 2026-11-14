// ADM-13 on local D1 (Miniflare), every migration on a fresh database: two inspections recorded at once (one wins), a
// repeat answers the same one, and the tenancy and the inspection are re-read inside the write, so a concurrent move-out
// or decision cannot slip past them. Synthetic fixtures only.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { call, adminCookie, SECRET } from "./helpers.mjs";
import { addMonths } from "../../server/rentals.js";
import { jerseyToday } from "../../server/viewings.js";
import { decideRepair, recordInspection } from "../../server/rental-inspections.js";

const TS = "2026-10-07T10:00:00.000Z", T = jerseyToday(), START = addMonths(T, -7);
let mf, env;
const one = sql => env.DB.prepare(sql).first();
const n = async (table, where = "1") => (await one(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)).n;
const req = async (method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const ROOMS = [{ name: "Kitchen", condition: "attention", observations: "Tap dripping.", repair_needed: true },
  { name: "Hall", condition: "ok", observations: "" }];
const body = (operation_id, expectedRevision = 0) => ({ expectedRevision, operation_id, inspected_on: T, rooms: ROOMS,
  evidence_refs: [`Inspection photos, folder D-${operation_id}`] });
// A D1 whose next batch first lets `meanwhile` run, as another request landing between the reads and the write.
const racing = meanwhile => {
  let once = true;
  return { prepare: (...a) => env.DB.prepare(...a), batch: async stmts => {
    if (once) { once = false; await meanwhile(); }
    return env.DB.batch(stmts);
  } };
};

before(async () => {
  const require = createRequire(import.meta.url), { Miniflare, convertV4MiniflareOptions } = require("miniflare"),
    { unstable_splitSqlQuery } = require("wrangler");
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('fixture')}}",
    compatibilityDate: "2025-10-01", host: "127.0.0.1", port: 0, d1Databases: { DB: "adm13-inspections-fixture" } }));
  const DB = await mf.getD1Database("DB"), dir = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(dir).filter(f => f.endsWith(".sql")).sort())
    await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), "utf8")).map(sql => DB.prepare(sql)));
  const tenancy = (id, ref) => DB.prepare(`INSERT INTO tenancies (rental_id, payment_ref, tenant_name, kind, regime, start_on, rent, due_day,
    created_at, updated_at) VALUES (?, ?, 'Rae Example', 'periodic', '2025', ?, 1400, 1, ?, ?)`).bind(id, ref, START, TS, TS);
  const rental = address => DB.prepare(`INSERT INTO rentals (landlord_id, address, parish, service, fee_percent, created_at, updated_at)
    VALUES (1, ?, 'St Helier', 'let_only', 10, ?, ?)`).bind(address, TS, TS);
  await DB.batch([
    DB.prepare("INSERT INTO admins (email, added_by, added_at) VALUES ('admin@example.test', 'setup', ?)").bind(TS),
    DB.prepare("INSERT INTO landlords (name, created_at, updated_at) VALUES ('Synthetic Owner', ?, ?)").bind(TS, TS),
    rental("7 Rue des Exemples"), rental("9 Rue des Exemples"), tenancy(1, "HE-T0001"), tenancy(2, "HE-T0002"),
  ]);
  env = { DB, SESSION_SECRET: SECRET, ADM13_INSPECTIONS_READY: "1" };
});
after(async () => { if (mf) await mf.dispose(); });

test("D1: two inspections at once, one wins; the same form twice records one; the kept record holds in D1", async () => {
  const both = await Promise.all([req("POST", "/admin/tenancies/1/inspections", body("d1-first-0001")),
    req("POST", "/admin/tenancies/1/inspections", body("d1-second-0002"))]);
  assert.deepEqual(both.map(r => r.status).sort(), [201, 409], JSON.stringify(both.map(r => r.data)));
  assert.equal(await n("rental_inspections"), 1);
  const twice = await Promise.all([req("POST", "/admin/tenancies/1/inspections", body("d1-same-0003", 1)),
    req("POST", "/admin/tenancies/1/inspections", body("d1-same-0003", 1))]);
  assert.deepEqual(twice.map(r => r.status).sort(), [200, 201], JSON.stringify(twice.map(r => r.data)));
  assert.equal(twice[0].data.inspection.id, twice[1].data.inspection.id);
  assert.equal(await n("rental_inspections"), 2);
  assert.equal(await n("rental_events", "type = 'inspection.recorded'"), 2);
  await assert.rejects(env.DB.prepare("DELETE FROM rental_inspections").run(), /kept as recorded/);
  await assert.rejects(env.DB.prepare("UPDATE rental_inspections SET inspected_on = '2020-01-01'").run(), /kept as recorded/);
  await assert.rejects(env.DB.prepare(`INSERT INTO rental_inspections (tenancy_id, seq, operation_id, revision, inspected_on, rooms,
    evidence_refs, recorded_at, recorded_by, updated_at, updated_by) VALUES (1, 1, 'd1-dup-seq-0004', 1, ?, '[{}]', '[]', ?, 'x', ?, 'x')`)
    .bind(T, TS, TS).run(), /UNIQUE/);
  const r = await req("GET", "/admin/tenancies/1/inspections");
  assert.deepEqual([r.data.revision, r.data.next.due_on, r.data.next.status], [2, addMonths(T, 6), "ok"]);
});

test("D1: a move-out landing during the write stops the inspection; a decision landing first stops the repair", async () => {
  // The tenancy ends between the reads and the write: the batch re-reads it and records nothing.
  const ended = racing(() => env.DB.prepare("UPDATE tenancies SET ended_on = ? WHERE id = 2").bind(T).run());
  await assert.rejects(recordInspection({ DB: ended }, { tenancy_id: 2, ...body("d1-race-0005") }, "admin@example.test"),
    e => e.status === 409 && /has ended/.test(e.message));
  assert.equal(await n("rental_inspections", "tenancy_id = 2"), 0);
  await env.DB.prepare("UPDATE tenancies SET ended_on = NULL WHERE id = 2").run();

  // Another person sets the repair aside first: no repair is created, and the decision stays theirs.
  const x = (await req("POST", "/admin/tenancies/2/inspections", body("d1-race-0006"))).data.inspection;
  const aside = racing(async () => assert.equal((await req("POST", `/admin/tenancies/2/inspections/${x.id}/repairs`,
    { room: 0, expectedRevision: 1, decision: "not_needed" })).status, 201));
  await assert.rejects(decideRepair({ DB: aside }, { tenancy_id: 2, inspection_id: x.id, room: 0, expectedRevision: 1, decision: "repair",
    urgency: "urgent" }, "admin@example.test"), e => e.status === 409);
  assert.equal(await n("repairs"), 0);
  assert.equal((await one(`SELECT json_extract(rooms, '$[0].repair.status') AS s FROM rental_inspections WHERE id = ${x.id}`)).s, "not_needed");

  // The property is archived meanwhile: no repair either.
  const y = (await req("POST", "/admin/tenancies/1/inspections", body("d1-race-0007", 2))).data.inspection;
  const archived = racing(() => env.DB.prepare("UPDATE rentals SET archived_at = ? WHERE id = 1").bind(TS).run());
  await assert.rejects(decideRepair({ DB: archived }, { tenancy_id: 1, inspection_id: y.id, room: 0, expectedRevision: 1, decision: "repair",
    urgency: "routine" }, "admin@example.test"), e => e.status === 409 && /archived/.test(e.message));
  assert.equal(await n("repairs"), 0);
  await env.DB.prepare("UPDATE rentals SET archived_at = NULL WHERE id = 1").run();

  // Two people create the same repair at once: one repair.
  const same = { room: 0, expectedRevision: 1, decision: "repair", urgency: "routine" };
  const pair = await Promise.all([req("POST", `/admin/tenancies/1/inspections/${y.id}/repairs`, same),
    req("POST", `/admin/tenancies/1/inspections/${y.id}/repairs`, same)]);
  assert.ok(pair.every(r => [200, 201, 409].includes(r.status)) && pair.some(r => r.status === 201), JSON.stringify(pair.map(r => r.data)));
  assert.equal(await n("repairs"), 1);
  assert.equal(await n("repairs", "tenancy_id = 1 AND status = 'reported'"), 1);
});
