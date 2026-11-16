import { json, fail, readJson, now, sha256 } from "./http.js";
import { normalizePhone } from "./applicants.js";

// PRE-12 (migration 0113, PRE12_TENANCY_LINK_READY): tenancies carry no contact id. A team member links the tenant of a
// tenancy to a contact, one click per tenancy and contact, from the rental or from a privacy request; a link lasts for
// any later request and for the cleanup's hold (server/retention.js, RUNNING_TENANCY). A contact with the tenant's email
// or phone, or the applicant the tenancy started from (ADM-06), is only proposed. A link holds the SHA-256 of the
// tenant's name, email and phone as read then: once they change, it needs confirming again before the copy uses it.
// Ids only; nothing personal goes to logs or events. Switched off, nothing here is mounted or read.
const missing = e => /no such table: tenancy_contact_links/.test(String(e?.message));
const tenantRevision = t => sha256([t.tenant_name, t.tenant_email ?? "", t.tenant_phone ?? ""].join("|"));

// The latest decision per tenancy and contact, for the rows `where` picks (on l). None before 0113.
async function decisions(env, where, ...binds) {
  try {
    return (await env.DB.prepare(`SELECT l.tenancy_id, l.contact_id, l.linked, l.tenant_revision, l.actor, l.at
      FROM tenancy_contact_links l WHERE ${where} AND l.id = (SELECT MAX(m.id) FROM tenancy_contact_links m
        WHERE m.tenancy_id = l.tenancy_id AND m.contact_id = l.contact_id)`).bind(...binds).all()).results;
  } catch (e) { if (missing(e)) return []; throw e; }
}
const linkOf = async (d, t) => d ? { linked: !!d.linked, current: !!d.linked && d.tenant_revision === await tenantRevision(t),
  by: d.actor, at: d.at } : null;
const reasons = x => ["email", "phone", "origin"].filter(k => x[`by_${k}`]);
const ORIGIN = "SELECT o.tenancy_id, a.contact_id FROM tenancy_origins o JOIN applicants a ON a.id = o.applicant_id";

// The contacts proposed for a tenancy, and those it was ever decided on.
async function contactsFor(env, t) {
  const decided = await decisions(env, "l.tenancy_id = ?", t.id);
  const { results } = await env.DB.prepare(`SELECT c.id, c.name, c.email = ?2 AS by_email, c.phone = ?3 AS by_phone,
      c.id IN (SELECT contact_id FROM (${ORIGIN}) WHERE tenancy_id = ?1) AS by_origin FROM contacts c
    WHERE c.email = ?2 OR c.phone = ?3 OR c.id IN (SELECT contact_id FROM (${ORIGIN}) WHERE tenancy_id = ?1)
      OR c.id IN (SELECT value FROM json_each(?4)) ORDER BY c.name, c.id`)
    .bind(t.id, t.tenant_email?.trim().toLowerCase() || null, normalizePhone(t.tenant_phone), JSON.stringify(decided.map(d => d.contact_id))).all();
  return Promise.all(results.map(async c => ({ id: c.id, name: c.name, matched_by: reasons(c),
    link: await linkOf(decided.find(d => d.contact_id === c.id), t) })));
}

// The tenancies proposed for a contact (same email, same phone once normalised, or started from their search), and those
// it was ever decided on.
const STRIPPED = ["' '", "'-'", "'.'", "'('", "')'"].reduce((sql, ch) => `replace(${sql}, ${ch}, '')`, "t.tenant_phone");
export async function tenanciesFor(env, contactId) {
  const c = await env.DB.prepare("SELECT email, phone FROM contacts WHERE id = ?").bind(contactId).first();
  if (!c) return [];
  const decided = await decisions(env, "l.contact_id = ?", contactId);
  const { results } = await env.DB.prepare(`SELECT t.id, r.address, t.tenant_name, t.tenant_email, t.tenant_phone, t.start_on,
      t.ended_on, ?1 <> '' AND lower(trim(t.tenant_email)) = ?1 AS by_email,
      t.id IN (SELECT tenancy_id FROM (${ORIGIN}) WHERE contact_id = ?3) AS by_origin
    FROM tenancies t JOIN rentals r ON r.id = t.rental_id
    WHERE (?1 <> '' AND lower(trim(t.tenant_email)) = ?1) OR (length(?2) >= 9 AND t.tenant_phone <> '' AND substr(${STRIPPED}, -9) = substr(?2, -9))
      OR t.id IN (SELECT tenancy_id FROM (${ORIGIN}) WHERE contact_id = ?3) OR t.id IN (SELECT value FROM json_each(?4))
    ORDER BY t.start_on DESC, t.id`).bind(c.email ?? "", c.phone ?? "", contactId, JSON.stringify(decided.map(d => d.tenancy_id))).all();
  const out = [];
  for (const t of results) {
    const by_phone = !!c.phone && normalizePhone(t.tenant_phone) === c.phone, d = decided.find(x => x.tenancy_id === t.id);
    if (!t.by_email && !by_phone && !t.by_origin && !d) continue;
    const { by_email, by_origin, ...rest } = t;
    out.push({ ...rest, matched_by: reasons({ by_email, by_phone, by_origin }), link: await linkOf(d, t) });
  }
  return out;
}

// For the copy (D3): identity, address and dates of each tenancy linked now, the details unchanged since.
const COPY = ["t.id", "r.address", "r.parish", "t.kind", "t.start_on", "t.end_on", "t.ended_on", "t.notice_given_on", "t.notice_by",
  "t.agreement_on", "t.tenant_name", "t.tenant_email", "t.tenant_phone"];
export async function linkedTenancies(env, contactId) {
  const decided = await decisions(env, "l.contact_id = ? AND l.linked = 1", contactId);
  if (!decided.length) return [];
  const { results } = await env.DB.prepare(`SELECT ${COPY.join(", ")} FROM tenancies t JOIN rentals r ON r.id = t.rental_id
    WHERE t.id IN (SELECT value FROM json_each(?)) ORDER BY t.id`).bind(JSON.stringify(decided.map(d => d.tenancy_id))).all();
  const out = [];
  for (const t of results) if (decided.find(d => d.tenancy_id === t.id).tenant_revision === await tenantRevision(t)) out.push(t);
  return out;
}

// For the erasure plan: never a deletion. Linked tenancies, and proposals nobody decided yet (or to confirm again).
export async function tenancyItems(env, contactId) {
  const all = await tenanciesFor(env, contactId);
  return [{ item: "tenancies", count: all.filter(t => t.link?.current).length },
    { item: "tenancy_candidates", count: all.filter(t => !t.link || (t.link.linked && !t.link.current)).length }];
}

// One decision, appended with the tenant's details as read; written only if they are still the same. The person's copy
// changes, so the review of any open request of theirs (for the copy as it was) is cleared, as a viewing decision does.
export async function setTenancyLink(env, tenancyId, contactId, linked, admin) {
  const t = await env.DB.prepare("SELECT id, tenant_name, tenant_email, tenant_phone FROM tenancies WHERE id = ?").bind(tenancyId).first();
  if (!t) fail(404, "Tenancy not found");
  if (!(await contactsFor(env, t)).some(c => c.id === contactId)) fail(404, "This contact is not a possible tenant of this tenancy");
  try {
    const [{ meta }] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO tenancy_contact_links (tenancy_id, contact_id, linked, tenant_revision, actor, at)
        SELECT id, ?, ?, ?, ?, ? FROM tenancies WHERE id = ? AND tenant_name = ? AND tenant_email IS ? AND tenant_phone IS ?`)
        .bind(contactId, linked ? 1 : 0, await tenantRevision(t), admin, now(), t.id, t.tenant_name, t.tenant_email, t.tenant_phone),
      env.DB.prepare(`UPDATE privacy_requests SET copy_hash = NULL, copy_reviewed_by = NULL, copy_reviewed_at = NULL
        WHERE contact_id = ? AND state = 'open' AND copy_hash IS NOT NULL AND changes() = 1`).bind(contactId)]);
    if (!meta.changes) fail(409, "The tenant's details changed meanwhile. Reload and check again.");
  } catch (e) { if (missing(e)) fail(404, "Not found"); throw e; }
}

const tenancyOf = async (env, id) => (await env.DB.prepare("SELECT id, tenant_name, tenant_email, tenant_phone FROM tenancies WHERE id = ?")
  .bind(id).first()) ?? fail(404, "Tenancy not found");
const list = async ({ env, params: [id] }) => json({ contacts: await contactsFor(env, await tenancyOf(env, Number(id))) });
async function decide({ request, env, admin, params: [id, contact] }) {
  const b = await readJson(request);
  if (typeof b?.linked !== "boolean") return json({ error: "Say whether this contact is the tenant", fields: { linked: "Say whether this contact is the tenant" } }, 400);
  await setTenancyLink(env, Number(id), Number(contact), b.linked, admin);
  return list({ env, params: [id] });
}

export default [
  ["GET", /^\/admin\/tenancies\/([1-9]\d{0,14})\/contacts$/, list, true],
  ["POST", /^\/admin\/tenancies\/([1-9]\d{0,14})\/contacts\/([1-9]\d{0,14})$/, decide, true],
];
