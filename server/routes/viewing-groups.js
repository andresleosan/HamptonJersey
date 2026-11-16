// VIS-14: the panel's routes for houses with several open requests (only with VIS14_BLOCK_READY=1, migration 0104).
// Staff choose one of two plans: back-to-back times of one negotiator (ordinary viewings, moved one by one through the
// Reschedule action) or an open viewing with places. Nothing is sent: the team tells each person, as today.
import { json, fail, readJson, now, HttpError } from "../http.js";
import { logEvent } from "../events.js";
import { validateViewing, jerseyNow, isFree, addMinutes, SLOT_MINUTES, BUFFER_MINUTES } from "../viewings.js";
import { loadAvailability, slotGuard, propertyViewingGuard } from "../viewing-store.js";
import { noticeCheck } from "../house-rules.js";
import { cycleOn } from "../viewing-cycle.js";
import { COUNTS, inOpenGroupSql, reserveGroupPlace } from "../viewing-groups.js";
import { runAction } from "./inbox.js";

const fields = f => json({ error: "Please check the highlighted fields.", fields: f }, 400);
const taken = () => json({ error: "That time was just booked. Please choose another." }, 409);
const ID = /^[1-9]\d{0,8}$/;

// Houses with two or more requests still to plan (to come, not holding a place), and the open groups to come with their
// counts. A house with an open group lists its remaining requests too, so they can join it. Staff only: names included.
async function overview({ env }) {
  const clock = jerseyNow();
  const [requests, groups] = await env.DB.batch([
    env.DB.prepare(`SELECT v.id, v.listing_id, COALESCE(l.title, v.listing_title_snapshot) AS listing_title, v.name, v.date,
        v.time, v.negotiator_id, v.updated_at
      FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id
      WHERE v.status = 'requested' AND v.listing_id IS NOT NULL AND (v.date, v.time) > (?, ?) AND NOT ${inOpenGroupSql("v")}
      ORDER BY v.listing_id, v.date, v.time, v.id LIMIT 500`).bind(clock.date, clock.time),
    env.DB.prepare(`SELECT g.id, g.listing_id, COALESCE(l.title, g.listing_id) AS listing_title, g.negotiator_id,
        n.name AS negotiator_name, g.date, g.time, g.end_time, g.capacity, ${COUNTS("g")}
      FROM viewing_groups g JOIN negotiators n ON n.id = g.negotiator_id LEFT JOIN listings l ON l.id = g.listing_id
      WHERE g.status = 'open' AND (g.date, g.end_time) > (?, ?) ORDER BY g.date, g.time, g.id LIMIT 50`).bind(clock.date, clock.time),
  ]).then(r => r.map(x => x.results));
  const per = requests.reduce((a, r) => ((a[r.listing_id] = (a[r.listing_id] ?? 0) + 1), a), {});
  const grouped = new Set(groups.map(g => g.listing_id));
  return json({ requests: requests.filter(r => per[r.listing_id] >= 2 || grouped.has(r.listing_id)), groups });
}

// The property, negotiator, day and start time of either plan, with the panel's rules (validateViewing's).
function readSlot(body, clock) {
  const { errors = {} } = validateViewing({ negotiator_id: body.negotiator_id, date: body.date, time: body.time },
    { today: clock.date, panel: true });
  const wrong = Object.fromEntries(["negotiator_id", "date", "time"].filter(k => errors[k]).map(k => [k, errors[k]]));
  if (typeof body.listing_id !== "string" || !/^HE-[A-Z]\d{3,}$/.test(body.listing_id)) wrong.listing_id = "Unknown property";
  return { wrong, slot: { listing_id: body.listing_id, negotiator_id: Number(body.negotiator_id), date: body.date, time: body.time } };
}

// The requests chosen, each {id, updated_at} as the panel last read it, distinct.
function readRefs(list, max) {
  if (!Array.isArray(list) || list.length > max) return null;
  const refs = list.map(r => (r && ID.test(String(r.id)) && (r.updated_at === null || typeof r.updated_at === "string")
    ? { id: Number(r.id), updated_at: r.updated_at } : null));
  return refs.includes(null) || new Set(refs.map(r => r.id)).size !== refs.length ? null : refs;
}

// Every request chosen is an open request of this property.
async function ofHouse(env, refs, listingId) {
  if (!refs.length) return true;
  const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM viewing_requests WHERE id IN (${refs.map(() => "?")})
    AND listing_id = ? AND status = 'requested'`).bind(...refs.map(r => r.id), listingId).first();
  return n === refs.length;
}

// Back-to-back: the requests, in the order given, move to the first free times of one negotiator from the start time
// on, each through the Reschedule action (its slot, property and notice rules). They stay requests; the first refusal
// stops the rest, which stay where they were.
async function consecutive({ request, env, admin }) {
  const body = (await readJson(request)) ?? {}, clock = jerseyNow();
  const { wrong, slot } = readSlot(body, clock), refs = readRefs(body.viewings, 20);
  if (!refs || refs.length < 2) wrong.viewings = "Choose two or more requests";
  if (Object.keys(wrong).length) return fields(wrong);
  if (!(await ofHouse(env, refs, slot.listing_id))) return fields({ viewings: "Choose open requests of this property" });
  const moved = [], refused = [];
  let after = null;
  for (const ref of refs) {
    const a = await loadAvailability(env, { from: slot.date, days: 1, now: clock, fromTomorrow: false,
      negotiatorId: slot.negotiator_id, excludeId: ref.id, listingId: slot.listing_id });
    const free = (a.days[0].slots[slot.negotiator_id] ?? []).find(s => !s.booked && s.time >= slot.time && (after == null || s.time > after));
    if (!free) { refused.push({ id: ref.id, error: "No free time left that day for this negotiator." }); break; }
    let res;
    try {
      res = await runAction({ env, admin, id: ref.id, body: { action: "reschedule", updated_at: ref.updated_at,
        negotiator_id: slot.negotiator_id, date: slot.date, time: free.time, notice_confirmed: body.notice_confirmed === true } });
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      res = json({ error: e.message }, e.status);
    }
    if (res.status !== 200) {
      const d = await res.json();
      refused.push({ id: ref.id, error: d.fields ? Object.values(d.fields)[0] : d.error });
      break;
    }
    moved.push({ id: ref.id, time: free.time });
    after = free.time;
  }
  return json(moved.length ? { moved, refused } : { error: refused[0].error, moved, refused }, moved.length ? 200 : 409);
}

// Gives places to the requests chosen, one by one. Resolves to {placed, refused}.
async function reserveAll(env, admin, group, refs) {
  const placed = [], refused = [], cycle = await cycleOn(env), clock = jerseyNow();
  for (const ref of refs) {
    const no = await reserveGroupPlace(env, admin, group, ref, { cycle, clock });
    if (no) refused.push({ id: ref.id, status: no[0], error: no[1] }); else placed.push(ref.id);
  }
  return { placed, refused };
}

// An open viewing: a free time of one negotiator at this property, capacity 1 to 50, and the requests chosen given a
// place each. The time is checked as a new booking is (slot, saved rules, property hours, notice), and no other open
// group of that negotiator overlaps it.
async function create({ request, env, admin }) {
  const body = (await readJson(request)) ?? {}, clock = jerseyNow();
  const { wrong, slot } = readSlot(body, clock), refs = readRefs(body.viewings, 50);
  const capacity = Number.isInteger(body.capacity) && body.capacity >= 1 && body.capacity <= 50 ? body.capacity : null;
  if (capacity == null) wrong.capacity = "Choose 1 to 50 places";
  if (!refs) wrong.viewings = "Choose up to 50 requests";
  else if (capacity != null && refs.length > capacity) wrong.capacity = `Choose at least ${refs.length} places, one per request chosen`;
  if (Object.keys(wrong).length) return fields(wrong);
  if (!(await env.DB.prepare("SELECT 1 FROM listings WHERE id = ?").bind(slot.listing_id).first())) return fields({ listing_id: "Unknown property" });
  if (!(await ofHouse(env, refs, slot.listing_id))) return fields({ viewings: "Choose open requests of this property" });
  const a = await loadAvailability(env, { from: slot.date, days: 1, now: clock, fromTomorrow: false,
    negotiatorId: slot.negotiator_id, listingId: slot.listing_id });
  if (a.property_viewings_enabled === false) return fields({ listing_id: "Viewings are disabled for this property." });
  const slots = a.negotiators.length ? a.days[0].slots[slot.negotiator_id] : null;
  if (!slots) return fields({ negotiator_id: "Choose an active negotiator" });
  if (!isFree(slots, slot.time))
    return slots.some(s => s.time === slot.time) ? taken() : fields({ time: "That time is not available. Please choose another." });
  const notice = await noticeCheck(env, slot, clock, body.notice_confirmed === true);
  if (notice.error) return fields({ notice_confirmed: notice.error });
  const policy = a.policies?.[slot.negotiator_id] ?? null, duration = policy?.duration_minutes ?? SLOT_MINUTES;
  const end = addMinutes(slot.time, duration);
  const g = slotGuard(env, slot, { policy, parish: a.parish ?? null, actor: admin });
  const p = propertyViewingGuard(slot, { duration }), n = notice.guard;
  const [ins] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO viewing_groups (listing_id, negotiator_id, date, time, end_time, capacity, created_at, created_by)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${g.sql} AND ${p.sql}${n ? ` AND ${n.sql}` : ""}
        AND NOT EXISTS (SELECT 1 FROM viewing_groups o WHERE o.negotiator_id = ? AND o.date = ? AND o.status = 'open'
          AND o.time < ? AND o.end_time > ?)
        AND EXISTS (SELECT 1 FROM admins WHERE email = ?)`)
      .bind(slot.listing_id, slot.negotiator_id, slot.date, slot.time, end, capacity, now(), admin, ...g.binds, ...p.binds,
        ...(n?.binds ?? []), slot.negotiator_id, slot.date, addMinutes(end, BUFFER_MINUTES), addMinutes(slot.time, -BUFFER_MINUTES), admin),
    // events.entity_type has no group of its own (0001's CHECK): the group's events are its property's, with its id.
    ...logEvent(env, { actor: admin, entity_type: "listing", entity_id: slot.listing_id, type: "viewing_group.created",
      data: { negotiator_id: slot.negotiator_id, date: slot.date, time: slot.time, capacity,
        ...(notice.confirmed ? { notice_confirmed: true } : {}) } }, null, { ifInserted: true, newest: { group_id: "viewing_groups" } }),
  ]);
  if (!ins.meta.changes) return taken();
  const group = { id: ins.meta.last_row_id, ...slot, end_time: end };
  return json({ id: group.id, ...(await reserveAll(env, admin, group, refs)) }, 201);
}

const groupOf = async (env, id) => {
  const g = await env.DB.prepare("SELECT * FROM viewing_groups WHERE id = ?").bind(Number(id)).first();
  if (!g) fail(404, "Open viewing not found");
  return g;
};

// More requests into an open group. 200 when at least one got a place; else the first refusal.
async function addPlaces({ request, env, admin, params: [id] }) {
  const body = (await readJson(request)) ?? {}, refs = readRefs(body.viewings, 50);
  if (!refs?.length) return fields({ viewings: "Choose one or more requests" });
  const group = await groupOf(env, id);
  const r = await reserveAll(env, admin, group, refs);
  return r.placed.length ? json(r) : json({ error: r.refused[0].error, ...r }, r.refused[0].status);
}

// Cancelling the open viewing closes it to new places first, then cancels its viewings one by one through the Cancel
// action (their events and notices as today). Nothing is sent: the team tells each person.
async function cancel({ env, admin, params: [id] }) {
  const group = await groupOf(env, id), ts = now();
  if (group.status !== "open") fail(409, "This open viewing is already cancelled.");
  const [r] = await env.DB.batch([
    env.DB.prepare(`UPDATE viewing_groups SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?
      WHERE id = ? AND status = 'open' AND EXISTS (SELECT 1 FROM admins WHERE email = ?)`).bind(ts, admin, group.id, admin),
    ...logEvent(env, { actor: admin, entity_type: "listing", entity_id: group.listing_id, type: "viewing_group.cancelled",
      data: { group_id: group.id } }, null, { ifInserted: true }),
  ]);
  if (!r.meta.changes) fail(409, "This open viewing is already cancelled.");
  const { results: held } = await env.DB.prepare(`SELECT v.id, v.updated_at FROM viewing_group_places p
    JOIN viewing_requests v ON v.id = p.viewing_id WHERE p.group_id = ? AND v.status IN ('requested', 'confirmed')
      AND v.negotiator_id = ? AND v.date = ? AND v.time = ? ORDER BY v.id`)
    .bind(group.id, group.negotiator_id, group.date, group.time).all();
  const cancelled = [], refused = [];
  for (const v of held) {
    try {
      const res = await runAction({ env, admin, id: v.id, body: { action: "cancel", updated_at: v.updated_at } });
      (res.status === 200 ? cancelled : refused).push(v.id);
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      refused.push(v.id);
    }
  }
  return json({ cancelled, refused });
}

export default [
  ["GET", /^\/admin\/viewing-groups$/, overview, true],
  ["POST", /^\/admin\/viewing-groups$/, create, true],
  ["POST", /^\/admin\/viewing-groups\/consecutive$/, consecutive, true],
  ["POST", /^\/admin\/viewing-groups\/(\d+)\/places$/, addPlaces, true],
  ["POST", /^\/admin\/viewing-groups\/(\d+)\/cancel$/, cancel, true],
];
