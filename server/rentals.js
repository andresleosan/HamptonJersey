// Managed rentals rules (F5-A), shared by the API and the panel (through Vite). Pure ESM: no database, no env.
import { realDate, jerseyToday } from "./viewings.js";
import { OPTIONS } from "./applicants.js";
import { fields, blank, obj, result } from "./sales.js";

// R10, R12, R13, R24, R30: the legal periods, to be checked by a Jersey lawyer. They live only here (§7.3: parameters,
// not code); the panel reads them from the API.
export const LEGAL = { depositDays: 30, reportDays: 7, licenceYears: 2, eicrYears: 5, gasYears: 1, alarmsYears: 1,
  warnDays: [60, 30, 7], renewalDays: 90, rentNoticeMonths: 2, rentIntervalMonths: 12, regime2025From: "2026-04-15",
  tenantNoticeMonths: 1, landlordNoticeMonths: 12 };
// R8: [days after the oldest unpaid charge fell due, arrears_steps.step, label].
export const ARREARS_STEPS = [[1, "reminder", "Friendly reminder"], [5, "firm", "Firm reminder"],
  [7, "call", "Call the tenant"], [10, "landlord", "Tell the landlord"], [14, "letter", "Formal letter"]];
// R10, R11: [compliance_items.kind, label, years a check lasts].
export const COMPLIANCE = [["licence", "Rental dwelling licence", LEGAL.licenceYears],
  ["eicr", "Electrical safety (EICR)", LEGAL.eicrYears], ["gas", "Gas safety", LEGAL.gasYears],
  ["alarms", "Smoke and CO alarms", LEGAL.alarmsYears]];

// R5, R9: the reference a tenant puts on the transfer, and how a bank description is searched for it.
export const paymentRef = id => `HE-T${String(id).padStart(4, "0")}`;
export const REF_RE = /HE\s*-?\s*T\s*(\d{4,})/i;

// Calendar months, capped at the end of the month: 31 Jan + 1 is 28 or 29 Feb.
export function addMonths(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + n, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);

// R27: the latest step already due, unless it is done (earlier ones need no marking). doneKeys: an array of steps.
export function nextStep(daysLate, doneKeys) {
  const due = ARREARS_STEPS.findLast(([days]) => days <= daysLate);
  return due && !doneKeys.includes(due[1]) ? due : null;
}

// R10, R11: no expiry is "missing" (counts as overdue); otherwise the tightest warning it falls in, or ok.
export function complianceStatus(item, today) {
  if (!item.expires_on) return "missing";
  if (item.expires_on < today) return "overdue";
  const warn = LEGAL.warnDays.findLast(n => daysBetween(today, item.expires_on) <= n);
  return warn ? `due${warn}` : "ok";
}

// R12, R30. rpi: {percent, as_of} or null. Only 2025-law tenancies get a cap and the 12-month rule.
export function rentAssistant(tenancy, rpi, today) {
  if (tenancy.regime !== "2025") return { applies: false, max_rent: null, earliest_on: null,
    notes: ["Rent changes follow the tenancy agreement (2011 law). Check with a lawyer"] };
  const after = addMonths(tenancy.last_rent_change_on ?? tenancy.start_on, LEGAL.rentIntervalMonths);
  const notice = addMonths(today, LEGAL.rentNoticeMonths);
  // In whole basis points, rounded down (a third decimal never lifts the cap), so whole pounds round down without
  // float drift. Rounding at 1e6 first keeps 1.15 at 115, not 114.999….
  const bp = rpi ? Math.floor(Math.round(rpi.percent * 1e6) / 1e4) : null;
  const max_rent = rpi ? Math.floor(tenancy.rent * (10000 + bp) / 10000) : null;
  return { applies: true, max_rent, earliest_on: after > notice ? after : notice, notes: [
    ...(rpi ? [] : ["Enter Jersey's RPI to work out the maximum rent."]),
    "The law allows a larger rise after improvements to the property or when the rent is well below the market. " +
      "Check with a lawyer."] };
}

// R13. notice: {given_on, by}. A fixed term ends on its end date; past it the tenancy runs on as periodic (R24).
export function earliestMoveOut(tenancy, notice) {
  if (tenancy.kind === "fixed" && tenancy.end_on > notice.given_on) return tenancy.end_on;
  return addMonths(notice.given_on, notice.by === "tenant" ? LEGAL.tenantNoticeMonths : LEGAL.landlordNoticeMonths);
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
export function validateTenancy(body, { partial = false } = {}) {
  const c = check(body, partial), { b, value, has } = c;
  if (has("tenant_name")) value.tenant_name = c.required("tenant_name", c.text("tenant_name", 120), "Enter the tenant's name");
  if (has("tenant_email")) value.tenant_email = c.email("tenant_email");
  if (has("tenant_phone")) value.tenant_phone = c.text("tenant_phone", 120);
  if (has("occupants")) value.occupants = c.text("occupants", 500);
  if (has("kind")) value.kind = c.required("kind", c.one("kind", KINDS, "Choose fixed term or periodic"),
    "Choose fixed term or periodic");
  if (has("regime")) value.regime = c.required("regime", c.one("regime", REGIMES, "Choose the 2011 or 2025 law"),
    "Choose the 2011 or 2025 law");
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
