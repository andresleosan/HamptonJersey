import { json, fail, readJson, now } from "../http.js";
import { verifyTurnstile } from "../turnstile.js";
import { validateStart, messageText, chatOn, previewHost, newKey, keyHash, conversation,
  KEY_DAYS, MAX_VISITOR, GAP_MS, VISITOR_MAX } from "../chat.js";

// MSG-02 (spec 2026-11-06): the website's chat. No route carries an id: the chat is the one whose key hash matches the
// Authorization header, while its last message is under KEY_DAYS old (C5). Any other key gets the same answer.
const ago = ms => new Date(Date.now() - ms).toISOString();
const ended = () => fail(401, "This chat has ended. Start a new one.");
const notHere = () => fail(404, "Not found");

async function chatOf(request, env) {
  if (previewHost(request)) notHere();
  const key = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!key) ended();
  const c = await env.DB.prepare("SELECT id, visitor_seen_at FROM chats WHERE key_hash = ? AND last_at >= ?")
    .bind(await keyHash(key), ago(KEY_DAYS * 864e5)).first();
  return c ?? ended();
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
  if (!c.visitor_seen_at || c.visitor_seen_at < ago(60e3))
    waitUntil(env.DB.prepare("UPDATE chats SET visitor_seen_at = ? WHERE id = ?").bind(now(), c.id).run().catch(() => {}));
  return json(await conversation(env, c.id));
}

// C7, C10: one statement checks the 40 and the 3 s, so two at once never make 41; the chat waits again from its first
// unanswered message.
async function say({ request, env }) {
  const c = await chatOf(request, env);
  const text = messageText((await readJson(request, 8192))?.text, VISITOR_MAX);
  if (!text) fail(400, `Write your message (up to ${VISITOR_MAX} characters)`);
  const ts = now();
  const [ins] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO chat_messages (chat_id, role, text, created_at) SELECT ?1, 'visitor', ?2, ?3
      WHERE (SELECT COUNT(*) FROM chat_messages WHERE chat_id = ?1 AND role = 'visitor') < ${MAX_VISITOR}
        AND NOT EXISTS (SELECT 1 FROM chat_messages WHERE chat_id = ?1 AND role = 'visitor' AND created_at > ?4)`)
      .bind(c.id, text, ts, ago(GAP_MS)),
    env.DB.prepare(`UPDATE chats SET last_at = ?2,
      waiting_since = CASE WHEN status = 'waiting' THEN COALESCE(waiting_since, ?2) ELSE ?2 END, status = 'waiting'
      WHERE id = ?1 AND changes() = 1`).bind(c.id, ts),
  ]);
  if (!ins.meta.changes) {
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id = ? AND role = 'visitor'").bind(c.id).first();
    fail(429, n >= MAX_VISITOR ? "This chat is full. Please start a new one or call us." : "Please wait a moment before sending another message.");
  }
  return json(await conversation(env, c.id), 201);
}

async function remove({ request, env }) {
  const c = await chatOf(request, env);
  await env.DB.prepare("DELETE FROM chats WHERE id = ?").bind(c.id).run();
  return new Response(null, { status: 204 });
}

export default [
  ["POST", /^\/chat$/, start],
  ["GET", /^\/chat$/, read],
  ["POST", /^\/chat\/messages$/, say],
  ["DELETE", /^\/chat$/, remove],
];
