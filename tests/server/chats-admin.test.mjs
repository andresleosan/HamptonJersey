import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";

// MSG-02 (spec 2026-11-06): the panel's side of the website's chat.
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const admin = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
let n = 0;
const chat = (env, { status = "waiting", name = "Sam Le Brocq", at = T0, since = at, listing = null } = {}) => {
  const id = Number(run(env, `INSERT INTO chats (key_hash, status, name, email, phone, listing_id, privacy_ack_at, created_at,
    last_at, waiting_since) VALUES (?, ?, ?, 'sam@private.je', '+447700900123', ?, ?, ?, ?, ?)`,
  `hash${++n}`, status, name, listing, at, at, at, status === "waiting" ? since : null).lastInsertRowid);
  run(env, "INSERT INTO chat_messages (chat_id, role, text, created_at) VALUES (?, 'visitor', 'Secret question', ?)", id, at);
  return id;
};
const world = () => { const env = makeEnv(); seedListing(env); return env; };

test("the panel lists chats by status with their counts", async () => {
  const env = world();
  const late = chat(env, { at: "2026-10-07T10:30:00.000Z" }), early = chat(env, { name: "Early", at: "2026-10-07T09:00:00.000Z", listing: "HE-R001" });
  const answered = chat(env, { status: "answered" }), handled = chat(env, { status: "handled" });
  const r = await admin(env, "GET", "/admin/chats?status=waiting");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.chats.map(c => c.id), [early, late], "oldest wait first");
  assert.equal(r.data.chats[0].listing_title, "Le Bernage");
  assert.equal(r.data.chats[0].last_text, "Secret question");
  assert.deepEqual(r.data.counts, { waiting: 2, answered: 1, handled: 1 });
  assert.deepEqual((await admin(env, "GET", "/admin/chats?status=answered")).data.chats.map(c => c.id), [answered]);
  assert.deepEqual((await admin(env, "GET", "/admin/chats?status=handled")).data.chats.map(c => c.id), [handled]);
  assert.equal((await admin(env, "GET", "/admin/chats?status=all")).data.chats.length, 4);
  assert.equal((await admin(env, "GET", "/admin/chats?status=nope")).status, 400);
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("the detail has the contact, the listing and the conversation", async () => {
  const env = world();
  const id = chat(env, { listing: "HE-R001" });
  const r = await admin(env, "GET", `/admin/chats/${id}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.chat.email, "sam@private.je");
  assert.equal(r.data.chat.phone, "+447700900123");
  assert.deepEqual(r.data.chat.listing, { id: "HE-R001", title: "Le Bernage" });
  assert.deepEqual(r.data.messages.map(m => [m.role, m.text]), [["visitor", "Secret question"]]);
  assert.equal((await admin(env, "GET", "/admin/chats/999")).status, 404);
});

test("a reply is signed by its sender and answers the chat", async () => {
  const env = world();
  const id = chat(env);
  const r = await admin(env, "POST", `/admin/chats/${id}/reply`, { text: "  Yes, it is available.  " });
  assert.equal(r.status, 201);
  const m = row(env, "SELECT role, sent_by, text FROM chat_messages ORDER BY id DESC");
  assert.deepEqual({ ...m }, { role: "team", sent_by: "admin@example.test", text: "Yes, it is available." });
  const c = row(env, "SELECT status, waiting_since, last_at FROM chats WHERE id = ?", id);
  assert.equal(c.status, "answered");
  assert.equal(c.waiting_since, null);
  assert.notEqual(c.last_at, T0);
  assert.equal(r.data.messages.at(-1).sent_by, "admin@example.test");
  for (const text of ["", "   ", "x".repeat(2001), 5]) assert.equal((await admin(env, "POST", `/admin/chats/${id}/reply`, { text })).status, 400);
});

test("a reply to a deleted chat is a 404, not a 500", async () => {
  const env = world();
  const id = chat(env);
  run(env, "DELETE FROM chats WHERE id = ?", id);
  const r = await admin(env, "POST", `/admin/chats/${id}/reply`, { text: "Hello" });
  assert.equal(r.status, 404);
  assert.equal(r.data.error, "This chat was deleted");
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM chat_messages").n, 0);
  assert.equal((await admin(env, "POST", `/admin/chats/${id}/handled`, { last: 999 })).status, 404);
});

test("mark handled, and delete with its messages", async () => {
  const env = world();
  const id = chat(env);
  assert.equal((await admin(env, "POST", `/admin/chats/${id}/handled`, { last: 999 })).status, 200);
  const c = row(env, "SELECT status, waiting_since, handled_by, handled_at FROM chats WHERE id = ?", id);
  assert.equal(c.status, "handled");
  assert.equal(c.waiting_since, null);
  assert.equal(c.handled_by, "admin@example.test");
  assert.ok(c.handled_at);
  assert.equal((await admin(env, "DELETE", `/admin/chats/${id}`)).status, 204);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM chats").n, 0);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM chat_messages").n, 0);
  assert.equal((await admin(env, "DELETE", `/admin/chats/${id}`)).status, 404);
});

test("the switch remembers who turned it on and when", async () => {
  const env = world();
  assert.deepEqual((await admin(env, "GET", "/admin/automations")).data.webchat, { on: false, at: null, by: null });
  const r = await admin(env, "POST", "/admin/webchat", { on: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.webchat.on, true);
  assert.equal(r.data.webchat.by, "admin@example.test");
  assert.ok(r.data.webchat.at);
  assert.deepEqual((await admin(env, "GET", "/admin/automations")).data.webchat, r.data.webchat);
  assert.equal((await call(env, "GET", "/config")).data.chat, true);
  assert.equal((await admin(env, "POST", "/admin/webchat", { on: false })).data.webchat.on, false);
  assert.equal((await call(env, "GET", "/config")).data.chat, false);
  for (const on of ["yes", 1, null]) assert.equal((await admin(env, "POST", "/admin/webchat", { on })).status, 400);
});

test("without a session nothing of the chats opens", async () => {
  const env = world();
  const id = chat(env);
  for (const [m, p] of [["GET", "/admin/chats?status=all"], ["GET", `/admin/chats/${id}`], ["POST", `/admin/chats/${id}/reply`],
    ["POST", `/admin/chats/${id}/handled`], ["DELETE", `/admin/chats/${id}`], ["POST", "/admin/webchat"]])
    assert.equal((await call(env, m, p, { body: m === "GET" ? undefined : { text: "x", on: true } })).status, 401, `${m} ${p}`);
});

test("the bar counts waiting chats only", async () => {
  const env = world();
  chat(env); chat(env); chat(env, { status: "answered" }); chat(env, { status: "handled" });
  assert.equal((await admin(env, "GET", "/admin/notifications/counts")).data.chats, 2);
});

test("mark handled waits when the visitor wrote after what the panel shows (C7)", async () => {
  const env = world();
  const id = chat(env);
  const seen = row(env, "SELECT MAX(id) AS id FROM chat_messages").id;
  run(env, "INSERT INTO chat_messages (chat_id, role, text, created_at) VALUES (?, 'visitor', 'One more question', ?)", id, T0);
  const r = await admin(env, "POST", `/admin/chats/${id}/handled`, { last: seen });
  assert.equal(r.status, 409);
  assert.equal(row(env, "SELECT status FROM chats WHERE id = ?", id).status, "waiting");
  assert.equal((await admin(env, "POST", `/admin/chats/${id}/handled`, { last: seen + 1 })).status, 200);
  assert.equal((await admin(env, "POST", `/admin/chats/${id}/handled`, { last: "x" })).status, 400);
});

test("a deleted chat's id is never given to a new one: a reply to the old id never reaches another visitor", async () => {
  const env = world();
  const old = chat(env, { name: "First Visitor" });
  run(env, "DELETE FROM chats WHERE id = ?", old);
  const fresh = chat(env, { name: "Second Visitor" });
  assert.notEqual(fresh, old, "AUTOINCREMENT: SQLite would otherwise reuse the last deleted rowid");
  const r = await admin(env, "POST", `/admin/chats/${old}/reply`, { text: "Your private answer" });
  assert.equal(r.status, 404);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM chat_messages WHERE role = 'team'").n, 0);
});
