import { json, fail, readJson, now } from "../http.js";
import { validHours, validException, jerseyNow, DEFAULT_HOURS, SLOT_MINUTES } from "../viewings.js";
import { loadAvailability } from "../viewing-store.js";
import { viewingPolicyReady, validViewingPolicy } from "../viewing-policy.js";
import { availabilityRange } from "./public.js";

const fields = f => json({ error: "Please check the highlighted fields.", fields: f }, 400);
const ID = /^[1-9]\d{0,8}$/;

// Every negotiator, active or not (D9: they are deactivated, never deleted), with their exceptions from today on.
// VIS-09, gate on: each also has viewing_policy, their saved viewing rules (null: none saved, the plan's defaults apply).
async function list({ env }) {
  const ready = viewingPolicyReady(env);
  const [people, exceptions, policies = []] = await env.DB.batch([
    env.DB.prepare("SELECT id, name, role, active, hours FROM negotiators ORDER BY id"),
    env.DB.prepare(`SELECT id, negotiator_id, date, kind, start_time, end_time, note, created_by FROM negotiator_exceptions
      WHERE date >= ? ORDER BY date, start_time, id`).bind(jerseyNow().date),
    ...(ready ? [env.DB.prepare(`SELECT negotiator_id, duration_minutes, buffer_minutes, parish_extra_minutes, max_daily,
      revision FROM viewing_policy_settings`)] : []),
  ]).then(r => r.map(x => x.results));
  const policyOf = id => { const p = policies.find(x => x.negotiator_id === id); if (!p) return null;
    const { negotiator_id, ...rules } = p; return rules; };
  return json({ negotiators: people.map(p => ({ ...p, hours: JSON.parse(p.hours),
    exceptions: exceptions.filter(e => e.negotiator_id === p.id).map(({ negotiator_id, ...e }) => e),
    ...(ready ? { viewing_policy: policyOf(p.id) } : {}) })) });
}

// VIS-09: save a negotiator's viewing rules. revision is the one the form was loaded with (0: none saved yet); a save
// made meanwhile by someone else is refused, never overwritten. Rules are edited in place, never removed (0047).
async function savePolicy({ request, env, admin, params: [id] }) {
  if (!viewingPolicyReady(env)) fail(404, "Not found");
  const r = validViewingPolicy(await readJson(request));
  if (r.errors) return fields(r.errors);
  const { revision, ...p } = r.value, n = Number(id), ts = now();
  const values = [p.duration_minutes, p.buffer_minutes, p.parish_extra_minutes, p.max_daily];
  const out = revision === 0
    ? await env.DB.prepare(`INSERT INTO viewing_policy_settings (negotiator_id, duration_minutes, buffer_minutes,
        parish_extra_minutes, max_daily, revision, updated_at, updated_by)
      SELECT id, ?, ?, ?, ?, 1, ?, ? FROM negotiators WHERE id = ?
        AND NOT EXISTS (SELECT 1 FROM viewing_policy_settings WHERE negotiator_id = ?)`).bind(...values, ts, admin, n, n).run()
    : await env.DB.prepare(`UPDATE viewing_policy_settings SET duration_minutes = ?, buffer_minutes = ?,
        parish_extra_minutes = ?, max_daily = ?, revision = revision + 1, updated_at = ?, updated_by = ?
      WHERE negotiator_id = ? AND revision = ?`).bind(...values, ts, admin, n, revision).run();
  if (out.meta.changes) return json({ ok: true });
  if (!(await env.DB.prepare("SELECT 1 FROM negotiators WHERE id = ?").bind(n).first())) fail(404, "Unknown negotiator");
  fail(409, "Someone else changed these viewing rules. Reload to see them (your changes were not saved).");
}

// The fields of a create (name required, hours defaulting to C2's week) or of an update (only those sent).
function readNegotiator(body, create) {
  const src = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const value = {}, errors = {};
  if (create || "name" in src) {
    const name = typeof src.name === "string" ? src.name.trim() : "";
    if (!name || name.length > 80) errors.name = "Enter a name of 80 characters or fewer";
    value.name = name;
  }
  if ("role" in src) {
    const role = src.role == null ? "" : src.role;
    if (typeof role !== "string" || role.trim().length > 80) errors.role = "Use 80 characters or fewer for the role";
    else value.role = role.trim() || null;
  }
  if (!create && "active" in src) {
    if (![true, false, 0, 1].includes(src.active)) errors.active = "Choose active or inactive";
    value.active = src.active ? 1 : 0;
  }
  if ("hours" in src) { Object.assign(errors, validHours(src.hours)); value.hours = JSON.stringify(src.hours); }
  else if (create) value.hours = JSON.stringify(DEFAULT_HOURS);
  return Object.keys(errors).length ? { errors } : { value };
}

const sameName = e => {
  if (/UNIQUE/i.test(String(e?.message))) fail(409, "There is already a negotiator with that name");
  throw e;
};

async function create({ request, env, admin }) {
  const r = readNegotiator(await readJson(request), true);
  if (r.errors) return fields(r.errors);
  const { name, role = null, hours } = r.value, ts = now();
  const out = await env.DB.prepare(`INSERT INTO negotiators (name, role, hours, created_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?)`).bind(name, role, hours, ts, ts, admin).run().catch(sameName);
  return json({ id: out.meta.last_row_id }, 201);
}

async function update({ request, env, admin, params: [id] }) {
  const r = readNegotiator(await readJson(request), false);
  if (r.errors) return fields(r.errors);
  const cols = Object.keys(r.value);
  if (!cols.length) fail(400, "Send name, role, active or hours");
  const out = await env.DB.prepare(`UPDATE negotiators SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ?
    WHERE id = ?`).bind(...Object.values(r.value), now(), admin, Number(id)).run().catch(sameName);
  if (!out.meta.changes) fail(404, "Unknown negotiator");
  return json({ ok: true });
}

// C3. daySlots uses only the first open span of a day, so a second one for the same person and date is refused; the
// check is part of the insert, as two saves at once would otherwise both pass it.
async function addException({ request, env, admin, params: [id] }) {
  const r = validException(await readJson(request));
  if (r.errors) return fields(r.errors);
  const v = r.value;
  // An earlier date would never be shown again, nor change any slot.
  if (v.date < jerseyNow().date) return fields({ date: "Choose a date from today" });
  if (!(await env.DB.prepare("SELECT 1 FROM negotiators WHERE id = ?").bind(Number(id)).first())) fail(404, "Unknown negotiator");
  const out = await env.DB.prepare(`INSERT INTO negotiator_exceptions (negotiator_id, date, kind, start_time, end_time, note,
      created_at, created_by)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ? <> 'open' OR NOT EXISTS (SELECT 1 FROM negotiator_exceptions
      WHERE negotiator_id = ? AND date = ? AND kind = 'open')`)
    .bind(Number(id), v.date, v.kind, v.start_time, v.end_time, v.note, now(), admin, v.kind, Number(id), v.date).run();
  if (!out.meta.changes) fail(409, "This day already has extra opening hours. Remove them first.");
  return json({ id: out.meta.last_row_id }, 201);
}

async function removeException({ env, params: [id, eid] }) {
  const out = await env.DB.prepare("DELETE FROM negotiator_exceptions WHERE id = ? AND negotiator_id = ?")
    .bind(Number(eid), Number(id)).run();
  if (!out.meta.changes) fail(404, "That exception no longer exists");
  return json({ ok: true });
}

// The website's slots with today's still to come (C11). Asking for one negotiator includes them even when inactive,
// so their viewings can be moved to someone else. exclude=<viewing id>: the viewing being rescheduled, which never
// blocks its own slot or the ones next to it (as clash(…, excludeId) when it is saved).
async function availability({ request, env }) {
  const q = new URL(request.url).searchParams, clock = jerseyNow(), id = q.get("negotiator_id"), exclude = q.get("exclude");
  const listingId = q.get("listing_id");
  if (listingId != null && !/^HE-[A-Z]\d{3,}$/.test(listingId)) fail(400, "Unknown property");
  if (id != null && !ID.test(id)) fail(400, "Unknown negotiator");
  if (exclude != null && !ID.test(exclude)) fail(400, "Unknown viewing");
  const a = await loadAvailability(env, { ...availabilityRange(q, clock.date), now: clock, fromTomorrow: false,
    includeInactive: id != null, negotiatorId: id == null ? null : Number(id), excludeId: exclude == null ? null : Number(exclude), listingId });
  if (id != null && !a.negotiators.length) fail(404, "Unknown negotiator");
  return json({ slot_minutes: SLOT_MINUTES, ...a });
}

export default [
  ["GET", /^\/admin\/negotiators$/, list, true],
  ["POST", /^\/admin\/negotiators$/, create, true],
  ["PUT", /^\/admin\/negotiators\/(\d+)$/, update, true],
  ["PUT", /^\/admin\/negotiators\/(\d+)\/viewing-policy$/, savePolicy, true],
  ["POST", /^\/admin\/negotiators\/(\d+)\/exceptions$/, addException, true],
  ["DELETE", /^\/admin\/negotiators\/(\d+)\/exceptions\/(\d+)$/, removeException, true],
  ["GET", /^\/admin\/availability$/, availability, true],
];
