// VIS-17: the panel's routes for a viewing coordinated with several people (server/viewing-coordination.js). Staff
// only; they exist with VIS17_MULTIPART_READY=1 and answer 404 until migration 0114 is applied. Nothing is sent.
import { json, fail, readJson, now } from "../http.js";
import { logEvent, resolveNotices } from "../events.js";
import { validateViewing, jerseyNow, isFree, addMinutes, SLOT_MINUTES, ACTIVE } from "../viewings.js";
import { loadAvailability } from "../viewing-store.js";
import { noticeCheck } from "../house-rules.js";
import { touchByViewing } from "../retention.js";
import { cycleOn } from "../viewing-cycle.js";
import { calendarBusyCheck, afterViewingChange } from "../viewing-calendar.js";
import { change } from "./inbox.js";
import { coordinationOn, validRequired, validateResponse, coordinationState, clientFit, allAcceptedSql, searchesSql,
  searchArgs, operationFits } from "../viewing-coordination.js";

const fields = f => json({ error: "Please check the highlighted fields.", fields: f }, 400);
const STALE = "Someone else changed this proposal. Reload to see it (your change was not saved).";
const idOf = (v, what) => (/^[1-9]\d{0,15}$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : fail(400, `Invalid ${what} ID`));
const windowsOf = s => (s ? JSON.parse(s) : null);

async function viewingOf(env, id) {
  if (!(await coordinationOn(env))) fail(404, "Not found"); // switched on before migration 0114: as switched off
  return (await env.DB.prepare("SELECT * FROM viewing_requests WHERE id = ?").bind(id).first()) ?? fail(404, "Viewing not found");
}
const notActive = v => fail(409, `This viewing is already ${v.status === "no_show" ? "marked as a no-show" : v.status}.`);

// The viewing's coordination as the panel shows it: its latest proposal with every answer, who is still missing, the
// open searches of the person who asked (to link one) and the client's preferred times of the linked one.
async function readState(env, v) {
  const [proposals, searches] = await env.DB.batch([
    env.DB.prepare(`SELECT p.*, n.name AS negotiator_name FROM viewing_proposals p LEFT JOIN negotiators n ON n.id = p.negotiator_id
      WHERE p.viewing_id = ? ORDER BY p.revision DESC LIMIT 1`).bind(v.id),
    env.DB.prepare(searchesSql(false)).bind(...searchArgs(v)),
  ]).then(r => r.map(x => x.results));
  const p = proposals[0] ?? null;
  const [acceptances, linked] = p ? await env.DB.batch([
    env.DB.prepare(`SELECT participant, response, channel, answered_at, answered_by, recorded_at, recorded_by
      FROM viewing_acceptances WHERE proposal_id = ? ORDER BY recorded_at, participant`).bind(p.id),
    env.DB.prepare("SELECT viewing_availability FROM applicants WHERE id = ?").bind(p.applicant_id),
  ]).then(r => [r[0].results, r[1].results[0]]) : [[], null];
  const { state, missing } = coordinationState(p, acceptances), windows = windowsOf(linked?.viewing_availability);
  return {
    coordination_state: state, revision: p?.revision ?? 0, missing, acceptances, windows,
    proposal: p && { id: p.id, revision: p.revision, state: p.state, negotiator_id: p.negotiator_id, negotiator_name: p.negotiator_name,
      date: p.date, time: p.time, end_time: p.end_time, required: JSON.parse(p.required), applicant_id: p.applicant_id,
      notice_confirmed: p.notice_confirmed === 1, created_at: p.created_at, created_by: p.created_by, closed_at: p.closed_at,
      closed_by: p.closed_by, client_fit: clientFit(windows, p) },
    searches: searches.map(s => ({ id: s.id, operation: s.operation, search_state: s.search_state, windows: windowsOf(s.viewing_availability) })),
  };
}

async function read({ env, params: [vid] }) {
  return json(await readState(env, await viewingOf(env, idOf(vid, "viewing"))));
}

// A time for everyone to agree: free for the negotiator and the property now (the viewing's own time excluded), inside
// the house's notice or with access agreed (VIS-10) and, when connected, the negotiator's Google Calendar (VIS-12).
// expected_revision: the latest proposal the panel saw (0 for none). A new proposal supersedes the open one.
async function propose({ request, env, admin, params: [vid] }) {
  const id = idOf(vid, "viewing"), cur = await viewingOf(env, id), body = (await readJson(request)) ?? {};
  if (!Number.isSafeInteger(body.expected_revision) || body.expected_revision < 0) fail(400, "Missing expected_revision: reload the viewing");
  if (!ACTIVE.includes(cur.status)) notActive(cur);
  const clock = jerseyNow(), errors = {}, required = validRequired(body.required);
  if (!required) errors.required = "The client always accepts; choose who else must accept";
  const { errors: slotErrors = {} } = validateViewing({ negotiator_id: body.negotiator_id, date: body.date, time: body.time },
    { today: clock.date, panel: true });
  for (const k of ["negotiator_id", "date", "time"]) if (slotErrors[k]) errors[k] = slotErrors[k];
  let search = null;
  if (body.applicant_id != null) {
    search = Number.isSafeInteger(body.applicant_id) && body.applicant_id > 0
      ? await env.DB.prepare(searchesSql(true)).bind(...searchArgs(cur), body.applicant_id).first() : null;
    const listing = search && cur.listing_id ? await env.DB.prepare("SELECT operation FROM listings WHERE id = ?").bind(cur.listing_id).first() : null;
    if (!search) errors.applicant_id = "Choose one of this person's open searches";
    else if (!operationFits(listing?.operation, search.operation))
      errors.applicant_id = `That search is to ${search.operation}; this property is for ${listing.operation === "sale" ? "sale" : "rent"}`;
  }
  if (Object.keys(errors).length) return fields(errors);
  const nid = Number(body.negotiator_id), slot = { listing_id: cur.listing_id, negotiator_id: nid, date: body.date, time: body.time };
  const a = await loadAvailability(env, { from: body.date, days: 1, now: clock, fromTomorrow: false, negotiatorId: nid, excludeId: id,
    listingId: cur.listing_id });
  if (a.property_viewings_enabled === false) return fields({ time: "Viewings are disabled for this property." });
  if (!a.negotiators.length) return fields({ negotiator_id: "Choose an active negotiator" });
  const slots = a.days[0].slots[nid];
  if (!isFree(slots, body.time)) return slots.some(s => s.time === body.time)
    ? json({ error: "That time was just booked. Please choose another." }, 409) : fields({ time: "That time is not available. Please choose another." });
  const end = addMinutes(body.time, a.policies?.[nid]?.duration_minutes ?? SLOT_MINUTES);
  const notice = await noticeCheck(env, slot, clock, body.notice_confirmed === true);
  if (notice.error) return fields({ notice_confirmed: notice.error });
  const cal = await calendarBusyCheck(env, { viewing_id: id, negotiator_id: nid, date: body.date, time: body.time, end_time: end },
    { reviewed: body.calendar_reviewed });
  if (cal?.error) return json({ error: cal.error, code: cal.code }, 409);
  // Both writes only while the panel's revision is still the latest and the viewing still active: two people proposing
  // at once, the second gets 409. The partial unique index keeps one open proposal per viewing whatever writes it.
  const ts = now(), exp = body.expected_revision;
  const cond = `(SELECT COALESCE(MAX(revision), 0) FROM viewing_proposals WHERE viewing_id = ?) = ?
    AND EXISTS (SELECT 1 FROM viewing_requests WHERE id = ? AND status IN ('requested', 'confirmed'))`, condArgs = [id, exp, id];
  const [, made] = await env.DB.batch([
    env.DB.prepare(`UPDATE viewing_proposals SET state = 'superseded', closed_at = ?, closed_by = ?
      WHERE viewing_id = ? AND state = 'open' AND ${cond}`).bind(ts, admin, id, ...condArgs),
    env.DB.prepare(`INSERT INTO viewing_proposals (viewing_id, revision, applicant_id, negotiator_id, date, time, end_time, required,
        notice_confirmed, created_at, created_by) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${cond}`)
      .bind(id, exp + 1, search?.id ?? null, nid, body.date, body.time, end, JSON.stringify(required), notice.confirmed ? 1 : 0, ts, admin,
        ...condArgs),
    ...logEvent(env, { actor: admin, entity_type: "viewing", entity_id: String(id), type: "viewing.proposed",
      data: { revision: exp + 1, negotiator_id: nid, date: body.date, time: body.time, required, ...(search ? { search_linked: true } : {}),
        ...(notice.confirmed ? { notice_confirmed: true } : {}), ...(cal?.reviewed ? { calendar_reviewed: true } : {}) } }, null,
    { ifInserted: true }),
  ]);
  if (!made.meta.changes) fail(409, STALE);
  return json(await readState(env, cur), 201);
}

// One required person's answer, recorded by staff with its evidence. An accepted answer carries the confirming write:
// it moves the viewing to the proposed time and confirms it only if, inside that write, every required answer is
// accepted, the proposal is still open and the time still passes the reschedule's checks. Two last answers at once:
// D1 runs one batch after the other, so only the second finds them all and exactly one confirms.
async function respond({ request, env, admin, params: [vid, pid], waitUntil }) {
  const id = idOf(vid, "viewing"), proposalId = idOf(pid, "proposal"), cur = await viewingOf(env, id);
  const body = (await readJson(request)) ?? {};
  const p = await env.DB.prepare("SELECT * FROM viewing_proposals WHERE id = ? AND viewing_id = ?").bind(proposalId, id).first();
  if (!p) fail(404, "Proposal not found");
  if (p.state !== "open" || body.revision !== p.revision) fail(409, STALE);
  if (!ACTIVE.includes(cur.status)) notActive(cur);
  const r = validateResponse(body, { required: JSON.parse(p.required), now: Date.now(), since: cur.created_at });
  if (r.errors) return fields(r.errors);
  const v = r.value, ts = now(), ref = { entity_type: "viewing", entity_id: String(id) };
  let commit = null;
  if (v.response === "accepted") {
    commit = await change(env, "reschedule", { negotiator_id: p.negotiator_id, date: p.date, time: p.time,
      notice_confirmed: p.notice_confirmed === 1 }, cur, jerseyNow(), admin, await cycleOn(env, cur), ts);
    if (commit.errors) fail(409, commit.errors.notice_confirmed ?? commit.errors.listing_id
      ?? "The proposed time can no longer be booked. Propose another time.");
  }
  const stmts = [
    env.DB.prepare(`INSERT INTO viewing_acceptances (proposal_id, participant, response, channel, answered_at, answered_by,
        recorded_at, recorded_by)
      SELECT id, ?, ?, ?, ?, ?, ?, ? FROM viewing_proposals WHERE id = ? AND viewing_id = ? AND revision = ? AND state = 'open'
      ON CONFLICT (proposal_id, participant) DO NOTHING`)
      .bind(v.participant, v.response, v.channel, v.answered_at, v.answered_by, ts, admin, p.id, id, p.revision),
    ...logEvent(env, { actor: admin, ...ref, type: "viewing.answer_recorded",
      data: { revision: p.revision, participant: v.participant, response: v.response, channel: v.channel } }, null, { ifInserted: true }),
  ];
  if (v.response === "declined") stmts.push(env.DB.prepare(`UPDATE viewing_proposals SET state = 'declined', closed_at = ?, closed_by = ?
    WHERE id = ? AND state = 'open' AND EXISTS (SELECT 1 FROM viewing_acceptances WHERE proposal_id = ? AND response = 'declined')`)
    .bind(ts, admin, p.id, p.id));
  let at = -1;
  if (commit) {
    const cols = Object.keys(commit.set), guards = [commit.guard, commit.property].filter(Boolean);
    const type = cur.status === "requested" ? "viewing.confirmed" : "viewing.rescheduled";
    at = stmts.length;
    stmts.push(
      env.DB.prepare(`UPDATE viewing_requests SET ${cols.map(c => `${c} = ?`).join(", ")}, status = 'confirmed', updated_at = ?, updated_by = ?
        WHERE id = ? AND status IN ('requested', 'confirmed')${guards.map(g => ` AND ${g.sql}`).join("")}
          AND EXISTS (SELECT 1 FROM viewing_proposals vp WHERE vp.id = ? AND vp.viewing_id = viewing_requests.id AND vp.state = 'open'
            AND ${allAcceptedSql("vp")})`)
        .bind(...Object.values(commit.set), ts, admin, id, ...guards.flatMap(g => g.binds), p.id),
      ...(commit.snapshot ? [commit.snapshot] : []), // VIS-09: the margins it was booked with, only if it wrote
      env.DB.prepare(`UPDATE viewing_proposals SET state = 'confirmed', closed_at = ?, closed_by = ? WHERE id = ? AND state = 'open'
        AND EXISTS (SELECT 1 FROM viewing_requests WHERE id = ? AND updated_at = ? AND updated_by = ? AND status = 'confirmed')`)
        .bind(ts, admin, p.id, id, ts, admin),
      ...logEvent(env, { actor: admin, ...ref, type, data: { ...commit.data, revision: p.revision, coordinated: true } }, null, { ifInserted: true }),
      touchByViewing(env, cur, ts), // G2: a confirmed or moved viewing is activity on the contact (after its event)
      ...(type === "viewing.confirmed" ? [resolveNotices(env, { ...ref, category: "viewing" }, admin, { ifEvent: type })] : []),
    );
  }
  const out = await env.DB.batch(stmts);
  if (!out[0].meta.changes) {
    const again = await env.DB.prepare("SELECT state FROM viewing_proposals WHERE id = ?").bind(p.id).first();
    fail(409, again?.state === "open" ? "Their answer to this proposal is already recorded." : STALE);
  }
  const confirmed = at >= 0 && out[at].meta.changes === 1;
  if (confirmed) afterViewingChange(env, waitUntil, id); // VIS-12: its Google event, when connected
  return json({ ...(await readState(env, cur)), confirmed });
}

export default [
  ["GET", /^\/admin\/viewings\/(\d+)\/coordination$/, read, true],
  ["POST", /^\/admin\/viewings\/(\d+)\/proposals$/, propose, true],
  ["POST", /^\/admin\/viewings\/(\d+)\/proposals\/(\d+)\/responses$/, respond, true],
];
