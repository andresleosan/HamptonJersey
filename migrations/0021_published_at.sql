-- PUB-22 (spec 2026-11-06): when a listing last went on the website. The site orders "newest" by it: its home page
-- shows the 5 newest and /properties lists newest first. Set by publishing a hidden listing (server/routes/listings.js
-- setState); hiding keeps it. Listings on the website today start from their last edit.
ALTER TABLE listings ADD COLUMN published_at TEXT;
UPDATE listings SET published_at = updated_at WHERE published = 1;
