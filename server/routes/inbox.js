import { json, fail, readJson, now } from "../http.js";
import { logEvent, resolveNotices } from "../events.js";
import { validateViewing, jerseyNow, isFree, addMinutes, SLOT_MINUTES, ACTIVE, OUTCOMES } from "../viewings.js";
import { loadAvailability, bookStatement, slotGuard, policySnapshot, propertyViewingGuard } from "../viewing-store.js";
import { touchByViewing } from "../retention.js";
import houseRuleRoutes, { noticeCheck } from "../house-rules.js";
import { cycleOn, REMINDER_CHANNELS, outcomeReady, followUp } from "../viewing-cycle.js";
import { vis14Ready } from "../viewing-groups.js";
import { calendarBusyCheck, afterViewingChange } from "../viewing-calendar.js";
import { coordinationOn, closeOpenProposal, agreedWithAdvertiserSql } from "../viewing-coordination.js";
import { provenanceReady, agencyHome } from "../listing-provenance.js";

const taken = () => json({ error: "That time was just booked. Please choose another." }, 409);
const fields = f => json({ error: "Please check the highlighted fields.", fields: f }, 400);
const stale = "Someone else saved changes to this viewing. Reload to see them (your changes were not saved).";
// VIS-12: the negotiator's Google Calendar, when connected and switched on (null otherwise: nothing is checked).
// calendar_reviewed: { negotiator_id, date, time } staff checked in that calendar themselves (that slot only), kept with the event.
const calendarCheck = (env, body, slot) => calendarBusyCheck(env, slot, { reviewed: body.calendar_reviewed });
const busy = cal => json({ error: cal.error, code: cal.code }, 409);

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
  // VIS-08: cycle tells the panel that reminders and feedback can be recorded (switched on and migrated). VIS-04:
  // follow_up, that a decision to proceed or to ask for more leaves a task in the Inbox. VIS-14: groups, that houses with
  // several requests can be planned as back-to-back times or an open viewing.
  // VIS-17: coordination, that a viewing can be coordinated with several people (switched on and migrated).
  return json({ viewings, counts, ...(await cycleOn(env, viewings[0]) ? { cycle: true } : {}),
    ...(outcomeReady(env) ? { follow_up: true } : {}), ...(vis14Ready(env) ? { groups: true } : {}),
    ...(await coordinationOn(env) ? { coordination: true } : {}) });
}

// Task links resolve independently of the list's 500-row window and use the same Jersey tab clock.
async function detail({ env, params: [value] }) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) fail(400, "Invalid viewing ID");
  const viewing = await env.DB.prepare(`SELECT v.*, COALESCE(l.title, v.listing_title_snapshot) AS listing_title,
    COALESCE(n.name, v.agent) AS negotiator_name FROM viewing_requests v
    LEFT JOIN listings l ON l.id = v.listing_id LEFT JOIN negotiators n ON n.id = v.negotiator_id WHERE v.id = ?`)
    .bind(Number(value)).first();
  if (!viewing) fail(404, "Viewing not found");
  const clock = jerseyNow();
  const upcoming = viewing.date > clock.date || (viewing.date === clock.date && (viewing.end_time ?? viewing.time) >= clock.time);
  const tab = viewing.status === "requested" ? "requests" : viewing.status === "confirmed" ? (upcoming ? "upcoming" : "outcome") : "past";
  return json({ viewing, tab });
}

function readNotes(body) {
  if (body.notes == null) return null;
  if (typeof body.notes !== "string") fail(400, "Notes must be text");
  const n = body.notes.trim();
  if (n.length > 4000) fail(400, "Notes can be at most 4000 characters");
  return n || null;
}

// The name and slots of `negotiator_id` on `date`, today's still to come; null when inactive (they take no new viewings).
// policy, parish: VIS-09's saved rules, read with those slots (null policy: the gate is off, the fixed rules).
async function dayOf(env, { negotiator_id, date, listing_id }, clock) {
  const a = await loadAvailability(env, { from: date, days: 1, now: clock, fromTomorrow: false, negotiatorId: negotiator_id, listingId: listing_id });
  return a.negotiators.length ? { name: a.negotiators[0].name, slots: a.days[0].slots[negotiator_id],
    property_viewings_enabled: a.property_viewings_enabled, policy: a.policies?.[negotiator_id] ?? null, parish: a.parish ?? null } : null;
}

// C14: booked by the team, so confirmed at once; NOT-01 adds an informational Feed fact. Any existing listing will do.
async function create({ request, env, admin, waitUntil }) {
  const body = await readJson(request), clock = jerseyNow();
  const r = validateViewing(body, { today: clock.date, panel: true });
  if (r.errors) return fields(r.errors);
  const v = { ...r.value, notes: readNotes(body) };
  if (v.listing_id && !(await env.DB.prepare("SELECT 1 FROM listings WHERE id = ?").bind(v.listing_id).first()))
    return fields({ listing_id: "Unknown property" });
  // SAP-09: with BUS-07 and VIS-17 on, a home another agency advertises is never booked as confirmed by the team: its time
  // is proposed from the applicant's record and confirmed once the agency accepts. Either off: as before.
  // reason, not code: the panel reads code as a Google Calendar refusal (VIS-12).
  if (v.listing_id && provenanceReady(env) && await coordinationOn(env) && await agencyHome(env, v.listing_id))
    return json({ error: AGENCY_HOME, reason: "agency_listing" }, 409);
  const day = await dayOf(env, v, clock), slots = day?.slots;
  if (day?.property_viewings_enabled === false) return fields({ listing_id: "Viewings are disabled for this property." });
  if (!slots) return fields({ negotiator_id: "Choose an active negotiator" });
  if (!isFree(slots, v.time))
    return slots.some(s => s.time === v.time) ? taken() : fields({ time: "That time is not available. Please choose another." });
  // VIS-10: short of a tenanted house's notice, only once staff confirm that access is agreed (kept in the event).
  const notice = await noticeCheck(env, v, clock, body.notice_confirmed === true);
  if (notice.error) return fields({ notice_confirmed: notice.error });
  const cal = await calendarCheck(env, body, { negotiator_id: v.negotiator_id, date: v.date, time: v.time,
    end_time: addMinutes(v.time, day.policy?.duration_minutes ?? SLOT_MINUTES) });
  if (cal?.error) return busy(cal);
  // C6, as on the website: if another booking took the slot since the check, nothing at all is written.
  const [booked] = await env.DB.batch([
    bookStatement(env, v, { status: "confirmed", policy: day.policy, parish: day.parish, actor: admin, notice: notice.guard }),
    ...(day.policy ? [policySnapshot(env, day.policy, day.parish)] : []),
    ...logEvent(env, { actor: admin, entity_type: "viewing", entity_id: null, type: "viewing.booked",
      data: { listing_id: v.listing_id, date: v.date, time: v.time, kind: v.kind, negotiator_id: v.negotiator_id,
        ...(notice.confirmed ? { notice_confirmed: true } : {}), ...(cal?.reviewed ? { calendar_reviewed: true } : {}) } }, null,
    { ifInserted: true }),
    touchByViewing(env, v, now()),
  ]);
  if (!booked.meta.changes) return taken();
  afterViewingChange(env, waitUntil, booked.meta.last_row_id);
  return json({ id: booked.meta.last_row_id }, 201);
}

// C7: the statuses each action leaves from, and where it goes (reschedule keeps the status). VIS-08: remind and
// feedback keep it too, and exist only with the cycle on.
const FROM = { confirm: ["requested"], cancel: ACTIVE, reschedule: ACTIVE, complete: ["confirmed"], no_show: ["confirmed"],
  remind: ["confirmed"], feedback: ["completed"] };
const TO = { confirm: "confirmed", cancel: "cancelled", complete: "completed", no_show: "no_show" };
// VIS-17: what each action makes of the viewing's open proposal.
const CLOSES = { reschedule: "superseded", cancel: "cancelled", complete: "cancelled", no_show: "cancelled" };
const COORDINATING = "This viewing is being coordinated with several people. Record their answers, or propose another time.";
// SAP-09: another agency's home: booked only once the agency accepts a proposed time (VIS-17).
const AGENCY_HOME = "Another agency advertises this property, so it cannot be booked as confirmed here. Use Book viewing on the "
  + "applicant's record to propose the time; it is confirmed once the client and the agency accept.";
const AGENCY_PENDING = "Another agency advertises this property, so it is confirmed only with the agency's acceptance: use "
  + "Propose a time and record their answer.";

// The columns an action sets, its event data (and name, when it is not the status), and the conditions its UPDATE
// must still meet: for a reschedule the clash it must not have (C6). cycle: VIS-08 is on; ts: the time of the write.
// VIS-17's confirming write reuses the reschedule's (server/routes/viewing-coordination.js).
export async function change(env, action, body, cur, clock, admin, cycle, ts) {
  if (action === "remind") {
    if (!REMINDER_CHANNELS.includes(body.channel)) return { errors: { channel: "Choose how you reminded them" } };
    if (`${cur.date} ${cur.end_time ?? cur.time}` < `${clock.date} ${clock.time}`)
      fail(409, "This viewing's time has passed. Record how it went instead.");
    return { set: { reminded_at: ts, reminded_by: admin, reminded_channel: body.channel }, event: "reminded", data: { channel: body.channel } };
  }
  if (action === "complete" || action === "feedback") {
    if (action === "feedback" && cur.outcome) fail(409, "Feedback is already recorded for this viewing.");
    // VIS-08: a viewing can be completed before the client answers (outcome: null); the answer is then recorded later
    // as feedback. Either way the outcome and its note are VIS-04's, with when and who (the note never in the event).
    const waiting = cycle && action === "complete" && body.outcome === null, errors = {};
    if (!waiting && !OUTCOMES.includes(body.outcome)) errors.outcome = "Choose an outcome";
    const note = body.outcome_note == null ? "" : body.outcome_note;
    if (typeof note !== "string" || note.trim().length > 500) errors.outcome_note = "Use 500 characters or fewer";
    if (Object.keys(errors).length) return { errors };
    return { set: { ...(action === "complete" ? { status: "completed" } : {}), outcome: body.outcome, outcome_note: note.trim() || null,
        ...(cycle && !waiting ? { feedback_at: ts, feedback_by: admin } : {}) },
      data: { outcome: body.outcome }, ...(action === "feedback" ? { event: "feedback" } : {}),
      notice: followUp(env, cur, body.outcome) }; // VIS-04: the team's next step, as an Inbox task
  }
  if (action === "confirm" && cycle) {
    // VIS-10's notice again, as for a booking (create): a request made in time can be short of it by now, and a
    // request seeded by the team never passed it.
    const notice = await noticeCheck(env, cur, clock, body.notice_confirmed === true);
    if (notice.error) return { errors: { notice_confirmed: notice.error } };
    return { set: { status: "confirmed" }, property: notice.guard, data: notice.confirmed ? { notice_confirmed: true } : null };
  }
  if (action !== "reschedule") return { set: { status: TO[action] } };
  // The panel's rules for negotiator, date and time (validateViewing's other fields are the booking's, already stored).
  const { errors = {} } = validateViewing({ negotiator_id: body.negotiator_id, date: body.date, time: body.time },
    { today: clock.date, panel: true });
  const wrong = Object.fromEntries(["negotiator_id", "date", "time"].filter(k => errors[k]).map(k => [k, errors[k]]));
  if (Object.keys(wrong).length) return { errors: wrong };
  const to = { negotiator_id: Number(body.negotiator_id), date: body.date, time: body.time };
  const propertySlot = { ...to, listing_id: cur.listing_id };
  const who = await dayOf(env, propertySlot, clock);
  if (who?.property_viewings_enabled === false) return { errors: { listing_id: "Viewings are disabled for this property." } };
  if (!who) return { errors: { negotiator_id: "Choose an active negotiator" } };
  // On the grid, inside the hours, still to come. Whether it is free is the UPDATE's call: the viewing's own slot and
  // its neighbours show as booked by itself, and clash() leaves it out.
  if (!who.slots.some(s => s.time === to.time)) return { errors: { time: "That time is not available. Please choose another." } };
  const { policy, parish } = who, duration = policy?.duration_minutes ?? SLOT_MINUTES;
  // VIS-10: as for a new booking (create): the house's notice, or staff's confirmation that access is agreed.
  const notice = await noticeCheck(env, propertySlot, clock, body.notice_confirmed === true);
  if (notice.error) return { errors: { notice_confirmed: notice.error } };
  const property = propertyViewingGuard(propertySlot, { duration }), n = notice.guard;
  return {
    // VIS-08: a reminder was of the old time; at another one the client has not been reminded.
    set: { ...to, end_time: addMinutes(to.time, duration), agent: who.name,
      ...(cycle && (to.date !== cur.date || to.time !== cur.time) ? { reminded_at: null, reminded_by: null, reminded_channel: null } : {}) },
    guard: slotGuard(env, propertySlot, { policy, parish, actor: admin, excludeId: cur.id }),
    property: n ? { sql: `${property.sql} AND ${n.sql}`, binds: [...property.binds, ...n.binds] } : property,
    snapshot: policy ? policySnapshot(env, policy, parish, cur.id) : null,
    data: { from: { negotiator_id: cur.negotiator_id, date: cur.date, time: cur.time }, to,
      ...(notice.confirmed ? { notice_confirmed: true } : {}) },
  };
}

// C7 with optimistic locking: the client sends the updated_at it saw (null for a request never edited).
// VIS-14's plans move and cancel viewings through it too (server/routes/viewing-groups.js).
export async function runAction({ env, admin, id, body, waitUntil }) {
  if (!("updated_at" in body) || (body.updated_at !== null && typeof body.updated_at !== "string"))
    fail(400, "Missing updated_at: reload the viewing");
  if (!Object.hasOwn(FROM, body.action)) fail(400, "Unknown action");
  const cur = await env.DB.prepare("SELECT * FROM viewing_requests WHERE id = ?").bind(id).first();
  if (!cur) fail(404, "Viewing not found");
  const cycle = await cycleOn(env, cur), ts = now();
  if (!cycle && ["remind", "feedback"].includes(body.action)) fail(400, "Unknown action");
  if (!FROM[body.action].includes(cur.status)) fail(409, `This viewing is already ${cur.status === "no_show" ? "marked as a no-show" : cur.status}.`);
  if (cur.updated_at !== body.updated_at) fail(409, stale);
  // VIS-17: while a time is being agreed with several people, Confirm would confirm the old time for all of them.
  // Read first for a clear answer, and checked again inside the UPDATE (a proposal made meanwhile).
  const coordination = await coordinationOn(env), agreeing = coordination && body.action === "confirm";
  const openProposal = () => env.DB.prepare("SELECT 1 FROM viewing_proposals WHERE viewing_id = ? AND state = 'open'").bind(id).first();
  if (agreeing && await openProposal()) fail(409, COORDINATING);
  // SAP-09: a home another agency advertises (BUS-07 on) is confirmed only through a VIS-17 proposal that asked the
  // advertiser and was agreed by everyone, never by a plain Confirm (website requests included). Checked again inside
  // the UPDATE. Hampton's own homes, or BUS-07 off: as before.
  const forAgency = agreeing && await agencyHome(env, cur.listing_id), agreed = { sql: agreedWithAdvertiserSql("?"), binds: [id] };
  const awaitingAgency = async () => !(await env.DB.prepare(`SELECT 1 WHERE ${agreed.sql}`).bind(...agreed.binds).first());
  if (forAgency && await awaitingAgency()) fail(409, AGENCY_PENDING);
  const ch = await change(env, body.action, body, cur, jerseyNow(), admin, cycle, ts);
  if (ch.errors) return fields(ch.errors);
  const slot = body.action === "confirm" ? cur : body.action === "reschedule" ? { ...cur, ...ch.set } : null;
  const cal = slot && await calendarCheck(env, body, { viewing_id: id, negotiator_id: slot.negotiator_id, date: slot.date,
    time: slot.time, end_time: slot.end_time ?? addMinutes(slot.time, SLOT_MINUTES) });
  if (cal?.error) return busy(cal);
  if (cal?.reviewed) ch.data = { ...ch.data, calendar_reviewed: true };
  const cols = Object.keys(ch.set), ref = { entity_type: "viewing", entity_id: String(id) };
  const guards = [ch.guard, ch.property, agreeing && { sql: "NOT EXISTS (SELECT 1 FROM viewing_proposals WHERE viewing_id = ? AND state = 'open')",
    binds: [id] }, forAgency && agreed].filter(Boolean);
  const type = `viewing.${ch.event ?? (body.action === "reschedule" ? "rescheduled" : TO[body.action])}`;
  // The lock and the slot check are part of the UPDATE; the event, the touch and the notice follow only if it changed
  // the row.
  const [r] = await env.DB.batch([
    env.DB.prepare(`UPDATE viewing_requests SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ?
      WHERE id = ? AND updated_at IS ?${guards.map(g => ` AND ${g.sql}`).join("")}`)
      .bind(...Object.values(ch.set), ts, admin, id, body.updated_at, ...guards.flatMap(g => g.binds)),
    // VIS-09: the margins it was moved with, only if the UPDATE wrote (the event below then still follows it).
    ...(ch.snapshot ? [ch.snapshot] : []),
    ...logEvent(env, { actor: admin, ...ref, type, data: ch.data ?? null }, ch.notice ?? null, { ifInserted: true }),
    // G2: a viewing confirmed, moved or held, or the client's answer about it, is activity on the contact with its
    // email or mobile; a no-show, a cancel or the team's own reminder is not. Right after the event (or its VIS-04
    // task, written only with it), so its changes() gate reads that insert.
    ...(["confirm", "reschedule", "complete", "feedback"].includes(body.action) ? [touchByViewing(env, cur, ts)] : []),
    // Confirmed or cancelled, a website request has been dealt with: its Inbox notice is done. Gated on that event, since
    // after a touch changes() is the touch's (each of these actions happens once to a viewing).
    ...(["confirm", "cancel"].includes(body.action) ? [resolveNotices(env, { ...ref, category: "viewing" }, admin, { ifEvent: type })] : []),
    // VIS-17: a move, cancel, completion or no-show ends the time being agreed (only if the UPDATE above wrote).
    ...(coordination && Object.hasOwn(CLOSES, body.action) ? [closeOpenProposal(env, { id, state: CLOSES[body.action], ts, admin })] : []),
  ]);
  if (r.meta.changes) {
    if (["confirm", "reschedule", "cancel"].includes(body.action)) afterViewingChange(env, waitUntil, id);
    return json({ ok: true });
  }
  // Nothing changed: the row went, someone else saved it, or (the lock held) the new slot was taken meanwhile.
  const after = await env.DB.prepare("SELECT updated_at FROM viewing_requests WHERE id = ?").bind(id).first();
  if (!after) fail(404, "Viewing not found");
  if (after.updated_at !== body.updated_at) fail(409, stale);
  if (agreeing && await openProposal()) fail(409, COORDINATING);
  if (forAgency && await awaitingAgency()) fail(409, AGENCY_PENDING);
  if (body.action === "confirm") fail(409, "This property's notice changed while you were confirming. Check it and confirm again.");
  return taken();
}

async function update({ request, env, admin, params: [id], waitUntil }) {
  const body = (await readJson(request)) ?? {};
  if (typeof body !== "object" || Array.isArray(body)) fail(400, "Invalid format");
  if ("action" in body) return runAction({ env, admin, id: Number(id), body, waitUntil });
  if (!("notes" in body)) fail(400, "Nothing to update");
  const r = await env.DB.prepare("UPDATE viewing_requests SET notes = ?, updated_at = ?, updated_by = ? WHERE id = ?")
    .bind(readNotes(body), now(), admin, Number(id)).run();
  if (!r.meta.changes) fail(404, "Viewing not found");
  return json({ ok: true });
}

// The request's personal data goes with it: its notices lose the name, its events their data (NULL, never '').
async function remove({ env, admin, params: [id], waitUntil }) {
  const ref = { entity_type: "viewing", entity_id: String(Number(id)) };
  const [,r] = await env.DB.batch([
    resolveNotices(env, ref, admin),
    env.DB.prepare("DELETE FROM viewing_requests WHERE id = ?").bind(Number(id)),
    env.DB.prepare(`UPDATE notifications SET title = 'Deleted viewing request', task_reason = NULL
      WHERE event_id IN (SELECT id FROM events WHERE entity_type = ? AND entity_id = ?)`).bind(ref.entity_type, ref.entity_id),
    env.DB.prepare("UPDATE events SET data = NULL WHERE entity_type = ? AND entity_id = ?").bind(ref.entity_type, ref.entity_id),
  ]);
  if (!r.meta.changes) fail(404, "Viewing not found");
  afterViewingChange(env, waitUntil, Number(id)); // VIS-12: its Google event, if any, is cancelled
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/viewings$/, list, true],
  ["GET", /^\/admin\/viewings\/([^/]+)$/, detail, true],
  ["POST", /^\/admin\/viewings$/, create, true],
  ["PUT", /^\/admin\/viewings\/(\d+)$/, update, true],
  ["DELETE", /^\/admin\/viewings\/(\d+)$/, remove, true],
  ...houseRuleRoutes, // VIS-10: they answer { enabled: false } until VIS10_HOUSE_RULES_READY and migration 0066
];
