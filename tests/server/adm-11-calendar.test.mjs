import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { LEGAL, COMPLIANCE, CALENDAR, CALENDAR_LEGAL, addMonths, complianceStatus } from "../../server/rentals.js";
import { notificationsPass } from "../../server/notification-reconcile.js";
import { readFileSync } from "node:fs";

// ADM-11: the rest of §7.3's calendar behind ADM11_CALENDAR_READY, in the same compliance_items rows as the four
// checks: the 29 hazards, the electrical checklist, the licence and EICR copies to the tenant, licence changes and the
// prescribed information that goes with the deposit. Synthetic data only.
const ADMIN = "admin@example.test";
const on = (extra = {}) => ({ ...makeEnv(), ADM11_CALENDAR_READY: "1", ...extra });
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie(ADMIN) });
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const T = jerseyToday(), ago = n => plusDays(T, -n), ahead = n => plusDays(T, n);
const FOUR = COMPLIANCE.map(([k]) => k), NEW = ["hazards", "checklist", "licence_copy", "eicr_copy", "licence_change", "deposit_info"];

async function rental(env, over = {}) {
  const l = await req(env, "POST", "/admin/landlords", { name: "Anne Owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "1 Rue des Pres",
    parish: "St Helier", service: "let_only", ...over });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.rental.id;
}
async function tenancy(env, id, over = {}) {
  const t = await req(env, "POST", `/admin/rentals/${id}/tenancies`, { tenant_name: "Tom Tenant", kind: "periodic",
    regime: "2025", rent: 1500, start_on: ago(10), ...over });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  return t.data.tenancy.id;
}
const page = async (env, id) => (await req(env, "GET", `/admin/rentals/${id}`)).data.compliance;
const check = async (env, id, kind) => (await page(env, id)).find(c => c.kind === kind);
const put = (env, id, kind, body) => req(env, "PUT", `/admin/rentals/${id}/compliance/${kind}`, body);
const todo = async env => (await req(env, "GET", "/admin/rentals")).data.todo.compliance;
const allDone = async (env, id, kinds = FOUR) => { for (const k of kinds) assert.equal((await put(env, id, k, { done_on: T })).status, 200, k); };

test("the calendar's kinds are §7.3's, and a check done with nothing further due is in date", () => {
  assert.deepEqual(CALENDAR.map(([k]) => k), NEW);
  assert.deepEqual(CALENDAR_LEGAL, { copyDays: 28, changeDays: 28, checklistYears: 1 });
  assert.equal(complianceStatus({}, T), "missing");
  assert.equal(complianceStatus({ done_on: T, expires_on: null }, T), "ok");
  assert.equal(complianceStatus({ done_on: null, expires_on: ago(1) }, T), "overdue");
  assert.equal(complianceStatus({ done_on: null, expires_on: ahead(20) }, T), "due30");
});

test("the website and the clock share the switch", () => {
  const flag = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(/^ADM11_CALENDAR_READY = "([01])"$/m)?.[1] ?? "0";
  assert.equal(flag("wrangler.toml"), flag("jobs/wrangler.toml"));
});

test("switch off: the four checks as before, and rows of the new kinds count nowhere", async () => {
  const env = makeEnv(), id = await rental(env);
  await tenancy(env, id, { deposit: 1500, deposit_received_on: ago(40) });
  assert.deepEqual((await page(env, id)).map(c => c.kind), FOUR);
  assert.equal((await put(env, id, "hazards", { done_on: T, expires_on: ahead(300) })).status, 404);
  await allDone(env, id);
  await req(env, "PUT", `/admin/tenancies/1`, { deposit_protected_on: T, inventory_in_on: T, updated_at: rows(env, "SELECT updated_at FROM tenancies")[0].updated_at });
  // Left behind by a switch turned on and off again: ignored everywhere.
  env.DB.raw.prepare("INSERT INTO compliance_items (rental_id, kind, expires_on) SELECT ?, value, ? FROM json_each(?)").run(id, ago(5), JSON.stringify(NEW));
  assert.deepEqual((await todo(env)).filter(c => c.rental_id === id && NEW.includes(c.kind)), []);
  assert.deepEqual((await page(env, id)).map(c => c.kind), FOUR);
  assert.ok(!(await req(env, "GET", "/admin/rentals")).data.rentals.find(r => r.id === id).marks.includes("compliance"));
  await notificationsPass(env, new Date().toISOString());
  assert.deepEqual(rows(env, "SELECT title FROM notifications WHERE task_key LIKE 'queue:check:%'"), []);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM compliance_items WHERE rental_id = ?", id)[0].n, FOUR.length + NEW.length, "nothing seeded, nothing removed");
});

test("switch on: every property carries the calendar, not recorded until someone records it", async () => {
  const off = makeEnv(), old = await rental(off), env = { ...off, ADM11_CALENDAR_READY: "1" };
  // A property entered before the switch has no rows yet: its page shows them missing, and Rentals adds them.
  assert.deepEqual((await page(env, old)).map(c => [c.kind, c.status]),
    [...FOUR, "hazards", "checklist", "licence_change"].map(k => [k, "missing"]), "no tenancy: no copies, no deposit notice");
  assert.equal((await check(env, old, "hazards")).label, "Hazards check (29 prescribed hazards)");
  const list = (await todo(env)).filter(c => c.rental_id === old);
  assert.deepEqual(list.map(c => [c.kind, c.status]).sort(), [...FOUR, "hazards", "checklist", "licence_change"].map(k => [k, "missing"]).sort());
  assert.equal(list.find(c => c.kind === "checklist").label, "Electrical checklist");
  assert.deepEqual(rows(env, "SELECT kind FROM compliance_items WHERE rental_id = ? ORDER BY kind", old).map(r => r.kind), [...FOUR, ...NEW].sort());
  // A new property gets them at once.
  const fresh = await rental(env, { address: "2 Rue des Pres" });
  assert.deepEqual(rows(env, "SELECT kind FROM compliance_items WHERE rental_id = ? ORDER BY kind", fresh).map(r => r.kind), [...FOUR, ...NEW].sort());
  assert.equal((await put(env, fresh, "radon", { done_on: T })).status, 404);
});

test("hazards: one recorded check with its report's reference and the date of the next review", async () => {
  const env = on(), id = await rental(env);
  const none = await put(env, id, "hazards", { done_on: ago(3), note: "Report HZ-12" });
  assert.equal(none.status, 400);
  assert.match(none.data.fields.expires_on, /next review/);
  const ok = await put(env, id, "hazards", { done_on: ago(3), expires_on: ahead(45), note: "Report HZ-12" });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual([ok.data.item.done_on, ok.data.item.expires_on, ok.data.item.note, ok.data.item.status], [ago(3), ahead(45), "Report HZ-12", "due60"]);
  assert.equal((await todo(env)).find(c => c.kind === "hazards").status, "due60");
  await put(env, id, "hazards", { done_on: ago(3), expires_on: ahead(400), note: "Report HZ-12" });
  assert.equal((await todo(env)).find(c => c.kind === "hazards"), undefined, "in date: off the to-do");
});

test("electrical checklist: yearly, and due again when a new tenant starts", async () => {
  const env = on(), id = await rental(env);
  const done = await put(env, id, "checklist", { done_on: ago(30) });
  assert.equal(done.data.item.expires_on, addMonths(ago(30), 12));
  assert.equal(done.data.item.years, 1);
  await tenancy(env, id, { start_on: ago(10) });
  assert.deepEqual([(await check(env, id, "checklist")).expires_on, (await check(env, id, "checklist")).status], [ago(10), "overdue"]);
  // Done for this tenant: a year again.
  assert.equal((await put(env, id, "checklist", { done_on: ago(9) })).data.item.expires_on, addMonths(ago(9), 12));
});

test("copies to the tenant: 28 days from the tenancy's start or from a new licence or EICR, then nothing until the next", async () => {
  const env = on(), id = await rental(env);
  await put(env, id, "licence", { done_on: ago(100) });
  assert.equal(await check(env, id, "licence_copy"), undefined, "no tenant, no copy to give");
  await tenancy(env, id, { start_on: ago(10) });
  const due = plusDays(ago(10), 28);
  assert.deepEqual((await page(env, id)).filter(c => /_copy$/.test(c.kind)).map(c => [c.kind, c.done_on, c.expires_on, c.status]),
    [["licence_copy", null, due, "due30"], ["eicr_copy", null, due, "due30"]]);
  assert.equal((await todo(env)).find(c => c.kind === "licence_copy").label, "Licence copy to the tenant");
  const given = await put(env, id, "licence_copy", { done_on: ago(2), note: "Emailed with the complaints route" });
  assert.deepEqual([given.data.item.done_on, given.data.item.expires_on, given.data.item.status], [ago(2), null, "ok"]);
  assert.equal((await todo(env)).find(c => c.kind === "licence_copy"), undefined);
  // A renewed licence starts its copy's 28 days again; correcting its note alone does not.
  await put(env, id, "licence", { done_on: ago(100), note: "LIC-1" });
  assert.equal((await check(env, id, "licence_copy")).status, "ok");
  await put(env, id, "licence", { done_on: ago(1) });
  assert.deepEqual((({ done_on, expires_on, note, status }) => [done_on, expires_on, note, status])(await check(env, id, "licence_copy")),
    [null, plusDays(ago(1), 28), null, "due30"]);
  await put(env, id, "eicr", { done_on: ago(40) });
  assert.deepEqual([(await check(env, id, "eicr_copy")).expires_on, (await check(env, id, "eicr_copy")).status], [plusDays(ago(40), 28), "overdue"]);
  // The tenancy over: nothing to give any more.
  env.DB.raw.prepare("UPDATE tenancies SET ended_on = ? WHERE rental_id = ?").run(ago(1), id);
  assert.deepEqual((await page(env, id)).filter(c => /_copy$/.test(c.kind)), []);
  assert.deepEqual((await todo(env)).filter(c => /_copy$/.test(c.kind)), []);
});

test("licence changes: a change starts 28 days to notify it; notified closes it", async () => {
  const env = on(), id = await rental(env);
  assert.equal((await put(env, id, "licence_change", {})).status, 400);
  const changed = await put(env, id, "licence_change", { changed_on: ago(20), note: "New owner address" });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.deepEqual([changed.data.item.done_on, changed.data.item.expires_on, changed.data.item.status], [null, plusDays(ago(20), 28), "due30"]);
  assert.equal((await put(env, id, "licence_change", { changed_on: ahead(1) })).status, 400);
  const told = await put(env, id, "licence_change", { done_on: T, note: "Notified, ref EH-7" });
  assert.deepEqual([told.data.item.done_on, told.data.item.expires_on, told.data.item.note, told.data.item.status], [T, null, "Notified, ref EH-7", "ok"]);
  assert.deepEqual(rows(env, "SELECT data FROM rental_events WHERE type = 'compliance.updated' ORDER BY id").map(e => JSON.parse(e.data).after),
    [{ done_on: null, expires_on: plusDays(ago(20), 28), note: "New owner address" }, { done_on: T, expires_on: null, note: "Notified, ref EH-7" }]);
});

test("prescribed information: with the deposit, in its 30 days", async () => {
  const env = on(), id = await rental(env), t = await tenancy(env, id);
  assert.equal(await check(env, id, "deposit_info"), undefined, "no deposit received yet");
  const stamp = () => rows(env, "SELECT updated_at FROM tenancies WHERE id = ?", t)[0].updated_at;
  const got = await req(env, "PUT", `/admin/tenancies/${t}`, { deposit: 1500, deposit_received_on: ago(5), updated_at: stamp() });
  assert.equal(got.status, 200, JSON.stringify(got.data));
  assert.deepEqual((({ label, done_on, expires_on, status }) => [label, done_on, expires_on, status])(await check(env, id, "deposit_info")),
    ["Prescribed information with the deposit", null, plusDays(ago(5), 30), "due30"]);
  const given = await put(env, id, "deposit_info", { done_on: ago(1), note: "Certificate sent" });
  assert.deepEqual([given.data.item.expires_on, given.data.item.status], [null, "ok"]);
  // A corrected deposit date leaves a notice already given alone.
  assert.equal((await req(env, "PUT", `/admin/tenancies/${t}`, { deposit_received_on: ago(6), updated_at: stamp() })).status, 200);
  assert.equal((await check(env, id, "deposit_info")).status, "ok");
  // The next tenant's deposit starts it again.
  env.DB.raw.prepare("UPDATE tenancies SET ended_on = ? WHERE id = ?").run(ago(3), t);
  await tenancy(env, id, { start_on: ago(2), deposit: 1500, deposit_received_on: ago(40) });
  assert.deepEqual([(await check(env, id, "deposit_info")).done_on, (await check(env, id, "deposit_info")).status], [null, "overdue"]);
});

test("the Inbox and the Rentals count take the calendar from the same rows, once each", async () => {
  const env = on(), id = await rental(env), at = new Date().toISOString();
  await allDone(env, id);
  await tenancy(env, id, { start_on: ago(40), inventory_in_on: ago(39) });
  const open = () => rows(env, "SELECT title, category FROM notifications WHERE task_key LIKE 'queue:check:%' AND resolved_at IS NULL ORDER BY title");
  const count = async () => { env.DB.raw.exec("DELETE FROM app_settings WHERE key = 'rentals_count'"); return (await req(env, "GET", "/admin/notifications/counts")).data.rentals; };
  await notificationsPass(env, at);
  const titles = ["Check: EICR copy to the tenant", "Check: Electrical checklist", "Check: Hazards check (29 prescribed hazards)",
    "Check: Licence changes notified", "Check: Licence copy to the tenant"];
  assert.deepEqual(open(), titles.map(title => ({ title, category: "compliance" })));
  assert.equal(await count(), 5);
  const marked = async () => (await req(env, "GET", "/admin/rentals?list=1")).data.rentals.find(r => r.id === id).marks.includes("compliance");
  assert.equal(await marked(), true);
  await notificationsPass(env, new Date(Date.parse(at) + 1000).toISOString());
  assert.equal(open().length, 5, "a second pass adds nothing");
  await put(env, id, "hazards", { done_on: T, expires_on: ahead(400), note: "Report HZ-12" });
  await put(env, id, "licence_copy", { done_on: T });
  await put(env, id, "licence_change", { done_on: T, note: "Nothing changed" });
  await notificationsPass(env, new Date(Date.parse(at) + 2000).toISOString());
  assert.deepEqual(open().map(n => n.title), ["Check: EICR copy to the tenant", "Check: Electrical checklist"]);
  assert.equal(await count(), 2);
  const link = (await req(env, "GET", "/admin/notifications?box=action&category=compliance")).data.notifications.find(n => n.title === "Check: Electrical checklist");
  assert.match(link.link, new RegExp(`#/rentals/${id}\\?check=checklist$`));
  // A licence with another date brings its copy's notice back; everything recorded clears the property's mark.
  await put(env, id, "licence", { done_on: ago(1) });
  await notificationsPass(env, new Date(Date.parse(at) + 3000).toISOString());
  assert.deepEqual(open().map(n => n.title), ["Check: EICR copy to the tenant", "Check: Electrical checklist", "Check: Licence copy to the tenant"]);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM notifications WHERE task_key LIKE 'queue:check:%' AND title = 'Check: Licence copy to the tenant'")[0].n, 1, "the same notice, reopened");
  for (const k of ["checklist", "licence_copy", "eicr_copy"]) await put(env, id, k, { done_on: T });
  assert.equal(await marked(), false);
  await notificationsPass(env, new Date(Date.parse(at) + 4000).toISOString());
  assert.deepEqual(open(), []);
});

test("with the legal terms: the new periods are versioned, and a set saved before them reads as estimated", async () => {
  const env = on({ ADM17_LEGAL_TERMS_READY: "1" }), id = await rental(env);
  const KEYS = ["depositDays", "reportDays", "licenceYears", "eicrYears", "gasYears", "alarmsYears", "tenantNoticeMonths",
    "landlordNoticeMonths", "rentNoticeMonths", "rentIntervalMonths"];
  const before = { ...Object.fromEntries(KEYS.map(k => [k, LEGAL[k]])), depositDays: 21 };
  // Saved and validated while only ADM-17 was on.
  env.DB.raw.prepare("INSERT INTO legal_settings (key, value, revision, updated_at, updated_by) VALUES ('terms', ?, 1, ?, ?)")
    .run(JSON.stringify({ values: before, status: "validated", validated_ref: "Advice 12", validated_on: ago(2) }), "2026-11-14T00:00:00.000Z", ADMIN);
  const got = (await req(env, "GET", "/admin/legal-terms")).data.terms;
  assert.deepEqual(got.values, { ...before, copyDays: 28, changeDays: 28, checklistYears: 1 }, "its values stay");
  assert.deepEqual([got.status, got.validated_ref, got.revision], ["estimated", null, 1], "nobody validated the new periods");
  assert.equal((await req(env, "GET", `/admin/rentals/${id}`)).data.legal.status, "estimated");
  const bad = await req(env, "PUT", "/admin/legal-terms", { values: before, status: "estimated", validated_ref: null, validated_on: null, revision: 1 });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.fields.copyDays);
  const saved = await req(env, "PUT", "/admin/legal-terms", { values: { ...got.values, copyDays: 14, changeDays: 10, checklistYears: 2 },
    status: "validated", validated_ref: "Advice 13", validated_on: T, revision: 1 });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal((await req(env, "GET", `/admin/rentals/${id}`)).data.legal.status, "validated");
  await tenancy(env, id, { start_on: ago(3) });
  assert.equal((await check(env, id, "licence_copy")).expires_on, plusDays(ago(3), 14));
  assert.equal((await put(env, id, "licence_change", { changed_on: ago(1) })).data.item.expires_on, plusDays(ago(1), 10));
  assert.equal((await put(env, id, "checklist", { done_on: T })).data.item.expires_on, addMonths(T, 24));
  // The calendar off again: the ten periods as ADM-17 left them, the extra ones ignored.
  const off = { ...env, ADM11_CALENDAR_READY: "0" }, back = (await req(off, "GET", "/admin/legal-terms")).data.terms;
  assert.deepEqual([Object.keys(back.values), back.status], [KEYS, "validated"]);
});
