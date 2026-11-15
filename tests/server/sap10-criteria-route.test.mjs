// SAP-10: the whole route of a change of criteria with AUT-19 switched on. Seeing a Widen alternative or taking it
// with "Use this" changes nothing saved; a direct save and a confirmed proposal go through one contract.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie } from "./helpers.mjs";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
const envOn = () => Object.assign(makeEnv(), { AUT19_CRITERIA_PROPOSALS_READY: "1" });
const req = async (env, method, path, body, who = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(who) });
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const all = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
let people = 0;
async function create(env) {
  const r = await req(env, "POST", "/admin/applicants", { name: "Sample Buyer", email: `buyer${++people}@example.test`, source: "phone",
    operation: "buy", pets: [{ kind: "none" }], budget_max: 900000,
    requirement_priorities: { version: 1, unknown: [], values: { budget: "must" } } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id;
}
// Everything the saved search is: its row, its contact's activity, its matches, its history and its proposals.
const saved = (env, id) => ({
  applicant: row(env, "SELECT * FROM applicants WHERE id = ?", id),
  activity: row(env, "SELECT c.last_activity_at, c.updated_at FROM contacts c JOIN applicants a ON a.contact_id = c.id WHERE a.id = ?", id),
  matches: all(env, "SELECT listing_id, status, checks FROM matches WHERE applicant_id = ? ORDER BY listing_id", id),
  events: all(env, "SELECT type, data FROM events WHERE entity_type = 'applicant' AND entity_id = ? ORDER BY id", String(id)),
  proposals: all(env, "SELECT * FROM criteria_proposals WHERE applicant_id = ?", id),
});
const lastEvent = (env, id) => {
  const e = row(env, "SELECT type, data FROM events WHERE entity_type = 'applicant' AND entity_id = ? ORDER BY id DESC LIMIT 1", String(id));
  return { type: e.type, data: JSON.parse(e.data) };
};

test("SAP-10: a Widen alternative and Use this leave the saved search and its activity untouched", async () => {
  const env = envOn();
  seedListing(env, { id: "HE-R001", matchable: 1, parish: "St Helier", sale_price: 950000 });
  const id = await create(env), before = saved(env, id);
  const d = (await req(env, "GET", `/admin/applicants/${id}`)).data;
  const budget = d.widen.find(w => w.key === "budget");
  assert.equal(budget.to, 990000);
  assert.equal(budget.added, 1);
  await req(env, "GET", `/admin/applicants/${id}`);
  assert.deepEqual(saved(env, id), before, "reading the alternatives writes nothing");
  // Use this only fills the form; sending it without the employee's confirmation is refused and writes nothing.
  const refused = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: before.applicant.updated_at, budget_max: budget.to });
  assert.equal(refused.status, 400);
  assert.ok(refused.data.fields.criteria_confirmation);
  assert.deepEqual(saved(env, id), before);
  assert.equal(before.applicant.search_state, "active");
});

test("SAP-10: a direct save and a confirmed proposal share the event, the version and the recalculation", async () => {
  const env = envOn();
  seedListing(env, { id: "HE-R001", matchable: 1, parish: "St Helier", sale_price: 950000 });
  const direct = await create(env), proposed = await create(env);
  const to = (await req(env, "GET", `/admin/applicants/${direct}`)).data.widen.find(w => w.key === "budget").to;

  const a0 = saved(env, direct);
  const put = await req(env, "PUT", `/admin/applicants/${direct}`, { updated_at: a0.applicant.updated_at, budget_max: to,
    criteria_confirmation: { confirmed: true } }, OTHER);
  assert.equal(put.status, 200, JSON.stringify(put.data));

  const b0 = saved(env, proposed);
  const p = await req(env, "POST", `/admin/applicants/${proposed}/criteria-proposals`, { changes: { budget_max: to }, note: "Call" });
  assert.equal(p.status, 201, JSON.stringify(p.data));
  const waiting = saved(env, proposed);
  assert.deepEqual([waiting.applicant, waiting.matches], [b0.applicant, b0.matches], "a waiting proposal changes nothing");
  const ok = await req(env, "POST", `/admin/applicants/${proposed}/criteria-proposals/${p.data.proposal.id}/confirm`,
    { updated_at: b0.applicant.updated_at }, OTHER);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));

  const a1 = saved(env, direct), b1 = saved(env, proposed), ea = lastEvent(env, direct), eb = lastEvent(env, proposed);
  // Same event, same before → after, same confirmation by whoever confirmed; the proposal only adds where it came from.
  assert.equal(ea.type, "applicant.updated");
  assert.equal(eb.type, ea.type);
  const { proposal, ...rest } = eb.data;
  assert.deepEqual(Object.keys(rest).sort(), Object.keys(ea.data).sort());
  assert.deepEqual([rest.before, rest.after], [ea.data.before, ea.data.after]);
  assert.deepEqual([ea.data.criteria_confirmation.by, rest.criteria_confirmation.by], [OTHER, OTHER]);
  assert.deepEqual(rest.criteria_confirmation.fields, ea.data.criteria_confirmation.fields);
  assert.equal(proposal.proposed_by, ADMIN);
  // Same version step, same recalculation, and the search stays active with its stage.
  for (const [x0, x1] of [[a0, a1], [b0, b1]]) {
    assert.equal(x1.applicant.match_inputs_revision, x0.applicant.match_inputs_revision + 1);
    assert.equal(x1.applicant.budget_max, to);
    assert.equal(x1.applicant.search_state, "active");
    assert.equal(x1.applicant.stage, x0.applicant.stage);
    assert.notEqual(x1.applicant.updated_at, x0.applicant.updated_at);
  }
  assert.deepEqual(a1.matches.map(m => [m.listing_id, m.status]), b1.matches.map(m => [m.listing_id, m.status]));
  assert.ok(a1.matches.some(m => m.listing_id === "HE-R001"));
});
