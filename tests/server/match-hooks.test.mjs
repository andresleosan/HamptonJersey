import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";

const ADMIN = "luismadef45@gmail.com";
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args);
const found = (env, applicantId) => rows(env, "SELECT listing_id FROM matches WHERE applicant_id = ? AND status = 'found' ORDER BY listing_id",
  applicantId).map(m => m.listing_id);
const foundFor = (env, listingId) => rows(env, "SELECT applicant_id FROM matches WHERE listing_id = ? AND status = 'found' ORDER BY applicant_id",
  listingId).map(m => m.applicant_id);
const updatedAt = (env, table, id) => row(env, `SELECT updated_at FROM ${table} WHERE id = ?`, id).updated_at;

// Two houses to let in St Helier, offered to applicants.
function world() {
  const env = makeEnv();
  const toLet = { operation: "rent", availability: "to_let", sale_price: null, rent_period: "month", matchable: 1,
    location: "St Helier", parish: "St Helier" };
  seedListing(env, { ...toLet, id: "HE-R001", title: "Two-bed flat", rent: 2000, bedrooms: 2 });
  seedListing(env, { ...toLet, id: "HE-R002", title: "Three-bed house", rent: 2200, bedrooms: 3 });
  return env;
}
const form = (o = {}) => ({ name: "Jane Le Brocq", email: "jane@example.je", phone: "07797 123456", source: "phone",
  operation: "rent", budget_max: 2500, bedrooms_min: 2, ...o });
async function createApplicant(env, o) {
  const r = await req(env, "POST", "/admin/applicants", form(o));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id;
}
const putApplicant = async (env, id, body) =>
  req(env, "PUT", `/admin/applicants/${id}`, { ...body, updated_at: updatedAt(env, "applicants", id) });
const putListing = async (env, id, body) =>
  req(env, "PUT", `/admin/listings/${id}`, { ...body, updated_at: updatedAt(env, "listings", id) });

test("an applicant saved in the panel gets its matches in the same request, and every save adjusts them", async () => {
  const env = world();
  const id = await createApplicant(env);
  assert.deepEqual(found(env, id), ["HE-R001", "HE-R002"]);
  const [e] = rows(env, "SELECT actor FROM events WHERE type = 'applicant.matched' AND entity_id = ?", String(id));
  assert.equal(e.actor, ADMIN);

  // A change of requirements.
  assert.equal((await putApplicant(env, id, { bedrooms_min: 3 })).status, 200);
  assert.deepEqual(found(env, id), ["HE-R002"]);
  // A change of stage: a lost search has no found matches.
  assert.equal((await putApplicant(env, id, { stage: "lost", lost_reason: "Found elsewhere" })).status, 200);
  assert.deepEqual(found(env, id), []);
  assert.equal((await putApplicant(env, id, { stage: "searching" })).status, 200);
  assert.deepEqual(found(env, id), ["HE-R002"]);
  // Archive and restore.
  assert.equal((await req(env, "POST", `/admin/applicants/${id}/archive`)).status, 200);
  assert.deepEqual(found(env, id), []);
  assert.equal((await req(env, "POST", `/admin/applicants/${id}/restore`)).status, 200);
  assert.deepEqual(found(env, id), ["HE-R002"]);
});

test("a listing's price over the budget takes its found matches away, and back when it comes down", async () => {
  const env = world();
  const a = await createApplicant(env);
  const b = await createApplicant(env, { name: "Tom Vibert", email: "tom@example.je", phone: null, budget_max: 3500 });
  assert.deepEqual(foundFor(env, "HE-R001"), [a, b]);

  const r = await putListing(env, "HE-R001", { rent: 3000 });
  assert.equal(r.status, 200);
  assert.deepEqual(foundFor(env, "HE-R001"), [b]);
  assert.equal((await putListing(env, "HE-R001", { rent: 1900 })).status, 200);
  assert.deepEqual(foundFor(env, "HE-R001"), [a, b]);
  // F0 stays: a stale save is refused and changes nothing.
  const stale = await req(env, "PUT", "/admin/listings/HE-R001", { rent: 5000, updated_at: T0 });
  assert.equal(stale.status, 409);
  assert.deepEqual(foundFor(env, "HE-R001"), [a, b]);
});

test("archiving a listing (sold) removes its found matches for everyone and stops offering it (Review Focus 4)", async () => {
  const env = world();
  const a = await createApplicant(env);
  const b = await createApplicant(env, { name: "Tom Vibert", email: "tom@example.je", phone: null });
  run(env, "UPDATE matches SET status = 'shortlisted' WHERE applicant_id = ? AND listing_id = 'HE-R001'", b);

  const arch = await req(env, "POST", "/admin/listings/HE-R001/archive");
  assert.equal(arch.status, 200);
  assert.equal(arch.data.listing.matchable, 0);
  assert.deepEqual(foundFor(env, "HE-R001"), []);
  // A reviewed match is never lost.
  assert.equal(row(env, "SELECT status FROM matches WHERE applicant_id = ? AND listing_id = 'HE-R001'", b).status, "shortlisted");
  // Saving the applicant again does not propose it either.
  assert.equal((await putApplicant(env, a, { budget_max: 2600 })).status, 200);
  assert.deepEqual(found(env, a), ["HE-R002"]);

  // Restoring keeps it off (B9); the editor's switch offers it again.
  const restored = await req(env, "POST", "/admin/listings/HE-R001/restore");
  assert.equal(restored.data.listing.matchable, 0);
  assert.deepEqual(foundFor(env, "HE-R001"), []);
  assert.equal((await putListing(env, "HE-R001", { matchable: 1 })).status, 200);
  assert.deepEqual(foundFor(env, "HE-R001"), [a]);
  assert.equal((await putListing(env, "HE-R001", { matchable: 0 })).status, 200);
  assert.deepEqual(foundFor(env, "HE-R001"), []);
});

test("publishing a listing rescores its matches", async () => {
  const env = world();
  run(env, "UPDATE listings SET published = 0 WHERE id = 'HE-R001'");
  const a = await createApplicant(env);
  const score = () => row(env, "SELECT score FROM matches WHERE applicant_id = ? AND listing_id = 'HE-R001'", a).score;
  const before = score();
  assert.equal((await req(env, "POST", "/admin/listings/HE-R001/publish")).status, 200);
  assert.equal(score(), before + 10);
  assert.equal((await req(env, "POST", "/admin/listings/HE-R001/unpublish")).status, 200);
  assert.equal(score(), before);
});

test("saving a listing reads its features and parish; a parish set by hand is never overwritten", async () => {
  const env = world();
  seedListing(env, { id: "HE-R003", location: "Gorey", road_name: "La Rue, St Martin", parish: null,
    description: "Pets considered. Garage and a south-facing garden." });
  const r = await putListing(env, "HE-R003", { title: "Gorey cottage" });
  assert.equal(r.status, 200);
  const l = r.data.listing;
  assert.equal(l.parish, "St Martin");
  assert.deepEqual([l.feat_pets, l.feat_parking, l.feat_outdoor, l.feat_type], ["yes", 1, '["garden"]', "cottage"]);
  assert.equal(JSON.parse(l.feat_evidence).pets, "Pets considered");
  assert.equal(l.features_at, l.updated_at);

  // Set by hand, then another save: kept.
  assert.equal((await putListing(env, "HE-R003", { parish: "Trinity" })).data.listing.parish, "Trinity");
  const again = await putListing(env, "HE-R003", { description: "No pets. Lovely garden." });
  assert.equal(again.data.listing.parish, "Trinity");
  assert.equal(again.data.listing.feat_pets, "no");
  // Cleared by hand: null wins over the location on that save.
  assert.equal((await putListing(env, "HE-R003", { parish: null })).data.listing.parish, null);
  assert.ok((await putListing(env, "HE-R003", { parish: "Narnia" })).data.fields.parish);
  assert.ok((await putListing(env, "HE-R003", { matchable: 2 })).data.fields.matchable);

  // Create: the parish read from the location unless one is sent; features stored too.
  const base = { title: "New home", use: "residential", operation: "sale", availability: "for_sale", country: "Jersey",
    location: "St Brelade", summary: "Unfurnished, with parking for 2 cars." };
  const c1 = await req(env, "POST", "/admin/listings", base);
  assert.equal(c1.status, 201);
  const n1 = row(env, "SELECT * FROM listings WHERE id = ?", c1.data.id);
  assert.deepEqual([n1.parish, n1.feat_parking, n1.feat_furnished, n1.matchable], ["St Brelade", 2, "no", 0]);
  assert.ok(n1.features_at);
  const c2 = await req(env, "POST", "/admin/listings", { ...base, parish: "Grouville", matchable: 1 });
  const n2 = row(env, "SELECT parish, matchable FROM listings WHERE id = ?", c2.data.id);
  assert.deepEqual({ ...n2 }, { parish: "Grouville", matchable: 1 });
});

test("a listing created to let is matched in the same request", async () => {
  const env = world();
  const a = await createApplicant(env);
  const c = await req(env, "POST", "/admin/listings", { title: "Flat", use: "residential", operation: "rent",
    availability: "to_let", country: "Jersey", location: "St Helier", rent: 2100, rent_period: "month", currency: "GBP",
    bedrooms: 2, matchable: 1 });
  assert.equal(c.status, 201);
  assert.deepEqual(found(env, a), ["HE-R001", "HE-R002", c.data.id]);
});

test("listing detail lists its matched applicants; the list shows parish and filters by it", async () => {
  const env = world();
  const a = await createApplicant(env);
  const b = await createApplicant(env, { name: "Tom Vibert", email: "tom@example.je", phone: null });
  const c = await createApplicant(env, { name: "Ann Renouf", email: "ann@example.je", phone: null });
  run(env, "UPDATE matches SET score = 60 WHERE applicant_id = ? AND listing_id = 'HE-R001'", a);
  run(env, "UPDATE matches SET score = 70, status = 'rejected', reject_reason = 'price' WHERE applicant_id = ? AND listing_id = 'HE-R001'", b);
  run(env, "UPDATE matches SET score = 50, status = 'shortlisted' WHERE applicant_id = ? AND listing_id = 'HE-R001'", c);
  const id = s => row(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = 'HE-R001'", s).id;

  const d = (await req(env, "GET", "/admin/listings/HE-R001")).data;
  assert.deepEqual(d.matched_applicants, [
    { match_id: id(c), applicant_id: c, name: "Ann Renouf", operation: "rent", status: "shortlisted", score: 50 },
    { match_id: id(a), applicant_id: a, name: "Jane Le Brocq", operation: "rent", status: "found", score: 60 },
    { match_id: id(b), applicant_id: b, name: "Tom Vibert", operation: "rent", status: "rejected", score: 70 },
  ]);
  assert.deepEqual((await req(env, "GET", "/admin/listings/HE-R002")).data.matched_applicants.map(m => m.applicant_id), [a, b, c]);

  seedListing(env, { id: "HE-R003", parish: "Trinity" });
  const all = (await req(env, "GET", "/admin/listings")).data.listings;
  assert.deepEqual(all.map(l => [l.id, l.parish, l.matchable]), [["HE-R001", "St Helier", 1], ["HE-R002", "St Helier", 1],
    ["HE-R003", "Trinity", 0]]);
  const trinity = await req(env, "GET", "/admin/listings?parish=Trinity");
  assert.deepEqual(trinity.data.listings.map(l => l.id), ["HE-R003"]);
  assert.deepEqual((await req(env, "GET", "/admin/listings?parish=St%20Helier")).data.listings.map(l => l.id), ["HE-R001", "HE-R002"]);
  assert.equal((await req(env, "GET", "/admin/listings?parish=Narnia")).status, 400);
});

test("a new web registration creates its matches; a duplicate one recomputes nothing", async () => {
  const env = world();
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: "hampton.test" }));
  const web = { operation: "rent", name: "Jane Le Brocq", email: "jane@example.je", phone: "+447797123456",
    budget_max: 2500, bedrooms_min: 2, privacy: true, marketing: false, turnstile: "tok" };
  assert.equal((await call(env, "POST", "/applicants", { body: web })).status, 201);
  const [a] = rows(env, "SELECT id FROM applicants");
  assert.deepEqual(found(env, a.id), ["HE-R001", "HE-R002"]);
  const [e] = rows(env, "SELECT actor FROM events WHERE type = 'applicant.matched'");
  assert.equal(e.actor, "public");

  // A new house appears without a save that recomputes; a duplicate registration leaves the matches as they are.
  seedListing(env, { id: "HE-R003", operation: "rent", availability: "to_let", sale_price: null, rent: 2000,
    rent_period: "month", bedrooms: 2, matchable: 1 });
  assert.equal((await call(env, "POST", "/applicants", { body: web })).status, 201);
  assert.deepEqual(found(env, a.id), ["HE-R001", "HE-R002"]);
});

test("a recompute that fails leaves the save saved and answers as usual", async () => {
  const env = world();
  run(env, "DROP TABLE matches");
  const logged = [], error = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const id = await createApplicant(env);
    assert.ok(row(env, "SELECT 1 FROM applicants WHERE id = ?", id));
    const r = await putListing(env, "HE-R001", { rent: 1900 });
    assert.equal(r.status, 200);
    assert.equal(r.data.listing.rent, 1900);
    assert.equal((await req(env, "POST", "/admin/listings/HE-R001/archive")).status, 200);
  } finally { console.error = error; }
  assert.equal(logged.length, 3);
});
