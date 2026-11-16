-- PRE-10 (art. 36): the current marketing answer of a contact for one purpose on one channel. Its history is in events
-- (contact.marketing_preference). News by email keeps contacts.marketing_opt_in_at as its consent; a row here can only
-- add a later objection to it. Every other purpose or channel is allowed only by a row 'granted', which comes from a
-- versioned web notice. Read and written only with PRE10_PURPOSE_READY. Erasing the contact erases its rows.
CREATE TABLE marketing_preferences (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('news','property_alerts','valuation_offer')),
  channel TEXT NOT NULL CHECK (channel IN ('email','phone','sms')),
  value TEXT NOT NULL CHECK (value IN ('granted','objected')),
  source TEXT NOT NULL CHECK (source IN ('web','phone','email','in_person','letter')),
  notice_version TEXT CHECK (notice_version IS NULL OR length(notice_version) BETWEEN 1 AND 40),
  evidence_ref TEXT CHECK (evidence_ref IS NULL OR length(evidence_ref) BETWEEN 1 AND 64),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (contact_id, purpose, channel),
  -- No import, panel click or default turns a preference into consent: only the web form, with its notice version.
  CHECK (value <> 'granted' OR (source = 'web' AND notice_version IS NOT NULL))
);
