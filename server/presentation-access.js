// AGE-12 (migration 0086, AGE12_PRESENTATIONS_READY): a private link to the homes presented to one client, who answers
// on each one (interested, wants to view it, not for me, call me) without filling in their search again.
// The team picks the homes (matches approved now, still offered and confirmed available: AVAILABLE of match-pages) and
// copies the link; sending it is the team's own (AGE-11 and AUT-17 will send it by email). The link is 256 random bits
// in the URL's fragment, kept only as its SHA-256, dormant until a person records having sent it, and valid until a
// person revokes it (expires_at NULL: Luis, scope of 9-nov). Redeeming it (a POST) gives a 7-day session cookie, renewed
// by redeeming the same link again; every read checks the link again, so a revocation blocks every later read.
// Photos are only the suitable files of AGE-10's files(), checked in storage when served; never the public /media.
// An answer writes only its own row, an event and one Inbox task: it changes no match, criterion, availability or
// viewing, and a viewing request books nothing. Off, or before the migration, the client routes answer 404.
import { json, fail, readJson, now, sha256 } from "./http.js";
import { getCookie } from "./auth.js";
import { files } from "./private-media.js";
import { capturesReady } from "./property-captures.js";
import { taskStatements } from "./notification-tasks.js";
import { AVAILABLE } from "./match-pages.js";

const ready = env => env?.AGE12_PRESENTATIONS_READY === "1" && env?.AGE10_PHOTOS_READY === "1" && capturesReady(env);
const missingTable = e => /no such table/.test(e?.message ?? "");
const GONE = "This link is not available. Please contact Hampton Estates.";
const gone = () => fail(404, GONE);
const COOKIE = "__Host-hp", SESSION_MS = 7 * 86400e3, MAX_HOMES = 10, TOKEN = /^[A-Za-z0-9_-]{43}$/;
const OFFERED = "l.archived_at IS NULL AND l.availability IN ('for_sale','to_let','lease')";
const VALID = "g.sent_at IS NOT NULL AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > ?)";

const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
function hmacKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("SESSION_SECRET missing or shorter than 32 characters");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
const signed = (id, exp) => enc.encode(`age12-presentation:${id}:${exp}`);

// The link in force behind this request's session cookie, or null: a forged, expired or revoked one is never told apart.
async function granted(env, request) {
  const m = /^(\d{1,15})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(getCookie(request, COOKIE) ?? "");
  if (!m || Number(m[2]) <= Date.now()) return null;
  if (!(await crypto.subtle.verify("HMAC", await hmacKey(env.SESSION_SECRET), unb64u(m[3]), signed(m[1], m[2])))) return null;
  return env.DB.prepare(`SELECT g.id, g.applicant_id FROM presentation_grants g WHERE g.id = ? AND ${VALID}`).bind(Number(m[1]), now()).first();
}
// Each client route: 404 while off, before the migration, or without a link in force.
const client = (handler, session = true) => async ctx => {
  if (!ready(ctx.env)) gone();
  try {
    const grant = session ? await granted(ctx.env, ctx.request) : null;
    if (session && !grant) gone();
    return await handler({ ...ctx, grant });
  } catch (e) { if (missingTable(e)) gone(); throw e; }
};

// POST {token}: the link's own, from the page's fragment. A new 7-day session, never past an expiry the link may have.
async function redeem({ request, env }) {
  const b = (await readJson(request, 256)) ?? {};
  if (typeof b.token !== "string" || !TOKEN.test(b.token)) gone();
  const g = await env.DB.prepare(`SELECT g.id, g.expires_at FROM presentation_grants g WHERE g.token_hash = ? AND ${VALID}`)
    .bind(await sha256(b.token), now()).first();
  if (!g) gone();
  const t = Date.now(), exp = Math.min(t + SESSION_MS, g.expires_at ? Date.parse(g.expires_at) : Infinity);
  const sig = b64u(await crypto.subtle.sign("HMAC", await hmacKey(env.SESSION_SECRET), signed(g.id, exp)));
  return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=${g.id}.${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; `
    + `Max-Age=${Math.floor((exp - t) / 1000)}` });
}

// The homes of this link only, in the order chosen, with their suitable photos (files() of AGE-10) and the answer given.
// A home no longer offered (archived, let, sold) shows nothing of itself: listing null and no photos.
async function options({ env, grant }) {
  const homes = (await env.DB.prepare(`SELECT o.match_id, o.choice, o.answered_at, l.id, l.title, l.location, l.bedrooms, l.bathrooms,
      l.operation, l.sale_price, l.rent, l.rent_period, l.currency, l.summary, ${OFFERED} AS offered
    FROM presentation_options o JOIN listings l ON l.id = o.listing_id WHERE o.grant_id = ? ORDER BY o.position`).bind(grant.id).all()).results;
  const photos = await Promise.all(homes.map(h => (h.offered ? files(env, h.id) : { files: [] })));
  return json({ options: homes.map(({ match_id, choice, answered_at, offered, ...listing }, i) => ({ match_id, choice, answered_at,
    offered: Boolean(offered), listing: offered ? listing : null, photos: photos[i].files.filter(f => f.decision?.status === "private_approved")
      .map(f => ({ id: f.asset_id, label: f.label })) })) });
}

// One photo of a home of this link still offered, while files() says it is suitable and storage still holds the file it
// was checked as. Only JPEG, PNG or WebP: never an SVG, which can carry script.
const TYPES = ["image/jpeg", "image/png", "image/webp"];
async function photo({ env, grant, params: [id] }) {
  const a = await env.DB.prepare(`SELECT a.blob_key, c.listing_id FROM property_capture_assets a JOIN property_captures c ON c.id = a.capture_id
    WHERE a.id = ? AND EXISTS (SELECT 1 FROM presentation_options o JOIN listings l ON l.id = o.listing_id
      WHERE o.grant_id = ? AND o.listing_id = c.listing_id AND ${OFFERED})`)
    .bind(Number(id), grant.id).first();
  const f = a && (await files(env, a.listing_id)).files.find(x => x.asset_id === Number(id) && x.decision?.status === "private_approved");
  const obj = f && await env.MEDIA.get(a.blob_key), type = obj?.httpMetadata?.contentType ?? "";
  if (!obj || obj.etag !== f.etag || obj.size !== f.bytes || !TYPES.includes(type)) {
    if (obj?.body instanceof ReadableStream) await obj.body.cancel();
    fail(404, "Photo not available");
  }
  return new Response(obj.body, { headers: { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

const CHOICES = ["interested", "request_viewing", "not_for_me", "call_me"];
const TASK = {
  interested: [id => `Client is interested in ${id}`, "The client answered on their private presentation link that they are interested "
    + "in this home. Contact them to agree the next step; nothing was booked."],
  request_viewing: [id => `Arrange a viewing of ${id} for the client`, "The client asked to view this home on their private presentation link. "
    + "Coordinate it with the viewing times already on their search and with the advertiser; nothing is booked until each side confirms."],
  not_for_me: [id => `Client says ${id} is not for them`, "The client answered on their private presentation link that this home is not "
    + "for them; any note is on their search's Private presentation card. Their requirements, the match and the property are unchanged: "
    + "a change of criteria needs your confirmation with the client."],
  call_me: [id => `Call the client about ${id}`, "The client asked on their private presentation link for a call about this home."],
};
// POST {match_id, choice, reason?}: one answer per home, on a home still offered, while the link is in force (checked
// again inside the write). A second answer, even the same one, answers 409 and writes nothing.
async function respond({ request, env, grant }) {
  const b = (await readJson(request, 2048)) ?? {};
  if (!CHOICES.includes(b.choice) || !Number.isSafeInteger(b.match_id)) fail(400, "Choose an answer for this home.");
  const reason = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim() : null;
  if (reason && reason.length > 500) fail(400, "Please keep your note to 500 characters.");
  const o = await env.DB.prepare(`SELECT o.listing_id, o.choice, ${OFFERED} AS offered FROM presentation_options o JOIN listings l
    ON l.id = o.listing_id WHERE o.grant_id = ? AND o.match_id = ?`).bind(grant.id, b.match_id).first();
  if (!o) fail(404, "This home is not in your selection.");
  if (o.choice) fail(409, "You have already answered for this home. To change it, please contact Hampton Estates.");
  if (!o.offered) fail(409, "This home is no longer available.");
  const ts = now(), [title, why] = TASK[b.choice];
  const [written] = await env.DB.batch([
    env.DB.prepare(`UPDATE presentation_options SET choice = ?, reason = ?, answered_at = ? WHERE grant_id = ? AND match_id = ? AND choice IS NULL
      AND EXISTS (SELECT 1 FROM presentation_grants g WHERE g.id = grant_id AND ${VALID})`).bind(b.choice, reason, ts, grant.id, b.match_id, ts),
    env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data) SELECT ?, 'client', 'applicant', ?, 'applicant.presentation_answered',
      json_object('version', 1, 'grant_id', ?, 'match_id', ?, 'listing_id', ?, 'choice', ?) WHERE changes() = 1`)
      .bind(ts, String(grant.applicant_id), grant.id, b.match_id, o.listing_id, b.choice),
    ...taskStatements(env, { taskKey: `presentation:${grant.id}:${b.match_id}`, eventId: null, category: "task", title: title(o.listing_id), reason: why,
      target: { kind: "applicant", id: String(grant.applicant_id) }, actor: "client" }, { ifInserted: true }),
  ]);
  if (!written.meta.changes) {
    if (!(await granted(env, request))) gone();
    fail(409, "You have already answered for this home. To change it, please contact Hampton Estates.");
  }
  return json({ option: { match_id: b.match_id, choice: b.choice, answered_at: ts } });
}

// The panel: this search's links (newest first) with their homes and answers, and the homes that can be presented now.
async function view(env, applicantId) {
  const [grants, homes, presentable] = (await env.DB.batch([
    env.DB.prepare(`SELECT id, created_at, created_by, sent_at, sent_by, revoked_at, revoked_by FROM presentation_grants
      WHERE applicant_id = ? ORDER BY id DESC LIMIT 20`).bind(applicantId),
    env.DB.prepare(`SELECT o.grant_id, o.match_id, o.listing_id, l.title, o.choice, o.reason, o.answered_at FROM presentation_options o
      JOIN presentation_grants g ON g.id = o.grant_id LEFT JOIN listings l ON l.id = o.listing_id WHERE g.applicant_id = ? ORDER BY o.grant_id, o.position`)
      .bind(applicantId),
    env.DB.prepare(`SELECT m.id AS match_id, l.id AS listing_id, l.title FROM matches m JOIN listings l ON l.id = m.listing_id
      JOIN applicants a ON a.id = m.applicant_id WHERE m.applicant_id = ? AND ${AVAILABLE} ORDER BY l.id LIMIT 50`).bind(applicantId),
  ])).map(r => r.results);
  return { enabled: true, max_homes: MAX_HOMES, presentable,
    grants: grants.map(g => ({ ...g, options: homes.filter(h => h.grant_id === g.id).map(({ grant_id, ...h }) => h) })) };
}
const staff = handler => async ctx => {
  if (!ready(ctx.env)) return ctx.request.method === "GET" ? json({ enabled: false }) : fail(404, "Not found");
  try { return await handler(ctx); }
  catch (e) { if (!missingTable(e)) throw e; return ctx.request.method === "GET" ? json({ enabled: false }) : fail(404, "Not found"); }
};
const list = ({ env, params: [id] }) => view(env, Number(id)).then(d => json(d));

// POST {match_ids}: a dormant link to these homes (1 to MAX_HOMES, each approved for this client now, still offered and
// confirmed available). The link is shown this once: only its hash is kept.
async function create({ request, env, admin, params: [id] }) {
  const ids = ((await readJson(request, 1024)) ?? {}).match_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_HOMES || !ids.every(Number.isSafeInteger) || new Set(ids).size !== ids.length)
    fail(400, `Choose between 1 and ${MAX_HOMES} homes to present.`);
  const found = (await env.DB.prepare(`SELECT m.id, m.listing_id FROM matches m JOIN listings l ON l.id = m.listing_id JOIN applicants a ON a.id = m.applicant_id
    WHERE m.applicant_id = ? AND m.id IN (SELECT value FROM json_each(?)) AND ${AVAILABLE}`).bind(Number(id), JSON.stringify(ids)).all()).results;
  if (found.length !== ids.length) fail(409, "Only homes approved for this client, still offered and confirmed available can be presented. Reload the homes.");
  const token = b64u(crypto.getRandomValues(new Uint8Array(32))), hash = await sha256(token), ts = now();
  const listing = new Map(found.map(m => [m.id, m.listing_id]));
  const [g] = await env.DB.batch([
    env.DB.prepare("INSERT INTO presentation_grants (applicant_id, token_hash, created_at, created_by) VALUES (?, ?, ?, ?)").bind(Number(id), hash, ts, admin),
    ...ids.map((m, i) => env.DB.prepare(`INSERT INTO presentation_options (grant_id, match_id, listing_id, position)
      SELECT id, ?, ?, ? FROM presentation_grants WHERE token_hash = ?`).bind(m, listing.get(m), i, hash)),
  ]);
  return json({ id: g.meta.last_row_id, link: `${new URL(request.url).origin}/presentation#${token}`, ...(await view(env, Number(id))) }, 201);
}

// POST: record that a person sent the link (it starts to work), or revoke it (every later read is refused).
async function mark({ env, admin, params: [id, action] }) {
  const ts = now(), sql = action === "sent" ? "sent_at = ?, sent_by = ? WHERE id = ? AND sent_at IS NULL AND revoked_at IS NULL"
    : "revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL";
  const r = await env.DB.prepare(`UPDATE presentation_grants SET ${sql}`).bind(ts, admin, Number(id)).run();
  const g = await env.DB.prepare("SELECT applicant_id FROM presentation_grants WHERE id = ?").bind(Number(id)).first();
  if (!g) fail(404, "Link not found");
  if (!r.meta.changes) fail(409, action === "sent" ? "This link was already recorded as sent, or was revoked. Reload." : "This link was already revoked.");
  return json(await view(env, g.applicant_id));
}

export default [
  ["GET", /^\/admin\/applicants\/(\d+)\/presentations$/, staff(list), true],
  ["POST", /^\/admin\/applicants\/(\d+)\/presentations$/, staff(create), true],
  ["POST", /^\/admin\/presentations\/(\d+)\/(sent|revoke)$/, staff(mark), true],
  ["POST", /^\/presentation\/session$/, client(redeem, false), false],
  ["GET", /^\/presentation\/options$/, client(options), false],
  ["GET", /^\/presentation\/photos\/(\d+)$/, client(photo), false],
  ["POST", /^\/presentation\/respond$/, client(respond), false],
];
