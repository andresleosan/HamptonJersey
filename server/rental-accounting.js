import { json, fail } from "./http.js";
import { jerseyToday, plusDays, realDate } from "./viewings.js";
import { fieldErrors } from "./routes/rentals.js";
import { arrearsReady, ensureCharges } from "./routes/rent.js";
import { statementsReady } from "./statements.js";
import { logEvent } from "./events.js";
import { encodeAccountingCsv, MAX_ROWS } from "./rental-accounting-csv.js";

// ADM-21: Hampton's rent money as CSV for its accounts, one file per type, for an inclusive range of Jersey days up to
// today (at most 366). Read-only over what the panel already holds: charges with ADM-09's write-offs and reversals,
// payments received, and ADM-10's closed statements as they were closed (the latest revision of each month). Each
// file is read in one D1 batch (one transaction), so it is a consistent cut; over 50,000 rows it is refused, never cut
// short. Columns, directions and references: docs/roadmap/work/ADM-21/columns.md.
const TYPES = { charges: "Charges and write-offs", payments: "Payments received", statements: "Closed landlord statements" };
const tenancyRef = "COALESCE(t.payment_ref, printf('HE-T%04d', t.id))";
const OVER = `This range has over ${MAX_ROWS.toLocaleString("en-GB")} rows. Choose a shorter range`;

// Tenant ledger: a charge is a debit, a write-off a credit (never cash received), its reversal a debit again.
const CHARGES = adjustments => `SELECT 'rent_charges' AS record_type, 'charge-' || c.id AS record_id, ${tenancyRef} AS tenancy_ref,
    c.due_on AS date, c.kind, c.amount AS amount_pence, 'debit' AS direction, NULL AS related_id,
    t.financial_revision AS revision, c.id AS n
  FROM charges c JOIN tenancies t ON t.id = c.tenancy_id WHERE c.due_on BETWEEN ?1 AND ?2${adjustments ? `
  UNION ALL SELECT 'rent_adjustments', 'adjustment-' || x.id, ${tenancyRef}, x.effective_on, x.kind, x.amount_pence,
    CASE x.kind WHEN 'writeoff' THEN 'credit' ELSE 'debit' END, 'charge-' || x.charge_id, t.financial_revision, x.id
  FROM charge_adjustments x JOIN charges c ON c.id = x.charge_id JOIN tenancies t ON t.id = c.tenancy_id
  WHERE x.effective_on BETWEEN ?1 AND ?2` : ""}
  ORDER BY date, record_type, n LIMIT ${MAX_ROWS + 1}`;
// Every payment received, matched or not; its bank description never leaves.
const PAYMENTS = `SELECT 'rent_payments' AS record_type, 'payment-' || p.id AS record_id,
    CASE WHEN t.id IS NULL THEN '' ELSE ${tenancyRef} END AS tenancy_ref, p.received_on AS date, p.kind,
    p.amount AS amount_pence, 'credit' AS direction, NULL AS related_id, COALESCE(t.financial_revision, 1) AS revision
  FROM payments p LEFT JOIN tenancies t ON t.id = p.tenancy_id WHERE p.received_on BETWEEN ?1 AND ?2
  ORDER BY p.received_on, p.id LIMIT ${MAX_ROWS + 1}`;
// The latest closed revision of each landlord's month that ends in the range: the one Statements shows.
const RUNS = `SELECT s.id, s.landlord_id, s.revision, s.snapshot, date(s.month || '-01', '+1 month', '-1 day') AS date
  FROM statement_runs s WHERE date(s.month || '-01', '+1 month', '-1 day') BETWEEN ?1 AND ?2
  AND s.revision = (SELECT MAX(x.revision) FROM statement_runs x WHERE x.landlord_id = s.landlord_id AND x.month = s.month)
  ORDER BY date, s.landlord_id LIMIT ${MAX_ROWS + 1}`;

const row = r => ({ schema_version: 1, record_type: r.record_type, record_id: r.record_id, tenancy_ref: r.tenancy_ref,
  date: r.date, kind: r.kind, currency: "GBP", amount_pence: r.amount_pence, direction: r.direction,
  related_id: r.related_id, revision: r.revision });

// Landlord ledger, from the closed snapshot only: rent, fee and repairs per property, GST once, then net (a control
// line: rent - fee - gst - repairs, not to be added to the others). Zero lines are left out, except net.
function statementLines({ id, landlord_id, revision, snapshot, date }) {
  const s = JSON.parse(snapshot), out = [], ref = `HE-L${String(landlord_id).padStart(4, "0")}`;
  const line = (kind, part, amount, direction, related = null) => out.push(row({ record_type: "landlord_statement_lines",
    record_id: `statement-${id}:${kind}${part == null ? "" : `:${part}`}`, tenancy_ref: ref, date, kind,
    amount_pence: Math.abs(amount), direction, related_id: related, revision }));
  for (const r of s.rentals) {
    if (r.rent_received) line("rent", r.id, r.rent_received, "credit", `rental-${r.id}`);
    if (r.fee) line("fee", r.id, r.fee, "debit", `rental-${r.id}`);
    for (const x of r.repairs) line("repair", x.id, x.cost, "debit", `rental-${r.id}`);
  }
  if (s.totals.gst) line("gst", null, s.totals.gst, "debit");
  line("net", null, s.totals.net, s.totals.net < 0 ? "debit" : "credit");
  return out;
}

export async function accountingRows(env, { type, from, to }) {
  const q = sql => env.DB.prepare(sql).bind(from, to);
  if (type === "payments") return (await q(PAYMENTS).all()).results.map(row);
  if (type === "statements") {
    const lines = (await q(RUNS).all()).results.flatMap(statementLines);
    return lines.length > MAX_ROWS ? fail(413, OVER) : lines;
  }
  // Charges are made as they fall due (as Rentals does); first, in the same batch, those still missing up to today.
  const [, { results }] = await env.DB.batch([ensureCharges(env, jerseyToday()), q(CHARGES(arrearsReady(env)))]);
  return results.map(row);
}

// GET only, signed-in team members (the same authority as Rentals, Statements and ADM-09's write-offs). A request a
// browser marks as cross-site is refused before any read. The answer is an attachment, never cached.
async function exportCsv({ request, env, admin }) {
  const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  if ((origin !== null && origin !== new URL(request.url).origin) ||
      (site !== null && site !== "same-origin" && site !== "none")) fail(403, "Cross-origin request blocked");
  const p = new URL(request.url).searchParams, type = p.get("type") ?? "", from = p.get("from") ?? "", to = p.get("to") ?? "";
  const today = jerseyToday(), errors = {};
  if (!Object.hasOwn(TYPES, type)) errors.type = "Choose what to export";
  else if (type === "statements" && !statementsReady(env)) errors.type = "Closing statements is not switched on yet";
  if (!realDate(from)) errors.from = "Enter a start date";
  if (!realDate(to)) errors.to = "Enter an end date";
  else if (to > today) errors.to = "Choose an end date up to today";
  else if (realDate(from) && from > to) errors.to = "Choose an end date on or after the start date";
  else if (realDate(from) && plusDays(from, 365) < to) errors.to = "Choose a range of up to 366 days";
  if (Object.keys(errors).length) return fieldErrors(errors);

  const rows = await accountingRows(env, { type, from, to });
  if (rows.length > MAX_ROWS) fail(413, OVER);
  let bytes;
  try { bytes = encodeAccountingCsv(rows); }
  catch (e) {
    if (e instanceof RangeError) fail(413, `This file would be over 16 MB. Choose a shorter range`);
    if (e instanceof TypeError) fail(422, "A figure in this range cannot be exported (an amount over £1,000,000 or a damaged record). Nothing was downloaded");
    throw e;
  }
  // Who exported what and how many rows; never the rows themselves.
  await env.DB.batch(logEvent(env, { actor: admin, entity_type: "admin", entity_id: "rental-accounting", type: "rental_accounting.exported",
    data: { type, from, to, rows: rows.length } }));
  return new Response(bytes, { headers: { "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="hampton-${type}-${from}-to-${to}.csv"`, "cache-control": "no-store",
    "x-content-type-options": "nosniff", "x-export-rows": String(rows.length) } });
}

export default [["GET", /^\/admin\/rental-accounting\/export$/, exportCsv, true]];
