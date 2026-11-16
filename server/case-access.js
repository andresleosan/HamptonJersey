// ADM-12 (ADM12_CASE_ACCESS_READY, migration 0110; plan tp03-adm-12, Tarea 1; spec tp03-case-evidence): external access
// by purpose. A grant is one purpose on one case for one party: created by staff holding ADM-18's case_data_write for
// that purpose and case (server/case-capabilities.js, migrations 0046 and 0049), dormant until a person records sending
// the link, and in force until the Jersey day after the date the team chose starts (R04: required, no default). With the
// link the party asks for a code (case-auth-email.js); the right code gives a 30-minute session for that grant only.
// Every read and write checks the grant again: revoked, expired, a new recipient email, an ended tenancy or an archived
// property end it. Without the operator's key (CASE_CHALLENGE_HMAC_KEY) or before 0110, every route answers 503.
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
// The purposes built so far and the operations each allows. rental_application, tenancy_reference and renewal_response
// come with ADM-18, ADM-19 and ADM-14, which add their own entry here.
const OPERATIONS = { repair_report: ["read", "submit"] };

// R04: the start of the Jersey day after the date chosen (midnight always exists in Jersey: clocks change at 01:00 GMT).
export const caseExpiresAt = date => [3600, 0].map(o => jerseyViewingInstant(plusDays(date, 1), "00:00", o)).find(Boolean);

// Every case-access route: closed without the operator's key or before migration 0110.
export const keyed = handler => async ctx => {
  if (!caseKey(ctx.env)) fail(503, NOT_READY);
  try { return await handler(ctx); }
  catch (e) { if (/no such table/.test(e?.message ?? "")) fail(503, NOT_READY); throw e; }
};

// A grant in force: sent, not revoked, before its expiry, on a tenancy still running in a property not archived, whose
// tenant's email is still the one the link was made for (its hash, source_revision). In a batch the email is bound as read.
const FROM = "case_grants g JOIN tenancies t ON t.id = g.case_id JOIN rentals r ON r.id = t.rental_id";
const LIVE = `g.case_kind = 'tenancy' AND g.status = 'active' AND g.expires_at > ? AND (t.ended_on IS NULL OR t.ended_on > ?)
  AND r.archived_at IS NULL`;
const day = ts => jerseyToday(new Date(ts));
export async function grantInForce(env, where, value, ts) {
  const g = await env.DB.prepare(`SELECT g.id, g.case_kind, g.case_id, g.purpose, g.party_ref, g.source_revision, g.expires_on,
    g.expires_at, t.tenant_email, t.rental_id, r.address FROM ${FROM} WHERE ${where} AND ${LIVE}`).bind(value, ts, day(ts)).first();
  const email = g && emailAddress(g.tenant_email ?? "");
  return email && await sha256(email) === g.source_revision ? { ...g, email } : null;
}
// Inside a batch: fails it (NOT NULL, like ensureChanged) unless that grant is still in force with the same email.
export const stillInForce = (env, g, ts) => env.DB.prepare(`INSERT INTO landlords (name) SELECT NULL WHERE NOT EXISTS
  (SELECT 1 FROM ${FROM} WHERE g.id = ? AND t.tenant_email = ? AND ${LIVE})`).bind(g.id, g.tenant_email, ts, day(ts));

const denied = () => fail(403, "You are not authorised to give this access on this case.");
async function capability(env, g, actor) {
  const request = { caseRef: g.caseRef, capability: "case_data_write", purpose: g.purpose };
  const snapshot = await requireCaseCapability(env, request, actor).catch(e => (e?.status === 403 ? denied() : Promise.reject(e)));
  return { request, guard: await prepareCaseCapabilityGuard(env, request, actor, snapshot) };
}

// A dormant grant; its link token is returned this once and kept only as its hash.
export async function createCaseGrant(env, { caseRef, purpose, party_ref, recipient_ref, expires_on, source_revision }, actor) {
  if (!OPERATIONS[purpose] || caseRef?.kind !== "tenancy" || !Number.isSafeInteger(caseRef.id) || typeof party_ref !== "string"
    || typeof recipient_ref !== "string" || !/^[0-9a-f]{64}$/.test(source_revision ?? "")) fail(400, "This access is not available.");
  const today = jerseyToday();
  if (!realDate(expires_on) || expires_on < today || expires_on > plusDays(today, MAX_DAYS))
    fail(400, "Choose the last day the link works: today or a later day, within a year.");
  const { request, guard } = await capability(env, { caseRef, purpose }, actor);
  const id = crypto.randomUUID(), token = makeCaseToken(), ts = now();
  try {
    await env.DB.batch([guard.assertion, env.DB.prepare(`INSERT INTO case_grants (id, case_kind, case_id, purpose, party_ref, recipient_ref,
      source_revision, token_hash, expires_on, expires_at, status, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dormant', ?, ?)`)
      .bind(id, caseRef.kind, caseRef.id, purpose, party_ref, recipient_ref, source_revision, await hashCaseToken(token), expires_on,
        caseExpiresAt(expires_on), ts, actor), guard.release]);
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
    if (!r.meta.changes) fail(409, "This link was already revoked.");
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
