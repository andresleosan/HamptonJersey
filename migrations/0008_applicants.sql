-- Display name for an admin in the panel (NULL = show the email).
ALTER TABLE admins ADD COLUMN name TEXT;

-- One person: at least an email or an international phone, each unique, plus consent and last activity (retention clock).
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  email TEXT CHECK (email = lower(email) AND email <> '' AND email NOT GLOB '*[ ]*'),
  phone TEXT CHECK (phone GLOB '+[1-9]*' AND substr(phone, 2) NOT GLOB '*[^0-9]*'),
  preferred_channel TEXT CHECK (preferred_channel IS NULL OR preferred_channel IN ('whatsapp','call','email')),
  best_time TEXT,
  privacy_ack_at TEXT, marketing_opt_in_at TEXT,
  consent_source TEXT CHECK (consent_source IS NULL OR consent_source IN ('web','phone','walk_in','email')),
  last_activity_at TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX contacts_email ON contacts(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX contacts_phone ON contacts(phone) WHERE phone IS NOT NULL;

-- One search by a contact (to let or to buy); budgets in GBP, per month when renting. JSON lists are checked by the app.
CREATE TABLE applicants (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  operation TEXT NOT NULL CHECK (operation IN ('rent','buy')),
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','searching','viewing','offer','agreed','completed','paused','lost')),
  lost_reason TEXT,
  source TEXT NOT NULL CHECK (source IN ('web','phone','walk_in','email')),
  assigned_to TEXT,
  budget_min REAL CHECK (budget_min IS NULL OR budget_min > 0),
  budget_max REAL CHECK (budget_max IS NULL OR budget_max > 0),
  budget_stretch REAL CHECK (budget_stretch IS NULL OR budget_stretch > 0),
  property_types TEXT,
  bedrooms_min INTEGER CHECK (bedrooms_min IS NULL OR bedrooms_min >= 0),
  bedrooms_ideal INTEGER CHECK (bedrooms_ideal IS NULL OR bedrooms_ideal >= 0),
  bathrooms_min INTEGER CHECK (bathrooms_min IS NULL OR bathrooms_min >= 0),
  parking_spaces INTEGER CHECK (parking_spaces IS NULL OR parking_spaces BETWEEN 0 AND 3),
  outdoor TEXT,
  furnished TEXT CHECK (furnished IS NULL OR furnished IN ('yes','no','either')),
  pets TEXT,
  parishes_wanted TEXT, parishes_excluded TEXT, near TEXT,
  move_in_date TEXT,
  lease_term_months INTEGER CHECK (lease_term_months IS NULL OR lease_term_months > 0),
  buyer_position TEXT CHECK (buyer_position IS NULL OR buyer_position IN ('first_time','nothing_to_sell','needs_to_sell','cash')),
  mortgage_aip TEXT CHECK (mortgage_aip IS NULL OR mortgage_aip IN ('yes','no','in_progress')),
  housing_status TEXT CHECK (housing_status IS NULL OR housing_status IN
    ('permanent_entitled','entitled','licensed','licensed_lease_only','entitled_work_only','standard','not_sure')),
  household_adults INTEGER CHECK (household_adults IS NULL OR household_adults >= 0),
  household_children INTEGER CHECK (household_children IS NULL OR household_children >= 0),
  requirements TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT,
  archived_at TEXT
);
CREATE INDEX applicants_operation ON applicants(operation, created_at);
CREATE INDEX applicants_contact ON applicants(contact_id);

-- Everything that happens, per entity: actor is an admin email, 'public' or 'system'; data holds the changed fields as JSON.
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('applicant','contact','viewing','admin')),
  entity_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT
);
CREATE INDEX events_entity ON events(entity_type, entity_id, at);

-- What the team must see or do; the entity it points to is read from its event.
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL CHECK (category IN ('new_applicant','viewing')),
  title TEXT NOT NULL,
  action_required INTEGER NOT NULL CHECK (action_required IN (0,1)),
  created_at TEXT NOT NULL,
  resolved_at TEXT, resolved_by TEXT
);
CREATE INDEX notifications_open ON notifications(resolved_at, category, created_at);
-- The Feed reads newest first and stops at 200; closing an entity's notices finds them by event.
CREATE INDEX notifications_created ON notifications(created_at);
CREATE INDEX notifications_event ON notifications(event_id);

-- Viewing requests still 'new' get their event and an open notice, so the Inbox does not start empty (A15).
INSERT INTO events (at, actor, entity_type, entity_id, type)
  SELECT created_at, 'system', 'viewing', CAST(id AS TEXT), 'viewing.requested'
  FROM viewing_requests WHERE status = 'new' ORDER BY id;
INSERT INTO notifications (event_id, category, title, action_required, created_at)
  SELECT e.id, 'viewing', 'Viewing request: ' || v.name, 1, e.at
  FROM events e JOIN viewing_requests v ON e.entity_id = CAST(v.id AS TEXT)
  WHERE e.entity_type = 'viewing' AND e.type = 'viewing.requested'
  ORDER BY e.id;
