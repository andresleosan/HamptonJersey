// EST-16: what the listing says (published status), what a person was told (confirmed availability) and where each
// comes from are three separate things. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./listing-client.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { availabilityState } from "../../server/candidate-state.js";
import { extractFeatures } from "../../server/listing-features.js";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
const HOME = "HE-R001", PATH = `/admin/listings/${HOME}/availability`, EVIDENCE = "Call note FIXTURE-EVIDENCE";
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body, email = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(email) });
const world = ({ ready = true, schema } = {}) => {
  const env = makeEnv(schema);
  if (ready) env.EST16_AVAILABILITY_READY = "1";
  seedListing(env, { id: HOME, operation: "rent", availability: "to_let", rent: 1800, rent_period: "month", sale_price: null, bedrooms: 2,
    bathrooms: 2, housing_category: "registered", matchable: 1, ...extractFeatures({ description: "Parking for two cars" }), parish: "St Helier" });
  return env;
};
const fact = (o = {}) => ({ status: "available", confirmed_at: "2025-03-10T09:30:00.000Z", source: "owner", channel: "phone",
  evidence_ref: EVIDENCE, scope: "property", ...o });
const record = (env, o, email) => req(env, "POST", PATH, fact(o), email);
const read = async env => (await req(env, "GET", PATH)).data;

let contacts = 0;
async function searching(env, name) {
  const c = env.DB.raw.prepare("INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(name, `est16-${++contacts}@example.test`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), operation: "rent", stage: "searching", source: "phone", budget_max: 2000,
    bedrooms_min: 2, pets: '[{"kind":"none"}]', created_at: T0, updated_at: T0,
    requirement_priorities: JSON.stringify({ version: 1, values: { budget: "must", bedrooms: "must" }, unknown: [] }) };
  const cols = Object.keys(a);
  const id = Number(env.DB.raw.prepare(`INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...Object.values(a)).lastInsertRowid);
  await recomputeForApplicant(env, id, "system");
  return id;
}
// The one card of a search, as its Matches tab gets it.
async function card(env, applicant) {
  for (const status of ["found", "shortlisted", "rejected"]) {
    const r = await req(env, "GET", `/admin/applicants/${applicant}/matches?status=${status}`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    if (r.data.matches.length) return r.data.matches[0];
  }
}
const untouched = env => JSON.stringify([rows(env, "SELECT * FROM listings"), rows(env, "SELECT * FROM matches"),
  rows(env, "SELECT * FROM events"), rows(env, "SELECT * FROM notifications")]);

test("only a recorded confirmation with a result becomes a confirmed state", () => {
  assert.equal(availabilityState({ status: "available" }), "confirmed");
  assert.equal(availabilityState({ status: "unavailable" }), "confirmed_unavailable");
  for (const none of [undefined, null, { status: "unknown" }, { status: "unknown", needs_review: true }, {}])
    assert.equal(availabilityState(none), "not_confirmed");
});

test("switched off, or on before migration 0072, cards and routes are as before", async () => {
  for (const [ready, schema] of [[false, {}], [true, { through: 71 }]]) {
    const env = world({ ready, schema });
    // Rows that exist while the switch is off are not read.
    if (!ready) env.DB.raw.prepare(`INSERT INTO availability_confirmations (listing_id, status, confirmed_at, source, channel,
      evidence_ref, recorded_at, recorded_by) VALUES (?, 'available', ?, 'owner', 'phone', 'x', ?, 'fixture')`).run(HOME, T0, T0);
    const ana = await searching(env, "Ana Le Gros");
    assert.deepEqual(await read(env), { enabled: false });
    assert.equal((await record(env)).status, 404);
    const c = await card(env, ana);
    assert.deepEqual(c.states, { evaluation: "complete", decision: "undecided", availability: "not_confirmed", enquiry: "not_sent" });
    assert.equal("availability" in c, false);
    const next = await req(env, "GET", "/admin/review");
    assert.equal(next.data.match.states.availability, "not_confirmed");
  }
});

test("only signed-in staff read or record a confirmation", async () => {
  const env = world();
  assert.equal((await call(env, "GET", PATH)).status, 401);
  assert.equal((await call(env, "POST", PATH, { body: fact() })).status, 401);
  assert.equal(rows(env, "SELECT id FROM availability_confirmations").length, 0);
});

test("a confirmation needs its result, date, source, channel, evidence and scope, and a date that is not in the future", async () => {
  const env = world();
  const refused = async (o, field) => {
    const r = await record(env, o);
    assert.deepEqual([r.status, Object.keys(r.data.fields ?? {})], [400, [field]], JSON.stringify(r.data));
  };
  await refused({ status: "sold" }, "status");
  await refused({ status: undefined }, "status");
  await refused({ confirmed_at: "2025-03-10" }, "confirmed_at");
  await refused({ confirmed_at: "2025-02-30T09:30:00.000Z" }, "confirmed_at");
  await refused({ confirmed_at: new Date(Date.now() + 3600000).toISOString() }, "confirmed_at");
  await refused({ source: "website" }, "source");
  await refused({ channel: "telepathy" }, "channel");
  await refused({ evidence_ref: "   " }, "evidence_ref");
  await refused({ evidence_ref: "x".repeat(301) }, "evidence_ref");
  await refused({ scope: "household" }, "scope");
  assert.equal((await req(env, "POST", PATH, [fact()])).status, 400);
  assert.equal((await req(env, "POST", "/admin/listings/HE-R999/availability", fact())).status, 404);
  assert.equal((await req(env, "GET", "/admin/listings/HE-R999/availability")).status, 404);
  assert.equal(rows(env, "SELECT id FROM availability_confirmations").length, 0);
});

test("one general confirmation shows on every search's card with its date and provenance, and changes nothing else", async () => {
  const env = world();
  const ana = await searching(env, "Ana Le Gros"), ben = await searching(env, "Ben Le Sueur");
  const before = untouched(env);
  assert.deepEqual(await read(env), { enabled: true, published: { availability: "to_let", operation: "rent", archived_at: null },
    current: null, history: [] });

  const r = await record(env, {}, OTHER);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const current = { status: "available", confirmed_at: "2025-03-10T09:30:00.000Z", source: "owner", channel: "phone", operation: null,
    recorded_by: OTHER };
  assert.deepEqual(r.data.current, current);
  assert.deepEqual(r.data.published, { availability: "to_let", operation: "rent", archived_at: null });
  assert.deepEqual(r.data.history.map(({ id, recorded_at, ...h }) => h), [{ ...current, evidence_ref: EVIDENCE }]);
  assert.deepEqual(await read(env), r.data);
  assert.equal(untouched(env), before, "no listing, match, event or notification is written");
  assert.equal(untouched(env).includes("FIXTURE-EVIDENCE"), false);

  // Both searches read the same fact; it decides nothing for either.
  for (const applicant of [ana, ben]) {
    const c = await card(env, applicant);
    assert.deepEqual(c.states, { evaluation: "complete", decision: "undecided", availability: "confirmed", enquiry: "not_sent" });
    assert.deepEqual(c.availability, current);
    assert.equal(JSON.stringify(c).includes("FIXTURE-EVIDENCE"), false, "the evidence text stays with the listing");
  }
  // The review queue and a review's answer carry it too.
  const next = await req(env, "GET", "/admin/review");
  assert.deepEqual([next.data.match.states.availability, next.data.match.availability], ["confirmed", current]);
  const reviewed = await req(env, "PUT", `/admin/matches/${next.data.match.id}`, { status: "shortlisted", from: "found" });
  assert.deepEqual([reviewed.data.match.states.decision, reviewed.data.match.states.availability], ["approved", "confirmed"]);

  // The published status changes: it is the listing's own word and leaves the confirmation as it was.
  env.DB.raw.prepare("UPDATE listings SET availability = 'under_offer' WHERE id = ?").run(HOME);
  const c = await card(env, ben);
  assert.deepEqual([c.listing.availability, c.states.availability, c.availability], ["under_offer", "confirmed", current]);
  assert.deepEqual((await read(env)).published, { availability: "under_offer", operation: "rent", archived_at: null });
});

test("a new confirmation is added, never written over: the latest by its own date is in force and none expires", async () => {
  const env = world();
  const ana = await searching(env, "Ana Le Gros");
  // Confirmed long ago: still in force, nothing expires by itself.
  assert.equal((await record(env, { confirmed_at: "2020-01-05T10:00:00.000Z" })).status, 201);
  assert.equal((await card(env, ana)).states.availability, "confirmed");
  const first = rows(env, "SELECT * FROM availability_confirmations");

  const before = untouched(env);
  const gone = await record(env, { status: "unavailable", confirmed_at: "2025-06-01T15:00:00.000Z", source: "agency", channel: "email" });
  assert.equal(gone.status, 201);
  assert.deepEqual([gone.data.current.status, gone.data.current.source, gone.data.history.length], ["unavailable", "agency", 2]);
  assert.deepEqual(rows(env, "SELECT * FROM availability_confirmations ORDER BY id").slice(0, 1), first, "the earlier one is kept as it was");
  // Not available is a fact about the property: the listing stays published, offered and unarchived (EST-15 propagates).
  assert.equal(untouched(env), before);
  let c = await card(env, ana);
  assert.deepEqual([c.status, c.states.availability, c.availability.status, c.listing.availability], ["found", "confirmed_unavailable", "unavailable", "to_let"]);

  // An older confirmation recorded later does not replace a newer one.
  const late = await record(env, { confirmed_at: "2025-05-01T09:00:00.000Z" });
  assert.deepEqual([late.status, late.data.current.status, late.data.history.length], [201, "unavailable", 3]);
  assert.equal((await card(env, ana)).states.availability, "confirmed_unavailable");

  // Asked again and nobody knows: back to not confirmed, with the whole history kept.
  const unknown = await record(env, { status: "unknown", confirmed_at: "2025-07-01T09:00:00.000Z" });
  assert.deepEqual([unknown.data.current, unknown.data.history.length, unknown.data.history[0].status], [null, 4, "unknown"]);
  c = await card(env, ana);
  assert.deepEqual([c.states.availability, "availability" in c], ["not_confirmed", false]);

  assert.throws(() => env.DB.raw.prepare("UPDATE availability_confirmations SET status = 'available'").run(), /append-only/);
});

test("the same confirmation sent twice is recorded once", async () => {
  const env = world();
  assert.equal((await record(env)).status, 201);
  const again = await record(env);
  assert.deepEqual([again.status, again.data.history.length], [200, 1]);
  assert.equal((await record(env, {}, OTHER)).status, 201, "a colleague's own record of it is another entry");
});

test("a confirmation about one operation says nothing of another; a general one stays", async () => {
  const env = world();
  const let_ = await record(env, { status: "unavailable", scope: "operation", confirmed_at: "2025-06-01T15:00:00.000Z" });
  assert.deepEqual([let_.data.current.status, let_.data.current.operation], ["unavailable", "rent"]);
  assert.deepEqual(rows(env, "SELECT operation FROM availability_confirmations"), [{ operation: "rent" }]);
  // The home is now offered for sale: the rental's confirmation is not about that.
  env.DB.raw.prepare("UPDATE listings SET operation = 'sale', availability = 'for_sale', sale_price = 500000, rent = NULL, rent_period = NULL WHERE id = ?").run(HOME);
  assert.deepEqual([(await read(env)).current, (await read(env)).history.length], [null, 1]);
  await record(env, { confirmed_at: "2025-02-01T09:00:00.000Z" });
  const now = await read(env);
  assert.deepEqual([now.current.status, now.current.operation], ["available", null]);
});

test("two confirmations of the same moment that disagree are left for a person: neither is in force", async () => {
  const env = world();
  const ana = await searching(env, "Ana Le Gros");
  await record(env);
  const r = await record(env, { status: "unavailable" }, OTHER);
  assert.deepEqual(r.data.current, { status: "unknown", needs_review: true });
  const c = await card(env, ana);
  assert.deepEqual([c.states.availability, c.availability], ["not_confirmed", { status: "unknown", needs_review: true }]);
  // A later confirmation settles it.
  assert.equal((await record(env, { confirmed_at: "2025-03-11T09:00:00.000Z" })).data.current.status, "available");
});
