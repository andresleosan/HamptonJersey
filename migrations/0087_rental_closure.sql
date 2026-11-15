-- PUB-16: the 24-hour window after a rental is recorded as let (PUB16_TIMED_CLOSURE_READY). Additive.
-- While open the listing shows Let agreed and the team can correct it; at due_at it leaves the website, and the clock
-- withdraws it. A withdrawn window stays closed until a person returns the rental to market (reopened). Listing data,
-- dates and availability only: no person's data.
-- Three schema objects only: SQLite reads every one each time it opens the schema (listing-history's A03 counts that).
-- WITHOUT ROWID keyed by listing: the visibility checks read it by listing_id. The insert trigger keeps closure_id
-- unique and one open window per listing; the update trigger keeps the original fields and the transitions.
CREATE TABLE rental_closure_windows (
  closure_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  close_event_id INTEGER NOT NULL REFERENCES events(id),
  state TEXT NOT NULL CHECK(state IN ('open','corrected','withdrawn','reopened')),
  opened_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  previous_availability TEXT NOT NULL,
  previous_published INTEGER NOT NULL CHECK(previous_published IN (0,1)),
  previous_viewings_enabled INTEGER NOT NULL CHECK(previous_viewings_enabled IN (0,1)),
  previous_confirmed_at TEXT,
  applied_confirmed_at TEXT,
  applied_updated_at TEXT NOT NULL,
  corrected_at TEXT,
  withdrawn_at TEXT,
  reopened_at TEXT,
  CHECK (strftime('%Y-%m-%dT%H:%M:%fZ',opened_at,'+0 seconds') IS NOT NULL
    AND opened_at=strftime('%Y-%m-%dT%H:%M:%fZ',opened_at,'+0 seconds')),
  CHECK (strftime('%Y-%m-%dT%H:%M:%fZ',opened_at,'+24 hours') IS NOT NULL
    AND due_at=strftime('%Y-%m-%dT%H:%M:%fZ',opened_at,'+24 hours')),
  CHECK ((state='open' AND corrected_at IS NULL AND withdrawn_at IS NULL AND reopened_at IS NULL)
      OR (state='corrected' AND corrected_at IS NOT NULL AND withdrawn_at IS NULL AND reopened_at IS NULL)
      OR (state='withdrawn' AND corrected_at IS NULL AND withdrawn_at IS NOT NULL AND reopened_at IS NULL)
      OR (state='reopened' AND corrected_at IS NULL AND withdrawn_at IS NOT NULL AND reopened_at IS NOT NULL)),
  PRIMARY KEY (listing_id, closure_id)
) WITHOUT ROWID;
CREATE TRIGGER rental_closure_no_replacement BEFORE INSERT ON rental_closure_windows
WHEN EXISTS(SELECT 1 FROM rental_closure_windows WHERE closure_id=NEW.closure_id
  OR (listing_id=NEW.listing_id AND state='open' AND NEW.state='open'))
BEGIN SELECT RAISE(ABORT,'rental closure already exists'); END;
-- open -> corrected | withdrawn, and withdrawn -> reopened; corrected and reopened are final. The original never changes.
CREATE TRIGGER rental_closure_transition BEFORE UPDATE ON rental_closure_windows
WHEN NEW.closure_id IS NOT OLD.closure_id OR NEW.listing_id IS NOT OLD.listing_id OR NEW.close_event_id IS NOT OLD.close_event_id
  OR NEW.opened_at IS NOT OLD.opened_at OR NEW.due_at IS NOT OLD.due_at OR NEW.previous_availability IS NOT OLD.previous_availability
  OR NEW.previous_published IS NOT OLD.previous_published OR NEW.previous_viewings_enabled IS NOT OLD.previous_viewings_enabled
  OR NEW.previous_confirmed_at IS NOT OLD.previous_confirmed_at OR NEW.applied_confirmed_at IS NOT OLD.applied_confirmed_at
  OR NEW.applied_updated_at IS NOT OLD.applied_updated_at
  OR NOT ((OLD.state='open' AND NEW.state IN ('corrected','withdrawn'))
    OR (OLD.state='withdrawn' AND NEW.state='reopened' AND NEW.withdrawn_at IS OLD.withdrawn_at))
BEGIN SELECT RAISE(ABORT,'rental closure transition invalid'); END;
-- The clock's round-robin cursor lives in app_settings (key pub16_closure_cursor), not in a table of its own.
