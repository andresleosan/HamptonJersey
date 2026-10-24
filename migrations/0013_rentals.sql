-- The owner of one or more managed properties (R3); approval_limit in whole pounds, above it a repair quote needs approval (R14).
CREATE TABLE landlords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  email TEXT CHECK (email IS NULL OR length(email) <= 120),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 120),
  approval_limit INTEGER CHECK (approval_limit IS NULL OR (approval_limit > 0 AND approval_limit <= 1000000)),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  archived_at TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT
);

-- A managed property (R1, R3); no cascade: archived, never deleted while it has tenancies (R19). has_gas NULL counts as yes.
-- Parish values are OPTIONS.parishes in server/applicants.js, checked by the app.
CREATE TABLE rentals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  landlord_id INTEGER NOT NULL REFERENCES landlords(id),
  address TEXT NOT NULL CHECK (length(address) BETWEEN 1 AND 200),
  parish TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('full','let_only')),
  fee_percent REAL CHECK (fee_percent IS NULL OR fee_percent BETWEEN 0 AND 100),
  has_gas INTEGER CHECK (has_gas IS NULL OR has_gas IN (0,1)),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  archived_at TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT,
  CHECK (service <> 'full' OR fee_percent IS NOT NULL)
);
CREATE INDEX rentals_landlord ON rentals(landlord_id);

-- A tenancy of a property (R4, R22, R24): rent and deposit in whole pounds, opening_balance in pence; no cascade (R19).
-- ended_on may be a future planned move-out; until then charges keep coming, even past a fixed end_on.
CREATE TABLE tenancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rental_id INTEGER NOT NULL REFERENCES rentals(id),
  payment_ref TEXT UNIQUE,
  tenant_name TEXT NOT NULL CHECK (length(tenant_name) BETWEEN 1 AND 120),
  tenant_email TEXT CHECK (tenant_email IS NULL OR length(tenant_email) <= 120),
  tenant_phone TEXT CHECK (tenant_phone IS NULL OR length(tenant_phone) <= 120),
  occupants TEXT CHECK (occupants IS NULL OR length(occupants) <= 500),
  kind TEXT NOT NULL CHECK (kind IN ('fixed','periodic')),
  regime TEXT NOT NULL CHECK (regime IN ('2011','2025')),
  start_on TEXT NOT NULL,
  end_on TEXT,
  rent INTEGER NOT NULL CHECK (rent > 0 AND rent <= 1000000),
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 28),
  deposit INTEGER CHECK (deposit IS NULL OR (deposit > 0 AND deposit <= 1000000)),
  deposit_received_on TEXT, deposit_protected_on TEXT,
  deposit_ref TEXT CHECK (deposit_ref IS NULL OR length(deposit_ref) <= 120),
  inventory_in_on TEXT, inventory_out_on TEXT,
  last_rent_change_on TEXT,
  notice_given_on TEXT,
  notice_by TEXT CHECK (notice_by IS NULL OR notice_by IN ('tenant','landlord')),
  collect_from TEXT,
  opening_balance INTEGER CHECK (opening_balance IS NULL OR (opening_balance >= 0 AND opening_balance <= 100000000)),
  ended_on TEXT,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT,
  CHECK (end_on IS NULL OR end_on > start_on),
  CHECK (kind <> 'fixed' OR end_on IS NOT NULL),
  CHECK ((notice_given_on IS NULL) = (notice_by IS NULL)),
  CHECK (collect_from IS NULL OR collect_from >= start_on),
  CHECK (ended_on IS NULL OR ended_on >= start_on)
);
-- R4: one active tenancy per property, enforced by the database too.
CREATE UNIQUE INDEX tenancies_active ON tenancies(rental_id) WHERE ended_on IS NULL;
CREATE INDEX tenancies_rental ON tenancies(rental_id, start_on);

-- The rent history of a tenancy in whole pounds (R6, R12, R28): the first row is the start, one change per date.
CREATE TABLE rent_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  effective_on TEXT NOT NULL,
  rent INTEGER NOT NULL CHECK (rent > 0 AND rent <= 1000000),
  created_at TEXT NOT NULL, created_by TEXT,
  UNIQUE (tenancy_id, effective_on)
);

-- What a full-service tenancy owes, in pence (R6, R22, R23): one rent charge per due date, plus the opening balance once.
CREATE TABLE charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  due_on TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  kind TEXT NOT NULL DEFAULT 'rent' CHECK (kind IN ('rent','opening')),
  edited INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0,1)),
  UNIQUE (tenancy_id, due_on, kind)
);

-- Money received, in pence (R7, R9, R25, R26); tenancy_id NULL is Unmatched. No cascade: payments outlive mistakes (R19).
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER REFERENCES tenancies(id),
  received_on TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  description TEXT CHECK (description IS NULL OR length(description) <= 300),
  kind TEXT NOT NULL DEFAULT 'rent' CHECK (kind IN ('rent','deposit','other')),
  source TEXT NOT NULL CHECK (source IN ('manual','import')),
  import_hash TEXT UNIQUE,
  created_at TEXT NOT NULL, created_by TEXT
);
CREATE INDEX payments_tenancy ON payments(tenancy_id, received_on);
-- The Unmatched list and the nav count read just these.
CREATE INDEX payments_unmatched ON payments(received_on) WHERE tenancy_id IS NULL;

-- Arrears steps marked done (R8, R27), tied to the oldest unpaid charge: keys are ARREARS_STEPS in server/rentals.js.
CREATE TABLE arrears_steps (
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  charge_due_on TEXT NOT NULL,
  step TEXT NOT NULL,
  done_at TEXT NOT NULL, done_by TEXT,
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  PRIMARY KEY (tenancy_id, charge_due_on, step)
) WITHOUT ROWID;

-- A property's legal checks (R10, R11): kinds are COMPLIANCE in server/rentals.js; no expires_on is "Not recorded".
CREATE TABLE compliance_items (
  rental_id INTEGER NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  done_on TEXT, expires_on TEXT,
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  updated_at TEXT, updated_by TEXT,
  PRIMARY KEY (rental_id, kind)
) WITHOUT ROWID;

-- A repair (R14) in whole pounds; quotes above the landlord's approval_limit go through awaiting_approval.
CREATE TABLE repairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rental_id INTEGER NOT NULL REFERENCES rentals(id),
  tenancy_id INTEGER REFERENCES tenancies(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  detail TEXT CHECK (detail IS NULL OR length(detail) <= 2000),
  urgency TEXT NOT NULL CHECK (urgency IN ('emergency','urgent','routine')),
  status TEXT NOT NULL DEFAULT 'reported'
    CHECK (status IN ('reported','awaiting_approval','approved','in_progress','done','cancelled')),
  contractor TEXT CHECK (contractor IS NULL OR length(contractor) <= 120),
  quote INTEGER CHECK (quote IS NULL OR (quote > 0 AND quote <= 1000000)),
  cost INTEGER CHECK (cost IS NULL OR (cost > 0 AND cost <= 1000000)),
  done_on TEXT,
  charge_landlord INTEGER NOT NULL DEFAULT 1 CHECK (charge_landlord IN (0,1)),
  approved_at TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT,
  CHECK (status <> 'done' OR (done_on IS NOT NULL AND cost IS NOT NULL))
);
CREATE INDEX repairs_rental ON repairs(rental_id, created_at);
-- Open repairs only: the to-do list and the nav's emergency count read just these.
CREATE INDEX repairs_open ON repairs(urgency, rental_id) WHERE status NOT IN ('done','cancelled');

-- The managed rentals history (R18); rental_id NULL for landlord events. Kept out of events, whose CHECK stays as it is.
CREATE TABLE rental_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rental_id INTEGER REFERENCES rentals(id) ON DELETE CASCADE,
  tenancy_id INTEGER REFERENCES tenancies(id),
  at TEXT NOT NULL,
  actor TEXT,
  type TEXT NOT NULL,
  data TEXT CHECK (data IS NULL OR json_valid(data))
);
CREATE INDEX rental_events_rental ON rental_events(rental_id, at);

-- Team settings as JSON (R9, R12, R29): rpi {percent, as_of}, gst_percent, csv_map:<header hash>.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value)),
  updated_at TEXT NOT NULL, updated_by TEXT
) WITHOUT ROWID;
