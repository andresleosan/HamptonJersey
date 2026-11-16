// VIS-12: Google Calendar for viewings, the adapter alone. Every call takes the fetch to use (connection.fetch), so a
// fake Google stands in for the real one in tests. It reads busy intervals (never a title or attendee) and writes one
// event per viewing under a deterministic id. No retries here: the caller records pending/unknown and tries again.
import { sha256 } from "./http.js";

export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
// GOOGLE_OAUTH_URL and GOOGLE_CALENDAR_API (unset in production) let the e2e point these at a fake Google, as DRIVE_API.
export const OAUTH_URL = "https://oauth2.googleapis.com", API_URL = "https://www.googleapis.com/calendar/v3";
// The least access that lets Hampton write events in calendars the negotiator owns and read their busy times; no access
// to event contents, other calendars' details or email.
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.freebusy"];
export const TIMEOUT_MS = 10000, MAX_BUSY = 100, MAX_RANGE_DAYS = 14;

// Valid as a Google event id (base32hex letters a-v and digits, 5–1024): the hex SHA-256 of the viewing's identity.
export const eventIdFor = viewingId => sha256(`hampton-viewing:${viewingId}`);

export function authUrl({ clientId, redirectUri, state }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code",
    scope: GOOGLE_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "false", state });
  return `${AUTH_URL}?${q}`;
}

// Every request, its answer read, within TIMEOUT_MS (setTimeout, cleared after: nothing is left running).
async function send(fetch, url, init, signal) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(new Error("timeout")), TIMEOUT_MS);
  signal?.addEventListener("abort", () => ctl.abort(signal.reason), { once: true });
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    let body = null;
    try { body = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, body };
  } finally { clearTimeout(timer); }
}
const form = (fetch, url, body) => send(fetch, url, { method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });

// The authorization code for a refresh token and the scopes actually granted. Throws on any refusal.
export async function exchangeCode({ fetch, oauth = OAUTH_URL, clientId, clientSecret, redirectUri, code }) {
  const r = await form(fetch, `${oauth}/token`, { code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri,
    grant_type: "authorization_code" }), b = r.body;
  if (!r.ok || typeof b?.refresh_token !== "string") throw new Error(`Google token exchange failed (${r.status})`);
  return { refresh_token: b.refresh_token, scopes: String(b.scope ?? "").split(" ").filter(Boolean) };
}

// A short-lived access token from the stored refresh token; never stored.
export async function accessToken({ fetch, oauth = OAUTH_URL, clientId, clientSecret, refreshToken }) {
  const r = await form(fetch, `${oauth}/token`, { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken,
    grant_type: "refresh_token" }), b = r.body;
  if (!r.ok || typeof b?.access_token !== "string") throw new Error(`Google token refresh failed (${r.status})`);
  return b.access_token;
}

export const revokeToken = ({ fetch, oauth = OAUTH_URL, token }) => form(fetch, `${oauth}/revoke`, { token });

const call = (c, method, path, { body, query, etag, signal } = {}) => send(c.fetch, `${c.api ?? API_URL}${path}${query ? `?${new URLSearchParams(query)}` : ""}`, {
  method, headers: { authorization: `Bearer ${c.token}`, ...(body ? { "content-type": "application/json" } : {}), ...(etag ? { "if-match": etag } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}) }, signal);

// connection: { fetch, token (access token), calendarId, api? }. from/to: ISO instants, at most 14 days apart.
// state: ok, unknown (Google did not answer in 10 s, or refused) or incomplete (more than 100 intervals: never "free").
export async function getBusy(c, { from, to, signal }) {
  const span = Date.parse(to) - Date.parse(from);
  if (!(span > 0) || span > MAX_RANGE_DAYS * 864e5) throw new RangeError("getBusy: a range of up to 14 days");
  const checked_at = new Date().toISOString(), unknown = { intervals: [], checked_at, state: "unknown" };
  try {
    const r = await call(c, "POST", "/freeBusy", { body: { timeMin: from, timeMax: to, items: [{ id: c.calendarId }] }, signal });
    const cal = r.ok ? r.body?.calendars?.[c.calendarId] : null;
    if (!cal || cal.errors?.length || !Array.isArray(cal.busy)) return unknown;
    if (cal.busy.length > MAX_BUSY) return { intervals: [], checked_at, state: "incomplete" };
    return { intervals: cal.busy.map(b => ({ start: String(b.start), end: String(b.end) })), checked_at, state: "ok" };
  } catch { return unknown; }
}

const at = e => Date.parse(e?.dateTime ?? "");
const sameTimes = (a, b) => at(a.start) === at(b.start) && at(a.end) === at(b.end);
const emails = ev => (ev.attendees ?? []).map(a => a.email).sort().join(",");
const same = (cur, ev) => cur.status === ev.status && sameTimes(cur, ev) && cur.summary === ev.summary
  && (cur.location ?? null) === (ev.location ?? null) && emails(cur) === emails(ev);
const failed = (r, why) => ({ state: r?.status === 412 ? "conflict" : "unknown", error: `${why} (${r?.status ?? "network"})` });
const done = b => ({ state: "synced", etag: b.etag ?? null });

// Creates or updates the viewing's event. expected: { starts_utc, ends_utc } Hampton last wrote, or null when it never
// knew it written. A time changed in Google since then, or an event changed meanwhile (412), is a conflict for staff:
// Hampton never overwrites it. An event already as wanted is not written again (nor its invitation re-sent).
export async function upsertViewingEvent(c, { external_id, event, expected = null, sendUpdates = "none" }) {
  const path = `/calendars/${encodeURIComponent(c.calendarId)}/events`, query = { sendUpdates };
  try {
    if (!expected) {
      const r = await call(c, "POST", path, { body: { ...event, id: external_id }, query });
      if (r.ok) return done(r.body);
      if (r.status !== 409) return failed(r, "insert");
    }
    const g = await call(c, "GET", `${path}/${external_id}`);
    if (!g.ok) return g.status === 404 && expected ? { state: "conflict", error: "deleted in Google" } : failed(g, "get");
    const cur = g.body;
    if (expected && cur.status !== "cancelled" && !sameTimes(cur, { start: { dateTime: expected.starts_utc }, end: { dateTime: expected.ends_utc } }))
      return { state: "conflict", error: "time changed in Google" };
    if (same(cur, event)) return done(cur);
    const answered = new Map((cur.attendees ?? []).map(a => [a.email, a]));
    const body = { ...cur, ...event, attendees: event.attendees?.map(a => answered.get(a.email) ?? a) };
    const p = await call(c, "PUT", `${path}/${external_id}`, { body, query, etag: cur.etag });
    return p.ok ? done(p.body) : failed(p, "update");
  } catch (e) { return { state: "unknown", error: String(e?.name ?? "error").slice(0, 60) }; }
}

// Cancels the event, keeping it in Google as cancelled. Already cancelled or gone: nothing to do.
export async function cancelViewingEvent(c, { external_id, sendUpdates = "none" }) {
  const path = `/calendars/${encodeURIComponent(c.calendarId)}/events/${external_id}`;
  try {
    const g = await call(c, "GET", path);
    if (g.status === 404 || g.status === 410) return { state: "synced", etag: null };
    if (!g.ok) return failed(g, "get");
    const cur = g.body;
    if (cur.status === "cancelled") return done(cur);
    const p = await call(c, "PUT", path, { body: { ...cur, status: "cancelled" }, query: { sendUpdates }, etag: cur.etag });
    return p.ok ? done(p.body) : failed(p, "cancel");
  } catch (e) { return { state: "unknown", error: String(e?.name ?? "error").slice(0, 60) }; }
}
