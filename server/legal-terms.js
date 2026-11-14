// ADM-17: the rentals' legal periods and Hampton's JFSC/GST registrations as versioned settings (migration 0063),
// only with ADM17_LEGAL_TERMS_READY === '1'. Nothing saved means the code's periods (LEGAL), marked estimated: a
// period is "validated" only when someone records who validated it and when. The registrations start unknown, and
// unknown is not approval. Nothing here blocks an existing action; it says what is and is not confirmed.
// The switch goes in wrangler.toml and in jobs/wrangler.toml alike: the clock's Inbox pass works out the same deadlines.
import { json, fail, readJson, now } from "./http.js";
import { LEGAL, CALENDAR_LEGAL } from "./rentals.js";
import { jerseyToday, realDate } from "./viewings.js";

export const legalTermsReady = env => env?.ADM17_LEGAL_TERMS_READY === "1";
// ADM-11: the rest of the property calendar (CALENDAR in server/rentals.js). Like the switch above, it goes in
// wrangler.toml and in jobs/wrangler.toml alike.
export const calendarReady = env => env?.ADM11_CALENDAR_READY === "1";

// [LEGAL key, the most a form may save]. The limits catch typing slips; they are not legal values.
const PERIODS = [["depositDays", 365], ["reportDays", 365], ["licenceYears", 20], ["eicrYears", 20], ["gasYears", 20],
  ["alarmsYears", 20], ["tenantNoticeMonths", 60], ["landlordNoticeMonths", 60], ["rentNoticeMonths", 60],
  ["rentIntervalMonths", 60]];
// ADM-11: the calendar's own periods (§7.3), versioned with the rest only while its switch is on.
const CALENDAR_PERIODS = [["copyDays", 365], ["changeDays", 365], ["checklistYears", 20]];
const periodsOf = env => (calendarReady(env) ? [...PERIODS, ...CALENDAR_PERIODS] : PERIODS);
const codeOf = env => (calendarReady(env) ? { ...LEGAL, ...CALENDAR_LEGAL } : LEGAL);
const ANSWERS = ["yes", "no", "unknown"];
const defaults = (periods, code) => ({
  terms: { values: Object.fromEntries(periods.map(([k]) => [k, code[k]])), status: "estimated", validated_ref: null,
    validated_on: null },
  registration: { jfsc: "unknown", jfsc_ref: null, gst: "unknown", gst_ref: null },
});

const obj = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
// A reference: trimmed, up to 200 characters, or null.
function text(v, errors, key) {
  if (v == null || (typeof v === "string" && !v.trim())) return null;
  if (typeof v !== "string" || v.trim().length > 200) { errors[key] = "Use up to 200 characters"; return null; }
  return v.trim();
}
// revision: the one the form was loaded with (0: nothing saved yet). value is exactly what is stored.
const checked = (b, errors, value) => {
  if (!Number.isSafeInteger(b.revision) || b.revision < 0) errors.revision = "Reload the page and try again";
  return Object.keys(errors).length ? { errors } : { value, revision: b.revision };
};

export function validTerms(body, periods = PERIODS) {
  const b = obj(body), src = obj(b.values), errors = {}, values = {};
  for (const [k, max] of periods) {
    if (Number.isSafeInteger(src[k]) && src[k] >= 1 && src[k] <= max) values[k] = src[k];
    else errors[k] = `Enter a whole number from 1 to ${max}`;
  }
  if (!["estimated", "validated"].includes(b.status)) errors.status = "Choose estimated or validated";
  // An estimate carries no reference: only a validation says who and when.
  let validated_ref = null, validated_on = null;
  if (b.status === "validated") {
    validated_ref = text(b.validated_ref, errors, "validated_ref");
    if (!validated_ref) errors.validated_ref ??= "Enter who validated them and the reference of their advice";
    if (realDate(b.validated_on) && b.validated_on <= jerseyToday()) validated_on = b.validated_on;
    else errors.validated_on = "Enter the date of the validation, today or earlier";
  }
  return checked(b, errors, { values, status: b.status, validated_ref, validated_on });
}

export function validRegistration(body) {
  const b = obj(body), errors = {}, value = {};
  for (const k of ["jfsc", "gst"]) {
    value[k] = ANSWERS.includes(b[k]) ? b[k] : (errors[k] = "Choose yes, no or not confirmed", null);
    value[`${k}_ref`] = text(b[`${k}_ref`], errors, `${k}_ref`);
    if (value[k] === "yes" && !value[`${k}_ref`]) errors[`${k}_ref`] ??= "Enter the registration number or where it was confirmed";
  }
  return checked(b, errors, value);
}
const CHECK = { terms: validTerms, registration: validRegistration };

// {periods, terms, registration}. periods is what every date is worked out with: LEGAL (and, with ADM-11's switch, the
// calendar's own periods) with the saved values over it. Switch off: those and nothing else, without a read. A missing table (0063 not applied) or a stored value that no
// longer passes the checks reads as nothing saved.
export async function readLegal(env) {
  const code = codeOf(env);
  if (!legalTermsReady(env)) return { periods: code, terms: null, registration: null };
  let rows = [];
  try {
    rows = (await env.DB.prepare("SELECT key, value, revision, updated_at, updated_by FROM legal_settings").all()).results;
  } catch (e) { if (!/no such table/i.test(String(e?.message))) throw e; }
  const periods = periodsOf(env), DEFAULTS = defaults(periods, code);
  const of = key => {
    const row = rows.find(r => r.key === key), stored = row && obj(JSON.parse(row.value));
    // ADM-11: a set saved before a period existed keeps its values, takes the code's for the new ones and reads as
    // estimated: nobody validated what it never held.
    const short = key === "terms" && stored && periods.some(([k]) => !(k in obj(stored.values)));
    const ok = row && CHECK[key]({ ...stored, ...(short ? { values: { ...DEFAULTS.terms.values, ...obj(stored.values) },
      status: "estimated" } : {}), revision: row.revision }, periods).value;
    return { ...(ok || DEFAULTS[key]), revision: row?.revision ?? 0, updated_at: row?.updated_at ?? null,
      updated_by: row?.updated_by ?? null };
  };
  const terms = of("terms"), registration = of("registration");
  return { periods: { ...code, ...terms.values }, terms, registration };
}

// What a screen needs to label its dates and work them out; nothing while the switch is off.
export const legalLabel = ({ terms, registration }) => (terms ? { legal: { status: terms.status, periods: terms.values,
  jfsc: registration.jfsc, gst: registration.gst } } : {});

// A save made meanwhile by someone else is refused, never overwritten. Each save is a new version (the triggers of 0063).
async function save(env, admin, key, request) {
  const r = CHECK[key](await readJson(request, 4096), periodsOf(env));
  if (r.errors) return json({ error: "Please check the highlighted fields", fields: r.errors }, 400);
  const value = JSON.stringify(r.value), ts = now();
  let out;
  try {
    [out] = await env.DB.batch([r.revision === 0
      ? env.DB.prepare(`INSERT INTO legal_settings (key, value, revision, updated_at, updated_by)
          SELECT ?1, ?2, 1, ?3, ?4 WHERE NOT EXISTS (SELECT 1 FROM legal_settings WHERE key = ?1)`).bind(key, value, ts, admin)
      : env.DB.prepare(`UPDATE legal_settings SET value = ?2, revision = revision + 1, updated_at = ?3, updated_by = ?4
          WHERE key = ?1 AND revision = ?5`).bind(key, value, ts, admin, r.revision),
    // The nav's cached Rentals count (P16) was worked out with the periods before.
    env.DB.prepare("DELETE FROM app_settings WHERE key = 'rentals_count'")]);
  } catch (e) {
    if (/no such table/i.test(String(e?.message))) fail(503, "Legal terms can't be saved yet: their database update is pending.");
    throw e;
  }
  const { terms, registration } = await readLegal(env);
  return out.meta.changes ? json({ terms, registration })
    : json({ error: "Someone else saved changes here. Reload to see them (your changes were not saved).", terms, registration }, 409);
}

const get = async ({ env }) => {
  const { terms, registration } = await readLegal(env);
  return json({ terms, registration });
};

// Mounted by server/api.js only with the switch on.
export default [
  ["GET", /^\/admin\/legal-terms$/, get, true],
  ["PUT", /^\/admin\/legal-terms$/, ({ request, env, admin }) => save(env, admin, "terms", request), true],
  ["PUT", /^\/admin\/legal-terms\/registration$/, ({ request, env, admin }) => save(env, admin, "registration", request), true],
];
