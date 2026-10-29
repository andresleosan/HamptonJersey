export const KINDS = ["In person", "Live video call"];
// No URL metacharacters: the address ends up in mailto: links in the admin inbox.
export const EMAIL = /^[^\s@?&%/\\<>"'#]+@[^\s@?&%/\\<>"'#]+\.[^\s@?&%/\\<>"'#]+$/;

// C4, C11: the one place for the slot constants. A viewing lasts SLOT_MINUTES on a grid of the same step.
export const SLOT_MINUTES = 30, BUFFER_MINUTES = 15, PUBLIC_DAYS = 12, MAX_DAYS = 14;
export const ACTIVE = ["requested", "confirmed"];
export const OUTCOMES = ["proceed", "more_info", "not_interested"];
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
// C2: what 0010 seeds and what a new negotiator starts with.
export const DEFAULT_HOURS = { mon: ["10:00", "17:30"], tue: ["10:00", "17:30"], wed: ["10:00", "17:30"],
  thu: ["10:00", "17:30"], fri: ["10:00", "17:30"], sat: ["10:00", "13:00"], sun: null };

// The office is in Jersey: "today" and "now" are the Jersey calendar day and clock (BST/GMT), not UTC.
const JERSEY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Jersey", year: "numeric", month: "2-digit",
  day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function jerseyNow(d = new Date()) {
  const p = Object.fromEntries(JERSEY.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
export const jerseyToday = (d = new Date()) => jerseyNow(d).date;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const pad = n => String(n).padStart(2, "0");
// Floored at 00:00 so a margin before the first slot stays a valid HH:MM; past midnight it reads 24:MM, still the same width.
export function addMinutes(t, n) {
  const m = Math.max(0, Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + n);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
const text = (v, max) => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);
export const realDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && new Date(s + "T12:00:00Z").toJSON()?.slice(0, 10) === s; // toJSON is null for 2026-13-01, not a throw
export const plusDays = (date, n) => new Date(Date.parse(date + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const weekday = date => WEEKDAYS[(new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7];

// A phone as the interest rule compares it: its last 10 digits once spaces, dashes, dots and brackets are gone, so
// 07797 123456, 07797123456 and +44 (0)7797 123456 are one number, as normalizePhone (applicants.js) makes them.
// ponytail: two foreign numbers ending in the same 10 digits count once; store normalised phones if that ever matters.
const tel = col => `substr(${[" ", "-", ".", "(", ")"].reduce((s, c) => `replace(${s}, '${c}', '')`, col)}, -10)`;

// A person's key as the rule reads it on the listing of viewing `t` (a table or alias in scope): a phone's 10 digits
// that the listing's viewings give with one email only are that email; any other key is itself. A phone given with two
// emails (a couple on one mobile) stays a phone: the rule never guesses whose it is, and the team joins it (VIS-02).
const keyOf = (t, key) => `COALESCE((SELECT CASE COUNT(DISTINCT lower(o.email)) WHEN 1 THEN MIN(lower(o.email)) END
    FROM viewing_requests o WHERE o.listing_id = ${t}.listing_id AND o.email IS NOT NULL AND ${tel("o.phone")} = ${key}), ${key})`;
// Who viewing `t` is, as C10 tells people apart: its email; booked with a phone only, whoever gave that phone with an
// email on another viewing of the listing (if one person did), else that phone.
export const ownSql = t => `COALESCE(lower(${t}.email), ${keyOf(t, tel(`${t}.phone`))})`;
// Who viewing `t` counts as. VIS-02 (R14): one the team joined to another person ("Counted twice") counts as that
// person's key, read the same way, so the join holds after that person's own viewings stop counting or are deleted.
export const personSql = t => `CASE WHEN ${t}.interest_same_as IS NULL THEN ${ownSql(t)}
    ELSE ${keyOf(t, `${t}.interest_same_as`)} END`;
// The viewings that show interest: active from today on, or completed in the last 30 days and gone well.
// Binds: interestDates().
const SHOWS_INTEREST = `((status IN ('requested', 'confirmed') AND date >= ?)
    OR (status = 'completed' AND outcome IN ('proceed', 'more_info') AND date >= ?))`;

// C10, the panel's and the website's one rule: the people with a viewing of listing `id` (SQL: "?" or a column) that
// shows interest and that the team hasn't removed (VIS-02), each once. Counted when read, so it expires by itself; read
// through the (listing_id, date) index. In parentheses it is a column of another query. Binds: interestDates(), after
// any of `id`'s.
export const interestSql = id => `SELECT COUNT(DISTINCT ${personSql("viewing_requests")}) AS n FROM viewing_requests
  WHERE listing_id = ${id} AND interest_removed_at IS NULL AND ${SHOWS_INTEREST}`;
// VIS-02: the same viewings of listing "?", the removed ones too, latest first, each with who it counts as and who it
// is (the panel's card groups them). Binds: the id, then interestDates().
export const interestRowsSql = `SELECT id, name, email, phone, date, time, status, outcome, interest_removed_at,
    interest_reason, interest_note, interest_same_as, ${personSql("viewing_requests")} AS person,
    ${ownSql("viewing_requests")} AS own
  FROM viewing_requests WHERE listing_id = ? AND ${SHOWS_INTEREST} ORDER BY date DESC, time DESC, id DESC`;
export const interestDates = (today = jerseyToday()) => [today, plusDays(today, -30)];
// VIS-02 (R2): why the team takes someone out of the count. "Counted twice" joins instead (personSql).
export const INTEREST_REASONS = ["no_longer_interested", "not_buyer", "other"];
// Same-width HH:MM text compares like the clock: [a1, a2) and [b1, b2) overlap.
const overlaps = (a1, a2, b1, b2) => a1 < b2 && a2 > b1;

// Spec §4, in its order. hours: negotiators.hours parsed; exceptions: that date's rows; bookings: that negotiator's
// active viewings that day; now: jerseyNow(); fromTomorrow: the website books from tomorrow (C11).
// ponytail: one span per day (C2), so only the first open exception counts; the team adds one per date.
export function daySlots({ hours, exceptions, bookings, date, now, fromTomorrow }) {
  const open = exceptions.find(e => e.kind === "open");
  const span = open ? [open.start_time, open.end_time] : hours[weekday(date)];
  if (!span || date < now.date || (fromTomorrow && date === now.date)) return [];
  const blocks = exceptions.filter(e => e.kind === "block");
  const slots = [];
  for (let t = span[0]; addMinutes(t, SLOT_MINUTES) <= span[1]; t = addMinutes(t, SLOT_MINUTES)) {
    const end = addMinutes(t, SLOT_MINUTES);
    if (blocks.some(b => !b.start_time || overlaps(t, end, b.start_time, b.end_time))) continue;
    if (date === now.date && t <= now.time) continue;
    const from = addMinutes(t, -BUFFER_MINUTES), to = addMinutes(end, BUFFER_MINUTES);
    slots.push({ time: t, booked: bookings.some(b => overlaps(from, to, b.time, b.end_time)) });
  }
  return slots;
}

export const isFree = (slots, time) => slots.some(s => s.time === time && !s.booked);

const span = v => Array.isArray(v) && v.length === 2 && TIME.test(v[0]) && TIME.test(v[1]) && v[0] < v[1];

// A negotiator's week (C2): the seven days, each null (day off) or ["HH:MM","HH:MM"] with opening before closing.
export function validHours(h) {
  if (!h || typeof h !== "object" || Array.isArray(h)) return { hours: "Enter the hours for each day" };
  const errors = {};
  if (Object.keys(h).some(k => !WEEKDAYS.includes(k))) errors.hours = "Unknown day";
  for (const d of WEEKDAYS) if (h[d] !== null && !span(h[d])) errors[d] = "Choose a day off, or opening before closing";
  return Object.keys(errors).length ? errors : null;
}

// A date that differs from the week (C3): block (all day, or from–to) or open (from–to, replacing that day's hours).
export function validException(b) {
  const src = b && typeof b === "object" ? b : {};
  const errors = {}, value = {};
  value.date = realDate(src.date) ? src.date : (errors.date = "Choose a date", null);
  value.kind = ["block", "open"].includes(src.kind) ? src.kind : (errors.kind = "Choose block or open", null);
  value.start_time = src.start_time || null;
  value.end_time = src.end_time || null;
  if (value.start_time || value.end_time || value.kind === "open") {
    if (!TIME.test(value.start_time ?? "")) errors.start_time = "Enter a start time";
    else if (!span([value.start_time, value.end_time])) errors.end_time = "End after the start";
  }
  value.note = src.note ? text(src.note, 200) : null;
  if (src.note && !value.note) errors.note = "Note is too long";
  return Object.keys(errors).length ? { errors } : { value };
}

// today = "YYYY-MM-DD" (Jersey, see jerseyToday). Website: tomorrow to 60 days ahead, Monday to Saturday, email
// required. Panel: today to a year ahead, any day, email or phone. The slot itself is isFree's call.
export function validateViewing(b, { today, panel = false }) {
  const src = b && typeof b === "object" ? b : {};
  const errors = {}, value = {};
  value.listing_id = src.listing_id || null;
  if (value.listing_id && !/^HE-[A-Z]\d{3,}$/.test(value.listing_id)) errors.listing_id = "Unknown property";
  value.negotiator_id = /^[1-9]\d{0,8}$/.test(String(src.negotiator_id)) ? Number(src.negotiator_id)
    : (errors.negotiator_id = "Choose who will show you round", null);
  value.name = text(src.name, 120);
  if (!value.name) errors.name = "Enter your name";
  const email = typeof src.email === "string" ? src.email.trim().toLowerCase() : "";
  value.email = email || null;
  const phone = typeof src.phone === "string" ? src.phone.trim() : src.phone;
  value.phone = phone ? text(phone, 40) : null;
  if (phone && !value.phone) errors.phone = "Phone number is too long";
  if (email ? email.length > 254 || !EMAIL.test(email) : !panel) errors.email = "Enter a valid email address";
  else if (!email && !phone) errors.email = "Enter an email address or a phone number";
  value.kind = KINDS.includes(src.kind) ? src.kind : (errors.kind = "Choose a viewing type", null);
  value.time = TIME.test(src.time) ? src.time : (errors.time = "Choose a time", null);
  const [min, max] = panel ? [today, plusDays(today, 365)] : [plusDays(today, 1), plusDays(today, 60)];
  if (!realDate(src.date) || src.date < min || src.date > max)
    errors.date = panel ? "Choose a date from today, within a year" : "Choose a date from tomorrow, within 60 days";
  else if (!panel && weekday(src.date) === "sun") errors.date = "Viewings run Monday to Saturday";
  value.date = src.date;
  return Object.keys(errors).length ? { errors } : { value };
}
