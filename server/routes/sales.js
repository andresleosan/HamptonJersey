import { json, fail, readJson, now } from "../http.js";
import { validateOffer, validateSale, validateMilestone, MILESTONES, milestoneLabel, isOverdue, nextMilestone,
  OFFER_WAITING_MS } from "../sales.js";
import { logEvent, resolveNotices } from "../events.js";
import { afterSave, recomputeForListing, recomputeForApplicant } from "../match-store.js";
import { touch, LOCK } from "./applicants.js";
import { jerseyToday } from "../viewings.js";
import { jerseyDayStart } from "../insights.js";
import { ENUMS } from "../listing.js";

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
// change wins), advancing updated_at (an open editor gets 409); its event goes on the buyer's history. ADM-04 (T2): the
// move also confirms the listing.
function availabilityTo(env, ctx, listing, availability, from, buyerId) {
  if (!from.includes(listing.availability)) return [];
  return [
    env.DB.prepare(`UPDATE listings SET availability = ?, confirmed_at = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND availability = ?`).bind(availability, ctx.ts, ctx.ts, ctx.admin, listing.id, listing.availability),
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
  // A buyer's new offer on a listing replaces their open one there.
  const superseded = closeOffers(env, ctx, "listing_id = ? AND applicant_id = ?", [listing.id, applicant.id], "withdrawn",
    "Superseded by a new offer");
  let results;
  try {
    results = await env.DB.batch([
      ...superseded,
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
  return json({ offer: await loadOffer(env, results[superseded.length].meta.last_row_id) }, 201);
}

// A change to the offer if it is still at one of `from` (V4), with its event; 409 when it no longer is.
async function change(env, admin, cur, set, from, type, data) {
  const ts = now(), cols = Object.keys(set);
  const [res] = await env.DB.batch([
    env.DB.prepare(`UPDATE offers SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ?
      WHERE id = ? AND status IN (${from.map(() => "?").join(", ")})`).bind(...Object.values(set), ts, admin, cur.id, ...from),
    ...buyerEvent(env, { admin, data: { offer_id: cur.id, listing_id: cur.listing_id } }, cur.applicant_id, type, data, true),
    // G2: activity on the buyer. After the event, so its changes() says the offer changed (a 409 restarts nothing).
    env.DB.prepare(`UPDATE contacts SET last_activity_at = ? WHERE id = (SELECT contact_id FROM applicants WHERE id = ?)
      AND changes() = 1`).bind(ts, cur.applicant_id),
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

const OPEN_SQL = "('pending', 'countered')";
const CLOSED = "This sale is no longer in progress";
const STALE = "Someone else saved changes to this sale. Reload to see them (your changes were not saved).";
// Who a row of `t` (offers o, sales s) is about: its listing l and its buyer a, named by contact c.
const people = t => `JOIN listings l ON l.id = ${t}.listing_id JOIN applicants a ON a.id = ${t}.applicant_id
  JOIN contacts c ON c.id = a.contact_id`;
const SALE_SQL = `SELECT s.*, l.title AS listing_title, c.name AS buyer_name FROM sales s ${people("s")}`;
async function loadSale(env, id) {
  const s = await env.DB.prepare(`${SALE_SQL} WHERE s.id = ?`).bind(Number(id)).first();
  return s ?? fail(404, "Sale not found");
}

// V18: an open offer on a listing with a sale in progress is a backup. V9: an open offer untouched for longer than
// OFFER_WAITING_MS is Waiting, unless it is a backup (binds the cutoff). Over offers o.
const BACKUP = "EXISTS (SELECT 1 FROM sales bs WHERE bs.listing_id = o.listing_id AND bs.status = 'in_progress')";
const WAITING = `o.status IN ${OPEN_SQL} AND o.updated_at < ? AND NOT ${BACKUP}`;
const waitingCutoff = () => new Date(Date.now() - OFFER_WAITING_MS).toISOString();

// V10: the nav's Sales count, sales in progress with an overdue step (isOverdue in SQL, binds today) plus waiting offers.
export const salesCount = env => env.DB.prepare(`SELECT (SELECT COUNT(*) FROM sales s WHERE s.status = 'in_progress'
    AND EXISTS (SELECT 1 FROM sale_milestones m WHERE m.sale_id = s.id AND m.planned_on < ? AND m.done_on IS NULL AND m.not_needed = 0))
  + (SELECT COUNT(*) FROM offers o WHERE ${WAITING}) AS n`).bind(jerseyToday(), waitingCutoff());

// V8 order: sale_milestones is keyed by (sale_id, key), so a plain read comes back by key.
export const inOrder = rows => MILESTONES.map(([k]) => rows.find(m => m.key === k)).filter(Boolean);
// A step as the panel shows it; only a sale in progress has overdue steps (V9).
const step = (m, sale, today) => ({ key: m.key, label: milestoneLabel(m.key, sale.route), planned_on: m.planned_on,
  done_on: m.done_on, not_needed: !!m.not_needed, note: m.note, overdue: sale.status === "in_progress" && isOverdue(m, today) });
// V3, V20: Hampton's fees net of the other agency's share.
const netFees = sales => sales.reduce((t, s) => t + (s.fee == null ? 0 : s.fee - (s.shared_fee ?? 0)), 0);

// The Sales screen, in one batch of reads: open offers, sales in progress (overdue first) and those closed in 12 months.
async function list({ env }) {
  const today = jerseyToday(), since = new Date();
  since.setUTCFullYear(since.getUTCFullYear() - 1);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const [offers, open, steps, closed] = (await env.DB.batch([
    q(`SELECT o.id, o.listing_id, l.title AS listing_title, o.applicant_id, c.name AS buyer_name, o.amount, o.counter_amount,
       o.conditions, o.status, a.buyer_position, a.mortgage_aip, o.created_at, o.updated_at, ${WAITING} AS waiting, ${BACKUP} AS backup
       FROM offers o ${people("o")} WHERE o.status IN ${OPEN_SQL} ORDER BY l.title, o.listing_id, o.created_at, o.id`, waitingCutoff()),
    q(`SELECT s.id, s.listing_id, l.title AS listing_title, s.applicant_id, c.name AS buyer_name, s.price, s.route, s.target_date,
       s.fee, s.shared_fee FROM sales s ${people("s")} WHERE s.status = 'in_progress' ORDER BY s.target_date IS NULL, s.target_date, s.id`),
    q("SELECT m.* FROM sale_milestones m JOIN sales s ON s.id = m.sale_id WHERE s.status = 'in_progress'"),
    q(`SELECT s.id, s.listing_id, l.title AS listing_title, s.applicant_id, c.name AS buyer_name, s.price, s.status,
       s.fell_through_reason, s.closed_at, s.fee, s.shared_fee FROM sales s ${people("s")}
       WHERE s.status <> 'in_progress' AND s.closed_at >= ? ORDER BY s.closed_at DESC, s.id DESC`, since.toISOString()),
  ])).map(r => r.results);
  const bySale = new Map();
  for (const m of steps) bySale.set(m.sale_id, [...(bySale.get(m.sale_id) ?? []), m]);
  const sales = open.map(s => {
    const ms = inOrder(bySale.get(s.id) ?? []), next = nextMilestone(ms);
    return { ...s, next: next && { key: next.key, label: milestoneLabel(next.key, s.route), planned_on: next.planned_on },
      overdue: ms.some(m => isOverdue(m, today)) };
  }).sort((x, y) => y.overdue - x.overdue);
  // This Jersey year started within the last 12 months, so its completions are all in `closed`.
  const yearStart = jerseyDayStart(`${today.slice(0, 4)}-01-01`);
  return json({
    totals: { open_offers: offers.length, in_progress: sales.length, fees_in_progress: netFees(sales),
      fees_completed_year: netFees(closed.filter(s => s.status === "completed" && s.closed_at >= yearStart)) },
    offers: offers.map(o => ({ ...o, waiting: !!o.waiting, backup: !!o.backup })), sales, closed,
  });
}

// The sale file: its data, its steps in order and the listing's other offers.
async function detail({ env, params: [id] }) {
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const [[sale], steps, offers] = (await env.DB.batch([
    q(`${SALE_SQL} WHERE s.id = ?`, Number(id)),
    q("SELECT * FROM sale_milestones WHERE sale_id = ?", Number(id)),
    q(`SELECT o.*, c.name AS buyer_name FROM offers o JOIN sales s ON s.listing_id = o.listing_id AND s.offer_id <> o.id
       JOIN applicants a ON a.id = o.applicant_id JOIN contacts c ON c.id = a.contact_id
       WHERE s.id = ? ORDER BY o.created_at DESC, o.id DESC`, Number(id)),
  ])).map(r => r.results);
  if (!sale) fail(404, "Sale not found");
  const today = jerseyToday();
  return json({ sale, milestones: inOrder(steps).map(m => step(m, sale, today)), offers });
}

// V7, V3, V13, R3: the sale's data, with the lock on updated_at; only while in progress.
async function updateSale({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request));
  if (typeof body.updated_at !== "string") fail(400, "Missing updated_at: reload the sale");
  const r = validateSale(body);
  if (r.errors) return fieldErrors(r.errors);
  const cur = await loadSale(env, id);
  if (cur.status !== "in_progress") fail(409, CLOSED);
  if (body.updated_at !== cur.updated_at) fail(409, STALE);
  // R4: the share is checked against the fee the sale will have, sent or stored.
  const next = { ...cur, ...r.value };
  if (next.shared_fee != null && !(next.fee != null && next.shared_fee <= next.fee))
    return fieldErrors({ shared_fee: "The other agency's share cannot be more than the fee" });
  const keys = Object.keys(r.value).filter(k => r.value[k] !== cur[k]);
  if (!keys.length) return json({ sale: cur });
  const of = row => Object.fromEntries(keys.map(k => [k, row[k]]));
  const ts = now(), ctx = { admin, data: { offer_id: cur.offer_id, sale_id: cur.id, listing_id: cur.listing_id } };
  let res;
  try {
    [res] = await env.DB.batch([
      env.DB.prepare(`UPDATE sales SET ${keys.map(k => `${k} = ?`).join(", ")}, updated_by = ?, ${LOCK}
        WHERE id = ? AND status = 'in_progress'`).bind(...keys.map(k => next[k]), admin, body.updated_at, ts, cur.id),
      ...buyerEvent(env, ctx, cur.applicant_id, "sale.updated", { before: of(cur), after: of(next) }, true),
    ]);
  } catch (e) {
    if ((await loadSale(env, cur.id)).updated_at !== body.updated_at) fail(409, STALE);
    throw e;
  }
  if (!res.meta.changes) fail(409, CLOSED);
  return json({ sale: await loadSale(env, cur.id) });
}

// V8: one step of a sale in progress.
async function updateStep({ request, env, admin, params: [id, key] }) {
  if (!MILESTONES.some(([k]) => k === key)) fail(404, "Step not found");
  const r = validateMilestone(asObject(await readJson(request)));
  if (r.errors) return fieldErrors(r.errors);
  const sale = await loadSale(env, id);
  if (sale.status !== "in_progress") fail(409, CLOSED);
  const read = () => env.DB.prepare("SELECT * FROM sale_milestones WHERE sale_id = ? AND key = ?").bind(sale.id, key).first();
  const cur = (await read()) ?? fail(404, "Step not found");
  // R4: done and not needed, sent or stored, are never set together.
  const next = { ...cur, ...r.value }, today = jerseyToday();
  if (next.done_on && next.not_needed) return fieldErrors({ not_needed: "A step that is done cannot be marked not needed" });
  const keys = Object.keys(r.value).filter(k => r.value[k] !== cur[k]);
  if (!keys.length) return json({ milestone: step(cur, sale, today) });
  const of = row => Object.fromEntries(keys.map(k => [k, row[k]]));
  const ctx = { admin, data: { offer_id: sale.offer_id, sale_id: sale.id, listing_id: sale.listing_id } };
  let res;
  try {
    [res] = await env.DB.batch([
      env.DB.prepare(`UPDATE sale_milestones SET ${keys.map(k => `${k} = ?`).join(", ")} WHERE sale_id = ? AND key = ?
        AND EXISTS (SELECT 1 FROM sales WHERE id = ? AND status = 'in_progress')`).bind(...keys.map(k => next[k]), sale.id, key, sale.id),
      ...buyerEvent(env, ctx, sale.applicant_id, "sale.milestone", { key, before: of(cur), after: of(next) }, true),
    ]);
  } catch (e) {
    // R10: a save of the same step meanwhile made ours break a CHECK (done and not needed together).
    const row = await read();
    if (["planned_on", "done_on", "not_needed", "note"].some(k => row?.[k] !== cur[k]))
      fail(409, "Someone else changed this step. Reload to see it");
    throw e;
  }
  if (!res.meta.changes) fail(409, CLOSED);
  return json({ milestone: step(next, sale, today) });
}

// The checks of a close, before its batch and again when it fails to say why: the sale is in progress (409) and, to
// complete it, its passing step is done or not needed (400). Returns the sale, its listing and its buyer.
async function closable(env, id, completing) {
  const q = sql => env.DB.prepare(sql).bind(Number(id));
  const [[sale], [passing], [listing], [applicant]] = (await env.DB.batch([
    q(`${SALE_SQL} WHERE s.id = ?`),
    q("SELECT done_on, not_needed FROM sale_milestones WHERE sale_id = ? AND key = 'passing'"),
    q("SELECT l.* FROM listings l JOIN sales s ON s.listing_id = l.id WHERE s.id = ?"),
    q("SELECT a.* FROM applicants a JOIN sales s ON s.applicant_id = a.id WHERE s.id = ?"),
  ])).map(r => r.results);
  if (!sale) fail(404, "Sale not found");
  if (sale.status !== "in_progress") fail(409, CLOSED);
  if (completing && !passing?.done_on && !passing?.not_needed)
    fail(400, `Mark "${milestoneLabel("passing", sale.route)}" done or not needed first`);
  return { sale, listing, applicant };
}

// Runs a close's batch (the sale UPDATE first, then ensureChanged); if it fails, closable says why or the error stands.
// The matches then follow the listing and the buyer, as after a save.
async function closeSale(env, admin, { sale, listing, applicant }, completing, stmts, listingMove, stageMove) {
  try {
    await env.DB.batch([...stmts, ...listingMove, ...stageMove]);
  } catch (e) {
    await closable(env, sale.id, completing);
    throw e;
  }
  // ponytail: both recomputes run inside this request (the single-listing one reads every active applicant, fine up to
  // ~500); past that, move one to ctx.waitUntil.
  if (listingMove.length) await afterSave(recomputeForListing, env, listing.id, admin);
  if (stageMove.length) await afterSave(recomputeForApplicant, env, applicant.id, admin);
  return json({ sale: await loadSale(env, sale.id) });
}

// V18: closes the open offers matching `where` (binds `args`) with `status` and `note`, each with its event on its buyer
// (written first, while the offers are still open), carrying ctx's sale_id when there is one. A JS number binds as a
// REAL, so the id is cast back to an integer, as the other events store it.
function closeOffers(env, ctx, where, args, status, note) {
  const sale = ctx.data.sale_id == null ? [] : [ctx.data.sale_id];
  return [
    env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
      SELECT ?, ?, 'applicant', CAST(applicant_id AS TEXT), ?, json_object('offer_id', id, ${sale.length ? "'sale_id', CAST(? AS INTEGER), " : ""}
      'listing_id', listing_id, 'note', ?) FROM offers WHERE ${where} AND status IN ${OPEN_SQL}`)
      .bind(ctx.ts, ctx.admin, `offer.${status}`, ...sale, note, ...args),
    env.DB.prepare(`UPDATE offers SET status = ?, note = ?, updated_at = ?, updated_by = ? WHERE ${where} AND status IN ${OPEN_SQL}`)
      .bind(status, note, ctx.ts, ctx.admin, ...args),
  ];
}
const closeCtx = (admin, sale) => ({ admin, ts: now(), data: { offer_id: sale.offer_id, sale_id: sale.id, listing_id: sale.listing_id } });

// V2, V6, V15, V18: one batch completes the sale, sells the listing, completes the buyer, rejects the listing's backup
// offers and withdraws the buyer's own open offers, here and elsewhere. A completed sale is not undone from the panel.
async function complete({ env, admin, params: [id] }) {
  const s = await closable(env, id, true), ctx = closeCtx(admin, s.sale);
  return closeSale(env, admin, s, true, [
    env.DB.prepare(`UPDATE sales SET status = 'completed', closed_at = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND status = 'in_progress' AND EXISTS (SELECT 1 FROM sale_milestones m WHERE m.sale_id = sales.id
        AND m.key = 'passing' AND (m.done_on IS NOT NULL OR m.not_needed = 1))`).bind(ctx.ts, ctx.ts, admin, s.sale.id),
    ensureChanged(env),
    ...buyerEvent(env, ctx, s.applicant.id, "sale.completed"),
    // Other buyers' offers on the listing are backups; the buyer's own open offers, here or elsewhere, are withdrawn.
    ...closeOffers(env, ctx, "listing_id = ? AND applicant_id <> ?", [s.listing.id, s.applicant.id], "rejected", "Property sold"),
    ...closeOffers(env, ctx, "listing_id = ? AND applicant_id = ?", [s.listing.id, s.applicant.id], "withdrawn", "Buyer bought this property"),
    ...closeOffers(env, ctx, "listing_id <> ? AND applicant_id = ?", [s.listing.id, s.applicant.id], "withdrawn", "Buyer completed elsewhere"),
  ], availabilityTo(env, ctx, s.listing, "sold", ENUMS.availability.filter(a => a !== "sold"), s.applicant.id),
  stageTo(env, ctx, s.applicant, "completed", ["new", "searching", "viewing", "offer", "agreed", "paused", "lost"]));
}

const REASONS = ["buyer_withdrew", "seller_withdrew", "finance", "survey", "chain", "other"];
// V2, V6, V7: the sale falls through with its reason. The accepted offer stays accepted (history); the listing goes back
// for sale only if still under offer, and the buyer back to searching only if still agreed (a hand change wins).
async function fallThrough({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request)), errors = {}, n = body.note ?? "";
  if (!REASONS.includes(body.reason)) errors.reason = "Choose a reason";
  if (typeof n !== "string" || n.trim().length > 300) errors.note = "Use 300 characters or fewer";
  if (Object.keys(errors).length) return fieldErrors(errors);
  const note = n.trim() || null, s = await closable(env, id, false), ctx = closeCtx(admin, s.sale);
  return closeSale(env, admin, s, false, [
    env.DB.prepare(`UPDATE sales SET status = 'fallen_through', fell_through_reason = ?, fell_through_note = ?, closed_at = ?,
      updated_at = ?, updated_by = ? WHERE id = ? AND status = 'in_progress'`).bind(body.reason, note, ctx.ts, ctx.ts, admin, s.sale.id),
    ensureChanged(env),
    ...buyerEvent(env, ctx, s.applicant.id, "sale.fallen_through", { reason: body.reason, note }),
  ], availabilityTo(env, ctx, s.listing, "for_sale", ["under_offer"], s.applicant.id),
  stageTo(env, ctx, s.applicant, "searching", ["agreed"]));
}

export default [
  ["POST", /^\/admin\/offers$/, create, true],
  ["PUT", /^\/admin\/offers\/(\d+)$/, update, true],
  ["POST", /^\/admin\/offers\/(\d+)\/accept$/, accept, true],
  ["POST", /^\/admin\/offers\/(\d+)\/(counter|reject|withdraw)$/, move, true],
  ["GET", /^\/admin\/sales$/, list, true],
  ["GET", /^\/admin\/sales\/(\d+)$/, detail, true],
  ["PUT", /^\/admin\/sales\/(\d+)$/, updateSale, true],
  ["PUT", /^\/admin\/sales\/(\d+)\/milestones\/([a-z_]+)$/, updateStep, true],
  ["POST", /^\/admin\/sales\/(\d+)\/complete$/, complete, true],
  ["POST", /^\/admin\/sales\/(\d+)\/fall-through$/, fallThrough, true],
];
