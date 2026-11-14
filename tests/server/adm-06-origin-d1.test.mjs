// ADM-06 on local D1 (Miniflare): the commit is one batch, all or nothing, and a repeated confirmation is one tenancy.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { call, adminCookie, SECRET } from "./helpers.mjs";
import { jerseyToday } from "../../server/viewings.js";

const TS = "2026-10-07T10:00:00.000Z", M0 = `${jerseyToday().slice(0, 7)}-01`;
let mf, env;
const one = sql => env.DB.prepare(sql).first();
const n = async table => (await one(`SELECT COUNT(*) AS n FROM ${table}`)).n;
const req = async (method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
before(async () => {
  const require = createRequire(import.meta.url), { Miniflare, convertV4MiniflareOptions } = require("miniflare"),
    { unstable_splitSqlQuery } = require("wrangler");
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('fixture')}}",
    compatibilityDate: "2025-10-01", host: "127.0.0.1", port: 0, d1Databases: { DB: "adm06-origin-fixture" } }));
  const DB = await mf.getD1Database("DB"), dir = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(dir).filter(f => f.endsWith(".sql")).sort())
    await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), "utf8")).map(sql => DB.prepare(sql)));
  await DB.batch([
    DB.prepare("INSERT INTO admins (email, added_by, added_at) VALUES ('admin@example.test', 'setup', ?)").bind(TS),
    DB.prepare("INSERT INTO landlords (name, created_at, updated_at) VALUES ('Synthetic Owner', ?, ?)").bind(TS, TS),
    DB.prepare(`INSERT INTO rentals (landlord_id, address, parish, service, fee_percent, created_at, updated_at)
      VALUES (1, '4 Rue des Exemples', 'St Helier', 'full', 10, ?, ?)`).bind(TS, TS),
    DB.prepare(`INSERT INTO listings (id, use, title, operation, availability, rent, rent_period, specs, created_at, updated_at)
      VALUES ('HE-L004', 'residential', 'Flat', 'rent', 'let_agreed', 1400, 'month', '[]', ?, ?)`).bind(TS, TS),
    DB.prepare(`INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at)
      VALUES ('Rae Example', 'rae@example.test', ?, ?, ?)`).bind(TS, TS, TS),
    DB.prepare("INSERT INTO applicants (contact_id, operation, source, created_at, updated_at) VALUES (1, 'rent', 'web', ?, ?)").bind(TS, TS),
  ]);
  env = { DB, SESSION_SECRET: SECRET, ADM06_TENANCY_ORIGIN_READY: "1" };
});
after(async () => { if (mf) await mf.dispose(); });

test("D1: a stale source rolls the whole batch back; the same confirmation twice is one tenancy and one reference", async () => {
  const pick = { rental_id: 1, listing_id: "HE-L004", applicant_id: 1 };
  const p = await req("POST", "/admin/tenancy-origins/preview", pick);
  assert.equal(p.status, 200, JSON.stringify(p.data));
  const body = { rental_id: 1, tenancy_draft: { tenant_name: "Rae Example", kind: "periodic", regime: "2025", rent: 1400, start_on: M0 },
    signed_contract_ref: "Signed lease, folder L-0004" };
  const stale = await req("POST", "/admin/tenancy-origins/commit", { ...body, operation_id: "op-d1-stale",
    source_versions: { ...p.data.source_versions, applicant_updated_at: "2026-10-01T00:00:00.000Z" } });
  assert.equal(stale.status, 409);
  for (const t of ["tenancies", "charges", "rent_changes", "tenancy_origins", "tenancy_signed_contracts"]) assert.equal(await n(t), 0, t);
  assert.equal((await one("SELECT updated_at FROM rentals WHERE id = 1")).updated_at, TS, "the property's lock did not move");
  const send = () => req("POST", "/admin/tenancy-origins/commit", { ...body, operation_id: "op-d1-once", source_versions: p.data.source_versions });
  const [a, b] = await Promise.all([send(), send()]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201], JSON.stringify([a.data, b.data]));
  assert.equal(a.data.tenancy.id, b.data.tenancy.id);
  assert.equal(await n("tenancies"), 1); assert.equal(await n("tenancy_origins"), 1); assert.equal(await n("tenancy_signed_contracts"), 1);
  assert.match((await one("SELECT payment_ref FROM tenancies")).payment_ref, /^HE-T\d{4}$/);
  assert.ok(await n("charges") >= 1, "charges are made as for New tenancy");
  const inv = await req("PUT", `/admin/tenancies/${a.data.tenancy.id}/entry-inventory`, { expectedRevision: 0,
    rooms: [{ name: "Kitchen", observations: "" }], meter_readings: [{ meter: "gas", reading: "10.5", unit: "m3" }] });
  assert.equal(inv.status, 200, JSON.stringify(inv.data));
  const again = await req("PUT", `/admin/tenancies/${a.data.tenancy.id}/entry-inventory`, { expectedRevision: 0,
    rooms: [{ name: "Hall", observations: "" }] });
  assert.equal(again.status, 409);
  assert.equal(JSON.parse((await one("SELECT rooms FROM tenancy_entry_inventories")).rooms)[0].name, "Kitchen");
});
