-- ADM-12 (ADM12_SUPPLIERS_READY): a minimal supplier directory and the landlord's approval of a repair recorded by hand.
-- Additive: one new table and four optional columns on repairs. No row is rewritten: the free-text contractor stays as
-- it was and is linked to a supplier only when the team chooses one.
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  trade TEXT CHECK (trade IS NULL OR length(trade) <= 60),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 120),
  email TEXT CHECK (email IS NULL OR length(email) <= 254),
  archived_at TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT
);

-- The approval: the amount the landlord agreed (whole pounds, like quote and cost), where it is on record (e.g. "Email
-- of 3 Nov") and the day they gave it. approved_at stays the moment the team recorded it.
ALTER TABLE repairs ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id);
ALTER TABLE repairs ADD COLUMN approved_amount INTEGER CHECK (approved_amount IS NULL OR (approved_amount > 0 AND approved_amount <= 1000000));
ALTER TABLE repairs ADD COLUMN approval_ref TEXT CHECK (approval_ref IS NULL OR length(approval_ref) <= 200);
ALTER TABLE repairs ADD COLUMN approved_on TEXT;
