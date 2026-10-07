-- Keep which property a viewing was for, even if that listing is later deleted (listing_id is SET NULL).
ALTER TABLE viewing_requests ADD COLUMN listing_ref TEXT;
ALTER TABLE viewing_requests ADD COLUMN listing_title_snapshot TEXT;
