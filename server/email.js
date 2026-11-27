import { logEvent } from "./events.js";
import { now, sha256 } from "./http.js";
import { ALLOWED, MARKETING_TEMPLATE, purposeReady } from "./communication-preferences.js";
import { NO_NOTICE, noticeClaimSql } from "./retention.js";
import { offerClaimSql } from "./offer-email-check.js";
import { REMINDERS, reminderClaimSql } from "./viewing-reminders.js";
import { weeklyClaimSql } from "./weekly-insights-email-check.js";
import { VIEWING_EMAILS, viewingEmailClaimSql } from "./viewing-email-check.js";
import { RENTAL_EMAILS, rentalEmailClaimSql } from "./rental-email-check.js";
import { RENTAL_STEP_EMAILS, rentalStepClaimSql } from "./rental-step-email-check.js";
import { WELCOME, welcomeClaimSql } from "./applicant-welcome-check.js";
import { STATEMENT_TEMPLATE, statementEmailClaimSql } from "./statement-email-check.js";

export const EMAIL_FROM = "hello@hamptonestatesjersey.com";
export const EMAIL_REPLY_TO = "replies@app.hamptonestatesjersey.com";
export const DAILY_LIMIT = 100;
// PRE-12: retention notices take at most this many of a Jersey day's sends, so the others still go.
export const NOTICE_DAILY_LIMIT = 20;
export const SITE = "https://www.hamptonestatesjersey.com";
const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Jersey", year: "numeric", month: "2-digit",
  day: "2-digit", hour: "2-digit", hourCycle: "h23" });
export function emailDay(ts) {
  const p = Object.fromEntries(time.formatToParts(new Date(ts)).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export const emailAddress = v => typeof v === "string" && v.length <= 254 &&
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(v.trim())
  ? v.trim().toLowerCase() : null;
const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const DEFAULT = { enabled: false, summary: false, recipients: [], revision: 0, approved_by: null, approved_at: null };
export async function readEmailSettings(env) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'email'").first();
  if (!row) return { ...DEFAULT };
  try {
    const s = JSON.parse(row.value);
    if (!Array.isArray(s.recipients) || s.recipients.length > 20 || !s.recipients.every(a => emailAddress(a) === a)
      || !Number.isSafeInteger(s.revision) || s.revision < 1) return { ...DEFAULT };
    return { ...DEFAULT, ...s, enabled: s.enabled === true, summary: s.summary === true };
  } catch { return { ...DEFAULT }; }
}
export const serviceReady = env => env.EMAIL_SERVICE_READY === "true";
// AUT-17 (PRE-23): Hermes's mail carrier delivers the queue from Hampton's Gmail (server/hermes-mail.js). Either
// transport makes the app's outbound email available; the inbound routes and ADM-12's instant codes stay on Cloudflare's.
export const hermesTransport = env => env?.HERMES_MAIL_READY === "1";
export const outboundReady = env => serviceReady(env) || hermesTransport(env);

export async function summarySnapshot(env, ts) {
  // NOT-09: snoozed tasks are not counted as waiting, with or without the switch (none before migration 0088).
  const c = await (await import("./routes/notifications.js")).openCounts(env, undefined, true);
  const { n: drafts } = await env.DB.prepare("SELECT COUNT(*) n FROM jobs WHERE status = 'draft'").first();
  const lines = ["Hampton summary", `Jersey date: ${emailDay(ts)}`, "",
    `${c.new_applicant} new applicants to review`, `${c.viewing} viewing requests to answer`,
    `${c.matched} new matches to review`, `${c.sales} sales overdue or waiting`, `${c.rentals} rentals tasks to do`,
    `${c.expiring} applicants expiring`, `${drafts} text drafts waiting for approval`,
    `To confirm: ${c.to_confirm} listings`, `${c.chats} website chats waiting for a reply`, "",
    `Open the panel: ${SITE}/admin/`, "", "Hampton Estates", "42 Bath Street, St Helier, Jersey JE2 4ST",
    "Contact: francopropertiesjersey@gmail.com", `Privacy notice: ${SITE}/#/privacy`,
    "Team summary preferences: Settings > Automations in the panel."];
  return { subject: `Hampton summary · ${emailDay(ts)}`, text: lines.join("\n") };
}

export async function prepareSummary(env, ts) {
  const s = await readEmailSettings(env);
  const hour = Number(time.formatToParts(new Date(ts)).find(p => p.type === "hour").value);
  if (!((serviceReady(env) && env.EMAIL) || hermesTransport(env)) || !s.enabled || !s.summary || !s.approved_at || !s.approved_by || hour < 8 || !s.recipients.length) return;
  const day = emailDay(ts), snapshot = await summarySnapshot(env, ts);
  // Preparing twice never replaces the approved snapshot. Settings are checked again when claiming and sending.
  const statements = (await Promise.all(s.recipients.map(async recipient => {
    const hash = await sha256(recipient), key = await sha256(["team_summary", day, "1", recipient].join("\0"));
    const ref = crypto.randomUUID().replaceAll("-", "");
    return [env.DB.prepare(`INSERT INTO outbound(ref,dedupe_key,template,entity_id,version,recipient,recipient_hash,
      subject,text,status,approved_by,approved_at,config_revision,created_at,updated_at)
      SELECT ?,?,'team_summary',?,1,?,?,?,?, 'queued',?,?,?,?,?
      WHERE NOT EXISTS (SELECT 1 FROM email_suppressions WHERE address_hash = ?)
        AND EXISTS (SELECT 1 FROM app_settings WHERE key='email' AND json_extract(value,'$.revision')=?
          AND json_extract(value,'$.enabled')=1 AND json_extract(value,'$.summary')=1
          AND EXISTS (SELECT 1 FROM json_each(app_settings.value,'$.recipients') WHERE value=?))
      ON CONFLICT(dedupe_key) DO NOTHING`).bind(ref, key, day, recipient, hash,
      snapshot.subject, snapshot.text, s.approved_by, s.approved_at, s.revision, ts, ts, hash,s.revision,recipient),
      ...logEvent(env,{actor:s.approved_by,entity_type:"admin",entity_id:`email:${ref}`,type:"email.approved",
        data:{template:"team_summary",day}},null,{ifInserted:true})];
  }))).flat();
  await env.DB.batch(statements);
}

// This SQL is evaluated afresh on the claim and immediately before the provider call. No network transaction.
// An approved external row can be introduced only by a future authenticated workflow, never a public send route.
// REG-15 is the one exception: a saved search's double opt-in confirmation (saved_search_confirm), queued by its public
// route behind Turnstile and daily caps, approved in advance by whoever opened that form (app_settings.saved_searches).
// AGE-05: an enquiry email is claimed only while its own check (SQL from outbound, given by the clock) holds; without
// one, never. Other templates are unaffected.
// PRE-10: switched on, deny by default. Only these transactional templates skip the marketing check; any other one is
// promotional and is claimed and sent only while the recipient is still the contact's email and that contact may
// receive its purpose ("marketing.<purpose>") by email, read again each time. Any other name never goes. A new
// transactional template is added here. Off, the SQL never names marketing_preferences (it runs before 0096) and
// only "marketing.*" is held, as before.
// PRE-12: retention_notice, the notice before the retention pass deletes a contact, goes only while noticeClaimSql holds.
// OFE-02: offer_to_seller, an offer taken to its seller, goes only while offerClaimSql holds (server/offer-email-check.js).
// VIS-13: a viewing reminder goes only while reminderClaimSql holds (server/viewing-reminders.js).
const TRANSACTIONAL = ["team_summary", "enquiry", "saved_search_confirm", "retention_notice", "offer_to_seller", "viewing_reminder_24h", "viewing_reminder_2h", "weekly_insights", "viewing_feedback", "viewing_cancelled_closed", "tenant_licence_copy", "tenant_eicr_copy", "tenant_deposit_info", "tenant_rent_notice", "landlord_arrears_notice", "rent_arrears", "renewal_landlord", "renewal_tenant", "applicant_welcome", "owner_statement"];
const PROMOTION = marketing => marketing ? `(outbound.template IN (${TRANSACTIONAL.map(t => `'${t}'`).join(",")})
  OR (EXISTS (SELECT 1 FROM contacts WHERE id = CAST(outbound.entity_id AS INTEGER) AND email = outbound.recipient)
    AND ${ALLOWED("CAST(outbound.entity_id AS INTEGER)", `CASE WHEN substr(outbound.template,1,${MARKETING_TEMPLATE.length})
      = '${MARKETING_TEMPLATE}' THEN substr(outbound.template,${MARKETING_TEMPLATE.length + 1}) END`, "'email'")}))`
  : `substr(outbound.template,1,${MARKETING_TEMPLATE.length}) <> '${MARKETING_TEMPLATE}'`;
// checks: [templates, SQL] per template with its own claim-time check, as outboundGate builds them (one CASE, so the
// claim is as deep as its deepest check, not their sum: D1 refuses an expression deeper than 100). Any other template: 1.
const BY_TEMPLATE = checks => `CASE outbound.template ${checks.flatMap(([templates, sql]) => templates.map(t => `WHEN '${t}' THEN (${sql})`))
  .join(" ")} ELSE 1 END`;
const AUTHORIZED = (checks, marketing = false, notice = "1") => `EXISTS (SELECT 1 FROM app_settings es WHERE es.key = 'email'
  AND json_extract(es.value,'$.enabled') = 1
  AND (outbound.template <> 'team_summary' OR (json_extract(es.value,'$.summary') = 1
    AND json_extract(es.value,'$.revision') = outbound.config_revision
    AND EXISTS (SELECT 1 FROM json_each(es.value,'$.recipients') WHERE value = outbound.recipient))))
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'outbound' AND json_extract(value,'$.paused') = 1)
  AND NOT EXISTS (SELECT 1 FROM email_suppressions WHERE address_hash = outbound.recipient_hash)
  AND outbound.approved_at IS NOT NULL AND outbound.approved_by IS NOT NULL
  AND outbound.recipient IS NOT NULL AND outbound.text IS NOT NULL AND outbound.subject IS NOT NULL
  AND ${PROMOTION(marketing)} AND ${notice} AND ${BY_TEMPLATE(checks)}`;
// The one provider call: the queued emails below and ADM-12's sign-in code (case-auth-email.js), from the same sender.
// Callers check serviceReady and the binding first, and reserve the day's quota in email_attempts before calling.
export const sendNow = (env, to, subject, text) => env.EMAIL.send({ from: { email: EMAIL_FROM, name: "Hampton Estates" }, to,
  replyTo: EMAIL_REPLY_TO, subject, text,
  html: `<div style="font:15px/1.6 Arial,sans-serif;color:#141414"><pre style="font:inherit;white-space:pre-wrap">${esc(text)}</pre></div>` });
const RETRY = new Set(["E_RATE_LIMIT_EXCEEDED", "E_DAILY_LIMIT_EXCEEDED"]);
const REJECTED = new Set(["E_VALIDATION_ERROR", "E_FIELD_MISSING", "E_TOO_MANY_RECIPIENTS", "E_TOO_MANY_ATTACHMENTS",
  "E_SENDER_NOT_VERIFIED", "E_RECIPIENT_NOT_ALLOWED", "E_RECIPIENT_SUPPRESSED", "E_ACCOUNT_SUSPENDED",
  "E_SENDER_DOMAIN_NOT_AVAILABLE", "E_CONTENT_TOO_LARGE", "E_DELIVERY_FAILED", "E_HEADER_NOT_ALLOWED",
  "E_HEADER_USE_API_FIELD", "E_HEADER_VALUE_INVALID", "E_HEADER_VALUE_TOO_LONG", "E_HEADER_NAME_INVALID",
  "E_HEADERS_TOO_LARGE", "E_HEADERS_TOO_MANY"]);

// Stale claims become unknown and yesterday's queued team summaries go. Run before every dispatch, by either transport.
async function expireOutbound(env, ts) {
  // The token stays on an expired claim, so Hermes's carrier can still settle it with a late result (settleForHermes).
  await env.DB.prepare(`UPDATE outbound SET status='unknown', error_code='CLAIM_EXPIRED', updated_at=?
    WHERE status='sending' AND claimed_at < ?`).bind(ts, new Date(Date.parse(ts) - 5 * 60e3).toISOString()).run();
  await env.DB.prepare(`UPDATE outbound SET status='cancelled', updated_at=? WHERE status='queued'
    AND template='team_summary' AND entity_id < ?`).bind(ts, emailDay(ts)).run();
}

// The emails that may be claimed now, oldest first, and the claim of one: it reserves the day's quota and checks the
// settings again, all in the claim. null: not claimed (taken, a setting changed, or the day's limit).
async function outboundGate(env, enquiry, day) {
  // PRE-12: a retention notice goes only while its check holds, and at most NOTICE_DAILY_LIMIT of them a Jersey day,
  // counted like the day's quota inside the claim. day is emailDay's output: digits and dashes only.
  const notice = await noticeClaimSql(env);
  const capped = notice === NO_NOTICE ? notice : `${notice} AND (outbound.template <> 'retention_notice'
    OR (SELECT COUNT(*) FROM email_attempts na JOIN outbound nr ON nr.id = na.outbound_id
      WHERE na.day = '${day}' AND nr.template = 'retention_notice') < ${NOTICE_DAILY_LIMIT})`;
  // Each template with its own claim-time check, read from env (switch off or before its migration: "0", never claimed).
  // A new one adds its line here and its name to TRANSACTIONAL.
  const checks = [
    [["enquiry"], enquiry ?? "0"], // AGE-05: none given, none claimed
    [["offer_to_seller"], await offerClaimSql(env)], // OFE-02
    [REMINDERS, await reminderClaimSql(env)], // VIS-13
    [["weekly_insights"], await weeklyClaimSql(env)], // AUT-22
    [VIEWING_EMAILS, await viewingEmailClaimSql(env)], // AUT-21
    [RENTAL_EMAILS, await rentalEmailClaimSql(env)], // AUT-24
    [RENTAL_STEP_EMAILS, await rentalStepClaimSql(env)], // AUT-23
    [[WELCOME], welcomeClaimSql(env)], // AUT-25
    [[STATEMENT_TEMPLATE], statementEmailClaimSql(env)], // ADM-10
  ];
  return { notice, claim: AUTHORIZED(checks, purposeReady(env), capped), after: AUTHORIZED(checks, purposeReady(env), notice) };
}
async function candidates(env, ts, enquiry, limit) {
  const { claim } = await outboundGate(env, enquiry, emailDay(ts));
  // ponytail: 20 candidates per tick is the current team maximum; move to a larger bounded batch if volume needs it.
  return (await env.DB.prepare(`SELECT id FROM outbound WHERE status='queued' AND attempts < 3
    AND (next_attempt_at IS NULL OR next_attempt_at <= ?) AND ${claim} ORDER BY id LIMIT ${limit}`).bind(ts).all()).results;
}
async function claimOutbound(env, id, ts, enquiry) {
  const day = emailDay(ts), { claim, after } = await outboundGate(env, enquiry, day);
  await env.DB.prepare(`UPDATE outbound SET status='cancelled',updated_at=? WHERE status='queued'
    AND template='team_summary' AND entity_id < ?`).bind(ts,day).run();
  const token = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`UPDATE outbound SET status='sending', claim_token=?, claimed_at=?, attempts=attempts+1, updated_at=?
      WHERE id=? AND status='queued' AND attempts < 3 AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      AND (template<>'team_summary' OR entity_id=?)
      AND ${claim} AND (SELECT COUNT(*) FROM email_attempts WHERE day=?) < ${DAILY_LIMIT}`)
      .bind(token, ts, ts, id, ts, day,day),
    env.DB.prepare(`INSERT INTO email_attempts(token,outbound_id,day,at)
      SELECT ?,id,?,? FROM outbound WHERE id=? AND claim_token=? AND status='sending'`).bind(token, day, ts, id, token),
  ]);
  const row = await env.DB.prepare(`SELECT * FROM outbound WHERE id=? AND claim_token=? AND status='sending'
    AND ${after}`).bind(id, token).first();
  if (!row) {
    // A setting changed after the claim. The reservation stays used; a pause leaves the same snapshot queued.
    await env.DB.prepare(`UPDATE outbound SET status=CASE WHEN attempts < 3 THEN 'queued' ELSE 'failed' END,
      claim_token=NULL, updated_at=? WHERE id=? AND claim_token=? AND status='sending'`).bind(ts,id,token).run();
    return null;
  }
  return { row, token, day };
}
// What the provider said: accepted with its id, or an error code (RETRY, REJECTED or anything else: unknown).
async function settleOutbound(env, row, token, { messageId, code }, ts, finished) {
  if (messageId) return env.DB.prepare(`UPDATE outbound SET status = 'accepted', message_id=?, error_code=NULL, claim_token=NULL,
    updated_at=? WHERE id=? AND claim_token=? AND status='sending'`).bind(messageId,finished,row.id,token).run();
  code = RETRY.has(code) || REJECTED.has(code) ? code : "UNKNOWN_RESULT";
  const status = RETRY.has(code) && row.attempts < 3 ? "queued" : REJECTED.has(code) || RETRY.has(code) ? "failed" : "unknown";
  const next = status === "queued" ? new Date(Date.parse(finished) + 10 * 60e3).toISOString() : null;
  return env.DB.batch([
    env.DB.prepare(`UPDATE outbound SET status=?,error_code=?,next_attempt_at=?,claim_token=NULL,updated_at=?
      WHERE id=? AND claim_token=? AND status='sending'`).bind(status,code,next,finished,row.id,token),
    ...(code === "E_RECIPIENT_SUPPRESSED" ? [env.DB.prepare(`INSERT INTO email_suppressions VALUES (?,?,'provider')
      ON CONFLICT(address_hash) DO NOTHING`).bind(row.recipient_hash,ts)] : []),
  ]);
}

export async function dispatchEmail(env, clock = now, enquiry) {
  await expireOutbound(env, clock());
  if (!serviceReady(env) || typeof env.EMAIL?.send !== "function") return;
  for (const { id } of await candidates(env, clock(), enquiry, 20)) {
    // Network calls can cross midnight. Read the current day for every claim, not once for the entire batch.
    const ts = clock(), claimed = await claimOutbound(env, id, ts, enquiry);
    if (!claimed) continue;
    const { row, token, day } = claimed;
    if(emailDay(clock())!==day){
      // The day changed while reserving quota. No call has started: do not charge a new-day send to yesterday.
      await env.DB.prepare(`UPDATE outbound SET status=CASE WHEN template='team_summary' THEN 'cancelled' ELSE 'queued' END,
        claim_token=NULL,updated_at=? WHERE id=? AND claim_token=? AND status='sending'`).bind(clock(),id,token).run();
      continue;
    }
    if (!serviceReady(env) || typeof env.EMAIL?.send !== "function") return;
    let result;
    try {
      const sent = await sendNow(env, row.recipient, outboundSubject(row), row.text);
      if (typeof sent?.messageId !== "string" || !sent.messageId.length || sent.messageId.length > 512)
        throw new Error("Missing acceptance id");
      result = { messageId: sent.messageId };
    } catch (error) { result = { code: error?.code }; }
    // A failed acceptance write is ambiguous too: unknown. If this write also fails, the stale claim becomes unknown next tick.
    try { await settleOutbound(env, row, token, result, ts, clock()); }
    catch {
      try { if (!result.messageId) throw new Error("again"); await settleOutbound(env, row, token, { code: null }, ts, clock()); }
      catch { console.error("Email state persistence failed"); }
    }
  }
}

// The subject as it goes out: the reference lets a reply find its email (server/email-inbound.js).
const outboundSubject = row => `${row.subject} [HE-OUT-${row.ref}]`;

// AUT-17: the same queue for Hermes's mail carrier (server/hermes-mail.js), one email per call, sent verbatim.
// enquiry: AGE-05's check (server/consultation-email.js), as the clock's. Gmail took it (messageId), refused it
// (failed, never sent again) or it is not known (unknown, for a person to check).
// Retention notices stay on Cloudflare: they ask for a reply, and only Cloudflare's inbound brings it back to the app.
export async function claimForHermes(env, enquiry) {
  const ts = now();
  await expireOutbound(env, ts);
  for (const { id } of await candidates(env, ts, enquiry, 20)) {
    if ((await env.DB.prepare("SELECT template FROM outbound WHERE id = ?").bind(id).first())?.template === "retention_notice") continue;
    const claimed = await claimOutbound(env, id, ts, enquiry);
    if (claimed) return { ref: claimed.row.ref, token: claimed.token, to: claimed.row.recipient, subject: outboundSubject(claimed.row), text: claimed.row.text };
  }
  return null;
}
// outcome: sent, failed (never sent again), retry (nothing left: queued again, as the clock's rate limits) or unknown.
const HERMES_CODE = { failed: "E_DELIVERY_FAILED", retry: "E_RATE_LIMIT_EXCEEDED", unknown: null };
export async function settleForHermes(env, ref, token, outcome, messageId, threadId) {
  const r = await settleHermes(env, ref, token, outcome, messageId);
  // Fase D: an enquiry, OFE-02's offer to a seller or a VIS-13 reminder Gmail took keeps its thread (once), so the
  // carrier reads the reply there (server/hermes-mail.js).
  if (threadId && outcome === "sent" && (r === "ok" || r === "same"))
    await env.DB.prepare(`UPDATE outbound SET gmail_thread_id = ? WHERE ref = ? AND template IN ('enquiry', 'offer_to_seller', 'viewing_reminder_24h', 'viewing_reminder_2h', 'viewing_feedback', 'viewing_cancelled_closed', 'tenant_licence_copy', 'tenant_eicr_copy', 'tenant_deposit_info', 'tenant_rent_notice', 'landlord_arrears_notice', 'rent_arrears', 'renewal_landlord', 'renewal_tenant', 'applicant_welcome') AND status = 'accepted'
      AND message_id = ? AND gmail_thread_id IS NULL`).bind(threadId, ref, messageId).run();
  return r;
}
async function settleHermes(env, ref, token, outcome, messageId) {
  const row = await env.DB.prepare("SELECT * FROM outbound WHERE ref = ?").bind(ref).first();
  if (!row) return "missing";
  if (row.status === "accepted" && outcome === "sent" && row.message_id === messageId) return "same";
  if (row.claim_token !== token) return row.claim_token === null ? "settled" : "token";
  const ts = now();
  if (row.status === "unknown" && row.error_code === "CLAIM_EXPIRED" && row.reviewed_at == null) {
    // The claim expired while the result was on its way: only a send or a refusal says more than unknown.
    if (outcome !== "sent" && outcome !== "failed") return "settled";
    const r = await env.DB.prepare(`UPDATE outbound SET status=?, message_id=?, error_code=?, claim_token=NULL, updated_at=?
      WHERE id=? AND claim_token=? AND status='unknown' AND error_code='CLAIM_EXPIRED' AND reviewed_at IS NULL`)
      .bind(outcome === "sent" ? "accepted" : "failed", outcome === "sent" ? messageId : null, outcome === "sent" ? null : "E_DELIVERY_FAILED",
        ts, row.id, token).run();
    return r.meta.changes ? "ok" : "settled";
  }
  if (row.status !== "sending") return "settled";
  const r = await settleOutbound(env, row, token, outcome === "sent" ? { messageId } : { code: HERMES_CODE[outcome] }, ts, ts);
  return (Array.isArray(r) ? r[0] : r).meta.changes ? "ok" : "settled";
}

export { cleanEmail } from "./email-retention.js";

export async function emailPass(env, ts = now(), clock = now, enquiry) {
  try {
    await env.DB.prepare(`INSERT INTO app_settings VALUES ('email_worker',?,?, 'system') ON CONFLICT(key)
      DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(JSON.stringify({at:ts,
        ready:serviceReady(env) && typeof env.EMAIL?.send === "function", hermes:hermesTransport(env)}),ts).run();
    await prepareSummary(env, ts); await dispatchEmail(env, clock, enquiry);
  }
  catch { console.error("Email pass failed"); } // logs never include provider payloads, addresses or bodies
}
