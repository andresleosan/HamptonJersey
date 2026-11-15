// EST-01 / SAP-01: each search's last full run is recorded around the recompute, and read by the list and the record.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie } from "./helpers.mjs";
import { searchRunState, queueFirstSearch, recomputeForApplicant } from "../../server/search-state.js";

const ON = { EST01_SEARCH_STATE_READY: "1" };
const envOn = schema => Object.assign(makeEnv(schema), ON);
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const form = (o = {}) => ({ name: "Jane Le Brocq", email: "jane@example.je", phone: "07797 123456", source: "phone",
  operation: "rent", budget_max: 2000, bedrooms_min: 2, ...o });
const create = async (env, o) => {
  const r = await req(env, "POST", "/admin/applicants", form(o));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id;
};
const run = (env, id) => env.DB.raw.prepare("SELECT * FROM applicant_search_runs WHERE applicant_id = ?").get(id);
const listed = async (env, id) => (await req(env, "GET", "/admin/applicants")).data.applicants.find(a => a.id === id);
const detail = async (env, id) => (await req(env, "GET", `/admin/applicants/${id}`)).data;
const rental = (env, o = {}) => seedListing(env, { id: "HE-R002", matchable: 1, operation: "rent", availability: "to_let",
  sale_price: null, rent: 1800, rent_period: "month", ...o });

const T = "2026-11-14T10:00:00.000Z", at = minutes => new Date(Date.parse(T) + minutes * 60000).toISOString();

test("the state of a search comes only from what was recorded", () => {
  assert.deepEqual(searchRunState(undefined, T), { state: "not_recorded", at: null, last_success_at: null });
  assert.deepEqual(searchRunState({ last_attempt_at: null, last_success_at: null, last_failure_at: null }, T),
    { state: "queued", at: null, last_success_at: null });
  assert.equal(searchRunState({ last_attempt_at: at(-1), last_success_at: null, last_failure_at: null }, T).state, "searching");
  // An attempt with no recorded result after two minutes did not finish: it reads as a failure, dated at its start.
  assert.deepEqual(searchRunState({ last_attempt_at: at(-3), last_success_at: at(-60), last_failure_at: null }, T),
    { state: "failed", at: at(-3), last_success_at: at(-60) });
  assert.deepEqual(searchRunState({ last_attempt_at: at(-120), last_success_at: at(-120), last_failure_at: null }, T),
    { state: "searched", at: at(-120), last_success_at: at(-120) });
  // A failure after an earlier success keeps the success's date; a success after a failure clears the failure.
  assert.deepEqual(searchRunState({ last_attempt_at: at(-5), last_success_at: at(-120), last_failure_at: at(-5) }, T),
    { state: "failed", at: at(-5), last_success_at: at(-120) });
  assert.equal(searchRunState({ last_attempt_at: at(-5), last_success_at: at(-5), last_failure_at: at(-120) }, T).state, "searched");
});

test("switched off, nothing is recorded or shown, with or without the migration", async () => {
  for (const schema of [{}, { through: 63 }]) {
    const env = makeEnv(schema);
    const id = await create(env);
    if (!schema.through) assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM applicant_search_runs").get().n, 0);
    assert.equal("search_run" in await listed(env, id), false);
    assert.equal("search_run" in await detail(env, id), false);
    assert.equal(await queueFirstSearch(env, id), null);
  }
});

test("switched on without the migration, saving and reading work as before", async () => {
  const env = envOn({ through: 63 });
  rental(env);
  const id = await create(env);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM matches WHERE applicant_id = ?").get(id).n, 1);
  assert.equal("search_run" in await listed(env, id), false);
  assert.equal("search_run" in await detail(env, id), false);
  assert.equal((await req(env, "POST", `/admin/applicants/${id}/matches/recalculate`)).status, 200);
});

test("a new search waits for investigation until its first search has run", async () => {
  const env = envOn();
  const id = Number(env.DB.raw.prepare(`INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at, updated_by)
    VALUES ('Jane Le Brocq', 'jane@example.je', ?, ?, ?, 'admin@example.test')`).run(T, T, T).lastInsertRowid);
  const applicant = Number(env.DB.raw.prepare(`INSERT INTO applicants (contact_id, operation, source, created_at, updated_at, updated_by)
    VALUES (?, 'rent', 'phone', ?, ?, 'admin@example.test')`).run(id, T, T).lastInsertRowid);
  assert.deepEqual((await listed(env, applicant)).search_run, { state: "not_recorded", at: null, last_success_at: null });
  await queueFirstSearch(env, applicant);
  assert.deepEqual((await listed(env, applicant)).search_run, { state: "queued", at: null, last_success_at: null });
  await queueFirstSearch(env, applicant); // registering twice changes nothing
  await recomputeForApplicant(env, applicant, "system");
  const done = run(env, applicant);
  assert.ok(done.last_attempt_at && done.last_success_at >= done.last_attempt_at);
  assert.equal(done.last_failure_at, null);
  assert.deepEqual((await listed(env, applicant)).search_run, { state: "searched", at: done.last_success_at, last_success_at: done.last_success_at });
});

test("registering in the panel or on the website records the first search", async () => {
  const env = envOn();
  const id = await create(env);
  assert.equal((await detail(env, id)).search_run.state, "searched");
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: "hampton.test" }));
  const r = await call(env, "POST", "/applicants", { body: { operation: "rent", name: "Tom Le Sueur", email: "tom@example.je",
    phone: "+447797654321", budget_max: 2500, bedrooms_min: 2, parishes_wanted: ["St Helier"], preferred_channel: "whatsapp",
    privacy: true, marketing: false, turnstile: "tok" } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const web = env.DB.raw.prepare("SELECT id FROM applicants WHERE source = 'web'").get().id;
  assert.equal((await listed(env, web)).search_run.state, "searched");
});

test("the list shows the search only while there is no match at all; the record always has it", async () => {
  const env = envOn();
  rental(env);
  const id = await create(env);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM matches WHERE applicant_id = ?").get(id).n, 1);
  assert.equal("search_run" in await listed(env, id), false);
  assert.equal((await detail(env, id)).search_run.state, "searched");
  // A rejected match is still a match: "no matches yet" would be false.
  env.DB.raw.prepare("UPDATE matches SET status = 'rejected', reject_reason = 'price' WHERE applicant_id = ?").run(id);
  assert.equal("search_run" in await listed(env, id), false);
});

test("editing the search and recalculating record a new attempt", async () => {
  const env = envOn();
  const id = await create(env);
  env.DB.raw.prepare("UPDATE applicant_search_runs SET last_attempt_at = ?, last_success_at = ? WHERE applicant_id = ?").run(at(-600), at(-600), id);
  const a = (await detail(env, id)).applicant;
  const saved = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: a.updated_at, bedrooms_min: 1, criteria_confirmation: { confirmed: true } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.ok(run(env, id).last_success_at > at(-600));
  env.DB.raw.prepare("UPDATE applicant_search_runs SET last_attempt_at = ?, last_success_at = ? WHERE applicant_id = ?").run(at(-600), at(-600), id);
  assert.equal((await req(env, "POST", `/admin/applicants/${id}/matches/recalculate`)).status, 200);
  assert.ok(run(env, id).last_success_at > at(-600));
});

test("Recalculate all records the searches that had none recorded", async () => {
  const env = makeEnv();
  const id = await create(env);
  Object.assign(env, ON);
  assert.equal((await listed(env, id)).search_run.state, "not_recorded");
  const all = await req(env, "POST", "/admin/matches/recalculate", { phase: "applicants" });
  assert.equal(all.status, 200, JSON.stringify(all.data));
  assert.equal((await listed(env, id)).search_run.state, "searched");
});

test("a failed search is recorded as failed, without its error, and keeps the last success", async () => {
  const env = envOn();
  const id = await create(env);
  const before = run(env, id);
  const batch = env.DB.batch;
  env.DB.batch = () => Promise.reject(new Error("boom for jane@example.je"));
  const failed = await req(env, "POST", `/admin/applicants/${id}/matches/recalculate`);
  env.DB.batch = batch;
  assert.equal(failed.status, 500);
  const after = run(env, id);
  // BUS-01 (0083) adds only the market part's state and count, never error text.
  assert.deepEqual(Object.keys(after).sort(), ["applicant_id", "last_attempt_at", "last_failure_at", "last_success_at", "market_homes", "market_state"]);
  assert.ok(after.last_failure_at >= after.last_attempt_at && after.last_attempt_at >= before.last_success_at);
  assert.equal(after.last_success_at, before.last_success_at);
  assert.deepEqual((await listed(env, id)).search_run, { state: "failed", at: after.last_failure_at, last_success_at: before.last_success_at });
  assert.doesNotMatch(JSON.stringify(after), /boom|jane/);
});

test("a result that arrives after a newer attempt started does not overwrite it", async () => {
  const env = envOn();
  const id = await create(env);
  const batch = env.DB.batch.bind(env.DB);
  let release;
  const gate = new Promise(r => { release = r; });
  // The first recompute's read waits; meanwhile a newer attempt is recorded.
  env.DB.batch = async stmts => { env.DB.batch = batch; await gate; return batch(stmts); };
  const slow = recomputeForApplicant(env, id, "system");
  await new Promise(r => setTimeout(r, 5));
  env.DB.raw.prepare("UPDATE applicant_search_runs SET last_attempt_at = ?, last_success_at = NULL WHERE applicant_id = ?").run("2999-01-01T00:00:00.000Z", id);
  release();
  await slow;
  assert.equal(run(env, id).last_success_at, null);
});

test("only active searches are recorded, commercial ones included, and a deleted search takes its record with it", async () => {
  const env = envOn();
  // Commercial searches are matched since BUS-12, so their last run is recorded like a home search's.
  const commercial = await create(env, { search_category: "commercial", commercial_kind: "business", budget_max: null,
    commercial_rent: 24000, commercial_rent_period: "year" });
  assert.ok(run(env, commercial).last_success_at);
  assert.equal("search_run" in await detail(env, commercial), true);
  const id = await create(env, { email: "tom@example.je", phone: "07797 654321", name: "Tom Le Sueur" });
  assert.ok(run(env, id));
  env.DB.raw.prepare("UPDATE applicants SET archived_at = ? WHERE id = ?").run(T, id);
  assert.equal("search_run" in await detail(env, id), false);
  env.DB.raw.prepare("DELETE FROM applicants WHERE id = ?").run(id);
  assert.equal(run(env, id), undefined);
});
