-- QA ONLY: import on NEW EMPTY hampton-qa-history, NEVER hampton.

-- BEGIN 0001_init.sql (QA data-safe variant)
CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  use TEXT NOT NULL CHECK (use IN ('residential','commercial')),
  title TEXT NOT NULL,
  property_type TEXT,
  operation TEXT NOT NULL CHECK (operation IN ('sale','rent','business')),
  availability TEXT NOT NULL CHECK (availability IN ('for_sale','under_offer','sold','to_let','lease','not_stated','withdrawn')),
  country TEXT, location TEXT, road_name TEXT,
  bedrooms INTEGER CHECK (bedrooms IS NULL OR bedrooms >= 0),
  bathrooms INTEGER CHECK (bathrooms IS NULL OR bathrooms >= 0),
  tenure TEXT,
  sale_price REAL CHECK (sale_price IS NULL OR sale_price > 0),
  rent REAL CHECK (rent IS NULL OR rent > 0),
  rent_period TEXT CHECK (rent_period IS NULL OR rent_period IN ('month','year')),
  premium REAL CHECK (premium IS NULL OR premium > 0),
  currency TEXT CHECK (currency IS NULL OR currency IN ('GBP','EUR')),
  price_text TEXT, summary TEXT, description TEXT, tour_url TEXT,
  specs TEXT NOT NULL DEFAULT '[]',
  cover_media_id TEXT,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  archived_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  r2_key TEXT, thumb_key TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('hampton','external','upload')),
  kind TEXT NOT NULL CHECK (kind IN ('photo','floorplan','aerial','document')),
  label TEXT,
  public INTEGER NOT NULL DEFAULT 0 CHECK (public IN (0,1)),
  position INTEGER NOT NULL DEFAULT 0,
  content_type TEXT, width INTEGER, height INTEGER, bytes INTEGER,
  source_url TEXT, provider TEXT, rights_status TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  CHECK (origin <> 'external' OR public = 0)
);
CREATE INDEX media_listing ON media(listing_id, position);

CREATE TABLE viewing_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  agent TEXT, kind TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  created_at TEXT NOT NULL, updated_at TEXT, updated_by TEXT
);
CREATE INDEX viewing_status ON viewing_requests(status, created_at);

CREATE TABLE admins (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  added_by TEXT, added_at TEXT NOT NULL
);
-- QA: no administrator is seeded.

-- Investigación: copia literal de /root/Hampton_Database/hampton_properties.sqlite, solo lectura.
CREATE TABLE research_properties (
  property_id TEXT PRIMARY KEY, hampton_record_id TEXT, name TEXT, matched_name TEXT, collection TEXT,
  catalogue_scope TEXT, country TEXT, location TEXT, road_name TEXT, property_type TEXT, raw_status TEXT,
  availability TEXT, asking_text TEXT, asking_amount REAL, currency TEXT, price_basis TEXT, bedrooms REAL,
  bathrooms REAL, hampton_source_url TEXT, hampton_summary TEXT, hampton_description TEXT,
  source_updated_date TEXT, raw_numeric_price REAL, match_status TEXT, match_confidence TEXT,
  match_reason TEXT, external_source_count REAL, missing_information TEXT, next_action TEXT,
  research_date TEXT, page_fetch_error TEXT, duplicate_group TEXT, hampton_asset_count REAL,
  external_asset_count REAL, floorplan_reference_count REAL, issue_count REAL,
  advertising_evidence_class TEXT, independent_advertising_match TEXT, evidence_basis TEXT
);
CREATE TABLE research_sources (
  source_id TEXT PRIMARY KEY, property_id TEXT, origin TEXT, title TEXT, url TEXT, accessed_on TEXT,
  source_type TEXT, access_level TEXT, observed_status TEXT, price_text TEXT, source_date TEXT,
  summary TEXT, match_relevance TEXT, agent_or_site TEXT
);
CREATE INDEX research_sources_property ON research_sources(property_id);
CREATE TABLE research_facts (
  fact_id TEXT PRIMARY KEY, property_id TEXT, source_id TEXT, origin TEXT, field TEXT, value TEXT,
  confidence TEXT, context TEXT
);
CREATE INDEX research_facts_property ON research_facts(property_id);
CREATE TABLE research_financial_terms (
  term_id TEXT PRIMARY KEY, property_id TEXT, source_id TEXT, term_type TEXT, amount REAL, currency TEXT,
  period TEXT, qualifier TEXT, notes TEXT, source_url TEXT
);
CREATE INDEX research_terms_property ON research_financial_terms(property_id);
CREATE TABLE research_issues (
  issue_id TEXT PRIMARY KEY, property_ids TEXT, field TEXT, severity TEXT, issue TEXT, evidence TEXT,
  source_urls TEXT, proposed_action TEXT, confidence TEXT
);
CREATE TABLE research_search_log (
  search_id TEXT PRIMARY KEY, property_id TEXT, date TEXT, query TEXT, engine TEXT, outcome TEXT
);
CREATE INDEX research_search_property ON research_search_log(property_id);


-- BEGIN 0002_deleted_listings.sql (QA data-safe variant)
-- Tombstones: a listing deleted for good in the panel must never come back through a re-run of the import.
CREATE TABLE deleted_listings (
  id TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL,
  deleted_by TEXT
);


-- BEGIN 0003_viewing_listing_snapshot.sql (QA data-safe variant)
-- Keep which property a viewing was for, even if that listing is later deleted (listing_id is SET NULL).
ALTER TABLE viewing_requests ADD COLUMN listing_ref TEXT;
ALTER TABLE viewing_requests ADD COLUMN listing_title_snapshot TEXT;


-- BEGIN 0004_featured_rank.sql (QA data-safe variant)
-- Homepage order for promoted listings: 1 shows first and in the hero; NULL means not featured.
ALTER TABLE listings ADD COLUMN featured_rank INTEGER CHECK (featured_rank IS NULL OR featured_rank BETWEEN 1 AND 99);


-- BEGIN 0005_viewing_notes.sql (QA data-safe variant)
-- Internal notes on a viewing request, kept by staff in the panel (never shown on the website).
ALTER TABLE viewing_requests ADD COLUMN notes TEXT;


-- BEGIN 0006_home_order.sql (QA data-safe variant)
-- Order of listings on the home page (carousel, portfolio, Featured blocks), set by dragging rows in the panel. NULL = after the ordered ones.
ALTER TABLE listings ADD COLUMN home_order INTEGER CHECK (home_order IS NULL OR home_order >= 1);


-- BEGIN 0007_tours.sql (QA data-safe variant)
-- 3D tours shown next to the booking form on the home page, managed from the panel's "3D tours" section.
CREATE TABLE tours (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  url TEXT NOT NULL CHECK (url LIKE 'https://%'),
  caption TEXT,
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- The Matterport sample space the first demo used: shows visitors what a Hampton 3D tour looks like.
INSERT INTO tours (title, url, caption, position, created_at, updated_at) VALUES
  ('Sample 3D tour', 'https://my.matterport.com/show/?m=JGPnGQ6hosj&play=1&qs=1&brand=0',
   'A Matterport walkthrough like the ones we can film for your home. Drag to look around.', 1,
   '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z');


-- BEGIN 0008_applicants.sql (QA data-safe variant)
-- Display name for an admin in the panel (NULL = show the email).
ALTER TABLE admins ADD COLUMN name TEXT;

-- One person: at least an email or an international phone, each unique, plus consent and last activity (retention clock).
-- AUTOINCREMENT (here and in applicants): a permanently deleted id is never reused, so its history never attaches to someone new.
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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


-- BEGIN 0009_matches.sql (QA data-safe variant)
-- Parish of a listing (the 12 of OPTIONS.parishes in server/applicants.js; NULL = unknown), set by the app or the team.
ALTER TABLE listings ADD COLUMN parish TEXT CHECK (parish IS NULL OR parish IN ('Grouville','St Brelade','St Clement',
  'St Helier','St John','St Lawrence','St Martin','St Mary','St Ouen','St Peter','St Saviour','Trinity'));
-- Whether the listing is offered to applicants (B9).
ALTER TABLE listings ADD COLUMN matchable INTEGER NOT NULL DEFAULT 0 CHECK (matchable IN (0,1));
-- Features read from the listing's text when it is saved (B10); NULL = not said. Outdoor is a JSON list of garden|terrace|balcony.
ALTER TABLE listings ADD COLUMN feat_pets TEXT CHECK (feat_pets IS NULL OR feat_pets IN ('yes','no'));
ALTER TABLE listings ADD COLUMN feat_parking INTEGER CHECK (feat_parking IS NULL OR feat_parking >= 0);
ALTER TABLE listings ADD COLUMN feat_furnished TEXT CHECK (feat_furnished IS NULL OR feat_furnished IN ('yes','no'));
ALTER TABLE listings ADD COLUMN feat_outdoor TEXT;
ALTER TABLE listings ADD COLUMN feat_type TEXT CHECK (feat_type IS NULL OR feat_type IN ('flat','house','cottage','studio'));
-- JSON {pets, parking, furnished, outdoor, type} → the phrase (≤120 chars) each feature was read from.
ALTER TABLE listings ADD COLUMN feat_evidence TEXT;
-- When the features were last read; NULL = still pending.
ALTER TABLE listings ADD COLUMN features_at TEXT;

-- Offered from the start: published listings and the agency import of 2026-10-08 (HE-R028 to HE-R285, B9).
UPDATE listings SET matchable = 1 WHERE published = 1 OR id BETWEEN 'HE-R028' AND 'HE-R285';

-- When the team first reviewed one of this applicant's matches (B13); kept on Undo.
ALTER TABLE applicants ADD COLUMN first_reviewed_at TEXT;
-- The review queue walks the active searches (F0: not archived, lost or completed), oldest first.
-- Its WHERE must match CLOSED_STAGES in server/applicants.js, or the planner stops using it for activeSql().
CREATE INDEX applicants_queue ON applicants(created_at) WHERE archived_at IS NULL AND stage NOT IN ('lost', 'completed');

-- A listing proposed to an applicant; checks is the JSON list of requirements with their evidence. A reason only when rejected.
CREATE TABLE matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  checks TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('found','shortlisted','rejected')),
  reject_reason TEXT CHECK (reject_reason IS NULL OR (status = 'rejected'
    AND reject_reason IN ('price','area','size','condition','other'))),
  reviewed_by TEXT, reviewed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (applicant_id, listing_id)
);
-- The review queue and the per-applicant counts read by status; a listing's save finds its matches by listing.
CREATE INDEX matches_status ON matches(status, applicant_id);
CREATE INDEX matches_listing ON matches(listing_id);

-- notifications gains the 'matched' category; SQLite cannot change a CHECK, so the table is rebuilt with the same ids and rows.
-- No table references notifications, so dropping it is safe with foreign keys on.
CREATE TABLE notifications_new (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL CHECK (category IN ('new_applicant','viewing','matched')),
  title TEXT NOT NULL,
  action_required INTEGER NOT NULL CHECK (action_required IN (0,1)),
  created_at TEXT NOT NULL,
  resolved_at TEXT, resolved_by TEXT
);
INSERT INTO notifications_new (id, event_id, category, title, action_required, created_at, resolved_at, resolved_by)
  SELECT id, event_id, category, title, action_required, created_at, resolved_at, resolved_by FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;
-- The same three indexes as 0008 (dropped with the old table).
CREATE INDEX notifications_open ON notifications(resolved_at, category, created_at);
CREATE INDEX notifications_created ON notifications(created_at);
CREATE INDEX notifications_event ON notifications(event_id);


-- BEGIN 0010_viewings.sql (QA data-safe variant)
-- Who shows the houses (C1): apart from admins. hours is JSON mon…sun, each null (day off) or ["HH:MM","HH:MM"] (C2).
CREATE TABLE negotiators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  role TEXT CHECK (role IS NULL OR length(role) <= 80),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  hours TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT
);
-- QA: no real staff identities are seeded.

-- A date that differs from the week (C3): block (all day without hours, or from–to) or open (a span replacing that day's hours).
CREATE TABLE negotiator_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negotiator_id INTEGER NOT NULL REFERENCES negotiators(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('block','open')),
  start_time TEXT, end_time TEXT,
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  created_at TEXT NOT NULL, created_by TEXT,
  CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CHECK (start_time IS NULL OR start_time < end_time),
  CHECK (kind = 'block' OR start_time IS NOT NULL)
);
-- The slot calculation reads one negotiator's exceptions by date range.
CREATE INDEX negotiator_exceptions_day ON negotiator_exceptions(negotiator_id, date);

-- viewing_requests gets the C7 states, a negotiator, an end time and an outcome, and email becomes optional (C14).
-- SQLite cannot change a CHECK, so the table is rebuilt with the same ids and rows; no table references it.
CREATE TABLE viewing_requests_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  agent TEXT, kind TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT, phone TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','completed','no_show','cancelled')),
  created_at TEXT NOT NULL, updated_at TEXT, updated_by TEXT,
  listing_ref TEXT, listing_title_snapshot TEXT, notes TEXT,
  negotiator_id INTEGER REFERENCES negotiators(id) ON DELETE SET NULL,
  end_time TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('proceed','more_info','not_interested')),
  outcome_note TEXT CHECK (outcome_note IS NULL OR length(outcome_note) <= 500),
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK (outcome IS NULL OR status = 'completed')
);
-- C8: new → requested, contacted → confirmed, closed → completed if its date has passed, else cancelled
-- (the UTC date of the migration day is enough for closed rows). The text agent links to the negotiator of that name.
INSERT INTO viewing_requests_new (id, listing_id, agent, kind, date, time, name, email, phone, status, created_at,
    updated_at, updated_by, listing_ref, listing_title_snapshot, notes, negotiator_id, end_time)
  SELECT id, listing_id, agent, kind, date, time, name, email, phone,
    CASE status WHEN 'new' THEN 'requested' WHEN 'contacted' THEN 'confirmed'
      WHEN 'closed' THEN CASE WHEN date < date('now') THEN 'completed' ELSE 'cancelled' END END,
    created_at, updated_at, updated_by, listing_ref, listing_title_snapshot, notes,
    (SELECT id FROM negotiators WHERE name = agent), substr(time(time, '+30 minutes'), 1, 5)
  FROM viewing_requests;
-- Ids of deleted requests stay retired (their events still name them): the new table takes over the old counter.
DELETE FROM sqlite_sequence WHERE name = 'viewing_requests_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'viewing_requests_new', seq FROM sqlite_sequence WHERE name = 'viewing_requests';
DROP TABLE viewing_requests;
ALTER TABLE viewing_requests_new RENAME TO viewing_requests;
-- The 0001 index (dropped with the old table) and one for the slot calculation: a negotiator's viewings by date.
CREATE INDEX viewing_status ON viewing_requests(status, created_at);
CREATE INDEX viewing_negotiator_day ON viewing_requests(negotiator_id, date);
-- A listing's viewings by date: its active interest (C10) and the panel's viewings of one listing.
CREATE INDEX viewing_listing ON viewing_requests(listing_id, date);


-- BEGIN 0011_daily_stats.sql (QA data-safe variant)
-- I1: website opens per listing, Jersey day and metric; counts only, nothing about the visitor.
CREATE TABLE daily_stats (
  day TEXT NOT NULL,                        -- YYYY-MM-DD, Jersey
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('view','photos','tour')),
  n INTEGER NOT NULL DEFAULT 0 CHECK (n >= 0),
  PRIMARY KEY (day, listing_id, metric)
) WITHOUT ROWID;


-- BEGIN 0012_sales.sql (QA data-safe variant)
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


-- BEGIN 0013_rentals.sql (QA data-safe variant)
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
-- Covering: balances and the oldest unpaid charge (ARREARS_SQL) read only the index. The UNIQUE above stays for its rule.
CREATE INDEX charges_cover ON charges(tenancy_id, due_on, kind, amount);

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
-- Covering: a tenancy's payments by date, and its rent paid (ARREARS_SQL), read only the index.
CREATE INDEX payments_tenancy ON payments(tenancy_id, received_on, kind, amount);
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

-- Team settings as JSON (R9, R12, R29): rpi {percent, as_of}, gst_percent, csv_map:<header hash>; rentals_count {n, at} is
-- the nav count's cache (P16).
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value)),
  updated_at TEXT NOT NULL, updated_by TEXT
) WITHOUT ROWID;

-- P16: every rental write logs here in its own batch, so this drops the nav's cached Rentals count in the same transaction.
CREATE TRIGGER rental_events_count AFTER INSERT ON rental_events BEGIN
  DELETE FROM app_settings WHERE key = 'rentals_count';
END;


-- BEGIN 0014_retention.sql (QA data-safe variant)
-- G2 (E10): the retention pass and the panel's Expiring count read contacts by last activity, only the rows in range.
CREATE INDEX contacts_activity ON contacts(last_activity_at);
-- E3: the exemption (a search with a sale, in any status) is checked per contact in that range; sales had only a partial
-- index on applicant_id.
CREATE INDEX sales_applicant ON sales(applicant_id);


-- BEGIN 0015_jersey_fields.sql (QA data-safe variant)
-- J1: the Jersey facts the matching reads (spec §3), as closed lists; NULL = not known (for restriction, none).
-- The old free-text tenure stays as it was; only its three exact values are carried over.
ALTER TABLE listings ADD COLUMN tenure_type TEXT
  CHECK (tenure_type IS NULL OR tenure_type IN ('freehold','flying_freehold','share_transfer','leasehold'));
ALTER TABLE listings ADD COLUMN housing_category TEXT
  CHECK (housing_category IS NULL OR housing_category IN ('qualified','registered'));
ALTER TABLE listings ADD COLUMN restriction TEXT
  CHECK (restriction IS NULL OR restriction IN ('first_time_buyer','over_55'));
UPDATE listings SET tenure_type = CASE lower(trim(tenure))
  WHEN 'freehold' THEN 'freehold' WHEN 'flying freehold' THEN 'flying_freehold' WHEN 'share transfer' THEN 'share_transfer' END
  WHERE lower(trim(tenure)) IN ('freehold', 'flying freehold', 'share transfer');


-- BEGIN 0016_interest_corrections.sql (QA data-safe variant)
-- VIS-02: the team's corrections to a listing's interest count (C10), kept on each viewing of the person. Removed: when,
-- why (a closed list) and an optional note, required for 'other'. Joined ("Counted twice"): the key of the person the
-- viewing counts as, an email or a phone's last 10 digits. Each column's CHECK names only columns added before it.
ALTER TABLE viewing_requests ADD COLUMN interest_removed_at TEXT;
ALTER TABLE viewing_requests ADD COLUMN interest_reason TEXT
  CHECK ((interest_reason IS NULL) = (interest_removed_at IS NULL)
    AND (interest_reason IS NULL OR interest_reason IN ('no_longer_interested','not_buyer','other')));
ALTER TABLE viewing_requests ADD COLUMN interest_note TEXT
  CHECK ((interest_note IS NULL OR (interest_reason IS NOT NULL AND length(interest_note) <= 200))
    AND (interest_reason IS NOT 'other' OR interest_note IS NOT NULL));
ALTER TABLE viewing_requests ADD COLUMN interest_same_as TEXT
  CHECK (interest_same_as IS NULL OR length(interest_same_as) BETWEEN 1 AND 254);


-- BEGIN 0017_to_confirm.sql (QA data-safe variant)
-- ADM-04: when the listing was last confirmed as still on the market: published, a new availability or price, a Sales
-- move, or Still available after a call to its owner. On the website and still on the market, it is To confirm 3 months
-- later, 1 for a rental (server/listing.js TO_CONFIRM). Until now, the last edit is the best date known.
ALTER TABLE listings ADD COLUMN confirmed_at TEXT;
UPDATE listings SET confirmed_at = updated_at;
-- The panel's counts poll (every 30 s) reads only the listings on the website, from this index alone.
CREATE INDEX listings_live ON listings(availability, operation, confirmed_at) WHERE published = 1 AND archived_at IS NULL;


-- BEGIN 0018_jobs.sql (QA data-safe variant)
-- AUT-13: the work the app leaves for Hampton's Hermes (spec 2026-10-31, H8). For now one kind, a listing's texts. A job
-- is queued, then working (taken by Hermes), then draft (waiting for a person in the panel), and ends used or discarded;
-- failed after 3 attempts. Hermes never writes the listing: a person uses the draft and saves (H10).
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('listing_text')),
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','working','draft','used','discarded','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  result TEXT CHECK (result IS NULL OR json_valid(result)),
  requested_by TEXT NOT NULL, -- an admin email or 'hermes'
  created_at TEXT NOT NULL, claimed_at TEXT, drafted_at TEXT, decided_at TEXT, decided_by TEXT
);
-- One open job per listing and kind; asking again while one is open answers with that one.
CREATE UNIQUE INDEX jobs_open ON jobs(listing_id, kind) WHERE status IN ('queued','working','draft');
-- Hermes's poll reads only the jobs still to do, oldest first.
CREATE INDEX jobs_todo ON jobs(created_at) WHERE status IN ('queued','working');


-- BEGIN 0019_last_contact.sql (QA data-safe variant)
-- SAP-07 + EST-11 (spec 2026-11-04, L1): the last real contact with the person, apart from last_activity_at (which team
-- edits also move, for the 12 months). Set by a registration, a repeated website form, Log conversation, a viewing
-- request, booking, confirmation, move or completion, and a recorded offer. Gone quiet = an active search over 14 days.
ALTER TABLE contacts ADD COLUMN last_contact_at TEXT;
-- L2: the contacts already there start from the latest such moment in their history.
UPDATE contacts SET last_contact_at = (SELECT MAX(t) FROM (
  SELECT contacts.created_at AS t
  UNION ALL SELECT a.created_at FROM applicants a WHERE a.contact_id = contacts.id
  UNION ALL SELECT o.created_at FROM offers o JOIN applicants a ON a.id = o.applicant_id WHERE a.contact_id = contacts.id
  UNION ALL SELECT e.at FROM events e WHERE e.entity_type = 'contact' AND e.entity_id = CAST(contacts.id AS TEXT)
    AND e.type IN ('contact.conversation', 'applicant.duplicate_submitted')
  UNION ALL SELECT CASE WHEN v.status IN ('confirmed', 'completed') THEN COALESCE(v.updated_at, v.created_at) ELSE v.created_at END
    -- Viewing phones are stored as typed: compared by their last 10 digits, as interestSql does (server/viewings.js).
    FROM viewing_requests v WHERE lower(v.email) = contacts.email OR (contacts.phone IS NOT NULL AND v.phone IS NOT NULL
      AND substr(replace(replace(replace(replace(replace(v.phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', ''), -10)
        = substr(contacts.phone, -10))));


-- BEGIN 0020_drive_imports.sql (QA data-safe variant)
-- PUB-21 (spec 2026-11-05): Properties Queue. A Google Drive folder sent from the panel with a note: queued, working
-- (Hermes reads its documents), ready (Hermes's proposal), review (a person created the draft), and ends published,
-- discarded or failed. Not in jobs: there a job belongs to a listing that already exists.
CREATE TABLE drive_imports (
  id INTEGER PRIMARY KEY,
  folder_id TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','working','ready','review','published','discarded','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  documents TEXT CHECK (documents IS NULL OR json_valid(documents)), -- what Hermes may download, set when it claims
  result TEXT CHECK (result IS NULL OR json_valid(result)),          -- the proposal and the photos chosen
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL, claimed_at TEXT, ready_at TEXT, decided_at TEXT, decided_by TEXT
);
-- Hermes's poll reads only the imports still to do, oldest first.
CREATE INDEX drive_imports_todo ON drive_imports(created_at) WHERE status IN ('queued','working');
-- D9: the folder a listing came from, so the same folder sent again is flagged.
ALTER TABLE listings ADD COLUMN drive_folder_id TEXT;
CREATE INDEX listings_drive_folder ON listings(drive_folder_id) WHERE drive_folder_id IS NOT NULL;


-- BEGIN 0021_published_at.sql (QA data-safe variant)
-- PUB-22 (spec 2026-11-06): when a listing last went on the website. The site orders "newest" by it: its home page
-- shows the 5 newest and /properties lists newest first. Set by publishing a hidden listing (server/routes/listings.js
-- setState); hiding keeps it. Listings on the website today start from their last edit.
ALTER TABLE listings ADD COLUMN published_at TEXT;
UPDATE listings SET published_at = updated_at WHERE published = 1;


-- BEGIN 0022_chats.sql (QA data-safe variant)
-- MSG-02 (spec 2026-11-06): the website's chat, answered by a person in the panel. A chat is found by the SHA-256 of its
-- key, which only the visitor's browser holds (C5). waiting: the visitor wrote last; answered: the team did; handled:
-- someone marked it done (C7). Deleted 30 days after its last message (C11), its messages with it.
CREATE TABLE chats (
  -- AUTOINCREMENT: a deleted chat's id is never given to a new one, so a panel still showing the old chat cannot reply
  -- into another visitor's conversation (plain rowids reuse the last deleted id).
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','answered','handled')),
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  privacy_ack_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  waiting_since TEXT,
  visitor_seen_at TEXT,
  handled_at TEXT,
  handled_by TEXT,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
-- The panel's counter reads the waiting chats only; the daily pass and the key's 7 days read last_at.
CREATE INDEX chats_waiting ON chats(waiting_since) WHERE status = 'waiting';
CREATE INDEX chats_last ON chats(last_at);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('visitor','team')),
  sent_by TEXT, -- the admin's email for a team message; never sent to the website (C6)
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL
);
CREATE INDEX chat_messages_chat ON chat_messages(chat_id, id);


-- BEGIN 0023_email.sql (QA data-safe variant)
-- AUT-17: no settings row is seeded: sending and the daily team summary start off.
CREATE TABLE outbound (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  dedupe_key TEXT NOT NULL UNIQUE,
  template TEXT NOT NULL CHECK (length(template) BETWEEN 1 AND 80),
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  recipient TEXT,
  recipient_hash TEXT NOT NULL,
  subject TEXT CHECK (subject IS NULL OR length(subject) <= 500),
  text TEXT CHECK (text IS NULL OR length(text) <= 50000),
  status TEXT NOT NULL CHECK (status IN ('draft','queued','sending','accepted','failed','unknown','cancelled')),
  approved_by TEXT,
  approved_at TEXT,
  config_revision INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  claim_token TEXT,
  claimed_at TEXT,
  next_attempt_at TEXT,
  message_id TEXT,
  error_code TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status NOT IN ('queued','sending','accepted') OR approved_at IS NOT NULL)
);
CREATE INDEX outbound_queue ON outbound(next_attempt_at, id) WHERE status = 'queued';
CREATE INDEX outbound_created ON outbound(created_at);
CREATE INDEX outbound_recipient ON outbound(recipient) WHERE recipient IS NOT NULL;
CREATE INDEX outbound_message ON outbound(message_id) WHERE message_id IS NOT NULL;

-- The attempt is the quota reservation, even if a request later times out. Retained for 90 days.
CREATE TABLE email_attempts (
  token TEXT PRIMARY KEY,
  outbound_id INTEGER,
  day TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX email_attempts_day ON email_attempts(day);
CREATE INDEX email_attempts_at ON email_attempts(at);
-- Addresses are hashed, not shown or recoverable from this list. Kept until explicitly removed.
CREATE TABLE email_suppressions (
  address_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('team','provider'))
);
-- Manual deletion retains this non-content tombstone so a delivery replay cannot recreate the message.
CREATE TABLE email_inbound_keys (key TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE INDEX email_inbound_keys_at ON email_inbound_keys(created_at);
CREATE TABLE email_inbound (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key TEXT NOT NULL UNIQUE,
  sender TEXT,
  header_from TEXT,
  recipient TEXT,
  subject TEXT,
  text TEXT CHECK (text IS NULL OR length(text) <= 50000),
  html_only INTEGER NOT NULL CHECK (html_only IN (0,1)),
  truncated INTEGER NOT NULL CHECK (truncated IN (0,1)),
  attachments INTEGER NOT NULL DEFAULT 0,
  message_id TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  outbound_id INTEGER REFERENCES outbound(id) ON DELETE SET NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX email_inbound_received ON email_inbound(received_at);
CREATE INDEX email_inbound_sender ON email_inbound(sender) WHERE sender IS NOT NULL;
CREATE INDEX email_inbound_header_from ON email_inbound(header_from) WHERE header_from IS NOT NULL;

-- One path for erasure by the panel and by the retention pass. A late provider result cannot restore content/status.
CREATE TRIGGER contact_email_erasure BEFORE DELETE ON contacts WHEN OLD.email IS NOT NULL BEGIN
  UPDATE outbound SET recipient = NULL, subject = NULL, text = NULL,
    status = CASE WHEN status = 'sending' THEN 'unknown' WHEN status IN ('draft','queued') THEN 'cancelled' ELSE status END,
    error_code = CASE WHEN status = 'sending' THEN 'CONTACT_ERASED_IN_FLIGHT' ELSE error_code END,
    claim_token = NULL WHERE recipient = OLD.email;
  DELETE FROM email_inbound WHERE sender = OLD.email OR header_from = OLD.email;
END;


-- BEGIN 0024_search_lifecycle.sql (QA data-safe variant)
-- EST-09: search activity is independent of commercial stage. No historical success is inferred.
ALTER TABLE applicants ADD COLUMN search_state TEXT NOT NULL DEFAULT 'active'
  CHECK (search_state IN ('active', 'resolved', 'needs_review'));
ALTER TABLE applicants ADD COLUMN resolved_at TEXT;
ALTER TABLE applicants ADD COLUMN resolved_by TEXT;
ALTER TABLE applicants ADD COLUMN resolution_reason TEXT CHECK (
  (search_state = 'resolved' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL
    AND length(trim(resolved_by)) > 0 AND resolution_reason IS NOT NULL AND length(trim(resolution_reason)) BETWEEN 1 AND 200)
  OR (search_state <> 'resolved' AND resolved_at IS NULL AND resolved_by IS NULL AND resolution_reason IS NULL));

UPDATE applicants SET search_state = 'needs_review' WHERE archived_at IS NOT NULL OR stage IN ('lost', 'completed');
-- Existing duplicates are all preserved for a person to decide which search to activate.
UPDATE applicants SET search_state = 'needs_review' WHERE search_state = 'active' AND (contact_id, operation) IN (
  SELECT contact_id, operation FROM applicants WHERE search_state = 'active' GROUP BY contact_id, operation HAVING COUNT(*) > 1);
CREATE UNIQUE INDEX applicants_active_operation ON applicants(contact_id, operation)
  WHERE search_state = 'active' AND archived_at IS NULL;
DROP INDEX applicants_queue;
CREATE INDEX applicants_queue ON applicants(created_at) WHERE archived_at IS NULL AND search_state = 'active';

-- Legacy closed searches wait for review, rather than leaving work notices that imply they are active.
UPDATE notifications SET resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), resolved_by = 'system'
  WHERE resolved_at IS NULL AND category IN ('new_applicant', 'matched') AND event_id IN (
    SELECT e.id FROM events e JOIN applicants a ON e.entity_type = 'applicant' AND e.entity_id = CAST(a.id AS TEXT)
    WHERE a.search_state = 'needs_review');


-- BEGIN 0025_registration_categories.sql (QA data-safe variant)
-- Existing registrations were residential; retain their state and history.
ALTER TABLE applicants ADD COLUMN search_category TEXT NOT NULL DEFAULT 'residential'
  CHECK (search_category IN ('residential', 'commercial'));
-- Legacy operation CHECK permits only rent/buy. Transfer is represented separately until the market model replaces it.
ALTER TABLE applicants ADD COLUMN search_operation TEXT CHECK (search_operation IS NULL OR
  (search_operation = 'transfer' AND search_category = 'commercial' AND operation = 'rent'));
ALTER TABLE applicants ADD COLUMN commercial_kind TEXT CHECK (commercial_kind IS NULL OR commercial_kind IN ('property', 'business', 'both'));
ALTER TABLE applicants ADD COLUMN commercial_use TEXT;
ALTER TABLE applicants ADD COLUMN area_min REAL CHECK (area_min IS NULL OR area_min > 0);
ALTER TABLE applicants ADD COLUMN area_max REAL CHECK (area_max IS NULL OR area_max > 0);
ALTER TABLE applicants ADD COLUMN area_unit TEXT CHECK (area_unit IS NULL OR area_unit IN ('sqm', 'sqft'));
ALTER TABLE applicants ADD COLUMN commercial_purchase REAL CHECK (commercial_purchase IS NULL OR commercial_purchase > 0);
ALTER TABLE applicants ADD COLUMN commercial_rent REAL CHECK (commercial_rent IS NULL OR commercial_rent > 0);
ALTER TABLE applicants ADD COLUMN commercial_rent_period TEXT CHECK (commercial_rent_period IS NULL OR commercial_rent_period IN ('month', 'year'));
ALTER TABLE applicants ADD COLUMN commercial_premium REAL CHECK (commercial_premium IS NULL OR commercial_premium >= 0);
ALTER TABLE applicants ADD COLUMN commercial_expenses REAL CHECK (commercial_expenses IS NULL OR commercial_expenses >= 0);
ALTER TABLE applicants ADD COLUMN household_total INTEGER CHECK (household_total IS NULL OR household_total >= 0);
ALTER TABLE applicants ADD COLUMN household_children_status TEXT CHECK (household_children_status IS NULL OR household_children_status IN ('known', 'unknown', 'not_applicable'));
ALTER TABLE applicants ADD COLUMN preferred_language TEXT;
ALTER TABLE applicants ADD COLUMN bedrooms_max INTEGER CHECK (bedrooms_max IS NULL OR bedrooms_max >= 0);
DROP INDEX applicants_active_operation;
CREATE UNIQUE INDEX applicants_active_category_operation ON applicants(contact_id, COALESCE(search_operation, operation), search_category)
  WHERE search_state = 'active' AND archived_at IS NULL;


-- BEGIN 0026_search_viewing_availability.sql (QA data-safe variant)
-- Weekly wall-clock preferences in Europe/Jersey; NULL means not provided, not unavailable.
ALTER TABLE applicants ADD COLUMN viewing_availability TEXT CHECK (viewing_availability IS NULL OR json_valid(viewing_availability));


-- BEGIN 0027_property_viewings.sql (QA data-safe variant)
-- Existing properties keep the general negotiator schedule. Weekly windows use Europe/Jersey, Sunday = 0.
ALTER TABLE listings ADD COLUMN viewings_enabled INTEGER NOT NULL DEFAULT 1 CHECK (viewings_enabled IN (0, 1));
ALTER TABLE listings ADD COLUMN viewing_hours TEXT DEFAULT NULL CHECK (
  viewing_hours IS NULL OR (json_valid(viewing_hours) AND json_type(viewing_hours) = 'array'
    AND json_array_length(viewing_hours) BETWEEN 1 AND 21)
);


-- BEGIN 0029_listing_events.sql (QA data-safe variant)
-- EST-18: keep the common event schema and IDs; D1 runs migrations transactionally.
-- Create the original name directly: renaming the parent would rewrite notification FKs.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE events_est18_backup AS SELECT * FROM events;
DROP TABLE events;
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('applicant','contact','viewing','admin','listing')),
  entity_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT
);
INSERT INTO events SELECT * FROM events_est18_backup;
DROP TABLE events_est18_backup;
CREATE INDEX events_entity ON events(entity_type,entity_id,at);
CREATE UNIQUE INDEX events_listing_revision ON events(entity_id,CAST(json_extract(data,'$.revision') AS INTEGER))
  WHERE entity_type='listing';

-- Context lives only inside the caller's batch. WITHOUT ROWID preserves last_insert_rowid().
CREATE TABLE listing_event_context (
  listing_id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('panel','queue','sales','media','recalculate')),
  action TEXT NOT NULL CHECK(action IN ('created','updated','published','unpublished','archived','restored','confirmed','availability_changed','featured_changed','cover_changed','recalculated','deleted')),
  at TEXT NOT NULL,
  derived_fields TEXT NOT NULL,
  related TEXT NOT NULL,
  previous_revision INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE listing_event_operations (
  actor TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  event_id INTEGER REFERENCES events(id),
  PRIMARY KEY(actor,operation_id)
) WITHOUT ROWID;

-- insert: read the write's actual row. Free text contributes field names only.
CREATE TRIGGER listing_event_insert AFTER INSERT ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=NEW.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,'listing',NEW.id,'listing.created',json_object(
    'revision',(SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0)+1
      FROM events WHERE entity_type='listing' AND entity_id=NEW.id),
    'source',c.source,
    'fields',json(json_array('published','archived_at','availability','published_at','confirmed_at','use','operation','sale_price','rent','rent_period','premium','currency','parish','tenure_type','housing_category','restriction','bedrooms','bathrooms','matchable','viewings_enabled','viewing_hours','featured_rank','cover_media_id','feat_pets','feat_parking','feat_furnished','feat_outdoor','feat_type','title','property_type','country','location','road_name','tenure','price_text','summary','description','tour_url','specs','feat_evidence')),
    'before',json(json('{}')),
    'after',json(json_object(
      'published', NEW.published,
      'archived_at', NEW.archived_at,
      'availability', NEW.availability,
      'published_at', NEW.published_at,
      'confirmed_at', NEW.confirmed_at,
      'use', NEW.use,
      'operation', NEW.operation,
      'sale_price', NEW.sale_price,
      'rent', NEW.rent,
      'rent_period', NEW.rent_period,
      'premium', NEW.premium,
      'currency', NEW.currency,
      'parish', NEW.parish,
      'tenure_type', NEW.tenure_type,
      'housing_category', NEW.housing_category,
      'restriction', NEW.restriction,
      'bedrooms', NEW.bedrooms,
      'bathrooms', NEW.bathrooms,
      'matchable', NEW.matchable,
      'viewings_enabled', NEW.viewings_enabled,
      'viewing_hours', json(COALESCE(NEW.viewing_hours,'null')),
      'featured_rank', NEW.featured_rank,
      'cover_media_id', NEW.cover_media_id,
      'feat_pets', NEW.feat_pets,
      'feat_parking', NEW.feat_parking,
      'feat_furnished', NEW.feat_furnished,
      'feat_outdoor', json(COALESCE(NEW.feat_outdoor,'null')),
      'feat_type', NEW.feat_type)),
    'derived_fields',json(json(c.derived_fields)),
    'related',json(c.related))
  FROM listing_event_context c
  WHERE c.listing_id=NEW.id;
END;

-- update: read the write's actual row. Free text contributes field names only.
CREATE TRIGGER listing_event_update AFTER UPDATE ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=NEW.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,'listing',NEW.id,'listing.' || CASE WHEN c.action='published' AND OLD.published=1 THEN 'confirmed' ELSE c.action END,json_object(
    'revision',(SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0)+1
      FROM events WHERE entity_type='listing' AND entity_id=NEW.id),
    'source',c.source,
    'fields',json((SELECT json_group_array(key) FROM json_each(d.changed) WHERE value=1)),
    'before',json((SELECT json_group_object(key, CASE WHEN type IN ('array','object') THEN json(value) ELSE value END)
      FROM json_each(d.before_values) WHERE key IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    'after',json((SELECT json_group_object(key, CASE WHEN type IN ('array','object') THEN json(value) ELSE value END)
      FROM json_each(d.after_values) WHERE key IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    'derived_fields',json((SELECT json_group_array(value) FROM json_each(c.derived_fields)
      WHERE value IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    'related',json(c.related))
  FROM listing_event_context c, (SELECT
    json_object(
      'published', OLD.published,
      'archived_at', OLD.archived_at,
      'availability', OLD.availability,
      'published_at', OLD.published_at,
      'confirmed_at', OLD.confirmed_at,
      'use', OLD.use,
      'operation', OLD.operation,
      'sale_price', OLD.sale_price,
      'rent', OLD.rent,
      'rent_period', OLD.rent_period,
      'premium', OLD.premium,
      'currency', OLD.currency,
      'parish', OLD.parish,
      'tenure_type', OLD.tenure_type,
      'housing_category', OLD.housing_category,
      'restriction', OLD.restriction,
      'bedrooms', OLD.bedrooms,
      'bathrooms', OLD.bathrooms,
      'matchable', OLD.matchable,
      'viewings_enabled', OLD.viewings_enabled,
      'viewing_hours', json(COALESCE(OLD.viewing_hours,'null')),
      'featured_rank', OLD.featured_rank,
      'cover_media_id', OLD.cover_media_id,
      'feat_pets', OLD.feat_pets,
      'feat_parking', OLD.feat_parking,
      'feat_furnished', OLD.feat_furnished,
      'feat_outdoor', json(COALESCE(OLD.feat_outdoor,'null')),
      'feat_type', OLD.feat_type) AS before_values,
    json_object(
      'published', NEW.published,
      'archived_at', NEW.archived_at,
      'availability', NEW.availability,
      'published_at', NEW.published_at,
      'confirmed_at', NEW.confirmed_at,
      'use', NEW.use,
      'operation', NEW.operation,
      'sale_price', NEW.sale_price,
      'rent', NEW.rent,
      'rent_period', NEW.rent_period,
      'premium', NEW.premium,
      'currency', NEW.currency,
      'parish', NEW.parish,
      'tenure_type', NEW.tenure_type,
      'housing_category', NEW.housing_category,
      'restriction', NEW.restriction,
      'bedrooms', NEW.bedrooms,
      'bathrooms', NEW.bathrooms,
      'matchable', NEW.matchable,
      'viewings_enabled', NEW.viewings_enabled,
      'viewing_hours', json(COALESCE(NEW.viewing_hours,'null')),
      'featured_rank', NEW.featured_rank,
      'cover_media_id', NEW.cover_media_id,
      'feat_pets', NEW.feat_pets,
      'feat_parking', NEW.feat_parking,
      'feat_furnished', NEW.feat_furnished,
      'feat_outdoor', json(COALESCE(NEW.feat_outdoor,'null')),
      'feat_type', NEW.feat_type) AS after_values,
    json_object(
      'published', NEW.published IS NOT OLD.published,
      'archived_at', NEW.archived_at IS NOT OLD.archived_at,
      'availability', NEW.availability IS NOT OLD.availability,
      'published_at', NEW.published_at IS NOT OLD.published_at,
      'confirmed_at', NEW.confirmed_at IS NOT OLD.confirmed_at,
      'use', NEW.use IS NOT OLD.use,
      'operation', NEW.operation IS NOT OLD.operation,
      'sale_price', NEW.sale_price IS NOT OLD.sale_price,
      'rent', NEW.rent IS NOT OLD.rent,
      'rent_period', NEW.rent_period IS NOT OLD.rent_period,
      'premium', NEW.premium IS NOT OLD.premium,
      'currency', NEW.currency IS NOT OLD.currency,
      'parish', NEW.parish IS NOT OLD.parish,
      'tenure_type', NEW.tenure_type IS NOT OLD.tenure_type,
      'housing_category', NEW.housing_category IS NOT OLD.housing_category,
      'restriction', NEW.restriction IS NOT OLD.restriction,
      'bedrooms', NEW.bedrooms IS NOT OLD.bedrooms,
      'bathrooms', NEW.bathrooms IS NOT OLD.bathrooms,
      'matchable', NEW.matchable IS NOT OLD.matchable,
      'viewings_enabled', NEW.viewings_enabled IS NOT OLD.viewings_enabled,
      'viewing_hours', NEW.viewing_hours IS NOT OLD.viewing_hours,
      'featured_rank', NEW.featured_rank IS NOT OLD.featured_rank,
      'cover_media_id', NEW.cover_media_id IS NOT OLD.cover_media_id,
      'feat_pets', NEW.feat_pets IS NOT OLD.feat_pets,
      'feat_parking', NEW.feat_parking IS NOT OLD.feat_parking,
      'feat_furnished', NEW.feat_furnished IS NOT OLD.feat_furnished,
      'feat_outdoor', NEW.feat_outdoor IS NOT OLD.feat_outdoor,
      'feat_type', NEW.feat_type IS NOT OLD.feat_type,
      'title', NEW.title IS NOT OLD.title,
      'property_type', NEW.property_type IS NOT OLD.property_type,
      'country', NEW.country IS NOT OLD.country,
      'location', NEW.location IS NOT OLD.location,
      'road_name', NEW.road_name IS NOT OLD.road_name,
      'tenure', NEW.tenure IS NOT OLD.tenure,
      'price_text', NEW.price_text IS NOT OLD.price_text,
      'summary', NEW.summary IS NOT OLD.summary,
      'description', NEW.description IS NOT OLD.description,
      'tour_url', NEW.tour_url IS NOT OLD.tour_url,
      'specs', NEW.specs IS NOT OLD.specs,
      'feat_evidence', NEW.feat_evidence IS NOT OLD.feat_evidence) AS changed) d
  WHERE c.listing_id=NEW.id
    AND (EXISTS(SELECT 1 FROM json_each(d.changed) WHERE value=1) OR c.action IN ('confirmed','published'));
END;

-- delete: read the write's actual row. Free text contributes field names only.
CREATE TRIGGER listing_event_delete AFTER DELETE ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=OLD.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,'listing',OLD.id,'listing.deleted',json_object(
    'revision',(SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0)+1
      FROM events WHERE entity_type='listing' AND entity_id=OLD.id),
    'source',c.source,
    'fields',json(json('[]')),
    'before',json(json('{}')),
    'after',json(json('{}')),
    'derived_fields',json(json('[]')),
    'related',json(c.related))
  FROM listing_event_context c
  WHERE c.listing_id=OLD.id;
END;

PRAGMA defer_foreign_keys = OFF;


-- BEGIN 0030_advertisers.sql (QA data-safe variant)
-- AGE-04: staff-managed directory. No automatic personal-data deletion.
CREATE TABLE advertisers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('agency','entity','individual')),
  details TEXT NOT NULL CHECK(json_valid(details)),
  activity_on TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE TABLE advertiser_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  advertiser_id INTEGER NOT NULL REFERENCES advertisers(id),
  action TEXT NOT NULL CHECK(action IN ('retained','activity')),
  reason TEXT,
  on_date TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX advertiser_name ON advertisers(name COLLATE NOCASE, id);
CREATE INDEX advertiser_reviews_advertiser ON advertiser_reviews(advertiser_id, id);


-- BEGIN 0031_requirement_priorities.sql (QA data-safe variant)
-- REG-08: no inferred priority or age for existing searches. Follows AGE-04 migration0030.
ALTER TABLE applicants ADD COLUMN requirement_priorities TEXT CHECK (requirement_priorities IS NULL OR
  (json_valid(requirement_priorities) AND json_type(requirement_priorities) = 'object'
   AND COALESCE(json_extract(requirement_priorities, '$.version') = 1 AND json_type(requirement_priorities, '$.values') = 'object', 0)));
ALTER TABLE applicants ADD COLUMN household_children_ages TEXT CHECK (household_children_ages IS NULL OR
  (json_valid(household_children_ages) AND json_type(household_children_ages) = 'array' AND json_array_length(household_children_ages) <= 20));
ALTER TABLE applicants ADD COLUMN household_ages_at TEXT;

ALTER TABLE matches ADD COLUMN requirements_rank INTEGER NOT NULL DEFAULT 1 CHECK (requirements_rank BETWEEN 0 AND 3);


-- BEGIN 0032_notification_tasks.sql (QA data-safe variant)
-- NOT-11: keep the shared notices and their IDs, adding coordination metadata.
CREATE TABLE notifications_next (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL CHECK(category IN ('new_applicant','viewing','matched','task')),
  title TEXT NOT NULL,
  action_required INTEGER NOT NULL CHECK(action_required IN (0,1)),
  created_at TEXT NOT NULL,
  resolved_at TEXT, resolved_by TEXT,
  task_key TEXT UNIQUE,
  source_version INTEGER NOT NULL DEFAULT 0 CHECK(source_version >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  assigned_to TEXT,
  due_at TEXT,
  task_reason TEXT CHECK(task_reason IS NULL OR length(task_reason) <= 500),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','urgent')),
  closed_by_source INTEGER NOT NULL DEFAULT 0 CHECK(closed_by_source IN (0,1)),
  task_actor TEXT, task_action TEXT
);
INSERT INTO notifications_next(id,event_id,category,title,action_required,created_at,resolved_at,resolved_by,
  task_key,source_version,closed_by_source)
SELECT id,event_id,category,title,action_required,created_at,resolved_at,resolved_by,
  'legacy:' || id,event_id,CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_next RENAME TO notifications;
CREATE INDEX notifications_open ON notifications(resolved_at,category,created_at);
CREATE INDEX notifications_created ON notifications(created_at);
CREATE INDEX notifications_event ON notifications(event_id);
CREATE INDEX notifications_owner_due ON notifications(assigned_to,due_at) WHERE resolved_at IS NULL;

-- No backfilled history: existing domain events remain the record of what really happened.
CREATE TABLE notification_task_history (
  task_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  PRIMARY KEY(task_id,revision)
);
CREATE TABLE notification_task_operations (
  actor TEXT NOT NULL, operation_id TEXT NOT NULL,
  task_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  payload_hash TEXT NOT NULL, result_revision INTEGER NOT NULL,
  PRIMARY KEY(actor,operation_id)
);
CREATE TABLE notification_reads (
  admin TEXT NOT NULL REFERENCES admins(email) ON DELETE CASCADE,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  read_revision INTEGER NOT NULL CHECK(read_revision >= 1),
  PRIMARY KEY(admin,notification_id)
);
CREATE TABLE notification_preferences (
  admin TEXT PRIMARY KEY REFERENCES admins(email) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  feed_categories TEXT NOT NULL CHECK(json_valid(feed_categories) AND json_type(feed_categories)='array')
);

-- The parent statement's changes()/last_insert_rowid() are restored after SQLite triggers.
-- The insert trigger also covers unchanged legacy producers without adding extra domain events.
CREATE TRIGGER notification_task_created AFTER INSERT ON notifications BEGIN
  UPDATE notifications SET task_key=COALESCE(NEW.task_key,'legacy:' || NEW.id),
    source_version=CASE WHEN NEW.source_version=0 THEN NEW.event_id ELSE NEW.source_version END,
    task_actor=NULL,task_action=NULL WHERE id=NEW.id;
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    VALUES(NEW.id,1,NEW.created_at,COALESCE(NEW.task_actor,(SELECT actor FROM events WHERE id=NEW.event_id),'system'),'created');
END;

CREATE TRIGGER notification_task_changed AFTER UPDATE OF event_id,category,title,action_required,
  resolved_at,resolved_by,assigned_to,due_at,task_reason,source_version,urgency,closed_by_source ON notifications
WHEN OLD.task_key IS NOT NULL BEGIN
  UPDATE notifications SET revision=OLD.revision+1,
    closed_by_source=CASE WHEN NEW.resolved_at IS NULL THEN 0
      WHEN OLD.resolved_at IS NULL THEN CASE WHEN NEW.task_action='done' THEN 0 ELSE 1 END
      ELSE NEW.closed_by_source END
    WHERE id=NEW.id AND (OLD.event_id IS NOT NEW.event_id OR OLD.category IS NOT NEW.category
      OR OLD.title IS NOT NEW.title OR OLD.action_required IS NOT NEW.action_required
      OR OLD.resolved_at IS NOT NEW.resolved_at OR OLD.resolved_by IS NOT NEW.resolved_by
      OR OLD.assigned_to IS NOT NEW.assigned_to OR OLD.due_at IS NOT NEW.due_at
      OR OLD.task_reason IS NOT NEW.task_reason OR OLD.source_version IS NOT NEW.source_version
      OR OLD.urgency IS NOT NEW.urgency OR OLD.closed_by_source IS NOT NEW.closed_by_source);
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    SELECT NEW.id,revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      COALESCE(NEW.task_actor,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN NEW.resolved_by END,'system'),
      COALESCE(NEW.task_action,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN 'source_resolved' ELSE 'source_update' END)
    FROM notifications WHERE id=NEW.id AND revision>OLD.revision;
  UPDATE notifications SET task_actor=NULL,task_action=NULL WHERE id=NEW.id;
END;


-- BEGIN 0033_notification_events.sql (QA data-safe variant)
-- NOT-01: preserve the audit IDs and existing notices. No historical Feed backfill.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE events_not01_backup AS SELECT * FROM events;
DROP TABLE events;
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL, actor TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('applicant','contact','viewing','admin','listing','rental','payment','collection')),
  entity_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT,
  rental_event_id INTEGER UNIQUE REFERENCES rental_events(id) ON DELETE SET NULL
);
INSERT INTO events(id,at,actor,entity_type,entity_id,type,data)
  SELECT id,at,actor,entity_type,entity_id,type,data FROM events_not01_backup;
DROP TABLE events_not01_backup;
CREATE INDEX events_entity ON events(entity_type,entity_id,at);
CREATE UNIQUE INDEX events_listing_revision ON events(entity_id,CAST(json_extract(data,'$.revision') AS INTEGER)) WHERE entity_type='listing';

ALTER TABLE notifications ADD COLUMN target_kind TEXT CHECK(target_kind IS NULL OR target_kind IN ('applicant','contact','viewing','listing','offer','sale','rental','payment','collection'));
ALTER TABLE notifications ADD COLUMN target_id TEXT;
ALTER TABLE notifications ADD COLUMN target_context TEXT CHECK(target_context IS NULL OR (json_valid(target_context) AND json_type(target_context)='object'));
ALTER TABLE notifications ADD COLUMN target_deleted INTEGER NOT NULL DEFAULT 0 CHECK(target_deleted IN (0,1));
CREATE INDEX notifications_target ON notifications(target_kind,target_id);
CREATE INDEX notifications_source_cursor ON notifications(source_version,id);

CREATE TABLE notification_observations (
  task_key TEXT PRIMARY KEY REFERENCES notifications(task_key) ON DELETE CASCADE,
  kind TEXT NOT NULL, entity_id TEXT NOT NULL, cycle TEXT NOT NULL,
  signature TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
  target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
  event_id INTEGER NOT NULL REFERENCES events(id)
) WITHOUT ROWID;
CREATE TABLE notification_cursor (
  key TEXT PRIMARY KEY CONSTRAINT notification_cursor_cas CHECK(key='queues'), revision INTEGER NOT NULL,
  after_key TEXT NOT NULL, observed_at TEXT NOT NULL
) WITHOUT ROWID;
INSERT INTO notification_cursor VALUES('queues',0,'','');

-- Include destination changes in the shared revision/history contract.
DROP TRIGGER notification_task_changed;
CREATE TRIGGER notification_task_changed AFTER UPDATE OF event_id,category,title,action_required,
  resolved_at,resolved_by,assigned_to,due_at,task_reason,source_version,urgency,closed_by_source,
  target_kind,target_id,target_context,target_deleted ON notifications
WHEN OLD.task_key IS NOT NULL BEGIN
  UPDATE notifications SET revision=OLD.revision+1,
    closed_by_source=CASE WHEN NEW.resolved_at IS NULL THEN 0
      WHEN OLD.resolved_at IS NULL THEN CASE WHEN NEW.task_action='done' THEN 0 ELSE 1 END
      ELSE NEW.closed_by_source END
    WHERE id=NEW.id AND (OLD.event_id IS NOT NEW.event_id OR OLD.category IS NOT NEW.category
      OR OLD.title IS NOT NEW.title OR OLD.action_required IS NOT NEW.action_required
      OR OLD.resolved_at IS NOT NEW.resolved_at OR OLD.resolved_by IS NOT NEW.resolved_by
      OR OLD.assigned_to IS NOT NEW.assigned_to OR OLD.due_at IS NOT NEW.due_at
      OR OLD.task_reason IS NOT NEW.task_reason OR OLD.source_version IS NOT NEW.source_version
      OR OLD.urgency IS NOT NEW.urgency OR OLD.closed_by_source IS NOT NEW.closed_by_source
      OR OLD.target_kind IS NOT NEW.target_kind OR OLD.target_id IS NOT NEW.target_id
      OR OLD.target_context IS NOT NEW.target_context OR OLD.target_deleted IS NOT NEW.target_deleted);
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    SELECT NEW.id,revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      COALESCE(NEW.task_actor,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN NEW.resolved_by END,'system'),
      COALESCE(NEW.task_action,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN 'source_resolved' ELSE 'source_update' END)
    FROM notifications WHERE id=NEW.id AND revision>OLD.revision;
  UPDATE notifications SET task_actor=NULL,task_action=NULL WHERE id=NEW.id;
END;

-- Only typed, technical bridge data. Never copy the rental event's free data object.
CREATE TRIGGER notification_rental_bridge AFTER INSERT ON rental_events
WHEN NEW.type IN ('rental.created','rental.updated','rental.archived','rental.restored',
  'tenancy.created','tenancy.updated','tenancy.renewed','tenancy.ended','tenancy.end_cancelled',
  'rent.changed','notice.recorded','arrears.step_done','charge.edited','compliance.updated',
  'repair.created','repair.updated','payment.recorded','payment.updated','payments.imported')
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data,rental_event_id)
  SELECT NEW.at,COALESCE(NEW.actor,'system'),
    CASE WHEN NEW.type IN ('payment.recorded','payment.updated') THEN 'payment'
      WHEN NEW.type='payments.imported' AND NEW.rental_id IS NULL THEN 'collection' ELSE 'rental' END,
    CASE WHEN NEW.type IN ('payment.recorded','payment.updated') THEN CAST(json_extract(NEW.data,'$.payment_id') AS TEXT)
      WHEN NEW.type='payments.imported' AND NEW.rental_id IS NULL THEN 'unmatched-payments' ELSE CAST(NEW.rental_id AS TEXT) END,
    NEW.type,json_object('version',1,'tenancy_id',NEW.tenancy_id,'repair_id',json_extract(NEW.data,'$.repair_id'),
      'compliance_kind',CASE WHEN NEW.type='compliance.updated' THEN json_extract(NEW.data,'$.kind') END,
      'state',CASE WHEN NEW.type='repair.updated' THEN json_extract(NEW.data,'$.after.status') END,
      'urgency',CASE WHEN NEW.type='repair.updated' THEN json_extract(NEW.data,'$.after.urgency') END,
      'unmatched',CASE WHEN NEW.type IN ('payment.recorded','payment.updated') THEN
        (SELECT tenancy_id IS NULL FROM payments WHERE id=json_extract(NEW.data,'$.payment_id')) END),NEW.id
  WHERE (NEW.rental_id IS NOT NULL OR NEW.type IN ('payment.recorded','payment.updated','payments.imported'))
    AND (NEW.type NOT IN ('payment.recorded','payment.updated') OR EXISTS(
      SELECT 1 FROM payments p WHERE p.id=json_extract(NEW.data,'$.payment_id')
        AND (p.tenancy_id IS NEW.tenancy_id OR (p.tenancy_id IS NULL
          AND json_type(NEW.data,'$.after.tenancy_id')='null'
          AND json_extract(NEW.data,'$.before.tenancy_id')=NEW.tenancy_id))));
END;

-- This view is always selected by the newly inserted event ID, never scanned to backfill.
CREATE VIEW notification_event_projection AS
SELECT e.id,e.at,e.actor,
  CASE WHEN e.entity_type='applicant' AND e.type LIKE 'offer.%' THEN 'offer'
    WHEN e.entity_type='applicant' AND e.type LIKE 'sale.%' THEN 'sale' ELSE e.entity_type END AS target_kind,
  CASE WHEN e.entity_type='applicant' AND e.type LIKE 'offer.%' THEN CAST(json_extract(e.data,'$.offer_id') AS TEXT)
    WHEN e.entity_type='applicant' AND e.type LIKE 'sale.%' THEN CAST(json_extract(e.data,'$.sale_id') AS TEXT) ELSE e.entity_id END AS target_id,
  CASE WHEN e.entity_type='applicant' AND e.type='sale.milestone' THEN json_object('milestone',json_extract(e.data,'$.key'))
    WHEN e.entity_type='rental' THEN json_patch('{}',json_object(
    'tenancy_id',json_extract(e.data,'$.tenancy_id'),'repair_id',json_extract(e.data,'$.repair_id'),
    'compliance_kind',json_extract(e.data,'$.compliance_kind'))) END AS target_context,
  CASE WHEN e.entity_type='viewing' THEN 'viewing' ELSE 'task' END AS category,
  CASE e.type
    WHEN 'viewing.booked' THEN 'Viewing booked' WHEN 'viewing.confirmed' THEN 'Viewing confirmed'
    WHEN 'viewing.rescheduled' THEN 'Viewing rescheduled' WHEN 'viewing.cancelled' THEN 'Viewing cancelled'
    WHEN 'viewing.completed' THEN 'Viewing completed' WHEN 'viewing.no_show' THEN 'Viewing missed'
    WHEN 'offer.recorded' THEN 'Offer recorded' WHEN 'offer.updated' THEN 'Offer updated'
    WHEN 'offer.countered' THEN 'Offer countered' WHEN 'offer.rejected' THEN 'Offer rejected'
    WHEN 'offer.withdrawn' THEN 'Offer withdrawn' WHEN 'offer.accepted' THEN 'Offer accepted'
    WHEN 'sale.updated' THEN 'Sale updated' WHEN 'sale.milestone' THEN 'Sale milestone updated'
    WHEN 'sale.completed' THEN 'Sale completed' WHEN 'sale.fallen_through' THEN 'Sale fell through'
    WHEN 'listing.created' THEN 'Property created' WHEN 'listing.updated' THEN 'Property updated'
    WHEN 'listing.published' THEN 'Property published' WHEN 'listing.unpublished' THEN 'Property unpublished'
    WHEN 'listing.archived' THEN 'Property archived' WHEN 'listing.restored' THEN 'Property restored'
    WHEN 'listing.confirmed' THEN 'Property confirmed' WHEN 'listing.availability_changed' THEN 'Property availability changed'
    WHEN 'listing.featured_changed' THEN 'Featured property changed' WHEN 'listing.cover_changed' THEN 'Property cover changed'
    WHEN 'listing.recalculated' THEN 'Property recalculated' WHEN 'listing.deleted' THEN 'Property deleted'
    WHEN 'payment.recorded' THEN 'Payment recorded' WHEN 'payment.updated' THEN 'Payment updated'
    WHEN 'payments.imported' THEN 'Payments imported' WHEN 'rental.created' THEN 'Rental created'
    WHEN 'rental.updated' THEN 'Rental updated' WHEN 'rental.archived' THEN 'Rental archived'
    WHEN 'rental.restored' THEN 'Rental restored' WHEN 'tenancy.created' THEN 'Tenancy created'
    WHEN 'tenancy.updated' THEN 'Tenancy updated' WHEN 'tenancy.renewed' THEN 'Tenancy renewed'
    WHEN 'tenancy.ended' THEN 'Tenancy ended' WHEN 'tenancy.end_cancelled' THEN 'Tenancy end cancelled'
    WHEN 'rent.changed' THEN 'Rent changed' WHEN 'notice.recorded' THEN 'Notice recorded'
    WHEN 'arrears.step_done' THEN 'Arrears step completed' WHEN 'charge.edited' THEN 'Charge edited'
    WHEN 'compliance.updated' THEN 'Compliance updated' WHEN 'repair.created' THEN 'Repair reported'
    WHEN 'repair.updated' THEN 'Repair updated' END AS title,
  e.type='listing.deleted' AS target_deleted
FROM events e
WHERE (e.entity_type='viewing' AND e.type IN ('viewing.booked','viewing.confirmed','viewing.rescheduled','viewing.cancelled','viewing.completed','viewing.no_show'))
 OR (e.entity_type='applicant' AND (e.type IN ('offer.recorded','offer.updated','offer.countered','offer.rejected','offer.withdrawn','offer.accepted')
   AND EXISTS(SELECT 1 FROM offers WHERE id=json_extract(e.data,'$.offer_id') AND applicant_id=e.entity_id)
   OR e.type IN ('sale.updated','sale.milestone','sale.completed','sale.fallen_through')
   AND EXISTS(SELECT 1 FROM sales WHERE id=json_extract(e.data,'$.sale_id') AND applicant_id=e.entity_id)
   AND (e.type<>'sale.milestone' OR (json_extract(e.data,'$.key') IN ('lawyers','due_diligence','questionnaire','searches','mortgage','contract','funds','passing','settled')
     AND EXISTS(SELECT 1 FROM sale_milestones WHERE sale_id=json_extract(e.data,'$.sale_id') AND key=json_extract(e.data,'$.key'))))))
 OR (e.entity_type='listing' AND e.type IN ('listing.created','listing.updated','listing.published','listing.unpublished','listing.archived','listing.restored','listing.confirmed','listing.availability_changed','listing.featured_changed','listing.cover_changed','listing.recalculated','listing.deleted'))
 OR (e.rental_event_id IS NOT NULL AND e.entity_type IN ('rental','payment','collection'));

CREATE TRIGGER notification_event_feed AFTER INSERT ON events BEGIN
  INSERT INTO notifications(task_key,event_id,source_version,category,title,action_required,created_at,
    target_kind,target_id,target_context,target_deleted)
    SELECT 'event:'||id,id,id,category,title,0,at,target_kind,target_id,target_context,target_deleted
    FROM notification_event_projection WHERE id=NEW.id;
END;

-- Erasure is part of the original delete transaction, including direct/cascade deletes.
CREATE TRIGGER notification_viewing_deleted AFTER DELETE ON viewing_requests BEGIN
  UPDATE notifications SET title='Deleted viewing request',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='viewing' AND target_id=CAST(OLD.id AS TEXT)) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type='viewing' AND entity_id=CAST(OLD.id AS TEXT)));
END;
CREATE TRIGGER notification_applicant_deleted AFTER DELETE ON applicants BEGIN
  UPDATE notifications SET title='Deleted applicant',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='applicant' AND target_id=CAST(OLD.id AS TEXT)) OR event_id IN(SELECT id FROM events WHERE entity_type='applicant' AND entity_id=CAST(OLD.id AS TEXT));
END;
CREATE TRIGGER notification_contact_deleted AFTER DELETE ON contacts BEGIN
  UPDATE notifications SET title='Deleted applicant',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='contact' AND target_id=CAST(OLD.id AS TEXT)) OR event_id IN(SELECT id FROM events WHERE entity_type='contact' AND entity_id=CAST(OLD.id AS TEXT));
END;
CREATE TRIGGER notification_listing_deleted AFTER DELETE ON listings BEGIN
  DELETE FROM notification_observations WHERE target_kind='listing' AND target_id=OLD.id;
  UPDATE notifications SET title='Deleted property',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='listing' AND target_id=OLD.id) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type='listing' AND entity_id=OLD.id));
END;
CREATE TRIGGER notification_offer_deleted AFTER DELETE ON offers BEGIN
  DELETE FROM notification_observations WHERE target_kind='offer' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted offer',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='offer' AND target_id=CAST(OLD.id AS TEXT);
END;
CREATE TRIGGER notification_sale_deleted AFTER DELETE ON sales BEGIN
  DELETE FROM notification_observations WHERE target_kind='sale' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted sale',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='sale' AND target_id=CAST(OLD.id AS TEXT);
END;
CREATE TRIGGER notification_rental_deleted AFTER DELETE ON rentals BEGIN
  DELETE FROM notification_observations WHERE target_kind='rental' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted rental',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.id AS TEXT);
END;
CREATE TRIGGER notification_payment_deleted AFTER DELETE ON payments BEGIN
  DELETE FROM notification_observations WHERE target_kind='payment' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted payment',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='payment' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_repair_deleted AFTER DELETE ON repairs BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.repair_id')=OLD.id);
  UPDATE notifications SET title='Deleted repair',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.repair_id')=OLD.id;
END;
CREATE TRIGGER notification_tenancy_deleted AFTER DELETE ON tenancies BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.tenancy_id')=OLD.id);
  UPDATE notifications SET title='Deleted tenancy',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.tenancy_id')=OLD.id;
END;
CREATE TRIGGER notification_check_deleted AFTER DELETE ON compliance_items BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.compliance_kind')=OLD.kind);
  UPDATE notifications SET title='Deleted check',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.compliance_kind')=OLD.kind;
END;
CREATE TRIGGER notification_milestone_deleted AFTER DELETE ON sale_milestones BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='sale' AND target_id=CAST(OLD.sale_id AS TEXT) AND json_extract(target_context,'$.milestone')=OLD.key);
  UPDATE notifications SET title='Deleted milestone',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='sale' AND target_id=CAST(OLD.sale_id AS TEXT) AND json_extract(target_context,'$.milestone')=OLD.key;
END;


-- BEGIN 0034_listing_editorial.sql (QA data-safe variant)
-- EST-17: D1 runs this schema rebuild in one migration transaction.

-- Keep foreign keys enabled. Preserve cascade/set-null children explicitly.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE est17_integrity_guard(n INTEGER NOT NULL CHECK(n=0));

INSERT INTO est17_integrity_guard SELECT count(*) FROM pragma_foreign_key_check;

INSERT INTO est17_integrity_guard SELECT count(*) FROM listing_event_context;

CREATE TABLE est17_listing_backup AS SELECT * FROM listings;

CREATE TABLE est17_media_backup AS SELECT * FROM media;

CREATE TABLE est17_matches_backup AS SELECT * FROM matches;

CREATE TABLE est17_daily_stats_backup AS SELECT * FROM daily_stats;

CREATE TABLE est17_offers_backup AS SELECT * FROM offers;

CREATE TABLE est17_jobs_backup AS SELECT * FROM jobs;

CREATE TABLE est17_viewing_requests_backup AS SELECT * FROM viewing_requests;

CREATE TABLE est17_drive_imports_backup AS SELECT * FROM drive_imports;

CREATE TABLE est17_chats_backup AS SELECT * FROM chats;

DROP TRIGGER listing_event_insert;

DROP TRIGGER listing_event_update;

DROP TRIGGER listing_event_delete;

DROP TRIGGER notification_listing_deleted;

DROP TRIGGER notification_offer_deleted;

DROP TABLE listings;

CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  use TEXT NOT NULL CHECK (use IN ('residential','commercial')),
  title TEXT NOT NULL,
  property_type TEXT,
  operation TEXT NOT NULL CHECK (operation IN ('sale','rent','business')),
  availability TEXT NOT NULL CHECK (availability IN ('for_sale','under_offer','sold','to_let','lease','not_stated','withdrawn','let_agreed','let')),
  country TEXT, location TEXT, road_name TEXT,
  bedrooms INTEGER CHECK (bedrooms IS NULL OR bedrooms >= 0),
  bathrooms INTEGER CHECK (bathrooms IS NULL OR bathrooms >= 0),
  tenure TEXT,
  sale_price REAL CHECK (sale_price IS NULL OR sale_price > 0),
  rent REAL CHECK (rent IS NULL OR rent > 0),
  rent_period TEXT CHECK (rent_period IS NULL OR rent_period IN ('month','year')),
  premium REAL CHECK (premium IS NULL OR premium > 0),
  currency TEXT CHECK (currency IS NULL OR currency IN ('GBP','EUR')),
  price_text TEXT, summary TEXT, description TEXT, tour_url TEXT,
  specs TEXT NOT NULL DEFAULT '[]',
  cover_media_id TEXT,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  archived_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT
, featured_rank INTEGER CHECK (featured_rank IS NULL OR featured_rank BETWEEN 1 AND 99), home_order INTEGER CHECK (home_order IS NULL OR home_order >= 1), parish TEXT CHECK (parish IS NULL OR parish IN ('Grouville','St Brelade','St Clement',
  'St Helier','St John','St Lawrence','St Martin','St Mary','St Ouen','St Peter','St Saviour','Trinity')), matchable INTEGER NOT NULL DEFAULT 0 CHECK (matchable IN (0,1)), feat_pets TEXT CHECK (feat_pets IS NULL OR feat_pets IN ('yes','no')), feat_parking INTEGER CHECK (feat_parking IS NULL OR feat_parking >= 0), feat_furnished TEXT CHECK (feat_furnished IS NULL OR feat_furnished IN ('yes','no')), feat_outdoor TEXT, feat_type TEXT CHECK (feat_type IS NULL OR feat_type IN ('flat','house','cottage','studio')), feat_evidence TEXT, features_at TEXT, tenure_type TEXT
  CHECK (tenure_type IS NULL OR tenure_type IN ('freehold','flying_freehold','share_transfer','leasehold')), housing_category TEXT
  CHECK (housing_category IS NULL OR housing_category IN ('qualified','registered')), restriction TEXT
  CHECK (restriction IS NULL OR restriction IN ('first_time_buyer','over_55')), confirmed_at TEXT, drive_folder_id TEXT, published_at TEXT, viewings_enabled INTEGER NOT NULL DEFAULT 1 CHECK (viewings_enabled IN (0, 1)), viewing_hours TEXT DEFAULT NULL CHECK (
  viewing_hours IS NULL OR (json_valid(viewing_hours) AND json_type(viewing_hours) = 'array'
    AND json_array_length(viewing_hours) BETWEEN 1 AND 21)
), review_requested_at TEXT, review_requested_by TEXT, CHECK ((review_requested_at IS NULL) = (review_requested_by IS NULL)), CHECK (review_requested_at IS NULL OR (published=0 AND archived_at IS NULL)));

INSERT INTO listings (id,use,title,property_type,operation,availability,country,location,road_name,bedrooms,bathrooms,tenure,sale_price,rent,rent_period,premium,currency,price_text,summary,description,tour_url,specs,cover_media_id,published,archived_at,created_at,updated_at,updated_by,featured_rank,home_order,parish,matchable,feat_pets,feat_parking,feat_furnished,feat_outdoor,feat_type,feat_evidence,features_at,tenure_type,housing_category,restriction,confirmed_at,drive_folder_id,published_at,viewings_enabled,viewing_hours) SELECT id,use,title,property_type,operation,availability,country,location,road_name,bedrooms,bathrooms,tenure,sale_price,rent,rent_period,premium,currency,price_text,summary,description,tour_url,specs,cover_media_id,published,archived_at,created_at,updated_at,updated_by,featured_rank,home_order,parish,matchable,feat_pets,feat_parking,feat_furnished,feat_outdoor,feat_type,feat_evidence,features_at,tenure_type,housing_category,restriction,confirmed_at,drive_folder_id,published_at,viewings_enabled,viewing_hours FROM est17_listing_backup;

INSERT INTO media SELECT * FROM est17_media_backup;

INSERT INTO matches SELECT * FROM est17_matches_backup;

INSERT INTO daily_stats SELECT * FROM est17_daily_stats_backup;

INSERT INTO offers SELECT * FROM est17_offers_backup;

INSERT INTO jobs SELECT * FROM est17_jobs_backup;

UPDATE viewing_requests SET listing_id=(SELECT b.listing_id FROM est17_viewing_requests_backup b WHERE b.id=viewing_requests.id);

UPDATE drive_imports SET listing_id=(SELECT b.listing_id FROM est17_drive_imports_backup b WHERE b.id=drive_imports.id);

UPDATE chats SET listing_id=(SELECT b.listing_id FROM est17_chats_backup b WHERE b.id=chats.id);

DROP TABLE listing_event_context;

CREATE TABLE listing_event_context (
  listing_id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('panel','queue','sales','media','recalculate')),
  action TEXT NOT NULL CHECK(action IN ('review_requested','review_returned','created','updated','published','unpublished','archived','restored','confirmed','availability_changed','featured_changed','cover_changed','recalculated','deleted')),
  at TEXT NOT NULL,
  derived_fields TEXT NOT NULL,
  related TEXT NOT NULL,
  previous_revision INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX listings_live ON listings(availability, operation, confirmed_at) WHERE published = 1 AND archived_at IS NULL;

CREATE INDEX listings_drive_folder ON listings(drive_folder_id) WHERE drive_folder_id IS NOT NULL;

CREATE TRIGGER listing_event_insert AFTER INSERT ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=NEW.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,'listing',NEW.id,'listing.created',json_object(
    'revision',(SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0)+1
      FROM events WHERE entity_type='listing' AND entity_id=NEW.id),
    'source',c.source,
    'fields',json(json_array('review_requested_at','review_requested_by','published','archived_at','availability','published_at','confirmed_at','use','operation','sale_price','rent','rent_period','premium','currency','parish','tenure_type','housing_category','restriction','bedrooms','bathrooms','matchable','viewings_enabled','viewing_hours','featured_rank','cover_media_id','feat_pets','feat_parking','feat_furnished','feat_outdoor','feat_type','title','property_type','country','location','road_name','tenure','price_text','summary','description','tour_url','specs','feat_evidence')),
    'before',json(json('{}')),
    'after',json(json_object(
      'review_requested_at', NEW.review_requested_at,
      'review_requested_by', NEW.review_requested_by,
      'published', NEW.published,
      'archived_at', NEW.archived_at,
      'availability', NEW.availability,
      'published_at', NEW.published_at,
      'confirmed_at', NEW.confirmed_at,
      'use', NEW.use,
      'operation', NEW.operation,
      'sale_price', NEW.sale_price,
      'rent', NEW.rent,
      'rent_period', NEW.rent_period,
      'premium', NEW.premium,
      'currency', NEW.currency,
      'parish', NEW.parish,
      'tenure_type', NEW.tenure_type,
      'housing_category', NEW.housing_category,
      'restriction', NEW.restriction,
      'bedrooms', NEW.bedrooms,
      'bathrooms', NEW.bathrooms,
      'matchable', NEW.matchable,
      'viewings_enabled', NEW.viewings_enabled,
      'viewing_hours', json(COALESCE(NEW.viewing_hours,'null')),
      'featured_rank', NEW.featured_rank,
      'cover_media_id', NEW.cover_media_id,
      'feat_pets', NEW.feat_pets,
      'feat_parking', NEW.feat_parking,
      'feat_furnished', NEW.feat_furnished,
      'feat_outdoor', json(COALESCE(NEW.feat_outdoor,'null')),
      'feat_type', NEW.feat_type)),
    'derived_fields',json(json(c.derived_fields)),
    'related',json(c.related))
  FROM listing_event_context c
  WHERE c.listing_id=NEW.id;
END;

CREATE TRIGGER listing_event_update AFTER UPDATE ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=NEW.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,'listing',NEW.id,'listing.' || CASE WHEN c.action='published' AND OLD.published=1 THEN 'confirmed' ELSE c.action END,json_object(
    'revision',(SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0)+1
      FROM events WHERE entity_type='listing' AND entity_id=NEW.id),
    'source',c.source,
    'fields',json((SELECT json_group_array(key) FROM json_each(d.changed) WHERE value=1)),
    'before',json((SELECT json_group_object(key, CASE WHEN type IN ('array','object') THEN json(value) ELSE value END)
      FROM json_each(d.before_values) WHERE key IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    'after',json((SELECT json_group_object(key, CASE WHEN type IN ('array','object') THEN json(value) ELSE value END)
      FROM json_each(d.after_values) WHERE key IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    'derived_fields',json((SELECT json_group_array(value) FROM json_each(c.derived_fields)
      WHERE value IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    'related',json(c.related))
  FROM listing_event_context c, (SELECT
    json_object(
      'review_requested_at', OLD.review_requested_at,
      'review_requested_by', OLD.review_requested_by,
      'published', OLD.published,
      'archived_at', OLD.archived_at,
      'availability', OLD.availability,
      'published_at', OLD.published_at,
      'confirmed_at', OLD.confirmed_at,
      'use', OLD.use,
      'operation', OLD.operation,
      'sale_price', OLD.sale_price,
      'rent', OLD.rent,
      'rent_period', OLD.rent_period,
      'premium', OLD.premium,
      'currency', OLD.currency,
      'parish', OLD.parish,
      'tenure_type', OLD.tenure_type,
      'housing_category', OLD.housing_category,
      'restriction', OLD.restriction,
      'bedrooms', OLD.bedrooms,
      'bathrooms', OLD.bathrooms,
      'matchable', OLD.matchable,
      'viewings_enabled', OLD.viewings_enabled,
      'viewing_hours', json(COALESCE(OLD.viewing_hours,'null')),
      'featured_rank', OLD.featured_rank,
      'cover_media_id', OLD.cover_media_id,
      'feat_pets', OLD.feat_pets,
      'feat_parking', OLD.feat_parking,
      'feat_furnished', OLD.feat_furnished,
      'feat_outdoor', json(COALESCE(OLD.feat_outdoor,'null')),
      'feat_type', OLD.feat_type) AS before_values,
    json_object(
      'review_requested_at', NEW.review_requested_at,
      'review_requested_by', NEW.review_requested_by,
      'published', NEW.published,
      'archived_at', NEW.archived_at,
      'availability', NEW.availability,
      'published_at', NEW.published_at,
      'confirmed_at', NEW.confirmed_at,
      'use', NEW.use,
      'operation', NEW.operation,
      'sale_price', NEW.sale_price,
      'rent', NEW.rent,
      'rent_period', NEW.rent_period,
      'premium', NEW.premium,
      'currency', NEW.currency,
      'parish', NEW.parish,
      'tenure_type', NEW.tenure_type,
      'housing_category', NEW.housing_category,
      'restriction', NEW.restriction,
      'bedrooms', NEW.bedrooms,
      'bathrooms', NEW.bathrooms,
      'matchable', NEW.matchable,
      'viewings_enabled', NEW.viewings_enabled,
      'viewing_hours', json(COALESCE(NEW.viewing_hours,'null')),
      'featured_rank', NEW.featured_rank,
      'cover_media_id', NEW.cover_media_id,
      'feat_pets', NEW.feat_pets,
      'feat_parking', NEW.feat_parking,
      'feat_furnished', NEW.feat_furnished,
      'feat_outdoor', json(COALESCE(NEW.feat_outdoor,'null')),
      'feat_type', NEW.feat_type) AS after_values,
    json_object(
      'review_requested_at', NEW.review_requested_at IS NOT OLD.review_requested_at,
      'review_requested_by', NEW.review_requested_by IS NOT OLD.review_requested_by,
      'published', NEW.published IS NOT OLD.published,
      'archived_at', NEW.archived_at IS NOT OLD.archived_at,
      'availability', NEW.availability IS NOT OLD.availability,
      'published_at', NEW.published_at IS NOT OLD.published_at,
      'confirmed_at', NEW.confirmed_at IS NOT OLD.confirmed_at,
      'use', NEW.use IS NOT OLD.use,
      'operation', NEW.operation IS NOT OLD.operation,
      'sale_price', NEW.sale_price IS NOT OLD.sale_price,
      'rent', NEW.rent IS NOT OLD.rent,
      'rent_period', NEW.rent_period IS NOT OLD.rent_period,
      'premium', NEW.premium IS NOT OLD.premium,
      'currency', NEW.currency IS NOT OLD.currency,
      'parish', NEW.parish IS NOT OLD.parish,
      'tenure_type', NEW.tenure_type IS NOT OLD.tenure_type,
      'housing_category', NEW.housing_category IS NOT OLD.housing_category,
      'restriction', NEW.restriction IS NOT OLD.restriction,
      'bedrooms', NEW.bedrooms IS NOT OLD.bedrooms,
      'bathrooms', NEW.bathrooms IS NOT OLD.bathrooms,
      'matchable', NEW.matchable IS NOT OLD.matchable,
      'viewings_enabled', NEW.viewings_enabled IS NOT OLD.viewings_enabled,
      'viewing_hours', NEW.viewing_hours IS NOT OLD.viewing_hours,
      'featured_rank', NEW.featured_rank IS NOT OLD.featured_rank,
      'cover_media_id', NEW.cover_media_id IS NOT OLD.cover_media_id,
      'feat_pets', NEW.feat_pets IS NOT OLD.feat_pets,
      'feat_parking', NEW.feat_parking IS NOT OLD.feat_parking,
      'feat_furnished', NEW.feat_furnished IS NOT OLD.feat_furnished,
      'feat_outdoor', NEW.feat_outdoor IS NOT OLD.feat_outdoor,
      'feat_type', NEW.feat_type IS NOT OLD.feat_type,
      'title', NEW.title IS NOT OLD.title,
      'property_type', NEW.property_type IS NOT OLD.property_type,
      'country', NEW.country IS NOT OLD.country,
      'location', NEW.location IS NOT OLD.location,
      'road_name', NEW.road_name IS NOT OLD.road_name,
      'tenure', NEW.tenure IS NOT OLD.tenure,
      'price_text', NEW.price_text IS NOT OLD.price_text,
      'summary', NEW.summary IS NOT OLD.summary,
      'description', NEW.description IS NOT OLD.description,
      'tour_url', NEW.tour_url IS NOT OLD.tour_url,
      'specs', NEW.specs IS NOT OLD.specs,
      'feat_evidence', NEW.feat_evidence IS NOT OLD.feat_evidence) AS changed) d
  WHERE c.listing_id=NEW.id
    AND (EXISTS(SELECT 1 FROM json_each(d.changed) WHERE value=1) OR c.action IN ('confirmed','published'));
END;

CREATE TRIGGER listing_event_delete AFTER DELETE ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=OLD.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,'listing',OLD.id,'listing.deleted',json_object(
    'revision',(SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0)+1
      FROM events WHERE entity_type='listing' AND entity_id=OLD.id),
    'source',c.source,
    'fields',json(json('[]')),
    'before',json(json('{}')),
    'after',json(json('{}')),
    'derived_fields',json(json('[]')),
    'related',json(c.related))
  FROM listing_event_context c
  WHERE c.listing_id=OLD.id;
END;

CREATE TRIGGER notification_listing_deleted AFTER DELETE ON listings BEGIN
  DELETE FROM notification_observations WHERE target_kind='listing' AND target_id=OLD.id;
  UPDATE notifications SET title='Deleted property',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='listing' AND target_id=OLD.id) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type='listing' AND entity_id=OLD.id));
END;

CREATE TRIGGER notification_offer_deleted AFTER DELETE ON offers BEGIN
  DELETE FROM notification_observations WHERE target_kind='offer' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted offer',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='offer' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TABLE listing_marketing_evidence (
 -- These are immutable historical identities, like events.entity_id, not live deletion barriers.
 listing_id TEXT NOT NULL,
 event_id INTEGER NOT NULL REFERENCES events(id),
 evidence_ref TEXT NOT NULL,
 media_id TEXT,
 source_id TEXT,
 action TEXT NOT NULL CHECK(action IN ('let_agreed','let','return_to_market')),
 reason_code TEXT NOT NULL CHECK(reason_code IN ('agreement','completed','fell_through','correction')),
 occurred_at TEXT NOT NULL,
 evidence_snapshot TEXT NOT NULL CHECK(json_valid(evidence_snapshot)),
 CHECK ((media_id IS NULL) <> (source_id IS NULL)),
 PRIMARY KEY(event_id,evidence_ref)
) WITHOUT ROWID;

CREATE INDEX listing_marketing_listing ON listing_marketing_evidence(listing_id,event_id);

DROP VIEW notification_event_projection;

CREATE VIEW notification_event_projection AS
SELECT e.id,e.at,e.actor,
  CASE WHEN e.entity_type='applicant' AND e.type LIKE 'offer.%' THEN 'offer'
    WHEN e.entity_type='applicant' AND e.type LIKE 'sale.%' THEN 'sale' ELSE e.entity_type END AS target_kind,
  CASE WHEN e.entity_type='applicant' AND e.type LIKE 'offer.%' THEN CAST(json_extract(e.data,'$.offer_id') AS TEXT)
    WHEN e.entity_type='applicant' AND e.type LIKE 'sale.%' THEN CAST(json_extract(e.data,'$.sale_id') AS TEXT) ELSE e.entity_id END AS target_id,
  CASE WHEN e.entity_type='applicant' AND e.type='sale.milestone' THEN json_object('milestone',json_extract(e.data,'$.key'))
    WHEN e.entity_type='rental' THEN json_patch('{}',json_object(
    'tenancy_id',json_extract(e.data,'$.tenancy_id'),'repair_id',json_extract(e.data,'$.repair_id'),
    'compliance_kind',json_extract(e.data,'$.compliance_kind'))) END AS target_context,
  CASE WHEN e.entity_type='viewing' THEN 'viewing' ELSE 'task' END AS category,
  CASE e.type
    WHEN 'viewing.booked' THEN 'Viewing booked' WHEN 'viewing.confirmed' THEN 'Viewing confirmed'
    WHEN 'viewing.rescheduled' THEN 'Viewing rescheduled' WHEN 'viewing.cancelled' THEN 'Viewing cancelled'
    WHEN 'viewing.completed' THEN 'Viewing completed' WHEN 'viewing.no_show' THEN 'Viewing missed'
    WHEN 'offer.recorded' THEN 'Offer recorded' WHEN 'offer.updated' THEN 'Offer updated'
    WHEN 'offer.countered' THEN 'Offer countered' WHEN 'offer.rejected' THEN 'Offer rejected'
    WHEN 'offer.withdrawn' THEN 'Offer withdrawn' WHEN 'offer.accepted' THEN 'Offer accepted'
    WHEN 'sale.updated' THEN 'Sale updated' WHEN 'sale.milestone' THEN 'Sale milestone updated'
    WHEN 'sale.completed' THEN 'Sale completed' WHEN 'sale.fallen_through' THEN 'Sale fell through'
    WHEN 'listing.review_requested' THEN 'Property ready for review' WHEN 'listing.review_returned' THEN 'Property returned to draft' WHEN 'listing.created' THEN 'Property created' WHEN 'listing.updated' THEN 'Property updated'
    WHEN 'listing.published' THEN 'Property published' WHEN 'listing.unpublished' THEN 'Property unpublished'
    WHEN 'listing.archived' THEN 'Property archived' WHEN 'listing.restored' THEN 'Property restored'
    WHEN 'listing.confirmed' THEN 'Property confirmed' WHEN 'listing.availability_changed' THEN 'Property availability changed'
    WHEN 'listing.featured_changed' THEN 'Featured property changed' WHEN 'listing.cover_changed' THEN 'Property cover changed'
    WHEN 'listing.recalculated' THEN 'Property recalculated' WHEN 'listing.deleted' THEN 'Property deleted'
    WHEN 'payment.recorded' THEN 'Payment recorded' WHEN 'payment.updated' THEN 'Payment updated'
    WHEN 'payments.imported' THEN 'Payments imported' WHEN 'rental.created' THEN 'Rental created'
    WHEN 'rental.updated' THEN 'Rental updated' WHEN 'rental.archived' THEN 'Rental archived'
    WHEN 'rental.restored' THEN 'Rental restored' WHEN 'tenancy.created' THEN 'Tenancy created'
    WHEN 'tenancy.updated' THEN 'Tenancy updated' WHEN 'tenancy.renewed' THEN 'Tenancy renewed'
    WHEN 'tenancy.ended' THEN 'Tenancy ended' WHEN 'tenancy.end_cancelled' THEN 'Tenancy end cancelled'
    WHEN 'rent.changed' THEN 'Rent changed' WHEN 'notice.recorded' THEN 'Notice recorded'
    WHEN 'arrears.step_done' THEN 'Arrears step completed' WHEN 'charge.edited' THEN 'Charge edited'
    WHEN 'compliance.updated' THEN 'Compliance updated' WHEN 'repair.created' THEN 'Repair reported'
    WHEN 'repair.updated' THEN 'Repair updated' END AS title,
  e.type='listing.deleted' AS target_deleted
FROM events e
WHERE (e.entity_type='viewing' AND e.type IN ('viewing.booked','viewing.confirmed','viewing.rescheduled','viewing.cancelled','viewing.completed','viewing.no_show'))
 OR (e.entity_type='applicant' AND (e.type IN ('offer.recorded','offer.updated','offer.countered','offer.rejected','offer.withdrawn','offer.accepted')
   AND EXISTS(SELECT 1 FROM offers WHERE id=json_extract(e.data,'$.offer_id') AND applicant_id=e.entity_id)
   OR e.type IN ('sale.updated','sale.milestone','sale.completed','sale.fallen_through')
   AND EXISTS(SELECT 1 FROM sales WHERE id=json_extract(e.data,'$.sale_id') AND applicant_id=e.entity_id)
   AND (e.type<>'sale.milestone' OR (json_extract(e.data,'$.key') IN ('lawyers','due_diligence','questionnaire','searches','mortgage','contract','funds','passing','settled')
     AND EXISTS(SELECT 1 FROM sale_milestones WHERE sale_id=json_extract(e.data,'$.sale_id') AND key=json_extract(e.data,'$.key'))))))
 OR (e.entity_type='listing' AND e.type IN ('listing.review_requested','listing.review_returned','listing.created','listing.updated','listing.published','listing.unpublished','listing.archived','listing.restored','listing.confirmed','listing.availability_changed','listing.featured_changed','listing.cover_changed','listing.recalculated','listing.deleted'))
 OR (e.rental_event_id IS NOT NULL AND e.entity_type IN ('rental','payment','collection'));

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM media EXCEPT SELECT * FROM est17_media_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_media_backup EXCEPT SELECT * FROM media);

DROP TABLE est17_media_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM matches EXCEPT SELECT * FROM est17_matches_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_matches_backup EXCEPT SELECT * FROM matches);

DROP TABLE est17_matches_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM daily_stats EXCEPT SELECT * FROM est17_daily_stats_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_daily_stats_backup EXCEPT SELECT * FROM daily_stats);

DROP TABLE est17_daily_stats_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM offers EXCEPT SELECT * FROM est17_offers_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_offers_backup EXCEPT SELECT * FROM offers);

DROP TABLE est17_offers_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM jobs EXCEPT SELECT * FROM est17_jobs_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_jobs_backup EXCEPT SELECT * FROM jobs);

DROP TABLE est17_jobs_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM viewing_requests EXCEPT SELECT * FROM est17_viewing_requests_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_viewing_requests_backup EXCEPT SELECT * FROM viewing_requests);

DROP TABLE est17_viewing_requests_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM drive_imports EXCEPT SELECT * FROM est17_drive_imports_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_drive_imports_backup EXCEPT SELECT * FROM drive_imports);

DROP TABLE est17_drive_imports_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM chats EXCEPT SELECT * FROM est17_chats_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_chats_backup EXCEPT SELECT * FROM chats);

DROP TABLE est17_chats_backup;

DROP TABLE est17_listing_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM pragma_foreign_key_check;

DROP TABLE est17_integrity_guard;

PRAGMA defer_foreign_keys = OFF;


-- BEGIN 0035_notification_categories.sql (QA data-safe variant)
-- NOT-08: preserve shared task identity, history, receipts and preferences.

-- D1 applies this rebuild transactionally; keep FK enforcement enabled.

PRAGMA defer_foreign_keys=ON;

CREATE TABLE not08_integrity_guard(n INTEGER NOT NULL CHECK(n=0));

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM pragma_foreign_key_check;

CREATE TABLE not08_notifications_backup AS SELECT * FROM notifications;

CREATE TABLE not08_notification_task_history_backup AS SELECT * FROM notification_task_history;

CREATE TABLE not08_notification_task_operations_backup AS SELECT * FROM notification_task_operations;

CREATE TABLE not08_notification_reads_backup AS SELECT * FROM notification_reads;

CREATE TABLE not08_notification_observations_backup AS SELECT * FROM notification_observations;

DROP TRIGGER "notification_applicant_deleted";

DROP TRIGGER "notification_check_deleted";

DROP TRIGGER "notification_contact_deleted";

DROP TRIGGER "notification_event_feed";

DROP TRIGGER "notification_listing_deleted";

DROP TRIGGER "notification_milestone_deleted";

DROP TRIGGER "notification_offer_deleted";

DROP TRIGGER "notification_payment_deleted";

DROP TRIGGER "notification_rental_deleted";

DROP TRIGGER "notification_repair_deleted";

DROP TRIGGER "notification_sale_deleted";

DROP TRIGGER "notification_task_changed";

DROP TRIGGER "notification_task_created";

DROP TRIGGER "notification_tenancy_deleted";

DROP TRIGGER "notification_viewing_deleted";

DROP VIEW notification_event_projection;

DROP TABLE notifications;

CREATE TABLE "notifications" (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL CHECK(category IN ('new_applicant','viewing','matched','task','agency_reply','message','compliance')),
  title TEXT NOT NULL,
  action_required INTEGER NOT NULL CHECK(action_required IN (0,1)),
  created_at TEXT NOT NULL,
  resolved_at TEXT, resolved_by TEXT,
  task_key TEXT UNIQUE,
  source_version INTEGER NOT NULL DEFAULT 0 CHECK(source_version >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  assigned_to TEXT,
  due_at TEXT,
  task_reason TEXT CHECK(task_reason IS NULL OR length(task_reason) <= 500),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','urgent')),
  closed_by_source INTEGER NOT NULL DEFAULT 0 CHECK(closed_by_source IN (0,1)),
  task_actor TEXT, task_action TEXT
, target_kind TEXT CHECK(target_kind IS NULL OR target_kind IN ('applicant','contact','viewing','listing','offer','sale','rental','payment','collection')), target_id TEXT, target_context TEXT CHECK(target_context IS NULL OR (json_valid(target_context) AND json_type(target_context)='object')), target_deleted INTEGER NOT NULL DEFAULT 0 CHECK(target_deleted IN (0,1)));

INSERT INTO notifications SELECT * FROM not08_notifications_backup;

INSERT INTO notification_task_history SELECT * FROM not08_notification_task_history_backup;

INSERT INTO notification_task_operations SELECT * FROM not08_notification_task_operations_backup;

INSERT INTO notification_reads SELECT * FROM not08_notification_reads_backup;

INSERT INTO notification_observations SELECT * FROM not08_notification_observations_backup;

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM notifications EXCEPT SELECT * FROM not08_notifications_backup);

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM not08_notifications_backup EXCEPT SELECT * FROM notifications);

DROP TABLE not08_notifications_backup;

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM notification_task_history EXCEPT SELECT * FROM not08_notification_task_history_backup);

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM not08_notification_task_history_backup EXCEPT SELECT * FROM notification_task_history);

DROP TABLE not08_notification_task_history_backup;

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM notification_task_operations EXCEPT SELECT * FROM not08_notification_task_operations_backup);

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM not08_notification_task_operations_backup EXCEPT SELECT * FROM notification_task_operations);

DROP TABLE not08_notification_task_operations_backup;

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM notification_reads EXCEPT SELECT * FROM not08_notification_reads_backup);

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM not08_notification_reads_backup EXCEPT SELECT * FROM notification_reads);

DROP TABLE not08_notification_reads_backup;

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM notification_observations EXCEPT SELECT * FROM not08_notification_observations_backup);

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM not08_notification_observations_backup EXCEPT SELECT * FROM notification_observations);

DROP TABLE not08_notification_observations_backup;

CREATE INDEX notifications_created ON notifications(created_at);

CREATE INDEX notifications_event ON notifications(event_id);

CREATE INDEX notifications_open ON notifications(resolved_at,category,created_at);

CREATE INDEX notifications_owner_due ON notifications(assigned_to,due_at) WHERE resolved_at IS NULL;

CREATE INDEX notifications_source_cursor ON notifications(source_version,id);

CREATE INDEX notifications_target ON notifications(target_kind,target_id);

CREATE VIEW notification_event_projection AS
SELECT e.id,e.at,e.actor,
  CASE WHEN e.entity_type='applicant' AND e.type LIKE 'offer.%' THEN 'offer'
    WHEN e.entity_type='applicant' AND e.type LIKE 'sale.%' THEN 'sale' ELSE e.entity_type END AS target_kind,
  CASE WHEN e.entity_type='applicant' AND e.type LIKE 'offer.%' THEN CAST(json_extract(e.data,'$.offer_id') AS TEXT)
    WHEN e.entity_type='applicant' AND e.type LIKE 'sale.%' THEN CAST(json_extract(e.data,'$.sale_id') AS TEXT) ELSE e.entity_id END AS target_id,
  CASE WHEN e.entity_type='applicant' AND e.type='sale.milestone' THEN json_object('milestone',json_extract(e.data,'$.key'))
    WHEN e.entity_type='rental' THEN json_patch('{}',json_object(
    'tenancy_id',json_extract(e.data,'$.tenancy_id'),'repair_id',json_extract(e.data,'$.repair_id'),
    'compliance_kind',json_extract(e.data,'$.compliance_kind'))) END AS target_context,
  CASE WHEN e.type='compliance.updated' AND e.entity_type='rental' THEN 'compliance' WHEN e.entity_type='viewing' THEN 'viewing' ELSE 'task' END AS category,
  CASE e.type
    WHEN 'viewing.booked' THEN 'Viewing booked' WHEN 'viewing.confirmed' THEN 'Viewing confirmed'
    WHEN 'viewing.rescheduled' THEN 'Viewing rescheduled' WHEN 'viewing.cancelled' THEN 'Viewing cancelled'
    WHEN 'viewing.completed' THEN 'Viewing completed' WHEN 'viewing.no_show' THEN 'Viewing missed'
    WHEN 'offer.recorded' THEN 'Offer recorded' WHEN 'offer.updated' THEN 'Offer updated'
    WHEN 'offer.countered' THEN 'Offer countered' WHEN 'offer.rejected' THEN 'Offer rejected'
    WHEN 'offer.withdrawn' THEN 'Offer withdrawn' WHEN 'offer.accepted' THEN 'Offer accepted'
    WHEN 'sale.updated' THEN 'Sale updated' WHEN 'sale.milestone' THEN 'Sale milestone updated'
    WHEN 'sale.completed' THEN 'Sale completed' WHEN 'sale.fallen_through' THEN 'Sale fell through'
    WHEN 'listing.review_requested' THEN 'Property ready for review' WHEN 'listing.review_returned' THEN 'Property returned to draft' WHEN 'listing.created' THEN 'Property created' WHEN 'listing.updated' THEN 'Property updated'
    WHEN 'listing.published' THEN 'Property published' WHEN 'listing.unpublished' THEN 'Property unpublished'
    WHEN 'listing.archived' THEN 'Property archived' WHEN 'listing.restored' THEN 'Property restored'
    WHEN 'listing.confirmed' THEN 'Property confirmed' WHEN 'listing.availability_changed' THEN 'Property availability changed'
    WHEN 'listing.featured_changed' THEN 'Featured property changed' WHEN 'listing.cover_changed' THEN 'Property cover changed'
    WHEN 'listing.recalculated' THEN 'Property recalculated' WHEN 'listing.deleted' THEN 'Property deleted'
    WHEN 'payment.recorded' THEN 'Payment recorded' WHEN 'payment.updated' THEN 'Payment updated'
    WHEN 'payments.imported' THEN 'Payments imported' WHEN 'rental.created' THEN 'Rental created'
    WHEN 'rental.updated' THEN 'Rental updated' WHEN 'rental.archived' THEN 'Rental archived'
    WHEN 'rental.restored' THEN 'Rental restored' WHEN 'tenancy.created' THEN 'Tenancy created'
    WHEN 'tenancy.updated' THEN 'Tenancy updated' WHEN 'tenancy.renewed' THEN 'Tenancy renewed'
    WHEN 'tenancy.ended' THEN 'Tenancy ended' WHEN 'tenancy.end_cancelled' THEN 'Tenancy end cancelled'
    WHEN 'rent.changed' THEN 'Rent changed' WHEN 'notice.recorded' THEN 'Notice recorded'
    WHEN 'arrears.step_done' THEN 'Arrears step completed' WHEN 'charge.edited' THEN 'Charge edited'
    WHEN 'compliance.updated' THEN 'Compliance updated' WHEN 'repair.created' THEN 'Repair reported'
    WHEN 'repair.updated' THEN 'Repair updated' END AS title,
  e.type='listing.deleted' AS target_deleted
FROM events e
WHERE (e.entity_type='viewing' AND e.type IN ('viewing.booked','viewing.confirmed','viewing.rescheduled','viewing.cancelled','viewing.completed','viewing.no_show'))
 OR (e.entity_type='applicant' AND (e.type IN ('offer.recorded','offer.updated','offer.countered','offer.rejected','offer.withdrawn','offer.accepted')
   AND EXISTS(SELECT 1 FROM offers WHERE id=json_extract(e.data,'$.offer_id') AND applicant_id=e.entity_id)
   OR e.type IN ('sale.updated','sale.milestone','sale.completed','sale.fallen_through')
   AND EXISTS(SELECT 1 FROM sales WHERE id=json_extract(e.data,'$.sale_id') AND applicant_id=e.entity_id)
   AND (e.type<>'sale.milestone' OR (json_extract(e.data,'$.key') IN ('lawyers','due_diligence','questionnaire','searches','mortgage','contract','funds','passing','settled')
     AND EXISTS(SELECT 1 FROM sale_milestones WHERE sale_id=json_extract(e.data,'$.sale_id') AND key=json_extract(e.data,'$.key'))))))
 OR (e.entity_type='listing' AND e.type IN ('listing.review_requested','listing.review_returned','listing.created','listing.updated','listing.published','listing.unpublished','listing.archived','listing.restored','listing.confirmed','listing.availability_changed','listing.featured_changed','listing.cover_changed','listing.recalculated','listing.deleted'))
 OR (e.rental_event_id IS NOT NULL AND e.entity_type IN ('rental','payment','collection'));

CREATE TRIGGER notification_applicant_deleted AFTER DELETE ON applicants BEGIN
  UPDATE notifications SET title='Deleted applicant',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='applicant' AND target_id=CAST(OLD.id AS TEXT)) OR event_id IN(SELECT id FROM events WHERE entity_type='applicant' AND entity_id=CAST(OLD.id AS TEXT));
END;

CREATE TRIGGER notification_check_deleted AFTER DELETE ON compliance_items BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.compliance_kind')=OLD.kind);
  UPDATE notifications SET title='Deleted check',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.compliance_kind')=OLD.kind;
END;

CREATE TRIGGER notification_contact_deleted AFTER DELETE ON contacts BEGIN
  UPDATE notifications SET title='Deleted applicant',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='contact' AND target_id=CAST(OLD.id AS TEXT)) OR event_id IN(SELECT id FROM events WHERE entity_type='contact' AND entity_id=CAST(OLD.id AS TEXT));
END;

CREATE TRIGGER notification_event_feed AFTER INSERT ON events BEGIN
  INSERT INTO notifications(task_key,event_id,source_version,category,title,action_required,created_at,
    target_kind,target_id,target_context,target_deleted)
    SELECT 'event:'||id,id,id,category,title,0,at,target_kind,target_id,target_context,target_deleted
    FROM notification_event_projection WHERE id=NEW.id;
END;

CREATE TRIGGER notification_listing_deleted AFTER DELETE ON listings BEGIN
  DELETE FROM notification_observations WHERE target_kind='listing' AND target_id=OLD.id;
  UPDATE notifications SET title='Deleted property',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='listing' AND target_id=OLD.id) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type='listing' AND entity_id=OLD.id));
END;

CREATE TRIGGER notification_milestone_deleted AFTER DELETE ON sale_milestones BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='sale' AND target_id=CAST(OLD.sale_id AS TEXT) AND json_extract(target_context,'$.milestone')=OLD.key);
  UPDATE notifications SET title='Deleted milestone',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='sale' AND target_id=CAST(OLD.sale_id AS TEXT) AND json_extract(target_context,'$.milestone')=OLD.key;
END;

CREATE TRIGGER notification_offer_deleted AFTER DELETE ON offers BEGIN
  DELETE FROM notification_observations WHERE target_kind='offer' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted offer',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='offer' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_payment_deleted AFTER DELETE ON payments BEGIN
  DELETE FROM notification_observations WHERE target_kind='payment' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted payment',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='payment' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_rental_deleted AFTER DELETE ON rentals BEGIN
  DELETE FROM notification_observations WHERE target_kind='rental' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted rental',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_repair_deleted AFTER DELETE ON repairs BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.repair_id')=OLD.id);
  UPDATE notifications SET title='Deleted repair',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.repair_id')=OLD.id;
END;

CREATE TRIGGER notification_sale_deleted AFTER DELETE ON sales BEGIN
  DELETE FROM notification_observations WHERE target_kind='sale' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted sale',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='sale' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_task_changed AFTER UPDATE OF event_id,category,title,action_required,
  resolved_at,resolved_by,assigned_to,due_at,task_reason,source_version,urgency,closed_by_source,
  target_kind,target_id,target_context,target_deleted ON notifications
WHEN OLD.task_key IS NOT NULL BEGIN
  UPDATE notifications SET revision=OLD.revision+1,
    closed_by_source=CASE WHEN NEW.resolved_at IS NULL THEN 0
      WHEN OLD.resolved_at IS NULL THEN CASE WHEN NEW.task_action='done' THEN 0 ELSE 1 END
      ELSE NEW.closed_by_source END
    WHERE id=NEW.id AND (OLD.event_id IS NOT NEW.event_id OR OLD.category IS NOT NEW.category
      OR OLD.title IS NOT NEW.title OR OLD.action_required IS NOT NEW.action_required
      OR OLD.resolved_at IS NOT NEW.resolved_at OR OLD.resolved_by IS NOT NEW.resolved_by
      OR OLD.assigned_to IS NOT NEW.assigned_to OR OLD.due_at IS NOT NEW.due_at
      OR OLD.task_reason IS NOT NEW.task_reason OR OLD.source_version IS NOT NEW.source_version
      OR OLD.urgency IS NOT NEW.urgency OR OLD.closed_by_source IS NOT NEW.closed_by_source
      OR OLD.target_kind IS NOT NEW.target_kind OR OLD.target_id IS NOT NEW.target_id
      OR OLD.target_context IS NOT NEW.target_context OR OLD.target_deleted IS NOT NEW.target_deleted);
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    SELECT NEW.id,revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      COALESCE(NEW.task_actor,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN NEW.resolved_by END,'system'),
      COALESCE(NEW.task_action,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN 'source_resolved' ELSE 'source_update' END)
    FROM notifications WHERE id=NEW.id AND revision>OLD.revision;
  UPDATE notifications SET task_actor=NULL,task_action=NULL WHERE id=NEW.id;
END;

CREATE TRIGGER notification_task_created AFTER INSERT ON notifications BEGIN
  UPDATE notifications SET task_key=COALESCE(NEW.task_key,'legacy:' || NEW.id),
    source_version=CASE WHEN NEW.source_version=0 THEN NEW.event_id ELSE NEW.source_version END,
    task_actor=NULL,task_action=NULL WHERE id=NEW.id;
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    VALUES(NEW.id,1,NEW.created_at,COALESCE(NEW.task_actor,(SELECT actor FROM events WHERE id=NEW.event_id),'system'),'created');
END;

CREATE TRIGGER notification_tenancy_deleted AFTER DELETE ON tenancies BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.tenancy_id')=OLD.id);
  UPDATE notifications SET title='Deleted tenancy',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.tenancy_id')=OLD.id;
END;

CREATE TRIGGER notification_viewing_deleted AFTER DELETE ON viewing_requests BEGIN
  UPDATE notifications SET title='Deleted viewing request',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='viewing' AND target_id=CAST(OLD.id AS TEXT)) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type='viewing' AND entity_id=CAST(OLD.id AS TEXT)));
END;

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM pragma_foreign_key_check;

DROP TABLE not08_integrity_guard;

PRAGMA defer_foreign_keys=OFF;


-- BEGIN 0036_weekly_insights.sql (QA data-safe variant)
-- ANA-08: immutable aggregate snapshots. Existing Inbox tables and foreign keys are untouched.
CREATE TABLE weekly_insights (
  week_start TEXT PRIMARY KEY CHECK(length(week_start)=10 AND date(week_start,'+0 days') IS week_start AND strftime('%w',week_start)='1'),
  week_until TEXT NOT NULL CHECK(week_until=date(week_start,'+7 days')),
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload) AND json_type(payload)='object' AND json_extract(payload,'$.version') IS 1)
) WITHOUT ROWID;

-- One statement owns the snapshot, audit event and informational notice: any failure rolls everything back.
CREATE TRIGGER weekly_insights_notice AFTER INSERT ON weekly_insights BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(NEW.generated_at,'system','admin','weekly-insights:'||NEW.week_start,'analytics.weekly_created',
      json_object('version',1,'from',NEW.week_start,'until',NEW.week_until));
  INSERT INTO notifications(event_id,category,title,action_required,created_at,task_key,source_version,target_kind,target_id)
    VALUES(last_insert_rowid(),'message','Weekly Insights · '||NEW.week_start||'–'||date(NEW.week_until,'-1 day'),
      0,NEW.generated_at,'insights:weekly:'||NEW.week_start,last_insert_rowid(),'collection','weekly-insights:'||NEW.week_start);
END;


-- BEGIN 0037_match_ranking.sql (QA data-safe variant)
-- BUS-14: pages use a stable persisted order; legacy searches remain version0 until a full valid recompute.
ALTER TABLE applicants ADD COLUMN matches_revision INTEGER NOT NULL DEFAULT 0 CHECK(matches_revision >= 0);
ALTER TABLE applicants ADD COLUMN match_ranking_version INTEGER NOT NULL DEFAULT 0 CHECK(match_ranking_version IN (0,1));
ALTER TABLE applicants ADD COLUMN match_inputs_revision INTEGER NOT NULL DEFAULT 0 CHECK(match_inputs_revision >= 0);
-- A separate row avoids nested listing updates entering the existing editorial event triggers.
CREATE TABLE listing_match_inputs(listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
 version INTEGER NOT NULL CHECK(version>=0));
CREATE INDEX matches_page ON matches(applicant_id,status,requirements_rank,score DESC,listing_id COLLATE BINARY,id);
CREATE TRIGGER matches_page_insert AFTER INSERT ON matches BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=NEW.applicant_id;
END;
CREATE TRIGGER matches_page_delete AFTER DELETE ON matches BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=OLD.applicant_id;
END;
CREATE TRIGGER matches_page_update AFTER UPDATE OF status,score,checks,requirements_rank,reject_reason,reviewed_at ON matches
WHEN OLD.status IS NOT NEW.status OR OLD.score IS NOT NEW.score OR OLD.checks IS NOT NEW.checks
 OR OLD.requirements_rank IS NOT NEW.requirements_rank OR OLD.reject_reason IS NOT NEW.reject_reason OR OLD.reviewed_at IS NOT NEW.reviewed_at BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=NEW.applicant_id;
END;
CREATE TRIGGER applicants_match_inputs AFTER UPDATE OF requirement_priorities,household_children,household_children_status,move_in_date,lease_term_months,near,requirements,operation,budget_min,budget_max,budget_stretch,property_types,bedrooms_min,bedrooms_max,bedrooms_ideal,bathrooms_min,parking_spaces,outdoor,furnished,pets,parishes_wanted,parishes_excluded,housing_status,buyer_position,archived_at,search_state,search_category,stage ON applicants
WHEN OLD.requirement_priorities IS NOT NEW.requirement_priorities OR OLD.household_children IS NOT NEW.household_children OR OLD.household_children_status IS NOT NEW.household_children_status OR OLD.move_in_date IS NOT NEW.move_in_date OR OLD.lease_term_months IS NOT NEW.lease_term_months OR OLD.near IS NOT NEW.near OR OLD.requirements IS NOT NEW.requirements OR OLD.operation IS NOT NEW.operation OR OLD.budget_min IS NOT NEW.budget_min OR OLD.budget_max IS NOT NEW.budget_max OR OLD.budget_stretch IS NOT NEW.budget_stretch OR OLD.property_types IS NOT NEW.property_types OR OLD.bedrooms_min IS NOT NEW.bedrooms_min OR OLD.bedrooms_max IS NOT NEW.bedrooms_max OR OLD.bedrooms_ideal IS NOT NEW.bedrooms_ideal OR OLD.bathrooms_min IS NOT NEW.bathrooms_min OR OLD.parking_spaces IS NOT NEW.parking_spaces OR OLD.outdoor IS NOT NEW.outdoor OR OLD.furnished IS NOT NEW.furnished OR OLD.pets IS NOT NEW.pets OR OLD.parishes_wanted IS NOT NEW.parishes_wanted OR OLD.parishes_excluded IS NOT NEW.parishes_excluded OR OLD.housing_status IS NOT NEW.housing_status OR OLD.buyer_position IS NOT NEW.buyer_position OR OLD.archived_at IS NOT NEW.archived_at OR OLD.search_state IS NOT NEW.search_state OR OLD.search_category IS NOT NEW.search_category OR OLD.stage IS NOT NEW.stage BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1, match_inputs_revision=match_inputs_revision+1,
 match_ranking_version=0 WHERE id=NEW.id;
END;
CREATE TRIGGER listings_match_inputs AFTER UPDATE OF operation,availability,archived_at,bedrooms,bathrooms,parish,published,sale_price,rent,rent_period,feat_pets,feat_parking,feat_furnished,feat_outdoor,feat_type,feat_evidence,tenure_type,housing_category,restriction,matchable,use,country,currency ON listings
WHEN OLD.operation IS NOT NEW.operation OR OLD.availability IS NOT NEW.availability OR OLD.archived_at IS NOT NEW.archived_at OR OLD.bedrooms IS NOT NEW.bedrooms OR OLD.bathrooms IS NOT NEW.bathrooms OR OLD.parish IS NOT NEW.parish OR OLD.published IS NOT NEW.published OR OLD.sale_price IS NOT NEW.sale_price OR OLD.rent IS NOT NEW.rent OR OLD.rent_period IS NOT NEW.rent_period OR OLD.feat_pets IS NOT NEW.feat_pets OR OLD.feat_parking IS NOT NEW.feat_parking OR OLD.feat_furnished IS NOT NEW.feat_furnished OR OLD.feat_outdoor IS NOT NEW.feat_outdoor OR OLD.feat_type IS NOT NEW.feat_type OR OLD.feat_evidence IS NOT NEW.feat_evidence OR OLD.tenure_type IS NOT NEW.tenure_type OR OLD.housing_category IS NOT NEW.housing_category OR OLD.restriction IS NOT NEW.restriction OR OLD.matchable IS NOT NEW.matchable OR OLD.use IS NOT NEW.use OR OLD.country IS NOT NEW.country OR OLD.currency IS NOT NEW.currency BEGIN
 INSERT INTO listing_match_inputs(listing_id,version) VALUES(NEW.id,1)
 ON CONFLICT(listing_id) DO UPDATE SET version=version+1;
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id IN (SELECT applicant_id FROM matches WHERE listing_id=NEW.id);
END;
CREATE TRIGGER applicants_ranking_page AFTER UPDATE OF match_ranking_version ON applicants
WHEN OLD.match_ranking_version IS NOT NEW.match_ranking_version BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=NEW.id;
END;


-- BEGIN 0038_history_related.sql (QA data-safe variant)
-- SPR-02 B: scope existing applicant events without copying personal data.
CREATE INDEX events_listing_related ON events(
  (CASE WHEN json_valid(data) THEN json_extract(data, '$.listing_id') END),
  at DESC, id DESC
) WHERE entity_type = 'applicant';

-- The viewing association exists only while both the viewing and listing exist.
-- Foreign keys remove it on manual/retention deletion; no tombstone or contact data.
CREATE TABLE history_viewing_events (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  viewing_id INTEGER NOT NULL REFERENCES viewing_requests(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  at TEXT NOT NULL
);
CREATE INDEX history_viewing_listing ON history_viewing_events(listing_id, at DESC, event_id DESC);
CREATE INDEX history_viewing_by_viewing ON history_viewing_events(viewing_id);

INSERT INTO history_viewing_events(event_id,viewing_id,listing_id,at)
  SELECT e.id,v.id,v.listing_id,e.at FROM events e
  JOIN viewing_requests v ON e.entity_type='viewing' AND e.entity_id=CAST(v.id AS TEXT)
  JOIN listings l ON l.id=v.listing_id
  WHERE e.type IN ('viewing.requested','viewing.booked','viewing.confirmed',
    'viewing.rescheduled','viewing.cancelled','viewing.completed','viewing.no_show')
    AND CASE WHEN json_valid(e.data) THEN json_extract(e.data,'$.listing_id') END=v.listing_id;

CREATE TRIGGER history_viewing_event_insert AFTER INSERT ON events
  WHEN NEW.entity_type='viewing' AND NEW.type IN ('viewing.requested','viewing.booked','viewing.confirmed',
    'viewing.rescheduled','viewing.cancelled','viewing.completed','viewing.no_show')
BEGIN
  INSERT INTO history_viewing_events(event_id,viewing_id,listing_id,at)
    SELECT NEW.id,v.id,v.listing_id,NEW.at FROM viewing_requests v
    JOIN listings l ON l.id=v.listing_id WHERE CAST(v.id AS TEXT)=NEW.entity_id;
END;

-- Changing a viewing's listing never reassigns old events to the new property.
CREATE TRIGGER history_viewing_relink AFTER UPDATE OF listing_id ON viewing_requests
  WHEN OLD.listing_id IS NOT NEW.listing_id
BEGIN
  DELETE FROM history_viewing_events WHERE viewing_id=NEW.id;
END;


-- Migration metadata for later QA schema updates.
CREATE TABLE "d1_migrations"(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);
INSERT INTO "d1_migrations"(name) VALUES
('0001_init.sql'),
('0002_deleted_listings.sql'),
('0003_viewing_listing_snapshot.sql'),
('0004_featured_rank.sql'),
('0005_viewing_notes.sql'),
('0006_home_order.sql'),
('0007_tours.sql'),
('0008_applicants.sql'),
('0009_matches.sql'),
('0010_viewings.sql'),
('0011_daily_stats.sql'),
('0012_sales.sql'),
('0013_rentals.sql'),
('0014_retention.sql'),
('0015_jersey_fields.sql'),
('0016_interest_corrections.sql'),
('0017_to_confirm.sql'),
('0018_jobs.sql'),
('0019_last_contact.sql'),
('0020_drive_imports.sql'),
('0021_published_at.sql'),
('0022_chats.sql'),
('0023_email.sql'),
('0024_search_lifecycle.sql'),
('0025_registration_categories.sql'),
('0026_search_viewing_availability.sql'),
('0027_property_viewings.sql'),
('0029_listing_events.sql'),
('0030_advertisers.sql'),
('0031_requirement_priorities.sql'),
('0032_notification_tasks.sql'),
('0033_notification_events.sql'),
('0034_listing_editorial.sql'),
('0035_notification_categories.sql'),
('0036_weekly_insights.sql'),
('0037_match_ranking.sql'),
('0038_history_related.sql');

-- BEGIN synthetic QA fixture
-- Synthetic QA data for an ISOLATED QA_DB only. Never run against business DB.
CREATE TABLE qa_history_guard(id INTEGER PRIMARY KEY CHECK(id=1),marker TEXT NOT NULL);
INSERT INTO qa_history_guard(id,marker) VALUES(1,'hampton-qa-history-v1');
INSERT INTO listings(id,use,title,operation,availability,published,specs,created_at,updated_at,updated_by)
VALUES('HE-Q999','residential','Fictional QA property','sale','for_sale',0,'[]',
'2026-11-10T09:00:00.000Z','2026-11-10T09:00:00.000Z','system');
INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at)
VALUES(1,'Synthetic person','nobody@example.test','2026-11-10T09:00:00.000Z',
'2026-11-10T09:00:00.000Z','2026-11-10T09:00:00.000Z');
INSERT INTO applicants(id,contact_id,operation,source,stage,created_at,updated_at)
VALUES(1,1,'buy','email','new','2026-11-10T09:00:00.000Z','2026-11-10T09:00:00.000Z');
INSERT INTO viewing_requests(id,listing_id,kind,date,time,name,email,status,created_at)
VALUES(1,'HE-Q999','In person','2026-11-12','11:00','Synthetic visitor','visitor@example.test',
'requested','2026-11-10T09:01:00.000Z');
INSERT INTO offers(id,listing_id,applicant_id,amount,status,created_at,updated_at)
VALUES(1,'HE-Q999',1,1,'accepted','2026-11-10T09:02:00.000Z','2026-11-10T09:02:00.000Z');
INSERT INTO sales(id,listing_id,applicant_id,offer_id,price,created_at,updated_at)
VALUES(1,'HE-Q999',1,1,1,'2026-11-10T09:03:00.000Z','2026-11-10T09:03:00.000Z');
INSERT INTO events(at,actor,entity_type,entity_id,type,data)
VALUES('2026-11-10T09:00:00.000Z','system','listing','HE-Q999','listing.created','{"fields":[]}');
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<55)
INSERT INTO events(at,actor,entity_type,entity_id,type,data)
SELECT printf('2026-11-10T09:%02d:00.000Z',i%60),'system','listing','HE-Q999',
'listing.updated','{"fields":[]}' FROM n;
INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES
('2026-11-10T11:01:00.000Z','system','applicant','1','match.reviewed',
 '{"listing_id":"HE-Q999","from":"found","to":"shortlisted"}'),
('2026-11-10T11:02:00.000Z','system','viewing','1','viewing.requested',
 '{"listing_id":"HE-Q999"}'),
('2026-11-10T11:03:00.000Z','system','applicant','1','offer.recorded',
 '{"listing_id":"HE-Q999","offer_id":1}'),
('2026-11-10T11:04:00.000Z','system','applicant','1','sale.milestone',
 '{"listing_id":"HE-Q999","sale_id":1,"key":"passing","after":{"planned_on":"2026-11-12"}}');
