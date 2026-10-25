import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie } from "./helpers.mjs";

const NOW = "2026-10-24T11:00:00Z"; // 12:00 BST: Jersey's today is 2026-10-24; 7 days start on 2026-10-18
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const insert = (env, table, row) => Number(run(env, `INSERT INTO ${table} (${Object.keys(row).join(", ")})
  VALUES (${Object.keys(row).map(() => "?").join(", ")})`, ...Object.values(row)).lastInsertRowid);
const get = async (env, id, query = "") =>
  call(env, "GET", `/admin/listings/${id}/report${query}`, { cookie: await adminCookie() });

// Everything personal the world seeds: none of it may reach the response.
const PERSONAL = [];
let people = 0;
function buyer(env, name, over = {}) {
  const email = `buyer${++people}@example.je`, phone = `+4477009100${String(people).padStart(2, "0")}`;
  PERSONAL.push(name, email, phone);
  const ts = "2026-06-01T10:00:00.000Z";
  const contact_id = insert(env, "contacts", { name, email, phone, last_activity_at: ts, created_at: ts, updated_at: ts });
  return insert(env, "applicants", { contact_id, operation: "buy", stage: "searching", source: "phone", created_at: ts,
    updated_at: ts, ...over });
}
function viewing(env, listing_id, date, status, over = {}) {
  const name = `Visitor ${++people}`, email = `visitor${people}@example.je`, phone = `+4477009200${String(people).padStart(2, "0")}`;
  PERSONAL.push(name, email, phone);
  insert(env, "viewing_requests", { listing_id, kind: "In person", date, time: "10:00", name, email, phone, status,
    created_at: "2026-10-01T10:00:00.000Z", ...over });
}
const stat = (env, day, listing_id, metric, n) => insert(env, "daily_stats", { day, listing_id, metric, n });
const match = (env, applicant_id, listing_id, status) => insert(env, "matches", { applicant_id, listing_id, score: 60,
  checks: "[]", status, created_at: "2026-06-02T10:00:00.000Z", updated_at: "2026-06-02T10:00:00.000Z" });
const offer = (env, applicant_id, created_at, amount, status, over = {}) => insert(env, "offers", { listing_id: "HE-S201",
  applicant_id, amount, status, note: "Through Ana Le Gros", created_at, updated_at: created_at, ...over });

function world() {
  const env = makeEnv();
  seedListing(env, { id: "HE-S201", title: "Bay House", availability: "under_offer", sale_price: 950000, matchable: 1 });
  seedListing(env, { id: "HE-R202", title: "Harbour Flat", operation: "rent", availability: "to_let", sale_price: null,
    rent: 1800, rent_period: "month", price_text: "£1,800 pcm" });
  seedListing(env, { id: "HE-S203", title: "Other House" });
  seedListing(env, { id: "HE-S204", title: "Quiet House" });
  seedListing(env, { id: "HE-B205", title: "Harbour Café", use: "commercial", operation: "business", sale_price: null,
    premium: 250000, price_text: "Premium on application" });

  // O4: before the 30 days (the first day), before the 7, on both edges, and another listing's.
  stat(env, "2026-09-01", "HE-S201", "view", 10);
  stat(env, "2026-10-10", "HE-S201", "view", 5);
  stat(env, "2026-10-10", "HE-S201", "photos", 2);
  stat(env, "2026-10-18", "HE-S201", "view", 3);
  stat(env, "2026-10-18", "HE-S201", "tour", 1);
  stat(env, "2026-10-24", "HE-S201", "view", 4);
  stat(env, "2026-10-24", "HE-S201", "photos", 1);
  stat(env, "2026-10-20", "HE-S203", "view", 99);
  stat(env, "2026-10-20", "HE-R202", "view", 6);

  // O5, Review Focus 4: the day before the 7 days, both edges, upcoming after today, a stale request, another listing's.
  viewing(env, "HE-S201", "2026-10-17", "completed", { outcome: "not_interested", outcome_note: "Too far from town" });
  viewing(env, "HE-S201", "2026-10-17", "cancelled");
  viewing(env, "HE-S201", "2026-10-18", "completed", { outcome: "proceed", outcome_note: "Loved the garden" });
  viewing(env, "HE-S201", "2026-10-19", "cancelled");
  viewing(env, "HE-S201", "2026-10-20", "completed", { time: "15:00", outcome: "more_info", outcome_note: "Asked about parking" });
  viewing(env, "HE-S201", "2026-10-20", "completed", { time: "09:00" });
  viewing(env, "HE-S201", "2026-10-21", "requested"); // never confirmed, now past: in no count
  viewing(env, "HE-S201", "2026-10-22", "no_show");
  viewing(env, "HE-S201", "2026-10-24", "completed", { outcome: "proceed" });
  viewing(env, "HE-S201", "2026-10-24", "confirmed");
  viewing(env, "HE-S201", "2026-10-28", "requested");
  viewing(env, "HE-S201", "2026-10-30", "cancelled"); // dated after the period
  viewing(env, "HE-S203", "2026-10-20", "completed", { outcome: "proceed", outcome_note: "Other house" });
  viewing(env, "HE-R202", "2026-10-25", "confirmed");

  // O7, Review Focus 5: only active applicants' found or shortlisted matches on this listing.
  const ana = buyer(env, "Ana Le Gros"), bruno = buyer(env, "Bruno Vibert", { stage: "viewing" });
  match(env, ana, "HE-S201", "found");
  match(env, bruno, "HE-S201", "shortlisted");
  match(env, buyer(env, "Carla Renouf"), "HE-S201", "rejected");
  match(env, buyer(env, "Iris Archived", { archived_at: "2026-10-01T10:00:00.000Z" }), "HE-S201", "found");
  match(env, buyer(env, "Hugo Lost", { stage: "lost" }), "HE-S201", "shortlisted");
  match(env, buyer(env, "Kim Completed", { stage: "completed" }), "HE-S201", "found");
  match(env, buyer(env, "Leo Elsewhere"), "HE-S203", "found");

  // O8: numbered by arrival; a closed offer only in its period. 7 days start at 2026-10-17T23:00Z, 30 at 2026-09-24T23:00Z.
  const old = offer(env, ana, "2026-08-01T10:00:00.000Z", 800000, "withdrawn");
  offer(env, bruno, "2026-09-01T10:00:00.000Z", 850000, "pending");
  offer(env, ana, "2026-10-05T10:00:00.000Z", 900000, "rejected");
  const won = offer(env, ana, "2026-10-17T23:30:00.000Z", 945000, "accepted");
  offer(env, bruno, "2026-10-20T10:00:00.000Z", 920000, "countered", { counter_amount: 940000 });
  const ts = "2026-10-19T10:00:00.000Z", parties = { seller_name: "Owner Person", seller_email: "owner@example.je",
    seller_phone: "+447700930001", buyer_lawyer_name: "Ana Le Gros's lawyer", notes: "Ana Le Gros is chain-free" };
  PERSONAL.push("Owner Person", "owner@example.je", "+447700930001");
  insert(env, "sales", { listing_id: "HE-S201", applicant_id: ana, offer_id: old, price: 800000, status: "fallen_through",
    fell_through_reason: "finance", closed_at: "2026-08-20T10:00:00.000Z", created_at: "2026-08-02T10:00:00.000Z",
    updated_at: "2026-08-20T10:00:00.000Z" });
  const sale = insert(env, "sales", { listing_id: "HE-S201", applicant_id: ana, offer_id: won, price: 945000, created_at: ts,
    updated_at: ts, ...parties });
  for (const key of ["lawyers", "due_diligence", "questionnaire", "searches", "mortgage", "contract", "funds", "passing", "settled"])
    insert(env, "sale_milestones", { sale_id: sale, key });
  const step = (key, set) => run(env, `UPDATE sale_milestones SET ${set} WHERE sale_id = ? AND key = ?`, sale, key);
  step("lawyers", "done_on = '2026-10-19'");
  step("due_diligence", "done_on = '2026-10-21'");
  step("questionnaire", "not_needed = 1"); // skipped: neither done nor next
  step("searches", "planned_on = '2026-10-30'");
  return env;
}

test("owner report: web, viewings, demand, offers and sale of a listing for sale over 7 days", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(NOW) });
  const env = world();
  const { status, data } = await get(env, "HE-S201", "?days=7");
  assert.equal(status, 200);
  assert.deepEqual(data.listing, { id: "HE-S201", title: "Bay House", operation: "sale", availability: "under_offer",
    price_text: null, sale_price: 950000, rent: null, rent_period: null, premium: null, currency: "GBP" });
  assert.deepEqual(data.period, { days: 7, from: "2026-10-18", to: "2026-10-24" });

  const { by_day, since, ...web } = data.web;
  assert.deepEqual(web, { views: 7, photos: 1, tour: 1 });
  assert.equal(by_day.length, 7);
  assert.deepEqual(by_day[0], { day: "2026-10-18", views: 3, photos: 0, tour: 1 });
  assert.deepEqual(by_day[1], { day: "2026-10-19", views: 0, photos: 0, tour: 0 });
  assert.deepEqual(by_day[6], { day: "2026-10-24", views: 4, photos: 1, tour: 0 });
  assert.deepEqual(since, { first_day: "2026-09-01", views: 22, photos: 3, tour: 1 });

  const { feedback, ...viewings } = data.viewings;
  assert.deepEqual(viewings, { completed: 4, upcoming: 2, cancelled: 1, no_show: 1 });
  assert.deepEqual(feedback, [
    { date: "2026-10-18", outcome: "proceed", note: "Loved the garden" },
    { date: "2026-10-20", outcome: null, note: null },
    { date: "2026-10-20", outcome: "more_info", note: "Asked about parking" },
    { date: "2026-10-24", outcome: "proceed", note: null },
  ]);

  assert.deepEqual(data.demand, { matched: 2, shortlisted: 1 });
  assert.deepEqual(data.offers, [
    { n: 2, created_at: "2026-09-01T10:00:00.000Z", amount: 850000, status: "pending", counter_amount: null },
    { n: 4, created_at: "2026-10-17T23:30:00.000Z", amount: 945000, status: "accepted", counter_amount: null },
    { n: 5, created_at: "2026-10-20T10:00:00.000Z", amount: 920000, status: "countered", counter_amount: 940000 },
  ]);
  assert.deepEqual(data.sale, { agreed_price: 945000, status: "in_progress", completed_on: null,
    milestones: [{ key: "lawyers", label: "Lawyers instructed", done_on: "2026-10-19" },
      { key: "due_diligence", label: "Housing status and due diligence checked", done_on: "2026-10-21" }],
    next: { key: "searches", label: "Searches (title, planning) back" } });
});

test("owner report: 30 days by default widen every period count, not the totals since the first day", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(NOW) });
  const { status, data } = await get(world(), "HE-S201");
  assert.equal(status, 200);
  assert.deepEqual(data.period, { days: 30, from: "2026-09-25", to: "2026-10-24" });
  assert.equal(data.web.by_day.length, 30);
  assert.deepEqual([data.web.views, data.web.photos, data.web.tour], [12, 3, 1]);
  assert.deepEqual(data.web.since, { first_day: "2026-09-01", views: 22, photos: 3, tour: 1 });
  assert.equal(data.viewings.completed, 5);
  assert.equal(data.viewings.cancelled, 2);
  assert.equal(data.viewings.feedback[0].outcome, "not_interested");
  assert.deepEqual(data.offers.map(o => o.n), [2, 3, 4, 5]);
});

test("owner report: a rental or a business has no offers or sale; a quiet listing reports zeros, never a crash", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(NOW) });
  const env = world();
  const rent = (await get(env, "HE-R202", "?days=7")).data;
  assert.equal(rent.offers, null);
  assert.equal(rent.sale, null);
  assert.equal(rent.listing.price_text, "£1,800 pcm");
  assert.equal(rent.web.views, 6);
  assert.equal(rent.viewings.upcoming, 1);

  // A business: its premium, as the website prices it; offers and sales are for listings for sale only.
  const business = (await get(env, "HE-B205", "?days=7")).data;
  assert.deepEqual([business.listing.operation, business.listing.premium, business.listing.sale_price], ["business", 250000, null]);
  assert.deepEqual([business.offers, business.sale], [null, null]);

  const quiet = (await get(env, "HE-S204", "?days=90")).data;
  assert.equal(quiet.web.by_day.length, 90);
  assert.ok(quiet.web.by_day.every(d => d.views === 0 && d.photos === 0 && d.tour === 0));
  assert.deepEqual(quiet.web.since, { first_day: null, views: 0, photos: 0, tour: 0 });
  assert.deepEqual(quiet.viewings, { completed: 0, upcoming: 0, cancelled: 0, no_show: 0, feedback: [] });
  assert.deepEqual(quiet.demand, { matched: 0, shortlisted: 0 });
  assert.deepEqual(quiet.offers, []);
  assert.equal(quiet.sale, null);
});

test("owner report: the sale in progress, else the latest completed one, never one that fell through", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(NOW) });
  const env = world();
  const sale = async () => (await get(env, "HE-S201", "?days=7")).data.sale;
  const earlier = env.DB.raw.prepare("SELECT id, applicant_id FROM offers WHERE amount = 900000").get();
  insert(env, "sales", { listing_id: "HE-S201", applicant_id: earlier.applicant_id, offer_id: earlier.id, price: 900000,
    status: "completed", closed_at: "2026-10-10T10:00:00.000Z", created_at: "2026-10-06T10:00:00.000Z",
    updated_at: "2026-10-10T10:00:00.000Z" });
  assert.equal((await sale()).status, "in_progress", "the sale in progress comes first");
  // Completed late on the 22nd UTC: the 23rd in Jersey (BST). Its steps stay; nothing is next.
  run(env, "UPDATE sales SET status = 'completed', closed_at = '2026-10-22T23:30:00.000Z' WHERE status = 'in_progress'");
  assert.deepEqual(await sale(), { agreed_price: 945000, status: "completed", completed_on: "2026-10-23",
    milestones: [{ key: "lawyers", label: "Lawyers instructed", done_on: "2026-10-19" },
      { key: "due_diligence", label: "Housing status and due diligence checked", done_on: "2026-10-21" }], next: null });
  run(env, "UPDATE sales SET status = 'fallen_through', fell_through_reason = 'chain' WHERE price = 945000");
  assert.deepEqual(await sale(), { agreed_price: 900000, status: "completed", completed_on: "2026-10-10", milestones: [], next: null });
  run(env, "UPDATE sales SET status = 'fallen_through', fell_through_reason = 'chain' WHERE price = 900000");
  assert.equal(await sale(), null);
});

test("owner report: no applicant, viewer, buyer or seller detail in the response (O6, O7, O8)", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(NOW) });
  const env = world();
  for (const days of ["7", "30", "90"]) {
    const { data } = await get(env, "HE-S201", `?days=${days}`);
    const text = JSON.stringify(data);
    for (const p of PERSONAL) assert.ok(!text.includes(p), `${p} leaked`);
    assert.ok(!text.includes("Ana Le Gros"));
    assert.doesNotMatch(text, /"(name|email|phone|contact_id|applicant_id|buyer\w*|seller\w*)":/);
  }
});

test("owner report: admins only, 7, 30 or 90 days, a listing that exists", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(NOW) });
  const env = world();
  const anon = await call(env, "GET", "/admin/listings/HE-S201/report");
  assert.equal(anon.status, 401);
  const bad = await get(env, "HE-S201", "?days=14");
  assert.deepEqual([bad.status, bad.data.error], [400, "Choose 7, 30 or 90 days"]);
  const missing = await get(env, "HE-S999");
  assert.deepEqual([missing.status, missing.data.error], [404, "Listing not found"]);
});
