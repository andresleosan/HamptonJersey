-- G2 (E10): the retention pass and the panel's Expiring count read contacts by last activity, only the rows in range.
CREATE INDEX contacts_activity ON contacts(last_activity_at);
