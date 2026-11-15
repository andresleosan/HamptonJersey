-- BUS-01 / BUS-03: what each active home search made of the homes of the common market inventory (BUS-10: a decided
-- home, or an advert nobody decided on yet), and what the market part of the search's last full run did (EST-01).
-- Written and read only with BUS01_MARKET_MATCHING_READY=1 and BUS10_IDENTITY_READY=1 (server/match-store.js,
-- server/search-state.js, GET /admin/market/homes), always after and apart from the listings' matches.
-- Additive: two new tables, an index, a trigger that fills the second as readings arrive, and two nullable columns on
-- applicant_search_runs; no existing row changes. The only copy is into the new table of latest readings (below). matches, its triggers and every reader of it stay as they are: a market home is never a
-- listing, so it is kept apart rather than in matches with a listing_id it does not have.
-- One row per search, home and operation whose result is meets, pending or alternative (an excluded home is not kept:
-- the next run works it out again). A run writes only the results that changed and withdraws those that no longer fit.
-- Never a person's decision and never availability.
-- home_key: the root market_properties id, or the advert's own key while nobody has decided on it.
-- observed_at: the newest advert reading the result was worked out from; changed_at: when the result was last written.
-- Deleted with its search.
CREATE TABLE market_matches (
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  home_key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('sale','rent')),
  result TEXT NOT NULL CHECK (result IN ('meets','pending','alternative')),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  requirements_rank INTEGER NOT NULL CHECK (requirements_rank BETWEEN 0 AND 2),
  checks TEXT NOT NULL,
  observed_at TEXT,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (applicant_id, home_key, operation)
) WITHOUT ROWID;
-- The inventory screen reads a page of homes with every search that kept a result for them.
CREATE INDEX market_matches_home ON market_matches(home_key, operation);
-- The market part of the last successful full run: searched, incomplete (more homes than one search evaluates), no_source
-- (no source is open, which is not an empty market) or failed (it could not be worked out); NULL: not part of it.
ALTER TABLE applicant_search_runs ADD COLUMN market_state TEXT
  CHECK (market_state IS NULL OR market_state IN ('searched','incomplete','no_source','failed'));
-- How many market homes that run evaluated.
ALTER TABLE applicant_search_runs ADD COLUMN market_homes INTEGER CHECK (market_homes IS NULL OR market_homes >= 0);

-- The latest reading of each advert, kept as readings arrive, so a search reads each advert once instead of the whole
-- history of its readings. The same rule as LATEST in server/market-identity.js: the newest source_at, then the
-- newest sequence; gone from the first reading that withdrew it. No observation is changed.
CREATE TABLE market_latest_observations (
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  external_key TEXT NOT NULL,
  observation_id TEXT NOT NULL,
  source_at TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  gone INTEGER NOT NULL CHECK (gone IN (0,1)),
  PRIMARY KEY (source_ref, channel_id, external_key)
) WITHOUT ROWID;
CREATE TRIGGER market_latest_observation AFTER INSERT ON market_observations
BEGIN
  INSERT INTO market_latest_observations(source_ref,channel_id,external_key,observation_id,source_at,sequence,gone)
  VALUES (NEW.source_ref,NEW.channel_id,NEW.external_key,NEW.id,NEW.source_at,NEW.sequence,NEW.deleted_tombstone)
  ON CONFLICT(source_ref,channel_id,external_key) DO UPDATE SET
    observation_id=CASE WHEN excluded.source_at>source_at OR (excluded.source_at=source_at AND excluded.sequence>sequence)
      THEN excluded.observation_id ELSE observation_id END,
    sequence=CASE WHEN excluded.source_at>source_at OR (excluded.source_at=source_at AND excluded.sequence>sequence)
      THEN excluded.sequence ELSE sequence END,
    source_at=CASE WHEN excluded.source_at>source_at THEN excluded.source_at ELSE source_at END,
    gone=MAX(gone,excluded.gone);
END;
-- The readings already recorded, by the same rule. A copy into this new table only: no existing row changes.
INSERT INTO market_latest_observations(source_ref,channel_id,external_key,observation_id,source_at,sequence,gone)
SELECT source_ref,channel_id,external_key,id,source_at,sequence,gone FROM (
  SELECT source_ref,channel_id,external_key,id,source_at,sequence,
    ROW_NUMBER() OVER (PARTITION BY source_ref,channel_id,external_key ORDER BY source_at DESC,sequence DESC) AS n,
    MAX(deleted_tombstone) OVER (PARTITION BY source_ref,channel_id,external_key) AS gone
  FROM market_observations) WHERE n=1;
