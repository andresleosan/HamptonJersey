// AUT-21 (AUT21_VIEWING_EMAILS_READY, in both wrangler.toml): two viewing emails, each one row of the approved queue
// (outbound, server/email.js) sent verbatim by Hermes's carrier from Hampton's Gmail with no review one by one: the switch
// is the approval, as for VIS-13's reminders (design 2026-11-08-viewings-coordination §6; PUB-16's plan, «Cancelación de
// visitas y aviso — decisión de Luis»: cancel the other viewings automatically and tell their clients by email).
// - viewing_feedback: one hour after a viewing is marked Completed with no answer yet, and one hour after its end, up to
//   7 days after its end (design §6), the client is asked how it went. Never after a no-show; never for a viewing marked
//   Completed before the switch's first tick with it on (app_settings 'aut21_viewing_emails', forgotten when it runs off).
//   The answer comes back as a reply in Gmail's thread (AUT-17 phase D); recording it stays the team's (VIS-04).
// - viewing_cancelled_closed: 24 hours after a listing is let (its window withdrawn) or sold (PUB-16), each other viewing
//   still to come, booked before, is cancelled and its client told, in one batch: the cancel is written only with its
//   queued notice. A viewing with no usable address, a suppressed one, the buyer's own (a sale's search), or any while
//   sending is stopped, is left with PUB-16's task for a person. Nothing names who took the property. A notice that does
//   not leave (refused, unknown, taken back) is never sent again: it opens a task so a person tells the client.
// Recipient: the address the viewing was booked with (viewing_requests.email): it is this booking's own, not a search
// guessed from it (design §2 forbids guessing the search, not writing to the booking).
// The claim-time check is server/viewing-email-check.js.
import { sha256 } from "./http.js";
import { emailAddress } from "./email.js";
import { emailStop } from "./consultations.js";
import { resolveNotices } from "./events.js";
import { jerseyNow } from "./viewings.js";
import { local } from "./viewing-reminders.js";
import { rentalClosureEnabled } from "./rental-closure.js";
import { closeOpenProposal } from "./viewing-coordination.js";
import { afterViewingChange } from "./calendar-sync.js";
import { viewingEmailsReady, viewingEmailClaimSql, closureTable, FEEDBACK, CLOSED_NOTICE, VIEWING_EMAILS, END }
  from "./viewing-email-check.js";

const H = 3600e3, D = 24 * H, WATCH = 3 * D, KEY = "aut21_viewing_emails";
const IN = `(${VIEWING_EMAILS.map(t => `'${t}'`).join(", ")})`;
const iso = t => new Date(t).toISOString();
const slotOf = v => Number(v.date.replaceAll("-", "") + v.time.replace(":", ""));

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const SIGNATURE = ["Hampton Estates", "42 Bath Street, St Helier, Jersey JE2 4ST"];
const facts = v => {
  const place = v.location || v.country, ref = v.listing_id ? ` (our reference ${v.listing_id})` : "";
  return { home: `${v.title || "the property"}${ref}${place ? `, ${place}` : ""}`, day: DAY.format(new Date(`${v.date}T12:00:00Z`)) };
};
// The emails: facts only (the property, where, when). Never the household, notes, keys, other clients or who took it.
export function feedbackEmail(v) {
  const { home, day } = facts(v);
  return { subject: `Your viewing of ${v.title || "the property"}`.slice(0, 400), text: ["Hello,", "",
    `Thank you for viewing ${home} with Hampton Estates on ${day} at ${v.time} (Jersey time).`, "",
    "We would be glad to hear what you thought. Would you like to go ahead, would you like more information, or is it not "
      + "for you? Simply reply to this email.", "", ...SIGNATURE].join("\n") };
}
export function closedEmail(v) {
  const { home, day } = facts(v);
  return { subject: `Viewing cancelled: ${v.title || "the property"}, ${day} at ${v.time}`.slice(0, 400), text: ["Hello,", "",
    `We are sorry to let you know that ${home} has now been ${v.what === "let" ? "let" : "sold"}, so it is no longer available.`, "",
    `Your viewing on ${day} at ${v.time} (Jersey time) is therefore cancelled.`, "",
    "If you would like us to suggest other homes, simply reply to this email.", "", ...SIGNATURE].join("\n") };
}

const queue = (env, { template, v, to, subject, text, ts, when = "1" }, binds = []) => Promise.all(
  [sha256(`${template}\0${v.id}`), sha256(to)]).then(([key, hash]) => {
  const ref = crypto.randomUUID().replaceAll("-", "");
  return { ref, stmt: env.DB.prepare(`INSERT INTO outbound (ref, dedupe_key, template, entity_id, version, recipient, recipient_hash,
      subject, text, status, approved_by, approved_at, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'automation', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM email_suppressions WHERE address_hash = ?)
      AND ${when} ON CONFLICT (dedupe_key) DO NOTHING`)
    .bind(ref, key, template, String(v.id), slotOf(v), to, hash, subject, text, ts, ts, ts, hash, ...binds) };
});

// The clock (server/jobs.js), after PUB-16's pass and before the email pass. t: ms, for the tests. ponytail: 50 of each a tick.
export async function viewingEmailPass(env, t = Date.now()) {
  if (!viewingEmailsReady(env)) return;
  const ts = iso(t);
  await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, json_object('since', ?), ?, 'system')
    ON CONFLICT (key) DO NOTHING`).bind(KEY, ts, ts).run();
  const since = (await env.DB.prepare("SELECT json_extract(value, '$.since') AS since FROM app_settings WHERE key = ?").bind(KEY).first())?.since;
  if (!since) return;
  await feedbackPass(env, t, since);
  if (rentalClosureEnabled(env) && await closureTable(env)) await closedPass(env, t, since);
}

async function feedbackPass(env, t, since) {
  const ts = iso(t);
  const { results } = await env.DB.prepare(`SELECT v.id, v.date, v.time, v.listing_id, COALESCE(l.title, v.listing_title_snapshot) AS title,
      l.location, l.country, v.email
    FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id
    WHERE v.status = 'completed' AND v.outcome IS NULL AND v.email IS NOT NULL AND ${END} <= ? AND ${END} > ?
      AND EXISTS (SELECT 1 FROM events e WHERE e.entity_type = 'viewing' AND e.entity_id = CAST(v.id AS TEXT) AND e.type = 'viewing.completed'
        AND e.at >= ? AND e.at <= ?)
      AND NOT EXISTS (SELECT 1 FROM outbound o WHERE o.template = '${FEEDBACK}' AND o.entity_id = CAST(v.id AS TEXT))
    ORDER BY v.date, v.time, v.id LIMIT 50`).bind(local(t - H), local(t - 7 * D), since, iso(t - H)).all();
  const stmts = [];
  for (const v of results) {
    const to = emailAddress(v.email);
    if (to) stmts.push((await queue(env, { template: FEEDBACK, v, to, ...feedbackEmail(v), ts })).stmt);
  }
  if (stmts.length) await env.DB.batch(stmts);
}

// PUB-16's closures (server/rental-closure-job.js, closedViewingTasks): a rental let once its window is withdrawn, a sale
// 24 hours after it completed; here only those whose 24 hours ended after the switch's first tick.
const CLOSED = `closed(listing_id, at, what) AS (
    SELECT listing_id, opened_at, 'let' FROM rental_closure_windows WHERE state = 'withdrawn' AND opened_at >= ?1
    UNION ALL SELECT s.listing_id, s.closed_at, 'sold' FROM sales s JOIN listings l ON l.id = s.listing_id
      WHERE s.status = 'completed' AND l.availability = 'sold' AND s.closed_at <= ?2 AND s.closed_at >= ?1)`;
// The buyer's own viewing (linked to the sale's search, or booked with its contact's address) is not one of the others.
const BUYER = `EXISTS (SELECT 1 FROM sales s WHERE s.listing_id = v.listing_id AND s.status = 'completed' AND (s.applicant_id =
    (SELECT p.applicant_id FROM viewing_proposals p WHERE p.viewing_id = v.id ORDER BY p.revision DESC LIMIT 1)
  OR EXISTS (SELECT 1 FROM applicants a JOIN contacts c ON c.id = a.contact_id WHERE a.id = s.applicant_id
    AND lower(trim(c.email)) = lower(trim(v.email)))))`;
// Review 25-nov: the same for a let once its tenancy names the tenant (tenancy_origins): their own viewing is not one of
// the others. Before the team enters the tenancy nothing names them: see AUT-21's falta.
const TENANT = `EXISTS (SELECT 1 FROM tenancy_origins t WHERE t.listing_id = v.listing_id AND (t.applicant_id =
    (SELECT p.applicant_id FROM viewing_proposals p WHERE p.viewing_id = v.id ORDER BY p.revision DESC LIMIT 1)
  OR EXISTS (SELECT 1 FROM applicants a JOIN contacts c ON c.id = a.contact_id WHERE a.id = t.applicant_id
    AND lower(trim(c.email)) = lower(trim(v.email)))))`;

async function closedPass(env, t, since) {
  if (await emailStop(env)) return; // sending stopped: nothing is cancelled, PUB-16's tasks stay with the team
  const ts = iso(t), clock = jerseyNow(new Date(t));
  // Review 25-nov: an open VIS-17 proposal ends with its viewing whatever this worker's switches say (the clock carries no
  // VIS17_MULTIPART_READY; the door that lets Hermes write about proposals runs on the website, where it is on).
  const coordination = !!(await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'viewing_proposals'").first());
  const { results } = await env.DB.prepare(`WITH ${CLOSED}
    SELECT v.id, v.name, v.date, v.time, v.updated_at, v.listing_id, v.email, COALESCE(l.title, v.listing_title_snapshot) AS title,
      l.location, l.country, MIN(c.what) AS what
    FROM closed c JOIN viewing_requests v ON v.listing_id = c.listing_id AND v.date >= ?3 AND v.created_at < c.at
      LEFT JOIN listings l ON l.id = v.listing_id
    WHERE v.status IN ('requested', 'confirmed') AND ${END} >= ?4 AND v.email IS NOT NULL AND NOT ${BUYER} AND NOT ${TENANT}
      AND NOT EXISTS (SELECT 1 FROM outbound o WHERE o.template = '${CLOSED_NOTICE}' AND o.entity_id = CAST(v.id AS TEXT))
    GROUP BY v.id ORDER BY v.id LIMIT 50`).bind(iso(Date.parse(since) - D), iso(t - D), clock.date, `${clock.date} ${clock.time}`).all();
  for (const v of results) {
    const to = emailAddress(v.email);
    if (!to) continue; // no usable address: the viewing and its task stay for a person
    const id = String(v.id), lock = `EXISTS (SELECT 1 FROM viewing_requests WHERE id = ? AND status IN ('requested', 'confirmed')
      AND updated_at IS ? AND lower(trim(email)) = ?)`;
    const { ref, stmt } = await queue(env, { template: CLOSED_NOTICE, v, to, ...closedEmail(v), ts, when: lock }, [v.id, v.updated_at, to]);
    const [, cancel] = await env.DB.batch([stmt,
      // The cancel, only with its notice queued (a suppressed address queues none).
      env.DB.prepare(`UPDATE viewing_requests SET status = 'cancelled', updated_at = ?, updated_by = 'automation' WHERE id = ?
        AND status IN ('requested', 'confirmed') AND updated_at IS ? AND EXISTS (SELECT 1 FROM outbound WHERE ref = ? AND status = 'queued')`)
        .bind(ts, v.id, v.updated_at, ref),
      env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data) SELECT ?, 'automation', 'viewing', ?, 'viewing.cancelled',
        json_object('by', 'automation', 'reason', 'property_closed') WHERE changes() = 1`).bind(ts, id),
      resolveNotices(env, { entity_type: "viewing", entity_id: id, category: "viewing" }, "automation", { ifLogged: true }),
      // PUB-16's task «Property let/sold, cancel the viewing» stays open until the client was told (review 25-nov):
      // the settle pass closes it once Gmail took the notice, or replaces it with a task when the notice did not leave.
      ...(coordination ? [closeOpenProposal(env, { id: v.id, state: "cancelled", ts, admin: "automation" })] : []),
    ]);
    if (cancel.meta.changes) { // VIS-12: its Google event, if any, is cancelled
      const pending = [];
      afterViewingChange(env, p => pending.push(p), v.id);
      await Promise.all(pending);
    }
  }
}

const UNSENT = { failed: "the client was not emailed", cancelled: "the client was not emailed", unknown: "check the client's email went" };
// The clock, after the email pass, switched on or off: queued emails no longer claimable are taken back (off: all of them);
// one Gmail accepted is recorded on its viewing once; a notice that did not leave opens one task for a person. Idempotent.
export async function viewingEmailSettlePass(env, t = Date.now()) {
  const ts = iso(t), from = iso(t - WATCH), check = await viewingEmailClaimSql(env, t);
  if (!viewingEmailsReady(env)) await env.DB.prepare("DELETE FROM app_settings WHERE key = ?").bind(KEY).run();
  await env.DB.prepare(`UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE status = 'queued' AND template IN ${IN}
    AND NOT ${check}`).bind(ts).run();
  for (const [template, type] of [[FEEDBACK, "viewing.feedback_requested"], [CLOSED_NOTICE, "viewing.closed_notice_sent"]])
    await env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
      SELECT o.claimed_at, 'automation', 'viewing', o.entity_id, ?, json_object('channel', 'email') FROM outbound o
      WHERE o.template = ? AND o.status = 'accepted' AND o.created_at >= ?
        AND EXISTS (SELECT 1 FROM viewing_requests v WHERE v.id = CAST(o.entity_id AS INTEGER))
        AND NOT EXISTS (SELECT 1 FROM events e WHERE e.entity_type = 'viewing' AND e.entity_id = o.entity_id AND e.type = ?)
      ORDER BY o.id LIMIT 50`).bind(type, template, from, type).run();
  // PUB-16's task of a viewing this pass cancelled: done once its notice was taken by Gmail, or once it did not leave
  // (the task below then says so).
  await env.DB.prepare(`UPDATE notifications SET resolved_at = ?1, resolved_by = 'automation', closed_by_source = 1,
      task_actor = 'automation', task_action = 'source_resolved' WHERE resolved_at IS NULL
    AND event_id IN (SELECT e.id FROM events e JOIN outbound o ON o.template = '${CLOSED_NOTICE}' AND o.entity_id = e.entity_id
      AND o.status IN ('accepted', 'failed', 'cancelled', 'unknown') AND o.created_at >= ?2
      WHERE e.entity_type = 'viewing' AND e.type = 'viewing.property_closed')`).bind(ts, from).run();
  const { results } = await env.DB.prepare(`SELECT o.entity_id, o.status, v.name FROM outbound o
      JOIN viewing_requests v ON v.id = CAST(o.entity_id AS INTEGER)
    WHERE o.template = '${CLOSED_NOTICE}' AND o.status IN ('failed', 'cancelled', 'unknown') AND o.created_at >= ?
      AND NOT EXISTS (SELECT 1 FROM events e WHERE e.entity_type = 'viewing' AND e.entity_id = o.entity_id AND e.type = 'viewing.closed_notice_unsent')
    ORDER BY o.id LIMIT 50`).bind(from).all();
  for (const o of results) await env.DB.batch([ // once per viewing, with no personal data in the event
    env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data) SELECT ?, 'automation', 'viewing', ?,
      'viewing.closed_notice_unsent', json_object('result', ?) WHERE NOT EXISTS (SELECT 1 FROM events WHERE entity_type = 'viewing'
        AND entity_id = ? AND type = 'viewing.closed_notice_unsent')`).bind(ts, o.entity_id, o.status, o.entity_id),
    env.DB.prepare(`INSERT INTO notifications (event_id, category, title, action_required, created_at)
      SELECT last_insert_rowid(), 'task', ?, 1, ? WHERE changes() = 1`)
      .bind(`Viewing cancelled (property let or sold), ${UNSENT[o.status]}: ${o.name}`.slice(0, 200), ts)]);
}

