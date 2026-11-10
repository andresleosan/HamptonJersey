-- REG-06: nullable answers preserve older searches without inventing a declaration.
ALTER TABLE applicants ADD COLUMN area_answer TEXT CHECK(area_answer IS NULL OR area_answer IN ('selected','any','unknown'));
ALTER TABLE applicants ADD COLUMN preferred_parish TEXT CHECK(preferred_parish IS NULL OR preferred_parish IN
  ('Grouville','St Brelade','St Clement','St Helier','St John','St Lawrence','St Martin','St Mary','St Ouen','St Peter','St Saviour','Trinity'));

-- A preferred parish only breaks an otherwise exact tie; old rows retain their order.
ALTER TABLE matches ADD COLUMN area_preference_rank INTEGER NOT NULL DEFAULT 1 CHECK(area_preference_rank IN (0,1));
DROP INDEX matches_page;
CREATE INDEX matches_page ON matches(applicant_id,status,requirements_rank,score DESC,area_preference_rank,listing_id COLLATE BINARY,id);

CREATE TRIGGER applicants_area_match_inputs AFTER UPDATE OF area_answer,preferred_parish ON applicants
WHEN OLD.area_answer IS NOT NEW.area_answer OR OLD.preferred_parish IS NOT NEW.preferred_parish BEGIN
  UPDATE applicants SET matches_revision=matches_revision+1,match_inputs_revision=match_inputs_revision+1,
    match_ranking_version=0 WHERE id=NEW.id;
END;
CREATE TRIGGER matches_area_rank_update AFTER UPDATE OF area_preference_rank ON matches
WHEN OLD.area_preference_rank IS NOT NEW.area_preference_rank BEGIN
  UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=NEW.applicant_id;
END;
