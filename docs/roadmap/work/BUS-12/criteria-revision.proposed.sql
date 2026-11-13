-- PROPOSAL ONLY. Not a migration and not authorized for a remote database.
-- Version zero is a baseline for existing rows, not a reconstructed history.
ALTER TABLE applicants ADD COLUMN criteria_revision INTEGER NOT NULL DEFAULT 0
  CHECK (typeof(criteria_revision) = 'integer' AND criteria_revision >= 0);

-- A version cannot be reset or moved backwards. This does not authorize a
-- caller to write criteria_revision directly: owners must retain field allowlists.
CREATE TRIGGER applicants_criteria_revision_guard BEFORE UPDATE OF criteria_revision ON applicants
WHEN NEW.criteria_revision IS NOT OLD.criteria_revision + 1
BEGIN
  SELECT RAISE(ABORT, 'invalid criteria revision');
END;

CREATE TRIGGER applicants_criteria_revision_change AFTER UPDATE OF
  search_category, operation, search_operation, requirement_priorities,
  budget_min, budget_max, budget_stretch, property_types, bedrooms_min, bedrooms_max,
  bedrooms_ideal, bathrooms_min, parking_spaces, outdoor, furnished, pets,
  area_answer, preferred_parish, parishes_wanted, parishes_excluded, near,
  move_in_date, lease_term_months, buyer_position, mortgage_aip, housing_status,
  household_adults, household_children, household_total, household_children_status,
  household_children_ages, household_ages_at, requirements, commercial_kind,
  commercial_use, area_min, area_max, area_unit, commercial_purchase,
  commercial_rent, commercial_rent_period, commercial_premium, commercial_expenses
ON applicants
WHEN OLD.search_category IS NOT NEW.search_category
  OR OLD.operation IS NOT NEW.operation OR OLD.search_operation IS NOT NEW.search_operation
  OR (OLD.requirement_priorities IS NOT NEW.requirement_priorities AND CASE
    WHEN json_valid(OLD.requirement_priorities) AND json_valid(NEW.requirement_priorities) THEN
      CASE
        -- Duplicate object keys have order-dependent meanings to JSON.parse;
        -- compare them conservatively as stored rather than as a set of paths.
        WHEN EXISTS (SELECT 1 FROM json_tree(OLD.requirement_priorities)
          WHERE parent IS NOT NULL GROUP BY parent, key HAVING COUNT(*) > 1)
          OR EXISTS (SELECT 1 FROM json_tree(NEW.requirement_priorities)
          WHERE parent IS NOT NULL GROUP BY parent, key HAVING COUNT(*) > 1)
        THEN 1
        ELSE EXISTS (SELECT fullkey, type, atom FROM json_tree(OLD.requirement_priorities)
          EXCEPT SELECT fullkey, type, atom FROM json_tree(NEW.requirement_priorities))
          OR EXISTS (SELECT fullkey, type, atom FROM json_tree(NEW.requirement_priorities)
          EXCEPT SELECT fullkey, type, atom FROM json_tree(OLD.requirement_priorities))
      END
    ELSE 1 END)
  OR OLD.budget_min IS NOT NEW.budget_min OR OLD.budget_max IS NOT NEW.budget_max
  OR OLD.budget_stretch IS NOT NEW.budget_stretch OR OLD.property_types IS NOT NEW.property_types
  OR OLD.bedrooms_min IS NOT NEW.bedrooms_min OR OLD.bedrooms_max IS NOT NEW.bedrooms_max
  OR OLD.bedrooms_ideal IS NOT NEW.bedrooms_ideal OR OLD.bathrooms_min IS NOT NEW.bathrooms_min
  OR OLD.parking_spaces IS NOT NEW.parking_spaces OR OLD.outdoor IS NOT NEW.outdoor
  OR OLD.furnished IS NOT NEW.furnished OR OLD.pets IS NOT NEW.pets
  OR OLD.area_answer IS NOT NEW.area_answer OR OLD.preferred_parish IS NOT NEW.preferred_parish
  OR OLD.parishes_wanted IS NOT NEW.parishes_wanted OR OLD.parishes_excluded IS NOT NEW.parishes_excluded
  OR OLD.near IS NOT NEW.near OR OLD.move_in_date IS NOT NEW.move_in_date
  OR OLD.lease_term_months IS NOT NEW.lease_term_months OR OLD.buyer_position IS NOT NEW.buyer_position
  OR OLD.mortgage_aip IS NOT NEW.mortgage_aip OR OLD.housing_status IS NOT NEW.housing_status
  OR OLD.household_adults IS NOT NEW.household_adults OR OLD.household_children IS NOT NEW.household_children
  OR OLD.household_total IS NOT NEW.household_total OR OLD.household_children_status IS NOT NEW.household_children_status
  OR OLD.household_children_ages IS NOT NEW.household_children_ages OR OLD.household_ages_at IS NOT NEW.household_ages_at
  OR OLD.requirements IS NOT NEW.requirements OR OLD.commercial_kind IS NOT NEW.commercial_kind
  OR OLD.commercial_use IS NOT NEW.commercial_use OR OLD.area_min IS NOT NEW.area_min
  OR OLD.area_max IS NOT NEW.area_max OR OLD.area_unit IS NOT NEW.area_unit
  OR OLD.commercial_purchase IS NOT NEW.commercial_purchase OR OLD.commercial_rent IS NOT NEW.commercial_rent
  OR OLD.commercial_rent_period IS NOT NEW.commercial_rent_period OR OLD.commercial_premium IS NOT NEW.commercial_premium
  OR OLD.commercial_expenses IS NOT NEW.commercial_expenses
BEGIN
  UPDATE applicants SET criteria_revision = criteria_revision + 1 WHERE id = NEW.id;
END;
