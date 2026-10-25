import { now } from "./http.js";
import { jerseyToday } from "./viewings.js";
import { normalizePhone } from "./applicants.js";

// G2: contacts 12 months without activity and viewing requests whose date is over 12 months old are deleted once a
// Jersey day, as the manual deletes do it (E4, E5). E7: at most RETENTION_CAP of each per pass, oldest first, in one
// batch of a fixed number of set-based statements, whatever the count; what is left goes the next day.
export const RETENTION_CAP = 500;

// E3: a contact with a sale on any of its searches, in any status, is kept (V14: 5 years). For a query on contacts c.
export const NO_SALE = "NOT EXISTS (SELECT 1 FROM applicants s JOIN sales x ON x.applicant_id = s.id WHERE s.contact_id = c.id)";
// What the pass and Expiring leave alone: E3, and a buyer in an open negotiation (an offer pending or countered on any of
// its searches) for as long as it lasts. For a query on contacts c.
export const EXEMPT = `NOT EXISTS (SELECT 1 FROM applicants s WHERE s.contact_id = c.id
  AND (EXISTS (SELECT 1 FROM sales x WHERE x.applicant_id = s.id)
    OR EXISTS (SELECT 1 FROM offers o WHERE o.applicant_id = s.id AND o.status IN ('pending', 'countered'))))`;

// E8: a contact the pass deletes within a month, or one already due that it has not reached (over the cap, or a failed
// pass), so the delay shows. Bind the Jersey date. A range on contacts_activity: only the contacts in it are read.
export const EXPIRING = `c.last_activity_at < date(?, '-11 months') AND ${EXEMPT}`;
// E9: the day a contact's 12 months end; the pass deletes it on a later Jersey day.
export const KEPT_UNTIL = "strftime('%Y-%m-%d', c.last_activity_at, '+12 months')";

// E1: ?1 = the pass's ISO time, ?2 its Jersey date. A contact goes once its whole kept-until day is over: the cutoff is a
// date, below every time on that day. Every statement reads the set again: until the last one deletes the contacts
// nothing it depends on changes inside the batch (their searches have no sales nor open offers), so each statement acts
// on the same contacts.
// The second bound keeps a full 12 months when the last activity fell in Jersey's first hour of a BST day.
const CONTACTS = `SELECT c.id FROM contacts c WHERE c.last_activity_at < date(?2, '-12 months')
  AND c.last_activity_at < strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-12 months') AND ${EXEMPT} ORDER BY c.last_activity_at, c.id LIMIT ${RETENTION_CAP}`;
const SEARCHES = `SELECT id FROM applicants WHERE contact_id IN (${CONTACTS})`;
// entity_id is TEXT: text ids keep each lookup on the events_entity index.
const eventsOf = (type, set) =>
  `SELECT id FROM events WHERE entity_type = '${type}' AND entity_id IN (SELECT CAST(id AS TEXT) FROM (${set}))`;
const CONTACT_EVENTS = `${eventsOf("contact", CONTACTS)} UNION ALL ${eventsOf("applicant", SEARCHES)}`;
// E5.
const VIEWINGS = `SELECT id FROM viewing_requests WHERE date < date(?2, '-12 months') ORDER BY date, id LIMIT ${RETENTION_CAP}`;
const VIEWING_EVENTS = eventsOf("viewing", VIEWINGS);
const deletedEvents = (type, set) => `INSERT INTO events (at, actor, entity_type, entity_id, type)
  SELECT ?1, 'system', '${type}', CAST(id AS TEXT), '${type}.deleted' FROM (${set}) ORDER BY id`;

// E2: a viewing request, from the website or the panel, restarts the clock of the contact with its email (validateViewing
// lower-cases it) or its mobile in stored form; so do the Inbox's confirm, reschedule and complete. Right after the
// write's event or notice: changes() is then that of its insert, made only when the write happened, so a lost booking
// or a refused action restarts nothing.
export const touchByViewing = (env, { email, phone }, ts) => env.DB.prepare(
  "UPDATE contacts SET last_activity_at = ? WHERE (email = ? OR phone = ?) AND changes() = 1")
  .bind(ts, email, normalizePhone(phone));

// ts: the ISO time of the pass; the cutoffs are its Jersey date.
export async function runRetention(env, ts) {
  const q = sql => env.DB.prepare(sql).bind(ts, jerseyToday(new Date(ts)));
  const r = await env.DB.batch([
    // As the applicant's Delete (§3.4): notices closed and nameless, events without data (NULL, never '': the Inbox runs
    // json_extract on it), a deletion event per search and contact; matches and offers go with their searches.
    q(`UPDATE notifications SET resolved_at = ?1, resolved_by = 'system' WHERE resolved_at IS NULL
       AND event_id IN (${CONTACT_EVENTS})`),
    q(`UPDATE notifications SET title = 'Deleted applicant' WHERE event_id IN (${CONTACT_EVENTS})`),
    q(`UPDATE events SET data = NULL WHERE id IN (${CONTACT_EVENTS})`),
    q(deletedEvents("applicant", SEARCHES)),
    q(deletedEvents("contact", CONTACTS)),
    q(`DELETE FROM applicants WHERE contact_id IN (${CONTACTS})`),
    q(`DELETE FROM contacts WHERE id IN (${CONTACTS})`),
    // As the Inbox's Delete; the rows go last, since the set is read from them.
    q(`UPDATE notifications SET resolved_at = ?1, resolved_by = 'system' WHERE resolved_at IS NULL
       AND event_id IN (${VIEWING_EVENTS})`),
    q(`UPDATE notifications SET title = 'Deleted viewing request' WHERE event_id IN (${VIEWING_EVENTS})`),
    q(`UPDATE events SET data = NULL WHERE id IN (${VIEWING_EVENTS})`),
    q(`DELETE FROM viewing_requests WHERE id IN (${VIEWINGS})`),
  ]);
  return { contacts: r[6].meta.changes, viewings: r[10].meta.changes };
}

// E6: retention_run {date, ok, attempts, contacts, viewings}. A poll claims the pass when the stored date is earlier
// than today (attempts starts again at 1), or is today with the pass not done and fewer than 3 attempts: a failed pass
// is retried twice by later polls, then waits for the next day. One statement, so two polls never both win an attempt.
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
export const recordRetentionDay = (env, date, { contacts, viewings }) => env.DB.prepare(`UPDATE app_settings
  SET value = json_set(value, '$.ok', json('true'), '$.contacts', ?, '$.viewings', ?), updated_at = ?
  WHERE key = 'retention_run' AND json_extract(value, '$.date') = ?`).bind(contacts, viewings, now(), date).run();
