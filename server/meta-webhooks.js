import { json, fail, now, HttpError } from "./http.js";
import { TEAM_MAX } from "./chat.js";

// PRE-08 / MSG-01 (docs/roadmap/work/MSG-01/plan.md): Meta's webhook for the messages people send to Hampton's Facebook
// page. Public, but every POST is checked against X-Hub-Signature-256 (HMAC-SHA256 of the exact body bytes with the
// app secret) before anything is parsed or stored. Mounted by server/api.js only with META_MESSAGES_READY; switched
// off, nothing here exists and nothing touches its tables (migration 0109). Secrets come from the environment only:
// META_APP_SECRET, META_VERIFY_TOKEN, META_PAGE_ID; one missing closes the route (503).
export const metaMessagesReady = env => env?.META_MESSAGES_READY === "1";
export const metaSendReady = env => env?.META_SEND_READY === "1";

export const MAX_BODY = 1024 * 1024;
export const ATTACHMENT_TEXT = "Attachment received. Open the conversation on Facebook to see it.";
const SIGNATURE = /^sha256=([0-9a-fA-F]{64})$/;
const ID = /^\d{1,32}$/;
const enc = new TextEncoder();

const closed = what => {
  console.error(`MSG-01: META_MESSAGES_READY is on but ${what} is missing; the Facebook webhook stays closed.`);
  fail(503, "Facebook messages are not available right now");
};

// True only for one well-formed header (a repeated header arrives joined with ", " and fails) that matches.
export async function verifyMetaSignature(body, header, appSecret) {
  const hex = typeof header === "string" ? SIGNATURE.exec(header)?.[1] : null;
  if (!hex || !appSecret) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sig = new Uint8Array(hex.match(/../g).map(b => parseInt(b, 16)));
  return crypto.subtle.verify("HMAC", key, sig, body);
}

// Equal-length digests compared without an early exit, so the time says nothing about the token.
async function sameSecret(a, b) {
  const [x, y] = await Promise.all([a, b].map(async s => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// The body's bytes, streamed and cut at MAX_BODY: an oversized or lying request is never buffered whole.
async function rawBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY) fail(413, "Request too large");
  const reader = request.body?.getReader(), chunks = [];
  let size = 0;
  for (let r; reader && !(r = await reader.read()).done;) {
    size += r.value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); fail(413, "Request too large"); }
    chunks.push(r.value);
  }
  const out = new Uint8Array(size);
  chunks.reduce((at, c) => (out.set(c, at), at + c.byteLength), 0);
  return out;
}

// Subscription check: answers hub.challenge only to the right verify token, as plain text, and never says the token.
async function handshake(request, env) {
  if (!env.META_VERIFY_TOKEN) closed("META_VERIFY_TOKEN");
  const q = new URL(request.url).searchParams, challenge = q.get("hub.challenge") ?? "";
  const ok = q.get("hub.mode") === "subscribe" && /^[A-Za-z0-9._-]{1,256}$/.test(challenge)
    && await sameSecret(q.get("hub.verify_token") ?? "", env.META_VERIFY_TOKEN);
  if (!ok) fail(403, "Verification failed");
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff", "cache-control": "no-store" } });
}

// Meta's time for a message (milliseconds), never later than now: the 24-hour window counts from it.
// Meta's time of the message (milliseconds), kept only if it is within the last 7 days; otherwise the time we got it,
// so a wrong or second-based value never closes the 24-hour window or ages the conversation out at once.
const when = (ms, received) => (Number.isFinite(ms) && ms < Date.parse(received) && ms > Date.parse(received) - 7 * 864e5
  ? new Date(ms).toISOString() : received);

// The text messages a person sent to our page. Echoes (the page itself), reads, deliveries and postbacks are left out.
export function pageMessages(payload, pageId, received) {
  if (payload?.object !== "page" || !Array.isArray(payload.entry)) return [];
  return payload.entry.filter(e => String(e?.id) === pageId && Array.isArray(e.messaging)).flatMap(e => e.messaging.flatMap(m => {
    const psid = m?.sender?.id, msg = m?.message;
    if (!msg || msg.is_echo || typeof psid !== "string" || !ID.test(psid) || psid === pageId) return [];
    if (typeof msg.mid !== "string" || !msg.mid || msg.mid.length > 256) return [];
    const text = typeof msg.text === "string" && msg.text.trim() ? msg.text.trim().slice(0, TEAM_MAX)
      : Array.isArray(msg.attachments) && msg.attachments.length ? ATTACHMENT_TEXT : null;
    return text ? [{ psid, mid: msg.mid, text, at: when(m.timestamp, received) }] : [];
  }));
}

// One batch for the whole delivery: a conversation per person (created once), the message unless its Meta id is already
// stored (a replay), and only then the conversation's clock and Waiting. 200 goes out only after the batch committed.
async function receive(request, env) {
  if (!env.META_APP_SECRET) closed("META_APP_SECRET");
  if (!env.META_PAGE_ID || !ID.test(env.META_PAGE_ID)) closed("META_PAGE_ID");
  const body = await rawBody(request);
  if (!(await verifyMetaSignature(body, request.headers.get("x-hub-signature-256"), env.META_APP_SECRET))) fail(401, "Invalid signature");
  let payload;
  try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); } catch { fail(400, "Invalid JSON body"); }
  const ts = now(), page = env.META_PAGE_ID, messages = pageMessages(payload, page, ts);
  if (messages.length) await env.DB.batch(messages.flatMap(m => [
    env.DB.prepare(`INSERT INTO channel_conversations (channel, account_id, external_user_id, status, waiting_since,
      last_inbound_at, last_at, created_at) VALUES ('messenger', ?1, ?2, 'waiting', ?3, ?3, ?3, ?4)
      ON CONFLICT (channel, account_id, external_user_id) DO NOTHING`).bind(page, m.psid, m.at, ts),
    env.DB.prepare(`INSERT INTO channel_messages (conversation_id, direction, text, external_id, sent_at, created_at)
      SELECT id, 'in', ?1, ?2, ?3, ?4 FROM channel_conversations WHERE channel = 'messenger' AND account_id = ?5 AND external_user_id = ?6
      ON CONFLICT (external_id) DO NOTHING`).bind(m.text, m.mid, m.at, ts, page, m.psid),
    env.DB.prepare(`UPDATE channel_conversations SET status = 'waiting', waiting_since = COALESCE(waiting_since, ?1),
      last_inbound_at = MAX(last_inbound_at, ?1), last_at = MAX(last_at, ?1), handled_at = NULL, handled_by = NULL
      WHERE channel = 'messenger' AND account_id = ?2 AND external_user_id = ?3 AND changes() = 1`).bind(m.at, page, m.psid),
  ]));
  return json({ ok: true });
}

// server/api.js calls this for /meta/* before the same-origin check (Meta sends no Origin), only switched on.
export async function metaWebhook(request, env, path) {
  if (path !== "/meta/webhook") fail(404, "Not found");
  if (request.method === "GET") return handshake(request, env);
  if (request.method === "POST") return receive(request, env);
  throw new HttpError(405, "Method not allowed");
}
