-- BUS-14: pages use a stable persisted order; legacy searches remain version0 until a full valid recompute.
ALTER TABLE applicants ADD COLUMN matches_revision INTEGER NOT NULL DEFAULT 0 CHECK(matches_revision >= 0);
ALTER TABLE applicants ADD COLUMN match_ranking_version INTEGER NOT NULL DEFAULT 0 CHECK(match_ranking_version IN (0,1));
ALTER TABLE applicants ADD COLUMN match_inputs_revision INTEGER NOT NULL DEFAULT 0 CHECK(match_inputs_revision >= 0);
-- A separate row avoids nested listing updates entering the existing editorial event triggers.
CREATE TABLE listing_match_inputs(listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
 version INTEGER NOT NULL CHECK(version>=0));
CREATE INDEX matches_page ON matches(applicant_id,status,requirements_rank,score DESC,listing_id COLLATE BINARY,id);
CREATE TRIGGER matches_page_insert AFTER INSERT ON matches BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=NEW.applicant_id;
END;
CREATE TRIGGER matches_page_delete AFTER DELETE ON matches BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=OLD.applicant_id;
END;
CREATE TRIGGER matches_page_update AFTER UPDATE OF status,score,checks,requirements_rank,reject_reason,reviewed_at ON matches
WHEN OLD.status IS NOT NEW.status OR OLD.score IS NOT NEW.score OR OLD.checks IS NOT NEW.checks
 OR OLD.requirements_rank IS NOT NEW.requirements_rank OR OLD.reject_reason IS NOT NEW.reject_reason OR OLD.reviewed_at IS NOT NEW.reviewed_at BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=NEW.applicant_id;
END;
CREATE TRIGGER applicants_match_inputs AFTER UPDATE OF requirement_priorities,household_children,household_children_status,move_in_date,lease_term_months,near,requirements,operation,budget_min,budget_max,budget_stretch,property_types,bedrooms_min,bedrooms_max,bedrooms_ideal,bathrooms_min,parking_spaces,outdoor,furnished,pets,parishes_wanted,parishes_excluded,housing_status,buyer_position,archived_at,search_state,search_category,stage ON applicants
WHEN OLD.requirement_priorities IS NOT NEW.requirement_priorities OR OLD.household_children IS NOT NEW.household_children OR OLD.household_children_status IS NOT NEW.household_children_status OR OLD.move_in_date IS NOT NEW.move_in_date OR OLD.lease_term_months IS NOT NEW.lease_term_months OR OLD.near IS NOT NEW.near OR OLD.requirements IS NOT NEW.requirements OR OLD.operation IS NOT NEW.operation OR OLD.budget_min IS NOT NEW.budget_min OR OLD.budget_max IS NOT NEW.budget_max OR OLD.budget_stretch IS NOT NEW.budget_stretch OR OLD.property_types IS NOT NEW.property_types OR OLD.bedrooms_min IS NOT NEW.bedrooms_min OR OLD.bedrooms_max IS NOT NEW.bedrooms_max OR OLD.bedrooms_ideal IS NOT NEW.bedrooms_ideal OR OLD.bathrooms_min IS NOT NEW.bathrooms_min OR OLD.parking_spaces IS NOT NEW.parking_spaces OR OLD.outdoor IS NOT NEW.outdoor OR OLD.furnished IS NOT NEW.furnished OR OLD.pets IS NOT NEW.pets OR OLD.parishes_wanted IS NOT NEW.parishes_wanted OR OLD.parishes_excluded IS NOT NEW.parishes_excluded OR OLD.housing_status IS NOT NEW.housing_status OR OLD.buyer_position IS NOT NEW.buyer_position OR OLD.archived_at IS NOT NEW.archived_at OR OLD.search_state IS NOT NEW.search_state OR OLD.search_category IS NOT NEW.search_category OR OLD.stage IS NOT NEW.stage BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1, match_inputs_revision=match_inputs_revision+1,
 match_ranking_version=0 WHERE id=NEW.id;
END;
CREATE TRIGGER listings_match_inputs AFTER UPDATE OF operation,availability,archived_at,bedrooms,bathrooms,parish,published,sale_price,rent,rent_period,feat_pets,feat_parking,feat_furnished,feat_outdoor,feat_type,feat_evidence,tenure_type,housing_category,restriction,matchable,use,country,currency ON listings
WHEN OLD.operation IS NOT NEW.operation OR OLD.availability IS NOT NEW.availability OR OLD.archived_at IS NOT NEW.archived_at OR OLD.bedrooms IS NOT NEW.bedrooms OR OLD.bathrooms IS NOT NEW.bathrooms OR OLD.parish IS NOT NEW.parish OR OLD.published IS NOT NEW.published OR OLD.sale_price IS NOT NEW.sale_price OR OLD.rent IS NOT NEW.rent OR OLD.rent_period IS NOT NEW.rent_period OR OLD.feat_pets IS NOT NEW.feat_pets OR OLD.feat_parking IS NOT NEW.feat_parking OR OLD.feat_furnished IS NOT NEW.feat_furnished OR OLD.feat_outdoor IS NOT NEW.feat_outdoor OR OLD.feat_type IS NOT NEW.feat_type OR OLD.feat_evidence IS NOT NEW.feat_evidence OR OLD.tenure_type IS NOT NEW.tenure_type OR OLD.housing_category IS NOT NEW.housing_category OR OLD.restriction IS NOT NEW.restriction OR OLD.matchable IS NOT NEW.matchable OR OLD.use IS NOT NEW.use OR OLD.country IS NOT NEW.country OR OLD.currency IS NOT NEW.currency BEGIN
 INSERT INTO listing_match_inputs(listing_id,version) VALUES(NEW.id,1)
 ON CONFLICT(listing_id) DO UPDATE SET version=version+1;
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id IN (SELECT applicant_id FROM matches WHERE listing_id=NEW.id);
END;
CREATE TRIGGER applicants_ranking_page AFTER UPDATE OF match_ranking_version ON applicants
WHEN OLD.match_ranking_version IS NOT NEW.match_ranking_version BEGIN
 UPDATE applicants SET matches_revision=matches_revision+1 WHERE id=NEW.id;
END;
