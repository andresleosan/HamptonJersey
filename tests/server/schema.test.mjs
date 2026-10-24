import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { makeEnv, seedListing, seedMedia, T0 } from "./helpers.mjs";
import { OPTIONS } from "../../server/applicants.js";

const MIG = new URL("../../migrations/", import.meta.url);

test("initial admins are seeded", async () => {
  const env = makeEnv();
  const { results } = await env.DB.prepare("SELECT email FROM admins ORDER BY email").all();
  assert.deepEqual(results.map(r => r.email), ["andres.san1404@gmail.com", "luismadef45@gmail.com"]);
});

test("the database itself refuses public external media and zero prices", () => {
  const env = makeEnv();
  seedListing(env);
  assert.throws(() => seedMedia(env, { id: "A9", origin: "external", public: 1 }), /CHECK/);
  assert.throws(() => seedListing(env, { id: "HE-R002", sale_price: 0 }), /CHECK/);
});

const addContact = (env, row) => env.DB.raw.prepare(
  "INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
  .run(row.name ?? "Jane Le Brocq", row.email ?? null, row.phone ?? null, T0, T0, T0);

test("0008: contacts need an email or a phone and refuse duplicates", () => {
  const env = makeEnv();
  assert.throws(() => addContact(env, {}), /CHECK/);
  addContact(env, { email: "jane@example.je" });
  assert.throws(() => addContact(env, { email: "jane@example.je" }), /UNIQUE/);
  assert.throws(() => addContact(env, { email: "Jane@Example.je" }), /CHECK/);
  addContact(env, { phone: "+447797123456" });
  assert.throws(() => addContact(env, { phone: "+447797123456" }), /UNIQUE/);
  assert.throws(() => addContact(env, { phone: "07797123456" }), /CHECK/);
});

test("0008: an email or phone the app would never store is refused", () => {
  const env = makeEnv();
  for (const email of ["", " jane@example.je", "jane le@example.je"])
    assert.throws(() => addContact(env, { email }), /CHECK/, JSON.stringify(email));
  for (const phone of ["+1abc", "+44 7797 123456", "+44-7797123456"])
    assert.throws(() => addContact(env, { phone }), /CHECK/, phone);
});

test("0008: the Feed reads notices newest first without sorting, and an event finds its notices by index", () => {
  const env = makeEnv();
  const plan = sql => env.DB.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map(r => r.detail).join(" | ");
  const feed = plan(`SELECT n.id FROM notifications n JOIN events e ON e.id = n.event_id
    WHERE NOT (n.action_required = 1 AND n.resolved_at IS NULL) ORDER BY n.created_at DESC, n.id DESC LIMIT 200`);
  assert.doesNotMatch(feed, /TEMP B-TREE/, feed);
  const byEvent = plan("SELECT id FROM notifications WHERE event_id IN (SELECT id FROM events WHERE entity_type = 'viewing' AND entity_id = '1')");
  assert.match(byEvent, /SEARCH notifications USING (COVERING )?INDEX \w+ \(event_id=\?\)/, byEvent);
});

test("0008: applicants refuse values outside the closed lists", () => {
  const env = makeEnv();
  const contactId = Number(addContact(env, { email: "jane@example.je" }).lastInsertRowid);
  const addApplicant = over => {
    const row = { contact_id: contactId, operation: "rent", source: "web", created_at: T0, updated_at: T0, ...over };
    const cols = Object.keys(row);
    return env.DB.raw.prepare(`INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
      .run(...cols.map(c => row[c]));
  };
  const id = Number(addApplicant({}).lastInsertRowid);
  assert.equal(env.DB.raw.prepare("SELECT stage FROM applicants WHERE id = ?").get(id).stage, "new");
  assert.throws(() => addApplicant({ operation: "lease" }), /CHECK/);
  assert.throws(() => addApplicant({ bedrooms_min: -1 }), /CHECK/);
  assert.throws(() => addApplicant({ budget_max: 0 }), /CHECK/);
  assert.throws(() => addApplicant({ stage: "won" }), /CHECK/);
  assert.throws(() => addApplicant({ housing_status: "resident" }), /CHECK/);
  assert.throws(() => addApplicant({ contact_id: 999 }), /FOREIGN KEY/);
});

test("0008: pending viewing requests get a notice", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const files = readdirSync(MIG).filter(f => f.endsWith(".sql")).sort();
  for (const f of files.filter(f => f < "0008")) db.exec(readFileSync(new URL(f, MIG), "utf8"));
  const addViewing = (name, status, at) => Number(db.prepare(
    "INSERT INTO viewing_requests (kind, date, time, name, email, status, created_at) VALUES ('viewing', '2026-11-02', '10:00', ?, 'x@example.je', ?, ?)")
    .run(name, status, at).lastInsertRowid);
  const pending = addViewing("Jane Le Brocq", "new", "2026-10-20T09:00:00.000Z");
  addViewing("Tom Renouf", "closed", "2026-10-21T09:00:00.000Z");
  db.exec(readFileSync(new URL(files.find(f => f.startsWith("0008")), MIG), "utf8"));

  const events = db.prepare("SELECT * FROM events").all();
  assert.equal(events.length, 1);
  const { id: eventId, ...event } = events[0];
  assert.deepEqual(event, {
    at: "2026-10-20T09:00:00.000Z", actor: "system", entity_type: "viewing",
    entity_id: String(pending), type: "viewing.requested", data: null });
  const notices = db.prepare("SELECT * FROM notifications WHERE resolved_at IS NULL").all();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].event_id, eventId);
  assert.equal(notices[0].category, "viewing");
  assert.equal(notices[0].action_required, 1);
  assert.equal(notices[0].title, "Viewing request: Jane Le Brocq");
});

// A database with every migration before `prefix` applied, and the function that applies that migration.
const migratedUpTo = prefix => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const files = readdirSync(MIG).filter(f => f.endsWith(".sql")).sort();
  for (const f of files.filter(f => f < prefix)) db.exec(readFileSync(new URL(f, MIG), "utf8"));
  return { db, apply: () => db.exec(readFileSync(new URL(files.find(f => f.startsWith(prefix)), MIG), "utf8")) };
};

const addRow = (db, table, row) => {
  const cols = Object.keys(row);
  return db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...cols.map(c => row[c]));
};

test("0009: matches refuse bad status, reasons without rejection and duplicate pairs", () => {
  const env = makeEnv();
  const db = env.DB.raw;
  seedListing(env);
  seedListing(env, { id: "HE-R002" });
  const contactId = Number(addContact(env, { email: "jane@example.je" }).lastInsertRowid);
  const applicantId = Number(addRow(db, "applicants",
    { contact_id: contactId, operation: "buy", source: "web", created_at: T0, updated_at: T0 }).lastInsertRowid);
  const addMatch = over => addRow(db, "matches", { applicant_id: applicantId, listing_id: "HE-R001", score: 60,
    checks: "[]", status: "found", created_at: T0, updated_at: T0, ...over });

  addMatch({});
  assert.throws(() => addMatch({}), /UNIQUE/);
  assert.throws(() => addMatch({ listing_id: "HE-R002", status: "approved" }), /CHECK/);
  assert.throws(() => addMatch({ listing_id: "HE-R002", status: "found", reject_reason: "price" }), /CHECK/);
  assert.throws(() => addMatch({ listing_id: "HE-R002", status: "shortlisted", reject_reason: "price" }), /CHECK/);
  assert.throws(() => addMatch({ listing_id: "HE-R002", status: "rejected", reject_reason: "too far" }), /CHECK/);
  assert.throws(() => addMatch({ listing_id: "HE-R002", score: 101 }), /CHECK/);
  assert.throws(() => addMatch({ listing_id: "HE-R999" }), /FOREIGN KEY/);
  addMatch({ listing_id: "HE-R002", status: "rejected", reject_reason: "price" });

  db.prepare("DELETE FROM listings WHERE id = 'HE-R002'").run();
  assert.equal(db.prepare("SELECT count(*) AS n FROM matches").get().n, 1);
  db.prepare("DELETE FROM applicants WHERE id = ?").run(applicantId);
  assert.equal(db.prepare("SELECT count(*) AS n FROM matches").get().n, 0);
});

test("0009: listings get parish/matchable/feature columns with their CHECKs", () => {
  const env = makeEnv();
  const db = env.DB.raw;
  seedListing(env, { parish: "St Saviour", feat_pets: "yes", feat_parking: 2, feat_furnished: "no",
    feat_outdoor: '["garden"]', feat_type: "house", feat_evidence: '{"pets":"Pets considered"}', features_at: T0 });
  assert.equal(db.prepare("SELECT matchable FROM listings WHERE id = 'HE-R001'").get().matchable, 0);
  seedListing(env, { id: "HE-R002" });
  assert.deepEqual({ ...db.prepare(`SELECT parish, feat_pets, feat_parking, feat_furnished, feat_outdoor, feat_type,
    feat_evidence, features_at FROM listings WHERE id = 'HE-R002'`).get() }, { parish: null, feat_pets: null,
    feat_parking: null, feat_furnished: null, feat_outdoor: null, feat_type: null, feat_evidence: null, features_at: null });
  const bad = [{ parish: "St Aubin" }, { parish: "st helier" }, { matchable: 2 }, { feat_pets: "maybe" },
    { feat_parking: -1 }, { feat_furnished: "either" }, { feat_type: "bungalow" }];
  bad.forEach((over, i) => assert.throws(() => seedListing(env, { id: `HE-R1${i}`, ...over }), /CHECK/, JSON.stringify(over)));
  OPTIONS.parishes.forEach(([parish], i) => seedListing(env, { id: `HE-R2${String(i).padStart(2, "0")}`, parish }));
  assert.ok(db.prepare("PRAGMA table_info(applicants)").all().some(c => c.name === "first_reviewed_at"));
});

test("0009: matchable is set for published listings and the agency import range only", () => {
  const { db, apply } = migratedUpTo("0009");
  const listing = (id, published, archived_at) => addRow(db, "listings", { id, use: "residential", title: id,
    operation: "sale", availability: "for_sale", published, archived_at, created_at: T0, updated_at: T0 });
  listing("HE-R003", 1, null);
  listing("HE-R010", 0, T0);
  listing("HE-R100", 0, T0);
  listing("HE-R300", 0, T0);
  apply();
  const rows = db.prepare("SELECT id, matchable FROM listings ORDER BY id").all();
  assert.deepEqual(rows.map(r => [r.id, r.matchable]), [["HE-R003", 1], ["HE-R010", 0], ["HE-R100", 1], ["HE-R300", 0]]);
});

test("0009: notifications rebuilt keep rows, indexes and accept matched", () => {
  const { db, apply } = migratedUpTo("0009");
  const eventId = Number(addRow(db, "events", { at: T0, actor: "public", entity_type: "applicant", entity_id: "1",
    type: "applicant.created" }).lastInsertRowid);
  addRow(db, "notifications", { id: 7, event_id: eventId, category: "new_applicant", title: "New applicant: Jane",
    action_required: 1, created_at: T0, resolved_at: T0, resolved_by: "luismadef45@gmail.com" });
  const before = db.prepare("SELECT * FROM notifications").all();
  apply();

  assert.deepEqual(db.prepare("SELECT * FROM notifications").all(), before);
  addRow(db, "notifications", { event_id: eventId, category: "matched", title: "3 properties found",
    action_required: 1, created_at: T0 });
  assert.throws(() => addRow(db, "notifications", { event_id: eventId, category: "other", title: "x",
    action_required: 0, created_at: T0 }), /CHECK/);
  assert.throws(() => addRow(db, "notifications", { event_id: 999, category: "matched", title: "x",
    action_required: 0, created_at: T0 }), /FOREIGN KEY/);
  const indexes = db.prepare("PRAGMA index_list(notifications)").all().map(r => r.name).sort();
  assert.deepEqual(indexes, ["notifications_created", "notifications_event", "notifications_open"]);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'notifications_new'").get().n, 0);
});

const HOURS = '{"mon":["10:00","17:30"],"tue":["10:00","17:30"],"wed":["10:00","17:30"],"thu":["10:00","17:30"],' +
  '"fri":["10:00","17:30"],"sat":["10:00","13:00"],"sun":null}';
const OLD_COLS = "id, listing_id, agent, kind, date, time, name, email, phone, status, created_at, updated_at, updated_by, " +
  "listing_ref, listing_title_snapshot, notes";

test("0010: viewing requests keep ids and data and map their status", () => {
  const { db, apply } = migratedUpTo("0010");
  addRow(db, "listings", { id: "HE-R001", use: "residential", title: "Le Bernage", operation: "sale",
    availability: "for_sale", created_at: T0, updated_at: T0 });
  const viewing = (id, status, date, agent, over = {}) => addRow(db, "viewing_requests", { id, listing_id: null,
    agent, kind: "In person", date, time: "11:30", name: `Person ${id}`, email: `p${id}@example.je`, status,
    created_at: T0, ...over });
  viewing(3, "new", "2026-11-02", "Joshua Franco", { listing_id: "HE-R001", listing_ref: "HE-R001",
    listing_title_snapshot: "Le Bernage", phone: "07797 123456", notes: "Wants Saturday" });
  viewing(5, "contacted", "2026-11-03", "Gilberto Franco", { updated_at: T0, updated_by: "luismadef45@gmail.com" });
  viewing(8, "closed", "2020-01-06", "Joshua Franco", { time: "17:00" });
  viewing(9, "closed", "2099-01-05", null);
  viewing(12, "new", "2026-11-04", "Someone else", { time: "10:00" });
  // A deleted request keeps its id retired: its events still name it.
  viewing(15, "new", "2026-11-05", null);
  db.prepare("DELETE FROM viewing_requests WHERE id = 15").run();
  const before = db.prepare(`SELECT ${OLD_COLS} FROM viewing_requests ORDER BY id`).all();
  apply();

  const after = db.prepare(`SELECT ${OLD_COLS} FROM viewing_requests ORDER BY id`).all().map(r => ({ ...r }));
  const status = { 3: "requested", 5: "confirmed", 8: "completed", 9: "cancelled", 12: "requested" };
  assert.deepEqual(after, before.map(r => ({ ...r, status: status[r.id] })));
  const nego = Object.fromEntries(db.prepare("SELECT name, id FROM negotiators").all().map(r => [r.name, r.id]));
  const added = db.prepare("SELECT id, negotiator_id, end_time, outcome, outcome_note FROM viewing_requests ORDER BY id").all();
  assert.deepEqual(added.map(r => ({ ...r })), [
    { id: 3, negotiator_id: nego["Joshua Franco"], end_time: "12:00", outcome: null, outcome_note: null },
    { id: 5, negotiator_id: nego["Gilberto Franco"], end_time: "12:00", outcome: null, outcome_note: null },
    { id: 8, negotiator_id: nego["Joshua Franco"], end_time: "17:30", outcome: null, outcome_note: null },
    { id: 9, negotiator_id: null, end_time: "12:00", outcome: null, outcome_note: null },
    { id: 12, negotiator_id: null, end_time: "10:30", outcome: null, outcome_note: null },
  ]);
  const id = Number(addRow(db, "viewing_requests", { kind: "In person", date: "2026-11-06", time: "10:00",
    name: "New", email: "n@example.je", created_at: T0 }).lastInsertRowid);
  assert.equal(id, 16);
  assert.equal(db.prepare("SELECT status FROM viewing_requests WHERE id = ?").get(id).status, "requested");
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'viewing_requests_new'").get().n, 0);
});

test("0010: a database with no viewing requests migrates too", () => {
  const { db, apply } = migratedUpTo("0010");
  apply();
  assert.equal(Number(addRow(db, "viewing_requests", { kind: "In person", date: "2026-11-06", time: "10:00",
    name: "New", email: "n@example.je", created_at: T0 }).lastInsertRowid), 1);
});

test("0010: negotiators are seeded and exceptions enforce their CHECKs", () => {
  const db = makeEnv().DB.raw;
  const seeded = db.prepare("SELECT id, name, role, active, hours, created_at, updated_at, updated_by FROM negotiators ORDER BY id").all();
  assert.deepEqual(seeded.map(({ name, role, active, hours, updated_by }) => ({ name, role, active, hours, updated_by })), [
    { name: "Gilberto Franco", role: "Managing Director", active: 1, hours: HOURS, updated_by: "setup" },
    { name: "Joshua Franco", role: "Negotiator", active: 1, hours: HOURS, updated_by: "setup" },
  ]);
  assert.ok(seeded.every(n => n.created_at && n.updated_at));
  const negotiator = over => addRow(db, "negotiators", { name: "Jane", hours: HOURS, created_at: T0, updated_at: T0, ...over });
  assert.throws(() => negotiator({ name: "Joshua Franco" }), /UNIQUE/);
  for (const over of [{ name: "" }, { name: "x".repeat(81) }, { role: "x".repeat(81) }, { active: 2 }])
    assert.throws(() => negotiator(over), /CHECK/, JSON.stringify(over));
  assert.throws(() => negotiator({ hours: null }), /NOT NULL/);

  const [{ id }] = seeded;
  const exception = over => addRow(db, "negotiator_exceptions", { negotiator_id: id, date: "2026-11-02", kind: "block",
    created_at: T0, ...over });
  exception({});
  exception({ start_time: "12:00", end_time: "13:00", note: "Dentist" });
  exception({ kind: "open", start_time: "14:00", end_time: "17:00" });
  const bad = [{ kind: "open" }, { start_time: "12:00", end_time: "12:00" }, { start_time: "13:00", end_time: "12:00" },
    { start_time: "12:00" }, { end_time: "12:00" }, { kind: "holiday" }, { note: "x".repeat(201) }];
  for (const over of bad) assert.throws(() => exception(over), /CHECK/, JSON.stringify(over));
  assert.throws(() => exception({ negotiator_id: 999 }), /FOREIGN KEY/);
  db.prepare("DELETE FROM negotiators WHERE id = ?").run(id);
  assert.equal(db.prepare("SELECT count(*) AS n FROM negotiator_exceptions").get().n, 0);
});

test("0010: viewing requests refuse bad status, outcome outside completed and no contact", () => {
  const db = makeEnv().DB.raw;
  const negotiatorId = db.prepare("SELECT id FROM negotiators WHERE name = 'Joshua Franco'").get().id;
  const viewing = over => addRow(db, "viewing_requests", { kind: "In person", date: "2026-11-02", time: "10:00",
    end_time: "10:30", negotiator_id: negotiatorId, name: "Jane", email: "j@example.je", created_at: T0, ...over });
  for (const status of ["requested", "confirmed", "no_show", "cancelled"]) viewing({ status });
  for (const outcome of ["proceed", "more_info", "not_interested"])
    viewing({ status: "completed", outcome, outcome_note: "x".repeat(500) });
  viewing({ email: null, phone: "+447797123456" });
  const bad = [{ status: "new" }, { status: "contacted" }, { status: "closed" }, { status: "confirmed", outcome: "proceed" },
    { status: "completed", outcome: "maybe" }, { status: "completed", outcome: "proceed", outcome_note: "x".repeat(501) },
    { email: null, phone: null }];
  for (const over of bad) assert.throws(() => viewing(over), /CHECK/, JSON.stringify(over));
  assert.throws(() => viewing({ negotiator_id: 999 }), /FOREIGN KEY/);
  db.prepare("DELETE FROM negotiators WHERE id = ?").run(negotiatorId);
  assert.equal(db.prepare("SELECT count(*) AS n FROM viewing_requests WHERE negotiator_id IS NOT NULL").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM viewing_requests").get().n, 8);
});

test("0010: viewing indexes exist", () => {
  const db = makeEnv().DB.raw;
  const names = table => db.prepare(`PRAGMA index_list(${table})`).all().map(r => r.name).sort();
  assert.deepEqual(names("viewing_requests"), ["viewing_listing", "viewing_negotiator_day", "viewing_status"]);
  assert.ok(names("negotiator_exceptions").includes("negotiator_exceptions_day"));
  const cols = index => db.prepare(`PRAGMA index_info(${index})`).all().map(r => r.name);
  assert.deepEqual(cols("viewing_status"), ["status", "created_at"]);
  assert.deepEqual(cols("viewing_negotiator_day"), ["negotiator_id", "date"]);
  assert.deepEqual(cols("viewing_listing"), ["listing_id", "date"]);
  assert.deepEqual(cols("negotiator_exceptions_day"), ["negotiator_id", "date"]);
});

test("0011: daily_stats refuses unknown metrics and negative counts", () => {
  const env = makeEnv();
  seedListing(env);
  const db = env.DB.raw;
  const add = over => addRow(db, "daily_stats", { day: "2026-10-24", listing_id: "HE-R001", metric: "view", n: 1, ...over });
  for (const metric of ["view", "photos", "tour"]) add({ metric });
  add({ day: "2026-10-25", n: 0 });
  for (const over of [{ metric: "booking" }, { day: "2026-10-26", n: -1 }])
    assert.throws(() => add(over), /CHECK/, JSON.stringify(over));
  assert.throws(() => add({ day: "2026-10-26", listing_id: "HE-R999" }), /FOREIGN KEY/);
  assert.throws(() => add({}), /UNIQUE|PRIMARY KEY/);
  db.prepare("DELETE FROM listings WHERE id = 'HE-R001'").run();
  assert.equal(db.prepare("SELECT count(*) AS n FROM daily_stats").get().n, 0);
});

// 0012: a buyer (applicant) per call, and offers/sales rows with sensible defaults.
const addBuyer = (env, email) => Number(addRow(env.DB.raw, "applicants", { contact_id: Number(addContact(env, { email })
  .lastInsertRowid), operation: "buy", source: "web", created_at: T0, updated_at: T0 }).lastInsertRowid);
const addOffer = (db, over) => Number(addRow(db, "offers", { listing_id: "HE-R001", amount: 750000, created_at: T0,
  updated_at: T0, ...over }).lastInsertRowid);
const addSale = (db, over) => Number(addRow(db, "sales", { listing_id: "HE-R001", price: 750000, created_at: T0,
  updated_at: T0, ...over }).lastInsertRowid);
const count = (db, table) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;

test("0012: an offer refuses a zero amount, an unknown status and a counter amount without countered", () => {
  const env = makeEnv();
  const db = env.DB.raw;
  seedListing(env);
  const buyer = addBuyer(env, "jane@example.je");
  const id = addOffer(db, { applicant_id: buyer });
  assert.equal(db.prepare("SELECT status FROM offers WHERE id = ?").get(id).status, "pending");
  addOffer(db, { applicant_id: buyer, status: "countered", counter_amount: 760000, conditions: "x".repeat(1000) });
  // An accepted, rejected or withdrawn offer keeps the counter it went through (V21: the price it was accepted at).
  addOffer(db, { applicant_id: buyer, status: "accepted", counter_amount: 760000, note: "x".repeat(300) });
  const bad = [{ amount: 0 }, { amount: 100000001 }, { status: "open" }, { counter_amount: 760000 },
    { status: "countered" }, { status: "countered", counter_amount: 0 }, { conditions: "x".repeat(1001) },
    { note: "x".repeat(301) }];
  for (const over of bad) assert.throws(() => addOffer(db, { applicant_id: buyer, ...over }), /CHECK/, JSON.stringify(over));
  assert.throws(() => addOffer(db, { applicant_id: buyer, listing_id: "HE-R999" }), /FOREIGN KEY/);
  assert.throws(() => addOffer(db, { applicant_id: 999 }), /FOREIGN KEY/);
  const cols = index => db.prepare(`PRAGMA index_info(${index})`).all().map(r => r.name);
  assert.deepEqual(cols("offers_listing"), ["listing_id", "status"]);
  assert.deepEqual(cols("offers_applicant"), ["applicant_id"]);
});

test("0012: two in-progress sales of one listing, or of one buyer, are refused by the database", () => {
  const env = makeEnv();
  const db = env.DB.raw;
  seedListing(env);
  seedListing(env, { id: "HE-R002" });
  const jane = addBuyer(env, "jane@example.je"), tom = addBuyer(env, "tom@example.je");
  const o1 = addOffer(db, { applicant_id: jane }), o2 = addOffer(db, { applicant_id: tom });
  const o3 = addOffer(db, { applicant_id: jane, listing_id: "HE-R002" });
  const first = addSale(db, { applicant_id: jane, offer_id: o1 });
  assert.equal(db.prepare("SELECT status FROM sales WHERE id = ?").get(first).status, "in_progress");
  assert.throws(() => addSale(db, { applicant_id: tom, offer_id: o2 }), /UNIQUE/);
  assert.throws(() => addSale(db, { applicant_id: jane, offer_id: o3, listing_id: "HE-R002" }), /UNIQUE/);

  db.prepare("UPDATE sales SET status = 'fallen_through', fell_through_reason = 'finance', closed_at = ? WHERE id = ?")
    .run(T0, first);
  addSale(db, { applicant_id: tom, offer_id: o2 });
  addSale(db, { applicant_id: jane, offer_id: o3, listing_id: "HE-R002" });
  assert.throws(() => addSale(db, { applicant_id: jane, offer_id: o1, status: "completed", closed_at: T0 }), /UNIQUE/);
  assert.deepEqual(db.prepare("PRAGMA index_list(sales)").all().filter(i => i.partial).map(i => [i.name, i.unique]).sort(),
    [["sales_applicant_open", 1], ["sales_listing_open", 1]]);
});

test("0012: sales and milestones refuse values outside their CHECKs", () => {
  const env = makeEnv();
  const db = env.DB.raw;
  seedListing(env);
  const buyer = addBuyer(env, "jane@example.je");
  const offer = addOffer(db, { applicant_id: buyer });
  const sale = over => addSale(db, { applicant_id: buyer, offer_id: offer, ...over });
  const bad = [{ price: 0 }, { price: 100000001 }, { route: "leasehold" }, { status: "agreed" }, { fee: 0 },
    { fee: 5000, shared_fee: 5001 }, { shared_fee: 1000 }, { notes: "x".repeat(2001) },
    { status: "fallen_through", closed_at: T0 }, { status: "fallen_through", fell_through_reason: "weather", closed_at: T0 },
    { fell_through_reason: "finance" }, { status: "completed" }, { closed_at: T0 }];
  for (const over of bad) assert.throws(() => sale(over), /CHECK/, JSON.stringify(over));
  assert.throws(() => sale({ offer_id: 999 }), /FOREIGN KEY/);
  const id = sale({ route: "share_transfer", fee: 5000, shared_fee: 5000, notes: "x".repeat(2000) });

  const milestone = over => addRow(db, "sale_milestones", { sale_id: id, key: "lawyers", ...over });
  milestone({});
  assert.equal(db.prepare("SELECT not_needed FROM sale_milestones").get().not_needed, 0);
  assert.throws(() => milestone({}), /UNIQUE|PRIMARY KEY/);
  for (const over of [{ key: "mortgage", not_needed: 2 }, { key: "mortgage", not_needed: 1, done_on: "2026-10-24" },
    { key: "mortgage", note: "x".repeat(301) }])
    assert.throws(() => milestone(over), /CHECK/, JSON.stringify(over));
  assert.throws(() => milestone({ sale_id: 999 }), /FOREIGN KEY/);
});

test("0012: deleting a listing or applicant with offers deletes the offers; with a sale it fails", () => {
  const env = makeEnv();
  const db = env.DB.raw;
  seedListing(env);
  seedListing(env, { id: "HE-R002" });
  const jane = addBuyer(env, "jane@example.je"), tom = addBuyer(env, "tom@example.je");
  addOffer(db, { applicant_id: jane });
  db.prepare("DELETE FROM listings WHERE id = 'HE-R001'").run();
  assert.equal(count(db, "offers"), 0);
  addOffer(db, { applicant_id: tom, listing_id: "HE-R002" });
  db.prepare("DELETE FROM applicants WHERE id = ?").run(tom);
  assert.equal(count(db, "offers"), 0);

  const offer = addOffer(db, { applicant_id: jane, listing_id: "HE-R002" });
  const sale = addSale(db, { applicant_id: jane, offer_id: offer, listing_id: "HE-R002", status: "completed", closed_at: T0 });
  addRow(db, "sale_milestones", { sale_id: sale, key: "lawyers" });
  assert.throws(() => db.prepare("DELETE FROM listings WHERE id = 'HE-R002'").run(), /FOREIGN KEY/);
  assert.throws(() => db.prepare("DELETE FROM applicants WHERE id = ?").run(jane), /FOREIGN KEY/);
  assert.deepEqual([count(db, "listings"), count(db, "applicants"), count(db, "offers"), count(db, "sales")], [1, 1, 1, 1]);
  // Milestones go with their sale (the panel never deletes a sale: D9).
  db.prepare("DELETE FROM sales WHERE id = ?").run(sale);
  assert.equal(count(db, "sale_milestones"), 0);
});
