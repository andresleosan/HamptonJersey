-- VIS-12: each negotiator's Google Calendar and the viewings written to it. Additive; read only with
-- VIS12_CALENDAR_READY = "1". Nothing here holds a title, attendee or note read from Google.

-- One connected Google calendar per negotiator. refresh_token_enc is AES-GCM under GOOGLE_CALENDAR_TOKEN_KEY (a secret
-- outside D1) and is never returned by any route; a revoked connection keeps no token.
CREATE TABLE calendar_connections (
  negotiator_id INTEGER PRIMARY KEY REFERENCES negotiators(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google' CHECK (provider = 'google'),
  calendar_id TEXT NOT NULL CHECK (length(calendar_id) BETWEEN 1 AND 200),
  state TEXT NOT NULL CHECK (state IN ('active','revoked')),
  refresh_token_enc TEXT CHECK (refresh_token_enc IS NULL OR length(refresh_token_enc) <= 4096),
  scopes TEXT NOT NULL CHECK (length(scopes) <= 1000),
  connected_at TEXT NOT NULL, connected_by TEXT NOT NULL,
  revoked_at TEXT, revoked_by TEXT,
  CHECK ((state = 'active') = (refresh_token_enc IS NOT NULL)),
  CHECK ((state = 'revoked') = (revoked_at IS NOT NULL))
);

-- A Google sign-in in progress: single use, ten minutes, tied to the staff member who started it and to their browser
-- (the hash of a SameSite=Lax cookie). Only hashes are stored.
CREATE TABLE calendar_oauth_states (
  state_hash TEXT PRIMARY KEY CHECK (length(state_hash) = 64),
  browser_hash TEXT NOT NULL CHECK (length(browser_hash) = 64),
  negotiator_id INTEGER NOT NULL REFERENCES negotiators(id) ON DELETE CASCADE,
  admin TEXT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);

-- The Google event of a viewing. The row (and its deterministic external_id) is written before Google is called, so a
-- lost answer is reconciled to the same event. op is the viewing revision (updated_at) and the wanted state: a result
-- is recorded only while op is still the latest. No FK: a deleted viewing's event is still cancelled through this row,
-- which keeps no personal data. starts_utc/ends_utc: what Hampton last wrote, to tell a time changed in Google.
CREATE TABLE calendar_event_links (
  viewing_id INTEGER PRIMARY KEY,
  negotiator_id INTEGER,
  calendar_id TEXT NOT NULL,
  external_id TEXT NOT NULL CHECK (length(external_id) = 64),
  op TEXT NOT NULL,
  wanted TEXT NOT NULL CHECK (wanted IN ('confirmed','cancelled')),
  state TEXT NOT NULL CHECK (state IN ('pending','synced','unknown','conflict')),
  etag TEXT, starts_utc TEXT, ends_utc TEXT,
  invited INTEGER NOT NULL DEFAULT 0 CHECK (invited IN (0,1)),
  error TEXT CHECK (error IS NULL OR length(error) <= 200),
  updated_at TEXT NOT NULL
);
CREATE INDEX calendar_event_links_retry ON calendar_event_links(state, updated_at);
