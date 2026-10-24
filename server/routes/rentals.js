import { json, fail, readJson, now } from "../http.js";
import { validateLandlord, validateRental, validateRepair, COMPLIANCE, REPAIR_NEXT, addMonths, complianceStatus } from "../rentals.js";
import { fields, result } from "../sales.js";
import { LOCK } from "./applicants.js";
import { jerseyToday, realDate } from "../viewings.js";

export const fieldErrors = errors => json({ error: "Please check the highlighted fields", fields: errors }, 400);
export const asObject = body => (body && typeof body === "object" && !Array.isArray(body) ? body : fail(400, "Invalid format"));
const STALE = "Someone else saved changes here. Reload to see them (your changes were not saved).";
// A tenancy still running: no end, or a planned move-out still ahead (R24). Binds today.
export const ACTIVE = "(ended_on IS NULL OR ended_on > ?)";

// R18: one rental_events row. newest: {key: table} for rows inserted earlier in the same batch, read as the table's
// MAX(id) (like logEvent): rental_id and tenancy_id fill those columns, and every key also lands in data.
export function rentalEvent(env, { rental_id = null, tenancy_id = null, actor, type, data = null }, newest = {}) {
  const col = (k, v) => (newest[k] ? [`(SELECT MAX(id) FROM ${newest[k]})`, []] : ["?", [v]]);
  const [r, rb] = col("rental_id", rental_id), [t, tb] = col("tenancy_id", tenancy_id);
  const ids = Object.entries(newest).map(([k, table]) => `, '$.${k}', (SELECT MAX(id) FROM ${table})`).join("");
  return env.DB.prepare(`INSERT INTO rental_events (rental_id, tenancy_id, at, actor, type, data)
    VALUES (${r}, ${t}, ?, ?, ?, ${ids ? `json_set(?${ids})` : "?"})`)
    .bind(...rb, ...tb, now(), actor, type, ids || data != null ? JSON.stringify(data ?? {}) : null);
}

// Fails the whole batch (NOT NULL) when the statement just before changed no row, like ensureChanged in sales.js.
export const ensureChanged = env => env.DB.prepare("INSERT INTO landlords (name) SELECT NULL WHERE changes() = 0");

const RENTAL_SQL = `SELECT r.*, l.name AS landlord_name, l.email AS landlord_email, l.phone AS landlord_phone,
  l.approval_limit FROM rentals r JOIN landlords l ON l.id = r.landlord_id WHERE r.id = ?`;
const loadRental = async (env, id) =>
  (await env.DB.prepare(RENTAL_SQL).bind(Number(id)).first()) ?? fail(404, "Property not found");
const loadLandlord = async (env, id) =>
  (await env.DB.prepare("SELECT * FROM landlords WHERE id = ?").bind(Number(id)).first()) ?? fail(404, "Landlord not found");
const openLandlord = async (env, id) =>
  !!(await env.DB.prepare("SELECT 1 FROM landlords WHERE id = ? AND archived_at IS NULL").bind(id).first());
const NO_LANDLORD = { landlord_id: "Choose a landlord" };
// Inside a batch: fails it (NOT NULL) unless the landlord exists and is not archived.
const guardLandlord = (env, id) => env.DB.prepare(`INSERT INTO landlords (name) SELECT NULL
  WHERE NOT EXISTS (SELECT 1 FROM landlords WHERE id = ? AND archived_at IS NULL)`).bind(id);

// A form save (§3): the row must still be the one the form read (409 otherwise), only the changed keys are written,
// and extra(keys, of) adds the event and the rest to the same batch. LOCK fails it all if a save lands meanwhile.
// Returns false when nothing changed.
export async function save(env, admin, table, cur, body, value, extra) {
  if (typeof body.updated_at !== "string") fail(400, "Missing updated_at: reload the page");
  if (body.updated_at !== cur.updated_at) fail(409, STALE);
  const keys = Object.keys(value).filter(k => value[k] !== cur[k]);
  if (!keys.length) return false;
  const of = row => Object.fromEntries(keys.map(k => [k, row[k]]));
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(", ")}, updated_by = ?, ${LOCK} WHERE id = ?`)
        .bind(...keys.map(k => value[k]), admin, body.updated_at, now(), cur.id),
      ...extra(keys, of),
    ]);
  } catch (e) {
    const row = await env.DB.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).bind(cur.id).first();
    if (row.updated_at !== body.updated_at) fail(409, STALE);
    throw e;
  }
  return true;
}

// D9, R19: archive or restore when nothing in `blocks` ([SQL over the row, binds, 409 message]) is in the way: checked
// first for the answer, and again in the UPDATE itself, so a change meanwhile fails the batch instead of slipping by.
async function setArchived(env, admin, table, id, archive, blocks, event) {
  const why = env.DB.prepare(`SELECT CASE ${blocks.map((b, i) => `WHEN ${b[0]} THEN ${i}`).join(" ")} END AS why
    FROM ${table} WHERE id = ?`).bind(...blocks.flatMap(b => b[1]), id);
  const check = async () => {
    const row = await why.first();
    if (row?.why != null) fail(409, blocks[row.why][2]);
  };
  await check();
  const ts = now();
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE ${table} SET archived_at = ?, updated_at = ?, updated_by = ? WHERE id = ?
        AND NOT (${blocks.map(b => b[0]).join(" OR ")})`).bind(archive ? ts : null, ts, admin, id, ...blocks.flatMap(b => b[1])),
      ensureChanged(env),
      event,
    ]);
  } catch (e) {
    await check();
    throw e;
  }
}

// Landlords (R3), the archived ones last, with how many properties they have that are not archived.
async function listLandlords({ env }) {
  const { results } = await env.DB.prepare(`SELECT l.*, (SELECT COUNT(*) FROM rentals r WHERE r.landlord_id = l.id
    AND r.archived_at IS NULL) AS active_rentals FROM landlords l ORDER BY l.archived_at IS NOT NULL, l.name COLLATE NOCASE, l.id`).all();
  return json({ landlords: results });
}

async function getLandlord({ env, params: [id] }) {
  const landlord = await loadLandlord(env, id);
  const { results } = await env.DB.prepare(`SELECT id, address, parish, service, archived_at FROM rentals WHERE landlord_id = ?
    ORDER BY archived_at IS NOT NULL, address COLLATE NOCASE, id`).bind(landlord.id).all();
  return json({ landlord, rentals: results });
}

async function createLandlord({ request, env, admin }) {
  const r = validateLandlord(asObject(await readJson(request)));
  if (r.errors) return fieldErrors(r.errors);
  const ts = now(), row = { ...r.value, created_at: ts, created_by: admin, updated_at: ts, updated_by: admin };
  const [res] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO landlords (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`)
      .bind(...Object.values(row)),
    rentalEvent(env, { actor: admin, type: "landlord.created", data: r.value }, { landlord_id: "landlords" }),
  ]);
  return json({ landlord: await loadLandlord(env, res.meta.last_row_id) }, 201);
}

async function updateLandlord({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request));
  const r = validateLandlord(body, { partial: true });
  if (r.errors) return fieldErrors(r.errors);
  const cur = await loadLandlord(env, id);
  await save(env, admin, "landlords", cur, body, r.value, (keys, of) => [rentalEvent(env, { actor: admin,
    type: "landlord.updated", data: { landlord_id: cur.id, before: of(cur), after: of(r.value) } })]);
  return json({ landlord: await loadLandlord(env, cur.id) });
}

// A landlord is archived only once all their properties are.
async function landlordState({ env, admin, params: [id, action] }) {
  const cur = await loadLandlord(env, id), archive = action === "archive";
  await setArchived(env, admin, "landlords", cur.id, archive, archive
    ? [["landlords.archived_at IS NOT NULL", [], "This landlord is already archived"],
      ["EXISTS (SELECT 1 FROM rentals r WHERE r.landlord_id = landlords.id AND r.archived_at IS NULL)", [],
        "Archive their properties first"]]
    : [["landlords.archived_at IS NULL", [], "This landlord isn't archived"]],
  rentalEvent(env, { actor: admin, type: `landlord.${archive ? "archived" : "restored"}`, data: { landlord_id: cur.id } }));
  return json({ landlord: await loadLandlord(env, cur.id) });
}

// R10, R11: the property's checks in COMPLIANCE order (gas only when it may have gas), each with its status today.
const checks = (rental, rows, today) => COMPLIANCE.filter(([k]) => k !== "gas" || rental.has_gas !== 0)
  .map(c => item(c, rows.find(i => i.kind === c[0]), today));
const item = ([kind, label, years], row, today) => ({ kind, label, years, done_on: row?.done_on ?? null,
  expires_on: row?.expires_on ?? null, note: row?.note ?? null, updated_at: row?.updated_at ?? null,
  updated_by: row?.updated_by ?? null, status: complianceStatus(row ?? {}, today) });

// The property page (P14): its data, its checks, its repairs (open ones first, then the newest), its tenancies (newest
// first; charges and payments are on the tenancy's own GET) and its last 100 events.
async function getRental({ env, params: [id] }) {
  const q = sql => env.DB.prepare(sql).bind(Number(id));
  const [[rental], rows, repairs, tenancies, events] = (await env.DB.batch([q(RENTAL_SQL),
    q("SELECT * FROM compliance_items WHERE rental_id = ?"),
    q("SELECT * FROM repairs WHERE rental_id = ? ORDER BY status IN ('done', 'cancelled'), id DESC"),
    q(`SELECT id, payment_ref, tenant_name, kind, regime, start_on, end_on, ended_on, rent, collect_from, notice_given_on,
      notice_by FROM tenancies WHERE rental_id = ? ORDER BY start_on DESC, id DESC`),
    q("SELECT id, tenancy_id, at, actor, type, data FROM rental_events WHERE rental_id = ? ORDER BY at DESC, id DESC LIMIT 100"),
  ])).map(r => r.results);
  if (!rental) fail(404, "Property not found");
  return json({ rental, compliance: checks(rental, rows, jerseyToday()), repairs, tenancies,
    events: events.map(e => ({ ...e, data: e.data == null ? null : JSON.parse(e.data) })) });
}

// R3, R11: the property and its empty checks ("Not recorded") in one batch, for a landlord not archived.
async function createRental({ request, env, admin }) {
  const r = validateRental(asObject(await readJson(request)));
  if (r.errors) return fieldErrors(r.errors);
  if (!(await openLandlord(env, r.value.landlord_id))) return fieldErrors(NO_LANDLORD);
  const ts = now(), row = { ...r.value, created_at: ts, created_by: admin, updated_at: ts, updated_by: admin };
  const kinds = COMPLIANCE.map(([k]) => k).filter(k => k !== "gas" || row.has_gas !== 0);
  let res;
  try {
    [res] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO rentals (${Object.keys(row).join(", ")}) SELECT ${Object.keys(row).map(() => "?").join(", ")}
        FROM landlords WHERE id = ? AND archived_at IS NULL`).bind(...Object.values(row), row.landlord_id),
      ensureChanged(env),
      env.DB.prepare("INSERT INTO compliance_items (rental_id, kind) SELECT (SELECT MAX(id) FROM rentals), value FROM json_each(?)")
        .bind(JSON.stringify(kinds)),
      rentalEvent(env, { actor: admin, type: "rental.created", data: r.value }, { rental_id: "rentals" }),
    ]);
  } catch (e) {
    if (!(await openLandlord(env, row.landlord_id))) return fieldErrors(NO_LANDLORD);
    throw e;
  }
  return json({ rental: await loadRental(env, res.meta.last_row_id) }, 201);
}

// The stored row and the body are checked together, never left to the database's CHECKs. R22: going from let only to
// full with a tenancy running asks from when Hampton collects its rent, saved on that tenancy in the same batch.
async function updateRental({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request));
  const r = validateRental(body, { partial: true });
  if (r.errors) return fieldErrors(r.errors);
  const cur = await loadRental(env, id), next = { ...cur, ...r.value };
  if (next.service === "full" && next.fee_percent == null) return fieldErrors({ fee_percent: "Enter the management fee" });
  if (next.landlord_id !== cur.landlord_id && !(await openLandlord(env, next.landlord_id))) return fieldErrors(NO_LANDLORD);
  const running = cur.service === "let_only" && next.service === "full" ? (await env.DB.prepare(
    `SELECT id, start_on FROM tenancies WHERE rental_id = ? AND ${ACTIVE}`).bind(cur.id, jerseyToday()).all()).results : [];
  const errors = {}, collect_from = running.length ? fields(body, errors).date("collect_from") : null;
  if (running.length && !collect_from) errors.collect_from ??= "Enter the date Hampton starts collecting the rent";
  if (running.some(t => collect_from < t.start_on)) errors.collect_from = "Collect from the start of the tenancy or later";
  if (Object.keys(errors).length) return fieldErrors(errors);
  const ids = running.map(t => t.id), ts = now(), moving = next.landlord_id !== cur.landlord_id;
  await save(env, admin, "rentals", cur, body, r.value, (keys, of) => [
    // The landlord read above may be archived meanwhile: checked again in the write.
    ...(moving ? [guardLandlord(env, next.landlord_id)] : []),
    rentalEvent(env, { rental_id: cur.id, actor: admin, type: "rental.updated",
      data: { before: of(cur), after: of(next), ...(ids.length ? { collect_from, tenancy_ids: ids } : {}) } }),
    // R11: a property that may have gas gets its gas check row back.
    ...(keys.includes("has_gas") && next.has_gas !== 0
      ? [env.DB.prepare("INSERT OR IGNORE INTO compliance_items (rental_id, kind) VALUES (?, 'gas')").bind(cur.id)] : []),
    // updated_at moves too, so an open tenancy form gets 409 instead of writing over collect_from.
    ...(ids.length ? [env.DB.prepare(`UPDATE tenancies SET collect_from = ?, updated_at = ?, updated_by = ?
      WHERE id IN (${ids.map(() => "?").join(", ")})`).bind(collect_from, ts, admin, ...ids)] : []),
  ]).catch(async e => {
    if (moving && !(await openLandlord(env, next.landlord_id))) fail(409, "That landlord was archived meanwhile. Choose another");
    throw e;
  });
  return json({ rental: await loadRental(env, cur.id) });
}

// R19: no archive while a tenancy runs or a repair is open; no restore under an archived landlord.
async function rentalState({ env, admin, params: [id, action] }) {
  const cur = await loadRental(env, id), archive = action === "archive";
  await setArchived(env, admin, "rentals", cur.id, archive, archive
    ? [["rentals.archived_at IS NOT NULL", [], "This property is already archived"],
      [`EXISTS (SELECT 1 FROM tenancies t WHERE t.rental_id = rentals.id AND ${ACTIVE})`, [jerseyToday()], "End its tenancy first"],
      ["EXISTS (SELECT 1 FROM repairs p WHERE p.rental_id = rentals.id AND p.status NOT IN ('done', 'cancelled'))", [],
        "Close its repairs first"]]
    : [["rentals.archived_at IS NULL", [], "This property isn't archived"],
      ["EXISTS (SELECT 1 FROM landlords l WHERE l.id = rentals.landlord_id AND l.archived_at IS NOT NULL)", [],
        "Restore its landlord first"]],
  rentalEvent(env, { rental_id: cur.id, actor: admin, type: `rental.${archive ? "archived" : "restored"}` }));
  return json({ rental: await loadRental(env, cur.id) });
}

// R10, R11: a check done on done_on (not after today); without expires_on it lasts its COMPLIANCE period.
async function updateCompliance({ request, env, admin, params: [id, kind] }) {
  const c = COMPLIANCE.find(([k]) => k === kind) ?? fail(404, "Check not found");
  const errors = {}, f = fields(asObject(await readJson(request)), errors);
  const done_on = f.date("done_on"), given = f.date("expires_on"), note = f.text("note", 300);
  if (!done_on) f.err("done_on", "Enter the date it was done");
  else if (done_on > jerseyToday()) f.err("done_on", "Use today or an earlier date");
  if (done_on && given && given <= done_on) f.err("expires_on", "The expiry must be after the date it was done");
  if (Object.keys(errors).length) return fieldErrors(errors);
  const rental = await loadRental(env, id);
  if (kind === "gas" && rental.has_gas === 0) fail(400, "This property has no gas: change that first");
  const before = await env.DB.prepare("SELECT done_on, expires_on, note FROM compliance_items WHERE rental_id = ? AND kind = ?")
    .bind(rental.id, kind).first();
  const after = { done_on, expires_on: given ?? addMonths(done_on, c[2] * 12), note }, ts = now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO compliance_items (rental_id, kind, done_on, expires_on, note, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (rental_id, kind) DO UPDATE SET done_on = excluded.done_on,
      expires_on = excluded.expires_on, note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(rental.id, kind, after.done_on, after.expires_on, after.note, ts, admin),
    rentalEvent(env, { rental_id: rental.id, actor: admin, type: "compliance.updated", data: { kind, before, after } }),
  ]);
  return json({ item: item(c, { ...after, updated_at: ts, updated_by: admin }, jerseyToday()) });
}

const loadRepair = async (env, id) =>
  (await env.DB.prepare("SELECT * FROM repairs WHERE id = ?").bind(Number(id)).first()) ?? fail(404, "Repair not found");

// R14, on the merged row (never the database's CHECK): done needs its date and cost (400); the status moves only as
// REPAIR_NEXT allows, and a quote or cost (the larger) above the landlord's approval_limit goes ahead only once they
// approved it (409). The approval is stamped on awaiting_approval → approved, and dropped when asked again or when the
// quote goes up.
function repairRules(cur, next, limit, ts) {
  const errors = {};
  if (next.status === "done" && !next.done_on) errors.done_on = "Enter the date it was done";
  if (next.status === "done" && next.cost == null) errors.cost = "Enter the final cost";
  if (Object.keys(errors).length) return fieldErrors(errors);
  const from = cur?.status ?? "reported";
  if (next.status !== from && !REPAIR_NEXT[from].includes(next.status))
    fail(409, `A repair can't go from ${from.replace("_", " ")} to ${next.status.replace("_", " ")}`);
  if (next.status === "awaiting_approval" || (cur && next.quote > cur.quote)) next.approved_at = null;
  if (from === "awaiting_approval" && next.status === "approved") next.approved_at = ts;
  if (["approved", "in_progress", "done"].includes(next.status) && limit != null
    && Math.max(next.quote ?? 0, next.cost ?? 0) > limit && !next.approved_at)
    fail(409, `The quote or cost is above the landlord's approval limit of £${limit}: mark it Awaiting approval first`);
  return null;
}

// R14: a repair on a property not archived, on its running tenancy if it has one.
async function createRepair({ request, env, admin, params: [id] }) {
  const r = validateRepair(asObject(await readJson(request)));
  if (r.errors) return fieldErrors(r.errors);
  const state = () => env.DB.prepare(`SELECT r.id, r.archived_at, l.approval_limit, (SELECT t.id FROM tenancies t
    WHERE t.rental_id = r.id AND ${ACTIVE} ORDER BY t.start_on, t.id LIMIT 1) AS tenancy_id
    FROM rentals r JOIN landlords l ON l.id = r.landlord_id WHERE r.id = ?`).bind(jerseyToday(), Number(id)).first();
  const s = (await state()) ?? fail(404, "Property not found");
  const archived = st => { if (st.archived_at) fail(409, "This property is archived"); };
  archived(s);
  const ts = now(), value = { status: "reported", ...r.value };
  const bad = repairRules(null, value, s.approval_limit, ts);
  if (bad) return bad;
  const row = { ...value, rental_id: s.id, tenancy_id: s.tenancy_id, created_at: ts, created_by: admin, updated_at: ts,
    updated_by: admin };
  let res;
  try {
    [res] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO repairs (${Object.keys(row).join(", ")}) SELECT ${Object.keys(row).map(() => "?").join(", ")}
        FROM rentals WHERE id = ? AND archived_at IS NULL`).bind(...Object.values(row), s.id),
      ensureChanged(env),
      rentalEvent(env, { rental_id: s.id, tenancy_id: s.tenancy_id, actor: admin, type: "repair.created", data: value },
        { repair_id: "repairs" }),
    ]);
  } catch (e) {
    archived(await state());
    throw e;
  }
  return json({ repair: await loadRepair(env, res.meta.last_row_id) }, 201);
}

// R14: a form save (lock), so a status change meanwhile is a 409; each change is one repair.updated event.
async function updateRepair({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request));
  const r = validateRepair(body, { partial: true });
  if (r.errors) return fieldErrors(r.errors);
  const cur = await env.DB.prepare(`SELECT p.*, l.approval_limit FROM repairs p JOIN rentals r ON r.id = p.rental_id
    JOIN landlords l ON l.id = r.landlord_id WHERE p.id = ?`).bind(Number(id)).first() ?? fail(404, "Repair not found");
  const { approval_limit, ...stored } = cur, next = { ...stored, ...r.value };
  const bad = repairRules(stored, next, approval_limit, now());
  if (bad) return bad;
  const value = { ...r.value, approved_at: next.approved_at };
  await save(env, admin, "repairs", stored, body, value, (keys, of) => [rentalEvent(env, { rental_id: cur.rental_id,
    tenancy_id: cur.tenancy_id, actor: admin, type: "repair.updated", data: { repair_id: cur.id, before: of(stored),
      after: of(value) } })]);
  return json({ repair: await loadRepair(env, cur.id) });
}

// R12, R29: a percentage from 0 to 30 with up to two decimals.
function percent(b, errors) {
  const n = typeof b.percent === "string" && b.percent.trim() ? Number(b.percent) : b.percent;
  return typeof n === "number" && n >= 0 && n <= 30 && Math.abs(Math.round(n * 100) - n * 100) < 1e-6 ? Math.round(n * 100) / 100
    : (errors.percent = "Enter a percentage from 0 to 30, with up to two decimals", null);
}
// R9: a column of the bank file, by position (headers may repeat).
const column = (b, k, errors) => (Number.isInteger(b[k]) && b[k] >= 0 && b[k] < 1000 ? b[k] : (errors[k] = "Choose a column", null));

// [app_settings key for the request, check(body) → {value} | {errors}, the answer for a stored value (null if none)].
const SETTINGS = {
  rpi: [() => "rpi", b => {
    const errors = {}, value = { percent: percent(b, errors), as_of: realDate(b.as_of) ? b.as_of : null };
    if (!value.as_of) errors.as_of = "Enter a date as YYYY-MM-DD";
    return result(value, errors);
  }, v => ({ rpi: v })],
  gst: [() => "gst_percent", b => { const errors = {}, p = percent(b, errors); return result(p, errors); },
    v => ({ percent: v ?? 0 })],
  // R9: the client's SHA-256 of the header row, in hex.
  "csv-map": [request => {
    const h = (new URL(request.url).searchParams.get("header") ?? "").toLowerCase();
    return /^[0-9a-f]{64}$/.test(h) ? `csv_map:${h}` : fail(400, "Missing or invalid header fingerprint");
  }, b => {
    const errors = {}, value = { date: column(b, "date", errors), amount: column(b, "amount", errors),
      description: column(b, "description", errors), date_format: ["DMY", "ISO"].includes(b.date_format) ? b.date_format : null };
    if (!value.date_format) errors.date_format = "Choose DD/MM/YYYY or YYYY-MM-DD";
    return result(value, errors);
  }, v => ({ map: v })],
};

async function getSetting({ request, env, params: [name] }) {
  const [key, , answer] = SETTINGS[name];
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(key(request)).first();
  return json(answer(row ? JSON.parse(row.value) : null));
}

async function putSetting({ request, env, admin, params: [name] }) {
  const [key, check, answer] = SETTINGS[name], k = key(request);
  const r = check(asObject(await readJson(request)));
  if (r.errors) return fieldErrors(r.errors);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(k, JSON.stringify(r.value), now(), admin),
    rentalEvent(env, { actor: admin, type: "settings.updated", data: { key: k, value: r.value } }),
  ]);
  return json(answer(r.value));
}

export default [
  ["GET", /^\/admin\/landlords$/, listLandlords, true],
  ["POST", /^\/admin\/landlords$/, createLandlord, true],
  ["GET", /^\/admin\/landlords\/(\d+)$/, getLandlord, true],
  ["PUT", /^\/admin\/landlords\/(\d+)$/, updateLandlord, true],
  ["POST", /^\/admin\/landlords\/(\d+)\/(archive|restore)$/, landlordState, true],
  ["POST", /^\/admin\/rentals$/, createRental, true],
  ["GET", /^\/admin\/rentals\/(\d+)$/, getRental, true],
  ["PUT", /^\/admin\/rentals\/(\d+)$/, updateRental, true],
  ["POST", /^\/admin\/rentals\/(\d+)\/(archive|restore)$/, rentalState, true],
  ["PUT", /^\/admin\/rentals\/(\d+)\/compliance\/([a-z]+)$/, updateCompliance, true],
  ["POST", /^\/admin\/rentals\/(\d+)\/repairs$/, createRepair, true],
  ["PUT", /^\/admin\/repairs\/(\d+)$/, updateRepair, true],
  ["GET", /^\/admin\/settings\/(rpi|gst|csv-map)$/, getSetting, true],
  ["PUT", /^\/admin\/settings\/(rpi|gst|csv-map)$/, putSetting, true],
];
