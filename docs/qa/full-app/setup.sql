-- Proposed initialization of the EMPTY, SEPARATE full-app QA D1 only.

-- Not authorized for remote execution. Never use this against the business or History D1.

-- A second import is intentionally rejected; inspect remote state after any uncertain result.

-- No migration rows, identities, listings, URLs or other data are copied from the business.

-- First executable statement fails BEFORE any write if a non-internal object exists.

SELECT json(CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name <> '_cf_KV') THEN '{}' ELSE 'QA initialization requires an empty database' END);

CREATE TABLE admins (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  added_by TEXT, added_at TEXT NOT NULL
, name TEXT);

CREATE TABLE advertiser_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  advertiser_id INTEGER NOT NULL REFERENCES advertisers(id),
  action TEXT NOT NULL CHECK(action IN ('retained','activity')),
  reason TEXT,
  on_date TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);

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

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value)),
  updated_at TEXT NOT NULL, updated_by TEXT
) WITHOUT ROWID;

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
, first_reviewed_at TEXT, search_state TEXT NOT NULL DEFAULT 'active'
  CHECK (search_state IN ('active', 'resolved', 'needs_review')), resolved_at TEXT, resolved_by TEXT, resolution_reason TEXT CHECK (
  (search_state = 'resolved' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL
    AND length(trim(resolved_by)) > 0 AND resolution_reason IS NOT NULL AND length(trim(resolution_reason)) BETWEEN 1 AND 200)
  OR (search_state <> 'resolved' AND resolved_at IS NULL AND resolved_by IS NULL AND resolution_reason IS NULL)), search_category TEXT NOT NULL DEFAULT 'residential'
  CHECK (search_category IN ('residential', 'commercial')), search_operation TEXT CHECK (search_operation IS NULL OR
  (search_operation = 'transfer' AND search_category = 'commercial' AND operation = 'rent')), commercial_kind TEXT CHECK (commercial_kind IS NULL OR commercial_kind IN ('property', 'business', 'both')), commercial_use TEXT, area_min REAL CHECK (area_min IS NULL OR area_min > 0), area_max REAL CHECK (area_max IS NULL OR area_max > 0), area_unit TEXT CHECK (area_unit IS NULL OR area_unit IN ('sqm', 'sqft')), commercial_purchase REAL CHECK (commercial_purchase IS NULL OR commercial_purchase > 0), commercial_rent REAL CHECK (commercial_rent IS NULL OR commercial_rent > 0), commercial_rent_period TEXT CHECK (commercial_rent_period IS NULL OR commercial_rent_period IN ('month', 'year')), commercial_premium REAL CHECK (commercial_premium IS NULL OR commercial_premium >= 0), commercial_expenses REAL CHECK (commercial_expenses IS NULL OR commercial_expenses >= 0), household_total INTEGER CHECK (household_total IS NULL OR household_total >= 0), household_children_status TEXT CHECK (household_children_status IS NULL OR household_children_status IN ('known', 'unknown', 'not_applicable')), preferred_language TEXT, bedrooms_max INTEGER CHECK (bedrooms_max IS NULL OR bedrooms_max >= 0), viewing_availability TEXT CHECK (viewing_availability IS NULL OR json_valid(viewing_availability)), requirement_priorities TEXT CHECK (requirement_priorities IS NULL OR
  (json_valid(requirement_priorities) AND json_type(requirement_priorities) = 'object'
   AND COALESCE(json_extract(requirement_priorities, '$.version') = 1 AND json_type(requirement_priorities, '$.values') = 'object', 0))), household_children_ages TEXT CHECK (household_children_ages IS NULL OR
  (json_valid(household_children_ages) AND json_type(household_children_ages) = 'array' AND json_array_length(household_children_ages) <= 20)), household_ages_at TEXT, matches_revision INTEGER NOT NULL DEFAULT 0 CHECK(matches_revision >= 0), match_ranking_version INTEGER NOT NULL DEFAULT 0 CHECK(match_ranking_version IN (0,1)), match_inputs_revision INTEGER NOT NULL DEFAULT 0 CHECK(match_inputs_revision >= 0));

CREATE TABLE arrears_steps (
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  charge_due_on TEXT NOT NULL,
  step TEXT NOT NULL,
  done_at TEXT NOT NULL, done_by TEXT,
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  PRIMARY KEY (tenancy_id, charge_due_on, step)
) WITHOUT ROWID;

CREATE TABLE charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  due_on TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  kind TEXT NOT NULL DEFAULT 'rent' CHECK (kind IN ('rent','opening')),
  edited INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0,1)),
  UNIQUE (tenancy_id, due_on, kind)
);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('visitor','team')),
  sent_by TEXT, -- the admin's email for a team message; never sent to the website (C6)
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL
);

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

CREATE TABLE compliance_items (
  rental_id INTEGER NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  done_on TEXT, expires_on TEXT,
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  updated_at TEXT, updated_by TEXT,
  PRIMARY KEY (rental_id, kind)
) WITHOUT ROWID;

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
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT, last_contact_at TEXT,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE daily_stats (
  day TEXT NOT NULL,                        -- YYYY-MM-DD, Jersey
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('view','photos','tour')),
  n INTEGER NOT NULL DEFAULT 0 CHECK (n >= 0),
  PRIMARY KEY (day, listing_id, metric)
) WITHOUT ROWID;

CREATE TABLE deleted_listings (
  id TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL,
  deleted_by TEXT
);

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

CREATE TABLE email_attempts (
  token TEXT PRIMARY KEY,
  outbound_id INTEGER,
  day TEXT NOT NULL,
  at TEXT NOT NULL
);

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

CREATE TABLE email_inbound_keys (key TEXT PRIMARY KEY, created_at TEXT NOT NULL);

CREATE TABLE email_suppressions (
  address_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('team','provider'))
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL, actor TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('applicant','contact','viewing','admin','listing','rental','payment','collection')),
  entity_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT,
  rental_event_id INTEGER UNIQUE REFERENCES rental_events(id) ON DELETE SET NULL
);

CREATE TABLE history_viewing_events (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  viewing_id INTEGER NOT NULL REFERENCES viewing_requests(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  at TEXT NOT NULL
);

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

CREATE TABLE listing_event_operations (
  actor TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  event_id INTEGER REFERENCES events(id),
  PRIMARY KEY(actor,operation_id)
) WITHOUT ROWID;

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

CREATE TABLE listing_match_inputs(listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
 version INTEGER NOT NULL CHECK(version>=0));

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
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, requirements_rank INTEGER NOT NULL DEFAULT 1 CHECK (requirements_rank BETWEEN 0 AND 3),
  UNIQUE (applicant_id, listing_id)
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

CREATE TABLE negotiators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  role TEXT CHECK (role IS NULL OR length(role) <= 80),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  hours TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT
);

CREATE TABLE notification_cursor (
  key TEXT PRIMARY KEY CONSTRAINT notification_cursor_cas CHECK(key='queues'), revision INTEGER NOT NULL,
  after_key TEXT NOT NULL, observed_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE notification_observations (
  task_key TEXT PRIMARY KEY REFERENCES notifications(task_key) ON DELETE CASCADE,
  kind TEXT NOT NULL, entity_id TEXT NOT NULL, cycle TEXT NOT NULL,
  signature TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
  target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
  event_id INTEGER NOT NULL REFERENCES events(id)
) WITHOUT ROWID;

CREATE TABLE notification_preferences (
  admin TEXT PRIMARY KEY REFERENCES admins(email) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  feed_categories TEXT NOT NULL CHECK(json_valid(feed_categories) AND json_type(feed_categories)='array')
);

CREATE TABLE notification_reads (
  admin TEXT NOT NULL REFERENCES admins(email) ON DELETE CASCADE,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  read_revision INTEGER NOT NULL CHECK(read_revision >= 1),
  PRIMARY KEY(admin,notification_id)
);

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

CREATE TABLE rent_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  effective_on TEXT NOT NULL,
  rent INTEGER NOT NULL CHECK (rent > 0 AND rent <= 1000000),
  created_at TEXT NOT NULL, created_by TEXT,
  UNIQUE (tenancy_id, effective_on)
);

CREATE TABLE rental_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rental_id INTEGER REFERENCES rentals(id) ON DELETE CASCADE,
  tenancy_id INTEGER REFERENCES tenancies(id),
  at TEXT NOT NULL,
  actor TEXT,
  type TEXT NOT NULL,
  data TEXT CHECK (data IS NULL OR json_valid(data))
);

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

CREATE TABLE research_facts (
  fact_id TEXT PRIMARY KEY, property_id TEXT, source_id TEXT, origin TEXT, field TEXT, value TEXT,
  confidence TEXT, context TEXT
);

CREATE TABLE research_financial_terms (
  term_id TEXT PRIMARY KEY, property_id TEXT, source_id TEXT, term_type TEXT, amount REAL, currency TEXT,
  period TEXT, qualifier TEXT, notes TEXT, source_url TEXT
);

CREATE TABLE research_issues (
  issue_id TEXT PRIMARY KEY, property_ids TEXT, field TEXT, severity TEXT, issue TEXT, evidence TEXT,
  source_urls TEXT, proposed_action TEXT, confidence TEXT
);

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

CREATE TABLE research_search_log (
  search_id TEXT PRIMARY KEY, property_id TEXT, date TEXT, query TEXT, engine TEXT, outcome TEXT
);

CREATE TABLE research_sources (
  source_id TEXT PRIMARY KEY, property_id TEXT, origin TEXT, title TEXT, url TEXT, accessed_on TEXT,
  source_type TEXT, access_level TEXT, observed_status TEXT, price_text TEXT, source_date TEXT,
  summary TEXT, match_relevance TEXT, agent_or_site TEXT
);

CREATE TABLE sale_milestones (
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  planned_on TEXT, done_on TEXT,
  not_needed INTEGER NOT NULL DEFAULT 0 CHECK (not_needed IN (0,1)),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  CHECK (done_on IS NULL OR not_needed = 0),
  PRIMARY KEY (sale_id, key)
) WITHOUT ROWID;

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

CREATE TABLE "viewing_requests" (
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
  outcome_note TEXT CHECK (outcome_note IS NULL OR length(outcome_note) <= 500), interest_removed_at TEXT, interest_reason TEXT
  CHECK ((interest_reason IS NULL) = (interest_removed_at IS NULL)
    AND (interest_reason IS NULL OR interest_reason IN ('no_longer_interested','not_buyer','other'))), interest_note TEXT
  CHECK ((interest_note IS NULL OR (interest_reason IS NOT NULL AND length(interest_note) <= 200))
    AND (interest_reason IS NOT 'other' OR interest_note IS NOT NULL)), interest_same_as TEXT
  CHECK (interest_same_as IS NULL OR length(interest_same_as) BETWEEN 1 AND 254),
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK (outcome IS NULL OR status = 'completed')
);

CREATE TABLE weekly_insights (
  week_start TEXT PRIMARY KEY CHECK(length(week_start)=10 AND date(week_start,'+0 days') IS week_start AND strftime('%w',week_start)='1'),
  week_until TEXT NOT NULL CHECK(week_until=date(week_start,'+7 days')),
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload) AND json_type(payload)='object' AND json_extract(payload,'$.version') IS 1)
) WITHOUT ROWID;

CREATE INDEX advertiser_name ON advertisers(name COLLATE NOCASE, id);

CREATE INDEX advertiser_reviews_advertiser ON advertiser_reviews(advertiser_id, id);

CREATE UNIQUE INDEX applicants_active_category_operation ON applicants(contact_id, COALESCE(search_operation, operation), search_category)
  WHERE search_state = 'active' AND archived_at IS NULL;

CREATE INDEX applicants_contact ON applicants(contact_id);

CREATE INDEX applicants_operation ON applicants(operation, created_at);

CREATE INDEX applicants_queue ON applicants(created_at) WHERE archived_at IS NULL AND search_state = 'active';

CREATE INDEX charges_cover ON charges(tenancy_id, due_on, kind, amount);

CREATE INDEX chat_messages_chat ON chat_messages(chat_id, id);

CREATE INDEX chats_last ON chats(last_at);

CREATE INDEX chats_waiting ON chats(waiting_since) WHERE status = 'waiting';

CREATE INDEX contacts_activity ON contacts(last_activity_at);

CREATE UNIQUE INDEX contacts_email ON contacts(email) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX contacts_phone ON contacts(phone) WHERE phone IS NOT NULL;

CREATE INDEX drive_imports_todo ON drive_imports(created_at) WHERE status IN ('queued','working');

CREATE INDEX email_attempts_at ON email_attempts(at);

CREATE INDEX email_attempts_day ON email_attempts(day);

CREATE INDEX email_inbound_header_from ON email_inbound(header_from) WHERE header_from IS NOT NULL;

CREATE INDEX email_inbound_keys_at ON email_inbound_keys(created_at);

CREATE INDEX email_inbound_received ON email_inbound(received_at);

CREATE INDEX email_inbound_sender ON email_inbound(sender) WHERE sender IS NOT NULL;

CREATE INDEX events_entity ON events(entity_type,entity_id,at);

CREATE INDEX events_listing_related ON events(
  (CASE WHEN json_valid(data) THEN json_extract(data, '$.listing_id') END),
  at DESC, id DESC
) WHERE entity_type = 'applicant';

CREATE UNIQUE INDEX events_listing_revision ON events(entity_id,CAST(json_extract(data,'$.revision') AS INTEGER)) WHERE entity_type='listing';

CREATE INDEX history_viewing_by_viewing ON history_viewing_events(viewing_id);

CREATE INDEX history_viewing_listing ON history_viewing_events(listing_id, at DESC, event_id DESC);

CREATE UNIQUE INDEX jobs_open ON jobs(listing_id, kind) WHERE status IN ('queued','working','draft');

CREATE INDEX jobs_todo ON jobs(created_at) WHERE status IN ('queued','working');

CREATE INDEX listing_marketing_listing ON listing_marketing_evidence(listing_id,event_id);

CREATE INDEX listings_drive_folder ON listings(drive_folder_id) WHERE drive_folder_id IS NOT NULL;

CREATE INDEX listings_live ON listings(availability, operation, confirmed_at) WHERE published = 1 AND archived_at IS NULL;

CREATE INDEX matches_listing ON matches(listing_id);

CREATE INDEX matches_page ON matches(applicant_id,status,requirements_rank,score DESC,listing_id COLLATE BINARY,id);

CREATE INDEX matches_status ON matches(status, applicant_id);

CREATE INDEX media_listing ON media(listing_id, position);

CREATE INDEX negotiator_exceptions_day ON negotiator_exceptions(negotiator_id, date);

CREATE INDEX notifications_created ON notifications(created_at);

CREATE INDEX notifications_event ON notifications(event_id);

CREATE INDEX notifications_open ON notifications(resolved_at,category,created_at);

CREATE INDEX notifications_owner_due ON notifications(assigned_to,due_at) WHERE resolved_at IS NULL;

CREATE INDEX notifications_source_cursor ON notifications(source_version,id);

CREATE INDEX notifications_target ON notifications(target_kind,target_id);

CREATE INDEX offers_applicant ON offers(applicant_id);

CREATE INDEX offers_listing ON offers(listing_id, status);

CREATE INDEX offers_open ON offers(updated_at) WHERE status IN ('pending','countered');

CREATE INDEX outbound_created ON outbound(created_at);

CREATE INDEX outbound_message ON outbound(message_id) WHERE message_id IS NOT NULL;

CREATE INDEX outbound_queue ON outbound(next_attempt_at, id) WHERE status = 'queued';

CREATE INDEX outbound_recipient ON outbound(recipient) WHERE recipient IS NOT NULL;

CREATE INDEX payments_tenancy ON payments(tenancy_id, received_on, kind, amount);

CREATE INDEX payments_unmatched ON payments(received_on) WHERE tenancy_id IS NULL;

CREATE INDEX rental_events_rental ON rental_events(rental_id, at);

CREATE INDEX rentals_landlord ON rentals(landlord_id);

CREATE INDEX repairs_open ON repairs(urgency, rental_id) WHERE status NOT IN ('done','cancelled');

CREATE INDEX repairs_rental ON repairs(rental_id, created_at);

CREATE INDEX research_facts_property ON research_facts(property_id);

CREATE INDEX research_search_property ON research_search_log(property_id);

CREATE INDEX research_sources_property ON research_sources(property_id);

CREATE INDEX research_terms_property ON research_financial_terms(property_id);

CREATE INDEX sales_applicant ON sales(applicant_id);

CREATE UNIQUE INDEX sales_applicant_open ON sales(applicant_id) WHERE status = 'in_progress';

CREATE UNIQUE INDEX sales_listing_open ON sales(listing_id) WHERE status = 'in_progress';

CREATE UNIQUE INDEX tenancies_active ON tenancies(rental_id) WHERE ended_on IS NULL;

CREATE INDEX tenancies_rental ON tenancies(rental_id, start_on);

CREATE INDEX viewing_listing ON viewing_requests(listing_id, date);

CREATE INDEX viewing_negotiator_day ON viewing_requests(negotiator_id, date);

CREATE INDEX viewing_status ON viewing_requests(status, created_at);

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

CREATE TRIGGER applicants_match_inputs AFTER UPDATE OF requirement_priorities,household_children,household_children_status,move_in_date,lease_term_months,near,requirements,operation,budget_min,budget_max,budget_stretch,property_types,bedrooms_min,bedrooms_max,bedrooms_ideal,bathrooms_min,parking_spaces,outdoor,furnished,pets,parishes_wanted,parishes_excluded,housing_status,buyer_position,archived_at,search_state,search_category,stage ON applicants
WHEN OLD.requirement_priorities IS NOT NEW.requirement_priorities OR OLD.household_children IS NOT NEW.household_children OR OLD.household_children_status IS NOT NEW.household_children_status OR OLD.move_in_date IS NOT NEW.move_in_date OR OLD.lease_term_months IS NOT NEW.lease_term_months OR OLD.near IS NOT NEW.near OR OLD.requirements IS NOT NEW.requirements OR OLD.operation IS NOT NEW.operation OR OLD.budget_min IS NOT NEW.budget_min OR OLD.budget_max IS NOT NEW.budget_max OR OLD.budget_stretch IS NOT NEW.budget_stretch OR OLD.property_types IS NOT NEW.property_types OR OLD.bedrooms_min IS NOT NEW.bedrooms_min OR OLD.bedrooms_max IS NOT NEW.bedrooms_max OR OLD.bedrooms_ideal IS NOT NEW.bedrooms_ideal OR OLD.bathrooms_min IS NOT NEW.bathrooms_min OR OLD.parking_spaces IS NOT NEW.parking_spaces OR OLD.outdoor IS NOT NEW.outdoor OR OLD.furnished IS NOT NEW.furnished OR OLD.pets IS NOT NEW.pets OR OLD.parishes_wanted IS NOT NEW.parishes_wanted OR OLD.parishes_excluded IS NOT NEW.parishes_excluded OR OLD.housing_status IS NOT NEW.housing_status OR OLD.buyer_position IS NOT NEW.buyer_position OR OLD.archived_at IS NOT NEW.archived_at OR OLD.search_state IS NOT NEW.search_state OR OLD.search_category IS NOT NEW.search_category OR OLD.stage IS NOT NEW.stage BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1, match_inputs_revision=match_inputs_revision+1,
 match_ranking_version=0 WHERE id=NEW.id;
END;

CREATE TRIGGER applicants_ranking_page AFTER UPDATE OF match_ranking_version ON applicants
WHEN OLD.match_ranking_version IS NOT NEW.match_ranking_version BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=NEW.id;
END;

CREATE TRIGGER contact_email_erasure BEFORE DELETE ON contacts WHEN OLD.email IS NOT NULL BEGIN
  UPDATE outbound SET recipient = NULL, subject = NULL, text = NULL,
    status = CASE WHEN status = 'sending' THEN 'unknown' WHEN status IN ('draft','queued') THEN 'cancelled' ELSE status END,
    error_code = CASE WHEN status = 'sending' THEN 'CONTACT_ERASED_IN_FLIGHT' ELSE error_code END,
    claim_token = NULL WHERE recipient = OLD.email;
  DELETE FROM email_inbound WHERE sender = OLD.email OR header_from = OLD.email;
END;

CREATE TRIGGER history_viewing_event_insert AFTER INSERT ON events
  WHEN NEW.entity_type='viewing' AND NEW.type IN ('viewing.requested','viewing.booked','viewing.confirmed',
    'viewing.rescheduled','viewing.cancelled','viewing.completed','viewing.no_show')
BEGIN
  INSERT INTO history_viewing_events(event_id,viewing_id,listing_id,at)
    SELECT NEW.id,v.id,v.listing_id,NEW.at FROM viewing_requests v
    JOIN listings l ON l.id=v.listing_id WHERE CAST(v.id AS TEXT)=NEW.entity_id;
END;

CREATE TRIGGER history_viewing_relink AFTER UPDATE OF listing_id ON viewing_requests
  WHEN OLD.listing_id IS NOT NEW.listing_id
BEGIN
  DELETE FROM history_viewing_events WHERE viewing_id=NEW.id;
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

CREATE TRIGGER listings_match_inputs AFTER UPDATE OF operation,availability,archived_at,bedrooms,bathrooms,parish,published,sale_price,rent,rent_period,feat_pets,feat_parking,feat_furnished,feat_outdoor,feat_type,feat_evidence,tenure_type,housing_category,restriction,matchable,use,country,currency ON listings
WHEN OLD.operation IS NOT NEW.operation OR OLD.availability IS NOT NEW.availability OR OLD.archived_at IS NOT NEW.archived_at OR OLD.bedrooms IS NOT NEW.bedrooms OR OLD.bathrooms IS NOT NEW.bathrooms OR OLD.parish IS NOT NEW.parish OR OLD.published IS NOT NEW.published OR OLD.sale_price IS NOT NEW.sale_price OR OLD.rent IS NOT NEW.rent OR OLD.rent_period IS NOT NEW.rent_period OR OLD.feat_pets IS NOT NEW.feat_pets OR OLD.feat_parking IS NOT NEW.feat_parking OR OLD.feat_furnished IS NOT NEW.feat_furnished OR OLD.feat_outdoor IS NOT NEW.feat_outdoor OR OLD.feat_type IS NOT NEW.feat_type OR OLD.feat_evidence IS NOT NEW.feat_evidence OR OLD.tenure_type IS NOT NEW.tenure_type OR OLD.housing_category IS NOT NEW.housing_category OR OLD.restriction IS NOT NEW.restriction OR OLD.matchable IS NOT NEW.matchable OR OLD.use IS NOT NEW.use OR OLD.country IS NOT NEW.country OR OLD.currency IS NOT NEW.currency BEGIN
 INSERT INTO listing_match_inputs(listing_id,version) VALUES(NEW.id,1)
 ON CONFLICT(listing_id) DO UPDATE SET version=version+1;
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id IN (SELECT applicant_id FROM matches WHERE listing_id=NEW.id);
END;

CREATE TRIGGER matches_page_delete AFTER DELETE ON matches BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=OLD.applicant_id;
END;

CREATE TRIGGER matches_page_insert AFTER INSERT ON matches BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=NEW.applicant_id;
END;

CREATE TRIGGER matches_page_update AFTER UPDATE OF status,score,checks,requirements_rank,reject_reason,reviewed_at ON matches
WHEN OLD.status IS NOT NEW.status OR OLD.score IS NOT NEW.score OR OLD.checks IS NOT NEW.checks
 OR OLD.requirements_rank IS NOT NEW.requirements_rank OR OLD.reject_reason IS NOT NEW.reject_reason OR OLD.reviewed_at IS NOT NEW.reviewed_at BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=NEW.applicant_id;
END;

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

CREATE TRIGGER rental_events_count AFTER INSERT ON rental_events BEGIN
  DELETE FROM app_settings WHERE key = 'rentals_count';
END;

CREATE TRIGGER weekly_insights_notice AFTER INSERT ON weekly_insights BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(NEW.generated_at,'system','admin','weekly-insights:'||NEW.week_start,'analytics.weekly_created',
      json_object('version',1,'from',NEW.week_start,'until',NEW.week_until));
  INSERT INTO notifications(event_id,category,title,action_required,created_at,task_key,source_version,target_kind,target_id)
    VALUES(last_insert_rowid(),'message','Weekly Insights · '||NEW.week_start||'–'||date(NEW.week_until,'-1 day'),
      0,NEW.generated_at,'insights:weekly:'||NEW.week_start,last_insert_rowid(),'collection','weekly-insights:'||NEW.week_start);
END;

CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);

CREATE TABLE qa_app_guard(id INTEGER PRIMARY KEY CHECK(id=1),marker TEXT NOT NULL,database_id TEXT NOT NULL,fixture_version INTEGER NOT NULL,seeded_at TEXT NOT NULL,fixture_day TEXT NOT NULL);

INSERT INTO qa_app_guard VALUES(1,'hampton-app-qa-v1','53bc4af9-7250-44fe-8f90-6e415fda1034',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),date('now'));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(1,'0001_init.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(2,'0002_deleted_listings.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(3,'0003_viewing_listing_snapshot.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(4,'0004_featured_rank.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(5,'0005_viewing_notes.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(6,'0006_home_order.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(7,'0007_tours.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(8,'0008_applicants.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(9,'0009_matches.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(10,'0010_viewings.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(11,'0011_daily_stats.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(12,'0012_sales.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(13,'0013_rentals.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(14,'0014_retention.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(15,'0015_jersey_fields.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(16,'0016_interest_corrections.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(17,'0017_to_confirm.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(18,'0018_jobs.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(19,'0019_last_contact.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(20,'0020_drive_imports.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(21,'0021_published_at.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(22,'0022_chats.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(23,'0023_email.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(24,'0024_search_lifecycle.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(25,'0025_registration_categories.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(26,'0026_search_viewing_availability.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(27,'0027_property_viewings.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(28,'0029_listing_events.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(29,'0030_advertisers.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(30,'0031_requirement_priorities.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(31,'0032_notification_tasks.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(32,'0033_notification_events.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(33,'0034_listing_editorial.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(34,'0035_notification_categories.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(35,'0036_weekly_insights.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(36,'0037_match_ranking.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "d1_migrations"("id","name","applied_at") VALUES(37,'0038_history_related.sql',(SELECT seeded_at FROM qa_app_guard WHERE id=1));

INSERT INTO "admins"("email","name","added_by","added_at") VALUES('qa-agent@example.test','QA Agent','system',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "app_settings"("key","value","updated_at","updated_by") VALUES('email','{"enabled":false,"summary":false,"recipients":[],"revision":1,"approved_by":null,"approved_at":null}',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "app_settings"("key","value","updated_at","updated_by") VALUES('outbound','{"paused":true}',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "app_settings"("key","value","updated_at","updated_by") VALUES('automations','{"listing_text":false}',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "negotiators"("id","name","role","active","hours","created_at","updated_at","updated_by") VALUES(1,'QA Negotiator 01','QA fixture',1,'{"mon":["09:00","17:00"],"tue":["09:00","17:00"],"wed":["09:00","17:00"],"thu":["09:00","17:00"],"fri":["09:00","17:00"]}',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "negotiators"("id","name","role","active","hours","created_at","updated_at","updated_by") VALUES(2,'QA Negotiator 02','QA fixture',0,'{"mon":["09:00","17:00"],"tue":["09:00","17:00"],"wed":["09:00","17:00"],"thu":["09:00","17:00"],"fri":["09:00","17:00"]}',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "negotiator_exceptions"("id","negotiator_id","date","kind","note","created_at","created_by") VALUES(1,1,date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+2 days'),'block','QA blocked day',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "listings"("id","use","operation","availability","title","property_type","country","location","road_name","parish","bedrooms","bathrooms","sale_price","rent","rent_period","currency","summary","description","published","matchable","confirmed_at","published_at","specs","feat_type","feat_pets","feat_parking","feat_furnished","feat_outdoor","cover_media_id","created_at","updated_at","updated_by") VALUES('HE-Q001','residential','sale','for_sale','QA Fictional Property 001','house','Jersey','QA location 01','QA test road 01','St Helier',3,2,500000,NULL,NULL,'GBP','Exclusively fictional QA property.','Generated QA fixture; no real property.',1,1,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-120 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'[]','house','yes',1,'no','["garden"]','QAM00001',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "listings"("id","use","operation","availability","title","property_type","country","location","road_name","parish","bedrooms","bathrooms","sale_price","rent","rent_period","currency","summary","description","published","matchable","confirmed_at","published_at","specs","feat_type","feat_pets","feat_parking","feat_furnished","feat_outdoor","cover_media_id","created_at","updated_at","updated_by") VALUES('HE-Q002','residential','rent','to_let','QA Fictional Property 002','house','Jersey','QA location 02','QA test road 02','St Helier',3,2,NULL,2000,'month','GBP','Exclusively fictional QA property.','Generated QA fixture; no real property.',1,1,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'[]','house','yes',1,'no','["garden"]',NULL,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "listings"("id","use","operation","availability","title","property_type","country","location","road_name","parish","bedrooms","bathrooms","sale_price","rent","rent_period","currency","summary","description","published","matchable","confirmed_at","published_at","specs","feat_type","feat_pets","feat_parking","feat_furnished","feat_outdoor","cover_media_id","created_at","updated_at","updated_by") VALUES('HE-Q003','commercial','business','lease','QA Fictional Property 003','shop','Jersey','QA location 03','QA test road 03','St Helier',NULL,2,NULL,2000,'month','GBP','Exclusively fictional QA property.','Generated QA fixture; no real property.',1,1,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'[]',NULL,'yes',1,'no','["garden"]',NULL,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "listings"("id","use","operation","availability","title","property_type","country","location","road_name","parish","bedrooms","bathrooms","sale_price","rent","rent_period","currency","summary","description","published","matchable","confirmed_at","published_at","specs","feat_type","feat_pets","feat_parking","feat_furnished","feat_outdoor","cover_media_id","created_at","updated_at","updated_by") VALUES('HE-Q004','residential','sale','for_sale','QA Fictional Property 004','house','Jersey','QA location 04','QA test road 04','St Helier',3,2,500000,NULL,NULL,'GBP','Exclusively fictional QA property.','Generated QA fixture; no real property.',0,0,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),NULL,'[]','house','yes',1,'no','["garden"]',NULL,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "listings"("id","use","operation","availability","title","property_type","country","location","road_name","parish","bedrooms","bathrooms","sale_price","rent","rent_period","currency","summary","description","published","matchable","confirmed_at","published_at","specs","feat_type","feat_pets","feat_parking","feat_furnished","feat_outdoor","cover_media_id","created_at","updated_at","updated_by","archived_at") VALUES('HE-Q005','residential','sale','withdrawn','QA Fictional Property 005','house','Jersey','QA location 05','QA test road 05','St Helier',3,2,500000,NULL,NULL,'GBP','Exclusively fictional QA property.','Generated QA fixture; no real property.',0,0,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),NULL,'[]','house','yes',1,'no','["garden"]',NULL,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'));

INSERT INTO "listings"("id","use","operation","availability","title","property_type","country","location","road_name","parish","bedrooms","bathrooms","sale_price","rent","rent_period","currency","summary","description","published","matchable","confirmed_at","published_at","specs","feat_type","feat_pets","feat_parking","feat_furnished","feat_outdoor","cover_media_id","created_at","updated_at","updated_by") VALUES('HE-Q006','residential','sale','under_offer','QA Fictional Property 006','house','Jersey','QA location 06','QA test road 06','St Helier',3,2,420000,NULL,NULL,'GBP','Exclusively fictional QA property.','Generated QA fixture; no real property.',1,1,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'[]','house','yes',1,'no','["garden"]',NULL,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "listings"("id","use","operation","availability","title","property_type","country","location","road_name","parish","bedrooms","bathrooms","sale_price","rent","rent_period","currency","summary","description","published","matchable","confirmed_at","published_at","specs","feat_type","feat_pets","feat_parking","feat_furnished","feat_outdoor","cover_media_id","created_at","updated_at","updated_by","review_requested_at","review_requested_by") VALUES('HE-Q007','residential','sale','for_sale','QA Fictional Property 007','house','Jersey','QA location 07','QA test road 07','St Helier',3,2,500000,NULL,NULL,'GBP','Exclusively fictional QA property.','Generated QA fixture; no real property.',0,0,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),NULL,'[]','house','yes',1,'no','["garden"]',NULL,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "deleted_listings"("id","deleted_at","deleted_by") VALUES('HE-Q008',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "media"("id","listing_id","r2_key","thumb_key","origin","kind","label","public","position","content_type","width","height","bytes","rights_status","created_at","created_by") VALUES('QAM00001','HE-Q001','qa/full-app-v1/qa-pattern-01.png','qa/full-app-v1/qa-pattern-01.png','upload','photo','QA generated test pattern 1',1,1,'image/png',600,400,3562,'owned',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "media"("id","listing_id","r2_key","thumb_key","origin","kind","label","public","position","content_type","width","height","bytes","rights_status","created_at","created_by") VALUES('QAM00002','HE-Q001','qa/full-app-v1/qa-pattern-02.png','qa/full-app-v1/qa-pattern-02.png','upload','photo','QA generated test pattern 2',1,2,'image/png',600,400,3562,'owned',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "media"("id","listing_id","r2_key","thumb_key","origin","kind","label","public","position","content_type","width","height","bytes","rights_status","created_at","created_by") VALUES('QAM00003','HE-Q004','qa/full-app-v1/qa-pattern-03.png','qa/full-app-v1/qa-pattern-03.png','upload','floorplan','QA generated test pattern 3',0,3,'image/png',600,400,3562,'owned',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "tours"("id","title","url","caption","published","position","created_at","updated_at") VALUES(1,'QA unpublished tour placeholder','https://tour.example.test/qa-001','Non-network fixture placeholder; external integration remains untested.',0,1,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "contacts"("id","name","email","preferred_channel","privacy_ack_at","consent_source","last_activity_at","last_contact_at","created_at","updated_at","updated_by") VALUES(1,'QA Contact 01','contact-01@example.test','email',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'web',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "applicants"("id","contact_id","operation","stage","source","assigned_to","budget_min","budget_max","property_types","bedrooms_min","parishes_wanted","parishes_excluded","requirements","created_at","updated_at","updated_by") VALUES(1,1,'buy','searching','web','qa-agent@example.test',300000,600000,'["house"]',2,'["St Helier"]','[]','QA fictional requirements',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "contacts"("id","name","email","preferred_channel","privacy_ack_at","consent_source","last_activity_at","last_contact_at","created_at","updated_at","updated_by") VALUES(2,'QA Contact 02','contact-02@example.test','email',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'web',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "applicants"("id","contact_id","operation","stage","source","assigned_to","budget_min","budget_max","property_types","bedrooms_min","parishes_wanted","parishes_excluded","requirements","created_at","updated_at","updated_by") VALUES(2,2,'rent','searching','web','qa-agent@example.test',1000,2500,'["flat"]',2,'["St Helier"]','[]','QA fictional requirements',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "contacts"("id","name","email","preferred_channel","privacy_ack_at","consent_source","last_activity_at","last_contact_at","created_at","updated_at","updated_by") VALUES(3,'QA Contact 03','contact-03@example.test','email',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'web',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "applicants"("id","contact_id","operation","stage","source","assigned_to","budget_min","budget_max","property_types","bedrooms_min","parishes_wanted","parishes_excluded","requirements","created_at","updated_at","updated_by","search_category","search_operation","commercial_kind") VALUES(3,3,'rent','searching','web','qa-agent@example.test',1000,2500,'["house"]',2,'["St Helier"]','[]','QA fictional requirements',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test','commercial','transfer','both');

INSERT INTO "contacts"("id","name","email","preferred_channel","privacy_ack_at","consent_source","last_activity_at","last_contact_at","created_at","updated_at","updated_by") VALUES(4,'QA Contact 04','contact-04@example.test','email',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'web',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "applicants"("id","contact_id","operation","stage","source","assigned_to","budget_min","budget_max","property_types","bedrooms_min","parishes_wanted","parishes_excluded","requirements","created_at","updated_at","updated_by","search_state","resolved_at","resolved_by","resolution_reason") VALUES(4,4,'buy','completed','web','qa-agent@example.test',300000,600000,'["house"]',2,'["St Helier"]','[]','QA fictional requirements',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test','resolved',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),'qa-agent@example.test','QA completed scenario');

INSERT INTO "viewing_requests"("id","listing_id","listing_ref","listing_title_snapshot","agent","kind","date","time","end_time","name","email","status","negotiator_id","outcome","created_at","updated_at","updated_by") VALUES(1,'HE-Q001','HE-Q001','QA property HE-Q001','QA Negotiator 01','In person',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+7 days'),'10:00','10:30','QA Visitor 01','visitor-01@example.test','requested',1,NULL,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "viewing_requests"("id","listing_id","listing_ref","listing_title_snapshot","agent","kind","date","time","end_time","name","email","status","negotiator_id","outcome","created_at","updated_at","updated_by") VALUES(2,'HE-Q002','HE-Q002','QA property HE-Q002','QA Negotiator 01','In person',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+8 days'),'10:00','10:30','QA Visitor 02','visitor-02@example.test','confirmed',1,NULL,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "viewing_requests"("id","listing_id","listing_ref","listing_title_snapshot","agent","kind","date","time","end_time","name","email","status","negotiator_id","outcome","created_at","updated_at","updated_by") VALUES(3,'HE-Q006','HE-Q006','QA property HE-Q006','QA Negotiator 01','In person',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days'),'10:00','10:30','QA Visitor 03','visitor-03@example.test','completed',1,'proceed',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "matches"("id","applicant_id","listing_id","score","checks","status","reviewed_by","reviewed_at","created_at","updated_at") VALUES(1,1,'HE-Q001',85,'[]','shortlisted','qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-3 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "matches"("id","applicant_id","listing_id","score","checks","status","reviewed_by","reviewed_at","created_at","updated_at") VALUES(2,2,'HE-Q002',85,'[]','found',NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-3 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "matches"("id","applicant_id","listing_id","score","checks","status","reviewed_by","reviewed_at","created_at","updated_at") VALUES(3,1,'HE-Q006',85,'[]','shortlisted','qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-3 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "offers"("id","listing_id","applicant_id","amount","status","conditions","created_by","created_at","updated_at","updated_by") VALUES(1,'HE-Q006',1,420000,'accepted','QA fixture only','qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "offers"("id","listing_id","applicant_id","amount","status","conditions","created_by","created_at","updated_at","updated_by") VALUES(2,'HE-Q001',4,500000,'pending','QA fixture only','qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "sales"("id","listing_id","applicant_id","offer_id","price","route","seller_name","seller_email","target_date","fee","notes","created_by","created_at","updated_at","updated_by") VALUES(1,'HE-Q006',1,1,420000,'freehold','QA Seller 01','seller-01@example.test',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+30 days'),10000,'Fictional QA transaction','qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "sale_milestones"("sale_id","key","planned_on","note") VALUES(1,'lawyers',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+14 days'),'QA milestone');

INSERT INTO "sale_milestones"("sale_id","key","planned_on","note") VALUES(1,'due_diligence',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+14 days'),'QA milestone');

INSERT INTO "sale_milestones"("sale_id","key","planned_on","note") VALUES(1,'questionnaire',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+14 days'),'QA milestone');

INSERT INTO "sale_milestones"("sale_id","key","planned_on","note") VALUES(1,'searches',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+14 days'),'QA milestone');

INSERT INTO "sale_milestones"("sale_id","key","planned_on","note") VALUES(1,'mortgage',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+14 days'),'QA milestone');

INSERT INTO "sale_milestones"("sale_id","key","planned_on","note") VALUES(1,'contract',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+14 days'),'QA milestone');

INSERT INTO "sale_milestones"("sale_id","key","planned_on","note") VALUES(1,'funds',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+14 days'),'QA milestone');

INSERT INTO "sale_milestones"("sale_id","key","planned_on","note") VALUES(1,'passing',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+14 days'),'QA milestone');

INSERT INTO "sale_milestones"("sale_id","key","planned_on","note") VALUES(1,'settled',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+14 days'),'QA milestone');

INSERT INTO "landlords"("id","name","email","approval_limit","created_by","created_at","updated_at","updated_by") VALUES(1,'QA Landlord 01','landlord-01@example.test',500,'qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "rentals"("id","landlord_id","address","parish","service","fee_percent","has_gas","created_by","created_at","updated_at","updated_by") VALUES(1,1,'QA fictional rental 01','St Helier','full',10,1,'qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "tenancies"("id","rental_id","payment_ref","tenant_name","tenant_email","kind","regime","start_on","end_on","rent","last_rent_change_on","due_day","deposit","deposit_ref","collect_from","opening_balance","created_by","created_at","updated_at","updated_by") VALUES(1,1,'HE-T0001','QA Tenant 01','tenant-01@example.test','fixed','2025',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-90 days'),date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+270 days'),1600,date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'start of month','+2 months'),1,1500,'QA-DEPOSIT-01',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'start of month','-1 month'),0,'qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "rent_changes"("tenancy_id","effective_on","rent","created_at","created_by") VALUES(1,date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-90 days'),1500,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "rentals"("id","landlord_id","address","parish","service","fee_percent","has_gas","created_by","created_at","updated_at","updated_by") VALUES(2,1,'QA fictional rental 02','St Helier','let_only',NULL,0,'qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "tenancies"("id","rental_id","payment_ref","tenant_name","tenant_email","kind","regime","start_on","end_on","rent","last_rent_change_on","due_day","deposit","deposit_ref","collect_from","opening_balance","created_by","created_at","updated_at","updated_by") VALUES(2,2,'HE-T0002','QA Tenant 02','tenant-02@example.test','periodic','2011',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-90 days'),NULL,1800,NULL,1,1500,'QA-DEPOSIT-02',NULL,0,'qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "rent_changes"("tenancy_id","effective_on","rent","created_at","created_by") VALUES(2,date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-90 days'),1800,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "charges"("id","tenancy_id","due_on","amount","kind") VALUES(1,1,date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'start of month','-1 months'),150000,'rent');

INSERT INTO "charges"("id","tenancy_id","due_on","amount","kind") VALUES(2,1,date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'start of month','+0 months'),150000,'rent');

INSERT INTO "charges"("id","tenancy_id","due_on","amount","kind") VALUES(3,1,date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'start of month','+1 months'),150000,'rent');

INSERT INTO "payments"("id","tenancy_id","received_on","amount","kind","source","description","created_at","created_by") VALUES(1,1,date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-3 days'),150000,'rent','manual','QA payment 1',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-3 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "payments"("id","tenancy_id","received_on","amount","kind","source","description","created_at","created_by") VALUES(2,NULL,date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-3 days'),30000,'rent','manual','QA payment 2',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-3 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "rent_changes"("tenancy_id","effective_on","rent","created_at","created_by") VALUES(1,date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'start of month','+2 months'),1600,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "compliance_items"("rental_id","kind","done_on","expires_on","note","updated_at","updated_by") VALUES(1,'eicr',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-365 days'),date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+90 days'),'QA compliance fixture',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "compliance_items"("rental_id","kind","done_on","expires_on","note","updated_at","updated_by") VALUES(1,'gas',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-365 days'),date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days'),'QA compliance fixture',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "repairs"("id","rental_id","tenancy_id","title","detail","urgency","status","quote","created_by","created_at","updated_at","updated_by") VALUES(1,1,1,'QA fictional repair','Generated QA case','routine','reported',200,'qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "rental_events"("id","rental_id","tenancy_id","at","actor","type","data") VALUES(1,1,1,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),'qa-agent@example.test','payment.recorded','{"payment_id":1}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.created','{"version":1,"revision":1,"source":"panel","fields":[]}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'qa-agent@example.test','listing','HE-Q002','listing.created','{"version":1,"revision":1,"source":"panel","fields":[]}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'qa-agent@example.test','listing','HE-Q003','listing.created','{"version":1,"revision":1,"source":"panel","fields":[]}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'qa-agent@example.test','listing','HE-Q004','listing.created','{"version":1,"revision":1,"source":"panel","fields":[]}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'qa-agent@example.test','listing','HE-Q005','listing.created','{"version":1,"revision":1,"source":"panel","fields":[]}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'qa-agent@example.test','listing','HE-Q006','listing.created','{"version":1,"revision":1,"source":"panel","fields":[]}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),'qa-agent@example.test','listing','HE-Q007','listing.created','{"version":1,"revision":1,"source":"panel","fields":[]}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+60 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":2,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+120 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":3,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+180 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":4,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+240 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":5,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+300 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":6,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+360 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":7,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+420 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":8,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+480 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":9,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+540 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":10,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+600 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":11,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+660 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":12,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+720 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":13,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+780 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":14,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+840 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":15,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+900 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":16,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+960 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":17,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1020 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":18,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1080 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":19,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1140 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":20,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1200 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":21,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1260 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":22,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1320 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":23,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1380 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":24,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1440 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":25,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1500 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":26,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1560 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":27,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1620 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":28,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1680 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":29,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1740 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":30,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1800 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":31,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1860 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":32,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1920 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":33,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+1980 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":34,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2040 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":35,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2100 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":36,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2160 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":37,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2220 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":38,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2280 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":39,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2340 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":40,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2400 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":41,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2460 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":42,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2520 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":43,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2580 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":44,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2640 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":45,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2700 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":46,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2760 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":47,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2820 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":48,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2880 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":49,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+2940 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":50,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+3000 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":51,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+3060 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":52,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+3120 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":53,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+3180 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":54,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+3240 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":55,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+3300 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":56,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+3360 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":57,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+3420 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":58,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+3480 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":59,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+3540 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":60,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":3},"after":{"bedrooms":2},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-2 days','+3600 seconds'),'qa-agent@example.test','listing','HE-Q001','listing.updated','{"version":1,"revision":61,"source":"panel","fields":["bedrooms"],"before":{"bedrooms":2},"after":{"bedrooms":3},"derived_fields":[],"related":{}}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),'qa-agent@example.test','applicant','1','match.reviewed','{"listing_id":"HE-Q001","from":"found","to":"shortlisted"}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),'qa-agent@example.test','viewing','1','viewing.requested','{"listing_id":"HE-Q001"}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),'qa-agent@example.test','applicant','4','offer.recorded','{"listing_id":"HE-Q001","offer_id":2}');

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days','+0 seconds'),'qa-agent@example.test','applicant','1','sale.milestone',json_object('listing_id','HE-Q006','sale_id',1,'key','passing','after',json_object('planned_on',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+14 days'))));

INSERT INTO "events"("at","actor","entity_type","entity_id","type","data") VALUES(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test','admin','qa-checklist','qa.task.created','{"version":1}');

INSERT INTO "notifications"("event_id","category","title","action_required","created_at","task_key","assigned_to","due_at","task_reason","urgency","target_kind","target_id") VALUES((SELECT id FROM events WHERE type='qa.task.created'),'task','QA follow-up task',1,strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'manual:qa-checklist','qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+3 days','+0 seconds'),'QA review fixture','normal','listing','HE-Q004');

INSERT INTO "chats"("id","key_hash","status","listing_id","name","email","privacy_ack_at","created_at","last_at","waiting_since") VALUES(1,'14224e92b4b38f3453f9be12f7fa7a3258086333eb78095e1dde4f8ed6453d10','answered','HE-Q001','QA Chat Visitor 01','chat-01@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),NULL);

INSERT INTO "chat_messages"("id","chat_id","role","text","created_at") VALUES(1,1,'visitor','QA fictional enquiry',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "chats"("id","key_hash","status","listing_id","name","email","privacy_ack_at","created_at","last_at","waiting_since") VALUES(2,'f620874d4c817539199e53f8ce60e3088093a597ae1d475992a2071e661d88c4','waiting','HE-Q001','QA Chat Visitor 02','chat-02@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "chat_messages"("id","chat_id","role","text","created_at") VALUES(2,2,'visitor','QA fictional enquiry',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "chat_messages"("id","chat_id","role","sent_by","text","created_at") VALUES(3,1,'team','qa-agent@example.test','QA fictional reply',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "outbound"("id","ref","dedupe_key","template","entity_id","version","recipient","recipient_hash","subject","text","status","created_at","updated_at") VALUES(1,'QA-OUT-001','qa-draft-001','qa_fixture','1',1,'recipient@example.test','bd74334ccf716cec10e79673e3e3604d1c6c05ff206af3eda19b09fdb1c87ad2','QA unsent draft','Fictional QA draft. Never approved for real sending.','draft',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "email_inbound"("id","dedupe_key","sender","header_from","recipient","subject","text","html_only","truncated","message_id","received_at") VALUES(1,'qa-inbound-001','visitor@example.test','visitor@example.test','team@example.test','QA received fixture','Synthetic inbound message; no real delivery.',0,0,'qa-inbound-001@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "jobs"("id","kind","listing_id","status","result","requested_by","created_at","drafted_at") VALUES(1,'listing_text','HE-Q004','draft','{"summary":"QA fictional draft"}','qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "drive_imports"("id","folder_id","folder_name","status","note","error","requested_by","created_at") VALUES(1,'QA_FOLDER_000001','QA import fixture','failed','Fictional failure case; no Drive credential or network request.','QA provider simulation pending','qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "daily_stats"("day","listing_id","metric","n") VALUES(date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days'),'HE-Q001','view',12);

INSERT INTO "daily_stats"("day","listing_id","metric","n") VALUES(date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days'),'HE-Q001','photos',3);

INSERT INTO "daily_stats"("day","listing_id","metric","n") VALUES(date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-1 days'),'HE-Q001','tour',0);

INSERT INTO "advertisers"("id","name","kind","details","activity_on","created_at","updated_at","updated_by") VALUES(1,'QA Agency 01','agency','{"email":"agency@example.test","website":"https://agency.example.test"}',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'-7 days','+0 seconds'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),'qa-agent@example.test');

INSERT INTO "advertiser_reviews"("id","advertiser_id","action","reason","on_date","actor","created_at") VALUES(1,1,'activity','QA fictitious review',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days'),'qa-agent@example.test',strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'));

INSERT INTO "research_properties"("property_id","hampton_record_id","name","collection","country","location","property_type","bedrooms","hampton_source_url","match_status","research_date") VALUES('QA-RESEARCH-001','HE-Q001','QA Fictional Property 001','QA fixture','Jersey','QA location 01','house',3,'https://source.example.test/qa-001','matched',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days'));

INSERT INTO "research_sources"("source_id","property_id","origin","title","url","accessed_on","summary") VALUES('QA-SOURCE-001','QA-RESEARCH-001','qa_fixture','QA source fixture','https://source.example.test/qa-001',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days'),'Fictional source');

INSERT INTO "research_facts"("fact_id","property_id","source_id","origin","field","value","confidence","context") VALUES('QA-FACT-001','QA-RESEARCH-001','QA-SOURCE-001','qa_fixture','bedrooms','3','high','QA fixture');

INSERT INTO "research_financial_terms"("term_id","property_id","source_id","term_type","amount","currency","notes","source_url") VALUES('QA-TERM-001','QA-RESEARCH-001','QA-SOURCE-001','asking',500000,'GBP','QA synthetic amount','https://source.example.test/qa-001');

INSERT INTO "research_issues"("issue_id","property_ids","field","severity","issue","evidence","source_urls") VALUES('QA-ISSUE-001','["QA-RESEARCH-001"]','fixture','low','QA test issue','QA fixture','["https://source.example.test/qa-001"]');

INSERT INTO "research_search_log"("search_id","property_id","date","query","engine","outcome") VALUES('QA-SEARCH-001','QA-RESEARCH-001',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days'),'QA fixture lookup','qa_stub','No network request');

INSERT INTO "weekly_insights"("week_start","week_until","generated_at","payload") VALUES(date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'weekday 1','-14 days'),date(date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'weekday 1','-14 days'),'+7 days'),strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'+0 days','+0 seconds'),json_object('version',1,'period',json_object('days',7,'from',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'weekday 1','-14 days'),'to',date(date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'weekday 1','-14 days'),'+6 days')),'generated_at',(SELECT seeded_at FROM qa_app_guard WHERE id=1),'totals',json_object('views',12,'viewing_requests',3,'new_applicants',4,'viewings_completed',1),'most_viewed',json('[]'),'coverage',json_object('first_day',date((SELECT seeded_at FROM qa_app_guard WHERE id=1),'-30 days'))));
