-- Proposed only: do not install or activate without review and authorization.
CREATE TABLE public_demand_snapshots (
 id TEXT PRIMARY KEY, created_by TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','approved','published','revoked')),
 schema_version INTEGER NOT NULL, as_of TEXT NOT NULL, valid_until TEXT NOT NULL,
 definition_version TEXT NOT NULL, operation TEXT NOT NULL CHECK(operation IN ('rent','buy')),
 private_payload TEXT, public_payload TEXT NOT NULL, public_sha256 TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, authorization_id TEXT, ledger_version INTEGER, ledger_hash TEXT,
 approved_by TEXT, approved_at TEXT, published_by TEXT, published_at TEXT
);
CREATE UNIQUE INDEX one_active_demand_draft_per_actor_operation ON public_demand_snapshots(created_by,operation) WHERE status IN ('draft','approved');
CREATE UNIQUE INDEX demand_applicant_contact_pair ON applicants(id,contact_id);
CREATE TABLE public_demand_contributions (
 snapshot_id TEXT NOT NULL REFERENCES public_demand_snapshots(id) ON DELETE CASCADE,
 contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
 search_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
 parish TEXT NOT NULL, bedroom_band TEXT NOT NULL,
 PRIMARY KEY(snapshot_id,contact_id,search_id,parish,bedroom_band),
 FOREIGN KEY(search_id,contact_id) REFERENCES applicants(id,contact_id) ON DELETE CASCADE
);
CREATE TRIGGER invalidate_demand_on_contact_delete BEFORE DELETE ON contacts BEGIN
 UPDATE public_demand_snapshots SET private_payload=NULL,
   status=CASE WHEN status IN ('draft','approved') THEN 'revoked' ELSE status END,
   version=CASE WHEN status IN ('draft','approved') THEN version+1 ELSE version END
 WHERE id IN (SELECT snapshot_id FROM public_demand_contributions WHERE contact_id=OLD.id);
 DELETE FROM public_demand_contributions WHERE snapshot_id IN
   (SELECT snapshot_id FROM public_demand_contributions WHERE contact_id=OLD.id);
END;
CREATE TRIGGER invalidate_demand_on_search_delete BEFORE DELETE ON applicants BEGIN
 UPDATE public_demand_snapshots SET private_payload=NULL,
   status=CASE WHEN status IN ('draft','approved') THEN 'revoked' ELSE status END,
   version=CASE WHEN status IN ('draft','approved') THEN version+1 ELSE version END
 WHERE id IN (SELECT snapshot_id FROM public_demand_contributions WHERE search_id=OLD.id);
 DELETE FROM public_demand_contributions WHERE snapshot_id IN
   (SELECT snapshot_id FROM public_demand_contributions WHERE search_id=OLD.id);
END;
CREATE TRIGGER purge_demand_contributions AFTER UPDATE OF private_payload ON public_demand_snapshots
 WHEN NEW.private_payload IS NULL AND OLD.private_payload IS NOT NULL BEGIN
 DELETE FROM public_demand_contributions WHERE snapshot_id=NEW.id;
END;
CREATE TABLE public_demand_page_reviews (
 snapshot_id TEXT NOT NULL REFERENCES public_demand_snapshots(id) ON DELETE CASCADE,
 version INTEGER NOT NULL, actor TEXT NOT NULL, page_start INTEGER NOT NULL CHECK(page_start IN (0,50)),
 reviewed_at TEXT NOT NULL, PRIMARY KEY(snapshot_id,version,actor,page_start)
);
CREATE TABLE demand_release_authorizations (
 id TEXT PRIMARY KEY, policy_version TEXT NOT NULL, public_sha256 TEXT NOT NULL, releases_sha256 TEXT NOT NULL,
 ledger_version INTEGER NOT NULL, identity_checked INTEGER NOT NULL CHECK(identity_checked=1),
 inference_review TEXT NOT NULL CHECK(inference_review='accepted'), source_ref TEXT NOT NULL,
 approved_by_ref TEXT NOT NULL, accepted_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT
);
CREATE TABLE public_demand_pointer (operation TEXT PRIMARY KEY CHECK(operation IN ('rent','buy')), current_snapshot_id TEXT NOT NULL, version INTEGER NOT NULL);
CREATE TABLE public_demand_releases (ledger_sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, public_sha256 TEXT NOT NULL,
 operation TEXT NOT NULL, published_at TEXT NOT NULL, public_payload TEXT NOT NULL);
CREATE TABLE public_demand_release_state (id INTEGER PRIMARY KEY CHECK(id=1), ledger_version INTEGER NOT NULL, releases_sha256 TEXT NOT NULL);
CREATE TABLE public_demand_assert (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO public_demand_release_state VALUES (1,0,'4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
