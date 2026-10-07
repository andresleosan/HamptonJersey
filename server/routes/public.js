import { json, fail, readJson, now } from "../http.js";
import { toPublic } from "../listing.js";
import { validateViewing, jerseyToday } from "../viewings.js";
import { verifyTurnstile } from "../turnstile.js";

export const groupBy = (rows, key) => rows.reduce((a, r) => ((a[r[key]] ||= []).push(r), a), {});

async function listPublic({ env }) {
  const { results: listings } = await env.DB.prepare(
    "SELECT * FROM listings WHERE published = 1 AND archived_at IS NULL ORDER BY id").all();
  const { results: media } = await env.DB.prepare(
    `SELECT m.* FROM media m JOIN listings l ON l.id = m.listing_id
     WHERE l.published = 1 AND l.archived_at IS NULL AND m.public = 1 ORDER BY m.position, m.id`).all();
  const by = groupBy(media, "listing_id");
  return json(listings.map(l => toPublic(l, by[l.id] || [])), 200, { "cache-control": "public, max-age=60" });
}

const config = ({ env }) => json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY }, 200, { "cache-control": "public, max-age=300" });

async function createViewing({ request, env }) {
  const body = await readJson(request);
  // Cheap checks first: the single-use Turnstile token is only spent on an otherwise valid request.
  const r = validateViewing(body, jerseyToday());
  if (r.errors) return json({ error: "Please check the highlighted fields.", fields: r.errors }, 400);
  const v = r.value;
  const listing = v.listing_id && await env.DB.prepare(
    "SELECT title FROM listings WHERE id = ? AND published = 1 AND archived_at IS NULL").bind(v.listing_id).first();
  if (v.listing_id && !listing) fail(400, "That property is no longer available. Choose another or send a general enquiry.");
  if (!(await verifyTurnstile(body.turnstile, env.TURNSTILE_SECRET, request.headers.get("cf-connecting-ip"), new URL(request.url).hostname)))
    fail(400, "The anti-spam check expired or failed. Please try again.");
  await env.DB.prepare(`INSERT INTO viewing_requests (listing_id, listing_ref, listing_title_snapshot, agent, kind, date, time,
      name, email, phone, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(v.listing_id, v.listing_id, listing ? listing.title : null, v.agent, v.kind, v.date, v.time, v.name, v.email, v.phone, now()).run();
  return json({ ok: true }, 201);
}

export default [
  ["GET", /^\/listings$/, listPublic],
  ["GET", /^\/config$/, config],
  ["POST", /^\/viewings$/, createViewing],
];
