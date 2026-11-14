import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { LEGAL, addMonths, earliestMoveOut, rentAssistant } from "../../server/rentals.js";
import { notificationsPass } from "../../server/notification-reconcile.js";
import { readFileSync } from "node:fs";

// ADM-17: the legal periods as versioned settings behind ADM17_LEGAL_TERMS_READY. Nothing saved means today's values
// (LEGAL), marked estimated; Hampton's JFSC and GST registrations start unknown.
const ADMIN = "admin@example.test", COLLEAGUE = "colleague@example.test";
const on = schema => ({ ...makeEnv(schema), ADM17_LEGAL_TERMS_READY: "1" });
const req = async (env, method, path, body, email = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(email) });
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const KEYS = ["depositDays", "reportDays", "licenceYears", "eicrYears", "gasYears", "alarmsYears", "tenantNoticeMonths",
  "landlordNoticeMonths", "rentNoticeMonths", "rentIntervalMonths"];
const DEFAULTS = Object.fromEntries(KEYS.map(k => [k, LEGAL[k]]));
const ESTIMATED = { values: DEFAULTS, status: "estimated", validated_ref: null, validated_on: null };
const T = jerseyToday(), M0 = `${T.slice(0, 7)}-01`;
const save = (env, over = {}, email) => req(env, "PUT", "/admin/legal-terms", { ...ESTIMATED, revision: 0, ...over }, email);

async function tenancy(env, over = {}) {
  const l = await req(env, "POST", "/admin/landlords", { name: "Anne Owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "1 Rue des Pres",
    parish: "St Helier", service: "full", fee_percent: 10 });
  const t = await req(env, "POST", `/admin/rentals/${r.data.rental.id}/tenancies`, { tenant_name: "Tom Tenant", kind: "periodic",
    regime: "2025", rent: 1500, start_on: M0, collect_from: M0, ...over });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  return { rental: r.data.rental.id, id: t.data.tenancy.id };
}

test("the rules take the periods as a parameter and default to LEGAL", () => {
  const t = { kind: "periodic", regime: "2025", start_on: "2026-01-10", rent: 1000 };
  const notice = { given_on: "2026-03-31", by: "tenant" };
  assert.equal(earliestMoveOut(t, notice), "2026-04-30");
  assert.equal(earliestMoveOut(t, notice, { ...LEGAL, tenantNoticeMonths: 3 }), "2026-06-30");
  assert.equal(earliestMoveOut(t, { ...notice, by: "landlord" }, { ...LEGAL, landlordNoticeMonths: 6 }), "2026-09-30");
  assert.equal(rentAssistant(t, null, "2026-02-01").earliest_on, "2027-01-10");
  assert.equal(rentAssistant(t, null, "2026-02-01", { ...LEGAL, rentIntervalMonths: 6 }).earliest_on, "2026-07-10");
  assert.equal(rentAssistant(t, null, "2027-02-01", { ...LEGAL, rentNoticeMonths: 3 }).earliest_on, "2027-05-01");
});

test("the website and the clock share the switch, so the Inbox and the panel never work with different periods", () => {
  const flag = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(/^ADM17_LEGAL_TERMS_READY = "([01])"$/m)?.[1] ?? "0";
  assert.equal(flag("wrangler.toml"), flag("jobs/wrangler.toml"));
});

test("switch off: no route, no label, nothing read from the new tables", async () => {
  const env = makeEnv(), { id, rental } = await tenancy(env);
  assert.equal((await req(env, "GET", "/admin/legal-terms")).status, 404);
  assert.equal((await save(env)).status, 404);
  assert.equal((await req(env, "PUT", "/admin/legal-terms/registration", { jfsc: "yes", jfsc_ref: "x", gst: "no", gst_ref: null, revision: 0 })).status, 404);
  // Even a row put there by hand is ignored while the switch is off.
  env.DB.raw.prepare("INSERT INTO legal_settings (key, value, revision, updated_at, updated_by) VALUES ('terms', ?, 1, ?, ?)")
    .run(JSON.stringify({ ...ESTIMATED, values: { ...DEFAULTS, tenantNoticeMonths: 9 } }), "2026-11-14T00:00:00.000Z", ADMIN);
  const d = await req(env, "GET", `/admin/tenancies/${id}`);
  assert.equal("legal" in d.data, false);
  assert.equal((await req(env, "POST", `/admin/tenancies/${id}/notice`, { given_on: T, by: "tenant" })).data.earliest_move_out, addMonths(T, 1));
  assert.equal("legal" in (await req(env, "GET", "/admin/rentals")).data, false);
  assert.equal("legal" in (await req(env, "GET", `/admin/rentals/${rental}`)).data, false);
  assert.equal("legal" in (await req(env, "GET", "/admin/notifications/counts")).data, false);
});

test("switch on, nothing saved: today's values, marked estimated; registrations unknown", async () => {
  const env = on(), { id, rental } = await tenancy(env);
  const got = await req(env, "GET", "/admin/legal-terms");
  assert.equal(got.status, 200);
  assert.deepEqual(got.data.terms, { ...ESTIMATED, revision: 0, updated_at: null, updated_by: null });
  assert.deepEqual(got.data.registration, { jfsc: "unknown", jfsc_ref: null, gst: "unknown", gst_ref: null,
    revision: 0, updated_at: null, updated_by: null });
  assert.equal((await call(env, "GET", "/admin/legal-terms")).status, 401);
  const d = await req(env, "GET", `/admin/tenancies/${id}`);
  const label = { status: "estimated", periods: DEFAULTS, jfsc: "unknown", gst: "unknown" };
  assert.deepEqual(d.data.legal, label);
  assert.deepEqual((await req(env, "GET", "/admin/rentals")).data.legal, label);
  assert.deepEqual((await req(env, "GET", `/admin/rentals/${rental}`)).data.legal, label);
  assert.equal((await req(env, "GET", "/admin/notifications/counts")).data.legal, "estimated");
  assert.deepEqual(rows(env, "SELECT * FROM legal_settings"), [], "reading never writes");
});

test("switch on, migration not applied: the screens still work with today's values; saving says why not", async () => {
  const env = on({ through: 60 }), { id } = await tenancy(env);
  assert.equal((await req(env, "GET", "/admin/legal-terms")).data.terms.status, "estimated");
  assert.equal((await req(env, "POST", `/admin/tenancies/${id}/notice`, { given_on: T, by: "landlord" })).data.earliest_move_out, addMonths(T, 12));
  assert.equal((await req(env, "GET", "/admin/rentals")).status, 200);
  assert.equal((await req(env, "GET", "/admin/notifications/counts")).status, 200);
  assert.equal((await save(env)).status, 503);
});

test("saving checks every field; validated needs who said so and when", async () => {
  const env = on();
  for (const [over, field] of [
    [{ values: { ...DEFAULTS, depositDays: 0 } }, "depositDays"], [{ values: { ...DEFAULTS, depositDays: 366 } }, "depositDays"],
    [{ values: { ...DEFAULTS, reportDays: 1.5 } }, "reportDays"], [{ values: { ...DEFAULTS, eicrYears: "5" } }, "eicrYears"],
    [{ values: { ...DEFAULTS, landlordNoticeMonths: 61 } }, "landlordNoticeMonths"],
    [{ values: Object.fromEntries(KEYS.slice(1).map(k => [k, DEFAULTS[k]])) }, "depositDays"],
    [{ status: "approved" }, "status"], [{ status: "validated" }, "validated_ref"],
    [{ status: "validated", validated_ref: "Advice 12", validated_on: null }, "validated_on"],
    [{ status: "validated", validated_ref: "Advice 12", validated_on: plusDays(T, 1) }, "validated_on"],
    [{ status: "validated", validated_ref: "x".repeat(201), validated_on: T }, "validated_ref"],
    [{ revision: -1 }, "revision"], [{ revision: "0" }, "revision"],
  ]) {
    const r = await save(env, over);
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.ok(r.data.fields[field], `${field}: ${JSON.stringify(r.data)}`);
  }
  assert.equal((await call(env, "PUT", "/admin/legal-terms", { body: { ...ESTIMATED, revision: 0 } })).status, 401);
  assert.deepEqual(rows(env, "SELECT * FROM legal_settings"), []);
  assert.deepEqual(rows(env, "SELECT * FROM legal_setting_versions"), []);
});

test("each save is a new version with who and when; a stale form gets 409 and writes nothing", async () => {
  const env = on();
  let r = await save(env, { values: { ...DEFAULTS, depositDays: 28 } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual([r.data.terms.values.depositDays, r.data.terms.status, r.data.terms.revision, r.data.terms.updated_by],
    [28, "estimated", 1, ADMIN]);
  // An estimated save drops any reference sent with it: it validates nothing.
  r = await save(env, { validated_ref: "nope", validated_on: T, revision: 1 }, COLLEAGUE);
  assert.deepEqual([r.status, r.data.terms.validated_ref, r.data.terms.validated_on, r.data.terms.revision], [200, null, null, 2]);
  for (const stale of [0, 1, 3]) {
    r = await save(env, { values: { ...DEFAULTS, depositDays: 14 }, revision: stale });
    assert.equal(r.status, 409, `revision ${stale}`);
    assert.equal(r.data.terms.revision, 2, "the answer carries the current version");
  }
  r = await save(env, { status: "validated", validated_ref: " Advice of 3 Dec, ref 12 ", validated_on: T, revision: 2 });
  assert.deepEqual([r.status, r.data.terms.status, r.data.terms.validated_ref, r.data.terms.validated_on, r.data.terms.revision],
    [200, "validated", "Advice of 3 Dec, ref 12", T, 3]);
  assert.deepEqual((await req(env, "GET", "/admin/legal-terms")).data.terms, r.data.terms);
  const versions = rows(env, "SELECT key, revision, value, changed_by FROM legal_setting_versions ORDER BY revision");
  assert.deepEqual(versions.map(v => [v.key, v.revision, JSON.parse(v.value).values.depositDays, JSON.parse(v.value).status, v.changed_by]),
    [["terms", 1, 28, "estimated", ADMIN], ["terms", 2, 30, "estimated", COLLEAGUE], ["terms", 3, 30, "validated", ADMIN]]);
  // The history and the current row can be neither rewritten nor removed.
  for (const sql of ["UPDATE legal_setting_versions SET changed_by = 'x'", "DELETE FROM legal_setting_versions",
    "DELETE FROM legal_settings", "UPDATE legal_settings SET revision = revision + 2", "UPDATE legal_settings SET updated_by = 'x'",
    "INSERT INTO legal_settings (key, value, revision, updated_at, updated_by) VALUES ('registration', '{}', 4, 'x', 'x')"])
    assert.throws(() => env.DB.raw.exec(sql), sql);
});

test("the saved periods drive every date the panel shows", async () => {
  const env = on(), { id, rental } = await tenancy(env, { deposit: 1500, deposit_received_on: M0 });
  const values = { ...DEFAULTS, depositDays: 14, reportDays: 3, gasYears: 2, tenantNoticeMonths: 2, landlordNoticeMonths: 6,
    rentNoticeMonths: 3, rentIntervalMonths: 6 };
  assert.equal((await save(env, { values })).status, 200);
  const d = (await req(env, "GET", `/admin/tenancies/${id}`)).data;
  assert.deepEqual(d.legal, { status: "estimated", periods: values, jfsc: "unknown", gst: "unknown" });
  assert.deepEqual(d.deadlines.map(x => [x.key, x.due_on]), [["deposit", plusDays(M0, 14)], ["inventory_in", plusDays(M0, 3)]]);
  const after = addMonths(M0, 6), noticeOn = addMonths(T, 3);
  assert.equal(d.assistant.earliest_on, after > noticeOn ? after : noticeOn);
  const notice = await req(env, "POST", `/admin/tenancies/${id}/notice`, { given_on: T, by: "tenant" });
  assert.equal(notice.data.earliest_move_out, addMonths(T, 2));
  assert.equal(rows(env, "SELECT data FROM rental_events WHERE type = 'notice.recorded'").map(e => JSON.parse(e.data).earliest_move_out)[0], addMonths(T, 2));
  const page = (await req(env, "GET", `/admin/rentals/${rental}`)).data;
  assert.equal(page.compliance.find(c => c.kind === "gas").years, 2);
  const check = await req(env, "PUT", `/admin/rentals/${rental}/compliance/gas`, { done_on: T });
  assert.equal(check.data.item.expires_on, addMonths(T, 24));
  const todo = (await req(env, "GET", "/admin/rentals")).data.todo.compliance;
  assert.equal(todo.find(c => c.kind === "inventory_in").due_on, plusDays(M0, 3));
});

test("the Inbox and the Rentals count follow a changed period at once", async () => {
  const env = on(), at = "2026-11-09T12:00:00.000Z";
  env.DB.raw.exec(`INSERT INTO landlords(name,created_at,updated_at) VALUES('Fixture','${at}','${at}');
    INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at)
      VALUES(1,'Fixture rental','St Helier','let_only',NULL,'${at}','${at}');
    INSERT INTO compliance_items(rental_id,kind,done_on,expires_on)
      VALUES(1,'licence','2026-01-01','2099-01-01'),(1,'eicr','2026-01-01','2099-01-01'),(1,'gas','2026-01-01','2099-01-01'),(1,'alarms','2026-01-01','2099-01-01');
    INSERT INTO tenancies(rental_id,tenant_name,kind,regime,start_on,rent,due_day,payment_ref,inventory_in_on,deposit_received_on,created_at,updated_at)
      VALUES(1,'Fixture tenant','periodic','2025','2026-10-01',100,1,'FIXTURE','2026-10-02','2026-10-20','${at}','${at}');`);
  const open = () => rows(env, "SELECT title, due_at FROM notifications WHERE task_key LIKE 'queue:deadline:%' AND resolved_at IS NULL");
  const count = async () => (await req(env, "GET", "/admin/notifications/counts")).data.rentals;
  // 20 October + 30 days = 19 November: not overdue on the 9th.
  await notificationsPass(env, at);
  assert.deepEqual(open(), []);
  const before = await count();
  assert.equal((await save(env, { values: { ...DEFAULTS, depositDays: 14 } })).status, 200);
  await notificationsPass(env, at);
  assert.deepEqual(open(), [{ title: "Deposit protected overdue", due_at: "2026-11-03T00:00:00.000Z" }]);
  // The Inbox marks what the system worked out from estimated periods, not a task someone wrote with their own date.
  const manual = await req(env, "POST", "/admin/notification-tasks", { operation_id: crypto.randomUUID(), category: "compliance",
    target: { kind: "rental", id: "1", context: { compliance_kind: "gas" } }, title: "Ask for the gas certificate" });
  assert.equal(manual.status, 201, JSON.stringify(manual.data));
  const inbox = async () => (await req(env, "GET", "/admin/notifications?box=action&category=compliance")).data.notifications
    .map(n => [n.title, n.estimated ?? false]).sort();
  assert.deepEqual(await inbox(), [["Ask for the gas certificate", false], ["Deposit protected overdue", true]]);
  // The cached count is dropped by the save. (Its own clock is today's, so only its direction is compared.)
  assert.ok(await count() >= before);
  assert.equal(rows(env, "SELECT 1 FROM app_settings WHERE key = 'rentals_count'").length, 1);
  // A longer period moves the open notice's date instead of leaving the old one.
  assert.equal((await save(env, { values: { ...DEFAULTS, depositDays: 15 }, revision: 1 })).status, 200);
  await notificationsPass(env, at);
  assert.deepEqual(open(), [{ title: "Deposit protected overdue", due_at: "2026-11-04T00:00:00.000Z" }]);
  assert.equal((await save(env, { values: { ...DEFAULTS, depositDays: 15 }, status: "validated", validated_ref: "Advice 12",
    validated_on: T, revision: 2 })).status, 200);
  assert.deepEqual(await inbox(), [["Ask for the gas certificate", false], ["Deposit protected overdue", false]], "validated: no label");
  assert.equal((await save(env, { revision: 3 })).status, 200);
  await notificationsPass(env, at);
  assert.deepEqual(open(), [], "back to 30 days: not overdue again");
});

test("Hampton's registrations: yes, no or unknown, each change versioned; unknown is the start, never approval", async () => {
  const env = on();
  const put = (body, email) => req(env, "PUT", "/admin/legal-terms/registration", body, email);
  const base = { jfsc: "unknown", jfsc_ref: null, gst: "unknown", gst_ref: null, revision: 0 };
  for (const [over, field] of [[{ jfsc: "maybe" }, "jfsc"], [{ gst: null }, "gst"], [{ jfsc: "yes" }, "jfsc_ref"],
    [{ gst: "yes", gst_ref: "  " }, "gst_ref"], [{ jfsc: "no", jfsc_ref: "x".repeat(201) }, "jfsc_ref"], [{ revision: 1.5 }, "revision"]]) {
    const r = await put({ ...base, ...over });
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.ok(r.data.fields[field], `${field}: ${JSON.stringify(r.data)}`);
  }
  let r = await put({ ...base, jfsc: "yes", jfsc_ref: " Registry entry 123 ", gst: "no" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.registration, { jfsc: "yes", jfsc_ref: "Registry entry 123", gst: "no", gst_ref: null,
    revision: 1, updated_at: r.data.registration.updated_at, updated_by: ADMIN });
  assert.equal((await put({ ...base, jfsc: "no" })).status, 409);
  r = await put({ ...base, gst: "no", revision: 1 }, COLLEAGUE);
  assert.deepEqual([r.status, r.data.registration.jfsc, r.data.registration.revision, r.data.registration.updated_by], [200, "unknown", 2, COLLEAGUE]);
  assert.deepEqual((await req(env, "GET", "/admin/rentals")).data.legal, { status: "estimated", periods: DEFAULTS, jfsc: "unknown", gst: "no" });
  assert.deepEqual(rows(env, "SELECT key, revision, changed_by FROM legal_setting_versions ORDER BY revision"),
    [{ key: "registration", revision: 1, changed_by: ADMIN }, { key: "registration", revision: 2, changed_by: COLLEAGUE }]);
  assert.equal((await req(env, "GET", "/admin/legal-terms")).data.terms.revision, 0, "the periods keep their own version");
});
