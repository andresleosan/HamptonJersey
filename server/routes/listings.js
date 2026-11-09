import { json, fail, readJson, now } from "../http.js";
import { validateListing, checkPrice, idPrefix, nextId, ENUMS, TO_CONFIRM } from "../listing.js";
import { extractFeatures } from "../listing-features.js";
import { afterSave, recomputeForListing } from "../match-store.js";
import { interestSql, interestDates } from "../viewings.js";
import { listingBatch, derivedListingFields, listingClock } from "../listing-events.js";
import {checkMarketingEdit,transitionEditorialListing,recordRentalMarketingState} from '../listing-editorial.js';
import {readListingHistory} from '../listing-history.js';

export const ID = "(HE-[A-Z]\\d{3,})";
// The cover of listing l: the one chosen, else its first stored photo (served at /media/<id>?thumb).
export const COVER_ID = `COALESCE(l.cover_media_id, (SELECT cm.id FROM media cm WHERE cm.listing_id = l.id
  AND cm.kind = 'photo' AND cm.r2_key IS NOT NULL ORDER BY cm.position LIMIT 1))`;
// Whether listing l has a photo the website shows (without one, a published listing is not on the website).
export const HAS_PUBLIC_PHOTO = `EXISTS (SELECT 1 FROM media m WHERE m.listing_id = l.id AND m.kind = 'photo' AND m.public = 1
    AND m.origin <> 'external' AND m.r2_key IS NOT NULL)`;
const LIST_SQL = `SELECT l.id, l.title, l.use, l.country, l.location, l.availability, l.operation, l.sale_price, l.rent,
  l.rent_period, l.premium, l.currency, l.price_text, l.published, l.archived_at, l.updated_at, l.updated_by, l.featured_rank,
  l.parish, l.matchable, l.confirmed_at, l.bedrooms, l.review_requested_at, l.review_requested_by, (${TO_CONFIRM}) AS to_confirm, ${COVER_ID} AS cover_id,
  ${HAS_PUBLIC_PHOTO} AS has_public_photo,
  (SELECT COUNT(*) FROM matches mm WHERE mm.listing_id = l.id) AS matched, (${interestSql("l.id")}) AS interested
  FROM listings l`;

// to_confirm: ADM-04, as the list and the counts say it.
export async function loadListing(env, id) {
  const l = await env.DB.prepare(`SELECT l.*, (${TO_CONFIRM}) AS to_confirm FROM listings l WHERE l.id = ?`).bind(now(), id).first();
  if (!l) fail(404, "Listing not found");
  return { ...l, specs: JSON.parse(l.specs || "[]"), viewing_hours: l.viewing_hours == null ? null : JSON.parse(l.viewing_hours) };
}

// C10: the listing's active interest, as the website counts it (server/viewings.js).
const interestStatement = (env, id) => env.DB.prepare(interestSql("?")).bind(id, ...interestDates());

async function list({ request, env }) {
  const q = new URL(request.url).searchParams;
  // slim=1: just enough to name and choose a listing (the panel's New viewing), without the per-listing media lookups.
  if (q.get("slim") === "1") {
    const { results } = await env.DB.prepare(`SELECT id, title, published, archived_at FROM listings
      ORDER BY archived_at IS NOT NULL, published DESC, id`).all();
    return json({ listings: results });
  }
  const parish = q.get("parish") || null;
  if (parish && !ENUMS.parish.includes(parish)) fail(400, "Invalid parish");
  const { results } = await env.DB.prepare(`${LIST_SQL} ${parish ? "WHERE l.parish = ?" : ""} ORDER BY l.id`)
    .bind(now(), ...interestDates(), ...(parish ? [parish] : [])).all();
  return json({ listings: results });
}

async function detail({ env, params: [id] }) {
  const listing = await loadListing(env, id);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const [media, research, sources, facts, terms, issues, searches, matched, [interest], [queue]] = (await env.DB.batch([
    q("SELECT * FROM media WHERE listing_id = ? ORDER BY position, id", id),
    q("SELECT * FROM research_properties WHERE property_id = ?", id),
    q("SELECT * FROM research_sources WHERE property_id = ? ORDER BY source_id", id),
    q("SELECT * FROM research_facts WHERE property_id = ? ORDER BY field, fact_id", id),
    q("SELECT * FROM research_financial_terms WHERE property_id = ? ORDER BY term_id", id),
    q("SELECT * FROM research_issues WHERE property_ids LIKE ? ORDER BY severity, issue_id", `%${id}%`),
    q("SELECT * FROM research_search_log WHERE property_id = ? ORDER BY date, search_id", id),
    q(`SELECT m.id AS match_id, m.applicant_id, c.name, a.operation, a.stage, a.search_state, a.archived_at, m.status, m.score
       FROM matches m JOIN applicants a ON a.id = m.applicant_id JOIN contacts c ON c.id = a.contact_id
       WHERE m.listing_id = ?
       ORDER BY CASE m.status WHEN 'shortlisted' THEN 0 WHEN 'found' THEN 1 ELSE 2 END, m.score DESC, m.id`, id),
    interestStatement(env, id),
    q("SELECT id, status FROM drive_imports WHERE listing_id = ? AND status = 'review'", id),
  ])).map(r => r.results);
  const group = research[0]?.duplicate_group;
  const duplicates = group ? (await q("SELECT property_id FROM research_properties WHERE duplicate_group = ? AND property_id <> ? ORDER BY property_id", group, id).all())
    .results.map(r => r.property_id) : [];
  return json({ listing, media, research: research[0] ?? null, sources, facts, terms, issues, searches, duplicates,
    matched_applicants: matched, active_interest: interest.n, queue: queue ?? null });
}

const fieldErrors = errors => json({ error: "Please check the highlighted fields", fields: errors }, 400);

// The features read from a listing's text (B10), for the row as it will be saved (specs as JSON text). The parish read
// from it only fills an unknown one, and never one the request sets (null included): the team's parish wins (B3).
function withFeatures(row, patch, ts) {
  const { parish, ...features } = extractFeatures(row);
  return { ...patch, ...features, features_at: ts, ...(row.parish == null && !("parish" in patch) ? { parish } : {}) };
}

// A listing at its maximum lengths (description, summary, spec rows, multi-byte text) passes 32 KB.
const LISTING_BYTES = 256 * 1024;

const create = async ({ request, env, admin }) => createListing(env, admin, await readJson(request, LISTING_BYTES));
// Also Properties Queue's draft (PUB-21), which ties the new listing to its row on the server.
export async function createListing(env, admin, body, context = {}) {
  const r = validateListing(body);
  if (r.errors) return fieldErrors(r.errors);
  const priceErrors = checkPrice(r.value);
  Object.assign(priceErrors,checkMarketingEdit(null,r.value));
  if (Object.keys(priceErrors).length) return fieldErrors(priceErrors);
  for (let attempt = 1; ; attempt++) {
    // Never reuse an id that research rows or deleted listings still point at.
    const { results } = await env.DB.prepare(
      "SELECT id FROM listings UNION SELECT property_id FROM research_properties UNION SELECT id FROM deleted_listings").all();
    const id = nextId(results.map(x => x.id), idPrefix(r.value.use, r.value.country));
    const ts = now();
    // Hampton's own listings are offered to applicants unless the editor's switch turns that off (B9).
    const row = withFeatures(r.value, { matchable: 1, ...r.value, id, published: 0, created_at: ts, updated_at: ts,
      updated_by: admin }, ts);
    const cols = Object.keys(row); // whitelisted by validateListing, plus the features
    try {
      await listingBatch(env, id, { actor: admin, source: 'panel', ...context, action: 'created',
        derivedFields: derivedListingFields(row).filter(k => !(k in r.value)) }, [
        env.DB.prepare(`INSERT INTO listings (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
          .bind(...cols.map(c => row[c])),
      ]);
      await afterSave(recomputeForListing, env, id, admin);
      return json({ id }, 201);
    } catch (e) {
      // Another admin created a listing with the same id at the same moment: take the next one.
      if (attempt < 3 && /UNIQUE constraint failed: listings.id/i.test(String(e?.message))) continue;
      throw e;
    }
  }
}

async function update({ request, env, admin, params: [id] }) {
  const body = await readJson(request, LISTING_BYTES);
  if (typeof body?.updated_at !== "string") fail(400, "Missing updated_at: reload the listing");
  const r = validateListing(body, { partial: true });
  if (r.errors) return fieldErrors(r.errors);
  if (!Object.keys(r.value).length) fail(400, "Nothing to save");
  const stored = await loadListing(env, id);
  const merged = { ...stored, specs: JSON.stringify(stored.specs), ...r.value };
  const priceErrors = checkPrice(merged);
  Object.assign(priceErrors,checkMarketingEdit(stored,r.value));
  if (Object.keys(priceErrors).length) return fieldErrors(priceErrors);
  // The lock on updated_at also guarantees the features were read from the row this save replaces.
  const ts = now(), patch = withFeatures(merged, r.value, ts);
  // ADM-04 (T2): a new availability or price means the owner was spoken to. The editor sends every field on each save.
  if (["availability", "sale_price", "rent", "premium"].some(k => k in r.value && r.value[k] !== stored[k])) patch.confirmed_at = ts;
  const cols = Object.keys(patch);
  const [res] = await listingBatch(env, id, { actor: admin, source: 'panel', action: 'updated',
    derivedFields: derivedListingFields(patch).filter(k => !(k in r.value)) }, [env.DB.prepare(
    `UPDATE listings SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ${listingClock}, updated_by = ? WHERE id = ? AND updated_at = ?`)
    .bind(...cols.map(c => patch[c]), ts, admin, id, body.updated_at)]);
  if (!res.meta.changes) {
    await loadListing(env, id); // 404 if it no longer exists
    fail(409, "Someone else saved changes to this listing. Reload to see them (your changes were not saved).");
  }
  await afterSave(recomputeForListing, env, id, admin);
  return json({ listing: await loadListing(env, id) });
}

// The editor's Offers block (F3-C): how many offers are open, the sale in progress if any, and every offer, newest first.
async function offers({ env, params: [id] }) {
  const [[r], list] = (await env.DB.batch([
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM offers WHERE listing_id = l.id AND status IN ('pending', 'countered'))
      AS open, (SELECT id FROM sales WHERE listing_id = l.id AND status = 'in_progress') AS sale_id FROM listings l WHERE l.id = ?`).bind(id),
    env.DB.prepare(`SELECT o.id, o.applicant_id, c.name AS buyer_name, o.amount, o.counter_amount, o.status, o.note, o.created_at,
      o.updated_at FROM offers o JOIN applicants a ON a.id = o.applicant_id JOIN contacts c ON c.id = a.contact_id
      WHERE o.listing_id = ? ORDER BY o.created_at DESC, o.id DESC`).bind(id),
  ])).map(x => x.results);
  if (!r) fail(404, "Listing not found");
  return json({ open: r.open, sale: r.sale_id == null ? null : { id: r.sale_id, status: "in_progress" }, offers: list });
}

// Star for the home page's Featured section. Ranks stay 1..n in the order stars were given: a new star goes last,
// removing one moves the later ones up. It is not a content edit (updated_at untouched).
async function setFeatured({ request, env, admin, params: [id] }) {
  const on = (await readJson(request))?.featured;
  if (typeof on !== "boolean") fail(400, "Send featured: true or false");
  const l = await loadListing(env, id);
  if (on === (l.featured_rank != null)) return json({ ok: true });
  await listingBatch(env, id, { actor: admin, source: 'panel', action: 'featured_changed' }, on ? [
    env.DB.prepare("UPDATE listings SET featured_rank = (SELECT COALESCE(MAX(featured_rank), 0) + 1 FROM listings) WHERE id = ? AND featured_rank IS NULL").bind(id),
  ] : [
    env.DB.prepare("UPDATE listings SET featured_rank = NULL WHERE id = ?").bind(id),
    env.DB.prepare("UPDATE listings SET featured_rank = featured_rank - 1 WHERE featured_rank > ?").bind(l.featured_rank),
  ]);
  return json({ ok: true });
}

// fromQueue: Properties Queue's Approve and publish (PUB-21), the only way to publish a listing still in review (C8).
export async function setState({ request, env, admin, params: [id, action], fromQueue = false, related = {}, expectedAt }) {
  const l = await loadListing(env, id);
  const version=expectedAt ?? (request ? (await readJson(request))?.updated_at : l.updated_at);
  if(typeof version!=='string')fail(400,'Missing updated_at: reload the listing');
  if (action === "publish" && l.archived_at) fail(400, "Restore the listing before publishing it");
  if (action === "publish" && !fromQueue && await env.DB.prepare("SELECT 1 FROM drive_imports WHERE listing_id = ? AND status = 'review'")
    .bind(id).first()) fail(409, "Use Approve and publish in the queue");
  if (action === "archive" && l.archived_at) fail(400, "The listing is already archived");
  if (action === "restore" && !l.archived_at) fail(400, "The listing isn't archived");
  // V16: an open offer or a sale in progress keeps it out of the archive: checked first for a quick answer, and again
  // in the archive's own UPDATE (R9).
  const archive = action === "archive", busy = "Close its offers and sale first";
  const BUSY = `(EXISTS (SELECT 1 FROM offers WHERE listing_id = ? AND status IN ('pending', 'countered'))
    OR EXISTS (SELECT 1 FROM sales WHERE listing_id = ? AND status = 'in_progress'))`;
  if (archive && (await env.DB.prepare(`SELECT ${BUSY} AS busy`).bind(id, id).first()).busy) fail(409, busy);
  const ts = now();
  // Archived (sold, withdrawn) is no longer offered; restoring leaves the offer off, for the editor's switch (B9).
  // ADM-04 (T2): publishing confirms the listing is on the market.
  // PUB-22: published_at only moves when the listing was hidden (the CASE reads the row before this UPDATE).
  const patch = { publish: { published: 1, confirmed_at: ts, published_at: ts }, unpublish: { published: 0 }, archive: { published: 0, archived_at: ts, matchable: 0 },
    restore: { published: 0, archived_at: null } }[action];
  Object.assign(patch,{review_requested_at:null,review_requested_by:null});
  const cols = Object.keys(patch);
  const set = c => (c === "published_at" ? "published_at = CASE WHEN published = 0 THEN ? ELSE published_at END" : `${c} = ?`);
  // Another request may archive/restore after loadListing. Repeat that eligibility in the write.
  const stateGuard = action === 'restore' ? ' AND archived_at IS NOT NULL'
    : ['archive', 'publish'].includes(action) ? ' AND archived_at IS NULL' : '';
  const [res] = await listingBatch(env, id, { actor: admin, source: fromQueue ? 'queue' : 'panel', related,
    action: { publish: 'published', unpublish: 'unpublished', archive: 'archived', restore: 'restored' }[action] }, [
    env.DB.prepare(`UPDATE listings SET ${cols.map(set).join(", ")}, updated_at = ${listingClock}, updated_by = ?
      WHERE id = ? AND updated_at=?${stateGuard}${archive ? ` AND NOT ${BUSY}` : ""}`).bind(...cols.map(c => patch[c]), ts, admin, id, version, ...(archive ? [id, id] : [])),
  ]);
  if (!res.meta.changes) {
    const current = await loadListing(env, id);
    if (archive && !current.archived_at) fail(409, busy);
    fail(409, 'The listing state changed. Reload before trying again.');
  }
  // Publishing also counts: being on the website adds to the score.
  await afterSave(recomputeForListing, env, id, admin);
  return json({ listing: await loadListing(env, id) });
}

// ADM-04: Still available, after a call to the owner. Like the star, not a content edit: updated_at is
// left alone, so an open editor with unsaved changes can still save them (T8). Any listing may be confirmed (T11).
async function confirm({ env, admin, params: [id] }) {
  const ts = now();
  const [res] = await listingBatch(env, id, { actor: admin, source: 'panel', action: 'confirmed' }, [
    env.DB.prepare("UPDATE listings SET confirmed_at = ? WHERE id = ?").bind(ts, id),
  ]);
  if (!res.meta.changes)
    fail(404, "Listing not found");
  return json({ confirmed_at: ts });
}

async function remove({ request, env, admin, params: [id] }) {
  const l = await loadListing(env, id);
  if (!l.archived_at) fail(400, "Only archived listings can be deleted");
  // V14, V16: a listing with a sale, in any state, is kept (the sales foreign key is the last barrier); its offers go with it.
  if (await env.DB.prepare("SELECT 1 FROM sales WHERE listing_id = ? LIMIT 1").bind(id).first())
    fail(409, "Kept for 5 years: it has a sale");
  if ((await readJson(request))?.confirm !== id) fail(400, `Type ${id} to confirm deletion`);
  await deleteListing(env, id, admin);
  return json({ ok: true });
}

// Also Properties Queue's Discard (PUB-21, C7), for a draft that was never published.
export async function deleteListing(env, id, admin, context = {}) {
  const { results } = await env.DB.prepare("SELECT r2_key, thumb_key FROM media WHERE listing_id = ? AND origin = 'upload'").bind(id).all();
  await listingBatch(env, id, { actor: admin, source: 'panel', ...context, action: 'deleted' }, [
    env.DB.prepare("DELETE FROM media WHERE listing_id = ?").bind(id),
    env.DB.prepare("DELETE FROM listings WHERE id = ?").bind(id),
    env.DB.prepare("INSERT INTO deleted_listings (id, deleted_at, deleted_by) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(id, now(), admin),
  ]);
  // Imported files stay in R2 (they also live in /root/Hampton_Database); research rows are kept.
  const keys = results.flatMap(m => [m.r2_key, m.thumb_key]).filter(Boolean);
  if (keys.length) await env.MEDIA.delete(keys);
}

export default [
  ['GET',new RegExp(`^/admin/listings/${ID}/history$`),async ({request,env,params:[id]})=>
    json(await readListingHistory(env,{id,cursor:new URL(request.url).searchParams.get('cursor')})),true],
  ["GET", /^\/admin\/listings$/, list, true],
  ["POST", /^\/admin\/listings$/, create, true],
  ["GET", new RegExp(`^/admin/listings/${ID}$`), detail, true],
  ["GET", new RegExp(`^/admin/listings/${ID}/offers$`), offers, true],
  ["PUT", new RegExp(`^/admin/listings/${ID}$`), update, true],
  ['POST',new RegExp(`^/admin/listings/${ID}/review$`),async ({request,env,admin,params:[id]})=>{
    const result=await transitionEditorialListing(env,{id,command:await readJson(request),actor:admin});
    return json({...result,listing:await loadListing(env,id)});
  },true],
  ['POST',new RegExp(`^/admin/listings/${ID}/rental-marketing$`),async ({request,env,admin,params:[id]})=>{
    const result=await recordRentalMarketingState(env,{id,command:await readJson(request),actor:admin});
    await afterSave(recomputeForListing,env,id,admin);
    return json({...result,listing:await loadListing(env,id)});
  },true],
  ["DELETE", new RegExp(`^/admin/listings/${ID}$`), remove, true],
  ["POST", new RegExp(`^/admin/listings/${ID}/(publish|unpublish|archive|restore)$`), setState, true],
  ["POST", new RegExp(`^/admin/listings/${ID}/confirm$`), confirm, true],
  ["PUT", new RegExp(`^/admin/listings/${ID}/featured$`), setFeatured, true],
];
