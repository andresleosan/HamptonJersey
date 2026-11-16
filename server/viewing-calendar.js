// VIS-12: connecting a negotiator's Google Calendar, and the panel's calendar routes. The sync itself, shared with the
// clock, is server/calendar-sync.js (re-exported here for the website's callers).
import { json, fail, readJson, now, sha256 } from "./http.js";
import { getCookie } from "./auth.js";
import { GOOGLE_SCOPES, authUrl, exchangeCode, revokeToken } from "./calendar-google.js";
import { calendarConfigured, invitesReady, noTable, b64, sealToken, openToken, oauth, syncViewingCalendar } from "./calendar-sync.js";
export { calendarReady, invitesReady, sealToken, calendarConfigured, viewingEvent, syncViewingCalendar, afterViewingChange,
  calendarRetryTick, calendarBusyCheck } from "./calendar-sync.js";

// --- Connecting a negotiator's calendar: OAuth on the server, a one-use state tied to the staff member and to their
// browser (a SameSite=Lax cookie, the one that survives Google's redirect back), the redirect fixed from SITE_URL.
const BROWSER = "__Host-hcal", STATE_MINUTES = 10;
const site = env => env.SITE_URL.replace(/\/+$/, "");
const redirectUri = env => `${site(env)}/api/calendar/google/callback`;
const random = () => b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function status({ env }) {
  let connections;
  try {
    connections = (await env.DB.prepare(`SELECT negotiator_id, provider, calendar_id, google_email, state, scopes, connected_at,
      connected_by, revoked_at FROM calendar_connections ORDER BY negotiator_id`).all()).results;
  } catch (e) { if (noTable(e)) return json({ enabled: false }); throw e; }
  return json({ enabled: true, configured: calendarConfigured(env), invites: invitesReady(env), connections }, 200, { "cache-control": "no-store" });
}

const negotiatorId = body => (Number.isSafeInteger(body?.negotiator_id) && body.negotiator_id > 0 ? body.negotiator_id : fail(400, "Choose a negotiator"));

async function start({ request, env, admin }) {
  const id = negotiatorId(await readJson(request));
  if (!calendarConfigured(env)) fail(503, "Google Calendar is not set up yet.");
  if (!(await env.DB.prepare("SELECT 1 FROM negotiators WHERE id = ? AND active = 1").bind(id).first())) fail(400, "Choose an active negotiator");
  const state = random(), browser = random(), at = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM calendar_oauth_states WHERE expires_at <= ?").bind(new Date(at).toISOString()),
      env.DB.prepare(`INSERT INTO calendar_oauth_states (state_hash, browser_hash, negotiator_id, admin, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(await sha256(state), await sha256(browser), id, admin, new Date(at).toISOString(),
        new Date(at + STATE_MINUTES * 60000).toISOString()),
    ]);
  } catch (e) { if (noTable(e)) fail(503, "Google Calendar is not set up yet."); throw e; }
  return json({ url: authUrl({ clientId: env.GOOGLE_CALENDAR_CLIENT_ID, redirectUri: redirectUri(env), state }) }, 200, {
    "cache-control": "no-store",
    "set-cookie": `${BROWSER}=${browser}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_MINUTES * 60}` });
}

// Google's redirect back (a top-level GET, so no session cookie and no same-origin check): everything it trusts is the
// state row, used up on the first answer, and the browser cookie. It answers only with a redirect to the panel.
async function callback({ request, env, waitUntil }) {
  const back = outcome => new Response(null, { status: 303, headers: { location: `/admin/?calendar=${outcome}#/availability`,
    "cache-control": "no-store", "referrer-policy": "no-referrer",
    "set-cookie": `${BROWSER}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` } });
  const q = new URL(request.url).searchParams, state = q.get("state");
  if (!state || state.length > 100) return back("failed");
  let row;
  try { row = await env.DB.prepare("DELETE FROM calendar_oauth_states WHERE state_hash = ? RETURNING *").bind(await sha256(state)).first(); }
  catch (e) { if (noTable(e)) return back("failed"); throw e; }
  if (!row || row.expires_at <= now()) return back("failed");
  if (q.get("error")) return back("denied"); // the viewings stay on Hampton's own calendar
  const browser = getCookie(request, BROWSER), code = q.get("code");
  if (!browser || await sha256(browser) !== row.browser_hash || !code || code.length > 1000 || !calendarConfigured(env)) return back("failed");
  const [staff, negotiator] = await Promise.all([env.DB.prepare("SELECT 1 FROM admins WHERE email = ?").bind(row.admin).first(),
    env.DB.prepare("SELECT 1 FROM negotiators WHERE id = ? AND active = 1").bind(row.negotiator_id).first()]);
  if (!staff || !negotiator) return back("failed");
  let got;
  try {
    got = await exchangeCode({ fetch: globalThis.fetch, oauth: oauth(env), clientId: env.GOOGLE_CALENDAR_CLIENT_ID,
      clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET, redirectUri: redirectUri(env), code });
  } catch { return back("failed"); }
  // M1: without every calendar permission, or without the account's verified address, nothing is kept (the new token
  // is revoked at once).
  const missing = !GOOGLE_SCOPES.every(s => got.scopes.includes(s));
  if (missing || !got.email) {
    waitUntil(revokeToken({ fetch: globalThis.fetch, oauth: oauth(env), token: got.refresh_token }));
    return back(missing ? "scopes" : "failed");
  }
  const before = await env.DB.prepare("SELECT * FROM calendar_connections WHERE negotiator_id = ? AND state = 'active'")
    .bind(row.negotiator_id).first();
  await env.DB.prepare(`INSERT INTO calendar_connections (negotiator_id, calendar_id, google_email, state, refresh_token_enc, scopes,
      connected_at, connected_by) VALUES (?, 'primary', ?, 'active', ?, ?, ?, ?)
    ON CONFLICT(negotiator_id) DO UPDATE SET calendar_id = 'primary', google_email = excluded.google_email, state = 'active',
      refresh_token_enc = excluded.refresh_token_enc, scopes = excluded.scopes, connected_at = excluded.connected_at,
      connected_by = excluded.connected_by, revoked_at = NULL, revoked_by = NULL`)
    .bind(row.negotiator_id, got.email, await sealToken(env, row.negotiator_id, got.refresh_token), GOOGLE_SCOPES.join(" "), now(), row.admin).run();
  // M2: a reconnection replaces the token; the one it replaces is revoked at Google, or the panel says it could not be.
  if (before && !(await revokeStored(env, before))) return back("connected_revoke_failed");
  return back("connected");
}

// M2: asks Google to revoke a stored token. false when it could not: the key no longer opens it, or Google did not confirm.
async function revokeStored(env, conn) {
  let token;
  try { token = await openToken(env, conn.negotiator_id, conn.refresh_token_enc); } catch { return false; }
  return revokeToken({ fetch: globalThis.fetch, oauth: oauth(env), token });
}

// Disconnecting forgets the token at once (no later write can use it) and asks Google to revoke it. revoked: whether
// Google confirmed it (M2: false when the key no longer opens the token or Google did not answer; the panel says where to
// remove the access by hand).
async function disconnect({ request, env, admin }) {
  const id = negotiatorId(await readJson(request));
  const conn = await env.DB.prepare("SELECT * FROM calendar_connections WHERE negotiator_id = ? AND state = 'active'").bind(id).first();
  if (!conn) fail(404, "No connected calendar");
  const r = await env.DB.prepare(`UPDATE calendar_connections SET state = 'revoked', refresh_token_enc = NULL, revoked_at = ?, revoked_by = ?
    WHERE negotiator_id = ? AND state = 'active' AND connected_at = ?`).bind(now(), admin, id, conn.connected_at).run();
  if (!r.meta.changes) fail(409, "The connection changed meanwhile. Reload and try again.");
  return json({ ok: true, revoked: await revokeStored(env, conn) });
}

const viewingId = v => (/^[1-9]\d{0,14}$/.test(v) ? Number(v) : fail(400, "Invalid viewing ID"));
async function viewingState({ env, params: [id] }) {
  let l;
  try { l = await env.DB.prepare("SELECT state, wanted, error, updated_at FROM calendar_event_links WHERE viewing_id = ?").bind(viewingId(id)).first(); }
  catch (e) { if (noTable(e)) return json({ state: "off" }); throw e; }
  return json(l ?? { state: "none" });
}
const retry = async ({ env, params: [id] }) => json(await syncViewingCalendar(env, viewingId(id)));

// Switched off, only the panel's question is answered: { enabled: false }, as VIS-10's house rules do.
export const calendarOffRoutes = [["GET", /^\/admin\/calendar\/google$/, () => json({ enabled: false }), true]];
// Mounted by server/api.js only with VIS12_CALENDAR_READY.
export const calendarRoutes = [
  ["GET", /^\/admin\/calendar\/google$/, status, true],
  ["POST", /^\/admin\/calendar\/google\/start$/, start, true],
  ["POST", /^\/admin\/calendar\/google\/disconnect$/, disconnect, true],
  ["GET", /^\/calendar\/google\/callback$/, callback],
  ["GET", /^\/admin\/calendar\/viewings\/([^/]+)$/, viewingState, true],
  ["POST", /^\/admin\/calendar\/viewings\/([^/]+)\/sync$/, retry, true],
];
