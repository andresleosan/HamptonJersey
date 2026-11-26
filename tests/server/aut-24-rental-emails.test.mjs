// AUT-24: the tenant's documents (ADM-11: licence copy, EICR copy, the deposit's prescribed information), the rent change
// notice (ADM-15) and the landlord's arrears notice at step +10 (ADM-03) leave by email only as a team member approved
// them (this revision, this recipient, this source), once, through the app's approved queue, delivered by Hermes's carrier
// from Hampton's Gmail; the delivery is recorded only once Gmail accepted it; and nothing at all while
// AUT24_TENANT_DOCS_READY is off. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { configure } from "./email-helpers.mjs";
import { rentalEmailPass, bankDetails } from "../../server/rental-emails.js";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import worker from "../../server/jobs.js";

const ADMIN = "admin@example.test", KEY = "hermes-mail-key-hermes-mail-key-0123456789";
const TENANT = "tom@tenant.example.test", OWNER = "anne@owner.example.test";
const T = jerseyToday(), ago = n => plusDays(T, -n), ahead = n => plusDays(T, n);
const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const row = (env, sql, ...a) => ({ ...env.DB.raw.prepare(sql).get(...a) });
const all = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const n = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a).n;
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie(ADMIN) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const door = (env, path, body) => call(env, "POST", `/hermes/mail/${path}`, { body, bearer: KEY, origin: null });
const nextEmail = async env => ok(await door(env, "outbound/next")).email;
const TS = () => new Date().toISOString();

// on: AUT-24's switch; the calendar (ADM-11) and Hermes's transport (AUT-17) as in production.
function world({ on = true, schema } = {}) {
  const env = { ...makeEnv(schema), HERMES_KEY: "g".repeat(40), HERMES_MAIL_KEY: KEY, HERMES_MAIL_READY: "1", ADM11_CALENDAR_READY: "1",
    ADM09_ARREARS_READY: "1", ...(on && { AUT24_TENANT_DOCS_READY: "1" }) };
  configure(env, { summary: false, recipients: [] });
  const at = TS();
  run(env, "INSERT INTO app_settings VALUES ('email_worker', ?, ?, 'system')", JSON.stringify({ at, ready: false, hermes: true }), at);
  run(env, "INSERT INTO app_settings VALUES ('hermes_mail_seen', ?, ?, 'hermes')", JSON.stringify({ at }), at);
  return env;
}
let homes = 0;
// A full-service property of Anne Owner with Tom Tenant in, his deposit received and protected, its licence and EICR on record.
// Rent is collected from a year ahead, so the only charges are those a test enters (owe).
async function home(env, { tenant = {}, landlordEmail = OWNER } = {}) {
  const i = ++homes;
  const l = ok(await req(env, "POST", "/admin/landlords", { name: "Anne Owner", email: landlordEmail }), 201).landlord.id;
  const r = ok(await req(env, "POST", "/admin/rentals", { landlord_id: l, address: `${i} Rue des Pres`, parish: "St Helier",
    service: "full", fee_percent: 10 }), 201).rental.id;
  const t = ok(await req(env, "POST", `/admin/rentals/${r}/tenancies`, { tenant_name: "Tom Tenant", tenant_email: TENANT, kind: "periodic",
    regime: "2025", rent: 1500, start_on: ago(20), due_day: 1, deposit: 1500, deposit_received_on: ago(20), deposit_protected_on: ago(5),
    deposit_ref: "DPS-REF-1", collect_from: ahead(365), ...tenant }), 201).tenancy.id;
  ok(await req(env, "PUT", `/admin/rentals/${r}/compliance/licence`, { done_on: ago(100) }));
  ok(await req(env, "PUT", `/admin/rentals/${r}/compliance/eicr`, { done_on: ago(100) }));
  return { l, r, t };
}
const docPath = (r, kind) => `/admin/rentals/${r}/emails/${kind}`;
const tenancyPath = (t, kind) => `/admin/tenancies/${t}/emails/${kind}`;
const context = async (env, p) => ok(await req(env, "GET", p));
const save = (env, p, body) => req(env, "PUT", p, body);
const approve = (env, p, revision) => req(env, "POST", `${p}/approve`, { revision });
// Prepared from the source as read and approved as it is: queued once.
async function queued(env, p, { approveIt = true, text } = {}) {
  const c = await context(env, p);
  const email = ok(await save(env, p, { revision: c.email?.revision ?? 0, source_version: c.source_version, ...(text != null && { text }) })).email;
  if (approveIt) ok(await approve(env, p, email.revision));
  return { c, email };
}
const outbound = env => all(env, "SELECT * FROM outbound ORDER BY id");
const mail = (env, kind) => row(env, "SELECT * FROM rental_emails WHERE kind = ?", kind);
const check = (env, r, kind) => row(env, "SELECT * FROM compliance_items WHERE rental_id = ? AND kind = ?", r, kind);
const result = (env, e, outcome, extra = {}) => door(env, `outbound/${e.ref}/result`, { token: e.token, outcome, ...extra });
// Rent owed since `days` days ago, entered as the charge is (no collection date: the charge stands alone).
const owe = (env, t, days, pence = 150000) => run(env, "INSERT INTO charges (tenancy_id, due_on, amount, kind) VALUES (?, ?, ?, 'rent')", t, ago(days), pence);

test("switched off or before migration 0128: no route, no button, and a queued email is never claimed", async () => {
  for (const [label, env] of [["off", world({ on: false })], ["before 0128", world({ schema: { through: 127 } })]]) {
    const { r, t } = await home(env);
    for (const p of [docPath(r, "licence_copy"), tenancyPath(t, "rent_notice"), tenancyPath(t, "landlord_arrears")]) {
      assert.equal((await req(env, "GET", p)).status, 404, `${label} ${p}`);
      assert.equal((await save(env, p, { revision: 0, source_version: "x" })).status, 404, label);
      assert.equal((await approve(env, p, 1)).status, 404, label);
    }
    assert.ok(!ok(await req(env, "GET", `/admin/rentals/${r}`)).tenant_emails, label);
    assert.ok(!ok(await req(env, "GET", `/admin/tenancies/${t}`)).rental_emails, label);
    await rentalEmailPass(env);
  }
  // Queued while on, then switched off: never claimed; the clock (off) takes it out of the queue unsent.
  const env = world();
  const { r, t } = await home(env);
  assert.equal(ok(await req(env, "GET", `/admin/rentals/${r}`)).tenant_emails, true);
  assert.equal(ok(await req(env, "GET", `/admin/tenancies/${t}`)).rental_emails, true);
  await queued(env, docPath(r, "licence_copy"));
  env.AUT24_TENANT_DOCS_READY = "0";
  assert.equal(await nextEmail(env), null);
  await rentalEmailPass(env);
  assert.equal(outbound(env)[0].status, "cancelled");
  assert.deepEqual([mail(env, "licence_copy").status, mail(env, "licence_copy").revision], ["draft", 2]);
  assert.equal(check(env, r, "licence_copy").done_on, null, "nothing recorded as given");
});

test("approving queues one email to the lead tenant, once; Gmail's acceptance records the copy as given, once", async () => {
  const env = world();
  const { r, t } = await home(env, { tenant: { occupants: "Olive Other" } });
  const p = docPath(r, "licence_copy");
  const c = await context(env, p);
  assert.deepEqual(c.recipient, { name: "Tom Tenant", email: TENANT, party: "tenant" });
  assert.equal(c.blocked, null);
  const { email } = await queued(env, p);
  ok(await approve(env, p, email.revision)); // the same click again
  const [o, ...rest] = outbound(env);
  assert.equal(rest.length, 0, "queued once");
  assert.deepEqual([o.template, o.recipient, o.status, o.approved_by, o.text], ["tenant_licence_copy", TENANT, "queued", ADMIN, email.text]);
  assert.match(o.text, /rental dwelling licence/);
  assert.match(o.text, /reply to this email and we will send it to you, or collect it from our office/, "how the tenant gets it");
  assert.doesNotMatch(o.text, /Olive Other/, "never the other occupants");
  assert.equal(check(env, r, "licence_copy").done_on, null, "queued is not given");
  const e = await nextEmail(env);
  assert.equal(e.to, TENANT);
  assert.equal(await nextEmail(env), null, "claimed once");
  await rentalEmailPass(env);
  assert.equal(check(env, r, "licence_copy").done_on, null, "being sent is not given");
  ok(await result(env, e, "sent", { message_id: "m-1", thread_id: "t-1" }));
  await rentalEmailPass(env);
  await rentalEmailPass(env);
  const given = check(env, r, "licence_copy");
  assert.equal(given.done_on, T);
  assert.ok(given.note.includes(o.ref), "the email is the evidence");
  // ADM-11's check is closed: in date, nothing further due, out of Rentals' To do.
  const item = ok(await req(env, "GET", `/admin/rentals/${r}`)).compliance.find(c => c.kind === "licence_copy");
  assert.deepEqual([item.status, item.expires_on, item.done_on], ["ok", null, T]);
  assert.ok(!ok(await req(env, "GET", "/admin/rentals")).todo.compliance.some(c => c.rental_id === r && c.kind === "licence_copy"));
  assert.equal(n(env, "SELECT COUNT(*) n FROM rental_events WHERE type = 'rental_email.sent'"), 1, "recorded once");
  assert.equal(mail(env, "licence_copy").status, "sent");
  assert.equal(row(env, "SELECT gmail_thread_id FROM outbound WHERE ref = ?", o.ref).gmail_thread_id, "t-1", "the reply is read in its thread");
  assert.ok(ok(await door(env, "threads")).threads.some(x => x.id === "t-1"));
  assert.equal((await context(env, p)).blocked, `Already recorded as given on ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long",
    year: "numeric", timeZone: "UTC" }).format(new Date(`${T}T12:00:00Z`))}.`);
  assert.equal((await context(env, tenancyPath(t, "licence_copy"))).blocked, (await context(env, p)).blocked, "by its tenancy, the same email");
});

test("a change to the source takes the approval away: it is not claimed, and the clock gives it back to a person", async () => {
  const env = world();
  const { r, t } = await home(env);
  const p = docPath(r, "eicr_copy");
  await queued(env, p);
  // The EICR is entered again (a newer report): the text was written from the old one.
  ok(await req(env, "PUT", `/admin/rentals/${r}/compliance/eicr`, { done_on: ago(1) }));
  assert.equal(await nextEmail(env), null, "source changed: not claimed");
  await rentalEmailPass(env);
  assert.equal(outbound(env)[0].status, "cancelled");
  const e = (await context(env, p)).email;
  assert.deepEqual([e.status, e.revision, e.approval, e.stale], ["draft", 2, null, true]);
  assert.match(e.blocked, /changed since it was prepared/);
  assert.equal((await approve(env, p, 2)).status, 409, "a stale text cannot be approved");
  // A change to the tenancy itself (its address for the email) does the same for the deposit's information.
  const q = docPath(r, "deposit_info");
  await queued(env, q);
  const cur = row(env, "SELECT updated_at FROM tenancies WHERE id = ?", t).updated_at;
  ok(await req(env, "PUT", `/admin/tenancies/${t}`, { tenant_email: "new@tenant.example.test", updated_at: cur }));
  assert.equal(await nextEmail(env), null, "recipient and tenancy changed: not claimed");
  // A move-out that passes while queued (no edit): not claimed.
  const gone = world(), g = await home(gone), gp = docPath(g.r, "licence_copy");
  await queued(gone, gp);
  run(gone, "UPDATE tenancies SET ended_on = ?", ago(1));
  assert.equal(await nextEmail(gone), null, "the tenancy has ended");
});

test("a save from a dialog that read another source version is refused with 409 and writes nothing", async () => {
  const env = world();
  const { t } = await home(env);
  ok(await req(env, "POST", `/admin/tenancies/${t}/rent`, { rent: 1550, effective_on: ahead(70) }));
  const p = tenancyPath(t, "rent_notice"), c = await context(env, p);
  assert.match(c.proposed_text, /from £1,500 to £1,550 per calendar month, starting on/);
  // Meanwhile the rent change is entered again with another amount.
  ok(await req(env, "POST", `/admin/tenancies/${t}/rent`, { rent: 1600, effective_on: ahead(70) }));
  const r = await save(env, p, { revision: 0, source_version: c.source_version, text: c.proposed_text });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /changed while it was open/);
  assert.equal(n(env, "SELECT COUNT(*) n FROM rental_emails"), 0);
  const again = await context(env, p);
  assert.match(again.proposed_text, /to £1,600 per calendar month/);
  const { email } = await queued(env, p);
  assert.equal((await save(env, p, { revision: 0, source_version: again.source_version })).status, 409, "wrong revision");
  assert.equal((await approve(env, p, email.revision + 1)).status, 409, "wrong revision");
  assert.equal(outbound(env).length, 1);
  assert.equal((await nextEmail(env)).to, TENANT);
});

test("pause, a suppressed address, an unapproved revision or a stale queue: not claimed", async () => {
  const env = world();
  const { r } = await home(env);
  const p = docPath(r, "licence_copy");
  await queued(env, p);
  const [o] = outbound(env);
  run(env, "INSERT INTO app_settings VALUES ('outbound', '{\"paused\":true}', ?, 'x')", TS());
  assert.equal(await nextEmail(env), null, "paused");
  run(env, "DELETE FROM app_settings WHERE key = 'outbound'");
  run(env, "INSERT INTO email_suppressions VALUES (?, ?, 'team')", o.recipient_hash, TS());
  assert.equal(await nextEmail(env), null, "suppressed");
  run(env, "DELETE FROM email_suppressions");
  run(env, "UPDATE rental_emails SET approved_by = 'stranger@example.test'");
  assert.equal(await nextEmail(env), null, "approved by someone not on the team");
  run(env, "UPDATE rental_emails SET approved_by = ?", ADMIN);
  run(env, "UPDATE outbound SET created_at = ?", new Date(Date.now() - 25 * 3600e3).toISOString());
  assert.equal(await nextEmail(env), null, "queued more than a day ago");
  run(env, "UPDATE outbound SET created_at = ?", TS());
  assert.equal(n(env, "SELECT COUNT(*) n FROM email_attempts"), 0);
  assert.equal((await nextEmail(env)).to, TENANT, "all clear: claimed");
  // Suppressed before approving: refused, nothing queued.
  const other = world(), h = await home(other), q = docPath(h.r, "eicr_copy");
  run(other, "INSERT INTO email_suppressions VALUES (?, ?, 'team')", outbound(env)[0].recipient_hash, TS());
  const { email } = await queued(other, q, { approveIt: false });
  assert.equal((await approve(other, q, email.revision)).status, 409);
  assert.equal(outbound(other).length, 0);
});

test("unknown is never sent again; a person says what happened; refused goes back to a person", async () => {
  const env = world();
  const { r } = await home(env);
  const p = docPath(r, "licence_copy");
  await queued(env, p);
  let e = await nextEmail(env);
  ok(await result(env, e, "unknown"));
  await rentalEmailPass(env);
  let m = (await context(env, p)).email;
  assert.equal(m.status, "needs_review");
  assert.equal(await nextEmail(env), null, "unknown is never retried");
  assert.equal((await approve(env, p, m.revision)).status, 409);
  assert.equal(check(env, r, "licence_copy").done_on, null, "unknown is not given");
  assert.equal((await req(env, "POST", `${p}/outcome`, { revision: m.revision + 1, sent: false })).status, 409, "wrong revision");
  m = ok(await req(env, "POST", `${p}/outcome`, { revision: m.revision, sent: false })).email;
  assert.deepEqual([m.status, m.approval], ["draft", null]);
  assert.equal(outbound(env).length, 1, "nothing queued again by itself");
  // Approved again and refused by Gmail: back to a person, nothing recorded.
  ok(await approve(env, p, m.revision));
  e = await nextEmail(env);
  ok(await result(env, e, "failed"));
  await rentalEmailPass(env);
  m = (await context(env, p)).email;
  assert.deepEqual([m.status, m.approval], ["draft", null]);
  assert.equal(check(env, r, "licence_copy").done_on, null);
  // Unknown, then a person confirms from Gmail's Sent folder: recorded as a person confirmed it.
  ok(await approve(env, p, m.revision));
  e = await nextEmail(env);
  ok(await result(env, e, "unknown"));
  await rentalEmailPass(env);
  m = ok(await req(env, "POST", `${p}/outcome`, { revision: (await context(env, p)).email.revision, sent: true })).email;
  assert.equal(m.status, "sent");
  assert.match(check(env, r, "licence_copy").note, /confirmed by a person/);
  assert.equal(JSON.parse(row(env, "SELECT data FROM rental_events WHERE type = 'rental_email.sent'").data).by, "person");
});

// Review 26-nov: an email whose result is unknown stays reachable once the tenancy has ended (another may be in place):
// the tenancy's page lists it, its dialog opens by the tenancy, and a person's answer records the email only, not the
// property's check, which belongs to whoever is in now.
test("unknown stays reachable from the tenancy after it ended; confirming it leaves the property's check alone", async () => {
  const env = world();
  const { r, t } = await home(env);
  await queued(env, docPath(r, "licence_copy"));
  ok(await result(env, await nextEmail(env), "unknown"));
  await rentalEmailPass(env);
  run(env, "UPDATE tenancies SET ended_on = ? WHERE id = ?", ago(1), t);
  assert.equal((await req(env, "GET", docPath(r, "licence_copy"))).status, 404, "no tenancy in place on the property");
  assert.deepEqual(ok(await req(env, "GET", `/admin/tenancies/${t}`)).rental_email_checks, [{ kind: "licence_copy" }]);
  const p = tenancyPath(t, "licence_copy"), c = await context(env, p);
  assert.equal(c.email.status, "needs_review");
  assert.equal((await save(env, p, { revision: c.email.revision, source_version: c.source_version })).status, 409, "an ended tenancy gets no new email");
  const m = ok(await req(env, "POST", `${p}/outcome`, { revision: c.email.revision, sent: true })).email;
  assert.equal(m.status, "sent");
  assert.equal(check(env, r, "licence_copy").done_on, null, "the check is the tenancy in place's, not the ended one's");
  assert.equal(n(env, "SELECT COUNT(*) n FROM rental_events WHERE type = 'rental_email.sent'"), 1);
  assert.deepEqual(ok(await req(env, "GET", `/admin/tenancies/${t}`)).rental_email_checks, []);
});

// Review 26-nov: by its tenancy, a tenant's document goes only from the tenancy the property's route would pick (the one in
// place); the next tenant's, entered ahead, is readable but cannot be prepared or approved, nor mark the property's check.
test("by tenancy, a tenant's document is prepared only for the tenancy in place, never the next one entered ahead", async () => {
  const env = world();
  const { r, t } = await home(env);
  run(env, "UPDATE tenancies SET ended_on = ? WHERE id = ?", ahead(30), t);
  const next = ok(await req(env, "POST", `/admin/rentals/${r}/tenancies`, { tenant_name: "Nia Next", tenant_email: "nia@tenant.example.test",
    kind: "periodic", regime: "2025", rent: 1600, start_on: ahead(31), due_day: 1, collect_from: ahead(365) }), 201).tenancy.id;
  const p = tenancyPath(next, "licence_copy"), c = await context(env, p);
  assert.match(c.blocked, /another tenancy is in place/i);
  assert.equal((await save(env, p, { revision: 0, source_version: c.source_version })).status, 409);
  assert.equal(n(env, "SELECT COUNT(*) n FROM rental_emails"), 0);
  assert.equal((await context(env, tenancyPath(t, "licence_copy"))).blocked, null, "the tenancy in place still can");
});

test("the landlord is told at step +10, and the step is marked done only once Gmail accepted it", async () => {
  const env = world();
  const { t } = await home(env);
  const p = tenancyPath(t, "landlord_arrears");
  owe(env, t, 8);
  assert.match((await context(env, p)).blocked, /10 days after/);
  run(env, "DELETE FROM charges");
  owe(env, t, 12);
  const c = await context(env, p);
  assert.equal(c.blocked, null);
  assert.deepEqual(c.recipient, { name: "Anne Owner", email: OWNER, party: "landlord" });
  assert.match(c.proposed_text, /^Dear Anne Owner,/);
  assert.match(c.proposed_text, /£1,500\.00 is owed/);
  assert.doesNotMatch(c.proposed_text, /Tom Tenant|tom@tenant|HE-T\d/, "no tenant contact details or payment reference");
  await queued(env, p);
  assert.equal(outbound(env)[0].template, "landlord_arrears_notice");
  assert.equal(n(env, "SELECT COUNT(*) n FROM arrears_steps"), 0, "queued is not done");
  // Review 26-nov: a text is good for its own day only (more rent falls due with no new row): a day later, not claimed.
  const ver = row(env, "SELECT source_version v FROM rental_emails").v;
  run(env, `UPDATE rental_emails SET source_version = replace(source_version, '"' || date('now') || '"', '"' || date('now', '-1 day') || '"')`);
  assert.notEqual(row(env, "SELECT source_version v FROM rental_emails").v, ver, "the day is part of the source");
  assert.equal(await nextEmail(env), null, "written on another day");
  run(env, "UPDATE rental_emails SET source_version = ?", ver);
  // A payment meanwhile changes what is owed: not claimed.
  run(env, "INSERT INTO payments (tenancy_id, received_on, amount, kind, source, created_at) VALUES (?, ?, 10000, 'rent', 'manual', ?)", t, T, TS());
  assert.equal(await nextEmail(env), null, "what is owed changed");
  await rentalEmailPass(env);
  await queued(env, p, {});
  const e = await nextEmail(env);
  assert.equal(e.to, OWNER);
  ok(await result(env, e, "sent", { message_id: "m-2" }));
  await rentalEmailPass(env);
  const step = row(env, "SELECT * FROM arrears_steps");
  assert.deepEqual([step.step, step.charge_due_on], ["landlord", ago(12)]);
  assert.ok(step.note.includes(e.ref));
  await rentalEmailPass(env);
  assert.equal(n(env, "SELECT COUNT(*) n FROM arrears_steps"), 1);
  // The landlord's email changed after approval: not claimed.
  const other = world(), h = await home(other);
  owe(other, h.t, 12);
  await queued(other, tenancyPath(h.t, "landlord_arrears"));
  run(other, "UPDATE landlords SET email = 'someone@else.example.test'");
  assert.equal(await nextEmail(other), null, "recipient is no longer the landlord's email");
});

test("the rent notice goes to the tenant with the change's facts only, and is recorded in the history once accepted", async () => {
  const env = world();
  const { t } = await home(env);
  const p = tenancyPath(t, "rent_notice");
  assert.match((await context(env, p)).blocked, /No rent change/);
  ok(await req(env, "POST", `/admin/tenancies/${t}/rent`, { rent: 1550, effective_on: ahead(70) }));
  const c = await context(env, p);
  assert.ok(c.warnings.length > 0, "the person approving sees why ADM-15's draft is internal");
  assert.doesNotMatch(c.proposed_text, /RPI|limit|DRAFT/i);
  await queued(env, p);
  const e = await nextEmail(env);
  ok(await result(env, e, "sent", { message_id: "m-3" }));
  // The clock settles it (jobs.js, with its own switch).
  await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() }, { DB: env.DB, MEDIA: env.MEDIA, HERMES_MAIL_READY: "1",
    ADM11_CALENDAR_READY: "1", AUT24_TENANT_DOCS_READY: "1" }, { waitUntil() {} });
  const ev = JSON.parse(row(env, "SELECT data FROM rental_events WHERE type = 'rental_email.sent'").data);
  assert.deepEqual([ev.kind, ev.by, typeof ev.rent_change_id], ["rent_notice", "gmail", "number"]);
});

test("no bank details and no other tenant's data in what is sent", async () => {
  assert.ok(bankDetails("Sort code 12-34-56, account 12345678"));
  assert.ok(bankDetails("IBAN GB29 NWBK 6016 1331 9268 19"));
  assert.ok(!bankDetails("The rent due on 1 November 2026 is £1,500.00. Reference HE-T0001."));
  const env = world();
  const a = await home(env);
  // Another property of the same landlord, with another tenant.
  const other = ok(await req(env, "POST", "/admin/rentals", { landlord_id: a.l, address: "9 Other Road", parish: "St Helier",
    service: "full", fee_percent: 10 }), 201).rental.id;
  ok(await req(env, "POST", `/admin/rentals/${other}/tenancies`, { tenant_name: "Ursula Unrelated", tenant_email: "ursula@example.test",
    kind: "periodic", regime: "2025", rent: 2000, start_on: ago(20), due_day: 1, deposit: 2000, deposit_received_on: ago(20),
    collect_from: ahead(365) }), 201);
  owe(env, a.t, 12);
  ok(await req(env, "POST", `/admin/tenancies/${a.t}/rent`, { rent: 1550, effective_on: ahead(70) }));
  for (const p of [docPath(a.r, "licence_copy"), docPath(a.r, "eicr_copy"), docPath(a.r, "deposit_info"), tenancyPath(a.t, "rent_notice"),
    tenancyPath(a.t, "landlord_arrears")]) {
    const c = await context(env, p);
    assert.equal(c.blocked, null, p);
    assert.doesNotMatch(c.proposed_text, /Ursula|ursula@|9 Other Road|2,000/, p);
    assert.doesNotMatch(c.proposed_text, /\b\d{8}\b|\b\d{2}-\d{2}-\d{2}\b/, p);
  }
  const p = docPath(a.r, "deposit_info"), c = await context(env, p);
  assert.match(c.proposed_text, /£1,500 on .*protected on .*reference DPS-REF-1/s);
  const r = await save(env, p, { revision: 0, source_version: c.source_version, text: `${c.proposed_text}\n\nPay to sort code 12-34-56, account 12345678.` });
  assert.equal(r.status, 400);
  assert.match(r.data.fields.text, /bank account details/);
  assert.equal(n(env, "SELECT COUNT(*) n FROM rental_emails"), 0);
});

test("migration 0128 only adds a table and its index; both workers carry the same switch, off", () => {
  const sql = readFileSync(new URL("../../migrations/0128_rental_emails.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  assert.deepEqual([...sql.matchAll(/^\s*(CREATE|ALTER|DROP|UPDATE|DELETE|INSERT)\s+(\w+)/gim)].map(m => `${m[1]} ${m[2]}`.toUpperCase()),
    ["CREATE TABLE", "CREATE INDEX"]);
  const flag = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(/^AUT24_TENANT_DOCS_READY = "([01])"$/m)?.[1];
  assert.equal(flag("wrangler.toml"), "0");
  assert.equal(flag("jobs/wrangler.toml"), "0");
});
