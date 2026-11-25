// VIS-13 (VIS13_REMINDERS_READY, in both wrangler.toml): the client's reminders 24 hours and 2 hours before a confirmed
// viewing, and their answer from AGE-12's private page (Confirm, ask for another time, Cancel).
// Who the client is: the search a person linked to the viewing (VIS-17's viewing_proposals.applicant_id), never one
// guessed from an email or a phone (design §2). A viewing without that link gets no reminder and no answer here.
// Each reminder is one row of the approved queue (outbound, server/email.js), sent verbatim by Hermes's carrier from
// Hampton's Gmail with no review one by one: the switch is the approval (design §6, sent on the first tick after the
// time; AUT-17's plan, 21-nov: "el interruptor es la aprobación"). The durations are real ones (24 h and 2 h of UTC
// before the Jersey start, across a clock change); booked or moved inside 24 hours, only the 2-hour one goes; inside 2
// hours, one at most; never after the start. The claim asks again, in SQL, that the viewing is confirmed at the time
// queued, not started (a 24-hour one not inside 2 hours either) and the client's address unchanged. reminded_* is
// written only once Gmail (or the provider) accepted it; an unknown result waits in Settings › Email and is never sent
// again. At 2 hours, a viewing the client has not confirmed opens one task for the team; nothing cancels it.
// Off, or before migrations 0071 and 0114: nothing is queued, none is claimed and the client's routes answer 404.
// The client's routes are server/routes/viewing-client-actions.js. This module imports nothing of email.js's.
import { sha256 } from "./http.js";
import { logEvent } from "./events.js";
import { jerseyNow, EMAIL } from "./viewings.js";

export const remindersReady = env => env?.VIS13_REMINDERS_READY === "1";
export const REMINDERS = ["viewing_reminder_24h", "viewing_reminder_2h"];
const IN = `(${REMINDERS.map(t => `'${t}'`).join(", ")})`, H = 3600e3, WATCH = 3 * 86400e3;
export const local = t => { const j = jerseyNow(new Date(t)); return `${j.date} ${j.time}`; }; // digits, '-', ':' and a space
export const START = "v.date || ' ' || v.time";
// The time a reminder is for, as outbound.version: 2026-11-26 14:30 is 202611261430.
export const SLOT = "CAST(replace(v.date, '-', '') || replace(v.time, ':', '') AS INTEGER)";
const slotOf = v => Number(v.date.replaceAll("-", "") + v.time.replace(":", ""));
// The search a person linked to viewing v (the latest proposal that names one), with its contact.
const CLIENT = `JOIN applicants a ON a.id = (SELECT p.applicant_id FROM viewing_proposals p WHERE p.viewing_id = v.id
    AND p.applicant_id IS NOT NULL ORDER BY p.revision DESC LIMIT 1) JOIN contacts c ON c.id = a.contact_id`;

export async function migrated(env) {
  try { await env.DB.prepare("SELECT v.reminded_at, p.applicant_id FROM viewing_requests v, viewing_proposals p LIMIT 0").all(); return true; }
  catch { return false; }
}

// For server/email.js's claim: whether a reminder (outbound row in scope) may leave now. "0" (none) while switched off,
// before the migrations or if the schema cannot be read. t: ms, for the tests.
export async function reminderClaimSql(env, t = Date.now()) {
  if (!remindersReady(env) || !(await migrated(env))) return "0";
  return `EXISTS (SELECT 1 FROM viewing_requests v ${CLIENT} WHERE v.id = CAST(outbound.entity_id AS INTEGER)
    AND v.status = 'confirmed' AND ${SLOT} = outbound.version AND lower(trim(c.email)) = outbound.recipient
    AND ${START} > CASE outbound.template WHEN 'viewing_reminder_24h' THEN '${local(t + 2 * H)}' ELSE '${local(t)}' END)`;
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
// The email: facts only (the property, where, when and how). Never the household, notes, keys or access details.
export function reminderEmail(v) {
  const place = v.location || v.country, ref = v.listing_id ? ` (our reference ${v.listing_id})` : "";
  const when = `${DAY.format(new Date(`${v.date}T12:00:00Z`))} at ${v.time}`;
  return { subject: `Viewing reminder: ${v.title || "your viewing"}, ${when}`.slice(0, 400), text: [
    "Hello,", "", "This is a reminder of your viewing with Hampton Estates.", "",
    `Property: ${v.title || "the property"}${ref}`, ...(place ? [`Where: ${place}`] : []),
    `Date: ${DAY.format(new Date(`${v.date}T12:00:00Z`))}`, `Time: ${v.time} (Jersey time)`, `Viewing: ${v.kind}`, "",
    "To confirm, ask for another time or cancel, answer from your private Hampton Estates page if we gave you one, "
      + "or simply reply to this email.", "", "Hampton Estates", "42 Bath Street, St Helier, Jersey JE2 4ST"].join("\n") };
}

// The clock (server/jobs.js), before the email pass: queued reminders no longer due are cancelled (moved, cancelled,
// started, or a 24-hour one now inside 2 hours), then each viewing due gets its reminder, and at 2 hours its task.
// ponytail: 50 viewings a tick, soonest first.
export async function reminderPass(env, t = Date.now()) {
  const check = await reminderClaimSql(env, t);
  if (check === "0") return;
  const ts = new Date(t).toISOString(), L0 = local(t), L2 = local(t + 2 * H), L24 = local(t + 24 * H);
  await env.DB.prepare(`UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE status = 'queued' AND template IN ${IN}
    AND NOT ${check}`).bind(ts).run();
  const { results } = await env.DB.prepare(`SELECT v.id, v.date, v.time, v.kind, v.name, v.listing_id, v.reminded_at,
      COALESCE(v.updated_at, v.created_at) AS changed_at, COALESCE(l.title, v.listing_title_snapshot) AS title, l.location, l.country,
      lower(trim(c.email)) AS email, EXISTS (SELECT 1 FROM events e WHERE e.entity_type = 'viewing' AND e.entity_id = CAST(v.id AS TEXT)
        AND e.type = 'viewing.client_confirmed' AND json_extract(e.data, '$.slot') = ${SLOT}) AS confirmed_by_client
    FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id ${CLIENT}
    WHERE v.status = 'confirmed' AND ${START} > ? AND ${START} <= ? ORDER BY v.date, v.time, v.id LIMIT 50`).bind(L0, L24).all();
  const stmts = [];
  for (const v of results) {
    const soon = `${v.date} ${v.time}` <= L2, slot = slotOf(v);
    // The 24-hour one only if the viewing was already at this time 24 hours before it (else it was booked or moved
    // inside 24 hours) and nobody has reminded the client of this time since.
    const due = soon || (!v.reminded_at && local(Date.parse(v.changed_at) + 24 * H) < `${v.date} ${v.time}`);
    const to = typeof v.email === "string" && v.email.length <= 254 && EMAIL.test(v.email) ? v.email : null;
    if (due && to) {
      const template = REMINDERS[soon ? 1 : 0], { subject, text } = reminderEmail(v);
      stmts.push(env.DB.prepare(`INSERT INTO outbound (ref, dedupe_key, template, entity_id, version, recipient, recipient_hash,
          subject, text, status, approved_by, approved_at, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'automation', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM email_suppressions WHERE address_hash = ?)
        ON CONFLICT (dedupe_key) DO NOTHING`).bind(crypto.randomUUID().replaceAll("-", ""), await sha256(`${template}\0${v.id}\0${slot}`),
        template, String(v.id), slot, to, await sha256(to), subject, text, ts, ts, ts, await sha256(to)));
    }
    if (soon && !v.confirmed_by_client) stmts.push( // once per viewing and time, with no personal data in the event
      env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data) SELECT ?, 'automation', 'viewing', ?,
        'viewing.client_unconfirmed', json_object('slot', ?) WHERE NOT EXISTS (SELECT 1 FROM events WHERE entity_type = 'viewing'
          AND entity_id = ? AND type = 'viewing.client_unconfirmed' AND json_extract(data, '$.slot') = ?)`)
        .bind(ts, String(v.id), slot, String(v.id), slot),
      env.DB.prepare(`INSERT INTO notifications (event_id, category, title, action_required, created_at)
        SELECT last_insert_rowid(), 'task', ?, 1, ? WHERE changes() = 1`)
        .bind(`Viewing at ${v.time} not confirmed by the client yet: ${v.name}`.slice(0, 200), ts));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

// The clock, after the email pass: a reminder Gmail (or the provider) accepted marks its viewing reminded, at the time
// it was sent, while the viewing is still confirmed at that time; a later reminder by the team is kept. Idempotent.
export async function reminderSettlePass(env) {
  if (!(await migrated(env))) return;
  const { results } = await env.DB.prepare(`SELECT entity_id, version, claimed_at, template FROM outbound WHERE template IN ${IN}
    AND status = 'accepted' AND claimed_at >= ? ORDER BY id LIMIT 50`).bind(new Date(Date.now() - WATCH).toISOString()).all();
  for (const o of results) await env.DB.batch([
    env.DB.prepare(`UPDATE viewing_requests AS v SET reminded_at = ?, reminded_by = 'automation', reminded_channel = 'email'
      WHERE v.id = ? AND v.status = 'confirmed' AND ${SLOT} = ? AND (v.reminded_at IS NULL OR v.reminded_at < ?)`)
      .bind(o.claimed_at, Number(o.entity_id), o.version, o.claimed_at),
    ...logEvent(env, { actor: "automation", entity_type: "viewing", entity_id: String(o.entity_id), type: "viewing.reminded",
      data: { channel: "email", template: o.template } }, null, { ifInserted: true })]);
}
