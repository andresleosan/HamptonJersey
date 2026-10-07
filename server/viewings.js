export const TIMES = ["10:00", "11:30", "14:00", "15:30", "17:00"];
export const KINDS = ["In person", "Live video call"];
// No URL metacharacters: the address ends up in mailto: links in the admin inbox.
export const EMAIL = /^[^\s@?&%/\\<>"'#]+@[^\s@?&%/\\<>"'#]+\.[^\s@?&%/\\<>"'#]+$/;
// The office is in Jersey: "today" is the Jersey calendar day (BST/GMT), not UTC.
export const jerseyToday = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Jersey" }).format(d);
const text = (v, max) => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);
const realDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;

// today = "YYYY-MM-DD" (Jersey, see jerseyToday). Viewings: from tomorrow, within a year, Monday–Saturday.
export function validateViewing(b, today) {
  const src = b && typeof b === "object" ? b : {};
  const errors = {}, value = {};
  value.listing_id = src.listing_id || null;
  if (value.listing_id && !/^HE-[A-Z]\d{3,}$/.test(value.listing_id)) errors.listing_id = "Unknown property";
  value.name = text(src.name, 120);
  if (!value.name) errors.name = "Enter your name";
  const email = typeof src.email === "string" ? src.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL.test(email)) errors.email = "Enter a valid email address";
  value.email = email;
  value.phone = src.phone ? text(src.phone, 40) : null;
  if (src.phone && !value.phone) errors.phone = "Phone number is too long";
  value.agent = src.agent ? text(src.agent, 100) : null;
  value.kind = KINDS.includes(src.kind) ? src.kind : (errors.kind = "Choose a viewing type", null);
  value.time = TIMES.includes(src.time) ? src.time : (errors.time = "Choose a time", null);
  const maxDate = new Date(Date.parse(today + "T12:00:00Z") + 365 * 864e5).toISOString().slice(0, 10);
  if (!realDate(src.date) || src.date <= today || src.date > maxDate) errors.date = "Choose a date from tomorrow onwards";
  else if (new Date(src.date + "T12:00:00Z").getUTCDay() === 0) errors.date = "Viewings run Monday to Saturday";
  value.date = src.date;
  return Object.keys(errors).length ? { errors } : { value };
}
