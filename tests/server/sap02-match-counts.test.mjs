// SAP-02 / SAP-03 / EST-04: the applicants list counts, per search, the homes found, those whose availability a person
// confirmed and those available to propose; the record filters its Matches by the same rules; and In process means
// an enquiry about one of the search's homes waits for the agency. Every number is what counting the cards gives.
// Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { makeEnv, seedListing, call, adminCookie, T0, captured, plan } from "./listing-client.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { extractFeatures } from "../../server/listing-features.js";

const ADMIN = "admin@example.test";
// Six homes to let; all but H5 answer the parking must-have.
const HOMES = ["HE-R001", "HE-R002", "HE-R003", "HE-R004", "HE-R005", "HE-R006"], [H1, H2, H3, H4, H5, H6] = HOMES;
const ON = { SAP02_COUNTS_READY: "1", EST16_AVAILABILITY_READY: "1", AGE03_ENQUIRIES_READY: "1" };
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie(ADMIN) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

function world(flags = ON) {
  const env = Object.assign(makeEnv(), flags);
  for (const id of HOMES) seedListing(env, { id, title: `Fixture home ${id}`, operation: "rent", availability: "to_let", rent: 1800,
    rent_period: "month", sale_price: null, bedrooms: 2, bathrooms: 2, housing_category: "registered", matchable: 1,
    ...extractFeatures({ description: id === H5 ? "" : "Parking for two cars" }), parish: "St Helier", location: "St Helier" });
  return env;
}
let people = 0;
// A tenant with three must-haves (up to £2,000 a month, two bedrooms, two parking spaces): every home is a match.
async function searching(env, name) {
  const n = ++people;
  const c = run(env, "INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    name, `sap02-${n}@example.test`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), operation: "rent", stage: "searching", source: "phone", budget_max: 2000, bedrooms_min: 2,
    parking_spaces: 2, pets: '[{"kind":"none"}]', household_adults: 2, household_children: 0, household_total: 2, created_at: T0, updated_at: T0,
    requirement_priorities: JSON.stringify({ version: 1, values: { budget: "must", bedrooms: "must", parking: "must" }, unknown: [] }) };
  const cols = Object.keys(a);
  const id = Number(run(env, `INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...Object.values(a)).lastInsertRowid);
  await recomputeForApplicant(env, id, "system");
  return id;
}
const matchId = (env, a, listing) => row(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = ?", a, listing).id;
const review = async (env, a, listing, body) => ok(await req(env, "PUT", `/admin/matches/${matchId(env, a, listing)}`, { from: "found", ...body }));
const shortlist = (env, a, listing) => review(env, a, listing, { status: "shortlisted" });
const reject = (env, a, listing) => review(env, a, listing, { status: "rejected", reject_reason: "area" });
const only = (env, a, ...keep) => run(env, `DELETE FROM matches WHERE applicant_id = ? AND listing_id NOT IN (${keep.map(() => "?").join(", ")})`, a, ...keep);
const confirm = async (env, listing, status, confirmed_at = "2025-03-10T09:30:00.000Z") => ok(await req(env, "POST", `/admin/listings/${listing}/availability`,
  { status, confirmed_at, source: "agency", channel: "phone", evidence_ref: "Call note FIXTURE-EVIDENCE", scope: "property", reason: "let" }), 201);
async function advertiser(env) {
  return ok(await req(env, "POST", "/admin/advertisers", { name: "Fixture Agency", kind: "agency", channels: [], source_ids: [], listing_ids: HOMES, commission: "",
    photo_permission: "", contacts: [{ name: "Agency Desk", email: "desk@agency.example.test", phones: [{ label: "Office", number: "01534 000000" }] }] }), 201).advertiser.id;
}
const prepare = async (env, a, listing, advertiser_id, kind = "general") => ok(await req(env, "POST", `/admin/matches/${matchId(env, a, listing)}/consultation`,
  { operation_id: randomUUID(), kind, advertiser_id }), 201).consultation;
const join = async (env, a, listing) => ok(await req(env, "POST", `/admin/matches/${matchId(env, a, listing)}/consultation`,
  { operation_id: randomUUID(), kind: "general" })).consultation;

const list = async (env, q = "") => ok(await req(env, "GET", `/admin/applicants?sort=oldest${q}`));
// Every card of a search's group, page after page, as its Matches tab gets them.
async function group(env, a, status, filter = "") {
  const cards = [];
  let after = "", last;
  do {
    last = ok(await req(env, "GET", `/admin/applicants/${a}/matches?status=${status}${filter && `&only=${filter}`}${after}`));
    cards.push(...last.matches);
    after = last.next ? `&after=${encodeURIComponent(last.next)}` : "";
  } while (after);
  return { cards, counts: last.counts, summary: last.summary };
}
// What the cards themselves say: the rules of the counts, read from each card's own states.
const offered = l => !l.archived_at && ["for_sale", "to_let", "lease"].includes(l.availability);
const SAYS = {
  confirmed: c => c.states.availability === "confirmed",
  available: c => c.states.availability === "confirmed" && c.states.decision === "approved" && offered(c.listing),
  unavailable: c => c.states.availability === "confirmed_unavailable",
  waiting_agent: c => ["prepared", "sent_manually"].includes(c.states.enquiry) && !["answered", "cancelled"].includes(c.enquiry.status) && offered(c.listing),
};
const tally = cards => Object.fromEntries(Object.entries(SAYS).map(([k, says]) => [k, cards.filter(says).length]));

// Eight searches over the same six homes, in every state the cards can show.
async function everyState(flags) {
  const env = world(flags), agency = await advertiser(env), id = {};
  for (const name of ["ana", "ben", "cat", "dee", "eve", "fay", "gil", "hal"]) id[name] = await searching(env, name);
  // Ana approves three; Ben leaves the confirmed ones undecided, rejects one and asks about H5's parking.
  for (const h of [H1, H2, H6]) await shortlist(env, id.ana, h);
  await reject(env, id.ben, H2);
  ok(await req(env, "PUT", `/admin/matches/${matchId(env, id.ben, H5)}/clarification`, { approved: true }));
  // Cat's and Dee's approvals of H1 stop covering their searches; Eve has no match; Fay asked about H3 and was answered.
  for (const name of ["cat", "dee", "gil", "hal"]) await shortlist(env, id[name], H1);
  await shortlist(env, id.fay, H3);
  only(env, id.eve, "");
  only(env, id.gil, H1);
  only(env, id.hal, H1);
  // What people were told: H1 and H6 available; H2 available, then not; H3 available, then unknown; H4 both at once;
  // H5 available for sale only, which is not what it offers.
  await confirm(env, H1, "available");
  await confirm(env, H6, "available");
  await confirm(env, H2, "available");
  await confirm(env, H2, "unavailable", "2025-03-11T09:30:00.000Z");
  await confirm(env, H3, "available");
  await confirm(env, H3, "unknown", "2025-03-11T09:30:00.000Z");
  await confirm(env, H4, "available");
  await confirm(env, H4, "unavailable");
  run(env, `INSERT INTO availability_confirmations (listing_id, operation, status, confirmed_at, source, channel, evidence_ref, recorded_at, recorded_by)
    VALUES (?, 'sale', 'available', '2025-03-12T09:30:00.000Z', 'agency', 'phone', 'Call note FIXTURE-EVIDENCE', ?, ?)`, H5, T0, ADMIN);
  // Enquiries: one shared about H1 (Ana starts it; Dee and Gil join), one about H6, Ben's clarification, Fay's answered.
  await prepare(env, id.ana, H1, agency);
  await join(env, id.dee, H1);
  await join(env, id.gil, H1);
  await prepare(env, id.ana, H6, agency);
  const asked = await prepare(env, id.ben, H5, agency, "clarification");
  ok(await req(env, "POST", `/admin/consultations/${asked.id}/manual-send`, { operation_id: randomUUID(), revision: asked.revision,
    sent_at: new Date().toISOString(), via: "phone", evidence_ref: "Call note FIXTURE-EVIDENCE" }));
  const answered = await prepare(env, id.fay, H3, agency);
  run(env, "UPDATE consultations SET status = 'answered' WHERE id = ?", answered.id);
  // Afterwards: Cat's criteria change, Dee's search stops being active and H6 goes under offer.
  run(env, "UPDATE applicants SET budget_max = 1900 WHERE id = ?", id.cat);
  run(env, "UPDATE applicants SET search_state = 'needs_review' WHERE id = ?", id.dee);
  run(env, "UPDATE listings SET availability = 'under_offer' WHERE id = ?", H6);
  return { env, id };
}

// Per search: [found (not rejected), confirmed, available, confirmed not available, waiting for the agency], counted
// from its cards, after checking that the list row, the record's summary and each filter say the same.
async function counted(env, id, applicants) {
  const out = {};
  for (const [name, a] of Object.entries(id)) {
    const listed = applicants.find(x => x.id === a), groups = {};
    for (const status of ["found", "shortlisted", "rejected"]) groups[status] = await group(env, a, status);
    const cards = [...groups.found.cards, ...groups.shortlisted.cards], said = tally(cards);
    assert.deepEqual([listed.found + listed.shortlisted, listed.confirmed, listed.available, listed.unavailable, listed.in_process],
      [cards.length, said.confirmed, said.available, said.unavailable, said.waiting_agent ? 1 : 0], `${name}: list`);
    for (const g of Object.values(groups)) assert.deepEqual(g.summary, said, `${name}: summary`);
    for (const filter of Object.keys(SAYS)) {
      let total = 0;
      for (const status of ["found", "shortlisted", "rejected"]) {
        const filtered = await group(env, a, status, filter), want = status === "rejected" ? [] : groups[status].cards.filter(SAYS[filter]);
        assert.deepEqual(filtered.cards, want, `${name}: ${filter} in ${status} shows the same cards, in the same order`);
        assert.equal(filtered.counts[status], want.length);
        total += want.length;
      }
      assert.equal(total, said[filter], `${name}: no card twice under ${filter}`);
    }
    out[name] = [cards.length, said.confirmed, said.available, said.unavailable, said.waiting_agent];
  }
  return out;
}

test("the list's counts and the record's summary are what counting each search's cards gives", async () => {
  const { env, id } = await everyState();
  const confirmations = captured(env, /SELECT listing_id FROM availability_confirmations/), main = captured(env, /WITH listed/);
  const { applicants, match_counts, in_process } = await list(env);
  assert.deepEqual([match_counts, in_process], [true, true]);
  assert.equal(applicants.length, 8);
  assert.deepEqual(confirmations.map(q => q.args), [[]], "one aggregated read of the confirmations for the whole list");
  // Read from the listings with a confirmation and from the open enquiries, never from every match.
  assert.match(plan(env, confirmations[0]), /SEARCH m USING INDEX matches_listing/);
  assert.match(plan(env, main[0]), /SCAN c USING INDEX consultations_open/);
  for (const q of [confirmations[0], main[0]]) assert.doesNotMatch(plan(env, q), /SCAN m\b/);
  assert.deepEqual(await counted(env, id, applicants), {
    ana: [6, 2, 1, 1, 1], ben: [5, 2, 0, 0, 1], cat: [6, 2, 0, 1, 0], dee: [6, 2, 0, 1, 0], eve: [0, 0, 0, 0, 0], fay: [6, 2, 0, 1, 0],
    gil: [1, 1, 1, 0, 1], hal: [1, 1, 1, 0, 0] });
});

test("with confirmed unavailability withdrawing proposals (EST-15) the counts still follow the cards", async () => {
  const { env, id } = await everyState({ ...ON, EST15_UNAVAILABILITY_READY: "1" });
  const said = await counted(env, id, (await list(env)).applicants);
  // H2's Found matches went with its confirmation; Ana's approved one stays, confirmed not available.
  assert.deepEqual([said.ana, said.cat.at(3), said.ben.at(3)], [[6, 2, 1, 1, 1], 0, 0]);
});

test("In process means an enquiry waits for the agency, in the label, its filter and the single queue label", async () => {
  const { env, id } = await everyState();
  const { applicants } = await list(env);
  const queue = name => applicants.find(x => x.id === id[name]).queue;
  // Gil and Hal both have one shortlisted home and nothing to review; only Gil's is being asked about.
  assert.deepEqual([queue("gil"), queue("hal"), queue("ana"), queue("dee"), queue("eve")],
    ["In process", "No matches", "Waiting for review", null, "No matches"]);
  assert.deepEqual((await list(env, "&work_label=in_process")).applicants.map(x => x.id), [id.ana, id.ben, id.gil]);
  assert.deepEqual((await list(env, "&queue=In%20process")).applicants.map(x => x.id), [id.gil]);
  assert.deepEqual((await list(env, "&work_label=shortlisted")).applicants.map(x => x.id), [id.ana, id.cat, id.fay, id.gil, id.hal],
    "Shortlisted stays the team's own selection");
  // An enquiry recorded as sent still waits; one answered or cancelled does not.
  run(env, "UPDATE consultations SET status = 'cancelled' WHERE listing_id = ? AND kind = 'general'", H1);
  assert.deepEqual((await list(env, "&work_label=in_process")).applicants.map(x => x.id), [id.ben]);
});

test("switched off, the list, the record and the queue answer exactly as before", async () => {
  const { env, id } = await everyState();
  env.SAP02_COUNTS_READY = undefined;
  const seen = captured(env, /availability_confirmations|consultation/);
  const data = await list(env), hal = data.applicants.find(x => x.id === id.hal);
  assert.deepEqual(Object.keys(data), ["applicants"]);
  assert.deepEqual(Object.keys(hal).filter(k => ["confirmed", "available", "unavailable", "in_process"].includes(k)), []);
  assert.deepEqual([hal.queue, hal.found, hal.shortlisted], ["In process", 0, 1], "as B13: a shortlisted home");
  assert.equal((await req(env, "GET", "/admin/applicants?work_label=in_process")).status, 400);
  assert.equal(seen.length, 0, "nothing new is read");
  const page = ok(await req(env, "GET", `/admin/applicants/${id.ana}/matches?status=shortlisted`));
  assert.equal("summary" in page, false);
  assert.equal((await req(env, "GET", `/admin/applicants/${id.ana}/matches?status=shortlisted&only=confirmed`)).status, 400);
});

test("without confirmations or enquiries switched on, the counts are zero and In process stays the shortlist's", async () => {
  const { env, id } = await everyState();
  env.EST16_AVAILABILITY_READY = undefined;
  env.AGE03_ENQUIRIES_READY = undefined;
  const seen = captured(env, /availability_confirmations|consultation/);
  const data = await list(env), row = name => data.applicants.find(x => x.id === id[name]);
  assert.deepEqual([data.match_counts, "in_process" in data], [true, false]);
  assert.deepEqual([row("ana").found + row("ana").shortlisted, row("ana").confirmed, row("ana").available, row("ana").unavailable], [6, 0, 0, 0]);
  assert.equal("in_process" in row("ana"), false);
  assert.deepEqual([row("gil").queue, row("hal").queue], ["In process", "In process"]);
  assert.equal((await req(env, "GET", "/admin/applicants?work_label=in_process")).status, 400);
  const page = await group(env, id.ana, "shortlisted");
  assert.deepEqual(page.summary, { confirmed: 0, available: 0, unavailable: 0 });
  assert.deepEqual((await group(env, id.ana, "shortlisted", "confirmed")).cards, []);
  assert.deepEqual((await group(env, id.ana, "shortlisted", "waiting_agent")).cards, []);
  assert.equal(seen.length, 0, "neither table is read");
  // Before their migrations the switches change nothing either.
  const bare = Object.assign(makeEnv({ through: 71 }), ON);
  assert.deepEqual(ok(await call(bare, "GET", "/admin/applicants", { cookie: await adminCookie(ADMIN) })), { applicants: [], match_counts: true });
});

test("a filter is one of the four and belongs to a group", async () => {
  const { env, id } = await everyState();
  for (const q of ["status=found&only=shortlisted", "status=found&only=", "status=found&only=confirmed&only=available", "only=confirmed"])
    assert.equal((await req(env, "GET", `/admin/applicants/${id.ana}/matches?${q}`)).status, 400, q);
  assert.equal((await call(env, "GET", `/admin/applicants/${id.ana}/matches?status=found&only=confirmed`)).status, 401);
});
