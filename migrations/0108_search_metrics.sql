-- ANA-04: daily aggregate counts of website search filters (docs/superpowers/plans/2026-11-10-tanda7-ana-04-filtros.md),
-- from docs/roadmap/work/ANA-04/proposed-search-metrics.sql. Read and written only with ANA04_SEARCH_STATS_READY.
-- One row per Jersey day, version, filter and closed value: no visitor, request, combination of filters or free text.
-- The budget row caps accepted search actions at 5,000 a Jersey day. Retention: today plus the previous 90 days.
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
