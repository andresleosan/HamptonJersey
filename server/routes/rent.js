import { json, fail, readJson, now, sha256 } from "../http.js";
import { validateTenancy, validatePayment, rentAssistant, earliestMoveOut, complianceStatus, addMonths, LEGAL,
  ARREARS_STEPS, COMPLIANCE, CALENDAR, TENANT, REF_RE, importKey, cleanDescription, regimeOf,
  validateTenancyOperation } from "../rentals.js";
import { fields } from "../sales.js";
import { jerseyToday, plusDays, realDate } from "../viewings.js";
import { rentalEvent, save, ensureChanged, fieldErrors, asObject, ACTIVE, syncTenantChecks } from "./rentals.js";
import { exitReady } from "../tenancy-exits.js";
import { NEXT_INSPECTION, inspectionDue, inspectionsReady } from "../rental-inspections.js";
import { readLegal, legalLabel, calendarReady, tenancyLaw, rentReviewReady } from "../legal-terms.js";
import { createListing, loadListing } from "./listings.js";
import { EDITABLE as LISTING_FIELDS } from "../listing.js";
import { ECONOMIC_FIELDS, structuredEconomicsReady } from "../listing-economics.js";
import { listingBatch, listingClock } from "../listing-events.js";
import { originReady } from "../tenancy-origins.js";

const MAX_POUNDS = 1000000, MAX_PENCE = 100 * MAX_POUNDS; // R20
const ENDED = "This tenancy has ended", CHANGED = "This property changed meanwhile. Reload to see it";
const COLLECT = "Enter the date Hampton starts collecting the rent";
// The rent in force on `date` for tenancy `id` (SQL expressions), from its history (R6, R28).
const rentOn = (id, date) => `(SELECT c.rent FROM rent_changes c WHERE c.tenancy_id = ${id} AND c.effective_on <= ${date}
  ORDER BY c.effective_on DESC LIMIT 1)`;
const NEW = "(SELECT MAX(id) FROM tenancies)";
// Tenancy t's rent on `today` (an SQL expression), or its starting rent before it starts (not the latest agreed).
const rentNow = today => `COALESCE(${rentOn("t.id", `max(${today}, t.start_on)`)}, t.rent)`;
const LIMIT = "date(?1, 'start of month', '+2 months')";
const IN_RANGE = `m.due_on < ${LIMIT} AND (t.ended_on IS NULL OR m.due_on < t.ended_on)`;

// R6, R22–R24: one idempotent statement that adds the charges a full-service tenancy with collect_from still lacks, up
// to the end of next month in Jersey (today), in pence at the rent in force on each date. The series starts on
// collect_from, or, when the tenancy already has a rent charge in collect_from's month or later (collect_from moved by
// a service switch), on due_day of the month after its latest one: never two rent charges in a month, and only the
// missing months are walked. Then due_day of each following month, all before ended_on (past a fixed end_on they go on
// while the tenant stays). The opening balance is one charge on collect_from, made once. tenancyId: just that tenancy,
// or "newest" for the one inserted earlier in the same batch. staleBefore (all tenancies only): run just when the cached
// rentals count is older than that (P19). The check is a one-row gate joined before the tenancies, so while the cache is
// fresh the statement reads that one app_settings row and no tenancy.
export function ensureCharges(env, today, tenancyId = null, staleBefore = null) {
  const id = tenancyId === "newest" ? NEW : "?2";
  return env.DB.prepare(`INSERT INTO charges (tenancy_id, due_on, amount, kind)
  WITH RECURSIVE s AS (SELECT t.id, t.collect_from, t.due_day, t.ended_on, t.rent, t.opening_balance,
      (SELECT MAX(c.due_on) FROM charges c WHERE c.tenancy_id = t.id AND c.kind = 'rent') AS last
      FROM ${staleBefore ? `(SELECT 1 WHERE ${STALE}) g CROSS JOIN ` : ""}tenancies t JOIN rentals r ON r.id = t.rental_id
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
  ON CONFLICT DO NOTHING`).bind(today, ...(tenancyId === "newest" ? [] : [tenancyId]), ...(staleBefore ? [staleBefore] : []));
}

// R7, R8, R26, R27 (binds ?1 = Jersey today, ?2 = a tenancy id or NULL for all): CTEs ending in `arrears`, one row
// per running full-service tenancy (P4) with tenancy_id, rental_id, balance (pence: charges due minus rent payments), oldest_unpaid_on (FIFO: the
// first charge due whose running total exceeds what was paid), days_late (from it) and next_step (the latest
// ARREARS_STEPS key already due and not marked done for that charge, or NULL). Use: `WITH ${ARREARS_SQL} SELECT …`.
// The running total (window) is only taken for tenancies that owe something, the rest are two indexed sums.
// NOT-05's Missing payments reads the same CTEs over every full-service tenancy (OWED_SQL): one that ended still owes,
// even after its property moved to let-only (an ended tenancy that was collected, collect_from set).
// ADM-09 (adjusted: its switch, ADM09_ARREARS_READY, with migration 0045): a charge counts net of what was written off
// on it by `date` (reversals add it back). Off, the charge's amount as before.
export const arrearsReady = env => env?.ADM09_ARREARS_READY === "1";
// ADM-14 (no migration; only the website reads it): the landlord's and the tenant's answer to a fixed term's renewal,
// recorded by hand as rental events, and ADM-15's review kept with a rent agreed at Renew. Sends nothing.
export const renewalReady = env => env?.ADM14_RENEWAL_READY === "1";
const NET = (x = "x.") => `SUM(CASE ${x}kind WHEN 'writeoff' THEN ${x}amount_pence ELSE -${x}amount_pence END)`;
const amountOf = (adjusted, c = "c", date = "?1") => adjusted
  ? `(${c}.amount - COALESCE((SELECT ${NET()} FROM charge_adjustments x WHERE x.charge_id = ${c}.id AND x.effective_on <= ${date}), 0))`
  : `${c}.amount`;
const DUE_STEP = `CASE ${ARREARS_STEPS.toReversed().map(([d, k]) => `WHEN days_late >= ${d} THEN '${k}'`).join(" ")} END`;
const arrearsSql = (running, adjusted = false) => `a_t AS (SELECT t.id, t.rental_id FROM tenancies t JOIN rentals r ON r.id = t.rental_id
    WHERE ${running ? "r.service = 'full' AND (t.ended_on IS NULL OR t.ended_on > ?1)"
      : "(r.service = 'full' OR (t.ended_on <= ?1 AND t.collect_from IS NOT NULL))"} AND (?2 IS NULL OR t.id = ?2)),
  a_bal AS MATERIALIZED (SELECT id AS tenancy_id, rental_id,
    COALESCE((SELECT SUM(${amountOf(adjusted)}) FROM charges c WHERE c.tenancy_id = a_t.id AND c.due_on <= ?1), 0) AS due,
    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.tenancy_id = a_t.id AND p.kind = 'rent'), 0) AS paid FROM a_t),
  a_run AS (SELECT c.tenancy_id, c.due_on, b.paid, SUM(${amountOf(adjusted)}) OVER (PARTITION BY c.tenancy_id ORDER BY c.due_on, c.kind
    ROWS UNBOUNDED PRECEDING) AS run FROM a_bal b CROSS JOIN charges c ON c.tenancy_id = b.tenancy_id AND c.due_on <= ?1
    WHERE b.due > b.paid),
  a_old AS (SELECT tenancy_id, MIN(due_on) AS oldest FROM a_run WHERE run > paid GROUP BY tenancy_id),
  a_late AS (SELECT b.tenancy_id, b.rental_id, b.due - b.paid AS balance, o.oldest AS oldest_unpaid_on,
    CAST(julianday(?1) - julianday(o.oldest) AS INTEGER) AS days_late FROM a_bal b LEFT JOIN a_old o USING (tenancy_id)),
  arrears AS (SELECT a.*, CASE WHEN NOT EXISTS (SELECT 1 FROM arrears_steps x WHERE x.tenancy_id = a.tenancy_id
    AND x.charge_due_on = a.oldest_unpaid_on AND x.step = a.due_step) THEN a.due_step END AS next_step
    FROM (SELECT *, ${DUE_STEP} AS due_step FROM a_late) a)`;
export const ARREARS_SQL = arrearsSql(true), OWED_SQL = arrearsSql(false);
const NET_ARREARS = arrearsSql(true, true), NET_OWED = arrearsSql(false, true);
// The CTEs each reader uses: net of write-offs with ADM-09's switch.
export const arrearsOf = env => arrearsReady(env) ? NET_ARREARS : ARREARS_SQL;
export const owedOf = env => arrearsReady(env) ? NET_OWED : OWED_SQL;
const STEP = Object.fromEntries(ARREARS_STEPS.map(([days, step, label]) => [step, { days, step, label }]));

// R10, R13: the tenancy's own deadlines, from its dates (no rows): [key, label, from, period, done]. period: its key
// in the legal periods in force (`legal`: LEGAL, or with ADM-17 the saved ones over it).
export const DEADLINES = [["deposit", "Deposit protected", "deposit_received_on", "depositDays", "deposit_protected_on"],
  ["inventory_in", "Check-in report", "start_on", "reportDays", "inventory_in_on"],
  ["inventory_out", "Check-out report", "ended_on", "reportDays", "inventory_out_on"]];
export const deadlines = (t, today, legal = LEGAL) => DEADLINES.filter(d => t[d[2]]).map(([key, label, from, period, done]) => {
  const due_on = plusDays(t[from], legal[period]);
  return { key, label, due_on, done_on: t[done], status: t[done] ? "done" : complianceStatus({ expires_on: due_on }, today) };
});

// R10, R11, P4: the property checks that count, over c and r: properties not archived, gas only where there may be gas.
// ADM-11 (calendar: its switch; ?1 = today): with it, the calendar's kinds too, without a one-off already done and,
// for those of TENANT, only while a tenancy runs (the deposit's: one with its deposit received). Without it, the four
// kinds only, whatever rows a switch turned off again left behind.
const quoted = kinds => kinds.map(k => `'${k}'`).join(", ");
const applies = calendar => `(c.kind <> 'gas' OR r.has_gas IS NOT 0) AND ${calendar
  ? `(c.expires_on IS NOT NULL OR c.done_on IS NULL) AND (c.kind NOT IN (${quoted(TENANT)}) OR EXISTS (SELECT 1 FROM tenancies ct
      WHERE ct.rental_id = r.id AND (ct.ended_on IS NULL OR ct.ended_on > ?1)
      AND (c.kind <> 'deposit_info' OR ct.deposit_received_on IS NOT NULL)))`
  : `c.kind IN (${quoted(COMPLIANCE.map(([k]) => k))})`}`;
export const checksSql = calendar => `FROM compliance_items c JOIN rentals r ON r.id = c.rental_id
  WHERE r.archived_at IS NULL AND ${applies(calendar)}`;
// ADM-11: a batch run where the checks are read (Rentals and the clock's Inbox pass, the same for both): the calendar's
// rows ("Not recorded") for the properties entered before its switch, a row already there left alone; then the
// tenant's points dated for the tenancy in place (syncTenantChecks), which is how a tenancy entered ahead takes them
// over the day the tenant before has left.
export const ensureChecks = (env, periods, today) => [env.DB.prepare(`INSERT OR IGNORE INTO compliance_items (rental_id, kind)
  SELECT r.id, k.value FROM rentals r, json_each(?) k`).bind(JSON.stringify(CALENDAR.map(([k]) => k))),
syncTenantChecks(env, periods, today)];
// R10, R13: one SQL term per tenancy deadline not done whose due date `cmp` (e.g. "< ?1"), over t; the same rule as
// deadlines(), from the same DEADLINES.
const pending = (cmp, legal) => DEADLINES.map(([, , from, period, done]) =>
  `(t.${from} IS NOT NULL AND t.${done} IS NULL AND date(t.${from}, '+${legal[period]} days') ${cmp})`);
// R12, R16, R24: a fixed term within LEGAL.renewalDays of its end, or past it, with no notice and no move-out set (over t;
// ?1 = today). Renew moves end_on on or makes it periodic.
export const RENEWAL = `t.kind = 'fixed' AND t.ended_on IS NULL AND t.notice_given_on IS NULL
  AND t.end_on <= date(?1, '+${LEGAL.renewalDays} days')`;
const OPEN_REPAIR = "p.status NOT IN ('done', 'cancelled')"; // the repairs_open index

// R16: the nav's Rentals count: tenancies whose next arrears step is due, checks and tenancy deadlines overdue (a missing
// check counts; ADM-13: an inspection too, with its flag), renewals to decide, open emergencies and unmatched payments.
// P16: it is polled every 30 s, so it is kept in app_settings as rentals_count {n, at} and worked out again only when older than COUNT_MS (which also covers
// the day changing); any rental write drops it (the rental_events_count trigger), so the badge moves at once. Two
// statements for the counts batch, each gated on the cache: ensureCharges joins a one-row gate before the tenancies, and
// the count's INSERT has no FROM, so its WHERE is checked before the select list's subqueries run. While the cache is
// fresh both read only the rentals_count row. P19: when it is stale, the charges are brought up to date first, so a
// month nobody opened Rentals for still counts.
const COUNT_MS = 10 * 60 * 1000;
const STALE = "NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'rentals_count' AND json_extract(value, '$.at') > ?3)";
export const refreshRentalsCount = (env, legal = LEGAL) => {
  const today = jerseyToday(), staleBefore = new Date(Date.now() - COUNT_MS).toISOString();
  return [ensureCharges(env, today, null, staleBefore), env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at)
  WITH ${arrearsOf(env)} SELECT 'rentals_count', json_object('n',
    (SELECT COUNT(*) FROM arrears WHERE next_step IS NOT NULL)
    + (SELECT COUNT(*) ${checksSql(calendarReady(env))} AND (c.expires_on IS NULL OR c.expires_on < ?1))
    + (SELECT COALESCE(SUM(${pending("< ?1", legal).join(" + ")}), 0) FROM tenancies t JOIN rentals r ON r.id = t.rental_id
      WHERE r.archived_at IS NULL)
    + (SELECT COUNT(*) FROM tenancies t WHERE ${RENEWAL})${inspectionsReady(env) ? `
    + (SELECT COUNT(*) FROM tenancies t JOIN rentals r ON r.id = t.rental_id WHERE r.archived_at IS NULL AND ${inspectionDue("< ?1")})` : ""}
    + (SELECT COUNT(*) FROM repairs p WHERE p.urgency = 'emergency' AND ${OPEN_REPAIR})
    + (SELECT COUNT(*) FROM payments WHERE tenancy_id IS NULL), 'at', ?3), ?3
  WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'rentals_count' AND json_extract(value, '$.at') > ?4)
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
  .bind(today, null, now(), staleBefore)];
};

// has_opening: its opening charge is made (opening_balance can then only be corrected on that charge).
const TENANCY_SQL = `SELECT t.*, r.address, r.service, EXISTS (SELECT 1 FROM charges c WHERE c.tenancy_id = t.id
  AND c.kind = 'opening') AS has_opening FROM tenancies t JOIN rentals r ON r.id = t.rental_id WHERE t.id = ?`;
const loadTenancy = async (env, id) =>
  (await env.DB.prepare(TENANCY_SQL).bind(Number(id)).first()) ?? fail(404, "Tenancy not found");

// The tenancy page (P1): the rent in force today, its charges brought up to date, charges and payments of the last 24 months, the balance (rent
// charges due minus rent payments, R7, R26), the arrears (null without an unpaid charge due; steps done are those of
// the oldest unpaid charge, R27), the rent assistant with the saved RPI (R12) and the deadlines.
export async function detail(env, id) {
  id = Number(id);
  const legal = await readLegal(env), { periods } = legal, law = await tenancyLaw(env, legal);
  const today = jerseyToday(), since = addMonths(today, -24), q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
  const net = arrearsReady(env);
  const [, [tenancy], charges, payments, [{ balance }], [setting], [late], steps, [now_], ...more] = (await env.DB.batch([
    ensureCharges(env, today, id),
    q(TENANCY_SQL, id),
    q("SELECT id, due_on, amount, kind, edited FROM charges WHERE tenancy_id = ? AND due_on >= ? ORDER BY due_on DESC, kind",
      id, since),
    q("SELECT * FROM payments WHERE tenancy_id = ? AND received_on >= ? ORDER BY received_on DESC, id DESC", id, since),
    q(`SELECT (SELECT COALESCE(SUM(${amountOf(net, "charges", "?2")}), 0) FROM charges WHERE tenancy_id = ?1 AND due_on <= ?2)
      - (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE tenancy_id = ?1 AND kind = 'rent') AS balance`, id, today),
    q("SELECT value FROM app_settings WHERE key = 'rpi'"),
    q(`WITH ${arrearsOf(env)} SELECT * FROM arrears`, today, id),
    q("SELECT charge_due_on, step, done_at, done_by, note FROM arrears_steps WHERE tenancy_id = ? ORDER BY done_at", id),
    q(`SELECT ${rentNow("?2")} AS rent FROM tenancies t WHERE t.id = ?1`, id, today),
    ...(net ? [q(WRITEOFFS, id)] : []),
    ...(law ? [lawHistory(env, id)] : []),
    ...(renewalReady(env) ? renewalReads(env, id) : []),
  ])).map(r => r.results);
  if (!tenancy) fail(404, "Tenancy not found");
  // ADM-09: the revision a write-off must still find; off, the tenancy reads as before 0045.
  if (!net) delete tenancy.financial_revision;
  const writeoffs = net ? more.shift() : null, [law_history] = law ? more.shift() : [], answers = more.shift(), [origin] = more.shift() ?? [];
  const arrears = late?.oldest_unpaid_on ? { oldest_unpaid_on: late.oldest_unpaid_on, days_late: late.days_late,
    next_step: STEP[late.next_step] ?? null,
    done: steps.filter(x => x.charge_due_on === late.oldest_unpaid_on).map(({ charge_due_on, ...x }) => x) } : null;
  const rpi = setting ? JSON.parse(setting.value) : null;
  const notice = tenancy.notice_given_on && { given_on: tenancy.notice_given_on, by: tenancy.notice_by };
  // The rent in force today (tenancy.rent is the latest agreed, maybe from a later date); the starting rent before the start.
  // ADM-15: with its switch the assistant reads the 2025 rules (law), not the label.
  return { tenancy, current_rent: now_.rent, charges, payments, balance, arrears,
    assistant: { ...rentAssistant(tenancy, rpi, today, periods, rentReviewReady(env) ? law : null), rpi },
    deadlines: deadlines(tenancy, today, periods), earliest_move_out: notice ? earliestMoveOut(tenancy, notice, periods) : null,
    ...legalLabel(legal), ...(law ? { law, law_history } : {}), ...(net ? { writeoffs } : {}),
    ...(answers && tenancy.kind === "fixed" && !tenancy.ended_on ? { renewal: renewalOf(tenancy, answers, origin) } : {}) };
}

// ADM-14: the answers and listing drafts recorded for a tenancy, newest first (through the rental_events_rental index),
// a draft with whether its listing is still there; and, with ADM-06's switch, the listing it started from (Let agreed,
// tenancy_origins), while that listing exists. renewalOf keeps, for the term being renewed (its end date), the latest
// answer of each party and the draft still there, so a renewal or a changed end date starts with none.
const RENEWAL_SQL = `SELECT e.at, e.actor, e.type, e.data, l.id IS NOT NULL AS kept FROM rental_events e
  JOIN tenancies t ON e.rental_id = t.rental_id LEFT JOIN listings l ON l.id = json_extract(e.data, '$.listing_id')
  WHERE t.id = ?1 AND e.tenancy_id = ?1 AND e.type IN ('renewal.answered', 'renewal.listing_drafted') ORDER BY e.id DESC`;
const ORIGIN_SQL = `SELECT o.listing_id FROM tenancy_origins o JOIN listings l ON l.id = o.listing_id WHERE o.tenancy_id = ?`;
const renewalReads = (env, id) => [env.DB.prepare(RENEWAL_SQL).bind(Number(id)),
  ...(originReady(env) ? [env.DB.prepare(ORIGIN_SQL).bind(Number(id))] : [])];
const renewalOf = (t, rows, origin) => {
  const mine = rows.map(({ data, type, kept, ...e }) => ({ type, kept, a: { ...JSON.parse(data), ...e } })).filter(x => x.a.end_on === t.end_on);
  const of = party => mine.find(x => x.type === "renewal.answered" && x.a.party === party)?.a ?? null;
  return { end_on: t.end_on, landlord: of("landlord"), tenant: of("tenant"), origin: origin?.listing_id ?? null,
    draft: mine.find(x => x.type === "renewal.listing_drafted" && x.kept)?.a.listing_id ?? null };
};

// ADM-14: when the landlord or the tenant answered that the term ends, a draft of the listing the tenancy started from,
// made by New listing's own createListing: its fields (not its compliance, staff costs only with their switch, never its
// featured place), unpublished, to let from the term's end; then its photos, floorplans and aerials as new rows on the
// same files (no file is read or copied; documents stay), with its cover. A second click answers the same draft.
async function listingDraft({ env, admin, params: [id] }) {
  const cur = await loadTenancy(env, id);
  notEnded(cur);
  if (cur.kind !== "fixed") fail(409, "Only a fixed term is renewed");
  const [{ results: rows }, { results: [origin] } = { results: [] }] = await env.DB.batch(renewalReads(env, id));
  const r = renewalOf(cur, rows, origin);
  if (r.draft) return json({ id: r.draft });
  if (![r.landlord, r.tenant].some(x => x?.answer === "end")) fail(409, "Record first that the tenancy ends");
  if (!r.origin) fail(409, "This tenancy did not start from a listing, so there is none to copy");
  const src = await loadListing(env, r.origin), economics = await structuredEconomicsReady(env);
  const body = Object.fromEntries([...LISTING_FIELDS, ...(economics ? ECONOMIC_FIELDS : [])]
    .filter(k => k !== "featured_rank" && src[k] != null).map(k => [k, src[k]]));
  const made = await createListing(env, admin, { ...body, operation: "rent", availability: "to_let", available_on: cur.end_on });
  if (made.status !== 201) return made;
  const { id: listing } = await made.json(), key = listing.replace("-", ""), ts = now();
  await listingBatch(env, listing, { actor: admin, source: "media", action: "cover_changed" }, [
    env.DB.prepare(`INSERT INTO media (id, listing_id, r2_key, thumb_key, origin, kind, label, public, position, content_type,
      width, height, bytes, source_url, provider, rights_status, created_at, created_by)
      SELECT ?1 || id, ?2, r2_key, thumb_key, origin, kind, label, public, position, content_type, width, height, bytes,
      source_url, provider, rights_status, ?3, ?4 FROM media WHERE listing_id = ?5 AND kind <> 'document'`)
      .bind(key, listing, ts, admin, src.id),
    env.DB.prepare(`UPDATE listings SET cover_media_id = (SELECT id FROM media WHERE id = ?1 || ?2),
      updated_at = ${listingClock.replace("?", "?3")}, updated_by = ?4 WHERE id = ?5`).bind(key, src.cover_media_id, ts, admin, listing),
    rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: "renewal.listing_drafted",
      data: { end_on: cur.end_on, listing_id: listing, from: src.id } }),
  ]);
  return json({ id: listing }, 201);
}
const ANSWERS = { landlord: ["renew", "rent", "end"], tenant: ["renew", "end"] };

// ADM-14: who answered (landlord or tenant), what (renew; renew at a new rent, the landlord only; or end), on which day
// (today or earlier) and where it is recorded. It only records: Renew and End tenancy act on it.
async function renewalAnswer({ request, env, admin, params: [id] }) {
  const cur = await loadTenancy(env, id), today = jerseyToday();
  notEnded(cur);
  if (cur.kind !== "fixed") fail(409, "Only a fixed term is renewed");
  const b = asObject(await readJson(request)), errors = {}, f = fields(b, errors);
  const party = Object.hasOwn(ANSWERS, b.party) ? b.party : f.err("party", "Choose landlord or tenant");
  const answer = party && ANSWERS[party].includes(b.answer) ? b.answer : f.err("answer", "Choose an answer");
  const answered_on = f.date("answered_on") ?? f.err("answered_on", "Enter the date of the answer");
  if (answered_on > today) f.err("answered_on", "Use today or an earlier date");
  const source = f.text("source", 200) ?? f.err("source", "Say where the answer is recorded");
  const rent = answer === "rent" ? f.money("rent", true, MAX_POUNDS) : null;
  if (Object.keys(errors).length) return fieldErrors(errors);
  await rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: "renewal.answered",
    data: { end_on: cur.end_on, party, answer, ...(rent ? { rent } : {}), answered_on, source } }).run();
  return json(await detail(env, cur.id));
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

// ADM-20 (law: tenancyLaw's answer, null while off): the recorded label follows the agreement date: the one sent or,
// when a label is sent on its own, the one stored (cur).
const withRegime = (law, body, cur = null) => {
  const date = "agreement_on" in body ? body.agreement_on : "regime" in body ? cur?.agreement_on : null;
  return law && realDate(date) ? { ...body, regime: regimeOf(date, law) } : body;
};
// ADM-20: what a tenancy's history holds for the save that brings it under the 2025 rules (validateTenancyOperation's
// `history`): its fixed term lengthened, or made fixed again, by Renew or by an edit after its start; a charge raised
// by hand. Read through the property's events (the rental_events_rental index).
const lawHistory = (env, id) => env.DB.prepare(`WITH t AS (SELECT id, rental_id, start_on FROM tenancies WHERE id = ?),
  e AS (SELECT e.type, e.at, e.data FROM rental_events e JOIN t ON e.rental_id = t.rental_id AND e.tenancy_id = t.id)
  SELECT EXISTS (SELECT 1 FROM e, t WHERE (e.type = 'tenancy.renewed' AND json_extract(e.data, '$.after.kind') = 'fixed')
      OR (e.type = 'tenancy.updated' AND substr(e.at, 1, 10) >= t.start_on AND (json_extract(e.data, '$.after.kind') = 'fixed'
        OR json_extract(e.data, '$.after.end_on') > json_extract(e.data, '$.before.end_on')))) AS lengthened,
    EXISTS (SELECT 1 FROM e WHERE type = 'charge.edited' AND json_extract(data, '$.after') > json_extract(data, '$.before')) AS raised`)
  .bind(Number(id));
// ADM-20: what the 2025 rules say about a save (validateTenancyOperation's input; the body carries law_confirmed, the
// codes the employee confirmed, which count only when they are exactly the issues found). errors: the fields to answer
// with, a refused issue under its own field, otherwise the confirmation still missing. note: what the event keeps of
// a confirmation given. Without law, neither.
function lawCheck(law, input, body) {
  if (!law) return { note: {} };
  const sent = Array.isArray(body.law_confirmed) ? body.law_confirmed : [];
  const r = validateTenancyOperation({ ...input, policy: law, confirmed: sent });
  if (r.allowed && new Set(sent).size === r.issues.length)
    return { note: sent.length ? { law: { status: law.status, applies: r.applies, confirmed: r.issues.map(i => i.code) } } : {} };
  const errors = {};
  for (const i of r.issues) if (i.blocks) errors[i.field] = [errors[i.field], i.message].filter(Boolean).join(" ");
  return { errors: Object.keys(errors).length ? errors : { law_confirmed: "Confirm you have checked this against the agreement" } };
}

// R4, R5, R22: one tenancy without ended_on per property, not overlapping the last one, with its payment reference set
// from the new id, its starting rent, and its charges (full service only: collect_from defaults to the start, but a
// tenancy that started before this Jersey month must say from when Hampton collects, P22, or its past months would be
// charged). tenancyPlan checks `input` for property `rid` and returns {errors} or the batch's statements, and recheck()
// to answer a failed batch (409 when the property moved on); ADM-06's commit runs the same statements in its own batch.
export async function tenancyPlan(env, admin, rid, input) {
  const law = await tenancyLaw(env), r = validateTenancy(withRegime(law, input), { law });
  if (r.errors) return { errors: r.errors };
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
  if (s.last > r.value.start_on) return { errors: { start_on: `Start on ${s.last} or later, when the last tenancy ends` } };
  if (s.service === "full" && !r.value.collect_from && r.value.start_on < `${jerseyToday().slice(0, 8)}01`)
    return { errors: { collect_from: COLLECT } };
  const ts = now(), value = { ...r.value, collect_from: s.service === "full" ? r.value.collect_from ?? r.value.start_on : null };
  const checked = lawCheck(law, { operation: "create", tenancy: value }, input);
  if (checked.errors) return { errors: checked.errors };
  const row = { ...value, rental_id: s.id, created_at: ts, created_by: admin, updated_at: ts, updated_by: admin };
  const periods = calendarReady(env) && (await readLegal(env)).periods;
  const stmts = [
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
    rentalEvent(env, { rental_id: s.id, actor: admin, type: "tenancy.created", data: { ...value, ...checked.note } }, { tenancy_id: "tenancies" }),
    // ADM-11: with nobody else in, the copies and the deposit's prescribed information are dated for this tenant at
    // once (otherwise when they take over); an electrical checklist done before them is brought forward to the start.
    ...(periods ? [syncTenantChecks(env, periods, jerseyToday(), s.id),
      env.DB.prepare(`UPDATE compliance_items SET expires_on = ?1 WHERE rental_id = ?2 AND kind = 'checklist'
        AND done_on < ?1 AND expires_on > ?1`).bind(row.start_on, s.id)] : []),
  ];
  const recheck = async () => {
    const st = (await state()) ?? fail(404, "Property not found");
    check(st);
    if (st.last > row.start_on) fail(409, CHANGED); // a tenancy ending after this start was entered meanwhile
  };
  return { stmts, recheck };
}

async function createTenancy({ request, env, admin, params: [rid] }) {
  const p = await tenancyPlan(env, admin, rid, asObject(await readJson(request)));
  if (p.errors) return fieldErrors(p.errors);
  let res;
  try {
    [res] = await env.DB.batch(p.stmts);
  } catch (e) {
    await p.recheck();
    throw e;
  }
  return json(await detail(env, res.meta.last_row_id), 201);
}

// Set when the tenancy is entered: the rent has its own action (R28); the charge dates shaped the charges already made
// (R23). collect_from may only move later (P22); opening_balance may be added while it has no opening charge.
const SET = "Set when the tenancy was entered";
const LOCKED = { rent: "Use Change rent to change the rent", due_day: SET, start_on: SET };
const OPENING = "Its opening charge is already made: use Correct on that charge under Charges";

// Inside a batch, after the rental_events row it adds to: data.removed = {count, amount} of the charges `where` (SQL
// over charges, with its binds) selects, which the next statement deletes.
const removed = (env, where, ...b) => env.DB.prepare(`UPDATE rental_events SET data = json_set(data, '$.removed',
  (SELECT json_object('count', COUNT(*), 'amount', COALESCE(SUM(amount), 0)) FROM charges WHERE ${where}))
  WHERE id = (SELECT MAX(id) FROM rental_events)`).bind(...b);

// R23, P22 (binds ?1 today, ?2 the tenancy): the rent charge on collect_from moved later, unless its month already has
// one (never two rent charges in a month); ensureCharges then goes on after the latest one.
const firstCharge = (env, today, id) => env.DB.prepare(`INSERT INTO charges (tenancy_id, due_on, amount, kind)
  SELECT t.id, t.collect_from, 100 * COALESCE(${rentOn("t.id", "t.collect_from")}, t.rent), 'rent'
  FROM tenancies t JOIN rentals r ON r.id = t.rental_id WHERE t.id = ?2 AND r.service = 'full'
  AND t.collect_from < ${LIMIT} AND (t.ended_on IS NULL OR t.collect_from < t.ended_on)
  AND NOT EXISTS (SELECT 1 FROM charges c WHERE c.tenancy_id = t.id AND c.kind = 'rent'
    AND c.due_on >= date(t.collect_from, 'start of month') AND c.due_on < date(t.collect_from, 'start of month', '+1 month'))
  ON CONFLICT DO NOTHING`).bind(today, id);

// A form save (§3, lock). The stored row and the body are checked together (a fixed term needs its end, the end after
// the start, …), so the database's CHECKs never answer; the keys in LOCKED stay as stored. P22: collect_from (full
// service) moves only later: the rent charges due before it and not corrected by hand go (the event counts them; the
// opening charge stays), and the series goes on from the new date. Earlier months are an opening balance instead:
// opening_balance (full service) may be set while there is no opening charge, which is then made on collect_from in
// the same batch (not left to ensureCharges, which skips it for a move-out before the first rent charge).
// guard: statements a caller adds to the batch, failing it when what that caller read moved on (ADM-19).
export async function updateTenancy({ request, env, admin, params: [id], guard = [] }) {
  const law = await tenancyLaw(env), sentBody = asObject(await readJson(request));
  const cur = await loadTenancy(env, id), today = jerseyToday(), body = withRegime(law, sentBody, cur);
  const locked = { ...LOCKED, ...(cur.has_opening ? { opening_balance: OPENING } : {}) };
  const kept = Object.fromEntries(Object.keys(locked).map(k => [k, cur[k]]));
  const sent = validateTenancy(body, { partial: true, law }), r = validateTenancy({ ...cur, ...body, ...kept }, { law });
  const errors = { ...r.errors, ...sent.errors }, changed = k => !!sent.value && k in sent.value && sent.value[k] !== cur[k];
  for (const [k, msg] of Object.entries(locked)) if (changed(k)) errors[k] = msg;
  const collects = cur.service === "full" && !!cur.collect_from, NOT_COLLECTED = "Only full management tenancies collect rent";
  const to = sent.value?.collect_from, moved = changed("collect_from"), opening = changed("opening_balance");
  const why = !moved ? null : !collects ? NOT_COLLECTED : !to ? COLLECT
    : to < cur.collect_from ? cur.has_opening ? "Add the earlier months to the opening charge with Correct, under Charges"
      : "Enter what was owed for the earlier months in Owed today"
    : cur.ended_on && to >= cur.ended_on ? "Use a date before the move-out" : null;
  if (why) errors.collect_from ??= why;
  if (opening && !collects) errors.opening_balance ??= NOT_COLLECTED;
  if (moved && !errors.collect_from) Object.assign(errors, await writtenOff(env, "collect_from",
    "Rent due before this date was written off, so it stays: use an earlier date",
    "c.tenancy_id = ? AND c.kind = 'rent' AND c.edited = 0 AND c.due_on < ?", cur.id, to));
  if (Object.keys(errors).length) return fieldErrors(errors);
  const checked = lawCheck(law, { operation: "update", tenancy: { ...cur, ...r.value }, before: cur,
    history: law && await lawHistory(env, cur.id).first() }, body);
  if (checked.errors) return fieldErrors(checked.errors);
  // ADM-11: a deposit received (or its date corrected) dates its prescribed information, unless already given.
  const info = calendarReady(env) && changed("deposit_received_on")
    ? [syncTenantChecks(env, (await readLegal(env)).periods, today, cur.rental_id)] : [];
  const before = "tenancy_id = ? AND kind = 'rent' AND edited = 0 AND due_on < ?";
  await save(env, admin, "tenancies", cur, body, r.value, (keys, of) => [...guard, rentalEvent(env, { rental_id: cur.rental_id,
    tenancy_id: cur.id, actor: admin, type: "tenancy.updated", data: { before: of(cur), after: of(r.value), ...checked.note } }), ...info,
  ...(moved ? [removed(env, before, cur.id, to), env.DB.prepare(`DELETE FROM charges WHERE ${before}`).bind(cur.id, to),
    firstCharge(env, today, cur.id), ensureCharges(env, today, cur.id)] : []),
  ...(opening ? [env.DB.prepare(`INSERT INTO charges (tenancy_id, due_on, amount, kind) SELECT id, collect_from, opening_balance,
    'opening' FROM tenancies WHERE id = ? AND opening_balance > 0 AND NOT EXISTS (SELECT 1 FROM charges
    WHERE tenancy_id = tenancies.id AND kind = 'opening') ON CONFLICT DO NOTHING`).bind(cur.id)] : [])]);
  return json(await detail(env, cur.id));
}

// R23: a charge corrected by hand (pence), marked edited so a rent change leaves it alone (R28).
async function updateCharge({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request)), { amount } = body;
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_PENCE)
    return fieldErrors({ amount: `Enter an amount in pence from 1 to ${MAX_PENCE}` });
  const load = () => env.DB.prepare("SELECT c.*, t.rental_id FROM charges c JOIN tenancies t ON t.id = c.tenancy_id WHERE c.id = ?")
    .bind(Number(id)).first();
  const c = (await load()) ?? fail(404, "Charge not found");
  // ADM-09 (whatever its switch, once 0045 holds write-offs): never below the most ever written off on it (0045's
  // guard), and on a tenancy with write-offs a lower charge may not leave the written-off rent as credit.
  const w = await adjustments(env.DB.prepare(`SELECT (SELECT MAX(run) FROM (SELECT ${NET("")} OVER (ORDER BY effective_on, id
      ROWS UNBOUNDED PRECEDING) AS run FROM charge_adjustments WHERE charge_id = ?1)) AS peak,
    (SELECT COALESCE(${NET()}, 0) FROM charge_adjustments x JOIN charges c ON c.id = x.charge_id WHERE c.tenancy_id = ?2) AS adjusted,
    (SELECT COALESCE(SUM(${amountOf(true, "c", "?3")}), 0) FROM charges c WHERE c.tenancy_id = ?2 AND c.due_on <= ?3)
    - (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE tenancy_id = ?2 AND kind = 'rent') AS balance`)
    .bind(c.id, c.tenancy_id, jerseyToday()));
  if (w && amount < w.peak) return fieldErrors({ amount: `${gbp(w.peak)} of this charge was written off: enter at least that` });
  // Only lowering a charge due by today, while some rent stays written off net: the written-off rent the edit would turn
  // into credit (credit beyond what is written off came from payments, and stays allowed).
  const asCredit = b => Math.min(Math.max(-b, 0), w.adjusted);
  const left = w?.adjusted > 0 && amount < c.amount && c.due_on <= jerseyToday()
    ? asCredit(w.balance) - asCredit(w.balance - (c.amount - amount)) : 0;
  if (left < 0) return fieldErrors({ amount: `This leaves ${gbp(-left)} more written off than owed: reverse the write-off first` });
  // ADM-20: a charge raised by hand on a tenancy the 2025 rules cover (or may cover) is declared as no premium; the
  // write holds only while the tenancy is still as it was checked.
  const law = await tenancyLaw(env), t = law && await loadTenancy(env, c.tenancy_id);
  const checked = lawCheck(law, { operation: "charge", tenancy: t, charge: { before: c.amount, after: amount } }, body);
  if (checked.errors) return fieldErrors(checked.errors);
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE charges SET amount = ?, edited = 1 WHERE id = ?${law ? ` AND amount = ?
        AND EXISTS (SELECT 1 FROM tenancies WHERE id = charges.tenancy_id AND updated_at = ?)` : ""}`)
        .bind(amount, c.id, ...(law ? [c.amount, t.updated_at] : [])),
      ensureChanged(env),
      rentalEvent(env, { rental_id: c.rental_id, tenancy_id: c.tenancy_id, actor: admin, type: "charge.edited",
        data: { charge_id: c.id, due_on: c.due_on, kind: c.kind, before: c.amount, after: amount, ...checked.note } }),
    ]);
  } catch (e) {
    const now_ = (await load()) ?? fail(404, "Charge not found"); // the tenancy ended meanwhile and took it
    if (law && (now_.amount !== c.amount || (await loadTenancy(env, c.tenancy_id)).updated_at !== t.updated_at))
      fail(409, "This tenancy or its charge changed meanwhile. Reload to see it");
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

// ADM-15 (with its switch and ADM-20's rules): what the assistant said when the rent was changed, for the history: the
// RPI used with its source (null without one), the limit, the earliest date, whether the 2025 rules cover the tenancy
// and whether the periods were validated. It records; it never refuses the change.
async function rentReview(env, t, today) {
  const legal = rentReviewReady(env) && await readLegal(env), law = legal && await tenancyLaw(env, legal);
  if (!law) return {};
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'rpi'").first();
  const { cover, rpi, max_rent, earliest_on } = rentAssistant(t, row && JSON.parse(row.value), today, legal.periods, law);
  return { review: { cover, status: law.status, rpi, max_rent, earliest_on } };
}

async function changeRent({ request, env, admin, params: [id] }) {
  const cur = await loadTenancy(env, id), today = jerseyToday(), check = running(today);
  check(cur);
  const errors = {}, f = fields(asObject(await readJson(request)), errors);
  const rent = f.money("rent", true, MAX_POUNDS), effective_on = effectiveOn(f, today, cur);
  if (cur.ended_on && effective_on >= cur.ended_on) f.err("effective_on", "Use a date before the tenancy ends");
  if (Object.keys(errors).length) return fieldErrors(errors);
  await act(env, cur.id, [...rentChange(env, admin, cur, rent, effective_on, today, now()),
    rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: "rent.changed",
      data: { before: cur.rent, rent, effective_on, ...await rentReview(env, cur, today) } })], check);
  return json(await detail(env, cur.id));
}

const notEnded = t => { if (t.ended_on) fail(409, "This tenancy already has an end date"); };

// R24: keep the tenancy and payment reference; a renewal alone cannot determine which law applies.
// The legacy law label remains as recorded until scope and policy are reviewed.
async function renew({ request, env, admin, params: [id] }) {
  const cur = await loadTenancy(env, id), today = jerseyToday();
  notEnded(cur);
  const b = asObject(await readJson(request)), errors = {}, f = fields(b, errors);
  const kind = ["fixed", "periodic"].includes(b.kind) ? b.kind : f.err("kind", "Choose fixed term or periodic");
  const end_on = kind === "fixed" ? f.date("end_on") : null, after = [today, cur.start_on, cur.end_on ?? ""].sort().at(-1);
  if (kind === "fixed" && !errors.end_on && !(end_on > after)) f.err("end_on", `Enter an end date after ${after}`);
  const rent = f.money("rent", false, MAX_POUNDS), effective_on = rent ? effectiveOn(f, today, cur) : null;
  if (Object.keys(errors).length) return fieldErrors(errors);
  // ADM-20: a further fixed term is confirmed or refused, on the agreement date and scope the write then holds to.
  const law = await tenancyLaw(env), checked = lawCheck(law, { operation: "renew", tenancy: { ...cur, kind, end_on }, before: cur }, b);
  if (checked.errors) return fieldErrors(checked.errors);
  const same = t => !law || (t.agreement_on === cur.agreement_on && t.law_scope === cur.law_scope);
  const ts = now();
  await act(env, cur.id, [
    env.DB.prepare(`UPDATE tenancies SET kind = ?, end_on = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND ended_on IS NULL AND regime = ?${law ? " AND agreement_on IS ? AND law_scope = ?" : ""}`)
      .bind(kind, end_on, ts, admin, cur.id, cur.regime, ...(law ? [cur.agreement_on, cur.law_scope] : [])),
    ensureChanged(env),
    ...(rent ? rentChange(env, admin, cur, rent, effective_on, today, ts) : []),
    bump(env, admin, cur.rental_id, ts),
    rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: "tenancy.renewed", data: {
      before: { kind: cur.kind, end_on: cur.end_on, regime: cur.regime, rent: cur.rent },
      after: { kind, end_on, regime: cur.regime, ...(rent ? { rent, effective_on } : {}) }, ...checked.note,
      ...(rent && renewalReady(env) ? await rentReview(env, cur, today) : {}) } }), // ADM-14: as Change rent keeps it
  ], current => {
    notEnded(current);
    if (current.regime !== cur.regime) fail(409, "The recorded law label changed meanwhile. Reload the tenancy.");
    if (!same(current)) fail(409, "The tenancy's agreement date or scope changed meanwhile. Reload the tenancy.");
  });
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
  const { periods } = await readLegal(env);
  await act(env, cur.id, [
    env.DB.prepare(`UPDATE tenancies SET notice_given_on = ?, notice_by = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND ${ACTIVE}`).bind(given_on, by, now(), admin, cur.id, today),
    ensureChanged(env),
    rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: "notice.recorded",
      data: { given_on, by, earliest_move_out: earliestMoveOut(cur, { given_on, by }, periods) } }),
  ], check);
  return json(await detail(env, cur.id));
}

// R13, R24: the move-out, maybe ahead. Charges stop there (any already made on or after it go) and the property is
// free for the next tenancy. The event says which charges went (count, pence), so the history explains the balance.
// P22: a planned move-out may move to another date not before today (nor after the start of a next tenancy already
// entered); a later one brings the months up to it back (ensureCharges).
async function endTenancy({ request, env, admin, params: [id] }) {
  const cur = await loadTenancy(env, id), today = jerseyToday(), check = running(today);
  check(cur);
  const errors = {}, f = fields(asObject(await readJson(request)), errors);
  const ended_on = f.date("ended_on") ?? f.err("ended_on", "Enter the move-out date");
  const next = await nextStart(env, cur);
  if (ended_on && ended_on < cur.start_on) f.err("ended_on", "Use the start date or later");
  else if (ended_on && cur.ended_on && ended_on < today) f.err("ended_on", `Use ${today} or a later date`);
  else if (ended_on && next && ended_on > next) f.err("ended_on", `The next tenancy starts on ${next}: use that date or earlier`);
  else if (ended_on) Object.assign(errors, await writtenOff(env, "ended_on",
    "Rent due from this date was written off, so it stays: use a later date",
    "c.tenancy_id = ? AND c.kind = 'rent' AND c.due_on >= ?", cur.id, ended_on));
  if (Object.keys(errors).length) return fieldErrors(errors);
  if (ended_on === cur.ended_on) return json(await detail(env, cur.id));
  const ts = now(), from = "tenancy_id = ? AND kind = 'rent' AND due_on >= ?";
  await moveOut(env, cur, today, next, [
    env.DB.prepare(`UPDATE tenancies SET ended_on = ?1, updated_at = ?2, updated_by = ?3 WHERE id = ?4
      AND (ended_on IS NULL OR ended_on > ?5) AND NOT EXISTS (SELECT 1 FROM tenancies x WHERE x.rental_id = tenancies.rental_id
      AND x.id > tenancies.id AND x.start_on < ?1)`).bind(ended_on, ts, admin, cur.id, today),
    ensureChanged(env),
    rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: "tenancy.ended",
      data: { ended_on, ...(cur.ended_on ? { before: cur.ended_on } : {}) } }),
    removed(env, from, cur.id, ended_on),
    env.DB.prepare(`DELETE FROM charges WHERE ${from}`).bind(cur.id, ended_on),
    ensureCharges(env, today, cur.id),
    bump(env, admin, cur.rental_id, ts),
  ]);
  return json(await detail(env, cur.id));
}

// The start of the property's next tenancy, entered after this one (waiting for its planned move-out), or null.
const nextStart = async (env, t) => (await env.DB.prepare("SELECT MIN(start_on) AS d FROM tenancies WHERE rental_id = ? AND id > ?")
  .bind(t.rental_id, t.id).first()).d;

// A move-out write; when it fails, a 409 says why if the tenancy moved on or a next tenancy was entered meanwhile.
async function moveOut(env, cur, today, next, stmts) {
  try {
    await env.DB.batch(stmts);
  } catch (e) {
    const t = await loadTenancy(env, cur.id);
    running(today)(t);
    if (t.ended_on !== cur.ended_on || await nextStart(env, cur) !== next) fail(409, CHANGED);
    throw e;
  }
}

// P22: a planned move-out cancelled, while no next tenancy has been entered (it would overlap); the charges come back.
async function cancelEnd({ env, admin, params: [id] }) {
  const cur = await loadTenancy(env, id), today = jerseyToday();
  if (!cur.ended_on) fail(409, "This tenancy has no move-out date");
  running(today)(cur);
  if (await nextStart(env, cur)) fail(409, "The next tenancy is already entered. Change the move-out date instead");
  // ADM-16: once the keys are back, the move-out happened; cancelling it would bring rent back and hide the deposit record.
  const KEYS_BACK = exitReady(env) ? `AND NOT EXISTS (SELECT 1 FROM tenancy_exit_inventories WHERE tenancy_id = tenancies.id
      AND moved_out_on IS NOT NULL)` : "";
  if (KEYS_BACK && await env.DB.prepare(`SELECT 1 FROM tenancy_exit_inventories WHERE tenancy_id = ? AND moved_out_on IS NOT NULL`)
    .bind(cur.id).first()) fail(409, "The keys are already back, so this move-out cannot be cancelled");
  const ts = now();
  await moveOut(env, cur, today, null, [
    env.DB.prepare(`UPDATE tenancies SET ended_on = NULL, updated_at = ?, updated_by = ? WHERE id = ? AND ended_on > ?
      AND NOT EXISTS (SELECT 1 FROM tenancies x WHERE x.rental_id = tenancies.rental_id AND x.id > tenancies.id) ${KEYS_BACK}`)
      .bind(ts, admin, cur.id, today),
    ensureChanged(env),
    rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: "tenancy.end_cancelled",
      data: { before: cur.ended_on } }),
    ensureCharges(env, today, cur.id),
    bump(env, admin, cur.rental_id, ts),
  ]);
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
      env.DB.prepare(`WITH ${arrearsOf(env)} SELECT * FROM arrears`).bind(today, cur.id),
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
        WITH ${arrearsOf(env)} SELECT tenancy_id, ?3, ?4, ?5, ?6, ?7 FROM arrears
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

// ADM-09 (its switch, migration 0045): rent owed that Hampton gives up, written off as immutable adjustments on the
// charges (never a payment, never a charge deleted), the oldest unpaid charge first, each row inside its unpaid part
// (0045's guard checks it again). The batch holds only while the tenancy's financial_revision is the one the page
// showed: a payment, charge or write-off meanwhile is a 409 and nothing is written. A reversal adds a whole write-off
// back, once. Its rows share an id: `wo:<id>:<n>`, and `rv:<id>:<n>` for the reversal. The reason stays on the rows,
// out of the history.
const WRITEOFFS = `SELECT substr(x.operation_id, 4, 36) AS id, MIN(x.effective_on) AS written_off_on,
  SUM(CASE x.kind WHEN 'writeoff' THEN x.amount_pence END) AS amount, MAX(CASE x.kind WHEN 'writeoff' THEN x.reason END) AS reason,
  MAX(CASE x.kind WHEN 'writeoff' THEN x.created_by END) AS created_by, MAX(CASE x.kind WHEN 'reversal' THEN x.effective_on END) AS reversed_on,
  MAX(CASE x.kind WHEN 'reversal' THEN x.reason END) AS reversal_reason
  FROM charge_adjustments x JOIN charges c ON c.id = x.charge_id WHERE c.tenancy_id = ? GROUP BY 1 ORDER BY MIN(x.id) DESC`;
// The unpaid part of each charge due by ?2, oldest first, as 0045's guard works it out (rent paid by ?2).
const UNPAID = `WITH c AS (SELECT c.id, c.due_on, ${amountOf(true, "c", "?2")} AS net FROM charges c WHERE c.tenancy_id = ?1 AND c.due_on <= ?2),
  r AS (SELECT id, due_on, net, SUM(net) OVER (ORDER BY due_on, id ROWS UNBOUNDED PRECEDING) AS run FROM c),
  p AS (SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE tenancy_id = ?1 AND kind = 'rent' AND received_on <= ?2)
  SELECT r.id, min(r.net, r.run - p.paid) AS unpaid FROM r, p WHERE r.run > p.paid ORDER BY r.due_on, r.id`;
const MONEY_CHANGED = "The balance changed meanwhile. Reload to see it";
const gbp = p => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

async function adjust({ request, env, admin, params: [tid, wid] }, kind, rows, plan) {
  const cur = await loadTenancy(env, tid), today = jerseyToday(), ts = now(), b = asObject(await readJson(request));
  const errors = {}, reason = fields(b, errors).text("reason", 300);
  if (!reason) errors.reason ??= kind === "writeoff" ? "Say why this rent is written off" : "Say why the write-off is reversed";
  const [, [{ financial_revision: rev }], found] = (await env.DB.batch([ensureCharges(env, today, cur.id),
    env.DB.prepare("SELECT financial_revision FROM tenancies WHERE id = ?").bind(cur.id), rows(env, cur, today, wid)])).map(r => r.results);
  if (b.financial_revision !== rev) fail(409, MONEY_CHANGED);
  const parts = plan(cur, found, b, errors);
  if (Object.keys(errors).length) return fieldErrors(errors);
  const id = kind === "writeoff" ? crypto.randomUUID() : wid;
  try {
    await env.DB.batch([...parts.rows.flatMap((x, i) => [env.DB.prepare(`INSERT INTO charge_adjustments (charge_id, amount_pence,
      kind, original_adjustment_id, effective_on, reason, created_at, created_by, operation_id)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT financial_revision FROM tenancies WHERE id = ?) = ?`)
      .bind(x.charge_id, x.amount, kind, x.original ?? null, today, reason, ts, admin, `${kind === "writeoff" ? "wo" : "rv"}:${id}:${i}`,
        cur.id, rev + i), ensureChanged(env)]),
      rentalEvent(env, { rental_id: cur.rental_id, tenancy_id: cur.id, actor: admin, type: parts.type,
        data: { writeoff: id, amount: parts.rows.reduce((s, x) => s + x.amount, 0), charges: parts.rows.length } })]);
  } catch (e) {
    const now_ = await env.DB.prepare("SELECT financial_revision FROM tenancies WHERE id = ?").bind(cur.id).first();
    if (now_?.financial_revision !== rev) fail(409, MONEY_CHANGED);
    throw e;
  }
  return json(await detail(env, cur.id));
}

// A tenancy with no rent charge (let-only) has nothing owed to write off.
const writeOff = req => adjust(req, "writeoff", (env, t, today) => env.DB.prepare(UNPAID).bind(t.id, today), (t, found, b, errors) => {
  const owed = found.reduce((s, x) => s + x.unpaid, 0);
  if (!Number.isInteger(b.amount) || b.amount < 1 || b.amount > owed)
    errors.amount = owed ? `Enter an amount from £0.01 to ${gbp(owed)}` : "No rent is owed to write off";
  let left = Number.isInteger(b.amount) ? b.amount : 0;
  const rows = found.map(x => { const amount = Math.min(left, x.unpaid); left -= amount; return { charge_id: x.id, amount }; });
  return { type: "charge.written_off", rows: rows.filter(x => x.amount > 0) };
});

const reverseWriteOff = req => adjust(req, "reversal",
  (env, t, today, wid) => env.DB.prepare(`SELECT x.id, x.charge_id, x.amount_pence, EXISTS (SELECT 1 FROM charge_adjustments r
    WHERE r.original_adjustment_id = x.id) AS reversed FROM charge_adjustments x JOIN charges c ON c.id = x.charge_id
    WHERE c.tenancy_id = ? AND x.kind = 'writeoff' AND substr(x.operation_id, 4, 36) = ? ORDER BY x.id`).bind(t.id, wid),
  (t, found) => {
    if (!found.length) fail(404, "Write-off not found");
    if (found.some(x => x.reversed)) fail(409, "This write-off is already reversed");
    return { type: "charge.writeoff_reversed", rows: found.map(x => ({ charge_id: x.charge_id, amount: x.amount_pence, original: x.id })) };
  });

// 0045's foreign key and guards hold whatever ADM-09's switch says, so these checks read its write-offs whenever they
// exist: the row, or null before 0045 (no such table: no write-offs).
const adjustments = async stmt => {
  try { return await stmt.first(); }
  catch (e) { if (/no such table: charge_adjustments/.test(e?.message)) return null; throw e; }
};
// The field error when a change would delete a charge with a write-off (`where` over charges c).
const writtenOff = async (env, field, msg, where, ...b) => await adjustments(env.DB.prepare(`SELECT 1 FROM charges c
  WHERE ${where} AND EXISTS (SELECT 1 FROM charge_adjustments x WHERE x.charge_id = c.id)`).bind(...b)) ? { [field]: msg } : {};

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

// R9, R26, P9, P23: a payment assigned to a tenancy, moved to another or back to Unmatched (tenancy_id null), its kind
// corrected, or, when recorded by hand, its amount or date (an imported one keeps the bank's). The UPDATE is guarded on
// the row as read, so a change meanwhile is a 409. A payment moved between tenancies is logged on both properties.
const EDITABLE = ["tenancy_id", "kind", "amount", "received_on"];
async function updatePayment({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request)), unassign = body.tenancy_id === null;
  const r = validatePayment(Object.fromEntries(EDITABLE.filter(k => k in body && !(k === "tenancy_id" && unassign))
    .map(k => [k, body[k]])), { partial: true });
  if (r.errors) return fieldErrors(r.errors);
  const load = () => env.DB.prepare("SELECT * FROM payments WHERE id = ?").bind(Number(id)).first();
  const cur = (await load()) ?? fail(404, "Payment not found");
  const after = { ...Object.fromEntries(EDITABLE.map(k => [k, r.value[k] ?? cur[k]])), ...(unassign ? { tenancy_id: null } : {}) };
  const keys = EDITABLE.filter(k => after[k] !== cur[k]), of = row => Object.fromEntries(keys.map(k => [k, row[k]]));
  const dated = keys.some(k => k === "amount" || k === "received_on");
  if (dated && cur.source !== "manual") fail(400, "An imported payment keeps the bank's amount and date");
  if (dated && cur.import_hash) fail(409, "This payment was matched to a bank line; move or unassign it instead");
  const t = after.tenancy_id && await loadTenancy(env, after.tenancy_id), check = checkKind(after.kind);
  if (t) check(t);
  const was = cur.tenancy_id && await loadTenancy(env, cur.tenancy_id);
  const data = { payment_id: cur.id, amount: cur.amount, before: of(cur), after: of(after), ...(keys.includes("tenancy_id")
    ? { from: was?.payment_ref ?? null, to: t?.payment_ref ?? null } : {}) };
  // One event where the payment is now (or was, when unassigned), and one where it was when it moved between tenancies.
  const event = x => rentalEvent(env, { rental_id: x.rental_id, tenancy_id: x.id, actor: admin, type: "payment.updated", data });
  if (keys.length) try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE payments SET tenancy_id = ?1, kind = ?2, amount = ?3, received_on = ?4 WHERE id = ?5
        AND tenancy_id IS ?6 AND kind = ?7 AND amount = ?8 AND received_on = ?9
        AND (?1 IS NULL OR EXISTS (SELECT 1 FROM tenancies t JOIN rentals r ON r.id = t.rental_id WHERE t.id = ?1
        AND (r.service = 'full' OR ?2 <> 'rent')))`)
        .bind(after.tenancy_id, after.kind, after.amount, after.received_on, cur.id, cur.tenancy_id, cur.kind, cur.amount,
          cur.received_on),
      ensureChanged(env),
      ...(t && was && t.id !== was.id ? [event(was)] : []),
      t || was ? event(t || was) : rentalEvent(env, { actor: admin, type: "payment.updated", data }),
    ]);
  } catch (e) {
    const p = await load();
    if (EDITABLE.some(k => p[k] !== cur[k])) fail(409, "This payment changed meanwhile. Reload to see it");
    if (t) check(await loadTenancy(env, t.id));
    throw e;
  }
  return json(t ? await detail(env, t.id) : { payment: await load() });
}

// Per request (R9 says 2,000 a file): the panel sends a file in chunks of 500, numbered first with occurrences().
const IMPORT_BYTES = 2 * 1024 * 1024, MAX_ROWS = 500, ENDED_DAYS = 60;
const STATUSES = ["matched", "unmatched", "duplicate", "by_hand", "ignored"];

// R9, R25: bank rows the panel already split ({date ISO, amount in pence, description, n = occurrences() over the
// whole file}), checked again here. Only money in, not after today; anything unreadable is "ignored" with a reason.
// Each row's hash (SHA-256 of importKey|n) is unique in payments, so a file imported twice adds nothing.
// A reference HE-T… finds a full-service tenancy, else the row is Unmatched; so is one of a tenancy that ended more than
// ENDED_DAYS ago (reason "Tenancy ended"), which someone has to look at. That tenancy's manual rent payment of the same
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
    q(`SELECT t.id, t.payment_ref, t.ended_on FROM tenancies t JOIN rentals r ON r.id = t.rental_id
      WHERE r.service = 'full' AND t.id IN (SELECT value FROM json_each(?1))`, ok.map(r => r.ref).filter(Boolean)),
    q("SELECT import_hash FROM payments WHERE import_hash IN (SELECT value FROM json_each(?1))", ok.map(r => r.hash)),
    q(`SELECT j.key AS i, p.id FROM json_each(?1) j JOIN payments p ON p.tenancy_id = json_extract(j.value, '$[0]')
      AND p.amount = json_extract(j.value, '$[1]') AND p.source = 'manual' AND p.kind = 'rent' AND p.import_hash IS NULL
      AND abs(julianday(p.received_on) - julianday(json_extract(j.value, '$[2]'))) <= 7
      ORDER BY j.key, abs(julianday(p.received_on) - julianday(json_extract(j.value, '$[2]'))), p.id`,
      ok.map(r => [r.ref, r.amount, r.date])),
  ])).map(r => r.results);
  const refs = new Map(full.map(t => [t.id, t])), seen = new Set(known.map(k => k.import_hash));
  const cutoff = plusDays(today, -ENDED_DAYS), candidates = {}, used = new Set();
  for (const h of hand) (candidates[h.i] ??= []).push(h.id);
  ok.forEach((r, i) => {
    const t = refs.get(r.ref), old = t?.ended_on && t.ended_on < cutoff;
    r.out.payment_ref = t && !old ? t.payment_ref : null;
    if (!r.out.payment_ref) r.ref = null; // goes in Unmatched
    if (seen.has(r.hash)) r.out.status = "duplicate";
    else if (!r.out.payment_ref) Object.assign(r.out, { status: "unmatched" }, old ? { reason: "Tenancy ended" } : {});
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
const KINDS = [...COMPLIANCE, ...CALENDAR, ...DEADLINES].map(([k]) => k);
const LABEL = Object.fromEntries([...COMPLIANCE, ...CALENDAR].map(([k, label]) => [k, label]));
const WARN = Math.max(...LEGAL.warnDays);
export const INSPECTION_WARN = 30; // ADM-13: an inspection every six months shows in the to-do from 30 days before it falls due
const URGENCY = "CASE p.urgency WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END";
const MARKS = ["arrears", "compliance", "renewals", "repairs"];

// R2, §4: the properties, in SQL so a search or filter reads only them (list=1, P26). The current tenancy is the earliest
// one still running (a later one may be waiting for a planned move-out), with its rent today and, under full service,
// its balance (rent charges due minus rent payments). The marks: arrears when something due before today is unpaid
// (owing and at least a day late, P25: the to-do keeps only a step due), checks when a property check or a tenancy
// deadline is missing or due within WARN days (ADM-13, with inspections: one due within INSPECTION_WARN days), a renewal
// to decide, an open repair. Binds ?1 today, ?2 service, ?3 the search (LIKE) or NULL, ?4 a mark or NULL. q searches
// address, landlord, and any tenant's name or payment reference.
const has = col => `${col} LIKE ?3 ESCAPE '\\'`;
const LIST = (archived, inspections, legal, calendar, net) => `WITH x AS (SELECT r.id, r.address, r.parish, r.service, r.landlord_id, l.name AS landlord_name,
    r.archived_at, t.id AS tenancy_id, t.tenant_name, t.payment_ref, ${rentNow("?1")} AS rent,
    CASE WHEN r.service = 'full' THEN t.id END AS full_id,
    r.archived_at IS NULL AND (EXISTS (SELECT 1 FROM compliance_items c WHERE c.rental_id = r.id
        AND ${applies(calendar)} AND (c.expires_on IS NULL OR c.expires_on <= date(?1, '+${WARN} days')))
      OR EXISTS (SELECT 1 FROM tenancies t WHERE t.rental_id = r.id
        AND (${pending(`<= date(?1, '+${WARN} days')`, legal).join(" OR ")}))${inspections ? `
      OR EXISTS (SELECT 1 FROM tenancies t WHERE t.rental_id = r.id AND ${inspectionDue(`<= date(?1, '+${INSPECTION_WARN} days')`)})` : ""}) AS compliance,
    EXISTS (SELECT 1 FROM tenancies t WHERE t.rental_id = r.id AND ${RENEWAL}) AS renewals,
    EXISTS (SELECT 1 FROM repairs p WHERE p.rental_id = r.id AND ${OPEN_REPAIR}) AS repairs
    FROM rentals r JOIN landlords l ON l.id = r.landlord_id
    LEFT JOIN tenancies t ON t.id = (SELECT x.id FROM tenancies x WHERE x.rental_id = r.id
      AND (x.ended_on IS NULL OR x.ended_on > ?1) ORDER BY x.start_on, x.id LIMIT 1)
    WHERE r.archived_at IS ${archived ? "NOT " : ""}NULL AND (?2 IS NULL OR r.service = ?2)
    AND (?3 IS NULL OR ${has("r.address")} OR ${has("l.name")} OR EXISTS (SELECT 1 FROM tenancies x
      WHERE x.rental_id = r.id AND (${has("x.tenant_name")} OR ${has("x.payment_ref")})))),
  y AS (SELECT *, (SELECT COALESCE(SUM(${amountOf(net)}), 0) FROM charges c WHERE c.tenancy_id = full_id AND c.due_on <= ?1) AS due,
    (SELECT COALESCE(SUM(${amountOf(net)}), 0) FROM charges c WHERE c.tenancy_id = full_id AND c.due_on = ?1) AS today,
    (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.tenancy_id = full_id AND p.kind = 'rent') AS paid FROM x),
  z AS (SELECT *, CASE WHEN full_id IS NOT NULL THEN due - paid END AS balance, due - today > paid AS arrears FROM y)
  SELECT id, address, parish, service, landlord_id, landlord_name, archived_at, tenancy_id, tenant_name, payment_ref, rent,
    balance, ${MARKS.join(", ")} FROM z
  WHERE ?4 IS NULL OR CASE ?4 ${MARKS.map(k => `WHEN '${k}' THEN ${k}`).join(" ")} END
  ORDER BY address COLLATE NOCASE, id`;
const marks = row => {
  const { arrears, compliance, renewals, repairs, ...r } = row;
  return { ...r, marks: MARKS.filter(k => row[k]) };
};

// R2, R16, §4: the Rentals screen in one batch: the charges brought up to date first (R6), then the to-do (arrears with a
// step due, checks and deadlines within LEGAL.warnDays or missing, renewals, open repairs with emergencies first,
// unmatched payments), the properties (LIST) and the totals. The to-do is never filtered. list=1 (P26: a search or a
// filter changed) answers only the properties, without making charges or reading the to-do.
async function overview({ request, env }) {
  const p = new URL(request.url).searchParams, q = p.get("q")?.trim() || null;
  const service = p.get("service") || null, filter = p.get("filter") || null, archived = p.get("archived") ?? "";
  if (service && !["full", "let_only"].includes(service)) fail(400, "Invalid service");
  if (filter && !MARKS.includes(filter)) fail(400, "Invalid filter");
  if (!["", "0", "1"].includes(archived)) fail(400, "Invalid archived");
  const today = jerseyToday(), s = (sql, ...b) => env.DB.prepare(sql).bind(today, ...b);
  const visits = inspectionsReady(env), legal = await readLegal(env), { periods } = legal, calendar = calendarReady(env);
  const list = s(LIST(archived === "1", visits, periods, calendar, arrearsReady(env)), service, q && `%${q.replace(/[\\%_]/g, "\\$&")}%`, filter);
  if (p.get("list") === "1") return json({ rentals: (await list.all()).results.map(marks) });
  if (calendar) await env.DB.batch(ensureChecks(env, periods, today));
  const [, owing, checks, dues, renewals, repairs, unmatched, rentals, [totals], inspections = []] = (await env.DB.batch([
    ensureCharges(env, today),
    s(`WITH ${arrearsOf(env)} SELECT a.tenancy_id, a.rental_id, r.address, t.tenant_name, t.payment_ref, a.balance,
      a.oldest_unpaid_on, a.days_late, a.next_step FROM arrears a JOIN tenancies t ON t.id = a.tenancy_id
      JOIN rentals r ON r.id = a.rental_id WHERE a.next_step IS NOT NULL OR a.balance > 0
      ORDER BY a.days_late DESC, r.address COLLATE NOCASE`, null),
    s(`SELECT c.rental_id, r.address, c.kind, c.expires_on ${checksSql(calendar)}
      AND (c.expires_on IS NULL OR c.expires_on <= date(?1, '+${WARN} days'))`),
    s(`SELECT t.*, r.address FROM tenancies t JOIN rentals r ON r.id = t.rental_id WHERE r.archived_at IS NULL
      AND (${pending(`<= date(?1, '+${WARN} days')`, periods).join(" OR ")})`),
    s(`SELECT t.id AS tenancy_id, t.rental_id, r.address, t.tenant_name, t.end_on FROM tenancies t
      JOIN rentals r ON r.id = t.rental_id WHERE ${RENEWAL} ORDER BY t.end_on, t.id`),
    env.DB.prepare(`SELECT p.id, p.rental_id, r.address, p.title, p.urgency, p.status, p.contractor, p.quote, p.created_at
      FROM repairs p JOIN rentals r ON r.id = p.rental_id WHERE ${OPEN_REPAIR} ORDER BY ${URGENCY}, p.created_at, p.id`),
    // ponytail: the newest 200; the count in totals says how many there are.
    env.DB.prepare(`SELECT id, received_on, amount, description, kind FROM payments WHERE tenancy_id IS NULL
      ORDER BY received_on DESC, id DESC LIMIT 200`),
    list,
    s(`SELECT (SELECT COUNT(*) FROM rentals WHERE archived_at IS NULL) AS properties,
      (SELECT COUNT(DISTINCT rental_id) FROM tenancies WHERE ended_on IS NULL OR ended_on > ?1) AS occupied,
      (SELECT COUNT(*) FROM payments WHERE tenancy_id IS NULL) AS unmatched`),
    ...(visits ? [s(`SELECT t.id, t.rental_id, t.tenant_name, r.address, ${NEXT_INSPECTION} AS due_on FROM tenancies t
      JOIN rentals r ON r.id = t.rental_id WHERE r.archived_at IS NULL AND ${inspectionDue(`<= date(?1, '+${INSPECTION_WARN} days')`)}`)] : []),
  ])).map(r => r.results);
  const todo = {
    arrears: owing.filter(a => a.next_step).map(({ next_step, ...a }) => ({ ...a, next_step: STEP[next_step] })),
    compliance: [
      ...dues.flatMap(t => deadlines(t, today, periods).filter(d => d.status !== "done" && d.status !== "ok")
        .map(d => ({ rental_id: t.rental_id, address: t.address, tenancy_id: t.id, tenant_name: t.tenant_name, kind: d.key,
          label: d.label, due_on: d.due_on, status: d.status }))),
      ...checks.map(c => ({ rental_id: c.rental_id, address: c.address, tenancy_id: null, tenant_name: null, kind: c.kind,
        label: LABEL[c.kind], due_on: c.expires_on, status: complianceStatus(c, today) })),
      ...inspections.map(t => ({ rental_id: t.rental_id, address: t.address, tenancy_id: t.id, tenant_name: t.tenant_name,
        kind: "inspection", label: "Inspection", due_on: t.due_on, status: complianceStatus({ expires_on: t.due_on }, today) })),
    ].sort((a, b) => RANK.indexOf(a.status) - RANK.indexOf(b.status) || (a.due_on ?? "").localeCompare(b.due_on ?? "")
      || a.rental_id - b.rental_id || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)),
    renewals: renewals.map(r => ({ ...r, label: r.end_on < today ? "Fixed term ended" : "Renewal due" })),
    repairs, unmatched,
  };
  const owed = owing.reduce((sum, a) => sum + Math.max(a.balance, 0), 0);
  return json({ todo, rentals: rentals.map(marks), totals: { properties: totals.properties, occupied: totals.occupied, owed,
    unmatched: totals.unmatched }, ...legalLabel(legal) });
}

// Assigning a payment (§4 Unmatched): tenancies by tenant, payment reference or address. Running ones (P4), and full ones
// that ended in the last 12 months, since a former tenant may still be paying off a debt. At most 20, running first.
async function findTenancies({ request, env }) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return json({ tenancies: [] });
  const today = jerseyToday(), has = col => `${col} LIKE ?3 ESCAPE '\\'`;
  const { results } = await env.DB.prepare(`SELECT t.id AS tenancy_id, t.tenant_name, t.payment_ref, t.ended_on, r.address, r.service
    FROM tenancies t JOIN rentals r ON r.id = t.rental_id
    WHERE (t.ended_on IS NULL OR t.ended_on > ?1 OR (r.service = 'full' AND t.ended_on >= ?2))
    AND (${has("t.tenant_name")} OR ${has("t.payment_ref")} OR ${has("r.address")})
    ORDER BY t.ended_on IS NOT NULL AND t.ended_on <= ?1, t.tenant_name COLLATE NOCASE, t.id LIMIT 20`)
    .bind(today, addMonths(today, -12), `%${q.replace(/[\\%_]/g, "\\$&")}%`).all();
  return json({ tenancies: results });
}

export default [
  ['GET',/^\/admin\/payments\/(\d+)$/,async({env,params:[id]})=>{
    const payment=await env.DB.prepare(`SELECT p.*,t.rental_id,t.tenant_name,r.address FROM payments p
      LEFT JOIN tenancies t ON t.id=p.tenancy_id LEFT JOIN rentals r ON r.id=t.rental_id WHERE p.id=?`).bind(Number(id)).first();
    if(!payment)fail(404,'Payment not found');return json({payment});
  },true],
  ["GET", /^\/admin\/rentals$/, overview, true],
  ["GET", /^\/admin\/tenancies$/, findTenancies, true],
  ["POST", /^\/admin\/rentals\/(\d+)\/tenancies$/, createTenancy, true],
  ["GET", /^\/admin\/tenancies\/(\d+)$/, getTenancy, true],
  ["PUT", /^\/admin\/tenancies\/(\d+)$/, updateTenancy, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/rent$/, changeRent, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/renew$/, renew, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/notice$/, notice, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/end$/, endTenancy, true],
  ["DELETE", /^\/admin\/tenancies\/(\d+)\/end$/, cancelEnd, true],
  ["PUT", /^\/admin\/charges\/(\d+)$/, updateCharge, true],
  ["PUT", /^\/admin\/tenancies\/(\d+)\/arrears\/(\d{4}-\d{2}-\d{2})\/([a-z]+)$/, markStep, true],
  ["POST", /^\/admin\/payments$/, createPayment, true],
  ["PUT", /^\/admin\/payments\/(\d+)$/, updatePayment, true],
  ["POST", /^\/admin\/payments\/import$/, importPayments, true],
];
// ADM-09: mounted by server/api.js only with ADM09_ARREARS_READY (migration 0045).
// ADM-14: mounted by server/api.js only with ADM14_RENEWAL_READY.
export const renewalRoutes = [["POST", /^\/admin\/tenancies\/(\d+)\/renewal-answer$/, renewalAnswer, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/listing-draft$/, listingDraft, true]];
export const writeoffRoutes = [
  ["POST", /^\/admin\/tenancies\/(\d+)\/writeoffs$/, writeOff, true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/writeoffs\/([0-9a-f-]{36})\/reverse$/, reverseWriteOff, true],
];
