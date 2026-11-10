-- Synthetic QA data for an ISOLATED QA_DB only. Never run against business DB.
CREATE TABLE qa_history_guard(id INTEGER PRIMARY KEY CHECK(id=1),marker TEXT NOT NULL);
INSERT INTO qa_history_guard(id,marker) VALUES(1,'hampton-qa-history-v1');
INSERT INTO listings(id,use,title,operation,availability,published,specs,created_at,updated_at,updated_by)
VALUES('HE-Q999','residential','Fictional QA property','sale','for_sale',0,'[]',
'2026-11-10T09:00:00.000Z','2026-11-10T09:00:00.000Z','system');
INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at)
VALUES(1,'Synthetic person','nobody@example.test','2026-11-10T09:00:00.000Z',
'2026-11-10T09:00:00.000Z','2026-11-10T09:00:00.000Z');
INSERT INTO applicants(id,contact_id,operation,source,stage,created_at,updated_at)
VALUES(1,1,'buy','email','new','2026-11-10T09:00:00.000Z','2026-11-10T09:00:00.000Z');
INSERT INTO viewing_requests(id,listing_id,kind,date,time,name,email,status,created_at)
VALUES(1,'HE-Q999','In person','2026-11-12','11:00','Synthetic visitor','visitor@example.test',
'requested','2026-11-10T09:01:00.000Z');
INSERT INTO offers(id,listing_id,applicant_id,amount,status,created_at,updated_at)
VALUES(1,'HE-Q999',1,1,'accepted','2026-11-10T09:02:00.000Z','2026-11-10T09:02:00.000Z');
INSERT INTO sales(id,listing_id,applicant_id,offer_id,price,created_at,updated_at)
VALUES(1,'HE-Q999',1,1,1,'2026-11-10T09:03:00.000Z','2026-11-10T09:03:00.000Z');
INSERT INTO events(at,actor,entity_type,entity_id,type,data)
VALUES('2026-11-10T09:00:00.000Z','system','listing','HE-Q999','listing.created','{"fields":[]}');
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<55)
INSERT INTO events(at,actor,entity_type,entity_id,type,data)
SELECT printf('2026-11-10T09:%02d:00.000Z',i%60),'system','listing','HE-Q999',
'listing.updated','{"fields":[]}' FROM n;
INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES
('2026-11-10T11:01:00.000Z','system','applicant','1','match.reviewed',
 '{"listing_id":"HE-Q999","from":"found","to":"shortlisted"}'),
('2026-11-10T11:02:00.000Z','system','viewing','1','viewing.requested',
 '{"listing_id":"HE-Q999"}'),
('2026-11-10T11:03:00.000Z','system','applicant','1','offer.recorded',
 '{"listing_id":"HE-Q999","offer_id":1}'),
('2026-11-10T11:04:00.000Z','system','applicant','1','sale.milestone',
 '{"listing_id":"HE-Q999","sale_id":1,"key":"passing","after":{"planned_on":"2026-11-12"}}');
