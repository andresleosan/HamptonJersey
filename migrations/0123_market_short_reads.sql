-- BUS-09: the Hermes door's own refusals of a short pass (server/routes/hermes-market.js): one row per run and channel,
-- the latest refusal. seen: the distinct adverts the pass took; baseline: those of the channel's last complete pass.
-- The next day a pass of about the same size (±10%, at least half the baseline) completes: a real drop, not a short read.
-- Only this door writes it, never Hermes's /fail. Additive: one new table; no existing row changes.
CREATE TABLE market_short_reads (
  run_id TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  seen INTEGER NOT NULL CHECK (seen >= 0),
  baseline INTEGER NOT NULL CHECK (baseline >= 0),
  at TEXT NOT NULL,
  PRIMARY KEY (run_id, source_ref, channel_id)
) WITHOUT ROWID;
