-- BUS-04: the market inventory's changes cross again only the active home searches they can affect
-- (server/market-rematch.js), read and written only with BUS04_REMATCH_READY=1.
-- Additive: an index, three new tables and one more index; no existing row or table changes. The changes are BUS-06's
-- market_change_outbox rows (0043), marked consumed by the clock once the searches they affect are queued here.

-- The changes still to consume, found without reading the whole outbox.
CREATE INDEX market_change_outbox_pending ON market_change_outbox(observation_id) WHERE consumer_state='pending';

-- The searches to cross again, one row each however many changes queued it. queued_at: its place in the queue, set
-- when it was first queued and moved to the back only after it is crossed or fails, never by another change, so a
-- backlog of changes cannot keep crossing the same searches. generation: raised by every change that queues it again,
-- so a change that arrives while it is crossed keeps it queued. attempts: crossings that failed (dropped at 3), never
-- reset by another change. Deleted with its search.
CREATE TABLE market_rematch_queue (
  applicant_id INTEGER PRIMARY KEY REFERENCES applicants(id) ON DELETE CASCADE,
  queued_at TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
CREATE INDEX market_rematch_queue_order ON market_rematch_queue(queued_at);

-- The searches BUS-04 has crossed at least once. Their first crossing takes the baseline below, once: what the search
-- held then was never noticed by anyone. After that, any home in market_matches it was not told about is new, however
-- it got there (a market change, a saved search, Recalculate all). Deleted with its search.
CREATE TABLE market_rematch_baselines (
  applicant_id INTEGER PRIMARY KEY REFERENCES applicants(id) ON DELETE CASCADE,
  taken_at TEXT NOT NULL
);

-- What each search was already told about a market home (a meets or to-confirm result in market_matches), so a change
-- never proposes it, nor raises a notice for it, a second time. Only a lower comparable price proposes it again.
-- reason: baseline (in market_matches at the search's first crossing: never a notice), new (not proposed before),
-- lower_price (it came back cheaper than when it was last proposed).
-- price: the home's price when last proposed, as [amount_minor, currency, period]; NULL when unknown (a baseline, or
-- adverts that disagreed or stated none), and then the next crossing records it without proposing anything.
-- proposed_at: the crossing that last proposed or baselined it; match_changed_at: the market_matches result it saw.
-- adverts: the home's adverts as [source_ref, channel_id, external_key] when last seen, so a home whose key changes
-- because a person joined or split its adverts (BUS-10) carries what was proposed under its earlier key.
-- Kept after the home leaves market_matches, so it does not come back as new. Deleted with its search.
CREATE TABLE market_match_proposals (
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  home_key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('sale','rent')),
  reason TEXT NOT NULL CHECK (reason IN ('baseline','new','lower_price')),
  price TEXT CHECK (price IS NULL OR json_valid(price)),
  proposed_at TEXT NOT NULL,
  match_changed_at TEXT NOT NULL,
  adverts TEXT CHECK (adverts IS NULL OR json_valid(adverts)),
  PRIMARY KEY (applicant_id, home_key, operation)
) WITHOUT ROWID;
