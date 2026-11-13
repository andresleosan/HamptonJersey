import { HttpError } from './http.js';

// Internal server-side primitives for structured case data. The migration seeds
// no access and this module provides no grant, bootstrap or administration API.
// `actor` must be the authenticated staff identity obtained by the calling route;
// never accept it from the request body, query string or client-provided claims.
const TABLES = Object.freeze({ rental:'rentals', tenancy:'tenancies', sale:'sales', rental_application:'rental_applications' });
const CAPABILITIES = new Set(['case_data_read','case_data_write','sensitive_finance']);
const PURPOSE_CASES = Object.freeze({
  rental_application:new Set(['rental','rental_application']),
  tenancy_reference:new Set(['tenancy','rental_application']),
  repair_report:new Set(['rental','tenancy']),
  renewal_response:new Set(['tenancy']),
  arrears_management:new Set(['tenancy']),
  // A single case does not prove authority over an entire landlord statement.
  // ADM-10 must supply a separate owner-wide scope before this can be enabled.
  landlord_statement:new Set(),
  sale_review:new Set(['sale']),
});
const deny = () => { throw new HttpError(403, 'Case access unavailable'); };
const primary = db => typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
const database = env => {
  if (!env?.DB || typeof env.DB.prepare!=='function' || typeof env.DB.batch!=='function') deny();
  return env.DB;
};

function scope(input, actor) {
  const ref=input?.caseRef, kind=ref?.kind, id=ref?.id, capability=input?.capability, purpose=input?.purpose;
  if (!ref || !Object.hasOwn(TABLES,kind) || !Number.isSafeInteger(id) || id<1 || !CAPABILITIES.has(capability) ||
      !Object.hasOwn(PURPOSE_CASES,purpose) || !PURPOSE_CASES[purpose].has(kind) ||
      typeof actor!=='string' || actor.length>254 || actor!==actor.trim().toLowerCase() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actor)) deny();
  return {kind,id,capability,purpose,actor,table:TABLES[kind]};
}

async function ensureSchema(db, table) {
  const required=['case_purpose_policies','case_capability_memberships','case_capability_grants',
    'case_capability_batch_assertions',table];
  const result=await primary(db).prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?,?,?,?)`)
    .bind(...required).all();
  if (new Set(result.results.map(row=>row.name)).size!==required.length) deny();
}

function selection(table, constrained) {
  // `table` comes only from TABLES, never from a request or database value.
  return `SELECT g.id AS grant_id,g.version AS grant_version,m.version AS membership_version,p.revision AS policy_revision
    FROM case_capability_memberships m
    JOIN admins a ON a.email=m.staff_email
    JOIN case_capability_grants g ON g.case_kind=m.case_kind AND g.case_id=m.case_id AND g.staff_email=m.staff_email
    JOIN case_purpose_policies p ON p.purpose=g.purpose
    WHERE m.case_kind=? AND m.case_id=? AND m.staff_email=? AND m.status='active'
      AND g.capability=? AND g.purpose=? AND g.status='active' AND g.membership_version=m.version
      AND p.status='approved' AND p.revision=g.policy_revision
      AND p.retention_ref IS NOT NULL AND p.privacy_ref IS NOT NULL AND p.approval_ref IS NOT NULL AND p.approved_by IS NOT NULL
      AND p.valid_from<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND (p.expires_at IS NULL OR p.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      AND g.valid_from<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND (g.expires_at IS NULL OR g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      AND EXISTS (SELECT 1 FROM ${table} c WHERE c.id=m.case_id)
      ${constrained ? 'AND g.id=? AND g.version=? AND m.version=? AND p.revision=?' : ''}`;
}
const baseArgs = s => [s.kind,s.id,s.actor,s.capability,s.purpose];

// A preflight result is not sufficient to protect a later read or write. Owners
// must revalidate it inside the same DB.batch as each sensitive SELECT/mutation.
export async function requireCaseCapability(env, input, actor) {
  const s=scope(input,actor), db=database(env);
  await ensureSchema(db,s.table);
  const found=await primary(db).prepare(selection(s.table,false)).bind(...baseArgs(s)).first();
  if (!found) deny();
  return Object.freeze({caseRef:Object.freeze({kind:s.kind,id:s.id}),capability:s.capability,purpose:s.purpose,
    grantId:found.grant_id,grantVersion:found.grant_version,membershipVersion:found.membership_version,policyRevision:found.policy_revision});
}

// The assertion must precede, and release must follow, the owner's statements
// in ONE D1 batch. Failure rolls back the owner's operation and the assertion.
export async function prepareCaseCapabilityGuard(env, input, actor, snapshot) {
  const s=scope(input,actor), db=database(env), ref=snapshot?.caseRef;
  if (!ref || ref.kind!==s.kind || ref.id!==s.id || snapshot.capability!==s.capability || snapshot.purpose!==s.purpose ||
      typeof snapshot.grantId!=='string' || !snapshot.grantId || snapshot.grantId.length>120 ||
      ![snapshot.grantVersion,snapshot.membershipVersion,snapshot.policyRevision].every(v=>Number.isSafeInteger(v)&&v>0)) deny();
  await ensureSchema(db,s.table);
  const assertionId=crypto.randomUUID(), args=[...baseArgs(s),snapshot.grantId,snapshot.grantVersion,
    snapshot.membershipVersion,snapshot.policyRevision];
  return Object.freeze({
    assertion:db.prepare(`INSERT INTO case_capability_batch_assertions(id,permitted)
      SELECT ?,CASE WHEN EXISTS (${selection(s.table,true)}) THEN 1 ELSE 0 END`).bind(assertionId,...args),
    release:db.prepare('DELETE FROM case_capability_batch_assertions WHERE id=?').bind(assertionId),
  });
}
