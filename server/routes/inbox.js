import { json, fail, readJson, now } from "../http.js";
import { logEvent, resolveNotices } from "../events.js";
import { validateViewing, jerseyNow, isFree, addMinutes, SLOT_MINUTES, ACTIVE, OUTCOMES } from "../viewings.js";
import { loadAvailability, bookStatement, clash } from "../viewing-store.js";

const taken = () => json({ error: "That time was just booked. Please choose another." }, 409);
const fields = f => json({ error: "Please check the highlighted fields.", fields: f }, 400);
const stale = "Someone else saved changes to this viewing. Reload to see them (your changes were not saved).";

// §5's four tabs. "Now" is the Jersey clock: a confirmed viewing stays upcoming until its end time, then needs an outcome.
// Each: [condition (binds: today, time), order].
const TABS = {
  requests: ["v.status = 'requested'", "v.created_at, v.id"],
  upcoming: ["v.status = 'confirmed' AND (v.date, v.end_time) >= (?, ?)", "v.date, v.time, v.id"],
  outcome: ["v.status = 'confirmed' AND (v.date, v.end_time) < (?, ?)", "v.date, v.time, v.id"],
  past: ["v.status IN ('completed', 'no_show', 'cancelled')", "v.date DESC, v.time DESC, v.id DESC"],
};
const bindsOf = (cond, clock) => (cond.includes("?") ? [clock.date, clock.time] : []);

async function list({ request, env }) {
  const q = new URL(request.url).searchParams, listingId = q.get("listing_id");
  if (!Object.hasOwn(TABS, q.get("tab") ?? "")) fail(400, "Invalid tab");
  const tab = TABS[q.get("tab")];
  if (listingId != null && !/^HE-[A-Z]\d{3,}$/.test(listingId)) fail(400, "Unknown property");
  const clock = jerseyNow(), only = listingId == null ? "" : " AND v.listing_id = ?", listing = listingId == null ? [] : [listingId];
  // One listing's viewings are read through its (listing_id, date) index: the unary + keeps SQLite from taking the
  // (status, created_at) one instead, which would read that status's rows of every listing.
  const where = listingId == null ? tab[0] : tab[0].replaceAll("v.status", "+v.status");
  const [viewings, [counts]] = await env.DB.batch([
    env.DB.prepare(`SELECT v.*, COALESCE(l.title, v.listing_title_snapshot) AS listing_title, COALESCE(n.name, v.agent) AS negotiator_name
      FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id LEFT JOIN negotiators n ON n.id = v.negotiator_id
      WHERE ${where}${only} ORDER BY ${tab[1]} LIMIT 500`).bind(...bindsOf(tab[0], clock), ...listing),
    env.DB.prepare(`SELECT ${Object.entries(TABS).map(([k, [cond]]) => `COALESCE(SUM(${cond}), 0) AS ${k}`).join(", ")}
      FROM viewing_requests v WHERE 1${only}`)
      .bind(...Object.values(TABS).flatMap(([cond]) => bindsOf(cond, clock)), ...listing),
  ]).then(r => r.map(x => x.results));
  return json({ viewings, counts });
}

function readNotes(body) {
  if (body.notes == null) return null;
  if (typeof body.notes !== "string") fail(400, "Notes must be text");
  const n = body.notes.trim();
  if (n.length > 4000) fail(400, "Notes can be at most 4000 characters");
  return n || null;
}

// The name and slots of `negotiator_id` on `date`, today's still to come; null when inactive (they take no new viewings).
async function dayOf(env, { negotiator_id, date }, clock) {
  const a = await loadAvailability(env, { from: date, days: 1, now: clock, fromTomorrow: false, negotiatorId: negotiator_id });
  return a.negotiators.length ? { name: a.negotiators[0].name, slots: a.days[0].slots[negotiator_id] } : null;
}

// C14: booked by the team, so confirmed at once and without an Inbox notice. Any listing still in the table will do.
async function create({ request, env, admin }) {
  const body = await readJson(request), clock = jerseyNow();
  const r = validateViewing(body, { today: clock.date, panel: true });
  if (r.errors) return fields(r.errors);
  const v = { ...r.value, notes: readNotes(body) };
  if (v.listing_id && !(await env.DB.prepare("SELECT 1 FROM listings WHERE id = ?").bind(v.listing_id).first()))
    return fields({ listing_id: "Unknown property" });
  const slots = (await dayOf(env, v, clock))?.slots;
  if (!slots) return fields({ negotiator_id: "Choose an active negotiator" });
  if (!isFree(slots, v.time))
    return slots.some(s => s.time === v.time) ? taken() : fields({ time: "That time is not available. Please choose another." });
  // C6, as on the website: if another booking took the slot since the check, nothing at all is written.
  const [booked] = await env.DB.batch([
    bookStatement(env, v, { status: "confirmed" }),
    ...logEvent(env, { actor: admin, entity_type: "viewing", entity_id: null, type: "viewing.booked",
      data: { listing_id: v.listing_id, date: v.date, time: v.time, kind: v.kind, negotiator_id: v.negotiator_id } }, null,
    { ifInserted: true }),
  ]);
  return booked.meta.changes ? json({ id: booked.meta.last_row_id }, 201) : taken();
}

// C7: the statuses each action leaves from, and where it goes (reschedule keeps the status).
const FROM = { confirm: ["requested"], cancel: ACTIVE, reschedule: ACTIVE, complete: ["confirmed"], no_show: ["confirmed"] };
const TO = { confirm: "confirmed", cancel: "cancelled", complete: "completed", no_show: "no_show" };

// The columns an action sets, its event data, and for a reschedule the clash its UPDATE must not have (C6).
async function change(env, action, body, cur, clock) {
  if (action === "complete") {
    const errors = {};
    if (!OUTCOMES.includes(body.outcome)) errors.outcome = "Choose an outcome";
    const note = body.outcome_note == null ? "" : body.outcome_note;
    if (typeof note !== "string" || note.trim().length > 500) errors.outcome_note = "Use 500 characters or fewer";
    if (Object.keys(errors).length) return { errors };
    return { set: { status: "completed", outcome: body.outcome, outcome_note: note.trim() || null }, data: { outcome: body.outcome } };
  }
  if (action !== "reschedule") return { set: { status: TO[action] } };
  // The panel's rules for negotiator, date and time (validateViewing's other fields are the booking's, already stored).
  const { errors = {} } = validateViewing({ negotiator_id: body.negotiator_id, date: body.date, time: body.time },
    { today: clock.date, panel: true });
  const wrong = Object.fromEntries(["negotiator_id", "date", "time"].filter(k => errors[k]).map(k => [k, errors[k]]));
  if (Object.keys(wrong).length) return { errors: wrong };
  const to = { negotiator_id: Number(body.negotiator_id), date: body.date, time: body.time };
  const who = await dayOf(env, to, clock);
  if (!who) return { errors: { negotiator_id: "Choose an active negotiator" } };
  // On the grid, inside the hours, still to come. Whether it is free is the UPDATE's call: the viewing's own slot and
  // its neighbours show as booked by itself, and clash() leaves it out.
  if (!who.slots.some(s => s.time === to.time)) return { errors: { time: "That time is not available. Please choose another." } };
  return {
    set: { ...to, end_time: addMinutes(to.time, SLOT_MINUTES), agent: who.name },
    clash: clash(to, cur.id),
    data: { from: { negotiator_id: cur.negotiator_id, date: cur.date, time: cur.time }, to },
  };
}

// C7 with optimistic locking: the client sends the updated_at it saw (null for a request never edited).
async function runAction({ env, admin, id, body }) {
  if (!("updated_at" in body) || (body.updated_at !== null && typeof body.updated_at !== "string"))
    fail(400, "Missing updated_at: reload the viewing");
  if (!Object.hasOwn(FROM, body.action)) fail(400, "Unknown action");
  const cur = await env.DB.prepare("SELECT * FROM viewing_requests WHERE id = ?").bind(id).first();
  if (!cur) fail(404, "Viewing not found");
  if (!FROM[body.action].includes(cur.status)) fail(409, `This viewing is already ${cur.status === "no_show" ? "marked as a no-show" : cur.status}.`);
  if (cur.updated_at !== body.updated_at) fail(409, stale);
  const ch = await change(env, body.action, body, cur, jerseyNow());
  if (ch.errors) return fields(ch.errors);
  const cols = Object.keys(ch.set), ref = { entity_type: "viewing", entity_id: String(id) };
  // The lock and the slot check are part of the UPDATE; the event and the notice follow only if it changed the row.
  const [r] = await env.DB.batch([
    env.DB.prepare(`UPDATE viewing_requests SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ?
      WHERE id = ? AND updated_at IS ?${ch.clash ? ` AND NOT ${ch.clash.sql}` : ""}`)
      .bind(...Object.values(ch.set), now(), admin, id, body.updated_at, ...(ch.clash?.binds ?? [])),
    ...logEvent(env, { actor: admin, ...ref, type: `viewing.${body.action === "reschedule" ? "rescheduled" : TO[body.action]}`,
      data: ch.data ?? null }, null, { ifInserted: true }),
    // Confirmed or cancelled, a website request has been dealt with: its Inbox notice is done.
    ...(["confirm", "cancel"].includes(body.action) ? [resolveNotices(env, { ...ref, category: "viewing" }, admin, { ifLogged: true })] : []),
  ]);
  if (r.meta.changes) return json({ ok: true });
  // Nothing changed: the row went, someone else saved it, or (the lock held) the new slot was taken meanwhile.
  const after = await env.DB.prepare("SELECT updated_at FROM viewing_requests WHERE id = ?").bind(id).first();
  if (!after) fail(404, "Viewing not found");
  if (after.updated_at !== body.updated_at) fail(409, stale);
  return taken();
}

async function update({ request, env, admin, params: [id] }) {
  const body = (await readJson(request)) ?? {};
  if (typeof body !== "object" || Array.isArray(body)) fail(400, "Invalid format");
  if ("action" in body) return runAction({ env, admin, id: Number(id), body });
  if (!("notes" in body)) fail(400, "Nothing to update");
  const r = await env.DB.prepare("UPDATE viewing_requests SET notes = ?, updated_at = ?, updated_by = ? WHERE id = ?")
    .bind(readNotes(body), now(), admin, Number(id)).run();
  if (!r.meta.changes) fail(404, "Viewing not found");
  return json({ ok: true });
}

// The request's personal data goes with it: its notices lose the name, its events their data (NULL, never '').
async function remove({ env, admin, params: [id] }) {
  const ref = { entity_type: "viewing", entity_id: String(Number(id)) };
  const [r] = await env.DB.batch([
    env.DB.prepare("DELETE FROM viewing_requests WHERE id = ?").bind(Number(id)),
    resolveNotices(env, ref, admin),
    env.DB.prepare(`UPDATE notifications SET title = 'Deleted viewing request'
      WHERE event_id IN (SELECT id FROM events WHERE entity_type = ? AND entity_id = ?)`).bind(ref.entity_type, ref.entity_id),
    env.DB.prepare("UPDATE events SET data = NULL WHERE entity_type = ? AND entity_id = ?").bind(ref.entity_type, ref.entity_id),
  ]);
  if (!r.meta.changes) fail(404, "Viewing not found");
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/viewings$/, list, true],
  ["POST", /^\/admin\/viewings$/, create, true],
  ["PUT", /^\/admin\/viewings\/(\d+)$/, update, true],
  ["DELETE", /^\/admin\/viewings\/(\d+)$/, remove, true],
];
