import { EMAIL } from "./viewings.js";
import { normalizePhone } from "./applicants.js";
import { sha256 } from "./http.js";

// MSG-02 (spec 2026-11-06): the rules of the website's chat, shared by its public routes and the panel's.
export const KEY_DAYS = 7, KEEP_DAYS = 30, MAX_VISITOR = 40, GAP_MS = 3000, VISITOR_MAX = 1000, TEAM_MAX = 2000;
// D1 evaluates these inside the statement, after any wait for another transaction.
export const CHAT_DB_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export const CHAT_KEY_CUTOFF = `strftime('%Y-%m-%dT%H:%M:%fZ','now','-${KEY_DAYS} days')`;

const blank = v => v == null || (typeof v === "string" && !v.trim());
const text = (v, max) => (typeof v === "string" && v.trim().length >= 1 && v.trim().length <= max ? v.trim() : null);

// C2: name, an email or a phone, the privacy box and the first message. A listing id is checked against the website later.
export function validateStart(b) {
  const errors = {}, err = (k, m) => { errors[k] = m; return null; };
  const name = text(b?.name, 100) ?? err("name", "Enter your name");
  let email = null, phone = null;
  if (!blank(b?.email)) {
    const e = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    email = e.length <= 254 && EMAIL.test(e) ? e : err("email", "Enter a valid email address");
  }
  if (!blank(b?.phone)) phone = (typeof b.phone === "string" && normalizePhone(b.phone)) || err("phone", "Enter a valid phone number");
  if (blank(b?.email) && blank(b?.phone)) {
    err("email", "Enter an email address or a mobile number");
    err("phone", "Enter an email address or a mobile number");
  }
  if (b?.privacy !== true) err("privacy", "Accept the privacy notice to continue");
  const first = text(b?.text, VISITOR_MAX) ?? err("text", `Write your message (up to ${VISITOR_MAX} characters)`);
  const listing_id = typeof b?.listing_id === "string" && /^HE-[A-Z]\d{3,}$/.test(b.listing_id) ? b.listing_id : null;
  return Object.keys(errors).length ? { errors } : { value: { name, email, phone, text: first, listing_id } };
}
export const messageText = text;

// C12: previews share the production database, so the chat never runs on them.
export const previewHost = request => new URL(request.url).hostname.endsWith(".pages.dev");
// C3: new chats only with the switch on (app_settings.webchat), off when the row is missing.
export async function chatOn(env, request) {
  if (previewHost(request)) return false;
  const r = await env.DB.prepare("SELECT json_extract(value, '$.on') AS on_ FROM app_settings WHERE key = 'webchat'").first();
  return r?.on_ === 1;
}

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const newKey = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export const keyHash = sha256;

// C6: the first word of the admin's name, never the email.
export const signature = name => {
  const first = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  return first ? `${first} · Hampton Estates` : "Hampton Estates";
};

// What the visitor sees of a chat, and the panel too (who sent a team message is added there).
export async function conversation(env, chatId, { team = false } = {}) {
  const [{ results: [c] }, { results: msgs }] = await env.DB.batch([
    env.DB.prepare(`SELECT c.status, c.listing_id, l.title FROM chats c
      LEFT JOIN listings l ON l.id = c.listing_id AND l.published = 1 AND l.archived_at IS NULL WHERE c.id = ?`).bind(chatId),
    env.DB.prepare(`SELECT m.id, m.role, m.sent_by, m.text, m.created_at, a.name FROM chat_messages m
      LEFT JOIN admins a ON a.email = m.sent_by WHERE m.chat_id = ? ORDER BY m.id`).bind(chatId),
  ]);
  if (!c) return null;
  return { status: c.status, listing: c.title ? { id: c.listing_id, title: c.title } : null,
    messages: msgs.map(m => ({ id: m.id, role: m.role, from: m.role === "team" ? signature(m.name) : null, text: m.text,
      at: m.created_at, ...(team && m.role === "team" ? { sent_by: m.sent_by } : {}) })) };
}

// A visitor's key and its age are checked in the same read as the returned
// messages, so a chat revoked or deleted after the initial lookup stays private.
export async function visitorConversation(env, chatId, hash) {
  const { results: rows } = await env.DB.prepare(`SELECT c.id AS chat_id, c.status, c.visitor_seen_at,
    c.listing_id, l.title, m.id AS message_id, m.role, m.text, m.created_at, a.name
    FROM chats c LEFT JOIN listings l ON l.id = c.listing_id AND l.published = 1 AND l.archived_at IS NULL
    LEFT JOIN chat_messages m ON m.chat_id = c.id LEFT JOIN admins a ON a.email = m.sent_by
    WHERE c.id = ? AND c.key_hash = ? AND c.last_at >= ${CHAT_KEY_CUTOFF} ORDER BY m.id`).bind(chatId, hash).all();
  if (!rows.length) return null;
  const c = rows[0];
  return { visitor_seen_at: c.visitor_seen_at, chat: { status: c.status,
    listing: c.title ? { id: c.listing_id, title: c.title } : null,
    messages: rows.filter(m => m.message_id !== null).map(m => ({ id: m.message_id, role: m.role,
      from: m.role === "team" ? signature(m.name) : null, text: m.text, at: m.created_at })) } };
}
