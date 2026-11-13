CREATE TABLE search_metric_days (
  day TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  dimension TEXT NOT NULL CHECK(dimension IN ('total','zero_results','op','region','beds','max')),
  value TEXT NOT NULL,
  n INTEGER NOT NULL CHECK(n >= 0),
  PRIMARY KEY(day,version,dimension,value)
) WITHOUT ROWID;
CREATE TABLE search_metric_budget (
  day TEXT PRIMARY KEY,
  n INTEGER NOT NULL CHECK(n >= 0 AND n <= 5000),
  capped INTEGER NOT NULL CHECK((n < 5000 AND capped = 0) OR (n = 5000 AND capped = 1))
) WITHOUT ROWID;
