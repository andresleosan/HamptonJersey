import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";

// MSG-03: a person links a website chat to an existing contact (migration 0093, MSG03_CONTACT_LINK_READY). Synthetic data.
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const admin = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const world = ({ on = true, skip = [] } = {}) => {
  const env = makeEnv({ skip });
  if (on) env.MSG03_CONTACT_LINK_READY = "1";
  return env;
};
const contact = (env, name, email, phone = null) => {
  const id = Number(run(env, `INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`, name, email, phone, T0, T0, T0).lastInsertRowid);
  run(env, `INSERT INTO applicants (contact_id, operation, source, created_at, updated_at) VALUES (?, 'rent', 'phone', ?, ?)`, id, T0, T0);
  return id;
};
const chat = (env, { email = "visitor@example.test", phone = null } = {}) => {
  const id = Number(run(env, `INSERT INTO chats (key_hash, name, email, phone, privacy_ack_at, created_at, last_at, waiting_since)
    VALUES (?, 'Synthetic Visitor', ?, ?, ?, ?, ?, ?)`, `hash${Math.random()}`, email, phone, T0, T0, T0, T0).lastInsertRowid);
  run(env, "INSERT INTO chat_messages (chat_id, role, text, created_at) VALUES (?, 'visitor', 'Private question', ?)", id, T0);
  return id;
};
const linkEvents = env => rows(env, `SELECT entity_id, type, data, actor FROM events WHERE type LIKE 'contact.chat_%' ORDER BY id`);

test("switched off, the API and the chat detail are as before, with or without migration 0093", async () => {
  for (const skip of [[], [93]]) {
    const env = world({ on: false, skip }), id = chat(env), c = contact(env, "Synthetic Match", "visitor@example.test");
    const d = await admin(env, "GET", `/admin/chats/${id}`);
    assert.equal(d.status, 200);
    assert.equal("contact_link" in d.data, false);
    assert.equal((await admin(env, "POST", `/admin/chats/${id}/contact`, { contact_id: c, version: 0 })).status, 404);
    assert.equal((await admin(env, "GET", "/admin/contacts?q=synthetic")).status, 404);
    assert.equal((await admin(env, "GET", `/admin/contacts/${c}/chats`)).status, 404);
  }
});

test("a contact with the visitor's email or phone is suggested, never linked on its own", async () => {
  const env = world(), byEmail = contact(env, "Synthetic Email", "visitor@example.test");
  const byPhone = contact(env, "Synthetic Phone", "other@example.test", "+447700900111");
  contact(env, "Synthetic Visitor", "unrelated@example.test"); // same name is not the same person
  const id = chat(env, { phone: "+447700900111" });
  const d = await admin(env, "GET", `/admin/chats/${id}`);
  assert.equal(d.data.contact_link.contact, null);
  assert.equal(d.data.contact_link.version, 0);
  assert.deepEqual(d.data.contact_link.suggestions.map(s => s.id), [byEmail, byPhone]);
  assert.equal(typeof d.data.contact_link.suggestions[0].applicant_id, "number");
  assert.equal(row(env, "SELECT contact_id FROM chats WHERE id = ?", id).contact_id, null);
  assert.equal(linkEvents(env).length, 0);
});

test("linking records who did it, keeps both retention clocks and shows on the contact", async () => {
  const env = world(), c = contact(env, "Synthetic Match", "visitor@example.test"), id = chat(env);
  const r = await admin(env, "POST", `/admin/chats/${id}/contact`, { contact_id: c, version: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.data.contact_link.contact.id, c);
  assert.equal(r.data.contact_link.version, 1);
  assert.deepEqual(r.data.contact_link.suggestions, [], "the linked contact is no longer a suggestion");
  assert.deepEqual(linkEvents(env), [{ entity_id: String(c), type: "contact.chat_linked", data: JSON.stringify({ chat_id: id }),
    actor: "admin@example.test" }]);
  assert.equal(row(env, "SELECT last_at FROM chats WHERE id = ?", id).last_at, T0, "the chat's 30 days are not extended");
  assert.equal(row(env, "SELECT last_activity_at FROM contacts WHERE id = ?", c).last_activity_at, T0, "nor the contact's 12 months");
  const list = await admin(env, "GET", `/admin/contacts/${c}/chats`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.chats.map(x => x.id), [id]);
  assert.ok(!list.text.includes("Private question"), "no message text on the contact");
  assert.equal(list.headers.get("cache-control"), "no-store");
  // The same contact again changes nothing.
  const again = await admin(env, "POST", `/admin/chats/${id}/contact`, { contact_id: c, version: 1 });
  assert.equal(again.data.contact_link.version, 1);
  assert.equal(linkEvents(env).length, 1);
});

test("a stale version gets 409 and changes nothing", async () => {
  const env = world(), a = contact(env, "Synthetic A", "a@example.test"), b = contact(env, "Synthetic B", "b@example.test");
  const id = chat(env);
  assert.equal((await admin(env, "POST", `/admin/chats/${id}/contact`, { contact_id: a, version: 0 })).status, 200);
  const late = await admin(env, "POST", `/admin/chats/${id}/contact`, { contact_id: b, version: 0 });
  assert.equal(late.status, 409);
  assert.equal(row(env, "SELECT contact_id FROM chats WHERE id = ?", id).contact_id, a);
  assert.equal(linkEvents(env).length, 1);
});

test("relinking and unlinking log both sides; a deleted contact leaves the chat unlinked", async () => {
  const env = world(), a = contact(env, "Synthetic A", "a@example.test"), b = contact(env, "Synthetic B", "b@example.test");
  const id = chat(env);
  await admin(env, "POST", `/admin/chats/${id}/contact`, { contact_id: a, version: 0 });
  const moved = await admin(env, "POST", `/admin/chats/${id}/contact`, { contact_id: b, version: 1 });
  assert.equal(moved.data.contact_link.contact.id, b);
  const off = await admin(env, "POST", `/admin/chats/${id}/contact`, { contact_id: null, version: 2 });
  assert.equal(off.status, 200);
  assert.equal(off.data.contact_link.contact, null);
  assert.deepEqual(linkEvents(env).map(e => [Number(e.entity_id), e.type]), [[a, "contact.chat_linked"], [a, "contact.chat_unlinked"],
    [b, "contact.chat_linked"], [b, "contact.chat_unlinked"]]);
  await admin(env, "POST", `/admin/chats/${id}/contact`, { contact_id: a, version: 3 });
  run(env, "DELETE FROM applicants WHERE contact_id = ?", a);
  run(env, "DELETE FROM contacts WHERE id = ?", a);
  assert.equal(row(env, "SELECT contact_id FROM chats WHERE id = ?", id).contact_id, null);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id = ?", id).n, 1, "the chat itself stays");
});

test("wrong input, a missing contact or chat, no session and another origin write nothing", async () => {
  const env = world(), c = contact(env, "Synthetic A", "a@example.test"), id = chat(env);
  for (const body of [{ contact_id: "1", version: 0 }, { contact_id: 0, version: 0 }, { contact_id: c }, { contact_id: c, version: -1 }])
    assert.equal((await admin(env, "POST", `/admin/chats/${id}/contact`, body)).status, 400);
  assert.equal((await admin(env, "POST", `/admin/chats/${id}/contact`, { contact_id: 9999, version: 0 })).status, 404);
  assert.equal((await admin(env, "POST", "/admin/chats/9999/contact", { contact_id: c, version: 0 })).status, 404);
  assert.equal((await call(env, "POST", `/admin/chats/${id}/contact`, { body: { contact_id: c, version: 0 } })).status, 401);
  assert.equal((await call(env, "POST", `/admin/chats/${id}/contact`, { body: { contact_id: c, version: 0 },
    cookie: await adminCookie(), origin: "https://evil.example" })).status, 403);
  assert.equal((await call(env, "GET", "/admin/contacts?q=synthetic")).status, 401);
  assert.equal(row(env, "SELECT contact_version FROM chats WHERE id = ?", id).contact_version, 0);
  assert.equal(linkEvents(env).length, 0);
});

test("the search finds contacts by name, email or phone, and wildcards are literal", async () => {
  const env = world(), a = contact(env, "Synthetic Alpha", "alpha@example.test", "+447700900222");
  const b = contact(env, "Synthetic Beta", "beta@example.test");
  const ids = async q => (await admin(env, "GET", `/admin/contacts?q=${encodeURIComponent(q)}`)).data.contacts.map(x => x.id);
  assert.deepEqual(await ids("synthetic"), [a, b]);
  assert.deepEqual(await ids("BETA@"), [b]);
  assert.deepEqual(await ids("7700 900 222"), [a]);
  assert.deepEqual(await ids("%%"), []);
  assert.deepEqual(await ids("__"), []);
  for (const q of ["--", "()", "..", "+-"]) assert.deepEqual(await ids(q), [], `${q} matches no phone`);
  assert.equal((await admin(env, "GET", "/admin/contacts?q=a")).status, 400);
  assert.equal((await admin(env, "GET", `/admin/contacts?q=${"x".repeat(101)}`)).status, 400);
});

test("a phone written the Jersey way finds the stored international number", async () => {
  const env = world(), a = contact(env, "Synthetic Gamma", "gamma@example.test", "+447797123456");
  contact(env, "Synthetic Delta", "delta@example.test", "+447700900333");
  const ids = async q => (await admin(env, "GET", `/admin/contacts?q=${encodeURIComponent(q)}`)).data.contacts.map(x => x.id);
  for (const q of ["07797 123456", "07797.123.456", "07797-123-456", "(07797) 123456", "+44 7797 123456", "0044 7797 123456",
    "797 123 456"]) assert.deepEqual(await ids(q), [a], q);
});

test("a contact deleted between the read and the write gets 409 and no event for it", async () => {
  const env = world(), a = contact(env, "Synthetic A", "a@example.test"), b = contact(env, "Synthetic B", "b@example.test");
  const id = chat(env);
  await admin(env, "POST", `/admin/chats/${id}/contact`, { contact_id: a, version: 0 });
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = stmts => {
    env.DB.batch = batch;
    run(env, "DELETE FROM applicants WHERE contact_id = ?", a);
    run(env, "DELETE FROM contacts WHERE id = ?", a);
    return batch(stmts);
  };
  const r = await admin(env, "POST", `/admin/chats/${id}/contact`, { contact_id: b, version: 1 });
  assert.equal(r.status, 409);
  assert.deepEqual({ ...row(env, "SELECT contact_id, contact_version FROM chats WHERE id = ?", id) }, { contact_id: null, contact_version: 1 });
  assert.deepEqual(linkEvents(env).map(e => e.type), ["contact.chat_linked"], "no unlink event for the deleted contact");
});

test("switched on before migration 0093, the chat detail reads as switched off", async () => {
  const env = world({ skip: [93] }), id = chat(env);
  const d = await admin(env, "GET", `/admin/chats/${id}`);
  assert.equal(d.status, 200);
  assert.equal("contact_link" in d.data, false);
  assert.equal(d.data.messages.length, 1);
});
