// ADM-19 (migration 0103, flag ADM19_SIGNATURE_READY): the tenancy agreement is signed outside Hampton, and a person
// records what they checked there: who signed (the landlord or each tenant, by role, never a name), the day, and where it
// is recorded (text, never a file or a link). The reviewer and the time are the session's and the server's. There is no
// signing provider, callback, upload or message here, and nothing changes the tenancy, its charges or ADM-06's records.
import { fail, now } from "./http.js";
import { ensureChanged, rentalEvent } from "./routes/rentals.js";
import { evidenceRef } from "./tenancy-origins.js";
import { jerseyToday, realDate } from "./viewings.js";

export const signatureReady = env => env?.ADM19_SIGNATURE_READY === "1";
const TENANTS_MAX = 10;
const STALE = "Someone else saved this meanwhile. Reload to see it (your changes were not saved).";
const CONTRACT = "The signed contract reference changed meanwhile. Reload and check the signatures against it (your changes were not saved).";
const REF_ERR = "Enter where this signature is recorded, up to 120 characters: a reference, not the document";
// The signed contract reference's revision (ADM-06), 0 for none; ?1 = the tenancy.
const CONTRACT_SQL = "COALESCE((SELECT revision FROM tenancy_signed_contracts WHERE tenancy_id = ?1), 0)";

// Who signs, in order: the landlord, then each tenant.
export const partiesFor = tenants => ["landlord", ...Array.from({ length: tenants }, (_, i) => `tenant_${i + 1}`)];
const count = v => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const done = errors => (Object.keys(errors).length ? { errors } : null);
const tenancyRow = async (env, id) => (await env.DB.prepare("SELECT id, rental_id FROM tenancies WHERE id = ?").bind(id).first())
  ?? fail(404, "Tenancy not found");
const contractRevision = async (env, id) => (await env.DB.prepare(`SELECT ${CONTRACT_SQL} AS r`).bind(id).first()).r;

// none: nothing recorded; incomplete: someone still to sign (missing); complete: every party signed, each reviewed;
// out_of_date: the signed contract reference changed after the review. reviewed_*: the latest review.
function status(record, contract_revision) {
  const signed = new Set((record?.signatures ?? []).map(s => s.party));
  const missing = partiesFor(record?.tenants ?? 1).filter(p => !signed.has(p));
  if (!record) return { state: "none", missing };
  const last = record.signatures.reduce((a, s) => (s.reviewed_at > a.reviewed_at ? s : a));
  const state = record.contract_revision !== contract_revision ? "out_of_date" : missing.length ? "incomplete" : "complete";
  return { state, missing, reviewed_by: last.reviewed_by, reviewed_at: last.reviewed_at, reviewed_contract_revision: record.contract_revision };
}

export async function readSignatures(env, tenancy_id) {
  const t = await tenancyRow(env, tenancy_id);
  const [row, contract_revision] = await Promise.all([
    env.DB.prepare("SELECT * FROM tenancy_signature_evidence WHERE tenancy_id = ?").bind(t.id).first(), contractRevision(env, t.id)]);
  const record = row && { ...row, signatures: JSON.parse(row.signatures) };
  return { tenancy_id: t.id, revision: row?.revision ?? 0, contract_revision, tenants: row?.tenants ?? 1,
    signatures: record?.signatures ?? [], status: status(record, contract_revision),
    updated_at: row?.updated_at ?? null, updated_by: row?.updated_by ?? null };
}

function validate({ expectedRevision, contract_revision, tenants, signatures }) {
  const e = {}, today = jerseyToday();
  if (count(expectedRevision) == null) e.expectedRevision = "Reload the page";
  if (count(contract_revision) == null) e.contract_revision = "Reload the page";
  const n = Number.isSafeInteger(tenants) && tenants >= 1 && tenants <= TENANTS_MAX ? tenants : null;
  if (n == null) e.tenants = `Enter how many tenants sign, from 1 to ${TENANTS_MAX}`;
  const allowed = partiesFor(n ?? TENANTS_MAX), seen = new Set();
  if (!Array.isArray(signatures) || !signatures.length || signatures.length > allowed.length)
    e.signatures = "Record at least one signature you checked, each party once";
  const list = (Array.isArray(signatures) ? signatures : []).map((s, i) => {
    const party = s?.party, k = `signatures.${i}`, evidence_ref = evidenceRef(s?.evidence_ref);
    if (!allowed.includes(party)) e[`${k}.party`] = "Choose who signed: the landlord or one of the tenants who sign";
    else if (seen.has(party)) e[`${k}.party`] = "Record each party once";
    seen.add(party);
    if (!(realDate(s?.signed_on) && s.signed_on <= today)) e[`${k}.signed_on`] = "Enter the day it was signed: today or earlier";
    if (!evidence_ref) e[`${k}.evidence_ref`] = REF_ERR;
    return { party, signed_on: s?.signed_on, evidence_ref };
  });
  return { e, list: list.sort((a, b) => allowed.indexOf(a.party) - allowed.indexOf(b.party)) };
}

// The record's next revision (expectedRevision: the one the form read, 0 for none), checked against the signed contract
// reference the form read (contract_revision). A signature exactly as reviewed against that same reference keeps its
// review; any other is reviewed now by the actor. Whatever the body says about reviewers or times is ignored.
export async function saveSignatures(env, { tenancy_id, ...body }, actor) {
  const { e, list } = validate(body);
  if (done(e)) return done(e);
  const rev = body.expectedRevision, crev = body.contract_revision, tenants = body.tenants;
  const t = await tenancyRow(env, tenancy_id);
  const prev = await env.DB.prepare("SELECT revision, signatures, contract_revision FROM tenancy_signature_evidence WHERE tenancy_id = ?")
    .bind(t.id).first();
  if ((prev?.revision ?? 0) !== rev) fail(409, STALE);
  if (await contractRevision(env, t.id) !== crev) fail(409, CONTRACT);
  const ts = now(), next = rev + 1;
  const kept = new Map(prev?.contract_revision === crev ? JSON.parse(prev.signatures).map(s => [s.party, s]) : []);
  const signatures = list.map(s => {
    const k = kept.get(s.party);
    return k && k.signed_on === s.signed_on && k.evidence_ref === s.evidence_ref ? k : { ...s, reviewed_at: ts, reviewed_by: actor };
  });
  const cols = [tenants, JSON.stringify(signatures), crev, ts, actor];
  // The write re-reads the record's revision and the contract reference's: either moved on, it changes nothing.
  const write = rev === 0
    ? env.DB.prepare(`INSERT INTO tenancy_signature_evidence (tenancy_id, revision, tenants, signatures, contract_revision, updated_at,
      updated_by) SELECT ?1, 1, ?2, ?3, ?4, ?5, ?6 WHERE ${CONTRACT_SQL} = ?4 ON CONFLICT DO NOTHING`).bind(t.id, ...cols)
    : env.DB.prepare(`UPDATE tenancy_signature_evidence SET revision = ?7, tenants = ?2, signatures = ?3, contract_revision = ?4,
      updated_at = ?5, updated_by = ?6 WHERE tenancy_id = ?1 AND revision = ?8 AND ${CONTRACT_SQL} = ?4`).bind(t.id, ...cols, next, rev);
  const missing = partiesFor(tenants).length - signatures.length;
  try {
    await env.DB.batch([write, ensureChanged(env),
      // The history keeps counts only: no names, dates or references.
      rentalEvent(env, { rental_id: t.rental_id, tenancy_id: t.id, actor, type: "tenancy.signatures_reviewed",
        data: { revision: next, contract_revision: crev, tenants, signed: signatures.length, missing } })]);
  } catch (x) {
    const row = await env.DB.prepare("SELECT revision FROM tenancy_signature_evidence WHERE tenancy_id = ?").bind(t.id).first();
    if ((row?.revision ?? 0) !== rev) fail(409, STALE);
    if (await contractRevision(env, t.id) !== crev) fail(409, CONTRACT);
    throw x;
  }
  return readSignatures(env, t.id);
}
