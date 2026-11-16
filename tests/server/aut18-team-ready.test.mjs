// AUT-18: a person marks a search Ready for the team once its proposals are reviewed; Done or a stage change takes the
// mark off, a criteria change leaves it out of date. Hermes's door counts the marked searches, a number only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, seedListing, T0 } from "./helpers.mjs";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
const KEY = "hermes-test-key-hermes-test-key-0123456789";
const ON = { AUT18_TEAM_READY: "1" };
// Two homes every search below is proposed: one to let, one for sale.
const env0 = (flags = ON, schema) => {
  const env = Object.assign(makeEnv(schema), { HERMES_KEY: KEY }, flags);
  seedListing(env, { id: "HE-R002", matchable: 1, operation: "rent", availability: "to_let", sale_price: null, rent: 1500,
    rent_period: "month", bedrooms: 2 });
  seedListing(env, { id: "HE-S003", matchable: 1, bedrooms: 3 });
  return env;
};
const req = async (env, method, path, body, who = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(who) });
const door = env => call(env, "GET", "/hermes/status", { bearer: KEY, origin: null });
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
// A review decision on the search's proposed home, through the Matches route (it writes match.reviewed).
const review = async (env, id, from, status, extra = {}) => {
  const m = row(env, "SELECT id FROM matches WHERE applicant_id = ?", id);
  const r = await req(env, "PUT", `/admin/matches/${m.id}`, { from, status, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.data));
};
// A search with its proposed home shortlisted (reviewed), unless shortlist is false.
async function create(env, o = {}, { shortlist = true } = {}) {
  const r = await req(env, "POST", "/admin/applicants", { name: "Zelda Quarrington", email: "zelda@private.je",
    phone: "07797 900321", source: "phone", operation: "rent", budget_max: 2000, bedrooms_min: 2, ...o });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  if (shortlist) await review(env, r.data.id, "found", "shortlisted");
  return r.data.id;
}
const applicant = (env, id) => row(env, "SELECT * FROM applicants WHERE id = ?", id);
// The search's mark (null: none).
const ready = (env, id) => env.DB.raw.prepare("SELECT * FROM applicant_team_ready WHERE applicant_id = ?").get(id) ?? null;
const mark = (env, id, ready, updated_at = applicant(env, id).updated_at, who) =>
  req(env, "POST", `/admin/applicants/${id}/team-ready`, { ready, updated_at }, who);
const events = (env, id) => rows(env, `SELECT actor, type, data FROM events WHERE entity_type = 'applicant' AND entity_id = ?
  AND type LIKE 'applicant.team_ready%' ORDER BY id`, String(id)).map(e => ({ ...e, data: e.data && JSON.parse(e.data) }));
const SECRETS = ["Zelda", "Quarrington", "zelda@", "900321"];

test("switched off, or without migration 0102, nothing is offered and the door's status is unchanged", async () => {
  for (const env of [env0({}), env0({}, { through: 101 }), env0(ON, { through: 101 })]) {
    const id = await create(env);
    const before = await door(env);
    assert.equal("team_ready" in (await req(env, "GET", `/admin/applicants/${id}`)).data, false);
    assert.equal((await mark(env, id, true)).status, 404);
    assert.equal("applicants_ready" in before.data.counts, false);
    assert.doesNotMatch(before.data.summary, /ready for the team/);
    // A stage change saves as before.
    const saved = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant(env, id).updated_at, stage: "searching" });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
  }
  // Off, a search the database has marked (the switch turned off later) is neither counted nor shown.
  const env = env0({}), id = await create(env);
  env.DB.raw.prepare(`INSERT INTO applicant_team_ready (applicant_id, marked_at, marked_by, revision)
    SELECT id, ?, ?, match_inputs_revision FROM applicants WHERE id = ?`).run(T0, ADMIN, id);
  const { data } = await door(env);
  assert.equal("applicants_ready" in data.counts, false);
  assert.doesNotMatch(data.summary, /ready for the team/);
});

test("marking is a person's act on the version they saw, recorded in the history with ids only", async () => {
  const env = env0(), id = await create(env);
  const seen = applicant(env, id);
  assert.deepEqual((await req(env, "GET", `/admin/applicants/${id}`)).data.team_ready, null);
  // Someone else saved since: nothing is marked.
  env.DB.raw.prepare("UPDATE applicants SET updated_at = ? WHERE id = ?").run("2026-11-16T09:00:00.000Z", id);
  const stale = await mark(env, id, true, seen.updated_at);
  assert.equal(stale.status, 409);
  assert.equal(ready(env, id), null);
  assert.deepEqual(events(env, id), []);
  for (const bad of [{ ready: "yes", updated_at: "x" }, { ready: true }]) {
    const r = await req(env, "POST", `/admin/applicants/${id}/team-ready`, bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
  }

  const ok = await mark(env, id, true, undefined, OTHER);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const a = applicant(env, id), r = ready(env, id);
  assert.ok(r.marked_at);
  assert.equal(r.marked_by, OTHER);
  assert.equal(r.revision, a.match_inputs_revision, "the mark does not make itself out of date");
  assert.notEqual(a.updated_at, seen.updated_at, "a new version, so an earlier answer is stale");
  assert.equal(ok.data.applicant.updated_at, a.updated_at);
  assert.deepEqual(ok.data.team_ready, { at: r.marked_at, by: OTHER, current: true });
  assert.deepEqual((await req(env, "GET", `/admin/applicants/${id}`)).data.team_ready, { at: r.marked_at, by: OTHER, current: true });
  assert.deepEqual(events(env, id), [{ actor: OTHER, type: "applicant.team_ready", data: { match_inputs_revision: a.match_inputs_revision } }]);
  // Marking it again from the same version is a stale answer; the search is not touched otherwise.
  assert.equal((await mark(env, id, true, seen.updated_at)).status, 409);
  assert.equal(a.stage, seen.stage);
  assert.equal(a.search_state, "active");
});

test("Done takes the mark off without closing the search, and an old answer cannot put it back", async () => {
  const env = env0(), id = await create(env);
  await mark(env, id, true);
  const marked = applicant(env, id);
  const done = await mark(env, id, false);
  assert.equal(done.status, 200, JSON.stringify(done.data));
  const a = applicant(env, id);
  assert.equal(ready(env, id), null);
  assert.deepEqual([a.search_state, a.stage, a.archived_at], ["active", marked.stage, null], "Done is not Resolved");
  assert.deepEqual(done.data.team_ready, null);
  assert.deepEqual(events(env, id).map(e => [e.type, e.data]),
    [["applicant.team_ready", { match_inputs_revision: marked.match_inputs_revision }], ["applicant.team_ready_done", null]]);
  // The marking's version is gone: a late repeat of it does nothing.
  assert.equal((await mark(env, id, true, marked.updated_at)).status, 409);
  assert.equal(ready(env, id), null);
  // Done on a search that is not marked says so and writes nothing.
  assert.equal((await mark(env, id, false)).status, 409);
  assert.equal(events(env, id).length, 2);
});

test("a stage change takes the mark off in the same save; other edits keep it", async () => {
  const env = env0(), id = await create(env);
  await mark(env, id, true);
  const owner = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant(env, id).updated_at, assigned_to: ADMIN });
  assert.equal(owner.status, 200);
  assert.ok(ready(env, id), "assigning someone keeps the mark");
  const staged = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant(env, id).updated_at, stage: "viewing" });
  assert.equal(staged.status, 200, JSON.stringify(staged.data));
  assert.equal(ready(env, id), null);
  assert.deepEqual(events(env, id).map(e => [e.type, e.data]).at(-1), ["applicant.team_ready_cleared", { reason: "stage_changed" }]);
  // A stage change on a search that was not marked writes no extra event.
  await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant(env, id).updated_at, stage: "offer" });
  assert.equal(events(env, id).length, 2);
});

test("a criteria change leaves the mark out of date until someone marks it again", async () => {
  const env = env0(), id = await create(env);
  await mark(env, id, true);
  const saved = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant(env, id).updated_at, budget_max: 2500,
    criteria_confirmation: { confirmed: true } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.ok(ready(env, id), "kept, so the team sees it needs another look");
  assert.equal((await req(env, "GET", `/admin/applicants/${id}`)).data.team_ready.current, false);
  assert.equal((await door(env)).data.counts.applicants_ready, 0);
  const again = await mark(env, id, true);
  assert.equal(again.status, 200);
  assert.equal(again.data.team_ready.current, true);
  assert.equal((await door(env)).data.counts.applicants_ready, 1);
});

test("only an active search can be marked", async () => {
  const env = env0(), id = await create(env);
  const resolved = await req(env, "POST", `/admin/applicants/${id}/search`, { state: "resolved", reason: "Found a home",
    updated_at: applicant(env, id).updated_at });
  assert.equal(resolved.status, 200);
  assert.equal((await mark(env, id, true)).status, 409);
  assert.equal(ready(env, id), null);
  assert.equal((await req(env, "POST", "/admin/applicants/9999/team-ready", { ready: true, updated_at: T0 })).status, 404);
});

test("the door counts the current marks of active searches, as a number and one fixed line", async () => {
  const env = env0();
  const nothing = await door(env);
  assert.equal(nothing.data.counts.applicants_ready, 0);
  assert.match(nothing.data.summary, /Nothing waiting\./);
  const a = await create(env), b = await create(env, { email: "b@private.je", phone: "07797 900322", operation: "buy",
    budget_max: 900000 }), c = await create(env, { email: "c@private.je", phone: "07797 900323" });
  await mark(env, a, true);
  let { data } = await door(env);
  assert.equal(data.counts.applicants_ready, 1);
  assert.match(data.summary, /^- 1 applicant with proposals ready for the team$/m);
  await mark(env, b, true);
  await mark(env, c, true);
  // A marked search resolved since is not counted.
  assert.equal((await req(env, "POST", `/admin/applicants/${c}/search`, { state: "resolved", reason: "Found a home",
    updated_at: applicant(env, c).updated_at })).status, 200);
  ({ data } = await door(env));
  assert.equal(data.counts.applicants_ready, 2);
  assert.match(data.summary, /^- 2 applicants with proposals ready for the team$/m);
  const text = JSON.stringify(data);
  for (const s of SECRETS) assert.ok(!text.includes(s), `status leaks ${s}`);
  for (const e of rows(env, "SELECT data FROM events WHERE type LIKE 'applicant.team_ready%'"))
    for (const s of SECRETS) assert.ok(!String(e.data).includes(s), `event leaks ${s}`);
});

test("marking needs a reviewed proposal: at least one proposed home shortlisted", async () => {
  const env = env0(), id = await create(env, {}, { shortlist: false });
  assert.equal(row(env, "SELECT status FROM matches WHERE applicant_id = ?", id).status, "found");
  const none = await mark(env, id, true);
  assert.equal(none.status, 409);
  assert.match(none.data.error, /Shortlist at least one proposed home/);
  assert.equal(ready(env, id), null);
  assert.deepEqual(events(env, id), []);
  // Rejected only is not a proposal for the team either.
  await review(env, id, "found", "rejected", { reject_reason: "price" });
  assert.equal((await mark(env, id, true)).status, 409);
  await review(env, id, "rejected", "found");
  await review(env, id, "found", "shortlisted");
  const ok = await mark(env, id, true);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.team_ready.current, true);
});

test("a proposal reviewed after the mark leaves it out of date until someone marks it again", async () => {
  const env = env0(), id = await create(env);
  await mark(env, id, true);
  assert.equal((await door(env)).data.counts.applicants_ready, 1);
  // Moving the shortlisted home back to Found and shortlisting it again: two review decisions after the mark.
  await review(env, id, "shortlisted", "found");
  assert.ok(ready(env, id), "kept, so the team sees it needs another look");
  assert.equal((await req(env, "GET", `/admin/applicants/${id}`)).data.team_ready.current, false);
  assert.equal((await door(env)).data.counts.applicants_ready, 0);
  // With nothing shortlisted it cannot be marked again; once shortlisted it can.
  assert.equal((await mark(env, id, true)).status, 409);
  await review(env, id, "found", "shortlisted");
  assert.equal((await req(env, "GET", `/admin/applicants/${id}`)).data.team_ready.current, false);
  assert.equal((await door(env)).data.counts.applicants_ready, 0);
  const again = await mark(env, id, true);
  assert.equal(again.status, 200);
  assert.equal(again.data.team_ready.current, true);
  assert.equal((await door(env)).data.counts.applicants_ready, 1);
});

test("switched off, a stage change still takes an earlier mark off, so switching on again shows none", async () => {
  const env = env0(), id = await create(env);
  await mark(env, id, true);
  delete env.AUT18_TEAM_READY;
  const staged = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant(env, id).updated_at, stage: "viewing" });
  assert.equal(staged.status, 200, JSON.stringify(staged.data));
  assert.equal(ready(env, id), null);
  assert.deepEqual(events(env, id).map(e => e.type), ["applicant.team_ready", "applicant.team_ready_cleared"]);
  env.AUT18_TEAM_READY = "1";
  assert.equal((await req(env, "GET", `/admin/applicants/${id}`)).data.team_ready, null);
  assert.equal((await door(env)).data.counts.applicants_ready, 0);
});
