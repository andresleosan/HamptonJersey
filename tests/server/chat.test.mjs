import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, T0 } from "./helpers.mjs";
import { handleApi } from "../../server/api.js";

// MSG-02 (spec 2026-11-06): the website's chat. The key travels only in Authorization; the server finds the chat by its hash.
const turnstile = ok => { globalThis.fetch = async () => new Response(JSON.stringify({ success: ok, hostname: "hampton.test" })); };
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const switchOn = (env, on = true) => run(env, `INSERT INTO app_settings (key, value, updated_at, updated_by)
  VALUES ('webchat', json_object('on', json(?)), ?, 'admin@example.test')
  ON CONFLICT (key) DO UPDATE SET value = excluded.value`, String(on), T0);
const world = () => { const env = makeEnv(); seedListing(env); switchOn(env); turnstile(true); return env; };
const start = (o = {}) => ({ name: "Sam Le Brocq", email: "Sam@Example.je", phone: "", privacy: true,
  text: "Is Le Bernage still available?", listing_id: "HE-R001", turnstile: "tok", ...o });
const open = async (env, o) => { const r = await call(env, "POST", "/chat", { body: start(o) }); assert.equal(r.status, 201, r.text); return r.data.key; };
const say = (env, key, text = "Hello") => call(env, "POST", "/chat/messages", { body: { text }, bearer: key });
const read = (env, key) => call(env, "GET", "/chat", { bearer: key });
// Moves a chat's clock back, as if its messages were older.
const age = (env, ms) => {
  const shift = iso => iso && new Date(Date.parse(iso) - ms).toISOString();
  for (const c of env.DB.raw.prepare("SELECT id, last_at, waiting_since, visitor_seen_at FROM chats").all())
    run(env, "UPDATE chats SET last_at = ?, waiting_since = ?, visitor_seen_at = ? WHERE id = ?",
      shift(c.last_at), shift(c.waiting_since), shift(c.visitor_seen_at), c.id);
  for (const m of env.DB.raw.prepare("SELECT id, created_at FROM chat_messages").all())
    run(env, "UPDATE chat_messages SET created_at = ? WHERE id = ?", shift(m.created_at), m.id);
};
const ENDED = { error: "This chat has ended. Start a new one." };

test("starts a chat and returns the key once", async () => {
  const env = world();
  const r = await call(env, "POST", "/chat", { body: start() });
  assert.equal(r.status, 201);
  assert.match(r.data.key, /^[A-Za-z0-9_-]{43}$/);
  const c = row(env, "SELECT * FROM chats");
  assert.notEqual(c.key_hash, r.data.key);
  assert.match(c.key_hash, /^[0-9a-f]{64}$/);
  assert.equal(c.status, "waiting");
  assert.equal(c.waiting_since, c.last_at);
  assert.equal(c.email, "sam@example.je");
  assert.equal(c.phone, null);
  assert.equal(c.listing_id, "HE-R001");
  assert.ok(c.privacy_ack_at);
  assert.deepEqual({ ...row(env, "SELECT role, text FROM chat_messages") }, { role: "visitor", text: "Is Le Bernage still available?" });
  assert.equal(r.data.chat.status, "waiting");
  assert.equal(r.data.chat.messages.length, 1);
  assert.deepEqual(r.data.chat.listing, { id: "HE-R001", title: "Le Bernage" });
});

test("switch off, a preview host or a failed Turnstile: no new chat", async () => {
  const env = world();
  switchOn(env, false);
  assert.equal((await call(env, "POST", "/chat", { body: start() })).status, 404, "off");
  run(env, "DELETE FROM app_settings WHERE key = 'webchat'");
  assert.equal((await call(env, "POST", "/chat", { body: start() })).status, 404, "never turned on");
  switchOn(env);
  const preview = new Request("https://abc123.hamptonjersey.pages.dev/api/chat", { method: "POST",
    headers: { origin: "https://abc123.hamptonjersey.pages.dev", "content-type": "application/json" }, body: JSON.stringify(start()) });
  assert.equal((await handleApi(preview, env, ["chat"])).status, 404, "previews use the production database");
  turnstile(false);
  const r = await call(env, "POST", "/chat", { body: start() });
  assert.equal(r.status, 400);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM chats").n, 0);
});

test("asks for a name, an email or a phone, the privacy box and a message", async () => {
  const env = world();
  const fields = async o => (await call(env, "POST", "/chat", { body: start(o) })).data.fields;
  assert.ok((await fields({ name: " " })).name);
  const none = await fields({ email: "", phone: "" });
  assert.ok(none.email && none.phone);
  assert.ok((await fields({ email: "not-an-email" })).email);
  assert.ok((await fields({ phone: "12" , email: "" })).phone);
  assert.ok((await fields({ privacy: "yes" })).privacy);
  assert.ok((await fields({ text: "   " })).text);
  assert.ok((await fields({ text: "x".repeat(1001) })).text);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM chats").n, 0);
  // A phone alone is enough; a listing that is not on the website is dropped, not refused.
  seedListing(env, { id: "HE-R002", title: "Draft", published: 0 });
  await open(env, { email: "", phone: "07797 123456", listing_id: "HE-R002" });
  const c = row(env, "SELECT email, phone, listing_id FROM chats");
  assert.equal(c.email, null);
  assert.ok(c.phone);
  assert.equal(c.listing_id, null);
});

test("the key reads only its own chat, and an unknown or old key gets the same 401", async () => {
  const env = world();
  const a = await open(env), b = await open(env, { name: "Other Person", text: "Mine" });
  const r = await read(env, a);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.messages.map(m => m.text), ["Is Le Bernage still available?"]);
  assert.equal((await read(env, b)).data.messages[0].text, "Mine");
  for (const key of ["x".repeat(43), "", undefined]) {
    const bad = await call(env, "GET", "/chat", { bearer: key });
    assert.equal(bad.status, 401);
    assert.deepEqual(bad.data, ENDED);
  }
  age(env, 8 * 864e5);
  const old = await read(env, a);
  assert.equal(old.status, 401, "7 days after the last message the key no longer works");
  assert.deepEqual(old.data, ENDED);
  assert.equal((await say(env, a)).status, 401);
});

test("a team reply comes back signed with a first name, never an email", async () => {
  const env = world();
  const key = await open(env);
  run(env, "UPDATE admins SET name = 'Gilberto Franco' WHERE email = 'admin@example.test'");
  const id = row(env, "SELECT id FROM chats").id;
  const team = (by, text) => run(env, "INSERT INTO chat_messages (chat_id, role, sent_by, text, created_at) VALUES (?, 'team', ?, ?, ?)",
    id, by, text, new Date().toISOString());
  team("admin@example.test", "Yes, it is");
  team("colleague@example.test", "Call us");
  team("gone@example.test", "Bye");
  const r = await read(env, key);
  assert.deepEqual(r.data.messages.map(m => m.from), [null, "Gilberto · Hampton Estates", "Hampton Estates", "Hampton Estates"]);
  assert.doesNotMatch(r.text, /@example\.test|sent_by|Sam@|sam@/);
});

test("visitor messages: 3 s apart, at most 40, back to waiting", async t => {
  const env = world();
  const key = await open(env);
  const r = await say(env, key, "Too soon");
  assert.equal(r.status, 429);
  age(env, 4000);
  assert.equal((await say(env, key, "  A second one  ")).status, 201);
  assert.equal(row(env, "SELECT text FROM chat_messages ORDER BY id DESC").text, "A second one");
  assert.equal((await say(env, key, "x".repeat(1001))).status, 400);
  // After the team marked it handled, a new message puts it back to waiting, waiting since then.
  age(env, 4000);
  run(env, "UPDATE chats SET status = 'handled', waiting_since = NULL");
  assert.equal((await say(env, key, "One more thing")).status, 201);
  const c = row(env, "SELECT status, waiting_since, last_at FROM chats");
  assert.equal(c.status, "waiting");
  assert.equal(c.waiting_since, c.last_at);
  // Still waiting: waiting_since stays at the first unanswered message.
  age(env, 4000);
  const since = row(env, "SELECT waiting_since FROM chats").waiting_since;
  await say(env, key, "Anyone?");
  assert.equal(row(env, "SELECT waiting_since FROM chats").waiting_since, since);
  // 39 visitor messages, then two at once: 40, never 41.
  const id = row(env, "SELECT id FROM chats").id;
  const old = new Date(Date.now() - 60e3).toISOString();
  run(env, "DELETE FROM chat_messages");
  for (let i = 0; i < 39; i++) run(env, "INSERT INTO chat_messages (chat_id, role, text, created_at) VALUES (?, 'visitor', 'x', ?)", id, old);
  const both = await Promise.all([say(env, key, "a"), say(env, key, "b")]);
  assert.deepEqual(both.map(b => b.status).sort(), [201, 429]);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM chat_messages").n, 40);
  age(env, 4000);
  const full = await say(env, key, "c");
  assert.equal(full.status, 429);
  assert.equal(full.data.error, "This chat is full. Please start a new one or call us.");
});

test("switch off keeps open chats working", async () => {
  const env = world();
  const key = await open(env);
  switchOn(env, false);
  age(env, 4000);
  assert.equal((await read(env, key)).status, 200);
  assert.equal((await say(env, key)).status, 201);
});

test("reading updates visitor_seen_at at most once a minute", async () => {
  const env = world();
  const key = await open(env);
  await read(env, key);
  const first = row(env, "SELECT visitor_seen_at FROM chats").visitor_seen_at;
  assert.ok(first);
  await read(env, key);
  assert.equal(row(env, "SELECT visitor_seen_at FROM chats").visitor_seen_at, first, "within a minute: no write");
  age(env, 61e3);
  const aged = row(env, "SELECT visitor_seen_at FROM chats").visitor_seen_at;
  await read(env, key);
  assert.notEqual(row(env, "SELECT visitor_seen_at FROM chats").visitor_seen_at, aged);
});

test("the visitor deletes the chat and its messages", async () => {
  const env = world();
  const key = await open(env);
  const r = await call(env, "DELETE", "/chat", { bearer: key });
  assert.equal(r.status, 204);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM chats").n, 0);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM chat_messages").n, 0);
  assert.equal((await read(env, key)).status, 401);
});

test("chat answers are never cached, and the config says whether the chat is on", async () => {
  const env = world();
  const key = await open(env);
  for (const r of [await read(env, key), await call(env, "POST", "/chat", { body: start() }), await call(env, "GET", "/chat", {})])
    assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal((await call(env, "GET", "/config")).data.chat, true);
  switchOn(env, false);
  assert.equal((await call(env, "GET", "/config")).data.chat, false);
  switchOn(env);
  const preview = new Request("https://abc123.hamptonjersey.pages.dev/api/config");
  assert.equal((await (await handleApi(preview, env, ["config"])).json()).chat, false);
});
