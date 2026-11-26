-- Keep claims after a draft is deleted, so replaying the source cannot recreate it.
CREATE TABLE listing_csv_import_keys (
  kind TEXT NOT NULL CHECK (kind IN ('url','address')),
  identity TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  PRIMARY KEY(kind,identity)
) WITHOUT ROWID;
