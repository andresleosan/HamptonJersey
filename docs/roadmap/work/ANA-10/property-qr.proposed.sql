-- ANA-10 proposal for local synthetic tests only. No migration ordinal is reserved.
-- A deployed writer must first enforce the complete public eligibility and authorization contract.
CREATE TABLE property_qr_retired_codes (
  code TEXT NOT NULL PRIMARY KEY CHECK(length(code)=22 AND code NOT GLOB '*[^A-Za-z0-9_-]*'
    AND substr(code,22,1) IN ('A','Q','g','w'))
) WITHOUT ROWID;

CREATE TABLE property_qr_codes (
  id INTEGER PRIMARY KEY CHECK(id BETWEEN 1 AND 9007199254740991),
  listing_id TEXT NOT NULL UNIQUE REFERENCES listings(id) ON DELETE CASCADE
    CHECK(length(listing_id) BETWEEN 7 AND 160 AND substr(listing_id,1,3)='HE-'
      AND substr(listing_id,4,1) GLOB '[A-Z]' AND substr(listing_id,5) NOT GLOB '*[^0-9]*'),
  code TEXT NOT NULL UNIQUE CHECK(length(code)=22 AND code NOT GLOB '*[^A-Za-z0-9_-]*'
    AND substr(code,22,1) IN ('A','Q','g','w')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE TRIGGER property_qr_code_not_retired BEFORE INSERT ON property_qr_codes
WHEN EXISTS(SELECT 1 FROM property_qr_retired_codes WHERE code=NEW.code)
BEGIN SELECT RAISE(ABORT,'Retired QR code'); END;
-- REPLACE can otherwise silently delete an association and its counts before inserting another.
CREATE TRIGGER property_qr_code_no_replacement BEFORE INSERT ON property_qr_codes
WHEN EXISTS(SELECT 1 FROM property_qr_codes WHERE id=NEW.id OR listing_id=NEW.listing_id OR code=NEW.code)
BEGIN SELECT RAISE(ABORT,'QR association already exists'); END;
CREATE TRIGGER property_qr_code_immutable BEFORE UPDATE ON property_qr_codes
BEGIN SELECT RAISE(ABORT,'QR association is immutable'); END;
CREATE TRIGGER property_qr_code_retire AFTER DELETE ON property_qr_codes
BEGIN INSERT INTO property_qr_retired_codes(code) VALUES(OLD.code); END;

CREATE TABLE property_qr_budget (
  day TEXT NOT NULL PRIMARY KEY CHECK(length(day)=10 AND day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(day,'+0 days') IS day),
  n INTEGER NOT NULL CHECK(typeof(n)='integer' AND n BETWEEN 1 AND 5000),
  capped INTEGER NOT NULL CHECK(typeof(capped)='integer' AND capped IN (0,1)
    AND ((n<5000 AND capped=0) OR (n=5000 AND capped=1)))
) WITHOUT ROWID;

CREATE TABLE property_qr_redirect_days (
  day TEXT NOT NULL CHECK(length(day)=10 AND day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(day,'+0 days') IS day),
  qr_id INTEGER NOT NULL REFERENCES property_qr_codes(id) ON DELETE CASCADE,
  redirects INTEGER NOT NULL CHECK(typeof(redirects)='integer' AND redirects BETWEEN 1 AND 5000),
  PRIMARY KEY(day,qr_id)
) WITHOUT ROWID;
CREATE INDEX property_qr_redirects_by_code ON property_qr_redirect_days(qr_id,day);
