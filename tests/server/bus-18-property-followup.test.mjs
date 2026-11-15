// BUS-18: on a listing, every search that matched it is its own row with the candidate's EST-13 states, the same the
// applicant's match card shows. One search's decision never moves another's, and a person's search to rent is not
// shown on a home for sale.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";

const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const one = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);

function contact(env, name) {
  return Number(env.DB.raw.prepare("INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(name, `${name.split(" ")[0].toLowerCase()}@example.test`, T0, T0, T0).lastInsertRowid);
}
async function search(env, contactId, operation = "buy") {
  const id = Number(env.DB.raw.prepare(`INSERT INTO applicants (contact_id, stage, source, operation, budget_max, created_at, updated_at)
    VALUES (?, 'searching', 'phone', ?, 1000000, ?, ?)`).run(contactId, operation, T0, T0).lastInsertRowid);
  await recomputeForApplicant(env, id, "system");
  return id;
}
const matchOf = (env, a) => one(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = 'HE-R001'", a).id;
const review = async (env, a, status) => {
  const r = await req(env, "PUT", `/admin/matches/${matchOf(env, a)}`, { status, from: "found", ...(status === "rejected" && { reject_reason: "price" }) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
};

test("each search on the listing carries its own evaluation, decision, availability and enquiry", async () => {
  const env = makeEnv();
  seedListing(env, { id: "HE-R001", matchable: 1, parish: "St Saviour", bedrooms: 3, bathrooms: 2, sale_price: 900000 });
  const jane = contact(env, "Jane Le Brocq");
  const [first, second, other] = [await search(env, jane), await search(env, contact(env, "Ann Renouf")),
    await search(env, contact(env, "Tom Vibert"))];
  const renting = await search(env, jane, "rent");
  await review(env, first, "shortlisted");
  await review(env, other, "rejected");

  const rows = (await req(env, "GET", "/admin/listings/HE-R001")).data.matched_applicants;
  const of = a => rows.find(r => r.applicant_id === a);
  assert.equal(rows.length, 3);
  assert.equal(of(renting), undefined);
  assert.equal(of(first).operation, "buy");
  assert.equal(of(first).states.decision, "approved");
  assert.equal(of(second).states.decision, "undecided");
  assert.equal(of(other).states.decision, "rejected");
  for (const r of rows) {
    assert.equal(r.states.availability, "not_confirmed");
    assert.equal(r.states.enquiry, "not_sent");
    // The same states as the applicant's own match card (EST-13).
    const card = (await req(env, "GET", `/admin/applicants/${r.applicant_id}/matches?status=${r.status}`)).data.matches
      .find(m => m.id === r.match_id);
    assert.deepEqual(r.states, card.states);
  }
});

test("the states are read for the first 50 searches in the list's order, so the request stays cheap", async () => {
  const env = makeEnv();
  seedListing(env, { id: "HE-R001", matchable: 1, parish: "St Saviour", bedrooms: 3, bathrooms: 2, sale_price: 900000 });
  const ids = [];
  for (let i = 0; i < 51; i++) ids.push(await search(env, contact(env, `Person${i} Test`)));
  await review(env, ids[50], "shortlisted"); // shortlisted first: the last search created is the first row
  const rows = (await req(env, "GET", "/admin/listings/HE-R001")).data.matched_applicants;
  assert.equal(rows.length, 51);
  assert.equal(rows[0].applicant_id, ids[50]);
  assert.equal(rows[0].states.decision, "approved");
  assert.equal(rows.slice(0, 50).every(r => r.states), true);
  assert.equal(rows[50].states, undefined);
});

test("a search with damaged data leaves its states out, never the listing", async () => {
  const env = makeEnv();
  seedListing(env, { id: "HE-R001", matchable: 1, parish: "St Saviour", bedrooms: 3, bathrooms: 2, sale_price: 900000 });
  const a = await search(env, contact(env, "Jane Le Brocq"));
  env.DB.raw.prepare("UPDATE applicants SET parishes_wanted = 'St Helier' WHERE id = ?").run(a); // not JSON
  const r = await req(env, "GET", "/admin/listings/HE-R001");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.matched_applicants.length, 1);
  assert.equal(r.data.matched_applicants[0].states, undefined);
});
