-- PUB-08: separate website content. No rows are created for existing listings.
-- The API remains disabled unless PUB08_CONTENT_READY is explicitly enabled.
CREATE TABLE listing_content (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags) AND json_type(tags)='array' AND json_array_length(tags)<=3),
  video_url TEXT CHECK(video_url IS NULL OR length(video_url)<=500)
);
CREATE TRIGGER listing_content_tags_insert BEFORE INSERT ON listing_content BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.tags)
    WHERE type<>'text' OR value NOT IN ('renovated','sea_view','town_centre'))
    OR (SELECT COUNT(*) FROM json_each(NEW.tags))<>(SELECT COUNT(DISTINCT value) FROM json_each(NEW.tags))
    THEN RAISE(ABORT,'invalid content tags') END;
END;
CREATE TRIGGER listing_content_tags_update BEFORE UPDATE OF tags ON listing_content BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.tags)
    WHERE type<>'text' OR value NOT IN ('renovated','sea_view','town_centre'))
    OR (SELECT COUNT(*) FROM json_each(NEW.tags))<>(SELECT COUNT(DISTINCT value) FROM json_each(NEW.tags))
    THEN RAISE(ABORT,'invalid content tags') END;
END;
