-- A buyer's offer on a listing for sale (V4, V12) in whole pounds; the seller's counter stays once made (V21).
CREATE TABLE offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  conditions TEXT CHECK (conditions IS NULL OR length(conditions) <= 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','countered','accepted','rejected','withdrawn')),
  counter_amount INTEGER CHECK (counter_amount IS NULL OR (counter_amount > 0 AND counter_amount <= 100000000)),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT,
  CHECK (status <> 'pending' OR counter_amount IS NULL),
  CHECK (status <> 'countered' OR counter_amount IS NOT NULL)
);
CREATE INDEX offers_listing ON offers(listing_id, status);
CREATE INDEX offers_applicant ON offers(applicant_id);
-- Open offers only, by last change: the Sales list and the nav's Waiting count read just these.
CREATE INDEX offers_open ON offers(updated_at) WHERE status IN ('pending','countered');

-- The sale opened by an accepted offer (V7, V3); no cascade: a listing or buyer with a sale is kept 5 years (V14, V16).
CREATE TABLE sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  applicant_id INTEGER NOT NULL REFERENCES applicants(id),
  offer_id INTEGER NOT NULL UNIQUE REFERENCES offers(id),
  price INTEGER NOT NULL CHECK (price > 0 AND price <= 100000000),
  route TEXT CHECK (route IS NULL OR route IN ('freehold','share_transfer')),
  seller_name TEXT, seller_phone TEXT, seller_email TEXT,
  buyer_lawyer_firm TEXT, buyer_lawyer_name TEXT, buyer_lawyer_email TEXT, buyer_lawyer_phone TEXT,
  seller_lawyer_firm TEXT, seller_lawyer_name TEXT, seller_lawyer_email TEXT, seller_lawyer_phone TEXT,
  target_date TEXT,
  fee INTEGER CHECK (fee IS NULL OR (fee > 0 AND fee <= 100000000)),
  shared_agency TEXT,
  shared_fee INTEGER CHECK (shared_fee IS NULL OR shared_fee > 0),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','fallen_through')),
  fell_through_reason TEXT CHECK (fell_through_reason IS NULL OR
    fell_through_reason IN ('buyer_withdrew','seller_withdrew','finance','survey','chain','other')),
  fell_through_note TEXT CHECK (fell_through_note IS NULL OR length(fell_through_note) <= 300),
  closed_at TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT,
  CHECK (shared_fee IS NULL OR (fee IS NOT NULL AND shared_fee <= fee)),
  CHECK ((status = 'fallen_through') = (fell_through_reason IS NOT NULL)),
  CHECK ((status = 'in_progress') = (closed_at IS NULL))
);
-- V5, V19: one sale in progress per listing and per buyer, enforced by the database too.
CREATE UNIQUE INDEX sales_listing_open ON sales(listing_id) WHERE status = 'in_progress';
CREATE UNIQUE INDEX sales_applicant_open ON sales(applicant_id) WHERE status = 'in_progress';

-- The nine steps of a sale (V8): keys are the MILESTONES constant in server/sales.js, so the list can change without a migration.
CREATE TABLE sale_milestones (
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  planned_on TEXT, done_on TEXT,
  not_needed INTEGER NOT NULL DEFAULT 0 CHECK (not_needed IN (0,1)),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  CHECK (done_on IS NULL OR not_needed = 0),
  PRIMARY KEY (sale_id, key)
) WITHOUT ROWID;
