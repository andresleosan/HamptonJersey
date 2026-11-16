// ADM-12 (ADM12_CASE_ACCESS_READY, migration 0110; plan tp03-adm-12, Tarea 3): the tenant's limited form to report a
// repair, through case-access. Staff: on a running tenancy with the tenant's email, a link with the last day it works
// (required, no default), shown once to copy and send yourself; it works once you record sending it and until you
// revoke it. Tenant: with the link and the code sent to the tenancy's email, sees only its property's address and
// reports a repair, Reported on its own tenancy: never approved, quoted or ordered; 10 a link a day; no photos (the team
// asks for them outside the app). An emergency raises the Inbox's existing urgent task (notification-reconcile.js); it
// promises no 24-hour service and authorises no spending.
import { json, fail, readJson, now, sha256 } from "../http.js";
import { emailAddress, emailDay } from "../email.js";
import { validateRepair } from "../rentals.js";
import { jerseyToday } from "../viewings.js";
import { asObject, fieldErrors, ensureChanged, rentalEvent } from "./rentals.js";
import { keyed, gone, createCaseGrant, markCaseGrant, resolveCaseActor, stillInForce, closeStale } from "../case-access.js";

const PER_DAY = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The exact pair asked for (never ids from the tenant): a running tenancy of that property, not archived, with an email.
export async function createRepairReportGrant(env, { rental_id, tenancy_id, recipient_ref, expires_on }, actor) {
  const t = await env.DB.prepare(`SELECT t.id, t.tenant_email FROM tenancies t JOIN rentals r ON r.id = t.rental_id WHERE t.id = ?
    AND t.rental_id = ? AND (t.ended_on IS NULL OR t.ended_on > ?) AND r.archived_at IS NULL`).bind(tenancy_id, rental_id, jerseyToday()).first();
  if (!t) fail(409, "Only a running tenancy, on a property not archived, can have a repair link.");
  const email = recipient_ref === "tenant_email" && emailAddress(t.tenant_email ?? "");
  if (!email) fail(409, "Add the tenant's email under Edit details first: the code is sent there.");
  return createCaseGrant(env, { caseRef: { kind: "tenancy", id: t.id }, purpose: "repair_report", party_ref: "tenant", recipient_ref,
    expires_on, source_revision: await sha256(email) }, actor);
}

// The tenancy's repair links, newest first, never their token: every one that may still work (so it can be revoked) and
// the 20 newest that no longer do, with how many reports each brought. Reading them first closes those the tenancy's
// changes ended (closeStale).
async function view(env, tenancyId) {
  const ts = now();
  await closeStale(env, tenancyId, ts);
  const list = open => env.DB.prepare(`SELECT g.id, g.status, g.expires_on, g.expires_at, g.created_at, g.created_by, g.sent_at,
    g.sent_by, g.revoked_at, g.revoked_by, g.closed_at, g.closed_reason,
    (SELECT COUNT(*) FROM repair_report_receipts WHERE grant_id = g.id) AS reports FROM case_grants g
    WHERE g.case_kind = 'tenancy' AND g.case_id = ? AND g.purpose = 'repair_report'
    AND ${open ? "" : "NOT"} (g.status IN ('dormant', 'active') AND g.expires_at > ?) ORDER BY g.created_at DESC ${open ? "" : "LIMIT 20"}`)
    .bind(tenancyId, ts);
  const [a, b] = (await env.DB.batch([list(true), list(false)])).map(r => r.results);
  return { enabled: true, links: [...a, ...b].map(({ expires_at, ...g }) => ({ ...g, expired: expires_at <= ts })) };
}
const list = async ({ env, params: [id] }) => json(await view(env, Number(id)));
async function create({ request, env, admin, params: [id] }) {
  const b = asObject(await readJson(request, 512));
  const t = await env.DB.prepare("SELECT id, rental_id FROM tenancies WHERE id = ?").bind(Number(id)).first() ?? fail(404, "Tenancy not found");
  const g = await createRepairReportGrant(env, { rental_id: t.rental_id, tenancy_id: t.id, recipient_ref: "tenant_email",
    expires_on: b.expires_on }, admin);
  return json({ id: g.id, link: `${new URL(request.url).origin}/repair-report#${g.token}`, ...(await view(env, t.id)) }, 201);
}
const mark = async ({ env, admin, params: [id, action] }) => json(await view(env, (await markCaseGrant(env, id, action, admin)).case_id));

// The tenant: its property's address, the link's last day and the reports left today.
const actor = (env, request, operation) => resolveCaseActor(env, request, { purpose: "repair_report", operation });
const sentToday = async (env, g) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM repair_report_receipts WHERE grant_id = ? AND day = ?")
  .bind(g.id, emailDay(now())).first()).n;
async function context({ request, env }) {
  const a = (await actor(env, request, "read")) ?? gone();
  return json({ address: a.grant.address, expires_on: a.grant.expires_on, reports_left: Math.max(0, PER_DAY - await sentToday(env, a.grant)) });
}

// POST {operation_id, title, detail?, urgency}: JSON text only (12 KiB: 2,000 characters in any script). The same operation
// again is the same receipt.
async function submit({ request, env }) {
  const a = (await actor(env, request, "submit")) ?? gone(), g = a.grant;
  const b = asObject(await readJson(request, 12288));
  const r = validateRepair({ title: b.title, detail: b.detail, urgency: b.urgency });
  if (r.errors) return fieldErrors(r.errors);
  if (typeof b.operation_id !== "string" || !UUID.test(b.operation_id)) fail(400, "Reload the page and try again.");
  const receipt = () => env.DB.prepare("SELECT id, at FROM repair_report_receipts WHERE grant_id = ? AND operation_id = ?")
    .bind(g.id, b.operation_id).first();
  const done = await receipt();
  if (done) return json({ receipt: done });
  const ts = now(), day = emailDay(ts), id = crypto.randomUUID(), { title, detail, urgency } = r.value;
  try {
    await env.DB.batch([
      stillInForce(env, g, ts),
      env.DB.prepare(`INSERT INTO repairs (rental_id, tenancy_id, title, detail, urgency, status, created_at, created_by, updated_at, updated_by)
        SELECT ?, ?, ?, ?, ?, 'reported', ?, 'tenant', ?, 'tenant'
        WHERE EXISTS (SELECT 1 FROM case_sessions WHERE token_hash = ? AND grant_id = ? AND expires_at > ?)
        AND (SELECT COUNT(*) FROM repair_report_receipts WHERE grant_id = ? AND day = ?) < ${PER_DAY}`)
        .bind(g.rental_id, g.case_id, title, detail, urgency, ts, ts, a.session, g.id, ts, g.id, day),
      ensureChanged(env),
      env.DB.prepare(`INSERT INTO repair_report_receipts (id, grant_id, operation_id, repair_id, day, at)
        VALUES (?, ?, ?, (SELECT MAX(id) FROM repairs), ?, ?)`).bind(id, g.id, b.operation_id, day, ts),
      rentalEvent(env, { rental_id: g.rental_id, tenancy_id: g.case_id, actor: "tenant", type: "repair.reported",
        data: { urgency, receipt_id: id } }, { repair_id: "repairs" }),
    ]);
  } catch (e) {
    // Nothing was written: the same operation landed first, the link ended, or today's 10 are used.
    const again = await receipt();
    if (again) return json({ receipt: again });
    if (!(await actor(env, request, "submit"))) gone();
    if (await sentToday(env, g) >= PER_DAY) fail(429, "You have sent 10 reports today with this link. For anything else, please call Hampton Estates.");
    throw e;
  }
  return json({ receipt: { id, at: ts } }, 201);
}

export default [
  ["GET", /^\/admin\/tenancies\/(\d+)\/repair-links$/, keyed(list), true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/repair-links$/, keyed(create), true],
  ["POST", /^\/admin\/case-grants\/([0-9a-f-]{36})\/(sent|revoke)$/, keyed(mark), true],
  ["GET", /^\/repair-report$/, keyed(context), false],
  ["POST", /^\/repair-report\/submit$/, keyed(submit), false],
];
