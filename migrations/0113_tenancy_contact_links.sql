-- PRE-12: tenancies carry no contact id, so a privacy request finds a person's tenancies, and the retention pass knows of
-- them, only once a team member confirms that the tenant of a tenancy is that contact (server/tenancy-contact-links.js).
-- A matching email or phone only proposes it. Read and written only with PRE12_TENANCY_LINK_READY=1.
-- Additive: one new table, its indexes and an append-only trigger; no existing row or table changes.

-- Each decision a person takes on one tenancy and one contact: linked (1) or taken back (0), by whom and when, with the
-- SHA-256 of the tenant's name, email and phone as read then: if they change, the link needs confirming again. The
-- latest row per tenancy and contact is the one that counts. Ids only: never the person's details. contact_id carries no
-- foreign key, so deleting a contact the usual ways is never blocked; tenancies are never deleted (R19). Append-only.
CREATE TABLE tenancy_contact_links (
  id INTEGER PRIMARY KEY,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id),
  contact_id INTEGER NOT NULL,
  linked INTEGER NOT NULL CHECK (linked IN (0, 1)),
  tenant_revision TEXT NOT NULL CHECK (length(tenant_revision) = 64),
  actor TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX tenancy_contact_links_contact ON tenancy_contact_links (contact_id, tenancy_id, id);
CREATE INDEX tenancy_contact_links_tenancy ON tenancy_contact_links (tenancy_id, contact_id, id);
CREATE TRIGGER tenancy_contact_links_append_only BEFORE UPDATE ON tenancy_contact_links
BEGIN SELECT RAISE(ABORT, 'tenancy contact links are append-only'); END;
