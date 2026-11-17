// EST-14: the journey of a match read from the producers that are live: AGE-12's client answers, VIS-17's coordinated
// viewings (with VIS-04's answer after it), OFE's offers and sales and ADM-06's tenancies. Each fact counts only on the
// search and the property it is about. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { extractFeatures } from "../../server/listing-features.js";

const ADMIN = "admin@example.test";
const ON = { EST14_JOURNEY_READY: "1", AGE12_PRESENTATIONS_READY: "1", VIS17_MULTIPART_READY: "1", ADM06_TENANCY_ORIGIN_READY: "1" };
const SALE = "HE-R001", LET = "HE-R002";
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const insert = (env, table, o) => {
  const cols = Object.keys(o);
  return Number(run(env, `INSERT INTO ${table} (${cols}) VALUES (${cols.map(() => "?")})`, ...Object.values(o)).lastInsertRowid);
};
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie(ADMIN) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

function world() {
  const env = Object.assign(makeEnv(), ON);
  seedListing(env, { id: SALE, title: "Fixture for sale", bedrooms: 3, matchable: 1, parish: "St Saviour", ...extractFeatures({ description: "" }) });
  seedListing(env, { id: LET, title: "Fixture to let", operation: "rent", availability: "to_let", rent: 1800, rent_period: "month",
    sale_price: null, bedrooms: 3, matchable: 1, housing_category: "registered", parish: "St Helier", ...extractFeatures({ description: "" }) });
  return env;
}
let people = 0;
async function searching(env, operation = "buy", email) {
  const n = ++people, contact = insert(env, "contacts", { name: `EST14 person ${n}`, email: email ?? `est14p-${n}@example.test`,
    last_activity_at: T0, created_at: T0, updated_at: T0 });
  const id = insert(env, "applicants", { contact_id: contact, operation, stage: "searching", source: "phone", created_at: T0, updated_at: T0,
    ...(operation === "buy" ? { budget_max: 900000 } : { budget_max: 2000, housing_status: "entitled" }), bedrooms_min: 2 });
  await recomputeForApplicant(env, id, "system");
  return id;
}
const matchOf = (env, a, listing) => row(env, "SELECT * FROM matches WHERE applicant_id = ? AND listing_id = ?", a, listing);
const shortlist = async (env, a, listing) => ok(await req(env, "PUT", `/admin/matches/${matchOf(env, a, listing).id}`, { status: "shortlisted", from: "found" }));
const card = async (env, a, listing) => {
  const { matches } = ok(await req(env, "GET", `/admin/applicants/${a}/matches?status=shortlisted`));
  return matches.find(m => m.listing.id === listing);
};

test("AGE-12: a link sent waits for the client; their answer is their word on that home only", async () => {
  const env = world(), a = await searching(env), b = await searching(env);
  await shortlist(env, a, SALE);
  await shortlist(env, b, SALE);
  const grant = insert(env, "presentation_grants", { applicant_id: a, token_hash: "a".repeat(64), created_at: T0, created_by: ADMIN,
    sent_at: T0, sent_by: ADMIN });
  insert(env, "presentation_options", { grant_id: grant, match_id: matchOf(env, a, SALE).id, listing_id: SALE, position: 0 });
  assert.equal((await card(env, a, SALE)).states.interest, "waiting");
  assert.equal((await card(env, b, SALE)).states.interest, "no_answer");
  run(env, "UPDATE presentation_options SET choice = 'not_for_me', reason = 'Garden too small', answered_at = ?", "2026-10-08T09:00:00.000Z");
  const mine = await card(env, a, SALE);
  assert.equal(mine.states.interest, "not_interested");
  assert.equal(mine.journey.stage, "not_interested");
  assert.deepEqual(mine.journey.history.map(h => h.kind), ["answer", "sent"]);
  assert.equal(mine.journey.history[0].note, "Garden too small");
  // client_decline_not_unavailable: the property is still offered to everyone and the decision stands.
  assert.equal(mine.status, "shortlisted");
  assert.equal(row(env, "SELECT availability FROM listings WHERE id = ?", SALE).availability, "for_sale");
  assert.equal((await card(env, b, SALE)).states.interest, "no_answer");
});

test("VIS-17 and VIS-04: booked only by every acceptance at the viewing's time, viewed only once completed", async () => {
  const env = world(), a = await searching(env, "buy", "viewer@example.test"), b = await searching(env);
  await shortlist(env, a, SALE);
  await shortlist(env, b, SALE);
  const viewing = (o = {}) => insert(env, "viewing_requests", { listing_id: SALE, listing_ref: SALE, kind: "In person", date: "2026-10-22",
    time: "10:00", end_time: "10:30", name: "Fixture Viewer", email: "viewer@example.test", status: "requested", created_at: T0,
    updated_at: T0, negotiator_id: 1, ...o });
  const propose = (v, applicant_id, o = {}) => insert(env, "viewing_proposals", { viewing_id: v, revision: 1, applicant_id, negotiator_id: 1,
    date: "2026-10-22", time: "10:00", end_time: "10:30", from_status: "requested", from_negotiator_id: 1, from_date: "2026-10-22",
    from_time: "10:00", required: '["client"]', created_at: T0, created_by: ADMIN, ...o });
  // A legacy viewing from the same email, never linked by a person, says nothing of the match.
  viewing({ status: "completed", outcome: "proceed" });
  assert.equal((await card(env, a, SALE)).journey.stage, "none", "no link by similarity");
  // old_proposal_no_booked: confirmed for another time, then moved by the viewing's own reschedule.
  const v = viewing({ status: "confirmed", time: "11:00", end_time: "11:30" });
  propose(v, a, { state: "confirmed", closed_at: T0, closed_by: ADMIN });
  assert.equal((await card(env, a, SALE)).journey.stage, "viewing_requested");
  run(env, "UPDATE viewing_requests SET time = '10:00', end_time = '10:30' WHERE id = ?", v);
  assert.equal((await card(env, a, SALE)).journey.stage, "viewing_booked");
  // source_link_exact: the person linked this viewing to search a, so b's match of the same home has none of it.
  assert.equal((await card(env, b, SALE)).journey.stage, "none");
  // A later proposal that links another search moves the viewing to that search.
  propose(v, b, { revision: 2, state: "declined", closed_at: T0, closed_by: ADMIN });
  assert.equal((await card(env, a, SALE)).journey.stage, "none");
  assert.equal((await card(env, b, SALE)).journey.stage, "viewing_booked");
  run(env, "DELETE FROM viewing_proposals WHERE revision = 2");
  // Completed with VIS-04's answer: viewed, then the client's no with its note; the search stays active.
  run(env, "UPDATE viewing_requests SET status = 'completed', outcome = 'not_interested', outcome_note = 'Too dark', feedback_at = ? WHERE id = ?",
    "2026-10-23T09:00:00.000Z", v);
  const done = await card(env, a, SALE);
  assert.equal(done.states.interest, "not_interested");
  assert.equal(done.journey.stage, "not_interested");
  assert.deepEqual(done.journey.history.map(h => [h.kind, h.status, h.outcome]), [["viewing", "completed", "not_interested"]]);
  assert.equal(row(env, "SELECT search_state FROM applicants WHERE id = ?", a).search_state, "active");
  run(env, "UPDATE viewing_requests SET outcome = 'proceed' WHERE id = ?", v);
  assert.deepEqual([(await card(env, a, SALE)).journey.stage, (await card(env, a, SALE)).states.interest], ["viewed", "interested"]);
});

test("offers and sales through Sales: price_rejection_history, then agreed_search_still_active", async () => {
  const env = world(), a = await searching(env), b = await searching(env);
  await shortlist(env, a, SALE);
  await shortlist(env, b, SALE);
  const first = ok(await req(env, "POST", "/admin/offers", { listing_id: SALE, applicant_id: a, amount: 700000 }), 201).offer.id;
  assert.equal((await card(env, a, SALE)).journey.stage, "offer");
  ok(await req(env, "POST", `/admin/offers/${first}/reject`, { note: "Too low" }));
  const rejected = await card(env, a, SALE);
  assert.equal(rejected.journey.stage, "none");
  assert.deepEqual(rejected.journey.history.map(h => [h.kind, h.status, h.amount]), [["offer", "rejected", 700000]]);
  const second = ok(await req(env, "POST", "/admin/offers", { listing_id: SALE, applicant_id: a, amount: 760000 }), 201).offer.id;
  ok(await req(env, "POST", `/admin/offers/${second}/accept`), 201);
  const agreed = await card(env, a, SALE);
  assert.equal(agreed.journey.stage, "agreed");
  assert.deepEqual(agreed.journey.history.map(h => [h.kind, h.status]).slice(0, 2), [["sale", "in_progress"], ["offer", "accepted"]]);
  assert.ok(agreed.journey.history.some(h => h.kind === "offer" && h.status === "rejected"), "the rejected price stays in the history");
  // An agreement keeps the search active (EST-09) and says nothing on the other buyer's match.
  assert.equal(row(env, "SELECT search_state FROM applicants WHERE id = ?", a).search_state, "active");
  assert.equal((await card(env, b, SALE)).journey.stage, "none");
});

test("sale_other_operation_denied: an offer row on a search to rent is no Offer; a tenancy from this search is Agreed", async () => {
  const env = world(), r = await searching(env, "rent"), other = await searching(env, "rent");
  await shortlist(env, r, LET);
  await shortlist(env, other, LET);
  insert(env, "offers", { listing_id: LET, applicant_id: r, amount: 1000, status: "pending", created_at: T0, updated_at: T0 });
  const c = await card(env, r, LET);
  assert.equal(c.journey.stage, "none");
  assert.deepEqual(c.journey.history, []);
  const landlord = insert(env, "landlords", { name: "Fixture Landlord", created_at: T0, updated_at: T0 });
  const rental = insert(env, "rentals", { landlord_id: landlord, address: "1 Fixture Road", parish: "St Helier", service: "let_only", created_at: T0, updated_at: T0 });
  const tenancy = insert(env, "tenancies", { rental_id: rental, tenant_name: "Fixture Tenant", kind: "periodic", regime: "2025", start_on: "2026-11-01",
    rent: 1800, due_day: 1, deposit: 1800, created_at: T0, updated_at: T0 });
  insert(env, "tenancy_origins", { tenancy_id: tenancy, operation_id: "fixture-operation-1", rental_id: rental, listing_id: LET, applicant_id: r,
    listing_updated_at: T0, applicant_updated_at: T0, created_at: T0, created_by: ADMIN });
  const let_ = await card(env, r, LET);
  assert.equal(let_.journey.stage, "agreed");
  assert.deepEqual(let_.journey.history.map(h => [h.kind, h.id, h.rental_id]), [["tenancy", tenancy, rental]]);
  assert.equal((await card(env, other, LET)).journey.stage, "none");
  assert.equal(row(env, "SELECT search_state FROM applicants WHERE id = ?", r).search_state, "active");
});
