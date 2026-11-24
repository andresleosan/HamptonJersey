// AGE-05 (M06): the shared enquiry goes out by email only for a contact a person chose and a version a person approved,
// once, through the app's email pipeline (AUT-17), and never while that pipeline is off. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./listing-client.mjs";
import { configure } from "./email-helpers.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { extractFeatures } from "../../server/listing-features.js";
import worker from "../../server/jobs.js";
import { emailPass as liveEmailPass } from "../../server/email.js";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
const HOME = "HE-R001", DESK = "desk@agency.example.test";
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body, email = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(email) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

// send: AGE-05's own switch. service: the email service of AUT-17, simulated (in production it is off).
function world({ send = true, service = false, schema } = {}) {
  const env = makeEnv(schema);
  Object.assign(env, { AGE03_ENQUIRIES_READY: "1", EST16_AVAILABILITY_READY: "1", EST15_UNAVAILABILITY_READY: "1" });
  if (send) env.AGE05_SEND_READY = "1";
  if (service) {
    env.EMAIL_SERVICE_READY = "true";
    env.sent = [];
    env.EMAIL = { async send(message) { env.sent.push(message); return { messageId: `provider-${env.sent.length}` }; } };
    configure(env, { summary: false, recipients: [] });
    sender(env);
  }
  seedListing(env, { id: HOME, title: `Fixture home ${HOME}`, operation: "rent", availability: "to_let", rent: 1800, rent_period: "month", sale_price: null,
    bedrooms: 2, bathrooms: 2, housing_category: "registered", matchable: 1, ...extractFeatures({ description: "Parking for two cars" }),
    parish: "St Helier", location: "St Helier", road_name: "Rue de la Fixture" });
  return env;
}
// What the clock writes on each tick about the app's email sender (server/email.js emailPass): here, running just now.
const sender = (env, ready = true, at = new Date().toISOString()) => run(env, `INSERT INTO app_settings (key, value, updated_at, updated_by)
  VALUES ('email_worker', ?, ?, 'system') ON CONFLICT (key) DO UPDATE SET value = excluded.value`, JSON.stringify({ at, ready }), at);
let people = 0;
async function searching(env, name) {
  const n = ++people;
  const c = run(env, "INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    name, `age05-${n}@example.test`, `+4477009002${String(n).padStart(2, "0")}`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), operation: "rent", stage: "searching", source: "phone", budget_max: 2000, bedrooms_min: 2,
    parking_spaces: 2, pets: '[{"kind":"none"}]', household_adults: 2, household_children: 1, household_total: 3, created_at: T0, updated_at: T0,
    requirement_priorities: JSON.stringify({ version: 1, values: { budget: "must", bedrooms: "must", parking: "must" }, unknown: [] }) };
  const cols = Object.keys(a);
  const id = Number(run(env, `INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...Object.values(a)).lastInsertRowid);
  await recomputeForApplicant(env, id, "system");
  return id;
}
const shortlist = async (env, a) => ok(await req(env, "PUT",
  `/admin/matches/${row(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = ?", a, HOME).id}`, { status: "shortlisted", from: "found" })).match.id;
// An agency with a desk that has an email and a phone, a mobile with a phone only, and a name with no way to reach it.
const CONTACTS = [{ name: "Agency Desk", email: DESK, phones: [{ label: "Office", number: "01534 000000" }] },
  { name: "Agency Mobile", email: "", phones: [{ label: "Mobile", number: "07700 900555" }] }, { name: "No Channel", email: "", phones: [] }];
const agencyBody = (contacts = CONTACTS, name = "Fixture Agency") => ({ name, kind: "agency", channels: [], source_ids: [], listing_ids: [HOME], commission: "",
  photo_permission: "", contacts });
const advertiser = async (env, contacts, name) => ok(await req(env, "POST", "/admin/advertisers", agencyBody(contacts, name)), 201).advertiser.id;
const offer = async (env, m) => ok(await req(env, "GET", `/admin/matches/${m}/consultation`));
const post = (env, id, action, body, email) => req(env, "POST", `/admin/consultations/${id}/${action}`, body, email);
const shown = async env => ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`)).consultations[0];
const task = env => row(env, "SELECT title, resolved_at FROM notifications WHERE task_key LIKE 'consultation:%'");
// The clock (hampton-jobs) has its own vars: of the panel's switches, only AGE05_SEND_READY (jobs/wrangler.toml).
const tick = (env, clock = {}) => worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() }, { DB: env.DB, MEDIA: env.MEDIA,
  EMAIL: env.EMAIL, EMAIL_SERVICE_READY: env.EMAIL_SERVICE_READY, AGE05_SEND_READY: env.AGE05_SEND_READY, ...clock }, { waitUntil() {} });
// An enquiry prepared for one approved match, to the desk's email, and approved to be sent as it is.
// household: the text states this search's household size. by: who approves it.
async function approved(env, { approve = true, household = false, by = ADMIN } = {}) {
  const agency = await advertiser(env), ana = await searching(env, "Ana Le Gros"), m = await shortlist(env, ana);
  const desk = (await offer(env, m)).advertisers[0].contacts.find(c => c.email).key;
  const c = ok(await req(env, "POST", `/admin/matches/${m}/consultation`, { operation_id: randomUUID(), kind: "general", advertiser_id: agency,
    contact_key: desk, ...(household && { include_occupants: true }) }), 201).consultation;
  if (approve) ok(await post(env, c.id, "approve-sending", { revision: 1 }, by));
  return { id: c.id, agency, desk, ana, m };
}

test("switched off, without EST-15 or before migration 0080, enquiries are as AGE-03 left them", async () => {
  for (const [label, env] of [["off", world({ send: false })], ["before 0080", world({ schema: { through: 79 } })],
    ["EST-15 off", Object.assign(world(), { EST15_UNAVAILABILITY_READY: "0" })]]) {
    const agency = await advertiser(env), m = await shortlist(env, await searching(env, "Ana Le Gros")), found = await offer(env, m);
    assert.equal("send" in found, false, label);
    assert.ok(found.advertisers[0].contacts.every(c => !("key" in c)), label);
    const made = ok(await req(env, "POST", `/admin/matches/${m}/consultation`,
      { operation_id: randomUUID(), kind: "general", advertiser_id: agency, contact_key: "a".repeat(64) }), 201).consultation;
    for (const k of ["contact", "approval", "email_ref"]) assert.equal(k in made, false, `${label}: ${k}`);
    for (const action of ["approve-sending", "send-email"])
      assert.equal((await post(env, made.id, action, { revision: 1, sent: true })).status, 404, `${label}: ${action}`);
    // Closing what was queued or left unconfirmed while it was on stays possible after 0080; here there is nothing to close.
    for (const action of ["email-outcome", "return-to-manual"])
      assert.equal((await post(env, made.id, action, { revision: 1, sent: true, operation_id: randomUUID() })).status,
        label === "before 0080" ? 404 : 409, `${label}: ${action}`);
    const saved = ok(await req(env, "PUT", `/admin/consultations/${made.id}`, { revision: 1, advertiser_id: agency, occupants_match_id: null, contact_key: "a".repeat(64) }));
    assert.equal(saved.consultation.revision, 2);
    assert.equal("send" in ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`)), false, label);
    assert.equal(row(env, "SELECT * FROM consultations").contact_key ?? null, null, label);
    const done = ok(await post(env, made.id, "manual-send", { operation_id: randomUUID(), revision: 2, sent_at: new Date().toISOString(), via: "phone",
      evidence_ref: "Call note FIXTURE-EVIDENCE" }));
    assert.equal(done.consultation.status, "sent");
    assert.equal(rows(env, "SELECT 1 FROM outbound").length, 0);
  }
});

test("migration 0080 only adds empty columns to the enquiries already there", () => {
  const sql = readFileSync(new URL("../../migrations/0080_consultation_send.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  assert.ok(sql.split(";").map(s => s.trim()).filter(Boolean).every(s => /^ALTER TABLE consultations ADD COLUMN \w+ (TEXT|INTEGER)$/.test(s)), "ADD COLUMN only");
  const env = world({ schema: { through: 79 } });
  run(env, "INSERT INTO advertisers (name, kind, details, activity_on, created_at, updated_at, updated_by) VALUES ('A', 'agency', '{}', '2026-11-01', ?, ?, 'x')", T0, T0);
  run(env, `INSERT INTO consultations (kind, listing_id, operation, scope_key, status, advertiser_id, body, asks_availability, prepared_by, prepared_at, operation_id)
    VALUES ('general', ?, 'rent', 'general:x', 'manual_pending', 1, 'Text', 1, ?, ?, 'op-1')`, HOME, ADMIN, T0);
  const before = row(env, "SELECT * FROM consultations");
  env.DB.raw.exec(sql);
  assert.deepEqual(row(env, "SELECT * FROM consultations"),
    { ...before, contact_key: null, approved_revision: null, approved_by: null, approved_at: null, email_ref: null });
  assert.equal(env.DB.raw.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("a contact of the advertiser is chosen by reference: the enquiry keeps no copy of its address", async () => {
  const env = world(), agency = await advertiser(env), other = await advertiser(env, [{ name: "Other Desk", email: "other@agency.example.test", phones: [] }], "Other Agency");
  const m = await shortlist(env, await searching(env, "Ana Le Gros")), found = await offer(env, m);
  // Only the contacts that can be reached are offered, each with its reference.
  const [desk, mobile, none] = found.advertisers.find(a => a.id === agency).contacts;
  assert.match(desk.key, /^[0-9a-f]{64}$/);
  assert.match(mobile.key, /^[0-9a-f]{64}$/);
  assert.equal("key" in none, false, "a contact with no email and no phone cannot be chosen");
  assert.notEqual(desk.key, mobile.key);
  const theirs = found.advertisers.find(a => a.id === other).contacts[0].key;
  const make = contact_key => req(env, "POST", `/admin/matches/${m}/consultation`, { operation_id: randomUUID(), kind: "general", advertiser_id: agency, contact_key });
  assert.equal((await make(theirs)).status, 400, "a contact of another advertiser");
  assert.equal((await make("nope")).status, 400);
  const made = ok(await make(desk.key), 201).consultation;
  assert.deepEqual([made.contact.name, made.contact.email, made.approval, made.email_ref, made.blocked], ["Agency Desk", DESK, null, null, null]);
  const kept = JSON.stringify(rows(env, "SELECT * FROM consultations")) + JSON.stringify(rows(env, "SELECT * FROM events WHERE type LIKE 'consultation.%'"));
  for (const copy of [DESK, "agency.example", "Agency Desk", "01534"]) assert.ok(!kept.includes(copy), `no copy of ${copy}`);
  assert.equal(row(env, "SELECT contact_key FROM consultations").contact_key, desk.key);

  // Another contact, or none, is another version; a contact of another advertiser is refused.
  const put = body => req(env, "PUT", `/admin/consultations/${made.id}`, { advertiser_id: agency, occupants_match_id: null, ...body });
  assert.equal((await put({ revision: 1, contact_key: theirs })).status, 400);
  const phone = ok(await put({ revision: 1, contact_key: mobile.key })).consultation;
  assert.deepEqual([phone.revision, phone.contact.name, phone.contact.email], [2, "Agency Mobile", ""]);
  assert.equal(ok(await put({ revision: 2 })).consultation.contact, null);
  ok(await put({ revision: 3, contact_key: desk.key }));

  // The desk gets another address in the directory: the reference no longer answers, and nothing goes out to it.
  const record = ok(await req(env, "GET", `/admin/advertisers/${agency}`)).advertiser;
  ok(await req(env, "PUT", `/admin/advertisers/${agency}`, { ...agencyBody([{ ...CONTACTS[0], email: "new-desk@agency.example.test" }]), version: record.version }));
  const lost = await shown(env);
  assert.deepEqual(lost.contact, { missing: true });
  assert.match(lost.blocked, /contact/i);
  assert.equal((await post(env, made.id, "approve-sending", { revision: 4 })).status, 409);
  assert.equal((await post(env, made.id, "manual-send", { operation_id: randomUUID(), revision: 4, sent_at: new Date().toISOString(), via: "phone",
    evidence_ref: "Call note FIXTURE-EVIDENCE" })).status, 409);
  const again = (await offer(env, m)).advertisers.find(a => a.id === agency).contacts[0].key;
  assert.notEqual(again, desk.key);
  assert.equal(ok(await put({ revision: 4, contact_key: again })).consultation.blocked, null);
  // The advertiser's personal data is removed (AGE-14): the recipient itself is gone, as in AGE-03.
  run(env, "UPDATE advertisers SET suppressed_at = ?, details = json_set(details, '$.contacts', json('[]')) WHERE id = ?", T0, agency);
  const removed = await shown(env);
  assert.equal(removed.recipient.removed, true);
  assert.match(removed.blocked, /removed/i);
});

test("nothing goes out without a person's approval of exactly this version", async () => {
  const env = world({ service: true }), { id, agency, desk, m } = await approved(env, { approve: false });
  const mobile = (await offer(env, m)).advertisers[0].contacts[1].key;
  const refused = await post(env, id, "send-email", { revision: 1 });
  assert.equal(refused.status, 409, JSON.stringify(refused.data));
  assert.match(refused.data.error, /approve/i);
  await tick(env);
  assert.deepEqual([rows(env, "SELECT 1 FROM outbound").length, env.sent.length], [0, 0]);

  assert.equal((await post(env, id, "approve-sending", { revision: 7 })).status, 409, "the version read must be the current one");
  assert.equal((await post(env, id, "approve-sending", {})).status, 400);
  assert.equal((await call(env, "POST", `/admin/consultations/${id}/approve-sending`, { body: { revision: 1 } })).status, 401);
  const first = ok(await post(env, id, "approve-sending", { revision: 1 }, OTHER)).consultation;
  assert.deepEqual([first.approval.by, first.status, first.revision], [OTHER, "manual_pending", 1]);
  assert.ok(first.approval.at);
  // A second person approving the same version shares the first approval.
  assert.equal(ok(await post(env, id, "approve-sending", { revision: 1 })).consultation.approval.by, OTHER);
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'consultation.send_approved'").length, 1);
  assert.deepEqual(row(env, "SELECT approved_revision, approved_by FROM consultations"), { approved_revision: 1, approved_by: OTHER });

  // Save changes is another version: the approval does not cover it, whatever was changed.
  const put = body => req(env, "PUT", `/admin/consultations/${id}`, { advertiser_id: agency, occupants_match_id: null, ...body });
  const changed = ok(await put({ revision: 1, contact_key: desk })).consultation;
  assert.deepEqual([changed.revision, changed.approval], [2, null]);
  assert.equal((await post(env, id, "send-email", { revision: 2 })).status, 409);
  assert.equal((await post(env, id, "send-email", { revision: 1 })).status, 409, "nor the version that was approved, which is no longer the enquiry");
  // A contact with a phone only is for a person to call: there is nothing to approve for the app.
  ok(await put({ revision: 2, contact_key: mobile }));
  const phone = await post(env, id, "approve-sending", { revision: 3 });
  assert.equal(phone.status, 409, JSON.stringify(phone.data));
  assert.match(phone.data.error, /email/i);
  ok(await put({ revision: 3 }));
  assert.equal((await post(env, id, "approve-sending", { revision: 4 })).status, 409, "no contact chosen");
  // What blocks the enquiry blocks its approval: here, a price changed after the match was approved.
  ok(await put({ revision: 4, contact_key: desk }));
  run(env, "UPDATE listings SET rent = 1700 WHERE id = ?", HOME);
  assert.equal((await post(env, id, "approve-sending", { revision: 5 })).status, 409);
  assert.deepEqual([rows(env, "SELECT 1 FROM outbound").length, env.sent.length], [0, 0]);
});

test("with the email service off, as in production, nothing is queued and the enquiry stays to send manually", async () => {
  const env = world(), { id } = await approved(env);
  const found = ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`));
  assert.match(found.send.email_stop, /not switched on/i);
  assert.deepEqual([found.consultations[0].status, found.consultations[0].approval.by], ["manual_pending", ADMIN]);
  const refused = await post(env, id, "send-email", { revision: 1 });
  assert.equal(refused.status, 409, JSON.stringify(refused.data));
  assert.match(refused.data.error, /not switched on/i);
  await tick(env);
  assert.equal(rows(env, "SELECT 1 FROM outbound").length, 0);
  assert.deepEqual(row(env, "SELECT status, sent_at, email_ref FROM consultations"), { status: "manual_pending", sent_at: null, email_ref: null });
  assert.equal(task(env).resolved_at, null, "the Inbox task still asks a person to send it");
  // The service set up but email sending not enabled by the team in its settings: the same.
  const half = world({ service: true }), other = await approved(half);
  configure(half, { enabled: false, summary: false, recipients: [] });
  assert.match((await post(half, other.id, "send-email", { revision: 1 })).data.error, /switched off/i);
  assert.equal(rows(half, "SELECT 1 FROM outbound").length, 0);
  // The manual channel is as before.
  const done = ok(await post(env, id, "manual-send", { operation_id: randomUUID(), revision: 1, sent_at: new Date().toISOString(), via: "phone",
    evidence_ref: "Call note FIXTURE-EVIDENCE" })).consultation;
  assert.deepEqual([done.status, done.sent_via, done.email_ref], ["sent", "phone", null]);
});

test("two people and a retry send one email, traced on the enquiry, with nothing about any client in it", async () => {
  const env = world({ service: true }), { id, agency, desk, ana } = await approved(env);
  assert.equal(ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`)).send.email_stop, null);
  const all = await Promise.all([post(env, id, "send-email", { revision: 1 }), post(env, id, "send-email", { revision: 1 }, OTHER),
    post(env, id, "send-email", { revision: 1 })]);
  for (const r of all) assert.equal(ok(r).consultation.status, "queued");
  const [queued] = rows(env, "SELECT * FROM outbound");
  assert.equal(rows(env, "SELECT 1 FROM outbound").length, 1, "one email queued");
  assert.deepEqual([queued.template, queued.entity_id, queued.version, queued.recipient, queued.status, queued.approved_by], ["enquiry", String(id), 1, DESK, "queued", ADMIN]);
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'consultation.email_queued'").length, 1);
  assert.deepEqual(row(env, "SELECT status, sent_at, email_ref FROM consultations"), { status: "queued", sent_at: null, email_ref: queued.ref });
  assert.deepEqual(task(env), { title: "Enquiry email queued", resolved_at: null }, "open until the email is sent");
  // While it waits it is neither changed nor recorded as sent by hand.
  assert.equal((await req(env, "PUT", `/admin/consultations/${id}`, { revision: 1, advertiser_id: agency, occupants_match_id: null })).status, 409);
  assert.equal((await post(env, id, "manual-send", { operation_id: randomUUID(), revision: 1, sent_at: new Date().toISOString(), via: "email",
    evidence_ref: "Call note FIXTURE-EVIDENCE" })).status, 409);

  await tick(env);
  assert.equal(env.sent.length, 1);
  const [mail] = env.sent, said = JSON.stringify(mail);
  assert.equal(mail.to, DESK);
  assert.equal(mail.text, row(env, "SELECT body FROM consultations").body);
  assert.ok(mail.subject.includes(HOME) && mail.subject.includes(`[HE-OUT-${queued.ref}]`), mail.subject);
  for (const secret of ["Ana", "Le Gros", "age05-", "7700900", "2000", "2,000", "1800", "1,800", "Rue de la Fixture", ADMIN, OTHER])
    assert.ok(!said.includes(secret), `no ${secret} in the email`);
  const sent = await shown(env);
  assert.deepEqual([sent.status, sent.sent_via, sent.email_ref, sent.approval.by, sent.contact.key, sent.revision], ["sent", "email", queued.ref, ADMIN, desk, 1]);
  assert.equal(sent.sent_at, row(env, "SELECT updated_at FROM outbound").updated_at, "sent when the provider accepted it");
  assert.equal(row(env, "SELECT status, message_id FROM outbound").message_id, "provider-1");
  assert.ok(task(env).resolved_at);
  // Sent is sent: more clicks and more ticks send nothing else.
  assert.equal(ok(await post(env, id, "send-email", { revision: 1 }, OTHER)).consultation.status, "sent");
  await tick(env); await tick(env);
  assert.deepEqual([env.sent.length, rows(env, "SELECT 1 FROM outbound").length], [1, 1]);
  assert.equal((await post(env, id, "approve-sending", { revision: 1 })).status, 409);
  // Its events name the enquiry and the email by their ids only.
  const events = rows(env, "SELECT type, actor, data FROM events WHERE type LIKE 'consultation.%' ORDER BY id");
  assert.deepEqual(events.map(e => e.type), ["consultation.prepared", "consultation.send_approved", "consultation.email_queued", "consultation.sent_by_email"]);
  assert.deepEqual(JSON.parse(events[3].data), { version: 1, consultation_id: id, consultation_revision: 1, email_ref: queued.ref });
  for (const copy of [DESK, "Agency Desk", "Ana", "Fixture home"]) assert.ok(!JSON.stringify(events).includes(copy), `no ${copy} in events`);
  const card = ok(await req(env, "GET", `/admin/applicants/${ana}/matches?status=shortlisted`)).matches[0];
  assert.deepEqual([card.enquiry.status, card.enquiry.sent_via], ["sent", "email"]);
});

test("Pause all outbound holds the enquiry: nothing is queued while paused, and a queued email waits", async () => {
  const env = world({ service: true }), { id } = await approved(env);
  ok(await req(env, "POST", "/admin/outbound/pause", {}));
  assert.match(ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`)).send.email_stop, /paused/i);
  const refused = await post(env, id, "send-email", { revision: 1 });
  assert.equal(refused.status, 409, JSON.stringify(refused.data));
  assert.equal(rows(env, "SELECT 1 FROM outbound").length, 0);
  // Paused after it was queued: it waits, unsent, and goes out once when sending resumes.
  run(env, "DELETE FROM app_settings WHERE key = 'outbound'");
  ok(await post(env, id, "send-email", { revision: 1 }));
  ok(await req(env, "POST", "/admin/outbound/pause", {}));
  await tick(env); await tick(env);
  assert.deepEqual([env.sent.length, (await shown(env)).status, row(env, "SELECT sent_at FROM consultations").sent_at], [0, "queued", null]);
  run(env, "DELETE FROM app_settings WHERE key = 'outbound'");
  await tick(env); await tick(env);
  assert.deepEqual([env.sent.length, (await shown(env)).status], [1, "sent"]);
});

test("a queued enquiry is checked again just before it goes: what blocks it takes it out of the queue, unsent", async () => {
  const changes = {
    "the property is confirmed as not available": async env => ok(await req(env, "POST", `/admin/listings/${HOME}/availability`, { status: "unavailable", reason: "let",
      confirmed_at: new Date(Date.now() - 60000).toISOString(), source: "agency", channel: "phone", evidence_ref: "Call note FIXTURE-EVIDENCE", scope: "property" }), 201),
    "the price changes after the approval": env => run(env, "UPDATE listings SET rent = 1700 WHERE id = ?", HOME),
    "the search is resolved": async (env, { ana }) => ok(await req(env, "POST", `/admin/applicants/${ana}/search`, { state: "resolved", reason: "Found a home elsewhere",
      updated_at: row(env, "SELECT updated_at FROM applicants WHERE id = ?", ana).updated_at })),
    "the recipient's personal data is removed": (env, { agency }) => run(env,
      "UPDATE advertisers SET suppressed_at = ?, details = json_set(details, '$.contacts', json('[]')) WHERE id = ?", T0, agency),
    "the contact's address changes": (env, { agency }) => run(env,
      "UPDATE advertisers SET details = json_set(details, '$.contacts[0].email', 'new-desk@agency.example.test') WHERE id = ?", agency),
  };
  for (const [label, change] of Object.entries(changes)) {
    const env = world({ service: true }), made = await approved(env);
    ok(await post(env, made.id, "send-email", { revision: 1 }));
    await change(env, made);
    await tick(env);
    assert.equal(env.sent.length, 0, label);
    const c = await shown(env);
    assert.deepEqual([c.status, c.revision, c.approval, c.email_ref, c.sent_at], ["manual_pending", 2, null, null, null], label);
    assert.ok(c.blocked, label);
    assert.equal(row(env, "SELECT status FROM outbound").status, "cancelled", label);
    assert.deepEqual([task(env).title, task(env).resolved_at], ["Send enquiry manually", null], label);
    assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'consultation.email_not_sent'").length, 1, label);
    await tick(env);
    assert.equal(env.sent.length, 0, label);
  }
});

test("an uncertain result is never sent again by itself: a person checks it and says what happened", async () => {
  for (const wasSent of [true, false]) {
    const env = world({ service: true }), { id } = await approved(env);
    env.EMAIL.send = async message => { env.sent.push(message); throw new Error("connection lost after the request left"); };
    ok(await post(env, id, "send-email", { revision: 1 }));
    await tick(env); await tick(env); await tick(env);
    assert.equal(env.sent.length, 1, "one attempt, no retry");
    let c = await shown(env);
    assert.deepEqual([c.status, c.sent_at, row(env, "SELECT status FROM outbound").status], ["needs_review", null, "unknown"]);
    assert.deepEqual([task(env).title, task(env).resolved_at], ["Check enquiry email", null]);
    for (const action of ["send-email", "approve-sending"]) assert.equal((await post(env, id, action, { revision: 1 })).status, action === "send-email" ? 200 : 409);
    assert.equal(env.sent.length, 1);
    assert.equal((await post(env, id, "email-outcome", { revision: 1 })).status, 400);
    assert.equal((await post(env, id, "email-outcome", { revision: 9, sent: true })).status, 409);
    c = ok(await post(env, id, "email-outcome", { revision: 1, sent: wasSent }, OTHER)).consultation;
    if (wasSent) {
      assert.deepEqual([c.status, c.sent_via, c.revision], ["sent", "email", 1]);
      assert.equal(c.sent_at, row(env, "SELECT claimed_at FROM outbound").claimed_at, "when it was attempted");
      assert.ok(task(env).resolved_at);
    } else {
      assert.deepEqual([c.status, c.sent_at, c.revision, c.approval, c.email_ref], ["manual_pending", null, 2, null, null]);
      assert.deepEqual([task(env).title, task(env).resolved_at], ["Send enquiry manually", null]);
    }
    assert.equal((await post(env, id, "email-outcome", { revision: c.revision, sent: true })).status, 409, "answered once");
    const last = rows(env, "SELECT type, actor FROM events WHERE type LIKE 'consultation.%' ORDER BY id").at(-1);
    assert.deepEqual(last, { type: wasSent ? "consultation.email_confirmed" : "consultation.email_not_sent", actor: OTHER });
    await tick(env);
    assert.equal(env.sent.length, 1);
  }
});

test("a rejected email does not count as sent: the enquiry returns to a person, and a new version may be approved and sent", async () => {
  const env = world({ service: true }), { id } = await approved(env);
  env.EMAIL.send = async () => { throw Object.assign(new Error("rejected"), { code: "E_RECIPIENT_NOT_ALLOWED" }); };
  ok(await post(env, id, "send-email", { revision: 1 }));
  await tick(env);
  let c = await shown(env);
  assert.deepEqual([c.status, c.sent_at, c.revision, c.approval, c.email_ref], ["manual_pending", null, 2, null, null], "the two-day clock has not started");
  assert.equal(task(env).resolved_at, null);
  assert.deepEqual(JSON.parse(row(env, "SELECT data FROM events WHERE type = 'consultation.email_not_sent'").data).reason, "E_RECIPIENT_NOT_ALLOWED");
  // The version that failed is not sent again; the new one needs its own approval.
  assert.equal((await post(env, id, "send-email", { revision: 2 })).status, 409);
  env.EMAIL.send = async message => { env.sent.push(message); return { messageId: "provider-2" }; };
  ok(await post(env, id, "approve-sending", { revision: 2 }, OTHER));
  ok(await post(env, id, "send-email", { revision: 2 }, OTHER));
  await tick(env);
  c = await shown(env);
  assert.deepEqual([c.status, c.sent_via, c.approval.by, env.sent.length, rows(env, "SELECT 1 FROM outbound").length], ["sent", "email", OTHER, 1, 2]);
});

test("an address on the email suppression list is not queued", async () => {
  const env = world({ service: true }), { id } = await approved(env);
  ok(await req(env, "POST", "/admin/email/suppressions", { address: DESK }));
  const refused = await post(env, id, "send-email", { revision: 1 });
  assert.equal(refused.status, 409, JSON.stringify(refused.data));
  assert.match(refused.data.error, /suppression/i);
  assert.equal(rows(env, "SELECT 1 FROM outbound").length, 0);
});

// The pass before each dispatch is not what keeps an enquiry from going out: the claim itself asks again. Each change
// lands after that pass and just before the dispatcher picks its emails, inside one tick.
test("an enquiry email is claimed only if it is authorised at that moment, whatever the pass before saw", async () => {
  const later = () => new Date(Date.now() + 1000).toISOString();
  const changes = {
    "the price changes after the approval": env => run(env, "UPDATE listings SET rent = 1700 WHERE id = ?", HOME),
    "the search is resolved": (env, { ana }) => run(env, `UPDATE applicants SET search_state = 'resolved', resolved_at = ?, resolved_by = ?,
      resolution_reason = 'Found a home elsewhere' WHERE id = ?`, later(), ADMIN, ana),
    "the property is confirmed as not available": env => run(env, `INSERT INTO availability_confirmations (listing_id, status, reason,
      confirmed_at, source, channel, evidence_ref, recorded_at, recorded_by) VALUES (?, 'unavailable', 'let', ?, 'agency', 'phone', 'Call note FIXTURE', ?, ?)`,
      HOME, new Date().toISOString(), later(), ADMIN),
    "the property leaves the offer": env => run(env, "UPDATE listings SET availability = 'withdrawn' WHERE id = ?", HOME),
    "the recipient's personal data is removed": (env, { agency }) => run(env,
      "UPDATE advertisers SET suppressed_at = ?, details = json_set(details, '$.contacts', json('[]')) WHERE id = ?", T0, agency),
    "the recipient stops advertising the property": (env, { agency }) => run(env,
      "UPDATE advertisers SET details = json_set(details, '$.listing_ids', json('[]')) WHERE id = ?", agency),
    "the contact's address changes": (env, { agency }) => run(env,
      "UPDATE advertisers SET details = json_set(details, '$.contacts[0].email', 'new-desk@agency.example.test') WHERE id = ?", agency),
    "the contact is renamed (its reference no longer answers)": (env, { agency }) => run(env,
      "UPDATE advertisers SET details = json_set(details, '$.contacts[0].name', 'Front Desk'), updated_at = ? WHERE id = ?", later(), agency),
    "the property's title changes (the text is out of date)": env => run(env, "UPDATE listings SET title = 'Renamed home', updated_at = ? WHERE id = ?", later(), HOME),
    "the household stated changes": (env, { ana }) => run(env, "UPDATE applicants SET household_total = 5, updated_at = ? WHERE id = ?", later(), ana),
    "the approval is withdrawn": (env, { id }) => run(env, "UPDATE consultations SET approved_revision = NULL WHERE id = ?", id),
    "the approver is no longer a member of the team": env => run(env, "DELETE FROM admins WHERE email = ?", OTHER),
  };
  for (const [label, change] of Object.entries(changes)) {
    const env = world({ service: true }), made = await approved(env, { household: label.includes("household"), by: OTHER });
    ok(await post(env, made.id, "send-email", { revision: 1 }));
    const real = env.DB.prepare.bind(env.DB);
    let done = false;
    env.DB.prepare = sql => {
      if (!done && /SELECT id FROM outbound WHERE status='queued'/.test(sql)) { done = true; change(env, made); }
      return real(sql);
    };
    // A failing pass would also send nothing: it must not be what holds the email back.
    const failed = [], log = console.error;
    console.error = (...args) => failed.push(args.join(" "));
    try { await tick(env); } finally { console.error = log; env.DB.prepare = real; }
    assert.deepEqual(failed, [], `${label}: no pass failed`);
    assert.equal(done, true, `${label}: the change landed before the claim`);
    assert.equal(env.sent.length, 0, label);
    assert.equal(rows(env, "SELECT 1 FROM email_attempts").length, 0, `${label}: not even claimed`);
    // The pass after the dispatch finds it unsendable and gives it back to a person, unsent.
    const c = row(env, "SELECT status, sent_at, email_ref FROM consultations");
    assert.deepEqual([c.status, c.sent_at, c.email_ref], ["manual_pending", null, null], label);
    assert.equal(row(env, "SELECT status FROM outbound").status, "cancelled", label);
    await tick(env);
    assert.equal(env.sent.length, 0, label);
  }
});

test("the email pipeline claims no enquiry email unless it is given the enquiry check: other emails are as before", async () => {
  const env = world({ service: true }), { id } = await approved(env);
  ok(await post(env, id, "send-email", { revision: 1 }));
  configure(env, { summary: true, recipients: ["team@example.test"] });
  const ts = new Date().toISOString().slice(0, 10) + "T12:00:00.000Z";
  await liveEmailPass(env, ts, () => ts);
  assert.deepEqual(env.sent.map(m => m.to), ["team@example.test"], "the team summary goes, the enquiry does not");
  assert.equal(row(env, "SELECT status FROM outbound WHERE template = 'enquiry'").status, "queued");
  await tick(env);
  assert.deepEqual(env.sent.map(m => m.to), ["team@example.test", DESK], "with the check, the enquiry goes once");
});

test("before migration 0080, as production is today, the clock sends the team's email as before", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-16T12:00:00.000Z") });
  const env = world({ service: true, schema: { through: 79 } });
  configure(env, { summary: true, recipients: ["team@example.test"] });
  const failed = [], log = console.error;
  console.error = (...args) => failed.push(args.join(" "));
  try { await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() }, { DB: env.DB, MEDIA: env.MEDIA, EMAIL: env.EMAIL,
    EMAIL_SERVICE_READY: "true" }, { waitUntil() {} }); } finally { console.error = log; }
  assert.deepEqual(failed, []);
  assert.deepEqual(env.sent.map(m => m.to), ["team@example.test"], "the daily summary, at noon in Jersey");
});

const returned = (env, label) => {
  const c = row(env, "SELECT status, revision, sent_at, email_ref FROM consultations");
  assert.deepEqual([c.status, c.revision, c.sent_at, c.email_ref], ["manual_pending", 2, null, null], label);
  assert.deepEqual(task(env), { title: "Send enquiry manually", resolved_at: null }, `${label}: a person is asked again`);
};

test("switching AGE05_SEND_READY off is a brake: a queued email does not go, and its enquiry returns to manual sending", async () => {
  const env = world({ service: true }), { id } = await approved(env);
  ok(await post(env, id, "send-email", { revision: 1 }));
  delete env.AGE05_SEND_READY; // off in the panel and the clock
  await tick(env); await tick(env);
  assert.equal(env.sent.length, 0);
  returned(env, "switched off");
  assert.equal(row(env, "SELECT status FROM outbound").status, "cancelled");
  assert.equal(JSON.parse(row(env, "SELECT data FROM events WHERE type = 'consultation.email_not_sent'").data).reason, "switched_off");
  // Off in the clock alone is enough: the clock is the one that sends.
  const other = world({ service: true }), made = await approved(other);
  ok(await post(other, made.id, "send-email", { revision: 1 }));
  await tick(other, { AGE05_SEND_READY: undefined });
  assert.equal(other.sent.length, 0);
  returned(other, "off in the clock");
});

test("a queued email held by the pause, the settings or a stopped sender says why, keeps its Inbox task open, and a person can take it back", async () => {
  const holds = {
    "Pause all outbound": [env => req(env, "POST", "/admin/outbound/pause", {}), /paused/i],
    "Email settings": [env => configure(env, { enabled: false, summary: false, recipients: [] }), /switched off in Email settings/i],
    "the sender has stopped": [env => sender(env, false), /sender/i],
    "the sender has not run for an hour": [env => sender(env, true, new Date(Date.now() - 3600e3).toISOString()), /sender/i],
  };
  for (const [label, [hold, why]] of Object.entries(holds)) {
    const env = world({ service: true }), { id } = await approved(env);
    ok(await post(env, id, "send-email", { revision: 1 }));
    await hold(env);
    // A sender that has stopped is what the clock reports itself, so the ticks here are only the panel's reading.
    if (!label.startsWith("the sender")) { await tick(env); await tick(env); await tick(env); }
    assert.equal(env.sent.length, 0, label);
    const c = await shown(env);
    assert.equal(c.status, "queued", label);
    assert.match(c.held, why, label);
    assert.deepEqual(task(env), { title: "Enquiry email queued", resolved_at: null }, label);
    // Return to manual sending: once, by a person of the team, while the email has not been claimed.
    const back = { revision: 1, operation_id: randomUUID() };
    assert.equal((await post(env, id, "return-to-manual", { revision: 1 })).status, 400, label);
    assert.equal((await call(env, "POST", `/admin/consultations/${id}/return-to-manual`, { body: back })).status, 401, label);
    assert.equal((await post(env, id, "return-to-manual", { ...back, revision: 7 })).status, 409, label);
    const done = ok(await post(env, id, "return-to-manual", back, OTHER)).consultation;
    assert.deepEqual([done.status, done.revision, done.approval, done.email_ref], ["manual_pending", 2, null, null], label);
    returned(env, label);
    assert.equal(row(env, "SELECT status FROM outbound").status, "cancelled", label);
    assert.equal(ok(await post(env, id, "return-to-manual", back, OTHER)).consultation.revision, 2, `${label}: the same click again`);
    assert.equal((await post(env, id, "return-to-manual", { revision: 2, operation_id: randomUUID() })).status, 409, `${label}: nothing queued`);
    const events = rows(env, "SELECT actor, data FROM events WHERE type = 'consultation.email_not_sent'");
    assert.deepEqual([events.length, events[0].actor, JSON.parse(events[0].data).reason], [1, OTHER, "returned"], label);
    run(env, "DELETE FROM app_settings WHERE key = 'outbound'"); configure(env); sender(env);
    await tick(env);
    // From 08:00 Jersey the clock also sends the team's daily summary: only the enquiry's email counts here.
    assert.equal(env.sent.filter(m => m.to === DESK).length, 0, `${label}: the old approval never sends it later`);
  }
});

test("an email the sender has already claimed is not taken back", async () => {
  const env = world({ service: true }), { id } = await approved(env);
  ok(await post(env, id, "send-email", { revision: 1 }));
  run(env, "UPDATE outbound SET status = 'sending', claim_token = 'fixture', claimed_at = ?", new Date().toISOString());
  const refused = await post(env, id, "return-to-manual", { revision: 1, operation_id: randomUUID() });
  assert.equal(refused.status, 409, JSON.stringify(refused.data));
  assert.match(refused.data.error, /already being sent/i);
  assert.deepEqual([row(env, "SELECT status FROM consultations").status, row(env, "SELECT status FROM outbound").status], ["queued", "sending"]);
});

test("an approval expires: an email queued for more than a day goes back to a person instead of leaving", async () => {
  const env = world({ service: true }), { id } = await approved(env);
  ok(await post(env, id, "send-email", { revision: 1 }));
  ok(await req(env, "POST", "/admin/outbound/pause", {}));
  const old = new Date(Date.now() - 25 * 3600e3).toISOString();
  run(env, "UPDATE outbound SET created_at = ?", old);
  run(env, "UPDATE advertisers SET updated_at = ?", T0); // nothing else changed since it was queued
  run(env, "DELETE FROM app_settings WHERE key = 'outbound'");
  await tick(env);
  assert.equal(env.sent.length, 0);
  returned(env, "expired");
  assert.equal(JSON.parse(row(env, "SELECT data FROM events WHERE type = 'consultation.email_not_sent'").data).reason, "expired");
});

test("switched off, an email left unconfirmed can still be closed by a person", async () => {
  for (const wasSent of [true, false]) {
    const env = world({ service: true }), { id } = await approved(env);
    env.EMAIL.send = async message => { env.sent.push(message); throw new Error("connection lost"); };
    ok(await post(env, id, "send-email", { revision: 1 }));
    await tick(env);
    assert.equal(row(env, "SELECT status FROM consultations").status, "needs_review");
    delete env.AGE05_SEND_READY;
    await tick(env);
    assert.equal(row(env, "SELECT status FROM consultations").status, "needs_review", "the clock does not decide for a person");
    const c = ok(await post(env, id, "email-outcome", { revision: 1, sent: wasSent })).consultation;
    assert.equal(c.status, wasSent ? "sent" : "manual_pending");
    assert.equal(env.sent.length, 1);
  }
});

test("each AGE-05 module loads first without an import cycle", async () => {
  const { execFileSync } = await import("node:child_process");
  for (const m of ["consultations", "consultation-email", "email", "jobs", "routes/matches"])
    assert.equal(execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "-e",
      `await import(${JSON.stringify(new URL(`../../server/${m}.js`, import.meta.url).href)}); console.log("ok")`], { encoding: "utf8" }).trim(), "ok", m);
});

test("the website and the clock carry the same AGE05_SEND_READY, so switching it off stops what is queued", async () => {
  const { readFileSync } = await import("node:fs");
  const flag = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(/^AGE05_SEND_READY = "(.*)"$/m)?.[1];
  assert.ok(flag("wrangler.toml") !== undefined, "the website names the switch");
  assert.equal(flag("wrangler.toml"), flag("jobs/wrangler.toml"));
});

// AUT-17 (traído de AGE-06): a reply that came back by email, by Cloudflare or by Hermes's carrier (email_inbound linked to
// the enquiry's email or to Hermes's task for it), is shown on its enquiry so a person records the answer (AGE-06). It
// says when and what kind of reply, never its text or who sent it: those stay in Email. It records nothing by itself.
test("an email reply to the enquiry is shown on it, newest first, without its text; another email's is not", async () => {
  const env = world({ service: true }), { id } = await approved(env);
  env.AGE06_RESPONSES_READY = "1"; // replies are shown where an answer can be recorded
  ok(await post(env, id, "send-email", { revision: 1 }));
  await tick(env);
  assert.deepEqual((await shown(env)).replies, [], "nothing yet");
  const out = row(env, "SELECT id FROM outbound").id;
  const inbound = (key, at, extra = {}) => run(env, `INSERT INTO email_inbound (dedupe_key, sender, subject, text, html_only, truncated, received_at,
    outbound_id, mail_task_id, reply_kind) VALUES (?, ?, 'Re', 'Yes, still available.', 0, 0, ?, ?, ?, ?)`, key, DESK, at,
    extra.outbound ?? null, extra.task ?? null, extra.kind ?? null).lastInsertRowid;
  const first = inbound("a", "2026-11-24T10:00:00.000Z", { outbound: out, kind: "human" });
  const bounce = inbound("b", "2026-11-24T11:00:00.000Z", { outbound: out, kind: "bounce" });
  run(env, `INSERT INTO mail_tasks (kind, source_key, entity_id, listing_id, recipient_hash, status, result_at, gmail_thread_id, created_at, updated_at)
    VALUES ('availability', ?, ?, ?, 'h', 'sent', ?, 't1', ?, ?)`, `consultation:${id}`, id, HOME, T0, T0, T0);
  const viaHermes = inbound("c", "2026-11-24T12:00:00.000Z", { task: row(env, "SELECT id FROM mail_tasks").id, kind: "auto" });
  inbound("d", "2026-11-24T13:00:00.000Z"); // not linked to this enquiry
  const c = await shown(env);
  assert.deepEqual(c.replies, [{ id: Number(viaHermes), received_at: "2026-11-24T12:00:00.000Z", kind: "auto" },
    { id: Number(bounce), received_at: "2026-11-24T11:00:00.000Z", kind: "bounce" }, { id: Number(first), received_at: "2026-11-24T10:00:00.000Z", kind: "human" }]);
  assert.ok(!JSON.stringify(c.replies).includes("still available"));
  assert.equal(c.status, "sent", "a reply records nothing by itself");
  delete env.AGE06_RESPONSES_READY;
  assert.equal((await shown(env)).replies, undefined, "not without AGE-06");
});
