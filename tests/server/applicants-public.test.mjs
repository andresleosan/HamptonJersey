import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";
import { OPTIONS } from "../../server/applicants.js";

// Turnstile stub: answers ok (or not) and counts how many tokens were spent.
const spent = { n: 0 };
const turnstile = ok => {
  spent.n = 0;
  globalThis.fetch = async () => { spent.n++; return new Response(JSON.stringify({ success: ok, hostname: "hampton.test" })); };
};
const form = (o = {}) => ({ operation: "rent", name: "Jane Le Brocq", email: "jane@example.je", phone: "+447797123456",
  budget_max: 2500, bedrooms_min: 2, parishes_wanted: ["St Helier"], pets: [{ kind: "dog", count: 1 }],
  preferred_channel: "whatsapp", privacy: true, marketing: false, turnstile: "tok", ...o });
const register = (env, body) => call(env, "POST", "/applicants", { body });
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a);
const contacts = env => rows(env, "SELECT * FROM contacts ORDER BY id");
const applicants = env => rows(env, "SELECT * FROM applicants ORDER BY id");
const events = env => rows(env, "SELECT * FROM events ORDER BY id").map(e => ({ ...e, data: e.data && JSON.parse(e.data) }));
const notices = env => rows(env, "SELECT * FROM notifications ORDER BY id");
const without = (row, ...keys) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
// A contact entered by the team, before any consent was recorded.
const panelContact = (env, o = {}) => Number(env.DB.raw.prepare(`INSERT INTO contacts (name, email, phone, privacy_ack_at,
  marketing_opt_in_at, consent_source, last_activity_at, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)`)
  .run(o.name ?? "Jane Le Brocq", o.email ?? null, o.phone ?? null, o.privacy_ack_at ?? null, o.marketing_opt_in_at ?? null,
    o.consent_source ?? null, T0, T0, T0, "luismadef45@gmail.com").lastInsertRowid);

test("GET /applicants/options returns the closed lists, cached for a day", async () => {
  const r = await call(makeEnv(), "GET", "/applicants/options");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "public, max-age=86400");
  assert.deepEqual(r.data, OPTIONS);
});

test("a new registration creates contact, applicant and notice", async () => {
  const env = makeEnv(); turnstile(true);
  const r = await register(env, form({ email: " Jane@Example.je", phone: "07797 123456", marketing: true }));
  assert.equal(r.status, 201);
  assert.deepEqual(r.data, { ok: true });
  assert.equal(spent.n, 1);

  const [c] = contacts(env);
  assert.equal(c.email, "jane@example.je");
  assert.equal(c.phone, "+447797123456");
  assert.equal(c.consent_source, "web");
  assert.equal(c.preferred_channel, "whatsapp");
  assert.ok(c.privacy_ack_at);
  assert.equal(c.marketing_opt_in_at, c.privacy_ack_at);
  assert.equal(c.last_activity_at, c.created_at);
  assert.equal(c.updated_by, "public");

  const [a] = applicants(env);
  assert.equal(a.contact_id, c.id);
  assert.equal(a.source, "web");
  assert.equal(a.stage, "new");
  assert.equal(a.operation, "rent");
  assert.equal(a.budget_max, 2500);
  assert.equal(a.pets, '[{"kind":"dog","count":1}]');

  const [e] = events(env);
  assert.deepEqual([e.actor, e.entity_type, e.entity_id, e.type], ["public", "applicant", String(a.id), "applicant.created"]);
  assert.deepEqual(e.data, { operation: "rent", source: "web" });
  const [n] = notices(env);
  assert.deepEqual([n.event_id, n.category, n.title, n.action_required, n.resolved_at],
    [e.id, "new_applicant", "New applicant: Jane Le Brocq · To Let", 1, null]);

  // Without the marketing tick: no opt-in on file.
  await register(env, form({ operation: "buy", name: "Tom Renouf", email: "tom@example.je", phone: "+447700900321",
    budget_max: 650000, pets: null }));
  const tom = contacts(env)[1];
  assert.equal(tom.marketing_opt_in_at, null);
  assert.equal(notices(env)[1].title, "New applicant: Tom Renouf · To Buy");
});

test("same email in other case, or same phone in another format, is a duplicate that changes nothing", async () => {
  const env = makeEnv(); turnstile(true);
  const first = await register(env, form());
  env.DB.raw.prepare("UPDATE contacts SET last_activity_at = ?").run(T0);
  const [c0] = contacts(env), [a0] = applicants(env);

  const byEmail = await register(env, form({ email: "Jane@Example.je ", phone: "+447700111222", operation: "buy",
    budget_max: 600000, pets: null, name: "Jane Smith" }));
  const byPhone = await register(env, form({ email: "jane.work@example.je", phone: "07797 123456", budget_max: 3000 }));
  // Same answer as a new registration: nothing tells whether the email is on file.
  for (const r of [byEmail, byPhone]) {
    assert.equal(r.status, first.status);
    assert.equal(JSON.stringify(r.data), JSON.stringify(first.data));
    assert.equal(r.headers.get("content-type"), first.headers.get("content-type"));
  }

  const [c1, ...moreContacts] = contacts(env), [a1, ...moreApplicants] = applicants(env);
  assert.deepEqual(moreContacts, []);
  assert.deepEqual(moreApplicants, []);
  assert.deepEqual(without(c1, "last_activity_at"), without(c0, "last_activity_at"));
  assert.deepEqual(a1, a0);
  assert.ok(c1.last_activity_at > T0, "the retention clock restarts");

  const dups = events(env).filter(e => e.type === "applicant.duplicate_submitted");
  assert.equal(dups.length, 2);
  for (const e of dups) assert.deepEqual([e.actor, e.entity_type, e.entity_id], ["public", "contact", String(c0.id)]);
  // The flat submission, as the panel's duplicate strip reads it; never the Turnstile token.
  assert.deepEqual(dups[0].data, { operation: "buy", name: "Jane Smith", email: "jane@example.je", phone: "+447700111222",
    preferred_channel: "whatsapp", budget_max: 600000, bedrooms_min: 2, parishes_wanted: ["St Helier"], privacy: true, marketing: false });
  assert.equal(dups[1].data.phone, "+447797123456");
  assert.deepEqual(dups[1].data.pets, [{ kind: "dog", count: 1 }]);
  assert.equal(dups[1].data.turnstile, undefined);
  assert.equal(dups[1].data.other_contact_id, undefined);
  assert.deepEqual(notices(env).slice(1).map(n => [n.event_id, n.category, n.title, n.action_required]),
    dups.map(e => [e.id, "new_applicant", "Jane Le Brocq registered again", 1]));
  // Consent was already as sent: no consent event.
  assert.equal(events(env).filter(e => e.type === "contact.consent_changed").length, 0);

  // The panel's notice link opens her search with that operation (server reads $.operation).
  const detail = await call(env, "GET", `/admin/applicants/${a0.id}`, { cookie: await adminCookie() });
  assert.deepEqual(detail.data.duplicates.map(d => d.active_search_id), [a0.id, null]);
});

test("email and phone of two different contacts: duplicate of the first, and the event says so", async () => {
  const env = makeEnv(); turnstile(true);
  const jane = panelContact(env, { email: "jane@example.je" });
  const other = panelContact(env, { name: "Jean Le Brocq", phone: "+447797123456" });
  assert.equal((await register(env, form())).status, 201);
  const [e] = events(env).filter(x => x.type === "applicant.duplicate_submitted");
  assert.equal(e.entity_id, String(jane));
  assert.equal(e.data.other_contact_id, other);
  assert.equal(applicants(env).length, 0);
});

test("the same person sent twice at once: the second becomes a duplicate, with the same answer", async () => {
  const env = makeEnv(); turnstile(true);
  const batch = env.DB.batch.bind(env.DB);
  // The other request creates the contact between this one's lookup and its write.
  let other;
  env.DB.batch = stmts => { other ??= panelContact(env, { phone: "+447797123456", privacy_ack_at: T0 }); return batch(stmts); };
  const r = await register(env, form());
  assert.deepEqual([r.status, r.data], [201, { ok: true }]);
  assert.equal(contacts(env).length, 1);
  assert.equal(applicants(env).length, 0);
  assert.deepEqual(events(env).map(e => [e.entity_id, e.type]), [[String(other), "applicant.duplicate_submitted"]]);
});

test("a contact deleted from the panel during a duplicate keeps no personal data in the new events", async () => {
  const env = makeEnv(); turnstile(true);
  const id = panelContact(env, { email: "jane@example.je", privacy_ack_at: T0 });
  const batch = env.DB.batch.bind(env.DB);
  // The permanent delete lands between the lookup and the write.
  env.DB.batch = stmts => { env.DB.raw.prepare("DELETE FROM contacts WHERE id = ?").run(id); return batch(stmts); };
  assert.equal((await register(env, form())).status, 201);
  assert.deepEqual(events(env).map(e => [e.entity_id, e.type, e.data]), [[String(id), "applicant.duplicate_submitted", null]]);
  assert.deepEqual(notices(env).map(n => n.title), ["Deleted applicant"]);
});

test("a duplicate without marketing withdraws the opt-in; with marketing it does not opt in", async () => {
  const env = makeEnv(); turnstile(true);
  await register(env, form({ marketing: true }));
  const [c0] = contacts(env);
  assert.ok(c0.marketing_opt_in_at);

  await register(env, form({ marketing: false }));
  const [c1] = contacts(env);
  assert.equal(c1.marketing_opt_in_at, null);
  assert.equal(c1.privacy_ack_at, c0.privacy_ack_at, "an acknowledgement on file keeps its date");
  assert.equal(c1.updated_by, "public");
  assert.ok(c1.updated_at >= c0.updated_at);
  let consent = events(env).filter(e => e.type === "contact.consent_changed");
  assert.deepEqual(consent.map(e => [e.actor, e.entity_type, e.entity_id, e.data]),
    [["public", "contact", String(c0.id), { before: { marketing_opt_in_at: c0.marketing_opt_in_at }, after: { marketing_opt_in_at: null } }]]);

  // Opting in again from the website waits for the team: it stays in the event only.
  await register(env, form({ marketing: true }));
  const [c2] = contacts(env);
  assert.equal(c2.marketing_opt_in_at, null);
  assert.equal(c2.updated_at, c1.updated_at);
  assert.equal(events(env).filter(e => e.type === "contact.consent_changed").length, 1);
  assert.equal(events(env).filter(e => e.type === "applicant.duplicate_submitted").at(-1).data.marketing, true);

  // A contact entered by the team without a privacy acknowledgement gets it, with the web as its source.
  const tom = panelContact(env, { name: "Tom Renouf", phone: "+447700900321", marketing_opt_in_at: T0, consent_source: null });
  await register(env, form({ name: "Tom Renouf", email: "tom@example.je", phone: "07700 900321" }));
  const t = contacts(env).find(x => x.id === tom);
  assert.ok(t.privacy_ack_at);
  assert.equal(t.consent_source, "web");
  assert.equal(t.marketing_opt_in_at, null);
  assert.equal(t.email, null, "the contact's details stay as they were");
  consent = events(env).filter(e => e.type === "contact.consent_changed" && e.entity_id === String(tom));
  assert.deepEqual(consent.map(e => e.data), [
    { before: { marketing_opt_in_at: T0 }, after: { marketing_opt_in_at: null } },
    { before: { privacy_ack_at: null }, after: { privacy_ack_at: t.privacy_ack_at } },
  ]);
  assert.equal(t.last_activity_at, t.privacy_ack_at);

  // A consent source already on file stays.
  const ann = panelContact(env, { name: "Ann", email: "ann@example.je", consent_source: "phone", marketing_opt_in_at: T0 });
  await register(env, form({ name: "Ann", email: "ann@example.je", phone: "+447700123123", marketing: true }));
  const an = contacts(env).find(x => x.id === ann);
  assert.equal(an.consent_source, "phone");
  assert.equal(an.marketing_opt_in_at, T0);
});

test("invalid input spends no Turnstile token", async () => {
  const env = makeEnv(); turnstile(true);
  for (const body of [form({ privacy: false }), form({ email: "" }), form({ phone: "12" }), form({ operation: "lease" }),
    form({ operation: "buy", budget_max: 1500 }), form({ bedrooms_min: null }), [], "x"]) {
    const r = await register(env, body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(r.data.fields, JSON.stringify(body));
  }
  assert.equal(spent.n, 0);

  turnstile(false);
  const r = await register(env, form());
  assert.equal(r.status, 400);
  assert.match(r.data.error, /anti-spam/);
  assert.equal(spent.n, 1);
  turnstile(true);
  const missing = await register(env, form({ turnstile: undefined }));
  assert.equal(missing.status, 400);
  assert.equal(spent.n, 0, "no token, nothing sent to Cloudflare");
  assert.deepEqual([contacts(env), applicants(env), events(env), notices(env)], [[], [], [], []]);
});

test("cross-origin and oversized bodies are refused", async () => {
  const env = makeEnv(); turnstile(true);
  const cross = await call(env, "POST", "/applicants", { body: form(), origin: "https://evil.test" });
  assert.equal(cross.status, 403);
  const big = await register(env, form({ requirements: "x".repeat(40000) }));
  assert.equal(big.status, 413);
  assert.equal(spent.n, 0);
  assert.deepEqual([contacts(env), events(env)], [[], []]);
});
