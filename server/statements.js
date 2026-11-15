import { json, fail, readJson, now, sha256 } from "./http.js";
import { addMonths } from "./rentals.js";
import { jerseyToday } from "./viewings.js";
import { fieldErrors, asObject } from "./routes/rentals.js";

// ADM-10 (its switch, ADM10_STATEMENTS_READY, with migration 0090): a statement is closed as a frozen revision, marked
// sent and paid to the landlord by hand, and the Inbox asks for last month's (server/notification-reconcile.js). Off,
// the statement reads as before. Nothing is emailed: sending stays with AUT-17.
export const statementsReady = env => env?.ADM10_STATEMENTS_READY === "1";
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const CHANGED = "The figures changed meanwhile. Reload to see them";

// R15, R26, R29: a landlord's statement for a Jersey calendar month (dates are already Jersey days), per full-service
// property: rent payments received in the month, the fee on them (fee_percent, to the penny), repairs done in the month
// and charged to the landlord, and deposits or other money apart (no fee, not in the net). GST on the fees only when
// gst_percent > 0. With ADM-10, rent written off in the month (ADM-09, net of reversals) shows apart too: it was never
// received, so it takes no fee and stays out of the net. All in pence.
export async function buildStatement(env, id, month) {
  const from = `${month}-01`, to = addMonths(from, 1), q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
  const received = kind => `COALESCE((SELECT SUM(p.amount) FROM payments p JOIN tenancies t ON t.id = p.tenancy_id
    WHERE t.rental_id = r.id AND p.kind ${kind} AND p.received_on >= ?2 AND p.received_on < ?3), 0)`;
  const writtenOff = statementsReady(env) ? `, COALESCE((SELECT SUM(CASE x.kind WHEN 'writeoff' THEN x.amount_pence
    ELSE -x.amount_pence END) FROM charge_adjustments x JOIN charges c ON c.id = x.charge_id JOIN tenancies t ON t.id = c.tenancy_id
    WHERE t.rental_id = r.id AND x.effective_on >= ?2 AND x.effective_on < ?3), 0) AS written_off` : "";
  const [[landlord], [setting], lines, repairs] = (await env.DB.batch([
    q("SELECT id, name, email, phone, archived_at FROM landlords WHERE id = ?", id),
    q("SELECT value FROM app_settings WHERE key = 'gst_percent'"),
    q(`SELECT r.id, r.address, r.fee_percent, r.archived_at, ${received("= 'rent'")} AS rent_received,
      ${received("<> 'rent'")} AS other_received${writtenOff} FROM rentals r WHERE r.landlord_id = ?1 AND r.service = 'full'
      ORDER BY r.address COLLATE NOCASE, r.id`, id, from, to),
    q(`SELECT p.id, p.rental_id, p.title, p.contractor, p.done_on, 100 * p.cost AS cost FROM repairs p
      JOIN rentals r ON r.id = p.rental_id WHERE r.landlord_id = ?1 AND r.service = 'full' AND p.status = 'done'
      AND p.charge_landlord = 1 AND p.done_on >= ?2 AND p.done_on < ?3 ORDER BY p.done_on, p.id`, id, from, to),
  ])).map(r => r.results);
  if (!landlord) fail(404, "Landlord not found");
  // Rounding: each property's fee is rounded half-up to the penny (basis points); GST is rounded once, on the total fee.
  const bp = pct => Math.round(pct * 100), gst_percent = setting ? JSON.parse(setting.value) : 0;
  const rentals = lines.map(({ id: rid, address, fee_percent, archived_at, rent_received, other_received, written_off }) => ({
    id: rid, address, fee_percent, archived_at, rent_received, fee: Math.round(rent_received * bp(fee_percent) / 10000),
    repairs: repairs.filter(x => x.rental_id === rid).map(({ rental_id, ...x }) => x), other_received,
    ...(written_off === undefined ? {} : { written_off }),
  })).filter(r => !r.archived_at || r.rent_received || r.other_received || r.repairs.length || r.written_off); // archived: only with money
  const sum = f => rentals.reduce((t, r) => t + f(r), 0);
  const rent = sum(r => r.rent_received), fee = sum(r => r.fee), cost = sum(r => r.repairs.reduce((t, x) => t + x.cost, 0));
  const gst = gst_percent > 0 ? Math.round(fee * bp(gst_percent) / 10000) : null;
  return { landlord, month, gst_percent, rentals, totals: { rent, fee, gst, repairs: cost, net: rent - fee - (gst ?? 0) - cost,
    ...(writtenOff ? { written_off: sum(r => r.written_off) } : {}) } };
}

// What a close keeps (and its digest covers): the statement with the landlord's id and name only, so their email, phone
// or archive date stay out of the kept document and correcting them needs no new revision.
const kept = s => JSON.stringify({ ...s, landlord: { id: s.landlord.id, name: s.landlord.name } });
const MAX_SNAPSHOT = 131072; // 0090's CHECK
const RUN = "id, landlord_id, month, revision, source_digest, net_pence, closed_at, closed_by, sent_on, sent_by, paid_on, paid_by";
// The statement and, with ADM-10, its digest (what a close must match), its revisions (newest first) and the latest
// closed one as it was closed, with the newest earlier revision already paid (paid_before), so a new one shows the
// difference still to pay and never the whole net again.
async function statement({ request, env }) {
  const p = new URL(request.url).searchParams, month = p.get("month") ?? "", id = Number(p.get("landlord"));
  const errors = {};
  if (!Number.isInteger(id) || id < 1) errors.landlord = "Choose a landlord";
  if (!MONTH.test(month)) errors.month = "Choose a month as YYYY-MM";
  if (Object.keys(errors).length) return fieldErrors(errors);
  const s = await buildStatement(env, id, month);
  if (!statementsReady(env)) return json(s);
  const { results: runs } = await env.DB.prepare(`SELECT ${RUN}, CASE WHEN revision = MAX(revision) OVER () THEN snapshot END AS snapshot
    FROM statement_runs WHERE landlord_id = ? AND month = ? ORDER BY revision DESC`).bind(id, month).all();
  const list = runs.map(({ snapshot, ...r }) => r), paid = list.slice(1).find(r => r.paid_on);
  return json({ ...s, digest: await sha256(kept(s)), runs: list, closed: runs.length ? { ...list[0],
    paid_before: paid ? { revision: paid.revision, paid_on: paid.paid_on, net_pence: paid.net_pence } : null,
    statement: JSON.parse(runs[0].snapshot) } : null });
}

// Close a month that has ended, as the page showed it: the digest it was given must be the current figures (409
// otherwise). The next revision is written only when it differs from the latest one, in the same statement.
async function close({ request, env, admin }) {
  const b = asObject(await readJson(request)), id = b.landlord, month = b.month;
  if (!Number.isInteger(id) || id < 1 || typeof month !== "string" || !MONTH.test(month) || typeof b.digest !== "string")
    fail(400, "Choose a landlord and a month");
  if (month >= jerseyToday().slice(0, 7)) return fieldErrors({ month: "Close a month once it has ended" });
  const s = await buildStatement(env, id, month), snapshot = kept(s), digest = await sha256(snapshot);
  if (digest !== b.digest) fail(409, CHANGED);
  if (snapshot.length > MAX_SNAPSHOT) fail(413, "This statement is too long to keep (over 128 KB). Shorten its addresses or repair titles");
  const meta = (await env.DB.prepare(`INSERT INTO statement_runs (landlord_id, month, revision, snapshot, source_digest,
      net_pence, closed_at, closed_by)
    SELECT ?1, ?2, COALESCE(MAX(revision), 0) + 1, ?3, ?4, ?5, ?6, ?7 FROM statement_runs WHERE landlord_id = ?1 AND month = ?2
    HAVING COALESCE((SELECT source_digest FROM statement_runs WHERE landlord_id = ?1 AND month = ?2
      ORDER BY revision DESC LIMIT 1), '') <> ?4`)
    .bind(id, month, snapshot, digest, s.totals.net, now(), admin).run()
    .catch(e => { if (/UNIQUE/.test(e?.message)) fail(409, CHANGED); throw e; })).meta;
  if (!meta.changes) fail(409, "This statement is already closed with these figures");
  return json({ run: await env.DB.prepare(`SELECT ${RUN} FROM statement_runs WHERE id = ?`).bind(meta.last_row_id).first() }, 201);
}

// Sent to or paid to the landlord, recorded by hand on the latest closed revision of its month (today, Jersey), once each:
// an older revision is superseded, so marking it could pay the landlord twice.
const LATEST = `revision = (SELECT MAX(x.revision) FROM statement_runs x WHERE x.landlord_id = statement_runs.landlord_id
  AND x.month = statement_runs.month)`;
const mark = what => async ({ env, admin, params: [id] }) => {
  const { meta } = await env.DB.prepare(`UPDATE statement_runs SET ${what}_on = ?, ${what}_by = ? WHERE id = ? AND ${what}_on IS NULL
    AND ${LATEST}`).bind(jerseyToday(), admin, Number(id)).run();
  const run = await env.DB.prepare(`SELECT ${RUN}, ${LATEST} AS latest FROM statement_runs WHERE id = ?`).bind(Number(id)).first();
  if (!run) fail(404, "Statement not found");
  if (!meta.changes) fail(409, run.latest ? `This statement is already marked ${what}` : "A newer revision of this statement exists. Reload to see it");
  delete run.latest;
  return json({ run });
};

export default [["GET", /^\/admin\/statements$/, statement, true]];
// Mounted by server/api.js only with ADM10_STATEMENTS_READY (migration 0090).
export const closingRoutes = [
  ["POST", /^\/admin\/statements$/, close, true],
  ["PUT", /^\/admin\/statement-runs\/(\d+)\/sent$/, mark("sent"), true],
  ["PUT", /^\/admin\/statement-runs\/(\d+)\/paid$/, mark("paid"), true],
];
