import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie } from "./helpers.mjs";
import { median, reachedStages, groupDemand, topUnmet, jerseyDayStart } from "../../server/insights.js";

const ADMIN = "luismadef45@gmail.com";
const NOW = "2026-10-24T11:00:00Z"; // 12:00 BST: Jersey's today is 2026-10-24
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const get = async (env, query = "") => call(env, "GET", `/admin/insights${query}`, { cookie: await adminCookie(ADMIN) });

test("median: null when empty, the middle value or the mean of the two middle ones", () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 10]), 3.5);
});

test("reachedStages: a later stage implies the earlier ones; lost is not a funnel stage", () => {
  const lost = reachedStages("lost", ["viewing", "offer"]);
  assert.ok(lost.has("viewing") && lost.has("offer"));
  assert.ok(!lost.has("agreed") && !lost.has("lost"));
  assert.deepEqual([...reachedStages("agreed", [])], ["viewing", "offer", "agreed"]);
  assert.deepEqual([...reachedStages("searching", ["new"])], []);
});

test("groupDemand and topUnmet: every wanted parish, Anywhere, Parish unknown and no empty rows", () => {
  const a = (operation, parishes, bedrooms_min, budget_max, matched = 0) =>
    ({ operation, parishes_wanted: parishes && JSON.stringify(parishes), bedrooms_min, budget_max, matched });
  const applicants = [a("rent", ["St Helier", "Grouville"], 2, 1000), a("rent", ["St Helier"], 2, 2000, 1),
    a("rent", null, null, null), a("rent", [], 1, 3000)];
  const listings = [{ operation: "rent", parish: "St Helier", n: 2 }, { operation: "sale", parish: null, n: 1 }];
  assert.deepEqual(groupDemand(applicants, listings), {
    rent: [
      { parish: "Grouville", applicants: 1, unmatched: 1, median_budget: 1000, listings: 0 },
      { parish: "St Helier", applicants: 2, unmatched: 1, median_budget: 1500, listings: 2 },
      { parish: "Anywhere", applicants: 2, unmatched: 2, median_budget: 3000, listings: null },
    ],
    buy: [{ parish: "Parish unknown", applicants: null, unmatched: null, median_budget: null, listings: 1 }],
  });
  assert.deepEqual(topUnmet(applicants), [
    { operation: "rent", parish: "Grouville", bedrooms_min: 2, applicants: 1, median_budget: 1000 },
    { operation: "rent", parish: "St Helier", bedrooms_min: 2, applicants: 1, median_budget: 1000 },
    { operation: "rent", parish: "Anywhere", bedrooms_min: null, applicants: 1, median_budget: null },
    { operation: "rent", parish: "Anywhere", bedrooms_min: 1, applicants: 1, median_budget: 3000 },
  ]);
  const many = Array.from({ length: 12 }, (_, i) => a("buy", null, i, 500000));
  assert.equal(topUnmet(many).length, 10);
});

test("jerseyDayStart: midnight in Jersey as ISO UTC, BST and GMT", () => {
  assert.equal(jerseyDayStart("2026-07-02"), "2026-07-01T23:00:00.000Z");
  assert.equal(jerseyDayStart("2026-12-01"), "2026-12-01T00:00:00.000Z");
  assert.equal(jerseyDayStart("2026-10-25"), "2026-10-24T23:00:00.000Z"); // clocks go back at 01:00 UTC that day
});

// Everything personal the world seeds: none of it may reach the response.
const PERSONAL = [];
let contacts = 0;
function applicant(env, { name, created_at, ...over }) {
  const email = `person${++contacts}@example.je`, phone = `+4477009000${String(contacts).padStart(2, "0")}`;
  PERSONAL.push(name, email, phone);
  const c = run(env, "INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    name, email, phone, created_at, created_at, created_at);
  const a = { contact_id: Number(c.lastInsertRowid), stage: "searching", source: "phone", created_at, updated_at: created_at, ...over };
  if (Array.isArray(a.parishes_wanted)) a.parishes_wanted = JSON.stringify(a.parishes_wanted);
  const cols = Object.keys(a);
  return Number(run(env, `INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    ...Object.values(a)).lastInsertRowid);
}
const match = (env, applicant_id, listing_id, status) => run(env, `INSERT INTO matches
  (applicant_id, listing_id, score, checks, status, created_at, updated_at) VALUES (?, ?, 60, '[]', ?, ?, ?)`,
applicant_id, listing_id, status, "2026-06-02T10:00:00.000Z", "2026-06-02T10:00:00.000Z");
const event = (env, entity_type, id, type, at, actor = ADMIN, data = null) => run(env,
  "INSERT INTO events (at, actor, entity_type, entity_id, type, data) VALUES (?, ?, ?, ?, ?, ?)",
  at, actor, entity_type, String(id), type, data && JSON.stringify(data));
const stage = (env, id, from, to, at) => event(env, "applicant", id, "applicant.stage_changed", at, ADMIN,
  { before: { stage: from }, after: { stage: to, ...(to === "lost" ? { lost_reason: "Bought elsewhere, Ana Le Gros" } : {}) } });
function viewing(env, { listing_id, created_at, date, status, by = "public" }) {
  const name = `Visitor ${created_at}`, email = `visitor${++contacts}@example.je`;
  PERSONAL.push(name, email);
  const id = Number(run(env, `INSERT INTO viewing_requests (listing_id, kind, date, time, name, email, status, created_at)
    VALUES (?, 'In person', ?, '10:00', ?, ?, ?, ?)`, listing_id, date, name, email, status, created_at).lastInsertRowid);
  event(env, "viewing", id, by === "panel" ? "viewing.booked" : "viewing.requested", created_at, by === "panel" ? ADMIN : by);
  return id;
}
const stat = (env, day, listing_id, metric, n) =>
  run(env, "INSERT INTO daily_stats (day, listing_id, metric, n) VALUES (?, ?, ?, ?)", day, listing_id, metric, n);

const OLD = "2026-06-01T10:00:00.000Z"; // before every period
function world() {
  const env = makeEnv();
  const rent = { operation: "rent", availability: "to_let", sale_price: null, rent: 1800, rent_period: "month", matchable: 1 };
  seedListing(env, { id: "HE-R101", title: "Harbour Flat", parish: "St Helier", ...rent });
  seedListing(env, { id: "HE-R102", title: "Town Flat", parish: "St Helier", ...rent });
  seedListing(env, { id: "HE-R103", title: "Agency Flat", parish: "St Clement", ...rent, archived_at: "2026-10-08T10:00:00.000Z" });
  seedListing(env, { id: "HE-R106", title: "Private Flat", parish: "St Helier", ...rent, matchable: 0 });
  seedListing(env, { id: "HE-S104", title: "Bay House", parish: "St Brelade", matchable: 1 });
  seedListing(env, { id: "HE-S105", title: "Unknown House", parish: null, matchable: 1 });

  // Active searches from before every period (demand only).
  const a1 = applicant(env, { name: "Ana Le Gros", created_at: OLD, operation: "rent",
    parishes_wanted: ["St Helier", "St Clement"], bedrooms_min: 2, budget_max: 1800 });
  const a2 = applicant(env, { name: "Bruno Vibert", created_at: OLD, operation: "rent",
    parishes_wanted: ["St Helier"], bedrooms_min: 2, budget_max: 2000 });
  applicant(env, { name: "Carla Renouf", created_at: OLD, operation: "rent", parishes_wanted: ["St Helier"] });
  // Malformed JSON never fails the screen: Dario counts as Anywhere.
  const a4 = applicant(env, { name: "Dario Pallot", created_at: OLD, operation: "rent", budget_max: 1500, parishes_wanted: "[St Helier" });
  const a5 = applicant(env, { name: "Elena Querée", created_at: OLD, operation: "rent",
    parishes_wanted: ["St Clement"], bedrooms_min: 1, budget_max: 1200 });
  applicant(env, { name: "Fabio Hamon", created_at: OLD, operation: "buy", parishes_wanted: ["St Brelade"],
    bedrooms_min: 3, budget_max: 900000 });
  applicant(env, { name: "Gina Falle", created_at: OLD, operation: "buy", bedrooms_min: 3, budget_max: 700000 });
  // Not active: lost, archived.
  applicant(env, { name: "Hugo Lost", created_at: OLD, operation: "rent", parishes_wanted: ["St Helier"], stage: "lost" });
  applicant(env, { name: "Iris Archived", created_at: OLD, operation: "rent", parishes_wanted: ["St Helier"],
    archived_at: "2026-10-01T10:00:00.000Z" });
  match(env, a1, "HE-R101", "found");
  match(env, a2, "HE-R103", "found"); // Review Focus 1: an archived listing is no match
  match(env, a4, "HE-R102", "shortlisted");
  match(env, a5, "HE-R101", "rejected");

  // The 30-day cohort (from 2026-09-25 in Jersey, 2026-09-24T23:00Z).
  const c1 = applicant(env, { name: "Jon Offer", created_at: "2026-10-10T10:00:00.000Z", operation: "rent", stage: "lost",
    first_reviewed_at: "2026-10-10T20:00:00.000Z" });
  stage(env, c1, "searching", "viewing", "2026-10-11T10:00:00.000Z");
  stage(env, c1, "viewing", "offer", "2026-10-12T10:00:00.000Z");
  stage(env, c1, "offer", "lost", "2026-10-13T10:00:00.000Z"); // Review Focus 2
  const c2 = applicant(env, { name: "Kim Completed", created_at: "2026-10-12T10:00:00.000Z", operation: "buy", stage: "completed" });
  run(env, "INSERT INTO events (at, actor, entity_type, entity_id, type, data) VALUES (?, ?, 'applicant', ?, 'applicant.stage_changed', ?)",
    "2026-10-12T12:00:00.000Z", ADMIN, String(c2), "{after: offer");
  const c3 = applicant(env, { name: "Leo Waiting", created_at: "2026-10-20T08:00:00.000Z", operation: "rent", stage: "new",
    source: "web", parishes_wanted: ["St Helier"], bedrooms_min: 2, budget_max: 2200 });
  event(env, "applicant", c3, "applicant.created", "2026-10-20T08:00:00.000Z", "public");
  event(env, "applicant", c3, "applicant.matched", "2026-10-20T09:00:00.000Z", ADMIN, { new: 1 }); // Review Focus 3
  match(env, c3, "HE-R101", "found");
  const c4 = applicant(env, { name: "Mia Reviewed", created_at: "2026-10-21T10:00:00.000Z", operation: "buy", source: "web",
    parishes_wanted: ["St Brelade"], bedrooms_min: 3, budget_max: 800000, first_reviewed_at: "2026-10-21T12:00:00.000Z" });
  event(env, "applicant", c4, "applicant.updated", "2026-10-21T14:00:00.000Z");
  match(env, c4, "HE-S104", "found");
  const c5 = applicant(env, { name: "Ned Viewing", created_at: "2026-10-22T10:00:00.000Z", operation: "buy", stage: "viewing",
    source: "web", parishes_wanted: ["St Brelade"], bedrooms_min: 3, budget_max: 600000,
    first_reviewed_at: "2026-10-24T10:00:00.000Z" });
  stage(env, c5, "new", "viewing", "2026-10-23T10:00:00.000Z");
  match(env, c5, "HE-S104", "shortlisted");
  // 00:30 BST on 25 September is in the period; 23:30 BST on the 24th is not.
  const c6 = applicant(env, { name: "Olga Edge", created_at: "2026-09-24T23:30:00.000Z", operation: "rent", stage: "lost" });
  match(env, c6, "HE-R101", "found");
  applicant(env, { name: "Pia Before", created_at: "2026-09-24T22:30:00.000Z", operation: "rent", stage: "lost" });
  applicant(env, { name: "Quin Archived", created_at: "2026-10-12T10:00:00.000Z", operation: "rent",
    archived_at: "2026-10-13T10:00:00.000Z" });

  // Viewings: web (replied, waiting, older), panel and a legacy 'system' one.
  const v1 = viewing(env, { listing_id: "HE-R101", created_at: "2026-10-20T09:00:00.000Z", date: "2026-10-26", status: "cancelled" });
  event(env, "viewing", v1, "viewing.confirmed", "2026-10-20T12:00:00.000Z");
  event(env, "viewing", v1, "viewing.cancelled", "2026-10-21T12:00:00.000Z");
  viewing(env, { listing_id: "HE-R101", created_at: "2026-10-22T09:00:00.000Z", date: "2026-10-27", status: "requested" });
  viewing(env, { listing_id: "HE-S104", created_at: "2026-10-21T09:00:00.000Z", date: "2026-10-22", status: "completed", by: "panel" });
  const v4 = viewing(env, { listing_id: "HE-R101", created_at: "2026-09-01T09:00:00.000Z", date: "2026-09-03", status: "completed" });
  event(env, "viewing", v4, "viewing.rescheduled", "2026-09-01T14:00:00.000Z");
  event(env, "viewing", v4, "viewing.confirmed", "2026-09-01T16:00:00.000Z");
  viewing(env, { listing_id: "HE-R102", created_at: "2026-10-19T09:00:00.000Z", date: "2026-10-28", status: "requested", by: "system" });
  const v6 = viewing(env, { listing_id: "HE-S105", created_at: "2026-09-24T23:30:00.000Z", date: "2026-09-30", status: "confirmed" });
  event(env, "viewing", v6, "viewing.confirmed", "2026-09-25T00:30:00.000Z");
  viewing(env, { listing_id: "HE-S105", created_at: "2026-09-24T22:30:00.000Z", date: "2026-09-29", status: "requested" });

  stat(env, "2026-10-24", "HE-R101", "view", 5);
  stat(env, "2026-10-24", "HE-R101", "photos", 2);
  stat(env, "2026-10-01", "HE-R101", "view", 3);
  stat(env, "2026-10-01", "HE-R101", "tour", 1);
  stat(env, "2026-08-01", "HE-R101", "view", 10);
  stat(env, "2026-10-20", "HE-S104", "view", 4);
  stat(env, "2026-10-20", "HE-S104", "tour", 2);
  stat(env, "2026-09-24", "HE-R102", "view", 7); // the day before the 30-day period
  stat(env, "2026-10-10", "HE-R102", "tour", 1); // no views in 30 days: not a most viewed listing
  return env;
}

test("insights needs a session and a period of 7, 30 or 90 days", async () => {
  const env = makeEnv();
  assert.equal((await call(env, "GET", "/admin/insights")).status, 401);
  for (const q of ["?days=15", "?days=", "?days=30.0", "?days=abc"]) {
    const r = await get(env, q);
    assert.equal(r.status, 400, q);
    assert.equal(r.data.error, "Choose 7, 30 or 90 days");
  }
  assert.equal((await get(env, "?days=7")).status, 200);
});

test("insights: the 30-day figures, exactly", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(NOW) });
  const env = world();
  const r = await get(env);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(await get(env, "?days=30").then(x => x.data), r.data);
  const d = r.data;
  assert.deepEqual(d.period, { days: 30, from: "2026-09-25", to: "2026-10-24" });
  assert.deepEqual(d.totals, { views: 12, viewing_requests: 5, new_applicants: 6, viewings_completed: 1 });

  // Ana wants St Helier and St Clement: she counts in both. Bruno's only match is on an archived listing: unmatched.
  assert.deepEqual(d.demand, {
    rent: [
      { parish: "St Clement", applicants: 2, unmatched: 1, median_budget: 1500, listings: 0 },
      { parish: "St Helier", applicants: 4, unmatched: 2, median_budget: 2000, listings: 2 },
      { parish: "Anywhere", applicants: 1, unmatched: 0, median_budget: 1500, listings: null },
    ],
    buy: [
      { parish: "St Brelade", applicants: 3, unmatched: 1, median_budget: 800000, listings: 1 },
      { parish: "Anywhere", applicants: 1, unmatched: 1, median_budget: 700000, listings: null },
      { parish: "Parish unknown", applicants: null, unmatched: null, median_budget: null, listings: 1 },
    ],
  });
  assert.deepEqual(d.unmet, [
    { operation: "buy", parish: "St Brelade", bedrooms_min: 3, applicants: 1, median_budget: 900000 },
    { operation: "buy", parish: "Anywhere", bedrooms_min: 3, applicants: 1, median_budget: 700000 },
    { operation: "rent", parish: "St Clement", bedrooms_min: 1, applicants: 1, median_budget: 1200 },
    { operation: "rent", parish: "St Helier", bedrooms_min: null, applicants: 1, median_budget: null },
    { operation: "rent", parish: "St Helier", bedrooms_min: 2, applicants: 1, median_budget: 2000 },
  ]);

  assert.deepEqual(d.views, { first_day: "2026-08-01", rows: [
    { listing_id: "HE-R101", title: "Harbour Flat", views: 8, photos: 2, tour: 1, viewings: 2 },
    { listing_id: "HE-S104", title: "Bay House", views: 4, photos: 0, tour: 2, viewings: 1 },
  ] });

  // Jon reached Offer and then was lost: Viewing, Offer and Lost. Kim completed without recorded steps.
  assert.deepEqual(d.funnel, { registered: 6, viewing: 3, offer: 2, agreed: 1, completed: 1, lost: 2 });

  // (a) Mia 2 h (review before her edit), Ned 24 h; Leo still waits: saving a listing (applicant.matched) is no attention.
  // (b) the request at 00:30 BST on the first day is in (1 h), the one at 23:30 the evening before is not.
  // (c) only Leo waits: active with a found match on an available listing. Olga is lost, Kim completed.
  assert.deepEqual(d.times, {
    attend: { median_hours: 13, cases: 2, waiting: 1 },
    viewing_reply: { median_hours: 2, cases: 2, waiting: 1 },
    first_review: { median_hours: 10, cases: 3, waiting: 1 },
  });

  const text = JSON.stringify(d);
  for (const s of PERSONAL) assert.ok(!text.includes(s), s);
  assert.ok(!text.includes("lost_reason") && !text.includes("Bought elsewhere"));
});

test("insights: 7 and 90 days move every period figure", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(NOW) });
  const env = world();
  const week = (await get(env, "?days=7")).data;
  assert.deepEqual(week.period, { days: 7, from: "2026-10-18", to: "2026-10-24" });
  assert.deepEqual(week.totals, { views: 9, viewing_requests: 4, new_applicants: 3, viewings_completed: 1 });
  assert.deepEqual(week.funnel, { registered: 3, viewing: 1, offer: 0, agreed: 0, completed: 0, lost: 0 });

  const quarter = (await get(env, "?days=90")).data;
  assert.deepEqual(quarter.period, { days: 90, from: "2026-07-27", to: "2026-10-24" });
  assert.deepEqual(quarter.totals, { views: 29, viewing_requests: 7, new_applicants: 7, viewings_completed: 2 });
  assert.deepEqual(quarter.views.rows.map(r => [r.listing_id, r.views, r.viewings]),
    [["HE-R101", 18, 3], ["HE-R102", 7, 1], ["HE-S104", 4, 1]]);
  assert.deepEqual(quarter.times.viewing_reply, { median_hours: 3, cases: 3, waiting: 2 });
  assert.deepEqual(quarter.demand, (await get(env, "?days=7")).data.demand); // demand is today's picture
});

test("insights: an empty database answers with empty blocks", async () => {
  const d = (await get(makeEnv())).data;
  assert.deepEqual(d.totals, { views: 0, viewing_requests: 0, new_applicants: 0, viewings_completed: 0 });
  assert.deepEqual(d.demand, { rent: [], buy: [] });
  assert.deepEqual(d.unmet, []);
  assert.deepEqual(d.views, { first_day: null, rows: [] });
  assert.deepEqual(d.funnel, { registered: 0, viewing: 0, offer: 0, agreed: 0, completed: 0, lost: 0 });
  for (const k of ["attend", "viewing_reply", "first_review"])
    assert.deepEqual(d.times[k], { median_hours: null, cases: 0, waiting: 0 });
});
