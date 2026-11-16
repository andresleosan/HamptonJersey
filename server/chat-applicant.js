import { json, fail, readJson, now } from "./http.js";
import { chatContactReady } from "./chat-contact.js";
import { prepareCreate } from "./routes/applicants.js";
import { afterSave } from "./match-store.js";
import { firstSearch } from "./search-state.js";

// MSG-05: a person creates an applicant from a website chat. The chat proposes only the visitor's contact details; a
// chat is not consent for a new search and its text is not a confirmed requirement. Switched off (MSG05_CREATE_READY),
// the draft stays read only and the save route does not exist. It needs MSG-03's contact_version (migration 0093) as
// the chat's compare-and-set token and migration 0098 for the save's key.
export const chatApplicantReady = env => env?.MSG05_CREATE_READY === "1" && chatContactReady(env);

export async function applicantDraftFromChat(env, chatId) {
  if (!Number.isSafeInteger(chatId) || chatId < 1) return null;
  const ready = chatApplicantReady(env);
  const row = await env.DB.prepare(`SELECT name, email, phone${ready ? ", contact_version" : ""} FROM chats WHERE id = ?`)
    .bind(chatId).first();
  if (!row) return null;
  const { contact_version = null, ...contact } = row;
  return { chat_id: chatId, chat_version: contact_version, contact,
    fields: {}, provenance: { contact: "chat", fields: "none" }, save_available: ready };
}

const KEY = /^[A-Za-z0-9-]{16,64}$/;
const deleted = () => fail(404, "This chat was deleted. Nothing was saved.");
const stale = () => fail(409, "This chat changed since you opened it (someone saved or linked its contact). Nothing was saved. Open it again from Messages.");

// POST /admin/chats/:id/applicant {version, operation_key, ...the New applicant form}. One batch writes the save's key,
// the contact (or uses the one offered), the search, its event and the chat's link, or nothing: the key's row is written
// only while the chat still exists at the version the form was opened with, and a key already used returns its applicant.
async function save({ request, env, admin, params: [id] }) {
  const chatId = Number(id), body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "Invalid format");
  const { version, operation_key: key } = body;
  if (typeof key !== "string" || !KEY.test(key)) fail(400, "Reload the form and try again");
  if (!Number.isSafeInteger(version) || version < 0) fail(400, "Reload the form and try again");
  // A double click or a retry after a lost answer: the applicant this key already created, never a second one.
  const replay = async () => {
    const done = await env.DB.prepare("SELECT chat_id, applicant_id FROM chat_applicant_saves WHERE operation_key = ?").bind(key).first();
    if (!done) return null;
    if (done.chat_id !== chatId) fail(409, "Reload the form and try again");
    if (done.applicant_id === null) fail(409, "The applicant saved from this chat was deleted. Nothing was saved again.");
    return json({ id: done.applicant_id, replayed: true });
  };
  const again = await replay();
  if (again) return again;

  const cur = await env.DB.prepare("SELECT contact_id, contact_version FROM chats WHERE id = ?").bind(chatId).first() ?? deleted();
  if (cur.contact_version !== version) stale();
  // A chat already linked to a contact adds the search to that contact; the offer is the same as a duplicate's.
  if (cur.contact_id !== null && Number(body.contact_id) !== cur.contact_id) {
    const c = await env.DB.prepare("SELECT name FROM contacts WHERE id = ?").bind(cur.contact_id).first();
    if (c) return json({ error: `This chat is linked to ${c.name}`, contact_id: cur.contact_id }, 409);
    stale(); // the contact was deleted meanwhile: the chat is unlinked now
  }

  const p = await prepareCreate(env, body, admin);
  if (p.response) return p.response;
  const ts = now();
  const stmts = [
    // The guard: chat_id is NOT NULL, so a chat deleted or changed since the read above fails the whole batch.
    env.DB.prepare(`INSERT INTO chat_applicant_saves (operation_key, chat_id, created_by, created_at)
      VALUES (?1, (SELECT id FROM chats WHERE id = ?2 AND contact_version = ?3 AND contact_id IS ?4), ?5, ?6)`)
      .bind(key, chatId, version, cur.contact_id, admin, ts),
    ...p.head,
    // The search is the row just inserted; an UPDATE leaves last_insert_rowid() for the event that follows.
    env.DB.prepare(`UPDATE chat_applicant_saves SET applicant_id = last_insert_rowid(),
      contact_id = (SELECT contact_id FROM applicants WHERE id = last_insert_rowid()) WHERE operation_key = ?`).bind(key),
    ...p.tail,
    env.DB.prepare(`UPDATE chats SET contact_id = (SELECT contact_id FROM chat_applicant_saves WHERE operation_key = ?1),
      contact_version = contact_version + 1 WHERE id = ?2`).bind(key, chatId),
    // As MSG-03 records a link made by hand; a chat already linked to this contact keeps its link and logs nothing.
    ...(cur.contact_id === null ? [env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
      SELECT ?1, ?2, 'contact', contact_id, 'contact.chat_linked', ?3 FROM chat_applicant_saves WHERE operation_key = ?4`)
      .bind(ts, admin, JSON.stringify({ chat_id: chatId, applicant_created: true }), key)] : []),
  ];
  let results;
  try { results = await env.DB.batch(stmts); } catch (e) {
    const done = await replay();
    if (done) return done;
    const row = await env.DB.prepare("SELECT contact_id, contact_version FROM chats WHERE id = ?").bind(chatId).first() ?? deleted();
    if (row.contact_version !== version || row.contact_id !== cur.contact_id) stale();
    if (p.contact && !(await env.DB.prepare("SELECT 1 FROM contacts WHERE id = ?").bind(p.contact.id).first())) fail(404, "Contact not found");
    return p.conflict(e);
  }
  const newId = results[p.head.length].meta.last_row_id;
  await afterSave(firstSearch, env, newId, admin);
  return json({ id: newId }, 201);
}

export default [
  ["POST", /^\/admin\/chats\/(\d+)\/applicant$/, save, true],
];
