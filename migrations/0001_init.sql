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
INSERT INTO admins (email, added_by, added_at) VALUES
  ('luismadef45@gmail.com', 'setup', '2026-10-07T00:00:00.000Z'),
  ('andres.san1404@gmail.com', 'setup', '2026-10-07T00:00:00.000Z');

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
