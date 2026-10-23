export const KINDS = ["In person", "Live video call"];
// No URL metacharacters: the address ends up in mailto: links in the admin inbox.
export const EMAIL = /^[^\s@?&%/\\<>"'#]+@[^\s@?&%/\\<>"'#]+\.[^\s@?&%/\\<>"'#]+$/;

// C4, C11: the one place for the slot constants. A viewing lasts SLOT_MINUTES on a grid of the same step.
export const SLOT_MINUTES = 30, BUFFER_MINUTES = 15, PUBLIC_DAYS = 12, MAX_DAYS = 14;
export const STATUSES = ["requested", "confirmed", "completed", "no_show", "cancelled"];
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
  && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
export const plusDays = (date, n) => new Date(Date.parse(date + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const weekday = date => WEEKDAYS[(new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7];
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
  value.phone = src.phone ? text(src.phone, 40) : null;
  if (src.phone && !value.phone) errors.phone = "Phone number is too long";
  if (email ? email.length > 254 || !EMAIL.test(email) : !panel) errors.email = "Enter a valid email address";
  else if (!email && !src.phone) errors.email = "Enter an email address or a phone number";
  value.kind = KINDS.includes(src.kind) ? src.kind : (errors.kind = "Choose a viewing type", null);
  value.time = TIME.test(src.time) ? src.time : (errors.time = "Choose a time", null);
  const [min, max] = panel ? [today, plusDays(today, 365)] : [plusDays(today, 1), plusDays(today, 60)];
  if (!realDate(src.date) || src.date < min || src.date > max)
    errors.date = panel ? "Choose a date from today, within a year" : "Choose a date from tomorrow, within 60 days";
  else if (!panel && weekday(src.date) === "sun") errors.date = "Viewings run Monday to Saturday";
  value.date = src.date;
  return Object.keys(errors).length ? { errors } : { value };
}
