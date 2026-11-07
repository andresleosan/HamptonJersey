import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, T0 } from "./helpers.mjs";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

test("migration preserves pre-existing searches and does not infer household answers", () => {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith(".sql") && f < "0025").sort())
    db.exec(readFileSync(new URL(file, dir), "utf8"));
  db.prepare("INSERT INTO contacts (id, name, email, last_activity_at, created_at, updated_at) VALUES (1, 'Test', 'test@example.je', ?, ?, ?)").run(T0, T0, T0);
  db.prepare("INSERT INTO applicants (id, contact_id, operation, source, household_adults, created_at, updated_at) VALUES (1, 1, 'rent', 'phone', 2, ?, ?)").run(T0, T0);
  db.exec(readFileSync(new URL("0025_registration_categories.sql", dir), "utf8"));
  const row = db.prepare("SELECT search_category, search_state, household_adults, household_children, household_total FROM applicants WHERE id = 1").get();
  assert.deepEqual({ ...row }, { search_category: "residential", search_state: "active", household_adults: 2, household_children: null, household_total: null });
});

test("a contact may have residential and commercial searches for the same operation, but not two active searches in either category", () => {
  const { DB: { raw: db } } = makeEnv();
  const contact = Number(db.prepare("INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES ('Test', 'test@example.je', ?, ?, ?)")
    .run(T0, T0, T0).lastInsertRowid);
  const add = db.prepare("INSERT INTO applicants (contact_id, operation, search_category, source, created_at, updated_at) VALUES (?, 'rent', ?, 'phone', ?, ?)");
  add.run(contact, "residential", T0, T0);
  add.run(contact, "commercial", T0, T0);
  assert.throws(() => add.run(contact, "residential", T0, T0), /UNIQUE/);
  assert.throws(() => add.run(contact, "commercial", T0, T0), /UNIQUE/);
});

test("a commercial transfer has independent uniqueness and cannot be recorded as a residential search", () => {
  const { DB: { raw: db } } = makeEnv();
  const contact = Number(db.prepare("INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES ('Test', 'test@example.je', ?, ?, ?)")
    .run(T0, T0, T0).lastInsertRowid);
  const add = db.prepare("INSERT INTO applicants (contact_id, operation, search_category, search_operation, source, created_at, updated_at) VALUES (?, 'rent', ?, ?, 'phone', ?, ?)");
  add.run(contact, "commercial", null, T0, T0);
  add.run(contact, "commercial", "transfer", T0, T0);
  assert.throws(() => add.run(contact, "commercial", "transfer", T0, T0), /UNIQUE/);
  assert.throws(() => add.run(contact, "residential", "transfer", T0, T0), /CHECK/);
});
