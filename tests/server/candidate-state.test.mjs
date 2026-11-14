// EST-13 (M06): evaluation, the employee's decision, availability and the enquiry are separate states of one candidate.
// Approving, clarifying, resolving a search and (later) confirming availability are different actions.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./listing-client.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { APPROVED, CLARIFICATION_APPROVED } from "../../server/routes/matches.js";
import { candidateState, unknownMusts } from "../../server/candidate-state.js";
import { extractFeatures } from "../../server/listing-features.js";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body, email = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(email) });

let contacts = 0;
// A tenant with three must-haves: up to £2,000 a month, two bedrooms, two parking spaces.
function seedApplicant(env, name) {
  const c = run(env, "INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    name, `est13-${++contacts}@example.test`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), operation: "rent", stage: "searching", source: "phone", budget_max: 2000,
    bedrooms_min: 2, parking_spaces: 2, pets: '[{"kind":"none"}]', created_at: T0, updated_at: T0,
    requirement_priorities: JSON.stringify({ version: 1, values: { budget: "must", bedrooms: "must", parking: "must" }, unknown: [] }) };
  const cols = Object.keys(a);
  return Number(run(env, `INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...Object.values(a)).lastInsertRowid);
}
// MET answers every must-have; ASK says nothing about parking.
const MET = "HE-R001", ASK = "HE-R002";
function seedHomes(env) {
  for (const [id, description] of [[MET, "Parking for two cars"], [ASK, ""]])
    seedListing(env, { id, operation: "rent", availability: "to_let", rent: 1800, rent_period: "month", sale_price: null, bedrooms: 2,
      bathrooms: 2, housing_category: "registered", matchable: 1, ...extractFeatures({ description }), parish: "St Helier" });
}
async function searching(env, name) {
  const id = seedApplicant(env, name);
  await recomputeForApplicant(env, id, "system");
  return id;
}
const matchId = (env, a, listing) => row(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = ?", a, listing).id;
// The cards of a search as its Matches tab gets them, by listing.
async function cards(env, a) {
  const out = {};
  for (const status of ["found", "shortlisted", "rejected"]) {
    const r = await req(env, "GET", `/admin/applicants/${a}/matches?status=${status}`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    for (const m of r.data.matches) out[m.listing.id] = m;
  }
  return out;
}
const shortlist = (env, id, email) => req(env, "PUT", `/admin/matches/${id}`, { status: "shortlisted", from: "found" }, email);
const clarify = (env, id, approved, email) => req(env, "PUT", `/admin/matches/${id}/clarification`, { approved }, email);
const listed = (env, id) => row(env, `SELECT availability, published, archived_at, matchable, updated_at,
  COALESCE((SELECT version FROM listing_match_inputs WHERE listing_id = listings.id), 0) AS version FROM listings WHERE id = ?`, id);
const search = (env, a) => row(env, "SELECT stage, search_state, archived_at, match_inputs_revision, first_reviewed_at FROM applicants WHERE id = ?", a);
const from = (env, where) => rows(env, `SELECT m.applicant_id, m.listing_id FROM matches m JOIN applicants a ON a.id = m.applicant_id
  WHERE ${where} ORDER BY m.id`);

test("each dimension is derived on its own, and availability and the enquiry have no writer yet", () => {
  const state = (status, requirements_status, extra) => candidateState({ status, requirements_status, ...extra });
  assert.deepEqual(state("found", "meets"),
    { evaluation: "complete", decision: "undecided", availability: "not_confirmed", enquiry: "not_sent" });
  assert.deepEqual(["pending", "alternative", "excluded"].map(s => state("found", s).evaluation), ["to_confirm", "not_met", "not_met"]);
  assert.equal(state("shortlisted", "pending", { decision_current: 1 }).decision, "approved");
  assert.equal(state("shortlisted", "meets", { decision_current: 0 }).decision, "approved_outdated");
  assert.equal(state("rejected", "meets", { decision_current: 1 }).decision, "rejected");
  // An approval, however current, says nothing of availability; a clarification leaves the decision alone.
  assert.equal(state("shortlisted", "meets", { decision_current: 1 }).availability, "not_confirmed");
  assert.deepEqual(state("found", "pending", { clarification: { by: ADMIN } }),
    { evaluation: "to_confirm", decision: "undecided", availability: "not_confirmed", enquiry: "clarification_approved" });
  assert.deepEqual(unknownMusts([{ key: "parking", priority: "must", result: "unknown" }, { key: "budget", priority: "must", result: "meets" },
    { key: "garden", priority: "preferred", result: "unknown" }, { key: "housing", result: "unknown" }]), ["parking"]);
});

test("approving changes the decision only: not the evaluation, the listing, its availability or the search's stage", async () => {
  const env = makeEnv();
  seedHomes(env);
  const ana = await searching(env, "Ana Le Gros");
  let c = await cards(env, ana);
  assert.deepEqual(c[MET].states, { evaluation: "complete", decision: "undecided", availability: "not_confirmed", enquiry: "not_sent" });
  assert.deepEqual(c[ASK].states, { evaluation: "to_confirm", decision: "undecided", availability: "not_confirmed", enquiry: "not_sent" });

  const before = [listed(env, MET), listed(env, ASK), search(env, ana)];
  // The payload cannot confirm availability or send anything.
  const r = await req(env, "PUT", `/admin/matches/${matchId(env, ana, MET)}`, { status: "shortlisted", from: "found",
    availability: "confirmed", enquiry: "sent", states: { availability: "confirmed", enquiry: "sent" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.match.states, { evaluation: "complete", decision: "approved", availability: "not_confirmed", enquiry: "not_sent" });
  assert.equal((await shortlist(env, matchId(env, ana, ASK))).status, 200);
  assert.deepEqual([listed(env, MET), listed(env, ASK)], before.slice(0, 2), "no listing is touched");
  assert.deepEqual({ ...search(env, ana), first_reviewed_at: null }, before[2], "the search keeps its stage and state");
  c = await cards(env, ana);
  assert.deepEqual(c[ASK].states, { evaluation: "to_confirm", decision: "approved", availability: "not_confirmed", enquiry: "not_sent" },
    "an approved match still has its must-have to confirm");

  // The listing goes under offer: that is its published status, shown as such, and it retires the approval.
  run(env, "UPDATE listings SET availability = 'under_offer' WHERE id = ?", MET);
  c = await cards(env, ana);
  assert.equal(c[MET].listing.availability, "under_offer");
  assert.equal(c[MET].status, "shortlisted");
  assert.deepEqual(c[MET].states, { evaluation: "complete", decision: "approved_outdated", availability: "not_confirmed", enquiry: "not_sent" });
});

test("a material change leaves the match Shortlisted but its approval outdated, until someone reviews it again", async () => {
  const env = makeEnv();
  seedHomes(env);
  const ana = await searching(env, "Ana Le Gros"), m = matchId(env, ana, MET);
  assert.equal((await shortlist(env, m)).status, 200);
  assert.equal((await cards(env, ana))[MET].states.decision, "approved");
  run(env, "UPDATE applicants SET budget_max = 1900 WHERE id = ?", ana);
  let card = (await cards(env, ana))[MET];
  assert.deepEqual([card.status, card.reviewed_by, card.states.decision], ["shortlisted", ADMIN, "approved_outdated"]);
  assert.deepEqual(from(env, APPROVED), [], "and it approves no enquiry");
  // Review again: back to Found, where a colleague decides on the search and the property as they are now.
  assert.equal((await req(env, "PUT", `/admin/matches/${m}`, { status: "found", from: "shortlisted" })).status, 200);
  assert.equal((await cards(env, ana))[MET].states.decision, "undecided");
  assert.equal((await shortlist(env, m, OTHER)).status, 200);
  card = (await cards(env, ana))[MET];
  assert.deepEqual([card.reviewed_by, card.states.decision], [OTHER, "approved"]);
  // A Shortlisted status with no recorded decision behind it (before BUS-15) asks for a review too.
  run(env, "DELETE FROM events WHERE type = 'match.reviewed'");
  assert.equal((await cards(env, ana))[MET].states.decision, "approved_outdated");
});

test("resolving or archiving one search, or rejecting a match, leaves the other searches' matches and decisions as they were", async () => {
  const env = makeEnv();
  seedHomes(env);
  const ana = await searching(env, "Ana Le Gros"), ben = await searching(env, "Ben Le Sueur");
  assert.equal((await shortlist(env, matchId(env, ana, MET))).status, 200);
  assert.equal((await shortlist(env, matchId(env, ben, MET), OTHER)).status, 200);
  assert.equal((await clarify(env, matchId(env, ben, ASK), true, OTHER)).status, 200);
  const bens = async () => [rows(env, "SELECT * FROM matches WHERE applicant_id = ? ORDER BY id", ben),
    Object.values(await cards(env, ben)).map(m => [m.listing.id, m.status, m.states, m.clarification]), search(env, ben)];
  const before = await bens(), homes = [listed(env, MET), listed(env, ASK)];
  const anas = () => rows(env, "SELECT id, listing_id, status, reviewed_by FROM matches WHERE applicant_id = ? ORDER BY id", ana);
  const kept = anas();
  assert.deepEqual(from(env, APPROVED), [{ applicant_id: ana, listing_id: MET }, { applicant_id: ben, listing_id: MET }]);

  // Ana rejects the other home: it is still proposed to Ben, still listed, and his clarification still stands.
  const r = await req(env, "PUT", `/admin/matches/${matchId(env, ana, ASK)}`, { status: "rejected", reject_reason: "area", from: "found" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.match.states.decision, "rejected");
  assert.deepEqual(await bens(), before);
  assert.deepEqual([listed(env, MET), listed(env, ASK)], homes);

  const resolved = await req(env, "POST", `/admin/applicants/${ana}/search`, { state: "resolved", reason: "Found a home elsewhere",
    updated_at: row(env, "SELECT updated_at FROM applicants WHERE id = ?", ana).updated_at });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.data));
  assert.deepEqual(await bens(), before, "Ben's matches, decisions and clarification survive Ana's resolution");
  assert.deepEqual(from(env, APPROVED), [{ applicant_id: ben, listing_id: MET }], "only the resolved search stops approving");
  assert.deepEqual(from(env, CLARIFICATION_APPROVED), [{ applicant_id: ben, listing_id: ASK }]);
  assert.deepEqual(anas().map(m => m.status), ["shortlisted", "rejected"], "and Ana's own history is kept");
  assert.deepEqual(anas().map(m => m.id), kept.map(m => m.id));
  // A closed search approves nothing: reopened, her Shortlisted match asks for a new review.
  assert.equal((await cards(env, ana))[MET].states.decision, "approved_outdated");

  assert.equal((await req(env, "POST", `/admin/applicants/${ana}/archive`)).status, 200);
  assert.deepEqual(await bens(), before, "nor does archiving her search touch them");
  assert.deepEqual([listed(env, MET), listed(env, ASK)], homes, "resolving a search says nothing about the listings");
});

test("a clarification is approved on its own: it needs an unknown must-have and a person, and approves no match", async () => {
  const env = makeEnv();
  seedHomes(env);
  const ana = await searching(env, "Ana Le Gros"), ask = matchId(env, ana, ASK), met = matchId(env, ana, MET);
  const events = () => rows(env, "SELECT actor, entity_id, data FROM events WHERE type = 'match.clarification' ORDER BY id")
    .map(e => ({ ...e, data: JSON.parse(e.data) }));
  assert.equal((await call(env, "PUT", `/admin/matches/${ask}/clarification`, { body: { approved: true } })).status, 401);
  assert.equal((await clarify(env, ask, "yes")).status, 400);
  assert.equal((await clarify(env, 9999, true)).status, 404);
  const none = await clarify(env, met, true);
  assert.deepEqual([none.status, none.data.error], [409, "No must-have is unknown for this property, so there is nothing to clarify."]);
  assert.equal((await clarify(env, ask, false)).status, 409, "nothing approved, nothing to withdraw");
  assert.deepEqual(events(), []);

  const before = [row(env, "SELECT * FROM matches WHERE id = ?", ask), search(env, ana), listed(env, ASK)];
  const r = await clarify(env, ask, true, OTHER);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual([r.data.match.status, r.data.match.states], ["found",
    { evaluation: "to_confirm", decision: "undecided", availability: "not_confirmed", enquiry: "clarification_approved" }]);
  assert.deepEqual([r.data.match.clarification.by, r.data.match.clarification.keys], [OTHER, ["parking"]]);
  assert.deepEqual([row(env, "SELECT * FROM matches WHERE id = ?", ask), search(env, ana), listed(env, ASK)], before,
    "the match stays undecided, the search and the listing untouched");
  assert.deepEqual(events(), [{ actor: OTHER, entity_id: String(ana),
    data: { listing_id: ASK, approved: true, keys: ["parking"], search_version: 0, listing_version: 0 } }]);
  assert.deepEqual(from(env, APPROVED), [], "no match is approved by it");
  assert.deepEqual(from(env, CLARIFICATION_APPROVED), [{ applicant_id: ana, listing_id: ASK }]);
  assert.equal((await cards(env, ana))[MET].states.enquiry, "not_sent", "one clarification per property");

  // Withdrawn by anyone on the team, then approved again.
  const w = await clarify(env, ask, false);
  assert.deepEqual([w.status, w.data.match.states.enquiry, w.data.match.clarification], [200, "not_sent", undefined]);
  assert.deepEqual(from(env, CLARIFICATION_APPROVED), []);
  assert.equal((await clarify(env, ask, true)).status, 200);
  // Shortlisting is another decision; the clarification is still waiting beside it.
  assert.equal((await shortlist(env, ask)).status, 200);
  assert.deepEqual((await cards(env, ana))[ASK].states,
    { evaluation: "to_confirm", decision: "approved", availability: "not_confirmed", enquiry: "clarification_approved" });
  // The search changes: what was approved to ask was about the version reviewed.
  run(env, "UPDATE applicants SET budget_max = 1900 WHERE id = ?", ana);
  assert.equal((await cards(env, ana))[ASK].states.enquiry, "not_sent");
  assert.deepEqual(from(env, CLARIFICATION_APPROVED), []);
});

test("a rejected match or a closed search has no clarification to approve", async () => {
  const env = makeEnv();
  seedHomes(env);
  const ana = await searching(env, "Ana Le Gros"), ask = matchId(env, ana, ASK);
  assert.equal((await clarify(env, ask, true)).status, 200);
  assert.equal((await req(env, "PUT", `/admin/matches/${ask}`, { status: "rejected", reject_reason: "other", from: "found" })).status, 200);
  assert.equal((await cards(env, ana))[ASK].states.enquiry, "not_sent");
  assert.deepEqual(from(env, CLARIFICATION_APPROVED), []);
  assert.equal((await clarify(env, ask, true)).status, 409);
  assert.equal((await req(env, "PUT", `/admin/matches/${ask}`, { status: "found", from: "rejected" })).status, 200);
  assert.equal((await req(env, "POST", `/admin/applicants/${ana}/search`, { state: "resolved", reason: "Confirmed by client",
    updated_at: row(env, "SELECT updated_at FROM applicants WHERE id = ?", ana).updated_at })).status, 200);
  const closed = await clarify(env, matchId(env, ana, ASK), true);
  assert.deepEqual([closed.status, closed.data.error], [409, "Reopen this search to review its matches."]);
});
