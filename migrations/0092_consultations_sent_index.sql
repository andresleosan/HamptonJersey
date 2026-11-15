-- ANA-06: Insights reads the enquiries sent in its period by this index, not by reading every enquiry. Additive only.
CREATE INDEX IF NOT EXISTS consultations_sent ON consultations(sent_at);
