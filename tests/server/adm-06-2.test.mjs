// ADM-06 task 2: the signed contract as a reviewed external reference, and the versioned entry inventory. Synthetic data.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday } from "../../server/viewings.js";
import routes from "../../server/routes/tenancy-origins.js";

const T = jerseyToday(), M0 = `${T.slice(0, 7)}-01`;
const on = () => ({ ...makeEnv(), ADM06_TENANCY_ORIGIN_READY: "1" });
const req = async (env, method, path, body, who) => call(env, method, path, { body, cookie: await adminCookie(who) });
const row = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a);
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a);

async function tenancy(env, over = {}) {
  const l = await req(env, "POST", "/admin/landlords", { name: "Synthetic Owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "2 Rue des Exemples",
    parish: "St Helier", service: "let_only" });
  const t = await req(env, "POST", `/admin/rentals/${r.data.rental.id}/tenancies`, { tenant_name: "Tess Example", kind: "periodic",
    regime: "2025", rent: 1500, start_on: M0, inventory_in_on: M0, ...over });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  return t.data.tenancy.id;
}
const records = (env, id) => req(env, "GET", `/admin/tenancies/${id}/records`);
const contract = (env, id, body, who) => req(env, "PUT", `/admin/tenancies/${id}/signed-contract`, body, who);
const inventory = (env, id, body, who) => req(env, "PUT", `/admin/tenancies/${id}/entry-inventory`, body, who);
const ROOMS = [{ name: "Kitchen", observations: "Worktop chipped by the sink." }, { name: "Bedroom 1", observations: "" }];
const READINGS = [{ meter: "electricity", reading: "12345.6", unit: "kWh" }, { meter: "water", reading: "88", unit: "m3" }];

test("flag off: no records routes", async () => {
  const env = makeEnv(), id = await tenancy(env);
  assert.equal((await records(env, id)).status, 404);
  assert.equal((await contract(env, id, { evidence_ref: "x", expectedRevision: 0 })).status, 404);
  assert.equal((await inventory(env, id, { expectedRevision: 0, rooms: ROOMS })).status, 404);
});

test("signed_file_not_replaced_by_date: a date never records a signed contract; a reviewed reference does", async () => {
  const env = on(), id = await tenancy(env);
  const r0 = await records(env, id);
  assert.equal(r0.status, 200);
  assert.equal(r0.data.signed_contract, null, "start_on and the check-in date are not a signed contract");
  assert.equal(r0.data.origin, null); assert.equal(r0.data.entry_inventory, null);
  const dateOnly = await contract(env, id, { signed_on: M0, expectedRevision: 0 });
  assert.equal(dateOnly.status, 400); assert.ok(dateOnly.data.fields.evidence_ref);
  const long = await contract(env, id, { evidence_ref: "x".repeat(121), expectedRevision: 0 });
  assert.equal(long.status, 400, "ref_over120_rejected");
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM tenancy_signed_contracts").n, 0);
  const ok = await contract(env, id, { evidence_ref: " Signed lease, folder L-0001 ", expectedRevision: 0,
    reviewed_by: "someone@else.test", reviewed_at: "2000-01-01T00:00:00.000Z" });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const s = ok.data.signed_contract;
  assert.equal(s.evidence_ref, "Signed lease, folder L-0001");
  assert.equal(s.revision, 1);
  assert.equal(s.reviewed_by, "admin@example.test", "server_actor_and_time");
  assert.notEqual(s.reviewed_at, "2000-01-01T00:00:00.000Z");
  assert.ok(!/file|url|pdf|received/i.test(JSON.stringify(Object.keys(ok.data.signed_contract))));
  // stale_revision409_no_write
  const stale = await contract(env, id, { evidence_ref: "Another", expectedRevision: 0 });
  assert.equal(stale.status, 409);
  assert.equal(row(env, "SELECT evidence_ref FROM tenancy_signed_contracts").evidence_ref, "Signed lease, folder L-0001");
  const next = await contract(env, id, { evidence_ref: "Signed lease v2, folder L-0001", expectedRevision: 1 }, "colleague@example.test");
  assert.equal(next.status, 200); assert.equal(next.data.signed_contract.revision, 2);
  assert.equal(next.data.signed_contract.reviewed_by, "colleague@example.test");
});

test("meter_reading_units_are_explicit", async () => {
  const env = on(), id = await tenancy(env);
  const none = await inventory(env, id, { expectedRevision: 0, rooms: ROOMS, meter_readings: [{ meter: "gas", reading: "10" }] });
  assert.equal(none.status, 400); assert.ok(none.data.fields["meter_readings.0.unit"]);
  const odd = await inventory(env, id, { expectedRevision: 0, rooms: ROOMS, meter_readings: [{ meter: "gas", reading: "10", unit: "units" }] });
  assert.equal(odd.status, 400); assert.ok(odd.data.fields["meter_readings.0.unit"]);
  const neg = await inventory(env, id, { expectedRevision: 0, rooms: ROOMS, meter_readings: [{ meter: "gas", reading: "-1", unit: "m3" }] });
  assert.equal(neg.status, 400); assert.ok(neg.data.fields["meter_readings.0.reading"]);
  const ok = await inventory(env, id, { expectedRevision: 0, rooms: ROOMS, meter_readings: READINGS });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(ok.data.entry_inventory.meter_readings, READINGS);
});

test("entry inventory: versioned with expectedRevision, rooms required, up to 20 reviewed refs", async () => {
  const env = on(), id = await tenancy(env);
  const empty = await inventory(env, id, { expectedRevision: 0, rooms: [] });
  assert.equal(empty.status, 400); assert.ok(empty.data.fields.rooms);
  const unnamed = await inventory(env, id, { expectedRevision: 0, rooms: [{ name: " ", observations: "" }] });
  assert.equal(unnamed.status, 400); assert.ok(unnamed.data.fields["rooms.0.name"]);
  const many = await inventory(env, id, { expectedRevision: 0, rooms: ROOMS, evidence_refs: Array.from({ length: 21 }, (_, i) => `Photo ${i}`) });
  assert.equal(many.status, 400); assert.ok(many.data.fields.evidence_refs);
  const long = await inventory(env, id, { expectedRevision: 0, rooms: ROOMS, evidence_refs: ["y".repeat(121)] });
  assert.equal(long.status, 400); assert.ok(long.data.fields["evidence_refs.0"]);
  const first = await inventory(env, id, { expectedRevision: 0, rooms: ROOMS, meter_readings: READINGS,
    evidence_refs: ["Check-in photos, folder P-0001"] });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const inv = first.data.entry_inventory;
  assert.equal(inv.revision, 1); assert.equal(inv.updated_by, "admin@example.test");
  assert.deepEqual(inv.rooms, ROOMS);
  assert.deepEqual(inv.evidence_refs.map(({ evidence_ref, reviewed_by, revision }) => [evidence_ref, reviewed_by, revision]),
    [["Check-in photos, folder P-0001", "admin@example.test", 1]]);
  const stale = await inventory(env, id, { expectedRevision: 0, rooms: [{ name: "Hall", observations: "" }] });
  assert.equal(stale.status, 409);
  assert.equal(JSON.parse(row(env, "SELECT rooms FROM tenancy_entry_inventories").rooms)[0].name, "Kitchen");
  const second = await inventory(env, id, { expectedRevision: 1, rooms: ROOMS, meter_readings: READINGS,
    evidence_refs: ["Check-in photos, folder P-0001", "Meter photos, folder P-0002"] }, "colleague@example.test");
  assert.equal(second.status, 200);
  assert.deepEqual(second.data.entry_inventory.evidence_refs.map(e => [e.evidence_ref, e.reviewed_by, e.revision]),
    [["Check-in photos, folder P-0001", "admin@example.test", 1], ["Meter photos, folder P-0002", "colleague@example.test", 2]],
    "a reference already reviewed keeps its review");
  assert.equal(second.data.entry_inventory.revision, 2);
  // The inventory's own deadline date is untouched (a manual date, kept as it was).
  assert.equal(row(env, "SELECT inventory_in_on FROM tenancies WHERE id = ?", id).inventory_in_on, M0);
  // Private references never reach the general history.
  const events = rows(env, "SELECT type, data FROM rental_events WHERE type LIKE 'tenancy.%'").map(e => e.data ?? "").join(" ");
  assert.ok(!/folder P-000/.test(events), events);
});

test("refs_belong_to_correct_tenancy (wrong_case_denied)", async () => {
  const env = on(), a = await tenancy(env), b = await tenancy(env);
  assert.equal((await inventory(env, a, { expectedRevision: 0, rooms: ROOMS, evidence_refs: ["A photos"] })).status, 200);
  assert.equal((await records(env, b)).data.entry_inventory, null);
  const cross = await inventory(env, b, { tenancy_id: a, expectedRevision: 0, rooms: ROOMS, evidence_refs: ["A photos"] });
  assert.equal(cross.status, 400);
  const crossContract = await contract(env, b, { tenancy_id: a, evidence_ref: "Lease A", expectedRevision: 0 });
  assert.equal(crossContract.status, 400);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM tenancy_entry_inventories WHERE tenancy_id = ?", b).n, 0);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM tenancy_signed_contracts").n, 0);
  assert.equal((await inventory(env, 999, { expectedRevision: 0, rooms: ROOMS })).status, 404);
  assert.equal((await records(env, 999)).status, 404);
});

test("commit records a signed-contract reference in the same batch; a date alone records none", async () => {
  const env = on();
  const l = await req(env, "POST", "/admin/landlords", { name: "Synthetic Owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "3 Rue des Exemples",
    parish: "St Helier", service: "let_only" });
  env.DB.raw.prepare(`INSERT INTO listings (id, use, title, operation, availability, rent, rent_period, specs, created_at, updated_at)
    VALUES ('HE-L003', 'residential', 'Flat', 'rent', 'let_agreed', 1200, 'month', '[]', ?, ?)`).run("2026-10-07T10:00:00.000Z", "2026-10-07T10:00:00.000Z");
  const c = env.DB.raw.prepare(`INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at)
    VALUES ('Sam Example', 'sam@example.test', 'x', 'x', 'x')`).run();
  const aid = Number(env.DB.raw.prepare(`INSERT INTO applicants (contact_id, operation, source, created_at, updated_at)
    VALUES (?, 'rent', 'web', 'x', 'x')`).run(c.lastInsertRowid).lastInsertRowid);
  const pick = { rental_id: r.data.rental.id, listing_id: "HE-L003", applicant_id: aid };
  const p = await req(env, "POST", "/admin/tenancy-origins/preview", pick);
  const draft = { tenant_name: "Sam Example", kind: "periodic", regime: "2025", rent: 1200, start_on: M0 };
  const bad = await req(env, "POST", "/admin/tenancy-origins/commit", { rental_id: pick.rental_id, source_versions: p.data.source_versions,
    tenancy_draft: draft, operation_id: "op-000000010", signed_contract_ref: "z".repeat(121) });
  assert.equal(bad.status, 400); assert.ok(bad.data.fields.signed_contract_ref);
  const ok = await req(env, "POST", "/admin/tenancy-origins/commit", { rental_id: pick.rental_id, source_versions: p.data.source_versions,
    tenancy_draft: draft, operation_id: "op-000000011", signed_contract_ref: "Signed lease, folder L-0003" });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const rec = await records(env, ok.data.tenancy.id);
  assert.equal(rec.data.signed_contract.evidence_ref, "Signed lease, folder L-0003");
  assert.equal(rec.data.signed_contract.revision, 1);
  assert.deepEqual([rec.data.origin.listing_id, rec.data.origin.applicant_id], ["HE-L003", aid]);
});

test("no_upload_download_endpoint: only JSON references, never files", async () => {
  for (const [, re] of routes) assert.ok(!/upload|download|file|media/i.test(re.source), re.source);
  const env = on(), id = await tenancy(env);
  const form = new FormData(); form.set("evidence_ref", "x"); form.set("expectedRevision", "0");
  const res = await call(env, "PUT", `/admin/tenancies/${id}/signed-contract`, { form, cookie: await adminCookie() });
  assert.equal(res.status, 400);
});
