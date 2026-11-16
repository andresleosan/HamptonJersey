// AGE-11 (migration 0115, AGE11_REVIEW_READY): one more human review of a private presentation before a person sends
// AGE-12's link. The review shows the snapshot the client would see: the homes the team chose for the link, in order,
// each with its approved match, the availability confirmation in force and its date, the conditions shown (operation
// and price or rent) and AGE-10's suitable photos, checked in storage now. A person approves that snapshot as a new
// version (its SHA-256 kept); a home not confirmed available, no longer approved or without a suitable photo blocks it.
// The link can only be recorded as sent (AGE-12's "I have sent it") while the snapshot rebuilt then has the latest
// approval's hash: any change since (a price, a photo, a confirmation) answers 409 until approved again. Once sent, the
// client's page shows only the approved snapshot, of the homes still approved, offered and confirmed available, with
// the approved photos AGE-10 still allows. Nothing here sends, books, changes a match or makes anything public; only the
// homes a person chose enter (never an internal alternative on its own). A link sent before this existed keeps
// AGE-12's view. Off, or before the migration, AGE-12 answers exactly as without it.
import { json, fail, readJson, now, sha256 } from "./http.js";
import { files } from "./private-media.js";
import { AVAILABLE } from "./match-pages.js";

export const reviewReady = env => env?.AGE11_REVIEW_READY === "1";
const missingTable = e => /no such table/.test(e?.message ?? "");
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const HOMES = `FROM presentation_options o JOIN matches m ON m.id = o.match_id JOIN listings l ON l.id = m.listing_id
  JOIN applicants a ON a.id = m.applicant_id WHERE o.grant_id = ?`;
// The date of the confirmation in force (the latest about the property or the operation it offers now).
const CONFIRMED_AT = `(SELECT MAX(c.confirmed_at) FROM availability_confirmations c WHERE c.listing_id = l.id
  AND (c.operation IS NULL OR c.operation = l.operation))`;
const LATEST = `SELECT version, snapshot, snapshot_hash, approved_by, approved_at FROM presentation_reviews WHERE grant_id = ?
  ORDER BY version DESC LIMIT 1`;
const BLOCK = { not_confirmed: "is not confirmed available now, or is no longer approved for this client",
  no_photo: "has no photo suitable for clients (AGE-10) that is still stored as checked" };

// The suitable files of a home that storage still holds as SPR-03 checked them, in JPEG, PNG or WebP.
async function stored(env, list) {
  if (!list.length) return [];
  const keys = new Map((await env.DB.prepare("SELECT id, blob_key FROM property_capture_assets WHERE id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(list.map(f => f.asset_id))).all()).results.map(r => [r.id, r.blob_key]));
  const heads = await Promise.all(list.map(f => keys.get(f.asset_id) && env.MEDIA.head(keys.get(f.asset_id))));
  return list.filter((f, i) => heads[i] && heads[i].etag === f.etag && heads[i].size === f.bytes && TYPES.includes(heads[i].httpMetadata?.contentType));
}

// The snapshot of a link as it stands now, its hash and what blocks approving it.
async function snapshotOf(env, grantId) {
  const rows = (await env.DB.prepare(`SELECT o.match_id, l.id AS listing_id, l.title, l.location, l.bedrooms, l.bathrooms, l.operation,
    l.sale_price, l.rent, l.rent_period, l.currency, l.summary, (${AVAILABLE}) AS available, ${CONFIRMED_AT} AS confirmed_at
    ${HOMES} ORDER BY o.position`).bind(grantId).all()).results;
  const homes = [], blockers = [];
  for (const { match_id, listing_id, available, confirmed_at, ...facts } of rows) {
    const suitable = available ? (await files(env, listing_id)).files.filter(f => f.state === "stored" && f.decision?.status === "private_approved") : [];
    const photos = (await stored(env, suitable)).map(f => ({ asset_id: f.asset_id, media_id: f.media_id, label: f.label,
      permission_version: f.decision.version, etag: f.etag, bytes: f.bytes }));
    homes.push({ match_id, listing_id, ...facts, availability_confirmed_at: available ? confirmed_at : null, photos });
    const code = !available ? "not_confirmed" : !photos.length ? "no_photo" : null;
    if (code) blockers.push({ match_id, listing_id, code, message: `${listing_id} ${BLOCK[code]}.` });
  }
  const snapshot = { grant_id: grantId, homes };
  return { snapshot, snapshot_hash: await sha256(JSON.stringify(snapshot)), blockers };
}

async function payload(env, g) {
  const [s, latest] = await Promise.all([snapshotOf(env, g.id), env.DB.prepare(LATEST).bind(g.id).first()]);
  return { enabled: true, grant: { id: g.id, sent_at: g.sent_at, revoked_at: g.revoked_at }, ...s,
    approval: latest && { version: latest.version, approved_by: latest.approved_by, approved_at: latest.approved_at },
    approved_current: latest?.snapshot_hash === s.snapshot_hash };
}
const grantOf = async (env, id) => (await env.DB.prepare("SELECT id, applicant_id, sent_at, revoked_at FROM presentation_grants WHERE id = ?")
  .bind(Number(id)).first()) ?? fail(404, "Link not found");

// GET: the review of one link (staff). AGE-12's staff() wrapper answers {enabled:false} while AGE-12 is off.
export async function reviewRoute({ env, params: [id] }) {
  if (!reviewReady(env)) return json({ enabled: false });
  try { return json(await payload(env, await grantOf(env, id))); }
  catch (e) { if (missingTable(e)) return json({ enabled: false }); throw e; }
}

// POST {snapshot_hash, version}: approve the snapshot the person saw (version: the approval they saw, 0 if none), on a
// link not sent or revoked. A changed snapshot, a blocker, an approval already in force or another person's approval
// first answers 409 and writes nothing.
export async function approveRoute({ request, env, admin, params: [id] }) {
  if (!reviewReady(env)) fail(404, "Not found");
  const b = (await readJson(request, 512)) ?? {};
  if (typeof b.snapshot_hash !== "string" || !/^[0-9a-f]{64}$/.test(b.snapshot_hash) || !Number.isSafeInteger(b.version) || b.version < 0)
    fail(400, "Reload the review");
  try {
    const g = await grantOf(env, id), p = await payload(env, g);
    if (g.sent_at || g.revoked_at) fail(409, "This link was already recorded as sent, or was revoked: its presentation can no longer be approved.");
    if (p.snapshot_hash !== b.snapshot_hash) fail(409, "This presentation changed since you opened it: reload the review (nothing was approved).");
    if (p.blockers.length) fail(409, `It cannot be approved: ${p.blockers.map(x => x.message).join(" ")}`);
    if (p.approved_current) fail(409, "This presentation is already approved as it stands.");
    const ts = now();
    const [inserted] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO presentation_reviews (grant_id, version, snapshot, snapshot_hash, approved_by, approved_at)
        SELECT ?, ? + 1, ?, ?, ?, ? WHERE (SELECT COALESCE(MAX(version), 0) FROM presentation_reviews WHERE grant_id = ?) = ?
          AND EXISTS (SELECT 1 FROM presentation_grants WHERE id = ? AND sent_at IS NULL AND revoked_at IS NULL)`)
        .bind(g.id, b.version, JSON.stringify(p.snapshot), p.snapshot_hash, admin, ts, g.id, b.version, g.id),
      env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data) SELECT ?, ?, 'applicant', ?, 'applicant.presentation_approved',
        json_object('version', 1, 'grant_id', ?, 'review_version', ? + 1, 'homes', ?) WHERE changes() = 1`)
        .bind(ts, admin, String(g.applicant_id), g.id, b.version, p.snapshot.homes.length),
    ]);
    if (!inserted.meta.changes) fail(409, "Someone else approved this presentation, or its link was sent or revoked: reload (nothing was approved).");
    return json(await payload(env, g));
  } catch (e) { if (missingTable(e)) fail(404, "Not found"); throw e; }
}

// Before AGE-12 records a link as sent: the hash its latest approval must still have, or a 409. null: no review
// applies (off, or before the migration), and AGE-12 records it as before.
export async function sendGate(env, grantId) {
  if (!reviewReady(env)) return null;
  let latest;
  try { latest = await env.DB.prepare(LATEST).bind(grantId).first(); } catch (e) { if (missingTable(e)) return null; throw e; }
  if (!latest) {
    await grantOf(env, grantId);
    fail(409, "Review and approve this presentation before you send it and record it as sent.");
  }
  const s = await snapshotOf(env, grantId);
  if (s.snapshot_hash !== latest.snapshot_hash || s.blockers.length)
    fail(409, "This presentation changed since it was approved: review and approve it again before you send it (it was not recorded as sent).");
  return s.snapshot_hash;
}
// The extra condition of AGE-12's UPDATE: the latest approval still has that hash when the link is recorded as sent.
export const APPROVED_SNAPSHOT = ` AND EXISTS (SELECT 1 FROM presentation_reviews r WHERE r.grant_id = presentation_grants.id AND r.snapshot_hash = ?
  AND r.version = (SELECT MAX(version) FROM presentation_reviews WHERE grant_id = presentation_grants.id))`;

// The approved snapshot a client's link shows and the homes of it still presentable now (approved, offered and
// confirmed available). null: no review applies (off, before the migration, or a link sent before the review existed).
export async function presented(env, grantId) {
  if (!reviewReady(env)) return null;
  let latest;
  try { latest = await env.DB.prepare(LATEST).bind(grantId).first(); } catch (e) { if (missingTable(e)) return null; throw e; }
  if (!latest) return null;
  const shown = (await env.DB.prepare(`SELECT o.match_id ${HOMES} AND ${AVAILABLE}`).bind(grantId).all()).results.map(r => r.match_id);
  return { homes: JSON.parse(latest.snapshot).homes, shown: new Set(shown) };
}
// A current suitable file is an approved one when it is the same photo and the same file (a later capture renumbers it).
const same = (x, f) => x.media_id === f.media_id && x.etag === f.etag && x.bytes === f.bytes;
export const inSnapshot = (p, listingId, f) => p.homes.some(h => h.listing_id === listingId && p.shown.has(h.match_id) && h.photos.some(x => same(x, f)));

// The client's options from the approved snapshot, in AGE-12's shape, with the confirmation date approved. A home no
// longer presentable shows nothing of itself; a photo AGE-10 no longer allows (or a changed file) is left out.
export async function snapshotOptions(env, grantId, p) {
  const answers = new Map((await env.DB.prepare("SELECT match_id, choice, answered_at FROM presentation_options WHERE grant_id = ?")
    .bind(grantId).all()).results.map(r => [r.match_id, r]));
  return Promise.all(p.homes.map(async ({ match_id, listing_id, photos, ...facts }) => {
    const { choice = null, answered_at = null } = answers.get(match_id) ?? {}, on = p.shown.has(match_id);
    const current = on ? (await files(env, listing_id)).files.filter(f => f.state === "stored" && f.decision?.status === "private_approved") : [];
    return { match_id, choice, answered_at, offered: on, listing: on ? { id: listing_id, ...facts } : null,
      photos: photos.flatMap(x => current.filter(f => same(x, f)).slice(0, 1).map(f => ({ id: f.asset_id, label: x.label }))) };
  }));
}

// The panel: the latest approval of each of this client's links. null: no review applies.
export async function approvals(env, applicantId) {
  if (!reviewReady(env)) return null;
  try {
    return new Map((await env.DB.prepare(`SELECT r.grant_id, r.version, r.approved_by, r.approved_at FROM presentation_reviews r
      JOIN presentation_grants g ON g.id = r.grant_id WHERE g.applicant_id = ?
        AND r.version = (SELECT MAX(version) FROM presentation_reviews WHERE grant_id = r.grant_id)`).bind(applicantId).all())
      .results.map(({ grant_id, ...a }) => [grant_id, a]));
  } catch (e) { if (missingTable(e)) return null; throw e; }
}
