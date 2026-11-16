import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { call, makeDb, seedListing } from "./helpers.mjs";
import { emailEnv } from "./email-helpers.mjs";
import { dispatchEmail } from "../../server/email.js";
import { alertFits, savedSearchPass, validateSavedSearch, PENDING_DAYS } from "../../server/saved-searches.js";
import worker from "../../server/jobs.js";

// REG-15: «Save this search». Synthetic visitors and homes only; Turnstile and the email provider are test doubles.
const EMAIL = "reg15-visitor@example.test", NOTICE = "privacy-2026-11";
const LATER = "2026-11-20T09:00:00.000Z";
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a);
const one = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a);
let turnstileCalls = 0;
globalThis.fetch = async () => { turnstileCalls++; return new Response(JSON.stringify({ success: true, hostname: "hampton.test" })); };

function world({ on = "1", open = true, pre10 = "1" } = {}) {
  const env = emailEnv();
  env.REG15_ALERTS_READY = on;
  env.PRE10_PURPOSE_READY = pre10;
  if (open) env.DB.raw.prepare(`INSERT INTO app_settings (key,value,updated_at,updated_by) VALUES ('saved_searches',?,?,?)`)
    .run(JSON.stringify({ enabled: true, privacy_version: NOTICE, approved_by: "admin@example.test", approved_at: "2026-11-01T00:00:00.000Z" }),
      "2026-11-01T00:00:00.000Z", "admin@example.test");
  return env;
}
const form = (over = {}) => ({ email: EMAIL, operation: "rent", budget_max: 2500, bedrooms_min: 2, parishes: ["St Helier"],
  property_types: [], consent: true, privacy_version: NOTICE, turnstile: "token", ...over });
const confirmToken = env => one(env, "SELECT text FROM outbound WHERE template = 'saved_search_confirm' ORDER BY id DESC").text
  .match(/confirm\?token=([0-9a-f]{64})/)[1];
async function confirmed(env, over = {}) {
  assert.equal((await call(env, "POST", "/saved-searches", { body: form(over) })).status, 202);
  const r = await call(env, "POST", `/saved-searches/confirm?token=${confirmToken(env)}`);
  assert.equal(r.status, 200);
  return r;
}
const RENT = { id: "HE-R101", operation: "rent", availability: "to_let", rent: 2000, rent_period: "month", sale_price: null,
  bedrooms: 2, parish: "St Helier", title: "Synthetic flat", matchable: 1, updated_at: LATER };

test("switched off, nothing is reachable, the clock skips it and the config answer is as before", async () => {
  for (const env of [world({ on: "0" }), world({ pre10: "0" })]) {
    assert.equal((await call(env, "GET", "/saved-searches/availability")).status, 404);
    assert.equal((await call(env, "POST", "/saved-searches", { body: form() })).status, 404);
    assert.equal((await call(env, "GET", "/saved-searches/confirm?token=" + "a".repeat(64))).status, 404);
    assert.equal((await call(env, "POST", "/saved-searches/unsubscribe?token=" + "a".repeat(64))).status, 404);
    assert.equal((await call(env, "GET", "/config")).data.savedSearches, undefined);
  }
  // A database without migration 0107: the pass and the clock run with the switch off and touch nothing.
  const older = world({ on: "0" });
  older.DB = makeDb({ skip: [107] });
  await savedSearchPass(older, LATER);
  await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() }, { DB: older.DB, REG15_ALERTS_READY: "0" }, { waitUntil() {} });
});

test("both wrangler files carry the switch, off and equal", () => {
  const flag = f => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8").match(/^REG15_ALERTS_READY = "(\d)"$/m)?.[1];
  assert.equal(flag("wrangler.toml"), "0");
  assert.equal(flag("jobs/wrangler.toml"), "0");
});

test("on but without the form's settings row, the form is closed", async () => {
  const env = world({ open: false });
  assert.deepEqual((await call(env, "GET", "/saved-searches/availability")).data, { available: false });
  assert.equal((await call(env, "POST", "/saved-searches", { body: form() })).status, 503);
  assert.equal((await call(env, "GET", "/config")).data.savedSearches, undefined);
});

test("validation: only the listed criteria, explicit consent and the notice; Turnstile is spent only on a valid form", async () => {
  assert.deepEqual(validateSavedSearch(form({ name: "x" })).errors, { form: "Invalid request" });
  const bad = validateSavedSearch(form({ email: "nope", operation: "sell", parishes: ["Paris"], consent: false, bedrooms_min: 40 }));
  assert.deepEqual(Object.keys(bad.errors).sort(), ["bedrooms_min", "budget_max", "consent", "email", "operation", "parishes"]);
  assert.ok(validateSavedSearch(form({ budget_max: 50 })).errors.budget_max);
  const env = world();
  turnstileCalls = 0;
  const r = await call(env, "POST", "/saved-searches", { body: form({ consent: false }) });
  assert.equal(r.status, 400);
  assert.equal(turnstileCalls, 0);
  assert.equal((await call(env, "POST", "/saved-searches", { body: form({ privacy_version: "old" }) })).status, 409);
  assert.equal(one(env, "SELECT COUNT(*) n FROM saved_searches").n, 0);
});

test("saving queues one confirmation through the pipeline; the token is only hashed and the event log has no address", async () => {
  const env = world();
  const r = await call(env, "POST", "/saved-searches", { body: form() });
  assert.equal(r.status, 202);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const s = one(env, "SELECT * FROM saved_searches");
  assert.equal(s.status, "pending");
  assert.equal(s.email, EMAIL);
  const out = one(env, "SELECT * FROM outbound WHERE template = 'saved_search_confirm'");
  assert.equal(out.status, "queued");
  assert.equal(out.recipient, EMAIL);
  assert.equal(out.entity_id, String(s.id));
  assert.equal(out.approved_by, "admin@example.test");
  assert.match(out.text, /To Let · 2\+ bedrooms · up to £2,500 a month · St Helier/);
  assert.ok(!out.text.includes(s.confirm_hash));
  assert.equal(rows(env, "SELECT data FROM events WHERE data LIKE ?", `%${EMAIL}%`).length, 0);
  // The pipeline sends it (transactional) while AUT-17 is on; off, nothing goes.
  await dispatchEmail({ ...env, EMAIL_SERVICE_READY: "false" }, () => s.created_at);
  assert.equal(env.sent.length, 0);
  await dispatchEmail(env, () => s.created_at);
  assert.deepEqual(env.sent.map(m => m.to), [EMAIL]);
});

test("caps answer the same: three searches per address, and a suppressed address gets no email", async () => {
  const env = world();
  for (let i = 0; i < 4; i++) assert.equal((await call(env, "POST", "/saved-searches", { body: form({ bedrooms_min: i }) })).status, 202);
  assert.equal(one(env, "SELECT COUNT(*) n FROM saved_searches").n, 3);
  assert.equal(one(env, "SELECT COUNT(*) n FROM outbound WHERE template = 'saved_search_confirm'").n, 3);
  const { sha256 } = await import("../../server/http.js");
  env.DB.raw.prepare("INSERT INTO email_suppressions VALUES (?,?,'team')").run(await sha256("other@example.test"), LATER);
  assert.equal((await call(env, "POST", "/saved-searches", { body: form({ email: "other@example.test" }) })).status, 202);
  assert.equal(one(env, "SELECT COUNT(*) n FROM outbound WHERE recipient = 'other@example.test'").n, 0);
});

test("the link page changes nothing; Confirm creates the contact with the PRE-10 permission and forgets the address", async () => {
  const env = world();
  await call(env, "POST", "/saved-searches", { body: form() });
  const token = confirmToken(env);
  const page = await call(env, "GET", `/saved-searches/confirm?token=${token}`);
  assert.match(page.text, /<form method="post">/);
  assert.equal(one(env, "SELECT status FROM saved_searches").status, "pending");
  await call(env, "POST", `/saved-searches/confirm?token=${token}`);
  const s = one(env, "SELECT * FROM saved_searches");
  assert.equal(s.status, "active");
  assert.equal(s.email, null);
  assert.equal(s.confirm_hash, null);
  const c = one(env, "SELECT * FROM contacts WHERE id = ?", s.contact_id);
  assert.equal(c.email, EMAIL);
  const p = one(env, "SELECT * FROM marketing_preferences WHERE contact_id = ?", c.id);
  assert.deepEqual([p.purpose, p.channel, p.value, p.source, p.notice_version, p.evidence_ref],
    ["property_alerts", "email", "granted", "web", NOTICE, `saved_search:${s.id}`]);
  assert.equal(one(env, "SELECT title FROM notifications ORDER BY id DESC").title, "Property alerts confirmed · To Let");
  // Used once.
  assert.match((await call(env, "POST", `/saved-searches/confirm?token=${token}`)).text, /no longer valid/);
});

test("an existing contact with that email is reused; an expired confirmation does nothing and the clock deletes it", async () => {
  const env = world();
  const id = Number(env.DB.raw.prepare(`INSERT INTO contacts (name,email,last_activity_at,created_at,updated_at)
    VALUES ('Synthetic applicant',?,?,?,?)`).run(EMAIL, LATER, LATER, LATER).lastInsertRowid);
  await confirmed(env);
  assert.equal(one(env, "SELECT contact_id FROM saved_searches").contact_id, id);
  assert.equal(one(env, "SELECT COUNT(*) n FROM contacts").n, 1);

  const old = world();
  await call(old, "POST", "/saved-searches", { body: form() });
  const stale = new Date(Date.now() - (PENDING_DAYS + 1) * 864e5).toISOString();
  old.DB.raw.prepare("UPDATE saved_searches SET created_at = ?").run(stale);
  assert.match((await call(old, "POST", `/saved-searches/confirm?token=${confirmToken(old)}`)).text, /no longer valid/);
  await savedSearchPass(old);
  assert.equal(one(old, "SELECT COUNT(*) n FROM saved_searches").n, 0);
});

test("the engine: a stated criterion that fails excludes a home, unknown does not", () => {
  const c = { operation: "rent", budget_max: 2500, bedrooms_min: 2, parishes: ["St Helier"], property_types: ["flat"] };
  const l = { ...RENT, use: "residential", currency: "GBP", feat_type: null, archived_at: null };
  assert.ok(alertFits(c, l));
  assert.equal(alertFits(c, { ...l, rent: 3000 }), null);
  assert.equal(alertFits(c, { ...l, parish: "St Ouen" }), null);
  assert.equal(alertFits(c, { ...l, feat_type: "house" }), null);
  assert.equal(alertFits(c, { ...l, operation: "sale", sale_price: 500000 }), null);
  assert.ok(alertFits(c, { ...l, parish: null, bedrooms: null }));
});

test("the clock queues one daily email of new fitting homes, as marketing.property_alerts, and the pipeline sends it", async () => {
  const env = world();
  await confirmed(env);
  const s = one(env, "SELECT * FROM saved_searches");
  seedListing(env, { ...RENT, currency: "GBP" });
  seedListing(env, { ...RENT, id: "HE-R102", parish: "St Ouen", title: "Elsewhere" });
  seedListing(env, { ...RENT, id: "HE-R103", rent: 9000, title: "Too dear" });
  seedListing(env, { ...RENT, id: "HE-R104", updated_at: "2026-01-01T00:00:00.000Z", title: "Old news" });
  seedListing(env, { ...RENT, id: "HE-R105", published: 0, title: "Not on the website" });
  await savedSearchPass(env, LATER);
  await savedSearchPass(env, LATER); // the same day again: nothing new
  const out = rows(env, "SELECT * FROM outbound WHERE template = 'marketing.property_alerts'");
  assert.equal(out.length, 1);
  assert.equal(out[0].entity_id, String(s.contact_id));
  assert.equal(out[0].recipient, EMAIL);
  assert.match(out[0].text, /Synthetic flat\n£2,000 a month · 2 bedrooms · St Helier\nhttps:\/\/www\.hamptonestatesjersey\.com\/p\/HE-R101/);
  assert.ok(!/Elsewhere|Too dear|Old news|Not on the website/.test(out[0].text));
  assert.ok(out[0].text.includes(`unsubscribe?token=${s.unsubscribe_token}`));
  assert.equal(one(env, "SELECT alerted_through FROM saved_searches").alerted_through, LATER);
  await dispatchEmail(env, () => LATER); // the confirmation, then the alert: the contact still allows property alerts
  assert.deepEqual(env.sent.map(m => m.subject.replace(/ \[HE-OUT-\w+\]$/, "")),
    ["Confirm your Hampton Estates property alert", "1 new home for your saved search"]);
  assert.deepEqual(env.sent.map(m => m.to), [EMAIL, EMAIL]);
});

test("unsubscribing records the objection, cancels the queued alert and deletes the contact's searches", async () => {
  const env = world();
  await confirmed(env);
  seedListing(env, { ...RENT });
  await savedSearchPass(env, LATER);
  const { unsubscribe_token: t, contact_id } = one(env, "SELECT * FROM saved_searches");
  assert.match((await call(env, "GET", `/saved-searches/unsubscribe?token=${t}`)).text, /Stop alerts/);
  assert.equal(one(env, "SELECT COUNT(*) n FROM saved_searches").n, 1);
  assert.match((await call(env, "POST", `/saved-searches/unsubscribe?token=${t}`)).text, /stopped/);
  assert.equal(one(env, "SELECT COUNT(*) n FROM saved_searches").n, 0);
  assert.equal(one(env, "SELECT value FROM marketing_preferences WHERE contact_id = ? AND purpose = 'property_alerts'", contact_id).value,
    "objected");
  assert.equal(one(env, "SELECT status FROM outbound WHERE template = 'marketing.property_alerts'").status, "cancelled");
});

test("no alert to an address that did not confirm or is suppressed, and neither blocks the others", async () => {
  const changed = world();
  await confirmed(changed);
  seedListing(changed, { ...RENT, currency: "GBP" });
  changed.DB.raw.prepare("UPDATE contacts SET email = 'someone.else@example.test'").run();
  await savedSearchPass(changed, LATER);
  assert.equal(rows(changed, "SELECT * FROM outbound WHERE template = 'marketing.property_alerts'").length, 0);
  assert.equal(one(changed, "SELECT alerted_through FROM saved_searches").alerted_through, LATER, "advanced: not first again");

  const suppressed = world();
  await confirmed(suppressed);
  seedListing(suppressed, { ...RENT, currency: "GBP" });
  const s = one(suppressed, "SELECT * FROM saved_searches");
  suppressed.DB.raw.prepare("INSERT INTO email_suppressions VALUES (?, ?, 'provider')").run(s.email_hash, LATER);
  await savedSearchPass(suppressed, LATER);
  assert.equal(rows(suppressed, "SELECT * FROM outbound WHERE template = 'marketing.property_alerts'").length, 0);
});
