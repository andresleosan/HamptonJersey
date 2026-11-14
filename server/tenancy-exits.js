// ADM-16 (migration 0059, flag ADM16_TENANCY_EXIT_READY): the exit inventory compared with the entry inventory it cites
// (ADM-06), the deductions proposed from the deposit, and what happened with mydeposits, recorded by hand from references
// a person checked. Nothing here fetches a file, calls mydeposits, moves money or records a payment, and the planned
// move-out (End tenancy) is never taken for the day the keys came back.
import { fail, now } from "./http.js";
import { ensureChanged, rentalEvent } from "./routes/rentals.js";
import { evidenceRef, validateInventory } from "./tenancy-origins.js";
import { jerseyToday, realDate } from "./viewings.js";

export const exitReady = env => env?.ADM16_TENANCY_EXIT_READY === "1";
const CONDITIONS = ["as_entry", "changed", "not_checked"], OUTCOMES = ["requested", "agreed", "disputed", "returned"];
const LINES_MAX = 20;
const STALE = "Someone else saved this meanwhile. Reload to see it (your changes were not saved).";
const ENTRY_MOVED = "The entry inventory changed since this form was opened. Reload to compare again (your changes were not saved).";
const HOLD = "The deposit's progress with mydeposits rests on this record, so it is kept as it was.";
const RETURNED = "The deposit was returned: nothing more is recorded after that.";
// Any outcome holds the inventory and the proposal; a return closes the record.
const HELD = "EXISTS (SELECT 1 FROM tenancy_deposit_outcomes WHERE tenancy_id = ?)";
const IS_RETURNED = "EXISTS (SELECT 1 FROM tenancy_deposit_outcomes WHERE tenancy_id = ? AND status = 'returned')";
const ENTRY_AS_READ = "(SELECT revision FROM tenancy_entry_inventories WHERE tenancy_id = ?) IS ?";

const revision = v => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const done = errors => (Object.keys(errors).length ? { errors } : null);
const gbp = p => (p / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
const ask = async (env, sql, id) => !!(await env.DB.prepare(`SELECT ${sql} AS yes`).bind(id).first()).yes;
const tenancyRow = async (env, id) => (await env.DB.prepare(`SELECT id, rental_id, start_on, ended_on, notice_given_on, notice_by,
  deposit, deposit_ref FROM tenancies WHERE id = ?`).bind(id).first()) ?? fail(404, "Tenancy not found");
const entryRow = (env, id) => env.DB.prepare("SELECT revision, rooms, meter_readings, evidence_refs FROM tenancy_entry_inventories WHERE tenancy_id = ?")
  .bind(id).first();
const exitShape = x => x && { tenancy_id: x.tenancy_id, revision: x.revision, entry_inventory_revision: x.entry_inventory_revision,
  entry: x.entry_snapshot && JSON.parse(x.entry_snapshot), moved_out_on: x.moved_out_on, rooms: JSON.parse(x.rooms),
  meter_readings: JSON.parse(x.meter_readings), evidence_refs: JSON.parse(x.evidence_refs), updated_at: x.updated_at, updated_by: x.updated_by };

// Compare-and-set like ADM-06: the first statement must change one row, or the batch fails and the stored revision (or
// recheck) says why.
async function casWrite(env, table, t, expected, stmts, recheck) {
  try {
    await env.DB.batch(stmts);
  } catch (e) {
    const row = await env.DB.prepare(`SELECT revision FROM ${table} WHERE tenancy_id = ?`).bind(t.id).first();
    if ((row?.revision ?? 0) !== expected) fail(409, STALE);
    await recheck();
    throw e;
  }
}

// One read for the tenancy's move-out: the planned date, the entry inventory as it is now, the exit inventory with the
// entry it cited, the proposal and the outcomes (oldest first). status: the latest outcome, "proposed" or null.
export async function readExit(env, tenancy_id) {
  const t = await tenancyRow(env, tenancy_id), q = sql => env.DB.prepare(sql).bind(t.id);
  const [entry, exit, proposal, outcomes] = await Promise.all([entryRow(env, t.id),
    q("SELECT * FROM tenancy_exit_inventories WHERE tenancy_id = ?").first(),
    q("SELECT revision, deposit_pence, total_pence, lines, updated_at, updated_by FROM tenancy_deposit_proposals WHERE tenancy_id = ?").first(),
    q(`SELECT revision, status, evidence_ref, occurred_on, recorded_at, recorded_by FROM tenancy_deposit_outcomes WHERE tenancy_id = ?
      ORDER BY revision`).all()]);
  const list = outcomes.results;
  return { tenancy: { id: t.id, start_on: t.start_on, planned_move_out: t.ended_on, notice_given_on: t.notice_given_on, notice_by: t.notice_by,
      deposit_pence: t.deposit == null ? null : t.deposit * 100, deposit_ref: t.deposit_ref },
    entry: entry && { revision: entry.revision, rooms: JSON.parse(entry.rooms), meter_readings: JSON.parse(entry.meter_readings),
      evidence_refs: JSON.parse(entry.evidence_refs) },
    exit: exitShape(exit), proposal: proposal && { ...proposal, lines: JSON.parse(proposal.lines) }, outcomes: list,
    status: list.at(-1)?.status ?? (proposal ? "proposed" : null) };
}

// The exit inventory's next revision. entry_inventory_revision: the entry revision the form compared with (null when
// there was none); the server copies that entry, so a body cannot bring its own. moved_out_on: only a day that happened.
export async function saveExitInventory(env, { tenancy_id, expectedRevision, entry_inventory_revision = null, moved_out_on, ...body },
  actor) {
  const t = await tenancyRow(env, tenancy_id);
  if (!t.ended_on) fail(409, "Record the move-out with End tenancy first.");
  const entry = await entryRow(env, t.id), cited = entry?.revision ?? null;
  if (entry_inventory_revision !== cited) fail(409, ENTRY_MOVED);
  const snap = entry && { rooms: JSON.parse(entry.rooms), meter_readings: JSON.parse(entry.meter_readings) };
  const listed = new Set((snap?.rooms ?? []).map(r => r.name.toLowerCase())), today = jerseyToday();
  const { e, value } = validateInventory(body), rev = revision(expectedRevision);
  if (rev == null) e.expectedRevision = "Reload the page";
  const day = (k, v, message) => (v == null || v === "" ? (message && (e[k] = message), null)
    : realDate(v) && v >= t.start_on && v <= today ? v : ((e[k] = `Use a date from ${t.start_on} to today`), null));
  const rooms = value.rooms.map((r, i) => {
    const condition = body.rooms[i]?.condition, k = `rooms.${i}`;
    if (!CONDITIONS.includes(condition)) e[`${k}.condition`] = "Choose how the room compares with check-in";
    else if (condition === "as_entry" && !listed.has(r.name?.toLowerCase())) e[`${k}.condition`] = snap
      ? "This room is not in the entry inventory: choose Changed or Not checked" : "There is no entry inventory to compare with";
    else if (condition === "changed" && r.observations === "") e[`${k}.observations`] = "Say what changed";
    return { name: r.name, condition, observations: r.observations };
  });
  const meter_readings = value.meter_readings.map((m, i) => ({ ...m,
    read_on: day(`meter_readings.${i}.read_on`, body.meter_readings[i]?.read_on, "Enter the date of the reading") }));
  const moved = day("moved_out_on", moved_out_on);
  if (done(e)) return done(e);
  const prev = await env.DB.prepare("SELECT revision, evidence_refs FROM tenancy_exit_inventories WHERE tenancy_id = ?").bind(t.id).first();
  if ((prev?.revision ?? 0) !== rev) fail(409, STALE);
  if (prev && await ask(env, HELD, t.id)) fail(409, HOLD);
  // A reference already on another tenancy's inventory is that case's evidence, not this one's.
  if (value.evidence_refs.length) {
    const side = table => `SELECT json_extract(j.value, '$.evidence_ref') AS ref FROM ${table} i, json_each(i.evidence_refs) j
      WHERE i.tenancy_id <> ?1 AND json_extract(j.value, '$.evidence_ref') IN (SELECT value FROM json_each(?2))`;
    const theirs = new Set((await env.DB.prepare(`${side("tenancy_entry_inventories")} UNION ${side("tenancy_exit_inventories")}`)
      .bind(t.id, JSON.stringify(value.evidence_refs)).all()).results.map(r => r.ref));
    value.evidence_refs.forEach((r, i) => theirs.has(r)
      && (e[`evidence_refs.${i}`] = "This reference is recorded for another tenancy. Enter where this tenancy's photos are kept"));
    if (done(e)) return done(e);
  }
  const ts = now(), next = rev + 1, kept = new Map(JSON.parse(prev?.evidence_refs ?? "[]").map(r => [r.evidence_ref, r]));
  const refs = value.evidence_refs.map(r => kept.get(r) ?? { evidence_ref: r, reviewed_at: ts, reviewed_by: actor, revision: next });
  const cols = [cited, snap && JSON.stringify(snap), moved, JSON.stringify(rooms), JSON.stringify(meter_readings), JSON.stringify(refs), ts, actor];
  const write = rev === 0
    ? env.DB.prepare(`INSERT INTO tenancy_exit_inventories (tenancy_id, revision, entry_inventory_revision, entry_snapshot, moved_out_on,
      rooms, meter_readings, evidence_refs, updated_at, updated_by) SELECT ?, 1, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${ENTRY_AS_READ}
      ON CONFLICT DO NOTHING`).bind(t.id, ...cols, t.id, cited)
    : env.DB.prepare(`UPDATE tenancy_exit_inventories SET revision = ?, entry_inventory_revision = ?, entry_snapshot = ?, moved_out_on = ?,
      rooms = ?, meter_readings = ?, evidence_refs = ?, updated_at = ?, updated_by = ? WHERE tenancy_id = ? AND revision = ?
      AND ${ENTRY_AS_READ} AND NOT ${HELD}`).bind(next, ...cols, t.id, rev, t.id, cited, t.id);
  // The history counts what changed; the references themselves stay out of it.
  await casWrite(env, "tenancy_exit_inventories", t, rev, [write, ensureChanged(env), rentalEvent(env, { rental_id: t.rental_id,
    tenancy_id: t.id, actor, type: "tenancy.exit_inventory_saved", data: { revision: next, rooms: rooms.length,
      changed: rooms.filter(r => r.condition === "changed").length, meter_readings: meter_readings.length, evidence_refs: refs.length,
      entry_revision: cited, moved_out_on: moved } })], async () => {
    if (((await entryRow(env, t.id))?.revision ?? null) !== cited) fail(409, ENTRY_MOVED);
    if (await ask(env, HELD, t.id)) fail(409, HOLD);
  });
  return { exit_inventory: { tenancy_id: t.id, revision: next, entry_inventory_revision: cited, entry: snap, moved_out_on: moved, rooms,
    meter_readings, evidence_refs: refs, updated_at: ts, updated_by: actor } };
}

// Deductions proposed from the deposit (whole pence, total at most the deposit), each citing, when it has one, a reference
// from this tenancy's inventories. Revised until mydeposits' progress is recorded; never an agreement or a payment.
export async function saveDepositProposal(env, { tenancy_id, expectedRevision, lines = [] }, actor) {
  const t = await tenancyRow(env, tenancy_id);
  const [exit, entry] = await Promise.all([env.DB.prepare("SELECT evidence_refs FROM tenancy_exit_inventories WHERE tenancy_id = ?")
    .bind(t.id).first(), entryRow(env, t.id)]);
  if (!exit) fail(409, "Record the exit inventory first: the deductions rest on it.");
  if (t.deposit == null) fail(409, "No deposit is recorded on this tenancy. Enter it with Edit details first.");
  const deposit_pence = t.deposit * 100, e = {}, rev = revision(expectedRevision);
  if (rev == null) e.expectedRevision = "Reload the page";
  const own = new Set([exit, entry].flatMap(x => JSON.parse(x?.evidence_refs ?? "[]")).map(r => r.evidence_ref));
  const list = Array.isArray(lines) && lines.length <= LINES_MAX ? lines : ((e.lines = `Up to ${LINES_MAX} deductions`), []);
  const value = list.map((l, i) => {
    const reason = typeof l?.reason === "string" ? l.reason.trim() : "", k = `lines.${i}`, given = l?.evidence_ref != null && l.evidence_ref !== "";
    if (!reason || reason.length > 200) e[`${k}.reason`] = "Say what the deduction is for (up to 200 characters)";
    const amount_pence = Number.isSafeInteger(l?.amount_pence) && l.amount_pence > 0 ? l.amount_pence
      : ((e[`${k}.amount_pence`] = "Enter an amount in pounds and pence, more than £0, like 120.50"), 0);
    const evidence_ref = given ? evidenceRef(l.evidence_ref) : null;
    if (given && !own.has(evidence_ref)) e[`${k}.evidence_ref`] = "Choose a reference recorded in this tenancy's inventories";
    return { reason, amount_pence, evidence_ref };
  });
  const total_pence = value.reduce((s, l) => s + l.amount_pence, 0);
  if (!e.lines && total_pence > deposit_pence) e.lines = `The deductions add up to ${gbp(total_pence)}, more than the ${gbp(deposit_pence)} deposit`;
  if (done(e)) return done(e);
  const prev = await env.DB.prepare("SELECT revision FROM tenancy_deposit_proposals WHERE tenancy_id = ?").bind(t.id).first();
  if ((prev?.revision ?? 0) !== rev) fail(409, STALE);
  if (prev && await ask(env, HELD, t.id)) fail(409, HOLD);
  const ts = now(), next = rev + 1, cols = [deposit_pence, total_pence, JSON.stringify(value), ts, actor];
  const write = rev === 0
    ? env.DB.prepare(`INSERT INTO tenancy_deposit_proposals (tenancy_id, revision, deposit_pence, total_pence, lines, updated_at, updated_by)
      VALUES (?, 1, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).bind(t.id, ...cols)
    : env.DB.prepare(`UPDATE tenancy_deposit_proposals SET revision = ?, deposit_pence = ?, total_pence = ?, lines = ?, updated_at = ?,
      updated_by = ? WHERE tenancy_id = ? AND revision = ? AND NOT ${HELD}`).bind(next, ...cols, t.id, rev, t.id);
  await casWrite(env, "tenancy_deposit_proposals", t, rev, [write, ensureChanged(env), rentalEvent(env, { rental_id: t.rental_id,
    tenancy_id: t.id, actor, type: "deposit.proposal_saved", data: { revision: next, lines: value.length, total_pence, deposit_pence } })],
  async () => { if (await ask(env, HELD, t.id)) fail(409, HOLD); });
  return { proposal: { revision: next, deposit_pence, total_pence, lines: value, updated_at: ts, updated_by: actor } };
}

// One step with mydeposits (requested, agreed, disputed or returned), each with the reference to its confirmation and the
// day it happened, after the keys came back. Kept as recorded (0059's triggers); a return is the last step.
export async function recordDepositOutcome(env, { tenancy_id, expectedRevision, status, evidence_ref, occurred_on }, actor) {
  const t = await tenancyRow(env, tenancy_id);
  const [p, x] = await Promise.all([env.DB.prepare("SELECT revision FROM tenancy_deposit_proposals WHERE tenancy_id = ?").bind(t.id).first(),
    env.DB.prepare("SELECT moved_out_on FROM tenancy_exit_inventories WHERE tenancy_id = ?").bind(t.id).first()]);
  if (!p) fail(409, "Save the proposed deductions first, even when there are none.");
  if (!x.moved_out_on) fail(409, "Record the day the keys came back in the exit inventory first.");
  const e = {}, rev = revision(expectedRevision), ref = evidenceRef(evidence_ref);
  if (!OUTCOMES.includes(status)) e.status = "Choose what happened with mydeposits";
  if (!ref) e.evidence_ref = "Enter where the confirmation is kept (up to 120 characters): a step without one is not recorded";
  if (!(realDate(occurred_on) && occurred_on >= x.moved_out_on && occurred_on <= jerseyToday()))
    e.occurred_on = `Use a date from ${x.moved_out_on} to today`;
  if (rev == null) e.expectedRevision = "Reload the page";
  if (done(e)) return done(e);
  if (p.revision !== rev) fail(409, STALE);
  if (await ask(env, IS_RETURNED, t.id)) fail(409, RETURNED);
  const next = rev + 1;
  await casWrite(env, "tenancy_deposit_proposals", t, rev, [
    env.DB.prepare(`UPDATE tenancy_deposit_proposals SET revision = ? WHERE tenancy_id = ? AND revision = ? AND NOT ${IS_RETURNED}`)
      .bind(next, t.id, rev, t.id),
    ensureChanged(env),
    env.DB.prepare(`INSERT INTO tenancy_deposit_outcomes (tenancy_id, revision, status, evidence_ref, occurred_on, recorded_at, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(t.id, next, status, ref, occurred_on, now(), actor),
    rentalEvent(env, { rental_id: t.rental_id, tenancy_id: t.id, actor, type: "deposit.outcome_recorded", data: { revision: next, status, occurred_on } }),
  ], async () => { if (await ask(env, IS_RETURNED, t.id)) fail(409, RETURNED); });
  return readExit(env, t.id);
}
