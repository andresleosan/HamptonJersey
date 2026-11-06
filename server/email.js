import { logEvent } from "./events.js";
import { now, sha256 } from "./http.js";
import { openCounts } from "./routes/notifications.js";

export const EMAIL_FROM = "hello@hamptonestatesjersey.com";
export const EMAIL_REPLY_TO = "replies@app.hamptonestatesjersey.com";
export const DAILY_LIMIT = 100;
const SITE = "https://www.hamptonestatesjersey.com";
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

export async function summarySnapshot(env, ts) {
  const c = await openCounts(env);
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
  if (!serviceReady(env) || !env.EMAIL || !s.enabled || !s.summary || !s.approved_at || !s.approved_by || hour < 8 || !s.recipients.length) return;
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
const AUTHORIZED = `EXISTS (SELECT 1 FROM app_settings es WHERE es.key = 'email'
  AND json_extract(es.value,'$.enabled') = 1
  AND (outbound.template <> 'team_summary' OR (json_extract(es.value,'$.summary') = 1
    AND json_extract(es.value,'$.revision') = outbound.config_revision
    AND EXISTS (SELECT 1 FROM json_each(es.value,'$.recipients') WHERE value = outbound.recipient))))
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'outbound' AND json_extract(value,'$.paused') = 1)
  AND NOT EXISTS (SELECT 1 FROM email_suppressions WHERE address_hash = outbound.recipient_hash)
  AND outbound.approved_at IS NOT NULL AND outbound.approved_by IS NOT NULL
  AND outbound.recipient IS NOT NULL AND outbound.text IS NOT NULL AND outbound.subject IS NOT NULL`;
const RETRY = new Set(["E_RATE_LIMIT_EXCEEDED", "E_DAILY_LIMIT_EXCEEDED"]);
const REJECTED = new Set(["E_VALIDATION_ERROR", "E_FIELD_MISSING", "E_TOO_MANY_RECIPIENTS", "E_TOO_MANY_ATTACHMENTS",
  "E_SENDER_NOT_VERIFIED", "E_RECIPIENT_NOT_ALLOWED", "E_RECIPIENT_SUPPRESSED", "E_ACCOUNT_SUSPENDED",
  "E_SENDER_DOMAIN_NOT_AVAILABLE", "E_CONTENT_TOO_LARGE", "E_DELIVERY_FAILED", "E_HEADER_NOT_ALLOWED",
  "E_HEADER_USE_API_FIELD", "E_HEADER_VALUE_INVALID", "E_HEADER_VALUE_TOO_LONG", "E_HEADER_NAME_INVALID",
  "E_HEADERS_TOO_LARGE", "E_HEADERS_TOO_MANY"]);

export async function dispatchEmail(env, clock = now) {
  const ts = clock();
  const cutoff = new Date(Date.parse(ts) - 5 * 60e3).toISOString(), day = emailDay(ts);
  await env.DB.prepare(`UPDATE outbound SET status='unknown', error_code='CLAIM_EXPIRED', claim_token=NULL, updated_at=?
    WHERE status='sending' AND claimed_at < ?`).bind(ts, cutoff).run();
  await env.DB.prepare(`UPDATE outbound SET status='cancelled', updated_at=? WHERE status='queued'
    AND template='team_summary' AND entity_id < ?`).bind(ts, day).run();
  if (!serviceReady(env) || typeof env.EMAIL?.send !== "function") return;
  // ponytail: 20 candidates per tick is the current team maximum; move to a larger bounded batch if volume needs it.
  const { results } = await env.DB.prepare(`SELECT id FROM outbound WHERE status='queued' AND attempts < 3
    AND (next_attempt_at IS NULL OR next_attempt_at <= ?) AND ${AUTHORIZED} ORDER BY id LIMIT 20`).bind(ts).all();
  for (const { id } of results) {
    // Network calls can cross midnight. Read the current day for every claim, not once for the entire batch.
    const ts=clock(),day=emailDay(ts);
    await env.DB.prepare(`UPDATE outbound SET status='cancelled',updated_at=? WHERE status='queued'
      AND template='team_summary' AND entity_id < ?`).bind(ts,day).run();
    const token = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`UPDATE outbound SET status='sending', claim_token=?, claimed_at=?, attempts=attempts+1, updated_at=?
        WHERE id=? AND status='queued' AND attempts < 3 AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        AND (template<>'team_summary' OR entity_id=?)
        AND ${AUTHORIZED} AND (SELECT COUNT(*) FROM email_attempts WHERE day=?) < ${DAILY_LIMIT}`)
        .bind(token, ts, ts, id, ts, day,day),
      env.DB.prepare(`INSERT INTO email_attempts(token,outbound_id,day,at)
        SELECT ?,id,?,? FROM outbound WHERE id=? AND claim_token=? AND status='sending'`).bind(token, day, ts, id, token),
    ]);
    const row = await env.DB.prepare(`SELECT * FROM outbound WHERE id=? AND claim_token=? AND status='sending'
      AND ${AUTHORIZED}`).bind(id, token).first();
    if (!row) {
      // A setting changed after the claim. The reservation stays used; a pause leaves the same snapshot queued.
      await env.DB.prepare(`UPDATE outbound SET status=CASE WHEN attempts < 3 THEN 'queued' ELSE 'failed' END,
        claim_token=NULL, updated_at=? WHERE id=? AND claim_token=? AND status='sending'`).bind(ts,id,token).run();
      continue;
    }
    if(emailDay(clock())!==day){
      // The day changed while reserving quota. No call has started: do not charge a new-day send to yesterday.
      await env.DB.prepare(`UPDATE outbound SET status=CASE WHEN template='team_summary' THEN 'cancelled' ELSE 'queued' END,
        claim_token=NULL,updated_at=? WHERE id=? AND claim_token=? AND status='sending'`).bind(clock(),id,token).run();
      continue;
    }
    if (!serviceReady(env) || typeof env.EMAIL?.send !== "function") return;
    try {
      const result = await env.EMAIL.send({ from: { email: EMAIL_FROM, name: "Hampton Estates" }, to: row.recipient,
        replyTo: EMAIL_REPLY_TO, subject: `${row.subject} [HE-OUT-${row.ref}]`, text: row.text,
        html: `<div style="font:15px/1.6 Arial,sans-serif;color:#141414"><pre style="font:inherit;white-space:pre-wrap">${esc(row.text)}</pre></div>` });
      if (typeof result?.messageId !== "string" || !result.messageId.length || result.messageId.length > 512)
        throw new Error("Missing acceptance id");
      await env.DB.prepare(`UPDATE outbound SET status = 'accepted', message_id=?, error_code=NULL, claim_token=NULL,
        updated_at=? WHERE id=? AND claim_token=? AND status='sending'`).bind(result.messageId,clock(),id,token).run();
    } catch (error) {
      const code = RETRY.has(error?.code) || REJECTED.has(error?.code) ? error.code : "UNKNOWN_RESULT";
      const status = RETRY.has(code) && row.attempts < 3 ? "queued" : REJECTED.has(code) || RETRY.has(code) ? "failed" : "unknown";
      const finished=clock(),next = status === "queued" ? new Date(Date.parse(finished) + 10 * 60e3).toISOString() : null;
      // A failed acceptance write is ambiguous too. If this write also fails, the stale claim becomes unknown next tick.
      try {
        await env.DB.batch([
          env.DB.prepare(`UPDATE outbound SET status=?,error_code=?,next_attempt_at=?,claim_token=NULL,updated_at=?
            WHERE id=? AND claim_token=? AND status='sending'`).bind(status,code,next,finished,id,token),
          ...(code === "E_RECIPIENT_SUPPRESSED" ? [env.DB.prepare(`INSERT INTO email_suppressions VALUES (?,?,'provider')
            ON CONFLICT(address_hash) DO NOTHING`).bind(row.recipient_hash,ts)] : []),
        ]);
      } catch { console.error("Email state persistence failed"); }
    }
  }
}

export { cleanEmail } from "./email-retention.js";

export async function emailPass(env, ts = now(), clock = now) {
  try {
    await env.DB.prepare(`INSERT INTO app_settings VALUES ('email_worker',?,?, 'system') ON CONFLICT(key)
      DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(JSON.stringify({at:ts,
        ready:serviceReady(env) && typeof env.EMAIL?.send === "function"}),ts).run();
    await prepareSummary(env, ts); await dispatchEmail(env, clock);
  }
  catch { console.error("Email pass failed"); } // logs never include provider payloads, addresses or bodies
}
