-- PUB-07: legal and technical compliance of a listing, staff only, written and shown with PUB07_COMPLIANCE_READY=1.
-- Additive: seven columns; existing listings read 'unknown'. No trigger is replaced (the PUB-06 audit triggers stay
-- as reviewed): a change is recorded by field name, without its value, through listing_event_context.extra_fields.
-- The seller's solicitor is not stored here: the listing reads it from its sale file (sales.seller_lawyer_*).
ALTER TABLE listings ADD COLUMN occupancy TEXT NOT NULL DEFAULT 'unknown' CHECK(occupancy IN ('unknown','vacant','tenanted'));
ALTER TABLE listings ADD COLUMN rental_licence TEXT NOT NULL DEFAULT 'unknown'
  CHECK(rental_licence IN ('unknown','provided','verified','not_applicable'));
ALTER TABLE listings ADD COLUMN rental_licence_ref TEXT CHECK(rental_licence_ref IS NULL OR length(rental_licence_ref) <= 100);
ALTER TABLE listings ADD COLUMN rental_licence_valid_until TEXT;
ALTER TABLE listings ADD COLUMN energy_certificate TEXT NOT NULL DEFAULT 'unknown'
  CHECK(energy_certificate IN ('unknown','provided','verified','not_applicable'));
ALTER TABLE listings ADD COLUMN energy_certificate_ref TEXT CHECK(energy_certificate_ref IS NULL OR length(energy_certificate_ref) <= 100);
ALTER TABLE listings ADD COLUMN energy_certificate_valid_until TEXT;
