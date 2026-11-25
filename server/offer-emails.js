// OFE-02 (migration 0126, OFE02_SEND_READY): from Sales, an open offer goes to its seller by email. The seller is an
// owner of the listing in the Advertisers directory (kind individual or entity, the listing in details.listing_ids;
// never a sale file's old seller, never an agency) and one of its contacts with an email, chosen by reference as
// AGE-05's enquiries are. The text is proposed from the offer (amount, conditions, the property) and names no buyer
// and no other offer; the team may edit it. Each save is a new revision. A team member approves one revision, and
// that queues exactly one email in the app's approved queue (outbound, template 'offer_to_seller', server/email.js),
// which Hermes's carrier sends verbatim from Hampton's Gmail (AUT-17). Its claim asks server/offer-email-check.js
// again: any change to the offer, the listing or the seller after that and it does not leave. The clock writes back
// what happened (offerEmailPass): sent, unknown (a person checks; never sent again) or not sent (a new revision that
// nobody approved). Gmail taking the email says nothing about the offer: it stays as it is until the seller answers.
import { json, fail, readJson, now, sha256 } from "./http.js";
import { emailAddress } from "./email.js";
import { emailStop, keyed } from "./consultations.js";
import { offerSendReady, offerTable, OFFER_CLAIMABLE, OFFER_QUEUE_LIMIT } from "./offer-email-check.js";

const OPEN = "('pending', 'countered')";
const CHANGED = "This email changed. Reload to review it.";
const NOT_OPEN = "This offer is no longer open, so it is not sent to the seller.";
const gbp = v => `£${Number(v).toLocaleString("en-GB")}`;

// The proposed text, the same for the same facts: the offer, its conditions and the property by title, public place and
// reference. Never the buyer, never another offer.
export function offerText({ listing: l, offer: o }) {
  const place = l.location || l.country;
  return ["Hello,",
    `Hampton Estates has received an offer of ${gbp(o.amount)} for ${l.title}${place ? `, ${place}` : ""} (our reference ${l.id}).`,
    ...(o.counter_amount != null ? [`Your counter-offer on record is ${gbp(o.counter_amount)}.`] : []),
    ...(o.conditions ? [`The offer is subject to: ${o.conditions}`] : []),
    "Could you please let us know whether you would like to accept it, decline it or make a counter-offer? Nothing is agreed until you confirm it.",
    "Kind regards,\nHampton Estates"].join("\n\n");
}
const subjectOf = l => `Offer for ${l.title} (our reference ${l.id})`.slice(0, 400);

const on = async env => offerSendReady(env) && offerTable(env);
const gate = async env => { if (!(await on(env))) fail(404, "Not found"); };
const offerOf = async (env, id) => await env.DB.prepare(`SELECT o.*, l.title, l.location, l.country, l.operation, l.archived_at
  FROM offers o JOIN listings l ON l.id = o.listing_id WHERE o.id = ?`).bind(Number(id)).first() ?? fail(404, "Offer not found");
const emailOf = (env, id) => env.DB.prepare("SELECT * FROM offer_emails WHERE offer_id = ?").bind(Number(id)).first();
const isOpen = o => ["pending", "countered"].includes(o.status) && o.operation === "sale" && !o.archived_at;
// The owners of a listing who may receive its offers, with their contacts that have an email (each with its reference).
async function sellers(env, listing) {
  const { results } = await env.DB.prepare(`SELECT a.* FROM advertisers a WHERE a.kind IN ('individual', 'entity') AND a.suppressed_at IS NULL
    AND EXISTS (SELECT 1 FROM json_each(a.details, '$.listing_ids') j WHERE j.value = ?) ORDER BY a.name COLLATE NOCASE, a.id LIMIT 20`)
    .bind(listing).all();
  return Promise.all(results.map(async a => ({ id: a.id, name: a.name, kind: a.kind,
    contacts: (await keyed(JSON.parse(a.details).contacts ?? [])).filter(c => emailAddress(c.email))
      .map(c => ({ name: c.name, email: emailAddress(c.email), key: c.key })) })));
}

// The email as the panel shows it. blocked: why it must not go out now.
function shape(o, e, list) {
  const seller = list.find(s => s.id === e.advertiser_id), contact = seller?.contacts.find(c => c.key === e.contact_key) ?? null;
  const blocked = e.status !== "draft" ? null : !isOpen(o) ? NOT_OPEN
    : o.updated_at !== e.offer_updated_at ? "The offer changed since this email was prepared. Save it again to update it before sending."
    : !seller ? "This seller is no longer an owner of this listing in the Advertisers directory. Choose the seller again."
    : !contact ? "The contact chosen is no longer in the directory as it was. Choose a contact again." : null;
  return { revision: e.revision, status: e.status, advertiser_id: e.advertiser_id, seller: seller ? { id: seller.id, name: seller.name } : null,
    contact, text: e.body, amount: e.amount, prepared_by: e.prepared_by, prepared_at: e.prepared_at,
    approval: e.approved_revision === e.revision ? { by: e.approved_by, at: e.approved_at } : null, sent_at: e.sent_at, blocked };
}
async function view(env, id) {
  const o = await offerOf(env, id), e = await emailOf(env, id), list = await sellers(env, o.listing_id);
  return { o, e, list, email: e ? shape(o, e, list) : null };
}

async function context({ env, params: [id] }) {
  await gate(env);
  const { o, list, email } = await view(env, id);
  return json({ offer: { id: o.id, listing_id: o.listing_id, listing_title: o.title, status: o.status, amount: o.amount,
    counter_amount: o.counter_amount, conditions: o.conditions, open: isOpen(o) }, sellers: list, email,
  proposed_text: offerText({ listing: { ...o, id: o.listing_id }, offer: o }), email_stop: await emailStop(env) });
}

// A new revision: the seller, the contact and the text (the proposed one when none is given), from the offer as read.
// Waiting in the queue and not yet claimed, its email is taken back in the same batch; being sent, nothing changes.
async function save({ request, env, admin, params: [id] }) {
  await gate(env);
  const b = await readJson(request);
  if (!Number.isSafeInteger(b?.revision) || !Number.isSafeInteger(b.advertiser_id) || typeof b.contact_key !== "string"
    || (b.text != null && typeof b.text !== "string")) fail(400, "Invalid format");
  const { o, e, list } = await view(env, id);
  if (!isOpen(o)) fail(409, NOT_OPEN);
  if ((e?.revision ?? 0) !== b.revision) fail(409, CHANGED);
  if (e && !["draft", "sent", "queued"].includes(e.status)) fail(409, "Check what happened to the last email before preparing another.");
  const seller = list.find(s => s.id === b.advertiser_id) ?? fail(400, "Choose the seller among the owners of this listing.");
  if (!seller.contacts.some(c => c.key === b.contact_key)) fail(400, "Choose a contact of that seller with an email.");
  const text = (b.text ?? "").trim() || offerText({ listing: { ...o, id: o.listing_id }, offer: o });
  if (text.length > 4000) return json({ error: "Please check the highlighted fields.", fields: { text: "Use 4,000 characters or fewer" } }, 400);
  const ts = now(), offerOpen = `EXISTS (SELECT 1 FROM offers WHERE id = ? AND status IN ${OPEN} AND updated_at = ?)`;
  const stmts = !e ? [env.DB.prepare(`INSERT INTO offer_emails (offer_id, advertiser_id, contact_key, body, amount, offer_updated_at,
      prepared_by, prepared_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${offerOpen} ON CONFLICT (offer_id) DO NOTHING`)
    .bind(o.id, seller.id, b.contact_key, text, o.amount, o.updated_at, admin, ts, o.id, o.updated_at)]
    : [...(e.status === "queued" ? [env.DB.prepare("UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE ref = ? AND status = 'queued'")
      .bind(ts, e.email_ref)] : []),
    env.DB.prepare(`UPDATE offer_emails SET revision = revision + 1, advertiser_id = ?, contact_key = ?, body = ?, amount = ?,
        offer_updated_at = ?, status = 'draft', email_ref = NULL, prepared_by = ?, prepared_at = ?
      WHERE offer_id = ? AND revision = ? AND status = ? AND ${offerOpen}${e.status === "queued" ? " AND changes() = 1" : ""}`)
      .bind(seller.id, b.contact_key, text, o.amount, o.updated_at, admin, ts, o.id, e.revision, e.status, o.id, o.updated_at)];
  const [res] = (await env.DB.batch([...stmts, event(env, admin, o, "offer.seller_email_prepared", { email_revision: b.revision + 1 })])).slice(-2);
  if (!res.meta.changes) fail(409, e?.status === "queued" ? "This email is already being sent. Reload in a few minutes to see it." : CHANGED);
  return json({ email: (await view(env, id)).email });
}
// The step's event, on the listing, by ids only: never the address or the text. email_revision: $.revision is the
// listing's own (events_listing_revision).
const event = (env, actor, o, type, data) => env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
  SELECT ?, ?, 'listing', ?, ?, ? WHERE changes() = 1`).bind(now(), actor, o.listing_id, type, JSON.stringify({ version: 1, offer_id: o.id, ...data }));

// A team member approves exactly this revision, and it is queued once: two clicks or two people find it queued.
async function approve({ request, env, admin, params: [id] }) {
  await gate(env);
  const b = await readJson(request);
  if (!Number.isSafeInteger(b?.revision)) fail(400, "Invalid format");
  const { o, e, email } = await view(env, id);
  if (!e || e.revision !== b.revision) fail(409, CHANGED);
  if (e.status === "queued" && e.approved_revision === e.revision) return json({ email }); // the same click again
  if (e.status !== "draft") fail(409, "This email is not waiting for approval. Reload to see it.");
  if (email.blocked) fail(409, email.blocked);
  const stop = await emailStop(env);
  if (stop) fail(409, stop);
  const to = email.contact.email, hash = await sha256(to), ts = now(), ref = crypto.randomUUID().replaceAll("-", "");
  if (await env.DB.prepare("SELECT 1 FROM email_suppressions WHERE address_hash = ?").bind(hash).first())
    fail(409, "This address is on the email suppression list, so the app does not write to it: choose another contact, or send it yourself.");
  await env.DB.batch([
    env.DB.prepare(`UPDATE offer_emails SET approved_revision = revision, approved_by = ?, approved_at = ? WHERE offer_id = ? AND revision = ?
      AND status = 'draft' AND contact_key = ? AND EXISTS (SELECT 1 FROM offers WHERE id = offer_id AND status IN ${OPEN} AND updated_at = offer_updated_at)`)
      .bind(admin, ts, o.id, e.revision, e.contact_key),
    // One email per revision at most (dedupe_key).
    env.DB.prepare(`INSERT INTO outbound (ref, dedupe_key, template, entity_id, version, recipient, recipient_hash, subject, text, status,
        approved_by, approved_at, created_at, updated_at)
      SELECT ?, ?, 'offer_to_seller', ?, revision, ?, ?, ?, body, 'queued', approved_by, approved_at, ?, ? FROM offer_emails
      WHERE offer_id = ? AND revision = ? AND changes() = 1 ON CONFLICT (dedupe_key) DO NOTHING`)
      .bind(ref, await sha256(`offer_to_seller\0${o.id}\0${e.revision}`), String(o.id), to, hash,
        subjectOf({ ...o, id: o.listing_id }), ts, ts, o.id, e.revision),
    env.DB.prepare("UPDATE offer_emails SET status = 'queued', email_ref = ? WHERE offer_id = ? AND revision = ? AND status = 'draft' AND changes() = 1")
      .bind(ref, o.id, e.revision),
    event(env, admin, o, "offer.seller_email_queued", { email_revision: e.revision, email_ref: ref }),
  ]);
  const after = await view(env, id);
  if (after.e.status !== "queued") fail(409, CHANGED);
  return json({ email: after.email });
}

// The email service did not say whether it left, and the app never sends it again by itself: a person checks Gmail's
// Sent folder and says which. Sent: at the time it was claimed. Not sent: a new revision that nobody approved.
async function outcome({ request, env, admin, params: [id] }) {
  await gate(env);
  const b = await readJson(request);
  if (!Number.isSafeInteger(b?.revision) || typeof b.sent !== "boolean") fail(400, "Invalid format");
  const { o, e } = await view(env, id);
  if (e?.status !== "needs_review") fail(409, "This email is not waiting to be checked. Reload to see it.");
  if (e.revision !== b.revision) fail(409, CHANGED);
  const at = (await env.DB.prepare("SELECT claimed_at FROM outbound WHERE ref = ?").bind(e.email_ref).first())?.claimed_at ?? now();
  const [res] = await env.DB.batch([b.sent ? markSent(env, e, at) : back(env, e),
    event(env, admin, o, b.sent ? "offer.seller_email_confirmed" : "offer.seller_email_not_sent", { email_revision: e.revision })]);
  if (!res.meta.changes) fail(409, CHANGED);
  return json({ email: (await view(env, id)).email });
}

const markSent = (env, e, at) => env.DB.prepare(`UPDATE offer_emails SET status = 'sent', sent_at = ? WHERE offer_id = ? AND revision = ?
  AND status = ?`).bind(at, e.offer_id, e.revision, e.status);
// Back to a person, unsent: a new revision that nobody approved, with no email of its own.
const back = (env, e, when = "") => env.DB.prepare(`UPDATE offer_emails SET status = 'draft', revision = revision + 1, email_ref = NULL
  WHERE offer_id = ? AND revision = ? AND status = ?${when}`).bind(e.offer_id, e.revision, e.status);

// The clock's part, after the email pass (server/jobs.js), for every offer email in the queue. Taken by the transport:
// sent. Uncertain: a person checks, never sent again. Refused, cancelled or gone: back to a person. Still queued but
// switched off (the clock's OFE02_SEND_READY), queued for more than a day or no longer claimable: taken out of the
// queue unsent. Safety does not rest on this pass: the claim asks the same check itself. ponytail: 50 a pass.
export async function offerEmailPass(env) {
  try {
    if (!(await offerTable(env))) return;
    const live = offerSendReady(env);
    const { results } = await env.DB.prepare(`SELECT q.*, outbound.status AS email_status, outbound.updated_at AS email_at,
        outbound.created_at <= ${OFFER_QUEUE_LIMIT} AS expired, ${OFFER_CLAIMABLE} AS claimable
      FROM offer_emails q LEFT JOIN outbound ON outbound.ref = q.email_ref WHERE q.status = 'queued' ORDER BY q.offer_id LIMIT 50`).all();
    for (const { email_status: status, email_at, expired, claimable, ...e } of results) {
      if (status === "sending") continue;
      const o = { id: e.offer_id, listing_id: (await env.DB.prepare("SELECT listing_id FROM offers WHERE id = ?").bind(e.offer_id).first()).listing_id };
      const note = (type, reason) => event(env, "system", o, type, { email_revision: e.revision, email_ref: e.email_ref, ...(reason && { reason }) });
      if (status === "accepted") await env.DB.batch([markSent(env, e, email_at), note("offer.seller_email_sent")]);
      else if (status === "unknown") await env.DB.batch([env.DB.prepare(`UPDATE offer_emails SET status = 'needs_review'
        WHERE offer_id = ? AND revision = ? AND status = 'queued'`).bind(e.offer_id, e.revision), note("offer.seller_email_unknown")]);
      else if (status !== "queued") await env.DB.batch([back(env, e), note("offer.seller_email_not_sent", status ?? "missing")]);
      else if (!live || expired || !claimable) await env.DB.batch([
        env.DB.prepare("UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE ref = ? AND status = 'queued'").bind(now(), e.email_ref),
        back(env, e, " AND changes() = 1"), note("offer.seller_email_not_sent", !live ? "switched_off" : expired ? "expired" : "blocked")]);
    }
  } catch { console.error("Offer email pass failed"); } // never the offer, the address or the text
}

export default [
  ["GET", /^\/admin\/offers\/(\d+)\/seller-email$/, context, true],
  ["PUT", /^\/admin\/offers\/(\d+)\/seller-email$/, save, true],
  ["POST", /^\/admin\/offers\/(\d+)\/seller-email\/approve$/, approve, true],
  ["POST", /^\/admin\/offers\/(\d+)\/seller-email\/outcome$/, outcome, true],
];
