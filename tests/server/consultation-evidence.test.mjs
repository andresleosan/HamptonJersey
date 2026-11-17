// AGE-09 (M06): the evidence of what was presented to each agency, read from what AGE-03, AGE-05, AGE-06 and AGE-08
// already write. A general check names no client; a client's own case counts as shared only once a sending is recorded
// or the provider took the email, and then only what the text carried. Staff only; reads and writes nothing else.
// Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./listing-client.mjs";
import { configure } from "./email-helpers.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { extractFeatures } from "../../server/listing-features.js";
import { enquiries } from "../../server/consultations.js";
import { ENQUIRY_GATES } from "../../server/routes/matches.js";
import worker from "../../server/jobs.js";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test", HOME = "HE-R001", ASK = "HE-R002", DESK = "desk@agency.example.test";
const { callPass } = enquiries(ENQUIRY_GATES);
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body, email = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(email) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

// AGE-09 needs only AGE-03; send: AGE-05 on, with the email service simulated (service).
function world({ evidence = true, send = false, service = false, schema } = {}) {
  const env = makeEnv(schema);
  Object.assign(env, { AGE03_ENQUIRIES_READY: "1", EST16_AVAILABILITY_READY: "1", EST15_UNAVAILABILITY_READY: "1", AGE06_RESPONSES_READY: "1",
    AGE08_CALL_TASKS_READY: "1" }, evidence && { AGE09_EVIDENCE_READY: "1" }, send && { AGE05_SEND_READY: "1" });
  if (service) {
    Object.assign(env, { EMAIL_SERVICE_READY: "true", sent: [] });
    env.EMAIL = { async send(message) { env.sent.push(message); return { messageId: `provider-${env.sent.length}` }; } };
    configure(env, { summary: false, recipients: [] });
    const at = new Date().toISOString();
    run(env, "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('email_worker', ?, ?, 'system')", JSON.stringify({ at, ready: true }), at);
  }
  for (const [id, description] of [[HOME, "Parking for two cars"], [ASK, ""]])
    seedListing(env, { id, title: `Fixture home ${id}`, operation: "rent", availability: "to_let", rent: 1800, rent_period: "month", sale_price: null,
      bedrooms: 2, bathrooms: 2, housing_category: "registered", matchable: 1, ...extractFeatures({ description }), parish: "St Helier",
      location: "St Helier", road_name: "Rue de la Fixture" });
  return env;
}
const tick = env => worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() }, { DB: env.DB, MEDIA: env.MEDIA, EMAIL: env.EMAIL,
  EMAIL_SERVICE_READY: env.EMAIL_SERVICE_READY, AGE05_SEND_READY: env.AGE05_SEND_READY }, { waitUntil() {} });
let people = 0;
// Names, emails, phones and budgets only a leak would copy into the evidence.
const PRIVATE = ["Ana", "Le Gros", "Ben Carter", "age09-", "7700900", "2000", "2,000", "Rue de la Fixture", "Agency Desk", DESK, "01534", "1.5% FIXTURE"];
async function searching(env, name) {
  const n = ++people;
  const c = run(env, "INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    name, `age09-${n}@example.test`, `+4477009003${String(n).padStart(2, "0")}`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), operation: "rent", stage: "searching", source: "phone", budget_max: 2000, bedrooms_min: 2,
    parking_spaces: 2, pets: '[{"kind":"none"}]', household_adults: 2, household_children: 1, household_total: 3, created_at: T0, updated_at: T0,
    requirement_priorities: JSON.stringify({ version: 1, values: { budget: "must", bedrooms: "must", parking: "must" }, unknown: [] }) };
  const cols = Object.keys(a);
  const id = Number(run(env, `INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...Object.values(a)).lastInsertRowid);
  await recomputeForApplicant(env, id, "system");
  return id;
}
const matchId = (env, a, listing = HOME) => row(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = ?", a, listing).id;
const shortlist = async (env, a, email = ADMIN) =>
  ok(await req(env, "PUT", `/admin/matches/${matchId(env, a)}`, { status: "shortlisted", from: "found" }, email)).match.id;
const advertiser = async env => ok(await req(env, "POST", "/admin/advertisers", { name: "Fixture Agency", kind: "agency", channels: [], source_ids: [],
  listing_ids: [HOME, ASK], commission: "1.5% FIXTURE", photo_permission: "",
  contacts: [{ name: "Agency Desk", email: DESK, phones: [{ label: "Office", number: "01534 000000" }] }] }), 201).advertiser.id;
const prepare = (env, match, body, email = ADMIN) => req(env, "POST", `/admin/matches/${match}/consultation`,
  { operation_id: randomUUID(), kind: "general", ...body }, email);
const SENT_AT = new Date(Date.now() - 3 * 3600e3).toISOString();
const sendBody = (o = {}) => ({ operation_id: randomUUID(), revision: 1, sent_at: SENT_AT, via: "email", evidence_ref: "Sent items FIXTURE", ...o });
const markSent = async (env, id, body = sendBody()) => {
  run(env, "UPDATE consultations SET prepared_at = ? WHERE id = ?", new Date(Date.now() - 4 * 3600e3).toISOString(), id);
  return req(env, "POST", `/admin/consultations/${id}/manual-send`, body);
};
const evidence = (env, id, query = "", email) => req(env, "GET", `/admin/consultations/${id}/evidence${query}`, undefined, email);
const leaks = data => PRIVATE.filter(s => JSON.stringify(data).includes(s));
// One general enquiry prepared from the first of these searches and joined by the others; household: stated by the first.
async function enquiry(env, names, { household = false } = {}) {
  const agency = await advertiser(env), families = [], ms = [];
  for (const name of names) families.push(await searching(env, name));
  for (const a of families) ms.push(await shortlist(env, a));
  const id = ok(await prepare(env, ms[0], { advertiser_id: agency, ...(household && { include_occupants: true }) }), 201).consultation.id;
  for (const m of ms.slice(1)) ok(await prepare(env, m, { advertiser_id: agency }, OTHER));
  return { id, agency, families, ms };
}

test("switched off, without AGE-03 or before migration 0077, there is no evidence route and enquiries read as before", async () => {
  for (const [label, off] of [["off", { AGE09_EVIDENCE_READY: "0" }], ["AGE-03 off", { AGE03_ENQUIRIES_READY: "0" }]]) {
    const env = world(), { id } = await enquiry(env, ["Ana Le Gros"]);
    Object.assign(env, off);
    assert.equal((await evidence(env, id)).status, 404, label);
    const listed = await req(env, "GET", `/admin/listings/${HOME}/consultations`);
    if (label === "off") {
      assert.equal(JSON.stringify(listed.data).includes('"evidence"'), false, "no evidence flag on any enquiry");
      env.AGE09_EVIDENCE_READY = "1";
      const on = ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`));
      assert.equal(on.consultations[0].evidence, true);
      delete on.consultations[0].evidence;
      assert.deepEqual(on, listed.data, "on, the enquiry is the same plus its evidence flag");
    } else assert.deepEqual(listed.data, { enabled: false });
  }
  const before = world({ schema: { through: 76 } });
  assert.equal((await evidence(before, 1)).status, 404, "before 0077 it is as off");
});

test("staff only, by id: a visitor gets nothing, a malformed page is refused, an unknown enquiry is not found", async () => {
  const env = world(), { id } = await enquiry(env, ["Ana Le Gros"]);
  const visitor = await call(env, "GET", `/admin/consultations/${id}/evidence`);
  assert.equal(visitor.status, 401);
  assert.ok(!visitor.text.includes("Fixture"), "nothing of it to a visitor");
  for (const q of ["?limit=0", "?limit=51", "?limit=x", "?cursor=-1", "?cursor=1.5"]) assert.equal((await evidence(env, id, q)).status, 400, q);
  assert.equal((await evidence(env, 999)).status, 404);
  assert.equal((await evidence(env, id)).headers.get("cache-control"), "no-store");
});

test("a general check sent for two searches presents neither: it served their approved matches and named no client", async () => {
  const env = world(), { id, families, ms } = await enquiry(env, ["Ana Le Gros", "Ben Carter"]);
  ok(await markSent(env, id));
  const e = ok(await evidence(env, id));
  assert.deepEqual(e.presentations, [], "a general check is not the presentation of a client");
  assert.equal(e.general_checks.length, 1);
  const [check] = e.general_checks;
  assert.deepEqual([check.identifies_client, check.asked, check.sent_at, check.via, check.by, check.matches_at_sending],
    [false, ["availability", "viewing_times"], SENT_AT, "email", ADMIN, 2]);
  assert.equal(e.shared.text, row(env, "SELECT body FROM consultations WHERE id = ?", id).body, "the text that went out");
  assert.deepEqual([e.shared.household_size, e.shared.client_identity], [null, false]);
  // Which approved matches it served: who joined each, when, and the approval it joined under.
  assert.deepEqual(e.matches.map(m => [m.match_id, m.applicant_id, m.linked_by, m.before_sending, m.approval.by]),
    [[ms[0], families[0], ADMIN, true, ADMIN], [ms[1], families[1], OTHER, true, ADMIN]]);
  assert.ok(e.matches.every(m => m.approval.at <= m.linked_at), "approved before it joined");
  assert.deepEqual(e.consultation.recipient, { id: e.consultation.recipient.id, name: "Fixture Agency", kind: "agency" });
  assert.deepEqual(leaks(e), [], "no client's or contact's data, and no commission");
  assert.deepEqual(e.attempts.map(a => a.type), ["prepared", "sent_manually"]);
  assert.equal(e.attempts[1].evidence_ref, "Sent items FIXTURE");
  // A search that joins after it went out is served from then on, never presented in what was already sent.
  const cy = await searching(env, "Cy Hamon"), mc = await shortlist(env, cy);
  ok(await prepare(env, mc, { advertiser_id: (await req(env, "GET", `/admin/matches/${mc}/consultation`)).data.advertisers[0].id }));
  const after = ok(await evidence(env, id));
  assert.deepEqual(after.matches.map(m => m.before_sending), [true, true, false]);
  assert.equal(after.general_checks[0].matches_at_sending, 2);
});

test("only what the text carried is shared: the household size of the one search that stated it, once it was sent", async () => {
  const env = world(), { id, families, ms } = await enquiry(env, ["Ana Le Gros", "Ben Carter"], { household: true });
  // Prepared, not sent: nothing was shared with anyone.
  const waiting = ok(await evidence(env, id));
  assert.deepEqual([waiting.shared, waiting.general_checks, waiting.presentations], [null, [], []]);
  ok(await markSent(env, id));
  const e = ok(await evidence(env, id));
  assert.deepEqual(e.presentations, [{ match_id: ms[0], applicant_id: families[0], shared: ["household_size"], household_size: 3,
    identifies_client: false, sent_at: SENT_AT, via: "email" }]);
  assert.equal(e.shared.household_size, 3);
  assert.match(e.shared.text, /household of 3 people/);
  assert.deepEqual(leaks(e), []);
});

test("a clarification sent for one search shares that search's must-haves to clarify and nothing else", async () => {
  const env = world(), agency = await advertiser(env), ana = await searching(env, "Ana Le Gros"), m = matchId(env, ana, ASK);
  ok(await req(env, "PUT", `/admin/matches/${m}/clarification`, { approved: true }));
  const id = ok(await prepare(env, m, { kind: "clarification", advertiser_id: agency }), 201).consultation.id;
  ok(await markSent(env, id));
  const e = ok(await evidence(env, id));
  assert.deepEqual(e.general_checks, []);
  assert.deepEqual(e.presentations.map(p => [p.match_id, p.applicant_id, p.shared, p.identifies_client]), [[m, ana, ["must_haves"], false]]);
  assert.equal(e.matches[0].approval.by, ADMIN, "the clarification's approval");
  assert.deepEqual(leaks(e), []);
});

test("an approved email that has not left presents no one; one the provider took is the sending, with its approval", async () => {
  const env = world({ send: true }), agency = await advertiser(env), ana = await searching(env, "Ana Le Gros"), m = await shortlist(env, ana);
  const desk = ok(await req(env, "GET", `/admin/matches/${m}/consultation`)).advertisers[0].contacts.find(c => c.email).key;
  const { id } = ok(await prepare(env, m, { advertiser_id: agency, contact_key: desk, include_occupants: true }), 201).consultation;
  ok(await req(env, "POST", `/admin/consultations/${id}/approve-sending`, { revision: 1 }, OTHER));
  const approved = ok(await evidence(env, id));
  assert.deepEqual(approved.approvals.map(a => [a.type, a.by, a.revision]), [["send", OTHER, 1]]);
  assert.deepEqual([approved.shared, approved.presentations, approved.general_checks], [null, [], []], "approved and unsent: not presented");

  // Switched on with the service: queued, then taken by the provider on the clock's tick.
  Object.assign(env, { EMAIL_SERVICE_READY: "true", sent: [] });
  env.EMAIL = { async send(message) { env.sent.push(message); return { messageId: `provider-${env.sent.length}` }; } };
  configure(env, { summary: false, recipients: [] });
  const at = new Date().toISOString();
  run(env, "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('email_worker', ?, ?, 'system')", JSON.stringify({ at, ready: true }), at);
  ok(await req(env, "POST", `/admin/consultations/${id}/send-email`, { revision: 1 }));
  const queued = ok(await evidence(env, id));
  assert.equal(queued.emails[0].status, "queued");
  assert.equal("text" in queued.emails[0], false, "an email still queued has shared nothing");
  assert.deepEqual([queued.shared, queued.presentations], [null, []]);
  await tick(env);
  assert.equal(env.sent.length, 1);
  const e = ok(await evidence(env, id));
  assert.deepEqual(e.attempts.map(a => a.type), ["prepared", "send_approved", "email_queued", "sent_by_email"]);
  assert.deepEqual([e.emails[0].status, e.emails[0].version, e.emails[0].approved_by, e.emails[0].text], ["accepted", 1, OTHER, env.sent[0].text]);
  assert.equal(e.shared.text, env.sent[0].text, "what actually went out");
  assert.deepEqual(e.presentations.map(p => [p.match_id, p.shared, p.via]), [[m, ["household_size"], "email"]]);
  assert.equal(e.general_checks[0].via, "email");
  assert.deepEqual(leaks(e), [], "not even the address it went to");
});

test("an email taken back before it left is not a presentation", async () => {
  const env = world({ send: true, service: true }), agency = await advertiser(env), ana = await searching(env, "Ana Le Gros"), m = await shortlist(env, ana);
  const desk = ok(await req(env, "GET", `/admin/matches/${m}/consultation`)).advertisers[0].contacts.find(c => c.email).key;
  const { id } = ok(await prepare(env, m, { advertiser_id: agency, contact_key: desk, include_occupants: true }), 201).consultation;
  ok(await req(env, "POST", `/admin/consultations/${id}/approve-sending`, { revision: 1 }));
  ok(await req(env, "POST", `/admin/consultations/${id}/send-email`, { revision: 1 }));
  ok(await req(env, "POST", `/admin/consultations/${id}/return-to-manual`, { revision: 1, operation_id: randomUUID() }));
  const e = ok(await evidence(env, id));
  assert.deepEqual([e.shared, e.presentations, e.general_checks], [null, [], []]);
  assert.deepEqual([e.emails[0].status, "text" in e.emails[0]], ["cancelled", false]);
  assert.deepEqual(e.attempts.map(a => [a.type, a.reason ?? null]).at(-1), ["email_not_sent", "returned"]);
});

test("the same sending recorded twice is one attempt; answers and the call follow with their dates", async () => {
  const env = world(), { id } = await enquiry(env, ["Ana Le Gros"]);
  const body = sendBody();
  ok(await markSent(env, id, body));
  ok(await markSent(env, id, body));
  assert.equal(ok(await evidence(env, id)).attempts.filter(a => a.type === "sent_manually").length, 1);
  // Two working days on with no useful answer: the call; then an automatic reply and a useful answer.
  run(env, "UPDATE consultations SET sent_at = ? WHERE id = ?", "2026-11-06T16:00:00.000Z", id);
  await callPass(env, "2026-11-10T16:10:00.000Z");
  const answer = (outcome, o = {}) => req(env, "POST", `/admin/consultations/${id}/response`, { operation_id: randomUUID(), revision: 1, outcome,
    answered_at: new Date(Date.now() - 3600e3).toISOString(), via: "phone", answered_by: "Desk receptionist", evidence_ref: "Call log FIXTURE", ...o });
  ok(await answer("no_answer"));
  ok(await answer("available", { scope: "property" }), 200);
  const e = ok(await evidence(env, id));
  assert.deepEqual(e.responses.map(r => [r.outcome, r.via, r.scope ?? null, r.by]), [["no_answer", "phone", null, ADMIN], ["available", "phone", "property", ADMIN]]);
  assert.deepEqual([e.latest_response.outcome, e.latest_response.from, e.latest_response.evidence_ref], ["available", "Desk receptionist", "Call log FIXTURE"]);
  assert.deepEqual(e.calls.events.map(c => c.type), ["call_due"]);
  assert.deepEqual([e.calls.task.due_at, !!e.calls.task.resolved_at], ["2026-11-10T16:00:00.000Z", true], "due, then closed by the answer");
  assert.deepEqual(leaks(e), []);
});

test("the matches it served come a page at a time", async () => {
  const env = world(), { id, ms } = await enquiry(env, ["Ana Le Gros", "Ben Carter", "Cy Hamon"]);
  const first = ok(await evidence(env, id, "?limit=2"));
  assert.deepEqual(first.matches.map(m => m.match_id), ms.slice(0, 2));
  assert.equal(first.next_cursor, ms[1]);
  const next = ok(await evidence(env, id, `?limit=2&cursor=${first.next_cursor}`));
  assert.deepEqual([next.matches.map(m => m.match_id), next.next_cursor], [[ms[2]], null]);
  assert.equal(next.matches_total, 3);
  assert.deepEqual(rows(env, "SELECT type FROM events WHERE type LIKE 'consultation.%'").length, 1, "reading writes nothing");
});
