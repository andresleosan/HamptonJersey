-- ADM-20: what decides whether the 2025 tenancy rules cover a tenancy, read only when ADM20_TENANCY_LAW_READY is '1'.
-- agreement_on: the date the agreement was made (NULL: not recorded). law_scope: whether the accommodation falls
-- within the tenancy law, 'unknown' until someone records it; unknown is neither yes nor no.
-- Additive: two new columns. No existing row is rewritten: the recorded law label (regime), the charges and the
-- payments of every tenancy stay exactly as they are.
ALTER TABLE tenancies ADD COLUMN agreement_on TEXT
  CHECK (agreement_on IS NULL OR (length(agreement_on) = 10 AND date(agreement_on, '+0 days') IS agreement_on));
ALTER TABLE tenancies ADD COLUMN law_scope TEXT NOT NULL DEFAULT 'unknown' CHECK (law_scope IN ('yes', 'no', 'unknown'));
