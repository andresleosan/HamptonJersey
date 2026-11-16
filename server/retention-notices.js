import { sha256 } from "./http.js";
import { jerseyToday } from "./viewings.js";
import { EXEMPT, NOTICE_ANSWERED, OPEN_PRIVACY_REQUEST, expiringSql, noticeTable, privacyHolds, retentionNoticesReady }
  from "./retention.js";
import { SITE, readEmailSettings, serviceReady } from "./email.js";

// PRE-12 (Q05): the notice before the retention pass deletes a contact for 12 months without activity. In the contact's
// 12th month (Expiring, with its holds) the clock queues one email per activity episode in the existing pipeline
// (server/email.js), at most 50 a tick (and 20 sent a Jersey day, NOTICE_DAILY_LIMIT there), giving the date from which
// the details may go: the end of the 12 months, and never less than a month away. The pass then deletes a contact with
// an email only once that notice was accepted a month before, the date has come and nothing has answered it (NOTICE_KEPT
// and NOTICE_GIVEN in retention.js). A failed, uncertain, unsent or answered notice keeps the contact and opens one Inbox
// task; a person decides, and the task's Done authorises nothing. New activity ends the episode: its notice goes, and
// its email if still waiting. A contact with no email goes as before. Nothing here moves last_activity_at or closes a
// search. The text is fixed and needs no review per email: Luis approves it once and turning
// PRE12_RETENTION_NOTICE_READY on is that approval, written as the email's approver. Off, or before 0112, nothing here
// runs.
export const NOTICES_PER_TICK = 50;
const TEMPLATE = "retention_notice", VERSION = 1, APPROVAL = "PRE12_RETENTION_NOTICE_READY";
const SUBJECT = "Your details with Hampton Estates will be deleted";
const LONG = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const text = date => ["Hello,", "",
  "It has been some time since we last heard from you. As our privacy notice explains, we keep your details for 12 months from the last activity on your record.",
  "",
  `We will delete your contact details and the property searches we hold for you, with their matches and any offers recorded on them, on or after ${
    LONG.format(new Date(`${date}T00:00:00Z`))}.`,
  "",
  "If you would like us to keep them, reply to this email or contact us before that date. If you are happy for them to be deleted, you do not need to do anything.",
  "", "Hampton Estates", "42 Bath Street, St Helier, Jersey JE2 4ST", "Contact: francopropertiesjersey@gmail.com",
  `Privacy notice: ${SITE}/#/privacy`].join("\n");

// True whichever way the notice ends: a notice confirmed sent later still lets the pass delete a month after.
const ABOUT = "the notice telling this contact that their details will be deleted after 12 months without activity";
const KEEP = " Nothing has been deleted. The retention pass deletes this record only once a notice has been confirmed sent and a month has passed. To keep it, contact the person and log the conversation; if they agree, delete it. Marking this task done changes nothing.";
export const REVIEW = {
  failed: ["Retention notice failed", `The email service could not deliver ${ABOUT}.${KEEP}`],
  unknown: ["Retention notice result unknown", `It is not known whether the email service accepted ${ABOUT}.${KEEP}`],
  not_sent: ["Retention notice not sent", `${ABOUT[0].toUpperCase()}${ABOUT.slice(1)} was not sent: its address is suppressed, it was cancelled or email sending is off.${KEEP}`],
  replied: ["Reply to a retention notice", `This contact sent an email after their retention notice; read it in Email.${KEEP}`],
};
const TASK_KEY = "'retention_notice:' || c.id || ':' || c.last_activity_at";

export async function retentionNoticePass(env, ts) {
  if (!retentionNoticesReady(env) || !await noticeTable(env)) return; // off, or switched on before 0112: nothing to do
  const day = jerseyToday(new Date(ts)), held = privacyHolds(env) ? ` AND NOT ${OPEN_PRIVACY_REQUEST}` : "";
  // A notice of an episode that ended (new activity, which an address change is too) goes; so does one still waiting for
  // a contact the pass would no longer delete (a search or offer opened, a privacy request), its email unsent. The
  // contact's next episode gets its own.
  const OBSOLETE = `SELECT n.id FROM retention_notices n WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = n.contact_id
    AND c.last_activity_at = n.activity_at AND (n.state <> 'queued' OR (${EXEMPT}${held})))`;
  await env.DB.batch([
    // What became of each email: accepted (when), failed, unknown, or never sent (cancelled, or already gone).
    env.DB.prepare(`UPDATE retention_notices SET state = COALESCE((SELECT CASE o.status WHEN 'accepted' THEN 'accepted'
        WHEN 'failed' THEN 'failed' WHEN 'unknown' THEN 'unknown' WHEN 'cancelled' THEN 'not_sent' END
        FROM outbound o WHERE o.ref = retention_notices.outbound_ref), 'not_sent'),
      sent_at = (SELECT o.updated_at FROM outbound o WHERE o.ref = retention_notices.outbound_ref AND o.status = 'accepted'),
      updated_at = ?1
      WHERE state = 'queued' AND NOT EXISTS (SELECT 1 FROM outbound o WHERE o.ref = retention_notices.outbound_ref
        AND o.status IN ('draft', 'queued', 'sending'))`).bind(ts),
    // An answer (NOTICE_ANSWERED in retention.js), kept here once the email's content is cleared after 30 days.
    env.DB.prepare(`UPDATE retention_notices SET state = 'replied', updated_at = ?1 WHERE id IN (SELECT n.id FROM retention_notices n
      JOIN contacts c ON c.id = n.contact_id AND c.last_activity_at = n.activity_at WHERE n.state = 'accepted' AND ${NOTICE_ANSWERED})`)
      .bind(ts),
    env.DB.prepare(`UPDATE outbound SET status = 'cancelled', updated_at = ?1 WHERE status = 'queued' AND template = '${TEMPLATE}'
      AND ref IN (SELECT outbound_ref FROM retention_notices WHERE id IN (${OBSOLETE}))`).bind(ts),
    env.DB.prepare(`DELETE FROM retention_notices WHERE id IN (${OBSOLETE})`),
  ]);
  // Queued only while the email service can send: otherwise none is prepared, and the pass keeps the contact.
  const ready = serviceReady(env) && typeof env.EMAIL?.send === "function" && (await readEmailSettings(env)).enabled;
  if (ready) await prepare(env, ts, day, held);
  await openReviews(env, ts, day, ready);
}

// The oldest contacts of Expiring with an email and no notice for their episode. Each insert checks the contact is still
// as read; an address the team or the provider suppressed gets no email, and its notice counts as not sent.
async function prepare(env, ts, day, held) {
  const { results } = await env.DB.prepare(`SELECT c.id, c.email, c.last_activity_at AS activity_at,
      max(date(c.last_activity_at, '+12 months', '+1 day'), date(?, '+1 months')) AS delete_after
    FROM contacts c WHERE ${expiringSql(env)} AND c.email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM retention_notices n WHERE n.contact_id = c.id AND n.activity_at = c.last_activity_at)
    ORDER BY c.last_activity_at, c.id LIMIT ${NOTICES_PER_TICK}`).bind(day, day).all();
  const stmts = [];
  for (const c of results) {
    const ref = crypto.randomUUID().replaceAll("-", ""), hash = await sha256(c.email);
    stmts.push(
      env.DB.prepare(`INSERT INTO retention_notices (contact_id, activity_at, outbound_ref, delete_after, state, created_at, updated_at)
        SELECT c.id, c.last_activity_at, ?, ?, 'queued', ?, ? FROM contacts c WHERE c.id = ? AND c.last_activity_at = ?
          AND c.email = ? AND ${EXEMPT}${held} ON CONFLICT DO NOTHING`)
        .bind(ref, c.delete_after, ts, ts, c.id, c.activity_at, c.email),
      env.DB.prepare(`INSERT INTO outbound (ref, dedupe_key, template, entity_id, version, recipient, recipient_hash, subject, text,
          status, approved_by, approved_at, created_at, updated_at)
        SELECT ?, ?, '${TEMPLATE}', ?, ${VERSION}, ?, ?, ?, ?, 'queued', '${APPROVAL}', ?, ?, ? WHERE changes() = 1
          AND NOT EXISTS (SELECT 1 FROM email_suppressions WHERE address_hash = ?)`)
        .bind(ref, await sha256([TEMPLATE, c.id, c.activity_at, ref].join("\0")), String(c.id), c.email, hash, SUBJECT,
          text(c.delete_after), ts, ts, ts, hash),
      env.DB.prepare(`UPDATE retention_notices SET state = 'not_sent', outbound_ref = NULL WHERE outbound_ref = ?
        AND NOT EXISTS (SELECT 1 FROM outbound WHERE ref = ?)`).bind(ref, ref));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

// One Inbox task per contact and episode the pass keeps for its notice: failed, uncertain (no result, or none by the
// date it gave), not sent (suppressed, cancelled, or the email service off once the 12 months are over) or answered.
async function openReviews(env, ts, day, ready) {
  const { results } = await env.DB.prepare(`SELECT c.id, c.last_activity_at AS activity_at,
      CASE WHEN n.id IS NULL THEN 'not_sent' WHEN n.state = 'queued' THEN 'unknown' ELSE n.state END AS reason
    FROM contacts c LEFT JOIN retention_notices n ON n.contact_id = c.id AND n.activity_at = c.last_activity_at
    WHERE ${expiringSql(env)} AND c.email IS NOT NULL
      AND (n.state IN ('failed', 'unknown', 'not_sent', 'replied') OR (n.state = 'queued' AND n.delete_after <= ?)
        OR (n.id IS NULL AND ? = 0 AND c.last_activity_at < date(?, '-12 months')))
      AND NOT EXISTS (SELECT 1 FROM notifications WHERE task_key = ${TASK_KEY})
    ORDER BY c.last_activity_at, c.id LIMIT ${NOTICES_PER_TICK}`).bind(day, day, ready ? 1 : 0, day).all();
  const stmts = results.flatMap(c => {
    const key = `retention_notice:${c.id}:${c.activity_at}`, [title, reason] = REVIEW[c.reason];
    return [
      env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
        SELECT ?, 'system', 'contact', ?, 'contact.retention_notice_review', json_object('reason', ?)
        WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE task_key = ?)`).bind(ts, String(c.id), c.reason, key),
      env.DB.prepare(`INSERT INTO notifications (event_id, category, title, task_reason, action_required, created_at, task_key)
        SELECT last_insert_rowid(), 'task', ?, ?, 1, ?, ? WHERE changes() = 1`).bind(title, reason, ts, key)];
  });
  if (stmts.length) await env.DB.batch(stmts);
}
