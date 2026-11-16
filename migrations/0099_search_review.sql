-- BUS-17: the internal review of an active search that has gone 21 days with no complete option whose availability a
-- person confirmed, again 7 days after each review is closed, and the Inbox task when a rejected home's price drops
-- (server/search-review.js). Read and written only with BUS17_REVIEW_READY=1.
-- Additive: four new tables and two indexes; no existing row or table changes.

-- The clock's own progress: when the module was last switched on (a search registered before that has no evidenced
-- history, so its absence starts when the clock first sees it), its last tick (a gap of over an hour means it was off:
-- every absence restarts from the resumption, as nothing was watched meanwhile) and the page cursor. One row.
CREATE TABLE search_review_progress (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled_at TEXT NOT NULL,
  last_tick_at TEXT,
  after_id INTEGER NOT NULL DEFAULT 0
);

-- One row per search the clock has seen. state: absent (no complete option since no_full_since), held (a complete
-- option exists) or inactive (the search was not active). episode: raised each time a new absence starts, so a review
-- of an earlier absence never counts for this one. source: what evidences no_full_since (activation: registered or
-- reactivated with none; last_full_lost: the last complete option went; legacy_baseline: registered before the clock).
-- last_closed_at: when this episode's last review was closed (the next is due 7 days later). revision: every write
-- checks it, so two ticks never act twice; write_token: the last write's own token, which the same batch checks before acting.
-- Deleted with its search.
CREATE TABLE search_review_cycles (
  applicant_id INTEGER PRIMARY KEY REFERENCES applicants(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('absent', 'held', 'inactive')),
  episode INTEGER NOT NULL CHECK (episode >= 1),
  no_full_since TEXT,
  source TEXT CHECK (source IS NULL OR source IN ('activation', 'last_full_lost', 'legacy_baseline')),
  last_closed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  write_token TEXT,
  updated_at TEXT NOT NULL,
  CHECK ((state = 'absent') = (no_full_since IS NOT NULL AND source IS NOT NULL))
);

-- Each review: its search, episode and place in it (1: day 21; 2 on: each 7 days after a closed one), the alternatives
-- read when it opened (at most 20, as JSON) and what could not be read. Closed by the team's Done on its Inbox task
-- (outcome reviewed), or by its source: a complete option arrived or the search stopped being active. One open per
-- search. Deleted with its search.
CREATE TABLE search_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  episode INTEGER NOT NULL,
  cycle INTEGER NOT NULL CHECK (cycle >= 1),
  due_at TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  alternatives TEXT NOT NULL CHECK (json_valid(alternatives)),
  coverage_pending TEXT CHECK (coverage_pending IS NULL OR json_valid(coverage_pending)),
  closed_at TEXT,
  closed_by TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('reviewed', 'full_option_found', 'search_inactive')),
  CHECK ((closed_at IS NULL) = (outcome IS NULL)),
  UNIQUE (applicant_id, episode, cycle)
);
CREATE UNIQUE INDEX search_reviews_one_open ON search_reviews(applicant_id) WHERE closed_at IS NULL;

-- A rejected match's price as the clock first saw it after that rejection, or as it was when a drop was last noticed:
-- a later price at least 5% lower in the same terms opens an Inbox task for a person to look again (one open per match).
-- The match stays rejected. rejected_at: the rejection it belongs to (matches.reviewed_at); a new rejection, a match no
-- longer rejected, or another currency or kind of price starts again. price: [amount, currency, period]. Deleted with
-- its match.
CREATE TABLE search_rejected_prices (
  match_id INTEGER PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  rejected_at TEXT,
  price TEXT NOT NULL CHECK (json_valid(price)),
  seen_at TEXT NOT NULL
);
CREATE INDEX search_rejected_prices_applicant ON search_rejected_prices(applicant_id);
