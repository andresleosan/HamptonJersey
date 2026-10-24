import { json, fail, readJson, now } from "../http.js";
import { validateTenancy, validatePayment, rentAssistant, earliestMoveOut, complianceStatus, addMonths, LEGAL,
  ARREARS_STEPS, COMPLIANCE, REF_RE, importKey, cleanDescription } from "../rentals.js";
import { fields } from "../sales.js";
import { jerseyToday, plusDays, realDate } from "../viewings.js";
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

// R7, R8, R26, R27 (binds ?1 = Jersey today, ?2 = a tenancy id or NULL for all): CTEs ending in `arrears`, one row
// per running full-service tenancy (P4) with tenancy_id, rental_id, balance (pence: charges due minus rent payments), oldest_unpaid_on (FIFO: the
// first charge due whose running total exceeds what was paid), days_late (from it) and next_step (the latest
// ARREARS_STEPS key already due and not marked done for that charge, or NULL). Use: `WITH ${ARREARS_SQL} SELECT …`.
// The running total (window) is only taken for tenancies that owe something, the rest are two indexed sums.
const DUE_STEP = `CASE ${ARREARS_STEPS.toReversed().map(([d, k]) => `WHEN days_late >= ${d} THEN '${k}'`).join(" ")} END`;
export const ARREARS_SQL = `a_t AS (SELECT t.id, t.rental_id FROM tenancies t JOIN rentals r ON r.id = t.rental_id
    WHERE r.service = 'full' AND (t.ended_on IS NULL OR t.ended_on > ?1) AND (?2 IS NULL OR t.id = ?2)),
  a_bal AS MATERIALIZED (SELECT id AS tenancy_id, rental_id,
    COALESCE((SELECT SUM(c.amount) FROM charges c WHERE c.tenancy_id = a_t.id AND c.due_on <= ?1), 0) AS due,
    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.tenancy_id = a_t.id AND p.kind = 'rent'), 0) AS paid FROM a_t),
  a_run AS (SELECT c.tenancy_id, c.due_on, b.paid, SUM(c.amount) OVER (PARTITION BY c.tenancy_id ORDER BY c.due_on, c.kind
    ROWS UNBOUNDED PRECEDING) AS run FROM a_bal b CROSS JOIN charges c ON c.tenancy_id = b.tenancy_id AND c.due_on <= ?1
    WHERE b.due > b.paid),
  a_old AS (SELECT tenancy_id, MIN(due_on) AS oldest FROM a_run WHERE run > paid GROUP BY tenancy_id),
  a_late AS (SELECT b.tenancy_id, b.rental_id, b.due - b.paid AS balance, o.oldest AS oldest_unpaid_on,
    CAST(julianday(?1) - julianday(o.oldest) AS INTEGER) AS days_late FROM a_bal b LEFT JOIN a_old o USING (tenancy_id)),
  arrears AS (SELECT a.*, CASE WHEN NOT EXISTS (SELECT 1 FROM arrears_steps x WHERE x.tenancy_id = a.tenancy_id
    AND x.charge_due_on = a.oldest_unpaid_on AND x.step = a.due_step) THEN a.due_step END AS next_step
    FROM (SELECT *, ${DUE_STEP} AS due_step FROM a_late) a)`;
const STEP = Object.fromEntries(ARREARS_STEPS.map(([days, step, label]) => [step, { days, step, label }]));

// R10, R13: the tenancy's own deadlines, from its dates (no rows): [key, label, from, days, done].
const DEADLINES = [["deposit", "Deposit protected", "deposit_received_on", LEGAL.depositDays, "deposit_protected_on"],
  ["inventory_in", "Check-in report", "start_on", LEGAL.reportDays, "inventory_in_on"],
  ["inventory_out", "Check-out report", "ended_on", LEGAL.reportDays, "inventory_out_on"]];
export const deadlines = (t, today) => DEADLINES.filter(d => t[d[2]]).map(([key, label, from, days, done]) => {
  const due_on = plusDays(t[from], days);
  return { key, label, due_on, done_on: t[done], status: t[done] ? "done" : complianceStatus({ expires_on: due_on }, today) };
});

// R10, R11, P4: the property checks that count, over c and r: properties not archived, gas only where there may be gas.
const CHECKS = `FROM compliance_items c JOIN rentals r ON r.id = c.rental_id
  WHERE r.archived_at IS NULL AND (c.kind <> 'gas' OR r.has_gas IS NOT 0)`;
// R10, R13: one SQL term per tenancy deadline not done whose due date `cmp` (e.g. "< ?1"), over t; the same rule as
// deadlines(), from the same DEADLINES.
const pending = cmp => DEADLINES.map(([, , from, days, done]) =>
  `(t.${from} IS NOT NULL AND t.${done} IS NULL AND date(t.${from}, '+${days} days') ${cmp})`);
// R12, R16, R24: a fixed term within LEGAL.renewalDays of its end, or past it, with no notice and no move-out set (over t;
// ?1 = today). Renew moves end_on on or makes it periodic.
const RENEWAL = `t.kind = 'fixed' AND t.ended_on IS NULL AND t.notice_given_on IS NULL
  AND t.end_on <= date(?1, '+${LEGAL.renewalDays} days')`;
const OPEN_REPAIR = "p.status NOT IN ('done', 'cancelled')"; // the repairs_open index

// R16: the nav's Rentals count (binds Jersey today): tenancies whose next arrears step is due, checks and tenancy
// deadlines overdue (a missing check counts), renewals to decide, open emergencies and unmatched payments.
export const rentalsCount = env => env.DB.prepare(`WITH ${ARREARS_SQL} SELECT
  (SELECT COUNT(*) FROM arrears WHERE next_step IS NOT NULL)
  + (SELECT COUNT(*) ${CHECKS} AND (c.expires_on IS NULL OR c.expires_on < ?1))
  + (SELECT COALESCE(SUM(${pending("< ?1").join(" + ")}), 0) FROM tenancies t JOIN rentals r ON r.id = t.rental_id
    WHERE r.archived_at IS NULL)
  + (SELECT COUNT(*) FROM tenancies t WHERE ${RENEWAL})
  + (SELECT COUNT(*) FROM repairs p WHERE p.urgency = 'emergency' AND ${OPEN_REPAIR})
  + (SELECT COUNT(*) FROM payments WHERE tenancy_id IS NULL) AS n`).bind(jerseyToday(), null);

const TENANCY_SQL = "SELECT t.*, r.address, r.service FROM tenancies t JOIN rentals r ON r.id = t.rental_id WHERE t.id = ?";
const loadTenancy = async (env, id) =>
  (await env.DB.prepare(TENANCY_SQL).bind(Number(id)).first()) ?? fail(404, "Tenancy not found");

// The tenancy page (P1): its charges brought up to date, charges and payments of the last 24 months, the balance (rent
// charges due minus rent payments, R7, R26), the arrears (null without an unpaid charge due; steps done are those of
// the oldest unpaid charge, R27), the rent assistant with the saved RPI (R12) and the deadlines.
async function detail(env, id) {
  id = Number(id);
  const today = jerseyToday(), since = addMonths(today, -24), q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
  const [, [tenancy], charges, payments, [{ balance }], [setting], [late], steps] = (await env.DB.batch([
    ensureCharges(env, today, id),
    q(TENANCY_SQL, id),
    q("SELECT id, due_on, amount, kind, edited FROM charges WHERE tenancy_id = ? AND due_on >= ? ORDER BY due_on DESC, kind",
      id, since),
    q("SELECT * FROM payments WHERE tenancy_id = ? AND received_on >= ? ORDER BY received_on DESC, id DESC", id, since),
    q(`SELECT (SELECT COALESCE(SUM(amount), 0) FROM charges WHERE tenancy_id = ?1 AND due_on <= ?2)
      - (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE tenancy_id = ?1 AND kind = 'rent') AS balance`, id, today),
    q("SELECT value FROM app_settings WHERE key = 'rpi'"),
    q(`WITH ${ARREARS_SQL} SELECT * FROM arrears`, today, id),
    q("SELECT charge_due_on, step, done_at, done_by, note FROM arrears_steps WHERE tenancy_id = ? ORDER BY done_at", id),
  ])).map(r => r.results);
  if (!tenancy) fail(404, "Tenancy not found");
  const arrears = late?.oldest_unpaid_on ? { oldest_unpaid_on: late.oldest_unpaid_on, days_late: late.days_late,
    next_step: STEP[late.next_step] ?? null,
    done: steps.filter(x => x.charge_due_on === late.oldest_unpaid_on).map(({ charge_due_on, ...x }) => x) } : null;
  const rpi = setting ? JSON.parse(setting.value) : null;
  const notice = tenancy.notice_given_on && { given_on: tenancy.notice_given_on, by: tenancy.notice_by };
  return { tenancy, charges, payments, balance, arrears, assistant: { ...rentAssistant(tenancy, rpi, today), rpi },
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

// R8, R27: a step marked done (with a note) for the oldest unpaid charge, once due; earlier due steps may be marked
// too. Marking it again changes nothing (200). The INSERT checks all of it again, so a payment meanwhile is a 409.
async function markStep({ request, env, admin, params: [id, due_on, step] }) {
  const s = Object.hasOwn(STEP, step) ? STEP[step] : fail(400, "Unknown arrears step");
  if (!realDate(due_on)) fail(400, "Invalid date");
  const errors = {}, note = fields(asObject(await readJson(request)), errors).text("note", 300);
  if (Object.keys(errors).length) return fieldErrors(errors);
  const cur = await loadTenancy(env, id), today = jerseyToday();
  const check = async () => {
    const [, [a], [done]] = (await env.DB.batch([ensureCharges(env, today, cur.id),
      env.DB.prepare(`WITH ${ARREARS_SQL} SELECT * FROM arrears`).bind(today, cur.id),
      env.DB.prepare("SELECT 1 FROM arrears_steps WHERE tenancy_id = ? AND charge_due_on = ? AND step = ?")
        .bind(cur.id, due_on, step)])).map(r => r.results);
    if (a?.oldest_unpaid_on !== due_on) fail(409, "This is not the oldest unpaid charge. Reload to see the arrears");
    if (a.days_late < s.days) fail(409, "This step is not due yet");
    return !!done;
  };
  if (await check()) return json(await detail(env, cur.id));
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO arrears_steps (tenancy_id, charge_due_on, step, done_at, done_by, note)
        WITH ${ARREARS_SQL} SELECT tenancy_id, ?3, ?4, ?5, ?6, ?7 FROM arrears
        WHERE oldest_unpaid_on = ?3 AND days_late >= ?8 ON CONFLICT DO NOTHING`)
        .bind(today, cur.id, due_on, step, now(), admin, note, s.days),
      ensureChanged(env),
      rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: "arrears.step_done",
        data: { charge_due_on: due_on, step, note } }),
    ]);
  } catch (e) {
    if (!(await check())) throw e;
  }
  return json(await detail(env, cur.id));
}

const NOT_FULL = "Only full management tenancies take rent payments";
// A full-service tenancy's id (SQL) or NULL: the guard of every write that gives a payment a tenancy.
const fullId = id => `(SELECT t.id FROM tenancies t JOIN rentals r ON r.id = t.rental_id WHERE t.id = ${id} AND r.service = 'full')`;
// P10: rent only on full service; a let-only tenancy may hold a deposit or other money.
const checkKind = kind => t => { if (t.service !== "full" && kind === "rent") fail(409, NOT_FULL); };

// R7, R26: a payment recorded by hand (an ended tenancy may still be paying off).
async function createPayment({ request, env, admin }) {
  const r = validatePayment(asObject(await readJson(request)));
  if (r.errors) return fieldErrors(r.errors);
  const t = await loadTenancy(env, r.value.tenancy_id), { received_on, amount, kind, description } = r.value;
  const check = checkKind(kind);
  check(t);
  await act(env, t.id, [
    env.DB.prepare(`INSERT INTO payments (tenancy_id, received_on, amount, kind, description, source, created_at, created_by)
      SELECT t.id, ?, ?, ?, ?, 'manual', ?, ? FROM tenancies t JOIN rentals r ON r.id = t.rental_id
      WHERE t.id = ? AND (r.service = 'full' OR ? <> 'rent')`).bind(received_on, amount, kind, description, now(), admin, t.id, kind),
    ensureChanged(env),
    rentalEvent(env, { rental_id: t.rental_id, tenancy_id: t.id, actor: admin, type: "payment.recorded",
      data: { received_on, amount, kind, description } }, { payment_id: "payments" }),
  ], check);
  return json(await detail(env, t.id), 201);
}

// R9, R26, P9: a payment assigned to a tenancy, moved to another or back to Unmatched (tenancy_id null), or its kind
// corrected. The UPDATE is guarded on the row as read, so a change meanwhile is a 409.
async function updatePayment({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request)), unassign = body.tenancy_id === null;
  const r = validatePayment(Object.fromEntries(["tenancy_id", "kind"].filter(k => k in body && !(k === "tenancy_id" && unassign))
    .map(k => [k, body[k]])), { partial: true });
  if (r.errors) return fieldErrors(r.errors);
  const load = () => env.DB.prepare("SELECT * FROM payments WHERE id = ?").bind(Number(id)).first();
  const cur = (await load()) ?? fail(404, "Payment not found");
  const after = { tenancy_id: unassign ? null : r.value.tenancy_id ?? cur.tenancy_id, kind: r.value.kind ?? cur.kind };
  const t = after.tenancy_id && await loadTenancy(env, after.tenancy_id), check = checkKind(after.kind);
  if (t) check(t);
  const was = !t && cur.tenancy_id ? await loadTenancy(env, cur.tenancy_id) : null; // the event's property on unassign
  if (after.tenancy_id !== cur.tenancy_id || after.kind !== cur.kind) try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE payments SET tenancy_id = ?1, kind = ?2 WHERE id = ?3 AND tenancy_id IS ?4 AND kind = ?5
        AND (?1 IS NULL OR EXISTS (SELECT 1 FROM tenancies t JOIN rentals r ON r.id = t.rental_id WHERE t.id = ?1
        AND (r.service = 'full' OR ?2 <> 'rent')))`)
        .bind(after.tenancy_id, after.kind, cur.id, cur.tenancy_id, cur.kind),
      ensureChanged(env),
      rentalEvent(env, { rental_id: (t || was)?.rental_id ?? null, tenancy_id: after.tenancy_id ?? cur.tenancy_id,
        actor: admin, type: "payment.updated",
        data: { payment_id: cur.id, before: { tenancy_id: cur.tenancy_id, kind: cur.kind }, after } }),
    ]);
  } catch (e) {
    const p = await load();
    if (p.tenancy_id !== cur.tenancy_id || p.kind !== cur.kind) fail(409, "This payment changed meanwhile. Reload to see it");
    if (t) check(await loadTenancy(env, t.id));
    throw e;
  }
  return json(t ? await detail(env, t.id) : { payment: await load() });
}

// Per request (R9 says 2,000 a file): the panel sends a file in chunks of 500, numbered first with occurrences().
const IMPORT_BYTES = 2 * 1024 * 1024, MAX_ROWS = 500;
const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
  .map(b => b.toString(16).padStart(2, "0")).join("");
const STATUSES = ["matched", "unmatched", "duplicate", "by_hand", "ignored"];

// R9, R25: bank rows the panel already split ({date ISO, amount in pence, description, n = occurrences() over the
// whole file}), checked again here. Only money in, not after today; anything unreadable is "ignored" with a reason.
// Each row's hash (SHA-256 of importKey|n) is unique in payments, so a file imported twice adds nothing.
// A reference HE-T… finds a full-service tenancy, else the row is Unmatched; that tenancy's manual payment of the same
// amount, within 7 days and without a hash, takes the row's hash instead of a new payment. dry_run writes nothing;
// otherwise one batch, with a summary event per tenancy and one for Unmatched.
async function importPayments({ request, env, admin }) {
  const body = asObject(await readJson(request, IMPORT_BYTES));
  if (!Array.isArray(body.rows) || !body.rows.length) fail(400, "Send the rows to import");
  if (body.rows.length > MAX_ROWS) fail(400, `Import up to ${MAX_ROWS} rows at a time`);
  if ("dry_run" in body && typeof body.dry_run !== "boolean") fail(400, "dry_run must be true or false");
  const keys = body.rows.map(raw => {
    const b = asObject(raw);
    if (!Number.isInteger(b.n) || b.n < 1) fail(400, "Invalid format");
    return `${importKey(b)}|${b.n}`;
  });
  if (new Set(keys).size < keys.length) fail(400, "Two rows have the same occurrence number");
  const today = jerseyToday();
  const rows = await Promise.all(body.rows.map(async (b, i) => {
    const errors = {}, f = fields(b, errors), text = f.text("description", 300);
    const date = f.date("date") ?? f.err("date", "Enter a date as YYYY-MM-DD"), description = text && cleanDescription(text);
    if (date > today) f.err("date", "Future date");
    const amount = !Number.isInteger(b.amount) ? f.err("amount", "Not an amount")
      : b.amount < 1 ? f.err("amount", "Money out or zero: only money in is imported")
        : b.amount > MAX_PENCE ? f.err("amount", "Over £1,000,000") : b.amount;
    const out = { date: b.date, amount: b.amount, description: b.description, n: b.n, status: "ignored", payment_ref: null };
    if (Object.keys(errors).length) return { out: { ...out, reason: Object.values(errors)[0] } };
    const ref = REF_RE.exec(description ?? "");
    return { out, date, amount, description, ref: ref && Number(ref[1]),
      hash: await sha256(keys[i]) };
  }));
  const ok = rows.filter(r => r.hash), q = (sql, v) => env.DB.prepare(sql).bind(JSON.stringify(v));
  const [full, known, hand] = (await env.DB.batch([
    q(`SELECT t.id, t.payment_ref FROM tenancies t JOIN rentals r ON r.id = t.rental_id
      WHERE r.service = 'full' AND t.id IN (SELECT value FROM json_each(?1))`, ok.map(r => r.ref).filter(Boolean)),
    q("SELECT import_hash FROM payments WHERE import_hash IN (SELECT value FROM json_each(?1))", ok.map(r => r.hash)),
    q(`SELECT j.key AS i, p.id FROM json_each(?1) j JOIN payments p ON p.tenancy_id = json_extract(j.value, '$[0]')
      AND p.amount = json_extract(j.value, '$[1]') AND p.source = 'manual' AND p.import_hash IS NULL
      AND abs(julianday(p.received_on) - julianday(json_extract(j.value, '$[2]'))) <= 7
      ORDER BY j.key, abs(julianday(p.received_on) - julianday(json_extract(j.value, '$[2]'))), p.id`,
      ok.map(r => [r.ref, r.amount, r.date])),
  ])).map(r => r.results);
  const refs = new Map(full.map(t => [t.id, t.payment_ref])), seen = new Set(known.map(k => k.import_hash));
  const candidates = {}, used = new Set();
  for (const h of hand) (candidates[h.i] ??= []).push(h.id);
  ok.forEach((r, i) => {
    r.out.payment_ref = refs.get(r.ref) ?? null;
    if (seen.has(r.hash)) r.out.status = "duplicate";
    else if (!r.out.payment_ref) r.out.status = "unmatched";
    else {
      r.hand = candidates[i]?.find(p => !used.has(p));
      if (r.hand) used.add(r.hand);
      r.out.status = r.hand ? "by_hand" : "matched";
    }
  });
  const add = ok.filter(r => ["matched", "unmatched"].includes(r.out.status)), byHand = ok.filter(r => r.hand);
  if (!body.dry_run && (add.length || byHand.length)) {
    const ts = now();
    await env.DB.batch([
      q(`UPDATE OR IGNORE payments SET import_hash = (SELECT json_extract(value, '$[1]') FROM json_each(?1)
        WHERE json_extract(value, '$[0]') = payments.id)
        WHERE import_hash IS NULL AND id IN (SELECT json_extract(value, '$[0]') FROM json_each(?1))`,
      byHand.map(r => [r.hand, r.hash])),
      env.DB.prepare(`INSERT INTO payments (tenancy_id, received_on, amount, description, kind, source,
        import_hash, created_at, created_by) SELECT ${fullId("json_extract(value, '$[0]')")}, json_extract(value, '$[1]'),
        json_extract(value, '$[2]'), json_extract(value, '$[3]'), 'rent', 'import', json_extract(value, '$[4]'), ?2, ?3
        FROM json_each(?1) WHERE 1 ON CONFLICT (import_hash) DO NOTHING`)
        .bind(JSON.stringify(add.map(r => [r.ref, r.date, r.amount, r.description, r.hash])), ts, admin),
      // What this batch wrote, per tenancy (NULL: Unmatched): rows added (and their pence), manual payments matched.
      env.DB.prepare(`INSERT INTO rental_events (rental_id, tenancy_id, at, actor, type, data)
        SELECT t.rental_id, p.tenancy_id, ?2, ?3, 'payments.imported', json_object('added', SUM(p.source = 'import'),
          'amount', COALESCE(SUM(CASE WHEN p.source = 'import' THEN p.amount END), 0), 'by_hand', SUM(p.source = 'manual'))
        FROM payments p LEFT JOIN tenancies t ON t.id = p.tenancy_id
        WHERE p.import_hash IN (SELECT value FROM json_each(?1)) AND (p.source = 'manual' OR p.created_at = ?2)
        GROUP BY p.tenancy_id ORDER BY p.tenancy_id`).bind(JSON.stringify([...add, ...byHand].map(r => r.hash)), ts, admin),
    ]);
  }
  const counts = Object.fromEntries(STATUSES.map(k => [k, 0]));
  for (const r of rows) counts[r.out.status]++;
  return json({ ...counts, rows: rows.map(r => r.out) });
}

// The Rentals screen's to-do order: overdue and missing first, then the nearest; checks in COMPLIANCE order.
const RANK = ["overdue", "missing", "due7", "due30", "due60"];
const KINDS = [...COMPLIANCE.map(([k]) => k), ...DEADLINES.map(([k]) => k)];
const LABEL = Object.fromEntries(COMPLIANCE.map(([k, label]) => [k, label]));
const WARN = Math.max(...LEGAL.warnDays);
const URGENCY = "CASE p.urgency WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END";
const MARKS = ["arrears", "compliance", "renewals", "repairs"];

// R2, R16, §4: the Rentals screen in one batch: the charges brought up to date first (R6), then the to-do (arrears with a
// step due, checks and deadlines within LEGAL.warnDays or missing, renewals, open repairs with emergencies first,
// unmatched payments) and the properties. q searches address, landlord, and any tenant's name or payment reference;
// service and archived narrow the list in SQL, filter (a to-do block) after. The to-do is never filtered.
async function overview({ request, env }) {
  const p = new URL(request.url).searchParams, q = p.get("q")?.trim() || null;
  const service = p.get("service") || null, filter = p.get("filter") || null, archived = p.get("archived") ?? "";
  if (service && !["full", "let_only"].includes(service)) fail(400, "Invalid service");
  if (filter && !MARKS.includes(filter)) fail(400, "Invalid filter");
  if (!["", "0", "1"].includes(archived)) fail(400, "Invalid archived");
  const today = jerseyToday(), s = (sql, ...b) => env.DB.prepare(sql).bind(today, ...b);
  const like = q && `%${q.replace(/[\\%_]/g, "\\$&")}%`, has = col => `${col} LIKE ?3 ESCAPE '\\'`;
  const [, owing, checks, dues, renewals, repairs, unmatched, list, [totals]] = (await env.DB.batch([
    ensureCharges(env, today),
    s(`WITH ${ARREARS_SQL} SELECT a.tenancy_id, a.rental_id, r.address, t.tenant_name, t.payment_ref, a.balance,
      a.oldest_unpaid_on, a.days_late, a.next_step FROM arrears a JOIN tenancies t ON t.id = a.tenancy_id
      JOIN rentals r ON r.id = a.rental_id ORDER BY a.days_late DESC, r.address COLLATE NOCASE`, null),
    s(`SELECT c.rental_id, r.address, c.kind, c.expires_on ${CHECKS}
      AND (c.expires_on IS NULL OR c.expires_on <= date(?1, '+${WARN} days'))`),
    s(`SELECT t.*, r.address FROM tenancies t JOIN rentals r ON r.id = t.rental_id WHERE r.archived_at IS NULL
      AND (${pending(`<= date(?1, '+${WARN} days')`).join(" OR ")})`),
    s(`SELECT t.id AS tenancy_id, t.rental_id, r.address, t.tenant_name, t.end_on FROM tenancies t
      JOIN rentals r ON r.id = t.rental_id WHERE ${RENEWAL} ORDER BY t.end_on, t.id`),
    env.DB.prepare(`SELECT p.id, p.rental_id, r.address, p.title, p.urgency, p.status, p.contractor, p.quote, p.created_at
      FROM repairs p JOIN rentals r ON r.id = p.rental_id WHERE ${OPEN_REPAIR} ORDER BY ${URGENCY}, p.created_at, p.id`),
    // ponytail: the newest 200; the count in totals says how many there are.
    env.DB.prepare(`SELECT id, received_on, amount, description, kind FROM payments WHERE tenancy_id IS NULL
      ORDER BY received_on DESC, id DESC LIMIT 200`),
    // The current tenancy: the earliest one still running (a later one may be waiting for a planned move-out).
    s(`SELECT r.id, r.address, r.parish, r.service, r.landlord_id, l.name AS landlord_name, r.archived_at,
      t.id AS tenancy_id, t.tenant_name, t.payment_ref, t.rent
      FROM rentals r JOIN landlords l ON l.id = r.landlord_id
      LEFT JOIN tenancies t ON t.id = (SELECT x.id FROM tenancies x WHERE x.rental_id = r.id
        AND (x.ended_on IS NULL OR x.ended_on > ?1) ORDER BY x.start_on, x.id LIMIT 1)
      WHERE r.archived_at IS ${archived === "1" ? "NOT " : ""}NULL AND (?2 IS NULL OR r.service = ?2)
      AND (?3 IS NULL OR ${has("r.address")} OR ${has("l.name")} OR EXISTS (SELECT 1 FROM tenancies x
        WHERE x.rental_id = r.id AND (${has("x.tenant_name")} OR ${has("x.payment_ref")})))
      ORDER BY r.address COLLATE NOCASE, r.id`, service, like),
    s(`SELECT (SELECT COUNT(*) FROM rentals WHERE archived_at IS NULL) AS properties,
      (SELECT COUNT(DISTINCT rental_id) FROM tenancies WHERE ended_on IS NULL OR ended_on > ?1) AS occupied,
      (SELECT COUNT(*) FROM payments WHERE tenancy_id IS NULL) AS unmatched`),
  ])).map(r => r.results);
  const todo = {
    arrears: owing.filter(a => a.next_step).map(({ next_step, ...a }) => ({ ...a, next_step: STEP[next_step] })),
    compliance: [
      ...dues.flatMap(t => deadlines(t, today).filter(d => d.status !== "done" && d.status !== "ok")
        .map(d => ({ rental_id: t.rental_id, address: t.address, tenancy_id: t.id, tenant_name: t.tenant_name, kind: d.key,
          label: d.label, due_on: d.due_on, status: d.status }))),
      ...checks.map(c => ({ rental_id: c.rental_id, address: c.address, tenancy_id: null, tenant_name: null, kind: c.kind,
        label: LABEL[c.kind], due_on: c.expires_on, status: complianceStatus(c, today) })),
    ].sort((a, b) => RANK.indexOf(a.status) - RANK.indexOf(b.status) || (a.due_on ?? "").localeCompare(b.due_on ?? "")
      || a.rental_id - b.rental_id || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)),
    renewals: renewals.map(r => ({ ...r, label: r.end_on < today ? "Fixed term ended" : "Renewal due" })),
    repairs, unmatched,
  };
  const balance = new Map(owing.map(a => [a.tenancy_id, a.balance]));
  const marked = Object.fromEntries(MARKS.map(k => [k, new Set(todo[k].map(x => x.rental_id))]));
  const rentals = list.map(r => ({ ...r, balance: balance.get(r.tenancy_id) ?? null,
    marks: MARKS.filter(k => marked[k].has(r.id)) })).filter(r => !filter || r.marks.includes(filter));
  const owed = owing.reduce((sum, a) => sum + Math.max(a.balance, 0), 0);
  return json({ todo, rentals, totals: { properties: totals.properties, occupied: totals.occupied, owed,
    unmatched: totals.unmatched } });
}

// R15, R26, R29: a landlord's statement for a Jersey calendar month (dates are already Jersey days), per full-service
// property: rent payments received in the month, the fee on them (fee_percent, to the penny), repairs done in the month
// and charged to the landlord, and deposits or other money apart (no fee, not in the net). GST on the fees only when
// gst_percent > 0. All in pence.
async function statement({ request, env }) {
  const p = new URL(request.url).searchParams, month = p.get("month") ?? "", id = Number(p.get("landlord"));
  const errors = {};
  if (!Number.isInteger(id) || id < 1) errors.landlord = "Choose a landlord";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) errors.month = "Choose a month as YYYY-MM";
  if (Object.keys(errors).length) return fieldErrors(errors);
  const from = `${month}-01`, to = addMonths(from, 1), q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
  const received = kind => `COALESCE((SELECT SUM(p.amount) FROM payments p JOIN tenancies t ON t.id = p.tenancy_id
    WHERE t.rental_id = r.id AND p.kind ${kind} AND p.received_on >= ?2 AND p.received_on < ?3), 0)`;
  const [[landlord], [setting], lines, repairs] = (await env.DB.batch([
    q("SELECT id, name, email, phone, archived_at FROM landlords WHERE id = ?", id),
    q("SELECT value FROM app_settings WHERE key = 'gst_percent'"),
    q(`SELECT r.id, r.address, r.fee_percent, r.archived_at, ${received("= 'rent'")} AS rent_received,
      ${received("<> 'rent'")} AS other_received FROM rentals r WHERE r.landlord_id = ?1 AND r.service = 'full'
      ORDER BY r.address COLLATE NOCASE, r.id`, id, from, to),
    q(`SELECT p.id, p.rental_id, p.title, p.contractor, p.done_on, 100 * p.cost AS cost FROM repairs p
      JOIN rentals r ON r.id = p.rental_id WHERE r.landlord_id = ?1 AND r.service = 'full' AND p.status = 'done'
      AND p.charge_landlord = 1 AND p.done_on >= ?2 AND p.done_on < ?3 ORDER BY p.done_on, p.id`, id, from, to),
  ])).map(r => r.results);
  if (!landlord) fail(404, "Landlord not found");
  // Percentages have two decimals: in basis points, so the pence are exact before rounding.
  const bp = pct => Math.round(pct * 100), gst_percent = setting ? JSON.parse(setting.value) : 0;
  const rentals = lines.map(({ id: rid, address, fee_percent, archived_at, rent_received, other_received }) => ({
    id: rid, address, archived_at, rent_received, fee: Math.round(rent_received * bp(fee_percent) / 10000),
    repairs: repairs.filter(x => x.rental_id === rid).map(({ rental_id, ...x }) => x), other_received,
  })).filter(r => !r.archived_at || r.rent_received || r.other_received || r.repairs.length); // archived: only with money
  const sum = f => rentals.reduce((t, r) => t + f(r), 0);
  const rent = sum(r => r.rent_received), fee = sum(r => r.fee), cost = sum(r => r.repairs.reduce((t, x) => t + x.cost, 0));
  const gst = gst_percent > 0 ? Math.round(fee * bp(gst_percent) / 10000) : null;
  return json({ landlord, month, gst_percent, rentals,
    totals: { rent, fee, gst, repairs: cost, net: rent - fee - (gst ?? 0) - cost } });
}

export default [
  ["GET", /^\/admin\/rentals$/, overview, true],
  ["GET", /^\/admin\/statements$/, statement, true],
  ["POST", /^\/admin\/rentals\/(\d+)\/tenancies$/, createTenancy, true],
  ["GET", /^\/admin\/tenancies\/(\d+)$/, getTenancy, true],
  ["PUT", /^\/admin\/tenancies\/(\d+)$/, updateTenancy, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/rent$/, changeRent, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/renew$/, renew, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/notice$/, notice, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/end$/, endTenancy, true],
  ["PUT", /^\/admin\/charges\/(\d+)$/, updateCharge, true],
  ["PUT", /^\/admin\/tenancies\/(\d+)\/arrears\/(\d{4}-\d{2}-\d{2})\/([a-z]+)$/, markStep, true],
  ["POST", /^\/admin\/payments$/, createPayment, true],
  ["PUT", /^\/admin\/payments\/(\d+)$/, updatePayment, true],
  ["POST", /^\/admin\/payments\/import$/, importPayments, true],
];
