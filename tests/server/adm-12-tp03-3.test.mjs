import test from "node:test";
import assert from "node:assert/strict";
import { call } from "./helpers.mjs";
import { notificationsPass } from "../../server/notification-reconcile.js";
import { seed, onEnv, staff, count, link, signIn } from "./adm-12-tp03-fixtures.mjs";

// ADM-12 (plan tp03-adm-12, Tarea 3): the tenant's limited form to report a repair, through case-access (Tarea 1).
// It writes one repair in Reported on its own tenancy, never approved or ordered, with a receipt; 10 a link a day, no
// photos (visual evidence is handled outside the app). An emergency raises the existing internal Inbox task only.
const report = (env, cookie, body) => call(env, "POST", "/repair-report/submit", { cookie, body });
const op = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LEAK = { operation_id: op(1), title: "Kitchen tap leaking", detail: "Water under the sink since this morning.", urgency: "urgent" };
async function session(tenancy = 1) {
  const env = seed(onEnv()), l = await link(env, { tenancy });
  return { env, ...l, cookie: await signIn(env, l.token) };
}

test("submit_sets_reported_not_approved: one repair on its own tenancy, Reported, with a receipt", async () => {
  const { env, cookie } = await session();
  const r = await report(env, cookie, LEAK);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match(r.data.receipt.id, /^[0-9a-f-]{36}$/);
  const p = env.DB.raw.prepare("SELECT * FROM repairs").get();
  assert.deepEqual([p.rental_id, p.tenancy_id, p.title, p.detail, p.urgency, p.status, p.approved_at, p.quote, p.cost, p.contractor,
    p.supplier_id, p.created_by], [1, 1, LEAK.title, LEAK.detail, "urgent", "reported", null, null, null, null, null, "tenant"]);
  assert.equal(env.DB.raw.prepare("SELECT repair_id FROM repair_report_receipts").get().repair_id, p.id);
  const e = env.DB.raw.prepare("SELECT actor, type, data FROM rental_events WHERE type = 'repair.reported'").get();
  assert.equal(e.actor, "tenant");
  assert.equal(e.data.includes(LEAK.detail), false, "the event keeps no private text");
  // The team sees it on the property as any repair; the staff list of links counts it.
  assert.equal((await staff(env, "GET", "/admin/rentals/1")).data.repairs[0].title, LEAK.title);
  assert.equal((await staff(env, "GET", "/admin/tenancies/1/repair-links")).data.links[0].reports, 1);

  // An emergency: the internal urgent task, still Reported, with no approval and nothing ordered.
  const em = await report(env, cookie, { ...LEAK, operation_id: op(2), title: "Gas smell", urgency: "emergency" });
  assert.equal(em.status, 201);
  await notificationsPass(env, new Date().toISOString());
  assert.equal(env.DB.raw.prepare("SELECT title FROM notifications WHERE title = 'Emergency repair'").get()?.title, "Emergency repair");
  assert.deepEqual({ ...env.DB.raw.prepare("SELECT status, approved_at FROM repairs WHERE urgency = 'emergency'").get() },
    { status: "reported", approved_at: null });
});

test("grant_cannot_list_other_properties: the form reads and writes only its own tenancy", async () => {
  const { env, cookie } = await session(1);
  const ctx = await call(env, "GET", "/repair-report", { cookie });
  assert.equal(ctx.status, 200);
  assert.deepEqual(Object.keys(ctx.data).sort(), ["address", "expires_on", "reports_left"]);
  assert.equal(ctx.data.address, "1 Fixture Street");
  assert.equal(ctx.text.includes("2 Fixture Street"), false);
  // Ids of another property in the body are not authority: ignored.
  assert.equal((await report(env, cookie, { ...LEAK, rental_id: 2, tenancy_id: 2, status: "approved", quote: 1 })).status, 201);
  assert.deepEqual({ ...env.DB.raw.prepare("SELECT rental_id, tenancy_id, status, quote FROM repairs").get() },
    { rental_id: 1, tenancy_id: 1, status: "reported", quote: null });
  assert.equal((await staff(env, "GET", "/admin/tenancies/2/repair-links")).data.links.length, 0);
});

test("duplicate_submit_one_report: the same operation sent twice, or at once, is one report and one receipt", async () => {
  const { env, cookie } = await session();
  const [a, b] = await Promise.all([report(env, cookie, LEAK), report(env, cookie, LEAK)]);
  const c = await report(env, cookie, LEAK);
  assert.deepEqual([a.status, b.status, c.status].sort(), [200, 200, 201]);
  assert.equal(new Set([a, b, c].map(r => r.data.receipt.id)).size, 1);
  assert.deepEqual([count(env, "repairs"), count(env, "repair_report_receipts")], [1, 1]);
});

test("ten reports a link a day; then none until tomorrow", async () => {
  const { env, cookie } = await session();
  for (let i = 1; i <= 10; i++) assert.equal((await report(env, cookie, { ...LEAK, operation_id: op(i) })).status, 201);
  assert.equal((await report(env, cookie, { ...LEAK, operation_id: op(11) })).status, 429);
  assert.equal((await call(env, "GET", "/repair-report", { cookie })).data.reports_left, 0);
  assert.equal(count(env, "repairs"), 10);
});

test("expired_or_revoked_grant_denied, and revocation_blocks_late_read_or_commit", async () => {
  const { env, id, cookie } = await session();
  assert.equal((await staff(env, "POST", `/admin/case-grants/${id}/revoke`, {})).status, 200);
  assert.equal((await report(env, cookie, LEAK)).status, 404);
  assert.equal((await staff(env, "POST", `/admin/case-grants/${id}/sent`, {})).status, 409, "a revoked link stays revoked");

  // Revoked after the session was checked, before the write: the write's own batch refuses it.
  const late = await session(), batch = late.env.DB.batch.bind(late.env.DB);
  late.env.DB.batch = async stmts => {
    if (stmts.some(s => /INSERT INTO repairs/.test(s.sql))) late.env.DB.raw.prepare("UPDATE case_grants SET status = 'revoked'").run();
    return batch(stmts);
  };
  assert.equal((await report(late.env, late.cookie, LEAK)).status, 404);
  assert.deepEqual([count(late.env, "repairs"), count(late.env, "repair_report_receipts"), count(late.env, "rental_events")], [0, 0, 0]);

  // wrong_scope_or_stale_revision_no_write: the tenant's email changed in between.
  const stale = await session(), sb = stale.env.DB.batch.bind(stale.env.DB);
  stale.env.DB.batch = async stmts => {
    if (stmts.some(s => /INSERT INTO repairs/.test(s.sql))) stale.env.DB.raw.prepare("UPDATE tenancies SET tenant_email = 'new@example.test'").run();
    return sb(stmts);
  };
  assert.equal((await report(stale.env, stale.cookie, LEAK)).status, 404);
  assert.equal(count(stale.env, "repairs"), 0);
});

test("no_photo_upload_external_evidence_only: JSON text only; a photo or a file is not accepted", async () => {
  const { env, cookie } = await session();
  const form = new FormData();
  form.append("title", "Leak");
  form.append("photo", new Blob([new Uint8Array(64)], { type: "image/jpeg" }), "leak.jpg");
  assert.equal((await call(env, "POST", "/repair-report/submit", { cookie, form })).status, 400);
  assert.equal((await report(env, cookie, { ...LEAK, detail: "x".repeat(13000) })).status, 413);
  assert.equal((await report(env, cookie, { ...LEAK, detail: "x".repeat(2001) })).status, 400);
  assert.equal((await report(env, cookie, { ...LEAK, photo: "data:image/jpeg;base64,AAAA" })).status, 201);
  assert.equal(JSON.stringify(env.DB.raw.prepare("SELECT * FROM repairs").all()).includes("base64"), false);
  assert.equal(count(env, "repairs"), 1);
});

// Review 16-nov: every link that can still work is listed (so it can be revoked); only the ended ones are capped at 20.
test("the panel lists every open link, however many, and the 20 newest that no longer work", async () => {
  const env = seed(onEnv()), first = await link(env);
  env.DB.raw.prepare("UPDATE case_grants SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(first.id);
  const ended = [];
  for (let i = 0; i < 22; i++) ended.push((await link(env, { sent: false })).id);
  for (const id of ended) assert.equal((await staff(env, "POST", `/admin/case-grants/${id}/revoke`, {})).status, 200);
  for (let i = 0; i < 21; i++) await link(env, { sent: false });
  const links = (await staff(env, "GET", "/admin/tenancies/1/repair-links")).data.links;
  assert.equal(links.filter(g => g.status !== "revoked").length, 22, "all open ones, the oldest included");
  assert.ok(links.some(g => g.id === first.id));
  assert.equal(links.filter(g => g.status === "revoked").length, 20);
  assert.equal((await staff(env, "POST", `/admin/case-grants/${first.id}/revoke`, {})).status, 200, "so it can be revoked");
});

test("the form's fields are checked like the team's: a title, an urgency, an operation id", async () => {
  const { env, cookie } = await session();
  const r = await report(env, cookie, { operation_id: op(1) });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.data.fields).sort(), ["title", "urgency"]);
  assert.equal((await report(env, cookie, { ...LEAK, operation_id: "1" })).status, 400);
  assert.equal(count(env, "repairs"), 0);
});
