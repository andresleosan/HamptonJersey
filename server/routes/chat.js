import { json, fail, readJson, now } from "../http.js";
import { verifyTurnstile } from "../turnstile.js";
import { validateStart, messageText, chatOn, previewHost, newKey, keyHash, conversation, visitorConversation,
  CHAT_DB_NOW, chatKeyCurrent, MAX_VISITOR, GAP_MS, VISITOR_MAX } from "../chat.js";

// MSG-02 (spec 2026-11-06): the website's chat. No route carries an id: the chat is the one whose key hash matches the
// Authorization header, while its last message is under KEY_DAYS old (C5). Any other key gets the same answer.
const ago = ms => new Date(Date.now() - ms).toISOString();
const ended = () => fail(401, "This chat has ended. Start a new one.");
const notHere = () => fail(404, "Not found");

async function chatOf(request, env) {
  if (previewHost(request)) notHere();
  const key = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!key) ended();
  const hash = await keyHash(key);
  const c = await env.DB.prepare(`SELECT id FROM chats WHERE key_hash = ? AND ${chatKeyCurrent()}`)
    .bind(hash).first();
  return c ? { ...c, hash } : ended();
}

async function start({ request, env }) {
  const body = await readJson(request, 16384);
  // Cheap checks first: the single-use Turnstile token is only spent on an otherwise valid request.
  if (!(await chatOn(env, request))) notHere();
  const r = validateStart(body);
  if (r.errors) return json({ error: "Please check the highlighted fields.", fields: r.errors }, 400);
  const v = r.value;
  if (!(await verifyTurnstile(body.turnstile, env.TURNSTILE_SECRET, request.headers.get("cf-connecting-ip"), new URL(request.url).hostname)))
    fail(400, "The anti-spam check expired or failed. Please try again.");
  const key = newKey(), hash = await keyHash(key), ts = now();
  // A listing that is not on the website is dropped, not refused (spec, «Dónde va»).
  const [c] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO chats (key_hash, name, email, phone, listing_id, privacy_ack_at, created_at, last_at, waiting_since)
      VALUES (?1, ?2, ?3, ?4, (SELECT id FROM listings WHERE id = ?5 AND published = 1 AND archived_at IS NULL), ?6, ?6, ?6, ?6)`).bind(hash, v.name, v.email, v.phone, v.listing_id, ts),
    env.DB.prepare(`INSERT INTO chat_messages (chat_id, role, text, created_at)
      SELECT id, 'visitor', ?, ? FROM chats WHERE key_hash = ?`).bind(v.text, ts, hash),
  ]);
  return json({ key, chat: await conversation(env, c.meta.last_row_id) }, 201);
}

// C14: a read tells the panel the visitor is on the website, written at most once a minute.
async function read({ request, env, waitUntil }) {
  const c = await chatOf(request, env);
  const current = await visitorConversation(env, c.id, c.hash);
  if (!current) ended();
  if (!current.visitor_seen_at || current.visitor_seen_at < ago(60e3))
    waitUntil(env.DB.prepare(`UPDATE chats SET visitor_seen_at = ${CHAT_DB_NOW}
      WHERE id = ? AND key_hash = ? AND ${chatKeyCurrent()}`).bind(c.id, c.hash).run().catch(() => {}));
  return json(current.chat);
}

// C7, C10: one statement checks the 40 and the 3 s, so two at once never make 41; the chat waits again from its first
// unanswered message.
async function say({ request, env }) {
  const c = await chatOf(request, env);
  const text = messageText((await readJson(request, 8192))?.text, VISITOR_MAX);
  if (!text) fail(400, `Write your message (up to ${VISITOR_MAX} characters)`);
  const [ins] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO chat_messages (chat_id, role, text, created_at)
      SELECT id, 'visitor', ?2, ${CHAT_DB_NOW} FROM chats WHERE id = ?1 AND key_hash = ?3 AND ${chatKeyCurrent()}
        AND (SELECT COUNT(*) FROM chat_messages WHERE chat_id = ?1 AND role = 'visitor') < ${MAX_VISITOR}
        AND NOT EXISTS (SELECT 1 FROM chat_messages WHERE chat_id = ?1 AND role = 'visitor'
          AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-${GAP_MS / 1000} seconds'))`)
      .bind(c.id, text, c.hash),
    env.DB.prepare(`UPDATE chats SET last_at = ${CHAT_DB_NOW},
      waiting_since = CASE WHEN status = 'waiting' THEN COALESCE(waiting_since, ${CHAT_DB_NOW}) ELSE ${CHAT_DB_NOW} END,
      status = 'waiting' WHERE id = ? AND changes() = 1`).bind(c.id),
  ]);
  if (!ins.meta.changes) {
    const current = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM chat_messages WHERE chat_id = chats.id AND role = 'visitor') AS n
      FROM chats WHERE id = ? AND key_hash = ? AND ${chatKeyCurrent()}`).bind(c.id, c.hash).first();
    if (!current) ended();
    fail(429, current.n >= MAX_VISITOR ? "This chat is full. Please start a new one or call us." : "Please wait a moment before sending another message.");
  }
  // The write has committed. Recheck before returning any conversation data;
  // if that read fails or the key was revoked, acknowledge the accepted write
  // without asking the visitor to retry it or exposing later messages.
  let current;
  try { current = await visitorConversation(env, c.id, c.hash); }
  catch { return json({ accepted: true, chat_state: "unknown" }, 201); }
  return json(current ? current.chat : { accepted: true, chat_state: "ended" }, 201);
}

async function remove({ request, env }) {
  const c = await chatOf(request, env);
  const r = await env.DB.prepare(`DELETE FROM chats WHERE id = ? AND key_hash = ? AND ${chatKeyCurrent()}`)
    .bind(c.id, c.hash).run();
  if (!r.meta.changes) ended();
  return new Response(null, { status: 204 });
}

export default [
  ["POST", /^\/chat$/, start],
  ["GET", /^\/chat$/, read],
  ["POST", /^\/chat\/messages$/, say],
  ["DELETE", /^\/chat$/, remove],
];
