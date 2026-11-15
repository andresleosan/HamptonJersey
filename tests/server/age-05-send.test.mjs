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
  }
  seedListing(env, { id: HOME, title: `Fixture home ${HOME}`, operation: "rent", availability: "to_let", rent: 1800, rent_period: "month", sale_price: null,
    bedrooms: 2, bathrooms: 2, housing_category: "registered", matchable: 1, ...extractFeatures({ description: "Parking for two cars" }),
    parish: "St Helier", location: "St Helier", road_name: "Rue de la Fixture" });
  return env;
}
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
// The clock (hampton-jobs) has its own vars: none of the panel's switches are set there.
const tick = env => worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() },
  { DB: env.DB, MEDIA: env.MEDIA, EMAIL: env.EMAIL, EMAIL_SERVICE_READY: env.EMAIL_SERVICE_READY }, { waitUntil() {} });
// An enquiry prepared for one approved match, to the desk's email, and approved to be sent as it is.
async function approved(env, { approve = true } = {}) {
  const agency = await advertiser(env), ana = await searching(env, "Ana Le Gros"), m = await shortlist(env, ana);
  const desk = (await offer(env, m)).advertisers[0].contacts.find(c => c.email).key;
  const c = ok(await req(env, "POST", `/admin/matches/${m}/consultation`, { operation_id: randomUUID(), kind: "general", advertiser_id: agency, contact_key: desk }), 201).consultation;
  if (approve) ok(await post(env, c.id, "approve-sending", { revision: 1 }));
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
    for (const action of ["approve-sending", "send-email", "email-outcome"])
      assert.equal((await post(env, made.id, action, { revision: 1, sent: true })).status, 404, `${label}: ${action}`);
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
  assert.ok(task(env).resolved_at, "nobody is asked to send it manually meanwhile");
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
