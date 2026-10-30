import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, captured, plan, T0 } from "./helpers.mjs";

// ADM-04 (spec 2026-10-30): a listing on the website and still on the market, unconfirmed for 3 months (1 for a
// rental), is To confirm until someone confirms it.
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const stored = (env, id) => ({ ...row(env, "SELECT availability, confirmed_at, updated_at, updated_by FROM listings WHERE id = ?", id) });
const at = (t, iso) => t.mock.timers.enable({ apis: ["Date"], now: Date.parse(iso) });
const due = async env => Object.fromEntries((await req(env, "GET", "/admin/listings")).data.listings.map(l => [l.id, l.to_confirm]));
const counts = async env => (await req(env, "GET", "/admin/notifications/counts")).data;
const OLD = "2026-01-01T12:00:00.000Z";
const RENT = { operation: "rent", availability: "to_let", sale_price: null, rent: 2000, rent_period: "month" };

test("ADM-04: on the market and unconfirmed for 3 months, or 1 for a rental, is To confirm", async t => {
  at(t, "2026-10-30T12:00:00.000Z");
  const env = makeEnv();
  seedListing(env, { id: "HE-R001", confirmed_at: "2026-07-30T12:00:00.000Z" }); // a sale, 3 months to the minute
  seedListing(env, { id: "HE-R002", confirmed_at: "2026-07-31T12:00:00.000Z" }); // a day short
  seedListing(env, { id: "HE-C001", use: "commercial", operation: "business", sale_price: null, premium: 90000,
    confirmed_at: "2026-07-01T12:00:00.000Z" }); // a business counts as a sale
  seedListing(env, { id: "HE-R003", ...RENT, confirmed_at: "2026-09-30T12:00:00.000Z" }); // a rental, 1 month
  seedListing(env, { id: "HE-R004", ...RENT, confirmed_at: "2026-10-01T12:00:00.000Z" });
  assert.deepEqual(await due(env), { "HE-C001": 1, "HE-R001": 1, "HE-R002": 0, "HE-R003": 1, "HE-R004": 0 });
  const c = await counts(env);
  assert.equal(c.to_confirm, 3);
  assert.equal(c.action, 0, "its own number, not part of the Inbox's");
});

test("only listings on the website and still on the market are To confirm", async t => {
  at(t, "2026-10-30T12:00:00.000Z");
  const env = makeEnv();
  seedListing(env, { id: "HE-R001", availability: "lease", confirmed_at: OLD });
  seedListing(env, { id: "HE-R002", availability: "not_stated", confirmed_at: OLD });
  seedListing(env, { id: "HE-R003", confirmed_at: OLD }); // published, no photo yet
  seedListing(env, { id: "HE-R004", published: 0, confirmed_at: OLD });
  seedListing(env, { id: "HE-R005", archived_at: OLD, confirmed_at: OLD });
  seedListing(env, { id: "HE-R006", availability: "under_offer", confirmed_at: OLD });
  seedListing(env, { id: "HE-R007", availability: "sold", confirmed_at: OLD });
  seedListing(env, { id: "HE-R008", availability: "withdrawn", confirmed_at: OLD });
  seedListing(env, { id: "HE-R009", confirmed_at: null });
  assert.deepEqual(await due(env), { "HE-R001": 1, "HE-R002": 1, "HE-R003": 1, "HE-R004": 0, "HE-R005": 0, "HE-R006": 0,
    "HE-R007": 0, "HE-R008": 0, "HE-R009": 0 });
  // A listing's own read says the same.
  assert.equal((await req(env, "GET", "/admin/listings/HE-R001")).data.listing.to_confirm, 1);
  assert.equal((await req(env, "GET", "/admin/listings/HE-R006")).data.listing.to_confirm, 0);
  assert.equal((await counts(env)).to_confirm, 3);
});

test("month ends: a listing's due moment is fixed and never flips back", async t => {
  at(t, "2027-02-28T12:00:00.000Z");
  const env = makeEnv();
  seedListing(env, { id: "HE-R001", confirmed_at: "2026-11-30T12:00:00.000Z" });
  seedListing(env, { id: "HE-R002", confirmed_at: "2027-03-02T12:00:00.000Z" });
  const dueAt = async (iso, id) => { t.mock.timers.setTime(Date.parse(iso)); return (await due(env))[id]; };
  // 30 Nov plus 3 months is 30 Feb, which SQLite rolls over to 2 Mar.
  assert.equal(await dueAt("2027-02-28T12:00:00.000Z", "HE-R001"), 0);
  assert.equal(await dueAt("2027-03-01T12:00:00.000Z", "HE-R001"), 0);
  assert.equal(await dueAt("2027-03-02T12:00:00.000Z", "HE-R001"), 1);
  // 2 Mar plus 3 months is 2 Jun, whatever the length of the months on the way.
  assert.equal(await dueAt("2027-05-31T12:00:00.000Z", "HE-R002"), 0);
  assert.equal(await dueAt("2027-06-01T12:00:00.000Z", "HE-R002"), 0);
  assert.equal(await dueAt("2027-06-02T12:00:00.000Z", "HE-R002"), 1);
  assert.equal(await dueAt("2027-06-03T12:00:00.000Z", "HE-R002"), 1);
});

test("Still available confirms at once and leaves updated_at alone", async t => {
  at(t, "2026-10-30T12:00:00.000Z");
  const env = makeEnv();
  seedListing(env, { id: "HE-R001", confirmed_at: OLD });
  assert.equal((await counts(env)).to_confirm, 1);
  const r = await req(env, "POST", "/admin/listings/HE-R001/confirm");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data, { confirmed_at: "2026-10-30T12:00:00.000Z" });
  // Not a content edit: an editor open with unsaved changes can still save them (no false 409).
  assert.deepEqual(stored(env, "HE-R001"),
    { availability: "for_sale", confirmed_at: "2026-10-30T12:00:00.000Z", updated_at: T0, updated_by: "import" });
  assert.equal((await due(env))["HE-R001"], 0);
  assert.equal((await counts(env)).to_confirm, 0);
  assert.equal((await req(env, "POST", "/admin/listings/HE-R999/confirm")).status, 404);
  assert.equal((await call(env, "POST", "/admin/listings/HE-R001/confirm")).status, 401);
});

// What the editor sends on Save: every field as loaded, plus the changes (admin/src/ListingEditor.jsx toBody).
const FIELDS = ["title", "use", "property_type", "operation", "availability", "country", "location", "road_name", "bedrooms",
  "bathrooms", "tenure", "tenure_type", "housing_category", "restriction", "sale_price", "rent", "rent_period", "premium",
  "currency", "price_text", "summary", "description", "tour_url", "specs"];
async function save(env, id, changes) {
  const { listing } = (await req(env, "GET", `/admin/listings/${id}`)).data;
  const r = await req(env, "PUT", `/admin/listings/${id}`,
    { ...Object.fromEntries(FIELDS.map(k => [k, listing[k] ?? null])), ...changes, updated_at: listing.updated_at });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.listing;
}

test("publishing, a new availability or a new price confirms; other edits do not", async t => {
  at(t, "2026-10-30T12:00:00.000Z");
  const env = makeEnv(), confirmedAt = () => stored(env, "HE-R001").confirmed_at;
  const clock = iso => t.mock.timers.setTime(Date.parse(iso));
  seedListing(env, { id: "HE-R001", confirmed_at: OLD });
  // The price comes back as it was (stored as REAL): an unchanged price is no change.
  clock("2026-10-30T12:01:00.000Z");
  assert.equal((await save(env, "HE-R001", { title: "Le Bernage (edited)", summary: "New text" })).to_confirm, 1);
  assert.equal(confirmedAt(), OLD);
  clock("2026-10-30T12:02:00.000Z");
  assert.equal((await save(env, "HE-R001", { sale_price: 750000 })).to_confirm, 0);
  assert.equal(confirmedAt(), "2026-10-30T12:02:00.000Z");
  clock("2026-10-30T12:03:00.000Z");
  await save(env, "HE-R001", { availability: "not_stated" });
  assert.equal(confirmedAt(), "2026-10-30T12:03:00.000Z");
  // The star and the home page order are not edits.
  run(env, "UPDATE listings SET confirmed_at = ? WHERE id = 'HE-R001'", OLD);
  assert.equal((await req(env, "PUT", "/admin/listings/HE-R001/featured", { featured: true })).status, 200);
  assert.equal((await req(env, "PUT", "/admin/listings/order", { ids: ["HE-R001"] })).status, 200);
  assert.equal(confirmedAt(), OLD);
  // Hiding it does not confirm it; publishing it again does.
  clock("2026-10-30T12:04:00.000Z");
  assert.equal((await req(env, "POST", "/admin/listings/HE-R001/unpublish")).status, 200);
  assert.equal(confirmedAt(), OLD);
  clock("2026-10-30T12:05:00.000Z");
  const p = await req(env, "POST", "/admin/listings/HE-R001/publish");
  assert.equal(p.data.listing.to_confirm, 0);
  assert.equal(confirmedAt(), "2026-10-30T12:05:00.000Z");
});

test("Sales: accepting an offer and a fall-through confirm the listing", async t => {
  at(t, "2026-10-30T12:00:00.000Z");
  const env = makeEnv();
  seedListing(env, { id: "HE-R001", matchable: 1, confirmed_at: OLD });
  const buyer = await req(env, "POST", "/admin/applicants", { name: "Buyer", email: "buyer@example.je", source: "phone",
    operation: "buy", budget_max: 900000 });
  assert.equal(buyer.status, 201, JSON.stringify(buyer.data));
  const offer = await req(env, "POST", "/admin/offers", { listing_id: "HE-R001", applicant_id: buyer.data.id, amount: 750000 });
  assert.equal(offer.status, 201, JSON.stringify(offer.data));
  t.mock.timers.setTime(Date.parse("2026-10-30T12:10:00.000Z"));
  const accepted = await req(env, "POST", `/admin/offers/${offer.data.offer.id}/accept`);
  assert.equal(accepted.status, 201, JSON.stringify(accepted.data)); // it opens the sale
  assert.deepEqual([stored(env, "HE-R001").availability, stored(env, "HE-R001").confirmed_at],
    ["under_offer", "2026-10-30T12:10:00.000Z"]);
  run(env, "UPDATE listings SET confirmed_at = ? WHERE id = 'HE-R001'", OLD);
  t.mock.timers.setTime(Date.parse("2026-10-30T12:20:00.000Z"));
  const sale = row(env, "SELECT id FROM sales WHERE listing_id = 'HE-R001'").id;
  const fell = await req(env, "POST", `/admin/sales/${sale}/fall-through`, { reason: "chain" });
  assert.equal(fell.status, 200, JSON.stringify(fell.data));
  assert.deepEqual([stored(env, "HE-R001").availability, stored(env, "HE-R001").confirmed_at],
    ["for_sale", "2026-10-30T12:20:00.000Z"]);
  assert.equal((await due(env))["HE-R001"], 0);
});

test("the list's parish filter keeps the time bound first", async t => {
  at(t, "2026-10-30T12:00:00.000Z");
  const env = makeEnv();
  seedListing(env, { id: "HE-R001", parish: "St Saviour", confirmed_at: OLD });
  seedListing(env, { id: "HE-R002", parish: "Trinity", confirmed_at: OLD });
  const r = await req(env, "GET", "/admin/listings?parish=St%20Saviour");
  assert.deepEqual(r.data.listings.map(l => [l.id, l.to_confirm]), [["HE-R001", 1]]);
});

test("the counts poll reads only the listings on the website", async () => {
  const env = makeEnv();
  const seen = captured(env, /COUNT\(\*\) AS n FROM listings l/);
  assert.equal((await req(env, "GET", "/admin/notifications/counts")).status, 200);
  assert.equal(seen.length, 1);
  const p = plan(env, seen[0]);
  assert.match(p, /USING (COVERING )?INDEX listings_live/);
  assert.doesNotMatch(p, /^SCAN l$/m);
});
