// EST-15: a confirmed unavailability in force (EST-16's record) stops the property being proposed for the operation
// it covers, keeps the shortlisted matches and leaves the team a task for each upcoming viewing. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./listing-client.mjs";
import { recomputeForApplicant, recomputeForListing } from "../../server/match-store.js";
import { notConfirmedUnavailable } from "../../server/property-facts.js";
import { APPROVED } from "../../server/routes/matches.js";
import { extractFeatures } from "../../server/listing-features.js";
import { jerseyToday, plusDays } from "../../server/viewings.js";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
const HOME = "HE-R001", ELSEWHERE = "HE-R002", EVIDENCE = "Call note FIXTURE-EVIDENCE";
const path = id => `/admin/listings/${id}/availability`;
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, url, body, email = ADMIN) => call(env, method, url, { body, cookie: await adminCookie(email) });
const home = (id = HOME) => ({ id, operation: "rent", availability: "to_let", rent: 1800, rent_period: "month", sale_price: null, bedrooms: 2,
  bathrooms: 2, housing_category: "registered", matchable: 1, ...extractFeatures({ description: "Parking for two cars" }), parish: "St Helier" });
const world = ({ on = true, schema } = {}) => {
  const env = makeEnv(schema);
  env.EST16_AVAILABILITY_READY = "1";
  if (on) env.EST15_UNAVAILABILITY_READY = "1";
  seedListing(env, home());
  return env;
};
const fact = (o = {}) => ({ status: "unavailable", reason: "let", confirmed_at: "2025-06-01T15:00:00.000Z", source: "owner", channel: "phone",
  evidence_ref: EVIDENCE, scope: "property", ...o });
const record = (env, o, email, id = HOME) => req(env, "POST", path(id), fact(o), email);

let contacts = 0;
async function searching(env, name, over = {}) {
  const c = env.DB.raw.prepare("INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(name, `est15-${++contacts}@example.test`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), operation: "rent", stage: "searching", source: "phone", budget_max: 2000,
    bedrooms_min: 2, pets: '[{"kind":"none"}]', created_at: T0, updated_at: T0,
    requirement_priorities: JSON.stringify({ version: 1, values: { budget: "must", bedrooms: "must" }, unknown: [] }), ...over };
  const cols = Object.keys(a);
  const id = Number(env.DB.raw.prepare(`INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...Object.values(a)).lastInsertRowid);
  await recomputeForApplicant(env, id, "system");
  return id;
}
const matches = (env, applicant) => rows(env, "SELECT listing_id, status FROM matches WHERE applicant_id = ? ORDER BY listing_id", applicant);
const FOUND = [{ listing_id: HOME, status: "found" }];
async function card(env, applicant, status) {
  const r = await req(env, "GET", `/admin/applicants/${applicant}/matches?status=${status}`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.matches[0];
}
const shortlist = async (env, applicant) => {
  const [{ id }] = rows(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = ?", applicant, HOME);
  assert.equal((await req(env, "PUT", `/admin/matches/${id}`, { status: "shortlisted", from: "found" })).status, 200);
  return id;
};
const TOMORROW = plusDays(jerseyToday(), 1), YESTERDAY = plusDays(jerseyToday(), -1);
let people = 0;
const viewing = (env, o = {}) => Number(env.DB.raw.prepare(`INSERT INTO viewing_requests (listing_id, kind, date, time, end_time, name, email,
  status, created_at) VALUES (?, 'In person', ?, '10:00', '10:30', ?, ?, ?, ?)`).run(o.listing_id ?? HOME, o.date ?? TOMORROW,
  o.name ?? `Client ${++people}`, `client-${people}@example.test`, o.status ?? "confirmed", T0).lastInsertRowid);
const tasks = env => rows(env, `SELECT e.entity_id AS viewing, e.data, e.actor, n.category, n.title, n.action_required, n.resolved_at
  FROM notifications n JOIN events e ON e.id = n.event_id WHERE e.entity_type = 'viewing' AND e.type = 'viewing.property_unavailable'
  ORDER BY CAST(e.entity_id AS INTEGER), n.id`);
const untouched = env => JSON.stringify([rows(env, "SELECT * FROM listings"), rows(env, "SELECT * FROM matches"),
  rows(env, "SELECT * FROM events"), rows(env, "SELECT * FROM notifications"), rows(env, "SELECT * FROM viewing_requests")]);

test("switched off, a confirmed unavailability is only recorded and shown, as before", async () => {
  const env = world({ on: false, schema: { through: 75 } });
  const ana = await searching(env, "Ana Le Gros");
  viewing(env);
  const before = untouched(env);
  const r = await record(env);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal("propagates" in r.data, false);
  assert.equal("reason" in r.data.current, false);
  assert.equal(untouched(env), before);
  assert.deepEqual(matches(env, ana), FOUND);
  await recomputeForApplicant(env, ana, "system");
  assert.deepEqual(matches(env, ana), FOUND);
  assert.equal(notConfirmedUnavailable(env), "");
  // EST-15 alone, without EST-16's own switch, reads nothing either.
  delete env.EST16_AVAILABILITY_READY;
  env.EST15_UNAVAILABILITY_READY = "1";
  assert.equal(notConfirmedUnavailable(env), "");
  assert.equal((await record(env, { confirmed_at: "2025-06-02T15:00:00.000Z" })).status, 404);
});

test("a confirmed unavailability withdraws the property's proposals, keeps the shortlisted and changes nothing of the listing", async () => {
  const env = world();
  const ana = await searching(env, "Ana Le Gros"), ben = await searching(env, "Ben Le Sueur");
  await shortlist(env, ben);
  const listing = JSON.stringify(rows(env, "SELECT * FROM listings"));
  assert.deepEqual(rows(env, "SELECT resolved_at FROM notifications WHERE category = 'matched'").map(n => n.resolved_at === null), [true, false]);

  const r = await record(env, {}, OTHER);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.deepEqual([r.data.propagates, r.data.current.status, r.data.current.reason, r.data.history[0].reason], [true, "unavailable", "let", "let"]);
  // Found goes, as when the listing is withdrawn; the search itself stays open and its notice is done.
  assert.deepEqual(matches(env, ana), []);
  assert.deepEqual(rows(env, "SELECT stage, search_state, archived_at FROM applicants WHERE id = ?", ana), [{ stage: "searching", search_state: "active", archived_at: null }]);
  assert.equal(rows(env, "SELECT id FROM notifications WHERE category = 'matched' AND resolved_at IS NULL").length, 0);
  // Shortlisted stays with its decision and says why it cannot go ahead.
  const kept = await card(env, ben, "shortlisted");
  assert.deepEqual([kept.status, kept.states.decision, kept.states.availability, kept.listing.availability],
    ["shortlisted", "approved", "confirmed_unavailable", "to_let"]);
  // The listing keeps its published status, its place on the website and is not archived (the trash is EST-19's).
  assert.equal(JSON.stringify(rows(env, "SELECT * FROM listings")), listing);

  // Nothing but a person's newer confirmation proposes it again: not a new search, a saved listing or a recalculation.
  const cat = await searching(env, "Cat Du Feu");
  assert.deepEqual(matches(env, cat), []);
  await recomputeForListing(env, HOME, "system");
  await recomputeForApplicant(env, ana, "system");
  assert.equal((await req(env, "POST", "/admin/matches/recalculate", { phase: "applicants" })).status, 200);
  assert.deepEqual([matches(env, ana), matches(env, cat)], [[], []]);
  // Undo of the shortlist does not bring it back as a proposal either.
  const [{ id }] = rows(env, "SELECT id FROM matches WHERE applicant_id = ?", ben);
  const undone = await req(env, "PUT", `/admin/matches/${id}`, { status: "found", from: "shortlisted" });
  assert.deepEqual([undone.status, undone.data.match, matches(env, ben)], [200, null, []]);

  // Asked again and nobody knows: no longer confirmed, so it is proposed again by the usual recompute.
  assert.equal((await record(env, { status: "unknown", confirmed_at: "2025-07-01T09:00:00.000Z" })).status, 201);
  assert.deepEqual([matches(env, ana), matches(env, ben), matches(env, cat)], [FOUND, FOUND, FOUND]);
  assert.equal((await record(env, { confirmed_at: "2025-08-01T09:00:00.000Z" })).status, 201);
  assert.deepEqual(matches(env, ana), []);
  assert.equal((await record(env, { status: "available", confirmed_at: "2025-09-01T09:00:00.000Z" })).status, 201);
  assert.deepEqual([matches(env, ana), (await card(env, ana, "found")).states.availability], [FOUND, "confirmed"]);
});

test("only the operation confirmed is affected; an older or disputed confirmation excludes nothing", async () => {
  const env = world();
  const tenant = await searching(env, "Ana Le Gros");
  const buyer = await searching(env, "Ben Le Sueur", { operation: "buy", budget_max: 600000 });
  assert.equal((await record(env, { scope: "operation" })).status, 201);
  assert.deepEqual(rows(env, "SELECT operation, reason FROM availability_confirmations"), [{ operation: "rent", reason: "let" }]);
  assert.deepEqual([matches(env, tenant), matches(env, buyer)], [[], []]);
  // The same home offered for sale: the letting's confirmation is not about that.
  env.DB.raw.prepare("UPDATE listings SET operation = 'sale', availability = 'for_sale', sale_price = 500000, rent = NULL, rent_period = NULL WHERE id = ?").run(HOME);
  await recomputeForListing(env, HOME, "system");
  assert.deepEqual([matches(env, tenant), matches(env, buyer)], [[], FOUND]);
  // Back to letting: the confirmation still stands for it. No advert or status change lifted it.
  env.DB.raw.prepare("UPDATE listings SET operation = 'rent', availability = 'to_let', sale_price = NULL, rent = 1800, rent_period = 'month' WHERE id = ?").run(HOME);
  await recomputeForListing(env, HOME, "system");
  assert.deepEqual([matches(env, tenant), matches(env, buyer)], [[], []]);

  // Another home: an unavailability said before its latest "available" is history, not in force.
  seedListing(env, home(ELSEWHERE));
  await recomputeForListing(env, ELSEWHERE, "system");
  const there = [{ listing_id: ELSEWHERE, status: "found" }];
  assert.deepEqual(matches(env, tenant), there);
  await record(env, { status: "available", confirmed_at: "2025-06-10T09:00:00.000Z" }, ADMIN, ELSEWHERE);
  const late = await record(env, { confirmed_at: "2025-06-05T09:00:00.000Z" }, ADMIN, ELSEWHERE);
  assert.deepEqual([late.status, late.data.current.status, matches(env, tenant)], [201, "available", there]);
  // Two of the same moment that disagree: left for a person, and missing certainty is not unavailability.
  const disputed = await record(env, { confirmed_at: "2025-06-10T09:00:00.000Z" }, OTHER, ELSEWHERE);
  assert.deepEqual([disputed.data.current, matches(env, tenant)], [{ status: "unknown", needs_review: true }, there]);
  assert.equal(tasks(env).length, 0);
});

test("each upcoming viewing of the property gets one Inbox task, once, and nothing is cancelled or sent", async () => {
  const env = world();
  seedListing(env, home(ELSEWHERE));
  const requested = viewing(env, { status: "requested", name: "Dora Le Brun" }), confirmed = viewing(env, { name: "Eli Mauger" });
  viewing(env, { date: YESTERDAY }); viewing(env, { status: "cancelled" }); viewing(env, { status: "completed", date: YESTERDAY });
  viewing(env, { listing_id: ELSEWHERE });
  const viewings = JSON.stringify(rows(env, "SELECT * FROM viewing_requests"));

  // Not unavailable, no task.
  await record(env, { status: "available", confirmed_at: "2025-05-01T09:00:00.000Z" });
  assert.equal(tasks(env).length, 0);

  const r = await record(env, {}, OTHER);
  assert.deepEqual([r.status, r.data.notified], [201, 2], JSON.stringify(r.data));
  const [{ id: confirmation }] = rows(env, "SELECT id FROM availability_confirmations WHERE status = 'unavailable'");
  const data = JSON.stringify({ listing_id: HOME, confirmation_id: confirmation });
  const open = { data, actor: OTHER, category: "task", action_required: 1, resolved_at: null };
  assert.deepEqual(tasks(env), [
    { viewing: String(requested), title: "Property confirmed not available: Dora Le Brun", ...open },
    { viewing: String(confirmed), title: "Property confirmed not available: Eli Mauger", ...open }]);
  // The team decides: no viewing is touched, and the evidence text is in no event or notice.
  assert.equal(JSON.stringify(rows(env, "SELECT * FROM viewing_requests")), viewings);
  assert.equal(JSON.stringify([rows(env, "SELECT * FROM events"), rows(env, "SELECT * FROM notifications")]).includes("FIXTURE-EVIDENCE"), false);
  // Hermes relays only new applicants and viewing requests: a task sends nothing.
  assert.equal(rows(env, "SELECT id FROM notifications WHERE category IN ('viewing', 'new_applicant')").length, 0);
  // They reach the Inbox and open their viewing.
  const inbox = await req(env, "GET", "/admin/notifications?box=action&category=task");
  assert.equal(inbox.status, 200, JSON.stringify(inbox.data));
  assert.deepEqual(inbox.data.notifications.map(n => n.link).sort(), [`#/viewings?viewing=${requested}`, `#/viewings?viewing=${confirmed}`].sort());

  // The same click again, and a newer confirmation while the task is still open: no second task.
  const again = await record(env, {}, OTHER);
  assert.deepEqual([again.status, again.data.notified, tasks(env).length], [200, 0, 2]);
  const newer = await record(env, { reason: "sold", confirmed_at: "2025-06-02T15:00:00.000Z" });
  assert.deepEqual([newer.status, newer.data.notified, tasks(env).length], [201, 0, 2]);
  // A viewing booked later is flagged by the next confirmation; one whose task was done is flagged again.
  const later = viewing(env, { name: "Fay Renouf" });
  env.DB.raw.prepare("UPDATE notifications SET resolved_at = ?, resolved_by = ? WHERE event_id IN (SELECT id FROM events WHERE entity_type = 'viewing' AND entity_id = ?)")
    .run(T0, ADMIN, String(requested));
  const third = await record(env, { reason: "withdrawn", confirmed_at: "2025-06-03T15:00:00.000Z" });
  assert.deepEqual([third.data.notified, tasks(env).map(t => t.viewing)], [2, [String(requested), String(requested), String(confirmed), String(later)]]);
});

test("a confirmed unavailability says why; the reason is asked for nothing else", async () => {
  const env = world();
  for (const reason of [undefined, "", "bored"]) {
    const r = await record(env, { reason });
    assert.deepEqual([r.status, Object.keys(r.data.fields ?? {})], [400, ["reason"]], JSON.stringify(r.data));
  }
  const ok = await record(env, { status: "available", reason: "sold", confirmed_at: "2025-05-01T09:00:00.000Z" });
  assert.deepEqual([ok.status, ok.data.current.reason], [201, null]);
  for (const reason of ["sold", "let", "under_offer", "withdrawn", "other"])
    assert.equal((await record(env, { reason })).status, 201, reason);
  assert.deepEqual(rows(env, "SELECT reason FROM availability_confirmations ORDER BY id").map(r => r.reason),
    [null, "sold", "let", "under_offer", "withdrawn", "other"]);
  assert.throws(() => env.DB.raw.prepare(`INSERT INTO availability_confirmations (listing_id, status, reason, confirmed_at, source, channel,
    evidence_ref, recorded_at, recorded_by) VALUES (?, 'unavailable', 'bored', ?, 'owner', 'phone', 'x', ?, 'fixture')`).run(HOME, T0, T0), /CHECK/);
});

test("a shortlisted match of a property confirmed not available is not approved for an enquiry", async () => {
  const env = world();
  const ana = await searching(env, "Ana Le Gros");
  await shortlist(env, ana);
  const approved = e => rows(e, `SELECT m.id FROM matches m JOIN applicants a ON a.id = m.applicant_id
    WHERE ${APPROVED}${notConfirmedUnavailable(e, "m.listing_id", "(SELECT operation FROM listings WHERE id = m.listing_id)")}`).length;
  assert.equal(approved(env), 1);
  await record(env);
  assert.deepEqual([approved(env), matches(env, ana)], [0, [{ listing_id: HOME, status: "shortlisted" }]]);
  assert.equal(approved({ ...env, EST15_UNAVAILABILITY_READY: undefined }), 1, "switched off, the approval reads as before");
  await record(env, { status: "available", confirmed_at: "2025-09-01T09:00:00.000Z" });
  assert.equal(approved(env), 1);
});
