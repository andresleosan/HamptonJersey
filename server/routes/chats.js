import { json, fail, readJson, now } from "../http.js";
import { conversation, messageText, TEAM_MAX, CHAT_DB_NOW, CHAT_KEY_CUTOFF } from "../chat.js";
import { applicantDraftFromChat } from "../chat-applicant.js";

// MSG-02 (spec 2026-11-06): the panel's Messages screen. Waiting chats first, oldest wait first (C7).
const STATUSES = ["waiting", "answered", "handled"];
const deleted = () => fail(404, "This chat was deleted");

async function list({ request, env }) {
  const status = new URL(request.url).searchParams.get("status") ?? "waiting";
  if (status !== "all" && !STATUSES.includes(status)) fail(400, "Invalid status");
  const [{ results: chats }, { results: counts }] = await env.DB.batch([
    env.DB.prepare(`SELECT c.id, c.name, c.status, c.last_at, c.waiting_since, l.title AS listing_title,
      (SELECT text FROM chat_messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_text
      FROM chats c LEFT JOIN listings l ON l.id = c.listing_id ${status === "all" ? "" : "WHERE c.status = ?"}
      ORDER BY c.status = 'waiting' DESC, CASE WHEN c.status = 'waiting' THEN c.waiting_since END, c.last_at DESC, c.id DESC
      LIMIT 200`).bind(...(status === "all" ? [] : [status])),
    env.DB.prepare("SELECT status, COUNT(*) AS n FROM chats GROUP BY status"),
  ]);
  return json({ chats, counts: Object.fromEntries(STATUSES.map(s => [s, counts.find(c => c.status === s)?.n ?? 0])) });
}

async function detail({ env, params: [id] }) {
  const c = await env.DB.prepare(`SELECT c.id, c.name, c.email, c.phone, c.status, c.listing_id, l.title, c.visitor_seen_at,
    c.created_at, c.handled_at, c.handled_by FROM chats c LEFT JOIN listings l ON l.id = c.listing_id WHERE c.id = ?`).bind(Number(id)).first();
  if (!c) deleted();
  const { listing_id, title, ...chat } = c;
  const { messages } = await conversation(env, c.id, { team: true }) ?? deleted(); // deleted in between
  return json({ chat: { ...chat, listing: listing_id ? { id: listing_id, title } : null }, messages });
}

async function applicantDraft({ request, env, params: [id] }) {
  // Browsers often omit Origin on a same-origin GET. Reject explicit cross-origin
  // evidence without requiring headers that legitimate requests may not send.
  const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  if ((origin !== null && origin !== new URL(request.url).origin) ||
      (site !== null && site !== "same-origin" && site !== "none")) fail(403, "Cross-origin request blocked");
  return json(await applicantDraftFromChat(env, Number(id)) ?? deleted());
}

// C13: a reply is a person's, so Pause all outbound does not hold it. The insert finds the chat itself: a chat the visitor
// deleted meanwhile gets nothing written.
async function reply({ request, env, admin, params: [id] }) {
  const text = messageText((await readJson(request, 16384))?.text, TEAM_MAX);
  if (!text) fail(400, `Write a reply (up to ${TEAM_MAX} characters)`);
  const [ins] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO chat_messages (chat_id, role, sent_by, text, created_at)
      SELECT id, 'team', ?, ?, ${CHAT_DB_NOW} FROM chats WHERE id = ?`).bind(admin, text, Number(id)),
    env.DB.prepare(`UPDATE chats SET
      key_hash = CASE WHEN last_at < ${CHAT_KEY_CUTOFF} THEN 'expired:' || id ELSE key_hash END,
      status = 'answered', waiting_since = NULL, last_at = ${CHAT_DB_NOW} WHERE id = ? AND changes() = 1`)
      .bind(Number(id)),
  ]);
  if (!ins.meta.changes) deleted();
  return json(await conversation(env, Number(id), { team: true }), 201);
}

// C7: `last` is the newest message the panel shows; a visitor message after it keeps the chat waiting (409).
async function handled({ request, env, admin, params: [id] }) {
  const last = (await readJson(request))?.last;
  if (!Number.isInteger(last)) fail(400, "Send the last message shown");
  const r = await env.DB.prepare(`UPDATE chats SET status = 'handled', waiting_since = NULL, handled_at = ?, handled_by = ?
    WHERE id = ? AND NOT EXISTS (SELECT 1 FROM chat_messages WHERE chat_id = chats.id AND role = 'visitor' AND id > ?)`)
    .bind(now(), admin, Number(id), last).run();
  if (r.meta.changes) return json({ ok: true });
  if (!(await env.DB.prepare("SELECT 1 FROM chats WHERE id = ?").bind(Number(id)).first())) deleted();
  fail(409, "The visitor has just written again. Read the new message first.");
}

async function remove({ env, params: [id] }) {
  const r = await env.DB.prepare("DELETE FROM chats WHERE id = ?").bind(Number(id)).run();
  if (!r.meta.changes) deleted();
  return new Response(null, { status: 204 });
}

// C3: the switch, with who changed it and when.
export const readWebchat = value => { const v = value ? JSON.parse(value) : {}; return { on: v.on === true, at: v.at ?? null, by: v.by ?? null }; };
async function setSwitch({ request, env, admin }) {
  const on = (await readJson(request))?.on;
  if (typeof on !== "boolean") fail(400, "Send on: true or false");
  const ts = now(), value = JSON.stringify({ on, at: ts, by: admin });
  await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('webchat', ?1, ?2, ?3)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(value, ts, admin).run();
  return json({ webchat: readWebchat(value) });
}

export default [
  ["GET", /^\/admin\/chats$/, list, true],
  ["GET", /^\/admin\/chats\/(\d+)$/, detail, true],
  ["GET", /^\/admin\/chats\/(\d+)\/applicant-draft$/, applicantDraft, true],
  ["POST", /^\/admin\/chats\/(\d+)\/reply$/, reply, true],
  ["POST", /^\/admin\/chats\/(\d+)\/handled$/, handled, true],
  ["DELETE", /^\/admin\/chats\/(\d+)$/, remove, true],
  ["POST", /^\/admin\/webchat$/, setSwitch, true],
];
