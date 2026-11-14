// ADM-16 task 1: the exit inventory compared with the entry inventory it cites, kept apart from the planned move-out.
// Synthetic fixtures only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";

const T = jerseyToday(), M0 = `${T.slice(0, 7)}-01`, START = plusDays(M0, -62);
const on = () => ({ ...makeEnv(), ADM06_TENANCY_ORIGIN_READY: "1", ADM16_TENANCY_EXIT_READY: "1" });
const req = async (env, method, path, body, who) => call(env, method, path, { body, cookie: await adminCookie(who) });
const row = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a);
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a);
const count = (env, table) => row(env, `SELECT COUNT(*) AS n FROM ${table}`).n;

async function tenancy(env, over = {}) {
  const l = await req(env, "POST", "/admin/landlords", { name: "Synthetic Owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "5 Rue des Exemples",
    parish: "St Helier", service: "full", fee_percent: 10 });
  const t = await req(env, "POST", `/admin/rentals/${r.data.rental.id}/tenancies`, { tenant_name: "Tess Example", kind: "periodic",
    regime: "2025", rent: 1500, deposit: 1500, start_on: START, collect_from: START, ...over });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  return t.data.tenancy.id;
}
const end = (env, id, ended_on) => req(env, "POST", `/admin/tenancies/${id}/end`, { ended_on });
const exit = (env, id) => req(env, "GET", `/admin/tenancies/${id}/exit`);
const saveExit = (env, id, body, who) => req(env, "PUT", `/admin/tenancies/${id}/exit-inventory`, body, who);
const entry = (env, id, body) => req(env, "PUT", `/admin/tenancies/${id}/entry-inventory`, body);
const ENTRY = { rooms: [{ name: "Kitchen", observations: "Worktop chipped by the sink." }, { name: "Bedroom 1", observations: "" }],
  meter_readings: [{ meter: "electricity", reading: "12345.6", unit: "kWh" }], evidence_refs: ["Check-in photos, folder P-0001"] };
const ROOMS = [{ name: "Kitchen", condition: "as_entry", observations: "" },
  { name: "Bedroom 1", condition: "changed", observations: "Carpet stained by the window." }];
const READINGS = [{ meter: "electricity", reading: "13001", unit: "kWh", read_on: T }];

async function ended(env = on(), over) {
  const id = await tenancy(env, over);
  assert.equal((await end(env, id, plusDays(T, 20))).status, 200);
  return { env, id };
}

test("flag off: the exit routes do not exist, and they need the staff session", async () => {
  const env = { ...makeEnv(), ADM06_TENANCY_ORIGIN_READY: "1" }, id = await tenancy(env);
  assert.equal((await req(env, "GET", "/admin/tenancy-exits")).status, 404);
  assert.equal((await exit(env, id)).status, 404);
  assert.equal((await saveExit(env, id, { expectedRevision: 0, rooms: ROOMS })).status, 404);
  assert.equal((await req(env, "PUT", `/admin/tenancies/${id}/deposit-proposal`, { expectedRevision: 0, lines: [] })).status, 404);
  assert.equal((await req(env, "POST", `/admin/tenancies/${id}/deposit-outcomes`, {})).status, 404);
  const live = on(), t = await tenancy(live);
  assert.equal((await call(live, "GET", `/admin/tenancies/${t}/exit`)).status, 401);
  assert.equal((await call(live, "PUT", `/admin/tenancies/${t}/exit-inventory`, { body: {} })).status, 401);
  assert.equal((await req(live, "GET", "/admin/tenancy-exits")).status, 200);
  assert.equal((await exit(live, 999)).status, 404);
});

test("entry_inventory_is_immutable: the exit copies the cited entry revision and never writes the entry inventory", async () => {
  const { env, id } = await ended();
  assert.equal((await entry(env, id, { expectedRevision: 0, ...ENTRY })).status, 200);
  const before = row(env, "SELECT * FROM tenancy_entry_inventories WHERE tenancy_id = ?", id);
  const r0 = await exit(env, id);
  assert.equal(r0.status, 200, JSON.stringify(r0.data));
  assert.equal(r0.data.entry.revision, 1); assert.equal(r0.data.exit, null);
  // A body cannot bring its own version of the entry inventory.
  const s = await saveExit(env, id, { expectedRevision: 0, entry_inventory_revision: 1, rooms: ROOMS, meter_readings: READINGS,
    entry_snapshot: { rooms: [{ name: "Kitchen", observations: "Perfect" }], meter_readings: [] }, evidence_refs: ["Check-out photos, folder P-0002"] });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const x = s.data.exit_inventory;
  assert.equal(x.revision, 1); assert.equal(x.entry_inventory_revision, 1);
  assert.deepEqual(x.entry, { rooms: ENTRY.rooms, meter_readings: ENTRY.meter_readings });
  assert.deepEqual({ ...row(env, "SELECT * FROM tenancy_entry_inventories WHERE tenancy_id = ?", id) }, { ...before });
  // The entry inventory moves on: the comparison keeps what it cited, and a form citing the old revision is stale.
  assert.equal((await entry(env, id, { expectedRevision: 1, rooms: [{ name: "Kitchen", observations: "As new" }] })).status, 200);
  const r1 = await exit(env, id);
  assert.equal(r1.data.entry.revision, 2);
  assert.equal(r1.data.exit.entry_inventory_revision, 1);
  assert.equal(r1.data.exit.entry.rooms[0].observations, "Worktop chipped by the sink.");
  const old = await saveExit(env, id, { expectedRevision: 1, entry_inventory_revision: 1, rooms: ROOMS });
  assert.equal(old.status, 409);
  const stale = await saveExit(env, id, { expectedRevision: 0, entry_inventory_revision: 2, rooms: ROOMS });
  assert.equal(stale.status, 409);
  assert.equal(row(env, "SELECT revision FROM tenancy_exit_inventories WHERE tenancy_id = ?", id).revision, 1);
  const next = await saveExit(env, id, { expectedRevision: 1, entry_inventory_revision: 2, rooms: ROOMS.slice(0, 1) }, "colleague@example.test");
  assert.equal(next.status, 200, JSON.stringify(next.data));
  assert.equal(next.data.exit_inventory.revision, 2); assert.equal(next.data.exit_inventory.updated_by, "colleague@example.test");
  assert.deepEqual(next.data.exit_inventory.entry.rooms, [{ name: "Kitchen", observations: "As new" }]);
  assert.equal(row(env, "SELECT revision FROM tenancy_entry_inventories WHERE tenancy_id = ?", id).revision, 2);
  // The history counts; the private references stay out of it.
  const e = rows(env, "SELECT data FROM rental_events WHERE type = 'tenancy.exit_inventory_saved' ORDER BY id").map(r => JSON.parse(r.data));
  assert.deepEqual(e[0], { revision: 1, rooms: 2, changed: 1, meter_readings: 1, evidence_refs: 1, entry_revision: 1, moved_out_on: null });
  assert.ok(!/folder P-000/.test(JSON.stringify(e)));
});

test("missing_entry_inventory_flagged_not_fabricated", async () => {
  const { env, id } = await ended();
  const r = await exit(env, id);
  assert.equal(r.data.entry, null); assert.equal(r.data.exit, null);
  // No entry to cite, and nothing to call unchanged.
  assert.equal((await saveExit(env, id, { expectedRevision: 0, entry_inventory_revision: 1, rooms: ROOMS })).status, 409);
  const same = await saveExit(env, id, { expectedRevision: 0, entry_inventory_revision: null, rooms: ROOMS });
  assert.equal(same.status, 400); assert.ok(same.data.fields["rooms.0.condition"]);
  const vague = await saveExit(env, id, { expectedRevision: 0, rooms: [{ name: "Hall", condition: "changed", observations: " " }] });
  assert.equal(vague.status, 400); assert.ok(vague.data.fields["rooms.0.observations"], "a change says what changed");
  const odd = await saveExit(env, id, { expectedRevision: 0, rooms: [{ name: "Hall", condition: "fine", observations: "" }] });
  assert.equal(odd.status, 400); assert.ok(odd.data.fields["rooms.0.condition"]);
  assert.equal(count(env, "tenancy_exit_inventories"), 0);
  const ok = await saveExit(env, id, { expectedRevision: 0, entry_inventory_revision: null, rooms: [{ name: "Kitchen", condition: "not_checked",
    observations: "" }, { name: "Hall", condition: "changed", observations: "Scuffed wall." }] });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.exit_inventory.entry_inventory_revision, null); assert.equal(ok.data.exit_inventory.entry, null);
  assert.equal(row(env, "SELECT entry_snapshot FROM tenancy_exit_inventories").entry_snapshot, null);
  assert.equal(count(env, "tenancy_entry_inventories"), 0, "no entry inventory is made up");
  // With an entry inventory, a room it does not list cannot be "as at check-in" either.
  const b = await ended();
  await entry(b.env, b.id, { expectedRevision: 0, ...ENTRY });
  const extra = await saveExit(b.env, b.id, { expectedRevision: 0, entry_inventory_revision: 1,
    rooms: [{ name: "Garage", condition: "as_entry", observations: "" }] });
  assert.equal(extra.status, 400); assert.ok(extra.data.fields["rooms.0.condition"]);
});

test("photo_from_other_case_denied: a reference or a body for another tenancy is refused", async () => {
  const a = await ended(), env = a.env, b = await ended(env);
  assert.equal((await entry(env, a.id, { expectedRevision: 0, ...ENTRY })).status, 200);
  const cross = await saveExit(env, b.id, { tenancy_id: a.id, expectedRevision: 0, rooms: [{ name: "Hall", condition: "not_checked" }] });
  assert.equal(cross.status, 400);
  const theirs = await saveExit(env, b.id, { expectedRevision: 0, rooms: [{ name: "Hall", condition: "not_checked" }],
    evidence_refs: ["Own photos, folder P-0100", "Check-in photos, folder P-0001"] });
  assert.equal(theirs.status, 400); assert.ok(theirs.data.fields["evidence_refs.1"]);
  assert.equal(count(env, "tenancy_exit_inventories"), 0);
  // Its own entry reference is fine on its own exit; on the other tenancy's exit it is refused too.
  const own = await saveExit(env, a.id, { expectedRevision: 0, entry_inventory_revision: 1, rooms: ROOMS,
    evidence_refs: ["Check-in photos, folder P-0001", "Check-out photos, folder P-0003"] });
  assert.equal(own.status, 200, JSON.stringify(own.data));
  const again = await saveExit(env, b.id, { expectedRevision: 0, rooms: [{ name: "Hall", condition: "not_checked" }],
    evidence_refs: ["Check-out photos, folder P-0003"] });
  assert.equal(again.status, 400); assert.ok(again.data.fields["evidence_refs.0"]);
  const dup = await saveExit(env, b.id, { expectedRevision: 0, rooms: [{ name: "Hall", condition: "not_checked" }],
    evidence_refs: ["B photos", "B photos"] });
  assert.equal(dup.status, 400); assert.ok(dup.data.fields.evidence_refs);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM tenancy_exit_inventories WHERE tenancy_id = ?", b.id).n, 0);
});

test("planned_moveout_not_actual_completion", async () => {
  const env = on(), id = await tenancy(env);
  // Before End tenancy there is no move-out to inventory.
  const early = await saveExit(env, id, { expectedRevision: 0, rooms: [{ name: "Hall", condition: "not_checked" }] });
  assert.equal(early.status, 409);
  const planned = plusDays(T, 20);
  assert.equal((await end(env, id, planned)).status, 200);
  const r = await exit(env, id);
  assert.equal(r.data.tenancy.planned_move_out, planned);
  assert.equal(r.data.exit, null);
  const draft = await saveExit(env, id, { expectedRevision: 0, rooms: [{ name: "Hall", condition: "not_checked" }] });
  assert.equal(draft.status, 200, JSON.stringify(draft.data));
  assert.equal(draft.data.exit_inventory.moved_out_on, null, "a planned date is not a move-out");
  const keys = d => saveExit(env, id, { expectedRevision: 1, rooms: [{ name: "Hall", condition: "not_checked" }], moved_out_on: d });
  assert.equal((await keys(plusDays(T, 1))).status, 400, "not ahead of today");
  assert.equal((await keys(plusDays(START, -1))).status, 400, "not before the start");
  assert.equal((await keys("2026-02-30")).status, 400);
  const undated = await saveExit(env, id, { expectedRevision: 1, rooms: [{ name: "Hall", condition: "not_checked" }],
    meter_readings: [{ meter: "gas", reading: "10", unit: "m3" }] });
  assert.equal(undated.status, 400); assert.ok(undated.data.fields["meter_readings.0.read_on"]);
  const ahead = await saveExit(env, id, { expectedRevision: 1, rooms: [{ name: "Hall", condition: "not_checked" }],
    meter_readings: [{ meter: "gas", reading: "10", unit: "m3", read_on: plusDays(T, 1) }] });
  assert.equal(ahead.status, 400); assert.ok(ahead.data.fields["meter_readings.0.read_on"]);
  const unitless = await saveExit(env, id, { expectedRevision: 1, rooms: [{ name: "Hall", condition: "not_checked" }],
    meter_readings: [{ meter: "gas", reading: "10", read_on: T }] });
  assert.equal(unitless.status, 400); assert.ok(unitless.data.fields["meter_readings.0.unit"]);
  const done = await keys(T);
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.exit_inventory.moved_out_on, T);
  const t = row(env, "SELECT ended_on, inventory_out_on FROM tenancies WHERE id = ?", id);
  assert.deepEqual({ ...t }, { ended_on: planned, inventory_out_on: null }, "the planned move-out and the check-out deadline stay as they were");
});

test("duplicate_end_preserves_ledger: ending again or moving the date keeps payments, inventories and history", async () => {
  const { env, id } = await ended();
  assert.equal((await req(env, "POST", "/admin/payments", { tenancy_id: id, received_on: T, amount: 150000 })).status, 201);
  assert.equal((await entry(env, id, { expectedRevision: 0, ...ENTRY })).status, 200);
  assert.equal((await saveExit(env, id, { expectedRevision: 0, entry_inventory_revision: 1, rooms: ROOMS, meter_readings: READINGS })).status, 200);
  const books = () => [rows(env, "SELECT * FROM payments"), rows(env, "SELECT id, due_on, amount FROM charges ORDER BY id"),
    rows(env, "SELECT * FROM tenancy_entry_inventories"), rows(env, "SELECT * FROM tenancy_exit_inventories"), count(env, "rental_events")];
  const before = books(), balance = (await req(env, "GET", `/admin/tenancies/${id}`)).data.balance;
  assert.equal((await end(env, id, plusDays(T, 20))).status, 200);
  assert.deepEqual(books(), before, "the same move-out twice changes nothing");
  assert.equal((await req(env, "GET", `/admin/tenancies/${id}`)).data.balance, balance);
  assert.equal((await end(env, id, plusDays(T, 40))).status, 200);
  const [payments, , entries, exits] = books();
  assert.deepEqual([payments, entries, exits], [before[0], before[2], before[3]], "a new date keeps payments and both inventories");
  assert.equal((await exit(env, id)).data.exit.revision, 1);
});
