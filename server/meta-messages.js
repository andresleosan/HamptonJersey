import { json, fail, readJson, now } from "./http.js";
import { messageText, TEAM_MAX } from "./chat.js";
import { logEvent } from "./events.js";
import { chatContactReady } from "./chat-contact.js";
import { metaSendReady } from "./meta-webhooks.js";

// MSG-01 (docs/roadmap/work/MSG-01/plan.md): the Facebook page's conversations in Messages. A person reads and replies;
// nothing is sent on its own. Sending is META_SEND_READY, Luis's switch: off, a reply is refused and the screen says
// so. On, it goes through the Messenger Send API as a RESPONSE, only within 24 hours of the person's last message, never
// while Pause all outbound is on (unlike the website chat's C13: a Facebook reply leaves Hampton, like an email), and is
// never retried on its own. Mounted by server/api.js only with META_MESSAGES_READY (migration 0109).
export const GRAPH_VERSION = "v27.0";
export const WINDOW_MS = 24 * 3600e3;
const SEND_TIMEOUT_MS = 10000;
const STATUSES = ["waiting", "answered", "handled"];
const gone = () => fail(404, "This conversation was deleted");
const windowOpen = lastInbound => Date.parse(lastInbound) > Date.now() - WINDOW_MS;
const paused = async env => !!(await env.DB.prepare(
  "SELECT 1 FROM app_settings WHERE key = 'outbound' AND json_extract(value, '$.paused') = 1").first());

// Messages' bar: conversations waiting. Switched on before migration 0109, Facebook is left out of the counts.
export const facebookWaiting = env => env.DB.prepare("SELECT COUNT(*) AS n FROM channel_conversations WHERE status = 'waiting'")
  .first().then(r => r.n, e => { if (/no such table: channel_conversations/.test(String(e?.message))) return null; throw e; });

async function list({ request, env }) {
  const status = new URL(request.url).searchParams.get("status") ?? "waiting";
  if (status !== "all" && !STATUSES.includes(status)) fail(400, "Invalid status");
  const [{ results: conversations }, { results: counts }] = await env.DB.batch([
    env.DB.prepare(`SELECT c.id, c.external_user_id, c.status, c.last_at, c.waiting_since, c.contact_id, k.name AS contact_name,
      (SELECT text FROM channel_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_text
      FROM channel_conversations c LEFT JOIN contacts k ON k.id = c.contact_id ${status === "all" ? "" : "WHERE c.status = ?"}
      ORDER BY c.status = 'waiting' DESC, CASE WHEN c.status = 'waiting' THEN c.waiting_since END, c.last_at DESC, c.id DESC
      LIMIT 200`).bind(...(status === "all" ? [] : [status])),
    env.DB.prepare("SELECT status, COUNT(*) AS n FROM channel_conversations GROUP BY status"),
  ]);
  return json({ conversations, counts: Object.fromEntries(STATUSES.map(s => [s, counts.find(c => c.status === s)?.n ?? 0])) });
}

// MSG-03's link, for a conversation: no email or phone comes from Facebook, so nothing is suggested.
async function contactLink(env, id) {
  const c = await env.DB.prepare(`SELECT c.contact_version AS version, k.id, k.name, k.email, k.phone, (SELECT a.id FROM applicants a
    WHERE a.contact_id = k.id ORDER BY a.archived_at IS NOT NULL, a.created_at DESC, a.id DESC LIMIT 1) AS applicant_id
    FROM channel_conversations c LEFT JOIN contacts k ON k.id = c.contact_id WHERE c.id = ?`).bind(id).first();
  if (!c) return null;
  const { version, ...contact } = c;
  return { contact: contact.id === null ? null : contact, version, suggestions: [] };
}

async function detail({ env, params: [id] }) {
  const [{ results: [c] }, { results: messages }, { results: [hold] }] = await env.DB.batch([
    env.DB.prepare(`SELECT id, external_user_id, status, last_inbound_at, created_at, handled_at, handled_by
      FROM channel_conversations WHERE id = ?`).bind(Number(id)),
    env.DB.prepare(`SELECT m.id, m.direction, m.text, m.status, m.sent_by, m.sent_at, a.name FROM channel_messages m
      LEFT JOIN admins a ON a.email = m.sent_by WHERE m.conversation_id = ? ORDER BY m.id`).bind(Number(id)),
    env.DB.prepare("SELECT 1 AS on_ FROM app_settings WHERE key = 'outbound' AND json_extract(value, '$.paused') = 1"),
  ]);
  if (!c) gone();
  const link = chatContactReady(env) ? await contactLink(env, c.id) ?? gone() : null;
  return json({ conversation: c, messages,
    send: { on: metaSendReady(env), paused: !!hold, window_open: windowOpen(c.last_inbound_at),
      window_ends_at: new Date(Date.parse(c.last_inbound_at) + WINDOW_MS).toISOString() },
    ...(link && { contact_link: link }) });
}

// Messenger Send API: the reply as a RESPONSE to the person's page-scoped id. The token goes in the Authorization header,
// never in the URL, so no request log can show it; it is never logged nor returned. ok: accepted with its message id;
// false: refused (4xx); null: no answer or a Meta server error (5xx), so it may have gone.
async function sendMessenger(env, psid, text) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${env.META_PAGE_ID}/messages`;
  let res;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.META_PAGE_TOKEN}` },
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      body: JSON.stringify({ recipient: { id: psid }, messaging_type: "RESPONSE", message: { text } }) });
  } catch { return { ok: null }; }
  const data = await res.json().catch(() => null);
  if (res.ok && typeof data?.message_id === "string") return { ok: true, mid: data.message_id };
  return res.ok || res.status >= 500 ? { ok: null } : { ok: false, code: Number.isInteger(data?.error?.code) ? data.error.code : res.status };
}

async function reply({ request, env, admin, params: [id] }) {
  const body = await readJson(request, 16384), text = messageText(body?.text, TEAM_MAX);
  const last = Number.isInteger(body?.last) ? body.last : null; // the newest message the panel showed
  if (!text) fail(400, `Write a reply (up to ${TEAM_MAX} characters)`);
  const c = await env.DB.prepare("SELECT id, external_user_id, last_inbound_at FROM channel_conversations WHERE id = ?")
    .bind(Number(id)).first() ?? gone();
  if (!metaSendReady(env)) fail(409, "Sending replies to Facebook is off, so nothing was sent. Answer from Facebook's Page inbox for now.");
  if (!env.META_PAGE_TOKEN || !/^\d{1,32}$/.test(env.META_PAGE_ID ?? "")) {
    console.error("MSG-01: META_SEND_READY is on but META_PAGE_TOKEN or META_PAGE_ID is missing; nothing is sent.");
    fail(503, "Sending to Facebook is not set up yet. Nothing was sent.");
  }
  if (await paused(env)) fail(409, "Sending is paused (Pause all outbound), so nothing was sent. Resume sending in Automations first.");
  if (!windowOpen(c.last_inbound_at)) fail(409, "More than 24 hours have passed since their last message, so Facebook does not "
    + "allow a reply. Nothing was sent. Contact them another way, or reply when they write again.");
  // The reply is recorded before it leaves, so a send whose answer is lost still shows on the screen. Not while another
  // reply to this person is still being sent (two tabs, two people, a double click): one at a time.
  const ts = now(), recent = new Date(Date.parse(ts) - 60e3).toISOString();
  const ins = await env.DB.prepare(`INSERT INTO channel_messages (conversation_id, direction, text, status, sent_by,
    sent_at, created_at) SELECT id, 'out', ?, 'sending', ?, ?, ? FROM channel_conversations WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM channel_messages WHERE conversation_id = ?5 AND direction = 'out' AND status = 'sending'
        AND created_at > ?6)`)
    .bind(text, admin, ts, ts, c.id, recent).run();
  if (!ins.meta.changes) fail(409, "Another reply to this person is being sent right now. Wait a moment and reload before sending again.");
  const msgId = ins.meta.last_row_id, r = await sendMessenger(env, c.external_user_id, text);
  const mark = (status, mid = null) => env.DB.prepare("UPDATE channel_messages SET status = ?, external_id = ? WHERE id = ?").bind(status, mid, msgId);
  if (r.ok) {
    // Answered only if no message came in after the newest one the panel showed (by id, as Handled), else by time.
    const newer = last == null ? "sent_at > ?4" : "id > ?4";
    try {
      await env.DB.batch([mark("sent", r.mid), env.DB.prepare(`UPDATE channel_conversations SET status = 'answered', waiting_since = NULL,
        last_at = ?1 WHERE id = ?2 AND NOT EXISTS (SELECT 1 FROM channel_messages WHERE conversation_id = ?3 AND direction = 'in' AND ${newer})`)
        .bind(now(), c.id, c.id, last ?? ts)]);
    } catch {
      fail(502, "Facebook accepted the reply, but it could not be recorded here. Do not send it again.");
    }
    return json({ ok: true }, 201);
  }
  await mark(r.ok === false ? "failed" : "unknown").run();
  if (r.ok === false) fail(502, `Facebook did not accept the reply (error ${r.code}), so it was not sent.`);
  fail(502, "Facebook did not confirm the reply. It may or may not have been sent: check the conversation on Facebook before sending it again.");
}

// As the website chat (C7): `last` is the newest message the panel shows; a message after it keeps the conversation waiting.
async function handled({ request, env, admin, params: [id] }) {
  const last = (await readJson(request))?.last;
  if (!Number.isInteger(last)) fail(400, "Send the last message shown");
  const r = await env.DB.prepare(`UPDATE channel_conversations SET status = 'handled', waiting_since = NULL, handled_at = ?, handled_by = ?
    WHERE id = ? AND NOT EXISTS (SELECT 1 FROM channel_messages WHERE conversation_id = channel_conversations.id AND direction = 'in' AND id > ?)`)
    .bind(now(), admin, Number(id), last).run();
  if (r.meta.changes) return json({ ok: true });
  if (!(await env.DB.prepare("SELECT 1 FROM channel_conversations WHERE id = ?").bind(Number(id)).first())) gone();
  fail(409, "They have just written again. Read the new message first.");
}

// Hampton's copy only: the conversation stays on Facebook.
async function remove({ env, params: [id] }) {
  const r = await env.DB.prepare("DELETE FROM channel_conversations WHERE id = ?").bind(Number(id)).run();
  if (!r.meta.changes) gone();
  return new Response(null, { status: 204 });
}

// MSG-03's link and its compare-and-set version, for a Facebook conversation. Nothing links on its own.
async function link({ request, env, admin, params: [id] }) {
  if (!chatContactReady(env)) fail(404, "Not found");
  const body = await readJson(request), convId = Number(id), contactId = body?.contact_id ?? null, version = body?.version;
  if (contactId !== null && !(Number.isSafeInteger(contactId) && contactId > 0)) fail(400, "Choose a contact");
  if (!Number.isSafeInteger(version) || version < 0) fail(400, "Reload the conversation first");
  const cur = await env.DB.prepare("SELECT contact_id, contact_version FROM channel_conversations WHERE id = ?").bind(convId).first() ?? gone();
  const stale = () => fail(409, "Someone changed this conversation's contact. Check the contact shown now.");
  if (cur.contact_version !== version) stale();
  if (cur.contact_id !== contactId) {
    const event = (contact, type) => logEvent(env, { actor: admin, entity_type: "contact", entity_id: String(contact), type,
      data: { facebook_conversation_id: convId } }, null, { ifInserted: true });
    const [r] = await env.DB.batch([
      env.DB.prepare(`UPDATE channel_conversations SET contact_id = ?1, contact_version = contact_version + 1
        WHERE id = ?2 AND contact_version = ?3 AND contact_id IS ?4 AND (?1 IS NULL OR EXISTS (SELECT 1 FROM contacts WHERE id = ?1))`)
        .bind(contactId, convId, version, cur.contact_id),
      ...(cur.contact_id !== null ? event(cur.contact_id, "contact.facebook_unlinked") : []),
      ...(contactId !== null ? event(contactId, "contact.facebook_linked") : []),
    ]);
    if (!r.meta.changes) {
      const again = await env.DB.prepare("SELECT contact_id, contact_version FROM channel_conversations WHERE id = ?").bind(convId).first() ?? gone();
      if (again.contact_version !== version || again.contact_id !== cur.contact_id) stale();
      fail(404, "Contact not found");
    }
  }
  return json({ contact_link: await contactLink(env, convId) ?? gone() });
}

export default [
  ["GET", /^\/admin\/facebook$/, list, true],
  ["GET", /^\/admin\/facebook\/(\d+)$/, detail, true],
  ["POST", /^\/admin\/facebook\/(\d+)\/reply$/, reply, true],
  ["POST", /^\/admin\/facebook\/(\d+)\/handled$/, handled, true],
  ["POST", /^\/admin\/facebook\/(\d+)\/contact$/, link, true],
  ["DELETE", /^\/admin\/facebook\/(\d+)$/, remove, true],
];
