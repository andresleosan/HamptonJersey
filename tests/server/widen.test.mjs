import test from "node:test";
import assert from "node:assert/strict";
import { widen } from "../../server/widen.js";

// Rows as the database returns them (list columns are JSON text), as in matching.test.mjs.
const applicant = (o = {}) => ({ operation: "buy", budget_min: null, budget_max: null, budget_stretch: null,
  property_types: null, bedrooms_min: null, bedrooms_ideal: null, bathrooms_min: null, parking_spaces: null,
  outdoor: null, furnished: null, pets: null, parishes_wanted: null, parishes_excluded: null, ...o });
let n = 0;
const listing = (o = {}) => ({ id: `HE-R${String(++n).padStart(3, "0")}`, operation: "sale", sale_price: null, rent: null,
  rent_period: null, bedrooms: null, bathrooms: null, parish: null, feat_pets: null, feat_parking: null, feat_furnished: null,
  feat_outdoor: null, feat_type: null, feat_evidence: null, published: 1, archived_at: null, ...o });
const json = v => JSON.stringify(v);
const alt = (list, key) => list.find(x => x.key === key);

test("budget: +10 % on the top the matching uses, rounded up", () => {
  assert.deepEqual(alt(widen(applicant({ budget_max: 900000 }), [], new Set(), 0), "budget"),
    { key: "budget", field: "budget_max", from: 900000, to: 990000, added: 0 });
  const stretch = alt(widen(applicant({ budget_max: 900000, budget_stretch: 950000 }), [], new Set(), 0), "budget");
  assert.equal(stretch.field, "budget_stretch");
  assert.equal(stretch.to, 1045000);
  assert.equal(alt(widen(applicant({ operation: "rent", budget_max: 2010 }), [], new Set(), 0), "budget").to, 2250);
});

test("budget: hidden without a top or past the validation limit", () => {
  assert.equal(alt(widen(applicant(), [], new Set(), 0), "budget"), undefined);
  assert.equal(alt(widen(applicant({ budget_max: 95000000 }), [], new Set(), 0), "budget"), undefined);
});

test("budget: counts the listings the new top lets in", () => {
  const ls = [listing({ sale_price: 950000 }), listing({ sale_price: 950000 }), listing({ sale_price: 1200000 })];
  assert.equal(alt(widen(applicant({ budget_max: 900000 }), ls, new Set(), 0), "budget").added, 2);
});

test("parish: the free parish that adds most, ties alphabetical", () => {
  // 33 points outside the parishes asked (under MIN_SCORE), 63 inside: the area's 30 decide.
  const a = applicant({ parishes_wanted: json(["St Helier"]), parishes_excluded: json(["St Saviour"]), budget_max: 1000000,
    property_types: json(["flat"]), outdoor: json(["garden"]) });
  const ls = ["St Clement", "Grouville", "St Clement", "Grouville", "St Saviour", "St Saviour", "St Saviour"]
    .map(parish => listing({ parish, sale_price: 500000, feat_type: "house", published: 0 }));
  assert.deepEqual(alt(widen(a, ls, new Set(), 0), "parish"),
    { key: "parish", field: "parishes_wanted", parish: "Grouville", to: ["St Helier", "Grouville"], added: 2 });
});

test("parish: never an excluded or wanted one; hidden when any parish is fine", () => {
  assert.equal(alt(widen(applicant(), [listing({ parish: "Trinity" })], new Set(), 0), "parish"), undefined);
  const all = ["Grouville", "St Brelade", "St Clement", "St Helier", "St John", "St Lawrence", "St Martin", "St Mary",
    "St Ouen", "St Peter", "St Saviour", "Trinity"];
  const full = applicant({ parishes_wanted: json(all.slice(0, 6)), parishes_excluded: json(all.slice(6)) });
  assert.equal(alt(widen(full, [listing({ parish: "Trinity" })], new Set(), 0), "parish"), undefined);
});

test("parish: none adds any", () => {
  const a = applicant({ parishes_wanted: json(["St Helier"]), budget_max: 500000 });
  assert.deepEqual(alt(widen(a, [listing({ parish: "Trinity", sale_price: 900000 })], new Set(), 0), "parish"),
    { key: "parish", field: "parishes_wanted", parish: null, to: null, added: 0 });
});

test("bedrooms: one fewer, hidden at 1 or less", () => {
  const ls = [listing({ bedrooms: 2 }), listing({ bedrooms: 2 }), listing({ bedrooms: 1 })];
  assert.deepEqual(alt(widen(applicant({ bedrooms_min: 3 }), ls, new Set(), 0), "bedrooms"),
    { key: "bedrooms", field: "bedrooms_min", from: 3, to: 2, added: 2 });
  assert.equal(alt(widen(applicant({ bedrooms_min: 1 }), ls, new Set(), 0), "bedrooms"), undefined);
  assert.equal(alt(widen(applicant(), ls, new Set(), 0), "bedrooms"), undefined);
});

test("nothing to widen, and always in the same order", () => {
  assert.deepEqual(widen(applicant(), [], new Set(), 0), []);
  const a = applicant({ budget_max: 900000, parishes_wanted: json(["St Helier"]), bedrooms_min: 2 });
  assert.deepEqual(widen(a, [], new Set(), 0).map(x => x.key), ["budget", "parish", "bedrooms"]);
});

test("taken listings are never counted", () => {
  const ls = [listing({ sale_price: 950000 }), listing({ sale_price: 950000 })];
  assert.equal(alt(widen(applicant({ budget_max: 900000 }), ls, new Set([ls[0].id]), 0), "budget").added, 1);
});

test("capped at the room left under MAX_FOUND", () => {
  const ls = Array.from({ length: 30 }, () => listing({ sale_price: 950000 }));
  assert.equal(alt(widen(applicant({ budget_max: 900000 }), ls, new Set(), 2), "budget").added, 23);
});

// GET /admin/applicants/:id → widen (W1, W3).
import { makeEnv, call, adminCookie, seedListing, T0 } from "./helpers.mjs";

const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const sql = (env, q, ...args) => env.DB.raw.prepare(q).run(...args);
let people = 0;
async function create(env, o = {}) {
  const r = await req(env, "POST", "/admin/applicants", { name: "Jane Le Brocq", email: `jane${++people}@example.je`,
    source: "phone", operation: "buy", budget_max: 900000, ...o });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id;
}
const getWiden = async (env, id) => (await req(env, "GET", `/admin/applicants/${id}`)).data.widen;
const found = (env, id) => env.DB.raw.prepare("SELECT listing_id FROM matches WHERE applicant_id = ? AND status = 'found'")
  .all(id).map(m => m.listing_id);
// A listing that fits a £900,000 buyer with nothing else asked.
const fitting = (env, id, o = {}) => seedListing(env, { id, matchable: 1, parish: "St Helier", sale_price: 800000, ...o });

test("detail: widen with fewer than 3 live matches, null with 3", async () => {
  const env = makeEnv();
  for (const id of ["HE-R001", "HE-R002", "HE-R003"]) fitting(env, id);
  const id = await create(env);
  assert.equal(found(env, id).length, 3);
  assert.equal(await getWiden(env, id), null);
  sql(env, "DELETE FROM matches WHERE applicant_id = ? AND listing_id = 'HE-R003'", id);
  assert.ok(Array.isArray(await getWiden(env, id)));
});

test("detail: a shortlisted listing that left the candidates does not count", async () => {
  const env = makeEnv();
  for (const id of ["HE-R001", "HE-R002", "HE-R003"]) fitting(env, id);
  const id = await create(env);
  sql(env, "UPDATE matches SET status = 'shortlisted' WHERE applicant_id = ?", id);
  assert.equal(await getWiden(env, id), null);
  sql(env, "UPDATE listings SET availability = 'sold' WHERE id = 'HE-R003'");
  assert.ok(Array.isArray(await getWiden(env, id)));
});

test("detail: closed or archived searches get null", async () => {
  const env = makeEnv();
  const lost = await create(env), archived = await create(env);
  assert.ok(Array.isArray(await getWiden(env, lost)));
  sql(env, "UPDATE applicants SET stage = 'lost', lost_reason = 'Bought privately' WHERE id = ?", lost);
  sql(env, "UPDATE applicants SET archived_at = ? WHERE id = ?", T0, archived);
  assert.equal(await getWiden(env, lost), null);
  assert.equal(await getWiden(env, archived), null);
});

test("detail: the counted listings are the new found ones after saving the change", async () => {
  const env = makeEnv();
  // 33 points outside St Helier (under MIN_SCORE), 63 inside; over budget or short of bedrooms fails.
  const base = { feat_type: "house", published: 0, bedrooms: 3, sale_price: 500000 };
  fitting(env, "HE-R001", { ...base, sale_price: 950000 }); // budget up 10 %
  fitting(env, "HE-R002", { ...base, parish: "Trinity" }); // add Trinity
  fitting(env, "HE-R003", { ...base, parish: "Trinity" });
  fitting(env, "HE-R004", { ...base, bedrooms: 2 }); // one bedroom fewer
  const ask = { bedrooms_min: 3, parishes_wanted: ["St Helier"], property_types: ["flat"], outdoor: ["garden"] };
  const ids = [await create(env, ask), await create(env, ask), await create(env, ask)];
  const alts = await getWiden(env, ids[0]);
  assert.deepEqual(alts.map(a => [a.key, a.added]), [["budget", 1], ["parish", 2], ["bedrooms", 1]]);
  for (const [i, alt] of alts.entries()) {
    assert.deepEqual(found(env, ids[i]), []);
    const updated_at = env.DB.raw.prepare("SELECT updated_at FROM applicants WHERE id = ?").get(ids[i]).updated_at;
    const r = await req(env, "PUT", `/admin/applicants/${ids[i]}`, { updated_at, [alt.field]: alt.to });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(found(env, ids[i]).length, alt.added, alt.key);
  }
});

test("detail: a rejected listing is never counted again", async () => {
  const env = makeEnv();
  fitting(env, "HE-R001", { sale_price: 950000 });
  fitting(env, "HE-R002");
  const id = await create(env);
  sql(env, "UPDATE matches SET status = 'rejected', reject_reason = 'price' WHERE applicant_id = ?", id);
  sql(env, `INSERT INTO matches (applicant_id, listing_id, score, checks, status, reject_reason, created_at, updated_at)
    VALUES (?, 'HE-R001', 50, '[]', 'rejected', 'price', ?, ?)`, id, T0, T0);
  assert.equal((await getWiden(env, id)).find(a => a.key === "budget").added, 0);
});

test("detail: shortlisted listings of the other operation do not count", async () => {
  const env = makeEnv();
  for (const id of ["HE-R001", "HE-R002", "HE-R003"]) fitting(env, id);
  const id = await create(env);
  sql(env, "UPDATE matches SET status = 'shortlisted' WHERE applicant_id = ?", id);
  sql(env, "UPDATE applicants SET operation = 'rent', budget_max = 2000 WHERE id = ?", id);
  assert.ok(Array.isArray(await getWiden(env, id)));
});
