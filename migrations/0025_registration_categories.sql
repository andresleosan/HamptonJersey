-- Existing registrations were residential; retain their state and history.
ALTER TABLE applicants ADD COLUMN search_category TEXT NOT NULL DEFAULT 'residential'
  CHECK (search_category IN ('residential', 'commercial'));
-- Legacy operation CHECK permits only rent/buy. Transfer is represented separately until the market model replaces it.
ALTER TABLE applicants ADD COLUMN search_operation TEXT CHECK (search_operation IS NULL OR
  (search_operation = 'transfer' AND search_category = 'commercial' AND operation = 'rent'));
ALTER TABLE applicants ADD COLUMN commercial_kind TEXT CHECK (commercial_kind IS NULL OR commercial_kind IN ('property', 'business', 'both'));
ALTER TABLE applicants ADD COLUMN commercial_use TEXT;
ALTER TABLE applicants ADD COLUMN area_min REAL CHECK (area_min IS NULL OR area_min > 0);
ALTER TABLE applicants ADD COLUMN area_max REAL CHECK (area_max IS NULL OR area_max > 0);
ALTER TABLE applicants ADD COLUMN area_unit TEXT CHECK (area_unit IS NULL OR area_unit IN ('sqm', 'sqft'));
ALTER TABLE applicants ADD COLUMN commercial_purchase REAL CHECK (commercial_purchase IS NULL OR commercial_purchase > 0);
ALTER TABLE applicants ADD COLUMN commercial_rent REAL CHECK (commercial_rent IS NULL OR commercial_rent > 0);
ALTER TABLE applicants ADD COLUMN commercial_rent_period TEXT CHECK (commercial_rent_period IS NULL OR commercial_rent_period IN ('month', 'year'));
ALTER TABLE applicants ADD COLUMN commercial_premium REAL CHECK (commercial_premium IS NULL OR commercial_premium >= 0);
ALTER TABLE applicants ADD COLUMN commercial_expenses REAL CHECK (commercial_expenses IS NULL OR commercial_expenses >= 0);
ALTER TABLE applicants ADD COLUMN household_total INTEGER CHECK (household_total IS NULL OR household_total >= 0);
ALTER TABLE applicants ADD COLUMN household_children_status TEXT CHECK (household_children_status IS NULL OR household_children_status IN ('known', 'unknown', 'not_applicable'));
ALTER TABLE applicants ADD COLUMN preferred_language TEXT;
ALTER TABLE applicants ADD COLUMN bedrooms_max INTEGER CHECK (bedrooms_max IS NULL OR bedrooms_max >= 0);
DROP INDEX applicants_active_operation;
CREATE UNIQUE INDEX applicants_active_category_operation ON applicants(contact_id, COALESCE(search_operation, operation), search_category)
  WHERE search_state = 'active' AND archived_at IS NULL;
