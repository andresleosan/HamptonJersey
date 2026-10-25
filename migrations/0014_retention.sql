-- G2 (E10): the retention pass and the panel's Expiring count read contacts by last activity, only the rows in range.
CREATE INDEX contacts_activity ON contacts(last_activity_at);
-- E3: the exemption (a search with a sale, in any status) is checked per contact in that range; sales had only a partial
-- index on applicant_id.
CREATE INDEX sales_applicant ON sales(applicant_id);
