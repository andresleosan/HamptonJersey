-- Weekly wall-clock preferences in Europe/Jersey; NULL means not provided, not unavailable.
ALTER TABLE applicants ADD COLUMN viewing_availability TEXT CHECK (viewing_availability IS NULL OR json_valid(viewing_availability));
