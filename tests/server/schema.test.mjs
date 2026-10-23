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
