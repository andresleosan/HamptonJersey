import { json, fail, readJson, now } from "../http.js";
import { validateOffer, MILESTONES } from "../sales.js";
import { logEvent, resolveNotices } from "../events.js";
import { afterSave, recomputeForListing, recomputeForApplicant } from "../match-store.js";
import { touch } from "./applicants.js";

const OPEN = ["pending", "countered"];
const NOT_OPEN = "This offer is no longer open";
const fieldErrors = errors => json({ error: "Please check the highlighted fields", fields: errors }, 400);
const asObject = body => (body && typeof body === "object" && !Array.isArray(body) ? body : fail(400, "Invalid format"));

async function loadOffer(env, id) {
  const o = await env.DB.prepare("SELECT * FROM offers WHERE id = ?").bind(Number(id)).first();
  return o ?? fail(404, "Offer not found");
}

// V1, V17: a buyer's offer on a listing for sale; backup offers come in while it is under offer. ELIGIBLE says it in
// SQL (binds: listing id, applicant id), eligible() in words.
const ELIGIBLE = `EXISTS (SELECT 1 FROM listings WHERE id = ? AND operation = 'sale' AND archived_at IS NULL
    AND availability IN ('for_sale', 'under_offer'))
  AND EXISTS (SELECT 1 FROM applicants WHERE id = ? AND operation = 'buy' AND archived_at IS NULL)`;
async function eligible(env, listingId, applicantId) {
  const [[listing], [applicant]] = (await env.DB.batch([
    env.DB.prepare("SELECT * FROM listings WHERE id = ?").bind(listingId),
    env.DB.prepare("SELECT * FROM applicants WHERE id = ?").bind(applicantId),
  ])).map(r => r.results);
  if (!listing) fail(404, "Listing not found");
  if (!applicant) fail(404, "Applicant not found");
  if (listing.operation !== "sale" || listing.archived_at || !["for_sale", "under_offer"].includes(listing.availability))
    fail(400, "This listing is not for sale");
  if (applicant.operation !== "buy" || applicant.archived_at) fail(400, "This applicant is not an active buyer");
  return { listing, applicant };
}

// Fails the whole batch (NOT NULL) when the statement just before changed no row, like LOCK in applicants.js: nothing
// after it happens alone. It always targets offers, whichever insert it guards: the table only lends a NOT NULL column.
const ensureChanged = env => env.DB.prepare("INSERT INTO offers (listing_id) SELECT NULL WHERE changes() = 0");

// ctx = { admin, ts, data, newest }: who and when, the ids every event of the write carries (V11: offer_id, sale_id,
// listing_id) and those of rows the batch inserts (logEvent's newest). Events are about the buyer.
const buyerEvent = (env, ctx, buyerId, type, data, ifInserted = false) => logEvent(env, { actor: ctx.admin,
  entity_type: "applicant", entity_id: String(buyerId), type, data: { ...ctx.data, ...data } }, null,
{ ifInserted, newest: ctx.newest });

// V6, V21: moves the buyer to `stage` when at one of `from`, and only from the stage read (a change saved meanwhile
// wins and nothing is written). As a panel save: applicant.stage_changed, updated_at (an open form gets 409), the
// contact's activity, and leaving New closes the new-applicant notice. [] when the move does not apply.
function stageTo(env, ctx, applicant, stage, from) {
  if (!from.includes(applicant.stage)) return [];
  // Leaving Lost clears its reason, as a panel save does.
  const [was, is] = applicant.lost_reason == null ? [{}, {}] : [{ lost_reason: applicant.lost_reason }, { lost_reason: null }];
  return [
    env.DB.prepare("UPDATE applicants SET stage = ?, lost_reason = NULL, updated_at = ?, updated_by = ? WHERE id = ? AND stage = ?")
      .bind(stage, ctx.ts, ctx.admin, applicant.id, applicant.stage),
    ...buyerEvent(env, ctx, applicant.id, "applicant.stage_changed", { before: { stage: applicant.stage, ...was },
      after: { stage, ...is } }, true),
    ...(applicant.stage === "new" ? [resolveNotices(env, { entity_type: "applicant", entity_id: String(applicant.id),
      category: "new_applicant" }, ctx.admin, { ifLogged: true })] : []),
    touch(env, applicant.contact_id, ctx.ts),
  ];
}

// V2: moves the listing to `availability` when at one of `from`, only from the availability read (the team's hand
// change wins), advancing updated_at (an open editor gets 409); its event goes on the buyer's history.
function availabilityTo(env, ctx, listing, availability, from, buyerId) {
  if (!from.includes(listing.availability)) return [];
  return [
    env.DB.prepare("UPDATE listings SET availability = ?, updated_at = ?, updated_by = ? WHERE id = ? AND availability = ?")
      .bind(availability, ctx.ts, ctx.admin, listing.id, listing.availability),
    ...buyerEvent(env, ctx, buyerId, "listing.availability_changed",
      { before: { availability: listing.availability }, after: { availability } }, true),
  ];
}

async function create({ request, env, admin }) {
  const body = asObject(await readJson(request));
  const r = validateOffer(body);
  if (r.errors) return fieldErrors(r.errors);
  if (typeof body.listing_id !== "string" || !Number.isInteger(Number(body.applicant_id))) fail(400, "Choose a listing and a buyer");
  const { listing, applicant } = await eligible(env, body.listing_id, Number(body.applicant_id));
  const ts = now(), ctx = { admin, ts, data: { listing_id: listing.id }, newest: { offer_id: "offers" } };
  const o = { listing_id: listing.id, applicant_id: applicant.id, ...r.value, created_at: ts, created_by: admin,
    updated_at: ts, updated_by: admin };
  // V6: an offer moves the buyer on; a paused or lost search keeps its stage.
  const stage = stageTo(env, ctx, applicant, "offer", ["new", "searching", "viewing"]);
  let results;
  try {
    results = await env.DB.batch([
      env.DB.prepare(`INSERT INTO offers (${Object.keys(o).join(", ")}) SELECT ${Object.keys(o).map(() => "?").join(", ")}
        WHERE ${ELIGIBLE}`).bind(...Object.values(o), listing.id, applicant.id),
      ensureChanged(env),
      ...buyerEvent(env, ctx, applicant.id, "offer.recorded", { amount: o.amount, conditions: o.conditions }),
      ...stage,
      // G2: an offer is activity on the buyer, whatever the stage (stageTo touches when it moves).
      ...(stage.length ? [] : [touch(env, applicant.contact_id, ts)]),
    ]);
  } catch (e) {
    await eligible(env, listing.id, applicant.id); // archived or changed meanwhile: 400 says why
    throw e;
  }
  if (stage.length) await afterSave(recomputeForApplicant, env, applicant.id, admin);
  return json({ offer: await loadOffer(env, results[0].meta.last_row_id) }, 201);
}

// A change to the offer if it is still at one of `from` (V4), with its event; 409 when it no longer is.
async function change(env, admin, cur, set, from, type, data) {
  const ts = now(), cols = Object.keys(set);
  const [res] = await env.DB.batch([
    env.DB.prepare(`UPDATE offers SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ?
      WHERE id = ? AND status IN (${from.map(() => "?").join(", ")})`).bind(...Object.values(set), ts, admin, cur.id, ...from),
    ...buyerEvent(env, { admin, data: { offer_id: cur.id, listing_id: cur.listing_id } }, cur.applicant_id, type, data, true),
  ]);
  if (!res.meta.changes) fail(409, NOT_OPEN);
  return json({ offer: await loadOffer(env, cur.id) });
}

// V4: amount and conditions of an open offer.
async function update({ request, env, admin, params: [id] }) {
  const r = validateOffer(asObject(await readJson(request)), { partial: true });
  if (r.errors) return fieldErrors(r.errors);
  const cur = await loadOffer(env, id);
  if (!OPEN.includes(cur.status)) fail(409, NOT_OPEN);
  const keys = Object.keys(r.value).filter(k => r.value[k] !== cur[k]);
  if (!keys.length) return json({ offer: cur });
  const of = row => Object.fromEntries(keys.map(k => [k, row[k]]));
  return change(env, admin, cur, of(r.value), OPEN, "offer.updated", { before: of(cur), after: of(r.value) });
}

// V4, R8: the seller counters an open offer (again, if they like); either side closes an open one, with an optional note.
async function move({ request, env, admin, params: [id, action] }) {
  const body = asObject(await readJson(request));
  const cur = await loadOffer(env, id);
  if (!OPEN.includes(cur.status)) fail(409, NOT_OPEN);
  if (action === "counter") {
    const r = validateOffer({ amount: body.counter_amount });
    if (r.errors) return fieldErrors({ counter_amount: r.errors.amount });
    const counter_amount = r.value.amount;
    return change(env, admin, cur, { status: "countered", counter_amount }, OPEN, "offer.countered",
      { before: { counter_amount: cur.counter_amount }, after: { counter_amount } });
  }
  const n = body.note ?? "";
  if (typeof n !== "string" || n.trim().length > 300) return fieldErrors({ note: "Use 300 characters or fewer" });
  const note = n.trim() || null, status = action === "reject" ? "rejected" : "withdrawn";
  return change(env, admin, cur, { status, note }, OPEN, `offer.${status}`, { note });
}

// The checks of an accept, in the order its answers are given. They run before the batch and again when it fails, to
// say why (another accept won, the buyer bought elsewhere, the offer or listing changed).
async function acceptable(env, id) {
  const offer = await loadOffer(env, id);
  if (!OPEN.includes(offer.status)) fail(409, NOT_OPEN);
  const { listing, applicant } = await eligible(env, offer.listing_id, offer.applicant_id);
  const sale = await env.DB.prepare(`SELECT listing_id = ? AS same FROM sales WHERE status = 'in_progress'
    AND (listing_id = ? OR applicant_id = ?) ORDER BY same DESC LIMIT 1`).bind(listing.id, listing.id, applicant.id).first();
  if (sale) fail(409, sale.same ? "This listing already has a sale in progress" : "This buyer already has a sale in progress");
  return { offer, listing, applicant };
}

// V5, V7, V19, V21: one batch accepts the offer, opens its sale with the nine milestones, puts the listing under offer
// and the buyer at Agreed. If the sale is not inserted, ensureChanged undoes it all; the partial unique indexes on
// sales are the last barrier. Other offers on the listing stay open as backups (V5).
async function accept({ env, admin, params: [id] }) {
  const { offer, listing, applicant } = await acceptable(env, id);
  const ts = now(), ctx = { admin, ts, data: { offer_id: offer.id, listing_id: listing.id }, newest: { sale_id: "sales" } };
  const listingMove = availabilityTo(env, ctx, listing, "under_offer", ["for_sale"], applicant.id);
  const stageMove = stageTo(env, ctx, applicant, "agreed", ["new", "searching", "viewing", "offer", "paused", "lost"]);
  let results;
  try {
    results = await env.DB.batch([
      env.DB.prepare(`UPDATE offers SET status = 'accepted', updated_at = ?, updated_by = ? WHERE id = ?
        AND status IN ('pending', 'countered')`).bind(ts, admin, offer.id),
      // A countered offer keeps its counter (V21): the price is the counter, else the amount.
      env.DB.prepare(`INSERT INTO sales (listing_id, applicant_id, offer_id, price, created_at, created_by, updated_at, updated_by)
        SELECT listing_id, applicant_id, id, COALESCE(counter_amount, amount), ?, ?, ?, ? FROM offers WHERE id = ? AND changes() = 1
        AND NOT EXISTS (SELECT 1 FROM sales WHERE status = 'in_progress' AND (listing_id = ? OR applicant_id = ?)) AND ${ELIGIBLE}`)
        .bind(ts, admin, ts, admin, offer.id, listing.id, applicant.id, listing.id, applicant.id),
      ensureChanged(env),
      env.DB.prepare(`INSERT INTO sale_milestones (sale_id, key) SELECT s.id, j.value FROM sales s, json_each(?) j
        WHERE s.offer_id = ?`).bind(JSON.stringify(MILESTONES.map(([k]) => k)), offer.id),
      ...buyerEvent(env, ctx, applicant.id, "offer.accepted"),
      ...listingMove,
      ...stageMove,
    ]);
  } catch (e) {
    await acceptable(env, offer.id);
    throw e;
  }
  if (listingMove.length) await afterSave(recomputeForListing, env, listing.id, admin);
  if (stageMove.length) await afterSave(recomputeForApplicant, env, applicant.id, admin);
  return json({ offer: await loadOffer(env, offer.id), sale_id: results[1].meta.last_row_id }, 201);
}

export default [
  ["POST", /^\/admin\/offers$/, create, true],
  ["PUT", /^\/admin\/offers\/(\d+)$/, update, true],
  ["POST", /^\/admin\/offers\/(\d+)\/accept$/, accept, true],
  ["POST", /^\/admin\/offers\/(\d+)\/(counter|reject|withdraw)$/, move, true],
];
