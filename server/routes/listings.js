import { ECONOMICS_GUARD_SQL, ECONOMICS_GUARD_ARGS, hasEconomicInput, structuredEconomicsReady,
  parseEconomicJson, checkEconomicCurrencyReview } from '../listing-economics.js';
import { isValidInteriorArea } from '../listing-price-area.js';
import { PRICE_SQL } from "../listing-pricing.js";
import { json, fail, readJson, now } from "../http.js";
import { validateListing, checkPrice, idPrefix, nextId, ENUMS, TO_CONFIRM } from "../listing.js";
import { extractFeatures } from "../listing-features.js";
import { afterSave, recomputeForListing } from "../match-store.js";
import { interestSql, interestDates } from "../viewings.js";
import { listingBatch, derivedListingFields, listingClock } from "../listing-events.js";
import {checkMarketingEdit,transitionEditorialListing,recordRentalMarketingState} from '../listing-editorial.js';
import {readListingHistory,validateListingHistoryRows} from '../listing-history.js';
import { changedListingDetails, listingDetailsUpdateStatement, publicAddressReviewStatement, readListingDetails, validateListingDetails } from '../listing-details.js';
import { buildPublicAddressReview } from '../public-address.js';
import { publicationReadiness } from "../publication-policy.js";
import { checkPhysical } from '../listing-physical.js';
import { recordListingWithdrawal,correctListingWithdrawal,readListingTraceability } from '../listing-traceability.js';
import { validateListingContent,readListingContent,listingContentUpdateStatement } from '../listing-content.js';
import { researchDuplicateReviewStatement, researchDuplicateReview } from '../research-duplicate-review.js';

export const ID = "(HE-[A-Z]\\d{3,})";
// The cover of listing l: the one chosen, else its first stored photo (served at /media/<id>?thumb).
export const COVER_ID = `COALESCE(l.cover_media_id, (SELECT cm.id FROM media cm WHERE cm.listing_id = l.id
  AND cm.kind = 'photo' AND cm.r2_key IS NOT NULL ORDER BY cm.position LIMIT 1))`;
// Whether listing l has a photo the website shows (without one, a published listing is not on the website).
export const HAS_PUBLIC_PHOTO = `EXISTS (SELECT 1 FROM media m WHERE m.listing_id = l.id AND m.kind = 'photo' AND m.public = 1
    AND m.origin <> 'external' AND m.r2_key IS NOT NULL AND m.r2_key <> '')`;
const LIST_SQL = `SELECT l.id, l.title, l.use, l.country, l.location, l.availability, l.operation, l.sale_price, l.rent,
  l.rent_period, l.premium, l.tenure_type, l.tenure, l.currency, l.price_text, l.published, l.archived_at, l.updated_at, l.updated_by, l.featured_rank,
  l.parish, l.matchable, l.confirmed_at, l.bedrooms, l.bathrooms, l.available_on, l.review_requested_at, l.review_requested_by, (${TO_CONFIRM}) AS to_confirm, ${COVER_ID} AS cover_id,
  ${HAS_PUBLIC_PHOTO} AS has_public_photo,
  (SELECT COUNT(*) FROM matches mm WHERE mm.listing_id = l.id) AS matched, (${interestSql("l.id")}) AS interested
  FROM listings l`;

// to_confirm: ADM-04, as the list and the counts say it.
export async function loadListing(env, id) {
  const l = await env.DB.prepare(`SELECT l.*, (${TO_CONFIRM}) AS to_confirm FROM listings l WHERE l.id = ?`).bind(now(), id).first();
  if (!l) fail(404, "Listing not found");
  return { ...l, specs: JSON.parse(l.specs || "[]"), viewing_hours: l.viewing_hours == null ? null : JSON.parse(l.viewing_hours),
    heating_types: l.heating_types == null ? null : JSON.parse(l.heating_types),
    amenities: l.amenities == null ? null : JSON.parse(l.amenities), feature_overrides: JSON.parse(l.feature_overrides) };
}

// C10: the listing's active interest, as the website counts it (server/viewings.js).
const interestStatement = (env, id) => env.DB.prepare(interestSql("?")).bind(id, ...interestDates());

async function list({ request, env }) {
  const q = new URL(request.url).searchParams;
  // slim=1: just enough to name and choose a listing (the panel's New viewing), without the per-listing media lookups.
  if (q.get("slim") === "1") {
    const { results } = await env.DB.prepare(`SELECT id, title, published, archived_at FROM listings
      ORDER BY archived_at IS NOT NULL, published DESC, id`).all();
    return json({ listings: results, ...(env.PUB09_WITHDRAWALS_READY === '1' ? { withdrawal_tracking: true } : {}) });
  }
  const parish = q.get("parish") || null;
  if (parish && !ENUMS.parish.includes(parish)) fail(400, "Invalid parish");
  const { results } = await env.DB.prepare(`${LIST_SQL} ${parish ? "WHERE l.parish = ?" : ""} ORDER BY l.id`)
    .bind(now(), ...interestDates(), ...(parish ? [parish] : [])).all();
  return json({ listings: results, ...(env.PUB09_WITHDRAWALS_READY === '1' ? { withdrawal_tracking: true } : {}) });
}

async function detail({ env, admin, params: [id] }) {
  const listing = await loadListing(env, id);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const [media, research, sources, facts, terms, issues, searches, matched, [interest], [queue], [details], [authorized], [stillExists], candidateRows] = (await env.DB.batch([
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
    q(`SELECT d.building_name_or_number,d.postcode,l.property_condition,d.developer_name,d.public_address_snapshot,
        d.public_address_snapshot_hash,d.public_address_evidence_ref,d.public_address_reviewed_by,d.public_address_reviewed_at FROM listings l
      LEFT JOIN listing_details d ON d.listing_id=l.id WHERE l.id=?`, id),
    q('SELECT 1 AS authorized FROM admins WHERE email=?',admin),
    q('SELECT 1 AS present FROM listings WHERE id=?',id),
    researchDuplicateReviewStatement(env,id,admin),
  ])).map(r => r.results);
  if (!authorized) fail(401, 'Please sign in to continue');
  if (!stillExists) fail(404, 'Listing not found');
  const duplicateReview = researchDuplicateReview(candidateRows);
  const duplicates = duplicateReview.candidates.map(candidate => candidate.listing_id);
  const content=env.PUB08_CONTENT_READY === '1' ? await readListingContent(env,id) : null;
  return json({ listing, structured_economics: await structuredEconomicsReady(env),
    ...(env.PUB09_WITHDRAWALS_READY === '1' ? { withdrawal_tracking: true } : {}),
    ...(content ? {content_tracking:true,content} : {}), details: Object.fromEntries(['building_name_or_number','postcode','property_condition','developer_name',
      'public_address_snapshot','public_address_snapshot_hash','public_address_evidence_ref','public_address_reviewed_by','public_address_reviewed_at']
      .map(key => [key, details?.[key] ?? null])),
    media, research: research[0] ?? null, sources, facts, terms, issues, searches, duplicates, duplicate_review: duplicateReview,
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

const create = async ({ request, env, admin }) => createListing(env, admin, await readJson(request, LISTING_BYTES, parseEconomicJson));
// Also Properties Queue's draft (PUB-21), which ties the new listing to its row on the server.
export async function createListing(env, admin, body, context = {}) {
  if (body && Object.hasOwn(body,'content')) return fieldErrors({content:'Save content after creating the listing'});
  const economicInput = hasEconomicInput(body);
  if (economicInput && context.source === 'queue') return fieldErrors({ structured_costs: 'Add staff-only costs in the listing editor' });
  if (economicInput && !(await structuredEconomicsReady(env))) fail(503, 'Structured costs are unavailable. Reload and try again.');
  const r = validateListing(body, { structuredEconomics: economicInput });
  if (r.errors) return fieldErrors(r.errors);
  if (context.source === 'queue' && r.value.feature_overrides && r.value.feature_overrides !== '{}')
    return fieldErrors({ feature_overrides: 'Review manual facts in the listing editor' });
  const priceErrors = checkPrice(r.value);
  Object.assign(priceErrors, checkPhysical(r.value));
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
      const insertValues = cols.map(() => "?").join(", ");
      const insertSql = economicInput
        ? `INSERT INTO listings (${cols.join(", ")}) SELECT ${insertValues} WHERE ${ECONOMICS_GUARD_SQL}`
        : `INSERT INTO listings (${cols.join(", ")}) VALUES (${insertValues})`;
      const [inserted] = await listingBatch(env, id, { actor: admin, source: 'panel', ...context, action: 'created',
        derivedFields: derivedListingFields(row).filter(k => !(k in r.value)) }, [
        env.DB.prepare(insertSql).bind(...cols.map(c => row[c]), ...(economicInput ? ECONOMICS_GUARD_ARGS : [])),
      ]);
      if (!inserted.meta.changes) fail(503, 'Structured costs are unavailable. Reload and try again.');
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
  const body = await readJson(request, LISTING_BYTES, parseEconomicJson);
  if (typeof body?.updated_at !== "string") fail(400, "Missing updated_at: reload the listing");
  if (Object.hasOwn(body, 'address_publication'))
    return fieldErrors({ address_publication: 'Use the reviewed public snapshot step to publish an exact address' });
  const economicInput = hasEconomicInput(body);
  if (economicInput && !(await structuredEconomicsReady(env))) fail(503, 'Structured costs are unavailable. Reload and try again.');
  const hasContent = Object.hasOwn(body,'content');
  if (hasContent && env.PUB08_CONTENT_READY !== '1') fail(404,'Not found');
  const stored = await loadListing(env, id);
  // Keep an unchanged legacy value without permitting a new invalid value.
  const validationBody = { ...body };
  if (typeof validationBody.interior_area_sqft === 'number' &&
      validationBody.interior_area_sqft === stored.interior_area_sqft &&
      !isValidInteriorArea(validationBody.interior_area_sqft)) delete validationBody.interior_area_sqft;
  const r = validateListing(validationBody, { partial: true, structuredEconomics: economicInput });
  if (r.errors) return fieldErrors(r.errors);
  const hasDetails = Object.hasOwn(body, 'details');
  if (!Object.keys(r.value).length && !hasDetails && !hasContent) fail(400, "Nothing to save");
  const storedDetails = await readListingDetails(env, id);
  let beforeContent=null,nextContent=null,contentFields=[],actorAt=null;
  if (hasContent) {
    if (stored.updated_at !== body.updated_at) fail(409,'Someone else saved changes to this listing. Reload to see them (your changes were not saved).');
    const valid=validateListingContent(body.content);
    if (valid.errors) return fieldErrors(valid.errors);
    const actor=await env.DB.prepare('SELECT added_at FROM admins WHERE email=?').bind(admin).first();
    if (!actor) fail(401,'Please sign in to continue');
    actorAt=actor.added_at;
    beforeContent=await readListingContent(env,id);
    nextContent={...beforeContent,...valid.value};
    if (JSON.stringify(beforeContent.tags)!==JSON.stringify(nextContent.tags)) contentFields.push('content_tags');
    if (beforeContent.video_url!==nextContent.video_url) contentFields.push('video_url');
  }
  const nextCountry = Object.hasOwn(r.value, 'country') ? r.value.country : stored.country;
  let candidate = storedDetails;
  let detailValues = {};
  if (hasDetails) {
    const validated = validateListingDetails(body.details, { partial: true, country: nextCountry || null });
    if (validated.errors) return fieldErrors(validated.errors);
    candidate = { ...storedDetails, ...validated.value };
    if (Object.hasOwn(validated.value, 'developer_name') && candidate.property_condition !== 'new_build'
      && storedDetails.developer_name == null && candidate.developer_name != null)
      return fieldErrors({ developer_name: 'Only applies to new builds' });
    detailValues = changedListingDetails(storedDetails, candidate);
  }
  // A retained foreign code must also fit Jersey format when a listing changes to Jersey.
  if (nextCountry === 'Jersey' && stored.country !== 'Jersey' && candidate.postcode != null) {
    const postcode = validateListingDetails({ postcode: candidate.postcode }, { country: nextCountry });
    if (postcode.errors) return fieldErrors(postcode.errors);
  }
  if (!Object.keys(r.value).length && !Object.keys(detailValues).length && !contentFields.length)
    return json({ listing: stored, details: storedDetails, ...(hasContent ? {content:beforeContent,content_tracking:true} : {}) });
  const changingCurrencyWithCosts = Object.hasOwn(r.value, 'currency') && r.value.currency !== stored.currency &&
    ['rental_deposit_amount', 'parish_rates_amount', 'service_charge_amount'].some(field => stored[field] != null);
  if (changingCurrencyWithCosts && !economicInput && !(await structuredEconomicsReady(env)))
    fail(503, 'Structured costs are unavailable. Reload and try again.');
  const currencyReviewError = checkEconomicCurrencyReview(stored, body);
  if (currencyReviewError) return fieldErrors({ currency: currencyReviewError });
  const guardEconomics = economicInput || changingCurrencyWithCosts;
  const merged = { ...stored, specs: JSON.stringify(stored.specs), ...r.value };
  const priceErrors = checkPrice(merged);
  // The editor submits every field. Permit an unchanged legacy rent without a period on unrelated edits,
  // but require a consistent pair when the rent, period, or operation actually changes.
  const rentChanged = ['rent', 'rent_period', 'operation'].some(k =>
    Object.hasOwn(r.value, k) && r.value[k] !== stored[k]);
  if (!rentChanged && stored.rent != null && !stored.rent_period) delete priceErrors.rent_period;
  Object.assign(priceErrors, checkPhysical(merged));
  Object.assign(priceErrors,checkMarketingEdit(stored,r.value));
  if (Object.keys(priceErrors).length) return fieldErrors(priceErrors);
  // The lock on updated_at also guarantees the features were read from the row this save replaces.
  const ts = now(), patch = Object.keys(r.value).length ? withFeatures(merged, r.value, ts) : {};
  if (Object.hasOwn(detailValues, 'property_condition')) patch.property_condition = detailValues.property_condition;
  // ADM-04 (T2): a new availability or price means the owner was spoken to. The editor sends every field on each save.
  if (["availability", "sale_price", "rent", "premium"].some(k => k in r.value && r.value[k] !== stored[k])) patch.confirmed_at = ts;
  const cols = Object.keys(patch);
  const detailStatement = listingDetailsUpdateStatement(env, id, detailValues);
  const contentStatement = contentFields.length ? listingContentUpdateStatement(env,id,nextContent) : null;
  const [res] = await listingBatch(env, id, { actor: admin, source: 'panel', action: 'updated',
    derivedFields: derivedListingFields(patch).filter(k => !(k in r.value)),
    extraFields: [...Object.keys(detailValues).filter(k => k !== 'property_condition'),...contentFields] }, [env.DB.prepare(
    `UPDATE listings SET ${[...cols.map(c => `${c} = ?`), `updated_at = ${listingClock}`, 'updated_by = ?'].join(", ")} WHERE id = ? AND updated_at = ?${hasContent ? ' AND EXISTS(SELECT 1 FROM admins WHERE email=? AND added_at=?)' : ''}${guardEconomics ? ` AND ${ECONOMICS_GUARD_SQL}` : ''}`)
    .bind(...cols.map(c => patch[c]), ts, admin, id, body.updated_at,...(hasContent ? [admin,actorAt] : []),
      ...(guardEconomics ? ECONOMICS_GUARD_ARGS : [])),
    ...(contentStatement ? [contentStatement] : []), ...(detailStatement ? [detailStatement] : [])]);
  if (!res.meta.changes) {
    if (guardEconomics && !(await structuredEconomicsReady(env))) fail(503, 'Structured costs are unavailable. Reload and try again.');
    await loadListing(env, id); // 404 if it no longer exists
    fail(409, "Someone else saved changes to this listing. Reload to see them (your changes were not saved).");
  }
  if (Object.keys(r.value).length) await afterSave(recomputeForListing, env, id, admin);
  return json({ listing: await loadListing(env, id), details: await readListingDetails(env, id),
    ...(hasContent ? {content:await readListingContent(env,id),content_tracking:true} : {}) });
}

async function loadPublicAddressReview(env, id) {
  const listing = await loadListing(env, id), details = await readListingDetails(env, id);
  const media = (await env.DB.prepare('SELECT * FROM media WHERE listing_id=? ORDER BY position,id').bind(id).all()).results;
  const folder = listing.drive_folder_id == null ? null : await env.DB.prepare(`SELECT folder_name FROM drive_imports
    WHERE folder_id=? ORDER BY id DESC LIMIT 1`).bind(listing.drive_folder_id).first();
  const publicListing=env.PUB08_CONTENT_READY === '1' ? {...listing,_pub08_content:await readListingContent(env,id)} : listing;
  return { listing:publicListing, details, media, folderName: folder?.folder_name ?? null };
}

async function addressReviewPreview({ env, params: [id] }) {
  const { listing, details, media, folderName } = await loadPublicAddressReview(env, id);
  if (listing.published !== 1 || listing.archived_at) fail(409, 'Publish this listing before reviewing an exact address');
  const review = await buildPublicAddressReview(listing, details, media, folderName, env.SITE_URL || 'https://hampton.test');
  if (Object.keys(review.errors).length) return fieldErrors(review.errors);
  if (!review.preview.listing.image) return fieldErrors({ public_photo: 'Add a public photo before reviewing an exact address' });
  const currentReviewValid = details.public_address_snapshot === review.address
    && details.public_address_snapshot_hash === review.public_snapshot_hash;
  return json({ expected_at: listing.updated_at, public_snapshot_hash: review.public_snapshot_hash, preview: review.preview,
    existing_review: details.public_address_snapshot ? { snapshot: details.public_address_snapshot,
      valid_for_current_content: currentReviewValid, evidence_ref: details.public_address_evidence_ref,
      reviewed_by: details.public_address_reviewed_by, reviewed_at: details.public_address_reviewed_at } : null },
  200, { 'cache-control': 'private, no-store' });
}

async function reviewPublicAddress({ request, env, admin, params: [id] }) {
  const body = await readJson(request, 32768);
  if (body?.action === 'revoke') {
    if (typeof body.expected_at !== 'string') fail(400, 'Send expected_at from the current preview');
    const current = await loadListing(env, id), details = await readListingDetails(env, id);
    if (current.updated_at !== body.expected_at) fail(409, 'The listing changed. Reload and review the current content.');
    if (!details.public_address_snapshot) return json({ listing: current, details });
    const at = now();
    const [res] = await listingBatch(env, id, { actor: admin, source: 'panel', action: 'updated',
      extraFields: ['public_address_publication'] }, [
      env.DB.prepare(`UPDATE listings SET updated_at=${listingClock},updated_by=? WHERE id=? AND updated_at=?`)
        .bind(at, admin, id, body.expected_at),
      publicAddressReviewStatement(env, id),
    ]);
    if (!res.meta.changes) fail(409, 'The listing changed. Reload before removing its public address.');
    return json({ listing: await loadListing(env, id), details: await readListingDetails(env, id) }, 200,
      { 'cache-control': 'private, no-store' });
  }
  if (body?.action !== undefined && body.action !== 'authorize')
    return fieldErrors({ action: 'Choose authorize or revoke' });
  if (typeof body?.expected_at !== 'string' || !/^[a-f0-9]{64}$/.test(body?.public_snapshot_hash ?? ''))
    return fieldErrors({ public_snapshot_hash: 'Review the current public preview before authorizing it' });
  if (body.address_publication_authorized !== true)
    return fieldErrors({ address_publication_authorized: 'Confirm the owner agreed and you reviewed the public preview' });
  const evidenceRef = typeof body.evidence_ref === 'string' ? body.evidence_ref.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(evidenceRef))
    return fieldErrors({ evidence_ref: 'Enter a reference ID only, without names or contact details' });
  const { listing, details, media, folderName } = await loadPublicAddressReview(env, id);
  if (listing.updated_at !== body.expected_at) fail(409, 'The listing changed. Review the current public content again.');
  if (listing.published !== 1 || listing.archived_at) fail(409, 'Publish this listing before reviewing an exact address');
  const review = await buildPublicAddressReview(listing, details, media, folderName, env.SITE_URL || 'https://hampton.test');
  if (Object.keys(review.errors).length) return fieldErrors(review.errors);
  if (!review.preview.listing.image) return fieldErrors({ public_photo: 'Add a public photo before reviewing an exact address' });
  if (review.public_snapshot_hash !== body.public_snapshot_hash)
    fail(409, 'The public content changed. Review the current preview again.');
  const at = now();
  const [res] = await listingBatch(env, id, { actor: admin, source: 'panel', action: 'updated',
    extraFields: ['public_address_publication'] }, [
    env.DB.prepare(`UPDATE listings SET updated_at=${listingClock},updated_by=?
      WHERE id=? AND updated_at=? AND published=1 AND archived_at IS NULL`).bind(at, admin, id, body.expected_at),
    publicAddressReviewStatement(env, id, { snapshot: review.address, hash: review.public_snapshot_hash,
      evidenceRef, actor: admin, at }),
  ]);
  if (!res.meta.changes) fail(409, 'The listing changed. Review the current public content again.');
  return json({ listing: await loadListing(env, id), details: await readListingDetails(env, id) }, 200,
    { 'cache-control': 'private, no-store' });
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

// The public listing policy is evaluated from saved data and rechecked in the write.
async function publicationMissing(env, listing) {
  const photo = await env.DB.prepare(`SELECT ${HAS_PUBLIC_PHOTO} AS eligible FROM listings l WHERE l.id = ?`).bind(listing.id).first();
  return publicationReadiness(listing, photo?.eligible ? 1 : 0).missing;
}
function failPublication(missing) {
  const labels = {title: 'a title', operation: 'a valid operation', public_photo: 'a public photo'};
  fail(400, `Add ${missing.map(k => labels[k]).join(', ')} before publishing.`);
}

// fromQueue: Properties Queue's Approve and publish (PUB-21), the only way to publish a listing still in review (C8).
export async function setState({ request, env, admin, params: [id, action], fromQueue = false, related = {}, expectedAt }) {
  if (action === 'unpublish' && request && env.PUB09_WITHDRAWALS_READY === '1') {
    const body = await readJson(request);
    const result = await recordListingWithdrawal(env, { listing_id:id, expected_at:body?.updated_at,
      reason_code:body?.reason_code, note:body?.note, operation_id:body?.operation_id }, admin);
    if (!result.replayed) await afterSave(recomputeForListing, env, id, admin);
    return json({ listing:await loadListing(env,id), details:await readListingDetails(env,id), ...result });
  }
  const l = await loadListing(env, id);
  const version=expectedAt ?? (request ? (await readJson(request))?.updated_at : l.updated_at);
  if(typeof version!=='string')fail(400,'Missing updated_at: reload the listing');
  if (l.updated_at !== version) fail(409, 'The listing state changed. Reload before trying again.');
  if (action === "publish" && l.archived_at) fail(400, "Restore the listing before publishing it");
  if (action === "publish" && !fromQueue && await env.DB.prepare("SELECT 1 FROM drive_imports WHERE listing_id = ? AND status = 'review'")
    .bind(id).first()) fail(409, "Use Approve and publish in the queue");
  if (action === "publish") {
    const missing = await publicationMissing(env, l);
    if (missing.length) failPublication(missing);
  }
  if (action === "archive" && l.archived_at) fail(400, "The listing is already archived");
  if (action === "restore" && !l.archived_at) fail(400, "The listing isn't archived");
  // V16: an open offer or a sale in progress keeps it out of the archive: checked first for a quick answer, and again
  // in the archive's own UPDATE (R9).
  const archive = action === "archive", busy = "Close its offers and sale first";
  const BUSY = `(EXISTS (SELECT 1 FROM offers WHERE listing_id = ? AND status IN ('pending', 'countered'))
    OR EXISTS (SELECT 1 FROM sales WHERE listing_id = ? AND status = 'in_progress'))`;
  if (archive && (await env.DB.prepare(`SELECT ${BUSY} AS busy`).bind(id, id).first()).busy) fail(409, busy);
  const ts = now();
  const clearPublicAddressSnapshot = ['unpublish', 'archive'].includes(action)
    && !!(await readListingDetails(env, id)).public_address_snapshot;
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
  const publishGuard = action === 'publish' ? ` AND trim(COALESCE(title, '')) <> ''
    AND operation IN ('sale','rent','business') AND ${HAS_PUBLIC_PHOTO.replace('l.id', 'listings.id')}` : '';
  const queueId = fromQueue ? related.import_id : null;
  if (fromQueue && (!Number.isSafeInteger(queueId) || queueId <= 0)) fail(400, 'Invalid queue item');
  const queueGuard = action === 'publish' && fromQueue ? ` AND EXISTS (SELECT 1 FROM drive_imports q
      WHERE q.id = ? AND q.listing_id = listings.id AND q.status = 'review') AND trim(COALESCE(parish,'')) <> ''
    AND trim(COALESCE(description,'')) <> '' AND (trim(COALESCE(price_text,'')) <> ''
      OR ${PRICE_SQL} IS NOT NULL)`
    : action === 'publish' ? " AND NOT EXISTS (SELECT 1 FROM drive_imports q WHERE q.listing_id = listings.id AND q.status = 'review')" : '';
  const statements = [env.DB.prepare(`UPDATE listings SET ${cols.map(set).join(", ")}, updated_at = ${listingClock}, updated_by = ?
      WHERE id = ? AND updated_at=?${stateGuard}${archive ? ` AND NOT ${BUSY}` : ""}${publishGuard}${queueGuard}`).bind(...cols.map(c => patch[c]), ts, admin, id, version, ...(archive ? [id, id] : []), ...(fromQueue && action === 'publish' ? [queueId] : []))];
  if (fromQueue && action === 'publish') statements.push(env.DB.prepare(`UPDATE drive_imports SET status = 'published', decided_at = ?, decided_by = ?
    WHERE id = ? AND status = 'review' AND changes() > 0`).bind(ts, admin, queueId));
  if (clearPublicAddressSnapshot) statements.push(publicAddressReviewStatement(env, id));
  const [res] = await listingBatch(env, id, { actor: admin, source: fromQueue ? 'queue' : 'panel', related,
    extraFields: clearPublicAddressSnapshot ? ['public_address_publication'] : [],
    action: { publish: 'published', unpublish: 'unpublished', archive: 'archived', restore: 'restored' }[action] }, statements);
  if (!res.meta.changes) {
    const current = await loadListing(env, id);
    if (archive && !current.archived_at) fail(409, busy);
    if (action === 'publish' && current.updated_at === version) {
      const missing = await publicationMissing(env, current);
      if (missing.length) failPublication(missing);
    }
    fail(409, 'The listing state changed. Reload before trying again.');
  }
  // Publishing also counts: being on the website adds to the score.
  await afterSave(recomputeForListing, env, id, admin);
  return json({ listing: await loadListing(env, id), details: await readListingDetails(env, id) });
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
  const queueId = context.source === 'queue' ? context.related?.import_id : null;
  const queueGuard = queueId ? [
    env.DB.prepare(`UPDATE drive_imports SET status = 'discarded', decided_at = ?, decided_by = ?
      WHERE id = ? AND listing_id = ? AND status IN ('queued','working','ready','review')
      AND EXISTS (SELECT 1 FROM listings l WHERE l.id = ? AND l.published = 0
        AND NOT EXISTS (SELECT 1 FROM sales WHERE listing_id = l.id))`).bind(now(), admin, queueId, id, id),
    // A failed CAS aborts the entire batch before media, listing or R2 are removed.
    env.DB.prepare("INSERT INTO listing_event_context(listing_id) SELECT NULL WHERE changes() = 0"),
  ] : [];
  try {
    await listingBatch(env, id, { actor: admin, source: 'panel', ...context, action: 'deleted' }, [
      ...queueGuard,
      env.DB.prepare("DELETE FROM media WHERE listing_id = ?").bind(id),
      env.DB.prepare("DELETE FROM listings WHERE id = ?").bind(id),
      env.DB.prepare("INSERT INTO deleted_listings (id, deleted_at, deleted_by) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(id, now(), admin),
    ]);
  } catch (error) {
    if (queueId && /NOT NULL constraint failed: listing_event_context/i.test(String(error?.message)))
      fail(409, "The queue item or listing changed. Reload before trying again.");
    throw error;
  }
  // Imported files stay in R2 (they also live in /root/Hampton_Database); research rows are kept.
  const keys = results.flatMap(m => [m.r2_key, m.thumb_key]).filter(Boolean);
  if (keys.length) await env.MEDIA.delete(keys);
}

export default [
  ['GET',new RegExp(`^/admin/listings/${ID}/history$`),async ({request,env,params:[id]})=>
    json(await readListingHistory(env,{id,cursor:new URL(request.url).searchParams.get('cursor')})),true],
  ['POST',new RegExp(`^/admin/listings/${ID}/history/validate$`),async ({request,env,params:[id]})=>
    json(await validateListingHistoryRows(env,{id,ids:(await readJson(request,262144))?.ids})),true],
  ["GET", /^\/admin\/listings$/, list, true],
  ["POST", /^\/admin\/listings$/, create, true],
  ["GET", new RegExp(`^/admin/listings/${ID}/address-review$`), addressReviewPreview, true],
  ["POST", new RegExp(`^/admin/listings/${ID}/address-review$`), reviewPublicAddress, true],
  ['GET', new RegExp(`^/admin/listings/${ID}/traceability$`), async ({request,env,admin,params:[id]}) => {
    if (env.PUB09_WITHDRAWALS_READY !== '1') fail(404, 'Not found');
    return json(await readListingTraceability(env,{listing_id:id,cursor:new URL(request.url).searchParams.get('cursor')},admin));
  }, true],
  ['POST', new RegExp(`^/admin/listings/${ID}/withdrawals/([0-9a-fA-F-]{36})/correct$`), async ({request,env,admin,params:[id,withdrawalId]}) => {
    if (env.PUB09_WITHDRAWALS_READY !== '1') fail(404, 'Not found');
    const body=await readJson(request);
    return json(await correctListingWithdrawal(env,{listing_id:id,withdrawal_id:withdrawalId,
      expected_revision:body?.expected_revision,reason_code:body?.reason_code,note:body?.note,operation_id:body?.operation_id},admin));
  }, true],
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
