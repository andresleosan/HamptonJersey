-- BUS-01 / BUS-03: each active home search against each home of the common market inventory (BUS-10: a decided home,
-- or an advert nobody decided on yet), and what the market part of the search's last full run did (EST-01).
-- Written and read only with BUS01_MARKET_MATCHING_READY=1 and BUS10_IDENTITY_READY=1 (server/match-store.js,
-- server/search-state.js, GET /admin/market/homes).
-- Additive: one new table and its index, and two nullable columns on applicant_search_runs; no existing row changes
-- and nothing is backfilled. matches, its triggers and every reader of it stay as they are: a market home is never a
-- listing, so it is kept apart rather than in matches with a listing_id it does not have.
-- One row per search, home and operation, replaced as a whole by each full run of that search: the result evaluate()
-- gave (meets, pending, alternative or excluded) with its checks, never a person's decision and never availability.
-- home_key: the root market_properties id, or the advert's own key while nobody has decided on it.
-- observed_at: the newest advert reading the result was evaluated from. Deleted with its search.
CREATE TABLE market_matches (
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  home_key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('sale','rent')),
  result TEXT NOT NULL CHECK (result IN ('meets','pending','alternative','excluded')),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  requirements_rank INTEGER NOT NULL CHECK (requirements_rank BETWEEN 0 AND 3),
  checks TEXT NOT NULL,
  observed_at TEXT,
  evaluated_at TEXT NOT NULL,
  PRIMARY KEY (applicant_id, home_key, operation)
) WITHOUT ROWID;
-- The inventory screen reads a page of homes with every search that evaluated them.
CREATE INDEX market_matches_home ON market_matches(home_key, operation);
-- The market part of the last successful full run: searched, incomplete (not every advert was read), no_source
-- (no source is open, which is not an empty market) or failed (the inventory could not be read); NULL: not part of it.
ALTER TABLE applicant_search_runs ADD COLUMN market_state TEXT
  CHECK (market_state IS NULL OR market_state IN ('searched','incomplete','no_source','failed'));
-- How many market homes that run evaluated.
ALTER TABLE applicant_search_runs ADD COLUMN market_homes INTEGER CHECK (market_homes IS NULL OR market_homes >= 0);
