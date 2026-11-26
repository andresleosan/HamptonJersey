// AUT-24 (migration 0128, AUT24_TENANT_DOCS_READY): the managed rentals' emails, each prepared, maybe edited, and approved
// by a person (R01) before it leaves:
// - to the lead tenant (the tenancy's own name and tenant_email, never its occupants): the licence copy and the EICR copy
//   (ADM-11, for the tenancy in place as syncTenantChecks dates them) and the deposit's prescribed information, and the
//   notice of a rent change entered with Change rent (ADM-15);
// - to the landlord (landlords.email): the notice of step +10 of the arrears (ADM-03, «Tell the landlord»).
// The carrier sends text only: an email says what is provided and how the tenant gets the document (reply, the office, or
// a link the team pastes). Each save is a new revision written from the source as read (sourceSql: the tenancy, the
// property and what the email is about); a save from a dialog that read another source is refused (409). A team member
// approves one revision, and that queues exactly one row of the approved queue (outbound, server/email.js), which Hermes's
// carrier sends verbatim from Hampton's Gmail (AUT-17). Its claim asks server/rental-email-check.js again. The clock
// writes back what happened (rentalEmailPass): accepted by Gmail, the delivery is recorded once (the check marked done,
// the arrears step marked done, or the rent notice in the history), with the email's reference as evidence; unknown, a
// person checks and it is never sent again; refused, cancelled or no longer claimable, back to a person.
import { json, fail, readJson, now, sha256 } from "./http.js";
import { emailAddress } from "./email.js";
import { emailStop } from "./consultations.js";
import { jerseyToday } from "./viewings.js";
import { rentAssistant } from "./rentals.js";
import { readLegal, calendarReady, tenancyLaw, rentReviewReady } from "./legal-terms.js";
import { ensureCharges, arrearsOf } from "./routes/rent.js";
import { rentalEmailsReady, rentalEmailTable, TEMPLATE, RENTAL_EMAILS, TENANT_DOCS, RENTAL_CLAIMABLE, RENTAL_QUEUE_LIMIT, sourceSql,
  JOINS, RECIPIENT } from "./rental-email-check.js";

export const rentalEmailsOn = async env => rentalEmailsReady(env) && await rentalEmailTable(env);
const KINDS = Object.keys(TEMPLATE), LANDLORD = "landlord_arrears", STEP_DAYS = 10;
const CHANGED = "This email changed. Reload to review it.";
const lit = v => `'${String(v).replaceAll("'", "''")}'`;
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const date = d => DAY.format(new Date(`${d}T12:00:00Z`));
const pounds = v => `£${Number(v).toLocaleString("en-GB")}`;
const pence = v => `£${(v / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const OFFICE = "42 Bath Street, St Helier, Jersey JE2 4ST";
const SIGNATURE = ["Kind regards,", "Hampton Estates", OFFICE];
const HOW = "How to get your copy: reply to this email and we will send it to you, or collect it from our office at " + `${OFFICE}.`;
export const TITLE = { licence_copy: "Licence copy to the tenant", eicr_copy: "EICR copy to the tenant",
  deposit_info: "Deposit's prescribed information to the tenant", rent_notice: "Rent change notice to the tenant",
  [LANDLORD]: "Arrears notice to the landlord" };

// The texts, from this tenancy's own facts only: never another tenant, its occupants, a bank account or the RPI worked out.
export function rentalText(kind, f) {
  const dear = `Dear ${kind === LANDLORD ? f.landlord_name : f.tenant_name},`;
  const body = {
    licence_copy: () => [`As your letting agent for ${f.address}, we are providing you with a copy of the property's rental dwelling licence.`,
      `The licence is dated ${date(f.doc.done_on)}${f.doc.expires_on ? ` and is valid until ${date(f.doc.expires_on)}` : ""}.`, HOW],
    eicr_copy: () => [`As your letting agent for ${f.address}, we are providing you with a copy of the property's Electrical Installation Condition Report (EICR).`,
      `The report is dated ${date(f.doc.done_on)}${f.doc.expires_on ? `, and the next one is due by ${date(f.doc.expires_on)}` : ""}.`, HOW],
    deposit_info: () => [`This email gives you the prescribed information about your tenancy deposit for ${f.address}.`,
      `We received your deposit of ${pounds(f.deposit)} on ${date(f.deposit_received_on)}. It was protected on ${date(f.deposit_protected_on)}${
        f.deposit_ref ? `, reference ${f.deposit_ref}` : ""}.`,
      "The full prescribed information is provided as a document. " + HOW.replace("your copy", "it")],
    rent_notice: () => [`We are writing to let you know that the rent for ${f.address} will change from ${pounds(f.before)} to ${pounds(f.rent)} per calendar month, starting on ${date(f.effective_on)}.`,
      `Please pay the new amount from that date, quoting your payment reference ${f.payment_ref} as now.`,
      "If you have any questions, simply reply to this email."],
    [LANDLORD]: () => [`We are writing about your property at ${f.address}, which we manage for you.`,
      `The rent due on ${date(f.oldest)} has not been paid, and ${pence(f.balance)} is owed on the tenancy as of ${date(f.today)}.`,
      f.steps.length ? `We have already contacted the tenant: ${f.steps.join("; ")}.` : "We are contacting the tenant about it.",
      "We will keep you informed. If you would like to discuss the next steps, simply reply to this email."],
  }[kind]();
  return [dear, ...body, SIGNATURE.join("\n")].join("\n\n");
}
const subjectOf = (kind, f) => ({ licence_copy: `Rental dwelling licence for ${f.address}`, eicr_copy: `Electrical safety report (EICR) for ${f.address}`,
  deposit_info: `Your tenancy deposit for ${f.address}`, rent_notice: `Rent change for ${f.address}`,
  [LANDLORD]: `Rent arrears at ${f.address}` })[kind].slice(0, 400);
// R01: the app never emails bank details. A sort code, an 8-digit account number or an IBAN in the text is refused.
export const bankDetails = text => /\b\d{2}-\d{2}-\d{2}\b|\b\d{8}\b|\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}\b/.test(text);
const STEP_LABEL = { reminder: "a friendly reminder", firm: "a firm reminder", call: "a phone call" };

const gate = async env => { if (!(await rentalEmailsOn(env))) fail(404, "Not found"); };
// What an email of this kind is about, read now: the tenancy (for a tenant's document, the one in place on that property),
// the party and its address, the source's key and version, the facts of the text, and why it cannot go now (blocked).
async function subject(env, scope, id, kind) {
  // A tenant's document opens by its property (the tenancy in place) or by its tenancy, so one whose result is unknown
  // stays reachable after that tenancy ended; the landlord's and the rent notice only by the tenancy.
  if (!KINDS.includes(kind) || (scope === "rentals" && !TENANT_DOCS.includes(kind))) fail(404, "Not found");
  if (TENANT_DOCS.includes(kind) && !calendarReady(env)) fail(404, "Not found");
  const today = jerseyToday();
  const tid = scope === "tenancies" ? Number(id) : (await env.DB.prepare(`SELECT n.id FROM tenancies n WHERE n.rental_id = ?
    AND (n.ended_on IS NULL OR n.ended_on > ?) AND (? <> 'deposit_info' OR n.deposit_received_on IS NOT NULL) ORDER BY n.start_on, n.id LIMIT 1`)
    .bind(Number(id), today, kind).first())?.id ?? fail(404, "No tenancy in place on this property");
  let key = "", extra = {}, blocked = null;
  if (kind === "rent_notice") {
    const rc = await env.DB.prepare(`SELECT rc.*, (SELECT p.rent FROM rent_changes p WHERE p.tenancy_id = rc.tenancy_id AND p.effective_on < rc.effective_on
      ORDER BY p.effective_on DESC LIMIT 1) AS before FROM rent_changes rc WHERE rc.tenancy_id = ? AND rc.effective_on > (SELECT MIN(effective_on)
      FROM rent_changes WHERE tenancy_id = rc.tenancy_id) ORDER BY rc.created_at DESC, rc.id DESC LIMIT 1`).bind(tid).first();
    if (rc) { key = String(rc.id); extra = { rent: rc.rent, before: rc.before, effective_on: rc.effective_on }; }
    blocked = !rc ? "No rent change is recorded after the start. Use Change rent first."
      : rc.effective_on <= today ? "This rent change has already started, so the app does not send a notice for it." : null;
  }
  if (kind === LANDLORD) {
    const [, { results: [a] }, { results: steps }] = await env.DB.batch([ensureCharges(env, today, tid),
      env.DB.prepare(`WITH ${arrearsOf(env)} SELECT * FROM arrears`).bind(today, tid),
      env.DB.prepare("SELECT charge_due_on, step, done_at FROM arrears_steps WHERE tenancy_id = ? ORDER BY done_at").bind(tid)]);
    if (a?.oldest_unpaid_on) key = a.oldest_unpaid_on;
    const mine = steps.filter(s => s.charge_due_on === key);
    extra = { oldest: key, balance: a?.balance, today, steps: mine.filter(s => STEP_LABEL[s.step])
      .map(s => `${STEP_LABEL[s.step]} on ${date(jerseyToday(new Date(s.done_at)))}`) };
    blocked = !a?.oldest_unpaid_on || a.days_late < STEP_DAYS ? `The landlord is told ${STEP_DAYS} days after the oldest unpaid rent fell due.`
      : mine.some(s => s.step === "landlord") ? "«Tell the landlord» is already marked done for this unpaid rent." : null;
  }
  const t = await env.DB.prepare(`SELECT t.*, r.address, r.archived_at AS rental_archived, l.name AS landlord_name, l.email AS landlord_email,
      l.archived_at AS landlord_archived, ${sourceSql(lit(kind), lit(key))} AS source_version FROM tenancies t ${JOINS} WHERE t.id = ?`)
    .bind(tid).first() ?? fail(404, "Tenancy not found");
  if (TENANT_DOCS.includes(kind)) {
    const { results } = await env.DB.prepare("SELECT kind, done_on, expires_on FROM compliance_items WHERE rental_id = ? AND kind IN (?, ?)")
      .bind(t.rental_id, kind, kind.replace("_copy", "")).all();
    const own = results.find(c => c.kind === kind), doc = results.find(c => c.kind === kind.replace("_copy", ""));
    extra = { doc };
    blocked = own?.done_on ? `Already recorded as given on ${date(own.done_on)}.`
      : kind !== "deposit_info" && !doc?.done_on ? `Record the ${kind === "eicr_copy" ? "EICR" : "licence"} first (Update in Checks).`
      : kind === "deposit_info" && !t.deposit_protected_on ? "Record the date the deposit was protected first (Edit details)." : null;
  }
  if (kind !== LANDLORD && t.ended_on && t.ended_on <= today) blocked = "This tenancy has ended.";
  const landlord = kind === LANDLORD;
  const to = emailAddress(landlord ? t.landlord_email : t.tenant_email);
  blocked = t.rental_archived ? "This property is archived." : landlord && t.landlord_archived ? "This landlord is archived."
    : blocked ?? (!to ? `Add the ${landlord ? "landlord's" : "tenant's"} email first.` : null);
  const f = { ...t, ...extra };
  const warnings = kind === "rent_notice" ? await rentWarnings(env, t, today) : [];
  return { t, kind, key, version: t.source_version, blocked, warnings,
    recipient: to ? { name: landlord ? t.landlord_name : t.tenant_name, email: to, party: landlord ? "landlord" : "tenant" } : null,
    text: blocked ? null : rentalText(kind, f), subject: subjectOf(kind, t) };
}
// ADM-15: why its draft is internal only (periods not validated by a lawyer, or the 2025 rules not known to apply). The
// person approving sees it; the email sends the facts of the change only.
async function rentWarnings(env, t, today) {
  if (!rentReviewReady(env)) return ["Check the notice period and the date with a Jersey lawyer before you approve it."];
  const legal = await readLegal(env), law = await tenancyLaw(env, legal);
  return (rentAssistant(t, null, today, legal.periods, law).draft_only ?? []).map(w => `Before you approve it: ${w}.`);
}

const emailOf = (env, s) => env.DB.prepare("SELECT * FROM rental_emails WHERE tenancy_id = ? AND kind = ?").bind(s.t.id, s.kind).first();
function shape(s, e) {
  const stale = e.source_version !== s.version || e.source_key !== s.key;
  return { revision: e.revision, status: e.status, text: e.body, stale, prepared_by: e.prepared_by, prepared_at: e.prepared_at,
    approval: e.approved_revision === e.revision ? { by: e.approved_by, at: e.approved_at } : null, sent_at: e.sent_at,
    blocked: e.status !== "draft" ? null : s.blocked ?? (stale ? "What this email is about changed since it was prepared. Save it again to update it before sending." : null) };
}
async function view(env, scope, id, kind) {
  const s = await subject(env, scope, id, kind), e = await emailOf(env, s);
  return { s, e, email: e ? shape(s, e) : null };
}
// The source as read, checked again inside a write: the tenancy still has it, and (approve) the party's address too.
const holds = (s, extra = "") => `EXISTS (SELECT 1 FROM tenancies t ${JOINS} WHERE t.id = ${Number(s.t.id)} AND r.archived_at IS NULL
  AND ${sourceSql(lit(s.kind), lit(s.key))} = ?${extra})`;
const event = (env, actor, s, type, data, when = "WHERE changes() = 1") => env.DB.prepare(`INSERT INTO rental_events (rental_id, tenancy_id,
  at, actor, type, data) SELECT ?, ?, ?, ?, ?, ? ${when}`).bind(s.t.rental_id, s.t.id, now(), actor, type, JSON.stringify({ kind: s.kind, ...data }));

async function context({ env, params: [scope, id, kind] }) {
  await gate(env);
  const { s, email } = await view(env, scope, id, kind);
  return json({ kind, title: TITLE[kind], recipient: s.recipient, subject: s.subject, proposed_text: s.text, source_key: s.key,
    source_version: s.version, blocked: s.blocked, warnings: s.warnings, email, email_stop: await emailStop(env) });
}

// A new revision of the text (the proposed one when none is given), written from the source as the dialog read it.
// Waiting in the queue and not yet claimed, its email is taken back in the same batch; being sent, nothing changes.
async function save({ request, env, admin, params: [scope, id, kind] }) {
  await gate(env);
  const b = await readJson(request);
  if (!Number.isSafeInteger(b?.revision) || typeof b.source_version !== "string" || (b.text != null && typeof b.text !== "string"))
    fail(400, "Invalid format");
  const { s, e } = await view(env, scope, id, kind);
  if (s.blocked) fail(409, s.blocked);
  if (b.source_version !== s.version)
    fail(409, "What this email is about changed while it was open. Its text now follows it as it is: check it and save again.");
  if ((e?.revision ?? 0) !== b.revision) fail(409, CHANGED);
  if (e && !["draft", "sent", "queued"].includes(e.status)) fail(409, "Check what happened to the last email before preparing another.");
  const text = (b.text ?? "").trim() || s.text;
  if (!text) fail(409, CHANGED);
  if (text.length > 4000) return json({ error: "Please check the highlighted fields.", fields: { text: "Use 4,000 characters or fewer" } }, 400);
  if (bankDetails(text)) return json({ error: "Please check the highlighted fields.",
    fields: { text: "Remove the bank account details: the app does not email them" } }, 400);
  const ts = now();
  const stmts = !e ? [env.DB.prepare(`INSERT INTO rental_emails (tenancy_id, kind, source_key, source_version, body, prepared_by, prepared_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${holds(s)} ON CONFLICT (tenancy_id, kind) DO NOTHING`)
    .bind(s.t.id, kind, s.key, s.version, text, admin, ts, s.version)]
    : [...(e.status === "queued" ? [env.DB.prepare("UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE ref = ? AND status = 'queued'")
      .bind(ts, e.email_ref)] : []),
    env.DB.prepare(`UPDATE rental_emails SET revision = revision + 1, source_key = ?, source_version = ?, body = ?, status = 'draft',
        email_ref = NULL, prepared_by = ?, prepared_at = ? WHERE id = ? AND revision = ? AND status = ? AND ${holds(s)}${
        e.status === "queued" ? " AND changes() = 1" : ""}`)
      .bind(s.key, s.version, text, admin, ts, e.id, e.revision, e.status, s.version)];
  const [res] = (await env.DB.batch([...stmts, event(env, admin, s, "rental_email.prepared", { revision: b.revision + 1 })])).slice(-2);
  if (!res.meta.changes) fail(409, e?.status === "queued" ? "This email is already being sent. Reload in a few minutes to see it." : CHANGED);
  return json({ email: (await view(env, scope, id, kind)).email });
}

// A team member approves exactly this revision, and it is queued once: two clicks or two people find it queued.
async function approve({ request, env, admin, params: [scope, id, kind] }) {
  await gate(env);
  const b = await readJson(request);
  if (!Number.isSafeInteger(b?.revision)) fail(400, "Invalid format");
  const { s, e, email } = await view(env, scope, id, kind);
  if (!e || e.revision !== b.revision) fail(409, CHANGED);
  if (e.status === "queued" && e.approved_revision === e.revision) return json({ email }); // the same click again
  if (e.status !== "draft") fail(409, "This email is not waiting for approval. Reload to see it.");
  if (email.blocked) fail(409, email.blocked);
  const stop = await emailStop(env);
  if (stop) fail(409, stop);
  const to = s.recipient.email, hash = await sha256(to), ts = now(), ref = crypto.randomUUID().replaceAll("-", "");
  if (await env.DB.prepare("SELECT 1 FROM email_suppressions WHERE address_hash = ?").bind(hash).first())
    fail(409, "This address is on the email suppression list, so the app does not write to it: send it yourself.");
  await env.DB.batch([
    env.DB.prepare(`UPDATE rental_emails SET approved_revision = revision, approved_by = ?, approved_at = ? WHERE id = ? AND revision = ?
      AND status = 'draft' AND source_key = ? AND source_version = ? AND ${holds(s, ` AND ${RECIPIENT(lit(kind))} = ?`)}`)
      .bind(admin, ts, e.id, e.revision, s.key, s.version, s.version, to),
    // One email per revision at most (dedupe_key).
    env.DB.prepare(`INSERT INTO outbound (ref, dedupe_key, template, entity_id, version, recipient, recipient_hash, subject, text, status,
        approved_by, approved_at, created_at, updated_at)
      SELECT ?, ?, ?, ?, revision, ?, ?, ?, body, 'queued', approved_by, approved_at, ?, ? FROM rental_emails
      WHERE id = ? AND revision = ? AND changes() = 1 ON CONFLICT (dedupe_key) DO NOTHING`)
      .bind(ref, await sha256(`rental_email\0${e.id}\0${e.revision}`), TEMPLATE[kind], String(e.id), to, hash, s.subject, ts, ts, e.id, e.revision),
    env.DB.prepare("UPDATE rental_emails SET status = 'queued', email_ref = ? WHERE id = ? AND revision = ? AND status = 'draft' AND changes() = 1")
      .bind(ref, e.id, e.revision),
    event(env, admin, s, "rental_email.queued", { revision: e.revision, email_ref: ref }),
  ]);
  const after = await view(env, scope, id, kind);
  if (after.e.status !== "queued") fail(409, CHANGED);
  return json({ email: after.email });
}

// The email service did not say whether it left, and the app never sends it again by itself: a person checks Gmail's
// Sent folder and says which. Sent: recorded as a person confirmed it. Not sent: a new revision that nobody approved.
async function outcome({ request, env, admin, params: [scope, id, kind] }) {
  await gate(env);
  const b = await readJson(request);
  if (!Number.isSafeInteger(b?.revision) || typeof b.sent !== "boolean") fail(400, "Invalid format");
  const { s, e } = await view(env, scope, id, kind);
  if (e?.status !== "needs_review") fail(409, "This email is not waiting to be checked. Reload to see it.");
  if (e.revision !== b.revision) fail(409, CHANGED);
  const at = (await env.DB.prepare("SELECT claimed_at FROM outbound WHERE ref = ?").bind(e.email_ref).first())?.claimed_at ?? now();
  const [res] = await env.DB.batch(b.sent ? [markSent(env, e, at), ...delivered(env, { ...e, rental_id: s.t.rental_id }, at, admin, "person")]
    : [back(env, e), event(env, admin, s, "rental_email.not_sent", { revision: e.revision })]);
  if (!res.meta.changes) fail(409, CHANGED);
  return json({ email: (await view(env, scope, id, kind)).email });
}

const markSent = (env, e, at) => env.DB.prepare("UPDATE rental_emails SET status = 'sent', sent_at = ? WHERE id = ? AND revision = ? AND status = ?")
  .bind(at, e.id, e.revision, e.status);
// Back to a person, unsent: a new revision that nobody approved, with no email of its own.
const back = (env, e, when = "") => env.DB.prepare(`UPDATE rental_emails SET status = 'draft', revision = revision + 1, email_ref = NULL
  WHERE id = ? AND revision = ? AND status = ?${when}`).bind(e.id, e.revision, e.status);
// Right after markSent, once: the delivery in the history, then its record, with the email's reference (the subject's
// [HE-OUT-…] in Gmail) as evidence. by: gmail (accepted) or person (confirmed from Gmail's Sent folder). A check or a step
// already recorded by hand is left as it is.
function delivered(env, e, at, actor, by) {
  const day = jerseyToday(new Date(at)), proof = `HE-OUT-${e.email_ref}`;
  const note = `${e.kind === LANDLORD ? "Landlord" : "Tenant"} emailed from Hampton's Gmail (${proof})${by === "person" ? ", confirmed by a person" : ""}`;
  const sent = "EXISTS (SELECT 1 FROM rental_emails WHERE id = ? AND status = 'sent' AND email_ref = ?)";
  return [env.DB.prepare(`INSERT INTO rental_events (rental_id, tenancy_id, at, actor, type, data) SELECT ?, ?, ?, ?, 'rental_email.sent', ?
      WHERE changes() = 1`).bind(e.rental_id, e.tenancy_id, at, actor,
    JSON.stringify({ kind: e.kind, revision: e.revision, email_ref: e.email_ref, by, ...(e.kind === "rent_notice" ? { rent_change_id: Number(e.source_key) } : {}) })),
  ...(TENANT_DOCS.includes(e.kind) ? [env.DB.prepare(`UPDATE compliance_items SET done_on = ?, expires_on = NULL, note = ?, updated_at = ?, updated_by = ?
      WHERE rental_id = ? AND kind = ? AND done_on IS NULL AND ${sent} AND EXISTS (SELECT 1 FROM tenancies WHERE id = ?
        AND (ended_on IS NULL OR ended_on > ?))`).bind(day, note, now(), actor, e.rental_id, e.kind, e.id, e.email_ref, e.tenancy_id, jerseyToday())]
    : e.kind === LANDLORD ? [env.DB.prepare(`INSERT INTO arrears_steps (tenancy_id, charge_due_on, step, done_at, done_by, note)
      SELECT ?, ?, 'landlord', ?, ?, ? WHERE ${sent} ON CONFLICT DO NOTHING`).bind(e.tenancy_id, e.source_key, at, actor, note, e.id, e.email_ref)] : [])];
}

// The clock's part, after the email pass (server/jobs.js), for every rental email in the queue, switched on or off.
// Taken by Gmail: sent, and its delivery recorded once. Uncertain: a person checks, never sent again. Refused, cancelled or
// gone: back to a person. Still queued but switched off, queued for more than a day or no longer claimable (its source
// changed, the address changed): taken out of the queue unsent. Safety does not rest on this pass: the claim asks the same
// check itself. ponytail: 50 a pass.
export async function rentalEmailPass(env) {
  try {
    if (!(await rentalEmailTable(env))) return;
    const live = rentalEmailsReady(env);
    const { results } = await env.DB.prepare(`SELECT q.*, t.rental_id, outbound.status AS email_status, outbound.updated_at AS email_at,
        outbound.claimed_at, outbound.created_at <= ${RENTAL_QUEUE_LIMIT} AS expired, ${RENTAL_CLAIMABLE} AS claimable
      FROM rental_emails q JOIN tenancies t ON t.id = q.tenancy_id LEFT JOIN outbound ON outbound.ref = q.email_ref
      WHERE q.status = 'queued' ORDER BY q.id LIMIT 50`).all();
    for (const { email_status: status, email_at, claimed_at, expired, claimable, ...e } of results) {
      if (status === "sending") continue;
      const note = (type, reason) => env.DB.prepare(`INSERT INTO rental_events (rental_id, tenancy_id, at, actor, type, data)
        SELECT ?, ?, ?, 'system', ?, ? WHERE changes() = 1`).bind(e.rental_id, e.tenancy_id, now(), type,
        JSON.stringify({ kind: e.kind, revision: e.revision, email_ref: e.email_ref, ...(reason && { reason }) }));
      if (status === "accepted") await env.DB.batch([markSent(env, e, claimed_at ?? email_at), ...delivered(env, e, claimed_at ?? email_at, "system", "gmail")]);
      else if (status === "unknown") await env.DB.batch([env.DB.prepare(`UPDATE rental_emails SET status = 'needs_review'
        WHERE id = ? AND revision = ? AND status = 'queued'`).bind(e.id, e.revision), note("rental_email.unknown")]);
      else if (status !== "queued") await env.DB.batch([back(env, e), note("rental_email.not_sent", status ?? "missing")]);
      else if (!live || expired || !claimable) await env.DB.batch([
        env.DB.prepare("UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE ref = ? AND status = 'queued'").bind(now(), e.email_ref),
        back(env, e, " AND changes() = 1"), note("rental_email.not_sent", !live ? "switched_off" : expired ? "expired" : "blocked")]);
    }
  } catch { console.error("Rental email pass failed"); } // never the tenancy, the address or the text
}

const K = `(${KINDS.join("|")})`, P = `^\\/admin\\/(rentals|tenancies)\\/(\\d+)\\/emails\\/${K}`;
export default [
  ["GET", new RegExp(`${P}$`), context, true],
  ["PUT", new RegExp(`${P}$`), save, true],
  ["POST", new RegExp(`${P}\\/approve$`), approve, true],
  ["POST", new RegExp(`${P}\\/outcome$`), outcome, true],
];
export { RENTAL_EMAILS };
