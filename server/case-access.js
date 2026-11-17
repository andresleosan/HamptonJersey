// ADM-12 (ADM12_CASE_ACCESS_READY, migration 0110; plan tp03-adm-12, Tarea 1; spec tp03-case-evidence): external access
// by purpose. A grant is one purpose on one case for one party: created by staff holding ADM-18's case_data_write for
// that purpose and case (server/case-capabilities.js, migrations 0046 and 0049), dormant until a person records sending
// the link, and in force until the Jersey day after the date the team chose starts (R04: required, no default). With the
// link the party asks for a code (case-auth-email.js); the right code gives a 30-minute session for that grant only.
// Every read and write checks the grant again: revoked, expired, its purpose's policy revoked or approved anew, a new
// recipient email, an ended tenancy or an archived property end it, the last three for good (closeStale). Without the
// operator's key (CASE_CHALLENGE_HMAC_KEY) or before 0110, every route answers 503.
import { fail, now, sha256 } from "./http.js";
import { getCookie } from "./auth.js";
import { emailAddress } from "./email.js";
import { jerseyToday, plusDays, realDate } from "./viewings.js";
import { jerseyViewingInstant } from "./viewing-policy.js";
import { requireCaseCapability, prepareCaseCapabilityGuard } from "./case-capabilities.js";
import { TOKEN, makeCaseToken, hashCaseToken, caseKey, keyId, verifyDigest } from "./case-access-crypto.js";
import { ensureChanged } from "./routes/rentals.js";

export const caseAccessReady = env => env?.ADM12_CASE_ACCESS_READY === "1";
export const COOKIE = "__Host-hampton-case";
export const GONE = "This link is not available. Please contact Hampton Estates.";
export const gone = () => fail(404, GONE);
const NOT_READY = "Tenant links are not available yet.";
const EXPIRED = "This code has expired or has been used. Ask for a new code.";
const SESSION_MS = 30 * 60e3, MAX_TRIES = 5, MAX_DAYS = 366;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The purposes built so far, the operations each allows and the kind of case each is given on. tenancy_reference and
// renewal_response come with ADM-19 and ADM-14, which add their own entry here.
const OPERATIONS = { repair_report: ["read", "submit"], rental_application: ["read", "submit"] };
const PURPOSE_KIND = { repair_report: "tenancy", rental_application: "rental_application" };

// R04: the start of the Jersey day after the date chosen (midnight always exists in Jersey: clocks change at 01:00 GMT).
export const caseExpiresAt = date => [3600, 0].map(o => jerseyViewingInstant(plusDays(date, 1), "00:00", o)).find(Boolean);

// Every case-access route: closed without the operator's key or before migration 0110.
export const keyed = handler => async ctx => {
  if (!caseKey(ctx.env)) fail(503, NOT_READY);
  try { return await handler(ctx); }
  catch (e) { if (/no such table/.test(e?.message ?? "")) fail(503, NOT_READY); throw e; }
};

// A grant in force: sent, not revoked or closed, before its expiry, while its purpose's policy is approved and in force at
// the revision the grant was made under (a new approval is a new revision: old grants stay ended), on a case still open
// whose party's email is still the one the link was made for (its hash, source_revision). Each kind of case says where
// its party's email is, when it is open and which switch serves it: a tenancy (ADM-12's repair link) while it runs in a
// property not archived; a rental application (ADM-18) while draft or submitted, in a property not archived. In a batch
// the email is bound as read. Each kind's SQL names only its own tables, so one never needs the other's migration.
const SOURCES = {
  tenancy: { ready: caseAccessReady, join: "JOIN tenancies t ON t.id = g.case_id JOIN rentals r ON r.id = t.rental_id",
    email: "t.tenant_email", rental: "t.rental_id", open: "(t.ended_on IS NULL OR t.ended_on > ?) AND r.archived_at IS NULL",
    args: ts => [day(ts)], staff: async (env, id) => ({ kind: "tenancy", id }),
    row: `SELECT t.tenant_email AS email, t.ended_on, r.archived_at FROM tenancies t JOIN rentals r ON r.id = t.rental_id WHERE t.id = ?` },
  rental_application: { ready: env => env?.ADM18_APPLICATION_READY === "1",
    join: `JOIN rental_applications a ON a.id = g.case_id JOIN rentals r ON r.id = a.rental_id
      JOIN applicants ap ON ap.id = a.applicant_id JOIN contacts c ON c.id = ap.contact_id`,
    email: "c.email", rental: "a.rental_id", open: "a.status IN ('draft', 'submitted') AND r.archived_at IS NULL", args: () => [],
    // Staff hold ADM-18's capability on the property the application is for.
    staff: async (env, id) => ({ kind: "rental",
      id: (await env.DB.prepare("SELECT rental_id FROM rental_applications WHERE id = ?").bind(id).first())?.rental_id ?? 0 }),
    row: `SELECT c.email, NULL AS ended_on, r.archived_at FROM rental_applications a JOIN rentals r ON r.id = a.rental_id
      JOIN applicants ap ON ap.id = a.applicant_id JOIN contacts c ON c.id = ap.contact_id WHERE a.id = ?` },
};
const POLICY = `g.status = 'active' AND g.expires_at > ? AND EXISTS (SELECT 1 FROM case_purpose_policies p WHERE p.purpose = g.purpose
  AND p.revision = g.policy_revision AND p.status = 'approved' AND p.valid_from <= ? AND (p.expires_at IS NULL OR p.expires_at > ?))`;
const day = ts => jerseyToday(new Date(ts));
const LIVE = (kind, ts) => [`g.case_kind = '${kind}' AND ${POLICY} AND ${SOURCES[kind].open}`, [ts, ts, ts, ...SOURCES[kind].args(ts)]];
export async function grantInForce(env, where, value, ts) {
  const kind = (await env.DB.prepare(`SELECT g.case_kind FROM case_grants g WHERE ${where}`).bind(value).first())?.case_kind;
  const s = SOURCES[kind];
  if (!s?.ready(env)) return null;
  const [live, args] = LIVE(kind, ts);
  const g = await env.DB.prepare(`SELECT g.id, g.case_kind, g.case_id, g.purpose, g.party_ref, g.source_revision, g.expires_on,
    g.expires_at, ${s.email} AS party_email, ${s.rental} AS rental_id, r.address FROM case_grants g ${s.join} WHERE ${where} AND ${live}`)
    .bind(value, ...args).first();
  const email = g && emailAddress(g.party_email ?? "");
  if (email && await sha256(email) === g.source_revision) return { ...g, email };
  // Not in force: when it is because of its case, that is recorded so it never comes back.
  const open = g ?? await env.DB.prepare(`SELECT g.case_id FROM case_grants g WHERE ${where} AND g.case_kind = ?
    AND g.status IN ('dormant', 'active')`).bind(value, kind).first();
  if (open) await closeStale(env, open.case_id, ts, kind);
  return null;
}
// Inside a batch: fails it (NOT NULL, like ensureChanged) unless that grant is still in force with the same email.
export const stillInForce = (env, g, ts) => {
  const s = SOURCES[g.case_kind], [live, args] = LIVE(g.case_kind, ts);
  return env.DB.prepare(`INSERT INTO landlords (name) SELECT NULL WHERE NOT EXISTS
    (SELECT 1 FROM case_grants g ${s.join} WHERE g.id = ? AND ${s.email} = ? AND ${live})`).bind(g.id, g.party_email, ...args);
};

// Spec «cambio receptor invalida hijos»: a case's open grants whose recipient email changed, or all of them once the
// tenancy ended or its property was archived, are closed for good with the reason, so putting the old email back,
// moving the move-out or restoring the property revives neither them nor their sessions.
export async function closeStale(env, caseId, ts, kind = "tenancy") {
  const t = await env.DB.prepare(SOURCES[kind].row).bind(caseId).first();
  const email = emailAddress(t?.email ?? ""), archived = !!t?.archived_at, ended = !t || (!!t.ended_on && t.ended_on <= day(ts));
  await env.DB.prepare(`UPDATE case_grants SET status = 'closed', closed_at = ?, closed_reason = ? WHERE case_kind = ?
    AND case_id = ? AND status IN ('dormant', 'active') AND (? OR source_revision <> ?)`)
    .bind(ts, archived ? "property_archived" : ended ? "tenancy_ended" : "recipient_changed", kind, caseId, archived || ended ? 1 : 0,
      email ? await sha256(email) : "").run();
}

const denied = () => fail(403, "You are not authorised to give this access on this case.");
async function capability(env, g, actor) {
  const request = { caseRef: await SOURCES[g.caseRef.kind].staff(env, g.caseRef.id), capability: "case_data_write", purpose: g.purpose };
  const snapshot = await requireCaseCapability(env, request, actor).catch(e => (e?.status === 403 ? denied() : Promise.reject(e)));
  return { request, snapshot, guard: await prepareCaseCapabilityGuard(env, request, actor, snapshot) };
}

// A dormant grant; its link token is returned this once and kept only as its hash.
export async function createCaseGrant(env, { caseRef, purpose, party_ref, recipient_ref, expires_on, source_revision }, actor) {
  if (!OPERATIONS[purpose] || caseRef?.kind !== PURPOSE_KIND[purpose] || !Number.isSafeInteger(caseRef.id) || typeof party_ref !== "string"
    || typeof recipient_ref !== "string" || !/^[0-9a-f]{64}$/.test(source_revision ?? "")) fail(400, "This access is not available.");
  const today = jerseyToday();
  if (!realDate(expires_on) || expires_on < today || expires_on > plusDays(today, MAX_DAYS))
    fail(400, "Choose the last day the link works: today or a later day, within a year.");
  const { request, snapshot, guard } = await capability(env, { caseRef, purpose }, actor);
  const id = crypto.randomUUID(), token = makeCaseToken(), ts = now();
  try {
    await env.DB.batch([guard.assertion, env.DB.prepare(`INSERT INTO case_grants (id, case_kind, case_id, purpose, policy_revision, party_ref,
      recipient_ref, source_revision, token_hash, expires_on, expires_at, status, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dormant', ?, ?)`)
      .bind(id, caseRef.kind, caseRef.id, purpose, snapshot.policyRevision, party_ref, recipient_ref, source_revision,
        await hashCaseToken(token), expires_on, caseExpiresAt(expires_on), ts, actor), guard.release]);
  } catch (e) { await requireCaseCapability(env, request, actor).catch(denied); throw e; }
  return { id, token };
}

// sent: the link starts to work (a person delivered it; needs the capability again). revoke: any staff may close access.
export async function markCaseGrant(env, id, action, actor) {
  const g = UUID.test(id) && await env.DB.prepare("SELECT case_kind, case_id, purpose FROM case_grants WHERE id = ?").bind(id).first();
  if (!g) fail(404, "Link not found");
  const ts = now();
  if (action === "revoke") {
    const r = await env.DB.prepare(`UPDATE case_grants SET status = 'revoked', revoked_at = ?, revoked_by = ?
      WHERE id = ? AND status IN ('dormant', 'active')`).bind(ts, actor, id).run();
    if (!r.meta.changes) fail(409, "This link was already revoked or no longer works.");
    return g;
  }
  const { request, guard } = await capability(env, { caseRef: { kind: g.case_kind, id: g.case_id }, purpose: g.purpose }, actor);
  try {
    await env.DB.batch([guard.assertion, env.DB.prepare(`UPDATE case_grants SET status = 'active', sent_at = ?, sent_by = ?
      WHERE id = ? AND status = 'dormant' AND expires_at > ?`).bind(ts, actor, id, ts), ensureChanged(env), guard.release]);
  } catch {
    await requireCaseCapability(env, request, actor).catch(denied);
    fail(409, "This link was already recorded as sent, was revoked or has expired. Reload.");
  }
  return g;
}

// The code: one try reserved atomically (never more than 5 per code), checked in constant time under the current key;
// the right one opens a session once (a replay finds it verified). Returns the session token for the cookie.
export async function verifyCaseChallenge(env, { challenge_id, code } = {}) {
  if (typeof challenge_id !== "string" || !UUID.test(challenge_id) || typeof code !== "string" || !/^\d{6}$/.test(code))
    fail(400, "Enter the 6-digit code from the email.");
  const secret = caseKey(env), ts = now();
  const c = await env.DB.prepare(`UPDATE case_challenges SET attempts = attempts + 1 WHERE id = ? AND status = 'open'
    AND attempts < ${MAX_TRIES} AND expires_at > ? RETURNING grant_id, digest, key_id, attempts`).bind(challenge_id, ts).first();
  if (!c) fail(410, EXPIRED);
  const g = await grantInForce(env, "g.id = ?", c.grant_id, ts);
  if (!g) gone();
  if (c.key_id !== await keyId(secret) || !(await verifyDigest(secret, c.digest, challenge_id, c.grant_id, code))) {
    if (c.attempts < MAX_TRIES) fail(400, "That code is not right. Check the latest email from Hampton Estates.");
    await env.DB.prepare("UPDATE case_challenges SET status = 'failed' WHERE id = ? AND status = 'open'").bind(challenge_id).run();
    fail(410, EXPIRED);
  }
  const token = makeCaseToken(), expires = Math.min(Date.parse(ts) + SESSION_MS, Date.parse(g.expires_at));
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE case_challenges SET status = 'verified' WHERE id = ? AND status = 'open' AND expires_at > ?").bind(challenge_id, ts),
      ensureChanged(env),
      stillInForce(env, g, ts),
      env.DB.prepare(`INSERT INTO case_sessions (token_hash, grant_id, challenge_id, purpose, source_revision, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(await hashCaseToken(token), g.id, challenge_id, g.purpose, g.source_revision, ts,
        new Date(expires).toISOString()),
    ]);
  } catch { fail(410, EXPIRED); }
  return { token, expires_at: new Date(expires).toISOString(), max_age: Math.floor((expires - Date.parse(ts)) / 1000) };
}

// Sign out: the session behind this request's case cookie ends in the database at once (the route clears the cookie).
export async function endCaseSession(env, request) {
  const token = getCookie(request, COOKIE), ts = now();
  if (token && TOKEN.test(token)) await env.DB.prepare("UPDATE case_sessions SET expires_at = ? WHERE token_hash = ? AND expires_at > ?")
    .bind(ts, await hashCaseToken(token), ts).run();
}

// The party behind this request's case cookie, for this purpose, case (if given) and operation; null otherwise. Derived
// on the server from the session and its grant, read again now; never from ids in the request.
export async function resolveCaseActor(env, request, { purpose, caseRef, operation }) {
  const token = getCookie(request, COOKIE);
  if (!token || !TOKEN.test(token) || !OPERATIONS[purpose]?.includes(operation)) return null;
  const ts = now(), session = await hashCaseToken(token);
  const s = await env.DB.prepare("SELECT grant_id, purpose, source_revision FROM case_sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(session, ts).first();
  const g = s && await grantInForce(env, "g.id = ?", s.grant_id, ts);
  if (!g || s.purpose !== purpose || g.purpose !== purpose || s.source_revision !== g.source_revision) return null;
  if (caseRef && (caseRef.kind !== g.case_kind || caseRef.id !== g.case_id)) return null;
  return Object.freeze({ kind: "case_party", purpose, operation, caseRef: { kind: g.case_kind, id: g.case_id }, party_ref: g.party_ref,
    session, grant: g });
}
