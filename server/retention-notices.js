import { sha256, json, fail, readJson, now } from "./http.js";
import { jerseyToday } from "./viewings.js";
import { logEvent } from "./events.js";
import { EXEMPT, NOTICE_ANSWERED, OPEN_PRIVACY_REQUEST, noticeOutcomeStatements, expiringSql, noticeTable, privacyHolds, retentionNoticesReady,
  reviewTable, runningTenancyOn, tenancyNoticeHold } from "./retention.js";
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
const MANUAL = " Told another way? Record it on their applicant page."; // task_reason holds at most 500 characters
export const REVIEW = {
  failed: ["Retention notice failed", `The email service could not deliver ${ABOUT}.${KEEP}${MANUAL}`],
  unknown: ["Retention notice result unknown", `It is not known whether the email service accepted ${ABOUT}.${KEEP}${MANUAL}`],
  not_sent: ["Retention notice not sent", `${ABOUT[0].toUpperCase()}${ABOUT.slice(1)} was not sent: its address is suppressed, it was cancelled or email sending is off.${KEEP}${MANUAL}`],
  replied: ["Reply to a retention notice", `This contact sent an email after their retention notice; read it in Email.${KEEP}`],
};
const TASK_KEY = "'retention_notice:' || c.id || ':' || c.last_activity_at";

export async function retentionNoticePass(env, ts) {
  if (!retentionNoticesReady(env) || !await noticeTable(env)) return; // off, or switched on before 0112: nothing to do
  const day = jerseyToday(new Date(ts)), held = privacyHolds(env) ? ` AND NOT ${OPEN_PRIVACY_REQUEST}` : "";
  const tenant = await tenancyNoticeHold(env, day); // a contact kept for a running tenancy: no notice, and its old one goes
  const reviewed = !!(await reviewTable(env)); // 0119
  // A notice of an episode that ended (new activity, which an address change is too) goes; so does one still waiting for
  // a contact the pass would no longer delete (a search or offer opened, a privacy request), its email unsent. The
  // contact's next episode gets its own.
  const OBSOLETE = `SELECT n.id FROM retention_notices n WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = n.contact_id
    AND c.last_activity_at = n.activity_at${tenant} AND (n.state <> 'queued' OR (${EXEMPT}${held})))`;
  await env.DB.batch([
    ...noticeOutcomeStatements(env, ts, reviewed), // also run by every retention pass, before email content is cleared
    env.DB.prepare(`UPDATE outbound SET status = 'cancelled', updated_at = ?1 WHERE status = 'queued' AND template = '${TEMPLATE}'
      AND ref IN (SELECT outbound_ref FROM retention_notices WHERE id IN (${OBSOLETE}))`).bind(ts),
    env.DB.prepare(`DELETE FROM retention_notices WHERE id IN (${OBSOLETE})`),
    // A manual notice goes the same way for a contact kept for a running tenancy: its end never deletes on an old date.
    ...(reviewed && tenant ? [env.DB.prepare(`DELETE FROM retention_notice_reviews WHERE contact_id IN (SELECT c.id FROM contacts c
      WHERE ${runningTenancyOn(day)})`)] : []),
  ]);
  // Queued only while the email service can send: otherwise none is prepared, and the pass keeps the contact.
  const ready = serviceReady(env) && typeof env.EMAIL?.send === "function" && (await readEmailSettings(env)).enabled;
  if (ready) await prepare(env, ts, day, held, tenant);
  await openReviews(env, ts, day, ready, tenant, reviewed);
}

// The oldest contacts of Expiring with an email and no notice for their episode. Each insert checks the contact is still
// as read; an address the team or the provider suppressed gets no email, and its notice counts as not sent.
async function prepare(env, ts, day, held, tenant) {
  const { results } = await env.DB.prepare(`SELECT c.id, c.email, c.last_activity_at AS activity_at,
      max(date(c.last_activity_at, '+12 months', '+1 day'), date(?, '+1 months')) AS delete_after
    FROM contacts c WHERE ${expiringSql(env)}${tenant} AND c.email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM retention_notices n WHERE n.contact_id = c.id AND n.activity_at = c.last_activity_at)
    ORDER BY c.last_activity_at, c.id LIMIT ${NOTICES_PER_TICK}`).bind(day, day).all();
  const stmts = [];
  for (const c of results) {
    const ref = crypto.randomUUID().replaceAll("-", ""), hash = await sha256(c.email);
    stmts.push(
      env.DB.prepare(`INSERT INTO retention_notices (contact_id, activity_at, outbound_ref, delete_after, state, created_at, updated_at)
        SELECT c.id, c.last_activity_at, ?, ?, 'queued', ?, ? FROM contacts c WHERE c.id = ? AND c.last_activity_at = ?
          AND c.email = ? AND ${EXEMPT}${held}${tenant} ON CONFLICT DO NOTHING`)
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
// date it gave), not sent (suppressed, cancelled, or the email service off once the 12 months are over) or answered. None
// for an episode a person already reviewed (0119), except one more, as answered, once the person wrote after a manual
// notice (its review's answered_at): someone must read it.
async function openReviews(env, ts, day, ready, tenant, reviewed) {
  const { results } = await env.DB.prepare(`SELECT c.id, c.last_activity_at AS activity_at,
      CASE WHEN n.id IS NULL THEN 'not_sent' WHEN n.state = 'queued' THEN 'unknown' ELSE n.state END AS reason
    FROM contacts c LEFT JOIN retention_notices n ON n.contact_id = c.id AND n.activity_at = c.last_activity_at
    WHERE ${expiringSql(env)}${tenant} AND c.email IS NOT NULL
      AND (n.state IN ('failed', 'unknown', 'not_sent', 'replied') OR (n.state = 'queued' AND n.delete_after <= ?)
        OR (n.id IS NULL AND ? = 0 AND c.last_activity_at < date(?, '-12 months')))
      AND NOT EXISTS (SELECT 1 FROM notifications WHERE task_key = ${TASK_KEY})${reviewed ? `
      AND NOT EXISTS (SELECT 1 FROM retention_notice_reviews v WHERE v.contact_id = c.id AND v.activity_at = c.last_activity_at)` : ""}
    ORDER BY c.last_activity_at, c.id LIMIT ${NOTICES_PER_TICK}`).bind(day, day, ready ? 1 : 0, day).all();
  const answered = reviewed ? (await env.DB.prepare(`SELECT c.id, c.last_activity_at AS activity_at, 'replied' AS reason, 1 AS answered
    FROM contacts c JOIN retention_notice_reviews v ON v.contact_id = c.id AND v.activity_at = c.last_activity_at
    WHERE v.answered_at IS NOT NULL AND ${expiringSql(env)}${tenant}
      AND NOT EXISTS (SELECT 1 FROM notifications WHERE task_key = ${TASK_KEY} || ':answered')
    ORDER BY c.last_activity_at, c.id LIMIT ${NOTICES_PER_TICK}`).bind(day).all()).results : [];
  const stmts = [...results, ...answered].flatMap(c => {
    const key = `retention_notice:${c.id}:${c.activity_at}${c.answered ? ":answered" : ""}`, [title, reason] = REVIEW[c.reason];
    return [
      env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
        SELECT ?, 'system', 'contact', ?, 'contact.retention_notice_review', json_object('reason', ?)
        WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE task_key = ?)`).bind(ts, String(c.id), c.reason, key),
      env.DB.prepare(`INSERT INTO notifications (event_id, category, title, task_reason, action_required, created_at, task_key)
        SELECT last_insert_rowid(), 'task', ?, ?, 1, ?, ? WHERE changes() = 1`).bind(title, reason, ts, key)];
  });
  if (stmts.length) await env.DB.batch(stmts);
}

// PRE-12 (Q05, migration 0119): the domain review of a notice the pass keeps a contact for, by an admin, for the
// contact's current episode. manual_notice_documented: the day the person was told another way and what shows it; the
// pass may then delete the contact a month after that day, once the episode's date has come and nothing else keeps it
// (manualNotice in retention.js). keep_for_review keeps it and leaves its Inbox task open; a manual notice may follow.
// It deletes nothing and never moves last_activity_at; new activity starts an episode this review does not cover. The
// event holds no evidence. Reviewable: a contact of Expiring with an email whose notice failed, is uncertain or was not
// sent (or none was), never one still waiting, sent or answered.
const reviewable = async (env, day) => `c.email IS NOT NULL AND ${expiringSql(env).replaceAll("?", `'${day}'`)}${
  await tenancyNoticeHold(env, day)} AND NOT EXISTS (SELECT 1 FROM retention_notices n WHERE n.contact_id = c.id
    AND n.activity_at = c.last_activity_at AND n.state IN ('queued', 'accepted', 'replied'))`;
// The first day a manual notice may be given on: within the episode's 12th month, date(activity_at, '+11 months') as
// SQLite and Expiring count it (earlier would give no real month of warning), and within the last 30 days of the Jersey
// day it is recorded, so an answer since is still on file (the email clean-up blanks senders after 30 days) for the
// passes to keep on the review (answered_at).
const noticeFrom = (at, day) => {
  const d = new Date(`${String(at).slice(0, 10)}T00:00:00Z`), recent = new Date(`${day}T00:00:00Z`);
  if (isNaN(d) || isNaN(recent)) return "￿"; // above any date: nothing passes
  d.setUTCMonth(d.getUTCMonth() + 11);
  recent.setUTCDate(recent.getUTCDate() - 30);
  const [a, b] = [d, recent].map(x => x.toISOString().slice(0, 10));
  return a > b ? a : b;
};
const reviewsOn = async env => retentionNoticesReady(env) && !!(await noticeTable(env)) && !!(await reviewTable(env));

// For the applicant's page: undefined when switched off or before 0112/0119.
export async function noticeReviewFor(env, contactId) {
  if (!await reviewsOn(env)) return undefined;
  const day = jerseyToday();
  const r = await env.DB.prepare(`SELECT c.last_activity_at AS activity_at, n.state, (${await reviewable(env, day)}) AS ok,
      v.resolution_code, v.notice_given_on, v.evidence, v.actor, v.created_at
    FROM contacts c LEFT JOIN retention_notices n ON n.contact_id = c.id AND n.activity_at = c.last_activity_at
      LEFT JOIN retention_notice_reviews v ON v.contact_id = c.id AND v.activity_at = c.last_activity_at WHERE c.id = ?`)
    .bind(contactId).first();
  if (!r) return undefined;
  const { activity_at, state, ok, resolution_code, notice_given_on, evidence, actor, created_at } = r;
  return { activity_at, notice_from: noticeFrom(activity_at, day), state: state ?? null, reviewable: !!ok && resolution_code !== "manual_notice_documented",
    review: resolution_code ? { resolution_code, notice_given_on, evidence, actor, created_at } : null };
}

const RESULTS = ["manual_notice_documented", "keep_for_review"];
const isDay = d => typeof d === "string" && /^\d{4}-\d\d-\d\d$/.test(d) && !isNaN(Date.parse(`${d}T00:00:00Z`))
  && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
async function recordReview({ request, env, admin, params: [id] }) {
  if (!await reviewsOn(env)) fail(404, "Not found"); // before 0112 or 0119
  const b = await readJson(request), day = jerseyToday(), contactId = Number(id), errors = {};
  const code = b?.resolution_code, manual = code === "manual_notice_documented", activity = b?.activity_at;
  const evidence = typeof b?.evidence === "string" ? b.evidence.trim() : "", given = manual ? b?.notice_given_on : null;
  if (!RESULTS.includes(code)) errors.resolution_code = "Choose manual notice or keep for review";
  if (typeof activity !== "string" || !activity) errors.activity_at = "Reload the page and try again";
  if (!evidence || evidence.length > 1000) errors.evidence = "Say what shows it, in up to 1,000 characters";
  if (manual && !(isDay(given) && given <= day && given >= noticeFrom(activity, day)))
    errors.notice_given_on = "Give the day the person was told: within the last 30 days, and no earlier than their 12th month without activity";
  if (Object.keys(errors).length) return json({ error: "Please check the highlighted fields", fields: errors }, 400);
  const [{ meta }] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO retention_notice_reviews (contact_id, activity_at, resolution_code, evidence, notice_given_on, actor, created_at)
      SELECT c.id, c.last_activity_at, ?, ?, ?, ?, ? FROM contacts c WHERE c.id = ? AND c.last_activity_at = ? AND ${await reviewable(env, day)}
      ON CONFLICT (contact_id, activity_at) DO UPDATE SET resolution_code = excluded.resolution_code, evidence = excluded.evidence,
        notice_given_on = excluded.notice_given_on, actor = excluded.actor, created_at = excluded.created_at
      WHERE retention_notice_reviews.resolution_code = 'keep_for_review'`)
      .bind(code, evidence, given, admin, now(), contactId, activity),
    ...logEvent(env, { actor: admin, entity_type: "contact", entity_id: String(contactId), type: "contact.retention_notice_reviewed",
      data: { resolution_code: code, notice_given_on: given, activity_at: activity } }, null, { ifInserted: true }),
    // A manual notice answers the episode's Inbox task; keep_for_review leaves it open.
    ...(manual ? [env.DB.prepare(`UPDATE notifications SET resolved_at = COALESCE(resolved_at, ?1), resolved_by = COALESCE(resolved_by, ?2),
      closed_by_source = 1, task_actor = ?2, task_action = 'source_resolved' WHERE task_key = ?3
      AND (resolved_at IS NULL OR closed_by_source = 0) AND changes() = 1`).bind(now(), admin, `retention_notice:${contactId}:${activity}`)] : []),
  ]);
  if (!meta.changes) {
    const c = await env.DB.prepare("SELECT last_activity_at FROM contacts WHERE id = ?").bind(contactId).first();
    if (!c) fail(404, "Contact not found");
    fail(409, c.last_activity_at !== activity ? "This contact has had new activity since. Reload the page."
      : "This contact's notice does not need a review now. Reload the page.");
  }
  const retention_notice = await noticeReviewFor(env, contactId);
  return json({ retention_notice, review: retention_notice.review });
}

export const noticeReviewRoutes = [["POST", /^\/admin\/contacts\/([1-9]\d{0,14})\/retention-notice-review$/, recordReview, true]];
