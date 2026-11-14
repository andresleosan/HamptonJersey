// EST-13, migration 0069: the versions a match decision is recorded against (BUS-15) move with what the evaluation
// reads and with nothing else. A stage is not a criterion; the criteria of a commercial search are.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeDb, makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { APPROVED } from "../../server/routes/matches.js";

const ADMIN = "admin@example.test";
const MIGRATION = new URL("../../migrations/0069_match_input_versions.sql", import.meta.url);
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie(ADMIN) });

let contacts = 0;
function seedApplicant(db, over) {
  const c = db.prepare("INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run("Ana Le Gros", `est13v-${++contacts}@example.test`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), stage: "searching", source: "phone", created_at: T0, updated_at: T0, ...over };
  const cols = Object.keys(a);
  return Number(db.prepare(`INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...Object.values(a)).lastInsertRowid);
}
const HOME = { operation: "buy", budget_max: 1000000 };
const OFFICE = { search_category: "commercial", operation: "rent", commercial_rent: 2000, commercial_rent_period: "month",
  area_min: 100, area_max: 120, area_unit: "sqm" };
const house = (env, id = "HE-R001") => seedListing(env, { id, matchable: 1, parish: "St Saviour", bedrooms: 3, bathrooms: 2, sale_price: 900000 });
const unit = (env, id = "HE-C001") => seedListing(env, { id, use: "commercial", operation: "rent", availability: "to_let", matchable: 1,
  rent: 24000, rent_period: "year", sale_price: null, interior_area_sqft: 1200, property_type: "Office", parish: "St Helier" });
// One approved match of a new search, and how its card and APPROVED read it afterwards.
async function approved(env, criteria, listing) {
  const a = seedApplicant(env.DB.raw, criteria);
  await recomputeForApplicant(env, a, "system");
  const m = row(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = ?", a, listing).id;
  const r = await req(env, "PUT", `/admin/matches/${m}`, { status: "shortlisted", from: "found" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const decision = async () => {
    const card = (await req(env, "GET", `/admin/applicants/${a}/matches?status=shortlisted`)).data.matches[0];
    const stands = env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM matches m JOIN applicants a ON a.id = m.applicant_id WHERE ${APPROVED} AND m.id = ?`).get(m).n;
    assert.equal(stands === 1, card.states.decision === "approved", "the card and APPROVED agree");
    return card.states.decision;
  };
  assert.equal(await decision(), "approved");
  return { a, decision };
}
const searchVersion = (env, a) => row(env, "SELECT match_inputs_revision AS v FROM applicants WHERE id = ?", a).v;
const listingVersion = (env, id) => row(env, "SELECT COALESCE((SELECT version FROM listing_match_inputs WHERE listing_id = ?), 0) AS v", id).v;

test("changing the stage of a search leaves its approvals standing", async () => {
  const env = makeEnv();
  house(env);
  const { a, decision } = await approved(env, HOME, "HE-R001");
  const before = row(env, "SELECT match_inputs_revision, matches_revision, match_ranking_version FROM applicants WHERE id = ?", a);
  // As the Stage control saves it.
  const r = await req(env, "PUT", `/admin/applicants/${a}`, { stage: "viewing", updated_at: row(env, "SELECT updated_at FROM applicants WHERE id = ?", a).updated_at });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(row(env, "SELECT stage FROM applicants WHERE id = ?", a).stage, "viewing");
  assert.equal(await decision(), "approved");
  assert.deepEqual(row(env, "SELECT match_inputs_revision, matches_revision, match_ranking_version FROM applicants WHERE id = ?", a), before,
    "a stage is not a search input: neither the version, the page cursors nor the ranking move");
  run(env, "UPDATE applicants SET stage = 'offer' WHERE id = ?", a);
  assert.equal(await decision(), "approved");
});

test("a residential criterion, the search's state or a change of the listing still retire the approval", async () => {
  for (const change of ["UPDATE applicants SET budget_max = 950000", "UPDATE applicants SET parking_spaces = 1", "UPDATE applicants SET area_answer = 'any'",
    "UPDATE applicants SET search_state = 'needs_review'", "UPDATE applicants SET archived_at = '2026-11-14T10:00:00.000Z'",
    "UPDATE listings SET sale_price = 850000", "UPDATE listings SET availability = 'under_offer'", "UPDATE listings SET bedrooms = 4"]) {
    const env = makeEnv();
    house(env);
    const { decision } = await approved(env, HOME, "HE-R001");
    run(env, change);
    assert.equal(await decision(), "approved_outdated", change);
  }
});

test("every criterion of a commercial search retires the approval, once per change", async () => {
  const changes = { search_operation: "transfer", commercial_kind: "property", commercial_use: "Cafe", area_min: 90, area_max: 130, area_unit: "sqft",
    commercial_purchase: 400000, commercial_rent: 2100, commercial_rent_period: "year", commercial_premium: 50000, commercial_expenses: 300 };
  for (const [column, value] of Object.entries(changes)) {
    const env = makeEnv();
    unit(env);
    const { a, decision } = await approved(env, OFFICE, "HE-C001");
    const before = searchVersion(env, a);
    run(env, `UPDATE applicants SET ${column} = ? WHERE id = ?`, value, a);
    assert.equal(searchVersion(env, a), before + 1, column);
    assert.equal(await decision(), "approved_outdated", column);
    run(env, `UPDATE applicants SET ${column} = ? WHERE id = ?`, value, a);
    assert.equal(searchVersion(env, a), before + 1, `${column}: saving the same value again changes nothing`);
  }
});

test("a commercial listing's premium, floor area and type retire the approval; on a home they change nothing", async () => {
  const changes = { premium: 60000, interior_area_sqft: 1250, property_type: "Shop" };
  for (const [column, value] of Object.entries(changes)) {
    const env = makeEnv();
    unit(env); house(env);
    const office = await approved(env, OFFICE, "HE-C001"), home = await approved(env, HOME, "HE-R001");
    const before = listingVersion(env, "HE-C001");
    run(env, `UPDATE listings SET ${column} = ? WHERE id = 'HE-C001'`, value);
    assert.equal(listingVersion(env, "HE-C001"), before + 1, column);
    assert.equal(await office.decision(), "approved_outdated", column);
    run(env, `UPDATE listings SET ${column} = ? WHERE id = 'HE-C001'`, value);
    assert.equal(listingVersion(env, "HE-C001"), before + 1, `${column}: saving the same value again changes nothing`);
    // The residential evaluation reads none of the three (its type is feat_type).
    const version = listingVersion(env, "HE-R001");
    run(env, `UPDATE listings SET ${column} = ? WHERE id = 'HE-R001'`, value);
    assert.equal(listingVersion(env, "HE-R001"), version, `${column} of a home`);
    assert.equal(await home.decision(), "approved", `${column} of a home`);
  }
});

test("0069 replaces the two version triggers and writes nothing: existing rows and every other object stay as they were", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  // Only DROP TRIGGER and CREATE TRIGGER statements; the UPDATE and INSERT are inside the trigger bodies.
  const statements = sql.replace(/^--.*$/gm, "").replace(/CREATE TRIGGER[\s\S]*?\bEND;/g, "CREATE TRIGGER;").split(";").map(s => s.trim()).filter(Boolean);
  assert.deepEqual(statements, ["DROP TRIGGER applicants_match_inputs", "CREATE TRIGGER", "DROP TRIGGER listings_match_inputs", "CREATE TRIGGER"]);

  const db = makeDb({ through: 68 }).raw;
  const env = { DB: { raw: db } };
  const home = seedApplicant(db, HOME), office = seedApplicant(db, OFFICE);
  seedListing(env, { id: "HE-R001", matchable: 1, sale_price: 900000 });
  seedListing(env, { id: "HE-C001", use: "commercial", operation: "rent", availability: "to_let", matchable: 1, rent: 24000, rent_period: "year",
    sale_price: null, interior_area_sqft: 1200, property_type: "Office" });
  db.prepare("UPDATE applicants SET budget_max = 950000, stage = 'viewing' WHERE id = ?").run(home); // versions already moved
  db.prepare("UPDATE listings SET sale_price = 880000 WHERE id = 'HE-R001'").run();
  for (const [a, l] of [[home, "HE-R001"], [office, "HE-C001"]]) {
    db.prepare(`INSERT INTO matches (applicant_id, listing_id, score, checks, status, reviewed_by, reviewed_at, created_at, updated_at)
      VALUES (?, ?, 80, '[]', 'shortlisted', ?, ?, ?, ?)`).run(a, l, ADMIN, T0, T0, T0);
    db.prepare("INSERT INTO events (at, actor, entity_type, entity_id, type, data) VALUES (?, ?, 'applicant', ?, 'match.reviewed', ?)")
      .run(T0, ADMIN, String(a), JSON.stringify({ listing_id: l, from: "found", to: "shortlisted", search_version: 0, listing_version: 0 }));
  }
  const tables = ["applicants", "contacts", "listings", "listing_match_inputs", "matches", "events", "notifications"];
  const data = () => Object.fromEntries(tables.map(t => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all().map(r => ({ ...r }))]));
  const schema = () => Object.fromEntries(db.prepare("SELECT type || ' ' || name AS k, sql FROM sqlite_master ORDER BY k").all().map(r => [r.k, r.sql]));
  const rows = data(), objects = schema();
  assert.deepEqual([rows.applicants.map(a => a.match_inputs_revision), rows.listing_match_inputs.length, rows.matches.length, rows.events.length], [[1, 0], 1, 2, 2]);

  db.exec(sql);
  assert.deepEqual(data(), rows, "no row of any table is written");
  const after = schema(), replaced = ["trigger applicants_match_inputs", "trigger listings_match_inputs"];
  assert.deepEqual(Object.keys(after), Object.keys(objects), "no object is added or removed");
  assert.deepEqual(Object.keys(after).filter(k => after[k] !== objects[k]), replaced, "only the two triggers change");
  // What each trigger watches: the same columns as before, less the stage, plus what the commercial evaluation reads.
  const watched = (set, k) => set[k].match(/AFTER UPDATE OF (.*?) ON /)[1].split(",").sort();
  assert.deepEqual(watched(after, replaced[0]), [...watched(objects, replaced[0]).filter(c => c !== "stage"), "search_operation", "commercial_kind",
    "commercial_use", "area_min", "area_max", "area_unit", "commercial_purchase", "commercial_rent", "commercial_rent_period", "commercial_premium",
    "commercial_expenses"].sort());
  assert.deepEqual(watched(after, replaced[1]), [...watched(objects, replaced[1]), "premium", "interior_area_sqft", "property_type"].sort());
  // Every watched column is compared, and the bodies are the ones 0037 wrote.
  for (const k of replaced) {
    for (const column of watched(after, k)) assert.ok(after[k].includes(`OLD.${column} IS NOT NEW.${column}`), `${k} compares ${column}`);
    assert.equal(after[k].slice(after[k].indexOf(" BEGIN")), objects[k].slice(objects[k].indexOf(" BEGIN")), `${k} keeps its body`);
  }
  assert.ok(!after[replaced[0]].includes("stage"));
});
