// AUT-23 (migration 0127, AUT23_RENTAL_EMAILS_READY): the rental drafts that were copied by hand go by email after a
// person approves each one (R01). Arrears (with ADM-09's switch): the friendly reminder +1, the firm reminder +5 and the
// formal letter +14 of the step due, to the tenancy's tenant email. Renewal (with ADM-14's switch): the question to the
// landlord until the landlord answers, then the message to the tenant. The proposed text is the draft's, in plain
// English, built here from the tenancy as it is (no bank details, nothing of another tenancy, no occupants or phones);
// the team may edit it. Each save is a new revision tied to the source as read (409 if it changed since the dialog read
// it); approving one revision queues exactly one email in the approved queue (outbound, template = kind), which Hermes's
// carrier sends verbatim from Hampton's Gmail (AUT-17). Its claim asks server/rental-step-email-check.js again. The clock
// writes back what happened (rentalStepEmailPass): sent (once, on the tenancy's history), unknown (a person checks; never
// sent again) or not sent (a new revision that nobody approved). Sending never marks the step done nor pays anything.
import { json, fail, readJson, now, sha256 } from "./http.js";
import { emailAddress } from "./email.js";
import { emailStop } from "./consultations.js";
import { detail, arrearsReady, renewalReady } from "./routes/rent.js";
import { LEGAL, ARREARS_STEPS } from "./rentals.js";
import { jerseyToday, plusDays } from "./viewings.js";
import { rentalStepEmailsReady, rentalStepEmailTable, rentalStepClaimable, RENTAL_STEP_QUEUE_LIMIT, ARREARS_EMAIL, RENEWAL_LANDLORD,
  RENEWAL_TENANT } from "./rental-step-email-check.js";

const CHANGED = "This email changed. Reload to review it.";
const SOURCE_CHANGED = "The tenancy changed while this email was open. Its text now follows the tenancy as it is: check it and save again.";
const day = d => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const pence = p => (p / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
const pounds = v => `£${Number(v).toLocaleString("en-GB")}`;
const LABEL = Object.fromEntries(ARREARS_STEPS.map(([, k, label]) => [k, label]));
// The steps whose draft is sent to the tenant (ADM-09); the others are a call or a word with the landlord.
const SENT_STEPS = ["reminder", "firm", "letter"];
// A sort code, an 8-digit account number, an IBAN or their names: the tenant pays quoting the payment reference.
const BANK_DETAILS = [/\b\d{2}[- ]\d{2}[- ]\d{2}\b/, /\b\d{8}\b/, /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/,
  /sort code|account (?:number|no)\b|\biban\b|\bswift\b|\bbic\b/i];
export const bankDetails = text => BANK_DETAILS.some(re => re.test(text));

// The proposed texts, the same for the same facts: those of ADM-09's and ADM-14's drafts without their "DRAFT" lines,
// signed by Hampton Estates. Only this tenancy: its tenant's name, the property's address, its payment reference.
const ASK = ref => `Please pay by bank transfer quoting ${ref}, or contact us to agree how it will be paid.`;
const SIGN = ["Kind regards,", "Hampton Estates"], FORMAL = ["Yours sincerely,", "Hampton Estates"];
export function arrearsText({ t, a, owed, today }) {
  const step = a.next_step.step, due = day(a.oldest_unpaid_on), o = pence(owed);
  if (step === "reminder") return { subject: `Rent reminder · ${t.payment_ref} · ${t.address}`, text: [`Dear ${t.tenant_name},`,
    `This is a friendly reminder that the rent due on ${due} has not reached us yet: ${o} is owed.`,
    `${ASK(t.payment_ref)} If you have already paid, thank you, and please disregard this message.`, SIGN.join("\n")].join("\n\n") };
  if (step === "firm") return { subject: `Rent overdue · ${t.payment_ref} · ${t.address}`, text: [`Dear ${t.tenant_name},`,
    `As of ${day(today)}, the rent due on ${due} is ${a.days_late} days late and ${o} is owed.`,
    `Please pay it now. ${ASK(t.payment_ref)}`, SIGN.join("\n")].join("\n\n") };
  const done = a.done.filter(s => LABEL[s.step]).map(s => `${LABEL[s.step].toLowerCase()} on ${day(jerseyToday(new Date(s.done_at)))}`);
  return { subject: `Rent arrears · payment reference ${t.payment_ref}`, text: [[day(today), t.tenant_name, t.address].join("\n"),
    `Rent arrears · payment reference ${t.payment_ref}`, `Dear ${t.tenant_name},`,
    [`Our records show ${o} of rent unpaid on this tenancy. The oldest unpaid rent fell due on ${due}, ${a.days_late} days ago.`,
      ...(done.length ? [`We have already contacted you: ${done.join("; ")}.`] : []), ASK(t.payment_ref),
      "If the arrears are not settled, we may take further steps under the tenancy agreement."].join("\n"), FORMAL.join("\n")].join("\n\n") };
}
export function renewalText({ t, rent, landlord, answer: x }) {
  const end = day(t.end_on);
  if (!x) return { subject: `Tenancy renewal · ${t.payment_ref} · ${t.address}`, text: [`Dear ${landlord},`,
    `The fixed term of ${t.tenant_name}'s tenancy at ${t.address} ends on ${end}. The rent is ${pounds(rent)} pcm.`,
    "Please let us know whether you wish to renew it at the same rent, renew it at a new rent, or let it end, so that we can tell the tenant in good time.",
    FORMAL.join("\n")].join("\n\n") };
  return { subject: `Your tenancy · ${t.payment_ref} · ${t.address}`, text: [`Dear ${t.tenant_name},`, x.answer === "end"
    ? `The landlord has decided not to renew your tenancy at ${t.address}. The fixed term ends on ${end}. We will contact you about the move-out, the check-out report and your deposit.`
    : `The landlord would like to renew your tenancy at ${t.address}, whose fixed term ends on ${end}, ${x.answer === "rent"
      ? `at a rent of ${pounds(x.rent)} pcm` : `at the same rent of ${pounds(rent)} pcm`}. Please let us know whether you would like to stay.`,
    FORMAL.join("\n")].join("\n\n") };
}

const gate = async (env, which) => {
  if (!rentalStepEmailsReady(env) || !(await rentalStepEmailTable(env)) || !(which === "arrears" ? arrearsReady(env) : renewalReady(env)))
    fail(404, "Not found");
};
// The facts a text is written from, as one string: the dialog sends it back with a text, and the row keeps them.
const versionOf = f => [f.source_day, f.tenancy_updated_at, f.rental_updated_at, f.landlord_updated_at ?? "", f.amount, f.answer_mark,
  f.kind, f.source_key, f.recipient ?? ""].join("|");
// The email the tenancy's source asks for now (arrears: the step due; renewal: the landlord until they answer, then the
// tenant), with its facts and proposed text; 409 when there is none.
async function current(env, id, which) {
  const d = await detail(env, id), t = d.tenancy, today = jerseyToday();
  const p = await env.DB.prepare(`SELECT r.updated_at AS rental_updated_at, l.name AS landlord_name, l.email AS landlord_email,
    l.archived_at AS landlord_archived_at, l.updated_at AS landlord_updated_at FROM rentals r JOIN landlords l ON l.id = r.landlord_id
    WHERE r.id = ?`).bind(t.rental_id).first();
  const base = { tenancy_id: t.id, rental_id: t.rental_id, source_day: today, tenancy_updated_at: t.updated_at,
    rental_updated_at: p.rental_updated_at, landlord_updated_at: null, answer_mark: 0 };
  if (which === "arrears") {
    const a = d.arrears, step = a?.next_step?.step, running = !t.ended_on || t.ended_on > today;
    if (t.service !== "full" || !running || !SENT_STEPS.includes(step))
      fail(409, "No reminder or letter is due for this tenancy now. Reload to see the arrears.");
    const next = ARREARS_STEPS.find(([days]) => days > a.next_step.days);
    return { ...base, kind: ARREARS_EMAIL, party: "tenant", name: t.tenant_name, source_key: `${a.oldest_unpaid_on}/${step}`,
      charge_due_on: a.oldest_unpaid_on, step, label: a.next_step.label, valid_until: next ? plusDays(a.oldest_unpaid_on, next[0]) : null,
      amount: d.balance, recipient: emailAddress(t.tenant_email), ...arrearsText({ t, a, owed: d.balance, today }) };
  }
  const r = d.renewal;
  if (!r || t.notice_given_on || t.end_on > plusDays(today, LEGAL.renewalDays))
    fail(409, "This tenancy is not waiting for a renewal answer. Reload to see it.");
  const { mark } = await env.DB.prepare(`SELECT COALESCE(MAX(id), 0) AS mark FROM rental_events WHERE rental_id = ? AND tenancy_id = ?
    AND type = 'renewal.answered'`).bind(t.rental_id, t.id).first();
  const toLandlord = !r.landlord;
  return { ...base, kind: toLandlord ? RENEWAL_LANDLORD : RENEWAL_TENANT, party: toLandlord ? "landlord" : "tenant",
    name: toLandlord ? p.landlord_name : t.tenant_name, source_key: t.end_on, charge_due_on: null, step: null, valid_until: null,
    label: toLandlord ? "Message to the landlord" : "Message to the tenant", amount: d.current_rent, answer_mark: mark,
    landlord_updated_at: toLandlord ? p.landlord_updated_at : null,
    recipient: toLandlord ? (p.landlord_archived_at ? null : emailAddress(p.landlord_email)) : emailAddress(t.tenant_email),
    ...renewalText({ t, rent: d.current_rent, landlord: p.landlord_name, answer: r.landlord }) };
}
const rowOf = (env, c) => env.DB.prepare("SELECT * FROM rental_step_emails WHERE tenancy_id = ? AND kind = ? AND source_key = ?")
  .bind(c.tenancy_id, c.kind, c.source_key).first();
const NO_ADDRESS = { tenant: "The tenancy has no valid tenant email. Add it under Edit details, then come back.",
  landlord: "The landlord has no valid email. Add it on the landlord's page, then come back." };
// The email as the panel shows it. stale: written from the tenancy as it no longer is. blocked: why it must not go now.
function shape(e, c) {
  const stale = versionOf(e) !== versionOf(c);
  const blocked = e.status !== "draft" ? null : !c.recipient ? NO_ADDRESS[c.party]
    : stale ? "The tenancy changed since this email was prepared. Save it again to update it before sending." : null;
  return { revision: e.revision, status: e.status, text: e.body, subject: e.subject, recipient: e.recipient, stale, blocked,
    prepared_by: e.prepared_by, prepared_at: e.prepared_at, sent_at: e.sent_at,
    approval: e.approved_revision === e.revision ? { by: e.approved_by, at: e.approved_at } : null };
}
// An email whose result is not known waits for a person whatever its source has become since (paid, the step done, an
// answer recorded): it is found by itself first, with its own facts, so it can always be checked and settled.
async function view(env, id, which) {
  const kinds = which === "arrears" ? [ARREARS_EMAIL] : [RENEWAL_LANDLORD, RENEWAL_TENANT];
  const pending = await env.DB.prepare(`SELECT e.*, t.rental_id, t.tenant_name, l.name AS landlord_name FROM rental_step_emails e
    JOIN tenancies t ON t.id = e.tenancy_id JOIN rentals r ON r.id = t.rental_id JOIN landlords l ON l.id = r.landlord_id
    WHERE e.tenancy_id = ? AND e.kind IN (${kinds.map(() => "?").join(", ")}) AND e.status = 'needs_review' ORDER BY e.id LIMIT 1`)
    .bind(Number(id), ...kinds).first();
  if (pending) {
    const { tenant_name, landlord_name, rental_id, ...e } = pending, landlord = e.kind === RENEWAL_LANDLORD;
    const c = { ...e, rental_id, party: landlord ? "landlord" : "tenant", name: landlord ? landlord_name : tenant_name, text: e.body,
      label: e.step ? LABEL[e.step] : landlord ? "Message to the landlord" : "Message to the tenant" };
    return { c, e, email: shape(e, c) };
  }
  const c = await current(env, id, which), e = await rowOf(env, c);
  return { c, e, email: e ? shape(e, c) : null };
}

async function context({ env, params: [id, which] }) {
  await gate(env, which);
  const { c, email } = await view(env, id, which);
  return json({ kind: c.kind, party: c.party, name: c.name, label: c.label, step: c.step, recipient: c.recipient, subject: c.subject,
    proposed_text: c.text, source: versionOf(c), email, email_stop: await emailStop(env), no_address: c.recipient ? null : NO_ADDRESS[c.party] });
}

// The step's event on the tenancy's history, by ids only: never the address or the text.
const event = (env, actor, c, type, data) => env.DB.prepare(`INSERT INTO rental_events (rental_id, tenancy_id, at, actor, type, data)
  SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1`).bind(c.rental_id, c.tenancy_id, now(), actor, type, JSON.stringify({ kind: c.kind,
  ...(c.step ? { step: c.step, charge_due_on: c.charge_due_on } : { end_on: c.source_key }), ...data }));
const FACTS = ["recipient", "subject", "amount", "answer_mark", "tenancy_updated_at", "rental_updated_at", "landlord_updated_at",
  "source_day", "valid_until"];

// A new revision of the text (the proposed one when none is given), from the source as the dialog read it (source).
// Waiting in the queue and not yet claimed, its email is taken back in the same batch; being sent, nothing changes.
async function save({ request, env, admin, params: [id, which] }) {
  await gate(env, which);
  const b = await readJson(request);
  if (!Number.isSafeInteger(b?.revision) || typeof b.source !== "string" || (b.text != null && typeof b.text !== "string"))
    fail(400, "Invalid format");
  const { c, e } = await view(env, id, which);
  if (b.source !== versionOf(c)) fail(409, SOURCE_CHANGED);
  if ((e?.revision ?? 0) !== b.revision) fail(409, CHANGED);
  if (e && !["draft", "sent", "queued"].includes(e.status)) fail(409, "Check what happened to the last email before preparing another.");
  if (!c.recipient) fail(409, NO_ADDRESS[c.party]);
  const text = (b.text ?? "").trim() || c.text;
  if (text.length > 4000) return json({ error: "Please check the highlighted fields.", fields: { text: "Use 4,000 characters or fewer" } }, 400);
  if (bankDetails(text)) return json({ error: "Please check the highlighted fields.",
    fields: { text: "Remove the bank account details: the tenant pays quoting the payment reference." } }, 400);
  const ts = now(), same = "EXISTS (SELECT 1 FROM tenancies WHERE id = ? AND updated_at = ?)", sb = [c.tenancy_id, c.tenancy_updated_at];
  const facts = FACTS.map(k => c[k] ?? null);
  const stmts = !e ? [env.DB.prepare(`INSERT INTO rental_step_emails (tenancy_id, kind, source_key, charge_due_on, step, body, ${FACTS.join(", ")},
      prepared_by, prepared_at) SELECT ?, ?, ?, ?, ?, ?, ${FACTS.map(() => "?").join(", ")}, ?, ? WHERE ${same}
      ON CONFLICT (tenancy_id, kind, source_key) DO NOTHING`)
    .bind(c.tenancy_id, c.kind, c.source_key, c.charge_due_on, c.step, text, ...facts, admin, ts, ...sb)]
    : [...(e.status === "queued" ? [env.DB.prepare("UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE ref = ? AND status = 'queued'")
      .bind(ts, e.email_ref)] : []),
    env.DB.prepare(`UPDATE rental_step_emails SET revision = revision + 1, body = ?, ${FACTS.map(k => `${k} = ?`).join(", ")}, status = 'draft',
        email_ref = NULL, prepared_by = ?, prepared_at = ? WHERE id = ? AND revision = ? AND status = ? AND ${same}${
        e.status === "queued" ? " AND changes() = 1" : ""}`)
      .bind(text, ...facts, admin, ts, e.id, e.revision, e.status, ...sb)];
  const [res] = (await env.DB.batch([...stmts, event(env, admin, c, "rental_step_email.prepared", { email_revision: b.revision + 1 })])).slice(-2);
  if (!res.meta.changes) fail(409, e?.status === "queued" ? "This email is already being sent. Reload in a few minutes to see it." : CHANGED);
  return json({ email: (await view(env, id, which)).email });
}

// A team member approves exactly this revision, and it is queued once: two clicks or two people find it queued.
async function approve({ request, env, admin, params: [id, which] }) {
  await gate(env, which);
  const b = await readJson(request);
  if (!Number.isSafeInteger(b?.revision)) fail(400, "Invalid format");
  const { c, e, email } = await view(env, id, which);
  if (!e || e.revision !== b.revision) fail(409, CHANGED);
  if (e.status === "queued" && e.approved_revision === e.revision) return json({ email }); // the same click again
  if (e.status !== "draft") fail(409, "This email is not waiting for approval. Reload to see it.");
  if (email.blocked) fail(409, email.blocked);
  const stop = await emailStop(env);
  if (stop) fail(409, stop);
  const hash = await sha256(e.recipient), ts = now(), ref = crypto.randomUUID().replaceAll("-", "");
  if (await env.DB.prepare("SELECT 1 FROM email_suppressions WHERE address_hash = ?").bind(hash).first())
    fail(409, "This address is on the email suppression list, so the app does not write to it: send it yourself.");
  await env.DB.batch([
    env.DB.prepare(`UPDATE rental_step_emails SET approved_revision = revision, approved_by = ?, approved_at = ? WHERE id = ? AND revision = ?
      AND status = 'draft' AND EXISTS (SELECT 1 FROM tenancies WHERE id = tenancy_id AND updated_at = tenancy_updated_at)`)
      .bind(admin, ts, e.id, e.revision),
    // One email per revision at most (dedupe_key).
    env.DB.prepare(`INSERT INTO outbound (ref, dedupe_key, template, entity_id, version, recipient, recipient_hash, subject, text, status,
        approved_by, approved_at, created_at, updated_at)
      SELECT ?, ?, kind, ?, revision, recipient, ?, subject, body, 'queued', approved_by, approved_at, ?, ? FROM rental_step_emails
      WHERE id = ? AND revision = ? AND changes() = 1 ON CONFLICT (dedupe_key) DO NOTHING`)
      .bind(ref, await sha256(`${e.kind}\0${e.id}\0${e.revision}`), String(e.id), hash, ts, ts, e.id, e.revision),
    env.DB.prepare("UPDATE rental_step_emails SET status = 'queued', email_ref = ? WHERE id = ? AND revision = ? AND status = 'draft' AND changes() = 1")
      .bind(ref, e.id, e.revision),
    event(env, admin, c, "rental_step_email.queued", { email_revision: e.revision, email_ref: ref }),
  ]);
  const after = await view(env, id, which);
  if (after.e.status !== "queued") fail(409, CHANGED);
  return json({ email: after.email });
}

// The email service did not say whether it left, and the app never sends it again by itself: a person checks Gmail's
// Sent folder and says which. Sent: at the time it was claimed. Not sent: a new revision that nobody approved.
async function outcome({ request, env, admin, params: [id, which] }) {
  await gate(env, which);
  const b = await readJson(request);
  if (!Number.isSafeInteger(b?.revision) || typeof b.sent !== "boolean") fail(400, "Invalid format");
  const { c, e } = await view(env, id, which);
  if (e?.status !== "needs_review") fail(409, "This email is not waiting to be checked. Reload to see it.");
  if (e.revision !== b.revision) fail(409, CHANGED);
  const at = (await env.DB.prepare("SELECT claimed_at FROM outbound WHERE ref = ?").bind(e.email_ref).first())?.claimed_at ?? now();
  const [res] = await env.DB.batch([b.sent ? markSent(env, e, at) : back(env, e),
    event(env, admin, c, b.sent ? "rental_step_email.confirmed" : "rental_step_email.not_sent", { email_revision: e.revision })]);
  if (!res.meta.changes) fail(409, CHANGED);
  // Settled; the source may have moved on meanwhile, so there may be no email to show for it now.
  return json({ email: (await view(env, id, which).catch(() => null))?.email ?? null });
}

const markSent = (env, e, at) => env.DB.prepare("UPDATE rental_step_emails SET status = 'sent', sent_at = ? WHERE id = ? AND revision = ? AND status = ?")
  .bind(at, e.id, e.revision, e.status);
// Back to a person, unsent: a new revision that nobody approved, with no email of its own.
const back = (env, e, when = "") => env.DB.prepare(`UPDATE rental_step_emails SET status = 'draft', revision = revision + 1, email_ref = NULL
  WHERE id = ? AND revision = ? AND status = ?${when}`).bind(e.id, e.revision, e.status);

// The clock's part, after the email pass (server/jobs.js), for every rental email in the queue. Taken by the transport:
// sent, recorded once on the tenancy's history (the step stays as it is, the debt too). Uncertain: a person checks,
// never sent again. Refused, cancelled or gone: back to a person. Still queued but switched off (the clock's
// AUT23_RENTAL_EMAILS_READY), queued for more than a day or no longer claimable: taken out of the queue unsent. Only its
// own switch and 0127 are read here (the clock has no ADM14_RENEWAL_READY). Safety does not rest on this pass: the claim
// asks the same check itself. ponytail: 50 a pass.
export async function rentalStepEmailPass(env) {
  try {
    if (!(await rentalStepEmailTable(env))) return;
    const live = rentalStepEmailsReady(env);
    const { results } = await env.DB.prepare(`SELECT q.*, t.rental_id, outbound.status AS email_status, outbound.updated_at AS email_at,
        outbound.created_at <= ${RENTAL_STEP_QUEUE_LIMIT} AS expired, ${rentalStepClaimable(jerseyToday(), arrearsReady(env))} AS claimable
      FROM rental_step_emails q JOIN tenancies t ON t.id = q.tenancy_id LEFT JOIN outbound ON outbound.ref = q.email_ref
      WHERE q.status = 'queued' ORDER BY q.id LIMIT 50`).all();
    for (const { email_status: status, email_at, expired, claimable, rental_id, ...e } of results) {
      if (status === "sending") continue;
      const c = { ...e, rental_id };
      const note = (type, reason) => event(env, "system", c, type, { email_revision: e.revision, email_ref: e.email_ref, ...(reason && { reason }) });
      if (status === "accepted") await env.DB.batch([markSent(env, e, email_at), note("rental_step_email.sent")]);
      else if (status === "unknown") await env.DB.batch([env.DB.prepare(`UPDATE rental_step_emails SET status = 'needs_review'
        WHERE id = ? AND revision = ? AND status = 'queued'`).bind(e.id, e.revision), note("rental_step_email.unknown")]);
      else if (status !== "queued") await env.DB.batch([back(env, e), note("rental_step_email.not_sent", status ?? "missing")]);
      else if (!live || expired || !claimable) await env.DB.batch([
        env.DB.prepare("UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE ref = ? AND status = 'queued'").bind(now(), e.email_ref),
        back(env, e, " AND changes() = 1"), note("rental_step_email.not_sent", !live ? "switched_off" : expired ? "expired" : "blocked")]);
    }
  } catch { console.error("Rental step email pass failed"); } // never the tenancy, the address or the text
}

const P = "^\\/admin\\/tenancies\\/(\\d+)\\/step-email\\/(arrears|renewal)";
export default [
  ["GET", new RegExp(`${P}$`), context, true],
  ["PUT", new RegExp(`${P}$`), save, true],
  ["POST", new RegExp(`${P}\\/approve$`), approve, true],
  ["POST", new RegExp(`${P}\\/outcome$`), outcome, true],
];
