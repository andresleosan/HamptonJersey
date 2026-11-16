// VIS-14: the panel's routes for houses with several open requests (only with VIS14_BLOCK_READY=1, migration 0104).
// Staff choose one of two plans: back-to-back times of one negotiator (ordinary viewings, moved one by one through the
// Reschedule action) or an open viewing with places. Nothing is sent: the team tells each person, as today.
import { json, fail, readJson, now, HttpError } from "../http.js";
import { logEvent } from "../events.js";
import { validateViewing, jerseyNow, isFree, addMinutes, SLOT_MINUTES, BUFFER_MINUTES, personSql, propertyAllows } from "../viewings.js";
import { loadAvailability, slotGuard, propertyViewingGuard, policySnapshot } from "../viewing-store.js";
import { viewingPolicyReady, reservationPolicyGuard, DEFAULT_VIEWING_POLICY } from "../viewing-policy.js";
import { noticeCheck } from "../house-rules.js";
import { cycleOn } from "../viewing-cycle.js";
import { COUNTS, inOpenGroupSql, holds, places } from "../viewing-groups.js";
import { runAction } from "./inbox.js";

const fields = f => json({ error: "Please check the highlighted fields.", fields: f }, 400);
const taken = () => json({ error: "That time was just booked. Please choose another." }, 409);
const ID = /^[1-9]\d{0,8}$/;
const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

// Houses with two or more requests still to plan (to come, not holding a place), and the open groups to come with their
// counts. A house with an open group lists its remaining requests too, so they can join it. Staff only: names included.
// back_to_back: moved by a back-to-back plan and still at that time (the card says it is planned).
async function overview({ env }) {
  const clock = jerseyNow();
  const [requests, groups] = await env.DB.batch([
    env.DB.prepare(`SELECT v.id, v.listing_id, COALESCE(l.title, v.listing_title_snapshot) AS listing_title, v.name, v.date,
        v.time, v.negotiator_id, n.name AS negotiator_name, v.updated_at,
        EXISTS (SELECT 1 FROM events e WHERE e.entity_type = 'viewing' AND e.entity_id = CAST(v.id AS TEXT)
          AND e.type = 'viewing.back_to_back' AND json_extract(e.data, '$.date') = v.date
          AND json_extract(e.data, '$.time') = v.time AND json_extract(e.data, '$.negotiator_id') = v.negotiator_id) AS back_to_back
      FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id LEFT JOIN negotiators n ON n.id = v.negotiator_id
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
// on, each through the Reschedule action (its slot, rules, property and notice; an open group's time is never free).
// They stay requests; the first refusal stops the rest, which stay where they were.
async function consecutive({ request, env, admin, waitUntil }) {
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
      res = await runAction({ env, admin, waitUntil, id: ref.id, body: { action: "reschedule", updated_at: ref.updated_at,
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
    // The plan, so the house card says this request is planned while it keeps this time.
    await env.DB.batch(logEvent(env, { actor: admin, entity_type: "viewing", entity_id: String(ref.id), type: "viewing.back_to_back",
      data: { negotiator_id: slot.negotiator_id, date: slot.date, time: free.time } }));
  }
  return json(moved.length ? { moved, refused } : { error: refused[0].error, moved, refused }, moved.length ? 200 : 409);
}

// One place for viewing `id` (as last read: updated_at) in `group` (its row). Every condition is in the INSERT, so two
// staff giving the last place at once never oversell it (the migration's trigger refuses it too): the group open and to
// come; the viewing active, of the same property and unchanged; its person (with VIS-02's joins) without a place yet;
// room left; the property's viewings switch, hours and VIS-10 notice at the group's time; and the group's time still
// allowed as ONE appointment of the negotiator: with VIS-09 on, its daily maximum and margins (the group itself left
// out), else no other viewing or open group at that time. Only then the viewing moves to the group's time, with the
// margins it was given (policySnapshot). confirmed: staff confirmed access is agreed (VIS-10).
// Resolves to null, or [status, message] when refused.
async function reserveGroupPlace(env, admin, group, { id, updated_at }, { cycle, clock, confirmed }) {
  const slot = { listing_id: group.listing_id, negotiator_id: group.negotiator_id, date: group.date, time: group.time };
  const notice = await noticeCheck(env, slot, clock, confirmed);
  if (notice.error) return [409, notice.error];
  let policy = null, parish = null;
  if (viewingPolicyReady(env)) {
    const [saved, home] = await env.DB.batch([
      env.DB.prepare(`SELECT duration_minutes, buffer_minutes, parish_extra_minutes, max_daily, revision
        FROM viewing_policy_settings WHERE negotiator_id = ?`).bind(group.negotiator_id),
      env.DB.prepare("SELECT parish FROM listings WHERE id = ?").bind(group.listing_id),
    ]).then(r => r.map(x => x.results[0]));
    policy = saved ?? { ...DEFAULT_VIEWING_POLICY }; parish = home?.parish ?? null;
  }
  const guards = [propertyViewingGuard(slot, { duration: minutes(group.end_time) - minutes(group.time) }),
    ...(notice.guard ? [notice.guard] : []),
    ...(policy ? [reservationPolicyGuard({ ...slot, parish }, policy, { excludeViewingId: id, groups: true, excludeGroupId: group.id })] : [])];
  const from = addMinutes(group.time, -BUFFER_MINUTES), to = addMinutes(group.end_time, BUFFER_MINUTES), ts = now();
  const [ins] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO viewing_group_places (viewing_id, group_id, created_at, created_by)
      SELECT v.id, g.id, ?, ? FROM viewing_groups g JOIN viewing_requests v ON v.id = ?
      WHERE g.id = ? AND g.status = 'open' AND g.negotiator_id = ? AND g.date = ? AND g.time = ?
        AND (g.date > ? OR (g.date = ? AND g.time > ?))
        AND v.listing_id = g.listing_id AND v.status IN ('requested', 'confirmed') AND v.updated_at IS ?
        AND ${places("g")} < g.capacity
        AND NOT EXISTS (SELECT 1 FROM viewing_group_places q JOIN viewing_requests h ON h.id = q.viewing_id
          WHERE q.group_id = g.id AND ${holds("h", "g")} AND ${personSql("h")} = ${personSql("v")})${policy ? "" : `
        AND NOT EXISTS (SELECT 1 FROM viewing_requests c WHERE c.negotiator_id = g.negotiator_id AND c.date = g.date
          AND c.status IN ('requested', 'confirmed') AND c.id <> v.id AND c.time < ? AND c.end_time > ?
          AND NOT (c.time = g.time AND c.id IN (SELECT viewing_id FROM viewing_group_places WHERE group_id = g.id)))
        AND NOT EXISTS (SELECT 1 FROM viewing_groups og WHERE og.id <> g.id AND og.status = 'open'
          AND og.negotiator_id = g.negotiator_id AND og.date = g.date AND og.time < ? AND og.end_time > ?)`}
        ${guards.map(x => `AND ${x.sql}`).join("\n        ")}
        AND EXISTS (SELECT 1 FROM admins WHERE email = ?)
      ON CONFLICT (viewing_id) DO UPDATE SET group_id = excluded.group_id, created_at = excluded.created_at,
        created_by = excluded.created_by`)
      .bind(ts, admin, id, group.id, group.negotiator_id, group.date, group.time, clock.date, clock.date, clock.time,
        updated_at, ...(policy ? [] : [to, from, to, from]), ...guards.flatMap(x => x.binds), admin),
    env.DB.prepare(`UPDATE viewing_requests SET negotiator_id = ?, agent = (SELECT name FROM negotiators WHERE id = ?),
        ${cycle ? `reminded_at = CASE WHEN date = ? AND time = ? THEN reminded_at END,
        reminded_by = CASE WHEN date = ? AND time = ? THEN reminded_by END,
        reminded_channel = CASE WHEN date = ? AND time = ? THEN reminded_channel END, ` : ""}date = ?, time = ?, end_time = ?,
        updated_at = ?, updated_by = ? WHERE id = ? AND changes() = 1`)
      .bind(group.negotiator_id, group.negotiator_id, ...(cycle ? Array(3).fill([group.date, group.time]).flat() : []),
        group.date, group.time, group.end_time, ts, admin, id),
    // Only if the UPDATE wrote (changes() = 1); the event below then still follows it.
    ...(policy ? [policySnapshot(env, policy, parish, id)] : []),
    ...logEvent(env, { actor: admin, entity_type: "viewing", entity_id: String(id), type: "viewing.group_place",
      data: { group_id: group.id, negotiator_id: group.negotiator_id, date: group.date, time: group.time,
        ...(notice.confirmed ? { notice_confirmed: true } : {}) } }, null, { ifInserted: true }),
  ]);
  if (ins.meta.changes) return null;
  return refusal(env, group, { id, updated_at });
}

// Why a place was refused, read after the write: the first condition that no longer holds.
async function refusal(env, group, { id, updated_at }) {
  const [g, v, dup, home] = await Promise.all([
    env.DB.prepare(`SELECT g.status, g.capacity, ${places("g")} AS taken FROM viewing_groups g WHERE g.id = ?`).bind(group.id).first(),
    env.DB.prepare("SELECT listing_id, status, updated_at FROM viewing_requests WHERE id = ?").bind(id).first(),
    env.DB.prepare(`SELECT 1 FROM viewing_requests v JOIN viewing_groups g ON g.id = ? WHERE v.id = ? AND EXISTS (
        SELECT 1 FROM viewing_group_places q JOIN viewing_requests h ON h.id = q.viewing_id
        WHERE q.group_id = g.id AND ${holds("h", "g")} AND ${personSql("h")} = ${personSql("v")})`).bind(group.id, id).first(),
    env.DB.prepare("SELECT viewings_enabled, viewing_hours FROM listings WHERE id = ?").bind(group.listing_id).first(),
  ]);
  if (!g) return [404, "Open viewing not found"];
  if (g.status !== "open") return [409, "This open viewing is cancelled."];
  if (!v) return [404, "Viewing not found"];
  if (v.listing_id !== group.listing_id) return [409, "This request is for another property."];
  if (!["requested", "confirmed"].includes(v.status)) return [409, `This viewing is already ${v.status === "no_show" ? "marked as a no-show" : v.status}.`];
  if (v.updated_at !== updated_at) return [409, "Someone else saved changes to this viewing. Reload to see them (your changes were not saved)."];
  if (dup) return [409, "This person already has a place in this open viewing."];
  if (g.taken >= g.capacity) return [409, "This open viewing is full."];
  if (!home || !propertyAllows({ viewings_enabled: home.viewings_enabled,
    viewing_hours: home.viewing_hours == null ? null : JSON.parse(home.viewing_hours) }, group.date, group.time,
  minutes(group.end_time) - minutes(group.time)))
    return [409, "Viewings of this property are off, or its viewing hours no longer include this time."];
  return [409, "The negotiator's viewing rules or another viewing no longer allow this time, or the open viewing has passed."];
}

// Gives places to the requests chosen, one by one. Resolves to {placed, refused}.
async function reserveAll(env, admin, group, refs, confirmed) {
  const placed = [], refused = [], cycle = await cycleOn(env), clock = jerseyNow();
  for (const ref of refs) {
    const no = await reserveGroupPlace(env, admin, group, ref, { cycle, clock, confirmed });
    if (no) refused.push({ id: ref.id, status: no[0], error: no[1] }); else placed.push(ref.id);
  }
  return { placed, refused };
}

// An open viewing: a free time of one negotiator at this property, capacity 1 to 50, and the requests chosen given a
// place each. The time is checked as a new booking is (slot, saved rules, property hours, notice); slotGuard counts
// other open groups as appointments too. The group keeps the parish and margins it was created with, like a booking.
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
  const confirmed = body.notice_confirmed === true, notice = await noticeCheck(env, slot, clock, confirmed);
  if (notice.error) return fields({ notice_confirmed: notice.error });
  const policy = a.policies?.[slot.negotiator_id] ?? null, duration = policy?.duration_minutes ?? SLOT_MINUTES;
  const end = addMinutes(slot.time, duration), parish = policy ? a.parish ?? null : null;
  const g = slotGuard(env, slot, { policy, parish: a.parish ?? null, actor: admin });
  const p = propertyViewingGuard(slot, { duration }), n = notice.guard;
  const [ins] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO viewing_groups (listing_id, negotiator_id, date, time, end_time, capacity, created_at, created_by,
        parish, buffer_minutes, parish_extra_minutes, policy_revision)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${g.sql} AND ${p.sql}${n ? ` AND ${n.sql}` : ""}
        AND EXISTS (SELECT 1 FROM admins WHERE email = ?)`)
      .bind(slot.listing_id, slot.negotiator_id, slot.date, slot.time, end, capacity, now(), admin, parish,
        policy?.buffer_minutes ?? null, policy?.parish_extra_minutes ?? null, policy?.revision ?? null,
        ...g.binds, ...p.binds, ...(n?.binds ?? []), admin),
    // events.entity_type has no group of its own (0001's CHECK): the group's events are its property's, with its id.
    ...logEvent(env, { actor: admin, entity_type: "listing", entity_id: slot.listing_id, type: "viewing_group.created",
      data: { negotiator_id: slot.negotiator_id, date: slot.date, time: slot.time, capacity,
        ...(notice.confirmed ? { notice_confirmed: true } : {}) } }, null, { ifInserted: true, newest: { group_id: "viewing_groups" } }),
  ]);
  if (!ins.meta.changes) return taken();
  const group = { id: ins.meta.last_row_id, ...slot, end_time: end };
  return json({ id: group.id, ...(await reserveAll(env, admin, group, refs, confirmed)) }, 201);
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
  const r = await reserveAll(env, admin, group, refs, body.notice_confirmed === true);
  return r.placed.length ? json(r) : json({ error: r.refused[0].error, ...r }, r.refused[0].status);
}

// Cancelling an open viewing that has not started closes it to new places first, then cancels its viewings one by one
// through the Cancel action (their events and notices as today); refused: those it could not. Nothing is sent.
async function cancel({ env, admin, params: [id], waitUntil }) {
  const group = await groupOf(env, id), ts = now(), clock = jerseyNow();
  if (group.status !== "open") fail(409, "This open viewing is already cancelled.");
  const started = "This open viewing has already started. Record each viewing's outcome instead.";
  if (`${group.date} ${group.time}` <= `${clock.date} ${clock.time}`) fail(409, started);
  const [r] = await env.DB.batch([
    env.DB.prepare(`UPDATE viewing_groups SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?
      WHERE id = ? AND status = 'open' AND (date > ? OR (date = ? AND time > ?))
        AND EXISTS (SELECT 1 FROM admins WHERE email = ?)`).bind(ts, admin, group.id, clock.date, clock.date, clock.time, admin),
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
      const res = await runAction({ env, admin, waitUntil, id: v.id, body: { action: "cancel", updated_at: v.updated_at } });
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
