// AUT-23: ADM-09's arrears reminders and letter and ADM-14's renewal messages go by email only as a team member approved
// each one (this text, this recipient, this source as it is), once, through the app's approved queue (AUT-17), delivered
// by Hermes's carrier from Hampton's Gmail; never while AUT23_RENTAL_EMAILS_READY is off; and sending never marks a step
// done nor pays anything. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";
import { configure } from "./email-helpers.mjs";
import { prepareSummary, claimForHermes } from "../../server/email.js";
import { rentalStepEmailPass } from "../../server/rental-step-emails.js";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { addMonths } from "../../server/rentals.js";
import worker from "../../server/jobs.js";

const KEY = "hermes-mail-key-hermes-mail-key-0123456789";
const TENANT = "tom.tenant@example.test", OWNER = "anne.owner@example.test";
const T = jerseyToday(), ago = n => plusDays(T, -n);
const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const row = (env, sql, ...a) => ({ ...env.DB.raw.prepare(sql).get(...a) });
const n = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a).n;
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const door = (env, path, body) => call(env, "POST", `/hermes/mail/${path}`, { body, bearer: KEY, origin: null });
const nextEmail = async env => ok(await door(env, "outbound/next")).email;
const outbound = env => env.DB.raw.prepare("SELECT * FROM outbound WHERE template IN ('rent_arrears', 'renewal_landlord', 'renewal_tenant') ORDER BY id")
  .all().map(r => ({ ...r }));

// on: AUT-23's own switch. ADM-09 and ADM-14 on, as in production; Hermes's transport on (AUT-17).
function world({ on = true, schema } = {}) {
  const env = { ...makeEnv(schema), HERMES_KEY: "g".repeat(40), HERMES_MAIL_KEY: KEY, HERMES_MAIL_READY: "1", ADM09_ARREARS_READY: "1",
    ADM14_RENEWAL_READY: "1", ...(on && { AUT23_RENTAL_EMAILS_READY: "1" }) };
  configure(env, { summary: false, recipients: [] });
  const at = new Date().toISOString();
  run(env, "INSERT INTO app_settings VALUES ('email_worker', ?, ?, 'system')", JSON.stringify({ at, ready: false, hermes: true }), at);
  run(env, "INSERT INTO app_settings VALUES ('hermes_mail_seen', ?, ?, 'hermes')", JSON.stringify({ at }), at);
  return env;
}
const landlord = async (env, email = OWNER) => ok(await req(env, "POST", "/admin/landlords", { name: "Anne Owner", email }), 201).landlord.id;
const property = async (env, l, service = "full") => ok(await req(env, "POST", "/admin/rentals", { landlord_id: l, address: "1 Rue des Pres",
  parish: "St Helier", service, ...(service === "full" && { fee_percent: 10 }) }), 201).rental.id;
// A full-service tenancy whose only charge due fell due `late` days ago: £1,500 owed.
async function arrears(env, { late = 6, email = TENANT, ...over } = {}) {
  const r = await property(env, await landlord(env));
  return ok(await req(env, "POST", `/admin/rentals/${r}/tenancies`, { tenant_name: "Tom Tenant", tenant_email: email, kind: "periodic",
    regime: "2025", rent: 1500, start_on: ago(late), collect_from: ago(late), ...over }), 201).tenancy.id;
}
// A let-only fixed term ending in 60 days: in its renewal window.
async function renewal(env, { email = OWNER } = {}) {
  const r = await property(env, await landlord(env, email), "let_only");
  return ok(await req(env, "POST", `/admin/rentals/${r}/tenancies`, { tenant_name: "Rita Renter", tenant_email: "rita@example.test",
    kind: "fixed", regime: "2025", rent: 1000, start_on: addMonths(T, -10), end_on: plusDays(T, 60) }), 201).tenancy.id;
}
const path = (id, which) => `/admin/tenancies/${id}/step-email/${which}`;
const context = async (env, id, which = "arrears") => ok(await req(env, "GET", path(id, which)));
const save = (env, id, which, body) => req(env, "PUT", path(id, which), body);
const approve = (env, id, which, revision) => req(env, "POST", `${path(id, which)}/approve`, { revision });
const detail = async (env, id) => ok(await req(env, "GET", `/admin/tenancies/${id}`));
// Prepared from the proposed text as read, and approved as it is: queued once.
async function queued(env, id, which = "arrears", { approveIt = true, text } = {}) {
  const ctx = await context(env, id, which);
  const email = ok(await save(env, id, which, { revision: ctx.email?.revision ?? 0, source: ctx.source, ...(text && { text }) })).email;
  if (approveIt) ok(await approve(env, id, which, email.revision));
  return { ctx, email };
}
const pay = (env, id, amount = 50000) => req(env, "POST", "/admin/payments", { tenancy_id: id, received_on: T, amount });

test("switched off or before migration 0127: no route, nothing on the tenancy, and a queued email is never claimed", async () => {
  for (const [label, env] of [["off", world({ on: false })], ["before 0127", world({ schema: { through: 126 } })]]) {
    const id = await arrears(env);
    assert.equal((await req(env, "GET", path(id, "arrears"))).status, 404, label);
    assert.equal((await save(env, id, "arrears", { revision: 0, source: "x" })).status, 404, label);
    assert.equal((await approve(env, id, "renewal", 1)).status, 404, label);
    assert.equal("step_emails" in await detail(env, id), false, label);
    // The shared claim still works for the other emails: the team summary is claimed as before.
    configure(env, { summary: true, recipients: ["team@example.test"] });
    await prepareSummary(env, new Date().toISOString().slice(0, 11) + "09:00:00.000Z");
    assert.equal((await claimForHermes(env, "0"))?.to, "team@example.test", label);
    await rentalStepEmailPass(env);
  }
  // Each half also needs its parent's switch.
  const half = world();
  delete half.ADM09_ARREARS_READY;
  assert.equal((await req(half, "GET", path(await arrears(half), "arrears"))).status, 404);
  // Queued while on, then switched off: never claimed; the clock (off) takes it out of the queue unsent.
  const env = world(), id = await arrears(env);
  await queued(env, id);
  env.AUT23_RENTAL_EMAILS_READY = "0";
  assert.equal(await nextEmail(env), null);
  await rentalStepEmailPass(env);
  assert.equal(outbound(env)[0].status, "cancelled");
  env.AUT23_RENTAL_EMAILS_READY = "1";
  const e = (await context(env, id)).email;
  assert.deepEqual([e.status, e.revision, e.approval], ["draft", 2, null]);
});

test("approving queues exactly one email to the tenant; two clicks or two at once are still one", async () => {
  const env = world(), id = await arrears(env);
  const { ctx, email } = await queued(env, id, "arrears", { approveIt: false });
  assert.deepEqual([ctx.kind, ctx.step, ctx.recipient, email.status], ["rent_arrears", "firm", TENANT, "draft"]);
  assert.equal(outbound(env).length, 0, "saving queues nothing");
  await Promise.all([approve(env, id, "arrears", 1), approve(env, id, "arrears", 1)]);
  ok(await approve(env, id, "arrears", 1));
  const [o, ...more] = outbound(env);
  assert.equal(more.length, 0);
  assert.deepEqual([o.recipient, o.text, o.status, o.approved_by], [TENANT, ctx.proposed_text, "queued", "admin@example.test"]);
  assert.match(o.subject, /Rent overdue · HE-T\d{4} · 1 Rue des Pres/);
  const claimed = await nextEmail(env);
  assert.equal(claimed.to, TENANT);
  assert.equal(claimed.text, ctx.proposed_text, "verbatim");
  assert.equal(await nextEmail(env), null, "claimed once");
  // The step record shows the email: queued.
  assert.deepEqual((await detail(env, id)).step_emails.map(x => [x.kind, x.step, x.status]), [["rent_arrears", "firm", "queued"]]);
});

test("an edited text is what goes; a text written from a source that changed since is refused with 409", async () => {
  const env = world(), id = await arrears(env);
  const ctx = await context(env, id);
  ok(await pay(env, id), 201);
  const r = await save(env, id, "arrears", { revision: 0, source: ctx.source, text: "Dear Tom, please pay £1,500.00." });
  assert.equal(r.status, 409, "the dialog read £1,500 owed; £1,000 is owed now");
  assert.equal(n(env, "SELECT COUNT(*) n FROM rental_step_emails"), 0);
  const fresh = await context(env, id);
  assert.match(fresh.proposed_text, /£1,000\.00 is owed/);
  const e = ok(await save(env, id, "arrears", { revision: 0, source: fresh.source, text: "Dear Tom,\n\nPlease call us about the rent.\n\nHampton Estates" })).email;
  ok(await approve(env, id, "arrears", e.revision));
  assert.equal((await nextEmail(env)).text, "Dear Tom,\n\nPlease call us about the rent.\n\nHampton Estates");
  // A wrong revision writes nothing.
  assert.equal((await save(env, id, "arrears", { revision: 7, source: fresh.source })).status, 409);
  assert.equal((await approve(env, id, "arrears", 0)).status, 409);
});

test("a change to the source after approval revokes it: not claimed, and the clock gives it back to a person", async () => {
  for (const change of [
    async (env, id) => ok(await pay(env, id), 201), // the amount owed
    async (env, id) => ok(await req(env, "PUT", `/admin/tenancies/${id}/arrears/${ago(6)}/firm`, { note: "Phoned" })), // the step marked done
    async (env, id) => ok(await req(env, "PUT", `/admin/tenancies/${id}`, { updated_at: (await detail(env, id)).tenancy.updated_at,
      tenant_email: "new.address@example.test" })), // the recipient
  ]) {
    const env = world(), id = await arrears(env);
    await queued(env, id);
    await change(env, id);
    assert.equal(await nextEmail(env), null);
    await rentalStepEmailPass(env);
    assert.equal(outbound(env)[0].status, "cancelled");
    assert.deepEqual([row(env, "SELECT status, revision, approved_revision FROM rental_step_emails").status,
      row(env, "SELECT revision FROM rental_step_emails").revision], ["draft", 2]);
  }
  // Renewal: an answer recorded after the question to the landlord was approved.
  const env = world(), id = await renewal(env);
  const { ctx } = await queued(env, id, "renewal");
  assert.deepEqual([ctx.kind, ctx.recipient], ["renewal_landlord", OWNER]);
  ok(await req(env, "POST", `/admin/tenancies/${id}/renewal-answer`, { party: "landlord", answer: "renew", answered_on: T, source: "Phone call" }));
  assert.equal(await nextEmail(env), null);
  // The step stops being due (+5 to +7): a firm reminder approved yesterday does not go once the call is due.
  const late = world(), lid = await arrears(late, { late: 6 });
  await queued(late, lid);
  run(late, "UPDATE rental_step_emails SET valid_until = ?", T);
  assert.equal(await nextEmail(late), null, "valid_until reached");
});

test("pause, a suppressed address or an approver no longer in the team: the email is not claimed", async () => {
  const env = world(), id = await arrears(env);
  await queued(env, id);
  const [o] = outbound(env);
  run(env, "INSERT INTO app_settings VALUES ('outbound', '{\"paused\":true}', ?, 'x')", T0);
  assert.equal(await nextEmail(env), null, "paused");
  run(env, "DELETE FROM app_settings WHERE key = 'outbound'");
  run(env, "INSERT INTO email_suppressions VALUES (?, ?, 'team')", o.recipient_hash, T0);
  assert.equal(await nextEmail(env), null, "suppressed");
  run(env, "DELETE FROM email_suppressions");
  run(env, "UPDATE rental_step_emails SET approved_by = 'gone@example.test'");
  assert.equal(await nextEmail(env), null, "approver removed");
  run(env, "UPDATE rental_step_emails SET approved_by = 'admin@example.test'");
  assert.equal((await nextEmail(env)).to, TENANT);
  // Approving refuses a suppressed address outright.
  const other = world(), oid = await arrears(other);
  const { email } = await queued(other, oid, "arrears", { approveIt: false });
  run(other, "INSERT INTO email_suppressions VALUES (?, ?, 'team')", createHash("sha256").update(TENANT).digest("hex"), T0);
  assert.equal((await approve(other, oid, "arrears", email.revision)).status, 409);
});

test("an unknown result is never sent again; a person says what happened", async () => {
  const env = world(), id = await arrears(env);
  await queued(env, id);
  const email = await nextEmail(env);
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "unknown" }));
  await rentalStepEmailPass(env);
  let e = (await context(env, id)).email;
  assert.equal(e.status, "needs_review");
  assert.equal(await nextEmail(env), null, "unknown is never retried");
  assert.equal((await approve(env, id, "arrears", 1)).status, 409);
  assert.deepEqual((await detail(env, id)).step_emails.map(x => x.status), ["needs_review"]);
  e = ok(await req(env, "POST", `${path(id, "arrears")}/outcome`, { revision: 1, sent: true })).email;
  assert.equal(e.status, "sent");
  assert.equal(outbound(env).length, 1);
});

test("an unknown result still waits for a person once the source moved on (paid in full, or the landlord answered)", async () => {
  const env = world(), id = await arrears(env);
  await queued(env, id);
  let email = await nextEmail(env);
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "unknown" }));
  await rentalStepEmailPass(env);
  ok(await pay(env, id, 150000), 201);
  assert.equal((await detail(env, id)).arrears, null, "nothing owed any more");
  assert.equal((await context(env, id)).email.status, "needs_review");
  assert.deepEqual((await detail(env, id)).step_emails.map(x => x.status), ["needs_review"]);
  assert.equal((await save(env, id, "arrears", { revision: 1, source: "x" })).status, 409);
  ok(await req(env, "POST", `${path(id, "arrears")}/outcome`, { revision: 1, sent: false }));
  assert.equal((await req(env, "GET", path(id, "arrears"))).status, 409, "settled; no reminder is due now");
  assert.deepEqual([row(env, "SELECT status, revision FROM rental_step_emails").status, row(env, "SELECT revision FROM rental_step_emails").revision], ["draft", 2]);
  // Renewal: the landlord answered while the result of the question to them was unknown.
  const r = world(), rid = await renewal(r);
  await queued(r, rid, "renewal");
  email = await nextEmail(r);
  assert.equal(email.to, OWNER, "the question to the landlord is claimed");
  ok(await door(r, `outbound/${email.ref}/result`, { token: email.token, outcome: "unknown" }));
  await rentalStepEmailPass(r);
  ok(await req(r, "POST", `/admin/tenancies/${rid}/renewal-answer`, { party: "landlord", answer: "end", answered_on: T, source: "Letter" }));
  const c = await context(r, rid, "renewal");
  assert.deepEqual([c.kind, c.email.status], ["renewal_landlord", "needs_review"]);
  ok(await req(r, "POST", `${path(rid, "renewal")}/outcome`, { revision: 1, sent: true }));
  assert.equal(row(r, "SELECT status FROM rental_step_emails WHERE kind = 'renewal_landlord'").status, "sent");
  assert.equal((await context(r, rid, "renewal")).kind, "renewal_tenant", "then the message to the tenant");
});

test("sending never marks the step done nor pays the debt; it is recorded once on the tenancy", async () => {
  const env = world(), id = await arrears(env), before = await detail(env, id);
  await queued(env, id);
  const email = await nextEmail(env);
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "sent", message_id: "m-1", thread_id: "t-1" }));
  // The clock settles it with its own switches (jobs/wrangler.toml: no ADM14_RENEWAL_READY).
  const clock = { DB: env.DB, MEDIA: env.MEDIA, HERMES_MAIL_READY: "1", AUT23_RENTAL_EMAILS_READY: "1", ADM09_ARREARS_READY: "1" };
  await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() }, clock, { waitUntil() {} });
  await rentalStepEmailPass(clock);
  const after = await detail(env, id);
  assert.deepEqual(after.step_emails.map(x => x.status), ["sent"]);
  assert.equal(after.balance, before.balance);
  assert.deepEqual(after.arrears.next_step, before.arrears.next_step, "the step is still to be marked done by a person");
  assert.equal(n(env, "SELECT COUNT(*) n FROM arrears_steps"), 0);
  assert.equal(n(env, "SELECT COUNT(*) n FROM payments"), 0);
  assert.equal(n(env, "SELECT COUNT(*) n FROM rental_events WHERE type = 'rental_step_email.sent'"), 1);
  const ev = JSON.parse(row(env, "SELECT data FROM rental_events WHERE type = 'rental_step_email.sent'").data);
  assert.ok(!JSON.stringify(ev).includes(TENANT) && !("text" in ev), "ids only");
  assert.equal(row(env, "SELECT gmail_thread_id FROM outbound WHERE ref = ?", email.ref).gmail_thread_id, "t-1");
  assert.ok(ok(await door(env, "threads")).threads.some(t => t.id === "t-1"), "the tenant's reply is read in that thread");
});

test("the renewal message goes to the landlord until they answer, then to the tenant, queued from a renewal queued by the clock", async () => {
  const env = world(), id = await renewal(env);
  const first = await context(env, id, "renewal");
  assert.deepEqual([first.kind, first.party, first.recipient], ["renewal_landlord", "landlord", OWNER]);
  for (const s of ["Dear Anne Owner", "Rita Renter's tenancy at 1 Rue des Pres", "£1,000 pcm", "Hampton Estates"]) assert.ok(first.proposed_text.includes(s), s);
  ok(await req(env, "POST", `/admin/tenancies/${id}/renewal-answer`, { party: "landlord", answer: "rent", rent: 1050, answered_on: T, source: "Email" }));
  const second = await context(env, id, "renewal");
  assert.deepEqual([second.kind, second.party, second.recipient], ["renewal_tenant", "tenant", "rita@example.test"]);
  assert.match(second.proposed_text, /at a rent of £1,050 pcm/);
  await queued(env, id, "renewal");
  // The clock, without ADM-14's switch, does not take it back.
  await rentalStepEmailPass({ DB: env.DB, AUT23_RENTAL_EMAILS_READY: "1", ADM09_ARREARS_READY: "1" });
  assert.equal(outbound(env)[0].status, "queued");
  assert.equal((await nextEmail(env)).to, "rita@example.test");
  // A landlord with no email: nothing can be prepared.
  const none = world(), nid = await renewal(none, { email: null });
  const c = await context(none, nid, "renewal");
  assert.ok(c.no_address);
  assert.equal((await save(none, nid, "renewal", { revision: 0, source: c.source })).status, 409);
});

test("the text is the draft's in plain English: no bank details, nothing of another tenant", async () => {
  const env = world();
  const l = await landlord(env), r = await property(env, l), other = await property(env, l);
  // A past tenancy on the same property and a running one on another property of the same landlord.
  ok(await req(env, "POST", `/admin/rentals/${r}/tenancies`, { tenant_name: "Paula Past", tenant_email: "paula@example.test", kind: "periodic",
    regime: "2025", rent: 1200, start_on: addMonths(T, -14), collect_from: addMonths(T, -14) }), 201);
  const past = row(env, "SELECT id, payment_ref FROM tenancies WHERE tenant_name = 'Paula Past'");
  ok(await req(env, "POST", `/admin/tenancies/${past.id}/end`, { ended_on: ago(30) }));
  const neighbour = ok(await req(env, "POST", `/admin/rentals/${other}/tenancies`, { tenant_name: "Nina Neighbour", tenant_email: "nina@example.test",
    kind: "periodic", regime: "2025", rent: 900, start_on: ago(3), collect_from: ago(3) }), 201).tenancy;
  const id = ok(await req(env, "POST", `/admin/rentals/${r}/tenancies`, { tenant_name: "Tom Tenant", tenant_email: TENANT, tenant_phone: "07700 900123",
    occupants: "Olga Occupant", kind: "periodic", regime: "2025", rent: 1500, start_on: ago(20), collect_from: ago(20) }), 201).tenancy.id;
  const t = (await detail(env, id)).tenancy;
  const ctx = await context(env, id);
  assert.equal(ctx.step, "letter");
  for (const s of ["Dear Tom Tenant", t.payment_ref, "1 Rue des Pres", "£1,500.00", "Hampton Estates", "bank transfer quoting"]) assert.ok(ctx.proposed_text.includes(s), s);
  for (const s of ["Paula", past.payment_ref, "Nina", neighbour.payment_ref, "Olga", "07700", "@", OWNER, "DRAFT", "[Name]", "Anne Owner"])
    assert.ok(!ctx.proposed_text.includes(s), s);
  for (const text of ["Pay to sort code 12-34-56", "Account 12345678", "IBAN GB29 NWBK 6016 1331 9268 19", "Our account number is on the invoice"]) {
    const res = await save(env, id, "arrears", { revision: 0, source: ctx.source, text });
    assert.equal(res.status, 400, text);
    assert.ok(res.data.fields.text);
  }
  assert.equal(n(env, "SELECT COUNT(*) n FROM rental_step_emails"), 0);
  // The two reminder steps read as the drafts do.
  const soon = world(), sid = await arrears(soon, { late: 2 });
  const rem = await context(soon, sid);
  assert.equal(rem.step, "reminder");
  assert.match(rem.proposed_text, /friendly reminder that the rent due on .* has not reached us yet: £1,500\.00 is owed/);
});

test("migration 0127 only adds a table and its index", () => {
  const sql = readFileSync(new URL("../../migrations/0127_rental_step_emails.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  assert.ok(sql.split(";").map(s => s.trim()).filter(Boolean).every(s => /^CREATE (TABLE|INDEX) (IF NOT EXISTS )?rental_step_emails/.test(s)));
});

test("the website and the clock carry the same AUT23_RENTAL_EMAILS_READY, on (Luis 27-nov)", () => {
  const flag = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(/^AUT23_RENTAL_EMAILS_READY = "(.*)"$/m)?.[1];
  assert.equal(flag("wrangler.toml"), "1");
  assert.equal(flag("jobs/wrangler.toml"), "1");
});
