// EST-14: the rest of a match's journey (Interested, Viewing booked, Viewed, Offer, Agreed and the exits) projected
// from the facts that prove each step, and what the client said recorded by a person with its reason. The client's
// interest is the candidate's fifth state (M06). Nothing here changes criteria, the decision, availability or the search.
// Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, seedListing, call, adminCookie, T0, captured } from "./helpers.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { extractFeatures } from "../../server/listing-features.js";
import { matchJourney } from "../../server/match-journey.js";
import { candidateState } from "../../server/candidate-state.js";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body, email = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(email) });
const HOME = "HE-R001", OTHER_HOME = "HE-R002";

// ---- The projection: each step only from the fact that proves it ------------------------------------------------
const NOW = "2026-11-17T12:00:00.000Z";
const at = h => `2026-11-1${h}T10:00:00.000Z`;
const facts = (o = {}) => ({ operation: "buy", steps: [], answers: [], viewings: [], offers: [], tenancies: [], ...o });
const step = (revision, action, created_at, o = {}) => ({ revision, action, reason_code: action === "not_interested" ? "price" : null, note: null,
  created_at, created_by: ADMIN, ...o });
const sent = (o = {}) => ({ grant_id: 1, choice: null, reason: null, answered_at: null, sent_at: at(1), revoked_at: null, expires_at: null, ...o });
const viewing = (o = {}) => ({ id: 7, status: "requested", date: "2026-11-20", time: "10:00", outcome: null, outcome_note: null,
  feedback_at: null, created_at: at(1), updated_at: at(1), booked: 0, ...o });
const offer = (o = {}) => ({ id: 3, status: "pending", amount: 700000, counter_amount: null, created_at: at(2), updated_at: at(2),
  sale_id: null, sale_status: null, sale_at: null, sale_closed_at: null, ...o });

test("projection: no fact says nothing, never No; a link sent without an answer waits for the client", () => {
  const none = matchJourney(facts(), NOW);
  assert.equal(none.interest, "no_answer");
  assert.equal(none.stage, "none");
  assert.equal(none.revision, 0);
  assert.deepEqual(none.history, []);
  assert.equal(matchJourney(facts({ answers: [sent()] }), NOW).interest, "waiting");
  assert.equal(matchJourney(facts({ answers: [sent({ revoked_at: at(2) })] }), NOW).interest, "no_answer", "a revoked link waits for nobody");
  assert.equal(matchJourney(facts({ answers: [sent({ sent_at: null })] }), NOW).interest, "no_answer", "a dormant link waits for nobody");
  assert.equal(matchJourney(facts({ answers: [sent({ expires_at: at(2) })] }), NOW).interest, "no_answer");
});

test("projection: the latest word of the client wins, and the history keeps every one with its source", () => {
  const j = matchJourney(facts({ answers: [sent({ choice: "request_viewing", answered_at: at(2) })],
    steps: [step(1, "not_interested", at(3), { reason_code: "other", note: "Too far from school" })] }), NOW);
  assert.equal(j.interest, "not_interested");
  assert.equal(j.stage, "not_interested");
  assert.equal(j.revision, 1);
  assert.deepEqual(j.history.map(h => [h.kind, h.value ?? h.status]), [["step", "not_interested"], ["answer", "request_viewing"], ["sent", undefined]]);
  assert.equal(j.history[0].reason_code, "other");
  assert.equal(j.history[0].note, "Too far from school");
  assert.equal(j.history[0].by, ADMIN);
  // Asked to view, interested again later.
  const again = matchJourney(facts({ answers: [sent({ choice: "request_viewing", answered_at: at(2) })],
    steps: [step(1, "not_interested", at(3)), step(2, "interested", at(4))] }), NOW);
  assert.equal(again.interest, "interested");
  assert.equal(again.stage, "interested");
  assert.equal(matchJourney(facts({ answers: [sent({ choice: "call_me", answered_at: at(2) })] }), NOW).interest, "call_me");
  assert.equal(matchJourney(facts({ answers: [sent({ choice: "request_viewing", answered_at: at(2) })] }), NOW).stage, "interested",
    "asking for a viewing books none");
});

test("projection: viewed_requires_complete and old_proposal_no_booked", () => {
  const stage = v => matchJourney(facts({ viewings: [viewing(v)] }), NOW).stage;
  assert.equal(stage({}), "viewing_requested");
  assert.equal(stage({ status: "confirmed", booked: 0 }), "viewing_requested", "confirmed without every acceptance at its time is not booked");
  assert.equal(stage({ status: "confirmed", booked: 1 }), "viewing_booked");
  assert.equal(stage({ status: "completed", booked: 1 }), "viewed");
  assert.equal(stage({ status: "no_show", booked: 1 }), "none", "a no-show is never Viewed");
  assert.equal(stage({ status: "cancelled", booked: 1 }), "none");
  // VIS-04: the answer after the viewing is the client's word, with its date.
  const proceed = matchJourney(facts({ viewings: [viewing({ status: "completed", outcome: "proceed", feedback_at: at(5) })] }), NOW);
  assert.deepEqual([proceed.interest, proceed.stage], ["interested", "viewed"]);
  const no = matchJourney(facts({ viewings: [viewing({ status: "completed", outcome: "not_interested", outcome_note: "Dark rooms", feedback_at: at(5) })] }), NOW);
  assert.deepEqual([no.interest, no.stage], ["not_interested", "not_interested"]);
  assert.equal(no.history[0].note, "Dark rooms");
  assert.equal(matchJourney(facts({ viewings: [viewing({ status: "completed", outcome: "more_info", feedback_at: at(5) })] }), NOW).interest, "more_info");
});

test("projection: offers and agreements outrank a word, keep rejected prices and follow the sale", () => {
  const j = o => matchJourney(facts(o), NOW);
  assert.equal(j({ offers: [offer()] }).stage, "offer");
  assert.equal(j({ offers: [offer({ status: "countered", counter_amount: 720000 })] }).stage, "offer");
  const rejected = j({ offers: [offer({ status: "rejected", updated_at: at(3) })] });
  assert.equal(rejected.stage, "none", "a rejected offer is history, not a step in force");
  assert.deepEqual(rejected.history.map(h => [h.kind, h.status, h.amount]), [["offer", "rejected", 700000]]);
  const both = j({ offers: [offer({ status: "rejected", updated_at: at(3) }), offer({ id: 4, amount: 740000, created_at: at(4), updated_at: at(4) })] });
  assert.equal(both.stage, "offer");
  assert.deepEqual(both.history.map(h => [h.id, h.status]), [[4, "pending"], [3, "rejected"]]);
  assert.equal(j({ offers: [offer()], steps: [step(1, "not_interested", at(5))] }).stage, "offer", "an open offer stands over a word");
  const sale = s => j({ offers: [offer({ status: "accepted", sale_id: 9, sale_status: s, sale_at: at(4), sale_closed_at: s === "in_progress" ? null : at(5) })] });
  assert.equal(sale("in_progress").stage, "agreed");
  assert.equal(sale("completed").stage, "completed");
  assert.equal(sale("fallen_through").stage, "none");
  assert.deepEqual(sale("fallen_through").history.map(h => [h.kind, h.status]), [["sale", "fallen_through"], ["offer", "accepted"]]);
  // To let: the tenancy entered from this property and this search.
  const let_ = matchJourney(facts({ operation: "rent", tenancies: [{ tenancy_id: 5, rental_id: 2, created_at: at(6) }] }), NOW);
  assert.equal(let_.stage, "agreed");
  assert.deepEqual(let_.history[0], { kind: "tenancy", at: at(6), id: 5, rental_id: 2 });
});

test("review: VIS-04's answer is dated by feedback_at only, and editing a viewing later changes no word", () => {
  const no = step(1, "not_interested", at(5));
  const done = viewing({ status: "completed", outcome: "proceed", feedback_at: null, updated_at: at(2) });
  const before = matchJourney(facts({ steps: [no], viewings: [done] }), NOW);
  assert.deepEqual([before.interest, before.stage], ["not_interested", "not_interested"]);
  const edited = matchJourney(facts({ steps: [no], viewings: [{ ...done, updated_at: at(9) }] }), NOW);
  assert.deepEqual([edited.interest, edited.stage], ["not_interested", "not_interested"], "a notes edit is no answer");
  assert.equal(matchJourney(facts({ viewings: [done] }), NOW).interest, "no_answer", "a completion without feedback_at says nothing");
});

test("review: a link sent after the client's word keeps the step of that word and hides its date", () => {
  const j = matchJourney(facts({ steps: [step(1, "interested", at(1))], answers: [sent({ sent_at: at(3) })] }), NOW);
  assert.deepEqual([j.interest, j.stage], ["waiting", "interested"]);
  const no = matchJourney(facts({ steps: [step(1, "not_interested", at(1))], answers: [sent({ sent_at: at(3) })] }), NOW);
  assert.deepEqual([no.interest, no.stage], ["waiting", "not_interested"]);
});

test("review: a client's no, then a viewing linked or booked later: the newer fact wins the step, the word stays", () => {
  const no = step(1, "not_interested", at(1));
  const later = matchJourney(facts({ steps: [no], viewings: [viewing({ status: "confirmed", booked: 1, linked_at: at(4), booked_at: at(5) })] }), NOW);
  assert.deepEqual([later.interest, later.stage], ["not_interested", "viewing_booked"]);
  const earlier = matchJourney(facts({ steps: [step(1, "not_interested", at(6))],
    viewings: [viewing({ status: "confirmed", booked: 1, linked_at: at(4), booked_at: at(5) })] }), NOW);
  assert.equal(earlier.stage, "not_interested");
});

test("candidate state: the client's interest is a fifth dimension of its own, absent while EST-14 is off", () => {
  const base = { status: "shortlisted", requirements_status: "meets", decision_current: true };
  assert.equal("interest" in candidateState(base), false);
  const s = candidateState({ ...base, journey: matchJourney(facts({ steps: [step(1, "not_interested", at(3))] }), NOW) });
  assert.equal(s.interest, "not_interested");
  assert.equal(s.decision, "approved", "a client's no is not the employee's rejection");
});

// ---- The route: a person records what the client said ---------------------------------------------------------------
let people = 0;
async function searching(env, o = {}) {
  const c = run(env, "INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    `EST14 buyer ${++people}`, `est14-${people}@example.test`, T0, T0, T0);
  const id = Number(run(env, `INSERT INTO applicants (contact_id, operation, stage, source, budget_max, bedrooms_min, created_at, updated_at)
    VALUES (?, 'buy', 'searching', 'phone', 900000, 2, ?, ?)`, Number(c.lastInsertRowid), T0, T0).lastInsertRowid);
  await recomputeForApplicant(env, id, "system");
  return id;
}
function world(flags = { EST14_JOURNEY_READY: "1" }, skip = []) {
  const env = Object.assign(makeEnv({ skip }), flags);
  for (const id of [HOME, OTHER_HOME]) seedListing(env, { id, title: `Fixture ${id}`, bedrooms: 3, matchable: 1, parish: "St Saviour",
    ...extractFeatures({ description: "" }) });
  return env;
}
const matchOf = (env, a, listing = HOME) => row(env, "SELECT * FROM matches WHERE applicant_id = ? AND listing_id = ?", a, listing);
const shortlist = async (env, a, listing = HOME) =>
  assert.equal((await req(env, "PUT", `/admin/matches/${matchOf(env, a, listing).id}`, { status: "shortlisted", from: "found" })).status, 200);
const record = (env, a, body, email) => req(env, "POST", `/admin/matches/${matchOf(env, a).id}/journey`,
  { listing_id: HOME, expected_revision: 0, ...body }, email);
const cards = async (env, a, status = "shortlisted") => (await req(env, "GET", `/admin/applicants/${a}/matches?status=${status}`)).data.matches;

test("off, or on before 0116: no route, the same cards and the same SQL", async t => {
  const outputs = [];
  for (const [flags, skip] of [[{}, []], [{ EST14_JOURNEY_READY: "0" }, []], [{ EST14_JOURNEY_READY: "1" }, [116]]]) {
    t.mock.timers.reset();
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(NOW) });
    people = 0;
    const env = world(flags, skip), a = await searching(env);
    await shortlist(env, a);
    assert.equal((await record(env, a, { action: "interested" })).status, 404);
    const seen = captured(env, /./);
    const list = await cards(env, a), listing = (await req(env, "GET", `/admin/listings/${HOME}`)).data;
    assert.equal("journey" in list[0], false);
    assert.equal("interest" in list[0].states, false);
    assert.equal("interest" in listing.matched_applicants[0].states, false);
    outputs.push({ list, matched: listing.matched_applicants, sql: seen.map(s => s.sql).filter(s => !/sqlite_master|match_journey/.test(s)) });
  }
  assert.deepEqual(outputs[1].list, outputs[0].list);
  assert.deepEqual(outputs[1].sql, outputs[0].sql, "switched off: not one query more");
  assert.deepEqual(outputs[2].list, outputs[0].list, "on before the migration: as off");
  assert.deepEqual(outputs[2].matched, outputs[0].matched);
  assert.match(readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8"), /^EST14_JOURNEY_READY = "1"$/m);
});

test("decline_reason: a client's no needs a reason, other needs a note, and the note never goes to the event", async () => {
  const env = world(), a = await searching(env);
  await shortlist(env, a);
  for (const bad of [{ action: "not_interested" }, { action: "not_interested", reason_code: "colour" },
    { action: "not_interested", reason_code: "other" }, { action: "not_interested", reason_code: "price", note: "x".repeat(301) },
    { action: "interested", reason_code: "price" }, { action: "offer" }, { action: "viewed" }, { action: "agreed" },
    { action: "interested", expected_revision: -1 }, { action: "interested", listing_id: 5 }]) {
    const r = await record(env, a, bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM match_journey_steps").n, 0);
  const r = await record(env, a, { action: "not_interested", reason_code: "other", note: "Private: too far from the school" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.journey.interest, "not_interested");
  assert.equal(r.data.journey.revision, 1);
  const [e] = rows(env, "SELECT * FROM events WHERE type = 'match.interest_changed'");
  assert.equal(e.entity_type, "applicant");
  assert.equal(e.entity_id, String(a));
  assert.equal(e.actor, ADMIN);
  assert.deepEqual(JSON.parse(e.data), { listing_id: HOME, match_id: matchOf(env, a).id, action: "not_interested", reason_code: "other",
    revision: 1, search_version: row(env, "SELECT match_inputs_revision AS v FROM applicants WHERE id = ?", a).v });
  assert.equal(e.data.includes("school"), false);
  assert.throws(() => run(env, "UPDATE match_journey_steps SET action = 'interested'"), /cannot be changed/);
});

test("client_decline_not_unavailable and score_no_interest: a client's no changes no criteria, decision, score or availability", async () => {
  const env = world(), a = await searching(env), b = await searching(env);
  await shortlist(env, a);
  await shortlist(env, b);
  const before = { match: matchOf(env, a), other: matchOf(env, b), listing: row(env, "SELECT * FROM listings WHERE id = ?", HOME),
    search: row(env, "SELECT * FROM applicants WHERE id = ?", a) };
  assert.equal((await record(env, a, { action: "not_interested", reason_code: "price" })).status, 200);
  assert.deepEqual(matchOf(env, a), before.match);
  assert.deepEqual(matchOf(env, b), before.other);
  assert.deepEqual(row(env, "SELECT * FROM listings WHERE id = ?", HOME), before.listing);
  assert.deepEqual(row(env, "SELECT * FROM applicants WHERE id = ?", a), before.search);
  // The card: still shortlisted, its client says no with the reason; the other search's card says nothing of it.
  const [mine] = await cards(env, a), [theirs] = await cards(env, b);
  assert.equal(mine.status, "shortlisted");
  assert.equal(mine.states.decision, "approved");
  assert.equal(mine.states.interest, "not_interested");
  assert.equal(mine.journey.history[0].reason_code, "price");
  assert.equal(theirs.states.interest, "no_answer", "different_search_separate");
  assert.equal(theirs.journey.revision, 0);
  // BUS-18: the property's Matched applicants show each search's own interest.
  const matched = (await req(env, "GET", `/admin/listings/${HOME}`)).data.matched_applicants;
  assert.deepEqual(matched.map(m => [m.applicant_id, m.states.interest]).sort(), [[a, "not_interested"], [b, "no_answer"]]);
});

test("wrong_episode_no_transition: another property, a stale revision or a closed search writes nothing", async () => {
  const env = world(), a = await searching(env);
  await shortlist(env, a);
  assert.equal((await record(env, a, { action: "interested", listing_id: OTHER_HOME })).status, 409);
  assert.equal((await req(env, "POST", "/admin/matches/999999/journey", { action: "interested", listing_id: HOME, expected_revision: 0 })).status, 404);
  assert.equal((await record(env, a, { action: "interested" })).status, 200);
  const stale = await record(env, a, { action: "not_interested", reason_code: "size" }, OTHER);
  assert.equal(stale.status, 409, "someone recorded meanwhile");
  // Two people at once from the same revision: one is recorded, the other is told to reload.
  const both = await Promise.all([record(env, a, { action: "interested", expected_revision: 1 }),
    record(env, a, { action: "not_interested", reason_code: "area", expected_revision: 1 }, OTHER)]);
  assert.deepEqual(both.map(r => r.status).sort(), [200, 409]);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM match_journey_steps").n, 2);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'match.interest_changed'").n, 2);
  // A search needing review or archived records nothing new.
  run(env, "UPDATE applicants SET search_state = 'needs_review' WHERE id = ?", a);
  assert.equal((await record(env, a, { action: "interested", expected_revision: 2 })).status, 409);
  run(env, "UPDATE applicants SET search_state = 'active', archived_at = ? WHERE id = ?", T0, a);
  assert.equal((await record(env, a, { action: "interested", expected_revision: 2 })).status, 409);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM match_journey_steps").n, 2);
  // Retention: deleting the search deletes its steps.
  assert.deepEqual(rows(env, "SELECT \"table\", on_delete FROM pragma_foreign_key_list('match_journey_steps')"),
    [{ table: "applicants", on_delete: "CASCADE" }]);
});

test("review: once recorded, a journey that cannot be read now answers null, never 500", async () => {
  const env = world({ EST14_JOURNEY_READY: "1", AGE12_PRESENTATIONS_READY: "1" }), a = await searching(env);
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = stmts => stmts.some(s => /presentation_options/.test(s.sql)) ? Promise.reject(new Error("no such table: presentation_options")) : batch(stmts);
  const r = await record(env, a, { action: "interested" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.journey, null);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM match_journey_steps").n, 1);
});

test("history outlives a recompute: the steps belong to the search and the property, not to one match row", async () => {
  const env = world(), a = await searching(env);
  assert.equal((await record(env, a, { action: "interested" })).status, 200);
  const first = matchOf(env, a).id;
  run(env, "DELETE FROM matches WHERE id = ?", first);
  await recomputeForApplicant(env, a, "system");
  const [card] = await cards(env, a, "found");
  assert.notEqual(card.id, first);
  assert.equal(card.states.interest, "interested");
  assert.equal(card.journey.history[0].match_id, first, "the step names the card it was recorded on");
});
