// Managed rentals rules (F5-A), shared by the API and the panel (through Vite). Pure ESM: no database, no env.
import { realDate, jerseyToday } from "./viewings.js";
import { OPTIONS } from "./applicants.js";
import { fields, blank, obj, result } from "./sales.js";

// R10, R12, R13, R24, R30: the legal periods, to be checked by a Jersey lawyer. These are the values used while none
// is saved; ADM-17 (server/legal-terms.js) puts the saved ones over them and passes the result as `legal`.
export const LEGAL = { depositDays: 30, reportDays: 7, licenceYears: 2, eicrYears: 5, gasYears: 1, alarmsYears: 1,
  warnDays: [60, 30, 7], renewalDays: 90, rentNoticeMonths: 2, rentIntervalMonths: 12, regime2025From: "2026-04-15",
  initialTermYears: 3, tenantNoticeMonths: 1, landlordNoticeMonths: 12 };
// R8: [days after the oldest unpaid charge fell due, arrears_steps.step, label].
export const ARREARS_STEPS = [[1, "reminder", "Friendly reminder"], [5, "firm", "Firm reminder"],
  [7, "call", "Call the tenant"], [10, "landlord", "Tell the landlord"], [14, "letter", "Formal letter"]];
// R10, R11: [compliance_items.kind, label, years a check lasts while none is saved (in force: legal[`${kind}Years`])].
export const COMPLIANCE = [["licence", "Rental dwelling licence", LEGAL.licenceYears],
  ["eicr", "Electrical safety (EICR)", LEGAL.eicrYears], ["gas", "Gas safety", LEGAL.gasYears],
  ["alarms", "Smoke and CO alarms", LEGAL.alarmsYears]];
// ADM-11 (architecture §7.3), with ADM11_CALENDAR_READY: the rest of the property's calendar, in the same rows, and
// its own periods, which join the legal periods in force (and ADM-17's saved ones) only with that switch.
// §7.3 sets no period for the hazards, so whoever records that check enters the date of its next review.
export const CALENDAR_LEGAL = { copyDays: 28, changeDays: 28, checklistYears: 1 };
export const CALENDAR = [["hazards", "Hazards check (29 prescribed hazards)"],
  ["checklist", "Electrical checklist"], ["licence_copy", "Licence copy to the tenant"],
  ["eicr_copy", "EICR copy to the tenant"], ["licence_change", "Licence changes notified"],
  ["deposit_info", "Prescribed information with the deposit"]];
// A one-off check: due that many days (its period in `legal`) after what starts it, and once done nothing more falls
// due until it starts again. Those of TENANT count only while a tenancy runs.
export const ONE_OFF = { licence_copy: "copyDays", eicr_copy: "copyDays", licence_change: "changeDays", deposit_info: "depositDays" };
export const TENANT = ["licence_copy", "eicr_copy", "deposit_info"];

// R5, R9: the reference a tenant puts on the transfer, and how a bank description is searched for it.
export const paymentRef = id => `HE-T${String(id).padStart(4, "0")}`;
// \b: "THE T 2024" is not a reference.
export const REF_RE = /\bHE\s*-?\s*T\s*(\d{4,})/i;

// Calendar months, capped at the end of the month: 31 Jan + 1 is 28 or 29 Feb.
export function addMonths(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + n, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}

// A date-only prompt for staff review, never a determination that a law applies.
// Invalid or unrepresentable dates remain for the normal form validator.
export function initialTermBeyondThreeYears(start, end, years = LEGAL.initialTermYears) {
  if (!realDate(start) || !realDate(end)) return false;
  const year = Number(start.slice(0, 4));
  if (year < 100 || year > 9996) return false;
  return end > addMonths(start, 12 * years);
}

// ADM-20 (with ADM20_TENANCY_LAW_READY and migration 0073): the 2025 rules. policy: {status, regime2025From,
// initialTermYears}, the legal parameters in force and whether a lawyer validated them (server/legal-terms.js).
export const SCOPES = ["yes", "no", "unknown"];
// The rules an agreement falls under, from the date it was made; never from the start date or the recorded label.
export const regimeOf = (agreement_on, policy) => (!realDate(agreement_on) ? "unknown"
  : agreement_on >= policy.regime2025From ? "2025" : "2011");
// Whether the 2025 rules cover a tenancy: yes only for a 2025 agreement over accommodation recorded as in scope, no
// for an earlier agreement or accommodation recorded as out of scope. Anything else is unknown, which is neither.
export function lawApplies(tenancy, policy) {
  const regime = regimeOf(tenancy.agreement_on, policy);
  return regime === "2011" || tenancy.law_scope === "no" ? "no" : regime === "2025" && tenancy.law_scope === "yes" ? "yes" : "unknown";
}
const LAW_RULES = {
  long_term: p => `the initial fixed term may run up to ${p.initialTermYears} years, and this one runs longer.`,
  second_term: () => "a tenancy has one initial fixed term and then runs on as periodic: this would be a further fixed term.",
  premium: () => "a tenant must not be asked for a premium or key money: confirm this sum is neither.",
};
// One initial fixed term of up to initialTermYears and no premium or key money, for a save that sets the term (create,
// update, renew; before: the tenancy as stored) or raises what is owed beyond the rent series (the opening balance, or
// charge: {before, after} in pence). An issue blocks only when the tenancy is covered and the rules are validated; a
// further term entered through an edit is a correction of the record, so it is confirmed, never blocked. Every other
// issue needs its code in `confirmed`: the employee's express confirmation.
export function validateTenancyOperation({ operation, tenancy, before = null, charge = null, policy, confirmed = [] }) {
  const applies = lawApplies(tenancy, policy);
  if (applies === "no") return { allowed: true, applies, issues: [] };
  const found = [], term = operation !== "charge" && tenancy.kind === "fixed"
    && (!before || before.kind !== "fixed" || before.end_on !== tenancy.end_on);
  if (term && initialTermBeyondThreeYears(tenancy.start_on, tenancy.end_on, policy.initialTermYears)) found.push(["long_term", "end_on", true]);
  if (term && before && (before.kind !== "fixed" || tenancy.end_on > before.end_on)) found.push(["second_term", "end_on", operation === "renew"]);
  if (charge ? charge.after > charge.before : (tenancy.opening_balance ?? 0) > (before?.opening_balance ?? 0))
    found.push(["premium", charge ? "amount" : "opening_balance", false]);
  const strict = applies === "yes" && policy.status === "validated";
  const issues = found.map(([code, field, canBlock]) => ({ code, field, blocks: strict && canBlock,
    message: `${applies === "yes" ? "Under the 2025 rules " : "It is not recorded whether the 2025 rules apply to this tenancy. If they do, "}${
      LAW_RULES[code](policy)}${policy.status === "validated" ? "" : " This rule is not yet validated by a lawyer."}` }));
  return { allowed: issues.every(i => !i.blocks && confirmed.includes(i.code)), applies, issues };
}
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);

// R27: the latest step already due, unless it is done (earlier ones need no marking). doneKeys: an array of steps.
export function nextStep(daysLate, doneKeys) {
  const due = ARREARS_STEPS.findLast(([days]) => days <= daysLate);
  return due && !doneKeys.includes(due[1]) ? due : null;
}

// R10, R11: no expiry is "missing" (counts as overdue), unless it is done (ADM-11: a one-off with nothing more due);
// otherwise the tightest warning it falls in, or ok.
export function complianceStatus(item, today) {
  if (!item.expires_on) return item.done_on ? "ok" : "missing";
  if (item.expires_on < today) return "overdue";
  const warn = LEGAL.warnDays.findLast(n => daysBetween(today, item.expires_on) <= n);
  return warn ? `due${warn}` : "ok";
}

// R12, R30. rpi: {percent, as_of} or null. The legacy label selects an estimate, not a verified legal determination.
export function rentAssistant(tenancy, rpi, today, legal = LEGAL) {
  if (tenancy.regime !== "2025") return { applies: false, max_rent: null, earliest_on: null,
    notes: ["The recorded 2011 label does not confirm which law applies. Check the agreement and applicable rules with a Jersey lawyer."] };
  const after = addMonths(tenancy.last_rent_change_on ?? tenancy.start_on, legal.rentIntervalMonths);
  const notice = addMonths(today, legal.rentNoticeMonths);
  // In whole basis points, rounded down (a third decimal never lifts the cap), so whole pounds round down without
  // float drift. Rounding at 1e6 first keeps 1.15 at 115, not 114.999….
  const bp = rpi ? Math.floor(Math.round(rpi.percent * 1e6) / 1e4) : null;
  const max_rent = rpi ? Math.floor(tenancy.rent * (10000 + bp) / 10000) : null;
  return { applies: true, max_rent, earliest_on: after > notice ? after : notice, notes: [
    "This estimate uses the recorded 2025 label; it does not confirm which rules apply. Check with a Jersey lawyer.",
    ...(rpi ? [] : ["Enter Jersey's RPI to work out the estimate."]),
    "Exceptions may apply after improvements or when rent is below the market. Check with a Jersey lawyer."] };
}

// R13. notice: {given_on, by}. A fixed term ends on its end date; past it the tenancy runs on as periodic (R24).
export function earliestMoveOut(tenancy, notice, legal = LEGAL) {
  if (tenancy.kind === "fixed" && tenancy.end_on > notice.given_on) return tenancy.end_on;
  return addMonths(notice.given_on, notice.by === "tenant" ? legal.tenantNoticeMonths : legal.landlordNoticeMonths);
}

const PARISHES = OPTIONS.parishes.map(([p]) => p);
const MAX_POUNDS = 1000000, MAX_PENCE = 100 * MAX_POUNDS; // R20
const SERVICES = ["full", "let_only"], KINDS = ["fixed", "periodic"], REGIMES = ["2011", "2025"];
const URGENCIES = ["emergency", "urgent", "routine"], PAYMENT_KINDS = ["rent", "deposit", "other"];
const REPAIR_STATUSES = ["reported", "awaiting_approval", "approved", "in_progress", "done", "cancelled"];
// R14: where a repair may go next; done and cancelled are final. Going back to awaiting_approval asks again (a larger quote).
export const REPAIR_NEXT = { reported: ["awaiting_approval", "approved", "in_progress", "done", "cancelled"],
  awaiting_approval: ["approved", "cancelled"], approved: ["awaiting_approval", "in_progress", "done", "cancelled"],
  in_progress: ["awaiting_approval", "done", "cancelled"], done: [], cancelled: [] };

// The sales field checkers plus what rentals need. has(k): every key on create, only the keys sent on an edit.
function check(body, partial) {
  const b = obj(body), errors = {}, f = fields(b, errors);
  const num = v => (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : v);
  const required = (k, v, msg) => (v ?? (blank(b[k]) ? f.err(k, msg) : null));
  return { b, errors, value: {}, has: k => !partial || k in b, ...f, required,
    int: (k, min, max, msg) => {
      if (blank(b[k])) return null;
      const n = num(b[k]);
      return Number.isInteger(n) && n >= min && n <= max ? n : f.err(k, msg);
    },
    one: (k, list, msg) => (blank(b[k]) ? null : list.includes(b[k]) ? b[k] : f.err(k, msg)),
    yesNo: (k, msg) => (blank(b[k]) ? null : typeof b[k] === "boolean" ? Number(b[k]) : f.err(k, msg)),
    pounds: k => f.money(k, false, MAX_POUNDS),
    pence: (k, min) => {
      if (blank(b[k])) return null;
      const n = num(b[k]);
      return Number.isInteger(n) && n >= min && n <= MAX_PENCE ? n
        : f.err(k, `Enter an amount in pence from ${min} to ${MAX_PENCE}`);
    },
  };
}

export function validateLandlord(body, { partial = false } = {}) {
  const c = check(body, partial), { value, has } = c;
  if (has("name")) value.name = c.required("name", c.text("name", 120), "Enter a name");
  if (has("email")) value.email = c.email("email");
  if (has("phone")) value.phone = c.text("phone", 120);
  if (has("approval_limit")) value.approval_limit = c.pounds("approval_limit");
  if (has("notes")) value.notes = c.text("notes", 2000);
  return result(value, c.errors);
}

// fee_percent: 0–100 with two decimals, needed for full service (R15, R20). has_gas: true, false or null (not sure).
export function validateRental(body, { partial = false } = {}) {
  const c = check(body, partial), { b, value, has } = c;
  if (has("landlord_id")) value.landlord_id = c.required("landlord_id", c.int("landlord_id", 1, Number.MAX_SAFE_INTEGER,
    "Choose a landlord"), "Choose a landlord");
  if (has("address")) value.address = c.required("address", c.text("address", 200), "Enter the address");
  if (has("parish")) value.parish = c.required("parish", c.one("parish", PARISHES, "Choose a parish"), "Choose a parish");
  if (has("service")) value.service = c.required("service", c.one("service", SERVICES,
    "Choose full management or let only"), "Choose full management or let only");
  if (has("fee_percent")) {
    const n = typeof b.fee_percent === "string" && b.fee_percent.trim() ? Number(b.fee_percent) : b.fee_percent;
    value.fee_percent = blank(b.fee_percent) ? null
      : typeof n === "number" && n >= 0 && n <= 100 && Math.abs(Math.round(n * 100) - n * 100) < 1e-6 ? n
        : c.err("fee_percent", "Enter a fee from 0 to 100%, with up to two decimals");
    if (value.service === "full" && value.fee_percent === null) c.err("fee_percent", "Enter the management fee");
  }
  if (has("has_gas")) value.has_gas = c.yesNo("has_gas", "Choose yes, no or not sure");
  if (has("notes")) value.notes = c.text("notes", 2000);
  return result(value, c.errors);
}

const TENANCY_DATES = ["deposit_received_on", "deposit_protected_on", "inventory_in_on", "inventory_out_on",
  "last_rent_change_on", "collect_from"];

// R4, R20, R22, R23: rent and deposit in whole pounds, opening_balance in pence; due_day defaults to the start day,
// capped at 28. Notice and the end have their own actions.
// law (ADM-20): truthy with its switch on and its columns in place; only then are agreement_on and law_scope read.
export function validateTenancy(body, { partial = false, law = null } = {}) {
  const c = check(body, partial), { b, value, has } = c;
  if (has("tenant_name")) value.tenant_name = c.required("tenant_name", c.text("tenant_name", 120), "Enter the tenant's name");
  if (has("tenant_email")) value.tenant_email = c.email("tenant_email");
  if (has("tenant_phone")) value.tenant_phone = c.text("tenant_phone", 120);
  if (has("occupants")) value.occupants = c.text("occupants", 500);
  if (has("kind")) value.kind = c.required("kind", c.one("kind", KINDS, "Choose fixed term or periodic"),
    "Choose fixed term or periodic");
  if (has("regime")) value.regime = c.required("regime", c.one("regime", REGIMES, "Choose the 2011 or 2025 law"),
    "Choose the 2011 or 2025 law");
  if (law && has("agreement_on")) value.agreement_on = c.date("agreement_on");
  if (law && has("law_scope")) value.law_scope = !partial && blank(b.law_scope) ? "unknown"
    : c.required("law_scope", c.one("law_scope", SCOPES, "Choose yes, no or not known"), "Choose yes, no or not known");
  if (has("start_on")) value.start_on = c.required("start_on", c.date("start_on"), "Enter the start date");
  if (has("end_on")) value.end_on = c.date("end_on");
  if (has("rent")) value.rent = c.money("rent", true, MAX_POUNDS);
  if (has("due_day")) value.due_day = !partial && blank(b.due_day) && value.start_on
    ? Math.min(Number(value.start_on.slice(8)), 28)
    : c.required("due_day", c.int("due_day", 1, 28, "Choose a day from 1 to 28"), "Choose a day from 1 to 28");
  if (has("deposit")) value.deposit = c.pounds("deposit");
  if (has("deposit_ref")) value.deposit_ref = c.text("deposit_ref", 120);
  for (const k of TENANCY_DATES) if (has(k)) value[k] = c.date(k);
  if (has("opening_balance")) value.opening_balance = c.pence("opening_balance", 0);
  if (has("notes")) value.notes = c.text("notes", 2000);
  const { start_on, end_on } = value;
  if (value.kind === "fixed" && "end_on" in value && !end_on) c.err("end_on", "Enter the end date of the fixed term");
  if (start_on && end_on && end_on <= start_on) c.err("end_on", "The end date must be after the start date");
  if (start_on && value.collect_from && value.collect_from < start_on)
    c.err("collect_from", "Collect from the start date or later");
  return result(value, c.errors);
}

// R14: quote and cost in whole pounds; done_on not after today (Jersey). The routes own the status transitions.
export function validateRepair(body, { partial = false, today = jerseyToday() } = {}) {
  const c = check(body, partial), { b, value, has } = c;
  if (has("title")) value.title = c.required("title", c.text("title", 120), "Enter a title");
  if (has("detail")) value.detail = c.text("detail", 2000);
  if (has("urgency")) value.urgency = c.required("urgency", c.one("urgency", URGENCIES,
    "Choose emergency, urgent or routine"), "Choose emergency, urgent or routine");
  if ("status" in b) value.status = c.required("status", c.one("status", REPAIR_STATUSES, "Choose a valid status"),
    "Choose a valid status");
  if (has("contractor")) value.contractor = c.text("contractor", 120);
  for (const k of ["quote", "cost"]) if (has(k)) value[k] = c.pounds(k);
  if (has("done_on")) value.done_on = c.date("done_on");
  if (value.done_on > today) c.err("done_on", "Use today or an earlier date");
  if (has("charge_landlord")) value.charge_landlord = !partial && b.charge_landlord === undefined ? 1
    : typeof b.charge_landlord === "boolean" ? Number(b.charge_landlord) : c.err("charge_landlord", "Choose yes or no");
  return result(value, c.errors);
}

// R7, R26: amount in pence; received_on not after today (Jersey); kind defaults to rent.
export function validatePayment(body, { partial = false, today = jerseyToday() } = {}) {
  const c = check(body, partial), { b, value, has } = c;
  if (has("tenancy_id")) value.tenancy_id = c.required("tenancy_id", c.int("tenancy_id", 1, Number.MAX_SAFE_INTEGER,
    "Choose a tenancy"), "Choose a tenancy");
  if (has("received_on")) value.received_on = c.required("received_on", c.date("received_on"), "Enter the date received");
  if (value.received_on > today) c.err("received_on", "Use today or an earlier date");
  if (has("amount")) value.amount = c.required("amount", c.pence("amount", 1), "Enter an amount");
  if (has("kind")) value.kind = !partial && blank(b.kind) ? "rent"
    : c.required("kind", c.one("kind", PAYMENT_KINDS, "Choose rent, deposit or other"), "Choose rent, deposit or other");
  if (has("description")) value.description = c.text("description", 300);
  return result(value, c.errors);
}

// R9: a bank cell to pence: "£1,234.56", "1234.5", "-50". Anything else (or a third decimal) is null.
export function parseMoney(text) {
  const s = String(text ?? "").replace(/[£\s]/g, "");
  if (!/^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s.replace(/,/g, "")) * 100);
}

// R9: a bank row's identity: date, pence and the description trimmed with inner whitespace collapsed. With n (its
// occurrence among the file's rows of the same key, from 1) it is what the import hashes.
export const cleanDescription = d => String(d ?? "").trim().replace(/\s+/g, " ");
export const importKey = r => `${r.date}|${r.amount}|${cleanDescription(r.description)}`;
// R9: each row with n set, counted over the whole file (so a file sent in chunks keeps its numbers).
export function occurrences(rows) {
  const seen = new Map();
  return rows.map(r => {
    const k = importKey(r), n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return { ...r, n };
  });
}

// R9: DMY is DD/MM/YYYY (one-digit day or month allowed), ISO is YYYY-MM-DD; null unless a real date.
export function parseBankDate(text, format) {
  const s = String(text ?? "").trim(), m = format === "DMY" && s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : format === "ISO" ? s : null;
  return realDate(iso) ? iso : null;
}

// R9: the bank's CSV as text. UTF-8 (TextDecoder drops a BOM), else Windows-1252, which older Windows exports use for "£".
export function decodeCsv(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}

// R9: RFC 4180 rows without dependencies: a quote opens only at the start of a cell (5" PIPE is text), "" inside quotes is a
// quote, commas and line breaks inside quotes stay in the cell, CRLF or LF ends a row, blank lines are dropped. A quote left
// open at the end throws, so a broken file imports nothing.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      rows.push([...row, cell]); row = []; cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error(`The file has an unclosed quote near row ${rows.length + 1}. Nothing was imported.`);
  rows.push([...row, cell]);
  return rows.filter(r => r.some(c => c.trim()));
}
