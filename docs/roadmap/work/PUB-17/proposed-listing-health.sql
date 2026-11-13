-- PUB-17: a non-identifying revision tracks title edits even if an importer does not update updated_at.
CREATE TABLE listing_health_revisions (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
CREATE TABLE listing_health_clock (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
INSERT INTO listing_health_clock VALUES(1, 0);
CREATE TRIGGER listing_health_insert_revision AFTER INSERT ON listings
BEGIN
  UPDATE listing_health_clock SET revision=revision+1 WHERE id=1;
  INSERT INTO listing_health_revisions(listing_id, revision)
    SELECT NEW.id, revision FROM listing_health_clock WHERE id=1;
END;
CREATE TRIGGER listing_health_title_revision AFTER UPDATE OF title ON listings
WHEN NEW.title IS NOT OLD.title
BEGIN
  UPDATE listing_health_clock SET revision=revision+1 WHERE id=1;
  INSERT INTO listing_health_revisions(listing_id, revision)
    SELECT NEW.id, revision FROM listing_health_clock WHERE id=1
    ON CONFLICT(listing_id) DO UPDATE SET revision=excluded.revision;
END;
-- Accept valid instants in any SQLite-recognized offset, not just one ISO text representation.
CREATE INDEX viewing_health_time_listing ON viewing_requests(julianday(created_at), listing_id) WHERE created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*';
