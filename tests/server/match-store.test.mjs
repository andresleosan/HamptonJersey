import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, T0 } from "./helpers.mjs";
import { recomputeForApplicant, recomputeForListing, closeMatchedNoticeIfEmpty } from "../../server/match-store.js";
import { evaluate, MIN_SCORE } from "../../server/matching.js";

const ADMIN = "luismadef45@gmail.com";
const json = v => JSON.stringify(v);
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args);

let contacts = 0;
// An active buyer up to £1M with nothing else asked, for a contact of that name.
function seedApplicant(env, name = "Ana Le Gros", over = {}) {
  const c = run(env, `INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`, name, `c${++contacts}@example.je`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), operation: "buy", stage: "searching", source: "phone",
    budget_max: 1000000, created_at: T0, updated_at: T0, ...over };
  const cols = Object.keys(a);
  return Number(run(env, `INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    ...Object.values(a)).lastInsertRowid);
}
// A listing offered to applicants, with its features already read (B10).
const listing = (env, id, over = {}) => seedListing(env, { id, matchable: 1, parish: "St Saviour", bedrooms: 3,
  bathrooms: 2, sale_price: 900000, feat_outdoor: json(["garden"]), feat_type: "house", ...over });
const matches = (env, applicantId) => rows(env,
  "SELECT * FROM matches WHERE applicant_id = ? ORDER BY listing_id", applicantId);
const found = (env, applicantId) => matches(env, applicantId).filter(m => m.status === "found").map(m => m.listing_id);
const matchedEvents = (env, applicantId) => rows(env,
  "SELECT * FROM events WHERE type = 'applicant.matched' AND entity_id = ? ORDER BY id", String(applicantId));
const notices = (env, applicantId) => rows(env, `SELECT n.* FROM notifications n JOIN events e ON e.id = n.event_id
  WHERE n.category = 'matched' AND e.entity_type = 'applicant' AND e.entity_id = ? ORDER BY n.id`, String(applicantId));
const review = (env, applicantId, listingId, status, reason = null) => run(env,
  "UPDATE matches SET status = ?, reject_reason = ? WHERE applicant_id = ? AND listing_id = ?",
  status, reason, applicantId, listingId);

test("first run creates found matches, one event and one notice", async () => {
  const env = makeEnv();
  const id = seedApplicant(env);
  listing(env, "HE-R001");
  listing(env, "HE-R002", { published: 0, archived_at: T0 }); // archived co-listed houses are still offered (B2)
  listing(env, "HE-R003", { country: null, currency: null });
  listing(env, "HE-R004", { sale_price: 1200000 }); // over budget
  listing(env, "HE-R005", { operation: "rent", availability: "to_let", sale_price: null, rent: 3000, rent_period: "month" });
  // Outside the candidate gate.
  listing(env, "HE-R006", { matchable: 0 });
  listing(env, "HE-R007", { use: "commercial" });
  listing(env, "HE-R008", { availability: "sold" });
  listing(env, "HE-R009", { country: "France" });
  listing(env, "HE-R010", { currency: "EUR" });

  assert.deepEqual(await recomputeForApplicant(env, id, ADMIN), { created: 3 });
  assert.deepEqual(found(env, id), ["HE-R001", "HE-R002", "HE-R003"]);
  const [m] = matches(env, id);
  assert.equal(m.created_at, m.updated_at);
  assert.ok(m.score >= 35 && m.score <= 100);
  assert.deepEqual(JSON.parse(m.checks).map(c => c.key), ["budget", "bedrooms", "bathrooms", "area"]);

  const [e, ...moreEvents] = matchedEvents(env, id);
  assert.equal(moreEvents.length, 0);
  assert.equal(e.actor, ADMIN);
  assert.equal(e.entity_type, "applicant");
  assert.deepEqual(JSON.parse(e.data), { new: 3 });
  const [n, ...moreNotices] = notices(env, id);
  assert.equal(moreNotices.length, 0);
  assert.equal(n.event_id, e.id);
  assert.equal(n.title, "3 new matches for Ana Le Gros");
  assert.equal(n.action_required, 1);
  assert.equal(n.resolved_at, null);

  // One match reads in the singular.
  const solo = seedApplicant(env, "Tom Vibert", { budget_max: 800000 });
  listing(env, "HE-R011", { sale_price: 750000 });
  assert.deepEqual(await recomputeForApplicant(env, solo, "public"), { created: 1 });
  assert.equal(notices(env, solo)[0].title, "1 new match for Tom Vibert");
  assert.equal(matchedEvents(env, solo)[0].actor, "public");

  // A house that passes every filter but scores under MIN_SCORE is not stored.
  const picky = seedApplicant(env, "Eva Noel", { parishes_wanted: json(["Trinity"]), bedrooms_ideal: 5,
    outdoor: json(["balcony"]), property_types: json(["flat"]) });
  run(env, "UPDATE listings SET matchable = 0");
  const l = listing(env, "HE-R012", { sale_price: 500000, published: 0 });
  const a = env.DB.raw.prepare("SELECT * FROM applicants WHERE id = ?").get(picky);
  const r = evaluate(a, { ...l, feat_furnished: null, feat_pets: null, feat_parking: null, feat_evidence: null });
  assert.equal(r.pass, true);
  assert.ok(r.score < MIN_SCORE);
  assert.deepEqual(await recomputeForApplicant(env, picky, ADMIN), { created: 0 });
  assert.deepEqual(matches(env, picky), []);
  assert.deepEqual(notices(env, picky), []);
});

test("second run adds new ones and updates the same notice title", async () => {
  const env = makeEnv();
  const id = seedApplicant(env);
  listing(env, "HE-R001");
  listing(env, "HE-R002");
  await recomputeForApplicant(env, id, ADMIN);
  listing(env, "HE-R003");

  assert.deepEqual(await recomputeForApplicant(env, id, "system"), { created: 1 });
  assert.deepEqual(found(env, id), ["HE-R001", "HE-R002", "HE-R003"]);
  assert.deepEqual(matchedEvents(env, id).map(e => JSON.parse(e.data)), [{ new: 2 }, { new: 1 }]);
  const [n, ...more] = notices(env, id);
  assert.equal(more.length, 0);
  assert.equal(n.title, "3 new matches for Ana Le Gros");

  // Nothing new: no event, and the stored matches stay as they were.
  const before = matches(env, id);
  assert.deepEqual(await recomputeForApplicant(env, id, "system"), { created: 0 });
  assert.equal(matchedEvents(env, id).length, 2);
  assert.deepEqual(matches(env, id), before);

  // A notice closed with Done gets a new one on the next new match.
  run(env, "UPDATE notifications SET resolved_at = ?, resolved_by = ?", T0, ADMIN);
  listing(env, "HE-R004");
  assert.deepEqual(await recomputeForApplicant(env, id, "system"), { created: 1 });
  const open = notices(env, id).filter(x => x.resolved_at == null);
  assert.equal(open.length, 1);
  assert.equal(open[0].title, "4 new matches for Ana Le Gros");
  assert.equal(open[0].event_id, matchedEvents(env, id).at(-1).id);
});

test("rejected pairs are never re-proposed", async () => {
  const env = makeEnv();
  const id = seedApplicant(env);
  listing(env, "HE-R001");
  await recomputeForApplicant(env, id, ADMIN);
  review(env, id, "HE-R001", "rejected", "price");
  const [before] = matches(env, id);

  assert.deepEqual(await recomputeForApplicant(env, id, ADMIN), { created: 0 });
  // Not even when it stops passing, or passes again with another score.
  run(env, "UPDATE applicants SET budget_max = 500000 WHERE id = ?", id);
  await recomputeForApplicant(env, id, ADMIN);
  run(env, "UPDATE applicants SET budget_max = 2000000, bedrooms_ideal = 5 WHERE id = ?", id);
  await recomputeForApplicant(env, id, ADMIN);
  await recomputeForListing(env, "HE-R001", ADMIN);
  assert.deepEqual(matches(env, id), [before]);
  assert.equal(matchedEvents(env, id).length, 1);
});

test("a shortlisted match that stops passing stays, with the failing check", async () => {
  const env = makeEnv();
  const id = seedApplicant(env);
  listing(env, "HE-R001");
  await recomputeForApplicant(env, id, ADMIN);
  review(env, id, "HE-R001", "shortlisted");

  run(env, "UPDATE applicants SET budget_max = 800000 WHERE id = ?", id);
  assert.deepEqual(await recomputeForApplicant(env, id, ADMIN), { created: 0 });
  const [m, ...more] = matches(env, id);
  assert.equal(more.length, 0);
  assert.equal(m.status, "shortlisted");
  assert.deepEqual(JSON.parse(m.checks).find(c => c.key === "budget"),
    { key: "budget", result: "fails", evidence: "£900,000, over £800,000" });
  assert.equal(m.score, 80); // 100 less the 20 the price scored

  // Still refreshed once the listing leaves the candidates (sold), from either side.
  run(env, "UPDATE listings SET availability = 'sold', bedrooms = 2 WHERE id = 'HE-R001'");
  run(env, "UPDATE applicants SET bedrooms_min = 3 WHERE id = ?", id);
  await recomputeForApplicant(env, id, ADMIN);
  assert.deepEqual(JSON.parse(matches(env, id)[0].checks).find(c => c.key === "bedrooms"),
    { key: "bedrooms", result: "fails", evidence: "2 bedrooms" });
  run(env, "UPDATE listings SET bathrooms = 1 WHERE id = 'HE-R001'");
  run(env, "UPDATE applicants SET bathrooms_min = 2 WHERE id = ?", id);
  await recomputeForListing(env, "HE-R001", ADMIN);
  const [after] = matches(env, id);
  assert.equal(after.status, "shortlisted");
  assert.equal(JSON.parse(after.checks).find(c => c.key === "bathrooms").result, "fails");
});

test("found matches that stop passing are removed; notice closes at zero found", async () => {
  const env = makeEnv();
  const id = seedApplicant(env);
  listing(env, "HE-R001", { bedrooms: 3 });
  listing(env, "HE-R002", { bedrooms: 4 });
  listing(env, "HE-R003", { bedrooms: 4 });
  await recomputeForApplicant(env, id, ADMIN);
  review(env, id, "HE-R003", "shortlisted");

  // Fewer found: the open notice tells the new total.
  run(env, "UPDATE applicants SET bedrooms_min = 4 WHERE id = ?", id);
  assert.deepEqual(await recomputeForApplicant(env, id, ADMIN), { created: 0 });
  assert.deepEqual(found(env, id), ["HE-R002"]);
  assert.equal(notices(env, id)[0].title, "1 new match for Ana Le Gros");

  // closeMatchedNoticeIfEmpty leaves it open while one is found.
  await env.DB.batch([closeMatchedNoticeIfEmpty(env, id, ADMIN)]);
  assert.equal(notices(env, id)[0].resolved_at, null);

  run(env, "UPDATE applicants SET bedrooms_min = 5 WHERE id = ?", id);
  await recomputeForApplicant(env, id, "system");
  assert.deepEqual(found(env, id), []);
  assert.deepEqual(matches(env, id).map(m => m.status), ["shortlisted"]);
  const [n] = notices(env, id);
  assert.ok(n.resolved_at);
  assert.equal(n.resolved_by, "system");
});

test("archived, lost or completed applicants keep no found matches", async () => {
  const env = makeEnv();
  listing(env, "HE-R001");
  listing(env, "HE-R002");
  const ids = ["archived", "lost", "completed"].map(k => seedApplicant(env, `Ana ${k}`));
  const paused = seedApplicant(env, "Ana paused");
  for (const id of [...ids, paused]) {
    await recomputeForApplicant(env, id, ADMIN);
    review(env, id, "HE-R002", "shortlisted");
  }
  run(env, "UPDATE applicants SET archived_at = ? WHERE id = ?", T0, ids[0]);
  run(env, "UPDATE applicants SET stage = 'lost', lost_reason = 'Bought elsewhere' WHERE id = ?", ids[1]);
  run(env, "UPDATE applicants SET stage = 'completed' WHERE id = ?", ids[2]);
  run(env, "UPDATE applicants SET stage = 'paused' WHERE id = ?", paused);
  listing(env, "HE-R003");

  for (const id of ids) {
    assert.deepEqual(await recomputeForApplicant(env, id, ADMIN), { created: 0 });
    assert.deepEqual(matches(env, id).map(m => [m.listing_id, m.status]), [["HE-R002", "shortlisted"]]);
    assert.ok(notices(env, id)[0].resolved_at);
  }
  // A new listing is not offered to them either; a paused search is still active.
  await recomputeForListing(env, "HE-R003", ADMIN);
  for (const id of ids) assert.deepEqual(found(env, id), []);
  assert.deepEqual(found(env, paused), ["HE-R001", "HE-R003"]);
});

test("only the 25 best found are kept", async () => {
  const env = makeEnv();
  const id = seedApplicant(env);
  // 20 published (10 more points) and 10 not; ties go to the lower listing id.
  const ids = Array.from({ length: 30 }, (_, i) => `HE-R${String(100 + i)}`);
  ids.forEach((lid, i) => listing(env, lid, { published: i < 20 ? 1 : 0 }));

  assert.deepEqual(await recomputeForApplicant(env, id, ADMIN), { created: 25 });
  assert.deepEqual(found(env, id), ids.slice(0, 25));
  assert.equal(notices(env, id)[0].title, "25 new matches for Ana Le Gros");

  // A better house pushes out the worst found, from either side; shortlisted ones are not counted.
  listing(env, "HE-R200");
  assert.deepEqual(await recomputeForApplicant(env, id, ADMIN), { created: 1 });
  assert.deepEqual(found(env, id), [...ids.slice(0, 24), "HE-R200"]);
  listing(env, "HE-R201");
  await recomputeForListing(env, "HE-R201", ADMIN);
  assert.deepEqual(found(env, id), [...ids.slice(0, 23), "HE-R200", "HE-R201"]);
  assert.deepEqual(matchedEvents(env, id).map(e => JSON.parse(e.data)), [{ new: 25 }, { new: 1 }, { new: 1 }]);
  review(env, id, "HE-R100", "shortlisted");
  assert.deepEqual(await recomputeForApplicant(env, id, ADMIN), { created: 1 });
  assert.deepEqual(found(env, id), [...ids.slice(1, 24), "HE-R200", "HE-R201"]);
  assert.equal(notices(env, id)[0].title, "25 new matches for Ana Le Gros");
  // A worse house than the 25th is not stored.
  listing(env, "HE-R202", { published: 0 });
  await recomputeForListing(env, "HE-R202", ADMIN);
  assert.equal(matches(env, id).some(m => m.listing_id === "HE-R202"), false);
  assert.equal(matchedEvents(env, id).length, 4);
});

test("recomputeForListing updates the pair for every active applicant", async () => {
  const env = makeEnv();
  const low = seedApplicant(env, "Ana Le Gros", { budget_max: 950000 });
  const high = seedApplicant(env, "Tom Vibert", { budget_max: 1200000 });
  const renter = seedApplicant(env, "Eva Noel", { operation: "rent", budget_max: 4000 });
  const gone = seedApplicant(env, "Max Pinel", { archived_at: T0 });
  listing(env, "HE-R001");

  await recomputeForListing(env, "HE-R001", ADMIN);
  assert.deepEqual(found(env, low), ["HE-R001"]);
  assert.deepEqual(found(env, high), ["HE-R001"]);
  assert.deepEqual(matches(env, renter), []);
  assert.deepEqual(matches(env, gone), []);
  for (const [aid, name] of [[low, "Ana Le Gros"], [high, "Tom Vibert"]]) {
    assert.deepEqual(matchedEvents(env, aid).map(e => [e.actor, JSON.parse(e.data)]), [[ADMIN, { new: 1 }]]);
    assert.equal(notices(env, aid)[0].title, `1 new match for ${name}`);
  }

  // A new price: over one budget (removed), and a fresh score for the other.
  const [before] = matches(env, high);
  run(env, "UPDATE listings SET sale_price = 1000000 WHERE id = 'HE-R001'");
  await recomputeForListing(env, "HE-R001", ADMIN);
  assert.deepEqual(found(env, low), []);
  assert.ok(notices(env, low)[0].resolved_at);
  const [after] = matches(env, high);
  assert.equal(after.id, before.id);
  assert.notEqual(after.checks, before.checks);
  assert.equal(JSON.parse(after.checks)[0].evidence, "£1,000,000");
  assert.equal(matchedEvents(env, high).length, 1);

  // No longer offered: its found matches go.
  run(env, "UPDATE listings SET matchable = 0 WHERE id = 'HE-R001'");
  await recomputeForListing(env, "HE-R001", ADMIN);
  assert.deepEqual(found(env, high), []);
  assert.ok(notices(env, high)[0].resolved_at);
  // A listing that does not exist does nothing.
  await recomputeForListing(env, "HE-R999", ADMIN);
});
