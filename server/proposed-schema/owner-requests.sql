-- PROPOSAL ONLY. Requires owner-requests-rebuild.sql, reviewed retention policy and separate activation.
-- No data or settings row are installed by this script.
CREATE TABLE owner_requests (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL,
 name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL, address TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('sale','rent')),
 valuation_requested INTEGER NOT NULL CHECK(valuation_requested IN (0,1)),
 privacy_version TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','closed')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX owner_requests_status ON owner_requests(status,created_at,id);
CREATE TABLE owner_request_receipts (
 request_id TEXT PRIMARY KEY, owner_request_id TEXT NOT NULL UNIQUE REFERENCES owner_requests(id),
 payload_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
-- Revalidate policy in the same statement, after external anti-spam verification.
CREATE TRIGGER owner_requests_policy BEFORE INSERT ON owner_requests BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_settings WHERE key='owner_enquiries'
   AND json_extract(value,'$.enabled')=1 AND json_extract(value,'$.privacy_version')=NEW.privacy_version
   AND length(json_extract(value,'$.privacy_version')) BETWEEN 1 AND 120)
 THEN RAISE(ABORT,'owner requests unavailable') END;
END;
CREATE TRIGGER owner_requests_created AFTER INSERT ON owner_requests BEGIN
 INSERT INTO owner_request_receipts(request_id,owner_request_id,payload_hash,created_at)
  VALUES(NEW.request_id,NEW.id,NEW.payload_hash,NEW.created_at);
 INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  VALUES(NEW.created_at,'public','owner_request',NEW.id,'owner.requested',
   json_object('operation',NEW.operation,'valuation_requested',NEW.valuation_requested));
 INSERT INTO notifications(event_id,category,title,action_required,created_at,task_key,target_kind,target_id)
  SELECT id,'task',CASE WHEN NEW.valuation_requested=1 THEN 'Contact property owner · valuation requested'
    ELSE 'Contact property owner' END,1,NEW.created_at,'owner-request:'||NEW.id,'owner_request',NEW.id
  FROM events WHERE entity_type='owner_request' AND entity_id=NEW.id AND type='owner.requested';
END;
