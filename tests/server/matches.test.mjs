import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie, T0 } from "./helpers.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { RECALC_BATCH } from "../../server/routes/matches.js";

const ADMIN = "luismadef45@gmail.com", OTHER = "andres.san1404@gmail.com";
const at = min => new Date(Date.parse(T0) + min * 60e3).toISOString();
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body, email = ADMIN) =>
  call(env, method, path, { body, cookie: await adminCookie(email) });

let contacts = 0;
// An active buyer up to £1M with nothing else asked; minute orders created_at.
function seedApplicant(env, name = "Ana Le Gros", { minute = 0, ...over } = {}) {
  const c = run(env, "INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    name, `c${++contacts}@example.je`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), operation: "buy", stage: "searching", source: "phone",
    budget_max: 1000000, created_at: at(minute), updated_at: at(minute), ...over };
  const cols = Object.keys(a);
  return Number(run(env, `INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    ...Object.values(a)).lastInsertRowid);
}
// A house for sale offered to applicants, with its features already read.
const listing = (env, id, over = {}) => seedListing(env, { id, matchable: 1, parish: "St Saviour", bedrooms: 3,
  bathrooms: 2, sale_price: 900000, feat_type: "house", ...over });
// A stored match, written directly so its score and dates are exactly the test's.
const seedMatch = (env, applicant_id, listing_id, { score = 50, status = "found", minute = 0, reason = null } = {}) =>
  Number(run(env, `INSERT INTO matches (applicant_id, listing_id, score, checks, status, reject_reason, created_at, updated_at)
    VALUES (?, ?, ?, '[]', ?, ?, ?, ?)`, applicant_id, listing_id, score, status, reason, at(minute), at(minute)).lastInsertRowid);
const match = (env, id) => row(env, "SELECT * FROM matches WHERE id = ?", id);
const matchId = (env, applicantId, listingId) =>
  row(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = ?", applicantId, listingId).id;
const openNotices = (env, applicantId) => rows(env, `SELECT n.* FROM notifications n JOIN events e ON e.id = n.event_id
  WHERE n.category = 'matched' AND n.resolved_at IS NULL AND e.entity_type = 'applicant' AND e.entity_id = ?`, String(applicantId));
const put = (env, id, body, email) => req(env, "PUT", `/admin/matches/${id}`, body, email);

test("every match route needs a session", async () => {
  const env = makeEnv();
  assert.equal((await call(env, "PUT", "/admin/matches/1", { body: { status: "shortlisted", from: "found" } })).status, 401);
  assert.equal((await call(env, "GET", "/admin/review")).status, 401);
  assert.equal((await call(env, "POST", "/admin/matches/recalculate", { body: { phase: "listings" } })).status, 401);
});

test("reviewing sets the status, who and when, the event and the first review; Undo keeps the first review", async () => {
  const env = makeEnv();
  listing(env, "HE-R001");
  listing(env, "HE-R002", { sale_price: 800000 });
  const a = seedApplicant(env);
  await recomputeForApplicant(env, a, "system");
  const m1 = matchId(env, a, "HE-R001"), m2 = matchId(env, a, "HE-R002");

  const r = await put(env, m1, { status: "shortlisted", from: "found" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.match.id, m1);
  assert.equal(r.data.match.status, "shortlisted");
  assert.equal(r.data.match.listing.id, "HE-R001");
  const s = match(env, m1);
  assert.equal(s.status, "shortlisted");
  assert.equal(s.reviewed_by, ADMIN);
  assert.ok(s.reviewed_at);
  const first = row(env, "SELECT first_reviewed_at FROM applicants WHERE id = ?", a).first_reviewed_at;
  assert.equal(first, s.reviewed_at);
  const events = () => rows(env, "SELECT actor, entity_type, entity_id, data FROM events WHERE type = 'match.reviewed' ORDER BY id");
  assert.deepEqual(events(), [{ actor: ADMIN, entity_type: "applicant", entity_id: String(a),
    data: JSON.stringify({ listing_id: "HE-R001", from: "found", to: "shortlisted", reason: null }) }]);

  // A rejection needs one of the reasons, and records it.
  for (const reject_reason of [undefined, null, "", "ugly"]) {
    const bad = await put(env, m2, { status: "rejected", reject_reason, from: "found" });
    assert.equal(bad.status, 400, String(reject_reason));
  }
  assert.equal(match(env, m2).status, "found");
  assert.equal((await put(env, m2, { status: "rejected", reject_reason: "price", from: "found" }, OTHER)).status, 200);
  assert.deepEqual([match(env, m2).status, match(env, m2).reject_reason, match(env, m2).reviewed_by], ["rejected", "price", OTHER]);
  assert.equal(JSON.parse(events()[1].data).reason, "price");
  assert.equal(row(env, "SELECT first_reviewed_at FROM applicants WHERE id = ?", a).first_reviewed_at, first, "only the first");

  // Undo: back to found, unreviewed and without a reason; the applicant's first review stays (B13).
  const undo = await put(env, m2, { status: "found", from: "rejected" });
  assert.equal(undo.status, 200);
  assert.deepEqual([match(env, m2).status, match(env, m2).reject_reason, match(env, m2).reviewed_by, match(env, m2).reviewed_at],
    ["found", null, null, null]);
  assert.equal(JSON.parse(events()[2].data).to, "found");
  assert.equal((await put(env, m1, { status: "found", from: "shortlisted" })).status, 200);
  assert.equal(row(env, "SELECT first_reviewed_at FROM applicants WHERE id = ?", a).first_reviewed_at, first);
});

test("a review based on a stale status is refused with 409 and writes nothing (Review Focus 5)", async () => {
  const env = makeEnv();
  listing(env, "HE-R001");
  const a = seedApplicant(env);
  await recomputeForApplicant(env, a, "system");
  const id = matchId(env, a, "HE-R001");
  // Two Review screens show the same found match; the first one shortlists it.
  assert.equal((await put(env, id, { status: "shortlisted", from: "found" })).status, 200);
  const before = { match: match(env, id), events: rows(env, "SELECT id FROM events").length };
  const second = await put(env, id, { status: "rejected", reject_reason: "area", from: "found" }, OTHER);
  assert.equal(second.status, 409);
  assert.equal(second.data.error, "Someone else reviewed this match. Reload to see it.");
  assert.deepEqual({ match: match(env, id), events: rows(env, "SELECT id FROM events").length }, before);
});

// Runs `meanwhile` once, just before the review's batch writes: what another request did between our read and our write.
function racing(env, meanwhile) {
  const real = env.DB.batch.bind(env.DB);
  let done = false;
  env.DB.batch = async stmts => {
    if (!done && stmts.some(s => /^\s*UPDATE matches SET status/i.test(s.sql))) { done = true; meanwhile(); }
    return real(stmts);
  };
}

test("a review landing between our read and our write is caught inside the batch", async () => {
  const env = makeEnv();
  listing(env, "HE-R001");
  listing(env, "HE-R002", { sale_price: 800000 });
  const a = seedApplicant(env);
  await recomputeForApplicant(env, a, "system");
  const events = () => rows(env, "SELECT id FROM events").length, before = events();

  const id = matchId(env, a, "HE-R001");
  racing(env, () => run(env, "UPDATE matches SET status = 'rejected', reject_reason = 'area' WHERE id = ?", id));
  const r = await put(env, id, { status: "shortlisted", from: "found" });
  assert.equal(r.status, 409);
  assert.equal(r.data.error, "Someone else reviewed this match. Reload to see it.");
  assert.deepEqual([match(env, id).status, match(env, id).reject_reason], ["rejected", "area"]);
  assert.equal(events(), before);

  // A recompute removed the found match meanwhile: nothing is recorded as reviewed.
  const gone = matchId(env, a, "HE-R002");
  racing(env, () => run(env, "DELETE FROM matches WHERE id = ?", gone));
  const g = await put(env, gone, { status: "shortlisted", from: "found" });
  assert.equal(g.status, 409);
  assert.equal(g.data.error, "This match is no longer proposed. Reload to see the current matches.");
  assert.equal(events(), before);
  assert.equal(row(env, "SELECT first_reviewed_at FROM applicants WHERE id = ?", a).first_reviewed_at, null);
});

test("only found → shortlisted|rejected and back to found are allowed; bad requests are 400 or 404", async () => {
  const env = makeEnv();
  listing(env, "HE-R001");
  const a = seedApplicant(env);
  const id = seedMatch(env, a, "HE-R001", { status: "shortlisted" });
  for (const body of [{ status: "rejected", reject_reason: "price", from: "shortlisted" }, { status: "shortlisted", from: "shortlisted" },
    { status: "found", from: "found" }, { status: "won", from: "found" }, { status: "shortlisted" }, { status: "found", from: "maybe" },
    [], null])
    assert.equal((await put(env, id, body)).status, 400, JSON.stringify(body));
  assert.equal(match(env, id).status, "shortlisted");
  assert.equal((await put(env, 999, { status: "shortlisted", from: "found" })).status, 404);
  // An archived search is read only (D9).
  run(env, "UPDATE applicants SET archived_at = ? WHERE id = ?", at(1), a);
  assert.equal((await put(env, id, { status: "found", from: "shortlisted" })).status, 409);
  assert.equal(match(env, id).status, "shortlisted");
});

test("the matched notice closes when the last found match is reviewed", async () => {
  const env = makeEnv();
  listing(env, "HE-R001");
  listing(env, "HE-R002", { sale_price: 800000 });
  const a = seedApplicant(env);
  await recomputeForApplicant(env, a, "system");
  assert.equal(openNotices(env, a).length, 1);
  assert.equal((await put(env, matchId(env, a, "HE-R001"), { status: "shortlisted", from: "found" })).status, 200);
  assert.equal(openNotices(env, a).length, 1, "one found left");
  assert.equal((await put(env, matchId(env, a, "HE-R002"), { status: "rejected", reject_reason: "size", from: "found" })).status, 200);
  assert.equal(openNotices(env, a).length, 0);
  const n = row(env, "SELECT resolved_by FROM notifications WHERE category = 'matched'");
  assert.equal(n.resolved_by, ADMIN);
});

test("the review queue: oldest applicant first, best score first, after skips past a match", async () => {
  const env = makeEnv();
  for (const id of ["HE-R001", "HE-R002", "HE-R003"]) listing(env, id);
  seedMedia(env, { id: "A00001", listing_id: "HE-R002" });
  const newer = seedApplicant(env, "Tom Vibert", { minute: 5, budget_min: 400000, parishes_wanted: '["St Helier"]' });
  const older = seedApplicant(env, "Ana Le Gros", { minute: 1 });
  const closed = seedApplicant(env, "Lost One", { minute: 0, stage: "lost" });
  const o1 = seedMatch(env, older, "HE-R001", { score: 60 });
  const o2 = seedMatch(env, older, "HE-R002", { score: 80 });
  const o3 = seedMatch(env, older, "HE-R003", { score: 60 });
  const n1 = seedMatch(env, newer, "HE-R001", { score: 90 });
  seedMatch(env, newer, "HE-R002", { score: 70, status: "shortlisted" });
  seedMatch(env, closed, "HE-R003", { score: 99 }); // not an active search: not in the queue

  const next = async after => (await req(env, "GET", `/admin/review${after ? `?after=${after}` : ""}`)).data;
  const first = await next();
  assert.deepEqual(first.match, { id: o2, applicant_id: older, status: "found", score: 80, checks: [], reject_reason: null,
    reviewed_at: null });
  assert.deepEqual(first.listing, { id: "HE-R002", title: "Le Bernage", operation: "sale", availability: "for_sale",
    price_text: null, sale_price: 900000, rent: null, rent_period: null, currency: "GBP", parish: "St Saviour", bedrooms: 3,
    bathrooms: 2, cover_id: "A00001", published: 1, archived_at: null });
  assert.equal(first.applicant.id, older);
  assert.equal(first.applicant.name, "Ana Le Gros");
  assert.equal(first.applicant.operation, "buy");
  assert.equal(first.applicant.budget_max, 1000000);
  assert.equal(first.remaining, 4);

  // Skipping walks the order; ties on score by id; then the next applicant.
  const order = [o2];
  for (let d = first; (d = await next(order.at(-1))).match;) order.push(d.match.id);
  assert.deepEqual(order, [o2, o1, o3, n1]);
  const tom = await next(o3);
  assert.deepEqual(tom.applicant.parishes_wanted, ["St Helier"], "JSON lists come back as arrays");
  assert.equal(tom.applicant.budget_min, 400000);
  assert.deepEqual(await next(n1), { match: null, remaining: 4 }, "the skipped ones remain");

  // After a match that was just reviewed: its place in the order still counts.
  run(env, "UPDATE matches SET status = 'shortlisted' WHERE id = ?", o1);
  assert.equal((await next(o1)).match.id, o3);
  assert.equal((await next(o1)).remaining, 3);
  // After a match that no longer exists: from the start.
  assert.equal((await next(12345)).match.id, o2);
  assert.equal((await req(env, "GET", "/admin/review?after=x")).status, 400);

  run(env, "UPDATE matches SET status = 'rejected', reject_reason = 'other' WHERE status = 'found'");
  assert.deepEqual(await next(), { match: null, remaining: 0 });
});

test("Recalculate all reads every listing in batches, then recomputes every active applicant; a parish set by hand stays (Review Focus 2)", async () => {
  const env = makeEnv();
  const n = RECALC_BATCH.listings + 3;
  for (let i = 1; i <= n; i++)
    seedListing(env, { id: `HE-R${String(i).padStart(3, "0")}`, location: "St Aubin", parish: null, matchable: i <= 2 ? 1 : 0,
      description: "Pets considered. Garage and a garden." });
  run(env, "UPDATE listings SET parish = 'Trinity' WHERE id = 'HE-R002'"); // corrected by the team
  run(env, "UPDATE listings SET use = 'commercial', matchable = 1 WHERE id = 'HE-R003'"); // read too, never offered
  const actives = Array.from({ length: RECALC_BATCH.applicants + 1 }, (_, i) => seedApplicant(env, `Buyer ${i}`, { minute: i }));
  const lost = seedApplicant(env, "Lost One", { stage: "lost" });
  const updatedAt = row(env, "SELECT updated_at FROM listings WHERE id = 'HE-R001'").updated_at;

  const recalc = body => req(env, "POST", "/admin/matches/recalculate", body);
  const calls = [];
  for (let body = { phase: "listings" }; ;) {
    const r = await recalc(body);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    calls.push(r.data);
    if (r.data.next == null && r.data.phase === "applicants") break;
    body = r.data.next == null ? { phase: "applicants" } : { phase: r.data.phase, after: r.data.next };
  }
  assert.deepEqual(calls.map(c => [c.phase, c.next, c.count, c.total]), [
    ["listings", `HE-R${String(RECALC_BATCH.listings).padStart(3, "0")}`, RECALC_BATCH.listings, n], ["listings", null, 3, n],
    ["applicants", actives.at(-2), RECALC_BATCH.applicants, actives.length], ["applicants", null, 1, actives.length]]);

  const l = id => row(env, "SELECT parish, feat_pets, feat_parking, feat_outdoor, features_at, updated_at FROM listings WHERE id = ?", id);
  assert.equal(rows(env, "SELECT id FROM listings WHERE features_at IS NULL").length, 0, "every listing read");
  assert.deepEqual({ ...l("HE-R001"), features_at: !!l("HE-R001").features_at },
    { parish: "St Brelade", feat_pets: "yes", feat_parking: 1, feat_outdoor: '["garden"]', features_at: true,
      updated_at: updatedAt });
  assert.equal(l("HE-R002").parish, "Trinity", "the team's parish wins");
  assert.equal(l(`HE-R${String(n).padStart(3, "0")}`).parish, "St Brelade", "not offered, still read");

  // Matching only offers matchable residential listings, to active applicants.
  const pairs = rows(env, "SELECT applicant_id, listing_id FROM matches WHERE status = 'found' ORDER BY applicant_id, listing_id");
  assert.deepEqual(pairs, actives.flatMap(a => ["HE-R001", "HE-R002"].map(listing_id => ({ applicant_id: a, listing_id }))));
  assert.equal(rows(env, "SELECT 1 FROM matches WHERE applicant_id = ?", lost).length, 0);

  for (const body of [{}, { phase: "all" }, { phase: "listings", after: 5 }, { phase: "applicants", after: "HE-R001" }])
    assert.equal((await recalc(body)).status, 400, JSON.stringify(body));
});

test("an edit made while Recalculate all runs keeps the features its own save read", async () => {
  const env = makeEnv();
  seedListing(env, { id: "HE-R001", parish: null, description: "No pets." });
  // The batch read the row, then the editor saved new text (and features) before the batch wrote.
  const real = env.DB.batch.bind(env.DB);
  let raced = false;
  env.DB.batch = async stmts => {
    if (!raced && stmts.some(s => /^\s*UPDATE listings/i.test(s.sql))) {
      raced = true;
      run(env, "UPDATE listings SET feat_pets = 'yes', updated_at = ? WHERE id = 'HE-R001'", at(9));
    }
    return real(stmts);
  };
  assert.equal((await req(env, "POST", "/admin/matches/recalculate", { phase: "listings" })).status, 200);
  assert.equal(row(env, "SELECT feat_pets FROM listings WHERE id = 'HE-R001'").feat_pets, "yes");
});

test("the list's queue follows B13's order, with found and shortlisted counts and a queue filter", async () => {
  const env = makeEnv();
  for (const id of ["HE-R001", "HE-R002", "HE-R003"]) listing(env, id);
  // New properties found: a found one created after the first review beats everything else.
  const fresh = seedApplicant(env, "Fresh", { minute: 1, first_reviewed_at: at(10) });
  seedMatch(env, fresh, "HE-R001", { status: "shortlisted", minute: 5 });
  seedMatch(env, fresh, "HE-R002", { minute: 5 });
  seedMatch(env, fresh, "HE-R003", { minute: 11 });
  // Waiting for review: found ones left, nothing ever reviewed…
  const waiting = seedApplicant(env, "Waiting", { minute: 2 });
  seedMatch(env, waiting, "HE-R001");
  seedMatch(env, waiting, "HE-R002");
  // …or reviewed before: an older found one left beats a shortlisted one (an Undo keeps the first review, so it is not new)…
  const undone = seedApplicant(env, "Undone", { minute: 3, first_reviewed_at: at(10) });
  seedMatch(env, undone, "HE-R001", { status: "shortlisted", minute: 5 });
  seedMatch(env, undone, "HE-R002", { minute: 5 });
  // …or one rejected and the others skipped, nothing shortlisted.
  const skipped = seedApplicant(env, "Skipped", { minute: 3, first_reviewed_at: at(10) });
  seedMatch(env, skipped, "HE-R001", { status: "rejected", reason: "area", minute: 5 });
  seedMatch(env, skipped, "HE-R002", { minute: 5 });
  // In process: shortlisted ones and no found left.
  const inProcess = seedApplicant(env, "In process", { minute: 3, first_reviewed_at: at(10) });
  seedMatch(env, inProcess, "HE-R001", { status: "shortlisted", minute: 5 });
  seedMatch(env, inProcess, "HE-R002", { status: "rejected", reason: "size", minute: 5 });
  // No matches: all rejected, or none at all.
  const rejected = seedApplicant(env, "Rejected", { minute: 4, first_reviewed_at: at(10) });
  seedMatch(env, rejected, "HE-R001", { status: "rejected", reason: "price", minute: 5 });
  const none = seedApplicant(env, "None", { minute: 5 });

  const list = async q => {
    const r = await req(env, "GET", `/admin/applicants?sort=oldest${q}`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data.applicants;
  };
  assert.deepEqual((await list("")).map(x => [x.id, x.queue, x.found, x.shortlisted]), [
    [fresh, "New properties found", 2, 1], [waiting, "Waiting for review", 2, 0], [undone, "Waiting for review", 1, 1],
    [skipped, "Waiting for review", 1, 0], [inProcess, "In process", 0, 1], [rejected, "No matches", 0, 0],
    [none, "No matches", 0, 0]]);
  for (const [queue, ids] of [["New properties found", [fresh]], ["Waiting for review", [waiting, undone, skipped]],
    ["In process", [inProcess]], ["No matches", [rejected, none]]])
    assert.deepEqual((await list(`&queue=${encodeURIComponent(queue)}`)).map(x => x.id), ids, queue);
  assert.deepEqual((await list("&queue=In%20process&operation=rent")), [], "the queue filter adds to the others");
  assert.equal((await req(env, "GET", "/admin/applicants?queue=Done")).status, 400);
  assert.equal((await req(env, "GET", "/admin/applicants?queue=Done")).status, 400);
});

test("the applicant record lists its matches with the listing card, found first", async () => {
  const env = makeEnv();
  listing(env, "HE-R001", { title: "Shortlisted house" });
  listing(env, "HE-R002", { title: "Rejected flat", published: 0, archived_at: at(3), cover_media_id: "A00002" });
  listing(env, "HE-R003", { title: "Found low", operation: "rent", availability: "to_let", sale_price: null, rent: 24000,
    rent_period: "year" });
  listing(env, "HE-R004", { title: "Found high" });
  seedMedia(env, { id: "A00002", listing_id: "HE-R002" });
  const a = seedApplicant(env);
  const s = seedMatch(env, a, "HE-R001", { status: "shortlisted", score: 90 });
  const r = seedMatch(env, a, "HE-R002", { status: "rejected", reason: "condition", score: 95 });
  const lo = seedMatch(env, a, "HE-R003", { score: 40 });
  const hi = seedMatch(env, a, "HE-R004", { score: 70 });
  run(env, "UPDATE matches SET checks = ?, reviewed_at = ? WHERE id = ?",
    JSON.stringify([{ key: "budget", result: "meets", evidence: "£900,000" }]), at(4), s);

  const d = (await req(env, "GET", `/admin/applicants/${a}`)).data;
  assert.deepEqual(d.matches.map(m => m.id), [hi, lo, s, r]);
  const short = d.matches[2];
  assert.deepEqual({ ...short, listing: undefined }, { id: s, applicant_id: a, status: "shortlisted", score: 90,
    checks: [{ key: "budget", result: "meets", evidence: "£900,000" }], reject_reason: null, reviewed_at: at(4), listing: undefined });
  assert.equal(short.listing.title, "Shortlisted house");
  assert.equal(short.listing.cover_id, null);
  assert.deepEqual([d.matches[3].reject_reason, d.matches[3].listing.published, d.matches[3].listing.archived_at,
    d.matches[3].listing.cover_id], ["condition", 0, at(3), "A00002"]);
  assert.deepEqual([d.matches[1].listing.rent, d.matches[1].listing.rent_period, d.matches[1].listing.sale_price],
    [24000, "year", null]);
});

test("matched notices: their own category and count, linking to the Matches tab", async () => {
  const env = makeEnv();
  listing(env, "HE-R001");
  listing(env, "HE-R002", { sale_price: 800000 });
  const a = seedApplicant(env);
  await recomputeForApplicant(env, a, "system");
  const box = (await req(env, "GET", "/admin/notifications?box=action&category=matched")).data;
  assert.deepEqual(box.notifications.map(n => [n.category, n.title, n.link]),
    [["matched", "2 new matches for Ana Le Gros", `#/applicants/${a}/matches`]]);
  const counts = { action: 1, new_applicant: 0, viewing: 0, matched: 1 };
  assert.deepEqual(box.counts, counts);
  assert.deepEqual((await req(env, "GET", "/admin/notifications/counts")).data, counts, "no review count: the queue tells its size");
});

test("Undo brings a match back only while it still is one: an archived listing's match stays out", async () => {
  const env = makeEnv();
  listing(env, "HE-R001");
  listing(env, "HE-R002", { sale_price: 800000 });
  const a = seedApplicant(env);
  await recomputeForApplicant(env, a, "system");
  const sold = matchId(env, a, "HE-R001"), kept = matchId(env, a, "HE-R002");
  assert.equal((await put(env, sold, { status: "rejected", reject_reason: "condition", from: "found" })).status, 200);
  assert.equal((await put(env, kept, { status: "rejected", reject_reason: "price", from: "found" })).status, 200);
  // Sold meanwhile.
  assert.equal((await req(env, "POST", "/admin/listings/HE-R001/archive")).status, 200);

  const r = await put(env, sold, { status: "found", from: "rejected" });
  assert.equal(r.status, 200);
  assert.equal(r.data.match, null, "no longer proposed");
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM matches WHERE id = ?", sold).n, 0);
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'match.reviewed'").length, 3, "the Undo is still recorded");
  // A listing still offered comes back as found, with today's checks.
  run(env, "UPDATE matches SET checks = '[]', score = 36 WHERE id = ?", kept);
  const k = await put(env, kept, { status: "found", from: "rejected" });
  assert.equal(k.data.match.status, "found");
  assert.notDeepEqual(k.data.match.checks, []);
  assert.notEqual(k.data.match.score, 36);
});
