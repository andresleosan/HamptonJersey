// SPR-08: the team's internal notes about a property (migration 0079). Staff only: the panel's routes below. A
// history: a note, its corrections and its withdrawal are rows added, never rewritten, and only the author of a note
// corrects or withdraws it. A note's text is given only by these routes, and only while it stands: no event,
// notification, listing read or page of the website carries it, and a withdrawn note leaves who and when.
// Off (SPR08_SECTIONS_READY) or before the migration, the routes answer 404 and the property is as before.
import { json, fail, readJson, now } from "./http.js";

const ready = env => env?.SPR08_SECTIONS_READY === "1";
const missing = e => /no such table/.test(e?.message ?? "");
const gone = e => { if (missing(e)) fail(404, "Not found"); throw e; };
const SHOWN = 50;

// Whether the property's Viewings, Notes and Adverts sections are shown: switched on and migrated.
export async function sectionsOn(env) {
  if (!ready(env)) return false;
  try { await env.DB.prepare("SELECT 1 FROM property_notes LIMIT 1").first(); return true; }
  catch (e) { if (missing(e)) return false; throw e; }
}

// The versions in force of a property's notes, by when each was first written, newest first. text null: withdrawn.
// changed_at: when it was corrected or withdrawn. ponytail: the latest 50 (more says so); page if one ever has more.
async function answer(env, id, admin, status = 200) {
  const [[listing], notes] = (await env.DB.batch([
    env.DB.prepare("SELECT 1 FROM listings WHERE id = ?").bind(id),
    env.DB.prepare(`SELECT n.id, n.body AS text, n.created_by AS author, n.written_at,
        CASE WHEN n.replaces IS NOT NULL THEN n.created_at END AS changed_at
      FROM property_notes n WHERE n.listing_id = ? AND NOT EXISTS (SELECT 1 FROM property_notes x WHERE x.replaces = n.id)
      ORDER BY n.written_at DESC, n.id DESC LIMIT ${SHOWN + 1}`).bind(id),
  ]).catch(gone)).map(r => r.results);
  if (!listing) fail(404, "Listing not found");
  return json({ notes: notes.slice(0, SHOWN).map(n => ({ ...n, own: n.author === admin })), ...(notes.length > SHOWN && { more: true }) }, status);
}

// A note's text as sent ({ text }), trimmed; null: none, or longer than the table takes.
const textOf = body => {
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  return text && text.length <= 4000 ? text : null;
};
const refused = () => json({ error: "Please check the highlighted fields.", fields: { text: "Write the note, in 4000 characters or fewer" } }, 400);

const show = ({ env, admin, params: [id] }) => (ready(env) ? answer(env, id, admin) : fail(404, "Not found"));

// The author and the date are the session's and the server's, never the request's.
async function add({ request, env, admin, params: [id] }) {
  if (!ready(env)) fail(404, "Not found");
  const text = textOf(await readJson(request)), ts = now();
  if (!text) return refused();
  await env.DB.prepare(`INSERT INTO property_notes (listing_id, body, written_at, created_at, created_by)
    SELECT id, ?, ?, ?, ? FROM listings WHERE id = ?`).bind(text, ts, ts, admin, id).run().catch(gone);
  return answer(env, id, admin, 201);
}

// A correction (withdraw false) or a withdrawal: a new row that replaces the version the author was reading (noteId).
// The INSERT itself asks again for the author and for a version still in force, so a second tab adds nothing.
async function change({ request, env, admin, params: [id, noteId] }, withdraw) {
  if (!ready(env)) fail(404, "Not found");
  const text = withdraw ? null : textOf(await readJson(request));
  if (!withdraw && !text) return refused();
  const note = await env.DB.prepare("SELECT created_by FROM property_notes WHERE id = ? AND listing_id = ?").bind(Number(noteId), id).first().catch(gone);
  if (!note) fail(404, "Note not found");
  if (note.created_by !== admin) fail(403, "Only the person who wrote a note can change it");
  const done = await env.DB.prepare(`INSERT INTO property_notes (listing_id, replaces, body, written_at, created_at, created_by)
    SELECT o.listing_id, o.id, ?, o.written_at, ?, ? FROM property_notes o
    WHERE o.id = ? AND o.listing_id = ? AND o.created_by = ? AND o.body IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM property_notes x WHERE x.replaces = o.id)`).bind(text, now(), admin, Number(noteId), id, admin).run();
  if (!done.meta.changes) fail(409, "This note was already changed. Reload to see it (your change was not saved).");
  return answer(env, id, admin);
}

export default [
  ["GET", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/notes$/, show, true],
  ["POST", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/notes$/, add, true],
  ["PUT", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/notes\/(\d+)$/, ctx => change(ctx, false), true],
  ["DELETE", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/notes\/(\d+)$/, ctx => change(ctx, true), true],
];
