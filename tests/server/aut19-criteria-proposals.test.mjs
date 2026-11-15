// AUT-19: a dictated change to a search's criteria waits as a proposal; nothing changes until an employee confirms it.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { proposeCriteria } from "../../server/routes/applicants.js";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
const ON = { AUT19_CRITERIA_PROPOSALS_READY: "1" };
const envOn = schema => Object.assign(makeEnv(schema), ON);
const req = async (env, method, path, body, who = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(who) });
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args);
const PRIORITIES = { version: 1, values: { parking: "must", budget: "must" }, unknown: [] };
async function create(env, o = {}) {
  const r = await req(env, "POST", "/admin/applicants", { name: "Jane Le Brocq", email: "jane@example.je", phone: "07797 123456",
    source: "phone", operation: "rent", budget_max: 2000, bedrooms_min: 2, parking_spaces: 1, requirement_priorities: PRIORITIES, ...o });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  env.DB.raw.prepare("UPDATE applicants SET updated_at = ? WHERE id = ?").run(T0, r.data.id);
  return r.data.id;
}
const applicant = (env, id) => row(env, "SELECT * FROM applicants WHERE id = ?", id);
const detail = async (env, id) => (await req(env, "GET", `/admin/applicants/${id}`)).data;
const propose = (env, id, changes, note, who) => req(env, "POST", `/admin/applicants/${id}/criteria-proposals`, { changes, note }, who);
const decide = (env, id, pid, action, who, updated_at = applicant(env, id).updated_at) =>
  req(env, "POST", `/admin/applicants/${id}/criteria-proposals/${pid}/${action}`, action === "confirm" ? { updated_at } : undefined, who);
const notices = env => rows(env, "SELECT task_key, title, action_required, resolved_at FROM notifications WHERE task_key LIKE 'work:dictation:%'")
  .map(n => ({ ...n }));
// Each stored match with how it meets the two must-haves, as "priority:result".
const matches = (env, id) => rows(env, "SELECT id, listing_id, checks FROM matches WHERE applicant_id = ? ORDER BY id", id).map(m => ({ id: m.id,
  listing: m.listing_id, ...Object.fromEntries(JSON.parse(m.checks).filter(c => ["parking", "budget"].includes(c.key)).map(c => [c.key, `${c.priority}:${c.result}`])) }));
// A home to let above the stored budget and within the proposed one; its parking is not recorded.
const rental = env => seedListing(env, { id: "HE-R002", matchable: 1, operation: "rent", availability: "to_let", sale_price: null,
  rent: 2400, rent_period: "month", bedrooms: 2 });

test("switched off, or without the migration, nothing is offered and saving works as before", async () => {
  for (const env of [makeEnv(), makeEnv({ through: 71 }), envOn({ through: 71 })]) {
    const id = await create(env);
    assert.equal("criteria_proposal" in await detail(env, id), false);
    const listed = (await req(env, "GET", "/admin/applicants")).data.applicants.find(a => a.id === id);
    assert.equal("criteria_proposal" in listed, false);
    const saved = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: T0, budget_max: 2100, criteria_confirmation: { confirmed: true } });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
  }
  const env = makeEnv(), id = await create(env);
  assert.equal((await propose(env, id, { budget_max: 2500 })).status, 404);
  assert.equal((await decide(env, id, 1, "confirm")).status, 404);
  assert.equal((await decide(env, id, 1, "discard")).status, 404);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM criteria_proposals").n, 0);
});

test("a proposal changes neither the search nor its matches until it is confirmed", async () => {
  const env = envOn();
  rental(env);
  const id = await create(env), before = applicant(env, id), found = matches(env, id);
  assert.equal((await detail(env, id)).criteria_proposal, null);
  const r = await propose(env, id, { budget_max: 2500 }, "  Call with client 14 Nov ");
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.deepEqual(applicant(env, id), before);
  assert.deepEqual(matches(env, id), found);
  const p = (await detail(env, id)).criteria_proposal;
  assert.deepEqual({ ...p, id: null, proposed_at: null }, { id: null, source: "staff", note: "Call with client 14 Nov", proposed_by: ADMIN,
    proposed_at: null, stale: false, changes: { budget_max: 2500 }, before: { budget_max: 2000 }, after: { budget_max: 2500 } });
  assert.equal((await req(env, "GET", "/admin/applicants")).data.applicants.find(a => a.id === id).criteria_proposal, true);
  // The history names the fields, never their values or the note; the Inbox has its open task.
  const event = row(env, "SELECT actor, data FROM events WHERE type = 'applicant.criteria_proposed'");
  assert.deepEqual({ actor: event.actor, data: JSON.parse(event.data) }, { actor: ADMIN, data: { fields: ["budget_max"], source: "staff" } });
  assert.deepEqual(notices(env), [{ task_key: `work:dictation:applicant:${id}:criteria-proposal`, title: "Confirm proposed criteria changes",
    action_required: 1, resolved_at: null }]);
  const [task] = (await req(env, "GET", "/admin/notifications?box=action&category=task")).data.notifications;
  assert.deepEqual([task.title, task.context_label, task.link], ["Confirm proposed criteria changes", "Jane Le Brocq", `#/applicants/${id}`]);
});

test("confirming applies exactly the proposed fields once, keeps every other must-have and recalculates without duplicates", async () => {
  const env = envOn();
  rental(env);
  const id = await create(env), before = applicant(env, id);
  const found = { id: 1, listing: "HE-R002", parking: "must:unknown", budget: "must:fails" };
  assert.deepEqual(matches(env, id), [found]);
  const pid = (await propose(env, id, { budget_max: 2500 }, "Call with client")).data.proposal.id;
  const [a, b] = await Promise.all([decide(env, id, pid, "confirm", OTHER), decide(env, id, pid, "confirm", OTHER)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const after = applicant(env, id);
  assert.equal(after.budget_max, 2500);
  for (const k of ["parking_spaces", "requirement_priorities", "bedrooms_min", "pets", "stage"]) assert.equal(after[k], before[k], k);
  assert.equal(after.match_inputs_revision, before.match_inputs_revision + 1);
  // The same match, evaluated again with the new budget: none added, parking still a must-have.
  assert.deepEqual(matches(env, id), [{ ...found, budget: "must:meets" }]);
  assert.equal((await decide(env, id, pid, "confirm", OTHER)).status, 409);
  assert.deepEqual(matches(env, id), [{ ...found, budget: "must:meets" }]);
  // Who proposed, who confirmed, when and on which version.
  const updated = rows(env, "SELECT actor, data FROM events WHERE type = 'applicant.updated'");
  assert.equal(updated.length, 1);
  const data = JSON.parse(updated[0].data), saved = row(env, "SELECT * FROM criteria_proposals WHERE id = ?", pid);
  assert.deepEqual(data.before, { budget_max: 2000 });
  assert.deepEqual(data.after, { budget_max: 2500 });
  assert.deepEqual(data.criteria_confirmation, { by: OTHER, at: after.updated_at, fields: ["budget_max"] });
  assert.deepEqual(data.proposal, { id: pid, source: "staff", proposed_by: ADMIN, proposed_at: saved.proposed_at });
  assert.deepEqual({ status: saved.status, decided_by: saved.decided_by, decided_at: saved.decided_at, base: saved.base_revision, note: saved.note },
    { status: "confirmed", decided_by: OTHER, decided_at: after.updated_at, base: before.match_inputs_revision, note: "Call with client" });
  assert.equal((await detail(env, id)).criteria_proposal, null);
  assert.equal(notices(env).length, 1);
  assert.ok(notices(env)[0].resolved_at);
  // A later proposal reopens the same task.
  assert.equal((await propose(env, id, { bedrooms_min: 1 })).status, 201);
  assert.deepEqual(notices(env).map(n => n.resolved_at), [null]);
});

test("a search edited in between refuses the confirmation; the proposal can only be redone or discarded", async () => {
  const env = envOn(), id = await create(env);
  const pid = (await propose(env, id, { budget_max: 2500 })).data.proposal.id;
  // A stage change is not a change of criteria: only the version the confirmer saw must be current.
  assert.equal((await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: T0, stage: "searching" })).status, 200);
  assert.equal((await decide(env, id, pid, "confirm", OTHER, T0)).status, 409);
  assert.equal((await detail(env, id)).criteria_proposal.stale, false);
  // A colleague changes parking: the proposal no longer applies to the search it was made on.
  const edited = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant(env, id).updated_at, parking_spaces: 2,
    criteria_confirmation: { confirmed: true } }, OTHER);
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  const before = applicant(env, id);
  const refused = await decide(env, id, pid, "confirm");
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /changed after this proposal/);
  assert.deepEqual(applicant(env, id), before);
  assert.equal((await detail(env, id)).criteria_proposal.stale, true);
  assert.equal(notices(env)[0].resolved_at, null);
  // Discarding closes it and its task, and says so in the history without values.
  assert.equal((await decide(env, id, pid, "discard", OTHER)).status, 200);
  assert.equal((await decide(env, id, pid, "discard", OTHER)).status, 409);
  assert.deepEqual(applicant(env, id), before);
  const saved = row(env, "SELECT status, decided_by FROM criteria_proposals WHERE id = ?", pid);
  assert.deepEqual({ ...saved }, { status: "discarded", decided_by: OTHER });
  const event = row(env, "SELECT actor, data FROM events WHERE type = 'applicant.criteria_proposal_discarded'");
  assert.deepEqual({ actor: event.actor, data: JSON.parse(event.data) }, { actor: OTHER, data: { fields: ["budget_max"] } });
  assert.ok(notices(env)[0].resolved_at);
  assert.equal((await detail(env, id)).criteria_proposal, null);
});

test("a proposal discarded while it is being confirmed saves nothing", async () => {
  const env = envOn(), id = await create(env), before = applicant(env, id);
  const pid = (await propose(env, id, { budget_max: 2500 })).data.proposal.id;
  // The colleague's discard lands between the confirmation's read and its write.
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = stmts => {
    env.DB.batch = batch;
    env.DB.raw.prepare("UPDATE criteria_proposals SET status = 'discarded' WHERE id = ?").run(pid);
    return batch(stmts);
  };
  const refused = await decide(env, id, pid, "confirm");
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /already discarded/);
  assert.deepEqual(applicant(env, id), before);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'applicant.updated'").n, 0);
});

test("a field the matching does not read is still compared with what was shown", async () => {
  const env = envOn(), id = await create(env, { household_adults: 2 });
  const pid = (await propose(env, id, { household_adults: 3 })).data.proposal.id;
  env.DB.raw.prepare("UPDATE applicants SET household_adults = 1 WHERE id = ?").run(id);
  assert.equal((await detail(env, id)).criteria_proposal.stale, true);
  assert.equal((await decide(env, id, pid, "confirm")).status, 409);
  assert.equal(applicant(env, id).household_adults, 1);
});

test("only valid criteria changes can be proposed", async () => {
  const env = envOn(), id = await create(env), before = applicant(env, id);
  for (const [changes, note] of [[{ stage: "viewing" }], [{ name: "Someone else" }], [{ search_category: "commercial" }], [{ budget_max: 2000 }],
    [{}], [[]], [{ budget_max: 2500 }, 7]])
    assert.equal((await propose(env, id, changes, note)).status, 400, JSON.stringify(changes));
  const invalid = await propose(env, id, { budget_max: 5, parking_spaces: 9 });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.data.fields.budget_max && invalid.data.fields.parking_spaces);
  assert.ok((await propose(env, id, { budget_max: 2500 }, "x".repeat(201))).data.fields.note);
  assert.equal((await propose(env, 9999, { budget_max: 2500 })).status, 404);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM criteria_proposals").n, 0);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events WHERE type LIKE 'applicant.criteria%'").n, 0);
  assert.deepEqual(applicant(env, id), before);
  // A proposal belongs to its search, and an archived search is read only.
  const other = await create(env, { email: "other@example.je", phone: "07797 654321" });
  const pid = (await propose(env, id, { budget_max: 2500 })).data.proposal.id;
  assert.equal((await decide(env, other, pid, "confirm")).status, 404);
  assert.equal((await decide(env, other, pid, "discard")).status, 404);
  assert.equal((await decide(env, id, pid, "confirm", ADMIN, null)).status, 400);
  env.DB.raw.prepare("UPDATE applicants SET archived_at = ? WHERE id = ?").run(T0, other);
  assert.equal((await propose(env, other, { budget_max: 2500 })).status, 409);
});

test("a new proposal replaces the one waiting, and a draft from Hermes enters by the same door", async () => {
  const env = envOn(), id = await create(env);
  const first = (await propose(env, id, { budget_max: 2500 })).data.proposal.id;
  const draft = await proposeCriteria(env, id, { changes: { budget_max: 2600, parking_spaces: 2 }, note: "Voice note" }, "hermes", "hermes");
  assert.equal(draft.status, 201);
  assert.deepEqual(rows(env, "SELECT id, status, decided_by FROM criteria_proposals ORDER BY id").map(p => ({ ...p })),
    [{ id: first, status: "discarded", decided_by: "hermes" }, { id: first + 1, status: "pending", decided_by: null }]);
  const p = (await detail(env, id)).criteria_proposal;
  assert.deepEqual([p.source, p.proposed_by, p.before, p.after], ["hermes", "hermes", { budget_max: 2000, parking_spaces: 1 }, { budget_max: 2600, parking_spaces: 2 }]);
  assert.deepEqual(notices(env).map(n => n.resolved_at), [null]);
  // Only a signed-in employee confirms it.
  assert.equal((await call(env, "POST", `/admin/applicants/${id}/criteria-proposals/${p.id}/confirm`, { body: { updated_at: T0 } })).status, 401);
  assert.equal((await decide(env, id, p.id, "confirm", OTHER)).status, 200);
  const data = JSON.parse(row(env, "SELECT data FROM events WHERE type = 'applicant.updated'").data);
  assert.equal(data.criteria_confirmation.by, OTHER);
  assert.equal(data.proposal.proposed_by, "hermes");
  assert.deepEqual([applicant(env, id).budget_max, applicant(env, id).parking_spaces], [2600, 2]);
});

test("a proposal is deleted with its search", async () => {
  const env = envOn(), id = await create(env);
  await propose(env, id, { budget_max: 2500 }, "Call with client");
  env.DB.raw.prepare("DELETE FROM applicants WHERE id = ?").run(id);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM criteria_proposals").n, 0);
});
