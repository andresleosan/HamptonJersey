-- BUS-08: the daily market sweep (server/market-daily-sweep.js), read and written only with BUS08_SWEEP_READY=1.
-- Additive: three new tables and two indexes; no existing row or table changes. The sweep reuses BUS-06's daily runs
-- (market_runs kind 'daily', one per Jersey day), its leases, pages, observations and change outbox (market_change_outbox,
-- what BUS-04 consumes). What it adds is kept here: every attempt on a channel, the adverts a full pass no longer found,
-- and each day's comparison and the searches recomputed after it.

-- Every attempt of the sweep on one channel of a daily run, the failed ones too. outcome: page (a page read and saved),
-- complete (the last page: a full pass), rate_limited, access_denied (401/403 or a login: not retried that day),
-- unavailable (network, timeout, 5xx), invalid_response (the page could not be read or saved), no_reader (no automatic
-- reader exists for the source). The last correct reading of a channel is its newest page or complete attempt; its last
-- full sweep, its newest complete one. No error text is kept: only the outcome.
CREATE TABLE market_sweep_attempts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('page','complete','rate_limited','access_denied','unavailable','invalid_response','no_reader')),
  records INTEGER CHECK (records IS NULL OR records BETWEEN 0 AND 10),
  FOREIGN KEY (run_id, source_ref, channel_id) REFERENCES market_source_runs(run_id, source_ref, channel_id)
) WITHOUT ROWID;
CREATE INDEX market_sweep_attempts_run ON market_sweep_attempts(run_id, source_ref, channel_id, attempted_at);
CREATE INDEX market_sweep_attempts_channel ON market_sweep_attempts(source_ref, channel_id, outcome, attempted_at);

-- An advert read in the channel's previous full pass and not found in this run's full pass: a review for a person,
-- never a confirmed unavailability (EST-15/EST-16 own that). observation_id: its last reading (a plain reference, so a
-- later purge of readings is not blocked here).
CREATE TABLE market_sweep_missing (
  run_id TEXT NOT NULL REFERENCES market_runs(id),
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  external_key TEXT NOT NULL,
  observation_id TEXT NOT NULL,
  PRIMARY KEY (run_id, source_ref, channel_id, external_key)
) WITHOUT ROWID;

-- One row per daily run once its comparison is done (compared_at): how many changes it emitted to the outbox, and the
-- active searches recomputed after it, in order of applicant id (recompute_after: the last one done).
CREATE TABLE market_daily_sweeps (
  run_id TEXT PRIMARY KEY REFERENCES market_runs(id),
  jersey_day TEXT NOT NULL UNIQUE,
  compared_at TEXT NOT NULL,
  changes INTEGER NOT NULL CHECK (changes >= 0),
  recompute_after INTEGER NOT NULL DEFAULT 0 CHECK (recompute_after >= 0),
  recomputed_at TEXT
) WITHOUT ROWID;
