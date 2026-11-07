-- Existing properties keep the general negotiator schedule. Weekly windows use Europe/Jersey, Sunday = 0.
ALTER TABLE listings ADD COLUMN viewings_enabled INTEGER NOT NULL DEFAULT 1 CHECK (viewings_enabled IN (0, 1));
ALTER TABLE listings ADD COLUMN viewing_hours TEXT DEFAULT NULL CHECK (
  viewing_hours IS NULL OR (json_valid(viewing_hours) AND json_type(viewing_hours) = 'array'
    AND json_array_length(viewing_hours) BETWEEN 1 AND 21)
);
