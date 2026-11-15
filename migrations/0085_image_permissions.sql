-- AGE-10 (M07): which photos of a property's shared capture (SPR-03, 0084) may be shown to a client in a private
-- presentation, decided by a person, one file at a time. Staff only, read and written by server/private-media.js with
-- AGE10_PHOTOS_READY=1. Nothing here publishes, sends or changes a file: a branded photo stays internal and its file
-- is never altered; the presentation itself (AGE-11/AGE-12) reads these decisions later.
-- Additive: one new table; no existing row changes.
-- One row per decision, never rewritten: the latest version of a photo (media_id) is in force, and only for the file
-- it was taken on (original_etag and original_bytes, as SPR-03 checked it); a changed file is to review again.
-- status: private_approved (may be shown privately, with its basis), branded (has an agency's branding: internal,
-- waiting for a suitable version), denied (not authorised to share), revoked (a permission given and withdrawn).
-- basis: own (Hampton's own photo), supplied_unbranded (a version without branding supplied by the advertiser or
-- owner) or authorized_unbranded (without branding, and the advertiser authorised sharing it); the last two name their
-- evidence. source: the photo's provenance as it stood (origin, agency, permission recorded at import, who added it).
CREATE TABLE image_permissions (
  id INTEGER PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  status TEXT NOT NULL CHECK(status IN ('private_approved','branded','denied','revoked')),
  basis TEXT CHECK(basis IN ('own','supplied_unbranded','authorized_unbranded')),
  evidence_ref TEXT,
  capture_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  original_etag TEXT NOT NULL,
  original_bytes INTEGER NOT NULL CHECK(original_bytes >= 0),
  source TEXT NOT NULL CHECK(json_valid(source) AND json_type(source)='object'),
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  UNIQUE(media_id, version),
  CHECK((status = 'private_approved') = (basis IS NOT NULL)),
  CHECK(basis IS NULL OR basis = 'own' OR evidence_ref IS NOT NULL)
);
