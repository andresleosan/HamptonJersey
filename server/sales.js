// Offer and sale rules (F3-C), shared by the API and the panel (through Vite). Pure ESM: no database, no env.
import { EMAIL, realDate, jerseyToday } from "./viewings.js";

// V8: the steps of every sale, in order; sale_milestones.key holds these keys.
export const MILESTONES = [["lawyers", "Lawyers instructed"], ["due_diligence", "Housing status and due diligence checked"],
  ["questionnaire", "Seller's questionnaire received"], ["searches", "Searches (title, planning) back"],
  ["mortgage", "Valuation and mortgage offer"], ["contract", "Contract agreed"], ["funds", "Funds with buyer's lawyer"],
  ["passing", "Passing contract (Royal Court)"], ["settled", "Seller paid and Stamp Duty settled"]];
// A share transfer does not pass before the Royal Court and pays LTT instead of Stamp Duty.
const SHARE_TRANSFER = { passing: "Completion", settled: "Seller paid and LTT settled" };
export const milestoneLabel = (key, route) =>
  (route === "share_transfer" && SHARE_TRANSFER[key]) || MILESTONES.find(([k]) => k === key)?.[1];

// V9: an open offer untouched for longer than this is "Waiting".
export const OFFER_WAITING_MS = 2 * 24 * 3600 * 1000;

const MAX_AMOUNT = 100000000; // V12: whole pounds
export const blank = v => v === undefined || v === null || (typeof v === "string" && !v.trim());

// Field checkers over body b, collecting messages in errors; a blank value is null. Shared with server/rentals.js.
export function fields(b, errors) {
  const err = (k, msg) => { errors[k] ??= msg; return null; };
  const text = (k, max) => blank(b[k]) ? null : typeof b[k] !== "string" ? err(k, "Enter text")
    : b[k].trim().length <= max ? b[k].trim() : err(k, `Use ${max} characters or fewer`);
  return {
    err, text,
    money: (k, required, max = MAX_AMOUNT) => {
      if (blank(b[k])) return required ? err(k, "Enter an amount") : null;
      const n = typeof b[k] === "string" && /^\s*\d+\s*$/.test(b[k]) ? Number(b[k]) : b[k];
      return Number.isInteger(n) && n > 0 && n <= max ? n
        : err(k, `Enter whole pounds from £1 to £${max.toLocaleString("en-GB")}`);
    },
    email: k => {
      const e = text(k, 120);
      return e === null || EMAIL.test(e) ? e : err(k, "Enter a valid email address");
    },
    date: k => blank(b[k]) ? null : realDate(b[k]) ? b[k] : err(k, "Enter a date as YYYY-MM-DD"),
  };
}
export const obj = body => (body && typeof body === "object" && !Array.isArray(body) ? body : {});
export const result = (value, errors) => (Object.keys(errors).length ? { errors } : { value });

// V12. partial (edit): only the keys sent; otherwise amount is required and conditions defaults to null.
export function validateOffer(body, { partial = false } = {}) {
  const b = obj(body), errors = {}, value = {}, f = fields(b, errors);
  if (!partial || "amount" in b) value.amount = f.money("amount", true);
  if (!partial || "conditions" in b) value.conditions = f.text("conditions", 1000);
  return result(value, errors);
}

const SALE_TEXT = ["seller_name", "seller_phone", "buyer_lawyer_firm", "buyer_lawyer_name", "buyer_lawyer_phone",
  "seller_lawyer_firm", "seller_lawyer_name", "seller_lawyer_phone", "shared_agency"];
const SALE_EMAIL = ["seller_email", "buyer_lawyer_email", "seller_lawyer_email"];
const ROUTES = ["freehold", "share_transfer"];

// The editable fields of a sale (V7, V3). Absent keys are left alone, so the route merges value into the stored row.
export function validateSale(body) {
  const b = obj(body), errors = {}, value = {}, f = fields(b, errors);
  const has = k => k in b;
  for (const k of SALE_TEXT) if (has(k)) value[k] = f.text(k, 120);
  for (const k of SALE_EMAIL) if (has(k)) value[k] = f.email(k);
  if (has("price")) value.price = f.money("price", true);
  for (const k of ["fee", "shared_fee"]) if (has(k)) value[k] = f.money(k);
  if (has("route")) value.route = blank(b.route) ? null : ROUTES.includes(b.route) ? b.route
    : f.err("route", "Choose freehold or share transfer");
  if (has("target_date")) value.target_date = f.date("target_date");
  if (has("notes")) value.notes = f.text("notes", 2000);
  if (value.shared_fee && has("fee") && !errors.fee && !(value.fee && value.shared_fee <= value.fee))
    f.err("shared_fee", "The other agency's share cannot be more than the fee");
  return result(value, errors);
}

// One milestone (V8). Absent keys are left alone; done and "Not needed" cannot both be set; done is not after today
// (Jersey, YYYY-MM-DD).
export function validateMilestone(body, today = jerseyToday()) {
  const b = obj(body), errors = {}, value = {}, f = fields(b, errors);
  for (const k of ["planned_on", "done_on"]) if (k in b) value[k] = f.date(k);
  if ("not_needed" in b) value.not_needed = typeof b.not_needed === "boolean" ? Number(b.not_needed)
    : f.err("not_needed", "Choose yes or no");
  if ("note" in b) value.note = f.text("note", 300);
  if (value.done_on > today) f.err("done_on", "Use today or an earlier date");
  if (value.done_on && value.not_needed) f.err("not_needed", "A step that is done cannot be marked not needed");
  return result(value, errors);
}

// V9: planned before today (Jersey, YYYY-MM-DD), not done and needed. The caller checks the sale is in progress.
export const isOverdue = (m, today) => !!m.planned_on && m.planned_on < today && !m.done_on && !m.not_needed;
export const nextMilestone = milestones => milestones.find(m => !m.done_on && !m.not_needed) ?? null;
