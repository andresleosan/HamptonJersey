import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { makeEnv, call, ORIGIN } from "./helpers.mjs";
import { handleApi } from "../../server/api.js";
import { verifyMetaSignature } from "../../server/meta-webhooks.js";

// PRE-08 / MSG-01: Meta's webhook for Hampton's Facebook page. Fictitious ids and secrets only.
const APP_SECRET = "fake-app-secret-for-tests", VERIFY = "fake-verify-token", PAGE = "100000000000001", PSID = "200000000000002";
const world = ({ on = true, skip = [], secrets = true } = {}) => {
  const env = makeEnv({ skip });
  if (on) env.META_MESSAGES_READY = "1";
  if (secrets) Object.assign(env, { META_APP_SECRET: APP_SECRET, META_VERIFY_TOKEN: VERIFY, META_PAGE_ID: PAGE });
  return env;
};
const sign = (body, secret = APP_SECRET) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
const event = (mid, text, { page = PAGE, psid = PSID, ts = Date.now(), extra = {} } = {}) => ({
  object: "page", entry: [{ id: page, time: ts, messaging: [{ sender: { id: psid }, recipient: { id: page }, timestamp: ts,
    message: { mid, ...(text === null ? {} : { text }), ...extra } }] }],
});
async function post(env, body, { signature, headers = {} } = {}) {
  const raw = typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body);
  const h = new Headers({ "content-type": "application/json", ...headers });
  if (signature !== null) h.set("x-hub-signature-256", signature ?? sign(raw));
  const res = await handleApi(new Request(`${ORIGIN}/api/meta/webhook`, { method: "POST", headers: h, body: raw }), env, ["meta", "webhook"]);
  return { status: res.status, text: await res.text(), headers: res.headers };
}
const get = async (env, query) => {
  const res = await handleApi(new Request(`${ORIGIN}/api/meta/webhook?${query}`), env, ["meta", "webhook"]);
  return { status: res.status, text: await res.text(), headers: res.headers };
};
const rows = (env, sql) => env.DB.raw.prepare(sql).all().map(r => ({ ...r }));
const count = (env, table) => env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test("the signature is HMAC-SHA256 of the exact bytes with the app secret", async () => {
  const body = new TextEncoder().encode('{"a":"caf\\u00e9"}');
  const ok = await verifyMetaSignature(body, sign(body), APP_SECRET);
  assert.equal(ok, true);
  assert.equal(await verifyMetaSignature(body, sign(body, "other-secret"), APP_SECRET), false);
  assert.equal(await verifyMetaSignature(new TextEncoder().encode('{"a":"café"}'), sign(body), APP_SECRET), false);
  for (const bad of [null, "", "sha256=", "sha1=" + "a".repeat(40), "sha256=" + "g".repeat(64), `${sign(body)}, ${sign(body)}`,
    `${sign(body)} `, "sha256=" + "a".repeat(63)]) assert.equal(await verifyMetaSignature(body, bad, APP_SECRET), false, String(bad));
});

test("a valid signed message is stored once, waiting, and answered 200", async () => {
  const env = world(), ts = Date.parse("2026-11-16T09:00:00.000Z");
  const r = await post(env, event("m_1", "Is the flat in St Helier still available?", { ts }));
  assert.equal(r.status, 200);
  const [c] = rows(env, "SELECT * FROM channel_conversations");
  assert.equal(c.channel, "messenger");
  assert.equal(c.account_id, PAGE);
  assert.equal(c.external_user_id, PSID);
  assert.equal(c.status, "waiting");
  assert.equal(c.last_inbound_at, "2026-11-16T09:00:00.000Z");
  assert.equal(c.waiting_since, "2026-11-16T09:00:00.000Z");
  const [m] = rows(env, "SELECT * FROM channel_messages");
  assert.deepEqual([m.direction, m.text, m.external_id, m.status], ["in", "Is the flat in St Helier still available?", "m_1", null]);
});

test("a replayed event does nothing twice; a new message joins the same conversation", async () => {
  const env = world(), body = JSON.stringify(event("m_1", "Hello"));
  assert.equal((await post(env, body)).status, 200);
  assert.equal((await post(env, body)).status, 200);
  assert.equal(count(env, "channel_messages"), 1);
  env.DB.raw.prepare("UPDATE channel_conversations SET status = 'answered', waiting_since = NULL").run();
  assert.equal((await post(env, body)).status, 200);
  assert.equal(rows(env, "SELECT status FROM channel_conversations")[0].status, "answered", "a replay does not reopen it");
  assert.equal((await post(env, event("m_2", "Second question"))).status, 200);
  assert.equal(count(env, "channel_conversations"), 1);
  assert.equal(count(env, "channel_messages"), 2);
  assert.equal(rows(env, "SELECT status FROM channel_conversations")[0].status, "waiting");
});

test("a wrong, missing, duplicate or malformed signature is refused and nothing is stored", async () => {
  const env = world(), body = JSON.stringify(event("m_1", "Hello"));
  const cases = [{ signature: sign(body, "wrong-secret") }, { signature: null }, { signature: `${sign(body)}, ${sign(body)}` },
    { signature: "sha256=zz" }, { signature: sign(body).replace("sha256=", "sha1=") }];
  for (const c of cases) assert.equal((await post(env, body, c)).status, 401, JSON.stringify(c));
  // Signed for other bytes: the same JSON with different spacing is not the payload that was signed.
  assert.equal((await post(env, body, { signature: sign(JSON.stringify(JSON.parse(body), null, 1)) })).status, 401);
  assert.equal(count(env, "channel_messages"), 0);
  assert.equal(count(env, "channel_conversations"), 0);
});

test("an oversized body is refused before it is read whole", async () => {
  const env = world(), big = JSON.stringify({ object: "page", pad: "x".repeat(1024 * 1024) });
  assert.equal((await post(env, big)).status, 413);
  assert.equal((await post(env, big, { headers: { "content-length": "1" } })).status, 413, "a lying length is caught while streaming");
  assert.equal(count(env, "channel_messages"), 0);
});

test("signed but not JSON is a 400; other pages, echoes and non-message events store nothing", async () => {
  const env = world();
  assert.equal((await post(env, "not json")).status, 400);
  assert.equal((await post(env, event("m_x", "Hi", { page: "999" }))).status, 200);
  assert.equal((await post(env, event("m_e", "Echo", { extra: { is_echo: true } }))).status, 200);
  assert.equal((await post(env, event("m_s", "From the page itself", { psid: PAGE }))).status, 200);
  assert.equal((await post(env, { object: "instagram", entry: [] })).status, 200);
  const read = { object: "page", entry: [{ id: PAGE, time: 1, messaging: [{ sender: { id: PSID }, recipient: { id: PAGE }, read: { watermark: 1 } }] }] };
  assert.equal((await post(env, read)).status, 200);
  assert.equal(count(env, "channel_messages"), 0);
});

test("an attachment is not downloaded: only a placeholder is kept", async () => {
  const env = world();
  const r = await post(env, event("m_a", null, { extra: { attachments: [{ type: "image", payload: { url: "https://example.test/x.jpg" } }] } }));
  assert.equal(r.status, 200);
  const [m] = rows(env, "SELECT text FROM channel_messages");
  assert.equal(m.text, "Attachment received. Open the conversation on Facebook to see it.");
  assert.doesNotMatch(JSON.stringify(rows(env, "SELECT * FROM channel_messages")), /example\.test/);
});

test("a database failure is not acknowledged, and the retry stores the message", async () => {
  const env = world(), body = JSON.stringify(event("m_1", "Hello")), batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async () => { throw new Error("D1 unavailable"); };
  const error = console.error; console.error = () => {};
  try { assert.equal((await post(env, body)).status, 500); } finally { console.error = error; env.DB.batch = batch; }
  assert.equal(count(env, "channel_messages"), 0);
  assert.equal((await post(env, body)).status, 200);
  assert.equal(count(env, "channel_messages"), 1);
});

test("the verification handshake echoes the challenge only for the right token", async () => {
  const env = world();
  const ok = await get(env, `hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=1158201444`);
  assert.equal(ok.status, 200);
  assert.equal(ok.text, "1158201444");
  assert.match(ok.headers.get("content-type"), /^text\/plain/);
  assert.equal((await get(env, "hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")).status, 403);
  assert.equal((await get(env, `hub.mode=unsubscribe&hub.verify_token=${VERIFY}&hub.challenge=1`)).status, 403);
  assert.equal((await get(env, `hub.mode=subscribe&hub.verify_token=${VERIFY}`)).status, 403);
  assert.equal((await get(env, `hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=%3Cscript%3E`)).status, 403);
  const wrong = await get(env, "hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1");
  assert.doesNotMatch(wrong.text, new RegExp(VERIFY));
});

test("switched on without its secrets, the webhook is closed (503) and accepts nothing", async () => {
  for (const missing of ["META_APP_SECRET", "META_VERIFY_TOKEN", "META_PAGE_ID"]) {
    const env = world();
    delete env[missing];
    const body = JSON.stringify(event("m_1", "Hello"));
    if (missing !== "META_VERIFY_TOKEN") assert.equal((await post(env, body)).status, 503, missing);
    if (missing === "META_VERIFY_TOKEN") assert.equal((await get(env, "hub.mode=subscribe&hub.verify_token=&hub.challenge=1")).status, 503);
    assert.equal(count(env, "channel_messages"), 0);
  }
});

test("switched off, the route does not exist and nothing touches the new tables, with or without migration 0109", async () => {
  for (const skip of [[], [109]]) {
    const env = world({ on: false, skip }), body = JSON.stringify(event("m_1", "Hello"));
    assert.equal((await get(env, `hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=1`)).status, 404);
    // Same-origin, it is the usual 404; a call like Meta's (no Origin) gets the usual cross-origin refusal.
    assert.equal((await call(env, "POST", "/meta/webhook", { body: JSON.parse(body) })).status, 404);
    assert.equal((await post(env, body)).status, 403);
    if (!skip.length) assert.equal(count(env, "channel_messages"), 0);
  }
});
