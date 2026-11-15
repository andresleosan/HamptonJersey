-- SPR-03 (M07): the shared record of a property captured when its availability is confirmed (EST-16, also through an
-- answer of AGE-06). One capture per confirmation that says available, shared by every client of that property: the
-- property's data as it stood, the confirmation's evidence and the advert it was linked to (BUS-07), and one row per
-- photo or floor plan the property had then, each with its own state. Staff only, read and written by
-- server/property-captures.js with SPR03_CAPTURE_READY=1; the website never reads these tables and nothing here sends.
-- Additive: two new tables and an index; no existing row changes.
-- data: a JSON snapshot of the property's own fields (never a client's), written once and never rewritten.
-- state: queued while files wait to be checked (a few per request), then complete (every file stored) or partial (one
-- missing, or none). A file checked again that is gone sends it back to partial.
-- Rows go with their listing when a draft is deleted, like its availability confirmations (0072).
CREATE TABLE property_captures (
  id INTEGER PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  confirmation_id INTEGER NOT NULL UNIQUE REFERENCES availability_confirmations(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK(operation IN ('sale','rent','business')),
  data TEXT NOT NULL CHECK(json_valid(data) AND json_type(data)='object'),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','complete','partial')),
  -- How many of its files were stored when state was last written: a change writes one event and updates its task.
  files_stored INTEGER CHECK(files_stored IS NULL OR files_stored >= 0),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  -- When its files were last checked: the panel shows the state as of then, without looking in storage.
  checked_at TEXT
);
CREATE INDEX property_captures_listing ON property_captures(listing_id, id);
-- One file of a capture. media_id names the photo it was taken from (no foreign key: deleting that photo later keeps
-- this row, and its download then says the file is missing). blob_key: the stored file, never served by the public
-- media route; NULL when the photo was only a link to its source (source_url), which is not downloaded here.
-- stored: the file was found in storage, with its size and type; failed: it was not; blocked: only a link, and
-- downloading from that source needs a permission this capture does not have.
CREATE TABLE property_capture_assets (
  id INTEGER PRIMARY KEY,
  capture_id INTEGER NOT NULL REFERENCES property_captures(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('photo','floorplan')),
  position INTEGER NOT NULL,
  label TEXT,
  blob_key TEXT,
  source_url TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','stored','failed','blocked')),
  content_type TEXT,
  bytes INTEGER CHECK(bytes IS NULL OR bytes >= 0),
  -- The stored file's etag when it was checked (a HEAD, its bytes are never read): a file whose etag or size changed
  -- since is not downloaded, and the data never say complete for it.
  etag TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT,
  UNIQUE(capture_id, media_id)
);
