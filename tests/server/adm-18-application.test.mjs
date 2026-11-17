// ADM-18 (plan tp03-adm-18, Tarea 1): the applicant fills in a rental application through a case-access link. Fictitious data.
import test from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv } from "./helpers.mjs";
import { count, backdate, inAWeek } from "./adm-12-tp03-fixtures.mjs";
import { ADMIN, OTHER, APPLICANT, ANSWERS, staff, seed, onEnv, application, link, signIn } from "./adm-18-fixtures.mjs";

const form = (env, cookie) => call(env, "GET", "/rental-application", { cookie });
const submit = (env, cookie, body) => call(env, "POST", "/rental-application/submit", { cookie, body });
const op = () => crypto.randomUUID();
async function ready(env = seed(onEnv())) {
  const id = await application(env);
  const { id: grant, token } = await link(env, id);
  return { env, id, grant, cookie: await signIn(env, token) };
}

test("switched off, every application route answers as today (404) and nothing is written", async () => {
  const env = seed({ ...makeEnv(), CASE_CHALLENGE_HMAC_KEY: "fixture-case-challenge-key-0123456789abcdef" });
  for (const [m, p] of [["GET", "/admin/rentals/1/applications"], ["POST", "/admin/rentals/1/applications"],
    ["GET", "/admin/rental-applications/1"], ["POST", "/admin/rental-applications/1/review"], ["POST", "/admin/rental-applications/1/links"]])
    assert.equal((await staff(env, m, p, m === "GET" ? undefined : {})).status, 404, `${m} ${p}`);
  assert.equal((await form(env)).status, 404);
  assert.equal((await submit(env, undefined, {})).status, 404);
  assert.equal((await call(env, "POST", "/case-access/challenge", { body: { bootstrap: "x" } })).status, 404);
  assert.equal(count(env, "rental_applications"), 0);
});

test("creating an application needs the case capability on that property and a rent applicant", async () => {
  const env = seed(onEnv());
  assert.equal((await staff(env, "POST", "/admin/rentals/1/applications", { applicant_id: 1, rent: 2000 }, OTHER)).status, 403);
  const buyer = env.DB.raw.prepare("UPDATE applicants SET operation = 'buy' WHERE id = 2").run();
  assert.ok(buyer);
  assert.equal((await staff(env, "POST", "/admin/rentals/1/applications", { applicant_id: 2, rent: 2000 })).status, 409);
  assert.equal((await staff(env, "POST", "/admin/rentals/1/applications", { applicant_id: 1, rent: 0 })).status, 400);
  const id = await application(env);
  assert.equal((await staff(env, "POST", "/admin/rentals/1/applications", { applicant_id: 1, rent: 2000 })).status, 409, "one open per pair");
  const list = await staff(env, "GET", "/admin/rentals/1/applications");
  assert.deepEqual(list.data.applications.map(a => [a.id, a.status, a.applicant_name]), [[id, "draft", "Fixture applicant 1"]]);
  assert.equal(JSON.stringify(list.data).includes("answers"), false, "the list carries no answers");
});

test("the applicant signs in with a code to the applicant's email and sees only the property, rent and status", async () => {
  const env = seed(onEnv());
  const id = await application(env);
  const { token } = await link(env, id);
  const cookie = await signIn(env, token);
  assert.equal(env.sent.at(-1).to, APPLICANT);
  assert.match(env.sent.at(-1).text, /rental application/);
  const r = await form(env, cookie);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.data).sort(), ["address", "expires_on", "rent", "revision", "status"]);
  assert.equal(r.data.address, "1 Fixture Street");
});

test("submit stores the answers, creates no tenancy and keeps income out of every timeline", async () => {
  const { env, id, cookie } = await ready();
  const before = { tenancies: count(env, "tenancies"), applicant: JSON.stringify(env.DB.raw.prepare("SELECT * FROM applicants WHERE id = 1").get()),
    contact: JSON.stringify(env.DB.raw.prepare("SELECT * FROM contacts WHERE id = 1").get()) };
  const operation_id = op();
  const r = await submit(env, cookie, { operation_id, revision: 1, answers: ANSWERS });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const row = env.DB.raw.prepare("SELECT status, answers, revision FROM rental_applications WHERE id = ?").get(id);
  assert.equal(row.status, "submitted");
  assert.equal(JSON.parse(row.answers).incomes[0].amount, 4321);
  assert.equal(count(env, "tenancies"), before.tenancies);
  assert.equal(JSON.stringify(env.DB.raw.prepare("SELECT * FROM applicants WHERE id = 1").get()), before.applicant);
  assert.equal(JSON.stringify(env.DB.raw.prepare("SELECT * FROM contacts WHERE id = 1").get()), before.contact);
  for (const table of ["events", "rental_events", "notifications", "contact_notes"]) {
    const exists = env.DB.raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!exists) continue;
    const text = JSON.stringify(env.DB.raw.prepare(`SELECT * FROM ${table}`).all());
    assert.equal(/4321|Fixture Employer|Fixture Referee|referee@example/.test(text), false, `${table} keeps no answer`);
  }
  // The same operation again is the same receipt; another one cannot submit twice.
  const again = await submit(env, cookie, { operation_id, revision: 1, answers: ANSWERS });
  assert.deepEqual(again.data.receipt, r.data.receipt);
  assert.equal((await submit(env, cookie, { operation_id: op(), revision: 2, answers: ANSWERS })).status, 409);
});

test("a missing income stays unknown, never zero", async () => {
  const { env, id, cookie } = await ready();
  const answers = { ...ANSWERS, incomes: [{ period: "monthly", basis: "gross", currency: "GBP" }] };
  assert.equal((await submit(env, cookie, { operation_id: op(), revision: 1, answers })).status, 201);
  assert.equal(JSON.parse(env.DB.raw.prepare("SELECT answers FROM rental_applications WHERE id = ?").get(id).answers).incomes[0].amount, null);
  const d = await staff(env, "GET", `/admin/rental-applications/${id}`);
  assert.equal(d.data.evaluation.status, "needs_human_review");
  assert.equal(d.data.evaluation.inputs.annual_income, null);
});

test("invalid answers are refused field by field and nothing is written", async () => {
  const { env, id, cookie } = await ready();
  const bad = { ...ANSWERS, incomes: [{ amount: -1, period: "fortnightly", basis: "after tax", currency: "GBP" }] };
  const r = await submit(env, cookie, { operation_id: op(), revision: 1, answers: bad });
  assert.equal(r.status, 400);
  assert.ok(r.data.fields);
  assert.equal(env.DB.raw.prepare("SELECT status FROM rental_applications WHERE id = ?").get(id).status, "draft");
});

test("no cross-household read: a session and a staff capability reach only their own application", async () => {
  const env = seed(onEnv());
  const one = await application(env), two = await application(env, { rental: 2 });
  const { token } = await link(env, one);
  const cookie = await signIn(env, token);
  assert.equal((await form(env, cookie)).data.address, "1 Fixture Street");
  assert.equal((await staff(env, "GET", `/admin/rental-applications/${two}`)).status, 403, "admin holds property 1 only");
  assert.equal((await staff(env, "GET", `/admin/rental-applications/${one}`, undefined, OTHER)).status, 403);
  assert.equal((await staff(env, "POST", `/admin/rental-applications/${two}/links`, { expires_on: inAWeek() })).status, 403);
  await submit(env, cookie, { operation_id: op(), revision: 1, answers: ANSWERS });
  assert.equal(env.DB.raw.prepare("SELECT status FROM rental_applications WHERE id = ?").get(two).status, "draft");
});

test("a revoked link or a withdrawn application cannot submit, and nothing is written", async () => {
  const a = await ready();
  assert.equal((await staff(a.env, "POST", `/admin/rental-applications/${a.id}/links/${a.grant}/revoke`, {})).status, 200);
  assert.equal((await submit(a.env, a.cookie, { operation_id: op(), revision: 1, answers: ANSWERS })).status, 404);
  const b = await ready();
  const w = await staff(b.env, "POST", `/admin/rental-applications/${b.id}/review`,
    { revision: 1, decision: "withdrawn", reason: "The applicant found another home.", policy_version: "fixture-v1" });
  assert.equal(w.status, 200, JSON.stringify(w.data));
  assert.equal((await submit(b.env, b.cookie, { operation_id: op(), revision: 2, answers: ANSWERS })).status, 404);
  for (const { env, id } of [a, b]) assert.equal(env.DB.raw.prepare("SELECT answers FROM rental_applications WHERE id = ?").get(id).answers, null);
});

test("a stale revision or an ended session writes nothing", async () => {
  const { env, id, cookie } = await ready();
  assert.equal((await submit(env, cookie, { operation_id: op(), revision: 7, answers: ANSWERS })).status, 409);
  backdate(env, "case_sessions", "expires_at");
  assert.equal((await submit(env, cookie, { operation_id: op(), revision: 1, answers: ANSWERS })).status, 404);
  assert.equal(env.DB.raw.prepare("SELECT status FROM rental_applications WHERE id = ?").get(id).status, "draft");
});

test("a repair-report session cannot use the application form", async () => {
  const { env, cookie } = await ready();
  assert.equal((await form(env, cookie)).status, 200);
  env.DB.raw.prepare("UPDATE case_sessions SET purpose = 'repair_report'").run();
  assert.equal((await form(env, cookie)).status, 404);
  assert.equal((await submit(env, cookie, { operation_id: op(), revision: 1, answers: ANSWERS })).status, 404);
});
