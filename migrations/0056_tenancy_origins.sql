-- ADM-06: additive only. Read and written by server/tenancy-origins.js, behind ADM06_TENANCY_ORIGIN_READY.

-- A tenancy entered from a Let agreed listing and an applicant that staff picked by hand (never matched by address or
-- name). operation_id makes the commit idempotent. listing_id and applicant_id are plain ids, not foreign keys: a listing
-- rebuild, a deleted listing or the applicants' retention must neither be blocked by nor rewrite this record.
CREATE TABLE tenancy_origins (
  tenancy_id INTEGER PRIMARY KEY REFERENCES tenancies(id),
  operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) BETWEEN 8 AND 80),
  rental_id INTEGER NOT NULL REFERENCES rentals(id),
  listing_id TEXT NOT NULL,
  applicant_id INTEGER NOT NULL,
  listing_updated_at TEXT NOT NULL,
  applicant_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL, created_by TEXT NOT NULL
);
CREATE INDEX tenancy_origins_listing ON tenancy_origins(listing_id);

-- The signed contract is kept outside the app: an opaque reference a person reviewed, never a file, URL or storage key.
CREATE TABLE tenancy_signed_contracts (
  tenancy_id INTEGER PRIMARY KEY REFERENCES tenancies(id),
  evidence_ref TEXT NOT NULL CHECK (length(evidence_ref) BETWEEN 1 AND 120),
  reviewed_at TEXT NOT NULL, reviewed_by TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1)
);

-- The entry inventory, one per tenancy, saved by revision (compare-and-set). rooms [{name, observations}],
-- meter_readings [{meter, reading, unit}], evidence_refs [{evidence_ref, reviewed_at, reviewed_by, revision}] (max 20).
CREATE TABLE tenancy_entry_inventories (
  tenancy_id INTEGER PRIMARY KEY REFERENCES tenancies(id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  rooms TEXT NOT NULL CHECK (json_valid(rooms) AND json_type(rooms) = 'array'),
  meter_readings TEXT NOT NULL CHECK (json_valid(meter_readings) AND json_type(meter_readings) = 'array'),
  evidence_refs TEXT NOT NULL CHECK (json_valid(evidence_refs) AND json_type(evidence_refs) = 'array'
    AND json_array_length(evidence_refs) <= 20),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
