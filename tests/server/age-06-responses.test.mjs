// AGE-06 (M06): a person records what the advertiser answered to an enquiry that was sent. Available or not available
// becomes a confirmation of EST-16 (source and provenance its own), which EST-15 propagates; an answer that says
// nothing useful keeps the enquiry waiting; one household's own conditions stay on its match. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./listing-client.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { candidateState } from "../../server/candidate-state.js";
import { candidateCounts } from "../../server/match-pages.js";
import { extractFeatures } from "../../server/listing-features.js";
import { jerseyToday, plusDays } from "../../server/viewings.js";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
const HOME = "HE-R001", ASK = "HE-R002";
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body, email = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(email) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

function world({ ready = true, schema, est15 = true } = {}) {
  const env = makeEnv(schema);
  Object.assign(env, { AGE03_ENQUIRIES_READY: "1", EST16_AVAILABILITY_READY: "1" }, est15 && { EST15_UNAVAILABILITY_READY: "1" },
    ready && { AGE06_RESPONSES_READY: "1" });
  for (const [id, description] of [[HOME, "Parking for two cars"], [ASK, ""]])
    seedListing(env, { id, title: `Fixture home ${id}`, operation: "rent", availability: "to_let", rent: 1800, rent_period: "month", sale_price: null,
      bedrooms: 2, bathrooms: 2, housing_category: "registered", matchable: 1, ...extractFeatures({ description }), parish: "St Helier",
      location: "St Helier" });
  return env;
}
let people = 0;
async function searching(env, name) {
  const n = ++people;
  const c = run(env, "INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    name, `age06-${n}@example.test`, `+4477009002${String(n).padStart(2, "0")}`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), operation: "rent", stage: "searching", source: "phone", budget_max: 2000, bedrooms_min: 2,
    parking_spaces: 2, pets: '[{"kind":"none"}]', household_adults: 2, household_children: 1, household_total: 3, created_at: T0, updated_at: T0,
    requirement_priorities: JSON.stringify({ version: 1, values: { budget: "must", bedrooms: "must", parking: "must" }, unknown: [] }) };
  const cols = Object.keys(a);
  const id = Number(run(env, `INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...Object.values(a)).lastInsertRowid);
  await recomputeForApplicant(env, id, "system");
  return id;
}
const matchId = (env, a, listing = HOME) => row(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = ?", a, listing).id;
const shortlist = async (env, a, listing = HOME) =>
  ok(await req(env, "PUT", `/admin/matches/${matchId(env, a, listing)}`, { status: "shortlisted", from: "found" })).match.id;
const advertiser = async (env, kind = "agency") => ok(await req(env, "POST", "/admin/advertisers", { name: "Fixture Agency", kind, channels: [],
  source_ids: [], listing_ids: [HOME, ASK], commission: "", photo_permission: "",
  contacts: [{ name: "Agency Desk", email: "desk@agency.example.test", phones: [{ label: "Office", number: "01534 000000" }] }] }), 201).advertiser.id;
const prepare = async (env, match, agency, kind = "general") => (await req(env, "POST", `/admin/matches/${match}/consultation`,
  { operation_id: randomUUID(), kind, advertiser_id: agency }));
const SENT_AT = new Date(Date.now() - 3 * 3600e3).toISOString(), LATER = new Date(Date.now() - 3600e3).toISOString();
// Prepared four hours ago (a fixture's shortcut), sent three hours ago, answered an hour ago.
const markSent = async (env, id) => {
  run(env, "UPDATE consultations SET prepared_at = ? WHERE id = ?", new Date(Date.now() - 4 * 3600e3).toISOString(), id);
  return ok(await req(env, "POST", `/admin/consultations/${id}/manual-send`, { operation_id: randomUUID(), revision: 1,
    sent_at: SENT_AT, via: "email", evidence_ref: "Sent items FIXTURE" }));
};
const answer = (o = {}) => ({ operation_id: randomUUID(), revision: 1, outcome: "available", answered_at: LATER, via: "phone",
  answered_by: "Desk receptionist", scope: "property", evidence_ref: "Call log FIXTURE-EVIDENCE", ...o });
const respond = (env, id, o, email) => req(env, "POST", `/admin/consultations/${id}/response`, answer(o), email);
// A sent enquiry shared by the shortlisted matches of these searches.
async function sentEnquiry(env, names = ["Ana Le Gros"], kind = "advertiser") {
  const agency = await advertiser(env, kind === "advertiser" ? "agency" : kind), families = [], ms = [];
  for (const name of names) families.push(await searching(env, name));
  for (const a of families) ms.push(await shortlist(env, a));
  const id = ok(await prepare(env, ms[0], agency), 201).consultation.id;
  for (const m of ms.slice(1)) ok(await prepare(env, m, agency));
  await markSent(env, id);
  return { agency, families, ms, id };
}
async function card(env, a, listing = HOME) {
  for (const status of ["found", "shortlisted", "rejected"]) {
    const found = ok(await req(env, "GET", `/admin/applicants/${a}/matches?status=${status}`)).matches.find(m => m.listing.id === listing);
    if (found) return found;
  }
}
const waiting = async (env, a) => (await candidateCounts(env, a))(a).waiting_agent;
const stored = env => JSON.stringify([rows(env, "SELECT * FROM consultations"), rows(env, "SELECT * FROM consultation_matches"),
  rows(env, "SELECT * FROM availability_confirmations"), rows(env, "SELECT * FROM events"), rows(env, "SELECT * FROM notifications"),
  rows(env, "SELECT * FROM matches")]);
const tasks = env => rows(env, "SELECT task_key, title, resolved_at FROM notifications WHERE task_key LIKE 'consultation:%' ORDER BY id");

test("the card's enquiry state says what the advertiser answered", () => {
  const state = consultation => candidateState({ status: "shortlisted", requirements_status: "meets", decision_current: 1, consultation }).enquiry;
  assert.equal(state({ status: "sent" }), "sent_manually");
  assert.equal(state({ status: "awaiting_response", response_outcome: "no_answer" }), "awaiting_response");
  assert.equal(state({ status: "answered", response_outcome: "available" }), "answered_available");
  assert.equal(state({ status: "answered", response_outcome: "unavailable" }), "answered_unavailable");
  assert.equal(state({ status: "answered", response_outcome: "answered" }), "answered");
  assert.equal(state({ status: "answered" }), "answered", "switched off, the outcome is not read");
});

test("switched off, or on before migration 0082, nothing can be answered or cancelled and enquiries are as before", async () => {
  for (const [ready, schema] of [[false, {}], [true, { through: 81 }]]) {
    const env = world({ ready, schema }), { id, families: [ana] } = await sentEnquiry(env);
    const before = stored(env), view = ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`)).consultations[0];
    assert.equal("response" in view, false);
    assert.equal("can_answer" in view, false);
    assert.equal((await respond(env, id)).status, 404);
    assert.equal((await req(env, "POST", `/admin/consultations/${id}/cancel`, { revision: 1 })).status, 404);
    assert.equal(stored(env), before, "nothing is written");
    const c = await card(env, ana);
    assert.equal(c.states.enquiry, "sent_manually");
    assert.equal("response_outcome" in c.enquiry, false);
  }
});

test("an answer that says nothing useful keeps the enquiry waiting; a confirmed one answers it for every match without closing searches", async () => {
  const env = world(), { id, families, ms, agency } = await sentEnquiry(env, ["Ana Le Gros", "Ben Carter"]);
  assert.equal(await waiting(env, families[0]), 1);
  const view = ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`)).consultations[0];
  assert.deepEqual([view.can_answer, view.can_cancel, view.response], [true, false, null]);

  // An automatic reply: recorded, still waiting, nothing confirmed.
  const ack = ok(await respond(env, id, { outcome: "no_answer", scope: undefined, via: "email", answered_by: "Auto-reply" })).consultation;
  assert.deepEqual([ack.status, ack.response.outcome, ack.can_answer], ["awaiting_response", "no_answer", true]);
  assert.equal(rows(env, "SELECT 1 FROM availability_confirmations").length, 0);
  assert.equal(await waiting(env, families[0]), 1, "still in process");
  assert.equal((await card(env, families[0])).states.enquiry, "awaiting_response");
  // A new match still joins the enquiry while it waits.
  const cy = await searching(env, "Cy Hamon"), mc = await shortlist(env, cy);
  assert.equal(ok(await prepare(env, mc, agency)).consultation.id, id);

  // A call that confirms it: one confirmation of EST-16, from the agency, with the answer's own date, channel and evidence.
  const done = ok(await respond(env, id, { operation_id: randomUUID() }, OTHER)).consultation;
  assert.deepEqual([done.status, done.response.outcome, done.response.by, done.response.from, done.can_answer, done.blocked],
    ["answered", "available", OTHER, "Desk receptionist", false, null]);
  assert.deepEqual(rows(env, "SELECT listing_id, operation, status, confirmed_at, source, channel, evidence_ref, recorded_by FROM availability_confirmations"),
    [{ listing_id: HOME, operation: null, status: "available", confirmed_at: LATER, source: "agency", channel: "phone",
      evidence_ref: "Call log FIXTURE-EVIDENCE", recorded_by: OTHER }]);
  for (const a of [...families, cy]) {
    const c = await card(env, a);
    assert.deepEqual([c.states.enquiry, c.states.availability, c.states.decision], ["answered_available", "confirmed", "approved"]);
    assert.equal(await waiting(env, a), 0, "no longer in process");
  }
  assert.deepEqual(rows(env, "SELECT DISTINCT stage, search_state FROM applicants"), [{ stage: "searching", search_state: "active" }]);
  assert.deepEqual(rows(env, "SELECT DISTINCT status FROM matches WHERE listing_id = ?", HOME), [{ status: "shortlisted" }]);

  // Answered, it takes no new match: the next one starts another enquiry that reuses the availability confirmed.
  const dee = await searching(env, "Dee Le Brun"), md = await shortlist(env, dee);
  const offer = ok(await req(env, "GET", `/admin/matches/${md}/consultation`));
  assert.equal(offer.consultation, null);
  assert.equal(offer.availability.status, "available");
  const next = ok(await prepare(env, md, agency), 201).consultation;
  assert.notEqual(next.id, id);
  assert.equal(next.asks_availability, false);
  assert.match(next.text, /currently available/);
  const earlier = ok(await req(env, "GET", `/admin/matches/${ms[0]}/consultation`)).consultation;
  assert.deepEqual([earlier.id, earlier.joined], [next.id, false], "a match of the answered enquiry is offered the new one to join");
});

test("a not available answer propagates exactly as EST-15's confirmation of the same facts", async () => {
  const facts = { confirmed_at: LATER, channel: "phone", evidence_ref: "Call log FIXTURE-EVIDENCE", scope: "property", reason: "let" };
  const outcome = async byAnswer => {
    const env = world(), { id, families } = await sentEnquiry(env, ["Ana Le Gros"]);
    const found = await searching(env, "Ben Carter");
    const tomorrow = plusDays(jerseyToday(), 1);
    run(env, `INSERT INTO viewing_requests (listing_id, kind, date, time, end_time, name, email, status, created_at)
      VALUES (?, 'In person', ?, '10:00', '10:30', 'Client One', 'client-1@example.test', 'confirmed', ?)`, HOME, tomorrow, T0);
    if (byAnswer) ok(await respond(env, id, { outcome: "unavailable", answered_at: facts.confirmed_at, reason: "let" }));
    else ok(await req(env, "POST", `/admin/listings/${HOME}/availability`, { status: "unavailable", source: "agency", ...facts }), 201);
    return { env, families, found };
  };
  const [a, b] = [await outcome(true), await outcome(false)];
  const facts_of = ({ env }) => JSON.stringify([
    rows(env, "SELECT listing_id, operation, status, confirmed_at, source, channel, evidence_ref, reason FROM availability_confirmations"),
    rows(env, "SELECT applicant_id, listing_id, status FROM matches ORDER BY id"),
    rows(env, `SELECT n.category, n.title, n.resolved_at IS NULL AS open FROM notifications n JOIN events e ON e.id = n.event_id
      WHERE e.type = 'viewing.property_unavailable'`),
    rows(env, "SELECT stage, search_state FROM applicants ORDER BY id")]);
  assert.equal(facts_of(a), facts_of(b));
  assert.equal(rows(a.env, "SELECT 1 FROM matches WHERE applicant_id = ? AND listing_id = ?", a.found, HOME).length, 0, "its Found proposal goes");
  assert.equal(rows(a.env, "SELECT 1 FROM notifications n JOIN events e ON e.id = n.event_id WHERE e.type = 'viewing.property_unavailable'").length, 1);
  const c = await card(a.env, a.families[0]);
  assert.deepEqual([c.states.enquiry, c.states.availability], ["answered_unavailable", "confirmed_unavailable"]);
  // Not available needs its reason, as EST-15 asks it.
  const env = world(), { id } = await sentEnquiry(env);
  const r = await respond(env, id, { outcome: "unavailable" });
  assert.equal(r.status, 400);
  assert.ok(r.data.fields.reason);
});

test("an answer is about the property; what it says about one household stays on that household's match", async () => {
  const env = world(), { id, families: [ana, ben], ms: [ma] } = await sentEnquiry(env, ["Ana Le Gros", "Ben Carter"]);
  const note = "Landlord accepts one small dog for this household";
  const done = ok(await respond(env, id, { case_notes: [{ match_id: ma, note }] })).consultation;
  assert.equal(done.status, "answered");
  const [cardA, cardB] = [await card(env, ana), await card(env, ben)];
  assert.equal(cardA.enquiry.response_note, note);
  assert.equal(cardB.enquiry.response_note ?? null, null, "never on another household's card");
  assert.equal(cardB.states.enquiry, "answered_available", "the general answer covers every match");
  // Nothing about the property, its events or its Inbox carries the note or any client.
  const property = JSON.stringify([ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`)), rows(env, "SELECT * FROM consultations"),
    rows(env, "SELECT * FROM availability_confirmations"), rows(env, "SELECT * FROM events WHERE type LIKE 'consultation.%'"),
    rows(env, "SELECT * FROM notifications WHERE task_key LIKE 'consultation:%'")]);
  for (const secret of [note, "dog", "Ana", "Le Gros", "Ben", "Carter", "age06-", "7700900"]) assert.ok(!property.includes(secret), `no ${secret}`);
  const events = JSON.stringify(rows(env, "SELECT data FROM events WHERE type = 'consultation.response_recorded'"));
  for (const text of ["Desk receptionist", "FIXTURE-EVIDENCE"]) assert.ok(!events.includes(text), `the event carries no ${text}`);
  // A note is only for a match of this enquiry that still counts.
  const env2 = world(), second = await sentEnquiry(env2, ["Cy Hamon"]), other = await searching(env2, "Dee Le Brun");
  const r = await respond(env2, second.id, { case_notes: [{ match_id: matchId(env2, other), note }] });
  assert.equal(r.status, 400);
  assert.ok(r.data.fields.case_notes);
  assert.equal(rows(env2, "SELECT 1 FROM availability_confirmations").length, 0, "nothing written");
});

test("an answer about one operation is about the operation the enquiry asked about, never the one the property offers later", async () => {
  // Scoped to the operation asked about (rent), it is recorded for rent.
  const env = world(), { id } = await sentEnquiry(env);
  ok(await respond(env, id, { outcome: "unavailable", reason: "let", scope: "operation" }));
  assert.deepEqual(rows(env, "SELECT operation, status FROM availability_confirmations"), [{ operation: "rent", status: "unavailable" }]);
  // The property is now offered for sale: an answer about the rent alone says nothing of the sale, so it is refused.
  for (const outcome of ["unavailable", "available"]) {
    const env2 = world(), sent = await sentEnquiry(env2);
    run(env2, "UPDATE listings SET operation = 'sale', availability = 'for_sale', sale_price = 900000, rent = NULL, rent_period = NULL WHERE id = ?", HOME);
    const before = stored(env2);
    const r = await respond(env2, sent.id, { outcome, reason: "let", scope: "operation" });
    assert.equal(r.status, 409, JSON.stringify(r.data));
    assert.match(r.data.error, /no longer offered to let/i);
    assert.equal(stored(env2), before, `${outcome}: nothing is written, no sale is confirmed or withdrawn`);
    assert.equal(rows(env2, "SELECT 1 FROM availability_confirmations").length, 0);
    // About the whole property it still holds, for every operation.
    ok(await respond(env2, sent.id, { outcome, reason: "let", scope: "property" }));
    assert.deepEqual(rows(env2, "SELECT operation, status FROM availability_confirmations"), [{ operation: null, status: outcome }]);
  }
});

test("the same answer sent again repairs the propagation of what it confirmed", async () => {
  const env = world(), { id } = await sentEnquiry(env), ben = await searching(env, "Ben Carter");
  const again = answer({ outcome: "unavailable", reason: "let" });
  ok(await req(env, "POST", `/admin/consultations/${id}/response`, again));
  assert.equal(rows(env, "SELECT 1 FROM matches WHERE applicant_id = ? AND listing_id = ?", ben, HOME).length, 0);
  // As if the recalculation had failed: the proposal is still there until the retried click.
  run(env, "INSERT INTO matches (applicant_id, listing_id, score, checks, status, created_at, updated_at) VALUES (?, ?, 90, '[]', 'found', ?, ?)", ben, HOME, T0, T0);
  ok(await req(env, "POST", `/admin/consultations/${id}/response`, again));
  assert.equal(rows(env, "SELECT 1 FROM matches WHERE applicant_id = ? AND listing_id = ?", ben, HOME).length, 0);
  assert.equal(rows(env, "SELECT 1 FROM availability_confirmations").length, 1);
});

test("switched off after use, an enquiry left waiting for an answer can still be cancelled once no match counts", async () => {
  const env = world(), { id, ms: [m], agency } = await sentEnquiry(env);
  const ben = await searching(env, "Ben Carter"), mb = await shortlist(env, ben, ASK);
  const other = ok(await prepare(env, mb, agency), 201).consultation;
  ok(await respond(env, id, { outcome: "no_answer", scope: undefined }));
  delete env.AGE06_RESPONSES_READY;
  for (const match of [m, mb]) ok(await req(env, "PUT", `/admin/matches/${match}`, { status: "found", from: "shortlisted" }));
  const view = ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`)).consultations.find(c => c.id === id);
  assert.deepEqual([view.status, view.can_cancel, "can_answer" in view], ["awaiting_response", true, false]);
  assert.equal(ok(await req(env, "POST", `/admin/consultations/${id}/cancel`, { revision: 1 })).consultation.status, "cancelled");
  // Nothing else can be cancelled or answered while it is off.
  assert.equal((await req(env, "POST", `/admin/consultations/${other.id}/cancel`, { revision: 1 })).status, 404);
  assert.equal((await respond(env, id, { revision: 1 })).status, 404);
  assert.equal(row(env, "SELECT status FROM consultations WHERE id = ?", other.id).status, "manual_pending");
});

test("needs more information opens a follow-up task, closed by the next answer; the same click again records nothing twice", async () => {
  const env = world(), { id } = await sentEnquiry(env);
  const more = answer({ outcome: "more_info", scope: undefined });
  ok(await req(env, "POST", `/admin/consultations/${id}/response`, more));
  const again = ok(await req(env, "POST", `/admin/consultations/${id}/response`, more)).consultation;
  assert.equal(again.status, "awaiting_response");
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'consultation.response_recorded'").length, 1);
  const open = tasks(env).filter(t => t.task_key.endsWith(":reply"));
  assert.equal(open.length, 1);
  assert.equal(open[0].resolved_at, null);
  assert.match(open[0].title, /more information/i);
  ok(await respond(env, id, {}));
  assert.notEqual(tasks(env).find(t => t.task_key.endsWith(":reply")).resolved_at, null);
  assert.ok(tasks(env).every(t => t.resolved_at), "no enquiry task stays open once it is answered");
  // A repeated confirmation click writes one confirmation.
  assert.equal(rows(env, "SELECT 1 FROM availability_confirmations").length, 1);
});

test("an answer is recorded only for a sent enquiry, after it was sent and not in the future, and as its kind allows", async () => {
  const env = world(), agency = await advertiser(env), ana = await searching(env, "Ana Le Gros"), m = await shortlist(env, ana);
  const id = ok(await prepare(env, m, agency), 201).consultation.id;
  assert.equal((await respond(env, id)).status, 409, "not sent yet");
  await markSent(env, id);
  const before = stored(env);
  for (const [o, field] of [[{ answered_at: new Date(Date.now() + 3600e3).toISOString() }, "answered_at"],
    [{ answered_at: new Date(Date.parse(SENT_AT) - 3600e3).toISOString() }, "answered_at"], [{ via: "fax" }, "via"],
    [{ answered_by: "" }, "answered_by"], [{ evidence_ref: "" }, "evidence_ref"], [{ scope: undefined }, "scope"],
    [{ outcome: "answered" }, "outcome"], [{ outcome: "maybe" }, "outcome"]]) {
    const r = await respond(env, id, o);
    assert.equal(r.status, 400, JSON.stringify(o));
    assert.ok(r.data.fields[field], `${field}: ${JSON.stringify(r.data)}`);
  }
  assert.equal((await respond(env, id, { revision: 2 })).status, 409);
  assert.equal(stored(env), before, "nothing is written");
});

test("an enquiry with no match that counts can be cancelled, its task closed; one that still serves a match cannot", async () => {
  const env = world(), agency = await advertiser(env), ana = await searching(env, "Ana Le Gros"), m = await shortlist(env, ana);
  const id = ok(await prepare(env, m, agency), 201).consultation.id;
  const refused = await req(env, "POST", `/admin/consultations/${id}/cancel`, { revision: 1 });
  assert.equal(refused.status, 409);
  assert.equal(row(env, "SELECT status FROM consultations WHERE id = ?", id).status, "manual_pending");
  // The match goes back to Found: nothing counts for the enquiry any more.
  ok(await req(env, "PUT", `/admin/matches/${m}`, { status: "found", from: "shortlisted" }));
  const view = ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`)).consultations[0];
  assert.deepEqual([view.matches, view.can_cancel], [0, true]);
  const done = ok(await req(env, "POST", `/admin/consultations/${id}/cancel`, { revision: 1 })).consultation;
  assert.equal(done.status, "cancelled");
  assert.equal(ok(await req(env, "POST", `/admin/consultations/${id}/cancel`, { revision: 1 })).consultation.status, "cancelled", "the same click again");
  assert.ok(tasks(env).every(t => t.resolved_at), "its Inbox task is closed");
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'consultation.cancelled'").length, 1);
  // Approved again, the match starts a new enquiry.
  const again = await shortlist(env, ana);
  assert.notEqual(ok(await prepare(env, again, agency), 201).consultation.id, id);
});

test("a clarification is answered for its one match, without confirming availability", async () => {
  const env = world(), agency = await advertiser(env), ana = await searching(env, "Ana Le Gros"), m = matchId(env, ana, ASK);
  ok(await req(env, "PUT", `/admin/matches/${m}/clarification`, { approved: true }));
  const id = ok(await prepare(env, m, agency, "clarification"), 201).consultation.id;
  await markSent(env, id);
  const done = ok(await respond(env, id, { outcome: "answered", scope: undefined, case_notes: [{ match_id: m, note: "Two parking spaces included" }] })).consultation;
  assert.deepEqual([done.status, done.response.outcome], ["answered", "answered"]);
  assert.equal(rows(env, "SELECT 1 FROM availability_confirmations").length, 0);
  const c = await card(env, ana, ASK);
  assert.deepEqual([c.states.enquiry, c.states.availability, c.enquiry.response_note], ["answered", "not_confirmed", "Two parking spaces included"]);
});
