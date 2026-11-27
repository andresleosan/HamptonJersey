// ADM-10 (ADM10_STATEMENT_EMAIL_READY, with ADM10_STATEMENTS_READY; no migration): the closed statement, its latest revision,
// emailed to its landlord (landlords.email). The text is written from the frozen snapshot of statement_runs as the panel shows
// it and a team member approves exactly that revision (R01), which queues exactly one email in the app's approved queue
// (outbound, template 'owner_statement', server/email.js) that Hermes's carrier sends verbatim from Hampton's Gmail (AUT-17).
// The claim asks server/statement-email-check.js again. The clock writes back what happened (statementEmailPass): accepted by
// Gmail, the statement is marked sent (sent_on, as the hand mark does); unknown, a person checks and it is never sent again by
// the app. Never a bank account, never a tenant: the snapshot holds the landlord's id and name only. The PDF is the browser's.
import { json, fail, readJson, now, sha256 } from "./http.js";
import { emailAddress } from "./email.js";
import { emailStop } from "./consultations.js";
import { jerseyToday } from "./viewings.js";
import { LATEST } from "./statements.js";
import { bankDetails } from "./rental-emails.js";
import { STATEMENT_TEMPLATE as TEMPLATE, STATEMENT_CLAIMABLE, STATEMENT_QUEUE_LIMIT, statementEmailReady } from "./statement-email-check.js";

const CHANGED = "This statement changed. Reload to review it.";
const ACTIVE = ["queued", "sending", "accepted", "unknown"];
const pence = v => `${v < 0 ? "-" : ""}£${(Math.abs(v) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const monthName = m => MONTH.format(new Date(`${m}-15T12:00:00Z`));
const subjectOf = r => `Your statement for ${monthName(r.month)} (revision ${r.revision})`;

// The text, from the closed snapshot only: each property's own lines and the totals, as the statement shows them.
export function statementText(s, revision) {
  const t = s.totals, line = (label, v) => `  ${label}: ${pence(v)}`;
  const props = s.rentals.map(r => [r.address, line("Rent received", r.rent_received), line(`Management fee (${r.fee_percent}%)`, -r.fee),
    ...r.repairs.map(x => line(`Repair: ${x.title}`, -x.cost)),
    ...(r.other_received ? [line("Other money received, not in the net (for example a deposit)", r.other_received)] : []),
    ...(r.written_off ? [line("Rent written off, not in the net", r.written_off)] : [])].join("\n"));
  return [`Dear ${s.landlord.name},`,
    `Here is your statement for ${monthName(s.month)} (revision ${revision}). All amounts are in pounds sterling.`,
    ...props,
    ["Totals", line("Rent received", t.rent), line("Management fees", -t.fee), ...(t.gst != null ? [line("GST on the fees", -t.gst)] : []),
      line("Repairs", -t.repairs), line("Net to you", t.net)].join("\n"),
    "If you have any questions, simply reply to this email.", "Kind regards,\nHampton Estates"].join("\n\n");
}

// The run as the panel shows it: its text and recipient, why it must not go now (blocked), and what became of the last email.
async function view(env, id) {
  const r = await env.DB.prepare(`SELECT s.*, l.name AS landlord_name, l.email AS landlord_email, l.archived_at AS landlord_archived,
      ${LATEST.replaceAll("statement_runs.", "s.")} AS latest FROM statement_runs s JOIN landlords l ON l.id = s.landlord_id WHERE s.id = ?`)
    .bind(Number(id)).first() ?? fail(404, "Statement not found");
  const to = emailAddress(r.landlord_email), text = statementText(JSON.parse(r.snapshot), r.revision);
  const mail = await env.DB.prepare(`SELECT ref, status, approved_by, approved_at FROM outbound WHERE template = ? AND entity_id = ?
    ORDER BY id DESC LIMIT 1`).bind(TEMPLATE, String(r.id)).first();
  const blocked = !r.latest ? "A newer revision of this statement exists. Reload to see it."
    : r.sent_on ? `This statement is already marked sent (${r.sent_on}).`
    : r.landlord_archived ? "This landlord is archived."
    : !to ? "Add the landlord's email first."
    : bankDetails(text) ? "The text looks like it holds bank details, which the app does not email. Send this statement yourself." : null;
  return { r, to, mail, text, blocked };
}

async function context({ env, params: [id] }) {
  const { r, to, mail, text, blocked } = await view(env, id);
  return json({ id: r.id, month: r.month, revision: r.revision, digest: r.source_digest, blocked, text, subject: subjectOf(r),
    recipient: to && { name: r.landlord_name, email: to },
    email: mail && { status: mail.status, approved_by: mail.approved_by, approved_at: mail.approved_at },
    email_stop: await emailStop(env) });
}

// A team member approves exactly this revision, and it is queued once: two clicks or two people find it queued.
async function approve({ request, env, admin, params: [id] }) {
  const b = await readJson(request);
  if (!Number.isSafeInteger(b?.revision) || typeof b.digest !== "string") fail(400, "Invalid format");
  const { r, to, mail, text, blocked } = await view(env, id);
  if (r.revision !== b.revision || r.source_digest !== b.digest) fail(409, CHANGED);
  if (blocked) fail(409, blocked);
  if (mail && ACTIVE.includes(mail.status)) fail(409, `This statement already has an email (${mail.status}). Reload to see it.`);
  const stop = await emailStop(env);
  if (stop) fail(409, stop);
  const hash = await sha256(to), ts = now(), ref = crypto.randomUUID().replaceAll("-", ""), key = String(r.id);
  if (await env.DB.prepare("SELECT 1 FROM email_suppressions WHERE address_hash = ?").bind(hash).first())
    fail(409, "This address is on the email suppression list, so the app does not write to it: send it yourself.");
  // A new approval after a refused or taken-back email is a new try (dedupe_key), never while another is in the queue or sent.
  const tries = (await env.DB.prepare("SELECT COUNT(*) n FROM outbound WHERE template = ? AND entity_id = ?").bind(TEMPLATE, key).first()).n;
  const { meta } = await env.DB.prepare(`INSERT INTO outbound (ref, dedupe_key, template, entity_id, version, recipient, recipient_hash, subject, text,
      status, approved_by, approved_at, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM statement_runs WHERE id = ? AND sent_on IS NULL
      AND ${LATEST}) AND NOT EXISTS (SELECT 1 FROM outbound WHERE template = ? AND entity_id = ? AND status IN ('queued', 'sending', 'accepted', 'unknown'))
    ON CONFLICT (dedupe_key) DO NOTHING`)
    .bind(ref, await sha256(`${TEMPLATE}\0${r.id}\0${tries}`), TEMPLATE, key, r.revision, to, hash, subjectOf(r), text, admin, ts, ts, ts,
      r.id, TEMPLATE, key).run();
  if (!meta.changes) fail(409, CHANGED);
  return json({ email: { status: "queued", approved_by: admin, approved_at: ts } });
}

// The email service did not say whether it left, and the app never sends it again by itself: a person checks Gmail's Sent
// folder and says which. Sent: marked sent today, as the hand mark does. Not sent: taken out, so a new approval is possible.
async function outcome({ request, env, admin, params: [id] }) {
  const b = await readJson(request);
  if (typeof b?.sent !== "boolean") fail(400, "Invalid format");
  const { r, mail } = await view(env, id);
  if (mail?.status !== "unknown") fail(409, "This email is not waiting to be checked. Reload to see it.");
  const { meta } = await (b.sent
    ? env.DB.prepare(`UPDATE statement_runs SET sent_on = ?, sent_by = ? WHERE id = ? AND sent_on IS NULL AND ${LATEST}`).bind(jerseyToday(), admin, r.id)
    : env.DB.prepare("UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE ref = ? AND status = 'unknown'").bind(now(), mail.ref)).run();
  if (!meta.changes) fail(409, CHANGED);
  return json({ ok: true });
}

// The clock's part, after the email pass (server/jobs.js), switched on or off. Taken by Gmail: the statement is marked sent,
// once (by whoever approved it, on the day it was claimed). Still queued but switched off, queued for more than a day or no
// longer claimable (a newer revision, another address): taken out of the queue unsent. Safety does not rest on this pass: the
// claim asks the same check itself. An unknown result waits for a person. ponytail: 50 a pass.
export async function statementEmailPass(env) {
  try {
    // Migration 0090 is there; before it no statement names statement_runs.
    if (!(await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'statement_runs'").first())) return;
    const live = statementEmailReady(env);
    const { results } = await env.DB.prepare(`SELECT ref, status, entity_id, approved_by, COALESCE(claimed_at, updated_at) AS at,
        created_at <= ${STATEMENT_QUEUE_LIMIT} AS expired, ${STATEMENT_CLAIMABLE} AS claimable FROM outbound WHERE template = ?
      AND (status = 'queued' OR (status = 'accepted' AND EXISTS (SELECT 1 FROM statement_runs s WHERE s.id = CAST(outbound.entity_id AS INTEGER)
        AND s.sent_on IS NULL))) ORDER BY id LIMIT 50`).bind(TEMPLATE).all();
    for (const e of results) {
      if (e.status === "accepted") await env.DB.prepare("UPDATE statement_runs SET sent_on = ?, sent_by = ? WHERE id = ? AND sent_on IS NULL")
        .bind(jerseyToday(new Date(e.at)), e.approved_by, Number(e.entity_id)).run();
      else if (!live || e.expired || !e.claimable)
        await env.DB.prepare("UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE ref = ? AND status = 'queued'").bind(now(), e.ref).run();
    }
  } catch { console.error("Statement email pass failed"); } // never the landlord, the address or the text
}

export const statementEmailRoutes = [
  ["GET", /^\/admin\/statement-runs\/(\d+)\/email$/, context, true],
  ["POST", /^\/admin\/statement-runs\/(\d+)\/email\/approve$/, approve, true],
  ["POST", /^\/admin\/statement-runs\/(\d+)\/email\/outcome$/, outcome, true],
];
