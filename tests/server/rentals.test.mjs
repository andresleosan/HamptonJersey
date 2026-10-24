import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";

const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args);
const events = (env, type) => rows(env, "SELECT rental_id, tenancy_id, actor, data FROM rental_events WHERE type = ? ORDER BY id", type)
  .map(e => ({ ...e, data: JSON.parse(e.data) }));
const kinds = (env, id) => rows(env, "SELECT kind FROM compliance_items WHERE rental_id = ? ORDER BY kind", id).map(r => r.kind);
const today = () => jerseyToday();

async function landlord(env, over = {}) {
  const r = await req(env, "POST", "/admin/landlords", { name: "Anne Owner", email: "anne@example.je", ...over });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.landlord.id;
}
async function rental(env, over = {}) {
  const landlord_id = over.landlord_id ?? await landlord(env);
  const r = await req(env, "POST", "/admin/rentals", { landlord_id, address: "1 Rue des Pres", parish: "St Helier",
    service: "let_only", ...over });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.rental.id;
}
const tenancy = (env, rental_id, over = {}) => run(env, `INSERT INTO tenancies (rental_id, tenant_name, kind, regime, start_on,
  rent, due_day, ended_on, created_at, updated_at) VALUES (?, 'Tom Tenant', 'periodic', '2011', ?, 1500, 1, ?, ?, ?)`,
rental_id, over.start_on ?? "2023-05-01", over.ended_on ?? null, "2023-05-01T00:00:00Z", "2023-05-01T00:00:00Z").lastInsertRowid;
const putRental = (env, id, body) => req(env, "PUT", `/admin/rentals/${id}`,
  { updated_at: row(env, "SELECT updated_at FROM rentals WHERE id = ?", id).updated_at, ...body });

test("rental: creating one adds its compliance rows; no gas row when has_gas is 0", async () => {
  const env = makeEnv();
  const owner = await landlord(env);
  assert.deepEqual(events(env, "landlord.created").map(e => e.data.landlord_id), [owner]);
  const withGas = await rental(env, { landlord_id: owner, has_gas: true });
  const unsure = await rental(env, { landlord_id: owner });
  const noGas = await rental(env, { landlord_id: owner, has_gas: false });
  assert.deepEqual(kinds(env, withGas), ["alarms", "eicr", "gas", "licence"]);
  assert.deepEqual(kinds(env, unsure), ["alarms", "eicr", "gas", "licence"], "has_gas NULL counts as yes");
  assert.deepEqual(kinds(env, noGas), ["alarms", "eicr", "licence"]);
  assert.deepEqual(events(env, "rental.created").map(e => e.rental_id), [withGas, unsure, noGas]);

  const got = await req(env, "GET", `/admin/rentals/${noGas}`);
  assert.equal(got.status, 200);
  assert.equal(got.data.rental.landlord_name, "Anne Owner");
  assert.deepEqual(got.data.compliance.map(c => [c.kind, c.status]), [["licence", "missing"], ["eicr", "missing"],
    ["alarms", "missing"]]);

  assert.equal((await putRental(env, noGas, { has_gas: true })).status, 200);
  assert.deepEqual(kinds(env, noGas), ["alarms", "eicr", "gas", "licence"], "switching gas on adds its row");
  assert.equal((await req(env, "GET", "/admin/rentals/999")).status, 404);
  const bad = await req(env, "POST", "/admin/rentals", { landlord_id: 999, address: "x", parish: "Nowhere", service: "full" });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.fields.parish && bad.data.fields.fee_percent);
  assert.equal((await req(env, "POST", "/admin/rentals", { landlord_id: 999, address: "x", parish: "St Helier",
    service: "let_only" })).data.fields.landlord_id, "Choose a landlord");
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM rentals").n, 3);
});

test("rental: a stale updated_at is 409 and nothing changes", async () => {
  const env = makeEnv();
  const id = await rental(env);
  assert.equal((await req(env, "PUT", `/admin/rentals/${id}`, { address: "2 Rue" })).status, 400, "updated_at is required");
  const stale = await req(env, "PUT", `/admin/rentals/${id}`, { updated_at: "2000-01-01T00:00:00.000Z", address: "2 Rue" });
  assert.equal(stale.status, 409);
  assert.equal(row(env, "SELECT address FROM rentals WHERE id = ?", id).address, "1 Rue des Pres");
  assert.deepEqual(events(env, "rental.updated"), []);

  // The merged row is checked: full service needs the fee, sent or stored.
  const noFee = await putRental(env, id, { service: "full" });
  assert.equal(noFee.status, 400);
  assert.ok(noFee.data.fields.fee_percent);
  const ok = await putRental(env, id, { address: "2 Rue", notes: "Keys at the office" });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.rental.address, "2 Rue");
  assert.deepEqual(events(env, "rental.updated").map(e => e.data), [{ before: { address: "1 Rue des Pres", notes: null },
    after: { address: "2 Rue", notes: "Keys at the office" } }]);

  const owner = row(env, "SELECT landlord_id FROM rentals WHERE id = ?", id).landlord_id;
  const lStale = await req(env, "PUT", `/admin/landlords/${owner}`, { updated_at: "2000-01-01T00:00:00.000Z", name: "Bob" });
  assert.equal(lStale.status, 409);
  const lOk = await req(env, "PUT", `/admin/landlords/${owner}`, {
    updated_at: row(env, "SELECT updated_at FROM landlords WHERE id = ?", owner).updated_at, name: "Bob", approval_limit: 500 });
  assert.equal(lOk.status, 200, JSON.stringify(lOk.data));
  assert.deepEqual(events(env, "landlord.updated").map(e => e.data), [{ landlord_id: owner,
    before: { name: "Anne Owner", approval_limit: null }, after: { name: "Bob", approval_limit: 500 } }]);
  const got = await req(env, "GET", `/admin/landlords/${owner}`);
  assert.equal(got.data.landlord.name, "Bob");
  assert.deepEqual(got.data.rentals.map(r => r.id), [id]);
  assert.deepEqual((await req(env, "GET", "/admin/landlords")).data.landlords.map(l => [l.name, l.active_rentals]), [["Bob", 1]]);
});

test("rental: switching to full with an active tenancy needs collect_from", async () => {
  const env = makeEnv();
  const id = await rental(env);
  const t = tenancy(env, id, { ended_on: plusDays(today(), 20) }); // a planned move-out is still active
  const missing = await putRental(env, id, { service: "full", fee_percent: 10 });
  assert.equal(missing.status, 400);
  assert.ok(missing.data.fields.collect_from);
  const early = await putRental(env, id, { service: "full", fee_percent: 10, collect_from: "2023-04-30" });
  assert.equal(early.status, 400, "not before the tenancy starts");
  assert.equal(row(env, "SELECT service FROM rentals WHERE id = ?", id).service, "let_only");
  const from = `${today().slice(0, 7)}-01`;
  const ok = await putRental(env, id, { service: "full", fee_percent: 10, collect_from: from });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(row(env, "SELECT collect_from FROM tenancies WHERE id = ?", t).collect_from, from);
  assert.deepEqual(events(env, "rental.updated").map(e => [e.data.collect_from, e.data.tenancy_ids]), [[from, [Number(t)]]]);

  // A tenancy that has ended asks for nothing.
  const other = await rental(env);
  tenancy(env, other, { ended_on: "2024-01-31" });
  assert.equal((await putRental(env, other, { service: "full", fee_percent: 12.5 })).status, 200);
});

test("rental: archive refused with an active tenancy or open repairs; landlord archive refused with active properties", async () => {
  const env = makeEnv();
  const owner = await landlord(env);
  const id = await rental(env, { landlord_id: owner });
  const t = tenancy(env, id, { ended_on: plusDays(today(), 5) });
  assert.equal((await req(env, "POST", `/admin/landlords/${owner}/archive`)).status, 409);
  assert.equal((await req(env, "POST", `/admin/rentals/${id}/archive`)).status, 409, "active tenancy");
  run(env, "UPDATE tenancies SET ended_on = ? WHERE id = ?", plusDays(today(), -1), t);
  run(env, `INSERT INTO repairs (rental_id, title, urgency, status, created_at, updated_at)
    VALUES (?, 'Leak', 'urgent', 'in_progress', ?, ?)`, id, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
  assert.equal((await req(env, "POST", `/admin/rentals/${id}/archive`)).status, 409, "open repair");
  run(env, "UPDATE repairs SET status = 'cancelled'");
  const archived = await req(env, "POST", `/admin/rentals/${id}/archive`);
  assert.equal(archived.status, 200, JSON.stringify(archived.data));
  assert.ok(archived.data.rental.archived_at);
  assert.equal((await req(env, "POST", `/admin/rentals/${id}/archive`)).status, 409, "already archived");
  assert.deepEqual(events(env, "rental.archived").map(e => e.rental_id), [id]);

  assert.equal((await req(env, "POST", `/admin/landlords/${owner}/archive`)).status, 200);
  assert.deepEqual(events(env, "landlord.archived").map(e => e.data.landlord_id), [owner]);
  assert.equal((await req(env, "POST", `/admin/rentals/${id}/restore`)).status, 409, "the landlord is archived");
  const noNew = await req(env, "POST", "/admin/rentals", { landlord_id: owner, address: "x", parish: "St Helier", service: "let_only" });
  assert.equal(noNew.status, 400);
  assert.equal((await req(env, "POST", `/admin/landlords/${owner}/restore`)).status, 200);
  const restored = await req(env, "POST", `/admin/rentals/${id}/restore`);
  assert.equal(restored.status, 200);
  assert.equal(restored.data.rental.archived_at, null);
  assert.deepEqual(events(env, "rental.restored").map(e => e.rental_id), [id]);
});

test("compliance: done_on sets expires_on from the period; an explicit expires_on wins", async () => {
  const env = makeEnv();
  const id = await rental(env, { has_gas: false });
  const eicr = await req(env, "PUT", `/admin/rentals/${id}/compliance/eicr`, { done_on: "2025-03-10" });
  assert.equal(eicr.status, 200, JSON.stringify(eicr.data));
  assert.equal(eicr.data.item.expires_on, "2030-03-10");
  assert.equal(eicr.data.item.label, "Electrical safety (EICR)");
  const lic = await req(env, "PUT", `/admin/rentals/${id}/compliance/licence`, { done_on: "2025-03-10",
    expires_on: "2026-12-31", note: "Certificate 42" });
  assert.equal(lic.data.item.expires_on, "2026-12-31");
  assert.equal(row(env, "SELECT note FROM compliance_items WHERE rental_id = ? AND kind = 'licence'", id).note, "Certificate 42");
  assert.deepEqual(events(env, "compliance.updated").map(e => [e.rental_id, e.data.kind, e.data.after.expires_on]),
    [[id, "eicr", "2030-03-10"], [id, "licence", "2026-12-31"]]);

  assert.equal((await req(env, "PUT", `/admin/rentals/${id}/compliance/radon`, { done_on: "2025-03-10" })).status, 404);
  assert.equal((await req(env, "PUT", `/admin/rentals/${id}/compliance/gas`, { done_on: "2025-03-10" })).status, 400,
    "no gas here");
  assert.equal((await req(env, "PUT", "/admin/rentals/999/compliance/eicr", { done_on: "2025-03-10" })).status, 404);
  const bad = await req(env, "PUT", `/admin/rentals/${id}/compliance/alarms`, { done_on: plusDays(today(), 1),
    expires_on: "nope" });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.fields.done_on && bad.data.fields.expires_on);
  assert.equal((await req(env, "PUT", `/admin/rentals/${id}/compliance/alarms`, { done_on: "2025-03-10",
    expires_on: "2025-03-01" })).status, 400, "expires before it was done");
  assert.equal((await req(env, "PUT", `/admin/rentals/${id}/compliance/alarms`, {})).status, 400);
  assert.deepEqual(kinds(env, id), ["alarms", "eicr", "licence"], "no orphan rows");
});

test("settings: RPI and GST out of range are 400; csv-map round-trips by header", async () => {
  const env = makeEnv();
  assert.deepEqual((await req(env, "GET", "/admin/settings/rpi")).data, { rpi: null });
  for (const percent of [-1, 30.01, 3.125, "abc", null])
    assert.equal((await req(env, "PUT", "/admin/settings/rpi", { percent, as_of: "2026-09-30" })).status, 400, String(percent));
  assert.equal((await req(env, "PUT", "/admin/settings/rpi", { percent: 4, as_of: "2026-02-30" })).status, 400);
  const rpi = await req(env, "PUT", "/admin/settings/rpi", { percent: 4.25, as_of: "2026-09-30" });
  assert.equal(rpi.status, 200, JSON.stringify(rpi.data));
  assert.deepEqual((await req(env, "GET", "/admin/settings/rpi")).data, { rpi: { percent: 4.25, as_of: "2026-09-30" } });

  assert.deepEqual((await req(env, "GET", "/admin/settings/gst")).data, { percent: 0 });
  assert.equal((await req(env, "PUT", "/admin/settings/gst", { percent: 31 })).status, 400);
  assert.equal((await req(env, "PUT", "/admin/settings/gst", { percent: 5 })).status, 200);
  assert.deepEqual((await req(env, "GET", "/admin/settings/gst")).data, { percent: 5 });
  assert.deepEqual(events(env, "settings.updated").map(e => e.data.key), ["rpi", "gst_percent"]);

  const a = "a".repeat(64), b = "b".repeat(64), map = { date: 0, amount: 3, description: 1, date_format: "DMY" };
  assert.deepEqual((await req(env, "GET", `/admin/settings/csv-map?header=${a}`)).data, { map: null });
  assert.equal((await req(env, "PUT", `/admin/settings/csv-map?header=${a}`, map)).status, 200);
  assert.deepEqual((await req(env, "GET", `/admin/settings/csv-map?header=${a}`)).data, { map });
  assert.deepEqual((await req(env, "GET", `/admin/settings/csv-map?header=${b}`)).data, { map: null });
  assert.equal((await req(env, "GET", "/admin/settings/csv-map?header=x")).status, 400);
  assert.equal((await req(env, "PUT", `/admin/settings/csv-map?header=${b}`, { ...map, date_format: "MDY" })).status, 400);
  assert.equal((await req(env, "PUT", `/admin/settings/csv-map?header=${b}`, { ...map, amount: -1 })).status, 400);
});

test("rentals routes: signed out 401, cross-origin 403", async () => {
  const env = makeEnv();
  const id = await rental(env);
  const routes = [["GET", "/admin/landlords"], ["POST", "/admin/landlords"], ["GET", "/admin/landlords/1"],
    ["PUT", "/admin/landlords/1"], ["POST", "/admin/landlords/1/archive"], ["POST", "/admin/landlords/1/restore"],
    ["POST", "/admin/rentals"], ["GET", `/admin/rentals/${id}`], ["PUT", `/admin/rentals/${id}`],
    ["POST", `/admin/rentals/${id}/archive`], ["POST", `/admin/rentals/${id}/restore`],
    ["PUT", `/admin/rentals/${id}/compliance/eicr`], ["GET", "/admin/settings/rpi"], ["PUT", "/admin/settings/rpi"],
    ["GET", "/admin/settings/gst"], ["PUT", "/admin/settings/gst"], ["GET", `/admin/settings/csv-map?header=${"a".repeat(64)}`],
    ["PUT", `/admin/settings/csv-map?header=${"a".repeat(64)}`]];
  for (const [m, p] of routes) {
    const body = m === "GET" ? undefined : {};
    assert.equal((await call(env, m, p, { body })).status, 401, `${m} ${p}`);
    if (m !== "GET") assert.equal((await call(env, m, p, { body, cookie: await adminCookie(), origin: "https://evil.test" }))
      .status, 403, `${m} ${p}`);
  }
  assert.equal(row(env, "SELECT archived_at FROM rentals WHERE id = ?", id).archived_at, null);
});

test("rental: a save or a landlord archive landing between the read and the write is 409 and writes nothing", async () => {
  const env = makeEnv();
  const id = await rental(env), other = await landlord(env, { name: "Other Owner" });
  const t = tenancy(env, id);
  const before = row(env, "SELECT * FROM rentals WHERE id = ?", id), nEvents = () => rows(env, "SELECT id FROM rental_events").length;
  const n = nEvents();
  // Runs `sneak` just before the PUT's batch, after its reads.
  const batch = env.DB.batch.bind(env.DB);
  const meanwhile = sneak => { env.DB.batch = async stmts => {
    if (stmts[0].sql.startsWith("UPDATE rentals SET")) { sneak(); env.DB.batch = batch; }
    return batch(stmts);
  }; };

  meanwhile(() => run(env, "UPDATE rentals SET updated_at = '2026-10-24T09:00:00.000Z', notes = 'Saved meanwhile' WHERE id = ?", id));
  const raced = await putRental(env, id, { service: "full", fee_percent: 10, collect_from: "2026-10-01" });
  assert.equal(raced.status, 409, JSON.stringify(raced.data));
  assert.equal(row(env, "SELECT collect_from FROM tenancies WHERE id = ?", t).collect_from, null);
  assert.equal(row(env, "SELECT service FROM rentals WHERE id = ?", id).service, "let_only");
  assert.equal(nEvents(), n);

  meanwhile(() => run(env, "UPDATE landlords SET archived_at = '2026-10-24T09:00:00.000Z' WHERE id = ?", other));
  const moved = await putRental(env, id, { landlord_id: other });
  assert.equal(moved.status, 409, JSON.stringify(moved.data));
  assert.equal(row(env, "SELECT landlord_id FROM rentals WHERE id = ?", id).landlord_id, before.landlord_id);
  assert.equal(nEvents(), n);
});
