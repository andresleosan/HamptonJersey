// VIS-13: the client's reminders 24 h and 2 h before a confirmed viewing linked to their search, through the approved
// queue (outbound) that Hermes's carrier sends verbatim, and their answer on AGE-12's private page. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, T0 } from "./helpers.mjs";
import { sha256 } from "../../server/http.js";
import { jerseyNow, addMinutes } from "../../server/viewings.js";
import { reminderPass, reminderSettlePass, reminderClaimSql, reminderEmail } from "../../server/viewing-reminders.js";
import { claimForHermes, settleForHermes } from "../../server/email.js";

const H = 3600e3, HOME = "HE-R001";
const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const outbound = env => rows(env, "SELECT * FROM outbound ORDER BY id");
const tasks = (env, id) => rows(env, `SELECT n.title, n.resolved_at FROM notifications n JOIN events e ON e.id = n.event_id
  WHERE e.entity_type = 'viewing' AND e.entity_id = ? AND n.category = 'task' ORDER BY n.id`, String(id));
const at = t => { const j = jerseyNow(new Date(t)); return { date: j.date, time: j.time }; };

function world({ on = true } = {}) {
  const env = makeEnv();
  Object.assign(env, { AGE12_PRESENTATIONS_READY: "1", AGE10_PHOTOS_READY: "1", SPR03_CAPTURE_READY: "1", EST16_AVAILABILITY_READY: "1",
    VIS17_MULTIPART_READY: "1", HERMES_MAIL_READY: "1" }, on && { VIS13_REMINDERS_READY: "1" });
  seedListing(env, { id: HOME, title: "Fixture Cottage", location: "St Helier", operation: "rent", availability: "to_let", rent: 1800 });
  run(env, `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('email', ?, ?, 'admin@example.test')`,
    JSON.stringify({ enabled: true, summary: false, recipients: [], revision: 1, approved_by: "admin@example.test", approved_at: T0 }), T0);
  return env;
}
let people = 0;
function client(env, email = `vis13-${++people}@example.test`) {
  const c = Number(run(env, "INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES ('Fixture Client', ?, ?, ?, ?)", email, T0, T0, T0).lastInsertRowid);
  return Number(run(env, `INSERT INTO applicants (contact_id, operation, stage, source, household_adults, household_children, household_total,
    created_at, updated_at) VALUES (?, 'rent', 'searching', 'phone', 2, 3, 5, ?, ?)`, c, T0, T0).lastInsertRowid);
}
// A confirmed viewing at a Jersey date and time, linked by a person to search `applicant` (VIS-17), last changed at `changed`.
function viewing(env, { date, time }, applicant, { changed = "2026-01-01T00:00:00.000Z", status = "confirmed", email = "booker@example.test" } = {}) {
  const id = Number(run(env, `INSERT INTO viewing_requests (listing_id, kind, date, time, end_time, name, email, status, created_at,
    updated_at, updated_by, negotiator_id, notes) VALUES (?, 'In person', ?, ?, ?, 'Fixture Viewer', ?, ?, ?, ?, 'admin@example.test', 1,
    'Key safe code 4321, tenant has a dog')`, HOME, date, time, addMinutes(time, 30), email, status, T0, changed).lastInsertRowid);
  if (applicant) run(env, `INSERT INTO viewing_proposals (viewing_id, revision, applicant_id, negotiator_id, date, time, end_time, from_status,
    from_date, from_time, required, state, created_at, created_by, closed_at, closed_by) VALUES (?, 1, ?, 1, ?, ?, ?, 'requested', ?, ?,
    '["client"]', 'confirmed', ?, 'admin@example.test', ?, 'admin@example.test')`, id, applicant, date, time, addMinutes(time, 30), date, time, T0, T0);
  return id;
}

test("24-hour reminders are real durations across both clock changes, one per viewing and time", async () => {
  // Autumn: BST ends 25-oct-2026. 10:00 GMT on the 25th is 24 h after 10:00 UTC (11:00 BST) on the 24th.
  // Spring: BST starts 29-mar-2026. 10:00 BST on the 29th (09:00 UTC) is 24 h after 09:00 UTC (09:00 GMT) on the 28th.
  for (const [slot, before, due] of [[{ date: "2026-10-25", time: "10:00" }, "2026-10-24T09:50:00Z", "2026-10-24T10:00:00Z"],
    [{ date: "2026-03-29", time: "10:00" }, "2026-03-28T08:50:00Z", "2026-03-28T09:00:00Z"]]) {
    const env = world(), id = viewing(env, slot, client(env));
    await reminderPass(env, Date.parse(before));
    assert.equal(outbound(env).length, 0, `not yet at ${before}`);
    await reminderPass(env, Date.parse(due));
    await reminderPass(env, Date.parse(due) + 10 * 60e3);
    const [o, ...more] = outbound(env);
    assert.equal(more.length, 0);
    assert.equal(o.template, "viewing_reminder_24h");
    assert.equal(o.entity_id, String(id));
    assert.equal(o.version, Number(slot.date.replaceAll("-", "") + slot.time.replace(":", "")));
    assert.equal(o.approved_by, "automation");
    for (const s of ["4321", "dog", "Fixture Viewer", "Fixture Client"]) assert.ok(!(o.subject + o.text).includes(s), s); // the queued text itself
    assert.match(o.recipient, /^vis13-\d+@example\.test$/); // the linked search's contact, not the booking's address
  }
});

test("booked or moved inside 24 hours, or first seen with both times passed, only the 2-hour reminder goes", async () => {
  const env = world(), start = Date.parse("2026-12-10T14:00:00Z"), slot = at(start);
  const late = viewing(env, slot, client(env), { changed: new Date(start - 20 * H).toISOString() });
  await reminderPass(env, start - 20 * H + 10 * 60e3);
  assert.equal(outbound(env).length, 0);
  await reminderPass(env, start - 2 * H);
  assert.deepEqual(outbound(env).map(o => o.template), ["viewing_reminder_2h"]);
  // A clock that missed the 24-hour time: only the 2-hour one, never both together.
  const env2 = world();
  viewing(env2, slot, client(env2));
  await reminderPass(env2, start - 2 * H + 60e3);
  assert.deepEqual(outbound(env2).map(o => o.template), ["viewing_reminder_2h"]);
  assert.ok(late);
});

test("editing notes keeps the 24-hour reminder, but moving the appointment inside the window skips it", async () => {
  const env = world(), start = Date.parse("2026-12-10T14:00:00Z");
  const oldBooking = new Date(start - 48 * H).toISOString();
  const recentEdit = new Date(start - 23 * H).toISOString();
  const kept = viewing(env, at(start), client(env), { changed: recentEdit });
  const moved = viewing(env, at(start), client(env), { changed: recentEdit });
  const reassigned = viewing(env, at(start), client(env), { changed: recentEdit });
  for (const id of [kept, moved, reassigned]) {
    run(env, `INSERT INTO events (at, actor, entity_type, entity_id, type)
      VALUES (?, 'team', 'viewing', ?, 'viewing.booked')`, oldBooking, String(id));
  }
  run(env, `INSERT INTO events (at, actor, entity_type, entity_id, type)
    VALUES (?, 'team', 'viewing', ?, 'viewing.rescheduled')`, recentEdit, String(moved));
  const slot = at(start);
  run(env, `INSERT INTO events (at, actor, entity_type, entity_id, type, data)
    VALUES (?, 'team', 'viewing', ?, 'viewing.rescheduled', ?)`, recentEdit, String(reassigned),
    JSON.stringify({ from: { ...slot, negotiator_id: 1 }, to: { ...slot, negotiator_id: 2 } }));
  await reminderPass(env, start - 22 * H);
  assert.deepEqual(outbound(env).map(o => [o.entity_id, o.template]),
    [kept, reassigned].map(id => [String(id), "viewing_reminder_24h"]));
});

test("inside 2 hours: one reminder at most; after the start: none", async () => {
  const env = world(), start = Date.parse("2026-12-10T14:00:00Z");
  viewing(env, at(start), client(env), { changed: new Date(start - H).toISOString() });
  for (const m of [50, 40, 30]) await reminderPass(env, start - m * 60e3);
  assert.deepEqual(outbound(env).map(o => o.template), ["viewing_reminder_2h"]);
  const env2 = world();
  viewing(env2, at(start), client(env2));
  await reminderPass(env2, start + 60e3);
  assert.equal(outbound(env2).length, 0);
});

test("a queued reminder whose viewing started, moved or was cancelled is never claimed and is cancelled by the next tick", async () => {
  const env = world(), soon = Date.now() + H; // real time: the carrier's claim reads the clock
  const id = viewing(env, at(soon), client(env));
  await reminderPass(env);
  assert.equal(outbound(env).length, 1);
  run(env, "UPDATE viewing_requests SET date = ?, time = ? WHERE id = ?", at(Date.now() - 60e3).date, at(Date.now() - 60e3).time, id); // started
  assert.equal(await claimForHermes(env, "0"), null);
  await reminderPass(env);
  assert.equal(outbound(env)[0].status, "cancelled");
  // Cancelled by the team while its reminder waits: the same.
  const other = viewing(env, at(Date.now() + 90 * 60e3), client(env));
  await reminderPass(env);
  run(env, "UPDATE viewing_requests SET status = 'cancelled' WHERE id = ?", other);
  assert.equal(await claimForHermes(env, "0"), null);
  await reminderPass(env);
  assert.deepEqual(outbound(env).map(o => o.status), ["cancelled", "cancelled"]);
});

test("a rescheduled viewing supersedes its old reminder and gets new ones; without a linked search nothing is queued", async () => {
  const env = world(), start = Date.parse("2026-12-10T14:00:00Z"), id = viewing(env, at(start), client(env));
  viewing(env, at(start + H), null); // a website booking nobody linked to a search
  await reminderPass(env, start - 23 * H);
  assert.equal(outbound(env).length, 1);
  const moved = start + 3 * H;
  run(env, "UPDATE viewing_requests SET date = ?, time = ?, updated_at = ? WHERE id = ?", at(moved).date, at(moved).time, T0, id);
  await reminderPass(env, moved - 23 * H);
  const [old, fresh] = outbound(env);
  assert.equal(old.status, "cancelled");
  assert.equal(fresh.status, "queued");
  assert.equal(fresh.version, Number(at(moved).date.replaceAll("-", "") + at(moved).time.replace(":", "")));
});

test("at 2 hours a viewing the client has not confirmed opens one task and stays confirmed; a client's Confirm prevents it", async () => {
  const env = world(), start = Date.parse("2026-12-10T14:00:00Z");
  const a = viewing(env, at(start), client(env)), b = viewing(env, at(start + H), client(env));
  run(env, `INSERT INTO events (at, actor, entity_type, entity_id, type, data) VALUES (?, 'client', 'viewing', ?, 'viewing.client_confirmed', ?)`,
    T0, String(b), JSON.stringify({ slot: Number(at(start + H).date.replaceAll("-", "") + at(start + H).time.replace(":", "")) }));
  for (const m of [120, 110, 30]) await reminderPass(env, start - m * 60e3);
  assert.equal(tasks(env, a).length, 1);
  assert.match(tasks(env, a)[0].title, /not confirmed by the client/);
  assert.equal(tasks(env, b).length, 0);
  assert.deepEqual(rows(env, "SELECT status FROM viewing_requests ORDER BY id").map(r => r.status), ["confirmed", "confirmed"]);
});

test("paused, nothing is claimed and the reminder waits; switched off, nothing is queued, claimed or answered", async () => {
  const env = world(), id = viewing(env, at(Date.now() + H), client(env));
  await reminderPass(env);
  run(env, `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('outbound', '{"paused":1}', ?, 'admin@example.test')`, T0);
  assert.equal(await claimForHermes(env, "0"), null);
  await reminderPass(env);
  assert.equal(outbound(env)[0].status, "queued");
  run(env, "DELETE FROM app_settings WHERE key = 'outbound'");
  const off = { ...env, VIS13_REMINDERS_READY: "0" };
  assert.equal(await reminderClaimSql(off), "0");
  assert.equal(await claimForHermes(off, "0"), null);
  const env2 = world({ on: false });
  viewing(env2, at(Date.now() + H), client(env2));
  await reminderPass(env2);
  assert.equal(outbound(env2).length, 0);
  // The client's routes, with a session in force: 404 off, answered on.
  const { cookie } = await session(env, rows(env, "SELECT applicant_id FROM viewing_proposals WHERE viewing_id = ?", id)[0].applicant_id);
  const slot = rows(env, "SELECT date, time FROM viewing_requests WHERE id = ?", id)[0];
  assert.equal((await as(off, cookie, "GET", "/presentation/viewings")).status, 404);
  assert.equal((await as(off, cookie, "POST", `/presentation/viewings/${id}/confirm`, slot)).status, 404);
  assert.equal(rows(env, "SELECT COUNT(*) n FROM events WHERE type = 'viewing.client_confirmed'")[0].n, 0);
  assert.equal((await as(env, cookie, "GET", "/presentation/viewings")).status, 200);
  assert.equal((await as(env, cookie, "POST", `/presentation/viewings/${id}/confirm`, slot)).status, 200);
});

test("accepted by Gmail: the viewing is reminded by automation by email, its thread is kept, and nothing is sent again", async () => {
  const env = world(), id = viewing(env, at(Date.now() + 3 * H), client(env));
  await reminderPass(env);
  const c = await claimForHermes(env, "0");
  assert.match(c.subject, /^Viewing reminder: Fixture Cottage/);
  assert.equal(rows(env, "SELECT reminded_at FROM viewing_requests WHERE id = ?", id)[0].reminded_at, null); // not on queue or claim
  assert.equal(await settleForHermes(env, c.ref, c.token, "sent", "msg1", "thread1"), "ok");
  await reminderSettlePass(env);
  await reminderSettlePass(env);
  const v = rows(env, "SELECT reminded_at, reminded_by, reminded_channel FROM viewing_requests WHERE id = ?", id)[0];
  assert.equal(v.reminded_by, "automation");
  assert.equal(v.reminded_channel, "email");
  assert.ok(v.reminded_at);
  assert.equal(rows(env, "SELECT COUNT(*) n FROM events WHERE type = 'viewing.reminded'")[0].n, 1);
  assert.equal(outbound(env)[0].gmail_thread_id, "thread1");
  await reminderPass(env);
  assert.equal(outbound(env).length, 1);
  assert.equal(await claimForHermes(env, "0"), null);
});

test("an unknown result waits for a person, is never sent again and does not mark the viewing reminded", async () => {
  const env = world(), id = viewing(env, at(Date.now() + 3 * H), client(env));
  await reminderPass(env);
  const c = await claimForHermes(env, "0");
  assert.equal(await settleForHermes(env, c.ref, c.token, "unknown", null, null), "ok");
  await reminderSettlePass(env);
  await reminderPass(env);
  assert.deepEqual(outbound(env).map(o => [o.status, o.reviewed_at]), [["unknown", null]]); // Settings › Email: pending review
  assert.equal(await claimForHermes(env, "0"), null);
  assert.equal(rows(env, "SELECT reminded_at FROM viewing_requests WHERE id = ?", id)[0].reminded_at, null);
});

test("the email holds the property, place, date and time only: no household, notes, keys or names", () => {
  const { subject, text } = reminderEmail({ title: "Fixture Cottage", listing_id: HOME, location: "St Helier", date: "2026-12-10",
    time: "14:00", kind: "In person", name: "Fixture Viewer", notes: "Key safe code 4321", household_total: 5 });
  for (const s of ["Fixture Cottage", HOME, "St Helier", "Thursday, 10 December 2026", "14:00", "reply to this email"]) assert.ok(text.includes(s), s);
  for (const s of ["4321", "Key", "dog", "Fixture Viewer", "5 ", "http"]) assert.ok(!(subject + text).includes(s), s);
});

// The client's page (AGE-12 session).
async function session(env, applicant, { sent = true } = {}) {
  const token = "t".repeat(42) + String(++people % 10);
  const g = Number(run(env, `INSERT INTO presentation_grants (applicant_id, token_hash, created_at, created_by, sent_at, sent_by)
    VALUES (?, ?, ?, 'admin@example.test', ?, 'admin@example.test')`, applicant, await sha256(token), T0, sent ? T0 : null).lastInsertRowid);
  const r = await call(env, "POST", "/presentation/session", { body: { token } });
  assert.equal(r.status, 200, r.text);
  return { grant: g, cookie: r.headers.get("set-cookie").split(";")[0] };
}
const as = (env, cookie, method, path, body) => call(env, method, path, { body, cookie });

test("GET lists the client's own viewings and changes nothing; answers are POST only, for their own viewing", async () => {
  const env = world(), me = client(env), other = client(env), slot = at(Date.now() + 5 * H);
  const mine = viewing(env, slot, me), theirs = viewing(env, slot, other);
  const { cookie } = await session(env, me);
  const before = rows(env, "SELECT COUNT(*) n FROM events")[0].n;
  const r = await as(env, cookie, "GET", "/presentation/viewings");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.viewings.map(v => [v.id, v.title, v.location, v.confirmed]), [[mine, "Fixture Cottage", "St Helier", false]]);
  assert.ok(!JSON.stringify(r.data).includes("4321"));
  assert.equal((await as(env, cookie, "GET", `/presentation/viewings/${mine}/confirm`)).status, 404); // a prefetch
  assert.equal(rows(env, "SELECT COUNT(*) n FROM events")[0].n, before);
  // Another client's viewing, as if they knew its id (one with an open request notice and a cancel in its history):
  // refused, nothing written, its notices left open.
  const ev = Number(run(env, `INSERT INTO events (at, actor, entity_type, entity_id, type) VALUES (?, 'admin@example.test', 'viewing', ?,
    'viewing.cancelled')`, T0, String(theirs)).lastInsertRowid);
  run(env, "INSERT INTO notifications (event_id, category, title, action_required, created_at) VALUES (?, 'viewing', 'Viewing request', 1, ?)", ev, T0);
  const events = rows(env, "SELECT COUNT(*) n FROM events")[0].n;
  for (const action of ["cancel", "confirm", "reschedule"])
    assert.equal((await as(env, cookie, "POST", `/presentation/viewings/${theirs}/${action}`, slot)).status, 404);
  assert.equal(rows(env, "SELECT status FROM viewing_requests WHERE id = ?", theirs)[0].status, "confirmed");
  assert.equal(rows(env, "SELECT resolved_at FROM notifications WHERE event_id = ?", ev)[0].resolved_at, null);
  assert.equal(rows(env, "SELECT COUNT(*) n FROM events")[0].n, events);
  // A cross-site POST is refused before any route.
  assert.equal((await call(env, "POST", `/presentation/viewings/${mine}/confirm`, { body: slot, cookie, origin: "https://evil.test" })).status, 403);
});

test("Confirm records the client's word for this time once and closes the 2-hour task; a stale time answers 409", async () => {
  const env = world(), me = client(env), start = Date.now() + H, slot = at(start), id = viewing(env, slot, me);
  await reminderPass(env);
  assert.equal(tasks(env, id).length, 1);
  const { cookie } = await session(env, me);
  assert.equal((await as(env, cookie, "POST", `/presentation/viewings/${id}/confirm`, { date: slot.date, time: "00:00" })).status, 409);
  const r = await as(env, cookie, "POST", `/presentation/viewings/${id}/confirm`, slot);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.viewings[0].confirmed, true);
  assert.equal((await as(env, cookie, "POST", `/presentation/viewings/${id}/confirm`, slot)).status, 200);
  assert.equal(rows(env, "SELECT COUNT(*) n FROM events WHERE type = 'viewing.client_confirmed'")[0].n, 1);
  assert.ok(tasks(env, id)[0].resolved_at);
  assert.equal(rows(env, "SELECT status FROM viewing_requests WHERE id = ?", id)[0].status, "confirmed");
});

test("another time is a request for the team, and the viewing stays as it is", async () => {
  const env = world(), me = client(env), slot = at(Date.now() + 30 * H), id = viewing(env, slot, me);
  const { cookie } = await session(env, me);
  assert.equal((await as(env, cookie, "POST", `/presentation/viewings/${id}/reschedule`, slot)).status, 200);
  assert.equal((await as(env, cookie, "POST", `/presentation/viewings/${id}/reschedule`, slot)).status, 200);
  assert.deepEqual(tasks(env, id).map(t => t.title), ["Client asks for another viewing time: Fixture Viewer"]);
  assert.deepEqual(rows(env, "SELECT status, date, time FROM viewing_requests WHERE id = ?", id)[0], { status: "confirmed", ...slot });
});

test("Cancel ends only the client's own place in an open viewing; a revoked link can do nothing", async () => {
  const env = world(), me = client(env), other = client(env), slot = at(Date.now() + 30 * H);
  const mine = viewing(env, slot, me), theirs = viewing(env, slot, other);
  const g = Number(run(env, `INSERT INTO viewing_groups (listing_id, negotiator_id, date, time, end_time, capacity, created_at, created_by)
    VALUES (?, 1, ?, ?, ?, 4, ?, 'admin@example.test')`, HOME, slot.date, slot.time, addMinutes(slot.time, 30), T0).lastInsertRowid);
  for (const v of [mine, theirs]) run(env, "INSERT INTO viewing_group_places (viewing_id, group_id, created_at, created_by) VALUES (?, ?, ?, 'admin@example.test')", v, g, T0);
  const { cookie } = await session(env, me);
  const notice = viewingId => run(env, "INSERT INTO notifications (event_id, category, title, action_required, created_at) VALUES (?, 'viewing', 'Viewing request', 1, ?)",
    Number(run(env, "INSERT INTO events (at, actor, entity_type, entity_id, type) VALUES (?, 'site', 'viewing', ?, 'viewing.requested')", T0, String(viewingId)).lastInsertRowid), T0);
  notice(mine); notice(theirs);
  const r = await as(env, cookie, "POST", `/presentation/viewings/${mine}/cancel`, slot);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.data.viewings, []);
  // The cancelled viewing's request notice is done; the other place's stays open.
  assert.deepEqual(rows(env, `SELECT e.entity_id, n.resolved_at IS NOT NULL AS done FROM notifications n JOIN events e ON e.id = n.event_id
    WHERE n.title = 'Viewing request' ORDER BY e.entity_id`).map(x => [Number(x.entity_id), x.done]), [[mine, 1], [theirs, 0]]);
  assert.deepEqual(rows(env, "SELECT id, status FROM viewing_requests ORDER BY id").map(v => v.status), ["cancelled", "confirmed"]);
  assert.equal(rows(env, "SELECT status FROM viewing_groups WHERE id = ?", g)[0].status, "open");
  assert.equal(rows(env, "SELECT updated_by FROM viewing_requests WHERE id = ?", mine)[0].updated_by, "client");
  assert.deepEqual(tasks(env, mine).map(t => t.title), ["Client cancelled the viewing: Fixture Viewer"]);
  // Revoked after the session started: every later read and answer is refused.
  const other2 = client(env), v2 = viewing(env, slot, other2), s2 = await session(env, other2);
  run(env, "UPDATE presentation_grants SET revoked_at = ?, revoked_by = 'admin@example.test' WHERE id = ?", T0, s2.grant);
  assert.equal((await as(env, s2.cookie, "GET", "/presentation/viewings")).status, 404);
  assert.equal((await as(env, s2.cookie, "POST", `/presentation/viewings/${v2}/cancel`, slot)).status, 404);
  assert.equal(rows(env, "SELECT status FROM viewing_requests WHERE id = ?", v2)[0].status, "confirmed");
});

// Review 25-nov: the newest proposal decides, as the panel reads it. A later "Not linked" proposal (or a search deleted, whose
// proposals lose their applicant) unlinks the viewing: no reminder to the search an older proposal named, and its private
// link can no longer see or answer the viewing.
test("a newer proposal that is not linked unlinks the viewing: no reminder and no answer from the search an older one named", async () => {
  const env = world(), start = Date.parse("2026-12-10T14:00:00Z"), wrong = client(env), id = viewing(env, at(start), wrong);
  run(env, `INSERT INTO viewing_proposals (viewing_id, revision, applicant_id, negotiator_id, date, time, end_time, from_status, from_date,
    from_time, required, state, created_at, created_by, closed_at, closed_by) SELECT viewing_id, 2, NULL, negotiator_id, date, time, end_time,
    from_status, from_date, from_time, required, state, created_at, created_by, closed_at, closed_by FROM viewing_proposals WHERE viewing_id = ?`, id);
  await reminderPass(env, start - 2 * H);
  assert.equal(outbound(env).length, 0);
  const soon = viewing(env, at(Date.now() + 5 * H), wrong);
  run(env, `INSERT INTO viewing_proposals (viewing_id, revision, applicant_id, negotiator_id, date, time, end_time, from_status, from_date,
    from_time, required, state, created_at, created_by, closed_at, closed_by) SELECT viewing_id, 2, NULL, negotiator_id, date, time, end_time,
    from_status, from_date, from_time, required, state, created_at, created_by, closed_at, closed_by FROM viewing_proposals WHERE viewing_id = ?`, soon);
  const { cookie } = await session(env, wrong);
  assert.deepEqual((await as(env, cookie, "GET", "/presentation/viewings")).data.viewings, []);
  assert.equal((await as(env, cookie, "POST", `/presentation/viewings/${soon}/cancel`, at(Date.now() + 5 * H))).status, 404);
});
