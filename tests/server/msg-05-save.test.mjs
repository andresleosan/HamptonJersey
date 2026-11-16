import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";

// MSG-05: a person creates an applicant from a website chat (MSG05_CREATE_READY, migrations 0093 and 0098). Synthetic data.
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const n = (env, table) => row(env, `SELECT COUNT(*) AS n FROM ${table}`).n;
const admin = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const world = ({ on = true, skip = [] } = {}) => {
  const env = makeEnv({ skip });
  env.MSG03_CONTACT_LINK_READY = "1";
  if (on) env.MSG05_CREATE_READY = "1";
  return env;
};
const chat = (env, { email = "visitor@example.test", phone = "+447700900123" } = {}) => {
  const id = Number(run(env, `INSERT INTO chats (key_hash, name, email, phone, privacy_ack_at, created_at, last_at, waiting_since)
    VALUES (?, 'Synthetic Visitor', ?, ?, ?, ?, ?, ?)`, `hash${Math.random()}`, email, phone, T0, T0, T0, T0).lastInsertRowid);
  run(env, "INSERT INTO chat_messages (chat_id, role, text, created_at) VALUES (?, 'visitor', 'Private question', ?)", id, T0);
  return id;
};
const contact = (env, name, email, phone = null) => Number(run(env, `INSERT INTO contacts (name, email, phone, last_activity_at,
  created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, name, email, phone, T0, T0, T0).lastInsertRowid);
let keys = 0;
const newKey = () => `fixture-key-${String(++keys).padStart(8, "0")}`;
const form = (extra = {}) => ({ name: "Synthetic Visitor", email: "visitor@example.test", phone: "07700 900123",
  source: "phone", operation: "buy", budget_max: 900000, area_answer: "any", privacy: true, version: 0, ...extra });
const save = (env, id, body) => admin(env, "POST", `/admin/chats/${id}/applicant`, body);
const nothingWritten = (env, tables = ["contacts", "applicants", "chat_applicant_saves", "events"]) => {
  for (const t of tables) assert.equal(n(env, t), 0, t);
};

test("switched off, the draft, the chat detail and the panel are as before, and nothing can be saved", async () => {
  for (const skip of [[], [98]]) {
    const env = world({ on: false, skip }), id = chat(env);
    const draft = await admin(env, "GET", `/admin/chats/${id}/applicant-draft`);
    assert.equal(draft.data.chat_version, null);
    assert.equal(draft.data.save_available, false);
    assert.equal("create_applicant" in (await admin(env, "GET", `/admin/chats/${id}`)).data, false);
    assert.equal((await save(env, id, form({ operation_key: newKey() }))).status, 404);
    nothingWritten(env, ["contacts", "applicants", "events"]);
  }
  // Switched on without MSG-03, still off.
  const env = world({ on: true }), id = chat(env);
  delete env.MSG03_CONTACT_LINK_READY;
  assert.equal((await admin(env, "GET", `/admin/chats/${id}/applicant-draft`)).data.save_available, false);
  assert.equal((await save(env, id, form({ operation_key: newKey() }))).status, 404);
});

test("switched on, the draft carries the chat's version and Save creates the contact, the search and the link at once", async () => {
  const env = world(), id = chat(env);
  const draft = await admin(env, "GET", `/admin/chats/${id}/applicant-draft`);
  assert.equal(draft.data.chat_version, 0);
  assert.equal(draft.data.save_available, true);
  assert.deepEqual(draft.data.contact, { name: "Synthetic Visitor", email: "visitor@example.test", phone: "+447700900123" });
  assert.equal(n(env, "contacts"), 0, "reading the draft creates nothing");
  assert.equal((await admin(env, "GET", `/admin/chats/${id}`)).data.create_applicant, true);

  const r = await save(env, id, form({ operation_key: newKey(), name: "Edited Visitor", marketing: true }));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const a = row(env, "SELECT contact_id, source, operation FROM applicants WHERE id = ?", r.data.id);
  assert.deepEqual({ ...a }, { contact_id: a.contact_id, source: "phone", operation: "buy" });
  const c = row(env, "SELECT name, phone, privacy_ack_at, marketing_opt_in_at FROM contacts WHERE id = ?", a.contact_id);
  assert.equal(c.name, "Edited Visitor", "the person's edit is what is saved");
  assert.equal(c.phone, "+447700900123");
  assert.ok(c.privacy_ack_at);
  const ch = row(env, "SELECT contact_id, contact_version FROM chats WHERE id = ?", id);
  assert.deepEqual({ ...ch }, { contact_id: a.contact_id, contact_version: 1 });
  const s = row(env, "SELECT chat_id, applicant_id, contact_id, created_by FROM chat_applicant_saves");
  assert.deepEqual({ ...s }, { chat_id: id, applicant_id: r.data.id, contact_id: a.contact_id, created_by: "admin@example.test" });
  const events = env.DB.raw.prepare("SELECT entity_type, entity_id, type, data FROM events ORDER BY id").all().map(e => ({ ...e }));
  assert.deepEqual(events.map(e => [e.entity_type, e.entity_id, e.type]),
    [["applicant", String(r.data.id), "applicant.created"], ["contact", String(a.contact_id), "contact.chat_linked"]]);
  assert.deepEqual(JSON.parse(events[1].data), { chat_id: id, applicant_created: true });
  assert.equal(n(env, "notifications"), 1);
  // The draft now carries the new version: a tab still on 0 cannot save again.
  assert.equal((await admin(env, "GET", `/admin/chats/${id}/applicant-draft`)).data.chat_version, 1);
});

test("PRE-10 switched on: Save records no marketing opt-in from the panel", async () => {
  const env = world(), id = chat(env);
  env.PRE10_PURPOSE_READY = "1";
  const r = await save(env, id, form({ operation_key: newKey(), marketing: true }));
  assert.equal(r.status, 201);
  assert.equal(row(env, "SELECT marketing_opt_in_at FROM contacts").marketing_opt_in_at, null);
});

test("a double click or a retry with the same key returns the same applicant and never creates a second", async () => {
  const env = world(), id = chat(env), key = newKey();
  const both = await Promise.all([save(env, id, form({ operation_key: key })), save(env, id, form({ operation_key: key }))]);
  assert.deepEqual(both.map(r => r.status).sort(), [200, 201]);
  assert.equal(both[0].data.id, both[1].data.id);
  const retry = await save(env, id, form({ operation_key: key }));
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.data, { id: both[0].data.id, replayed: true });
  assert.equal(n(env, "applicants"), 1);
  assert.equal(n(env, "contacts"), 1);
  assert.equal(row(env, "SELECT contact_version FROM chats").contact_version, 1);
  // The same key on another chat is refused.
  assert.equal((await save(env, chat(env, { email: "other@example.test", phone: null }), form({ operation_key: key }))).status, 409);
});

test("two tabs with different keys on the same chat version: one applicant, the other gets 409", async () => {
  const env = world(), id = chat(env);
  const both = await Promise.all([save(env, id, form({ operation_key: newKey() })),
    save(env, id, form({ operation_key: newKey(), email: "second@example.test", phone: "" }))]);
  assert.deepEqual(both.map(r => r.status).sort(), [201, 409]);
  assert.equal(n(env, "applicants"), 1);
  assert.equal(n(env, "contacts"), 1);
  assert.equal(n(env, "chat_applicant_saves"), 1);
});

test("a stale version, an invalid key or invalid fields write nothing and the form can be saved after fixing it", async () => {
  const env = world(), id = chat(env), key = newKey();
  assert.equal((await save(env, id, form({ operation_key: key, version: 3 }))).status, 409);
  assert.equal((await save(env, id, form({ operation_key: "short" }))).status, 400);
  assert.equal((await save(env, id, form({ operation_key: key, version: undefined }))).status, 400);
  const bad = await save(env, id, form({ operation_key: key, source: "" }));
  assert.equal(bad.status, 400);
  assert.ok(bad.data.fields.source);
  nothingWritten(env);
  assert.equal(row(env, "SELECT contact_version FROM chats").contact_version, 0);
  assert.equal((await save(env, id, form({ operation_key: key }))).status, 201);
});

test("a chat deleted before Save, or between the read and the batch, creates nothing", async () => {
  const env = world(), id = chat(env);
  run(env, "DELETE FROM chats WHERE id = ?", id);
  const r = await save(env, id, form({ operation_key: newKey() }));
  assert.equal(r.status, 404);
  nothingWritten(env);

  // Deleted while the save is under way: the batch's guard rolls everything back.
  const env2 = world(), id2 = chat(env2), batch = env2.DB.batch.bind(env2.DB);
  env2.DB.batch = stmts => { run(env2, "DELETE FROM chats WHERE id = ?", id2); return batch(stmts); };
  const late = await save(env2, id2, form({ operation_key: newKey() }));
  assert.equal(late.status, 404);
  nothingWritten(env2);
});

test("a contact linked meanwhile from another tab rolls the batch back with 409", async () => {
  const env = world(), id = chat(env), other = contact(env, "Linked Person", "linked@example.test");
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = stmts => {
    run(env, "UPDATE chats SET contact_id = ?, contact_version = contact_version + 1 WHERE id = ?", other, id);
    env.DB.batch = batch;
    return batch(stmts);
  };
  const r = await save(env, id, form({ operation_key: newKey() }));
  assert.equal(r.status, 409);
  assert.equal(n(env, "contacts"), 1);
  assert.equal(n(env, "applicants"), 0);
  assert.equal(n(env, "chat_applicant_saves"), 0);
});

test("a saved contact with the same normalised email or phone gets the 409 offer; accepting it adds the search there", async () => {
  const env = world(), id = chat(env);
  const existing = contact(env, "Saved Person", "visitor@example.test", "+447700900123");
  const key = newKey();
  const offer = await save(env, id, form({ operation_key: key, email: "Visitor@Example.TEST", phone: "07700 900123" }));
  assert.equal(offer.status, 409);
  assert.equal(offer.data.contact_id, existing);
  assert.equal(n(env, "applicants"), 0);
  assert.equal(n(env, "chat_applicant_saves"), 0);
  const r = await save(env, id, form({ operation_key: key, contact_id: existing }));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(row(env, "SELECT contact_id FROM applicants WHERE id = ?", r.data.id).contact_id, existing);
  assert.equal(row(env, "SELECT name FROM contacts WHERE id = ?", existing).name, "Saved Person", "the saved contact stays as it was");
  assert.equal(n(env, "contacts"), 1);
  assert.equal(row(env, "SELECT contact_id FROM chats WHERE id = ?", id).contact_id, existing);
  // A second search of the same operation for that contact is the ordinary offer to open it.
  const id2 = chat(env);
  const dup = await save(env, id2, form({ operation_key: newKey(), contact_id: existing }));
  assert.equal(dup.status, 409);
  assert.equal(dup.data.applicant_id, r.data.id);
});

test("a chat already linked to a contact offers that contact and keeps its link without a second link event", async () => {
  const env = world(), id = chat(env), linked = contact(env, "Linked Person", "linked@example.test");
  run(env, "UPDATE chats SET contact_id = ?, contact_version = 2 WHERE id = ?", linked, id);
  const offer = await save(env, id, form({ operation_key: newKey(), version: 2, email: "new@example.test", phone: "" }));
  assert.equal(offer.status, 409);
  assert.equal(offer.data.contact_id, linked);
  const r = await save(env, id, form({ operation_key: newKey(), version: 2, contact_id: linked }));
  assert.equal(r.status, 201);
  assert.deepEqual({ ...row(env, "SELECT contact_id, contact_version FROM chats WHERE id = ?", id) }, { contact_id: linked, contact_version: 3 });
  assert.equal(n(env, "events WHERE type = 'contact.chat_linked'"), 0);
});

test("deleting the contact afterwards leaves a retry saying so, and deleting the chat keeps the applicant", async () => {
  const env = world(), id = chat(env), key = newKey();
  const r = await save(env, id, form({ operation_key: key }));
  assert.equal(r.status, 201);
  // The chat's 30 days end: the saved applicant stays.
  run(env, "DELETE FROM chats WHERE id = ?", id);
  assert.equal(n(env, "applicants"), 1);
  assert.equal(row(env, "SELECT applicant_id FROM chat_applicant_saves").applicant_id, r.data.id);
  assert.equal((await save(env, id, form({ operation_key: key }))).status, 200, "a retry still returns it");

  // The contact is deleted (its last search permanently deleted): a retry does not create it again.
  const env2 = world(), id2 = chat(env2), key2 = newKey();
  const first = await save(env2, id2, form({ operation_key: key2 }));
  const cid = row(env2, "SELECT contact_id FROM applicants WHERE id = ?", first.data.id).contact_id;
  run(env2, "DELETE FROM applicants WHERE id = ?", first.data.id);
  run(env2, "DELETE FROM contacts WHERE id = ?", cid);
  assert.deepEqual({ ...row(env2, "SELECT applicant_id, contact_id FROM chat_applicant_saves") }, { applicant_id: null, contact_id: null });
  assert.equal(row(env2, "SELECT contact_id FROM chats WHERE id = ?", id2).contact_id, null);
  const retry = await save(env2, id2, form({ operation_key: key2 }));
  assert.equal(retry.status, 409);
  assert.match(retry.data.error, /deleted/);
  assert.equal(n(env2, "applicants"), 0);
  assert.equal(n(env2, "contacts"), 0);
});

test("Save needs a person and the same origin", async () => {
  const env = world(), id = chat(env);
  assert.equal((await call(env, "POST", `/admin/chats/${id}/applicant`, { body: form({ operation_key: newKey() }) })).status, 401);
  const cross = await call(env, "POST", `/admin/chats/${id}/applicant`, { body: form({ operation_key: newKey() }),
    cookie: await adminCookie(), origin: "https://other.example.test" });
  assert.equal(cross.status, 403);
  nothingWritten(env);
});

test("the retention pass deletes a save's key 30 days after it was written, and runs without migration 0098", async () => {
  const { runRetention } = await import("../../server/retention.js");
  const env = world(), id = chat(env), key = newKey();
  const r = await save(env, id, form({ operation_key: key }));
  assert.equal(r.status, 201);
  const written = row(env, "SELECT created_at FROM chat_applicant_saves").created_at, day = 864e5;
  await runRetention(env, new Date(Date.parse(written) + 29 * day).toISOString());
  assert.equal(n(env, "chat_applicant_saves"), 1, "kept for retries within 30 days");
  await runRetention(env, new Date(Date.parse(written) + 31 * day).toISOString());
  assert.equal(n(env, "chat_applicant_saves"), 0);
  assert.equal(n(env, "applicants"), 1, "the applicant stays");
  await runRetention(world({ on: false, skip: [98] }), new Date().toISOString());
});
