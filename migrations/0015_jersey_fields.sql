-- J1: the Jersey facts the matching reads (spec §3), as closed lists; NULL = not known (for restriction, none).
-- The old free-text tenure stays as it was; only its three exact values are carried over.
ALTER TABLE listings ADD COLUMN tenure_type TEXT
  CHECK (tenure_type IS NULL OR tenure_type IN ('freehold','flying_freehold','share_transfer','leasehold'));
ALTER TABLE listings ADD COLUMN housing_category TEXT
  CHECK (housing_category IS NULL OR housing_category IN ('qualified','registered'));
ALTER TABLE listings ADD COLUMN restriction TEXT
  CHECK (restriction IS NULL OR restriction IN ('first_time_buyer','over_55'));
UPDATE listings SET tenure_type = CASE lower(trim(tenure))
  WHEN 'freehold' THEN 'freehold' WHEN 'flying freehold' THEN 'flying_freehold' WHEN 'share transfer' THEN 'share_transfer' END
  WHERE lower(trim(tenure)) IN ('freehold', 'flying freehold', 'share transfer');
