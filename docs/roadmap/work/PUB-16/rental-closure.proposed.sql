-- PUB-16 proposal, NOT an active migration. Review lifecycle, permissions, retention and every public cache first.
CREATE TABLE rental_closure_windows (
  closure_id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  close_event_id INTEGER NOT NULL REFERENCES events(id),
  state TEXT NOT NULL CHECK(state IN ('open','corrected','withdrawn')),
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
  CHECK (strftime('%Y-%m-%dT%H:%M:%fZ',opened_at,'+0 seconds') IS NOT NULL
    AND opened_at=strftime('%Y-%m-%dT%H:%M:%fZ',opened_at,'+0 seconds')),
  CHECK (strftime('%Y-%m-%dT%H:%M:%fZ',opened_at,'+24 hours') IS NOT NULL
    AND due_at=strftime('%Y-%m-%dT%H:%M:%fZ',opened_at,'+24 hours')),
  CHECK ((state='open' AND corrected_at IS NULL AND withdrawn_at IS NULL)
      OR (state='corrected' AND corrected_at IS NOT NULL AND withdrawn_at IS NULL)
      OR (state='withdrawn' AND corrected_at IS NULL AND withdrawn_at IS NOT NULL))
);
CREATE UNIQUE INDEX rental_closure_one_open ON rental_closure_windows(listing_id) WHERE state='open';
CREATE INDEX rental_closure_due ON rental_closure_windows(state,due_at,closure_id);
CREATE INDEX rental_closure_listing ON rental_closure_windows(listing_id,state,due_at);
CREATE TRIGGER rental_closure_no_replacement BEFORE INSERT ON rental_closure_windows
WHEN EXISTS(SELECT 1 FROM rental_closure_windows WHERE closure_id=NEW.closure_id
  OR (listing_id=NEW.listing_id AND state='open' AND NEW.state='open'))
BEGIN SELECT RAISE(ABORT,'rental closure already exists'); END;
CREATE TRIGGER rental_closure_original_immutable BEFORE UPDATE OF
  closure_id,listing_id,close_event_id,opened_at,due_at,previous_availability,previous_published,
  previous_viewings_enabled,previous_confirmed_at,applied_confirmed_at,applied_updated_at ON rental_closure_windows
BEGIN SELECT RAISE(ABORT,'rental closure original is immutable'); END;
CREATE TRIGGER rental_closure_terminal_immutable BEFORE UPDATE ON rental_closure_windows
WHEN OLD.state<>'open' OR NEW.state NOT IN ('corrected','withdrawn')
BEGIN SELECT RAISE(ABORT,'rental closure transition invalid'); END;

-- A bounded round-robin cursor prevents a failing first page from starving later closures.
CREATE TABLE rental_closure_cursor (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1), after_due TEXT, after_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  CHECK((after_due IS NULL)=(after_id IS NULL))
);
INSERT INTO rental_closure_cursor(singleton) VALUES(1);
CREATE TRIGGER rental_closure_cursor_no_replacement BEFORE INSERT ON rental_closure_cursor
WHEN EXISTS(SELECT 1 FROM rental_closure_cursor WHERE singleton=NEW.singleton)
BEGIN SELECT RAISE(ABORT,'rental closure cursor exists'); END;
CREATE TRIGGER rental_closure_cursor_revision BEFORE UPDATE ON rental_closure_cursor
WHEN NEW.singleton<>OLD.singleton OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'rental closure cursor revision invalid'); END;
