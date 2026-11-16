// VIS-12: a confirmed viewing in its negotiator's Google Calendar, and their busy times read before one is confirmed.
// Switched off (VIS12_CALENDAR_READY) or before migration 0105, nothing here reads, writes or calls anyone. The
// applicant's Google invitation is a second switch (VIS12_CALENDAR_INVITES_READY): off, the event has no attendee and
// Google sends nobody anything. The event carries the house, its address and the time: never the viewing's notes, the
// house's keys or access note (VIS-10), nor the applicant's name or phone. Shared by the website and the clock
// (server/jobs.js, calendarRetryTick), so it imports nothing of the panel's session (auth.js, jose): the routes that
// connect a calendar are in server/viewing-calendar.js.
import { now } from "./http.js";
import { jerseyViewingInstant } from "./viewing-policy.js";
import { formatExactAddress } from "./listing-details.js";
import { OAUTH_URL, API_URL, accessToken, getBusy, upsertViewingEvent, cancelViewingEvent, deleteViewingEvent, eventIdFor }
  from "./calendar-google.js";

export const calendarReady = env => env?.VIS12_CALENDAR_READY === "1";
export const invitesReady = env => calendarReady(env) && env?.VIS12_CALENDAR_INVITES_READY === "1";
// Before migration 0105 (or 0106, the connected account), everything here reads as switched off.
export const noTable = e => /no such (table: calendar_|column: google_email)/.test(e?.message ?? "");

// --- The refresh token, sealed with AES-GCM under GOOGLE_CALENDAR_TOKEN_KEY (32 bytes, base64), a secret outside D1.
const enc = s => new TextEncoder().encode(s);
export const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function keyBytes(env) {
  try { const k = unb64(env?.GOOGLE_CALENDAR_TOKEN_KEY ?? ""); return k.length === 32 ? k : null; } catch { return null; }
}
const tokenKey = env => {
  const raw = keyBytes(env);
  if (!raw) throw new Error("VIS-12: GOOGLE_CALENDAR_TOKEN_KEY must be 32 bytes in base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
};
export async function sealToken(env, negotiatorId, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc(`vis12:${negotiatorId}`) }, await tokenKey(env), enc(token));
  return `v1.${b64(iv)}.${b64(ct)}`;
}
export async function openToken(env, negotiatorId, sealed) {
  const [v, iv, ct] = String(sealed ?? "").split(".");
  if (v !== "v1") throw new Error("VIS-12: unknown token format");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv), additionalData: enc(`vis12:${negotiatorId}`) },
    await tokenKey(env), unb64(ct)));
}
// M8: GOOGLE_OAUTH_URL and GOOGLE_CALENDAR_API only point the tests at a fake Google. Set, they must be Google's over
// https (googleapis.com) or a local fake (http on localhost, which a deployed Worker cannot reach); anything else is null
// and the calendar counts as not set up: no token or event ever goes to another host.
function googleUrl(value, fallback) {
  if (value == null) return fallback;
  let u;
  try { u = new URL(value); } catch { return null; }
  if (u.username || u.password || u.search || u.hash) return null;
  const google = u.protocol === "https:" && (u.hostname === "googleapis.com" || u.hostname.endsWith(".googleapis.com")) && !u.port;
  const local = u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname);
  return google || local ? u.href.replace(/\/+$/, "") : null;
}
export const oauth = env => googleUrl(env?.GOOGLE_OAUTH_URL, OAUTH_URL);
const calendarApi = env => googleUrl(env?.GOOGLE_CALENDAR_API, API_URL);
// What talking to Google needs (the website and the clock): client, key and Google's own addresses.
const googleReady = env => typeof env?.GOOGLE_CALENDAR_CLIENT_ID === "string" && env.GOOGLE_CALENDAR_CLIENT_ID !== ""
  && typeof env.GOOGLE_CALENDAR_CLIENT_SECRET === "string" && env.GOOGLE_CALENDAR_CLIENT_SECRET !== "" && !!keyBytes(env)
  && !!oauth(env) && !!calendarApi(env);
// And, to connect a calendar, the website's fixed address for Google's answer.
export const calendarConfigured = env => googleReady(env) && /^https:\/\//.test(env.SITE_URL ?? "");
// A Google connection for one call: a fresh access token from the sealed refresh token (never stored).
async function withConnection(env, conn, fetch, run) {
  if (!googleReady(env)) return { state: "unknown", error: "not set up" };
  let token;
  try {
    token = await accessToken({ fetch, oauth: oauth(env), clientId: env.GOOGLE_CALENDAR_CLIENT_ID, clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
      refreshToken: await openToken(env, conn.negotiator_id, conn.refresh_token_enc) });
  } catch { return { state: "unknown", error: "token" }; }
  return run({ fetch, token, calendarId: conn.calendar_id, api: calendarApi(env) });
}
const CONNECTION = "SELECT * FROM calendar_connections WHERE negotiator_id = ?";
const LINK = "SELECT * FROM calendar_event_links WHERE viewing_id = ?";

// --- The event. Jersey wall times to their instant (BST first in the autumn's repeated hour; none in the spring gap).
const instant = (date, time) => [3600, 0].map(offset => jerseyViewingInstant(date, time, offset)).find(Boolean) ?? null;
const utc = iso => iso.replace(".000Z", "Z");
// v: the viewing with its house's title, address fields and the applicant's email. invite: add the applicant.
export function viewingEvent(v, { invite }) {
  const starts = instant(v.date, v.time), ends = instant(v.date, v.end_time ?? v.time);
  if (!starts || !ends) return null;
  const address = formatExactAddress(v, v);
  return {
    summary: `Viewing: ${v.title ?? "Property"}`,
    ...(address ? { location: address } : {}),
    description: ["Hampton Estates viewing", v.listing_id, v.kind].filter(Boolean).join(" · "),
    start: { dateTime: utc(starts), timeZone: "Europe/Jersey" }, end: { dateTime: utc(ends), timeZone: "Europe/Jersey" },
    status: "confirmed", visibility: "private", transparency: "opaque",
    guestsCanSeeOtherGuests: false, guestsCanInviteOthers: false,
    extendedProperties: { private: { hampton_viewing: String(v.id) } },
    ...(invite && v.email ? { attendees: [{ email: v.email }] } : {}),
  };
}

const VIEWING = `SELECT v.id, v.listing_id, v.negotiator_id, v.kind, v.date, v.time, v.end_time, v.email, v.status, v.updated_at,
  v.created_at, COALESCE(l.title, v.listing_title_snapshot) AS title, l.road_name, l.location, l.parish, l.country,
  d.building_name_or_number, d.postcode
  FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id LEFT JOIN listing_details d ON d.listing_id = v.listing_id
  WHERE v.id = ?`;

// Brings the viewing's Google event in line with the viewing as it is now: confirmed → the event at its time;
// cancelled or deleted → the event cancelled (if there ever was one). Requested, completed or no-show: left as it is.
// Safe to repeat: one event per viewing (deterministic id), written only if it differs. Returns { state }.
export async function syncViewingCalendar(env, viewingId, { fetch = globalThis.fetch } = {}) {
  if (!calendarReady(env)) return { state: "off" };
  try { return await sync(env, viewingId, fetch); }
  catch (e) { if (noTable(e)) return { state: "off" }; throw e; }
}

async function sync(env, id, fetch) {
  const [v, link] = await Promise.all([env.DB.prepare(VIEWING).bind(id).first(), env.DB.prepare(LINK).bind(id).first()]);
  // M5: a viewing held (completed) or missed (no-show) keeps the event it had: a write still owed is made, so its row
  // never waits in the clock's queue for ever. M6: a deleted viewing's event is deleted, not just cancelled.
  const gone = !v, wanted = gone || v.status === "cancelled" ? "cancelled" : v.status === "confirmed"
    || (link && ["completed", "no_show"].includes(v.status)) ? "confirmed" : null;
  if (!wanted || (wanted === "cancelled" && !link)) return { state: link?.state ?? "none" };
  // The revision and what the event shows: two saves in the same millisecond still differ by their content.
  const op = v ? [v.updated_at ?? v.created_at, wanted, v.negotiator_id, v.date, v.time, v.end_time].join("|") : "deleted|cancelled";
  if (link?.op === op && link.state === "synced") return { state: "synced" };
  const negotiatorId = wanted === "confirmed" ? v.negotiator_id : link.negotiator_id;
  const conn = negotiatorId == null ? null : await env.DB.prepare(CONNECTION).bind(negotiatorId).first();
  if (!conn && !link) return { state: "none" }; // never connected: Hampton's own calendar only
  const moved = !!link && link.negotiator_id !== negotiatorId, invite = invitesReady(env);
  if (moved && link.wanted === "confirmed") { // first out of the calendar it was in
    const old = await env.DB.prepare(CONNECTION).bind(link.negotiator_id).first();
    if (old?.state === "active") await withConnection(env, old, fetch, c => cancelViewingEvent(c,
      { external_id: link.external_id, sendUpdates: link.invited && invite ? "all" : "none" }));
  }
  const external_id = link?.external_id ?? await eventIdFor(id), ts = now();
  // The mapping is durable before Google is called: a lost answer is found again under the same id.
  await env.DB.prepare(`INSERT INTO calendar_event_links (viewing_id, negotiator_id, calendar_id, external_id, op, wanted, state, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    ON CONFLICT(viewing_id) DO UPDATE SET op = excluded.op, wanted = excluded.wanted, state = 'pending', error = NULL,
      updated_at = excluded.updated_at, negotiator_id = excluded.negotiator_id, calendar_id = excluded.calendar_id,
      etag = CASE WHEN ? THEN NULL ELSE etag END, starts_utc = CASE WHEN ? THEN NULL ELSE starts_utc END,
      ends_utc = CASE WHEN ? THEN NULL ELSE ends_utc END, invited = CASE WHEN ? THEN 0 ELSE invited END`)
    .bind(id, negotiatorId, conn?.calendar_id ?? link.calendar_id, external_id, op, wanted, ts, ...Array(4).fill(moved ? 1 : 0)).run();
  if (conn?.state !== "active") return { state: "pending" }; // disconnected: nothing is sent
  // M6: with invitations off the event has no attendee, even one invited before (removed without telling anyone).
  const event = wanted === "confirmed" ? viewingEvent(v, { invite }) : null;
  const known = !moved && link?.starts_utc ? { starts_utc: link.starts_utc, ends_utc: link.ends_utc } : null;
  const result = wanted === "cancelled"
    ? await withConnection(env, conn, fetch, c => (gone ? deleteViewingEvent : cancelViewingEvent)(c,
      { external_id, sendUpdates: link.invited && invite ? "all" : "none" }))
    : !event ? { state: "conflict", error: "no such time in Jersey" }
    : await withConnection(env, conn, fetch, c => upsertViewingEvent(c, { external_id, event, expected: known,
      sendUpdates: event.attendees && invite ? "all" : "none" }));
  const wrote = result.state === "synced" && event;
  // Recorded only while this is still the latest change and the same connection is still active: a late answer after
  // a newer change, a disconnect or a reconnect changes nothing.
  const r = await env.DB.prepare(`UPDATE calendar_event_links SET state = ?, error = ?, updated_at = ?, etag = COALESCE(?, etag),
      starts_utc = COALESCE(?, starts_utc), ends_utc = COALESCE(?, ends_utc), invited = COALESCE(?, invited)
    WHERE viewing_id = ? AND op = ? AND EXISTS (SELECT 1 FROM calendar_connections WHERE negotiator_id = ? AND state = 'active'
      AND connected_at = ?)`)
    .bind(result.state, result.error?.slice(0, 200) ?? null, now(), result.etag ?? null, wrote ? instant(v.date, v.time) : null,
      wrote ? instant(v.date, v.end_time ?? v.time) : null, wrote ? (event.attendees ? 1 : 0) : null, id, op, conn.negotiator_id,
      conn.connected_at).run();
  return { state: r.meta.changes ? result.state : "superseded" };
}

// Fire-and-forget after a viewing changed (confirmed, moved, cancelled, deleted): after the answer, never before it.
export function afterViewingChange(env, waitUntil, viewingId) {
  if (calendarReady(env)) waitUntil(syncViewingCalendar(env, viewingId).catch(e => console.error("VIS-12 calendar", e?.message)));
}

// The clock's pass (server/jobs.js, every 10 minutes): the events Google did not take yet, oldest first. Only those of
// a connected calendar: a disconnected negotiator's stay pending, untouched, until it is connected again.
export async function calendarRetryTick(env, { limit = 50, fetch = globalThis.fetch } = {}) {
  if (!calendarReady(env)) return { tried: 0 };
  let rows;
  try {
    rows = (await env.DB.prepare(`SELECT l.viewing_id FROM calendar_event_links l WHERE l.state IN ('pending','unknown')
      AND EXISTS (SELECT 1 FROM calendar_connections c WHERE c.negotiator_id = l.negotiator_id AND c.state = 'active')
      ORDER BY l.updated_at LIMIT ?`).bind(limit).all()).results;
  } catch (e) { if (noTable(e)) return { tried: 0 }; throw e; }
  for (const r of rows) await syncViewingCalendar(env, r.viewing_id, { fetch });
  return { tried: rows.length };
}

// Before a viewing is confirmed, booked or moved: is that time free in the negotiator's Google Calendar? null when there
// is nothing to check (off, or no connected calendar: Hampton's calendar alone). Only intervals are read; none is kept.
// reviewed: staff checked the calendar themselves; it answers for "could not check" and for an overlap with the
// viewing's own event (freeBusy merges it with anything else at that time, so it is never subtracted), never for busy.
const UNCHECKED = { code: "calendar_unchecked", error: "The negotiator's Google Calendar could not be checked for this time. Try again, or check it yourself and confirm that the time is free." };
const BUSY = { code: "calendar_busy", error: "The negotiator is busy at this time in Google Calendar. Please choose another." };
const SELF = { code: "calendar_self_overlap", error: "Google Calendar shows this viewing's own event at this time, and maybe something else. Check the negotiator's calendar and confirm that nothing else is there." };
// reviewed: the body's calendar_reviewed, { negotiator_id, date, time } of the slot staff checked (M7: it answers for
// that slot only; anything else, true included, is no check). known: [[starts, ends], …] other events of Hampton's own
// at that time that Google holds (an open viewing's places), treated as the viewing's own.
export async function calendarBusyCheck(env, { viewing_id = null, negotiator_id, date, time, end_time },
  { reviewed = null, known = [], fetch = globalThis.fetch } = {}) {
  if (!calendarReady(env) || negotiator_id == null) return null;
  let conn, link;
  try {
    [conn, link] = await Promise.all([env.DB.prepare(CONNECTION).bind(negotiator_id).first(),
      viewing_id == null ? null : env.DB.prepare(LINK).bind(viewing_id).first()]);
  } catch (e) { if (noTable(e)) return null; throw e; }
  if (conn?.state !== "active") return null;
  const ok = reviewed && typeof reviewed === "object" && reviewed.negotiator_id === negotiator_id && reviewed.date === date
    && reviewed.time === time;
  const pass = ok ? { reviewed: true } : null, from = instant(date, time), to = instant(date, end_time);
  // M10: no instant, or an end not after the start: it cannot be checked (never a server error).
  if (!from || !to || !(Date.parse(to) > Date.parse(from))) return pass ?? UNCHECKED;
  const busy = await withConnection(env, conn, fetch, c => getBusy(c, { from, to })).catch(() => ({ state: "unknown" }));
  if (busy.state !== "ok") return pass ?? UNCHECKED;
  // M3: the viewing's own event counts only while Google is known to hold it there (synced).
  const own = [...(link?.state === "synced" && link.negotiator_id === negotiator_id && link.wanted === "confirmed" && link.starts_utc
    ? [[link.starts_utc, link.ends_utc]] : []), ...known].map(([a, b]) => [Date.parse(a), Date.parse(b)]);
  let self = false;
  for (const b of busy.intervals) {
    const s = Math.max(Date.parse(from), Date.parse(b.start)), e = Math.min(Date.parse(to), Date.parse(b.end));
    if (!(s < e)) continue;
    if (own.some(([a, z]) => s >= a && e <= z)) self = true; else return BUSY;
  }
  return self ? pass ?? SELF : null;
}
