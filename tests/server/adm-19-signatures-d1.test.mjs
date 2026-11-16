// ADM-19 on local D1 (Miniflare), every migration on a fresh database: the tenancy agreement is signed outside Hampton
// and a person records what they checked there (who signed, by role; the day; where it is recorded, as text), reviewed
// by the session's staff member. Off by default: with ADM19_SIGNATURE_READY unset its routes answer 404. Synthetic
// fixtures only.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { call, adminCookie, SECRET } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { saveSignatures, signatureReady } from "../../server/tenancy-signatures.js";

const TS = "2026-10-07T10:00:00.000Z", T = jerseyToday(), START = plusDays(T, -30);
let mf, env;
const one = sql => env.DB.prepare(sql).first();
const n = async (table, where = "1") => (await one(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)).n;
const req = async (method, path, body, who = "admin@example.test", e = env) => call(e, method, path, { body, cookie: await adminCookie(who) });
const LANDLORD = { party: "landlord", signed_on: plusDays(T, -2), evidence_ref: "Signing service, envelope SYN-0001" };
const TENANT1 = { party: "tenant_1", signed_on: plusDays(T, -1), evidence_ref: "Signing service, envelope SYN-0001" };
const TENANT2 = { party: "tenant_2", signed_on: T, evidence_ref: "Paper copy, office file SYN-17" };
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
    compatibilityDate: "2025-10-01", host: "127.0.0.1", port: 0, d1Databases: { DB: "adm19-signatures-fixture" } }));
  const DB = await mf.getD1Database("DB"), dir = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(dir).filter(f => f.endsWith(".sql")).sort())
    await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), "utf8")).map(sql => DB.prepare(sql)));
  const tenancy = (id, ref) => DB.prepare(`INSERT INTO tenancies (rental_id, payment_ref, tenant_name, kind, regime, start_on, rent, due_day,
    created_at, updated_at) VALUES (?, ?, 'Rae Example', 'periodic', '2025', ?, 1400, 1, ?, ?)`).bind(id, ref, START, TS, TS);
  const rental = address => DB.prepare(`INSERT INTO rentals (landlord_id, address, parish, service, fee_percent, created_at, updated_at)
    VALUES (1, ?, 'St Helier', 'let_only', 10, ?, ?)`).bind(address, TS, TS);
  await DB.batch([
    DB.prepare(`INSERT INTO admins (email, added_by, added_at) VALUES ('admin@example.test', 'setup', ?),
      ('colleague@example.test', 'setup', ?)`).bind(TS, TS),
    DB.prepare("INSERT INTO landlords (name, created_at, updated_at) VALUES ('Synthetic Owner', ?, ?)").bind(TS, TS),
    rental("7 Rue des Exemples"), rental("9 Rue des Exemples"), rental("11 Rue des Exemples"),
    tenancy(1, "HE-T0001"), tenancy(2, "HE-T0002"), tenancy(3, "HE-T0003"),
  ]);
  env = { DB, SESSION_SECRET: SECRET, ADM19_SIGNATURE_READY: "1" };
});
after(async () => { if (mf) await mf.dispose(); });

test("off by default: unset or '0' answers 404 everywhere and writes nothing; wrangler.toml does not switch it on", async () => {
  assert.equal(signatureReady({}), false);
  assert.equal(signatureReady({ ADM19_SIGNATURE_READY: "0" }), false);
  assert.equal(signatureReady({ ADM19_SIGNATURE_READY: "1" }), true);
  assert.doesNotMatch(readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8"), /^ADM19_SIGNATURE_READY = "1"$/m);
  for (const off of [{ DB: env.DB, SESSION_SECRET: SECRET }, { DB: env.DB, SESSION_SECRET: SECRET, ADM19_SIGNATURE_READY: "0" }]) {
    assert.equal((await req("GET", "/admin/tenancy-signatures", undefined, undefined, off)).status, 404);
    assert.equal((await req("GET", "/admin/tenancies/1/signatures", undefined, undefined, off)).status, 404);
    const put = await req("PUT", "/admin/tenancies/1/signatures", { expectedRevision: 0, contract_revision: 0, tenants: 1,
      signatures: [LANDLORD] }, undefined, off);
    assert.equal(put.status, 404);
  }
  assert.equal(await n("tenancy_signature_evidence"), 0);
  assert.equal(await n("rental_events", "type LIKE 'tenancy.signatures%'"), 0);
});

test("staff session only: without one, reading and saving answer 401 and nothing is written", async () => {
  assert.equal((await call(env, "GET", "/admin/tenancies/1/signatures")).status, 401);
  const put = await call(env, "PUT", "/admin/tenancies/1/signatures", { body: { expectedRevision: 0, contract_revision: 0, tenants: 1,
    signatures: [LANDLORD] } });
  assert.equal(put.status, 401);
  assert.equal((await call(env, "PUT", "/admin/tenancies/1/signatures", { body: {}, cookie: await adminCookie("stranger@example.test") })).status, 401);
  assert.equal(await n("tenancy_signature_evidence"), 0);
});

test("nothing recorded: what is missing is said; a body for another tenancy is refused", async () => {
  assert.equal((await req("GET", "/admin/tenancy-signatures")).status, 200);
  const r = await req("GET", "/admin/tenancies/1/signatures");
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.revision, r.data.contract_revision, r.data.tenants, r.data.signatures, r.data.status.state, r.data.status.missing],
    [0, 0, 1, [], "none", ["landlord", "tenant_1"]]);
  assert.equal((await req("GET", "/admin/tenancies/999/signatures")).status, 404);
  const other = await req("PUT", "/admin/tenancies/1/signatures", { tenancy_id: 2, expectedRevision: 0, contract_revision: 0, tenants: 1,
    signatures: [LANDLORD] });
  assert.equal(other.status, 400);
  assert.equal(await n("tenancy_signature_evidence"), 0);
});

test("checks each signature: role within the tenants, a real day up to today, a text reference, each party once", async () => {
  const bad = await req("PUT", "/admin/tenancies/1/signatures", { expectedRevision: 0, contract_revision: 0, tenants: 2, signatures: [
    { party: "guarantor", signed_on: T, evidence_ref: "x" },
    { party: "tenant_3", signed_on: T, evidence_ref: "x" },
    { party: "landlord", signed_on: plusDays(T, 1), evidence_ref: "x" },
    { party: "tenant_1", signed_on: "2026-02-30", evidence_ref: "" },
    { party: "tenant_2", signed_on: T, evidence_ref: "a".repeat(121) },
    { party: "tenant_2", signed_on: T, evidence_ref: "line\nbreak" },
  ] });
  assert.equal(bad.status, 400);
  const f = bad.data.fields;
  for (const k of ["signatures.0.party", "signatures.1.party", "signatures.2.signed_on", "signatures.3.signed_on",
    "signatures.3.evidence_ref", "signatures.4.evidence_ref", "signatures.5.evidence_ref", "signatures.5.party"]) assert.ok(f[k], k);
  const counts = await req("PUT", "/admin/tenancies/1/signatures", { expectedRevision: 0, contract_revision: 0, tenants: 11, signatures: [] });
  assert.equal(counts.status, 400);
  assert.ok(counts.data.fields.tenants && counts.data.fields.signatures);
  const rev = await req("PUT", "/admin/tenancies/1/signatures", { expectedRevision: "x", contract_revision: -1, tenants: 1, signatures: [LANDLORD] });
  assert.ok(rev.data.fields.expectedRevision && rev.data.fields.contract_revision);
  assert.equal(await n("tenancy_signature_evidence"), 0);
});

test("the reviewer and the time are the session's and the server's, never the body's; the history keeps counts only", async () => {
  const r = await req("PUT", "/admin/tenancies/1/signatures", { expectedRevision: 0, contract_revision: 0, tenants: 2,
    reviewed_by: "intruder@example.test", updated_by: "intruder@example.test",
    signatures: [{ ...LANDLORD, reviewed_by: "intruder@example.test", reviewed_at: "2000-01-01T00:00:00.000Z" }, TENANT1] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.revision, 1);
  assert.deepEqual([r.data.status.state, r.data.status.missing], ["incomplete", ["tenant_2"]]);
  for (const s of r.data.signatures) {
    assert.equal(s.reviewed_by, "admin@example.test");
    assert.notEqual(s.reviewed_at, "2000-01-01T00:00:00.000Z");
  }
  const row = await one("SELECT * FROM tenancy_signature_evidence WHERE tenancy_id = 1");
  assert.equal(row.updated_by, "admin@example.test");
  assert.doesNotMatch(row.signatures, /intruder|2000-01-01/);
  const ev = await one("SELECT * FROM rental_events WHERE type = 'tenancy.signatures_reviewed'");
  assert.deepEqual([ev.rental_id, ev.tenancy_id, ev.actor], [1, 1, "admin@example.test"]);
  assert.deepEqual(JSON.parse(ev.data), { revision: 1, contract_revision: 0, tenants: 2, signed: 2, missing: 1 });
  assert.doesNotMatch(ev.data, /SYN|envelope|Rae/);
});

test("complete: every party signed and reviewed; an unchanged signature keeps its review, a changed one is reviewed again", async () => {
  const cur = (await req("GET", "/admin/tenancies/1/signatures")).data;
  const r = await req("PUT", "/admin/tenancies/1/signatures", { tenancy_id: 1, expectedRevision: cur.revision, contract_revision: 0, tenants: 2,
    signatures: [LANDLORD, { ...TENANT1, evidence_ref: "Signing service, envelope SYN-0002" }, TENANT2] }, "colleague@example.test");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const by = Object.fromEntries(r.data.signatures.map(s => [s.party, s]));
  assert.equal(by.landlord.reviewed_by, "admin@example.test", "unchanged: its review stays");
  assert.deepEqual([by.tenant_1.reviewed_by, by.tenant_2.reviewed_by], ["colleague@example.test", "colleague@example.test"]);
  assert.equal(r.data.status.state, "complete");
  assert.deepEqual(r.data.status.missing, []);
  assert.equal(r.data.status.reviewed_by, "colleague@example.test");
  assert.equal(r.data.status.reviewed_at, by.tenant_2.reviewed_at);
  assert.deepEqual(r.data.signatures.map(s => s.party), ["landlord", "tenant_1", "tenant_2"]);
});

test("a stale form is refused (409) and writes nothing; two saves at once, one wins", async () => {
  const before = await one("SELECT revision, signatures FROM tenancy_signature_evidence WHERE tenancy_id = 1");
  const stale = await req("PUT", "/admin/tenancies/1/signatures", { expectedRevision: 1, contract_revision: 0, tenants: 1, signatures: [LANDLORD] });
  assert.equal(stale.status, 409);
  assert.deepEqual(await one("SELECT revision, signatures FROM tenancy_signature_evidence WHERE tenancy_id = 1"), before);
  const body = { expectedRevision: 0, contract_revision: 0, tenants: 1, signatures: [LANDLORD] };
  const both = await Promise.all([req("PUT", "/admin/tenancies/2/signatures", body), req("PUT", "/admin/tenancies/2/signatures", body)]);
  assert.deepEqual(both.map(r => r.status).sort(), [200, 409], JSON.stringify(both.map(r => r.data)));
  assert.equal(await n("rental_events", "type = 'tenancy.signatures_reviewed' AND tenancy_id = 2"), 1);
});

test("the signed contract's reference (ADM-06) moving on: a form that read the old one is refused, even mid-write; the review shows out of date", async () => {
  const ts = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO tenancy_signed_contracts (tenancy_id, evidence_ref, reviewed_at, reviewed_by, revision)
    VALUES (3, 'Office file SYN-3', ?, 'admin@example.test', 1)`).bind(ts).run();
  const read = (await req("GET", "/admin/tenancies/3/signatures")).data;
  assert.equal(read.contract_revision, 1);
  const old = await req("PUT", "/admin/tenancies/3/signatures", { expectedRevision: 0, contract_revision: 0, tenants: 1, signatures: [LANDLORD] });
  assert.equal(old.status, 409);
  // The contract reference changes between this save's reads and its write: the batch re-reads it and records nothing.
  const moved = racing(() => env.DB.prepare(`UPDATE tenancy_signed_contracts SET evidence_ref = 'Office file SYN-3b', revision = 2
    WHERE tenancy_id = 3`).run());
  await assert.rejects(saveSignatures({ DB: moved }, { tenancy_id: 3, expectedRevision: 0, contract_revision: 1, tenants: 1,
    signatures: [LANDLORD, TENANT1] }, "admin@example.test"), e => e.status === 409);
  assert.equal(await n("tenancy_signature_evidence", "tenancy_id = 3"), 0);
  const ok = await req("PUT", "/admin/tenancies/3/signatures", { expectedRevision: 0, contract_revision: 2, tenants: 1, signatures: [LANDLORD, TENANT1] });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.status.state, "complete");
  await env.DB.prepare("UPDATE tenancy_signed_contracts SET evidence_ref = 'Office file SYN-3c', revision = 3 WHERE tenancy_id = 3").run();
  const after = (await req("GET", "/admin/tenancies/3/signatures")).data;
  assert.deepEqual([after.status.state, after.status.reviewed_contract_revision, after.contract_revision], ["out_of_date", 2, 3]);
  // Saving again against the current reference reviews every signature again.
  const again = await req("PUT", "/admin/tenancies/3/signatures", { expectedRevision: 1, contract_revision: 3, tenants: 1,
    signatures: [LANDLORD, TENANT1] }, "colleague@example.test");
  assert.equal(again.status, 200);
  assert.deepEqual(again.data.signatures.map(s => s.reviewed_by), ["colleague@example.test", "colleague@example.test"]);
  assert.equal(again.data.status.state, "complete");
});
