-- BUS-06: private operational projection; no source or access permission is seeded.
CREATE TABLE market_directory_manifests (
  revision TEXT PRIMARY KEY CHECK(length(revision) BETWEEN 1 AND 160),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  accepted_at TEXT NOT NULL,
  reviewer_ref TEXT NOT NULL CHECK(length(reviewer_ref) BETWEEN 1 AND 160),
  status TEXT NOT NULL CHECK(status IN ('accepted','revoked'))
) WITHOUT ROWID;

CREATE TRIGGER market_manifest_immutable BEFORE UPDATE OF revision, sha256, accepted_at, reviewer_ref ON market_directory_manifests
BEGIN SELECT RAISE(ABORT, 'accepted manifest is immutable'); END;
CREATE TRIGGER market_manifest_revocation_final BEFORE UPDATE OF status ON market_directory_manifests
WHEN OLD.status='revoked' AND NEW.status<>'revoked'
BEGIN SELECT RAISE(ABORT, 'revoked manifest cannot be restored'); END;

CREATE TABLE market_sources (
  source_ref TEXT NOT NULL CHECK(length(source_ref) BETWEEN 1 AND 160),
  channel_id TEXT NOT NULL CHECK(length(channel_id) BETWEEN 1 AND 160),
  directory_revision TEXT REFERENCES market_directory_manifests(revision),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('internal','external')),
  source_class TEXT NOT NULL DEFAULT 'unclassified' CHECK(source_class IN ('internal','general','unclassified','homely','jfsc','places','properties')),
  access_status TEXT NOT NULL DEFAULT 'pending' CHECK(access_status IN ('pending','allowed','manual_only','denied','paused')),
  method TEXT CHECK(method IN ('internal','manual','http')),
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK(policy_version > 0),
  evidence_ref TEXT,
  reviewed_at TEXT,
  review_due_at TEXT,
  allowed_hosts TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(allowed_hosts) AND json_type(allowed_hosts)='array'),
  allowed_paths TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(allowed_paths) AND json_type(allowed_paths)='array'),
  allowed_redirect_hosts TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(allowed_redirect_hosts) AND json_type(allowed_redirect_hosts)='array'),
  retention_ref TEXT,
  coverage_evidence_ref TEXT,
  next_action TEXT,
  min_interval_s INTEGER NOT NULL DEFAULT 60 CHECK(min_interval_s >= 60),
  PRIMARY KEY(source_ref, channel_id),
  CHECK(source_kind='internal' OR directory_revision IS NOT NULL),
  CHECK((source_kind='internal' AND source_class='internal') OR (source_kind='external' AND source_class<>'internal')),
  CHECK(access_status NOT IN ('allowed','manual_only') OR source_class IN ('general','internal')),
  CHECK(access_status NOT IN ('allowed','manual_only') OR
    (method IS NOT NULL AND evidence_ref IS NOT NULL AND length(evidence_ref)>0 AND
     retention_ref IS NOT NULL AND length(retention_ref)>0 AND reviewed_at IS NOT NULL AND review_due_at IS NOT NULL)),
  CHECK(access_status <> 'manual_only' OR method='manual'),
  CHECK(source_kind <> 'external' OR method IS NOT 'internal'),
  CHECK(source_kind <> 'internal' OR method IS NULL OR method='internal')
) WITHOUT ROWID;

-- Every change to the operational projection invalidates already acquired leases.
CREATE TRIGGER market_source_versioned BEFORE UPDATE ON market_sources
WHEN NEW.policy_version <> OLD.policy_version + 1
BEGIN SELECT RAISE(ABORT, 'market source version required'); END;

-- A source/channel is shared by every run. Record acquisitions even when they fail.
CREATE TABLE market_source_activity (
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  lease_token TEXT,
  lease_until TEXT,
  last_acquired_at TEXT,
  PRIMARY KEY(source_ref,channel_id),
  FOREIGN KEY(source_ref,channel_id) REFERENCES market_sources(source_ref,channel_id),
  CHECK((lease_token IS NULL AND lease_until IS NULL) OR (lease_token IS NOT NULL AND lease_until IS NOT NULL))
) WITHOUT ROWID;
CREATE TRIGGER market_source_activity_created AFTER INSERT ON market_sources
BEGIN INSERT INTO market_source_activity(source_ref,channel_id) VALUES(NEW.source_ref,NEW.channel_id); END;

CREATE TABLE market_source_policy_history (
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  decision_version INTEGER NOT NULL CHECK(decision_version>1),
  operation_id TEXT NOT NULL UNIQUE,
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256)=64),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json) AND json_type(snapshot_json)='object'),
  actor TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  PRIMARY KEY(source_ref,channel_id,decision_version),
  FOREIGN KEY(source_ref,channel_id) REFERENCES market_sources(source_ref,channel_id)
) WITHOUT ROWID;
CREATE TRIGGER market_policy_history_no_update BEFORE UPDATE ON market_source_policy_history
BEGIN SELECT RAISE(ABORT, 'market policy history is immutable'); END;

CREATE TABLE market_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('own_pilot','initial','daily')),
  jersey_day TEXT,
  manifest_revision TEXT REFERENCES market_directory_manifests(revision),
  manifest_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paused','completed','partial','cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  operation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  CHECK((kind='own_pilot' AND manifest_revision IS NULL AND manifest_sha256 IS NULL) OR
        (kind IN ('initial','daily') AND manifest_revision IS NOT NULL AND manifest_sha256 IS NOT NULL)),
  CHECK((kind='daily' AND jersey_day IS NOT NULL AND length(jersey_day)=10 AND date(jersey_day,'+0 days') IS jersey_day)
        OR (kind<>'daily' AND jersey_day IS NULL))
) WITHOUT ROWID;
CREATE UNIQUE INDEX market_one_open_initial ON market_runs(kind) WHERE kind='initial' AND status IN ('open','paused');
CREATE UNIQUE INDEX market_one_daily ON market_runs(kind,jersey_day) WHERE kind='daily';
CREATE TRIGGER market_run_versioned BEFORE UPDATE ON market_runs
WHEN NEW.version <> OLD.version + 1
BEGIN SELECT RAISE(ABORT, 'market run version required'); END;

CREATE TABLE market_run_actions (
  operation_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES market_runs(id),
  action TEXT NOT NULL CHECK(action IN ('pause','resume')),
  expected_version INTEGER NOT NULL CHECK(expected_version>0),
  result_version INTEGER NOT NULL CHECK(result_version=expected_version+1),
  result_status TEXT NOT NULL CHECK(result_status IN ('open','paused')),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE market_source_runs (
  run_id TEXT NOT NULL REFERENCES market_runs(id),
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  paging_key TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))) UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','manual_pending','blocked','complete','failed')),
  cursor TEXT,
  page_no INTEGER NOT NULL DEFAULT 0 CHECK(page_no>=0),
  lease_token TEXT,
  lease_generation INTEGER NOT NULL DEFAULT 0 CHECK(lease_generation>=0),
  lease_until TEXT,
  next_due TEXT,
  last_capture_at TEXT,
  last_full_pass_at TEXT,
  policy_version INTEGER,
  run_version INTEGER,
  PRIMARY KEY(run_id, source_ref, channel_id),
  FOREIGN KEY(source_ref,channel_id) REFERENCES market_sources(source_ref,channel_id)
) WITHOUT ROWID;

CREATE TRIGGER market_channel_acquire_guard BEFORE UPDATE OF lease_token ON market_source_runs
WHEN NEW.status='running' AND NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM market_source_activity a JOIN market_sources s ON s.source_ref=a.source_ref AND s.channel_id=a.channel_id
    WHERE a.source_ref=NEW.source_ref AND a.channel_id=NEW.channel_id
      AND (a.lease_until IS NULL OR a.lease_until<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      AND (a.last_acquired_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ','now')>=
           strftime('%Y-%m-%dT%H:%M:%fZ',a.last_acquired_at,'+'||s.min_interval_s||' seconds'))
  ) THEN RAISE(ABORT, 'market channel rate limited') END;
END;
CREATE TRIGGER market_channel_acquired AFTER UPDATE OF lease_token ON market_source_runs
WHEN NEW.status='running' AND NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token
BEGIN
  UPDATE market_source_activity SET lease_token=NEW.lease_token,lease_until=NEW.lease_until,
    last_acquired_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE source_ref=NEW.source_ref AND channel_id=NEW.channel_id;
END;
CREATE TRIGGER market_channel_released AFTER UPDATE OF lease_token ON market_source_runs
WHEN NEW.lease_token IS NULL AND OLD.lease_token IS NOT NULL
BEGIN
  UPDATE market_source_activity SET lease_token=NULL,lease_until=NULL
  WHERE source_ref=NEW.source_ref AND channel_id=NEW.channel_id AND lease_token=OLD.lease_token;
END;

CREATE TRIGGER market_run_manifest_required BEFORE INSERT ON market_runs
BEGIN
  SELECT CASE WHEN NEW.kind IN ('initial','daily') AND NOT EXISTS (
    SELECT 1 FROM market_directory_manifests m JOIN market_sources s ON s.directory_revision=m.revision
    WHERE m.revision=NEW.manifest_revision AND m.sha256=NEW.manifest_sha256 AND m.status='accepted' AND s.source_kind='external'
  ) THEN RAISE(ABORT, 'accepted external directory required') END;
  SELECT CASE WHEN NEW.kind='own_pilot' AND NOT EXISTS (
    SELECT 1 FROM market_sources WHERE source_kind='internal'
  ) THEN RAISE(ABORT, 'internal source required') END;
END;

CREATE TRIGGER market_run_snapshot_sources AFTER INSERT ON market_runs
BEGIN
  INSERT INTO market_source_runs(run_id,source_ref,channel_id)
  SELECT NEW.id,source_ref,channel_id FROM market_sources
  WHERE (NEW.kind='own_pilot' AND source_kind='internal')
     OR (NEW.kind IN ('initial','daily') AND source_kind='external' AND directory_revision=NEW.manifest_revision);
END;

CREATE TABLE market_pages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  page_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
  previous_cursor TEXT,
  next_cursor TEXT,
  exhausted INTEGER NOT NULL CHECK(exhausted IN (0,1)),
  observed_at TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  committed_by TEXT NOT NULL,
  lease_token TEXT NOT NULL,
  lease_generation INTEGER NOT NULL,
  policy_version INTEGER NOT NULL,
  UNIQUE(run_id,source_ref,channel_id,page_key),
  FOREIGN KEY(run_id,source_ref,channel_id) REFERENCES market_source_runs(run_id,source_ref,channel_id)
) WITHOUT ROWID;

CREATE TABLE market_observations (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  page_id TEXT NOT NULL REFERENCES market_pages(id),
  source_ref TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  external_key TEXT NOT NULL,
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json) AND json_type(raw_json)='object'),
  normalized_json TEXT NOT NULL CHECK(json_valid(normalized_json) AND json_type(normalized_json)='object'),
  normalized_sha256 TEXT NOT NULL CHECK(length(normalized_sha256)=64),
  source_at TEXT NOT NULL,
  origin_sha256 TEXT NOT NULL CHECK(length(origin_sha256)=64),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  deleted_tombstone INTEGER NOT NULL DEFAULT 0 CHECK(deleted_tombstone IN (0,1)),
  UNIQUE(page_id,external_key),
  FOREIGN KEY(source_ref,channel_id) REFERENCES market_sources(source_ref,channel_id)
);
CREATE INDEX market_observation_history ON market_observations(source_ref,channel_id,external_key,sequence DESC);

CREATE TABLE market_change_outbox (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL REFERENCES market_observations(id),
  observation_version INTEGER NOT NULL CHECK(observation_version>0),
  kind TEXT NOT NULL CHECK(kind='observation_changed'),
  consumer_state TEXT NOT NULL DEFAULT 'pending' CHECK(consumer_state IN ('pending','consumed')),
  UNIQUE(observation_id,observation_version,kind)
) WITHOUT ROWID;

-- A failed precondition aborts the entire D1 batch, including the cursor and outbox.
CREATE TABLE market_commit_guard (
  id TEXT PRIMARY KEY,
  allowed INTEGER NOT NULL CHECK(allowed=1)
) WITHOUT ROWID;
