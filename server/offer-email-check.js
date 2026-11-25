// OFE-02: whether an email that takes an offer to its seller (outbound template 'offer_to_seller') may be claimed now,
// in SQL from its outbound row. server/email.js asks it in the claim itself and again just before the transport, so
// nothing can change between the check and the claim. A leaf: server/email.js imports it, so it imports nothing.
// It asks: queued with the approval of this very revision by a member of the team, within a day; the offer still open
// and exactly as it was when the email was prepared (any change to it after that, an amount, a counter, a status, is a
// new offer_updated_at); the listing still for sale and unchanged since queued; the seller still an owner of that
// listing in the directory (kind individual or entity, the listing in details.listing_ids), not removed, unchanged since
// queued, and the address still one of its contacts'. The json_each tests go last: they are the deepest (D1's limit).
export const offerSendReady = env => env?.OFE02_SEND_READY === "1";
// Migration 0126 is there. Before it no statement names offer_emails.
export const offerTable = env => env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'offer_emails'")
  .first().then(Boolean, () => false);
export const OFFER_QUEUE_LIMIT = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')";
export const OFFER_CLAIMABLE = `EXISTS (SELECT 1 FROM offer_emails oe JOIN offers o ON o.id = oe.offer_id
    JOIN listings l ON l.id = o.listing_id JOIN advertisers ad ON ad.id = oe.advertiser_id
  WHERE oe.email_ref = outbound.ref AND oe.status = 'queued' AND oe.revision = outbound.version
    AND outbound.created_at > ${OFFER_QUEUE_LIMIT} AND oe.approved_revision = oe.revision
    AND o.status IN ('pending', 'countered') AND o.amount = oe.amount AND o.updated_at = oe.offer_updated_at
    AND l.operation = 'sale' AND l.archived_at IS NULL AND l.updated_at <= outbound.created_at
    AND ad.kind IN ('individual', 'entity') AND ad.suppressed_at IS NULL AND ad.updated_at <= outbound.created_at
    AND EXISTS (SELECT 1 FROM admins WHERE email = oe.approved_by)
    AND EXISTS (SELECT 1 FROM json_each(ad.details, '$.listing_ids') j WHERE j.value = o.listing_id)
    AND EXISTS (SELECT 1 FROM json_each(ad.details, '$.contacts') j WHERE lower(trim(json_extract(j.value, '$.email'))) = outbound.recipient))`;
// "0" (none is claimed) while switched off, before migration 0126, or if the schema cannot be read.
export const offerClaimSql = async env => (offerSendReady(env) && await offerTable(env) ? OFFER_CLAIMABLE : "0");
