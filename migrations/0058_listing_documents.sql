-- PUB-11: private PDF documents per listing, served only to staff with PUB11_DOCUMENTS_READY=1.
-- Additive: one new table and index. Separate from media so no public reader, sitemap or /media
-- delivery can ever list or serve a document. A row is the durable intent for its R2 object:
-- 'pending' until the bytes are stored, 'removing' until the object is deleted. Only 'stored' is
-- shown or downloaded. The listing foreign key has no cascade: a listing with documents is kept.
CREATE TABLE listing_documents (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  r2_key TEXT NOT NULL UNIQUE CHECK (r2_key GLOB 'private-docs/*'),
  label TEXT CHECK (label IS NULL OR length(label) <= 200),
  bytes INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 20971520),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  visibility TEXT NOT NULL DEFAULT 'staff' CHECK (visibility = 'staff'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','stored','removing')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX listing_documents_listing ON listing_documents(listing_id, status, created_at);
