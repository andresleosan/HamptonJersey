-- REG-08: no inferred priority or age for existing searches. Follows AGE-04 migration0030.
ALTER TABLE applicants ADD COLUMN requirement_priorities TEXT CHECK (requirement_priorities IS NULL OR
  (json_valid(requirement_priorities) AND json_type(requirement_priorities) = 'object'
   AND COALESCE(json_extract(requirement_priorities, '$.version') = 1 AND json_type(requirement_priorities, '$.values') = 'object', 0)));
ALTER TABLE applicants ADD COLUMN household_children_ages TEXT CHECK (household_children_ages IS NULL OR
  (json_valid(household_children_ages) AND json_type(household_children_ages) = 'array' AND json_array_length(household_children_ages) <= 20));
ALTER TABLE applicants ADD COLUMN household_ages_at TEXT;

ALTER TABLE matches ADD COLUMN requirements_rank INTEGER NOT NULL DEFAULT 1 CHECK (requirements_rank BETWEEN 0 AND 3);
