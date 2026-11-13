import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { recomputeForApplicant, recomputeForListing } from "../../server/match-store.js";
import { runRetention } from "../../server/retention.js";

const ADMIN = "admin@example.test";
const req = async (env, method, path, body) => call(env, method, path, { cookie: await adminCookie(ADMIN), body });
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const applicant = (env, id) => row(env, "SELECT * FROM applicants WHERE id = ?", id);
async function create(env, extra = {}) {
  const r = await req(env, "POST", "/admin/applicants", { name: "Lifecycle fixture", email: "lifecycle@example.test",
    source: "phone", operation: "buy", budget_max: 900000, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id;
}
const transition = (env, id, state, extra = {}) => req(env, "POST", `/admin/applicants/${id}/search`,
  { state, reason: "Found a property", updated_at: applicant(env, id).updated_at, ...extra });
function world() {
  const env = makeEnv(); seedListing(env, { matchable: 1 }); return env;
}
const snapshot = (env, id) => env.DB.raw.prepare("SELECT * FROM matches WHERE applicant_id = ? ORDER BY id").all(id);
const rawResolve = (env, id) => run(env, `UPDATE applicants SET search_state = 'resolved', resolved_at = ?,
  resolved_by = ?, resolution_reason = 'Found a property', updated_at = ? WHERE id = ?`, T0, ADMIN, "2028-01-01T00:00:00.000Z", id);

test("search: commercial stages do not close a search; explicit resolution preserves all matches", async () => {
  const env = world(), id = await create(env);
  assert.equal(applicant(env, id).search_state, "active");
  for (const stage of ["viewing", "offer", "agreed", "completed", "paused", "lost"]) {
    const r = await req(env, "PUT", `/admin/applicants/${id}`, { stage, lost_reason: "Commercial outcome",
      updated_at: applicant(env, id).updated_at });
    assert.equal(r.status, 200); assert.equal(r.data.applicant.search_state, "active");
    assert.equal(snapshot(env, id).length, 1);
  }
  const matches = snapshot(env, id), contact = row(env, "SELECT * FROM contacts WHERE id = ?", applicant(env, id).contact_id);
  const r = await transition(env, id, "resolved");
  assert.equal(r.status, 200);
  assert.equal(r.data.applicant.resolved_by, ADMIN);
  assert.equal(r.data.applicant.resolution_reason, "Found a property");
  assert.ok(r.data.applicant.resolved_at);
  assert.equal(r.data.applicant.stage, "lost");
  assert.deepEqual(snapshot(env, id), matches);
  await recomputeForApplicant(env, id, "system");
  await recomputeForListing(env, "HE-R001", "system");
  assert.deepEqual(snapshot(env, id), matches);
  assert.equal((await req(env, "GET", "/admin/review")).data.remaining, 0);
  assert.equal((await req(env, "PUT", `/admin/matches/${matches[0].id}`, { from: "found", status: "shortlisted" })).status, 409);
  assert.equal(row(env, "SELECT last_contact_at FROM contacts WHERE id = ?", contact.id).last_contact_at, contact.last_contact_at);
  const back = await transition(env, id, "active", { reason: "Sale fell through" });
  assert.equal(back.status, 200); assert.equal(back.data.applicant.resolved_at, null);
  assert.equal(back.data.applicant.stage, "lost");
  assert.equal((await req(env, "GET", "/admin/review")).data.remaining, 1);
  assert.equal(row(env, `SELECT count(*) AS n FROM notifications n JOIN events e ON e.id = n.event_id
    WHERE e.entity_id = ? AND e.entity_type = 'applicant' AND n.category = 'matched' AND n.resolved_at IS NULL`, String(id)).n, 1,
  "reopening brings preserved Found matches back to the Inbox even without new matches");
});

test("search: authenticated, validated, versioned human transitions only", async () => {
  const env = world(), id = await create(env), path = `/admin/applicants/${id}/search`;
  assert.equal((await call(env, "POST", path, { body: { state: "resolved" } })).status, 401);
  for (const extra of [{ reason: " " }, { reason: "x".repeat(201) }, { reason: 3 }, { state: "paused" }, { updated_at: null }])
    assert.equal((await transition(env, id, "resolved", extra)).status, 400);
  const seen = applicant(env, id).updated_at;
  const pair = await Promise.all([transition(env, id, "resolved"), transition(env, id, "resolved")]);
  assert.deepEqual(pair.map(r => r.status).sort(), [200, 409]);
  assert.equal((await transition(env, id, "active", { updated_at: seen })).status, 409);
  assert.equal(row(env, "SELECT count(*) AS n FROM events WHERE type = 'applicant.search_resolved'").n, 1);
  assert.equal((await req(env, "POST", "/admin/applicants/999/search", { state: "resolved", reason: "Found", updated_at: T0 })).status, 404);
});

test("search: criteria, archive, restore and commercial writes invalidate prior versions within one millisecond", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-07T12:00:00Z") });
  const env = world(), id = await create(env);
  let seen = applicant(env, id).updated_at;
  assert.equal((await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: seen, budget_max: 950000, criteria_confirmation: { confirmed: true } })).status, 200);
  assert.equal((await transition(env, id, "resolved", { updated_at: seen })).status, 409, "criteria edit invalidates the old version");
  seen = applicant(env, id).updated_at;
  assert.equal((await req(env, "POST", "/admin/offers", { listing_id: "HE-R001", applicant_id: id, amount: 750000 })).status, 201);
  assert.ok(applicant(env, id).updated_at > seen, "commercial stage change advances the current version");
  assert.equal((await transition(env, id, "resolved", { updated_at: seen })).status, 409);
  run(env, "UPDATE offers SET status = 'withdrawn' WHERE applicant_id = ?", id);
  assert.equal((await transition(env, id, "resolved")).status, 200);
  for (const action of ["archive", "restore"]) {
    seen = applicant(env, id).updated_at;
    assert.equal((await req(env, "POST", `/admin/applicants/${id}/${action}`)).status, 200);
    assert.ok(applicant(env, id).updated_at > seen, action);
  }
});

test("search: archive needs resolution and restore does not reopen; legacy review is explicit", async () => {
  const env = world(), id = await create(env);
  const archive = () => req(env, "POST", `/admin/applicants/${id}/archive`);
  assert.equal((await archive()).status, 409);
  assert.equal((await transition(env, id, "resolved")).status, 200);
  assert.equal((await archive()).status, 200);
  assert.equal((await transition(env, id, "active")).status, 409);
  assert.equal((await req(env, "POST", `/admin/applicants/${id}/restore`)).status, 200);
  assert.equal(applicant(env, id).search_state, "resolved");
  run(env, "UPDATE applicants SET search_state = 'needs_review', resolved_at = NULL, resolved_by = NULL, resolution_reason = NULL WHERE id = ?", id);
  assert.equal((await req(env, "GET", "/admin/applicants?search_state=needs_review")).data.applicants[0].id, id);
  assert.equal((await transition(env, id, "active", { reason: "Still looking, confirmed by staff" })).status, 200);
});

test("search: another active operation protects the shared contact; reviews start at month eleven", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-07T12:00:00Z") });
  const env = world(), buy = await create(env), contact = applicant(env, buy).contact_id;
  const rent = await create(env, { contact_id: contact, operation: "rent", budget_max: 2500 });
  await transition(env, buy, "resolved");
  run(env, "UPDATE contacts SET last_activity_at = '2025-10-01T00:00:00Z' WHERE id = ?", contact);
  const d = (await req(env, "GET", `/admin/applicants/${buy}`)).data;
  assert.equal(d.retention.search, true); assert.equal(d.retention.review, true); assert.equal(d.retention.kept_until, null);
  assert.equal((await req(env, "GET", "/admin/applicants?retention_review=1")).data.applicants.length, 2);
  assert.equal((await req(env, "GET", "/admin/applicants?expiring=1")).data.applicants.length, 0);
  assert.equal((await runRetention(env, "2026-11-07T12:00:00Z")).contacts, 0);
  run(env, "UPDATE applicants SET search_state = 'needs_review' WHERE id = ?", rent);
  assert.equal((await runRetention(env, "2026-11-07T12:00:00Z")).contacts, 0);
  await transition(env, rent, "resolved");
  assert.equal(row(env, "SELECT last_activity_at FROM contacts WHERE id = ?", contact).last_activity_at.slice(0, 10), "2026-11-07");
  assert.equal((await runRetention(env, "2027-11-07T12:00:00Z")).contacts, 0);
  assert.equal((await runRetention(env, "2027-11-08T12:00:00Z")).contacts, 1);
});

test("search: recalculation and review cannot write after a concurrent resolution", async () => {
  for (const operation of ["applicant", "listing", "review"]) {
    const env = world(), id = await create(env), before = snapshot(env, id);
    // Force a material change for recalculation; keep the old match as history after closing.
    run(env, "UPDATE listings SET sale_price = 9999999 WHERE id = 'HE-R001'");
    const batch = env.DB.batch.bind(env.DB); let injected = false;
    env.DB.batch = stmts => {
      if (!injected && stmts.some(s => /^(DELETE FROM matches|UPDATE matches|INSERT INTO matches)/.test(s.sql))) {
        injected = true; rawResolve(env, id);
      }
      return batch(stmts);
    };
    if (operation === "applicant") await recomputeForApplicant(env, id, "system");
    else if (operation === "listing") await recomputeForListing(env, "HE-R001", "system");
    else assert.equal((await req(env, "PUT", `/admin/matches/${before[0].id}`, { from: "found", status: "shortlisted" })).status, 409);
    assert.ok(injected); assert.deepEqual(snapshot(env, id), before);
    assert.equal(row(env, "SELECT count(*) AS n FROM events WHERE type = 'match.reviewed'").n, 0);
  }
});

test("search: concurrent reopens of the same operation have only one winner", async () => {
  const env = world(), first = await create(env), contact = applicant(env, first).contact_id;
  await transition(env, first, "resolved");
  const second = await create(env, { contact_id: contact }); await transition(env, second, "resolved");
  const r = await Promise.all([transition(env, first, "active"), transition(env, second, "active")]);
  assert.deepEqual(r.map(x => x.status).sort(), [200, 409]);
  assert.equal(row(env, "SELECT count(*) AS n FROM applicants WHERE search_state = 'active'").n, 1);
});

test("search migration: ambiguous stages, archives and duplicate active searches await human review", () => {
  const db = new DatabaseSync(":memory:"), dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith(".sql") && f < "0024").sort()) db.exec(readFileSync(new URL(file, dir), "utf8"));
  db.exec(`INSERT INTO contacts (id,name,email,last_activity_at,created_at,updated_at) VALUES (1,'Migration fixture','migration@example.test','${T0}','${T0}','${T0}');`);
  for (const [id, stage, archived, operation] of [[1,"new",null,"buy"],[2,"completed",null,"rent"],[3,"lost",null,"rent"],
    [4,"searching",T0,"rent"],[5,"paused",null,"rent"],[6,"agreed",null,"rent"]]) {
    db.prepare("INSERT INTO applicants (id,contact_id,stage,archived_at,operation,source,created_at,updated_at) VALUES (?,1,?,?,?,'phone',?,?)")
      .run(id,stage,archived,operation,T0,T0);
  }
  db.exec(readFileSync(new URL("0024_search_lifecycle.sql", dir), "utf8"));
  assert.deepEqual(db.prepare("SELECT search_state FROM applicants ORDER BY id").all().map(x => x.search_state),
    ["active","needs_review","needs_review","needs_review","needs_review","needs_review"]);
  assert.equal(db.prepare("SELECT count(*) AS n FROM applicants WHERE resolved_at IS NOT NULL OR resolved_by IS NOT NULL").get().n, 0);
  db.close();
});
