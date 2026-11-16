// VIS-14: open viewings and back-to-back times when several people want the same house. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";

// Tuesday 20 October 2026, 13:05 in Jersey (BST). Wednesday is the day the team plans.
const NOW = Date.parse("2026-10-20T12:05:00.000Z"), WED = "2026-10-21", ID = "HE-R001";

async function world(t, { ready = true, policy = false } = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv();
  if (ready) env.VIS14_BLOCK_READY = "1";
  if (policy) env.VIS09_VIEWING_POLICY_READY = "1";
  seedListing(env);
  seedListing(env, { id: "HE-R002", title: "La Rocque" });
  return { env, cookie: await adminCookie() };
}
// A website request: negotiator 1 on Thursday, one slot each (they never clash with Wednesday's plans).
let n = 0;
const request = (env, o = {}) => {
  n += 1;
  const row = { listing_id: ID, listing_ref: ID, agent: "Gilberto Franco", kind: "In person", date: "2026-10-22",
    time: `${String(10 + (n % 7)).padStart(2, "0")}:00`, name: `Person ${n}`, email: `person${n}@example.je`, phone: null,
    status: "requested", created_at: T0, negotiator_id: 1, ...o };
  row.end_time ??= `${row.time.slice(0, 3)}30`;
  const cols = Object.keys(row);
  return Number(env.DB.raw.prepare(`INSERT INTO viewing_requests (${cols}) VALUES (${cols.map(() => "?")})`)
    .run(...cols.map(c => row[c])).lastInsertRowid);
};
const row = (env, id) => env.DB.raw.prepare("SELECT * FROM viewing_requests WHERE id = ?").get(id);
const ref = (env, id) => ({ id, updated_at: row(env, id).updated_at });
const open = (env, cookie, ids, o = {}) => call(env, "POST", "/admin/viewing-groups", { cookie, body: { listing_id: ID,
  negotiator_id: 2, date: WED, time: "15:00", capacity: 6, viewings: ids.map(id => ref(env, id)), ...o } });
const place = (env, cookie, group, id) => call(env, "POST", `/admin/viewing-groups/${group}/places`,
  { cookie, body: { viewings: [ref(env, id)] } });
const members = (env, group) => env.DB.raw.prepare(`SELECT COUNT(*) n FROM viewing_group_places p
  JOIN viewing_groups g ON g.id = p.group_id JOIN viewing_requests v ON v.id = p.viewing_id
  WHERE p.group_id = ? AND v.status IN ('requested','confirmed') AND v.negotiator_id = g.negotiator_id
    AND v.date = g.date AND v.time = g.time`).get(group).n;

test("switched off, nothing changes: no routes, no extra fields in the list or the calendar", async t => {
  const { env, cookie } = await world(t, { ready: false });
  const a = request(env), b = request(env);
  assert.equal((await call(env, "GET", "/admin/viewing-groups", { cookie })).status, 404);
  assert.equal((await open(env, cookie, [a, b])).status, 404);
  const list = await call(env, "GET", "/admin/viewings?tab=requests", { cookie });
  assert.equal(list.status, 200);
  assert.equal("groups" in list.data, false);
  const cal = await call(env, "GET", `/admin/availability?from=${WED}&days=1`, { cookie });
  assert.equal("groups" in cal.data, false);
  assert.deepEqual([row(env, a).status, row(env, b).status], ["requested", "requested"]);
});

test("only signed-in staff read or plan groups, and a refused call writes nothing", async t => {
  const { env } = await world(t);
  const a = request(env), b = request(env);
  assert.equal((await call(env, "GET", "/admin/viewing-groups")).status, 401);
  assert.equal((await open(env, null, [a, b])).status, 401);
  assert.equal((await call(env, "POST", "/admin/viewing-groups/consecutive", { body: { listing_id: ID, negotiator_id: 2,
    date: WED, time: "10:00", viewings: [ref(env, a), ref(env, b)] } })).status, 401);
  assert.equal((await call(env, "POST", "/admin/viewing-groups/1/places", { body: { viewings: [ref(env, a)] } })).status, 401);
  assert.equal((await call(env, "POST", "/admin/viewing-groups/1/cancel", { body: {} })).status, 401);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM viewing_groups").get().n, 0);
  assert.deepEqual([row(env, a).date, row(env, a).updated_at], ["2026-10-22", null], "the request was not moved");
});

test("a house with two or more open requests is flagged; one request alone is not", async t => {
  const { env, cookie } = await world(t);
  const a = request(env), b = request(env);
  request(env, { listing_id: "HE-R002", listing_ref: "HE-R002" });
  request(env, { status: "cancelled" });
  const r = await call(env, "GET", "/admin/viewing-groups", { cookie });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.requests.map(x => x.id).sort(), [a, b].sort());
  assert.ok(r.data.requests.every(x => x.listing_id === ID && x.listing_title === "Le Bernage"));
  assert.deepEqual(r.data.groups, []);
  const list = await call(env, "GET", "/admin/viewings?tab=requests", { cookie });
  assert.equal(list.data.groups, true);
});

test("an open viewing reserves one place per request, pending until each is confirmed", async t => {
  const { env, cookie } = await world(t);
  const a = request(env), b = request(env);
  const r = await open(env, cookie, [a, b], { capacity: 4 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.deepEqual(r.data.placed.sort(), [a, b].sort());
  assert.deepEqual(r.data.refused, []);
  for (const id of [a, b]) {
    const v = row(env, id);
    assert.deepEqual([v.status, v.negotiator_id, v.date, v.time, v.end_time, v.agent], ["requested", 2, WED, "15:00", "15:30", "Joshua Franco"]);
  }
  assert.equal(members(env, r.data.id), 2);
  // Flagged no more: both hold a place. The group is listed with its counts.
  const o = await call(env, "GET", "/admin/viewing-groups", { cookie });
  assert.deepEqual(o.data.requests, []);
  assert.deepEqual(o.data.groups.map(g => [g.id, g.capacity, g.pending, g.confirmed]), [[r.data.id, 4, 2, 0]]);
  // Confirming one, as today, moves it from pending to confirmed.
  const v = row(env, a);
  assert.equal((await call(env, "PUT", `/admin/viewings/${a}`, { cookie, body: { action: "confirm", updated_at: v.updated_at } })).status, 200);
  // The panel's busy calendar: the slot is booked and carries the counts, never who.
  const cal = await call(env, "GET", `/admin/availability?from=${WED}&days=1`, { cookie });
  assert.deepEqual(cal.data.groups, [{ negotiator_id: 2, date: WED, time: "15:00", end_time: "15:30", capacity: 4, pending: 1, confirmed: 1 }]);
  assert.equal(cal.data.days[0].slots[2].find(s => s.time === "15:00").booked, true);
  assert.doesNotMatch(JSON.stringify(cal.data.groups), /Person|example\.je|HE-R001/);
  const events = env.DB.raw.prepare("SELECT entity_id, type, data FROM events WHERE type LIKE 'viewing_group.%'").all();
  assert.deepEqual(events.map(e => [e.entity_id, e.type, JSON.parse(e.data).group_id]), [[ID, "viewing_group.created", r.data.id]]);
  assert.doesNotMatch(events[0].data, /Person|example\.je/);
});

test("ten requests claiming the last places at once: never more places than capacity", async t => {
  const { env, cookie } = await world(t);
  const ids = Array.from({ length: 10 }, (_, i) => request(env, { date: i < 5 ? "2026-10-22" : "2026-10-23" }));
  const g = await open(env, cookie, [], { capacity: 3 });
  assert.equal(g.status, 201, JSON.stringify(g.data));
  const results = await Promise.all(ids.map(id => place(env, cookie, g.data.id, id)));
  assert.equal(results.filter(r => r.status === 200).length, 3);
  assert.ok(results.filter(r => r.status !== 200).every(r => r.status === 409 && /full/i.test(r.data.error)), JSON.stringify(results.map(r => r.data)));
  assert.equal(members(env, g.data.id), 3);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM viewing_requests WHERE date = ? AND time = '15:00'").get(WED).n, 3);
  // The database itself refuses a fourth place, whatever path tries it.
  const spare = ids.find(id => row(env, id).date !== WED);
  assert.throws(() => env.DB.raw.prepare(`INSERT INTO viewing_group_places (viewing_id, group_id, created_at, created_by)
    VALUES (?, ?, ?, 'fixture')`).run(spare, g.data.id, T0), /full/);
});

test("one household, one place; a cancelled viewing frees its place", async t => {
  const { env, cookie } = await world(t);
  const a = request(env, { email: "same@example.je" }), b = request(env, { email: "same@example.je" }), c = request(env);
  const g = await open(env, cookie, [a], { capacity: 2 });
  assert.deepEqual(g.data.placed, [a]);
  const again = await place(env, cookie, g.data.id, b);
  assert.equal(again.status, 409);
  assert.match(again.data.error, /already has a place/);
  assert.equal(row(env, b).date, "2026-10-22", "the refused request stays where it was");
  assert.equal((await place(env, cookie, g.data.id, c)).status, 200);
  assert.equal((await place(env, cookie, g.data.id, request(env))).status, 409, "full");
  const v = row(env, a);
  assert.equal((await call(env, "PUT", `/admin/viewings/${a}`, { cookie, body: { action: "cancel", updated_at: v.updated_at } })).status, 200);
  assert.equal(members(env, g.data.id), 1);
  assert.equal((await place(env, cookie, g.data.id, b)).status, 200, "cancel_frees_one");
  assert.equal(members(env, g.data.id), 2);
});

test("a stale request, another property, or a time someone else holds is refused", async t => {
  const { env, cookie } = await world(t);
  const a = request(env), other = request(env, { listing_id: "HE-R002", listing_ref: "HE-R002" });
  const g = await open(env, cookie, [], { capacity: 5 });
  const stale = await call(env, "POST", `/admin/viewing-groups/${g.data.id}/places`,
    { cookie, body: { viewings: [{ id: a, updated_at: "2026-01-01T00:00:00.000Z" }] } });
  assert.equal(stale.status, 409);
  assert.equal((await place(env, cookie, g.data.id, other)).status, 409);
  // Someone books the empty slot individually: it is no longer the group's to give.
  const booked = await call(env, "POST", "/admin/viewings", { cookie, body: { listing_id: "HE-R002", negotiator_id: 2,
    kind: "In person", date: WED, time: "15:00", name: "Walk In", phone: "07797 000000" } });
  assert.equal(booked.status, 201);
  const clash = await place(env, cookie, g.data.id, a);
  assert.equal(clash.status, 409);
  assert.equal(members(env, g.data.id), 0);
  // And a new group cannot be created on a negotiator's taken time.
  assert.equal((await open(env, cookie, [], { time: "15:00" })).status, 409);
  assert.equal((await open(env, cookie, [], { capacity: 0 })).status, 400);
  assert.equal((await open(env, cookie, [], { capacity: 51 })).status, 400);
});

test("with the viewing rules on, the open viewing still respects them and books the slot", async t => {
  const { env, cookie } = await world(t, { policy: true });
  const a = request(env), b = request(env);
  const g = await open(env, cookie, [a, b], { time: "11:00" });
  assert.equal(g.status, 201, JSON.stringify(g.data));
  assert.equal(members(env, g.data.id), 2);
  const cal = await call(env, "GET", `/admin/availability?from=${WED}&days=1&negotiator_id=2`, { cookie });
  assert.equal(cal.data.days[0].slots[2].find(s => s.time === "11:00").booked, true);
  const direct = await call(env, "POST", "/admin/viewings", { cookie, body: { listing_id: ID, negotiator_id: 2,
    kind: "In person", date: WED, time: "11:00", name: "Walk In", phone: "07797 000000" } });
  assert.equal(direct.status, 409);
});

test("back-to-back: the requests move to consecutive free times of one negotiator and stay requests", async t => {
  const { env, cookie } = await world(t);
  const ids = [request(env), request(env), request(env)];
  const r = await call(env, "POST", "/admin/viewing-groups/consecutive", { cookie, body: { listing_id: ID,
    negotiator_id: 2, date: WED, time: "10:00", viewings: ids.map(id => ref(env, id)) } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.refused, []);
  const times = ids.map(id => row(env, id)).map(v => [v.status, v.negotiator_id, v.date, v.time]);
  assert.deepEqual(times, [["requested", 2, WED, "10:00"], ["requested", 2, WED, "11:00"], ["requested", 2, WED, "12:00"]]);
  // Their old slots on Thursday are free again; nothing was cancelled.
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM viewing_requests WHERE date = '2026-10-22'").get().n, 0);
  // A request of another house is refused before anything moves.
  const other = request(env, { listing_id: "HE-R002", listing_ref: "HE-R002" }), mine = request(env);
  const bad = await call(env, "POST", "/admin/viewing-groups/consecutive", { cookie, body: { listing_id: ID,
    negotiator_id: 2, date: WED, time: "14:00", viewings: [ref(env, mine), ref(env, other)] } });
  assert.equal(bad.status, 400);
  assert.equal(row(env, mine).date, "2026-10-22");
});

test("cancelling an open viewing cancels its viewings and closes it to new places", async t => {
  const { env, cookie } = await world(t);
  const a = request(env), b = request(env), c = request(env);
  const g = await open(env, cookie, [a, b]);
  const r = await call(env, "POST", `/admin/viewing-groups/${g.data.id}/cancel`, { cookie, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual([row(env, a).status, row(env, b).status], ["cancelled", "cancelled"]);
  assert.equal(env.DB.raw.prepare("SELECT status FROM viewing_groups WHERE id = ?").get(g.data.id).status, "cancelled");
  assert.equal((await place(env, cookie, g.data.id, c)).status, 409);
  const cal = await call(env, "GET", `/admin/availability?from=${WED}&days=1`, { cookie });
  assert.deepEqual(cal.data.groups, []);
  assert.equal((await call(env, "POST", `/admin/viewing-groups/${g.data.id}/cancel`, { cookie, body: {} })).status, 409);
});
