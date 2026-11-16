import test from "node:test";
import assert from "node:assert/strict";
import { call, adminCookie, makeDb } from "./helpers.mjs";
import { emailPass, dispatchEmail } from "../../server/email.js";
import { TS, emailEnv } from "./email-helpers.mjs";

// PRE-10: a promotional email is checked against the contact's current permission on the claim and again right before
// the provider call. Synthetic people only; the provider is a test double.
const EMAIL = "pre10-dispatch@example.test";
const clock = () => TS;
function setup({ ready = "1", optIn = TS } = {}) {
  const env = emailEnv();
  env.PRE10_PURPOSE_READY = ready;
  const db = env.DB.raw;
  const id = Number(db.prepare(`INSERT INTO contacts (name,email,phone,marketing_opt_in_at,last_activity_at,created_at,updated_at)
    VALUES ('Synthetic person',?,'+447700900777',?,?,?,?)`).run(EMAIL, optIn, TS, TS, TS).lastInsertRowid);
  db.prepare(`INSERT INTO applicants (contact_id,operation,source,search_state,created_at,updated_at)
    VALUES (?,'rent','phone','active',?,?)`).run(id, TS, TS);
  return { env, id };
}
const queue = (env, template, entity, recipient = EMAIL) => env.DB.raw.prepare(`INSERT INTO outbound (ref,dedupe_key,template,
  entity_id,version,recipient,recipient_hash,subject,text,status,approved_by,approved_at,created_at,updated_at)
  VALUES (?,?,?,?,1,?,'hash','Homes this week','Synthetic text','queued','admin@example.test',?,?,?)`)
  .run(`${template}${entity}${recipient}`.replace(/\W/g, ""), `${template}:${entity}:${recipient}`, template, String(entity),
    recipient, TS, TS, TS);
const statuses = env => env.DB.raw.prepare("SELECT template,status FROM outbound ORDER BY id").all().map(r => `${r.template}:${r.status}`);

test("switched off, a promotional email is never sent; the team summary still is, and the SQL works without 0096", async () => {
  const { env, id } = setup({ ready: "0" });
  queue(env, "marketing.news", id);
  await emailPass(env, TS, clock);
  assert.deepEqual(env.sent.map(m => m.to), ["team@example.test"]);
  assert.deepEqual(statuses(env), ["marketing.news:queued", "team_summary:accepted"]);
  // A database without migration 0096: the pipeline still runs while the switch is off.
  const older = emailEnv();
  older.DB = makeDb({ skip: [96] });
  older.DB.raw.prepare(`INSERT INTO app_settings (key,value,updated_at,updated_by) VALUES ('email',?,?,?)`).run(JSON.stringify({
    enabled: true, summary: true, recipients: ["team@example.test"], revision: 1, approved_by: "admin@example.test", approved_at: TS }),
  TS, "admin@example.test");
  await emailPass(older, TS, clock);
  assert.equal(older.sent.length, 1);
});

test("switched on, news by email goes to a consenting contact only, at the contact's current address", async () => {
  const { env, id } = setup();
  queue(env, "marketing.news", id);
  queue(env, "marketing.valuation_offer", id);
  queue(env, "marketing.promotions", id);
  queue(env, "marketing.news", id, "someone-else@example.test");
  queue(env, "marketing.news", "not-a-contact");
  await dispatchEmail(env, clock);
  assert.deepEqual(env.sent.map(m => m.to), [EMAIL]);
  assert.deepEqual(statuses(env), ["marketing.news:accepted", "marketing.valuation_offer:queued", "marketing.promotions:queued",
    "marketing.news:queued", "marketing.news:queued"]);
});

test("a queued promotional email is not sent after the website registration withdraws consent", async () => {
  const { env, id } = setup();
  queue(env, "marketing.news", id);
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: "hampton.test" }));
  try {
    const r = await call(env, "POST", "/applicants", { body: { operation: "rent", name: "Synthetic person", email: EMAIL,
      phone: "+447700900777", budget_max: 2000, bedrooms_min: 1, privacy: true, marketing: false, turnstile: "fixture" } });
    assert.equal(r.status, 201);
  } finally { globalThis.fetch = original; }
  await dispatchEmail(env, clock);
  assert.equal(env.sent.length, 0);
});

test("an objection recorded between the claim and the provider call stops the send", async () => {
  const { env, id } = setup();
  queue(env, "marketing.news", id);
  const cookie = await adminCookie(), batch = env.DB.batch.bind(env.DB);
  let objected = false;
  env.DB.batch = async stmts => {
    const out = await batch(stmts);
    if (!objected && stmts.some(s => /status='sending', claim_token/.test(s.sql))) {
      objected = true;
      const version = env.DB.raw.prepare("SELECT updated_at FROM contacts WHERE id=?").get(id).updated_at;
      const r = await call(env, "POST", `/admin/contacts/${id}/marketing-objection`,
        { cookie, body: { updated_at: version, purpose: "news", channel: "email", source: "phone" } });
      assert.equal(r.status, 200);
    }
    return out;
  };
  await dispatchEmail(env, clock);
  assert.equal(objected, true);
  assert.equal(env.sent.length, 0);
  assert.deepEqual(statuses(env), ["marketing.news:queued"], "the claim is released, not sent; the next tick skips it too");
  env.DB.batch = batch;
  await dispatchEmail(env, clock);
  assert.equal(env.sent.length, 0);
});

test("an objection cancels the queued promotional email outright and records no personal data", async () => {
  const { env, id } = setup();
  queue(env, "marketing.news", id);
  const cookie = await adminCookie();
  const r = await call(env, "POST", `/admin/contacts/${id}/marketing-objection`,
    { cookie, body: { updated_at: TS, purpose: "all", channel: "email", source: "email" } });
  assert.equal(r.status, 200);
  await dispatchEmail(env, clock);
  assert.equal(env.sent.length, 0);
  assert.deepEqual(statuses(env), ["marketing.news:cancelled"]);
  const data = env.DB.raw.prepare("SELECT group_concat(data) d FROM events").get().d;
  assert.ok(!data.includes(EMAIL) && !data.includes("+447700900777"));
});
