import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv } from "./helpers.mjs";
import { daySlots, isFree, jerseyNow, jerseyToday, addMinutes, validateViewing, validHours, validException,
  DEFAULT_HOURS, WEEKDAYS } from "../../server/viewings.js";

const MON = "2026-10-26", SUN = "2026-11-01";
const NOW = { date: "2026-10-23", time: "09:00" };
const week = (over = {}) => ({ ...Object.fromEntries(WEEKDAYS.map(d => [d, null])), ...over });
const times = slots => slots.map(s => s.time);
const slots = (o = {}) => daySlots({ hours: week({ mon: ["10:00", "12:00"] }), exceptions: [], bookings: [], date: MON,
  now: NOW, fromTomorrow: true, ...o });

test("DEFAULT_HOURS is the week 0010 seeds", () => {
  const rows = makeEnv().DB.raw.prepare("SELECT id, name, hours FROM negotiators ORDER BY id").all();
  assert.deepEqual(rows.map(r => [r.id, r.name]), [[1, "Gilberto Franco"], [2, "Joshua Franco"]]);
  for (const r of rows) assert.equal(r.hours, JSON.stringify(DEFAULT_HOURS));
});

test("slots follow the weekly hours on a 30-minute grid", () => {
  assert.deepEqual(slots(), ["10:00", "10:30", "11:00", "11:30"].map(time => ({ time, booked: false })));
  // A 30-minute viewing must end inside the span: 10:00–11:45 offers nothing at 11:30.
  assert.deepEqual(times(slots({ hours: week({ mon: ["10:00", "11:45"] }) })), ["10:00", "10:30", "11:00"]);
  assert.deepEqual(slots({ date: SUN }), []);
  assert.deepEqual(times(slots({ hours: DEFAULT_HOURS, date: "2026-10-31" })),
    ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30"]);
});

test("an open exception replaces the day and a block removes its hours", () => {
  const open = { date: SUN, kind: "open", start_time: "14:00", end_time: "15:00" };
  assert.deepEqual(times(slots({ date: SUN, exceptions: [open] })), ["14:00", "14:30"]);
  assert.deepEqual(times(slots({ exceptions: [{ ...open, date: MON }] })), ["14:00", "14:30"]);
  const block = { date: MON, kind: "block", start_time: "10:30", end_time: "11:30" };
  assert.deepEqual(times(slots({ exceptions: [block] })), ["10:00", "11:30"]);
  assert.deepEqual(slots({ exceptions: [{ ...block, start_time: null, end_time: null }] }), []);
  // A block also applies to the hours an open exception gave that day.
  assert.deepEqual(times(slots({ date: SUN, exceptions: [open, { ...block, date: SUN, start_time: "14:00", end_time: "14:30" }] })),
    ["14:30"]);
});

test("a booking blocks its slot and its 15-minute margins", () => {
  const r = slots({ hours: week({ mon: ["09:00", "12:00"] }), bookings: [{ id: 1, time: "10:00", end_time: "10:30" }] });
  const booked = Object.fromEntries(r.map(s => [s.time, s.booked]));
  assert.deepEqual(booked, { "09:00": false, "09:30": true, "10:00": true, "10:30": true, "11:00": false, "11:30": false });
  assert.equal(isFree(r, "11:00"), true);
  assert.equal(isFree(r, "10:30"), false);
  assert.equal(isFree(r, "10:15"), false);   // not on the grid
  assert.equal(isFree(r, "13:00"), false);   // outside the hours
});

test("past times and, on the website, today are not offered", () => {
  const today = { date: MON, time: "10:30" };
  assert.deepEqual(slots({ now: today }), []);
  assert.deepEqual(times(slots({ now: today, fromTomorrow: false })), ["11:00", "11:30"]);
  assert.deepEqual(slots({ now: { date: "2026-10-27", time: "08:00" }, fromTomorrow: false }), []);
  assert.deepEqual(times(slots({ now: { date: MON, time: "09:59" }, fromTomorrow: false })), ["10:00", "10:30", "11:00", "11:30"]);
});

test("jerseyNow uses Jersey time across the clock change", () => {
  assert.deepEqual(jerseyNow(new Date("2026-10-24T23:30:00Z")), { date: "2026-10-25", time: "00:30" }); // BST
  assert.deepEqual(jerseyNow(new Date("2026-10-25T23:30:00Z")), { date: "2026-10-25", time: "23:30" }); // GMT
  assert.equal(jerseyToday(new Date("2026-10-24T23:30:00Z")), "2026-10-25");
  assert.deepEqual(jerseyNow(new Date("2026-10-25T00:05:00Z")), { date: "2026-10-25", time: "01:05" }); // the repeated hour
  assert.deepEqual(jerseyNow(new Date("2026-03-29T01:00:00Z")), { date: "2026-03-29", time: "02:00" }); // spring forward
});

test("addMinutes keeps the HH:MM width", () => {
  assert.equal(addMinutes("10:00", 30), "10:30");
  assert.equal(addMinutes("09:45", 15), "10:00");
  assert.equal(addMinutes("10:00", -15), "09:45");
  assert.equal(addMinutes("00:10", -15), "00:00");
});

test("validateViewing needs a negotiator and an HH:MM time, and email or phone in the panel", () => {
  const today = "2026-10-23";
  const body = (o = {}) => ({ listing_id: "HE-R001", negotiator_id: 2, kind: "In person", date: "2026-10-26", time: "11:30",
    name: " Jane ", email: "Jane@Example.je", phone: "", agent: "Somebody", ...o });
  const web = o => validateViewing(body(o), { today });
  const panel = o => validateViewing(body(o), { today, panel: true });

  const { value } = web();
  assert.deepEqual(value, { listing_id: "HE-R001", negotiator_id: 2, name: "Jane", email: "jane@example.je", phone: null,
    kind: "In person", time: "11:30", date: "2026-10-26" });
  assert.equal(web({ negotiator_id: "1" }).value.negotiator_id, 1);
  for (const bad of [undefined, null, 0, -1, 1.5, "x", "", true]) assert.ok(web({ negotiator_id: bad }).errors.negotiator_id, String(bad));
  // The grid is isFree's job: any HH:MM passes here.
  assert.equal(web({ time: "03:00" }).value.time, "03:00");
  for (const bad of ["3pm", "24:00", "10:60", "1000", "9:30", null]) assert.ok(web({ time: bad }).errors.time, String(bad));

  // Website: from tomorrow to 60 days ahead, Monday to Saturday, email required.
  assert.ok(web({ date: today }).errors.date);
  assert.ok(web({ date: "2026-10-24" }).value);
  assert.ok(web({ date: "2026-12-22" }).value);   // today + 60
  assert.ok(web({ date: "2026-12-23" }).errors.date);
  assert.match(web({ date: "2026-10-25" }).errors.date, /Monday to Saturday/);
  assert.ok(web({ date: "2026-02-30" }).errors.date);
  assert.ok(web({ email: "" }).errors.email);
  assert.ok(web({ email: "", phone: "07797 123456" }).errors.email);
  assert.ok(web({ phone: "x".repeat(41) }).errors.phone);

  // Panel: from today to a year ahead, any day the hours allow, email or phone.
  assert.ok(panel({ date: today }).value);
  assert.ok(panel({ date: "2026-10-25" }).value);
  assert.ok(panel({ date: "2027-10-23" }).value);
  assert.ok(panel({ date: "2027-10-24" }).errors.date);
  assert.ok(panel({ date: "2026-10-22" }).errors.date);
  const byPhone = panel({ email: "", phone: "07797 123456" }).value;
  assert.equal(byPhone.email, null);
  assert.equal(byPhone.phone, "07797 123456");
  assert.ok(panel({ email: "", phone: "" }).errors.email);
  assert.deepEqual(panel({ email: "", phone: "   " }).errors, { email: "Enter an email address or a phone number" });
  assert.ok(panel({ email: "nope", phone: "07797 123456" }).errors.email);
});

test("validHours wants the seven days, each a day off or an opening before its closing", () => {
  assert.equal(validHours(DEFAULT_HOURS), null);
  assert.equal(validHours(week()), null);
  assert.ok(validHours(null));
  assert.ok(validHours([]));
  assert.ok(validHours("x"));
  const { sun, ...six } = DEFAULT_HOURS;
  assert.ok(validHours(six).sun);
  assert.ok(validHours({ ...DEFAULT_HOURS, xyz: null }).hours);
  for (const bad of [["17:30", "10:00"], ["10:00", "10:00"], ["10:00"], ["10:00", "25:00"], "10:00-17:30", ["10:00", "17:30", "18:00"]])
    assert.ok(validHours({ ...DEFAULT_HOURS, mon: bad }).mon, JSON.stringify(bad));
});

test("validException: a block with or without hours, an open with hours", () => {
  assert.deepEqual(validException({ date: "2026-12-24", kind: "block" }).value,
    { date: "2026-12-24", kind: "block", start_time: null, end_time: null, note: null });
  assert.deepEqual(validException({ date: "2026-12-24", kind: "open", start_time: "14:00", end_time: "16:00", note: " Extra " }).value,
    { date: "2026-12-24", kind: "open", start_time: "14:00", end_time: "16:00", note: "Extra" });
  assert.ok(validException({ date: "2026-12-24", kind: "open" }).errors.start_time);
  assert.ok(validException({ date: "2026-12-24", kind: "block", start_time: "14:00" }).errors.end_time);
  assert.ok(validException({ date: "2026-12-24", kind: "block", start_time: "14:00", end_time: "13:00" }).errors.end_time);
  assert.ok(validException({ date: "2026-02-30", kind: "block" }).errors.date);
  assert.ok(validException({ date: "2026-12-24", kind: "holiday" }).errors.kind);
  assert.ok(validException({ date: "2026-12-24", kind: "block", note: "x".repeat(201) }).errors.note);
  assert.ok(validException(null).errors);
});
