-- ADM-19: additive only. Read and written by server/tenancy-signatures.js, behind ADM19_SIGNATURE_READY.

-- The tenancy agreement is signed outside Hampton: no signing provider, no callback, no file. This keeps what a person
-- checked there, one record per tenancy saved by revision (compare-and-set): tenants, how many tenants sign (1-10);
-- signatures [{party 'landlord' | 'tenant_1'..'tenant_10' (a role, never a name), signed_on, evidence_ref (text: where
-- it is recorded, never a file, link or storage key), reviewed_at, reviewed_by (the server's clock and the session's
-- staff member)}] (max 11). contract_revision: the signed contract reference's revision (tenancy_signed_contracts, ADM-06)
-- the review was made against, 0 for none; once that reference moves on, this review is out of date.
CREATE TABLE tenancy_signature_evidence (
  tenancy_id INTEGER PRIMARY KEY REFERENCES tenancies(id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  tenants INTEGER NOT NULL CHECK (tenants BETWEEN 1 AND 10),
  signatures TEXT NOT NULL CHECK (json_valid(signatures) AND json_type(signatures) = 'array'
    AND json_array_length(signatures) BETWEEN 1 AND 11),
  contract_revision INTEGER NOT NULL CHECK (contract_revision >= 0),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
