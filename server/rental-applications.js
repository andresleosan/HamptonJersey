// ADM-18 (ADM18_APPLICATION_READY, migration 0117; plan tp03-adm-18; spec tp03-lifecycle «Solicitud y referencias»): a
// prospective tenant's rental application. Staff open one for a property and an applicant they pick, with the monthly rent
// asked; the applicant fills it in through a case-access link (ADM-12, purpose rental_application) with their work,
// incomes (amount, how often, before or after tax, currency), dependants, referees and an optional guarantor. Staff read
// it, see the affordability rule's explained result and decide; accepting creates no tenancy, offer or listing change (ADM-06
// keeps that). Reading the answers needs ADM-18's case_data_read and every staff write case_data_write for
// rental_application on that property, checked again inside the same batch (case-capabilities.js, migrations 0046 and 0049).
// Answers never go into events, notifications or the applicant's record: events carry the application's id and status.
//
// Affordability (Hampton's criteria, ADM18_AFFORDABILITY_POLICY): a version, the basis (gross or net), the most of a year's
// income the year's rent may take (max_rent_share, 0 to 1) and where the rule comes from. Until Hampton approves them the
// values are placeholders (###) and every result is needs_human_review: no ratio is invented and nothing is rejected
// automatically. Incomes are converted to a year explicitly (weekly x52, monthly x12, annual x1) and only in GBP; a missing
// amount is unknown, never 0; gross and net are never added together or compared with each other.
import { fail, now, sha256 } from "./http.js";
import { emailAddress } from "./email.js";
import { requireCaseCapability, prepareCaseCapabilityGuard } from "./case-capabilities.js";
import { ensureChanged, rentalEvent } from "./routes/rentals.js";
import { createCaseGrant, stillInForce, closeStale } from "./case-access.js";

export const applicationReady = env => env?.ADM18_APPLICATION_READY === "1";
const PURPOSE = "rental_application";
export const PERIODS = { weekly: 52, monthly: 12, annual: 1 };
export const BASES = ["gross", "net"], CURRENCIES = ["GBP", "other"];
export const EMPLOYMENT = ["employed", "self_employed", "not_working", "retired", "student"];
export const REFERENCE_KINDS = ["employer", "landlord", "personal"];
// Each decision and the statuses it can be taken from; accepted, declined and withdrawn are final.
export const DECISIONS = { under_review: ["submitted"], accepted: ["submitted", "under_review"], declined: ["submitted", "under_review"],
  withdrawn: ["draft", "submitted", "under_review"] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STALE = "Someone else changed this application meanwhile. Reload to see it (nothing was saved).";

// Hampton's criteria, or null while any value is a placeholder or not valid.
export function affordabilityPolicy(env) {
  let p;
  try { p = JSON.parse(env?.ADM18_AFFORDABILITY_POLICY ?? ""); } catch { return null; }
  const text = (v, max) => typeof v === "string" && v.trim() && v.length <= max && !v.includes("#");
  if (!p || !text(p.version, 60) || !BASES.includes(p.basis) || !text(p.sources, 500) || typeof p.max_rent_share !== "number"
    || !(p.max_rent_share > 0 && p.max_rent_share <= 1)) return null;
  return { version: p.version, basis: p.basis, max_rent_share: p.max_rent_share, sources: p.sources };
}

// rent: whole pounds a month. Every input and conversion is returned, so a person can follow the result.
export function evaluateAffordability({ income, rent, policy }) {
  const list = Array.isArray(income) ? income : [];
  const incomes = list.map(i => ({ amount: i?.amount ?? null, period: i?.period, basis: i?.basis, currency: i?.currency,
    factor: PERIODS[i?.period] ?? null, annual: Number.isSafeInteger(i?.amount) && PERIODS[i?.period] ? i.amount * PERIODS[i.period] : null }));
  const inputs = { rent_monthly: rent, annual_rent: rent * 12, incomes, annual_income: null, rent_share: null };
  const result = (status, reason = null) => ({ status, reason, inputs, policy_version: policy?.version ?? null });
  const review = reason => result("needs_human_review", reason);
  if (!incomes.length || incomes.some(i => i.annual == null)) return review("income_unknown");
  if (incomes.some(i => i.currency !== "GBP")) return review("currency");
  if (new Set(incomes.map(i => i.basis)).size > 1) return review("basis_mixed");
  inputs.annual_income = incomes.reduce((sum, i) => sum + i.annual, 0);
  inputs.rent_share = inputs.annual_income > 0 ? inputs.annual_rent / inputs.annual_income : null;
  if (!policy) return review("no_policy");
  if (policy.basis !== incomes[0].basis) return review("basis_policy");
  return result(inputs.rent_share != null && inputs.rent_share <= policy.max_rent_share ? "within_policy" : "outside_policy");
}

// The applicant's answers, checked field by field: {value} or {errors}.
export function validateAnswers(a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return { errors: { answers: "Fill in the form." } };
  const errors = {}, bad = (k, m) => ((errors[k] = m), null);
  const str = (v, max) => (typeof v === "string" && v.trim() && v.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(v) ? v.trim() : null);
  const opt = (k, v, max) => (v == null || v === "" ? null : str(v, max) ?? bad(k, `Up to ${max} characters.`));
  const count = (k, v, max, m) => (v == null || v === "" ? null : Number.isSafeInteger(v) && v >= 0 && v <= max ? v : bad(k, m));
  const e = a.employment ?? {};
  const employment = { status: EMPLOYMENT.includes(e.status) ? e.status : bad("employment", "Choose your work situation."),
    employer: opt("employer", e.employer, 120), role: opt("role", e.role, 120) };
  const incomes = Array.isArray(a.incomes) && a.incomes.length >= 1 && a.incomes.length <= 4 ? a.incomes.map((i, n) => {
    const amount = count(`income_${n}`, i?.amount, 10_000_000, "Enter whole pounds, or leave the amount empty.");
    if (!PERIODS[i?.period] || !BASES.includes(i?.basis) || !CURRENCIES.includes(i?.currency))
      bad(`income_${n}`, "Choose how often it is paid, before or after tax, and the currency.");
    return { amount, period: i?.period, basis: i?.basis, currency: i?.currency };
  }) : bad("incomes", "Add from 1 to 4 incomes.");
  const dependants = count("dependants", a.dependants, 20, "Enter a number from 0 to 20, or leave it empty.");
  const references = a.references == null ? [] : Array.isArray(a.references) && a.references.length <= 3 ? a.references.map((r, n) => {
    const v = { kind: REFERENCE_KINDS.includes(r?.kind) ? r.kind : null, name: str(r?.name, 120), email: emailAddress(r?.email ?? "") };
    if (!v.kind || !v.name || !v.email) bad(`reference_${n}`, "Give each referee's relationship, name and email.");
    return v;
  }) : bad("references", "Up to 3 referees.");
  const g = a.guarantor, guarantor = g == null ? null : { name: str(g?.name, 120), email: emailAddress(g?.email ?? "") };
  if (guarantor && (!guarantor.name || !guarantor.email)) bad("guarantor", "Give the guarantor's name and email, or leave it out.");
  return Object.keys(errors).length ? { errors } : { value: { employment, incomes, dependants, references, guarantor } };
}

// The owner's statements run between ADM-18's assertion and its release, in one batch: a capability revoked meanwhile
// rolls them back (403). Another failure is rethrown as it was.
async function guarded(env, rentalId, capability, actor, statements) {
  const request = { caseRef: { kind: "rental", id: rentalId }, capability, purpose: PURPOSE };
  const snapshot = await requireCaseCapability(env, request, actor);
  const guard = await prepareCaseCapabilityGuard(env, request, actor, snapshot);
  try { return (await env.DB.batch([guard.assertion, ...statements, guard.release])).slice(1, -1); }
  catch (e) { await requireCaseCapability(env, request, actor); throw e; }
}
const posInt = v => (Number.isSafeInteger(v) && v > 0 ? v : null);

export async function createRentalApplication(env, { rental_id, applicant_id, rent }, actor) {
  if (!posInt(rent) || rent > 1_000_000) return { errors: { rent: "Enter the monthly rent in whole pounds." } };
  const ok = await env.DB.prepare(`SELECT (SELECT 1 FROM rentals WHERE id = ? AND archived_at IS NULL) AS rental,
    (SELECT 1 FROM applicants WHERE id = ? AND operation = 'rent' AND archived_at IS NULL) AS applicant`)
    .bind(posInt(rental_id), posInt(applicant_id)).first();
  if (!ok.rental) fail(409, "Restore the property before opening an application.");
  if (!ok.applicant) fail(409, "Choose an applicant looking to rent who is not archived.");
  const ts = now();
  try {
    const [r] = await guarded(env, rental_id, "case_data_write", actor, [
      env.DB.prepare(`INSERT INTO rental_applications (rental_id, applicant_id, rent, created_at, created_by, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(rental_id, applicant_id, rent, ts, actor, ts, actor),
      rentalEvent(env, { rental_id, actor, type: "rental_application.opened" }, { application_id: "rental_applications" }),
    ]);
    return { id: r.meta.last_row_id };
  } catch (e) {
    if (/UNIQUE/.test(e?.message ?? "")) fail(409, "This applicant already has an open application for this property.");
    throw e;
  }
}

// The property's applications without their answers (newest 50), and the rent applicants one can be opened for.
export async function listRentalApplications(env, rentalId) {
  const [applications, candidates] = (await env.DB.batch([
    env.DB.prepare(`SELECT a.id, a.applicant_id, c.name AS applicant_name, a.status, a.rent, a.created_at, a.created_by, a.submitted_at,
      a.decided_at FROM rental_applications a JOIN applicants ap ON ap.id = a.applicant_id JOIN contacts c ON c.id = ap.contact_id
      WHERE a.rental_id = ? ORDER BY a.id DESC LIMIT 50`).bind(rentalId),
    env.DB.prepare(`SELECT ap.id, c.name FROM applicants ap JOIN contacts c ON c.id = ap.contact_id
      WHERE ap.operation = 'rent' AND ap.archived_at IS NULL ORDER BY c.name, ap.id LIMIT 500`),
  ])).map(r => r.results);
  return { enabled: true, applications, candidates };
}

const rentalOf = async (env, id) =>
  (await env.DB.prepare("SELECT rental_id, rent, answers FROM rental_applications WHERE id = ?").bind(id).first()) ?? fail(404, "Application not found");

// One application with its answers, the rule's result and its links: case_data_read, checked in the same batch as the read.
export async function readRentalApplication(env, id, actor) {
  const { rental_id } = await rentalOf(env, id);
  const [r] = await guarded(env, rental_id, "case_data_read", actor, [env.DB.prepare(`SELECT a.id, a.rental_id, a.applicant_id,
    c.name AS applicant_name, ap.housing_status, r.address, a.rent, a.status, a.revision, a.answers, a.submitted_at, a.affordability_status,
    a.policy_version, a.decision_reason, a.decided_at, a.decided_by, a.created_at, a.created_by FROM rental_applications a
    JOIN rentals r ON r.id = a.rental_id JOIN applicants ap ON ap.id = a.applicant_id JOIN contacts c ON c.id = ap.contact_id
    WHERE a.id = ?`).bind(id)]);
  const { answers, ...application } = r.results[0];
  const parsed = answers ? JSON.parse(answers) : null, policy = affordabilityPolicy(env);
  const ts = now();
  await closeStale(env, id, ts, "rental_application");
  const links = (await env.DB.prepare(`SELECT id, status, expires_on, expires_at, created_at, created_by, sent_at, sent_by, revoked_at,
    revoked_by, closed_at, closed_reason FROM case_grants WHERE case_kind = 'rental_application' AND case_id = ? ORDER BY created_at DESC
    LIMIT 20`).bind(id).all()).results.map(({ expires_at, ...g }) => ({ ...g, expired: expires_at <= ts }));
  return { application, answers: parsed, policy, links,
    evaluation: parsed && evaluateAffordability({ income: parsed.incomes, rent: application.rent, policy }) };
}

// A link for the applicant on a draft application; the code goes to the applicant's email (its hash is kept).
export async function createApplicationLink(env, id, expires_on, actor) {
  const a = await env.DB.prepare(`SELECT a.status, r.archived_at, c.email FROM rental_applications a JOIN rentals r ON r.id = a.rental_id
    JOIN applicants ap ON ap.id = a.applicant_id JOIN contacts c ON c.id = ap.contact_id WHERE a.id = ?`).bind(id).first()
    ?? fail(404, "Application not found");
  if (a.status !== "draft" || a.archived_at) fail(409, "Only an application not sent yet, on a property not archived, can have a link.");
  const email = emailAddress(a.email ?? "");
  if (!email) fail(409, "Add the applicant's email first: the code is sent there.");
  return createCaseGrant(env, { caseRef: { kind: "rental_application", id }, purpose: PURPOSE, party_ref: "applicant",
    recipient_ref: "applicant_email", expires_on, source_revision: await sha256(email) }, actor);
}

// The applicant (a case-access actor for this purpose): the draft is sent once; the same operation again is the same receipt.
export async function submitRentalApplication(env, party, { operation_id, revision, answers } = {}) {
  if (typeof operation_id !== "string" || !UUID.test(operation_id) || !posInt(revision)) fail(400, "Reload the page and try again.");
  const g = party.grant, receipt = () => env.DB.prepare(`SELECT submit_operation_id AS id, submitted_at AS at FROM rental_applications
    WHERE id = ? AND submit_operation_id = ?`).bind(g.case_id, operation_id).first();
  const done = await receipt();
  if (done) return { receipt: done };
  const v = validateAnswers(answers);
  if (v.errors) return v;
  const ts = now();
  try {
    await env.DB.batch([
      stillInForce(env, g, ts),
      env.DB.prepare(`UPDATE rental_applications SET status = 'submitted', answers = ?, submit_operation_id = ?, submitted_at = ?,
        revision = revision + 1, updated_at = ?, updated_by = 'applicant' WHERE id = ? AND status = 'draft' AND revision = ?
        AND EXISTS (SELECT 1 FROM case_sessions WHERE token_hash = ? AND grant_id = ? AND expires_at > ?)`)
        .bind(JSON.stringify(v.value), operation_id, ts, ts, g.case_id, revision, party.session, g.id, ts),
      ensureChanged(env),
      rentalEvent(env, { rental_id: g.rental_id, actor: "applicant", type: "rental_application.submitted", data: { application_id: g.case_id } }),
    ]);
  } catch {
    const again = await receipt();
    if (again) return { receipt: again };
    return { stale: true };
  }
  return { receipt: { id: operation_id, at: ts }, created: true };
}

// A person's decision with its reason. accepted and declined keep the rule's result and version the reviewer saw: if the
// rule changed since, nothing is saved (409). Nothing else follows: no tenancy, offer, listing or applicant change.
export async function reviewRentalApplication(env, { id, revision, decision, reason, policy_version }, actor) {
  if (!Object.hasOwn(DECISIONS, decision ?? "")) fail(400, "Choose a decision.");
  if (!posInt(revision)) fail(400, "Reload and try again.");
  const why = typeof reason === "string" && reason.trim() ? reason.trim() : null;
  if (why && why.length > 1000) return { errors: { reason: "Up to 1,000 characters." } };
  const final = decision !== "under_review";
  if (final && !why) return { errors: { reason: "Say why: it is kept with the decision." } };
  const a = await rentalOf(env, id), answers = a.answers ? JSON.parse(a.answers) : null;
  const ev = answers && evaluateAffordability({ income: answers.incomes, rent: a.rent, policy: affordabilityPolicy(env) });
  if (["accepted", "declined"].includes(decision) && (ev?.policy_version ?? null) !== (policy_version ?? null))
    fail(409, "The affordability rule changed since you opened this application. Reload and review it again.");
  const ts = now(), from = DECISIONS[decision];
  try {
    await guarded(env, a.rental_id, "case_data_write", actor, [
      env.DB.prepare(`UPDATE rental_applications SET status = ?, revision = revision + 1, decision_reason = ?, affordability_status = ?,
        policy_version = ?, decided_at = ?, decided_by = ?, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ?
        AND status IN (${from.map(() => "?").join(", ")})`).bind(decision, why, final ? ev?.status ?? null : null,
        final ? ev?.policy_version ?? null : null, final ? ts : null, final ? actor : null, ts, actor, id, revision, ...from),
      ensureChanged(env),
      rentalEvent(env, { rental_id: a.rental_id, actor, type: "rental_application.reviewed", data: { application_id: id, status: decision } }),
    ]);
  } catch (e) {
    if (e?.status) throw e;
    fail(409, STALE);
  }
  return { ok: true };
}
