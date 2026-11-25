-- OFE-02 (OFE02_SEND_READY): the email that takes a buyer's open offer to the seller, one per offer. The seller is an
-- advertiser of the listing (kind individual or entity, the listing in details.listing_ids) and one of its contacts,
-- kept by reference (contact_key, as AGE-05's enquiries). Each change is a new revision; a team member approves one
-- revision, and only that one is queued in outbound (template 'offer_to_seller'). amount and offer_updated_at are the
-- offer as it was read: any later change to it (amount, conditions, counter, status) means the approval no longer
-- holds. Additive: one new table, no existing row changes.
CREATE TABLE IF NOT EXISTS offer_emails (
  offer_id INTEGER PRIMARY KEY REFERENCES offers(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  advertiser_id INTEGER NOT NULL,
  contact_key TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  amount INTEGER NOT NULL,
  offer_updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','sent','needs_review')),
  approved_revision INTEGER,
  approved_by TEXT,
  approved_at TEXT,
  email_ref TEXT UNIQUE,
  sent_at TEXT,
  prepared_by TEXT NOT NULL,
  prepared_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS offer_emails_queued ON offer_emails(status) WHERE status = 'queued';
