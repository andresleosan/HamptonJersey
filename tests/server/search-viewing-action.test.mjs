// SAP-09: Book viewing from an applicant of a home another agency advertises. It holds the time as a request and opens
// VIS-17's proposal on it for this search; the local slot is never the agency's acceptance. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";

// Tuesday 20 October 2026, 13:05 in Jersey (BST). Proposals are for Wednesday 11:00 with Joshua (negotiator 2).
const NOW = Date.parse("2026-10-20T12:05:00.000Z"), WED = "2026-10-21", ID = "HE-R001";

async function world(t, { ready = true, skip = [] } = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv({ skip });
  if (ready) env.VIS17_MULTIPART_READY = "1";
  seedListing(env);
  return { env, cookie: await adminCookie() };
}
const insert = (env, table, row) => {
  const cols = Object.keys(row);
  return Number(env.DB.raw.prepare(`INSERT INTO ${table} (${cols}) VALUES (${cols.map(() => "?")})`).run(...cols.map(c => row[c])).lastInsertRowid);
};
const contact = (env, o = {}) => insert(env, "contacts", { name: "Ana Example", email: "ana@example.je", phone: null,
  last_activity_at: T0, created_at: T0, updated_at: T0, ...o });
const search = (env, contactId, o = {}) => insert(env, "applicants", { contact_id: contactId, operation: "buy", source: "web",
  created_at: T0, updated_at: T0, ...o });
const start = (env, cookie, applicant, o = {}) => call(env, "POST", `/admin/applicants/${applicant}/viewing-proposals`, { cookie,
  body: { listing_id: ID, kind: "In person", negotiator_id: 2, date: WED, time: "11:00", ...o } });
const one = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const count = (env, table) => one(env, `SELECT COUNT(*) n FROM ${table}`).n;

test("switched off, or on before 0114: the route does not exist and writes nothing", async t => {
  for (const [ready, skip] of [[false, []], [true, [114]]]) {
    t.mock.timers.reset();
    const { env, cookie } = await world(t, { ready, skip });
    const applicant = search(env, contact(env));
    assert.equal((await start(env, cookie, applicant)).status, 404);
    assert.equal(count(env, "viewing_requests"), 0);
  }
});

test("only signed-in staff, from the panel's own origin", async t => {
  const { env, cookie } = await world(t);
  const applicant = search(env, contact(env));
  assert.equal((await start(env, null, applicant)).status, 401);
  assert.equal((await call(env, "POST", `/admin/applicants/${applicant}/viewing-proposals`, { cookie, origin: "https://evil.test",
    body: {} })).status, 403);
  assert.equal(count(env, "viewing_requests"), 0);
});

test("request_not_booked · local_slot_not_agency_confirmation: a held request and an open proposal for this search", async t => {
  const { env, cookie } = await world(t);
  const applicant = search(env, contact(env, { phone: "+447700900123" }));
  const r = await start(env, cookie, applicant, { name: "Someone Else", email: "other@example.je", staff: true });
  assert.equal(r.status, 201);
  const v = one(env, "SELECT * FROM viewing_requests WHERE id = ?", r.data.id);
  assert.deepEqual([v.status, v.listing_id, v.negotiator_id, v.date, v.time, v.end_time], ["requested", ID, 2, WED, "11:00", "11:30"]);
  assert.deepEqual([v.name, v.email, v.phone], ["Ana Example", "ana@example.je", "+447700900123"], "the search's own contact, never the body's");
  const p = one(env, "SELECT * FROM viewing_proposals WHERE viewing_id = ?", v.id);
  assert.deepEqual([p.revision, p.state, p.applicant_id, p.negotiator_id, p.date, p.time, p.from_status, p.from_date, p.from_time],
    [1, "open", applicant, 2, WED, "11:00", "requested", WED, "11:00"]);
  assert.deepEqual(JSON.parse(p.required), ["client", "advertiser", "staff"]);
  const types = env.DB.raw.prepare("SELECT type, actor, data FROM events WHERE entity_type = 'viewing' AND entity_id = ? ORDER BY id")
    .all(String(v.id));
  assert.deepEqual(types.map(e => [e.type, e.actor]), [["viewing.requested", "admin@example.test"], ["viewing.proposed", "admin@example.test"]]);
  assert.ok(types.every(e => !/Ana|example\.je|\+44/.test(e.data)), "no personal data in events");
  assert.equal(count(env, "notifications"), 0, "staff's own request asks nobody for a task");

  // VIS-17 then reads it as its own: the agency's answer is still missing after the client's, and Confirm cannot skip it.
  const state = await call(env, "GET", `/admin/viewings/${v.id}/coordination`, { cookie });
  assert.equal(state.data.coordination_state, "proposed");
  assert.deepEqual(state.data.searches.map(s => s.id), [applicant]);
  const put = await call(env, "PUT", `/admin/viewings/${v.id}`, { cookie, body: { action: "confirm", updated_at: v.updated_at } });
  assert.equal(put.status, 409, "Confirm cannot skip the agency");
  const answer = (participant, revision = 1) => call(env, "POST", `/admin/viewings/${v.id}/proposals/${p.id}/responses`, { cookie,
    body: { revision, participant, response: "accepted", channel: "phone", answered_at: "2026-10-20T12:05:00.000Z" } });
  assert.equal((await answer("client")).data.confirmed, false);
  assert.equal((await answer("staff")).data.confirmed, false);
  assert.equal(one(env, "SELECT status FROM viewing_requests WHERE id = ?", v.id).status, "requested", "nothing confirmed without the agency");
  const last = await answer("advertiser");
  assert.equal(last.status, 200);
  assert.equal(last.data.confirmed, true);
  assert.deepEqual({ ...one(env, "SELECT status, date, time FROM viewing_requests WHERE id = ?", v.id) },
    { status: "confirmed", date: WED, time: "11:00" });
  assert.equal(one(env, "SELECT search_state FROM applicants WHERE id = ?", applicant).search_state, "active", "search_stays_active");
});

test("two_searches_exact_target: the proposal links the search it was started from", async t => {
  const { env, cookie } = await world(t);
  const person = contact(env), second = search(env, person, { operation: "rent" }), first = search(env, person);
  const r = await start(env, cookie, first);
  assert.equal(r.status, 201);
  assert.equal(one(env, "SELECT applicant_id FROM viewing_proposals").applicant_id, first);
  assert.notEqual(first, second);
});

test("conflicts_same_slot_one_winner: the second hold on the same time writes nothing", async t => {
  const { env, cookie } = await world(t);
  const person = contact(env), a = search(env, person), b = search(env, contact(env, { name: "Bo Example", email: "bo@example.je" }));
  assert.equal((await start(env, cookie, a)).status, 201);
  const again = await start(env, cookie, b);
  assert.equal(again.status, 409);
  assert.equal(count(env, "viewing_requests"), 1);
  assert.equal(count(env, "viewing_proposals"), 1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE entity_type = 'viewing'").get().n, 2);
});

test("refusals: an inactive search, a wrong operation, a missing property and an unfree time", async t => {
  const { env, cookie } = await world(t);
  const person = contact(env);
  const archived = search(env, person, { archived_at: T0 });
  assert.equal((await start(env, cookie, archived)).status, 409);
  const renting = search(env, person, { operation: "rent" });
  const wrong = await start(env, cookie, renting);
  assert.equal(wrong.status, 400);
  assert.match(wrong.data.fields.listing_id, /to rent; this property is for sale/);
  const buying = search(env, person);
  assert.equal((await start(env, cookie, buying, { listing_id: null })).data.fields.listing_id, "Choose the property");
  assert.equal((await start(env, cookie, buying, { listing_id: "HE-R999" })).data.fields.listing_id, "Choose the property");
  assert.equal((await start(env, cookie, buying, { time: "03:00" })).status, 400);
  assert.equal((await start(env, cookie, 999999)).status, 404);
  assert.equal(count(env, "viewing_requests"), 0);
  assert.equal(count(env, "viewing_proposals"), 0);
});
