// ANA-06: working time in Jersey, Monday to Friday 09:00-17:00 Europe/Jersey, without Jersey bank holidays.
// Bank holidays as https://www.gov.je/Leisure/Events/WhatsOn/Pages/BankHolidayDates.aspx lists them, checked on
// 15-nov-2026 (weekdays only; Liberation Day 2026 and 2027 falls at a weekend and has no substitute). A year that is
// not here is not assumed to have none: an interval that touches it is left out. Add each year once gov.je publishes it.
const HOLIDAYS = {
  2025: ["01-01", "04-18", "04-21", "05-05", "05-09", "05-26", "08-25", "12-25", "12-26"],
  2026: ["01-01", "04-03", "04-06", "05-04", "05-25", "08-31", "12-25", "12-28"],
  2027: ["01-01", "03-26", "03-29", "05-03", "05-31", "08-30", "12-27", "12-28"],
};
const DAY = 864e5, HOUR = 36e5;
// Jersey keeps UK time: BST from the last Sunday of March to the last Sunday of October. Clocks change on a Sunday,
// so a working day has one offset all day.
const lastSunday = (y, m) => { const d = Date.UTC(y, m, 0); return d - new Date(d).getUTCDay() * DAY; };
const offset = (y, day) => (day > lastSunday(y, 3) && day < lastSunday(y, 10) ? HOUR : 0);

// Seconds of working time between two ISO instants; null when either is not a date or the end comes first;
// "calendar" when a year in between has no verified bank holidays.
export function workingSeconds(start, end) {
  const a = Date.parse(start), b = Date.parse(end);
  if (!(a <= b)) return null;
  for (let y = new Date(a).getUTCFullYear(); y <= new Date(b).getUTCFullYear(); y++) if (!HOLIDAYS[y]) return "calendar";
  let ms = 0;
  for (let day = Math.floor(a / DAY) * DAY; day <= b; day += DAY) {
    const date = new Date(day), y = date.getUTCFullYear();
    if (!(date.getUTCDay() % 6) || HOLIDAYS[y].includes(date.toISOString().slice(5, 10))) continue;
    const open = day + 9 * HOUR - offset(y, day), close = open + 8 * HOUR;
    ms += Math.max(0, Math.min(b, close) - Math.max(a, open));
  }
  return ms / 1000;
}
