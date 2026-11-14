// ADM-13: internal inspections every six months of a running tenancy, recorded by room from a phone, with references to
// photos checked outside the app and the repairs found waiting for a person. Synthetic fixtures only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { addMonths } from "../../server/rentals.js";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { NEXT_INSPECTION } from "../../server/rental-inspections.js";
import routes from "../../server/routes/rental-inspections.js";

const T = jerseyToday(), START = addMonths(T, -7);
const on = () => ({ ...makeEnv(), ADM13_INSPECTIONS_READY: "1" });
const req = async (env, method, path, body, who) => call(env, method, path, { body, cookie: await adminCookie(who) });
const row = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a);
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a);
const count = (env, table) => row(env, `SELECT COUNT(*) AS n FROM ${table}`).n;
let ops = 0;
const op = () => `test-op-${++ops}-${Date.now()}`;

async function tenancy(env, over = {}, address = "5 Rue des Exemples") {
  const l = await req(env, "POST", "/admin/landlords", { name: "Synthetic Owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address, parish: "St Helier", service: "let_only" });
  const t = await req(env, "POST", `/admin/rentals/${r.data.rental.id}/tenancies`, { tenant_name: "Tess Example", kind: "periodic",
    regime: "2025", rent: 1500, deposit: 1500, start_on: START, ...over });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  return { id: t.data.tenancy.id, rental: r.data.rental.id };
}
const read = (env, id) => req(env, "GET", `/admin/tenancies/${id}/inspections`);
const record = (env, id, body, who) => req(env, "POST", `/admin/tenancies/${id}/inspections`, { expectedRevision: 0, operation_id: op(),
  inspected_on: T, ...body }, who);
const decide = (env, id, inspection, body) => req(env, "POST", `/admin/tenancies/${id}/inspections/${inspection}/repairs`, body);
const ROOMS = [{ name: "Kitchen", condition: "attention", observations: "Tap dripping under the sink.", repair_needed: true },
  { name: "Bedroom 1", condition: "ok", observations: "" }, { name: "Loft", condition: "not_checked", observations: "No ladder." }];

test("flag off: no inspection route exists; on: staff session, same origin and no-store; the switch ships off", async () => {
  const off = makeEnv(), a = await tenancy(off);
  for (const [method, path] of [["GET", "/admin/rental-inspections"], ["GET", `/admin/tenancies/${a.id}/inspections`],
    ["POST", `/admin/tenancies/${a.id}/inspections`], ["POST", `/admin/tenancies/${a.id}/inspections/1/repairs`]])
    assert.equal((await req(off, method, path, method === "POST" ? {} : undefined)).status, 404, path);
  const env = on(), b = await tenancy(env);
  assert.equal((await call(env, "GET", `/admin/tenancies/${b.id}/inspections`)).status, 401);
  assert.equal((await call(env, "POST", `/admin/tenancies/${b.id}/inspections`, { body: {} })).status, 401);
  const foreign = await call(env, "POST", `/admin/tenancies/${b.id}/inspections`, { body: {}, cookie: await adminCookie(),
    origin: "https://evil.example" });
  assert.equal(foreign.status, 403);
  const ok = await read(env, b.id);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.equal((await req(env, "GET", "/admin/rental-inspections")).status, 200);
  assert.equal((await read(env, 999)).status, 404);
  assert.match(readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8"), /^ADM13_INSPECTIONS_READY = "[01]"$/m);
});

test("no_owner_report_and_no_file_route: JSON routes only, nothing to send, print, upload or download", () => {
  for (const [, re] of routes) assert.doesNotMatch(re.source, /report|owner|landlord|upload|download|file|photo|send|print/i);
  assert.equal(routes.length, 4);
});

test("six calendar months after the start, then after the last inspection, on the month's last day when shorter", async () => {
  const env = on(), a = await tenancy(env);
  const r0 = await read(env, a.id);
  assert.deepEqual(r0.data.next, { due_on: addMonths(START, 6), status: "overdue" });
  assert.deepEqual([r0.data.revision, r0.data.inspections, r0.data.suggested_rooms], [0, [], []]);
  const day = plusDays(T, -3), s = await record(env, a.id, { inspected_on: day, rooms: ROOMS });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  const r1 = await read(env, a.id);
  assert.equal(r1.data.next.due_on, addMonths(day, 6));
  assert.equal(r1.data.revision, 1);
  assert.deepEqual(r1.data.suggested_rooms, ["Kitchen", "Bedroom 1", "Loft"]);
  // The SQL used by the to-do and the count agrees with addMonths, month ends and leap days included.
  for (const start of ["2025-08-31", "2027-08-31", "2028-02-29", "2026-01-15", "2026-12-31"]) {
    const sql = row(env, `SELECT ${NEXT_INSPECTION} AS d FROM (SELECT 999999 AS id, ? AS start_on) t`, start).d;
    assert.equal(sql, addMonths(start, 6), start);
  }
  assert.equal(addMonths("2025-08-31", 6), "2026-02-28");
});

test("the overdue inspection shows in Rentals › To do, the property's mark and the nav count, only with the flag", async () => {
  const env = on(), a = await tenancy(env), soon = await tenancy(env, { start_on: plusDays(addMonths(T, -6), 20) }, "6 Rue des Exemples");
  const later = await tenancy(env, { start_on: plusDays(T, -10) }, "7 Rue des Exemples");
  // The other checks and deadlines done, so only inspections can show.
  env.DB.raw.prepare("UPDATE compliance_items SET done_on = ?, expires_on = ?").run(T, addMonths(T, 24));
  env.DB.raw.prepare("UPDATE tenancies SET inventory_in_on = start_on").run();
  const overview = async e => (await req(e, "GET", "/admin/rentals")).data;
  const items = d => d.todo.compliance.filter(c => c.kind === "inspection").map(c => [c.tenancy_id, c.status]);
  let d = await overview(env);
  assert.deepEqual(items(d), [[a.id, "overdue"], [soon.id, "due30"]]);
  assert.equal(d.todo.compliance.find(c => c.tenancy_id === a.id).label, "Inspection");
  assert.ok(d.rentals.find(r => r.id === a.rental).marks.includes("compliance"));
  assert.ok(!d.rentals.find(r => r.id === later.rental).marks.includes("compliance"));
  const counts = async e => {
    env.DB.raw.prepare("DELETE FROM app_settings WHERE key = 'rentals_count'").run();
    return (await req(e, "GET", "/admin/notifications/counts")).data.rentals;
  };
  assert.equal(await counts(env), 1, "only the overdue one counts");
  // Without the flag nothing reads the table: the same data, no inspection anywhere.
  const off = { ...env, ADM13_INSPECTIONS_READY: "0" };
  assert.deepEqual(items(await overview(off)), []);
  assert.ok(!(await overview(off)).rentals.find(r => r.id === a.rental).marks.includes("compliance"));
  assert.equal(await counts(off), 0);
  // Recorded today: due again in six months, out of the to-do and the count.
  assert.equal((await record(env, a.id, { rooms: ROOMS })).status, 201);
  d = await overview(env);
  assert.deepEqual(items(d), [[soon.id, "due30"]]);
  assert.equal(await counts(env), 0);
  // A tenancy moving out before the next inspection falls due has none to do.
  assert.equal((await req(env, "POST", `/admin/tenancies/${soon.id}/end`, { ended_on: plusDays(T, 5) })).status, 200);
  assert.deepEqual(items(await overview(env)), []);
  assert.equal((await read(env, soon.id)).data.next, null);
});

test("validation: a day from the start to today, every room checked or said not checked, nothing written on error", async () => {
  const env = on(), a = await tenancy(env);
  const bad = async (body, field) => {
    const r = await record(env, a.id, body);
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.ok(r.data.fields[field], `${field}: ${JSON.stringify(r.data.fields)}`);
  };
  await bad({ inspected_on: plusDays(T, 1), rooms: ROOMS }, "inspected_on");
  await bad({ inspected_on: plusDays(START, -1), rooms: ROOMS }, "inspected_on");
  await bad({ inspected_on: "2026-02-30", rooms: ROOMS }, "inspected_on");
  await bad({ rooms: [] }, "rooms");
  await bad({ rooms: [{ name: "Hall", observations: "" }] }, "rooms.0.condition");
  await bad({ rooms: [{ name: "Hall", condition: "fine", observations: "" }] }, "rooms.0.condition");
  await bad({ rooms: [{ name: "Hall", condition: "attention", observations: " " }] }, "rooms.0.observations");
  await bad({ rooms: [{ name: "Hall", condition: "ok", observations: "", repair_needed: true }] }, "rooms.0.repair_needed");
  await bad({ rooms: ROOMS, evidence_refs: ["x".repeat(121)] }, "evidence_refs.0");
  await bad({ rooms: ROOMS, evidence_refs: ["Folder A", "Folder A"] }, "evidence_refs");
  await bad({ rooms: ROOMS, expectedRevision: -1 }, "expectedRevision");
  assert.equal((await record(env, a.id, { rooms: ROOMS, operation_id: "short" })).status, 400);
  assert.equal(count(env, "rental_inspections"), 0);
  // not_checked_not_ok: a room not checked is kept as not checked, never as OK.
  const s = await record(env, a.id, { rooms: ROOMS, evidence_refs: ["Inspection photos, folder I-0001"] });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  assert.deepEqual(s.data.inspection.rooms.map(r => r.condition), ["attention", "ok", "not_checked"]);
  assert.deepEqual(s.data.inspection.rooms.map(r => r.repair?.status ?? null), ["pending", null, null]);
});

test("stale_revision409_no_write and a repeat is replayed: one inspection, one history line", async () => {
  const env = on(), a = await tenancy(env), b = await tenancy(env, {}, "8 Rue des Exemples"), id = op();
  const first = await record(env, a.id, { rooms: ROOMS, operation_id: id });
  assert.equal(first.status, 201);
  assert.equal(first.data.replayed, false);
  const again = await record(env, a.id, { rooms: ROOMS, operation_id: id });
  assert.equal(again.status, 200);
  assert.deepEqual([again.data.replayed, again.data.inspection.id], [true, first.data.inspection.id]);
  assert.equal((await record(env, b.id, { rooms: ROOMS, operation_id: id })).status, 409, "the form of another tenancy");
  const stale = await record(env, a.id, { rooms: ROOMS, expectedRevision: 0 });
  assert.equal(stale.status, 409);
  assert.match(stale.data.error, /Someone else recorded an inspection meanwhile/);
  assert.equal(count(env, "rental_inspections"), 1);
  assert.equal(rows(env, "SELECT 1 FROM rental_events WHERE type = 'inspection.recorded'").length, 1);
  const next = await record(env, a.id, { rooms: ROOMS, expectedRevision: 1 }, "colleague@example.test");
  assert.equal(next.status, 201);
  assert.deepEqual([next.data.inspection.seq, next.data.inspection.recorded_by], [2, "colleague@example.test"]);
  // A body naming another tenancy is refused; an ended tenancy has no inspections to record.
  assert.equal((await record(env, a.id, { rooms: ROOMS, expectedRevision: 2, tenancy_id: b.id })).status, 400);
  env.DB.raw.prepare("UPDATE tenancies SET ended_on = ? WHERE id = ?").run(T, b.id);
  assert.equal((await record(env, b.id, { rooms: ROOMS })).status, 409);
});

test("wrong_case_denied: a reference recorded for another tenancy is refused; server_actor_and_time on the rest", async () => {
  const env = { ...on(), ADM06_TENANCY_ORIGIN_READY: "1" }, a = await tenancy(env), b = await tenancy(env, {}, "9 Rue des Exemples");
  assert.equal((await req(env, "PUT", `/admin/tenancies/${b.id}/entry-inventory`, { expectedRevision: 0,
    rooms: [{ name: "Kitchen", observations: "" }], evidence_refs: ["Check-in photos, folder B-1"] })).status, 200);
  assert.equal((await record(env, b.id, { rooms: ROOMS, evidence_refs: ["Inspection photos, folder B-2"] })).status, 201);
  for (const ref of ["Check-in photos, folder B-1", "Inspection photos, folder B-2"]) {
    const r = await record(env, a.id, { rooms: ROOMS, evidence_refs: ["Inspection photos, folder A-1", ref] });
    assert.equal(r.status, 400, ref);
    assert.match(r.data.fields["evidence_refs.1"], /another tenancy/);
  }
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM rental_inspections WHERE tenancy_id = ?", a.id).n, 0);
  const s = await record(env, a.id, { rooms: ROOMS, evidence_refs: [{ evidence_ref: "x", reviewed_by: "someone@else" }] });
  assert.equal(s.status, 400, "a reference is text, not a review");
  const ok = await record(env, a.id, { rooms: ROOMS, evidence_refs: ["Inspection photos, folder A-1"] }, "colleague@example.test");
  assert.equal(ok.status, 201);
  const [ref] = ok.data.inspection.evidence_refs;
  assert.deepEqual([ref.evidence_ref, ref.reviewed_by, ref.revision], ["Inspection photos, folder A-1", "colleague@example.test", 1]);
  assert.ok(Math.abs(Date.parse(ref.reviewed_at) - Date.now()) < 60000);
  // The same contract's reference can be cited again at its next inspection.
  assert.equal((await record(env, a.id, { rooms: ROOMS, expectedRevision: 1, evidence_refs: ["Inspection photos, folder A-1"] })).status, 201);
  // The history counts; observations and references stay out of it.
  const e = rows(env, "SELECT data FROM rental_events WHERE type = 'inspection.recorded' AND tenancy_id = ? ORDER BY id", a.id)
    .map(r => JSON.parse(r.data));
  assert.deepEqual(e[0], { seq: 1, inspected_on: T, rooms: 3, attention: 1, not_checked: 1, repairs: 1, evidence_refs: 1 });
  assert.ok(!/folder|dripping|ladder/.test(JSON.stringify(e)));
});

test("a found repair waits for a person: created once in Repairs, or set aside; stale and other cases refused", async () => {
  const env = on(), a = await tenancy(env), b = await tenancy(env, {}, "10 Rue des Exemples");
  const rooms = [ROOMS[0], { name: "Bathroom", condition: "attention", observations: "Extractor fan noisy.", repair_needed: true }, ROOMS[1]];
  const x = (await record(env, a.id, { rooms })).data.inspection;
  assert.equal(count(env, "repairs"), 0, "nothing is created before a person decides");
  const y = (await record(env, b.id, { rooms })).data.inspection;
  // Wrong case: the inspection is another tenancy's, or the room has nothing waiting.
  assert.equal((await decide(env, a.id, y.id, { room: 0, expectedRevision: 1, decision: "repair", urgency: "routine" })).status, 404);
  assert.equal((await decide(env, a.id, x.id, { room: 2, expectedRevision: 1, decision: "repair", urgency: "routine" })).status, 404);
  assert.equal((await decide(env, a.id, x.id, { room: 9, expectedRevision: 1, decision: "repair", urgency: "routine" })).status, 404);
  const none = await decide(env, a.id, x.id, { room: 0, expectedRevision: 1, decision: "repair" });
  assert.equal(none.status, 400); assert.ok(none.data.fields.urgency);
  assert.equal((await decide(env, a.id, x.id, { room: 0, expectedRevision: 1, decision: "maybe" })).status, 400);
  const c = await decide(env, a.id, x.id, { room: 0, expectedRevision: 1, decision: "repair", urgency: "urgent" });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  const p = row(env, "SELECT * FROM repairs WHERE id = ?", c.data.repair_id);
  assert.deepEqual([p.rental_id, p.tenancy_id, p.title, p.detail, p.urgency, p.status],
    [a.rental, a.id, "Kitchen: Tap dripping under the sink.", "Tap dripping under the sink.", "urgent", "reported"]);
  assert.deepEqual(c.data.inspection.rooms[0].repair.status, "created");
  assert.equal(c.data.inspection.revision, 2);
  // duplicate_repair_action_replayed
  const again = await decide(env, a.id, x.id, { room: 0, expectedRevision: 1, decision: "repair", urgency: "urgent" });
  assert.deepEqual([again.status, again.data.replayed, again.data.repair_id], [200, true, c.data.repair_id]);
  assert.equal((await decide(env, a.id, x.id, { room: 0, expectedRevision: 2, decision: "not_needed" })).status, 409);
  assert.equal(count(env, "repairs"), 1);
  const stale = await decide(env, a.id, x.id, { room: 1, expectedRevision: 1, decision: "not_needed" });
  assert.equal(stale.status, 409);
  assert.match(stale.data.error, /changed this inspection meanwhile/);
  const aside = await decide(env, a.id, x.id, { room: 1, expectedRevision: 2, decision: "not_needed" });
  assert.equal(aside.status, 201);
  assert.deepEqual([aside.data.inspection.rooms[1].repair.status, aside.data.repair_id, count(env, "repairs")], ["not_needed", null, 1]);
  // An archived property gets no new repair.
  env.DB.raw.prepare("UPDATE rentals SET archived_at = ? WHERE id = ?").run(T, b.rental);
  const archived = await decide(env, b.id, y.id, { room: 0, expectedRevision: 1, decision: "repair", urgency: "routine" });
  assert.equal(archived.status, 409);
  assert.equal(count(env, "repairs"), 1);
  const types = rows(env, "SELECT type, data FROM rental_events WHERE tenancy_id = ? ORDER BY id", a.id).map(r => [r.type, JSON.parse(r.data)]);
  assert.deepEqual(types.slice(-2).map(([t]) => t), ["repair.created", "inspection.repair_not_needed"]);
  assert.equal(types.at(-2)[1].repair_id, c.data.repair_id);
});

test("inspections are kept as recorded: no delete, no rewritten date, checklist rows or references", async () => {
  const env = on(), a = await tenancy(env);
  assert.equal((await record(env, a.id, { rooms: ROOMS })).status, 201);
  for (const sql of ["DELETE FROM rental_inspections", "UPDATE rental_inspections SET inspected_on = '2020-01-01'",
    "UPDATE rental_inspections SET evidence_refs = '[]'", "UPDATE rental_inspections SET tenancy_id = 99"])
    assert.throws(() => env.DB.raw.exec(sql), /kept as recorded/);
});
