import { pruneSearchMetrics, searchStatsReady } from "./search-measurement.js";
import { now } from "./http.js";
import { jerseyToday } from "./viewings.js";
import { normalizePhone } from "./applicants.js";
import { KEEP_DAYS } from "./chat.js";
import { cleanEmail } from "./email-retention.js";

// G2: contacts 12 months without activity and viewing requests whose date is over 12 months old are deleted once a
// Jersey day, as the manual deletes do it (E4, E5). E7: at most RETENTION_CAP of each per pass, oldest first, in one
// batch of a fixed number of set-based statements, whatever the count; what is left goes the next day. The same pass
// deletes Hermes's jobs 90 days after their last activity, never a draft (AUT-01, A5; JOBS below), and the website's
// chats 30 days after their last message (MSG-02; CHATS below).
export const RETENTION_CAP = 500;

// E3: a contact with a sale on any of its searches, in any status, is kept (V14: 5 years). For a query on contacts c.
export const NO_SALE = "NOT EXISTS (SELECT 1 FROM applicants s JOIN sales x ON x.applicant_id = s.id WHERE s.contact_id = c.id)";
// What the pass and Expiring leave alone: E3, and a buyer in an open negotiation (an offer pending or countered on any of
// its searches) for as long as it lasts. For a query on contacts c.
export const HAS_OPEN_SEARCH = "EXISTS (SELECT 1 FROM applicants s WHERE s.contact_id = c.id AND s.search_state IN ('active', 'needs_review'))";
export const HAS_OPEN_OFFER = `EXISTS (SELECT 1 FROM applicants s JOIN offers o ON o.applicant_id = s.id
  WHERE s.contact_id = c.id AND o.status IN ('pending', 'countered'))`;
export const EXEMPT = `(${NO_SALE} AND NOT ${HAS_OPEN_OFFER} AND NOT ${HAS_OPEN_SEARCH})`;
// Review due is not a deletion deadline. No automated job advances the activity/contact clocks.
export const RETENTION_REVIEW = `c.last_activity_at < date(?, '-11 months') AND ${HAS_OPEN_SEARCH}`;

// E8: a contact the pass deletes within a month, or one already due that it has not reached (over the cap, or a failed
// pass), so the delay shows. Bind the Jersey date. A range on contacts_activity: only the contacts in it are read.
export const EXPIRING = `c.last_activity_at < date(?, '-11 months') AND ${EXEMPT}`;
// E9: the day a contact's 12 months end; the pass deletes it on a later Jersey day.
export const KEPT_UNTIL = "strftime('%Y-%m-%d', c.last_activity_at, '+12 months')";
// PRE-12: with its switch on (and so migration 0101), a contact with an open privacy request other than an erasure one
// is kept: by the pass, out of Expiring and with no kept-until date. An erasure request is no hold: the deletion is what
// it asks for. Switched off, no statement names that table.
export const privacyHolds = env => env?.PRE12_REQUESTS_READY === "1";
export const OPEN_PRIVACY_REQUEST = `EXISTS (SELECT 1 FROM privacy_requests pr WHERE pr.contact_id = c.id AND pr.state = 'open'
  AND pr.kind <> 'erasure')`;
export const expiringSql = env => (privacyHolds(env) ? `${EXPIRING} AND NOT ${OPEN_PRIVACY_REQUEST}` : EXPIRING);
// PRE-12 (Q05): the notice before the pass deletes a contact (server/retention-notices.js, migration 0112). With its
// switch on, a contact with an email is deleted only once the notice of its activity episode was accepted by the email
// service a month before, the date it gave has come and nothing has answered it; a contact with no email goes as before.
// Once 0112 exists, whatever the switch (turned off again, or the website and the clock briefly different during a
// deploy), no contact goes against its episode's notice: one not accepted (waiting, failed, unknown, not sent,
// answered), or whose month or date has not come. Without 0112, no statement names that table. For contactsDue below:
// ?1 the pass's ISO time, ?2 its Jersey date.
export const retentionNoticesReady = env => env?.PRE12_RETENTION_NOTICE_READY === "1";
export const noticeTable = env => env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'retention_notices'").first();
// Anything received since notice n that may answer it: from contact c's address (envelope or From), quoting the notice's
// reference, threaded to its message or linked to it on arrival (server/email-inbound.js). When in doubt, it counts.
export const NOTICE_ANSWERED = `EXISTS (SELECT 1 FROM email_inbound i WHERE i.received_at >= n.created_at AND (i.sender = c.email
  OR i.header_from = c.email OR instr(lower(i.subject), '[he-out-' || n.outbound_ref || ']') > 0
  OR i.outbound_id IN (SELECT o.id FROM outbound o WHERE o.ref = n.outbound_ref)
  OR EXISTS (SELECT 1 FROM outbound o WHERE o.ref = n.outbound_ref AND o.message_id IS NOT NULL
    AND (instr(i.in_reply_to, o.message_id) > 0 OR instr(i.references_header, o.message_id) > 0))))`;
// What became of each notice email, and whether it was answered: recorded on the notice itself, so an answer still counts
// after its email's content is cleared (30 days, cleanEmail). Run by every retention pass before that clearing, whatever
// the switch (a reply while it is off must not be forgotten), and by the notice pass. reviews: with 0119, an answer to a
// manual notice is recorded on its review the same way (REVIEW_ANSWERED below).
export const noticeOutcomeStatements = (env, ts, reviews = false) => [
  env.DB.prepare(`UPDATE retention_notices SET state = COALESCE((SELECT CASE o.status WHEN 'accepted' THEN 'accepted'
      WHEN 'failed' THEN 'failed' WHEN 'unknown' THEN 'unknown' WHEN 'cancelled' THEN 'not_sent' END
      FROM outbound o WHERE o.ref = retention_notices.outbound_ref), 'not_sent'),
    sent_at = (SELECT o.updated_at FROM outbound o WHERE o.ref = retention_notices.outbound_ref AND o.status = 'accepted'),
    updated_at = ?1
    WHERE state = 'queued' AND NOT EXISTS (SELECT 1 FROM outbound o WHERE o.ref = retention_notices.outbound_ref
      AND o.status IN ('draft', 'queued', 'sending'))`).bind(ts),
  env.DB.prepare(`UPDATE retention_notices SET state = 'replied', updated_at = ?1 WHERE id IN (SELECT n.id FROM retention_notices n
    JOIN contacts c ON c.id = n.contact_id AND c.last_activity_at = n.activity_at WHERE n.state = 'accepted' AND ${NOTICE_ANSWERED})`)
    .bind(ts),
  ...(reviews ? [env.DB.prepare(`UPDATE retention_notice_reviews SET answered_at = ?1 WHERE answered_at IS NULL AND id IN (SELECT v.id
    FROM retention_notice_reviews v JOIN contacts c ON c.id = v.contact_id AND c.last_activity_at = v.activity_at
    WHERE v.resolution_code = 'manual_notice_documented' AND (${REVIEW_ANSWERED}))`).bind(ts)] : []),
];
const NOTICE_OF = "SELECT 1 FROM retention_notices n WHERE n.contact_id = c.id AND n.activity_at = c.last_activity_at";
const NOTICE_KEPT = `EXISTS (${NOTICE_OF} AND (n.state <> 'accepted' OR n.delete_after > ?2
  OR n.sent_at >= strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-1 months') OR ${NOTICE_ANSWERED}))`;
const NOTICE_GIVEN = `(c.email IS NULL OR EXISTS (${NOTICE_OF}))`;
// PRE-12 (Q05, migration 0119): a team member's review of the episode's notice (server/retention-notices.js). A notice
// the email service did not deliver (failed, unknown, not sent, or none at all) stops keeping the contact once someone
// recorded that the person was told by other means a month before, the date it gave has come and nothing has answered
// either: the accepted notice's rule, with the manual notice's day. keep_for_review, a waiting notice or an answered one
// keep it; so does a review of an earlier episode. An answer seen once is kept on the review (answered_at, recorded by
// noticeOutcomeStatements before the email clean-up blanks its sender), so it holds after the 30 days. Decides deletions
// only switched on with 0119; switched off, the passes only record answers.
export const reviewTable = env => env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'retention_notice_reviews'").first();
// For review v of contact c: an email from the person since the manual notice, or an answer to the episode's notice.
const REVIEW_ANSWERED = `EXISTS (SELECT 1 FROM email_inbound i WHERE i.received_at >= v.notice_given_on
  AND (i.sender = c.email OR i.header_from = c.email)) OR EXISTS (${NOTICE_OF} AND ${NOTICE_ANSWERED})`;
// tenants (as contactsDue's, 0113 with its switch): a link to a tenancy since the manual notice voids it, even if the
// notice pass that withdraws it (server/retention-notices.js) has not run, e.g. while the notice switch was off.
const manualNotice = tenants => `EXISTS (SELECT 1 FROM retention_notice_reviews v WHERE v.contact_id = c.id
  AND v.activity_at = c.last_activity_at AND v.resolution_code = 'manual_notice_documented' AND v.notice_given_on <= date(?2, '-1 months')
  AND v.answered_at IS NULL AND NOT (${REVIEW_ANSWERED})
  AND NOT EXISTS (${NOTICE_OF} AND (n.state NOT IN ('failed', 'unknown', 'not_sent') OR n.delete_after > ?2))${tenants ? `
  AND NOT EXISTS (SELECT 1 FROM tenancy_contact_links l WHERE l.contact_id = c.id AND l.linked = 1 AND l.at >= v.notice_given_on)` : ""})`;
// The email pipeline's claim and its check right before the call (server/email.js): a notice goes only while it is the
// waiting notice of its contact's current episode, to that contact's address, and the pass would still delete them.
// Switched off or without 0112, none goes (and the SQL is as before).
export const NO_NOTICE = "outbound.template <> 'retention_notice'";
export const noticeClaimSql = async env => (retentionNoticesReady(env) && await noticeTable(env) ? `(${NO_NOTICE}
  OR EXISTS (SELECT 1 FROM retention_notices n JOIN contacts c ON c.id = n.contact_id WHERE n.outbound_ref = outbound.ref
    AND n.state = 'queued' AND n.activity_at = c.last_activity_at AND c.email = outbound.recipient AND ${EXEMPT}${
  privacyHolds(env) ? ` AND NOT ${OPEN_PRIVACY_REQUEST}` : ""}${await tenancyNoticeHold(env, jerseyToday())}))` : NO_NOTICE);

// PRE-12 (D4, migration 0113): with PRE12_TENANCY_LINK_READY, a contact a team member linked as the tenant of a tenancy
// still running (no move-out, or one still to come) is kept by the pass and by the applicant's Delete. The latest
// decision counts, even if the tenant's details changed since (when in doubt, kept). An ended tenancy keeps nothing: its
// period is PRE-33's. Switched off or without 0113, no statement names that table. For a query on contacts c, ?2 the
// Jersey date.
export const tenancyLinkReady = env => env?.PRE12_TENANCY_LINK_READY === "1";
export const linkTable = env => env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tenancy_contact_links'").first();
export const RUNNING_TENANCY = `EXISTS (SELECT 1 FROM tenancy_contact_links l JOIN tenancies t ON t.id = l.tenancy_id
  WHERE l.contact_id = c.id AND l.linked = 1 AND (t.ended_on IS NULL OR t.ended_on > ?2)
    AND l.id = (SELECT MAX(m.id) FROM tenancy_contact_links m WHERE m.tenancy_id = l.tenancy_id AND m.contact_id = c.id))`;
// The same hold for the notice before deletion (server/retention-notices.js, noticeClaimSql): a contact the pass keeps for a
// running tenancy gets no notice, and one it already has is withdrawn, so the tenancy's end never deletes on an old date.
// The Jersey date goes in as a literal (it comes from jerseyToday) because those queries bind their own parameters. "" when
// the switch is off or 0113 is missing: those statements are then as before.
export const runningTenancyOn = day => RUNNING_TENANCY.replaceAll("?2", `'${day}'`); // day: checked as tenancyNoticeHold does
export const runningTenancySql = async (env, day) =>
  tenancyLinkReady(env) && /^\d{4}-\d\d-\d\d$/.test(day) && await linkTable(env) ? runningTenancyOn(day) : null;
export const tenancyNoticeHold = async (env, day) => {
  const running = await runningTenancySql(env, day);
  return running ? ` AND NOT ${running}` : "";
};
// The team's views say it too: Expiring, its count and the kept-until dates leave out a contact the pass keeps for a
// running tenancy, as they do one held by a privacy request. As expiringSql otherwise.
// A tenancy that ends within the month no longer hides its contact: the team sees it in Expiring, with its date, a month
// before the pass may delete it (the pass itself still keeps it until the day after the tenancy ends).
const monthAhead = day => { const d = new Date(`${day}T00:00:00Z`); if (isNaN(d)) return day; d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10); };
export const tenancyViewSql = (env, day) => runningTenancySql(env, monthAhead(day));
export const expiringHeldSql = async (env, day) => `${expiringSql(env)}${await tenancyNoticeHold(env, monthAhead(day))}`;

// E1: ?1 = the pass's ISO time, ?2 its Jersey date. A contact goes once its whole kept-until day is over: the cutoff is a
// date, below every time on that day. Every statement reads the set again: until the last one deletes the contacts
// nothing it depends on changes inside the batch (their searches have no sales nor open offers), so each statement acts
// on the same contacts.
// The second bound keeps a full 12 months when the last activity fell in Jersey's first hour of a BST day.
// PRE-12 (privacyHolds above): with its switch on, a contact held by an open privacy request is kept too. notices (Q05,
// above): null without 0112; "kept" with 0112, a contact kept by its notice stays; "given", switched on too, a contact
// with an email needs its notice as well; "reviewed", with 0119 too, or a manual notice (manualNotice above). tenants
// (RUNNING_TENANCY above): a contact linked to a running tenancy stays.
const contactsDue = (held, notices, tenants) => `SELECT c.id FROM contacts c WHERE c.last_activity_at < date(?2, '-12 months')
  AND c.last_activity_at < strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-12 months') AND ${EXEMPT}${held ? ` AND NOT ${OPEN_PRIVACY_REQUEST}` : ""}${
  tenants ? ` AND NOT ${RUNNING_TENANCY}` : ""}${
  notices === "reviewed" ? ` AND ((NOT ${NOTICE_KEPT} AND ${NOTICE_GIVEN}) OR ${manualNotice(tenants)})`
    : notices ? ` AND NOT ${NOTICE_KEPT}${notices === "given" ? ` AND ${NOTICE_GIVEN}` : ""}` : ""}
  ORDER BY c.last_activity_at, c.id LIMIT ${RETENTION_CAP}`;
// entity_id is TEXT: text ids keep each lookup on the events_entity index.
const eventsOf = (type, set) =>
  `SELECT id FROM events WHERE entity_type = '${type}' AND entity_id IN (SELECT CAST(id AS TEXT) FROM (${set}))`;

// E5.
const VIEWINGS = `SELECT id FROM viewing_requests WHERE date < date(?2, '-12 months') ORDER BY date, id LIMIT ${RETENTION_CAP}`;
const VIEWING_EVENTS = eventsOf("viewing", VIEWINGS);
// AUT-01 (A5): a Hermes job's last activity (a failed one has no decided_at). The pass deletes jobs 90 days after it,
// closed or never finished; a draft waits for a person.
export const jobLastActivity = (t = "jobs") => `COALESCE(${t}.decided_at, ${t}.claimed_at, ${t}.created_at)`;
const JOBS = `SELECT id FROM jobs WHERE status <> 'draft' AND ${jobLastActivity()} < strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-90 days')
  ORDER BY ${jobLastActivity()}, id LIMIT ${RETENTION_CAP}`;
// PUB-21 (C7): Properties Queue's closed rows (published, discarded, failed) the same 90 days; open ones wait for a person.
const IMPORTS = `SELECT id FROM drive_imports WHERE status IN ('published', 'discarded', 'failed')
  AND COALESCE(decided_at, claimed_at, created_at) < strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-90 days') LIMIT ${RETENTION_CAP}`;
// MSG-02 (C11): the website's chats 30 days after their last message, their messages in cascade. Nothing else points at them.
const CHATS = `SELECT id FROM chats WHERE last_at < strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-${KEEP_DAYS} days') ORDER BY last_at, id
  LIMIT ${RETENTION_CAP}`;
const deletedEvents = (type, set) => `INSERT INTO events (at, actor, entity_type, entity_id, type)
  SELECT ?1, 'system', '${type}', CAST(id AS TEXT), '${type}.deleted' FROM (${set}) ORDER BY id`;

// E2: a viewing request, from the website or the panel, restarts the clock of the contact with its email (validateViewing
// lower-cases it) or its mobile in stored form; so do the Inbox's confirm, reschedule and complete. Right after the
// write's event or notice: changes() is then that of its insert, made only when the write happened, so a lost booking
// or a refused action restarts nothing.
export const touchByViewing = (env, { email, phone }, ts) => env.DB.prepare(
  "UPDATE contacts SET last_activity_at = ?1, last_contact_at = ?1 WHERE (email = ?2 OR phone = ?3) AND changes() = 1")
  .bind(ts, email, normalizePhone(phone));

// ts: the ISO time of the pass; the cutoffs are its Jersey date.
// ANA-04: search counters older than today plus 90 days, only with ANA04_SEARCH_STATS_READY (migration 0108).
export async function runRetention(env, ts) {
  // A failed counter prune (e.g. switched on before 0108) must never stop the deletion of personal data below.
  if (searchStatsReady(env)) await pruneSearchMetrics(env, new Date(ts)).catch(() => console.error('Search metrics prune failed'));
  // PRE-12 (Q05): one look for migration 0112 per pass; with it, answers and outcomes are recorded before cleanEmail.
  const hasNotices = !!(await noticeTable(env)), hasReviews = hasNotices && !!(await reviewTable(env)); // 0119 needs 0112
  if (hasNotices) await env.DB.batch(noticeOutcomeStatements(env, ts, hasReviews));
  await cleanEmail(env, ts);
  const q = sql => env.DB.prepare(sql).bind(ts, jerseyToday(new Date(ts)));
  const notices = hasNotices ? (retentionNoticesReady(env) ? (hasReviews ? "reviewed" : "given") : "kept") : null;
  const tenants = tenancyLinkReady(env) && !!(await linkTable(env)); // PRE-12 (D4): one look for 0113, only switched on
  const CONTACTS = contactsDue(privacyHolds(env), notices, tenants), SEARCHES = `SELECT id FROM applicants WHERE contact_id IN (${CONTACTS})`;
  const CONTACT_EVENTS = `${eventsOf("contact", CONTACTS)} UNION ALL ${eventsOf("applicant", SEARCHES)}`;
  const r = await env.DB.batch([
    // As the applicant's Delete (§3.4): notices closed and nameless, events without data (NULL, never '': the Inbox runs
    // json_extract on it), a deletion event per search and contact; matches and offers go with their searches.
    q(`UPDATE notifications SET resolved_at = ?1, resolved_by = 'system' WHERE resolved_at IS NULL
       AND event_id IN (${CONTACT_EVENTS})`),
    q(`UPDATE notifications SET title = 'Deleted applicant', task_reason = NULL WHERE event_id IN (${CONTACT_EVENTS})`),
    q(`UPDATE events SET data = NULL WHERE id IN (${CONTACT_EVENTS})`),
    q(deletedEvents("applicant", SEARCHES)),
    q(deletedEvents("contact", CONTACTS)),
    q(`DELETE FROM applicants WHERE contact_id IN (${CONTACTS})`),
    q(`DELETE FROM contacts WHERE id IN (${CONTACTS})`),
    // As the Inbox's Delete; the rows go last, since the set is read from them.
    q(`UPDATE notifications SET resolved_at = ?1, resolved_by = 'system' WHERE resolved_at IS NULL
       AND event_id IN (${VIEWING_EVENTS})`),
    q(`UPDATE notifications SET title = 'Deleted viewing request', task_reason = NULL WHERE event_id IN (${VIEWING_EVENTS})`),
    q(`UPDATE events SET data = NULL WHERE id IN (${VIEWING_EVENTS})`),
    q(`DELETE FROM viewing_requests WHERE id IN (${VIEWINGS})`),
    env.DB.prepare(`DELETE FROM jobs WHERE id IN (${JOBS})`).bind(ts),
    env.DB.prepare(`DELETE FROM drive_imports WHERE id IN (${IMPORTS})`).bind(ts),
    env.DB.prepare(`DELETE FROM chats WHERE id IN (${CHATS})`).bind(ts),
  ]);
  // MSG-05: a chat save's key (with the admin's email) only serves retries: 30 days after it was written, like the chats.
  // Before migration 0098 there is no table and nothing to delete.
  await env.DB.prepare(`DELETE FROM chat_applicant_saves WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-${KEEP_DAYS} days')`)
    .bind(ts).run().catch(e => { if (!/no such table: chat_applicant_saves/.test(String(e?.message))) throw e; });
  // MSG-01: Facebook conversations 30 days after their last message, like the website's chats; their messages in
  // cascade. Also after the switch is turned off again, so nothing stays for ever; before migration 0109 there is no
  // table and nothing to delete.
  await env.DB.prepare(`DELETE FROM channel_conversations WHERE id IN (SELECT id FROM channel_conversations
    WHERE last_at < strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-${KEEP_DAYS} days') ORDER BY last_at, id LIMIT ${RETENTION_CAP})`)
    .bind(ts).run().catch(e => { if (!/no such table: channel_conversations/.test(String(e?.message))) throw e; });
  // ADM-12: the tenant sign-in's leftovers (migration 0110) whatever its switch: sessions and codes 30 days after they
  // expired (a code once no session or outcome points at it), each code email's outcome 90 days after it was sent, as
  // the emails (30/90, email-retention.js). Links and repair receipts are records and stay. Before 0110, nothing to do.
  const cut = days => `strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-${days} days')`;
  const CASE_KEEP_DAYS = 30; // its own window: changing the chats' KEEP_DAYS must not move it
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM case_sessions WHERE token_hash IN (SELECT token_hash FROM case_sessions
      WHERE expires_at < ${cut(CASE_KEEP_DAYS)} ORDER BY expires_at LIMIT ${RETENTION_CAP})`).bind(ts),
    env.DB.prepare(`DELETE FROM case_auth_attempts WHERE id IN (SELECT id FROM case_auth_attempts
      WHERE at < ${cut(90)} ORDER BY at LIMIT ${RETENTION_CAP})`).bind(ts),
    env.DB.prepare(`DELETE FROM case_challenges WHERE id IN (SELECT c.id FROM case_challenges c WHERE c.expires_at < ${cut(CASE_KEEP_DAYS)}
      AND NOT EXISTS (SELECT 1 FROM case_sessions s WHERE s.challenge_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM case_auth_attempts a WHERE a.challenge_id = c.id) ORDER BY c.expires_at LIMIT ${RETENTION_CAP})`).bind(ts),
  // Last of the pass, after today's personal data is gone: a failure here is logged, never reported as a failed pass.
  ]).catch(e => { if (!/no such table: case_/.test(String(e?.message))) console.error("ADM-12 retention cleanup failed"); });
  return { contacts: r[6].meta.changes, viewings: r[10].meta.changes, jobs: r[11].meta.changes, chats: r[13].meta.changes };
}

// E6: retention_run {date, ok, attempts, contacts, viewings, jobs, chats}. A claim (a clock tick or a panel poll) wins the pass when
// the stored date is earlier than today (attempts starts again at 1), or is today with the pass not done and fewer than
// 3 attempts: a failed pass is retried twice by later claims, then waits for the next day. One statement, so two claims
// never both win an attempt.
export async function claimRetentionDay(env, date) {
  const r = await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by)
    VALUES ('retention_run', json_object('date', ?1, 'ok', json('false'), 'attempts', 1), ?2, 'system')
    ON CONFLICT (key) DO UPDATE SET value = json_object('date', ?1, 'ok', json('false'), 'attempts',
      CASE WHEN json_extract(value, '$.date') = ?1 THEN json_extract(value, '$.attempts') + 1 ELSE 1 END),
      updated_at = excluded.updated_at
    WHERE json_extract(value, '$.date') < ?1
      OR (json_extract(value, '$.date') = ?1 AND NOT json_extract(value, '$.ok') AND json_extract(value, '$.attempts') < 3)`)
    .bind(date, now()).run();
  return r.meta.changes === 1;
}

// After a pass: done for `date`, with what it deleted.
export const recordRetentionDay = (env, date, { contacts, viewings, jobs, chats }) => env.DB.prepare(`UPDATE app_settings
  SET value = json_set(value, '$.ok', json('true'), '$.contacts', ?, '$.viewings', ?, '$.jobs', ?, '$.chats', ?), updated_at = ?
  WHERE key = 'retention_run' AND json_extract(value, '$.date') = ?`).bind(contacts, viewings, jobs, chats, now(), date).run();

// E6: claims the Jersey day of ts (ISO) and, when won, runs and records its pass. The clock (server/jobs.js) claims
// each day at 00:00 Jersey; the panel's polls claim it too, as its backup. Never rejects: a failed pass is logged and
// stays not done for the next claim. The log says how many were deleted, never who.
export const retentionPass = (env, ts) => {
  const day = jerseyToday(new Date(ts));
  return claimRetentionDay(env, day)
    .then(won => won && runRetention(env, ts)
      .then(r => recordRetentionDay(env, day, r).then(() => console.log("Retention pass", r))))
    .catch(e => console.error("Retention pass failed", e));
};
