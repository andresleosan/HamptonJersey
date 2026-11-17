// AUT-20 (M13b): the whole search journey over ONE local database, with the real modules and their switches on in
// this test env only: directory and daily sweep, registration of two searches, matching, human review, shared enquiry,
// call, confirmed answer, capture, private presentation, coordinated viewing, criteria dictation, unavailability,
// human close, 21-day internal review and the six-month photo purge. Each check A01–A16 of the reconciliation plan
// (docs/roadmap/2026-11-07-reconciliacion-automatizacion.md §8) records its result and evidence; the last test asserts
// that all of them passed together. The five cross-cutting cases run here too (X1–X5). Email goes only to the simulated
// provider of the existing tests. Synthetic data only; nothing touches production, the network or a real account.
// The steps share one env and run in order (node:test runs a file's tests one after another).
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { makeEnv, seedListing, seedMedia, call, adminCookie, T0 } from "./listing-client.mjs";
import { configure } from "./email-helpers.mjs";
import { extractFeatures } from "../../server/listing-features.js";
import { recomputeForApplicant } from "../../server/search-state.js";
import { recomputeForApplicant as recomputeMatches } from "../../server/match-store.js";
import { SourceReadError, RECOMPUTE_FLAGS, marketSweepPass } from "../../server/market-daily-sweep.js";
import { marketRematchPass } from "../../server/market-rematch.js";
import { callDue, enquiries } from "../../server/consultations.js";
import { ENQUIRY_GATES } from "../../server/routes/matches.js";
import { proposeCriteria } from "../../server/routes/applicants.js";
import { searchReviewPass as reviewTick, ALTERNATIVES_LIMIT } from "../../server/search-review.js";
import { searchReviewClock } from "../../server/search-review-clock.js";
import { purgeDueAt, PURGE_BATCH } from "../../server/property-photo-purge.js";
import worker from "../../server/jobs.js";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test", HOME = "HE-R001";
const DAY = 864e5, TICK = 6e5;
const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const one = (env, sql, ...a) => { const r = env.DB.raw.prepare(sql).get(...a); return r && { ...r }; };
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const n = (env, sql, ...a) => one(env, sql, ...a).n;
const req = async (env, method, path, body, who = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(who) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const iso = ms => new Date(ms).toISOString();
const later = (ts, ms) => iso(Date.parse(ts) + ms);
const ceilTick = ms => iso(Math.ceil(ms / TICK) * TICK);
const { callPass } = enquiries(ENQUIRY_GATES);

// ---- The record of each check: result and evidence ---------------------------------------------------------------
const CHECKS = ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10", "A11", "A12", "A13", "A14", "A15", "A16",
  "X1", "X2", "X3", "X4", "X5"];
const results = new Map();
const passed = (id, testName, evidence) => results.set(id, { status: "pass", test: testName, evidence });
// X1 and X4 collect several pieces of evidence from the steps where they happen.
const pieces = { X1: [], X4: [], X5: [] };

// ---- One world for the journey ---------------------------------------------------------------------------------------
const FLAGS = {
  // directory, inventory, daily sweep, identity, provenance, market matching and rematch (BUS-01/04/07/08/10, EST-01)
  MARKET_INVENTORY_READY: "1", BUS08_SWEEP_READY: "1", BUS10_IDENTITY_READY: "1", BUS07_PROVENANCE_READY: "1",
  BUS01_MARKET_MATCHING_READY: "1", BUS04_REMATCH_READY: "1", EST01_SEARCH_STATE_READY: "1",
  // availability and unavailability (EST-15/16), capture (SPR-03), trash and purge (EST-19)
  EST16_AVAILABILITY_READY: "1", EST15_UNAVAILABILITY_READY: "1", SPR03_CAPTURE_READY: "1", EST19_TRASH_READY: "1", EST19_PURGE_READY: "1",
  // enquiry, send, answers, call tasks (AGE-03/05/06/08)
  AGE03_ENQUIRIES_READY: "1", AGE05_SEND_READY: "1", AGE06_RESPONSES_READY: "1", AGE08_CALL_TASKS_READY: "1",
  // photos for clients, presentation and its review (AGE-10/11/12), counts used by the presentation (SAP-02)
  AGE10_PHOTOS_READY: "1", AGE11_REVIEW_READY: "1", AGE12_PRESENTATIONS_READY: "1", SAP02_COUNTS_READY: "1",
  // viewings (VIS-08/17), 21-day review (BUS-17), dictation (AUT-19), Inbox tabs and quick actions (NOT-08/09)
  VIS08_CYCLE_READY: "1", VIS17_MULTIPART_READY: "1", BUS17_REVIEW_READY: "1", AUT19_CRITERIA_PROPOSALS_READY: "1",
  NOT0809_INBOX_READY: "1",
};
for (const f of RECOMPUTE_FLAGS) assert.equal(FLAGS[f], "1", `${f} is on for the sweep's recompute`);

const env = Object.assign(makeEnv(), FLAGS);
const W = {}; // what the steps hand on to the next ones
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const START = Date.now();
// The review clock is on since yesterday: a search registered now starts its absence at its activation.
run(env, "INSERT INTO search_review_progress (id, enabled_at) VALUES (1, ?)", iso(START - DAY));

// Listings: the journey's home (rent, parking for two, pets allowed), an A01 home with one space, an A02 home that says
// nothing about pets, and two homes for sale for the second search. Ids outside BUS-07's imported range.
const rentHome = (id, description, o = {}) => seedListing(env, { id, title: `Fixture home ${id}`, operation: "rent", availability: "to_let",
  rent: 1800, rent_period: "month", sale_price: null, bedrooms: 2, bathrooms: 2, housing_category: "registered", matchable: 1,
  ...extractFeatures({ description }), parish: "St Helier", location: "St Helier", road_name: "Rue de la Fixture", ...o });
rentHome(HOME, "Parking for two cars. Pets allowed");
rentHome("HE-R002", "Parking for one car. Pets allowed");
rentHome("HE-R003", "Parking for two cars");
for (const [id, price] of [["HE-R004", 700000], ["HE-R005", 650000]]) seedListing(env, { id, title: `Fixture sale ${id}`, operation: "sale",
  availability: "for_sale", sale_price: price, bedrooms: 3, bathrooms: 2, housing_category: "registered", matchable: 1,
  ...extractFeatures({ description: "Parking for two cars" }), parish: "St Saviour", location: "St Saviour" });
// The journey home's own photos: P1 stored, P2 not yet in storage (the capture is partial until it is).
for (const [id, pos] of [["P1", 0], ["P2", 1]]) seedMedia(env, { id, listing_id: HOME, r2_key: `uploads/${id}.png`, thumb_key: null,
  position: pos, label: `Room ${pos + 1}`, origin: "upload", created_by: ADMIN, public: 0 });
env.MEDIA.store.set("uploads/P1.png", { body: PNG, type: "image/png" });

// The source directory: three website sources accepted for the daily sweep.
run(env, "INSERT INTO market_directory_manifests VALUES ('rev-1', ?, '2000-01-01T00:00:00.000Z', 'fixture', 'accepted')", "a".repeat(64));
for (const s of ["agency-a", "agency-b", "agency-c"]) run(env, `INSERT INTO market_sources (source_ref, channel_id, directory_revision,
  source_kind, source_class, access_status, method, policy_version, evidence_ref, retention_ref, reviewed_at, review_due_at, allowed_hosts,
  allowed_paths) VALUES (?, 'site', 'rev-1', 'external', 'general', 'allowed', 'http', 1, 'e', 'r', '2000-01-01T00:00:00.000Z',
  '2999-01-01T00:00:00.000Z', ?, '["/properties"]')`, s, JSON.stringify([`${s}.example.test`]));

// The websites as the sweep reads them: ten adverts a page, the cursor an offset. fail(source, cursor) may throw.
const SITE = { "agency-a": [{ key: "H" }, ...Array.from({ length: 11 }, (_, i) => ({ key: `A-${i + 1}` }))],
  "agency-b": [{ key: "H" }], "agency-c": [{ key: "H" }] };
let failing = () => null;
const reader = { calls: [], async readPage({ source_ref, cursor }) {
  reader.calls.push([source_ref, cursor]);
  const e = failing(source_ref, cursor);
  if (e) throw e;
  const all = SITE[source_ref], start = Number(cursor ?? 0), end = start + 10;
  return { exhausted: end >= all.length, next_cursor: end >= all.length ? null : String(end),
    records: all.slice(start, end).map(({ key, amount = 150000, source_at, operation = "rent", bedrooms = 2 }) => ({ external_key: key,
      ...(source_at && { source_at }), raw: { listing_url: `https://${source_ref}.example.test/properties/${key}` },
      observation: { country_code: "JE", territory_evidence: "Address on the listing: Jersey", operation, title: "Same flat",
        parish: "St Helier", bedrooms, bathrooms: 1, financial_terms: [operation === "sale"
          ? { kind: "sale_price", amount_minor: amount, currency: "GBP", period: "sale" }
          : { kind: "rent", amount_minor: amount, currency: "GBP", period: "month" }] } })) };
} };
const readers = Object.fromEntries(Object.keys(SITE).map(s => [s, reader]));
// Sweep days start two days ahead (leases are compared with the database's own clock); rest() lets each tick claim.
const DAY0 = Date.parse(iso(START + 2 * DAY).slice(0, 10) + "T03:00:00.000Z");
const sweepAt = (day, minutes = 0) => iso(DAY0 + day * DAY + minutes * 6e4);
const rest = () => env.DB.raw.exec(`UPDATE market_source_activity SET last_acquired_at = NULL;
  UPDATE market_source_runs SET next_due = '2000-01-01T00:00:00.000Z' WHERE next_due IS NOT NULL;`);
async function sweepDay(day) {
  for (let i = 0; i < 12; i++) {
    rest();
    const out = await marketSweepPass(env, sweepAt(day, i * 10), { readers });
    if (out.compared) return out;
  }
  assert.fail(`sweep day ${day} did not finish`);
}
const latestObs = (source, key) => one(env, "SELECT observation_id AS id FROM market_latest_observations WHERE source_ref = ? AND external_key = ?",
  source, key).id;
let rematchClock = 0;
async function drainRematch() {
  const outs = [];
  for (let i = 0; i < 10; i++) {
    const out = await marketRematchPass(env, iso(DAY0 + 3 * DAY + ++rematchClock * TICK));
    outs.push(out);
    if (!out.consumed && !out.crossed.length) break;
  }
  return outs;
}

const matchOf = (a, listing) => one(env, "SELECT * FROM matches WHERE applicant_id = ? AND listing_id = ?", a, listing);
const cards = async (a, status) => ok(await req(env, "GET", `/admin/applicants/${a}/matches?status=${status}`)).matches;
const search = a => one(env, "SELECT * FROM applicants WHERE id = ?", a);
const consultation = () => one(env, "SELECT * FROM consultations WHERE id = ?", W.enquiry);
const insertSearch = (contact, o) => {
  const a = { contact_id: contact, stage: "searching", source: "phone", created_at: iso(Date.now()), updated_at: iso(Date.now()), ...o };
  const cols = Object.keys(a);
  return Number(run(env, `INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...Object.values(a)).lastInsertRowid);
};
const contact = (name, email, phone) => Number(run(env, `INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)`, name, email, phone, T0, T0, T0).lastInsertRowid);
const MUSTS = { version: 1, values: { budget: "must", bedrooms: "must", parking: "must" }, unknown: [] };

// ---- Directory and daily sweep ------------------------------------------------------------------------------------
test("A04 · X4 · A03: the sweep keeps a failed source's adverts, retries a partial read once, and three websites stay one home", async () => {
  // Day 0: agency-a's second page fails once; the retry reads it from the same cursor.
  let flaky = 1;
  failing = (s, cursor) => (s === "agency-a" && cursor === "10" && flaky-- > 0) ? new SourceReadError("unavailable") : null;
  await sweepDay(0);
  const run0 = one(env, "SELECT id FROM market_runs WHERE kind = 'daily'").id;
  assert.deepEqual(reader.calls.filter(c => c[0] === "agency-a").map(c => c[1]), [null, "10", "10"], "the retry starts where the read stopped");
  assert.deepEqual(rows(env, `SELECT outcome FROM market_sweep_attempts WHERE run_id = ? AND source_ref = 'agency-a' ORDER BY attempted_at`, run0)
    .map(r => r.outcome), ["page", "unavailable", "complete"]);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_observations"), 14);
  assert.equal(n(env, `SELECT COUNT(*) AS n FROM (SELECT 1 FROM market_observations GROUP BY source_ref, external_key HAVING COUNT(*) > 1)`), 0,
    "no advert read twice");
  pieces.X4.push("partial read: agency-a page 2 failed once, retried from cursor 10, 14 observations, none duplicated");

  // A03: a person says the three adverts are one house; each website keeps its publication.
  const [a, b, c] = ["agency-a", "agency-b", "agency-c"].map(s => latestObs(s, "H"));
  for (const [left, right] of [[a, b], [b, c]]) ok(await req(env, "POST", "/admin/market/identity/decisions", { action: "same_property",
    left_observation_id: left, right_observation_id: right, operation_id: randomUUID() }), 201);
  const homes = ok(await req(env, "GET", "/admin/market/homes")).homes;
  const H = homes.find(h => h.publications.length > 1);
  W.H = H.key;
  assert.deepEqual(H.publications.map(p => p.source_ref).sort(), ["agency-a", "agency-b", "agency-c"]);
  assert.equal(homes.length, 12, "11 single adverts and the one house");
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_listings"), 3, "three publications kept");
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_identity_aliases"), 2);
  passed("A03", "A04 · X4 · A03: the sweep keeps a failed source's adverts…", "GET /admin/market/homes: one home with publications "
    + "agency-a, agency-b, agency-c; market_listings 3; market_identity_aliases 2; only a person's decision joined them");

  // Day 1: agency-b fails every attempt; nothing of it is withdrawn.
  failing = s => (s === "agency-b" ? new SourceReadError("unavailable") : null);
  await sweepDay(1);
  const run1 = one(env, "SELECT id FROM market_runs WHERE kind = 'daily' AND jersey_day = ?", sweepAt(1).slice(0, 10)).id;
  assert.equal(one(env, "SELECT status FROM market_source_runs WHERE run_id = ? AND source_ref = 'agency-b'", run1).status, "blocked");
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_latest_observations WHERE source_ref = 'agency-b' AND gone = 0"), 1);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_sweep_missing"), 0);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_observations WHERE deleted_tombstone = 1"), 0);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM availability_confirmations"), 0, "an unread source confirms nothing");
  assert.equal(ok(await req(env, "GET", "/admin/market/homes")).homes.find(h => h.key === W.H).publications.length, 3);
  assert.match(one(env, "SELECT task_reason FROM notifications WHERE task_key = ?", `bus08:sweep:${run1}`).task_reason,
    /0 adverts not found, 1 sources not read in full/);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_observations"), 27, "one reading per advert per day: history kept");
  assert.equal(n(env, `SELECT COUNT(*) AS n FROM (SELECT 1 FROM market_observations o JOIN market_pages p ON p.id = o.page_id
    GROUP BY p.run_id, o.source_ref, o.external_key HAVING COUNT(*) > 1)`), 0);
  failing = () => null;
  passed("A04", "A04 · X4 · A03: the sweep keeps a failed source's adverts…", "day 1: agency-b blocked after its attempts, its advert "
    + "still gone = 0, market_sweep_missing 0, no tombstone, no confirmation, the home keeps 3 publications, sweep notice "
    + "'0 adverts not found, 1 sources not read in full'");

  // The journey home is that house on agency-a (BUS-07): a person links them before any search exists.
  ok(await req(env, "POST", `/admin/listings/${HOME}/market-link`, { observation_id: latestObs("agency-a", "H"), operation_id: randomUUID() }), 201);
});

// ---- Registration of the searches ----------------------------------------------------------------------------------
test("registration: one household with a rent and a buy search, two other households; nothing contacted", async () => {
  const rent = ok(await req(env, "POST", "/admin/applicants", { name: "Fixture Household One", email: "aut20-one@example.test",
    phone: "+447700900801", operation: "rent", source: "phone", budget_max: 2000, bedrooms_min: 2, parking_spaces: 2,
    pets: [{ kind: "dog", count: 1 }], household_adults: 4, household_children: 0, household_children_status: "known",
    requirement_priorities: { version: 1, values: { budget: "must", bedrooms: "must", parking: "must", pets: "must" }, unknown: [] } }), 201);
  W.one = rent.id;
  W.contactOne = search(W.one).contact_id;
  W.buy = ok(await req(env, "POST", "/admin/applicants", { contact_id: W.contactOne, source: "phone", operation: "buy", budget_max: 600000,
    bedrooms_min: 2 }), 201).id;
  assert.equal(search(W.buy).contact_id, W.contactOne, "two searches of one contact");
  // Household two (three people, no pets) and household three, inserted as the import does, then matched.
  W.two = insertSearch(contact("Fixture Household Two", "aut20-two@example.test", "+447700900802"), { operation: "rent", budget_max: 2000,
    bedrooms_min: 2, parking_spaces: 2, pets: '[{"kind":"none"}]', household_adults: 2, household_children: 1, household_total: 3,
    requirement_priorities: JSON.stringify(MUSTS) });
  W.three = insertSearch(contact("Fixture Household Three", "aut20-three@example.test", "+447700900803"), { operation: "rent",
    budget_max: 2000, bedrooms_min: 2, pets: '[{"kind":"none"}]', household_total: 1 });
  for (const a of [W.two, W.three]) await recomputeForApplicant(env, a, "system");
  for (const a of [W.one, W.buy, W.two, W.three]) assert.deepEqual([search(a).search_state, search(a).archived_at], ["active", null]);
  assert.ok(matchOf(W.two, HOME) && matchOf(W.three, HOME) && matchOf(W.one, HOME));
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_matches WHERE home_key = ?", W.H), 0, "the linked house is the listing, not a market candidate");
});

// ---- Matching -------------------------------------------------------------------------------------------------------
test("A01 · A02: a must-have parking not met is never complete at the top score; unknown pets stay pending", async () => {
  const found = await cards(W.one, "found"), by = l => found.find(m => m.listing.id === l);
  const full = by(HOME), short = by("HE-R002"), quiet = by("HE-R003");
  assert.equal(full.requirements_status, "meets");
  assert.equal(short.score, full.score, "the same (top) score");
  assert.equal(short.requirements_status, "alternative");
  assert.deepEqual(["result", "priority"].map(k => short.checks.find(c => c.key === "parking")[k]), ["fails", "must"]);
  assert.equal(matchOf(W.one, "HE-R002").requirements_rank, 2);
  passed("A01", "A01 · A02: a must-have parking not met…", `HE-R002 (one space, must 2): score ${short.score} = HE-R001's, `
    + "requirements_status alternative, parking check fails/must, requirements_rank 2");
  assert.equal(quiet.requirements_status, "pending");
  assert.equal(quiet.checks.find(c => c.key === "pets").result, "unknown");
  assert.deepEqual([matchOf(W.one, "HE-R003").status, matchOf(W.one, "HE-R003").requirements_rank], ["found", 1], "kept, not excluded");
  passed("A02", "A01 · A02: a must-have parking not met…", "HE-R003 (pets not stated), household with a dog: requirements_status "
    + "pending, pets check unknown, match kept (found, rank 1)");
});

test("A05: without a person's approval no enquiry exists or goes out, after matching and a rematch", async () => {
  await drainRematch();
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM consultations"), 0);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM outbound"), 0);
  assert.ok(rows(env, "SELECT status FROM matches").every(m => m.status === "found"), "nothing approved by itself");
  W.agency = ok(await req(env, "POST", "/admin/advertisers", { name: "Fixture Agency", kind: "agency", channels: [], source_ids: [],
    listing_ids: [HOME], commission: "", photo_permission: "", contacts: [
      { name: "Agency Desk", email: "desk@agency.example.test", phones: [{ label: "Office", number: "01534 000000" },
        { label: "Mobile", number: "07700 900001" }] },
      { name: "Second Desk", email: "", phones: [{ label: "Office", number: "01534 000002" }] }] }), 201).advertiser.id;
  const r = await req(env, "POST", `/admin/matches/${matchOf(W.one, HOME).id}/consultation`, { operation_id: randomUUID(), kind: "general",
    advertiser_id: W.agency });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /approved/i);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM consultations"), 0);
  passed("A05", "A05: without a person's approval…", "after recompute and a BUS-04 rematch: consultations 0, outbound 0, every "
    + "match still found; preparing an enquiry for an unapproved match: 409 'approved'");
});

// ---- Shared enquiry, call and answer ----------------------------------------------------------------------------------
test("A06 · X1: two people approve and prepare at once: one shared enquiry, no mixed data, no summed occupants", async () => {
  for (const a of [W.one, W.two]) ok(await req(env, "PUT", `/admin/matches/${matchOf(a, HOME).id}`, { status: "shortlisted", from: "found" }));
  W.desk = ok(await req(env, "GET", `/admin/matches/${matchOf(W.one, HOME).id}/consultation`)).advertisers[0].contacts.find(c => c.email).key;
  const prepare = (a, who) => req(env, "POST", `/admin/matches/${matchOf(a, HOME).id}/consultation`, { operation_id: randomUUID(),
    kind: "general", advertiser_id: W.agency, contact_key: W.desk }, who);
  const out = await Promise.all([prepare(W.one, ADMIN), prepare(W.two, OTHER)]);
  assert.deepEqual(out.map(r => r.status).sort(), [200, 201]);
  assert.equal(new Set(out.map(r => r.data.consultation.id)).size, 1);
  W.enquiry = out[0].data.consultation.id;
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM consultations"), 1);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM consultation_matches"), 2);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM notifications WHERE task_key LIKE 'consultation:%'"), 1);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'consultation.prepared'"), 1);
  const c = consultation();
  assert.deepEqual([c.status, c.sent_at, c.scope_key], ["manual_pending", null, `general:${HOME}:rent`]);
  pieces.X1.push("two employees prepare the same enquiry at once: [200, 201], one consultation, one task, one event");
  // Stating one household: that household's size, never the sum (4 + 3).
  const put = ok(await req(env, "PUT", `/admin/consultations/${W.enquiry}`, { revision: 1, advertiser_id: W.agency, contact_key: W.desk,
    occupants_match_id: matchOf(W.two, HOME).id }));
  const text = JSON.stringify(put);
  assert.match(text, /household of 3 people/);
  assert.doesNotMatch(text, /household of (4|7) people/);
  const written = JSON.stringify([rows(env, "SELECT * FROM consultations"), rows(env, "SELECT * FROM consultation_matches"),
    rows(env, "SELECT data FROM events WHERE type LIKE 'consultation.%'"),
    rows(env, "SELECT title, task_reason FROM notifications WHERE task_key LIKE 'consultation:%'")]);
  for (const secret of ["Fixture Household", "aut20-", "7700900", "2000", "dog"]) assert.ok(!written.includes(secret), `no ${secret} in the enquiry`);
  passed("A06", "A06 · X1: two people approve and prepare at once…", "one consultation (scope general:HE-R001:rent) for two approved "
    + "matches of two households, prepared at once by two people; the text states 'household of 3 people' for the one chosen, "
    + "never 4 or 7; no name, email, phone, budget or pet in consultations, links, events or tasks");
});

test("A07: two working days after sending, one call task with every phone; the answers update it", async () => {
  const sentAt = iso(Date.now());
  ok(await req(env, "POST", `/admin/consultations/${W.enquiry}/manual-send`, { operation_id: randomUUID(), revision: consultation().revision,
    sent_at: sentAt, via: "email", evidence_ref: "Sent items FIXTURE" }));
  const due = callDue(consultation().sent_at);
  const calls = () => rows(env, "SELECT id, task_key, title, task_reason, due_at, resolved_at FROM notifications WHERE task_key LIKE '%:call'");
  await callPass(env, later(due, -TICK));
  assert.equal(calls().length, 0, "not before two working days");
  for (const ts of [due, later(due, TICK), later(due, 2 * TICK)]) await callPass(env, ts);
  const [task] = calls();
  assert.equal(calls().length, 1, "one task however many passes");
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'consultation.call_due'"), 1);
  assert.deepEqual([task.title, task.due_at, task.resolved_at], [`Call Fixture Agency about Fixture home ${HOME} (${HOME})`, due, null]);
  assert.match(task.task_reason, /3 phone numbers/);
  assert.doesNotMatch(JSON.stringify(task), /01534|07700/, "the task never copies a number");
  const view = ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`)).consultations[0];
  assert.equal(view.call_due_at, due);
  assert.deepEqual(view.recipient.contacts.flatMap(c => c.phones.map(p => p.number)).sort(), ["01534 000000", "01534 000002", "07700 900001"]);
  // NOT-08/09/11: it is in the Inbox as an agency reply with its Call action; a second person claims it as owner.
  const inbox = ok(await req(env, "GET", "/admin/notifications?box=action&category=agency_reply")).notifications.find(i => i.id === task.id);
  assert.deepEqual([inbox.category, inbox.quick], ["agency_reply", "call"]);
  const rev = one(env, "SELECT revision FROM notifications WHERE id = ?", task.id).revision;
  ok(await req(env, "PUT", `/admin/notification-tasks/${task.id}`, { operation_id: randomUUID(), revision: rev, action: "claim" }, OTHER));
  assert.equal(one(env, "SELECT assigned_to FROM notifications WHERE id = ?", task.id).assigned_to, OTHER);
  // No answer on the call: the same task stays open.
  ok(await req(env, "POST", `/admin/consultations/${W.enquiry}/response`, { operation_id: randomUUID(), revision: consultation().revision,
    outcome: "no_answer", answered_at: iso(Date.now()), via: "phone", answered_by: "Desk", evidence_ref: "Call log FIXTURE" }));
  assert.deepEqual([consultation().status, calls().length, calls()[0].resolved_at], ["awaiting_response", 1, null]);
  W.callTask = task.id;
  passed("A07", "A07: two working days after sending…", `sent ${sentAt}; callPass before ${due}: no task; at and after it: one `
    + "task 'consultation:<op>:call' due then, '3 phone numbers' (the three numbers listed live from the directory, never copied), "
    + "Inbox agency_reply/call, claimed by a second person; 'no answer' keeps the same task open");
});

test("A08 · A09 · X4: the confirmed answer updates every match in scope, captures the home, and a partial capture is never complete", async () => {
  const answeredAt = iso(Date.now());
  ok(await req(env, "POST", `/admin/consultations/${W.enquiry}/response`, { operation_id: randomUUID(), revision: consultation().revision,
    outcome: "available", answered_at: answeredAt, via: "phone", answered_by: "Desk", scope: "property", evidence_ref: "Call log FIXTURE" }));
  assert.equal(consultation().status, "answered");
  assert.ok(one(env, "SELECT resolved_at FROM notifications WHERE id = ?", W.callTask).resolved_at, "the useful answer closes the call task");
  const conf = rows(env, "SELECT listing_id, operation, status, source, channel FROM availability_confirmations");
  assert.deepEqual(conf, [{ listing_id: HOME, operation: null, status: "available", source: "agency", channel: "phone" }]);
  for (const a of [W.one, W.two]) {
    const card = (await cards(a, "shortlisted")).find(m => m.listing.id === HOME);
    assert.deepEqual([card.states.enquiry, card.states.availability, card.states.decision], ["answered_available", "confirmed", "approved"]);
    assert.deepEqual([search(a).search_state, matchOf(a, HOME).status], ["active", "shortlisted"]);
  }
  passed("A08", "A08 · A09 · X4: the confirmed answer…", "one availability_confirmations row (agency, phone, property scope); both "
    + "searches' cards: enquiry answered_available, availability confirmed, decision approved; the call task resolved; searches active");

  // A09: that confirmation captured the home once; P2 is not in storage, so it is partial and says so.
  const capture = () => one(env, "SELECT * FROM property_captures WHERE listing_id = ?", HOME);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM property_captures"), 1);
  assert.equal(capture().state, "partial");
  const record = ok(await req(env, "GET", `/admin/listings/${HOME}/captures`)).latest;
  assert.deepEqual([record.state, record.counts.stored, record.counts.files], ["partial", 1, 2]);
  const partialJson = await req(env, "GET", `/admin/property-captures/${capture().id}/data.json`);
  assert.equal(partialJson.data.complete, false);
  assert.match(partialJson.headers.get("cache-control"), /no-store/);
  const task = () => rows(env, "SELECT title, resolved_at FROM notifications WHERE task_key LIKE 'work:capture:listing:%'");
  assert.deepEqual(task().map(t => t.title), ["Open property record: capture partial (1 of 2 files)"]);
  // The file arrives; "Check files again" completes the same capture, same assets, one task.
  env.MEDIA.store.set("uploads/P2.png", { body: PNG, type: "image/png" });
  ok(await req(env, "POST", `/admin/property-captures/${capture().id}/check`, {}));
  ok(await req(env, "POST", `/admin/property-captures/${capture().id}/check`, {}));
  assert.equal(capture().state, "complete");
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM property_captures"), 1);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM property_capture_assets"), 2);
  assert.equal(task().length, 1);
  assert.match(task()[0].title, /capture complete \(2 files\)/);
  const asset = one(env, "SELECT id FROM property_capture_assets WHERE capture_id = ? AND state = 'stored' ORDER BY id LIMIT 1", capture().id).id;
  const file = await req(env, "GET", `/admin/property-captures/${capture().id}/files/${asset}`);
  assert.equal(file.status, 200);
  assert.match(file.headers.get("content-disposition") ?? "", /attachment/);
  const full = await req(env, "GET", `/admin/property-captures/${capture().id}/data.json`);
  assert.equal(full.data.complete, true);
  assert.match((await req(env, "GET", `/admin/property-captures/${capture().id}/data.csv`)).text, /\r\ncomplete,yes\r\n/);
  assert.deepEqual(rows(env, "SELECT json_extract(data, '$.state') AS s FROM events WHERE type = 'listing.captured' ORDER BY id").map(e => e.s),
    ["partial", "complete"], "one event per change of state, none for the repeated check");
  W.capture = capture().id;
  pieces.X4.push("partial capture: P2 missing → partial (1 of 2), data.json complete:false; file restored + two checks → same "
    + "capture complete, 2 assets, 1 task, events [partial, complete]");
  passed("A09", "A08 · A09 · X4: the confirmed answer…", "the agency's confirmation captured HE-R001 once: partial (1 of 2 files) "
    + "with data.json complete:false and its task; after the file arrived and a re-check: complete, data.csv 'complete,yes', "
    + "same capture and assets; downloads no-store");
});

// ---- Presentation and viewing -----------------------------------------------------------------------------------------
test("presentation (AGE-10/11/12): the reviewed snapshot is sent by a person and the client asks to view", async () => {
  for (const media of ["P1", "P2"]) {
    const asset = one(env, "SELECT id FROM property_capture_assets WHERE media_id = ? ORDER BY id DESC", media).id;
    ok(await req(env, "POST", "/admin/photo-permissions", { asset_id: asset, version: 0, status: "private_approved", basis: "own" }));
  }
  const g = ok(await req(env, "POST", `/admin/applicants/${W.one}/presentations`, { match_ids: [matchOf(W.one, HOME).id] }), 201);
  const review = ok(await req(env, "GET", `/admin/presentations/${g.id}/review`));
  assert.deepEqual(review.blockers, []);
  ok(await req(env, "POST", `/admin/presentations/${g.id}/approve`, { snapshot_hash: review.snapshot_hash, version: review.approval?.version ?? 0 }));
  ok(await req(env, "POST", `/admin/presentations/${g.id}/sent`, {}));
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM outbound"), 0, "a person sends the link; the app sends nothing");
  const s = await call(env, "POST", "/presentation/session", { body: { token: new URL(g.link).hash.slice(1) } });
  assert.equal(s.status, 200, s.text);
  const cookie = s.headers.get("set-cookie").split(";")[0];
  const options = ok(await call(env, "GET", "/presentation/options", { cookie }));
  assert.match(JSON.stringify(options), new RegExp(HOME));
  ok(await call(env, "POST", "/presentation/respond", { cookie, body: { match_id: matchOf(W.one, HOME).id, choice: "request_viewing" } }));
  assert.equal(search(W.one).search_state, "active");
});

const nextWeekday = (day, after) => { // a Jersey date string `after` days or more from now that falls on `day` (0 Sunday)
  const d = new Date(Date.now() + after * DAY);
  while (d.getUTCDay() !== day) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

test("A10 · A11: the agency's proposal waits for every confirmation; a confirmed and completed viewing keeps the search active", async () => {
  const WED = nextWeekday(3, 3);
  const before = rows(env, "SELECT id, search_state, stage, archived_at FROM applicants ORDER BY id");
  const v = ok(await req(env, "POST", `/admin/applicants/${W.one}/viewing-proposals`, { listing_id: HOME, kind: "In person", negotiator_id: 2,
    date: WED, time: "11:00", staff: true }), 201).id;
  const viewing = () => one(env, "SELECT * FROM viewing_requests WHERE id = ?", v);
  const p = one(env, "SELECT * FROM viewing_proposals WHERE viewing_id = ?", v);
  assert.deepEqual(JSON.parse(p.required), ["client", "advertiser", "staff"]);
  assert.equal(p.applicant_id, W.one);
  const answer = participant => req(env, "POST", `/admin/viewings/${v}/proposals/${p.id}/responses`, { revision: p.revision, participant,
    response: "accepted", channel: "phone", answered_at: iso(Date.now()) });
  const a = ok(await answer("client"));
  assert.deepEqual([a.confirmed, a.coordination_state], [false, "awaiting_confirmations"]);
  assert.equal(ok(await answer("staff")).confirmed, false);
  assert.equal((await req(env, "PUT", `/admin/viewings/${v}`, { action: "confirm", updated_at: viewing().updated_at })).status, 409,
    "Confirm cannot skip the agency");
  assert.equal(viewing().status, "requested");
  const last = ok(await answer("advertiser"));
  assert.equal(last.confirmed, true);
  assert.deepEqual([viewing().status, viewing().date, viewing().time], ["confirmed", WED, "11:00"]);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM events WHERE entity_type = 'viewing' AND entity_id = ? AND type = 'viewing.confirmed'", String(v)), 1);
  passed("A10", "A10 · A11: the agency's proposal waits…", "SAP-09/VIS-17 proposal (client, advertiser, staff) stays requested "
    + "after the client's and staff's acceptance, plain Confirm 409; confirmed only after the advertiser's, one viewing.confirmed event");
  // VIS-08: completed with the client's answer; nothing about the searches changes.
  ok(await req(env, "PUT", `/admin/viewings/${v}`, { action: "complete", outcome: null, updated_at: viewing().updated_at }));
  ok(await req(env, "PUT", `/admin/viewings/${v}`, { action: "feedback", outcome: "more_info", outcome_note: "Asked about the garden",
    updated_at: viewing().updated_at }));
  assert.equal(viewing().status, "completed");
  assert.deepEqual(rows(env, "SELECT id, search_state, stage, archived_at FROM applicants ORDER BY id"), before);
  W.viewing = v;
  passed("A11", "A10 · A11: the agency's proposal waits…", "after confirmed, completed and feedback, every search (both of "
    + "household one included) keeps search_state active, stage and archive unchanged");
});

// ---- Dictation ------------------------------------------------------------------------------------------------------------
test("A13 · X1: a dictated change waits for a person; two people confirming at once apply it once", async () => {
  const criteria = () => one(env, "SELECT budget_max, bedrooms_min, requirement_priorities, search_state, match_inputs_revision FROM applicants WHERE id = ?", W.two);
  const before = criteria(), matchesBefore = rows(env, "SELECT * FROM matches WHERE applicant_id = ? ORDER BY id", W.two);
  await proposeCriteria(env, W.two, { changes: { budget_max: 2200 }, note: "Voice note" }, "hermes", "hermes");
  assert.deepEqual(criteria(), before, "a dictation changes nothing by itself");
  assert.deepEqual(rows(env, "SELECT * FROM matches WHERE applicant_id = ? ORDER BY id", W.two), matchesBefore);
  const proposal = one(env, "SELECT * FROM criteria_proposals WHERE applicant_id = ?", W.two);
  assert.deepEqual([proposal.status, proposal.source], ["pending", "hermes"]);
  assert.equal(one(env, "SELECT title FROM notifications WHERE task_key = ?", `work:dictation:applicant:${W.two}:criteria-proposal`).title,
    "Confirm proposed criteria changes");
  const updated = search(W.two).updated_at;
  const out = await Promise.all([ADMIN, OTHER].map(who => req(env, "POST", `/admin/applicants/${W.two}/criteria-proposals/${proposal.id}/confirm`,
    { updated_at: updated }, who)));
  assert.deepEqual(out.map(r => r.status).sort(), [200, 409]);
  assert.equal(criteria().budget_max, 2200);
  assert.equal(criteria().match_inputs_revision, before.match_inputs_revision + 1);
  assert.equal(criteria().bedrooms_min, before.bedrooms_min);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'applicant.updated' AND entity_id = ?", String(W.two)), 1);
  assert.equal(one(env, "SELECT status FROM criteria_proposals WHERE id = ?", proposal.id).status, "confirmed");
  pieces.X1.push("two employees confirm the same dictated proposal at once: [200, 409], one applicant.updated event");
  passed("A13", "A13 · X1: a dictated change waits…", "Hermes' proposal (budget 2,200) left criteria and matches unchanged with "
    + "a 'Confirm proposed criteria changes' task; confirmed by a person: applied once, revision +1, other must-haves unchanged");
});

// ---- Close one search; the property becomes unavailable; the next day's sweep --------------------------------------------
test("A16 · A14: a person closes one search; the home is confirmed not available; the next sweep and rematch keep both decisions", async () => {
  // A16: household one found its home; its buy search and the other households go on.
  const matchesBefore = rows(env, "SELECT * FROM matches WHERE applicant_id = ? ORDER BY id", W.one);
  ok(await req(env, "POST", `/admin/applicants/${W.one}/search`, { state: "resolved", reason: "Found a property", updated_at: search(W.one).updated_at }));
  assert.deepEqual([search(W.one).search_state, search(W.buy).search_state, search(W.two).search_state, search(W.three).search_state],
    ["resolved", "active", "active", "active"]);

  // A14: the agency says it is let; found matches leave, approved ones say so; nothing old brings it back.
  assert.ok(matchOf(W.three, HOME), "household three had it as found");
  ok(await req(env, "POST", `/admin/listings/${HOME}/availability`, { status: "unavailable", reason: "let", confirmed_at: iso(Date.now()),
    source: "agency", channel: "phone", evidence_ref: "Call note FIXTURE", scope: "property" }), 201);
  W.unavailableAt = one(env, "SELECT confirmed_at FROM availability_confirmations WHERE status = 'unavailable'").confirmed_at;
  assert.equal(matchOf(W.three, HOME), undefined, "a found match leaves the proposals");
  const card = (await cards(W.two, "shortlisted")).find(m => m.listing.id === HOME);
  assert.equal(card.states.availability, "confirmed_unavailable");

  // The next day: agency-a still publishes the house with an older reading; a new sale advert appears on agency-c.
  SITE["agency-a"][0] = { key: "H", amount: 120000, source_at: iso(Date.parse(W.unavailableAt) - DAY) };
  SITE["agency-c"].push({ key: "S-1", operation: "sale", amount: 50000000 });
  SITE["agency-b"].push({ key: "R-1" }); // a new flat to let: for the rent searches still open
  const houseChanges = () => n(env, `SELECT COUNT(*) AS n FROM market_change_outbox x JOIN market_observations o ON o.id = x.observation_id
    WHERE o.source_ref = 'agency-a' AND o.external_key = 'H'`);
  const outboxBefore = houseChanges();
  await sweepDay(2);
  await drainRematch();
  await recomputeForApplicant(env, W.three, "system");
  assert.equal(houseChanges(), outboxBefore, "an older reading is not a change");
  assert.equal(matchOf(W.three, HOME), undefined, "not back after the sweep, the rematch or a recompute");
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_matches WHERE home_key = ?", W.H), 0);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_match_proposals WHERE home_key = ?", W.H), 0);
  assert.equal(one(env, "SELECT status FROM availability_confirmations ORDER BY id DESC LIMIT 1").status, "unavailable");
  passed("A14", "A16 · A14: a person closes one search…", "unavailable (let) by the agency: household three's found match deleted, "
    + "household two's approved card confirmed_unavailable; agency-a's older reading of the house wrote no change, and after the "
    + "sweep, rematch and recompute no match, market match or proposal brought it back");

  // A16 again: the sweep's new sale advert reaches the open buy search only; the closed search keeps its history.
  const sale = rows(env, "SELECT applicant_id, home_key FROM market_matches WHERE home_key LIKE '%S-1%'");
  assert.deepEqual(sale.map(m => m.applicant_id), [W.buy]);
  assert.equal(n(env, `SELECT COUNT(*) AS n FROM notifications nt JOIN events e ON e.id = nt.event_id WHERE e.entity_type = 'applicant'
    AND e.entity_id = ? AND e.type = 'applicant.market_matched'`, String(W.buy)), 1);
  const rentAdvert = rows(env, "SELECT applicant_id FROM market_matches WHERE home_key LIKE '%R-1%' ORDER BY applicant_id").map(m => m.applicant_id);
  assert.ok(rentAdvert.length >= 1 && rentAdvert.every(a => [W.two, W.three].includes(a)), `the new flat reached open rent searches only: ${rentAdvert}`);
  assert.equal(n(env, `SELECT COUNT(*) AS n FROM events WHERE entity_type = 'applicant' AND entity_id = ? AND type = 'applicant.market_matched'
    AND at > ?`, String(W.one), W.unavailableAt), 0, "no notice for the closed search");
  const kept = rows(env, "SELECT * FROM matches WHERE applicant_id = ? ORDER BY id", W.one);
  assert.deepEqual(kept.map(m => [m.listing_id, m.status]), matchesBefore.map(m => [m.listing_id, m.status]), "the closed search's matches stay");
  assert.equal(search(W.one).search_state, "resolved", "nothing reopens it");
  passed("A16", "A16 · A14: a person closes one search…", "household one's rent search resolved by a person; its buy search and "
    + "two other searches stay active; the next day's sweep crossed the new sale advert S-1 with the buy search only (one notice) "
    + "and the new flat R-1 with the open rent searches only, nothing for the closed one; "
    + "the closed search's matches are kept and it stays resolved");
});

// ---- 21-day internal review ---------------------------------------------------------------------------------------------
// The review clock's own wrapper (bus-17 tests): each tick as if the previous one ran ten minutes earlier.
const tickReview = ts => { run(env, "UPDATE search_review_progress SET last_tick_at = ? WHERE id = 1", later(ts, -TICK)); return reviewTick(env, ts); };

test("A12 · X1 · X5: on Jersey day 21 one internal review with at most 20 alternatives, nothing sent or changed; again 7 days after its close", async t => {
  await recomputeForApplicant(env, W.buy, "system");
  const first = ceilTick(Date.now());
  await tickReview(first);
  const cycle = one(env, "SELECT * FROM search_review_cycles WHERE applicant_id = ?", W.buy);
  assert.equal(cycle.state, "absent");
  const due = searchReviewClock({ now: first, fullAvailable: false, absence: { at: cycle.no_full_since, source: cycle.source }, review: null }).dueAt;
  const dueTick = ceilTick(Date.parse(due));
  const criteria = () => one(env, "SELECT budget_max, bedrooms_min, requirement_priorities, search_state, stage FROM applicants WHERE id = ?", W.buy);
  const before = { criteria: criteria(), matches: rows(env, "SELECT id, status FROM matches WHERE applicant_id = ? ORDER BY id", W.buy),
    outbound: n(env, "SELECT COUNT(*) AS n FROM outbound"), proposals: n(env, "SELECT COUNT(*) AS n FROM criteria_proposals") };
  const reviews = () => rows(env, "SELECT * FROM search_reviews WHERE applicant_id = ? ORDER BY id", W.buy);
  await tickReview(later(dueTick, -TICK));
  assert.equal(reviews().length, 0, "not before day 21");
  // X1: two clock ticks at once.
  const outs = await Promise.all([tickReview(dueTick), reviewTick(env, dueTick)]);
  assert.equal(reviews().length, 1, "two ticks at once open one review for this search");
  assert.equal(outs.reduce((s, o) => s + (o.opened ?? 0), 0), n(env, "SELECT COUNT(*) AS n FROM search_reviews"),
    "every opening counted once across both ticks (the other open searches are due the same day)");
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM (SELECT applicant_id FROM search_reviews WHERE closed_at IS NULL GROUP BY applicant_id HAVING COUNT(*) > 1)"), 0);
  await tickReview(later(dueTick, TICK));
  await tickReview(later(dueTick, DAY));
  assert.equal(reviews().length, 1, "one open review per search");
  const r = reviews()[0];
  const alternatives = JSON.parse(r.alternatives);
  assert.ok(alternatives.length >= 1 && alternatives.length <= ALTERNATIVES_LIMIT && ALTERNATIVES_LIMIT === 20);
  const tasks = () => rows(env, "SELECT id, title, task_reason, resolved_at FROM notifications WHERE task_key LIKE 'bus17:review:%' AND title LIKE '%Household One%' ORDER BY id");
  assert.equal(tasks().length, 1);
  assert.match(tasks()[0].task_reason, /Nothing was sent and the criteria did not change\.$/);
  assert.deepEqual({ criteria: criteria(), matches: rows(env, "SELECT id, status FROM matches WHERE applicant_id = ? ORDER BY id", W.buy),
    outbound: n(env, "SELECT COUNT(*) AS n FROM outbound"), proposals: n(env, "SELECT COUNT(*) AS n FROM criteria_proposals") }, before);
  pieces.X1.push("two review ticks at once at day 21: one review and one task for the search, openings across both ticks = reviews stored, never two open per search");
  // NOT-09: on day 21, an hour after it opened, two people press Done at once; one wins.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(dueTick) + 3600e3 });
  const task = tasks()[0], rev = one(env, "SELECT revision FROM notifications WHERE id = ?", task.id).revision;
  const done = await Promise.all([ADMIN, OTHER].map(who => req(env, "PUT", `/admin/notification-tasks/${task.id}`,
    { operation_id: randomUUID(), revision: rev, action: "done" }, who)));
  assert.deepEqual(done.map(d => d.status).sort(), [200, 409]);
  t.mock.timers.reset();
  pieces.X1.push("two employees press Done on the review task at once: [200, 409]");
  const closedAt = one(env, "SELECT resolved_at FROM notifications WHERE id = ?", task.id).resolved_at;
  await tickReview(later(dueTick, 2 * DAY));
  assert.deepEqual([reviews()[0].outcome, reviews()[0].closed_at], ["reviewed", closedAt]);
  const next = ceilTick(Date.parse(closedAt) + 7 * DAY);
  await tickReview(later(next, -TICK));
  assert.equal(reviews().length, 1);
  await tickReview(next);
  await tickReview(later(next, TICK));
  assert.deepEqual(reviews().map(x => [x.episode, x.cycle, x.closed_at === null]), [[1, 1, false], [1, 2, true]]);
  assert.match(tasks().at(-1).title, /Search review \(7 days on\)/);
  pieces.X5.push(`BUS-17 integrated: absence ${cycle.no_full_since} → due ${due} (Jersey wall clock + 21 days), nothing at the tick before`);
  passed("A12", "A12 · X1 · X5: on Jersey day 21…", `buy search: no review before ${dueTick}, one at it (two ticks at once), `
    + `${alternatives.length} internal alternatives (≤ 20), task text 'Nothing was sent and the criteria did not change.', criteria, `
    + "matches, outbound and proposals unchanged; closed by Done, the next review opened 7 days later (cycle 2)");
});

// ---- Six months later: the photo purge ---------------------------------------------------------------------------------
test("A15 · X4 · X5: six calendar months after the confirmation only the external photos go, in batches; history stays", async t => {
  // The house's external reference copies (BUS-07 adverts), added after the capture; 22 of them: more than one batch.
  for (let i = 1; i <= 22; i++) {
    const m = seedMedia(env, { id: `E${i}`, listing_id: HOME, r2_key: `ext/E${i}.jpg`, thumb_key: `thumbs/ext/E${i}.jpg`, origin: "external",
      public: 0, position: 10 + i, label: `Advert photo ${i}` });
    for (const k of [m.r2_key, m.thumb_key]) env.MEDIA.store.set(k, { body: new Uint8Array([1]), type: "image/jpeg" });
  }
  seedMedia(env, { id: "DOC1", listing_id: HOME, r2_key: "ext/brochure.pdf", thumb_key: null, origin: "external", kind: "document", public: 0, position: 40 });
  env.MEDIA.store.set("ext/brochure.pdf", { body: new Uint8Array([1]), type: "application/pdf" });
  ok(await req(env, "POST", `/admin/listings/${HOME}/unpublish`));
  const due = purgeDueAt(W.unavailableAt);
  assert.ok(due);
  const keep = { history: n(env, "SELECT COUNT(*) AS n FROM events"), confirmations: rows(env, "SELECT * FROM availability_confirmations"),
    captures: rows(env, "SELECT * FROM property_capture_assets"), consultations: rows(env, "SELECT * FROM consultations"),
    viewings: rows(env, "SELECT id, status FROM viewing_requests"), applicants: rows(env, "SELECT id, search_state FROM applicants ORDER BY id") };
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(due) - 1 });
  const early = ok(await req(env, "GET", "/admin/trash")).listings.find(l => l.id === HOME);
  assert.deepEqual([early.due_at, early.due], [due, false]);
  assert.equal(ok(await req(env, "POST", "/admin/trash/purge")).deleted, 0, "not a millisecond early");
  t.mock.timers.setTime(Date.parse(due));
  const batches = [];
  for (let i = 0; i < 3; i++) batches.push(ok(await req(env, "POST", "/admin/trash/purge")).deleted);
  assert.deepEqual(batches, [PURGE_BATCH, 2, 0]);
  const left = rows(env, "SELECT id FROM media WHERE listing_id = ? ORDER BY id", HOME).map(m => m.id);
  assert.deepEqual(left, ["DOC1", "P1", "P2"], "own photos (captured) and the document stay");
  assert.ok([...env.MEDIA.store.keys()].every(k => !/^(thumbs\/)?ext\/E\d+\.jpg$/.test(k)), "every external file and thumbnail gone");
  for (const k of ["uploads/P1.png", "uploads/P2.png", "ext/brochure.pdf"]) assert.ok(env.MEDIA.store.has(k), `${k} kept`);
  const purged = rows(env, "SELECT data FROM events WHERE type = 'listing.photos_purged' AND entity_id = ?", HOME);
  assert.equal(purged.length, 2);
  assert.equal(purged.flatMap(e => JSON.parse(e.data).media_ids).length, 22);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM events"), keep.history + 2, "history kept: only the purge's two events are new");
  assert.deepEqual([rows(env, "SELECT * FROM availability_confirmations"), rows(env, "SELECT * FROM property_capture_assets"),
    rows(env, "SELECT * FROM consultations"), rows(env, "SELECT id, status FROM viewing_requests"),
    rows(env, "SELECT id, search_state FROM applicants ORDER BY id")],
  [keep.confirmations, keep.captures, keep.consultations, keep.viewings, keep.applicants]);
  assert.ok(one(env, "SELECT id FROM listings WHERE id = ?", HOME), "the listing stays");
  pieces.X4.push(`partial purge: 22 due photos → ${PURGE_BATCH}, then 2, then 0; one photos_purged event per click, no file left`);
  pieces.X5.push(`EST-19 integrated: unavailable at ${W.unavailableAt} → purge due ${due} (six Jersey calendar months); 1 ms before: nothing`);
  passed("A15", "A15 · X4 · X5: six calendar months…", `at ${due} (not 1 ms before) only the 22 external photos and their thumbnails `
    + "went (20 + 2), the captured own photos and the PDF stayed; confirmations, capture assets, enquiry, viewing, searches and "
    + "every earlier event unchanged; two listing.photos_purged events");
});

// ---- X2 · X3: the email path, on its own provider ------------------------------------------------------------------------
// A second, small world: the same modules with AGE-05's email path and the simulated provider of the existing tests.
async function sendWorld() {
  const e = Object.assign(makeEnv(), { AGE03_ENQUIRIES_READY: "1", EST16_AVAILABILITY_READY: "1", EST15_UNAVAILABILITY_READY: "1",
    AGE05_SEND_READY: "1", EMAIL_SERVICE_READY: "true" });
  e.sent = [];
  e.EMAIL = { async send(message) { e.sent.push(message); return { messageId: `provider-${e.sent.length}` }; } };
  configure(e, { summary: false, recipients: [] });
  const at = iso(Date.now());
  e.DB.raw.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('email_worker', ?, ?, 'system')`)
    .run(JSON.stringify({ at, ready: true }), at);
  seedListing(e, { id: HOME, title: "Fixture home", operation: "rent", availability: "to_let", rent: 1800, rent_period: "month", sale_price: null,
    bedrooms: 2, bathrooms: 2, housing_category: "registered", matchable: 1, ...extractFeatures({ description: "Parking for two cars" }),
    parish: "St Helier", location: "St Helier" });
  const agency = ok(await call(e, "POST", "/admin/advertisers", { cookie: await adminCookie(), body: { name: "Fixture Agency", kind: "agency",
    channels: [], source_ids: [], listing_ids: [HOME], commission: "", photo_permission: "",
    contacts: [{ name: "Agency Desk", email: "desk@agency.example.test", phones: [] }] } }), 201).advertiser.id;
  const c = Number(e.DB.raw.prepare(`INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at)
    VALUES ('Fixture Sender', 'aut20-send@example.test', '+447700900899', ?, ?, ?)`).run(T0, T0, T0).lastInsertRowid);
  const a = Number(e.DB.raw.prepare(`INSERT INTO applicants (contact_id, operation, stage, source, budget_max, bedrooms_min, parking_spaces,
    pets, created_at, updated_at, requirement_priorities) VALUES (?, 'rent', 'searching', 'phone', 2000, 2, 2, '[{"kind":"none"}]', ?, ?, ?)`)
    .run(c, T0, T0, JSON.stringify(MUSTS)).lastInsertRowid);
  await recomputeMatches(e, a, "system");
  const m = e.DB.raw.prepare("SELECT id FROM matches WHERE applicant_id = ?").get(a).id;
  const as = async (method, path, body, who = ADMIN) => call(e, method, path, { body, cookie: await adminCookie(who) });
  ok(await as("PUT", `/admin/matches/${m}`, { status: "shortlisted", from: "found" }));
  const desk = ok(await as("GET", `/admin/matches/${m}/consultation`)).advertisers[0].contacts.find(x => x.email).key;
  const id = ok(await as("POST", `/admin/matches/${m}/consultation`, { operation_id: randomUUID(), kind: "general", advertiser_id: agency,
    contact_key: desk }), 201).consultation.id;
  ok(await as("POST", `/admin/consultations/${id}/approve-sending`, { revision: 1 }));
  const tick = () => worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() }, { DB: e.DB, MEDIA: e.MEDIA, EMAIL: e.EMAIL,
    EMAIL_SERVICE_READY: e.EMAIL_SERVICE_READY, AGE05_SEND_READY: e.AGE05_SEND_READY }, { waitUntil() {} });
  const get = sql => e.DB.raw.prepare(sql).all().map(x => ({ ...x }));
  return { e, id, as, tick, get };
}
const toDesk = e => e.sent.filter(m => m.to === "desk@agency.example.test").length;

test("X2: a material change after approval and before sending: nothing goes out and the new version needs a new approval", async () => {
  const { e, id, as, tick, get } = await sendWorld();
  ok(await as("POST", `/admin/consultations/${id}/send-email`, { revision: 1 }));
  e.DB.raw.prepare("UPDATE listings SET rent = 1700 WHERE id = ?").run(HOME); // the price changes while it waits in the queue
  await tick();
  assert.equal(toDesk(e), 0, "nothing sent");
  const [c] = get("SELECT status, revision, approved_revision, sent_at FROM consultations");
  assert.deepEqual([c.status, c.revision, c.sent_at], ["manual_pending", 2, null]);
  assert.deepEqual(get("SELECT status FROM outbound").map(o => o.status), ["cancelled"]);
  assert.equal((await as("POST", `/admin/consultations/${id}/send-email`, { revision: 2 })).status, 409, "approve this version first");
  assert.equal(get("SELECT COUNT(*) AS n FROM events WHERE type = 'consultation.email_not_sent'")[0].n, 1);
  passed("X2", "X2: a material change after approval…", "approved and queued, then the rent changed: the tick sent nothing, outbound "
    + "cancelled, the enquiry back to manual_pending at revision 2 with no send date; sending revision 2 without a new approval: 409");
});

test("X3: the provider accepts but the acknowledgement is lost: one email only, and a person settles it", async () => {
  const { e, id, as, tick, get } = await sendWorld();
  // Two employees press Send at once: one queued email.
  const out = await Promise.all([ADMIN, OTHER].map(who => as("POST", `/admin/consultations/${id}/send-email`, { revision: 1 }, who)));
  assert.deepEqual(out.map(r => r.status), [200, 200]);
  assert.equal(get("SELECT COUNT(*) AS n FROM outbound")[0].n, 1);
  pieces.X1.push("two employees press Send email at once: one outbound row");
  const real = e.DB.prepare.bind(e.DB);
  e.DB.prepare = sql => { const s = real(sql); return sql.includes("SET status = 'accepted'")
    ? { ...s, bind: () => ({ run: async () => { throw new Error("D1 unavailable"); } }) } : s; };
  await tick();
  e.DB.prepare = real;
  assert.equal(toDesk(e), 1);
  assert.deepEqual(get("SELECT status FROM outbound").map(o => o.status), ["unknown"]);
  assert.deepEqual(get("SELECT status, sent_at FROM consultations").map(c => [c.status, c.sent_at]), [["needs_review", null]]);
  // Retries: the same send again, more ticks: still one email.
  ok(await as("POST", `/admin/consultations/${id}/send-email`, { revision: 1 }));
  await tick(); await tick();
  assert.equal(toDesk(e), 1, "never a second email");
  assert.equal(get("SELECT COUNT(*) AS n FROM outbound")[0].n, 1);
  // A person who checked the mailbox says it went.
  ok(await as("POST", `/admin/consultations/${id}/email-outcome`, { revision: 1, sent: true }));
  assert.deepEqual(get("SELECT status, sent_via FROM consultations").map(c => [c.status, c.sent_via]), [["sent", "email"]]);
  assert.equal((await as("POST", `/admin/consultations/${id}/email-outcome`, { revision: 1, sent: true })).status, 409);
  passed("X3", "X3: the provider accepts but the acknowledgement is lost…", "provider accepted, the 'accepted' write failed: outbound "
    + "unknown, enquiry needs_review; resend and two more ticks: still 1 email and 1 outbound row; a person confirmed it was sent "
    + "(status sent by email), a second answer 409");
});

// ---- X5: Jersey calendar edges on the real clocks ---------------------------------------------------------------------------
test("X5: Jersey dates: day 21, the 7-day repeat, the call's two working days and six calendar months across DST and month ends", () => {
  const review = (at, now = later(at, 30 * DAY)) => searchReviewClock({ now, fullAvailable: false, absence: { at, source: "activation" }, review: null }).dueAt;
  for (const [absence, due] of [
    ["2026-10-07T10:00:00.000Z", "2026-10-28T11:00:00.000Z"], // across the autumn change: the same Jersey 11:00 → 10:00 wall time
    ["2026-03-20T10:00:00.000Z", "2026-04-10T09:00:00.000Z"], // across the spring change
    ["2026-02-08T09:00:00.000Z", "2026-03-01T09:00:00.000Z"], // 28-day February
    ["2028-02-08T12:00:00.000Z", "2028-02-29T12:00:00.000Z"], // leap year
    ["2026-06-30T23:30:00.000Z", "2026-07-21T23:30:00.000Z"], // the Jersey date (1 July), not the UTC date
    ["2026-03-08T01:30:00.000Z", "2026-03-29T01:00:00.000Z"], // lands in the spring gap: the first valid instant
    ["2026-10-04T00:30:00.000Z", "2026-10-25T00:30:00.000Z"], // lands in the autumn fold: the first occurrence
    ["2026-12-31T23:59:59.999Z", "2027-01-21T23:59:59.999Z"], // year end
  ]) assert.equal(review(absence), due, `21 days from ${absence}`);
  const repeat = closedAt => searchReviewClock({ now: later(closedAt, 30 * DAY), fullAvailable: false,
    absence: { at: "2026-01-01T10:00:00.000Z", source: "activation" }, review: { status: "closed", closedAt } }).dueAt;
  assert.equal(repeat("2026-10-21T10:00:00.000Z"), "2026-10-28T11:00:00.000Z");
  assert.equal(repeat("2026-03-25T10:00:00.000Z"), "2026-04-01T09:00:00.000Z");
  const boundary = searchReviewClock({ now: iso(Date.parse("2026-10-28T11:00:00.000Z") - 1), fullAvailable: false,
    absence: { at: "2026-10-07T10:00:00.000Z", source: "activation" }, review: null });
  assert.equal(boundary.state, "waiting", "1 ms before day 21 is not due");
  for (const [sent, due] of [
    ["2026-11-06T16:00:00.000Z", "2026-11-10T16:00:00.000Z"], // Friday → Tuesday
    ["2026-10-23T15:00:00.000Z", "2026-10-27T16:00:00.000Z"], // Friday 16:00 BST → Tuesday 16:00 GMT, across the change
    ["2026-03-27T16:00:00.000Z", "2026-03-31T15:00:00.000Z"], // Friday 16:00 GMT → Tuesday 16:00 BST
    ["2026-04-30T09:00:00.000Z", "2026-05-04T09:00:00.000Z"], // month end, Thursday → Friday 1 May → Monday 4 May
  ]) assert.equal(callDue(sent), due, `call due from ${sent}`);
  for (const [entered, due] of [
    ["2026-08-31T12:00:00.000Z", "2027-02-28T13:00:00.000Z"], // 31 August → end of February, BST → GMT
    ["2027-08-31T12:00:00.000Z", "2028-02-29T13:00:00.000Z"], // leap year
    ["2026-01-10T10:00:00.000Z", "2026-07-10T09:00:00.000Z"], // GMT → BST
    ["2025-09-29T00:30:00.000Z", "2026-03-29T01:00:00.000Z"], // spring gap
    ["2026-04-25T00:30:00.000Z", "2026-10-25T00:30:00.000Z"], // autumn fold, first occurrence
  ]) assert.equal(purgeDueAt(entered), due, `purge due from ${entered}`);
  assert.equal(pieces.X5.length, 2, "and on the journey's own clocks (A12, A15)");
  passed("X5", "X5: Jersey dates…", "searchReviewClock (8 cases: DST both ways, February 28/29, Jersey vs UTC date, gap, fold, "
    + "year end; 7-day repeat ×2; 1 ms before is waiting), callDue (4: across both changes and a month end), purgeDueAt "
    + `(5: 31 Aug → 28/29 Feb, DST, gap, fold); integrated: ${pieces.X5.join("; ")}`);
});

// ---- All together -----------------------------------------------------------------------------------------------------------
test("AUT-20: A01–A16 and X1–X5 passed together over one journey", () => {
  if (pieces.X1.length >= 5) passed("X1", "A06 · X1, A13 · X1, A12 · X1 · X5, X3", pieces.X1.join("; "));
  if (pieces.X4.length === 3) passed("X4", "A04 · X4 · A03, A08 · A09 · X4, A15 · X4 · X5", pieces.X4.join("; "));
  const missing = CHECKS.filter(id => results.get(id)?.status !== "pass");
  if (process.env.AUT20_REPORT) for (const id of CHECKS) console.log(id, "|", results.get(id)?.status ?? "missing", "|", results.get(id)?.test ?? "",
    "|", results.get(id)?.evidence ?? "");
  assert.deepEqual(missing, [], "every check passed");
});
