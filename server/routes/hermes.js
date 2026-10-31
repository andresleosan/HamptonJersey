import { json, fail, readJson, now } from "../http.js";
import { toPublic, TO_CONFIRM } from "../listing.js";
import { openCounts } from "./notifications.js";

// AUT-13 (spec 2026-10-31): Hermes's door. Hermes, on the VPS, reaches it through the key's custodian (H4), which adds
// Authorization: Bearer <HERMES_KEY>. Six fixed operations, public data (C0) and counts only: never who (H6, H7). It
// cannot approve, resume, publish or delete; that is done in the panel, with the routes at the end of this file.

const enc = new TextEncoder();
// Constant time on the SHA-256 digests, so neither the key's length nor its content shows in the timing (H5).
async function keyOk(request, env) {
  const key = env.HERMES_KEY, m = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "");
  if (typeof key !== "string" || key.length < 32 || !m) return false;
  const [a, b] = (await Promise.all([m[1], key].map(s => crypto.subtle.digest("SHA-256", enc.encode(s))))).map(d => new Uint8Array(d));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const setting = (env, key, value, by) => env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by)
  VALUES (?1, ?2, ?3, ?4) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,
  updated_by = excluded.updated_by`).bind(key, JSON.stringify(value), now(), by);

// H13: links into the panel from the host Hermes called, so they follow the domain. Never to a person's page.
const panel = (request, hash = "") => `${new URL(request.url).origin}/admin/#/${hash}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// H14: the 08:00 summary as fixed text, so Hermes can send it without the model. Counts and listing references only.
function summary(c, drafts, toConfirm, outbound, request) {
  const lines = [
    c.new_applicant && `${plural(c.new_applicant, "new applicant")} to review`,
    c.viewing && `${plural(c.viewing, "viewing request")} to answer`,
    c.matched && `${plural(c.matched, "new match", "new matches")} to review`,
    c.sales && `${plural(c.sales, "sale")} overdue or waiting`,
    c.rentals && `${plural(c.rentals, "rentals task")} to do`,
    c.expiring && `${plural(c.expiring, "applicant")} expiring`,
    drafts && `${plural(drafts, "text draft")} waiting for approval`,
  ].filter(Boolean).map(s => `- ${s}`);
  if (toConfirm.length) lines.push(`- To confirm: ${toConfirm.map(l => `${l.id} ${l.title}`).join(", ")}`);
  if (outbound) lines.push(`- Sending to clients and agencies is paused since ${outbound.at}`);
  return ["Hampton summary", ...(lines.length ? lines : ["Nothing waiting."]), `Open the panel: ${panel(request)}`].join("\n");
}

async function status({ request, env }) {
  const [counts, [{ results: toConfirm }, { results: [drafts] }]] = await Promise.all([openCounts(env), env.DB.batch([
    env.DB.prepare(`SELECT l.id, l.title FROM listings l WHERE ${TO_CONFIRM} ORDER BY l.id LIMIT 50`).bind(now()),
    env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'draft'"),
  ])]);
  const { outbound, ...c } = counts;
  const by = outbound && (outbound.by === "hermes" ? "hermes" : "team"); // never a team member's email
  return json({ counts: c, drafts_waiting: drafts.n,
    to_confirm_listings: toConfirm.map(l => ({ id: l.id, title: l.title, link: panel(request, `p/${l.id}`) })),
    outbound: outbound ? { paused: true, at: outbound.at, by } : null,
    summary: summary(c, drafts.n, toConfirm, outbound, request) });
}

// H7: what came in from the website since Hermes's cursor (a notification id), as a fixed text and a link. Only the
// listing's title travels, never the notice's own title, which names the person. Without ?after, the cursor only, so a
// first start does not send the history.
const NEWS = 50;
async function news({ request, env }) {
  const after = new URL(request.url).searchParams.get("after");
  if (after !== null && !/^\d{1,15}$/.test(after)) fail(400, "after must be a notification id");
  const { max } = await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS max FROM notifications").first();
  if (after === null) return json({ items: [], cursor: max });
  const { results } = await env.DB.prepare(`SELECT n.id, n.category, COALESCE(l.title, v.listing_title_snapshot) AS listing
    FROM notifications n JOIN events e ON e.id = n.event_id
    LEFT JOIN viewing_requests v ON e.entity_type = 'viewing' AND v.id = e.entity_id
    LEFT JOIN listings l ON l.id = v.listing_id
    WHERE n.id > ?1 AND n.id <= ?2 AND n.action_required = 1 AND n.category IN ('new_applicant', 'viewing')
    ORDER BY n.id LIMIT ${NEWS}`).bind(Number(after), max).all();
  const items = results.map(n => n.category === "new_applicant"
    ? { id: n.id, text: "New applicant", link: panel(request) }
    : { id: n.id, text: n.listing ? `New viewing request for ${n.listing}` : "New viewing request", link: panel(request, "viewings") });
  // A cursor past the last notice (a restored database) comes back to it, so later notices are not skipped.
  return json({ items, cursor: results.length === NEWS ? results.at(-1).id : max });
}

// H8: one open job per listing and kind; asking again answers with the open one.
const KINDS = ["listing_text"];
async function createJob(env, body, by) {
  if (!KINDS.includes(body?.kind) || typeof body.listing !== "string") fail(400, "Send kind: listing_text and a listing id");
  const ts = now();
  try {
    const job = await env.DB.prepare(`INSERT INTO jobs (kind, listing_id, requested_by, created_at)
      SELECT ?, id, ?, ? FROM listings WHERE id = ? AND published = 1 AND archived_at IS NULL RETURNING *`)
      .bind(body.kind, by, ts, body.listing).first();
    if (!job) fail(404, "Listing not found");
    return job;
  } catch (e) {
    if (!/UNIQUE/i.test(String(e?.message))) throw e;
    const open = await env.DB.prepare("SELECT id FROM jobs WHERE listing_id = ? AND kind = ? AND status IN ('queued','working','draft')")
      .bind(body.listing, body.kind).first();
    return { conflict: open?.id ?? null };
  }
}

async function requestJob({ request, env }) {
  const job = await createJob(env, await readJson(request), "hermes");
  return job.conflict !== undefined ? json({ error: "A job for this listing is already open", id: job.conflict }, 409)
    : json({ id: job.id }, 201);
}

// H9: only listings on the website, and what the website shows of them, without photos, interest, order or tour; never
// the road or the research. A job whose listing left the website waits until it is back (or the team cancels it).
const C0 = ["id", "title", "status", "region", "place", "type", "use", "operation", "currency", "salePrice", "rent",
  "rentPeriod", "premium", "priceText", "beds", "baths", "tenure", "tenureType", "housingCategory", "restriction", "summary",
  "description", "specs"];
const STALE_MINUTES = 10, ATTEMPTS = 3;

// The oldest job to do, or one taken over 10 minutes ago with no draft. One UPDATE claims it, so two polls never get the
// same job. A stale job at its third attempt fails instead.
async function nextJob({ env }) {
  const ts = now(), stale = new Date(Date.now() - STALE_MINUTES * 60e3).toISOString();
  await env.DB.prepare("UPDATE jobs SET status = 'failed' WHERE status = 'working' AND claimed_at <= ? AND attempts >= ?")
    .bind(stale, ATTEMPTS).run();
  const job = await env.DB.prepare(`UPDATE jobs SET status = 'working', attempts = attempts + 1, claimed_at = ?1
    WHERE id = (SELECT j.id FROM jobs j JOIN listings l ON l.id = j.listing_id AND l.published = 1 AND l.archived_at IS NULL
      WHERE j.status = 'queued' OR (j.status = 'working' AND j.claimed_at <= ?2) ORDER BY j.created_at, j.id LIMIT 1)
    RETURNING id, kind, listing_id`).bind(ts, stale).first();
  if (!job) return json({ job: null });
  const l = await env.DB.prepare("SELECT * FROM listings WHERE id = ?").bind(job.listing_id).first();
  const pub = toPublic(l, []);
  return json({ job: { id: job.id, kind: job.kind, listing: Object.fromEntries(C0.map(k => [k, pub[k]])) } });
}

// The editor's limits (server/listing.js TEXT); a draft keeps only the fields with text.
const DRAFT = { title: 200, summary: 5000, description: 20000 };
function checkDraft(body) {
  const out = {};
  for (const [k, max] of Object.entries(DRAFT)) {
    const v = body?.[k];
    if (v == null) continue;
    if (typeof v !== "string") fail(400, `${k} must be text`);
    if (v.trim().length > max) fail(400, `${k}: at most ${max} characters`);
    if (v.trim()) out[k] = v.trim();
  }
  if (!Object.keys(out).length) fail(400, "Send a title, a summary or a description");
  return out;
}

const missingOr409 = async (env, id, message) =>
  (await env.DB.prepare("SELECT 1 FROM jobs WHERE id = ?").bind(id).first()) ? fail(409, message) : fail(404, "Job not found");

async function draft({ request, env, params: [id] }) {
  const result = checkDraft(await readJson(request, 163840)); // 25,200 characters, even escaped as \uXXXX
  const job = await env.DB.prepare(`UPDATE jobs SET status = 'draft', result = ?, drafted_at = ?
    WHERE id = ? AND status = 'working' RETURNING listing_id`).bind(JSON.stringify(result), now(), Number(id)).first();
  if (!job) await missingOr409(env, Number(id), "This job is not being worked on");
  return json({ link: panel(request, `p/${job.listing_id}`) });
}

// H11: Hermes can only pause. Already paused: who paused and when are kept.
async function pause({ env }) {
  const ts = now();
  await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by)
    VALUES ('outbound', json_object('paused', json('true'), 'at', ?1, 'by', 'hermes'), ?1, 'hermes')
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    WHERE json_extract(app_settings.value, '$.paused') IS NOT 1`).bind(ts).run();
  const { value } = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'outbound'").first();
  const { at, by } = JSON.parse(value);
  return json({ outbound: { paused: true, at, by: by === "hermes" ? "hermes" : "team" } });
}

const DOOR = [
  ["GET", /^\/status$/, status],
  ["GET", /^\/news$/, news],
  ["POST", /^\/jobs$/, requestJob],
  ["POST", /^\/jobs\/next$/, nextJob],
  ["POST", /^\/jobs\/(\d+)\/draft$/, draft],
  ["POST", /^\/pause$/, pause],
];

// path: what follows /hermes. Errors are thrown as HttpError, for server/api.js to answer.
export async function hermesDoor(request, env, path) {
  if (!(await keyOk(request, env))) fail(401, "Unauthorized");
  await setting(env, "hermes", { at: now() }, "hermes").run(); // H12: when Hermes last asked
  for (const [m, re, handler] of DOOR) {
    const hit = m === request.method && re.exec(path);
    if (hit) return await handler({ request, env, params: hit.slice(1) });
  }
  fail(404, "Not found");
}

// The panel's side (session and same origin, like every admin route): ask, see, use or discard a draft (H10), resume.
const shape = j => j ? { id: j.id, kind: j.kind, listing_id: j.listing_id, status: j.status, created_at: j.created_at,
  drafted_at: j.drafted_at, result: j.result ? JSON.parse(j.result) : null } : null;

async function latestJob({ request, env }) {
  const listing = new URL(request.url).searchParams.get("listing") ?? "";
  const [{ results: [job] }, { results: [seen] }] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM jobs WHERE listing_id = ? AND kind = 'listing_text' ORDER BY id DESC LIMIT 1").bind(listing),
    env.DB.prepare("SELECT json_extract(value, '$.at') AS at FROM app_settings WHERE key = 'hermes'"),
  ]);
  return json({ job: shape(job), hermes_at: seen?.at ?? null });
}

async function askJob({ request, env, admin }) {
  const job = await createJob(env, await readJson(request), admin);
  return job.conflict !== undefined ? json({ error: "A draft for this listing is already on its way", id: job.conflict }, 409)
    : json({ job: shape(job) }, 201);
}

const decide = (to, from) => async ({ env, admin, params: [id] }) => {
  const job = await env.DB.prepare(`UPDATE jobs SET status = ?, decided_at = ?, decided_by = ?
    WHERE id = ? AND status IN (${from.map(s => `'${s}'`).join(", ")}) RETURNING *`).bind(to, now(), admin, Number(id)).first();
  if (!job) await missingOr409(env, Number(id), to === "used" ? "There is no draft to use" : "This draft is already closed");
  return json({ job: shape(job) });
};

async function resume({ env, admin }) {
  await setting(env, "outbound", { paused: false, at: now(), by: admin }, admin).run();
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/jobs$/, latestJob, true],
  ["POST", /^\/admin\/jobs$/, askJob, true],
  ["POST", /^\/admin\/jobs\/(\d+)\/use$/, decide("used", ["draft"]), true],
  ["POST", /^\/admin\/jobs\/(\d+)\/discard$/, decide("discarded", ["queued", "working", "draft"]), true],
  ["POST", /^\/admin\/outbound\/resume$/, resume, true],
];
