// ADM-18: mounted by server/api.js only when ADM18_APPLICATION_READY is '1' (migration 0117). Staff: a property's
// applications, opening one, reading it (case_data_read), deciding (case_data_write) and its private link for the
// applicant. The applicant, signed in through case-access with that link: the property, rent and status, and sending the
// form once. Links need the operator's key (keyed: 503 without it). JSON only: no file is taken, kept or linked.
import { json, readJson, fail } from "../http.js";
import { asObject, fieldErrors } from "./rentals.js";
import { keyed, gone, markCaseGrant, resolveCaseActor } from "../case-access.js";
import { createApplicationLink, createRentalApplication, listRentalApplications, readRentalApplication, reviewRentalApplication,
  submitRentalApplication } from "../rental-applications.js";

const body = async (request, max) => asObject(await readJson(request, max));

const list = async ({ env, params: [id] }) => json(await listRentalApplications(env, Number(id)));
async function open({ request, env, admin, params: [id] }) {
  const b = await body(request, 512);
  const r = await createRentalApplication(env, { rental_id: Number(id), applicant_id: b.applicant_id, rent: b.rent }, admin);
  return r.errors ? fieldErrors(r.errors) : json({ id: r.id, ...(await listRentalApplications(env, Number(id))) }, 201);
}
const read = async ({ env, admin, params: [id] }) => json(await readRentalApplication(env, Number(id), admin));
async function review({ request, env, admin, params: [id] }) {
  const r = await reviewRentalApplication(env, { ...(await body(request, 4096)), id: Number(id) }, admin);
  return r.errors ? fieldErrors(r.errors) : read({ env, admin, params: [id] });
}
async function newLink({ request, env, admin, params: [id] }) {
  const g = await createApplicationLink(env, Number(id), (await body(request, 512)).expires_on, admin);
  return json({ grant_id: g.id, link: `${new URL(request.url).origin}/rental-application#${g.token}`,
    ...(await readRentalApplication(env, Number(id), admin).catch(() => ({}))) }, 201); // the link is shown once: never lose it to a read 403
}
// Only a link of this application: another one's id is not found here.
async function mark({ env, admin, params: [id, grant, action] }) {
  const g = await env.DB.prepare(`SELECT 1 FROM case_grants WHERE id = ? AND case_kind = 'rental_application' AND case_id = ?`)
    .bind(grant, Number(id)).first();
  if (!g) fail(404, "Link not found");
  await markCaseGrant(env, grant, action, admin);
  return read({ env, admin, params: [id] });
}

const party = (env, request, operation) => resolveCaseActor(env, request, { purpose: "rental_application", operation });
async function context({ request, env }) {
  const p = (await party(env, request, "read")) ?? gone();
  const a = await env.DB.prepare("SELECT rent, status, revision FROM rental_applications WHERE id = ?").bind(p.caseRef.id).first();
  return json({ address: p.grant.address, rent: a.rent, status: a.status, revision: a.revision, expires_on: p.grant.expires_on });
}
// POST {operation_id, revision, answers}: 12 KiB of JSON text.
async function submit({ request, env }) {
  const p = (await party(env, request, "submit")) ?? gone();
  const r = await submitRentalApplication(env, p, await body(request, 12288));
  if (r.stale) return (await party(env, request, "submit")) ? fail(409, "This application was already sent or changed. Reload the page.") : gone();
  return r.errors ? fieldErrors(r.errors) : json({ receipt: r.receipt }, r.created ? 201 : 200);
}

export default [
  ["GET", /^\/admin\/rentals\/(\d+)\/applications$/, list, true],
  ["POST", /^\/admin\/rentals\/(\d+)\/applications$/, open, true],
  ["GET", /^\/admin\/rental-applications\/(\d+)$/, read, true],
  ["POST", /^\/admin\/rental-applications\/(\d+)\/review$/, review, true],
  ["POST", /^\/admin\/rental-applications\/(\d+)\/links$/, keyed(newLink), true],
  ["POST", /^\/admin\/rental-applications\/(\d+)\/links\/([0-9a-f-]{36})\/(sent|revoke)$/, keyed(mark), true],
  ["GET", /^\/rental-application$/, keyed(context), false],
  ["POST", /^\/rental-application\/submit$/, keyed(submit), false],
];
