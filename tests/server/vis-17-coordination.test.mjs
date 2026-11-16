// VIS-17: a viewing coordinated with several people: one proposed time, each required person's answer recorded by
// staff with its evidence, and the viewing confirmed only once all have accepted. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, captured, T0 } from "./helpers.mjs";
import { validRequired, validateResponse, coordinationState, clientFit } from "../../server/viewing-coordination.js";

// Tuesday 20 October 2026, 13:05 in Jersey (BST). Proposals are for Wednesday with Joshua (negotiator 2).
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
// A website request for Thursday 10:00 with Gilberto, from ana@example.je.
const request = (env, o = {}) => insert(env, "viewing_requests", { listing_id: ID, listing_ref: ID, agent: "Gilberto Franco",
  kind: "In person", date: "2026-10-22", time: "10:00", end_time: "10:30", name: "Ana Example", email: "ana@example.je", phone: null,
  status: "requested", created_at: T0, negotiator_id: 1, ...o });
// Ana's search, with her preferred viewing times (REG-17): Wednesdays 10:00-12:00.
const search = (env, o = {}, windows = [{ day: 3, start: "10:00", end: "12:00" }]) => {
  const contact = insert(env, "contacts", { name: "Ana Example", email: o.email ?? "ana@example.je", phone: o.phone ?? null,
    last_activity_at: T0, created_at: T0, updated_at: T0 });
  return insert(env, "applicants", { contact_id: contact, operation: o.operation ?? "buy", source: "web", created_at: T0, updated_at: T0,
    viewing_availability: windows ? JSON.stringify(windows) : null });
};
const row = (env, id) => env.DB.raw.prepare("SELECT * FROM viewing_requests WHERE id = ?").get(id);
const events = (env, id, type) => env.DB.raw.prepare("SELECT * FROM events WHERE entity_type = 'viewing' AND entity_id = ? AND type = ?")
  .all(String(id), type);
const propose = (env, cookie, id, o = {}) => call(env, "POST", `/admin/viewings/${id}/proposals`, { cookie, body: {
  expected_revision: 0, negotiator_id: 2, date: WED, time: "11:00", required: ["client", "advertiser"], ...o } });
const answer = (env, cookie, id, p, participant, o = {}) => call(env, "POST", `/admin/viewings/${id}/proposals/${p.id}/responses`,
  { cookie, body: { revision: p.revision, participant, response: "accepted", channel: "phone", answered_at: "2026-10-20T11:50:00.000Z", ...o } });
const act = (env, cookie, id, action, o = {}) => call(env, "PUT", `/admin/viewings/${id}`,
  { cookie, body: { action, updated_at: row(env, id).updated_at, ...o } });

test("validation: the client always accepts, answers need how and when, and states are named", () => {
  assert.deepEqual(validRequired(["advertiser", "client"]), ["client", "advertiser"]);
  for (const bad of [[], ["advertiser"], ["client", "client"], ["client", "owner"], "client", null]) assert.equal(validRequired(bad), null);
  const ok = { participant: "client", response: "accepted", channel: "phone", answered_at: "2026-10-20T11:50:00.000Z" };
  const opts = { required: ["client"], now: NOW, since: T0 };
  assert.equal(validateResponse(ok, opts).value.answered_by, null);
  assert.deepEqual(Object.keys(validateResponse({}, opts).errors).sort(), ["answered_at", "channel", "participant", "response"]);
  assert.ok(validateResponse({ ...ok, participant: "advertiser" }, opts).errors.participant, "only someone the proposal asks");
  assert.ok(validateResponse({ ...ok, answered_at: "2026-10-21T10:00:00.000Z" }, opts).errors.answered_at, "not in the future");
  assert.ok(validateResponse({ ...ok, answered_at: "2026-10-01T10:00:00.000Z" }, opts).errors.answered_at, "not before the request");
  assert.ok(validateResponse({ ...ok, answered_by: "x".repeat(121) }, opts).errors.answered_by);
  const p = { state: "open", required: '["client","advertiser"]' };
  assert.deepEqual(coordinationState(null, []), { state: "none", missing: [] });
  assert.deepEqual(coordinationState(p, []), { state: "proposed", missing: ["client", "advertiser"] });
  assert.deepEqual(coordinationState(p, [{ participant: "client", response: "accepted" }]), { state: "awaiting_confirmations", missing: ["advertiser"] });
  assert.equal(coordinationState(p, [{ participant: "client", response: "accepted" }, { participant: "advertiser", response: "accepted" }]).state, "blocked");
  assert.equal(coordinationState({ ...p, state: "superseded" }, []).state, "withdrawn");
  assert.equal(clientFit(null, { date: WED, time: "11:00", end_time: "11:30" }), "unknown", "unknown hours are never free");
  assert.equal(clientFit([{ day: 3, start: "10:00", end: "12:00" }], { date: WED, time: "11:00", end_time: "11:30" }), "fits");
  assert.equal(clientFit([{ day: 3, start: "10:00", end: "12:00" }], { date: WED, time: "11:45", end_time: "12:15" }), "outside");
});

test("switched off, or on before 0114: no routes, no list flag, and the same SQL for every action", async t => {
  const runs = [];
  for (const [ready, skip] of [[false, []], [true, [114]]]) {
    t.mock.timers.reset();
    const { env, cookie } = await world(t, { ready, skip });
    const id = request(env);
    assert.equal((await call(env, "GET", `/admin/viewings/${id}/coordination`, { cookie })).status, 404);
    assert.equal((await propose(env, cookie, id)).status, 404);
    const list = await call(env, "GET", "/admin/viewings?tab=requests", { cookie });
    assert.equal("coordination" in list.data, false);
    const seen = captured(env, /viewing|events|notifications|contacts/);
    assert.equal((await act(env, cookie, id, "confirm")).status, 200);
    assert.equal((await act(env, cookie, id, "reschedule", { negotiator_id: 2, date: WED, time: "11:00" })).status, 200);
    assert.equal((await act(env, cookie, id, "cancel")).status, 200);
    runs.push(seen.filter(s => !/sqlite_master/.test(s.sql)).map(s => s.sql));
  }
  assert.ok(runs[0].length > 5);
  assert.deepEqual(runs[1], runs[0], "on before the migration writes exactly as off");
  assert.ok(runs[0].every(sql => !/viewing_proposals|viewing_acceptances/.test(sql)));
});

test("only signed-in staff, from the panel's own origin", async t => {
  const { env, cookie } = await world(t);
  const id = request(env);
  assert.equal((await call(env, "GET", `/admin/viewings/${id}/coordination`)).status, 401);
  assert.equal((await propose(env, null, id)).status, 401);
  assert.equal((await call(env, "POST", `/admin/viewings/${id}/proposals`, { cookie, origin: "https://evil.test", body: {} })).status, 403);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM viewing_proposals").get().n, 0);
});

test("an agency's proposed time stays pending until the client and the advertiser accept; the search stays active", async t => {
  const { env, cookie } = await world(t);
  const id = request(env), applicant = search(env);
  const r = await propose(env, cookie, id, { applicant_id: applicant });
  assert.equal(r.status, 201);
  assert.equal(r.data.coordination_state, "proposed");
  assert.deepEqual(r.data.missing, ["client", "advertiser"]);
  assert.equal(r.data.proposal.client_fit, "fits", "inside her Wednesday 10:00-12:00");
  assert.deepEqual(r.data.windows, [{ day: 3, start: "10:00", end: "12:00" }]);
  assert.deepEqual(r.data.searches.map(s => s.id), [applicant]);
  const p = r.data.proposal;
  assert.deepEqual([row(env, id).status, row(env, id).date, row(env, id).time], ["requested", "2026-10-22", "10:00"], "the request keeps its time");
  assert.equal(events(env, id, "viewing.proposed").length, 1);
  assert.equal((await act(env, cookie, id, "confirm")).status, 409, "Confirm cannot skip the others");

  const a = await answer(env, cookie, id, p, "client", { answered_by: null });
  assert.equal(a.status, 200);
  assert.equal(a.data.confirmed, false);
  assert.equal(a.data.coordination_state, "awaiting_confirmations");
  assert.deepEqual(a.data.missing, ["advertiser"], "the client's answer is not the agency's");
  assert.equal(row(env, id).status, "requested");

  const b = await answer(env, cookie, id, p, "advertiser", { channel: "email", answered_by: "Agency front desk" });
  assert.equal(b.status, 200);
  assert.equal(b.data.confirmed, true);
  assert.equal(b.data.coordination_state, "confirmed");
  const v = row(env, id);
  assert.deepEqual([v.status, v.negotiator_id, v.agent, v.date, v.time, v.end_time], ["confirmed", 2, "Joshua Franco", WED, "11:00", "11:30"]);
  assert.equal(events(env, id, "viewing.confirmed").length, 1);
  assert.deepEqual(JSON.parse(events(env, id, "viewing.answer_recorded")[1].data),
    { revision: 1, participant: "advertiser", response: "accepted", channel: "email" }, "no names or notes in events");
  const s = env.DB.raw.prepare("SELECT search_state, stage FROM applicants WHERE id = ?").get(applicant);
  assert.deepEqual({ ...s }, { search_state: "active", stage: "new" }, "a confirmed viewing closes nothing");
  assert.equal(env.DB.raw.prepare("SELECT applicant_id FROM viewing_proposals").get().applicant_id, applicant);
  // Deleting the search later is never blocked by a closed proposal; it only forgets the link.
  env.DB.raw.prepare("DELETE FROM applicants WHERE id = ?").run(applicant);
  assert.deepEqual({ ...env.DB.raw.prepare("SELECT applicant_id, state FROM viewing_proposals").get() }, { applicant_id: null, state: "confirmed" });
  assert.throws(() => env.DB.raw.prepare("UPDATE viewing_proposals SET state = 'open', closed_at = NULL").run(), /closed or fixed/);
  assert.throws(() => env.DB.raw.prepare("UPDATE viewing_acceptances SET response = 'declined'").run(), /cannot be changed/);
});

test("the last two answers at once confirm exactly once", async t => {
  const { env, cookie } = await world(t);
  const id = request(env);
  const p = (await propose(env, cookie, id, { required: ["client", "advertiser", "staff"] })).data.proposal;
  assert.equal((await answer(env, cookie, id, p, "staff")).status, 200);
  const [a, b] = await Promise.all([answer(env, cookie, id, p, "client"), answer(env, cookie, id, p, "advertiser")]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.deepEqual([a.data.confirmed, b.data.confirmed].sort(), [false, true]);
  assert.equal(events(env, id, "viewing.confirmed").length, 1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM viewing_acceptances").get().n, 3);
  assert.equal(row(env, id).status, "confirmed");
});

test("stale proposals and repeated answers answer 409 and write nothing", async t => {
  const { env, cookie } = await world(t);
  const id = request(env);
  const first = (await propose(env, cookie, id)).data.proposal;
  assert.equal((await propose(env, cookie, id)).status, 409, "expected_revision 0 is stale now");
  assert.equal((await answer(env, cookie, id, { ...first, revision: 2 }, "client")).status, 409);
  assert.equal((await answer(env, cookie, id, first, "client")).status, 200);
  assert.equal((await answer(env, cookie, id, first, "client", { response: "declined" })).status, 409, "one answer per person");
  assert.equal(events(env, id, "viewing.answer_recorded").length, 1);
  // A new time asks everyone again; the old proposal is closed.
  const second = (await propose(env, cookie, id, { expected_revision: 1, time: "11:30" })).data;
  assert.equal(second.proposal.revision, 2);
  assert.deepEqual(second.missing, ["client", "advertiser"]);
  assert.equal((await answer(env, cookie, id, first, "advertiser")).status, 409);
  assert.deepEqual(env.DB.raw.prepare("SELECT revision, state FROM viewing_proposals ORDER BY revision").all().map(x => [x.revision, x.state]),
    [[1, "superseded"], [2, "open"]]);
  // Two people proposing at once: one wins.
  const [x, y] = await Promise.all([propose(env, cookie, id, { expected_revision: 2 }), propose(env, cookie, id, { expected_revision: 2, time: "12:00" })]);
  assert.deepEqual([x.status, y.status].sort(), [201, 409]);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM viewing_proposals WHERE state = 'open'").get().n, 1);
});

test("a decline closes the proposal and keeps the viewing as it was", async t => {
  const { env, cookie } = await world(t);
  const id = request(env);
  const p = (await propose(env, cookie, id)).data.proposal;
  const r = await answer(env, cookie, id, p, "advertiser", { response: "declined" });
  assert.equal(r.data.coordination_state, "declined");
  assert.deepEqual([row(env, id).status, row(env, id).time], ["requested", "10:00"]);
  assert.equal((await answer(env, cookie, id, p, "client")).status, 409);
  assert.equal((await act(env, cookie, id, "confirm")).status, 200, "nothing open: the old Confirm works again");
});

test("the viewing's own reschedule or cancel ends its proposal; a late answer revives nothing", async t => {
  const { env, cookie } = await world(t);
  const a = request(env), b = request(env, { time: "11:00", end_time: "11:30" });
  const pa = (await propose(env, cookie, a)).data.proposal, pb = (await propose(env, cookie, b, { time: "12:00" })).data.proposal;
  assert.equal((await act(env, cookie, a, "reschedule", { negotiator_id: 1, date: "2026-10-23", time: "10:00" })).status, 200);
  assert.equal((await act(env, cookie, b, "cancel")).status, 200);
  assert.deepEqual(env.DB.raw.prepare("SELECT viewing_id, state FROM viewing_proposals ORDER BY id").all().map(x => x.state), ["superseded", "cancelled"]);
  assert.equal((await answer(env, cookie, a, pa, "client")).status, 409);
  assert.equal((await answer(env, cookie, b, pb, "client")).status, 409);
  assert.deepEqual([row(env, a).date, row(env, a).time, row(env, b).status], ["2026-10-23", "10:00", "cancelled"]);
  // Deleting a viewing takes its proposals and answers with it.
  assert.equal((await call(env, "DELETE", `/admin/viewings/${a}`, { cookie })).status, 200);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM viewing_proposals WHERE viewing_id = ?").get(a).n, 0);
});

test("a confirmed viewing keeps its time while a new one is agreed, then moves in one write", async t => {
  const { env, cookie } = await world(t);
  const id = request(env, { status: "confirmed", updated_at: T0 });
  const p = (await propose(env, cookie, id, { required: ["client"] })).data.proposal;
  assert.deepEqual([row(env, id).status, row(env, id).time], ["confirmed", "10:00"]);
  const r = await answer(env, cookie, id, p, "client");
  assert.equal(r.data.confirmed, true);
  assert.deepEqual([row(env, id).negotiator_id, row(env, id).date, row(env, id).time], [2, WED, "11:00"]);
  assert.equal(events(env, id, "viewing.rescheduled").length, 1);
});

test("a time taken before the last answer leaves the viewing as it was", async t => {
  const { env, cookie } = await world(t);
  const id = request(env);
  const p = (await propose(env, cookie, id, { required: ["client"] })).data.proposal;
  request(env, { negotiator_id: 2, agent: "Joshua Franco", date: WED, time: "11:00", end_time: "11:30", status: "confirmed", email: "ben@example.je" });
  const r = await answer(env, cookie, id, p, "client");
  assert.equal(r.status, 200);
  assert.equal(r.data.confirmed, false);
  assert.equal(r.data.coordination_state, "blocked");
  assert.deepEqual([row(env, id).status, row(env, id).date, row(env, id).time], ["requested", "2026-10-22", "10:00"]);
  assert.equal(events(env, id, "viewing.confirmed").length, 0);
  // A taken time cannot be proposed either.
  assert.equal((await propose(env, cookie, id, { expected_revision: 1 })).status, 409);
});

test("a search is linked only by hand, of the same person and the same operation", async t => {
  const { env, cookie } = await world(t);
  const id = request(env), other = search(env, { email: "ben@example.je" }), renting = search(env, { operation: "rent" });
  assert.equal((await propose(env, cookie, id, { applicant_id: other })).data.fields.applicant_id, "Choose one of this person's open searches");
  assert.match((await propose(env, cookie, id, { applicant_id: renting })).data.fields.applicant_id, /to rent; this property is for sale/);
  const state = (await call(env, "GET", `/admin/viewings/${id}/coordination`, { cookie })).data;
  assert.deepEqual(state.searches.map(s => s.id), [renting], "only her own open searches are offered");
  assert.equal(state.coordination_state, "none");
  assert.equal((await propose(env, cookie, id, { required: ["advertiser"] })).status, 400);
  const linked = await propose(env, cookie, id);
  assert.equal(linked.data.proposal.applicant_id, null, "never chosen for them");
  assert.equal(linked.data.proposal.client_fit, "unknown");
});
