import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";

// SAP-08: the applicant record's Viewings and Messages tabs read only what belongs to that applicant's contact, only
// for a signed-in admin. Synthetic data.
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const get = async (env, path, signedIn = true) => call(env, "GET", path, { cookie: signedIn ? await adminCookie() : undefined });
const contact = (env, name, email, phone = null) => {
  const c = Number(run(env, `INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`, name, email, phone, T0, T0, T0).lastInsertRowid);
  const a = Number(run(env, `INSERT INTO applicants (contact_id, operation, source, created_at, updated_at)
    VALUES (?, 'rent', 'phone', ?, ?)`, c, T0, T0).lastInsertRowid);
  return { c, a };
};
const viewing = (env, { email = null, phone = null, at = T0, notes = null }) => Number(run(env,
  `INSERT INTO viewing_requests (kind, date, time, name, email, phone, notes, created_at)
   VALUES ('In person', '2026-11-20', '11:30', 'Synthetic Requester', ?, ?, ?, ?)`, email, phone, notes, at).lastInsertRowid);
const chat = (env, contactId, { email = "visitor@example.test", at = T0 } = {}) => {
  const id = Number(run(env, `INSERT INTO chats (key_hash, name, email, phone, privacy_ack_at, created_at, last_at, waiting_since)
    VALUES (?, 'Synthetic Visitor', ?, NULL, ?, ?, ?, ?)`, `hash${Math.random()}`, email, T0, at, at, at).lastInsertRowid);
  run(env, "INSERT INTO chat_messages (chat_id, role, text, created_at) VALUES (?, 'visitor', 'Private question', ?)", id, at);
  if (contactId) run(env, "UPDATE chats SET contact_id = ?, contact_version = 1 WHERE id = ?", contactId, id);
  return id;
};

test("viewings: only a signed-in admin, only an existing applicant", async () => {
  const env = makeEnv(), { a } = contact(env, "Synthetic Jane", "jane@example.test", "+447797123456");
  assert.equal((await get(env, `/admin/applicants/${a}/viewings`, false)).status, 401);
  assert.equal((await get(env, "/admin/applicants/999/viewings")).status, 404);
  const ok = await get(env, `/admin/applicants/${a}/viewings`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual(ok.data, { match: "email_phone", viewings: [] });
});

test("viewings: the contact's email or phone, the same cross as the Timeline, and none of the requester's details", async () => {
  const env = makeEnv(), { a } = contact(env, "Synthetic Jane", "jane@example.test", "+447797123456");
  const byPhone = viewing(env, { email: "work@example.test", phone: "07797 123 456", at: "2026-10-20T09:00:00.000Z", notes: "Private note" });
  const byEmail = viewing(env, { email: "Jane@Example.test", at: "2026-10-21T09:00:00.000Z" });
  const both = viewing(env, { email: "jane@example.test", phone: "(07797) 123-456", at: "2026-10-22T09:00:00.000Z" });
  viewing(env, { email: "tom@example.test", phone: "07797 654321", at: "2026-10-23T09:00:00.000Z" }); // a third party
  const r = await get(env, `/admin/applicants/${a}/viewings`);
  assert.deepEqual(r.data.viewings.map(v => [v.id, v.matched_by]),
    [[both, ["email", "phone"]], [byEmail, ["email"]], [byPhone, ["phone"]]]);
  for (const key of ["name", "email", "phone", "notes", "outcome_note"]) assert.equal(key in r.data.viewings[0], false, key);
  assert.ok(!r.text.includes("Synthetic Requester") && !r.text.includes("Private note") && !r.text.includes("work@example.test"));
  // The Timeline reads the same viewings.
  const d = await get(env, `/admin/applicants/${a}`);
  assert.deepEqual(d.data.viewings.map(v => v.id), [both, byEmail, byPhone]);
});

test("viewings: a contact without email or without phone never matches other people's empty values", async () => {
  const env = makeEnv(), emailOnly = contact(env, "Synthetic Email", "only@example.test", null);
  const phoneOnly = contact(env, "Synthetic Phone", null, "+447797111222");
  viewing(env, { email: "", phone: "07797 999888" });
  viewing(env, { email: null, phone: "" });
  viewing(env, { email: "other@example.test", phone: null });
  for (const { a } of [emailOnly, phoneOnly]) {
    assert.deepEqual((await get(env, `/admin/applicants/${a}/viewings`)).data.viewings, []);
    assert.deepEqual((await get(env, `/admin/applicants/${a}`)).data.viewings, []);
  }
});

test("messages: only a signed-in admin, only an existing applicant; switched off says so", async () => {
  for (const skip of [[], [93]]) {
    const env = makeEnv({ skip }), { a } = contact(env, "Synthetic Jane", "jane@example.test");
    assert.equal((await get(env, `/admin/applicants/${a}/messages`, false)).status, 401);
    assert.equal((await get(env, "/admin/applicants/999/messages")).status, 404);
    const off = await get(env, `/admin/applicants/${a}/messages`);
    assert.equal(off.status, 200);
    assert.deepEqual(off.data, { chats: null });
  }
});

test("messages: the chats linked to this applicant's contact only, without their text", async () => {
  const env = makeEnv();
  env.MSG03_CONTACT_LINK_READY = "1";
  const jane = contact(env, "Synthetic Jane", "visitor@example.test"), tom = contact(env, "Synthetic Tom", "tom@example.test");
  const older = chat(env, jane.c, { at: "2026-10-20T09:00:00.000Z" }), newer = chat(env, jane.c, { at: "2026-10-21T09:00:00.000Z" });
  chat(env, tom.c);
  chat(env, null); // the same email, never linked: not hers
  // A second search of the same contact shows the same chats: the link is to the person, not to one search.
  const second = Number(run(env, `INSERT INTO applicants (contact_id, operation, source, created_at, updated_at)
    VALUES (?, 'buy', 'phone', ?, ?)`, jane.c, T0, T0).lastInsertRowid);
  for (const id of [jane.a, second]) {
    const r = await get(env, `/admin/applicants/${id}/messages`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(r.data.chats.map(c => c.id), [newer, older]);
    assert.deepEqual(Object.keys(r.data.chats[0]).sort(), ["created_at", "id", "last_at", "status"]);
    assert.ok(!r.text.includes("Private question") && !r.text.includes("visitor@example.test"));
  }
  assert.deepEqual((await get(env, `/admin/applicants/${tom.a}/messages`)).data.chats.length, 1);
});
