-- PROPOSAL ONLY: inspect before migration; requires exact baseline through 0051 and a D1 trial.

PRAGMA defer_foreign_keys=ON;

CREATE TABLE pub10_guard(n INTEGER NOT NULL CHECK(n=0));

INSERT INTO pub10_guard SELECT COUNT(*) FROM pragma_foreign_key_check;

-- D1 disallows correlated pragma_foreign_key_list(table). Verify the exact
-- reviewed table set/definitions instead: any new or changed table fails closed
-- before either parent is touched. D1's internal metadata table is permitted
-- only when its definition is the known D1 internal definition. SQLite reserves
-- the sqlite_ prefix; an unknown or modified table fails closed.
WITH expected(name,sql) AS (VALUES
  ('admins','CREATE TABLE admins (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  added_by TEXT, added_at TEXT NOT NULL
, name TEXT)'),
  ('advertiser_reviews','CREATE TABLE advertiser_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  advertiser_id INTEGER NOT NULL REFERENCES advertisers(id),
  action TEXT NOT NULL CHECK(action IN (''retained'',''activity'')),
  reason TEXT,
  on_date TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
)'),
  ('advertisers','CREATE TABLE advertisers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN (''agency'',''entity'',''individual'')),
  details TEXT NOT NULL CHECK(json_valid(details)),
  activity_on TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
)'),
  ('app_settings','CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value)),
  updated_at TEXT NOT NULL, updated_by TEXT
) WITHOUT ROWID'),
  ('applicants','CREATE TABLE applicants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  operation TEXT NOT NULL CHECK (operation IN (''rent'',''buy'')),
  stage TEXT NOT NULL DEFAULT ''new'' CHECK (stage IN (''new'',''searching'',''viewing'',''offer'',''agreed'',''completed'',''paused'',''lost'')),
  lost_reason TEXT,
  source TEXT NOT NULL CHECK (source IN (''web'',''phone'',''walk_in'',''email'')),
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
  furnished TEXT CHECK (furnished IS NULL OR furnished IN (''yes'',''no'',''either'')),
  pets TEXT,
  parishes_wanted TEXT, parishes_excluded TEXT, near TEXT,
  move_in_date TEXT,
  lease_term_months INTEGER CHECK (lease_term_months IS NULL OR lease_term_months > 0),
  buyer_position TEXT CHECK (buyer_position IS NULL OR buyer_position IN (''first_time'',''nothing_to_sell'',''needs_to_sell'',''cash'')),
  mortgage_aip TEXT CHECK (mortgage_aip IS NULL OR mortgage_aip IN (''yes'',''no'',''in_progress'')),
  housing_status TEXT CHECK (housing_status IS NULL OR housing_status IN
    (''permanent_entitled'',''entitled'',''licensed'',''licensed_lease_only'',''entitled_work_only'',''standard'',''not_sure'')),
  household_adults INTEGER CHECK (household_adults IS NULL OR household_adults >= 0),
  household_children INTEGER CHECK (household_children IS NULL OR household_children >= 0),
  requirements TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT,
  archived_at TEXT
, first_reviewed_at TEXT, search_state TEXT NOT NULL DEFAULT ''active''
  CHECK (search_state IN (''active'', ''resolved'', ''needs_review'')), resolved_at TEXT, resolved_by TEXT, resolution_reason TEXT CHECK (
  (search_state = ''resolved'' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL
    AND length(trim(resolved_by)) > 0 AND resolution_reason IS NOT NULL AND length(trim(resolution_reason)) BETWEEN 1 AND 200)
  OR (search_state <> ''resolved'' AND resolved_at IS NULL AND resolved_by IS NULL AND resolution_reason IS NULL)), search_category TEXT NOT NULL DEFAULT ''residential''
  CHECK (search_category IN (''residential'', ''commercial'')), search_operation TEXT CHECK (search_operation IS NULL OR
  (search_operation = ''transfer'' AND search_category = ''commercial'' AND operation = ''rent'')), commercial_kind TEXT CHECK (commercial_kind IS NULL OR commercial_kind IN (''property'', ''business'', ''both'')), commercial_use TEXT, area_min REAL CHECK (area_min IS NULL OR area_min > 0), area_max REAL CHECK (area_max IS NULL OR area_max > 0), area_unit TEXT CHECK (area_unit IS NULL OR area_unit IN (''sqm'', ''sqft'')), commercial_purchase REAL CHECK (commercial_purchase IS NULL OR commercial_purchase > 0), commercial_rent REAL CHECK (commercial_rent IS NULL OR commercial_rent > 0), commercial_rent_period TEXT CHECK (commercial_rent_period IS NULL OR commercial_rent_period IN (''month'', ''year'')), commercial_premium REAL CHECK (commercial_premium IS NULL OR commercial_premium >= 0), commercial_expenses REAL CHECK (commercial_expenses IS NULL OR commercial_expenses >= 0), household_total INTEGER CHECK (household_total IS NULL OR household_total >= 0), household_children_status TEXT CHECK (household_children_status IS NULL OR household_children_status IN (''known'', ''unknown'', ''not_applicable'')), preferred_language TEXT, bedrooms_max INTEGER CHECK (bedrooms_max IS NULL OR bedrooms_max >= 0), viewing_availability TEXT CHECK (viewing_availability IS NULL OR json_valid(viewing_availability)), requirement_priorities TEXT CHECK (requirement_priorities IS NULL OR
  (json_valid(requirement_priorities) AND json_type(requirement_priorities) = ''object''
   AND COALESCE(json_extract(requirement_priorities, ''$.version'') = 1 AND json_type(requirement_priorities, ''$.values'') = ''object'', 0))), household_children_ages TEXT CHECK (household_children_ages IS NULL OR
  (json_valid(household_children_ages) AND json_type(household_children_ages) = ''array'' AND json_array_length(household_children_ages) <= 20)), household_ages_at TEXT, matches_revision INTEGER NOT NULL DEFAULT 0 CHECK(matches_revision >= 0), match_ranking_version INTEGER NOT NULL DEFAULT 0 CHECK(match_ranking_version IN (0,1)), match_inputs_revision INTEGER NOT NULL DEFAULT 0 CHECK(match_inputs_revision >= 0), area_answer TEXT CHECK(area_answer IS NULL OR area_answer IN (''selected'',''any'',''unknown'')), preferred_parish TEXT CHECK(preferred_parish IS NULL OR preferred_parish IN
  (''Grouville'',''St Brelade'',''St Clement'',''St Helier'',''St John'',''St Lawrence'',''St Martin'',''St Mary'',''St Ouen'',''St Peter'',''St Saviour'',''Trinity'')))'),
  ('arrears_steps','CREATE TABLE arrears_steps (
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  charge_due_on TEXT NOT NULL,
  step TEXT NOT NULL,
  done_at TEXT NOT NULL, done_by TEXT,
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  PRIMARY KEY (tenancy_id, charge_due_on, step)
) WITHOUT ROWID'),
  ('case_capability_batch_assertions','CREATE TABLE case_capability_batch_assertions (
  id TEXT PRIMARY KEY,
  permitted INTEGER NOT NULL CHECK(permitted=1)
) WITHOUT ROWID'),
  ('case_capability_grants','CREATE TABLE case_capability_grants (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 120 AND id NOT GLOB ''*[^A-Za-z0-9._:-]*''),
  case_kind TEXT NOT NULL,
  case_id INTEGER NOT NULL,
  staff_email TEXT NOT NULL,
  capability TEXT NOT NULL CHECK(capability IN (''case_data_read'',''case_data_write'',''sensitive_finance'')),
  purpose TEXT NOT NULL REFERENCES case_purpose_policies(purpose),
  status TEXT NOT NULL CHECK(status IN (''active'',''revoked'')),
  version INTEGER NOT NULL CHECK(version>0),
  membership_version INTEGER NOT NULL CHECK(membership_version>0),
  policy_revision INTEGER NOT NULL CHECK(policy_revision>0),
  approval_ref TEXT NOT NULL CHECK(length(approval_ref) BETWEEN 1 AND 120 AND approval_ref NOT GLOB ''*[^A-Za-z0-9._:-]*''),
  approved_by TEXT NOT NULL CHECK(length(approved_by) BETWEEN 1 AND 160),
  valid_from TEXT NOT NULL CHECK(length(valid_from)=24 AND strftime(''%Y-%m-%dT%H:%M:%fZ'',valid_from) IS valid_from),
  expires_at TEXT CHECK(expires_at IS NULL OR (length(expires_at)=24 AND strftime(''%Y-%m-%dT%H:%M:%fZ'',expires_at) IS expires_at AND expires_at>valid_from)),
  FOREIGN KEY(case_kind,case_id,staff_email) REFERENCES case_capability_memberships(case_kind,case_id,staff_email)
) WITHOUT ROWID'),
  ('case_capability_memberships','CREATE TABLE case_capability_memberships (
  case_kind TEXT NOT NULL CHECK(case_kind IN (''rental'',''tenancy'',''sale'',''rental_application'')),
  case_id INTEGER NOT NULL CHECK(case_id>0),
  staff_email TEXT NOT NULL CHECK(length(staff_email) BETWEEN 3 AND 254 AND staff_email=lower(staff_email)),
  status TEXT NOT NULL CHECK(status IN (''active'',''revoked'')),
  version INTEGER NOT NULL CHECK(version>0),
  approval_ref TEXT NOT NULL CHECK(length(approval_ref) BETWEEN 1 AND 120 AND approval_ref NOT GLOB ''*[^A-Za-z0-9._:-]*''),
  approved_by TEXT NOT NULL CHECK(length(approved_by) BETWEEN 1 AND 160),
  approved_at TEXT NOT NULL CHECK(length(approved_at)=24 AND strftime(''%Y-%m-%dT%H:%M:%fZ'',approved_at) IS approved_at), lifecycle_generation INTEGER NOT NULL DEFAULT 0
  CHECK(lifecycle_generation IN (0,1)),
  PRIMARY KEY(case_kind,case_id,staff_email)
) WITHOUT ROWID'),
  ('case_purpose_policies','CREATE TABLE case_purpose_policies (
  purpose TEXT PRIMARY KEY CHECK(purpose IN (
    ''rental_application'',''tenancy_reference'',''repair_report'',''renewal_response'',
    ''arrears_management'',''landlord_statement'',''sale_review''
  )),
  revision INTEGER NOT NULL CHECK(revision>0),
  status TEXT NOT NULL CHECK(status IN (''draft'',''approved'',''revoked'')),
  retention_ref TEXT CHECK(retention_ref IS NULL OR (length(retention_ref) BETWEEN 1 AND 120 AND retention_ref NOT GLOB ''*[^A-Za-z0-9._:-]*'')),
  privacy_ref TEXT CHECK(privacy_ref IS NULL OR (length(privacy_ref) BETWEEN 1 AND 120 AND privacy_ref NOT GLOB ''*[^A-Za-z0-9._:-]*'')),
  approval_ref TEXT CHECK(approval_ref IS NULL OR (length(approval_ref) BETWEEN 1 AND 120 AND approval_ref NOT GLOB ''*[^A-Za-z0-9._:-]*'')),
  approved_by TEXT CHECK(approved_by IS NULL OR length(approved_by) BETWEEN 1 AND 160),
  valid_from TEXT CHECK(valid_from IS NULL OR (length(valid_from)=24 AND strftime(''%Y-%m-%dT%H:%M:%fZ'',valid_from) IS valid_from)),
  expires_at TEXT CHECK(expires_at IS NULL OR (length(expires_at)=24 AND strftime(''%Y-%m-%dT%H:%M:%fZ'',expires_at) IS expires_at)),
  CHECK(expires_at IS NULL OR (valid_from IS NOT NULL AND expires_at>valid_from)),
  CHECK(status<>''approved'' OR (retention_ref IS NOT NULL AND privacy_ref IS NOT NULL AND approval_ref IS NOT NULL AND approved_by IS NOT NULL AND valid_from IS NOT NULL))
) WITHOUT ROWID'),
  ('charge_adjustments','CREATE TABLE charge_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_id INTEGER NOT NULL REFERENCES charges(id),
  amount_pence INTEGER NOT NULL CHECK(typeof(amount_pence)=''integer'' AND amount_pence > 0 AND amount_pence <= 100000000),
  kind TEXT NOT NULL CHECK(kind IN (''writeoff'',''reversal'')),
  original_adjustment_id INTEGER REFERENCES charge_adjustments(id),
  effective_on TEXT NOT NULL CHECK(length(effective_on)=10 AND date(effective_on,''+0 days'') IS effective_on),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),
  evidence_ref TEXT CHECK(evidence_ref IS NULL OR length(evidence_ref) <= 120),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  CHECK((kind=''writeoff'' AND original_adjustment_id IS NULL) OR
        (kind=''reversal'' AND original_adjustment_id IS NOT NULL))
)'),
  ('charges','CREATE TABLE charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  due_on TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  kind TEXT NOT NULL DEFAULT ''rent'' CHECK (kind IN (''rent'',''opening'')),
  edited INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0,1)),
  UNIQUE (tenancy_id, due_on, kind)
)'),
  ('chat_messages','CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN (''visitor'',''team'')),
  sent_by TEXT, -- the admin''s email for a team message; never sent to the website (C6)
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL
)'),
  ('chats','CREATE TABLE chats (
  -- AUTOINCREMENT: a deleted chat''s id is never given to a new one, so a panel still showing the old chat cannot reply
  -- into another visitor''s conversation (plain rowids reuse the last deleted id).
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT ''waiting'' CHECK (status IN (''waiting'',''answered'',''handled'')),
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
)'),
  ('compliance_items','CREATE TABLE compliance_items (
  rental_id INTEGER NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  done_on TEXT, expires_on TEXT,
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  updated_at TEXT, updated_by TEXT,
  PRIMARY KEY (rental_id, kind)
) WITHOUT ROWID'),
  ('contacts','CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  email TEXT CHECK (email = lower(email) AND email <> '''' AND email NOT GLOB ''*[ ]*''),
  phone TEXT CHECK (phone GLOB ''+[1-9]*'' AND substr(phone, 2) NOT GLOB ''*[^0-9]*''),
  preferred_channel TEXT CHECK (preferred_channel IS NULL OR preferred_channel IN (''whatsapp'',''call'',''email'')),
  best_time TEXT,
  privacy_ack_at TEXT, marketing_opt_in_at TEXT,
  consent_source TEXT CHECK (consent_source IS NULL OR consent_source IN (''web'',''phone'',''walk_in'',''email'')),
  last_activity_at TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT, last_contact_at TEXT,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
)'),
  ('daily_stats','CREATE TABLE daily_stats (
  day TEXT NOT NULL,                        -- YYYY-MM-DD, Jersey
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN (''view'',''photos'',''tour'')),
  n INTEGER NOT NULL DEFAULT 0 CHECK (n >= 0),
  PRIMARY KEY (day, listing_id, metric)
) WITHOUT ROWID'),
  ('deleted_listings','CREATE TABLE deleted_listings (
  id TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL,
  deleted_by TEXT
)'),
  ('drive_imports','CREATE TABLE drive_imports (
  id INTEGER PRIMARY KEY,
  folder_id TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '''' CHECK (length(note) <= 2000),
  status TEXT NOT NULL DEFAULT ''queued''
    CHECK (status IN (''queued'',''working'',''ready'',''review'',''published'',''discarded'',''failed'')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  documents TEXT CHECK (documents IS NULL OR json_valid(documents)), -- what Hermes may download, set when it claims
  result TEXT CHECK (result IS NULL OR json_valid(result)),          -- the proposal and the photos chosen
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL, claimed_at TEXT, ready_at TEXT, decided_at TEXT, decided_by TEXT
)'),
  ('email_attempts','CREATE TABLE email_attempts (
  token TEXT PRIMARY KEY,
  outbound_id INTEGER,
  day TEXT NOT NULL,
  at TEXT NOT NULL
)'),
  ('email_inbound','CREATE TABLE email_inbound (
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
)'),
  ('email_inbound_keys','CREATE TABLE email_inbound_keys (key TEXT PRIMARY KEY, created_at TEXT NOT NULL)'),
  ('email_suppressions','CREATE TABLE email_suppressions (
  address_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (''team'',''provider''))
)'),
  ('events','CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL, actor TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN (''applicant'',''contact'',''viewing'',''admin'',''listing'',''rental'',''payment'',''collection'')),
  entity_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT,
  rental_event_id INTEGER UNIQUE REFERENCES rental_events(id) ON DELETE SET NULL
)'),
  ('history_viewing_events','CREATE TABLE history_viewing_events (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  viewing_id INTEGER NOT NULL REFERENCES viewing_requests(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  at TEXT NOT NULL
)'),
  ('jobs','CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN (''listing_text'')),
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT ''queued'' CHECK (status IN (''queued'',''working'',''draft'',''used'',''discarded'',''failed'')),
  attempts INTEGER NOT NULL DEFAULT 0,
  result TEXT CHECK (result IS NULL OR json_valid(result)),
  requested_by TEXT NOT NULL, -- an admin email or ''hermes''
  created_at TEXT NOT NULL, claimed_at TEXT, drafted_at TEXT, decided_at TEXT, decided_by TEXT
)'),
  ('landlords','CREATE TABLE landlords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  email TEXT CHECK (email IS NULL OR length(email) <= 120),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 120),
  approval_limit INTEGER CHECK (approval_limit IS NULL OR (approval_limit > 0 AND approval_limit <= 1000000)),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  archived_at TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT
)'),
  ('listing_content','CREATE TABLE listing_content (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  tags TEXT NOT NULL DEFAULT ''[]'' CHECK(json_valid(tags) AND json_type(tags)=''array'' AND json_array_length(tags)<=3),
  video_url TEXT CHECK(video_url IS NULL OR length(video_url)<=500)
)'),
  ('listing_details','CREATE TABLE listing_details (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  building_name_or_number TEXT CHECK(building_name_or_number IS NULL OR length(building_name_or_number) <= 200),
  postcode TEXT CHECK(postcode IS NULL OR length(postcode) <= 32),
  developer_name TEXT CHECK(developer_name IS NULL OR length(developer_name) <= 200),
  public_address_snapshot TEXT CHECK(public_address_snapshot IS NULL OR length(public_address_snapshot) <= 1000),
  public_address_snapshot_hash TEXT CHECK(public_address_snapshot_hash IS NULL OR
    (length(public_address_snapshot_hash)=64 AND public_address_snapshot_hash NOT GLOB ''*[^0-9a-f]*'')),
  public_address_evidence_ref TEXT CHECK(public_address_evidence_ref IS NULL OR length(public_address_evidence_ref) <= 128),
  public_address_reviewed_by TEXT,
  public_address_reviewed_at TEXT,
  CHECK((public_address_snapshot IS NULL AND public_address_snapshot_hash IS NULL AND public_address_evidence_ref IS NULL
      AND public_address_reviewed_by IS NULL AND public_address_reviewed_at IS NULL)
    OR (public_address_snapshot IS NOT NULL AND public_address_snapshot_hash IS NOT NULL AND public_address_evidence_ref IS NOT NULL
      AND public_address_reviewed_by IS NOT NULL AND public_address_reviewed_at IS NOT NULL))
)'),
  ('listing_event_context','CREATE TABLE listing_event_context (
  listing_id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN (''panel'',''queue'',''sales'',''media'',''recalculate'')),
  action TEXT NOT NULL CHECK(action IN (''review_requested'',''review_returned'',''created'',''updated'',''published'',''unpublished'',''archived'',''restored'',''confirmed'',''availability_changed'',''featured_changed'',''cover_changed'',''recalculated'',''deleted'')),
  at TEXT NOT NULL,
  derived_fields TEXT NOT NULL,
  related TEXT NOT NULL,
  previous_revision INTEGER NOT NULL
, extra_fields TEXT NOT NULL DEFAULT ''[]''
  CHECK(json_valid(extra_fields) AND json_type(extra_fields)=''array'')) WITHOUT ROWID'),
  ('listing_event_operations','CREATE TABLE listing_event_operations (
  actor TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  event_id INTEGER REFERENCES events(id),
  PRIMARY KEY(actor,operation_id)
) WITHOUT ROWID'),
  ('listing_marketing_evidence','CREATE TABLE listing_marketing_evidence (
 -- These are immutable historical identities, like events.entity_id, not live deletion barriers.
 listing_id TEXT NOT NULL,
 event_id INTEGER NOT NULL REFERENCES events(id),
 evidence_ref TEXT NOT NULL,
 media_id TEXT,
 source_id TEXT,
 action TEXT NOT NULL CHECK(action IN (''let_agreed'',''let'',''return_to_market'')),
 reason_code TEXT NOT NULL CHECK(reason_code IN (''agreement'',''completed'',''fell_through'',''correction'')),
 occurred_at TEXT NOT NULL,
 evidence_snapshot TEXT NOT NULL CHECK(json_valid(evidence_snapshot)),
 CHECK ((media_id IS NULL) <> (source_id IS NULL)),
 PRIMARY KEY(event_id,evidence_ref)
) WITHOUT ROWID'),
  ('listing_match_inputs','CREATE TABLE listing_match_inputs(listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
 version INTEGER NOT NULL CHECK(version>=0))'),
  ('listing_withdrawal_guard','CREATE TABLE listing_withdrawal_guard (id TEXT PRIMARY KEY, allowed INTEGER NOT NULL CHECK(allowed=1)) WITHOUT ROWID'),
  ('listing_withdrawal_receipts','CREATE TABLE listing_withdrawal_receipts (
  actor TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  action TEXT NOT NULL CHECK(action IN (''withdraw'',''correct'')),
  withdrawal_id TEXT NOT NULL REFERENCES listing_withdrawals(id),
  revision INTEGER NOT NULL CHECK(revision>0),
  event_id INTEGER NOT NULL REFERENCES events(id),
  PRIMARY KEY(actor,operation_id)
) WITHOUT ROWID'),
  ('listing_withdrawal_revisions','CREATE TABLE listing_withdrawal_revisions (
  id TEXT PRIMARY KEY,
  withdrawal_id TEXT NOT NULL REFERENCES listing_withdrawals(id),
  revision INTEGER NOT NULL CHECK(revision>1),
  previous_revision INTEGER NOT NULL CHECK(previous_revision=revision-1),
  reason_code TEXT NOT NULL CHECK(reason_code IN (''owner_request'',''let_elsewhere'',''sold_elsewhere'',''data_correction'',''other'')),
  private_note TEXT CHECK(private_note IS NULL OR length(private_note)<=1000),
  actor TEXT NOT NULL,
  at TEXT NOT NULL,
  UNIQUE(withdrawal_id,revision),
  CHECK(reason_code<>''other'' OR length(trim(COALESCE(private_note,'''')))>0)
) WITHOUT ROWID'),
  ('listing_withdrawals','CREATE TABLE listing_withdrawals (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  source_revision INTEGER NOT NULL CHECK(source_revision>0),
  event_id INTEGER NOT NULL REFERENCES events(id),
  reason_code TEXT CHECK(reason_code IS NULL OR reason_code IN (''owner_request'',''let_elsewhere'',''sold_elsewhere'',''data_correction'',''other'')),
  private_note TEXT CHECK(private_note IS NULL OR length(private_note)<=1000),
  actor TEXT NOT NULL,
  current_revision INTEGER NOT NULL DEFAULT 1 CHECK(current_revision>0),
  CHECK(reason_code<>''other'' OR length(trim(COALESCE(private_note,'''')))>0)
) WITHOUT ROWID'),
  ('listings','CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  use TEXT NOT NULL CHECK (use IN (''residential'',''commercial'')),
  title TEXT NOT NULL,
  property_type TEXT,
  operation TEXT NOT NULL CHECK (operation IN (''sale'',''rent'',''business'')),
  availability TEXT NOT NULL CHECK (availability IN (''for_sale'',''under_offer'',''sold'',''to_let'',''lease'',''not_stated'',''withdrawn'',''let_agreed'',''let'')),
  country TEXT, location TEXT, road_name TEXT,
  bedrooms INTEGER CHECK (bedrooms IS NULL OR bedrooms >= 0),
  bathrooms INTEGER CHECK (bathrooms IS NULL OR bathrooms >= 0),
  tenure TEXT,
  sale_price REAL CHECK (sale_price IS NULL OR sale_price > 0),
  rent REAL CHECK (rent IS NULL OR rent > 0),
  rent_period TEXT CHECK (rent_period IS NULL OR rent_period IN (''month'',''year'')),
  premium REAL CHECK (premium IS NULL OR premium > 0),
  currency TEXT CHECK (currency IS NULL OR currency IN (''GBP'',''EUR'')),
  price_text TEXT, summary TEXT, description TEXT, tour_url TEXT,
  specs TEXT NOT NULL DEFAULT ''[]'',
  cover_media_id TEXT,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  archived_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT
, featured_rank INTEGER CHECK (featured_rank IS NULL OR featured_rank BETWEEN 1 AND 99), home_order INTEGER CHECK (home_order IS NULL OR home_order >= 1), parish TEXT CHECK (parish IS NULL OR parish IN (''Grouville'',''St Brelade'',''St Clement'',
  ''St Helier'',''St John'',''St Lawrence'',''St Martin'',''St Mary'',''St Ouen'',''St Peter'',''St Saviour'',''Trinity'')), matchable INTEGER NOT NULL DEFAULT 0 CHECK (matchable IN (0,1)), feat_pets TEXT CHECK (feat_pets IS NULL OR feat_pets IN (''yes'',''no'')), feat_parking INTEGER CHECK (feat_parking IS NULL OR feat_parking >= 0), feat_furnished TEXT CHECK (feat_furnished IS NULL OR feat_furnished IN (''yes'',''no'')), feat_outdoor TEXT, feat_type TEXT CHECK (feat_type IS NULL OR feat_type IN (''flat'',''house'',''cottage'',''studio'')), feat_evidence TEXT, features_at TEXT, tenure_type TEXT
  CHECK (tenure_type IS NULL OR tenure_type IN (''freehold'',''flying_freehold'',''share_transfer'',''leasehold'')), housing_category TEXT
  CHECK (housing_category IS NULL OR housing_category IN (''qualified'',''registered'')), restriction TEXT
  CHECK (restriction IS NULL OR restriction IN (''first_time_buyer'',''over_55'')), confirmed_at TEXT, drive_folder_id TEXT, published_at TEXT, viewings_enabled INTEGER NOT NULL DEFAULT 1 CHECK (viewings_enabled IN (0, 1)), viewing_hours TEXT DEFAULT NULL CHECK (
  viewing_hours IS NULL OR (json_valid(viewing_hours) AND json_type(viewing_hours) = ''array''
    AND json_array_length(viewing_hours) BETWEEN 1 AND 21)
), review_requested_at TEXT, review_requested_by TEXT, property_condition TEXT CHECK(property_condition IS NULL OR property_condition IN
  (''new_build'',''existing'',''good'',''needs_modernisation'',''needs_renovation'')), interior_area_sqft REAL CHECK(interior_area_sqft IS NULL OR (interior_area_sqft > 0 AND interior_area_sqft < 100000000)), separate_wcs INTEGER CHECK(separate_wcs IS NULL OR separate_wcs BETWEEN 0 AND 100), reception_rooms INTEGER CHECK(reception_rooms IS NULL OR reception_rooms BETWEEN 0 AND 100), has_garage INTEGER CHECK(has_garage IS NULL OR has_garage IN (0,1)), has_storage INTEGER CHECK(has_storage IS NULL OR has_storage IN (0,1)), has_lift INTEGER CHECK(has_lift IS NULL OR has_lift IN (0,1)), double_glazing INTEGER CHECK(double_glazing IS NULL OR double_glazing IN (0,1)), floor_level INTEGER CHECK(floor_level IS NULL OR floor_level BETWEEN -20 AND 200), building_floors INTEGER CHECK(building_floors IS NULL OR building_floors BETWEEN 1 AND 200), year_built INTEGER CHECK(year_built IS NULL OR year_built BETWEEN 1 AND 9999), heating_types TEXT CHECK(heating_types IS NULL OR (json_valid(heating_types) AND json_type(heating_types)=''array'')), amenities TEXT CHECK(amenities IS NULL OR (json_valid(amenities) AND json_type(amenities)=''array'')), feature_overrides TEXT NOT NULL DEFAULT ''{}'' CHECK(json_valid(feature_overrides) AND json_type(feature_overrides)=''object''), price_per_sqft TEXT, rental_deposit TEXT, parish_rates TEXT, service_charge TEXT, utilities_included TEXT, available_on TEXT, CHECK ((review_requested_at IS NULL) = (review_requested_by IS NULL)), CHECK (review_requested_at IS NULL OR (published=0 AND archived_at IS NULL)))'),
  ('market_change_outbox','CREATE TABLE market_change_outbox (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL REFERENCES market_observations(id),
  observation_version INTEGER NOT NULL CHECK(observation_version>0),
  kind TEXT NOT NULL CHECK(kind=''observation_changed''),
  consumer_state TEXT NOT NULL DEFAULT ''pending'' CHECK(consumer_state IN (''pending'',''consumed'')),
  UNIQUE(observation_id,observation_version,kind)
) WITHOUT ROWID'),
  ('market_commit_guard','CREATE TABLE market_commit_guard (
  id TEXT PRIMARY KEY,
  allowed INTEGER NOT NULL CHECK(allowed=1)
) WITHOUT ROWID'),
  ('market_directory_manifests','CREATE TABLE market_directory_manifests (
  revision TEXT PRIMARY KEY CHECK(length(revision) BETWEEN 1 AND 160),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB ''*[^0-9a-f]*''),
  accepted_at TEXT NOT NULL,
  reviewer_ref TEXT NOT NULL CHECK(length(reviewer_ref) BETWEEN 1 AND 160),
  status TEXT NOT NULL CHECK(status IN (''accepted'',''revoked''))
) WITHOUT ROWID'),
  ('market_identity_aliases','CREATE TABLE market_identity_aliases (
  source_property_id TEXT PRIMARY KEY REFERENCES market_properties(id),
  target_property_id TEXT NOT NULL REFERENCES market_properties(id),
  decision_id TEXT NOT NULL UNIQUE REFERENCES market_identity_decisions(id),
  CHECK(source_property_id<>target_property_id)
) WITHOUT ROWID'),
  ('market_identity_decisions','CREATE TABLE market_identity_decisions (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK(action IN (''same_property'',''undo'')),
  source_property_id TEXT NOT NULL REFERENCES market_properties(id),
  target_property_id TEXT NOT NULL REFERENCES market_properties(id),
  source_evidence_observation_id TEXT NOT NULL REFERENCES market_observations(id),
  target_evidence_observation_id TEXT NOT NULL REFERENCES market_observations(id),
  expected_source_version INTEGER NOT NULL CHECK(expected_source_version>0),
  expected_target_version INTEGER NOT NULL CHECK(expected_target_version>0),
  undo_of TEXT REFERENCES market_identity_decisions(id),
  actor TEXT NOT NULL,
  actor_added_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(source_property_id<>target_property_id),
  CHECK((action=''same_property'' AND undo_of IS NULL) OR (action=''undo'' AND undo_of IS NOT NULL))
) WITHOUT ROWID'),
  ('market_identity_observations','CREATE TABLE market_identity_observations (
  observation_id TEXT PRIMARY KEY REFERENCES market_observations(id),
  property_id TEXT NOT NULL UNIQUE REFERENCES market_properties(id),
  publication_id TEXT NOT NULL REFERENCES market_listings(id),
  linked_at TEXT NOT NULL,
  UNIQUE(observation_id,property_id,publication_id)
) WITHOUT ROWID'),
  ('market_identity_receipts','CREATE TABLE market_identity_receipts (
  operation_id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_added_at TEXT NOT NULL,
  property_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(observation_id,property_id,publication_id)
    REFERENCES market_identity_observations(observation_id,property_id,publication_id)
) WITHOUT ROWID'),
  ('market_listings','CREATE TABLE market_listings (
  id TEXT PRIMARY KEY,
  anchor_observation_id TEXT NOT NULL REFERENCES market_observations(id),
  operation TEXT NOT NULL CHECK(operation IN (''sale'',''rent'',''business'')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE(anchor_observation_id,operation)
) WITHOUT ROWID'),
  ('market_observations','CREATE TABLE market_observations (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  page_id TEXT NOT NULL REFERENCES market_pages(id),
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  external_key TEXT NOT NULL,
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json) AND json_type(raw_json)=''object''),
  normalized_json TEXT NOT NULL CHECK(json_valid(normalized_json) AND json_type(normalized_json)=''object''),
  normalized_sha256 TEXT NOT NULL CHECK(length(normalized_sha256)=64),
  source_at TEXT NOT NULL,
  origin_sha256 TEXT NOT NULL CHECK(length(origin_sha256)=64),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  deleted_tombstone INTEGER NOT NULL DEFAULT 0 CHECK(deleted_tombstone IN (0,1)),
  UNIQUE(page_id,external_key),
  FOREIGN KEY(source_ref,channel_id) REFERENCES market_sources(source_ref,channel_id)
)'),
  ('market_pages','CREATE TABLE market_pages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  page_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
  previous_cursor TEXT,
  next_cursor TEXT,
  exhausted INTEGER NOT NULL CHECK(exhausted IN (0,1)),
  observed_at TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  committed_by TEXT NOT NULL,
  lease_token TEXT NOT NULL,
  lease_generation INTEGER NOT NULL,
  policy_version INTEGER NOT NULL,
  UNIQUE(run_id,source_ref,channel_id,page_key),
  FOREIGN KEY(run_id,source_ref,channel_id) REFERENCES market_source_runs(run_id,source_ref,channel_id)
) WITHOUT ROWID'),
  ('market_properties','CREATE TABLE market_properties (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  status TEXT NOT NULL DEFAULT ''provisional'' CHECK(status=''provisional''),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
) WITHOUT ROWID'),
  ('market_run_actions','CREATE TABLE market_run_actions (
  operation_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES market_runs(id),
  action TEXT NOT NULL CHECK(action IN (''pause'',''resume'')),
  expected_version INTEGER NOT NULL CHECK(expected_version>0),
  result_version INTEGER NOT NULL CHECK(result_version=expected_version+1),
  result_status TEXT NOT NULL CHECK(result_status IN (''open'',''paused'')),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID'),
  ('market_runs','CREATE TABLE market_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (''own_pilot'',''initial'',''daily'')),
  jersey_day TEXT,
  manifest_revision TEXT REFERENCES market_directory_manifests(revision),
  manifest_sha256 TEXT,
  status TEXT NOT NULL DEFAULT ''open'' CHECK(status IN (''open'',''paused'',''completed'',''partial'',''cancelled'')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  operation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  CHECK((kind=''own_pilot'' AND manifest_revision IS NULL AND manifest_sha256 IS NULL) OR
        (kind IN (''initial'',''daily'') AND manifest_revision IS NOT NULL AND manifest_sha256 IS NOT NULL)),
  CHECK((kind=''daily'' AND jersey_day IS NOT NULL AND length(jersey_day)=10 AND date(jersey_day,''+0 days'') IS jersey_day)
        OR (kind<>''daily'' AND jersey_day IS NULL))
) WITHOUT ROWID'),
  ('market_source_activity','CREATE TABLE market_source_activity (
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  lease_token TEXT,
  lease_until TEXT,
  last_acquired_at TEXT,
  PRIMARY KEY(source_ref,channel_id),
  FOREIGN KEY(source_ref,channel_id) REFERENCES market_sources(source_ref,channel_id),
  CHECK((lease_token IS NULL AND lease_until IS NULL) OR (lease_token IS NOT NULL AND lease_until IS NOT NULL))
) WITHOUT ROWID'),
  ('market_source_policy_history','CREATE TABLE market_source_policy_history (
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  decision_version INTEGER NOT NULL CHECK(decision_version>1),
  operation_id TEXT NOT NULL UNIQUE,
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256)=64),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json) AND json_type(snapshot_json)=''object''),
  actor TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  PRIMARY KEY(source_ref,channel_id,decision_version),
  FOREIGN KEY(source_ref,channel_id) REFERENCES market_sources(source_ref,channel_id)
) WITHOUT ROWID'),
  ('market_source_runs','CREATE TABLE market_source_runs (
  run_id TEXT NOT NULL REFERENCES market_runs(id),
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  paging_key TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))) UNIQUE,
  status TEXT NOT NULL DEFAULT ''pending'' CHECK(status IN (''pending'',''running'',''manual_pending'',''blocked'',''complete'',''failed'')),
  cursor TEXT,
  page_no INTEGER NOT NULL DEFAULT 0 CHECK(page_no>=0),
  lease_token TEXT,
  lease_generation INTEGER NOT NULL DEFAULT 0 CHECK(lease_generation>=0),
  lease_until TEXT,
  next_due TEXT,
  last_capture_at TEXT,
  last_full_pass_at TEXT,
  policy_version INTEGER,
  run_version INTEGER,
  PRIMARY KEY(run_id, source_ref, channel_id),
  FOREIGN KEY(source_ref,channel_id) REFERENCES market_sources(source_ref,channel_id)
) WITHOUT ROWID'),
  ('market_sources','CREATE TABLE market_sources (
  source_ref TEXT NOT NULL CHECK(length(source_ref) BETWEEN 1 AND 160),
  channel_id TEXT NOT NULL CHECK(length(channel_id) BETWEEN 1 AND 160),
  directory_revision TEXT REFERENCES market_directory_manifests(revision),
  source_kind TEXT NOT NULL CHECK(source_kind IN (''internal'',''external'')),
  source_class TEXT NOT NULL DEFAULT ''unclassified'' CHECK(source_class IN (''internal'',''general'',''unclassified'',''homely'',''jfsc'',''places'',''properties'')),
  access_status TEXT NOT NULL DEFAULT ''pending'' CHECK(access_status IN (''pending'',''allowed'',''manual_only'',''denied'',''paused'')),
  method TEXT CHECK(method IN (''internal'',''manual'',''http'')),
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK(policy_version > 0),
  evidence_ref TEXT,
  reviewed_at TEXT,
  review_due_at TEXT,
  allowed_hosts TEXT NOT NULL DEFAULT ''[]'' CHECK(json_valid(allowed_hosts) AND json_type(allowed_hosts)=''array''),
  allowed_paths TEXT NOT NULL DEFAULT ''[]'' CHECK(json_valid(allowed_paths) AND json_type(allowed_paths)=''array''),
  allowed_redirect_hosts TEXT NOT NULL DEFAULT ''[]'' CHECK(json_valid(allowed_redirect_hosts) AND json_type(allowed_redirect_hosts)=''array''),
  retention_ref TEXT,
  coverage_evidence_ref TEXT,
  next_action TEXT,
  min_interval_s INTEGER NOT NULL DEFAULT 60 CHECK(min_interval_s >= 60),
  PRIMARY KEY(source_ref, channel_id),
  CHECK(source_kind=''internal'' OR directory_revision IS NOT NULL),
  CHECK((source_kind=''internal'' AND source_class=''internal'') OR (source_kind=''external'' AND source_class<>''internal'')),
  CHECK(access_status NOT IN (''allowed'',''manual_only'') OR source_class IN (''general'',''internal'')),
  CHECK(access_status NOT IN (''allowed'',''manual_only'') OR
    (method IS NOT NULL AND evidence_ref IS NOT NULL AND length(evidence_ref)>0 AND
     retention_ref IS NOT NULL AND length(retention_ref)>0 AND reviewed_at IS NOT NULL AND review_due_at IS NOT NULL)),
  CHECK(access_status <> ''manual_only'' OR method=''manual''),
  CHECK(source_kind <> ''external'' OR method IS NOT ''internal''),
  CHECK(source_kind <> ''internal'' OR method IS NULL OR method=''internal'')
) WITHOUT ROWID'),
  ('matches','CREATE TABLE matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  checks TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (''found'',''shortlisted'',''rejected'')),
  reject_reason TEXT CHECK (reject_reason IS NULL OR (status = ''rejected''
    AND reject_reason IN (''price'',''area'',''size'',''condition'',''other''))),
  reviewed_by TEXT, reviewed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, requirements_rank INTEGER NOT NULL DEFAULT 1 CHECK (requirements_rank BETWEEN 0 AND 3), area_preference_rank INTEGER NOT NULL DEFAULT 1 CHECK(area_preference_rank IN (0,1)),
  UNIQUE (applicant_id, listing_id)
)'),
  ('media','CREATE TABLE media (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  r2_key TEXT, thumb_key TEXT,
  origin TEXT NOT NULL CHECK (origin IN (''hampton'',''external'',''upload'')),
  kind TEXT NOT NULL CHECK (kind IN (''photo'',''floorplan'',''aerial'',''document'')),
  label TEXT,
  public INTEGER NOT NULL DEFAULT 0 CHECK (public IN (0,1)),
  position INTEGER NOT NULL DEFAULT 0,
  content_type TEXT, width INTEGER, height INTEGER, bytes INTEGER,
  source_url TEXT, provider TEXT, rights_status TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  CHECK (origin <> ''external'' OR public = 0)
)'),
  ('negotiator_exceptions','CREATE TABLE negotiator_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negotiator_id INTEGER NOT NULL REFERENCES negotiators(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (''block'',''open'')),
  start_time TEXT, end_time TEXT,
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  created_at TEXT NOT NULL, created_by TEXT,
  CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CHECK (start_time IS NULL OR start_time < end_time),
  CHECK (kind = ''block'' OR start_time IS NOT NULL)
)'),
  ('negotiators','CREATE TABLE negotiators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  role TEXT CHECK (role IS NULL OR length(role) <= 80),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  hours TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT
)'),
  ('notification_cursor','CREATE TABLE notification_cursor (
  key TEXT PRIMARY KEY CONSTRAINT notification_cursor_cas CHECK(key=''queues''), revision INTEGER NOT NULL,
  after_key TEXT NOT NULL, observed_at TEXT NOT NULL
) WITHOUT ROWID'),
  ('notification_observations','CREATE TABLE notification_observations (
  task_key TEXT PRIMARY KEY REFERENCES notifications(task_key) ON DELETE CASCADE,
  kind TEXT NOT NULL, entity_id TEXT NOT NULL, cycle TEXT NOT NULL,
  signature TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
  target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
  event_id INTEGER NOT NULL REFERENCES events(id)
) WITHOUT ROWID'),
  ('notification_preferences','CREATE TABLE notification_preferences (
  admin TEXT PRIMARY KEY REFERENCES admins(email) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  feed_categories TEXT NOT NULL CHECK(json_valid(feed_categories) AND json_type(feed_categories)=''array'')
)'),
  ('notification_reads','CREATE TABLE notification_reads (
  admin TEXT NOT NULL REFERENCES admins(email) ON DELETE CASCADE,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  read_revision INTEGER NOT NULL CHECK(read_revision >= 1),
  PRIMARY KEY(admin,notification_id)
)'),
  ('notification_task_history','CREATE TABLE notification_task_history (
  task_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  PRIMARY KEY(task_id,revision)
)'),
  ('notification_task_operations','CREATE TABLE notification_task_operations (
  actor TEXT NOT NULL, operation_id TEXT NOT NULL,
  task_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  payload_hash TEXT NOT NULL, result_revision INTEGER NOT NULL,
  PRIMARY KEY(actor,operation_id)
)'),
  ('notifications','CREATE TABLE "notifications" (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL CHECK(category IN (''new_applicant'',''viewing'',''matched'',''task'',''agency_reply'',''message'',''compliance'')),
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
  urgency TEXT NOT NULL DEFAULT ''normal'' CHECK(urgency IN (''normal'',''urgent'')),
  closed_by_source INTEGER NOT NULL DEFAULT 0 CHECK(closed_by_source IN (0,1)),
  task_actor TEXT, task_action TEXT
, target_kind TEXT CHECK(target_kind IS NULL OR target_kind IN (''applicant'',''contact'',''viewing'',''listing'',''offer'',''sale'',''rental'',''payment'',''collection'')), target_id TEXT, target_context TEXT CHECK(target_context IS NULL OR (json_valid(target_context) AND json_type(target_context)=''object'')), target_deleted INTEGER NOT NULL DEFAULT 0 CHECK(target_deleted IN (0,1)))'),
  ('offers','CREATE TABLE offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  conditions TEXT CHECK (conditions IS NULL OR length(conditions) <= 1000),
  status TEXT NOT NULL DEFAULT ''pending'' CHECK (status IN (''pending'',''countered'',''accepted'',''rejected'',''withdrawn'')),
  counter_amount INTEGER CHECK (counter_amount IS NULL OR (counter_amount > 0 AND counter_amount <= 100000000)),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT,
  CHECK (status <> ''pending'' OR counter_amount IS NULL),
  CHECK (status <> ''countered'' OR counter_amount IS NOT NULL)
)'),
  ('outbound','CREATE TABLE outbound (
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
  status TEXT NOT NULL CHECK (status IN (''draft'',''queued'',''sending'',''accepted'',''failed'',''unknown'',''cancelled'')),
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
  CHECK (status NOT IN (''queued'',''sending'',''accepted'') OR approved_at IS NOT NULL)
)'),
  ('payments','CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER REFERENCES tenancies(id),
  received_on TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  description TEXT CHECK (description IS NULL OR length(description) <= 300),
  kind TEXT NOT NULL DEFAULT ''rent'' CHECK (kind IN (''rent'',''deposit'',''other'')),
  source TEXT NOT NULL CHECK (source IN (''manual'',''import'')),
  import_hash TEXT UNIQUE,
  created_at TEXT NOT NULL, created_by TEXT
)'),
  ('property_viewing_rule_ids','CREATE TABLE property_viewing_rule_ids (
  id TEXT NOT NULL PRIMARY KEY
) WITHOUT ROWID'),
  ('property_viewing_rule_negotiators','CREATE TABLE property_viewing_rule_negotiators (
  rule_id TEXT NOT NULL REFERENCES property_viewing_rules(id) ON DELETE CASCADE,
  negotiator_id INTEGER NOT NULL REFERENCES negotiators(id) ON DELETE CASCADE,
  PRIMARY KEY(rule_id,negotiator_id)
) WITHOUT ROWID'),
  ('property_viewing_rules','CREATE TABLE property_viewing_rules (
  id TEXT NOT NULL PRIMARY KEY CHECK(length(id)=36 AND id NOT GLOB ''*[^0-9a-f-]*''
    AND substr(id,9,1)=''-'' AND substr(id,14,1)=''-'' AND substr(id,19,1)=''-'' AND substr(id,24,1)=''-''),
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK(operation IN (''sale'',''rent'',''business'')),
  revision INTEGER NOT NULL CHECK(typeof(revision)=''integer'' AND revision BETWEEN 1 AND 9007199254740991),
  state TEXT NOT NULL CHECK(state IN (''active'',''revoked'')),
  notice_hours INTEGER NOT NULL CHECK(typeof(notice_hours)=''integer'' AND notice_hours BETWEEN 0 AND 168),
  UNIQUE(listing_id,operation)
)'),
  ('rent_changes','CREATE TABLE rent_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  effective_on TEXT NOT NULL,
  rent INTEGER NOT NULL CHECK (rent > 0 AND rent <= 1000000),
  created_at TEXT NOT NULL, created_by TEXT,
  UNIQUE (tenancy_id, effective_on)
)'),
  ('rental_events','CREATE TABLE rental_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rental_id INTEGER REFERENCES rentals(id) ON DELETE CASCADE,
  tenancy_id INTEGER REFERENCES tenancies(id),
  at TEXT NOT NULL,
  actor TEXT,
  type TEXT NOT NULL,
  data TEXT CHECK (data IS NULL OR json_valid(data))
)'),
  ('rentals','CREATE TABLE rentals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  landlord_id INTEGER NOT NULL REFERENCES landlords(id),
  address TEXT NOT NULL CHECK (length(address) BETWEEN 1 AND 200),
  parish TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN (''full'',''let_only'')),
  fee_percent REAL CHECK (fee_percent IS NULL OR fee_percent BETWEEN 0 AND 100),
  has_gas INTEGER CHECK (has_gas IS NULL OR has_gas IN (0,1)),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  archived_at TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT,
  CHECK (service <> ''full'' OR fee_percent IS NOT NULL)
)'),
  ('repairs','CREATE TABLE repairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rental_id INTEGER NOT NULL REFERENCES rentals(id),
  tenancy_id INTEGER REFERENCES tenancies(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  detail TEXT CHECK (detail IS NULL OR length(detail) <= 2000),
  urgency TEXT NOT NULL CHECK (urgency IN (''emergency'',''urgent'',''routine'')),
  status TEXT NOT NULL DEFAULT ''reported''
    CHECK (status IN (''reported'',''awaiting_approval'',''approved'',''in_progress'',''done'',''cancelled'')),
  contractor TEXT CHECK (contractor IS NULL OR length(contractor) <= 120),
  quote INTEGER CHECK (quote IS NULL OR (quote > 0 AND quote <= 1000000)),
  cost INTEGER CHECK (cost IS NULL OR (cost > 0 AND cost <= 1000000)),
  done_on TEXT,
  charge_landlord INTEGER NOT NULL DEFAULT 1 CHECK (charge_landlord IN (0,1)),
  approved_at TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT,
  CHECK (status <> ''done'' OR (done_on IS NOT NULL AND cost IS NOT NULL))
)'),
  ('research_facts','CREATE TABLE research_facts (
  fact_id TEXT PRIMARY KEY, property_id TEXT, source_id TEXT, origin TEXT, field TEXT, value TEXT,
  confidence TEXT, context TEXT
)'),
  ('research_financial_terms','CREATE TABLE research_financial_terms (
  term_id TEXT PRIMARY KEY, property_id TEXT, source_id TEXT, term_type TEXT, amount REAL, currency TEXT,
  period TEXT, qualifier TEXT, notes TEXT, source_url TEXT
)'),
  ('research_issues','CREATE TABLE research_issues (
  issue_id TEXT PRIMARY KEY, property_ids TEXT, field TEXT, severity TEXT, issue TEXT, evidence TEXT,
  source_urls TEXT, proposed_action TEXT, confidence TEXT
)'),
  ('research_properties','CREATE TABLE research_properties (
  property_id TEXT PRIMARY KEY, hampton_record_id TEXT, name TEXT, matched_name TEXT, collection TEXT,
  catalogue_scope TEXT, country TEXT, location TEXT, road_name TEXT, property_type TEXT, raw_status TEXT,
  availability TEXT, asking_text TEXT, asking_amount REAL, currency TEXT, price_basis TEXT, bedrooms REAL,
  bathrooms REAL, hampton_source_url TEXT, hampton_summary TEXT, hampton_description TEXT,
  source_updated_date TEXT, raw_numeric_price REAL, match_status TEXT, match_confidence TEXT,
  match_reason TEXT, external_source_count REAL, missing_information TEXT, next_action TEXT,
  research_date TEXT, page_fetch_error TEXT, duplicate_group TEXT, hampton_asset_count REAL,
  external_asset_count REAL, floorplan_reference_count REAL, issue_count REAL,
  advertising_evidence_class TEXT, independent_advertising_match TEXT, evidence_basis TEXT
)'),
  ('research_search_log','CREATE TABLE research_search_log (
  search_id TEXT PRIMARY KEY, property_id TEXT, date TEXT, query TEXT, engine TEXT, outcome TEXT
)'),
  ('research_sources','CREATE TABLE research_sources (
  source_id TEXT PRIMARY KEY, property_id TEXT, origin TEXT, title TEXT, url TEXT, accessed_on TEXT,
  source_type TEXT, access_level TEXT, observed_status TEXT, price_text TEXT, source_date TEXT,
  summary TEXT, match_relevance TEXT, agent_or_site TEXT
)'),
  ('sale_milestones','CREATE TABLE sale_milestones (
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  planned_on TEXT, done_on TEXT,
  not_needed INTEGER NOT NULL DEFAULT 0 CHECK (not_needed IN (0,1)),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  CHECK (done_on IS NULL OR not_needed = 0),
  PRIMARY KEY (sale_id, key)
) WITHOUT ROWID'),
  ('sales','CREATE TABLE sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  applicant_id INTEGER NOT NULL REFERENCES applicants(id),
  offer_id INTEGER NOT NULL UNIQUE REFERENCES offers(id),
  price INTEGER NOT NULL CHECK (price > 0 AND price <= 100000000),
  route TEXT CHECK (route IS NULL OR route IN (''freehold'',''share_transfer'')),
  seller_name TEXT, seller_phone TEXT, seller_email TEXT,
  buyer_lawyer_firm TEXT, buyer_lawyer_name TEXT, buyer_lawyer_email TEXT, buyer_lawyer_phone TEXT,
  seller_lawyer_firm TEXT, seller_lawyer_name TEXT, seller_lawyer_email TEXT, seller_lawyer_phone TEXT,
  target_date TEXT,
  fee INTEGER CHECK (fee IS NULL OR (fee > 0 AND fee <= 100000000)),
  shared_agency TEXT,
  shared_fee INTEGER CHECK (shared_fee IS NULL OR shared_fee > 0),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  status TEXT NOT NULL DEFAULT ''in_progress'' CHECK (status IN (''in_progress'',''completed'',''fallen_through'')),
  fell_through_reason TEXT CHECK (fell_through_reason IS NULL OR
    fell_through_reason IN (''buyer_withdrew'',''seller_withdrew'',''finance'',''survey'',''chain'',''other'')),
  fell_through_note TEXT CHECK (fell_through_note IS NULL OR length(fell_through_note) <= 300),
  closed_at TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT,
  CHECK (shared_fee IS NULL OR (fee IS NOT NULL AND shared_fee <= fee)),
  CHECK ((status = ''fallen_through'') = (fell_through_reason IS NOT NULL)),
  CHECK ((status = ''in_progress'') = (closed_at IS NULL))
)'),
  ('tenancies','CREATE TABLE tenancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rental_id INTEGER NOT NULL REFERENCES rentals(id),
  payment_ref TEXT UNIQUE,
  tenant_name TEXT NOT NULL CHECK (length(tenant_name) BETWEEN 1 AND 120),
  tenant_email TEXT CHECK (tenant_email IS NULL OR length(tenant_email) <= 120),
  tenant_phone TEXT CHECK (tenant_phone IS NULL OR length(tenant_phone) <= 120),
  occupants TEXT CHECK (occupants IS NULL OR length(occupants) <= 500),
  kind TEXT NOT NULL CHECK (kind IN (''fixed'',''periodic'')),
  regime TEXT NOT NULL CHECK (regime IN (''2011'',''2025'')),
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
  notice_by TEXT CHECK (notice_by IS NULL OR notice_by IN (''tenant'',''landlord'')),
  collect_from TEXT,
  opening_balance INTEGER CHECK (opening_balance IS NULL OR (opening_balance >= 0 AND opening_balance <= 100000000)),
  ended_on TEXT,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT, financial_revision INTEGER NOT NULL DEFAULT 1
  CHECK(typeof(financial_revision)=''integer'' AND financial_revision > 0),
  CHECK (end_on IS NULL OR end_on > start_on),
  CHECK (kind <> ''fixed'' OR end_on IS NOT NULL),
  CHECK ((notice_given_on IS NULL) = (notice_by IS NULL)),
  CHECK (collect_from IS NULL OR collect_from >= start_on),
  CHECK (ended_on IS NULL OR ended_on >= start_on)
)'),
  ('tours','CREATE TABLE tours (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  url TEXT NOT NULL CHECK (url LIKE ''https://%''),
  caption TEXT,
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)'),
  ('viewing_policy_settings','CREATE TABLE viewing_policy_settings (
  negotiator_id INTEGER PRIMARY KEY REFERENCES negotiators(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL CHECK(typeof(duration_minutes)=''integer'' AND duration_minutes BETWEEN 10 AND 180 AND duration_minutes % 5 = 0),
  buffer_minutes INTEGER NOT NULL CHECK(typeof(buffer_minutes)=''integer'' AND buffer_minutes BETWEEN 0 AND 120),
  parish_extra_minutes INTEGER NOT NULL CHECK(typeof(parish_extra_minutes)=''integer'' AND parish_extra_minutes BETWEEN 0 AND 120),
  max_daily INTEGER NOT NULL CHECK(typeof(max_daily)=''integer'' AND max_daily BETWEEN 1 AND 40),
  revision INTEGER NOT NULL CHECK(typeof(revision)=''integer'' AND revision >= 1),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
)'),
  ('viewing_policy_snapshots','CREATE TABLE viewing_policy_snapshots (
  viewing_id INTEGER PRIMARY KEY REFERENCES viewing_requests(id) ON DELETE CASCADE,
  parish TEXT,
  buffer_minutes INTEGER NOT NULL CHECK(typeof(buffer_minutes)=''integer'' AND buffer_minutes BETWEEN 0 AND 120),
  parish_extra_minutes INTEGER NOT NULL CHECK(typeof(parish_extra_minutes)=''integer'' AND parish_extra_minutes BETWEEN 0 AND 120),
  policy_revision INTEGER NOT NULL CHECK(typeof(policy_revision)=''integer'' AND policy_revision >= 0)
)'),
  ('viewing_requests','CREATE TABLE "viewing_requests" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  agent TEXT, kind TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT, phone TEXT,
  status TEXT NOT NULL DEFAULT ''requested'' CHECK (status IN (''requested'',''confirmed'',''completed'',''no_show'',''cancelled'')),
  created_at TEXT NOT NULL, updated_at TEXT, updated_by TEXT,
  listing_ref TEXT, listing_title_snapshot TEXT, notes TEXT,
  negotiator_id INTEGER REFERENCES negotiators(id) ON DELETE SET NULL,
  end_time TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN (''proceed'',''more_info'',''not_interested'')),
  outcome_note TEXT CHECK (outcome_note IS NULL OR length(outcome_note) <= 500), interest_removed_at TEXT, interest_reason TEXT
  CHECK ((interest_reason IS NULL) = (interest_removed_at IS NULL)
    AND (interest_reason IS NULL OR interest_reason IN (''no_longer_interested'',''not_buyer'',''other''))), interest_note TEXT
  CHECK ((interest_note IS NULL OR (interest_reason IS NOT NULL AND length(interest_note) <= 200))
    AND (interest_reason IS NOT ''other'' OR interest_note IS NOT NULL)), interest_same_as TEXT
  CHECK (interest_same_as IS NULL OR length(interest_same_as) BETWEEN 1 AND 254),
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK (outcome IS NULL OR status = ''completed'')
)'),
  ('weekly_insights','CREATE TABLE weekly_insights (
  week_start TEXT PRIMARY KEY CHECK(length(week_start)=10 AND date(week_start,''+0 days'') IS week_start AND strftime(''%w'',week_start)=''1''),
  week_until TEXT NOT NULL CHECK(week_until=date(week_start,''+7 days'')),
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload) AND json_type(payload)=''object'' AND json_extract(payload,''$.version'') IS 1)
) WITHOUT ROWID')
), unexpected AS (
  SELECT name,sql FROM sqlite_schema
  WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT IN ('pub10_guard','_cf_METADATA')
  EXCEPT SELECT name,sql FROM expected
), missing AS (
  SELECT name,sql FROM expected EXCEPT SELECT name,sql FROM sqlite_schema WHERE type='table'
)
INSERT INTO pub10_guard SELECT (SELECT COUNT(*) FROM unexpected)+(SELECT COUNT(*) FROM missing)
  +(SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='_cf_METADATA'
      AND sql<>'CREATE TABLE _cf_METADATA (
        key INTEGER PRIMARY KEY,
        value BLOB
      )');

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='history_viewing_event_insert' AND tbl_name='events' AND sql='CREATE TRIGGER history_viewing_event_insert AFTER INSERT ON events
  WHEN NEW.entity_type=''viewing'' AND NEW.type IN (''viewing.requested'',''viewing.booked'',''viewing.confirmed'',
    ''viewing.rescheduled'',''viewing.cancelled'',''viewing.completed'',''viewing.no_show'')
BEGIN
  INSERT INTO history_viewing_events(event_id,viewing_id,listing_id,at)
    SELECT NEW.id,v.id,v.listing_id,NEW.at FROM viewing_requests v
    JOIN listings l ON l.id=v.listing_id WHERE CAST(v.id AS TEXT)=NEW.entity_id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='history_viewing_relink' AND tbl_name='viewing_requests' AND sql='CREATE TRIGGER history_viewing_relink AFTER UPDATE OF listing_id ON viewing_requests
  WHEN OLD.listing_id IS NOT NEW.listing_id
BEGIN
  DELETE FROM history_viewing_events WHERE viewing_id=NEW.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='listing_event_delete' AND tbl_name='listings' AND sql='CREATE TRIGGER listing_event_delete AFTER DELETE ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=OLD.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,''listing'',OLD.id,''listing.deleted'',json_object(
    ''revision'',(SELECT COALESCE(MAX(CAST(json_extract(data,''$.revision'') AS INTEGER)),0)+1
      FROM events WHERE entity_type=''listing'' AND entity_id=OLD.id),
    ''source'',c.source,
    ''fields'',json(json(''[]'')),
    ''before'',json(json(''{}'')),
    ''after'',json(json(''{}'')),
    ''derived_fields'',json(json(''[]'')),
    ''related'',json(c.related))
  FROM listing_event_context c
  WHERE c.listing_id=OLD.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='listing_event_insert' AND tbl_name='listings' AND sql='CREATE TRIGGER listing_event_insert AFTER INSERT ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=NEW.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,''listing'',NEW.id,''listing.created'',json_object(
    ''revision'',(SELECT COALESCE(MAX(CAST(json_extract(data,''$.revision'') AS INTEGER)),0)+1
      FROM events WHERE entity_type=''listing'' AND entity_id=NEW.id),
    ''source'',c.source,
    ''fields'',json(json_array(''review_requested_at'',''review_requested_by'',''published'',''archived_at'',''availability'',''published_at'',''confirmed_at'',''use'',''operation'',''sale_price'',''rent'',''rent_period'',''premium'',''currency'',''parish'',''tenure_type'',''housing_category'',''restriction'',''bedrooms'',''bathrooms'',''matchable'',''viewings_enabled'',''viewing_hours'',''featured_rank'',''cover_media_id'',''feat_pets'',''feat_parking'',''feat_furnished'',''feat_outdoor'',''feat_type'',''title'',''property_type'',''country'',''location'',''road_name'',''tenure'',''price_text'',''price_per_sqft'',''rental_deposit'',''parish_rates'',''service_charge'',''utilities_included'',''available_on'',''summary'',''description'',''tour_url'',''specs'',''feat_evidence'',''property_condition'',''interior_area_sqft'',''separate_wcs'',''reception_rooms'',''has_garage'',''has_storage'',''has_lift'',''double_glazing'',''floor_level'',''building_floors'',''year_built'',''heating_types'',''amenities'',''feature_overrides'')),
    ''before'',json(json(''{}'')),
    ''after'',json(json_object(
      ''review_requested_at'', NEW.review_requested_at,
      ''review_requested_by'', NEW.review_requested_by,
      ''published'', NEW.published,
      ''archived_at'', NEW.archived_at,
      ''availability'', NEW.availability,
      ''published_at'', NEW.published_at,
      ''confirmed_at'', NEW.confirmed_at,
      ''use'', NEW.use,
      ''operation'', NEW.operation,
      ''sale_price'', NEW.sale_price,
      ''rent'', NEW.rent,
      ''rent_period'', NEW.rent_period,
      ''premium'', NEW.premium,
      ''currency'', NEW.currency,
      ''parish'', NEW.parish,
      ''tenure_type'', NEW.tenure_type,
      ''housing_category'', NEW.housing_category,
      ''restriction'', NEW.restriction,
      ''bedrooms'', NEW.bedrooms,
      ''bathrooms'', NEW.bathrooms,
      ''matchable'', NEW.matchable,
      ''viewings_enabled'', NEW.viewings_enabled,
      ''viewing_hours'', json(COALESCE(NEW.viewing_hours,''null'')),
      ''featured_rank'', NEW.featured_rank,
      ''cover_media_id'', NEW.cover_media_id,
      ''feat_pets'', NEW.feat_pets,
      ''feat_parking'', NEW.feat_parking,
      ''feat_furnished'', NEW.feat_furnished,
      ''feat_outdoor'', json(COALESCE(NEW.feat_outdoor,''null'')),
      ''feat_type'', NEW.feat_type,
      ''property_condition'', NEW.property_condition,
      ''interior_area_sqft'', NEW.interior_area_sqft,
      ''separate_wcs'', NEW.separate_wcs,
      ''reception_rooms'', NEW.reception_rooms,
      ''has_garage'', NEW.has_garage,
      ''has_storage'', NEW.has_storage,
      ''has_lift'', NEW.has_lift,
      ''double_glazing'', NEW.double_glazing,
      ''floor_level'', NEW.floor_level,
      ''building_floors'', NEW.building_floors,
      ''year_built'', NEW.year_built,
      ''heating_types'', json(COALESCE(NEW.heating_types,''null'')),
      ''amenities'', json(COALESCE(NEW.amenities,''null'')),
      ''feature_overrides'', json(COALESCE(NEW.feature_overrides,''null'')))),
    ''derived_fields'',json(json(c.derived_fields)),
    ''related'',json(c.related))
  FROM listing_event_context c
  WHERE c.listing_id=NEW.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='listing_event_update' AND tbl_name='listings' AND sql='CREATE TRIGGER listing_event_update AFTER UPDATE ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=NEW.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,''listing'',NEW.id,''listing.'' || CASE WHEN c.action=''published'' AND OLD.published=1 THEN ''confirmed'' ELSE c.action END,json_object(
    ''revision'',(SELECT COALESCE(MAX(CAST(json_extract(data,''$.revision'') AS INTEGER)),0)+1
      FROM events WHERE entity_type=''listing'' AND entity_id=NEW.id),
    ''source'',c.source,
    ''fields'',json((SELECT json_group_array(value) FROM (
      SELECT key AS value FROM json_each(d.changed) WHERE value=1
      UNION SELECT value FROM json_each(c.extra_fields)
    ))),
    ''before'',json((SELECT json_group_object(key, CASE WHEN type IN (''array'',''object'') THEN json(value) ELSE value END)
      FROM json_each(d.before_values) WHERE key IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    ''after'',json((SELECT json_group_object(key, CASE WHEN type IN (''array'',''object'') THEN json(value) ELSE value END)
      FROM json_each(d.after_values) WHERE key IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    ''derived_fields'',json((SELECT json_group_array(value) FROM json_each(c.derived_fields)
      WHERE value IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    ''related'',json(c.related))
  FROM listing_event_context c, (SELECT
    json_object(
      ''review_requested_at'', OLD.review_requested_at,
      ''review_requested_by'', OLD.review_requested_by,
      ''published'', OLD.published,
      ''archived_at'', OLD.archived_at,
      ''availability'', OLD.availability,
      ''published_at'', OLD.published_at,
      ''confirmed_at'', OLD.confirmed_at,
      ''use'', OLD.use,
      ''operation'', OLD.operation,
      ''sale_price'', OLD.sale_price,
      ''rent'', OLD.rent,
      ''rent_period'', OLD.rent_period,
      ''premium'', OLD.premium,
      ''currency'', OLD.currency,
      ''parish'', OLD.parish,
      ''tenure_type'', OLD.tenure_type,
      ''housing_category'', OLD.housing_category,
      ''restriction'', OLD.restriction,
      ''bedrooms'', OLD.bedrooms,
      ''bathrooms'', OLD.bathrooms,
      ''matchable'', OLD.matchable,
      ''viewings_enabled'', OLD.viewings_enabled,
      ''viewing_hours'', json(COALESCE(OLD.viewing_hours,''null'')),
      ''featured_rank'', OLD.featured_rank,
      ''cover_media_id'', OLD.cover_media_id,
      ''feat_pets'', OLD.feat_pets,
      ''feat_parking'', OLD.feat_parking,
      ''feat_furnished'', OLD.feat_furnished,
      ''feat_outdoor'', json(COALESCE(OLD.feat_outdoor,''null'')),
      ''feat_type'', OLD.feat_type,
      ''property_condition'', OLD.property_condition,
      ''interior_area_sqft'', OLD.interior_area_sqft,
      ''separate_wcs'', OLD.separate_wcs,
      ''reception_rooms'', OLD.reception_rooms,
      ''has_garage'', OLD.has_garage,
      ''has_storage'', OLD.has_storage,
      ''has_lift'', OLD.has_lift,
      ''double_glazing'', OLD.double_glazing,
      ''floor_level'', OLD.floor_level,
      ''building_floors'', OLD.building_floors,
      ''year_built'', OLD.year_built,
      ''heating_types'', json(COALESCE(OLD.heating_types,''null'')),
      ''amenities'', json(COALESCE(OLD.amenities,''null'')),
      ''feature_overrides'', json(COALESCE(OLD.feature_overrides,''null''))) AS before_values,
    json_object(
      ''review_requested_at'', NEW.review_requested_at,
      ''review_requested_by'', NEW.review_requested_by,
      ''published'', NEW.published,
      ''archived_at'', NEW.archived_at,
      ''availability'', NEW.availability,
      ''published_at'', NEW.published_at,
      ''confirmed_at'', NEW.confirmed_at,
      ''use'', NEW.use,
      ''operation'', NEW.operation,
      ''sale_price'', NEW.sale_price,
      ''rent'', NEW.rent,
      ''rent_period'', NEW.rent_period,
      ''premium'', NEW.premium,
      ''currency'', NEW.currency,
      ''parish'', NEW.parish,
      ''tenure_type'', NEW.tenure_type,
      ''housing_category'', NEW.housing_category,
      ''restriction'', NEW.restriction,
      ''bedrooms'', NEW.bedrooms,
      ''bathrooms'', NEW.bathrooms,
      ''matchable'', NEW.matchable,
      ''viewings_enabled'', NEW.viewings_enabled,
      ''viewing_hours'', json(COALESCE(NEW.viewing_hours,''null'')),
      ''featured_rank'', NEW.featured_rank,
      ''cover_media_id'', NEW.cover_media_id,
      ''feat_pets'', NEW.feat_pets,
      ''feat_parking'', NEW.feat_parking,
      ''feat_furnished'', NEW.feat_furnished,
      ''feat_outdoor'', json(COALESCE(NEW.feat_outdoor,''null'')),
      ''feat_type'', NEW.feat_type,
      ''property_condition'', NEW.property_condition,
      ''interior_area_sqft'', NEW.interior_area_sqft,
      ''separate_wcs'', NEW.separate_wcs,
      ''reception_rooms'', NEW.reception_rooms,
      ''has_garage'', NEW.has_garage,
      ''has_storage'', NEW.has_storage,
      ''has_lift'', NEW.has_lift,
      ''double_glazing'', NEW.double_glazing,
      ''floor_level'', NEW.floor_level,
      ''building_floors'', NEW.building_floors,
      ''year_built'', NEW.year_built,
      ''heating_types'', json(COALESCE(NEW.heating_types,''null'')),
      ''amenities'', json(COALESCE(NEW.amenities,''null'')),
      ''feature_overrides'', json(COALESCE(NEW.feature_overrides,''null''))) AS after_values,
    json_object(
      ''review_requested_at'', NEW.review_requested_at IS NOT OLD.review_requested_at,
      ''review_requested_by'', NEW.review_requested_by IS NOT OLD.review_requested_by,
      ''published'', NEW.published IS NOT OLD.published,
      ''archived_at'', NEW.archived_at IS NOT OLD.archived_at,
      ''availability'', NEW.availability IS NOT OLD.availability,
      ''published_at'', NEW.published_at IS NOT OLD.published_at,
      ''confirmed_at'', NEW.confirmed_at IS NOT OLD.confirmed_at,
      ''use'', NEW.use IS NOT OLD.use,
      ''operation'', NEW.operation IS NOT OLD.operation,
      ''sale_price'', NEW.sale_price IS NOT OLD.sale_price,
      ''rent'', NEW.rent IS NOT OLD.rent,
      ''rent_period'', NEW.rent_period IS NOT OLD.rent_period,
      ''premium'', NEW.premium IS NOT OLD.premium,
      ''currency'', NEW.currency IS NOT OLD.currency,
      ''price_per_sqft'', NEW.price_per_sqft IS NOT OLD.price_per_sqft,
      ''rental_deposit'', NEW.rental_deposit IS NOT OLD.rental_deposit,
      ''parish_rates'', NEW.parish_rates IS NOT OLD.parish_rates,
      ''service_charge'', NEW.service_charge IS NOT OLD.service_charge,
      ''utilities_included'', NEW.utilities_included IS NOT OLD.utilities_included,
      ''available_on'', NEW.available_on IS NOT OLD.available_on,
      ''parish'', NEW.parish IS NOT OLD.parish,
      ''tenure_type'', NEW.tenure_type IS NOT OLD.tenure_type,
      ''housing_category'', NEW.housing_category IS NOT OLD.housing_category,
      ''restriction'', NEW.restriction IS NOT OLD.restriction,
      ''bedrooms'', NEW.bedrooms IS NOT OLD.bedrooms,
      ''bathrooms'', NEW.bathrooms IS NOT OLD.bathrooms,
      ''matchable'', NEW.matchable IS NOT OLD.matchable,
      ''viewings_enabled'', NEW.viewings_enabled IS NOT OLD.viewings_enabled,
      ''viewing_hours'', NEW.viewing_hours IS NOT OLD.viewing_hours,
      ''featured_rank'', NEW.featured_rank IS NOT OLD.featured_rank,
      ''cover_media_id'', NEW.cover_media_id IS NOT OLD.cover_media_id,
      ''feat_pets'', NEW.feat_pets IS NOT OLD.feat_pets,
      ''feat_parking'', NEW.feat_parking IS NOT OLD.feat_parking,
      ''feat_furnished'', NEW.feat_furnished IS NOT OLD.feat_furnished,
      ''feat_outdoor'', NEW.feat_outdoor IS NOT OLD.feat_outdoor,
      ''feat_type'', NEW.feat_type IS NOT OLD.feat_type,
      ''property_condition'', NEW.property_condition IS NOT OLD.property_condition,
      ''interior_area_sqft'', NEW.interior_area_sqft IS NOT OLD.interior_area_sqft,
      ''separate_wcs'', NEW.separate_wcs IS NOT OLD.separate_wcs,
      ''reception_rooms'', NEW.reception_rooms IS NOT OLD.reception_rooms,
      ''has_garage'', NEW.has_garage IS NOT OLD.has_garage,
      ''has_storage'', NEW.has_storage IS NOT OLD.has_storage,
      ''has_lift'', NEW.has_lift IS NOT OLD.has_lift,
      ''double_glazing'', NEW.double_glazing IS NOT OLD.double_glazing,
      ''floor_level'', NEW.floor_level IS NOT OLD.floor_level,
      ''building_floors'', NEW.building_floors IS NOT OLD.building_floors,
      ''year_built'', NEW.year_built IS NOT OLD.year_built,
      ''heating_types'', NEW.heating_types IS NOT OLD.heating_types,
      ''amenities'', NEW.amenities IS NOT OLD.amenities,
      ''feature_overrides'', NEW.feature_overrides IS NOT OLD.feature_overrides,
      ''title'', NEW.title IS NOT OLD.title,
      ''property_type'', NEW.property_type IS NOT OLD.property_type,
      ''country'', NEW.country IS NOT OLD.country,
      ''location'', NEW.location IS NOT OLD.location,
      ''road_name'', NEW.road_name IS NOT OLD.road_name,
      ''tenure'', NEW.tenure IS NOT OLD.tenure,
      ''price_text'', NEW.price_text IS NOT OLD.price_text,
      ''summary'', NEW.summary IS NOT OLD.summary,
      ''description'', NEW.description IS NOT OLD.description,
      ''tour_url'', NEW.tour_url IS NOT OLD.tour_url,
      ''specs'', NEW.specs IS NOT OLD.specs,
      ''feat_evidence'', NEW.feat_evidence IS NOT OLD.feat_evidence) AS changed) d
  WHERE c.listing_id=NEW.id
    AND (EXISTS(SELECT 1 FROM json_each(d.changed) WHERE value=1)
      OR EXISTS(SELECT 1 FROM json_each(c.extra_fields))
      OR c.action IN (''confirmed'',''published''));
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_applicant_deleted' AND tbl_name='applicants' AND sql='CREATE TRIGGER notification_applicant_deleted AFTER DELETE ON applicants BEGIN
  UPDATE notifications SET title=''Deleted applicant'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE (target_kind=''applicant'' AND target_id=CAST(OLD.id AS TEXT)) OR event_id IN(SELECT id FROM events WHERE entity_type=''applicant'' AND entity_id=CAST(OLD.id AS TEXT));
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_check_deleted' AND tbl_name='compliance_items' AND sql='CREATE TRIGGER notification_check_deleted AFTER DELETE ON compliance_items BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,''$.compliance_kind'')=OLD.kind);
  UPDATE notifications SET title=''Deleted check'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,''$.compliance_kind'')=OLD.kind;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_contact_deleted' AND tbl_name='contacts' AND sql='CREATE TRIGGER notification_contact_deleted AFTER DELETE ON contacts BEGIN
  UPDATE notifications SET title=''Deleted applicant'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE (target_kind=''contact'' AND target_id=CAST(OLD.id AS TEXT)) OR event_id IN(SELECT id FROM events WHERE entity_type=''contact'' AND entity_id=CAST(OLD.id AS TEXT));
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_event_feed' AND tbl_name='events' AND sql='CREATE TRIGGER notification_event_feed AFTER INSERT ON events BEGIN
  INSERT INTO notifications(task_key,event_id,source_version,category,title,action_required,created_at,
    target_kind,target_id,target_context,target_deleted)
    SELECT ''event:''||id,id,id,category,title,0,at,target_kind,target_id,target_context,target_deleted
    FROM notification_event_projection WHERE id=NEW.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_listing_deleted' AND tbl_name='listings' AND sql='CREATE TRIGGER notification_listing_deleted AFTER DELETE ON listings BEGIN
  DELETE FROM notification_observations WHERE target_kind=''listing'' AND target_id=OLD.id;
  UPDATE notifications SET title=''Deleted property'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE (target_kind=''listing'' AND target_id=OLD.id) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type=''listing'' AND entity_id=OLD.id));
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_milestone_deleted' AND tbl_name='sale_milestones' AND sql='CREATE TRIGGER notification_milestone_deleted AFTER DELETE ON sale_milestones BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind=''sale'' AND target_id=CAST(OLD.sale_id AS TEXT) AND json_extract(target_context,''$.milestone'')=OLD.key);
  UPDATE notifications SET title=''Deleted milestone'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''sale'' AND target_id=CAST(OLD.sale_id AS TEXT) AND json_extract(target_context,''$.milestone'')=OLD.key;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_offer_deleted' AND tbl_name='offers' AND sql='CREATE TRIGGER notification_offer_deleted AFTER DELETE ON offers BEGIN
  DELETE FROM notification_observations WHERE target_kind=''offer'' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title=''Deleted offer'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''offer'' AND target_id=CAST(OLD.id AS TEXT);
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_payment_deleted' AND tbl_name='payments' AND sql='CREATE TRIGGER notification_payment_deleted AFTER DELETE ON payments BEGIN
  DELETE FROM notification_observations WHERE target_kind=''payment'' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title=''Deleted payment'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''payment'' AND target_id=CAST(OLD.id AS TEXT);
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_rental_bridge' AND tbl_name='rental_events' AND sql='CREATE TRIGGER notification_rental_bridge AFTER INSERT ON rental_events
WHEN NEW.type IN (''rental.created'',''rental.updated'',''rental.archived'',''rental.restored'',
  ''tenancy.created'',''tenancy.updated'',''tenancy.renewed'',''tenancy.ended'',''tenancy.end_cancelled'',
  ''rent.changed'',''notice.recorded'',''arrears.step_done'',''charge.edited'',''compliance.updated'',
  ''repair.created'',''repair.updated'',''payment.recorded'',''payment.updated'',''payments.imported'')
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data,rental_event_id)
  SELECT NEW.at,COALESCE(NEW.actor,''system''),
    CASE WHEN NEW.type IN (''payment.recorded'',''payment.updated'') THEN ''payment''
      WHEN NEW.type=''payments.imported'' AND NEW.rental_id IS NULL THEN ''collection'' ELSE ''rental'' END,
    CASE WHEN NEW.type IN (''payment.recorded'',''payment.updated'') THEN CAST(json_extract(NEW.data,''$.payment_id'') AS TEXT)
      WHEN NEW.type=''payments.imported'' AND NEW.rental_id IS NULL THEN ''unmatched-payments'' ELSE CAST(NEW.rental_id AS TEXT) END,
    NEW.type,json_object(''version'',1,''tenancy_id'',NEW.tenancy_id,''repair_id'',json_extract(NEW.data,''$.repair_id''),
      ''compliance_kind'',CASE WHEN NEW.type=''compliance.updated'' THEN json_extract(NEW.data,''$.kind'') END,
      ''state'',CASE WHEN NEW.type=''repair.updated'' THEN json_extract(NEW.data,''$.after.status'') END,
      ''urgency'',CASE WHEN NEW.type=''repair.updated'' THEN json_extract(NEW.data,''$.after.urgency'') END,
      ''unmatched'',CASE WHEN NEW.type IN (''payment.recorded'',''payment.updated'') THEN
        (SELECT tenancy_id IS NULL FROM payments WHERE id=json_extract(NEW.data,''$.payment_id'')) END),NEW.id
  WHERE (NEW.rental_id IS NOT NULL OR NEW.type IN (''payment.recorded'',''payment.updated'',''payments.imported''))
    AND (NEW.type NOT IN (''payment.recorded'',''payment.updated'') OR EXISTS(
      SELECT 1 FROM payments p WHERE p.id=json_extract(NEW.data,''$.payment_id'')
        AND (p.tenancy_id IS NEW.tenancy_id OR (p.tenancy_id IS NULL
          AND json_type(NEW.data,''$.after.tenancy_id'')=''null''
          AND json_extract(NEW.data,''$.before.tenancy_id'')=NEW.tenancy_id))));
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_rental_deleted' AND tbl_name='rentals' AND sql='CREATE TRIGGER notification_rental_deleted AFTER DELETE ON rentals BEGIN
  DELETE FROM notification_observations WHERE target_kind=''rental'' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title=''Deleted rental'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.id AS TEXT);
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_repair_deleted' AND tbl_name='repairs' AND sql='CREATE TRIGGER notification_repair_deleted AFTER DELETE ON repairs BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,''$.repair_id'')=OLD.id);
  UPDATE notifications SET title=''Deleted repair'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,''$.repair_id'')=OLD.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_sale_deleted' AND tbl_name='sales' AND sql='CREATE TRIGGER notification_sale_deleted AFTER DELETE ON sales BEGIN
  DELETE FROM notification_observations WHERE target_kind=''sale'' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title=''Deleted sale'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''sale'' AND target_id=CAST(OLD.id AS TEXT);
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_task_changed' AND tbl_name='notifications' AND sql='CREATE TRIGGER notification_task_changed AFTER UPDATE OF event_id,category,title,action_required,
  resolved_at,resolved_by,assigned_to,due_at,task_reason,source_version,urgency,closed_by_source,
  target_kind,target_id,target_context,target_deleted ON notifications
WHEN OLD.task_key IS NOT NULL BEGIN
  UPDATE notifications SET revision=OLD.revision+1,
    closed_by_source=CASE WHEN NEW.resolved_at IS NULL THEN 0
      WHEN OLD.resolved_at IS NULL THEN CASE WHEN NEW.task_action=''done'' THEN 0 ELSE 1 END
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
    SELECT NEW.id,revision,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now''),
      COALESCE(NEW.task_actor,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN NEW.resolved_by END,''system''),
      COALESCE(NEW.task_action,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN ''source_resolved'' ELSE ''source_update'' END)
    FROM notifications WHERE id=NEW.id AND revision>OLD.revision;
  UPDATE notifications SET task_actor=NULL,task_action=NULL WHERE id=NEW.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_task_created' AND tbl_name='notifications' AND sql='CREATE TRIGGER notification_task_created AFTER INSERT ON notifications BEGIN
  UPDATE notifications SET task_key=COALESCE(NEW.task_key,''legacy:'' || NEW.id),
    source_version=CASE WHEN NEW.source_version=0 THEN NEW.event_id ELSE NEW.source_version END,
    task_actor=NULL,task_action=NULL WHERE id=NEW.id;
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    VALUES(NEW.id,1,NEW.created_at,COALESCE(NEW.task_actor,(SELECT actor FROM events WHERE id=NEW.event_id),''system''),''created'');
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_tenancy_deleted' AND tbl_name='tenancies' AND sql='CREATE TRIGGER notification_tenancy_deleted AFTER DELETE ON tenancies BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,''$.tenancy_id'')=OLD.id);
  UPDATE notifications SET title=''Deleted tenancy'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,''$.tenancy_id'')=OLD.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_viewing_deleted' AND tbl_name='viewing_requests' AND sql='CREATE TRIGGER notification_viewing_deleted AFTER DELETE ON viewing_requests BEGIN
  UPDATE notifications SET title=''Deleted viewing request'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE (target_kind=''viewing'' AND target_id=CAST(OLD.id AS TEXT)) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type=''viewing'' AND entity_id=CAST(OLD.id AS TEXT)));
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='rental_events_count' AND tbl_name='rental_events' AND sql='CREATE TRIGGER rental_events_count AFTER INSERT ON rental_events BEGIN
  DELETE FROM app_settings WHERE key = ''rentals_count'';
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='weekly_insights_notice' AND tbl_name='weekly_insights' AND sql='CREATE TRIGGER weekly_insights_notice AFTER INSERT ON weekly_insights BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(NEW.generated_at,''system'',''admin'',''weekly-insights:''||NEW.week_start,''analytics.weekly_created'',
      json_object(''version'',1,''from'',NEW.week_start,''until'',NEW.week_until));
  INSERT INTO notifications(event_id,category,title,action_required,created_at,task_key,source_version,target_kind,target_id)
    VALUES(last_insert_rowid(),''message'',''Weekly Insights · ''||NEW.week_start||''–''||date(NEW.week_until,''-1 day''),
      0,NEW.generated_at,''insights:weekly:''||NEW.week_start,last_insert_rowid(),''collection'',''weekly-insights:''||NEW.week_start);
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='view' AND name='notification_event_projection' AND tbl_name='notification_event_projection' AND sql='CREATE VIEW notification_event_projection AS
SELECT e.id,e.at,e.actor,
  CASE WHEN e.entity_type=''applicant'' AND e.type LIKE ''offer.%'' THEN ''offer''
    WHEN e.entity_type=''applicant'' AND e.type LIKE ''sale.%'' THEN ''sale'' ELSE e.entity_type END AS target_kind,
  CASE WHEN e.entity_type=''applicant'' AND e.type LIKE ''offer.%'' THEN CAST(json_extract(e.data,''$.offer_id'') AS TEXT)
    WHEN e.entity_type=''applicant'' AND e.type LIKE ''sale.%'' THEN CAST(json_extract(e.data,''$.sale_id'') AS TEXT) ELSE e.entity_id END AS target_id,
  CASE WHEN e.entity_type=''applicant'' AND e.type=''sale.milestone'' THEN json_object(''milestone'',json_extract(e.data,''$.key''))
    WHEN e.entity_type=''rental'' THEN json_patch(''{}'',json_object(
    ''tenancy_id'',json_extract(e.data,''$.tenancy_id''),''repair_id'',json_extract(e.data,''$.repair_id''),
    ''compliance_kind'',json_extract(e.data,''$.compliance_kind''))) END AS target_context,
  CASE WHEN e.type=''compliance.updated'' AND e.entity_type=''rental'' THEN ''compliance'' WHEN e.entity_type=''viewing'' THEN ''viewing'' ELSE ''task'' END AS category,
  CASE e.type
    WHEN ''viewing.booked'' THEN ''Viewing booked'' WHEN ''viewing.confirmed'' THEN ''Viewing confirmed''
    WHEN ''viewing.rescheduled'' THEN ''Viewing rescheduled'' WHEN ''viewing.cancelled'' THEN ''Viewing cancelled''
    WHEN ''viewing.completed'' THEN ''Viewing completed'' WHEN ''viewing.no_show'' THEN ''Viewing missed''
    WHEN ''offer.recorded'' THEN ''Offer recorded'' WHEN ''offer.updated'' THEN ''Offer updated''
    WHEN ''offer.countered'' THEN ''Offer countered'' WHEN ''offer.rejected'' THEN ''Offer rejected''
    WHEN ''offer.withdrawn'' THEN ''Offer withdrawn'' WHEN ''offer.accepted'' THEN ''Offer accepted''
    WHEN ''sale.updated'' THEN ''Sale updated'' WHEN ''sale.milestone'' THEN ''Sale milestone updated''
    WHEN ''sale.completed'' THEN ''Sale completed'' WHEN ''sale.fallen_through'' THEN ''Sale fell through''
    WHEN ''listing.review_requested'' THEN ''Property ready for review'' WHEN ''listing.review_returned'' THEN ''Property returned to draft'' WHEN ''listing.created'' THEN ''Property created'' WHEN ''listing.updated'' THEN ''Property updated''
    WHEN ''listing.published'' THEN ''Property published'' WHEN ''listing.unpublished'' THEN ''Property unpublished''
    WHEN ''listing.archived'' THEN ''Property archived'' WHEN ''listing.restored'' THEN ''Property restored''
    WHEN ''listing.confirmed'' THEN ''Property confirmed'' WHEN ''listing.availability_changed'' THEN ''Property availability changed''
    WHEN ''listing.featured_changed'' THEN ''Featured property changed'' WHEN ''listing.cover_changed'' THEN ''Property cover changed''
    WHEN ''listing.recalculated'' THEN ''Property recalculated'' WHEN ''listing.deleted'' THEN ''Property deleted''
    WHEN ''payment.recorded'' THEN ''Payment recorded'' WHEN ''payment.updated'' THEN ''Payment updated''
    WHEN ''payments.imported'' THEN ''Payments imported'' WHEN ''rental.created'' THEN ''Rental created''
    WHEN ''rental.updated'' THEN ''Rental updated'' WHEN ''rental.archived'' THEN ''Rental archived''
    WHEN ''rental.restored'' THEN ''Rental restored'' WHEN ''tenancy.created'' THEN ''Tenancy created''
    WHEN ''tenancy.updated'' THEN ''Tenancy updated'' WHEN ''tenancy.renewed'' THEN ''Tenancy renewed''
    WHEN ''tenancy.ended'' THEN ''Tenancy ended'' WHEN ''tenancy.end_cancelled'' THEN ''Tenancy end cancelled''
    WHEN ''rent.changed'' THEN ''Rent changed'' WHEN ''notice.recorded'' THEN ''Notice recorded''
    WHEN ''arrears.step_done'' THEN ''Arrears step completed'' WHEN ''charge.edited'' THEN ''Charge edited''
    WHEN ''compliance.updated'' THEN ''Compliance updated'' WHEN ''repair.created'' THEN ''Repair reported''
    WHEN ''repair.updated'' THEN ''Repair updated'' END AS title,
  e.type=''listing.deleted'' AS target_deleted
FROM events e
WHERE (e.entity_type=''viewing'' AND e.type IN (''viewing.booked'',''viewing.confirmed'',''viewing.rescheduled'',''viewing.cancelled'',''viewing.completed'',''viewing.no_show''))
 OR (e.entity_type=''applicant'' AND (e.type IN (''offer.recorded'',''offer.updated'',''offer.countered'',''offer.rejected'',''offer.withdrawn'',''offer.accepted'')
   AND EXISTS(SELECT 1 FROM offers WHERE id=json_extract(e.data,''$.offer_id'') AND applicant_id=e.entity_id)
   OR e.type IN (''sale.updated'',''sale.milestone'',''sale.completed'',''sale.fallen_through'')
   AND EXISTS(SELECT 1 FROM sales WHERE id=json_extract(e.data,''$.sale_id'') AND applicant_id=e.entity_id)
   AND (e.type<>''sale.milestone'' OR (json_extract(e.data,''$.key'') IN (''lawyers'',''due_diligence'',''questionnaire'',''searches'',''mortgage'',''contract'',''funds'',''passing'',''settled'')
     AND EXISTS(SELECT 1 FROM sale_milestones WHERE sale_id=json_extract(e.data,''$.sale_id'') AND key=json_extract(e.data,''$.key''))))))
 OR (e.entity_type=''listing'' AND e.type IN (''listing.review_requested'',''listing.review_returned'',''listing.created'',''listing.updated'',''listing.published'',''listing.unpublished'',''listing.archived'',''listing.restored'',''listing.confirmed'',''listing.availability_changed'',''listing.featured_changed'',''listing.cover_changed'',''listing.recalculated'',''listing.deleted''))
 OR (e.rental_event_id IS NOT NULL AND e.entity_type IN (''rental'',''payment'',''collection''))';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='events_entity' AND tbl_name='events' AND sql='CREATE INDEX events_entity ON events(entity_type,entity_id,at)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='events_listing_related' AND tbl_name='events' AND sql='CREATE INDEX events_listing_related ON events(
  (CASE WHEN json_valid(data) THEN json_extract(data, ''$.listing_id'') END),
  at DESC, id DESC
) WHERE entity_type = ''applicant''';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='events_listing_revision' AND tbl_name='events' AND sql='CREATE UNIQUE INDEX events_listing_revision ON events(entity_id,CAST(json_extract(data,''$.revision'') AS INTEGER)) WHERE entity_type=''listing''';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='notifications_created' AND tbl_name='notifications' AND sql='CREATE INDEX notifications_created ON notifications(created_at)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='notifications_event' AND tbl_name='notifications' AND sql='CREATE INDEX notifications_event ON notifications(event_id)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='notifications_open' AND tbl_name='notifications' AND sql='CREATE INDEX notifications_open ON notifications(resolved_at,category,created_at)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='notifications_owner_due' AND tbl_name='notifications' AND sql='CREATE INDEX notifications_owner_due ON notifications(assigned_to,due_at) WHERE resolved_at IS NULL';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='notifications_source_cursor' AND tbl_name='notifications' AND sql='CREATE INDEX notifications_source_cursor ON notifications(source_version,id)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='notifications_target' AND tbl_name='notifications' AND sql='CREATE INDEX notifications_target ON notifications(target_kind,target_id)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='events' AND tbl_name='events' AND sql='CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL, actor TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN (''applicant'',''contact'',''viewing'',''admin'',''listing'',''rental'',''payment'',''collection'')),
  entity_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT,
  rental_event_id INTEGER UNIQUE REFERENCES rental_events(id) ON DELETE SET NULL
)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='notifications' AND tbl_name='notifications' AND sql='CREATE TABLE "notifications" (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL CHECK(category IN (''new_applicant'',''viewing'',''matched'',''task'',''agency_reply'',''message'',''compliance'')),
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
  urgency TEXT NOT NULL DEFAULT ''normal'' CHECK(urgency IN (''normal'',''urgent'')),
  closed_by_source INTEGER NOT NULL DEFAULT 0 CHECK(closed_by_source IN (0,1)),
  task_actor TEXT, task_action TEXT
, target_kind TEXT CHECK(target_kind IS NULL OR target_kind IN (''applicant'',''contact'',''viewing'',''listing'',''offer'',''sale'',''rental'',''payment'',''collection'')), target_id TEXT, target_context TEXT CHECK(target_context IS NULL OR (json_valid(target_context) AND json_type(target_context)=''object'')), target_deleted INTEGER NOT NULL DEFAULT 0 CHECK(target_deleted IN (0,1)))';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='notification_task_history' AND tbl_name='notification_task_history' AND sql='CREATE TABLE notification_task_history (
  task_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  PRIMARY KEY(task_id,revision)
)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='notification_task_operations' AND tbl_name='notification_task_operations' AND sql='CREATE TABLE notification_task_operations (
  actor TEXT NOT NULL, operation_id TEXT NOT NULL,
  task_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  payload_hash TEXT NOT NULL, result_revision INTEGER NOT NULL,
  PRIMARY KEY(actor,operation_id)
)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='notification_reads' AND tbl_name='notification_reads' AND sql='CREATE TABLE notification_reads (
  admin TEXT NOT NULL REFERENCES admins(email) ON DELETE CASCADE,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  read_revision INTEGER NOT NULL CHECK(read_revision >= 1),
  PRIMARY KEY(admin,notification_id)
)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='notification_observations' AND tbl_name='notification_observations' AND sql='CREATE TABLE notification_observations (
  task_key TEXT PRIMARY KEY REFERENCES notifications(task_key) ON DELETE CASCADE,
  kind TEXT NOT NULL, entity_id TEXT NOT NULL, cycle TEXT NOT NULL,
  signature TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
  target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
  event_id INTEGER NOT NULL REFERENCES events(id)
) WITHOUT ROWID';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='history_viewing_events' AND tbl_name='history_viewing_events' AND sql='CREATE TABLE history_viewing_events (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  viewing_id INTEGER NOT NULL REFERENCES viewing_requests(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  at TEXT NOT NULL
)';

INSERT INTO pub10_guard SELECT COUNT(*)<>23 FROM sqlite_master WHERE type='trigger' AND (instr(lower(sql),'events')>0 OR instr(lower(sql),'notifications')>0);

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='view' AND (instr(lower(sql),'events')>0 OR instr(lower(sql),'notifications')>0);

INSERT INTO pub10_guard SELECT COUNT(*)<>9 FROM sqlite_master WHERE type='index' AND tbl_name IN ('events','notifications') AND sql IS NOT NULL;

CREATE TABLE pub10_backup_events AS SELECT * FROM events;

CREATE TABLE pub10_backup_notifications AS SELECT * FROM notifications;

CREATE TABLE pub10_backup_notification_task_history AS SELECT * FROM notification_task_history;

CREATE TABLE pub10_backup_notification_task_operations AS SELECT * FROM notification_task_operations;

CREATE TABLE pub10_backup_notification_reads AS SELECT * FROM notification_reads;

CREATE TABLE pub10_backup_notification_observations AS SELECT * FROM notification_observations;

CREATE TABLE pub10_backup_history_viewing_events AS SELECT * FROM history_viewing_events;

DROP TRIGGER "history_viewing_event_insert";

DROP TRIGGER "history_viewing_relink";

DROP TRIGGER "listing_event_delete";

DROP TRIGGER "listing_event_insert";

DROP TRIGGER "listing_event_update";

DROP TRIGGER "notification_applicant_deleted";

DROP TRIGGER "notification_check_deleted";

DROP TRIGGER "notification_contact_deleted";

DROP TRIGGER "notification_event_feed";

DROP TRIGGER "notification_listing_deleted";

DROP TRIGGER "notification_milestone_deleted";

DROP TRIGGER "notification_offer_deleted";

DROP TRIGGER "notification_payment_deleted";

DROP TRIGGER "notification_rental_bridge";

DROP TRIGGER "notification_rental_deleted";

DROP TRIGGER "notification_repair_deleted";

DROP TRIGGER "notification_sale_deleted";

DROP TRIGGER "notification_task_changed";

DROP TRIGGER "notification_task_created";

DROP TRIGGER "notification_tenancy_deleted";

DROP TRIGGER "notification_viewing_deleted";

DROP TRIGGER "rental_events_count";

DROP TRIGGER "weekly_insights_notice";

DROP VIEW "notification_event_projection";

DROP TABLE notifications;

DROP TABLE events;

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL, actor TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('applicant','contact','viewing','admin','listing','rental','payment','collection','owner_request')),
  entity_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT,
  rental_event_id INTEGER UNIQUE REFERENCES rental_events(id) ON DELETE SET NULL
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
, target_kind TEXT CHECK(target_kind IS NULL OR target_kind IN ('applicant','contact','viewing','listing','offer','sale','rental','payment','collection','owner_request')), target_id TEXT, target_context TEXT CHECK(target_context IS NULL OR (json_valid(target_context) AND json_type(target_context)='object')), target_deleted INTEGER NOT NULL DEFAULT 0 CHECK(target_deleted IN (0,1)));

INSERT INTO events SELECT * FROM pub10_backup_events;

INSERT INTO notifications SELECT * FROM pub10_backup_notifications;

INSERT INTO notification_task_history SELECT * FROM pub10_backup_notification_task_history;

INSERT INTO notification_task_operations SELECT * FROM pub10_backup_notification_task_operations;

INSERT INTO notification_reads SELECT * FROM pub10_backup_notification_reads;

INSERT INTO notification_observations SELECT * FROM pub10_backup_notification_observations;

INSERT INTO history_viewing_events SELECT * FROM pub10_backup_history_viewing_events;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM events EXCEPT SELECT * FROM pub10_backup_events);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_events EXCEPT SELECT * FROM events);

DROP TABLE pub10_backup_events;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM notifications EXCEPT SELECT * FROM pub10_backup_notifications);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_notifications EXCEPT SELECT * FROM notifications);

DROP TABLE pub10_backup_notifications;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM notification_task_history EXCEPT SELECT * FROM pub10_backup_notification_task_history);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_notification_task_history EXCEPT SELECT * FROM notification_task_history);

DROP TABLE pub10_backup_notification_task_history;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM notification_task_operations EXCEPT SELECT * FROM pub10_backup_notification_task_operations);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_notification_task_operations EXCEPT SELECT * FROM notification_task_operations);

DROP TABLE pub10_backup_notification_task_operations;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM notification_reads EXCEPT SELECT * FROM pub10_backup_notification_reads);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_notification_reads EXCEPT SELECT * FROM notification_reads);

DROP TABLE pub10_backup_notification_reads;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM notification_observations EXCEPT SELECT * FROM pub10_backup_notification_observations);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_notification_observations EXCEPT SELECT * FROM notification_observations);

DROP TABLE pub10_backup_notification_observations;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM history_viewing_events EXCEPT SELECT * FROM pub10_backup_history_viewing_events);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_history_viewing_events EXCEPT SELECT * FROM history_viewing_events);

DROP TABLE pub10_backup_history_viewing_events;

CREATE INDEX events_entity ON events(entity_type,entity_id,at);

CREATE INDEX events_listing_related ON events(
  (CASE WHEN json_valid(data) THEN json_extract(data, '$.listing_id') END),
  at DESC, id DESC
) WHERE entity_type = 'applicant';

CREATE UNIQUE INDEX events_listing_revision ON events(entity_id,CAST(json_extract(data,'$.revision') AS INTEGER)) WHERE entity_type='listing';

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
    'fields',json(json_array('review_requested_at','review_requested_by','published','archived_at','availability','published_at','confirmed_at','use','operation','sale_price','rent','rent_period','premium','currency','parish','tenure_type','housing_category','restriction','bedrooms','bathrooms','matchable','viewings_enabled','viewing_hours','featured_rank','cover_media_id','feat_pets','feat_parking','feat_furnished','feat_outdoor','feat_type','title','property_type','country','location','road_name','tenure','price_text','price_per_sqft','rental_deposit','parish_rates','service_charge','utilities_included','available_on','summary','description','tour_url','specs','feat_evidence','property_condition','interior_area_sqft','separate_wcs','reception_rooms','has_garage','has_storage','has_lift','double_glazing','floor_level','building_floors','year_built','heating_types','amenities','feature_overrides')),
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
      'feat_type', NEW.feat_type,
      'property_condition', NEW.property_condition,
      'interior_area_sqft', NEW.interior_area_sqft,
      'separate_wcs', NEW.separate_wcs,
      'reception_rooms', NEW.reception_rooms,
      'has_garage', NEW.has_garage,
      'has_storage', NEW.has_storage,
      'has_lift', NEW.has_lift,
      'double_glazing', NEW.double_glazing,
      'floor_level', NEW.floor_level,
      'building_floors', NEW.building_floors,
      'year_built', NEW.year_built,
      'heating_types', json(COALESCE(NEW.heating_types,'null')),
      'amenities', json(COALESCE(NEW.amenities,'null')),
      'feature_overrides', json(COALESCE(NEW.feature_overrides,'null')))),
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
    'fields',json((SELECT json_group_array(value) FROM (
      SELECT key AS value FROM json_each(d.changed) WHERE value=1
      UNION SELECT value FROM json_each(c.extra_fields)
    ))),
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
      'feat_type', OLD.feat_type,
      'property_condition', OLD.property_condition,
      'interior_area_sqft', OLD.interior_area_sqft,
      'separate_wcs', OLD.separate_wcs,
      'reception_rooms', OLD.reception_rooms,
      'has_garage', OLD.has_garage,
      'has_storage', OLD.has_storage,
      'has_lift', OLD.has_lift,
      'double_glazing', OLD.double_glazing,
      'floor_level', OLD.floor_level,
      'building_floors', OLD.building_floors,
      'year_built', OLD.year_built,
      'heating_types', json(COALESCE(OLD.heating_types,'null')),
      'amenities', json(COALESCE(OLD.amenities,'null')),
      'feature_overrides', json(COALESCE(OLD.feature_overrides,'null'))) AS before_values,
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
      'feat_type', NEW.feat_type,
      'property_condition', NEW.property_condition,
      'interior_area_sqft', NEW.interior_area_sqft,
      'separate_wcs', NEW.separate_wcs,
      'reception_rooms', NEW.reception_rooms,
      'has_garage', NEW.has_garage,
      'has_storage', NEW.has_storage,
      'has_lift', NEW.has_lift,
      'double_glazing', NEW.double_glazing,
      'floor_level', NEW.floor_level,
      'building_floors', NEW.building_floors,
      'year_built', NEW.year_built,
      'heating_types', json(COALESCE(NEW.heating_types,'null')),
      'amenities', json(COALESCE(NEW.amenities,'null')),
      'feature_overrides', json(COALESCE(NEW.feature_overrides,'null'))) AS after_values,
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
      'price_per_sqft', NEW.price_per_sqft IS NOT OLD.price_per_sqft,
      'rental_deposit', NEW.rental_deposit IS NOT OLD.rental_deposit,
      'parish_rates', NEW.parish_rates IS NOT OLD.parish_rates,
      'service_charge', NEW.service_charge IS NOT OLD.service_charge,
      'utilities_included', NEW.utilities_included IS NOT OLD.utilities_included,
      'available_on', NEW.available_on IS NOT OLD.available_on,
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
      'property_condition', NEW.property_condition IS NOT OLD.property_condition,
      'interior_area_sqft', NEW.interior_area_sqft IS NOT OLD.interior_area_sqft,
      'separate_wcs', NEW.separate_wcs IS NOT OLD.separate_wcs,
      'reception_rooms', NEW.reception_rooms IS NOT OLD.reception_rooms,
      'has_garage', NEW.has_garage IS NOT OLD.has_garage,
      'has_storage', NEW.has_storage IS NOT OLD.has_storage,
      'has_lift', NEW.has_lift IS NOT OLD.has_lift,
      'double_glazing', NEW.double_glazing IS NOT OLD.double_glazing,
      'floor_level', NEW.floor_level IS NOT OLD.floor_level,
      'building_floors', NEW.building_floors IS NOT OLD.building_floors,
      'year_built', NEW.year_built IS NOT OLD.year_built,
      'heating_types', NEW.heating_types IS NOT OLD.heating_types,
      'amenities', NEW.amenities IS NOT OLD.amenities,
      'feature_overrides', NEW.feature_overrides IS NOT OLD.feature_overrides,
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
    AND (EXISTS(SELECT 1 FROM json_each(d.changed) WHERE value=1)
      OR EXISTS(SELECT 1 FROM json_each(c.extra_fields))
      OR c.action IN ('confirmed','published'));
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

INSERT INTO pub10_guard SELECT COUNT(*) FROM pragma_foreign_key_check;

DROP TABLE pub10_guard;
