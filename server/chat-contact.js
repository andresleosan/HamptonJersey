import { json, fail, readJson } from "./http.js";
import { logEvent } from "./events.js";
import { normalizePhone } from "./applicants.js";

// MSG-03: a person links a website chat to an existing contact, or unlinks it, from Messages. Nothing links on its own:
// a contact with the visitor's email or phone is only a suggestion. contact_version (migration 0093) is the link's
// compare-and-set token. Linking touches neither the chat's last_at nor the contact's retention clock. Mounted by
// server/api.js only with MSG03_CONTACT_LINK_READY; switched off, nothing here exists.
export const chatContactReady = env => env?.MSG03_CONTACT_LINK_READY === "1";

const deleted = () => fail(404, "This chat was deleted");
// The contact's record in the panel is one of its searches: an open one first, the newest.
const CONTACT = `c.id, c.name, c.email, c.phone, (SELECT a.id FROM applicants a WHERE a.contact_id = c.id
  ORDER BY a.archived_at IS NOT NULL, a.created_at DESC, a.id DESC LIMIT 1) AS applicant_id`;

// What Messages shows for one chat: the linked contact, the version to send back and the suggestions.
export async function chatContactLink(env, chatId) {
  const chat = await env.DB.prepare("SELECT email, phone, contact_id, contact_version FROM chats WHERE id = ?").bind(chatId).first();
  if (!chat) return null;
  const [{ results: [contact] }, { results: suggestions }] = await env.DB.batch([
    env.DB.prepare(`SELECT ${CONTACT} FROM contacts c WHERE c.id = ?`).bind(chat.contact_id),
    env.DB.prepare(`SELECT ${CONTACT} FROM contacts c WHERE c.id IS NOT ? AND (c.email = ? OR c.phone = ?) ORDER BY c.id LIMIT 5`)
      .bind(chat.contact_id, chat.email, chat.phone),
  ]);
  return { contact: contact ?? null, version: chat.contact_version, suggestions };
}

async function link({ request, env, admin, params: [id] }) {
  const body = await readJson(request), chatId = Number(id);
  const contactId = body?.contact_id ?? null, version = body?.version;
  if (contactId !== null && !(Number.isSafeInteger(contactId) && contactId > 0)) fail(400, "Choose a contact");
  if (!Number.isSafeInteger(version) || version < 0) fail(400, "Reload the chat first");
  const cur = await env.DB.prepare("SELECT contact_id, contact_version FROM chats WHERE id = ?").bind(chatId).first() ?? deleted();
  const stale = () => fail(409, "Someone changed this chat's contact. Check the contact shown now.");
  if (cur.contact_version !== version) stale();
  if (cur.contact_id !== contactId) {
    const event = (contact, type) => logEvent(env, { actor: admin, entity_type: "contact", entity_id: String(contact), type,
      data: { chat_id: chatId } }, null, { ifInserted: true });
    // Each event only if the statement before it wrote: the update, then the unlink event. The contact read is part of
    // the guard: a contact deleted meanwhile unlinks the chat without a new version (ON DELETE SET NULL), and no event
    // may then be written for it.
    const [r] = await env.DB.batch([
      env.DB.prepare(`UPDATE chats SET contact_id = ?1, contact_version = contact_version + 1
        WHERE id = ?2 AND contact_version = ?3 AND contact_id IS ?4
        AND (?1 IS NULL OR EXISTS (SELECT 1 FROM contacts WHERE id = ?1))`)
        .bind(contactId, chatId, version, cur.contact_id),
      ...(cur.contact_id !== null ? event(cur.contact_id, "contact.chat_unlinked") : []),
      ...(contactId !== null ? event(contactId, "contact.chat_linked") : []),
    ]);
    if (!r.meta.changes) {
      const now = await env.DB.prepare("SELECT contact_id, contact_version FROM chats WHERE id = ?").bind(chatId).first() ?? deleted();
      if (now.contact_version !== version || now.contact_id !== cur.contact_id) stale();
      fail(404, "Contact not found");
    }
  }
  return json({ contact_link: await chatContactLink(env, chatId) ?? deleted() });
}

// The search box: a name, an email or a phone, at most 10 contacts. A phone as written in Jersey ("07797 123456") is
// the stored +447797123456; other digits match on their last 9, as the applicant's viewings do (routes/applicants.js),
// or anywhere when shorter. Fewer than 2 digits never search phones.
async function search({ request, env }) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2 || q.length > 100) fail(400, "Type at least 2 characters");
  const like = s => `%${s.replace(/[\\%_]/g, c => `\\${c}`)}%`, digits = q.replace(/[\s\-.()+]/g, "");
  const phone = normalizePhone(q), part = /^\d{2,}$/.test(digits) ? (digits.length >= 9 ? `%${digits.slice(-9)}` : `%${digits}%`) : null;
  const { results: contacts } = await env.DB.prepare(`SELECT ${CONTACT} FROM contacts c
    WHERE lower(c.name) LIKE ?1 ESCAPE '\\' OR c.email LIKE ?1 ESCAPE '\\' OR c.phone = ?2 OR c.phone LIKE ?3
    ORDER BY c.name, c.id LIMIT 10`).bind(like(q), phone, part).all();
  return json({ contacts });
}

// The contact's linked chats, newest first. No message text. Also the applicant record's Messages tab (SAP-08).
export const linkedChats = async (env, contactId) => (await env.DB.prepare(`SELECT id, status, created_at, last_at
  FROM chats WHERE contact_id = ? ORDER BY last_at DESC, id DESC LIMIT 50`).bind(Number(contactId)).all()).results;

async function contactChats({ env, params: [id] }) {
  if (!(await env.DB.prepare("SELECT 1 FROM contacts WHERE id = ?").bind(Number(id)).first())) fail(404, "Contact not found");
  return json({ chats: await linkedChats(env, id) });
}

export default [
  ["POST", /^\/admin\/chats\/(\d+)\/contact$/, link, true],
  ["GET", /^\/admin\/contacts$/, search, true],
  ["GET", /^\/admin\/contacts\/(\d+)\/chats$/, contactChats, true],
];
