-- SPR-02 B: scope existing applicant events without copying personal data.
CREATE INDEX events_listing_related ON events(
  (CASE WHEN json_valid(data) THEN json_extract(data, '$.listing_id') END),
  at DESC, id DESC
) WHERE entity_type = 'applicant';

-- The viewing association exists only while both the viewing and listing exist.
-- Foreign keys remove it on manual/retention deletion; no tombstone or contact data.
CREATE TABLE history_viewing_events (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  viewing_id INTEGER NOT NULL REFERENCES viewing_requests(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  at TEXT NOT NULL
);
CREATE INDEX history_viewing_listing ON history_viewing_events(listing_id, at DESC, event_id DESC);
CREATE INDEX history_viewing_by_viewing ON history_viewing_events(viewing_id);

INSERT INTO history_viewing_events(event_id,viewing_id,listing_id,at)
  SELECT e.id,v.id,v.listing_id,e.at FROM events e
  JOIN viewing_requests v ON e.entity_type='viewing' AND e.entity_id=CAST(v.id AS TEXT)
  JOIN listings l ON l.id=v.listing_id
  WHERE e.type IN ('viewing.requested','viewing.booked','viewing.confirmed',
    'viewing.rescheduled','viewing.cancelled','viewing.completed','viewing.no_show')
    AND CASE WHEN json_valid(e.data) THEN json_extract(e.data,'$.listing_id') END=v.listing_id;

CREATE TRIGGER history_viewing_event_insert AFTER INSERT ON events
  WHEN NEW.entity_type='viewing' AND NEW.type IN ('viewing.requested','viewing.booked','viewing.confirmed',
    'viewing.rescheduled','viewing.cancelled','viewing.completed','viewing.no_show')
BEGIN
  INSERT INTO history_viewing_events(event_id,viewing_id,listing_id,at)
    SELECT NEW.id,v.id,v.listing_id,NEW.at FROM viewing_requests v
    JOIN listings l ON l.id=v.listing_id WHERE CAST(v.id AS TEXT)=NEW.entity_id;
END;

-- Changing a viewing's listing never reassigns old events to the new property.
CREATE TRIGGER history_viewing_relink AFTER UPDATE OF listing_id ON viewing_requests
  WHEN OLD.listing_id IS NOT NEW.listing_id
BEGIN
  DELETE FROM history_viewing_events WHERE viewing_id=NEW.id;
END;
