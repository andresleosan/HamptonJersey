-- ADM-18 (ADM18_APPLICATION_READY; plan tp03-adm-18): a prospective tenant's rental application for one managed property,
-- created by staff for an applicant they pick and filled in by that applicant through a case-access link (ADM-12,
-- migration 0110, purpose rental_application). Additive: one new table and its indexes. answers holds the applicant's
-- employment, income, references and guarantor (C3): it is read only with ADM-18's per-case capability and never copied to
-- events, notifications or the applicant's record. A missing income stays null, never 0. The affordability result and the
-- policy version it used are kept with the human decision; accepting creates no tenancy. Rows are never deleted by the app.
CREATE TABLE rental_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rental_id INTEGER NOT NULL REFERENCES rentals(id),
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  rent INTEGER NOT NULL CHECK (rent > 0 AND rent <= 1000000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','accepted','declined','withdrawn')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  answers TEXT CHECK (answers IS NULL OR (json_valid(answers) AND length(answers) <= 12000)),
  submit_operation_id TEXT UNIQUE CHECK (submit_operation_id IS NULL OR length(submit_operation_id) = 36),
  submitted_at TEXT,
  affordability_status TEXT CHECK (affordability_status IS NULL
    OR affordability_status IN ('needs_human_review','within_policy','outside_policy')),
  policy_version TEXT CHECK (policy_version IS NULL OR length(policy_version) BETWEEN 1 AND 60),
  decision_reason TEXT CHECK (decision_reason IS NULL OR length(decision_reason) BETWEEN 1 AND 1000),
  decided_at TEXT, decided_by TEXT,
  created_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  CHECK (status IN ('draft','withdrawn') OR submitted_at IS NOT NULL),
  CHECK (status NOT IN ('accepted','declined','withdrawn') OR (decision_reason IS NOT NULL AND decided_at IS NOT NULL))
);
-- One open application per applicant and property.
CREATE UNIQUE INDEX rental_applications_open ON rental_applications(rental_id, applicant_id)
  WHERE status IN ('draft','submitted','under_review');
CREATE INDEX rental_applications_rental ON rental_applications(rental_id, created_at);
