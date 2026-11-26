import { json, fail, readJson, now } from "./http.js";
import { messageText, TEAM_MAX } from "./chat.js";
import { canUseHermesDrafts, draftersOnly } from "./hermes-drafters.js";

// MSG-01 (docs/roadmap/work/MSG-01/plan-borrador-hermes.md): Hermes drafts a reply to a Facebook conversation. A drafter
// (AUT-15) asks for one conversation; Hermes, through its own door (HERMES_REPLY_KEY), claims it, reads only the text of the
// last messages and writes the draft; a person uses it (it fills the reply box, nothing more) or discards it and sends the
// reply with the usual route. Nothing is asked on its own and Hermes never sends. Migration 0130; switch MSG01_HERMES_DRAFTS_READY.
export const repliesReady = env => env?.MSG01_HERMES_DRAFTS_READY === "1";
const STALE_MINUTES = 10, ATTEMPTS = 3, LAST = 10, CHARS = 4000;
const OPEN = "'queued', 'working', 'draft'";
// Void: they wrote after the draft was asked, or the conversation is handled. A void draft is never offered to use.
const VOID = `(EXISTS (SELECT 1 FROM channel_messages m WHERE m.conversation_id = d.conversation_id AND m.direction = 'in'
  AND m.id > d.last_message_id) OR EXISTS (SELECT 1 FROM channel_conversations c WHERE c.id = d.conversation_id AND c.status = 'handled'))`;

// Before migration 0130 nothing here exists.
const gate = handler => async ctx => {
  try { return await handler(ctx); }
  catch (e) { if (/no such table: channel_reply_drafts/.test(String(e?.message))) fail(404, "Not found"); throw e; }
};

// The last 10 messages' text, oldest first, 4000 characters in all (the newest kept): direction, time and text, nothing else.
async function thread(env, conversation) {
  const { results } = await env.DB.prepare(`SELECT direction, sent_at AS at, text FROM channel_messages
    WHERE conversation_id = ? AND COALESCE(status, '') <> 'failed' ORDER BY id DESC LIMIT ${LAST}`).bind(conversation).all();
  const out = [];
  let room = CHARS;
  for (const m of results) {
    if (room <= 0) break;
    const text = m.text.slice(0, room);
    out.unshift({ direction: m.direction, at: m.at, text });
    room -= text.length;
  }
  return out;
}

// The door: the oldest draft to write, or one taken over 10 minutes ago with no text. One UPDATE claims it, so two polls
// never get the same draft. A stale draft at its third attempt fails instead.
async function next({ env }) {
  const ts = now(), stale = new Date(Date.now() - STALE_MINUTES * 60e3).toISOString();
  await env.DB.prepare("UPDATE channel_reply_drafts SET status = 'failed' WHERE status = 'working' AND claimed_at <= ? AND attempts >= ?")
    .bind(stale, ATTEMPTS).run();
  const draft = await env.DB.prepare(`UPDATE channel_reply_drafts SET status = 'working', attempts = attempts + 1, claimed_at = ?1
    WHERE id = (SELECT d.id FROM channel_reply_drafts d WHERE (d.status = 'queued' OR (d.status = 'working' AND d.claimed_at <= ?2))
      AND NOT ${VOID} ORDER BY d.created_at, d.id LIMIT 1) RETURNING id, conversation_id`).bind(ts, stale).first();
  if (!draft) return json({ draft: null });
  return json({ draft: { id: draft.id, messages: await thread(env, draft.conversation_id) } });
}

async function write({ request, env, params: [id] }) {
  const text = messageText((await readJson(request, 16384))?.text, TEAM_MAX);
  if (!text) fail(400, `Send the reply text (up to ${TEAM_MAX} characters)`);
  const r = await env.DB.prepare("UPDATE channel_reply_drafts SET status = 'draft', text = ?, drafted_at = ? WHERE id = ? AND status = 'working'")
    .bind(text, now(), Number(id)).run();
  if (r.meta.changes) return json({ ok: true });
  if (!(await env.DB.prepare("SELECT 1 FROM channel_reply_drafts WHERE id = ?").bind(Number(id)).first())) fail(404, "Draft not found");
  fail(409, "This draft is not being worked on");
}

export const repliesDoor = [
  ["POST", /^\/replies\/next$/, gate(next)],
  ["POST", /^\/replies\/(\d+)\/draft$/, gate(write)],
];

// The panel's side. What a conversation shows: its latest draft still open or failed; a used or discarded one shows nothing.
// {} (no `drafts`) while switched off, before the migration, or for someone off the drafters list: no button.
export async function draftsView(env, admin, conversation) {
  if (!repliesReady(env) || !(await canUseHermesDrafts(env, admin))) return {};
  let d;
  try {
    d = await env.DB.prepare(`SELECT d.id, d.status, d.text, d.created_at, d.drafted_at, ${VOID} AS stale FROM channel_reply_drafts d
      WHERE d.conversation_id = ? ORDER BY d.id DESC LIMIT 1`).bind(conversation).first();
  } catch (e) { if (/no such table: channel_reply_drafts/.test(String(e?.message))) return {}; throw e; }
  if (!d || ["used", "discarded"].includes(d.status)) return { drafts: { draft: null } };
  const status = d.status !== "failed" && d.stale ? "void" : d.status;
  return { drafts: { draft: { id: d.id, status, created_at: d.created_at, ...(status === "draft" && { text: d.text }) } } };
}

async function ask({ env, admin, params: [id] }) {
  const conversation = await env.DB.prepare("SELECT status FROM channel_conversations WHERE id = ?").bind(Number(id)).first();
  if (!conversation) fail(404, "This conversation was deleted");
  if (conversation.status === "handled") fail(409, "This conversation is marked as handled. There is nothing to answer.");
  // A void draft no longer blocks: the person is asking for a new one.
  await env.DB.prepare(`UPDATE channel_reply_drafts SET status = 'discarded', decided_at = ?2, decided_by = 'system'
    WHERE id IN (SELECT d.id FROM channel_reply_drafts d WHERE d.conversation_id = ?1 AND d.status IN (${OPEN}) AND ${VOID})`)
    .bind(Number(id), now()).run();
  try {
    const draft = await env.DB.prepare(`INSERT INTO channel_reply_drafts (conversation_id, last_message_id, requested_by, created_at)
      SELECT c.id, COALESCE((SELECT MAX(m.id) FROM channel_messages m WHERE m.conversation_id = c.id), 0), ?, ? FROM channel_conversations c
      WHERE c.id = ? AND c.status <> 'handled' RETURNING id, status, created_at`).bind(admin, now(), Number(id)).first();
    if (!draft) fail(409, "This conversation was just marked as handled.");
    return json({ draft }, 201);
  } catch (e) {
    if (/UNIQUE/i.test(String(e?.message))) fail(409, "A draft for this conversation is already on its way.");
    throw e;
  }
}

const decide = (to, from, where, message) => async ({ env, admin, params: [id, draft] }) => {
  const d = await env.DB.prepare(`UPDATE channel_reply_drafts SET status = '${to}', decided_at = ?, decided_by = ?
    WHERE id = ? AND conversation_id = ? AND status IN (${from}) AND ${where} RETURNING id, status, text`)
    .bind(now(), admin, Number(draft), Number(id)).first();
  if (!d) fail(409, message);
  return json({ draft: { id: d.id, status: d.status, ...(to === "used" && { text: d.text }) } });
};
// The update's own table is not aliased `d`, so the void test is repeated against it.
const NOT_VOID = VOID.replace(/\bd\./g, "channel_reply_drafts.");

export const replyRoutes = [
  ["POST", /^\/admin\/facebook\/(\d+)\/draft$/, draftersOnly(gate(ask)), true],
  ["POST", /^\/admin\/facebook\/(\d+)\/draft\/(\d+)\/use$/, draftersOnly(gate(decide("used", "'draft'", `NOT ${NOT_VOID}`,
    "This draft is out of date or already closed. Ask for a new one."))), true],
  ["POST", /^\/admin\/facebook\/(\d+)\/draft\/(\d+)\/discard$/, draftersOnly(gate(decide("discarded", OPEN, "1 = 1",
    "This draft is already closed."))), true],
];
