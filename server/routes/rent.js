import { json, fail, readJson, now } from "../http.js";
import { validateTenancy, rentAssistant, earliestMoveOut, complianceStatus, addMonths, LEGAL } from "../rentals.js";
import { fields } from "../sales.js";
import { jerseyToday, plusDays } from "../viewings.js";
import { rentalEvent, save, ensureChanged, fieldErrors, asObject, ACTIVE } from "./rentals.js";

const MAX_POUNDS = 1000000, MAX_PENCE = 100 * MAX_POUNDS; // R20
const ENDED = "This tenancy has ended", CHANGED = "This property changed meanwhile. Reload to see it";
// The rent in force on `date` for tenancy `id` (SQL expressions), from its history (R6, R28).
const rentOn = (id, date) => `(SELECT c.rent FROM rent_changes c WHERE c.tenancy_id = ${id} AND c.effective_on <= ${date}
  ORDER BY c.effective_on DESC LIMIT 1)`;
const NEW = "(SELECT MAX(id) FROM tenancies)";
const LIMIT = "date(?1, 'start of month', '+2 months')";
const IN_RANGE = `m.due_on < ${LIMIT} AND (t.ended_on IS NULL OR m.due_on < t.ended_on)`;

// R6, R22–R24: one idempotent statement that adds the charges a full-service tenancy with collect_from still lacks, up
// to the end of next month in Jersey (today), in pence at the rent in force on each date. The series starts on
// collect_from, or, when the tenancy already has a rent charge in collect_from's month or later (collect_from moved by
// a service switch), on due_day of the month after its latest one: never two rent charges in a month, and only the
// missing months are walked. Then due_day of each following month, all before ended_on (past a fixed end_on they go on
// while the tenant stays). The opening balance is one charge on collect_from, made once. tenancyId: just that tenancy,
// or "newest" for the one inserted earlier in the same batch.
export function ensureCharges(env, today, tenancyId = null) {
  const id = tenancyId === "newest" ? NEW : "?2";
  return env.DB.prepare(`INSERT INTO charges (tenancy_id, due_on, amount, kind)
  WITH RECURSIVE s AS (SELECT t.id, t.collect_from, t.due_day, t.ended_on, t.rent, t.opening_balance,
      (SELECT MAX(c.due_on) FROM charges c WHERE c.tenancy_id = t.id AND c.kind = 'rent') AS last
      FROM tenancies t JOIN rentals r ON r.id = t.rental_id
      WHERE r.service = 'full' AND t.collect_from IS NOT NULL AND (${id} IS NULL OR t.id = ${id})),
    t AS (SELECT *, CASE WHEN last >= date(collect_from, 'start of month')
      THEN date(last, 'start of month', '+1 month', '+' || (due_day - 1) || ' days') ELSE collect_from END AS first FROM s),
    m (id, n, due_on) AS (SELECT id, 0, first FROM t WHERE first < ${LIMIT} AND (ended_on IS NULL OR first < ended_on)
      UNION ALL SELECT t.id, m.n + 1, date(t.first, 'start of month', '+' || (m.n + 1) || ' months', '+' || (t.due_day - 1) || ' days')
      FROM m JOIN t ON t.id = m.id WHERE ${IN_RANGE})
  SELECT m.id, m.due_on, 100 * COALESCE(${rentOn("m.id", "m.due_on")}, t.rent), 'rent' FROM m JOIN t ON t.id = m.id WHERE ${IN_RANGE}
  UNION ALL SELECT id, collect_from, opening_balance, 'opening' FROM t WHERE opening_balance > 0
    AND (ended_on IS NULL OR ended_on > first)
    AND NOT EXISTS (SELECT 1 FROM charges c WHERE c.tenancy_id = t.id AND c.kind = 'opening')
  ON CONFLICT DO NOTHING`).bind(today, ...(tenancyId === "newest" ? [] : [tenancyId]));
}

// R10, R13: the tenancy's own deadlines, from its dates (no rows): [key, label, from, days, done].
const DEADLINES = [["deposit", "Deposit protected", "deposit_received_on", LEGAL.depositDays, "deposit_protected_on"],
  ["inventory_in", "Check-in report", "start_on", LEGAL.reportDays, "inventory_in_on"],
  ["inventory_out", "Check-out report", "ended_on", LEGAL.reportDays, "inventory_out_on"]];
export const deadlines = (t, today) => DEADLINES.filter(d => t[d[2]]).map(([key, label, from, days, done]) => {
  const due_on = plusDays(t[from], days);
  return { key, label, due_on, done_on: t[done], status: t[done] ? "done" : complianceStatus({ expires_on: due_on }, today) };
});

const TENANCY_SQL = "SELECT t.*, r.address, r.service FROM tenancies t JOIN rentals r ON r.id = t.rental_id WHERE t.id = ?";
const loadTenancy = async (env, id) =>
  (await env.DB.prepare(TENANCY_SQL).bind(Number(id)).first()) ?? fail(404, "Tenancy not found");

// The tenancy page (P1): its charges brought up to date, charges and payments of the last 24 months, the balance (rent
// charges due minus rent payments, R7, R26), the rent assistant with the saved RPI (R12) and the deadlines.
async function detail(env, id) {
  id = Number(id);
  const today = jerseyToday(), since = addMonths(today, -24), q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
  const [, [tenancy], charges, payments, [{ balance }], [setting]] = (await env.DB.batch([
    ensureCharges(env, today, id),
    q(TENANCY_SQL, id),
    q("SELECT id, due_on, amount, kind, edited FROM charges WHERE tenancy_id = ? AND due_on >= ? ORDER BY due_on DESC, kind",
      id, since),
    q("SELECT * FROM payments WHERE tenancy_id = ? AND received_on >= ? ORDER BY received_on DESC, id DESC", id, since),
    q(`SELECT (SELECT COALESCE(SUM(amount), 0) FROM charges WHERE tenancy_id = ?1 AND due_on <= ?2)
      - (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE tenancy_id = ?1 AND kind = 'rent') AS balance`, id, today),
    q("SELECT value FROM app_settings WHERE key = 'rpi'"),
  ])).map(r => r.results);
  if (!tenancy) fail(404, "Tenancy not found");
  const rpi = setting ? JSON.parse(setting.value) : null;
  const notice = tenancy.notice_given_on && { given_on: tenancy.notice_given_on, by: tenancy.notice_by };
  return { tenancy, charges, payments, balance, assistant: { ...rentAssistant(tenancy, rpi, today), rpi },
    deadlines: deadlines(tenancy, today), earliest_move_out: notice ? earliestMoveOut(tenancy, notice) : null };
}

const getTenancy = async ({ env, params: [id] }) => json(await detail(env, id));

// R22: a new tenancy moves the property's updated_at, so an open property form gets 409 instead of switching service
// without asking for collect_from.
const bump = (env, admin, rentalId, ts) =>
  env.DB.prepare("UPDATE rentals SET updated_at = ?, updated_by = ? WHERE id = ?").bind(ts, admin, rentalId);

// An action's batch; when it fails, check(tenancy) says why if the tenancy moved on meanwhile (409).
async function act(env, id, stmts, check) {
  try {
    await env.DB.batch(stmts);
  } catch (e) {
    check(await loadTenancy(env, id));
    throw e;
  }
}

// R4, R5, R22: one tenancy without ended_on per property, not overlapping the last one, with its payment reference set
// from the new id, its starting rent, and its charges (full service only: collect_from defaults to the start).
async function createTenancy({ request, env, admin, params: [rid] }) {
  const r = validateTenancy(asObject(await readJson(request)));
  if (r.errors) return fieldErrors(r.errors);
  const state = () => env.DB.prepare(`SELECT id, service, archived_at,
    EXISTS (SELECT 1 FROM tenancies WHERE rental_id = r.id AND ended_on IS NULL) AS open,
    (SELECT MAX(ended_on) FROM tenancies WHERE rental_id = r.id) AS last FROM rentals r WHERE id = ?`).bind(Number(rid)).first();
  const s = (await state()) ?? fail(404, "Property not found");
  const check = st => {
    if (st.archived_at) fail(409, "This property is archived");
    if (st.service !== s.service) fail(409, CHANGED);
    if (st.open) fail(409, "This property already has a tenancy. End it first");
  };
  check(s);
  if (s.last > r.value.start_on) return fieldErrors({ start_on: `Start on ${s.last} or later, when the last tenancy ends` });
  const ts = now(), value = { ...r.value, collect_from: s.service === "full" ? r.value.collect_from ?? r.value.start_on : null };
  const row = { ...value, rental_id: s.id, created_at: ts, created_by: admin, updated_at: ts, updated_by: admin };
  let res;
  try {
    [res] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO tenancies (${Object.keys(row).join(", ")}) SELECT ${Object.keys(row).map(() => "?").join(", ")}
        FROM rentals WHERE id = ? AND archived_at IS NULL AND service = ?
        AND NOT EXISTS (SELECT 1 FROM tenancies WHERE rental_id = ? AND ended_on > ?)`)
        .bind(...Object.values(row), s.id, s.service, s.id, row.start_on),
      ensureChanged(env),
      env.DB.prepare(`UPDATE tenancies SET payment_ref = printf('HE-T%04d', id) WHERE id = ${NEW}`),
      env.DB.prepare(`INSERT INTO rent_changes (tenancy_id, effective_on, rent, created_at, created_by) VALUES (${NEW}, ?, ?, ?, ?)`)
        .bind(row.start_on, row.rent, ts, admin),
      ensureCharges(env, jerseyToday(), "newest"),
      bump(env, admin, s.id, ts),
      rentalEvent(env, { rental_id: s.id, actor: admin, type: "tenancy.created", data: value }, { tenancy_id: "tenancies" }),
    ]);
  } catch (e) {
    const st = (await state()) ?? fail(404, "Property not found");
    check(st);
    if (st.last > row.start_on) fail(409, CHANGED); // a tenancy ending after this start was entered meanwhile
    throw e;
  }
  return json(await detail(env, res.meta.last_row_id), 201);
}

// Set when the tenancy is entered: the rent has its own action (R28); the charge dates and the opening balance shaped
// the charges already made (R23).
const SET = "Set when the tenancy was entered";
const LOCKED = { rent: "Use Change rent to change the rent", due_day: SET, start_on: SET, collect_from: SET,
  opening_balance: `${SET}. Correct its charge instead` };

// A form save (§3, lock). The stored row and the body are checked together (a fixed term needs its end, the end after
// the start, …), so the database's CHECKs never answer; the keys in LOCKED stay as stored.
async function updateTenancy({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request)), cur = await loadTenancy(env, id);
  const kept = Object.fromEntries(Object.keys(LOCKED).map(k => [k, cur[k]]));
  const sent = validateTenancy(body, { partial: true }), r = validateTenancy({ ...cur, ...body, ...kept });
  const errors = { ...r.errors, ...sent.errors };
  for (const [k, msg] of Object.entries(LOCKED)) if (sent.value && k in sent.value && sent.value[k] !== cur[k]) errors[k] = msg;
  if (Object.keys(errors).length) return fieldErrors(errors);
  await save(env, admin, "tenancies", cur, body, r.value, (keys, of) => [rentalEvent(env, { rental_id: cur.rental_id,
    tenancy_id: cur.id, actor: admin, type: "tenancy.updated", data: { before: of(cur), after: of(r.value) } })]);
  return json(await detail(env, cur.id));
}

// R23: a charge corrected by hand (pence), marked edited so a rent change leaves it alone (R28).
async function updateCharge({ request, env, admin, params: [id] }) {
  const { amount } = asObject(await readJson(request));
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_PENCE)
    return fieldErrors({ amount: `Enter an amount in pence from 1 to ${MAX_PENCE}` });
  const load = () => env.DB.prepare("SELECT c.*, t.rental_id FROM charges c JOIN tenancies t ON t.id = c.tenancy_id WHERE c.id = ?")
    .bind(Number(id)).first();
  const c = (await load()) ?? fail(404, "Charge not found");
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE charges SET amount = ?, edited = 1 WHERE id = ?").bind(amount, c.id),
      ensureChanged(env),
      rentalEvent(env, { rental_id: c.rental_id, tenancy_id: c.tenancy_id, actor: admin, type: "charge.edited",
        data: { charge_id: c.id, due_on: c.due_on, kind: c.kind, before: c.amount, after: amount } }),
    ]);
  } catch (e) {
    if (!(await load())) fail(404, "Charge not found"); // the tenancy ended meanwhile and took it
    throw e;
  }
  return json(await detail(env, c.tenancy_id));
}

const running = today => t => { if (t.ended_on && t.ended_on <= today) fail(409, ENDED); };
// R28: not before today, nor before the tenancy starts (the starting rent would still be in force).
function effectiveOn(f, today, t) {
  const d = f.date("effective_on"), from = t.start_on > today ? t.start_on : today;
  return d === null ? f.err("effective_on", "Enter the date the new rent starts")
    : d < from ? f.err("effective_on", `Use ${from} or a later date`) : d;
}

// R6, R12, R28: the rent from effective_on (one change per date, so the same date replaces it), the tenancy's rent
// (the latest agreed) and last change, and the charges from that date not yet due nor edited by hand. Fails unless
// running.
const rentChange = (env, admin, t, rent, effective_on, today, ts) => [
  env.DB.prepare(`INSERT INTO rent_changes (tenancy_id, effective_on, rent, created_at, created_by)
    SELECT id, ?, ?, ?, ? FROM tenancies WHERE id = ? AND ${ACTIVE} ON CONFLICT (tenancy_id, effective_on)
    DO UPDATE SET rent = excluded.rent, created_at = excluded.created_at, created_by = excluded.created_by`)
    .bind(effective_on, rent, ts, admin, t.id, today),
  ensureChanged(env),
  env.DB.prepare(`UPDATE tenancies SET rent = ${rentOn("tenancies.id", "'9999-12-31'")},
    last_rent_change_on = max(COALESCE(last_rent_change_on, ''), ?), updated_at = ?, updated_by = ? WHERE id = ?`)
    .bind(effective_on, ts, admin, t.id),
  env.DB.prepare(`UPDATE charges SET amount = 100 * ${rentOn("charges.tenancy_id", "charges.due_on")}
    WHERE tenancy_id = ? AND kind = 'rent' AND edited = 0 AND due_on >= ? AND due_on > ?`).bind(t.id, effective_on, today),
];

async function changeRent({ request, env, admin, params: [id] }) {
  const cur = await loadTenancy(env, id), today = jerseyToday(), check = running(today);
  check(cur);
  const errors = {}, f = fields(asObject(await readJson(request)), errors);
  const rent = f.money("rent", true, MAX_POUNDS), effective_on = effectiveOn(f, today, cur);
  if (cur.ended_on && effective_on >= cur.ended_on) f.err("effective_on", "Use a date before the tenancy ends");
  if (Object.keys(errors).length) return fieldErrors(errors);
  await act(env, cur.id, [...rentChange(env, admin, cur, rent, effective_on, today, now()),
    rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: "rent.changed",
      data: { before: cur.rent, rent, effective_on } })], check);
  return json(await detail(env, cur.id));
}

const notEnded = t => { if (t.ended_on) fail(409, "This tenancy already has an end date"); };

// R24: the same tenancy (and payment reference) gets a new end or becomes periodic, optionally a new rent, and the
// 2025 law when renewed from LEGAL.regime2025From.
async function renew({ request, env, admin, params: [id] }) {
  const cur = await loadTenancy(env, id), today = jerseyToday();
  notEnded(cur);
  const b = asObject(await readJson(request)), errors = {}, f = fields(b, errors);
  const kind = ["fixed", "periodic"].includes(b.kind) ? b.kind : f.err("kind", "Choose fixed term or periodic");
  const end_on = kind === "fixed" ? f.date("end_on") : null, after = [today, cur.start_on, cur.end_on ?? ""].sort().at(-1);
  if (kind === "fixed" && !errors.end_on && !(end_on > after)) f.err("end_on", `Enter an end date after ${after}`);
  const rent = f.money("rent", false, MAX_POUNDS), effective_on = rent ? effectiveOn(f, today, cur) : null;
  if (Object.keys(errors).length) return fieldErrors(errors);
  const regime = today >= LEGAL.regime2025From ? "2025" : cur.regime, ts = now();
  await act(env, cur.id, [
    env.DB.prepare(`UPDATE tenancies SET kind = ?, end_on = ?, regime = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND ended_on IS NULL`).bind(kind, end_on, regime, ts, admin, cur.id),
    ensureChanged(env),
    ...(rent ? rentChange(env, admin, cur, rent, effective_on, today, ts) : []),
    bump(env, admin, cur.rental_id, ts),
    rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: "tenancy.renewed", data: {
      before: { kind: cur.kind, end_on: cur.end_on, regime: cur.regime, rent: cur.rent },
      after: { kind, end_on, regime, ...(rent ? { rent, effective_on } : {}) } } }),
  ], notEnded);
  return json(await detail(env, cur.id));
}

// R13: who gave notice and when (not after today); the answer carries the earliest move-out.
async function notice({ request, env, admin, params: [id] }) {
  const cur = await loadTenancy(env, id), today = jerseyToday(), check = running(today);
  check(cur);
  const b = asObject(await readJson(request)), errors = {}, f = fields(b, errors);
  const given_on = f.date("given_on") ?? f.err("given_on", "Enter the date notice was given");
  if (given_on > today) f.err("given_on", "Use today or an earlier date");
  const by = ["tenant", "landlord"].includes(b.by) ? b.by : f.err("by", "Choose tenant or landlord");
  if (Object.keys(errors).length) return fieldErrors(errors);
  await act(env, cur.id, [
    env.DB.prepare(`UPDATE tenancies SET notice_given_on = ?, notice_by = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND ${ACTIVE}`).bind(given_on, by, now(), admin, cur.id, today),
    ensureChanged(env),
    rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: "notice.recorded",
      data: { given_on, by, earliest_move_out: earliestMoveOut(cur, { given_on, by }) } }),
  ], check);
  return json(await detail(env, cur.id));
}

// R13, R24: the move-out, maybe ahead. Charges stop there (any already made on or after it go) and the property is
// free for the next tenancy. The event says which charges went (count, pence), so the history explains the balance.
async function endTenancy({ request, env, admin, params: [id] }) {
  const cur = await loadTenancy(env, id);
  notEnded(cur);
  const errors = {}, f = fields(asObject(await readJson(request)), errors);
  const ended_on = f.date("ended_on") ?? f.err("ended_on", "Enter the move-out date");
  if (ended_on && ended_on < cur.start_on) f.err("ended_on", "Use the start date or later");
  if (Object.keys(errors).length) return fieldErrors(errors);
  const ts = now();
  await act(env, cur.id, [
    env.DB.prepare("UPDATE tenancies SET ended_on = ?, updated_at = ?, updated_by = ? WHERE id = ? AND ended_on IS NULL")
      .bind(ended_on, ts, admin, cur.id),
    ensureChanged(env),
    rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: "tenancy.ended", data: { ended_on } }),
    env.DB.prepare(`UPDATE rental_events SET data = json_set(data, '$.removed', (SELECT json_object('count', COUNT(*),
      'amount', COALESCE(SUM(amount), 0)) FROM charges WHERE tenancy_id = ? AND kind = 'rent' AND due_on >= ?))
      WHERE id = (SELECT MAX(id) FROM rental_events)`).bind(cur.id, ended_on),
    env.DB.prepare("DELETE FROM charges WHERE tenancy_id = ? AND kind = 'rent' AND due_on >= ?").bind(cur.id, ended_on),
    bump(env, admin, cur.rental_id, ts),
  ], notEnded);
  return json(await detail(env, cur.id));
}

export default [
  ["POST", /^\/admin\/rentals\/(\d+)\/tenancies$/, createTenancy, true],
  ["GET", /^\/admin\/tenancies\/(\d+)$/, getTenancy, true],
  ["PUT", /^\/admin\/tenancies\/(\d+)$/, updateTenancy, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/rent$/, changeRent, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/renew$/, renew, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/notice$/, notice, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/end$/, endTenancy, true],
  ["PUT", /^\/admin\/charges\/(\d+)$/, updateCharge, true],
];
