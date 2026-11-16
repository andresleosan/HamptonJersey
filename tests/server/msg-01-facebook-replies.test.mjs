import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";
import { runRetention } from "../../server/retention.js";
import { openCounts } from "../../server/routes/notifications.js";

// MSG-01: Facebook page messages in Messages, answered by a person. Sending is META_SEND_READY, Luis's switch. The Graph
// API is a fake fetch: no network. Fictitious ids, token and people.
const PAGE = "100000000000001", PSID = "200000000000002", TOKEN = "fake-page-token";
const HOUR = 3600e3, iso = ms => new Date(ms).toISOString();
const world = ({ on = true, send = false, skip = [] } = {}) => {
  const env = makeEnv({ skip });
  if (on) Object.assign(env, { META_MESSAGES_READY: "1", META_APP_SECRET: "fake-secret", META_VERIFY_TOKEN: "fake-verify", META_PAGE_ID: PAGE });
  if (send) Object.assign(env, { META_SEND_READY: "1", META_PAGE_TOKEN: TOKEN });
  return env;
};
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const admin = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const conversation = (env, { inboundAt = iso(Date.now() - HOUR), psid = PSID, text = "Do you have 2-bed flats to rent?" } = {}) => {
  const id = Number(run(env, `INSERT INTO channel_conversations (channel, account_id, external_user_id, status, waiting_since,
    last_inbound_at, last_at, created_at) VALUES ('messenger', ?, ?, 'waiting', ?, ?, ?, ?)`, PAGE, psid, inboundAt, inboundAt, inboundAt, inboundAt)
    .lastInsertRowid);
  run(env, `INSERT INTO channel_messages (conversation_id, direction, text, external_id, sent_at, created_at)
    VALUES (?, 'in', ?, ?, ?, ?)`, id, text, `m_${id}_${Math.random()}`, inboundAt, inboundAt);
  return id;
};
// A fake Graph API: records each call and answers as told.
function fakeFetch(answer = () => Response.json({ recipient_id: PSID, message_id: "m_reply_1" })) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return answer(url, init); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

test("switched off, no Facebook route exists and Messages' counts are as before", async () => {
  for (const skip of [[], [109]]) {
    const env = world({ on: false, skip });
    assert.equal((await admin(env, "GET", "/admin/facebook")).status, 404);
    assert.equal((await admin(env, "GET", "/admin/facebook/1")).status, 404);
    assert.equal((await admin(env, "POST", "/admin/facebook/1/reply", { text: "Hi" })).status, 404);
    assert.equal("facebook" in await openCounts(env), false);
  }
});

test("switched on before migration 0109, the counts leave Facebook out instead of failing", async () => {
  const env = world({ skip: [109] });
  assert.equal("facebook" in await openCounts(env), false);
});

test("the panel lists Facebook conversations, waiting first, and needs a signed-in admin", async () => {
  const env = world(), a = conversation(env), b = conversation(env, { psid: "200000000000003" });
  run(env, "UPDATE channel_conversations SET status = 'answered', waiting_since = NULL WHERE id = ?", b);
  assert.equal((await call(env, "GET", "/admin/facebook")).status, 401);
  const r = await admin(env, "GET", "/admin/facebook?status=all");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.conversations.map(c => c.id), [a, b]);
  assert.equal(r.data.conversations[0].last_text, "Do you have 2-bed flats to rent?");
  assert.deepEqual(r.data.counts, { waiting: 1, answered: 1, handled: 0 });
  assert.equal((await openCounts(env)).facebook, 1);
  assert.equal((await admin(env, "GET", "/admin/facebook?status=nope")).status, 400);
});

test("the detail says sending is off, and a reply with sending off is refused without calling Meta or storing it", async () => {
  const env = world(), id = conversation(env), f = fakeFetch();
  try {
    const d = await admin(env, "GET", `/admin/facebook/${id}`);
    assert.equal(d.status, 200);
    assert.equal(d.data.send.on, false);
    assert.equal(d.data.send.window_open, true);
    assert.equal(d.data.messages.length, 1);
    const r = await admin(env, "POST", `/admin/facebook/${id}/reply`, { text: "Yes, we have two." });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /Sending replies to Facebook is off/);
    assert.equal(f.calls.length, 0);
    assert.equal(rows(env, "SELECT COUNT(*) AS n FROM channel_messages WHERE direction = 'out'")[0].n, 0);
  } finally { f.restore(); }
});

test("with sending on, a reply goes to the Send API as a RESPONSE and is recorded as sent", async () => {
  const env = world({ send: true }), id = conversation(env), f = fakeFetch();
  try {
    const r = await admin(env, "POST", `/admin/facebook/${id}/reply`, { text: "  Yes, we have two. When could you view?  " });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(f.calls.length, 1);
    const [{ url, init }] = f.calls, u = new URL(url);
    assert.equal(u.origin + u.pathname, `https://graph.facebook.com/v27.0/${PAGE}/messages`);
    assert.equal(u.search, "", "the token never goes in the URL");
    assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${TOKEN}`);
    assert.equal(init.method, "POST");
    assert.equal(new Headers(init.headers).get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(init.body), { recipient: { id: PSID }, messaging_type: "RESPONSE",
      message: { text: "Yes, we have two. When could you view?" } });
    const [out] = rows(env, "SELECT * FROM channel_messages WHERE direction = 'out'");
    assert.deepEqual([out.status, out.external_id, out.sent_by], ["sent", "m_reply_1", "admin@example.test"]);
    const [c] = rows(env, "SELECT status, waiting_since FROM channel_conversations");
    assert.deepEqual([c.status, c.waiting_since], ["answered", null]);
    assert.doesNotMatch(JSON.stringify(r.data), new RegExp(TOKEN), "the token never reaches the panel");
  } finally { f.restore(); }
});

test("outside the 24 hours since the person's last message, the reply is refused and Meta is not called", async () => {
  const env = world({ send: true }), id = conversation(env, { inboundAt: iso(Date.now() - 24 * HOUR - 60e3) }), f = fakeFetch();
  try {
    assert.equal((await admin(env, "GET", `/admin/facebook/${id}`)).data.send.window_open, false);
    const r = await admin(env, "POST", `/admin/facebook/${id}/reply`, { text: "Sorry for the delay" });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /24 hours/);
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});

test("Pause all outbound holds a Facebook reply too", async () => {
  const env = world({ send: true }), id = conversation(env), f = fakeFetch();
  run(env, `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('outbound',
    json_object('paused', json('true'), 'at', ?, 'by', 'admin@example.test'), ?, 'admin@example.test')`, T0, T0);
  try {
    assert.equal((await admin(env, "GET", `/admin/facebook/${id}`)).data.send.paused, true);
    const r = await admin(env, "POST", `/admin/facebook/${id}/reply`, { text: "Hello" });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /Pause all outbound/);
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});

test("switched on without the page token, sending is closed (503)", async () => {
  const env = world({ send: true }), id = conversation(env), f = fakeFetch();
  delete env.META_PAGE_TOKEN;
  try {
    assert.equal((await admin(env, "POST", `/admin/facebook/${id}/reply`, { text: "Hello" })).status, 503);
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});

test("Meta refusing the reply marks it failed; no answer marks it unknown; neither is retried", async () => {
  const env = world({ send: true }), id = conversation(env);
  let f = fakeFetch(() => Response.json({ error: { message: "(#10) outside window", code: 10, error_subcode: 2018278 } }, { status: 400 }));
  try {
    const r = await admin(env, "POST", `/admin/facebook/${id}/reply`, { text: "First try" });
    assert.equal(r.status, 502);
    assert.match(r.data.error, /Facebook did not accept/);
    assert.equal(f.calls.length, 1);
  } finally { f.restore(); }
  f = fakeFetch(() => { throw new TypeError("network down"); });
  try {
    const r = await admin(env, "POST", `/admin/facebook/${id}/reply`, { text: "Second try" });
    assert.equal(r.status, 502);
    assert.match(r.data.error, /check .*Facebook/i);
    assert.equal(f.calls.length, 1);
  } finally { f.restore(); }
  assert.deepEqual(rows(env, "SELECT text, status FROM channel_messages WHERE direction = 'out' ORDER BY id"),
    [{ text: "First try", status: "failed" }, { text: "Second try", status: "unknown" }]);
  assert.equal(rows(env, "SELECT status FROM channel_conversations")[0].status, "waiting");
});

test("a reply needs text, and a deleted conversation is a 404", async () => {
  const env = world({ send: true }), id = conversation(env), f = fakeFetch();
  try {
    assert.equal((await admin(env, "POST", `/admin/facebook/${id}/reply`, { text: "   " })).status, 400);
    assert.equal((await admin(env, "POST", `/admin/facebook/${id}/reply`, { text: "x".repeat(2001) })).status, 400);
    assert.equal((await admin(env, "DELETE", `/admin/facebook/${id}`)).status, 204);
    assert.equal(rows(env, "SELECT COUNT(*) AS n FROM channel_messages")[0].n, 0);
    assert.equal((await admin(env, "POST", `/admin/facebook/${id}/reply`, { text: "Hello" })).status, 404);
    assert.equal((await admin(env, "GET", `/admin/facebook/${id}`)).status, 404);
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});

test("Mark handled keeps a conversation waiting when the person wrote after what the panel shows", async () => {
  const env = world(), id = conversation(env);
  const last = rows(env, "SELECT MAX(id) AS id FROM channel_messages")[0].id;
  run(env, `INSERT INTO channel_messages (conversation_id, direction, text, external_id, sent_at, created_at)
    VALUES (?, 'in', 'One more thing', 'm_new', ?, ?)`, id, T0, T0);
  assert.equal((await admin(env, "POST", `/admin/facebook/${id}/handled`, { last })).status, 409);
  const r = await admin(env, "POST", `/admin/facebook/${id}/handled`, { last: last + 1 });
  assert.equal(r.status, 200);
  assert.deepEqual(rows(env, "SELECT status, handled_by FROM channel_conversations")[0], { status: "handled", handled_by: "admin@example.test" });
});

test("a person links the conversation to a contact (MSG-03's pattern), with a version against stale screens", async () => {
  const env = world();
  env.MSG03_CONTACT_LINK_READY = "1";
  const id = conversation(env);
  const contact = Number(run(env, `INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at)
    VALUES ('Synthetic Person', 'person@example.test', ?, ?, ?)`, T0, T0, T0).lastInsertRowid);
  const d = await admin(env, "GET", `/admin/facebook/${id}`);
  assert.deepEqual(d.data.contact_link, { contact: null, version: 0, suggestions: [] });
  const r = await admin(env, "POST", `/admin/facebook/${id}/contact`, { contact_id: contact, version: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.data.contact_link.contact.id, contact);
  assert.equal(r.data.contact_link.version, 1);
  assert.equal((await admin(env, "POST", `/admin/facebook/${id}/contact`, { contact_id: null, version: 0 })).status, 409);
  assert.deepEqual(rows(env, "SELECT type FROM events WHERE type LIKE 'contact.facebook_%'").map(e => e.type), ["contact.facebook_linked"]);
  env.MSG03_CONTACT_LINK_READY = "0";
  assert.equal("contact_link" in (await admin(env, "GET", `/admin/facebook/${id}`)).data, false);
  assert.equal((await admin(env, "POST", `/admin/facebook/${id}/contact`, { contact_id: null, version: 1 })).status, 404);
});

test("retention deletes a Facebook conversation 30 days after its last message, like the website's chats, also switched off later", async () => {
  const ts = "2026-11-16T03:00:00.000Z";
  for (const on of [true, false]) {
    const env = world({ on }), old = conversation(env, { inboundAt: "2026-10-16T02:00:00.000Z" });
    const recent = conversation(env, { inboundAt: "2026-10-17T04:00:00.000Z", psid: "200000000000009" });
    await runRetention(env, ts);
    const left = rows(env, "SELECT id FROM channel_conversations ORDER BY id").map(r => r.id);
    assert.deepEqual(left, [recent], `switched ${on ? "on" : "off"}: nothing stays for ever`);
  }
  await runRetention(world({ skip: [109] }), ts); // switched on before 0109: the rest of the pass still runs
});

test("META_MESSAGES_READY is the same in both wrangler.toml files, so the clock's retention follows the website", async () => {
  const { readFileSync } = await import("node:fs");
  const flag = f => /^META_MESSAGES_READY = "(\d)"$/m.exec(readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"))?.[1];
  assert.ok(flag("wrangler.toml"));
  assert.equal(flag("jobs/wrangler.toml"), flag("wrangler.toml"));
});

test("a Meta server error counts as unknown, not refused; a second reply while one is being sent is refused", async () => {
  const env = world({ send: true }), id = conversation(env), f = fakeFetch(() => Response.json({ error: { code: 2 } }, { status: 500 }));
  try {
    const r = await admin(env, "POST", `/admin/facebook/${id}/reply`, { text: "Hello" });
    assert.equal(r.status, 502);
    assert.match(r.data.error, /may or may not have been sent/);
    assert.equal(rows(env, "SELECT status FROM channel_messages WHERE direction = 'out'")[0].status, "unknown");
    env.DB.raw.prepare(`INSERT INTO channel_messages (conversation_id, direction, text, status, sent_by, sent_at, created_at)
      VALUES (?, 'out', 'in flight', 'sending', 'colleague@example.test', ?, ?)`).run(id, new Date().toISOString(), new Date().toISOString());
    const again = await admin(env, "POST", `/admin/facebook/${id}/reply`, { text: "Hello again" });
    assert.equal(again.status, 409);
    assert.equal(f.calls.length, 1, "nothing more went to Facebook");
  } finally { f.restore(); }
});
