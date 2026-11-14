// ADM-13 (migration 0060, flag ADM13_INSPECTIONS_READY): a running tenancy's internal inspection every six months: the
// day it was done, each room's state with what was seen, references to the photos a person checked outside the app, and
// the repairs it found, each waiting for a person to create it in Repairs or set it aside. Nothing here receives, fetches
// or opens a file, writes to the landlord or the tenant, or makes a report for anyone.
import { fail, now } from "./http.js";
import { addMonths, complianceStatus } from "./rentals.js";
import { ensureChanged, rentalEvent } from "./routes/rentals.js";
import { validateInventory } from "./tenancy-origins.js";
import { jerseyToday, realDate } from "./viewings.js";

export const inspectionsReady = env => env?.ADM13_INSPECTIONS_READY === "1";
const EVERY_MONTHS = 6;
const CONDITIONS = ["ok", "attention", "not_checked"], URGENCIES = ["emergency", "urgent", "routine"];
const DECIDED = { repair: "created", not_needed: "not_needed" };
const STALE = "Someone else recorded an inspection meanwhile. Reload to see it (your entries were not saved).";
const CHANGED = "Someone else changed this inspection meanwhile. Reload to see it.";
const ENDED = "This tenancy has ended: inspections are recorded on a running tenancy.";
const OTHER_FORM = "This form was already used for another tenancy. Reload the page";

// Over t: the day its next inspection falls due, six calendar months after the last one recorded or after the start,
// on the month's last day when it is shorter (as addMonths does).
const BASE = "COALESCE((SELECT MAX(i.inspected_on) FROM rental_inspections i WHERE i.tenancy_id = t.id), t.start_on)";
export const NEXT_INSPECTION = `min(date(${BASE}, '+${EVERY_MONTHS} months'),
  date(${BASE}, 'start of month', '+${EVERY_MONTHS + 1} months', '-1 day'))`;
// Over t (?1 = today): a running tenancy whose next inspection falls before its move-out and `cmp` (e.g. "< ?1").
export const inspectionDue = cmp => `(t.ended_on IS NULL OR t.ended_on > max(?1, ${NEXT_INSPECTION})) AND ${NEXT_INSPECTION} ${cmp}`;

const revision = v => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const operationId = v => (typeof v === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(v) ? v : null);
const done = errors => (Object.keys(errors).length ? { errors } : null);
const running = (t, today) => !t.ended_on || t.ended_on > today;
const tenancyRow = async (env, id) => (await env.DB.prepare("SELECT id, rental_id, start_on, ended_on FROM tenancies WHERE id = ?")
  .bind(id).first()) ?? fail(404, "Tenancy not found");
const lastSeq = async (env, id) => (await env.DB.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM rental_inspections WHERE tenancy_id = ?")
  .bind(id).first()).seq;
const byOperation = (env, op) => env.DB.prepare("SELECT * FROM rental_inspections WHERE operation_id = ?").bind(op).first();
const shape = x => ({ id: x.id, seq: x.seq, revision: x.revision, inspected_on: x.inspected_on, rooms: JSON.parse(x.rooms),
  evidence_refs: JSON.parse(x.evidence_refs), recorded_at: x.recorded_at, recorded_by: x.recorded_by, updated_at: x.updated_at,
  updated_by: x.updated_by });

// The tenancy's inspections (newest first, 50), the revision a new one is recorded against, when the next one falls due
// (null once the tenancy ended, or when it ends first) and the rooms a new checklist starts from: the last inspection's,
// else the entry inventory's.
export async function readInspections(env, tenancy_id) {
  const t = await tenancyRow(env, tenancy_id), today = jerseyToday();
  const [list, seq, entry] = await Promise.all([
    env.DB.prepare("SELECT * FROM rental_inspections WHERE tenancy_id = ? ORDER BY inspected_on DESC, seq DESC LIMIT 50").bind(t.id).all(),
    lastSeq(env, t.id),
    env.DB.prepare("SELECT rooms FROM tenancy_entry_inventories WHERE tenancy_id = ?").bind(t.id).first()]);
  const inspections = list.results.map(shape), due_on = addMonths(inspections[0]?.inspected_on ?? t.start_on, EVERY_MONTHS);
  const next = running(t, today) && (!t.ended_on || t.ended_on > due_on)
    ? { due_on, status: complianceStatus({ expires_on: due_on }, today) } : null;
  const rooms = inspections[0]?.rooms ?? (entry ? JSON.parse(entry.rooms) : []);
  return { tenancy: { id: t.id, start_on: t.start_on, ended_on: t.ended_on, running: running(t, today) }, revision: seq, next,
    inspections, suggested_rooms: rooms.map(r => r.name) };
}

// One inspection, on a day from the start to today. expectedRevision: the tenancy's inspections the form read (0 for
// none); operation_id: the form's, so a repeat answers the same inspection (replayed) and never records a second one.
// Each room says ok, attention (with what needs it, and maybe a repair) or not_checked: a room not checked is not ok.
export async function recordInspection(env, { tenancy_id, expectedRevision, operation_id, inspected_on, rooms, evidence_refs }, actor) {
  const t = await tenancyRow(env, tenancy_id), today = jerseyToday(), op = operationId(operation_id);
  if (!op) return { errors: { operation_id: "Reload the page" } };
  const replay = async () => {
    const x = await byOperation(env, op);
    if (x && x.tenancy_id !== t.id) fail(409, OTHER_FORM);
    return x && { inspection: shape(x), replayed: true };
  };
  const earlier = await replay();
  if (earlier) return earlier;
  if (!running(t, today)) fail(409, ENDED);
  const { e, value } = validateInventory({ rooms, evidence_refs }), rev = revision(expectedRevision);
  if (rev == null) e.expectedRevision = "Reload the page";
  if (!(realDate(inspected_on) && inspected_on >= t.start_on && inspected_on <= today)) e.inspected_on = `Use a date from ${t.start_on} to today`;
  const list = value.rooms.map((r, i) => {
    const { condition, repair_needed } = rooms[i] ?? {}, k = `rooms.${i}`;
    if (!CONDITIONS.includes(condition)) e[`${k}.condition`] = "Choose OK, Needs attention or Not checked";
    else if (condition === "attention" && r.observations === "") e[`${k}.observations`] = "Say what needs attention";
    if (repair_needed != null && typeof repair_needed !== "boolean") e[`${k}.repair_needed`] = "Say whether it needs a repair";
    else if (repair_needed && condition !== "attention") e[`${k}.repair_needed`] = "Only a room that needs attention can need a repair";
    return { name: r.name, condition, observations: r.observations,
      repair: repair_needed ? { status: "pending", repair_id: null, decided_at: null, decided_by: null } : null };
  });
  if (done(e)) return done(e);
  if (await lastSeq(env, t.id) !== rev) fail(409, STALE);
  // A reference already recorded for another tenancy is that case's evidence, not this one's.
  if (value.evidence_refs.length) {
    const side = table => `SELECT json_extract(j.value, '$.evidence_ref') AS ref FROM ${table} i, json_each(i.evidence_refs) j
      WHERE i.tenancy_id <> ?1 AND json_extract(j.value, '$.evidence_ref') IN (SELECT value FROM json_each(?2))`;
    const theirs = new Set((await env.DB.prepare(["tenancy_entry_inventories", "tenancy_exit_inventories", "rental_inspections"].map(side)
      .join(" UNION ")).bind(t.id, JSON.stringify(value.evidence_refs)).all()).results.map(r => r.ref));
    value.evidence_refs.forEach((r, i) => theirs.has(r)
      && (e[`evidence_refs.${i}`] = "This reference is recorded for another tenancy. Enter where this tenancy's photos are kept"));
    if (done(e)) return done(e);
  }
  const ts = now(), seq = rev + 1, refs = value.evidence_refs.map(r => ({ evidence_ref: r, reviewed_at: ts, reviewed_by: actor, revision: 1 }));
  const count = c => list.filter(r => r.condition === c).length;
  try {
    await env.DB.batch([
      // The tenancy is re-read here: still running, started by then, and with the inspections the form read.
      env.DB.prepare(`INSERT INTO rental_inspections (tenancy_id, seq, operation_id, revision, inspected_on, rooms, evidence_refs,
        recorded_at, recorded_by, updated_at, updated_by) SELECT id, ?, ?, 1, ?, ?, ?, ?, ?, ?, ? FROM tenancies WHERE id = ?
        AND start_on <= ? AND (ended_on IS NULL OR ended_on > ?)
        AND (SELECT COALESCE(MAX(seq), 0) FROM rental_inspections WHERE tenancy_id = ?) = ? ON CONFLICT DO NOTHING`)
        .bind(seq, op, inspected_on, JSON.stringify(list), JSON.stringify(refs), ts, actor, ts, actor, t.id, inspected_on, today, t.id, rev),
      ensureChanged(env),
      // The history counts; observations and references stay out of it.
      rentalEvent(env, { rental_id: t.rental_id, tenancy_id: t.id, actor, type: "inspection.recorded", data: { seq, inspected_on,
        rooms: list.length, attention: count("attention"), not_checked: count("not_checked"),
        repairs: list.filter(r => r.repair).length, evidence_refs: refs.length } }),
    ]);
  } catch (x) {
    const again = await replay();
    if (again) return again;
    if (!running(await tenancyRow(env, t.id), today)) fail(409, ENDED);
    if (await lastSeq(env, t.id) !== rev) fail(409, STALE);
    throw x;
  }
  return { inspection: shape(await byOperation(env, op)), replayed: false };
}

// A person's decision on a repair an inspection found (room: its index): "repair" creates it in Repairs, reported, at the
// urgency chosen; "not_needed" sets it aside. Each is taken once: the same decision again answers it (replayed).
export async function decideRepair(env, { tenancy_id, inspection_id, room, expectedRevision, decision, urgency }, actor) {
  const t = await tenancyRow(env, tenancy_id);
  const x = (await env.DB.prepare("SELECT * FROM rental_inspections WHERE id = ? AND tenancy_id = ?").bind(inspection_id, t.id).first())
    ?? fail(404, "Inspection not found");
  const r = Number.isSafeInteger(room) && room >= 0 ? JSON.parse(x.rooms)[room] : null;
  if (!r?.repair) fail(404, "No repair from this room is waiting for a decision");
  const e = {}, rev = revision(expectedRevision);
  if (!DECIDED[decision]) e.decision = "Choose whether to create the repair";
  else if (decision === "repair" && !URGENCIES.includes(urgency)) e.urgency = "Choose how urgent it is";
  if (rev == null) e.expectedRevision = "Reload the page";
  if (done(e)) return done(e);
  if (r.repair.status !== "pending") {
    if (r.repair.status === DECIDED[decision]) return { inspection: shape(x), repair_id: r.repair.repair_id, replayed: true };
    fail(409, "This repair was already decided. Reload to see it.");
  }
  if (x.revision !== rev) fail(409, CHANGED);
  const ts = now(), path = `$[${room}].repair`, created = decision === "repair";
  const PENDING = `id = ? AND revision = ? AND json_extract(rooms, '${path}.status') = 'pending'`;
  const title = `${r.name}: ${r.observations.replace(/\s+/g, " ")}`; // repairs.title holds 120 characters; detail keeps it all
  const repair = { title: title.length > 120 ? `${title.slice(0, 119)}…` : title, detail: r.observations, urgency, status: "reported",
    inspection_id: x.id };
  const stmts = [
    ...(created ? [env.DB.prepare(`INSERT INTO repairs (rental_id, tenancy_id, title, detail, urgency, status, created_at, created_by,
      updated_at, updated_by) SELECT id, ?, ?, ?, ?, 'reported', ?, ?, ?, ? FROM rentals WHERE id = ? AND archived_at IS NULL
      AND EXISTS (SELECT 1 FROM rental_inspections WHERE ${PENDING})`)
      .bind(t.id, repair.title, repair.detail, urgency, ts, actor, ts, actor, t.rental_id, x.id, rev), ensureChanged(env)] : []),
    env.DB.prepare(`UPDATE rental_inspections SET revision = ?, rooms = json_set(rooms, '${path}', json_object('status', ?,
      'repair_id', ${created ? "(SELECT MAX(id) FROM repairs)" : "NULL"}, 'decided_at', ?, 'decided_by', ?)), updated_at = ?,
      updated_by = ? WHERE ${PENDING}`).bind(rev + 1, DECIDED[decision], ts, actor, ts, actor, x.id, rev),
    ensureChanged(env),
    created ? rentalEvent(env, { rental_id: t.rental_id, tenancy_id: t.id, actor, type: "repair.created", data: repair }, { repair_id: "repairs" })
      : rentalEvent(env, { rental_id: t.rental_id, tenancy_id: t.id, actor, type: "inspection.repair_not_needed",
        data: { inspection_id: x.id, inspected_on: x.inspected_on, room: r.name } }),
  ];
  try {
    await env.DB.batch(stmts);
  } catch (y) {
    const cur = await env.DB.prepare("SELECT revision FROM rental_inspections WHERE id = ?").bind(x.id).first();
    if (cur.revision !== rev) fail(409, CHANGED);
    if (created && await env.DB.prepare("SELECT 1 FROM rentals WHERE id = ? AND archived_at IS NOT NULL").bind(t.rental_id).first())
      fail(409, "This property is archived");
    throw y;
  }
  const after = await env.DB.prepare("SELECT * FROM rental_inspections WHERE id = ?").bind(x.id).first();
  return { inspection: shape(after), repair_id: JSON.parse(after.rooms)[room].repair.repair_id, replayed: false };
}
