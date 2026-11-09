-- EST-17: D1 runs this schema rebuild in one migration transaction.

-- Keep foreign keys enabled. Preserve cascade/set-null children explicitly.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE est17_integrity_guard(n INTEGER NOT NULL CHECK(n=0));

INSERT INTO est17_integrity_guard SELECT count(*) FROM pragma_foreign_key_check;

INSERT INTO est17_integrity_guard SELECT count(*) FROM listing_event_context;

CREATE TABLE est17_listing_backup AS SELECT * FROM listings;

CREATE TABLE est17_media_backup AS SELECT * FROM media;

CREATE TABLE est17_matches_backup AS SELECT * FROM matches;

CREATE TABLE est17_daily_stats_backup AS SELECT * FROM daily_stats;

CREATE TABLE est17_offers_backup AS SELECT * FROM offers;

CREATE TABLE est17_jobs_backup AS SELECT * FROM jobs;

CREATE TABLE est17_viewing_requests_backup AS SELECT * FROM viewing_requests;

CREATE TABLE est17_drive_imports_backup AS SELECT * FROM drive_imports;

CREATE TABLE est17_chats_backup AS SELECT * FROM chats;

DROP TRIGGER listing_event_insert;

DROP TRIGGER listing_event_update;

DROP TRIGGER listing_event_delete;

DROP TRIGGER notification_listing_deleted;

DROP TRIGGER notification_offer_deleted;

DROP TABLE listings;

CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  use TEXT NOT NULL CHECK (use IN ('residential','commercial')),
  title TEXT NOT NULL,
  property_type TEXT,
  operation TEXT NOT NULL CHECK (operation IN ('sale','rent','business')),
  availability TEXT NOT NULL CHECK (availability IN ('for_sale','under_offer','sold','to_let','lease','not_stated','withdrawn','let_agreed','let')),
  country TEXT, location TEXT, road_name TEXT,
  bedrooms INTEGER CHECK (bedrooms IS NULL OR bedrooms >= 0),
  bathrooms INTEGER CHECK (bathrooms IS NULL OR bathrooms >= 0),
  tenure TEXT,
  sale_price REAL CHECK (sale_price IS NULL OR sale_price > 0),
  rent REAL CHECK (rent IS NULL OR rent > 0),
  rent_period TEXT CHECK (rent_period IS NULL OR rent_period IN ('month','year')),
  premium REAL CHECK (premium IS NULL OR premium > 0),
  currency TEXT CHECK (currency IS NULL OR currency IN ('GBP','EUR')),
  price_text TEXT, summary TEXT, description TEXT, tour_url TEXT,
  specs TEXT NOT NULL DEFAULT '[]',
  cover_media_id TEXT,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  archived_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT
, featured_rank INTEGER CHECK (featured_rank IS NULL OR featured_rank BETWEEN 1 AND 99), home_order INTEGER CHECK (home_order IS NULL OR home_order >= 1), parish TEXT CHECK (parish IS NULL OR parish IN ('Grouville','St Brelade','St Clement',
  'St Helier','St John','St Lawrence','St Martin','St Mary','St Ouen','St Peter','St Saviour','Trinity')), matchable INTEGER NOT NULL DEFAULT 0 CHECK (matchable IN (0,1)), feat_pets TEXT CHECK (feat_pets IS NULL OR feat_pets IN ('yes','no')), feat_parking INTEGER CHECK (feat_parking IS NULL OR feat_parking >= 0), feat_furnished TEXT CHECK (feat_furnished IS NULL OR feat_furnished IN ('yes','no')), feat_outdoor TEXT, feat_type TEXT CHECK (feat_type IS NULL OR feat_type IN ('flat','house','cottage','studio')), feat_evidence TEXT, features_at TEXT, tenure_type TEXT
  CHECK (tenure_type IS NULL OR tenure_type IN ('freehold','flying_freehold','share_transfer','leasehold')), housing_category TEXT
  CHECK (housing_category IS NULL OR housing_category IN ('qualified','registered')), restriction TEXT
  CHECK (restriction IS NULL OR restriction IN ('first_time_buyer','over_55')), confirmed_at TEXT, drive_folder_id TEXT, published_at TEXT, viewings_enabled INTEGER NOT NULL DEFAULT 1 CHECK (viewings_enabled IN (0, 1)), viewing_hours TEXT DEFAULT NULL CHECK (
  viewing_hours IS NULL OR (json_valid(viewing_hours) AND json_type(viewing_hours) = 'array'
    AND json_array_length(viewing_hours) BETWEEN 1 AND 21)
), review_requested_at TEXT, review_requested_by TEXT, CHECK ((review_requested_at IS NULL) = (review_requested_by IS NULL)), CHECK (review_requested_at IS NULL OR (published=0 AND archived_at IS NULL)));

INSERT INTO listings (id,use,title,property_type,operation,availability,country,location,road_name,bedrooms,bathrooms,tenure,sale_price,rent,rent_period,premium,currency,price_text,summary,description,tour_url,specs,cover_media_id,published,archived_at,created_at,updated_at,updated_by,featured_rank,home_order,parish,matchable,feat_pets,feat_parking,feat_furnished,feat_outdoor,feat_type,feat_evidence,features_at,tenure_type,housing_category,restriction,confirmed_at,drive_folder_id,published_at,viewings_enabled,viewing_hours) SELECT id,use,title,property_type,operation,availability,country,location,road_name,bedrooms,bathrooms,tenure,sale_price,rent,rent_period,premium,currency,price_text,summary,description,tour_url,specs,cover_media_id,published,archived_at,created_at,updated_at,updated_by,featured_rank,home_order,parish,matchable,feat_pets,feat_parking,feat_furnished,feat_outdoor,feat_type,feat_evidence,features_at,tenure_type,housing_category,restriction,confirmed_at,drive_folder_id,published_at,viewings_enabled,viewing_hours FROM est17_listing_backup;

INSERT INTO media SELECT * FROM est17_media_backup;

INSERT INTO matches SELECT * FROM est17_matches_backup;

INSERT INTO daily_stats SELECT * FROM est17_daily_stats_backup;

INSERT INTO offers SELECT * FROM est17_offers_backup;

INSERT INTO jobs SELECT * FROM est17_jobs_backup;

UPDATE viewing_requests SET listing_id=(SELECT b.listing_id FROM est17_viewing_requests_backup b WHERE b.id=viewing_requests.id);

UPDATE drive_imports SET listing_id=(SELECT b.listing_id FROM est17_drive_imports_backup b WHERE b.id=drive_imports.id);

UPDATE chats SET listing_id=(SELECT b.listing_id FROM est17_chats_backup b WHERE b.id=chats.id);

DROP TABLE listing_event_context;

CREATE TABLE listing_event_context (
  listing_id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('panel','queue','sales','media','recalculate')),
  action TEXT NOT NULL CHECK(action IN ('review_requested','review_returned','created','updated','published','unpublished','archived','restored','confirmed','availability_changed','featured_changed','cover_changed','recalculated','deleted')),
  at TEXT NOT NULL,
  derived_fields TEXT NOT NULL,
  related TEXT NOT NULL,
  previous_revision INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX listings_live ON listings(availability, operation, confirmed_at) WHERE published = 1 AND archived_at IS NULL;

CREATE INDEX listings_drive_folder ON listings(drive_folder_id) WHERE drive_folder_id IS NOT NULL;

CREATE TRIGGER listing_event_insert AFTER INSERT ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=NEW.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,'listing',NEW.id,'listing.created',json_object(
    'revision',(SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0)+1
      FROM events WHERE entity_type='listing' AND entity_id=NEW.id),
    'source',c.source,
    'fields',json(json_array('review_requested_at','review_requested_by','published','archived_at','availability','published_at','confirmed_at','use','operation','sale_price','rent','rent_period','premium','currency','parish','tenure_type','housing_category','restriction','bedrooms','bathrooms','matchable','viewings_enabled','viewing_hours','featured_rank','cover_media_id','feat_pets','feat_parking','feat_furnished','feat_outdoor','feat_type','title','property_type','country','location','road_name','tenure','price_text','summary','description','tour_url','specs','feat_evidence')),
    'before',json(json('{}')),
    'after',json(json_object(
      'review_requested_at', NEW.review_requested_at,
      'review_requested_by', NEW.review_requested_by,
      'published', NEW.published,
      'archived_at', NEW.archived_at,
      'availability', NEW.availability,
      'published_at', NEW.published_at,
      'confirmed_at', NEW.confirmed_at,
      'use', NEW.use,
      'operation', NEW.operation,
      'sale_price', NEW.sale_price,
      'rent', NEW.rent,
      'rent_period', NEW.rent_period,
      'premium', NEW.premium,
      'currency', NEW.currency,
      'parish', NEW.parish,
      'tenure_type', NEW.tenure_type,
      'housing_category', NEW.housing_category,
      'restriction', NEW.restriction,
      'bedrooms', NEW.bedrooms,
      'bathrooms', NEW.bathrooms,
      'matchable', NEW.matchable,
      'viewings_enabled', NEW.viewings_enabled,
      'viewing_hours', json(COALESCE(NEW.viewing_hours,'null')),
      'featured_rank', NEW.featured_rank,
      'cover_media_id', NEW.cover_media_id,
      'feat_pets', NEW.feat_pets,
      'feat_parking', NEW.feat_parking,
      'feat_furnished', NEW.feat_furnished,
      'feat_outdoor', json(COALESCE(NEW.feat_outdoor,'null')),
      'feat_type', NEW.feat_type)),
    'derived_fields',json(json(c.derived_fields)),
    'related',json(c.related))
  FROM listing_event_context c
  WHERE c.listing_id=NEW.id;
END;

CREATE TRIGGER listing_event_update AFTER UPDATE ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=NEW.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,'listing',NEW.id,'listing.' || CASE WHEN c.action='published' AND OLD.published=1 THEN 'confirmed' ELSE c.action END,json_object(
    'revision',(SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0)+1
      FROM events WHERE entity_type='listing' AND entity_id=NEW.id),
    'source',c.source,
    'fields',json((SELECT json_group_array(key) FROM json_each(d.changed) WHERE value=1)),
    'before',json((SELECT json_group_object(key, CASE WHEN type IN ('array','object') THEN json(value) ELSE value END)
      FROM json_each(d.before_values) WHERE key IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    'after',json((SELECT json_group_object(key, CASE WHEN type IN ('array','object') THEN json(value) ELSE value END)
      FROM json_each(d.after_values) WHERE key IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    'derived_fields',json((SELECT json_group_array(value) FROM json_each(c.derived_fields)
      WHERE value IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    'related',json(c.related))
  FROM listing_event_context c, (SELECT
    json_object(
      'review_requested_at', OLD.review_requested_at,
      'review_requested_by', OLD.review_requested_by,
      'published', OLD.published,
      'archived_at', OLD.archived_at,
      'availability', OLD.availability,
      'published_at', OLD.published_at,
      'confirmed_at', OLD.confirmed_at,
      'use', OLD.use,
      'operation', OLD.operation,
      'sale_price', OLD.sale_price,
      'rent', OLD.rent,
      'rent_period', OLD.rent_period,
      'premium', OLD.premium,
      'currency', OLD.currency,
      'parish', OLD.parish,
      'tenure_type', OLD.tenure_type,
      'housing_category', OLD.housing_category,
      'restriction', OLD.restriction,
      'bedrooms', OLD.bedrooms,
      'bathrooms', OLD.bathrooms,
      'matchable', OLD.matchable,
      'viewings_enabled', OLD.viewings_enabled,
      'viewing_hours', json(COALESCE(OLD.viewing_hours,'null')),
      'featured_rank', OLD.featured_rank,
      'cover_media_id', OLD.cover_media_id,
      'feat_pets', OLD.feat_pets,
      'feat_parking', OLD.feat_parking,
      'feat_furnished', OLD.feat_furnished,
      'feat_outdoor', json(COALESCE(OLD.feat_outdoor,'null')),
      'feat_type', OLD.feat_type) AS before_values,
    json_object(
      'review_requested_at', NEW.review_requested_at,
      'review_requested_by', NEW.review_requested_by,
      'published', NEW.published,
      'archived_at', NEW.archived_at,
      'availability', NEW.availability,
      'published_at', NEW.published_at,
      'confirmed_at', NEW.confirmed_at,
      'use', NEW.use,
      'operation', NEW.operation,
      'sale_price', NEW.sale_price,
      'rent', NEW.rent,
      'rent_period', NEW.rent_period,
      'premium', NEW.premium,
      'currency', NEW.currency,
      'parish', NEW.parish,
      'tenure_type', NEW.tenure_type,
      'housing_category', NEW.housing_category,
      'restriction', NEW.restriction,
      'bedrooms', NEW.bedrooms,
      'bathrooms', NEW.bathrooms,
      'matchable', NEW.matchable,
      'viewings_enabled', NEW.viewings_enabled,
      'viewing_hours', json(COALESCE(NEW.viewing_hours,'null')),
      'featured_rank', NEW.featured_rank,
      'cover_media_id', NEW.cover_media_id,
      'feat_pets', NEW.feat_pets,
      'feat_parking', NEW.feat_parking,
      'feat_furnished', NEW.feat_furnished,
      'feat_outdoor', json(COALESCE(NEW.feat_outdoor,'null')),
      'feat_type', NEW.feat_type) AS after_values,
    json_object(
      'review_requested_at', NEW.review_requested_at IS NOT OLD.review_requested_at,
      'review_requested_by', NEW.review_requested_by IS NOT OLD.review_requested_by,
      'published', NEW.published IS NOT OLD.published,
      'archived_at', NEW.archived_at IS NOT OLD.archived_at,
      'availability', NEW.availability IS NOT OLD.availability,
      'published_at', NEW.published_at IS NOT OLD.published_at,
      'confirmed_at', NEW.confirmed_at IS NOT OLD.confirmed_at,
      'use', NEW.use IS NOT OLD.use,
      'operation', NEW.operation IS NOT OLD.operation,
      'sale_price', NEW.sale_price IS NOT OLD.sale_price,
      'rent', NEW.rent IS NOT OLD.rent,
      'rent_period', NEW.rent_period IS NOT OLD.rent_period,
      'premium', NEW.premium IS NOT OLD.premium,
      'currency', NEW.currency IS NOT OLD.currency,
      'parish', NEW.parish IS NOT OLD.parish,
      'tenure_type', NEW.tenure_type IS NOT OLD.tenure_type,
      'housing_category', NEW.housing_category IS NOT OLD.housing_category,
      'restriction', NEW.restriction IS NOT OLD.restriction,
      'bedrooms', NEW.bedrooms IS NOT OLD.bedrooms,
      'bathrooms', NEW.bathrooms IS NOT OLD.bathrooms,
      'matchable', NEW.matchable IS NOT OLD.matchable,
      'viewings_enabled', NEW.viewings_enabled IS NOT OLD.viewings_enabled,
      'viewing_hours', NEW.viewing_hours IS NOT OLD.viewing_hours,
      'featured_rank', NEW.featured_rank IS NOT OLD.featured_rank,
      'cover_media_id', NEW.cover_media_id IS NOT OLD.cover_media_id,
      'feat_pets', NEW.feat_pets IS NOT OLD.feat_pets,
      'feat_parking', NEW.feat_parking IS NOT OLD.feat_parking,
      'feat_furnished', NEW.feat_furnished IS NOT OLD.feat_furnished,
      'feat_outdoor', NEW.feat_outdoor IS NOT OLD.feat_outdoor,
      'feat_type', NEW.feat_type IS NOT OLD.feat_type,
      'title', NEW.title IS NOT OLD.title,
      'property_type', NEW.property_type IS NOT OLD.property_type,
      'country', NEW.country IS NOT OLD.country,
      'location', NEW.location IS NOT OLD.location,
      'road_name', NEW.road_name IS NOT OLD.road_name,
      'tenure', NEW.tenure IS NOT OLD.tenure,
      'price_text', NEW.price_text IS NOT OLD.price_text,
      'summary', NEW.summary IS NOT OLD.summary,
      'description', NEW.description IS NOT OLD.description,
      'tour_url', NEW.tour_url IS NOT OLD.tour_url,
      'specs', NEW.specs IS NOT OLD.specs,
      'feat_evidence', NEW.feat_evidence IS NOT OLD.feat_evidence) AS changed) d
  WHERE c.listing_id=NEW.id
    AND (EXISTS(SELECT 1 FROM json_each(d.changed) WHERE value=1) OR c.action IN ('confirmed','published'));
END;

CREATE TRIGGER listing_event_delete AFTER DELETE ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=OLD.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,'listing',OLD.id,'listing.deleted',json_object(
    'revision',(SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0)+1
      FROM events WHERE entity_type='listing' AND entity_id=OLD.id),
    'source',c.source,
    'fields',json(json('[]')),
    'before',json(json('{}')),
    'after',json(json('{}')),
    'derived_fields',json(json('[]')),
    'related',json(c.related))
  FROM listing_event_context c
  WHERE c.listing_id=OLD.id;
END;

CREATE TRIGGER notification_listing_deleted AFTER DELETE ON listings BEGIN
  DELETE FROM notification_observations WHERE target_kind='listing' AND target_id=OLD.id;
  UPDATE notifications SET title='Deleted property',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='listing' AND target_id=OLD.id) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type='listing' AND entity_id=OLD.id));
END;

CREATE TRIGGER notification_offer_deleted AFTER DELETE ON offers BEGIN
  DELETE FROM notification_observations WHERE target_kind='offer' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted offer',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='offer' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TABLE listing_marketing_evidence (
 -- These are immutable historical identities, like events.entity_id, not live deletion barriers.
 listing_id TEXT NOT NULL,
 event_id INTEGER NOT NULL REFERENCES events(id),
 evidence_ref TEXT NOT NULL,
 media_id TEXT,
 source_id TEXT,
 action TEXT NOT NULL CHECK(action IN ('let_agreed','let','return_to_market')),
 reason_code TEXT NOT NULL CHECK(reason_code IN ('agreement','completed','fell_through','correction')),
 occurred_at TEXT NOT NULL,
 evidence_snapshot TEXT NOT NULL CHECK(json_valid(evidence_snapshot)),
 CHECK ((media_id IS NULL) <> (source_id IS NULL)),
 PRIMARY KEY(event_id,evidence_ref)
) WITHOUT ROWID;

CREATE INDEX listing_marketing_listing ON listing_marketing_evidence(listing_id,event_id);

DROP VIEW notification_event_projection;

CREATE VIEW notification_event_projection AS
SELECT e.id,e.at,e.actor,
  CASE WHEN e.entity_type='applicant' AND e.type LIKE 'offer.%' THEN 'offer'
    WHEN e.entity_type='applicant' AND e.type LIKE 'sale.%' THEN 'sale' ELSE e.entity_type END AS target_kind,
  CASE WHEN e.entity_type='applicant' AND e.type LIKE 'offer.%' THEN CAST(json_extract(e.data,'$.offer_id') AS TEXT)
    WHEN e.entity_type='applicant' AND e.type LIKE 'sale.%' THEN CAST(json_extract(e.data,'$.sale_id') AS TEXT) ELSE e.entity_id END AS target_id,
  CASE WHEN e.entity_type='applicant' AND e.type='sale.milestone' THEN json_object('milestone',json_extract(e.data,'$.key'))
    WHEN e.entity_type='rental' THEN json_patch('{}',json_object(
    'tenancy_id',json_extract(e.data,'$.tenancy_id'),'repair_id',json_extract(e.data,'$.repair_id'),
    'compliance_kind',json_extract(e.data,'$.compliance_kind'))) END AS target_context,
  CASE WHEN e.entity_type='viewing' THEN 'viewing' ELSE 'task' END AS category,
  CASE e.type
    WHEN 'viewing.booked' THEN 'Viewing booked' WHEN 'viewing.confirmed' THEN 'Viewing confirmed'
    WHEN 'viewing.rescheduled' THEN 'Viewing rescheduled' WHEN 'viewing.cancelled' THEN 'Viewing cancelled'
    WHEN 'viewing.completed' THEN 'Viewing completed' WHEN 'viewing.no_show' THEN 'Viewing missed'
    WHEN 'offer.recorded' THEN 'Offer recorded' WHEN 'offer.updated' THEN 'Offer updated'
    WHEN 'offer.countered' THEN 'Offer countered' WHEN 'offer.rejected' THEN 'Offer rejected'
    WHEN 'offer.withdrawn' THEN 'Offer withdrawn' WHEN 'offer.accepted' THEN 'Offer accepted'
    WHEN 'sale.updated' THEN 'Sale updated' WHEN 'sale.milestone' THEN 'Sale milestone updated'
    WHEN 'sale.completed' THEN 'Sale completed' WHEN 'sale.fallen_through' THEN 'Sale fell through'
    WHEN 'listing.review_requested' THEN 'Property ready for review' WHEN 'listing.review_returned' THEN 'Property returned to draft' WHEN 'listing.created' THEN 'Property created' WHEN 'listing.updated' THEN 'Property updated'
    WHEN 'listing.published' THEN 'Property published' WHEN 'listing.unpublished' THEN 'Property unpublished'
    WHEN 'listing.archived' THEN 'Property archived' WHEN 'listing.restored' THEN 'Property restored'
    WHEN 'listing.confirmed' THEN 'Property confirmed' WHEN 'listing.availability_changed' THEN 'Property availability changed'
    WHEN 'listing.featured_changed' THEN 'Featured property changed' WHEN 'listing.cover_changed' THEN 'Property cover changed'
    WHEN 'listing.recalculated' THEN 'Property recalculated' WHEN 'listing.deleted' THEN 'Property deleted'
    WHEN 'payment.recorded' THEN 'Payment recorded' WHEN 'payment.updated' THEN 'Payment updated'
    WHEN 'payments.imported' THEN 'Payments imported' WHEN 'rental.created' THEN 'Rental created'
    WHEN 'rental.updated' THEN 'Rental updated' WHEN 'rental.archived' THEN 'Rental archived'
    WHEN 'rental.restored' THEN 'Rental restored' WHEN 'tenancy.created' THEN 'Tenancy created'
    WHEN 'tenancy.updated' THEN 'Tenancy updated' WHEN 'tenancy.renewed' THEN 'Tenancy renewed'
    WHEN 'tenancy.ended' THEN 'Tenancy ended' WHEN 'tenancy.end_cancelled' THEN 'Tenancy end cancelled'
    WHEN 'rent.changed' THEN 'Rent changed' WHEN 'notice.recorded' THEN 'Notice recorded'
    WHEN 'arrears.step_done' THEN 'Arrears step completed' WHEN 'charge.edited' THEN 'Charge edited'
    WHEN 'compliance.updated' THEN 'Compliance updated' WHEN 'repair.created' THEN 'Repair reported'
    WHEN 'repair.updated' THEN 'Repair updated' END AS title,
  e.type='listing.deleted' AS target_deleted
FROM events e
WHERE (e.entity_type='viewing' AND e.type IN ('viewing.booked','viewing.confirmed','viewing.rescheduled','viewing.cancelled','viewing.completed','viewing.no_show'))
 OR (e.entity_type='applicant' AND (e.type IN ('offer.recorded','offer.updated','offer.countered','offer.rejected','offer.withdrawn','offer.accepted')
   AND EXISTS(SELECT 1 FROM offers WHERE id=json_extract(e.data,'$.offer_id') AND applicant_id=e.entity_id)
   OR e.type IN ('sale.updated','sale.milestone','sale.completed','sale.fallen_through')
   AND EXISTS(SELECT 1 FROM sales WHERE id=json_extract(e.data,'$.sale_id') AND applicant_id=e.entity_id)
   AND (e.type<>'sale.milestone' OR (json_extract(e.data,'$.key') IN ('lawyers','due_diligence','questionnaire','searches','mortgage','contract','funds','passing','settled')
     AND EXISTS(SELECT 1 FROM sale_milestones WHERE sale_id=json_extract(e.data,'$.sale_id') AND key=json_extract(e.data,'$.key'))))))
 OR (e.entity_type='listing' AND e.type IN ('listing.review_requested','listing.review_returned','listing.created','listing.updated','listing.published','listing.unpublished','listing.archived','listing.restored','listing.confirmed','listing.availability_changed','listing.featured_changed','listing.cover_changed','listing.recalculated','listing.deleted'))
 OR (e.rental_event_id IS NOT NULL AND e.entity_type IN ('rental','payment','collection'));

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM media EXCEPT SELECT * FROM est17_media_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_media_backup EXCEPT SELECT * FROM media);

DROP TABLE est17_media_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM matches EXCEPT SELECT * FROM est17_matches_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_matches_backup EXCEPT SELECT * FROM matches);

DROP TABLE est17_matches_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM daily_stats EXCEPT SELECT * FROM est17_daily_stats_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_daily_stats_backup EXCEPT SELECT * FROM daily_stats);

DROP TABLE est17_daily_stats_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM offers EXCEPT SELECT * FROM est17_offers_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_offers_backup EXCEPT SELECT * FROM offers);

DROP TABLE est17_offers_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM jobs EXCEPT SELECT * FROM est17_jobs_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_jobs_backup EXCEPT SELECT * FROM jobs);

DROP TABLE est17_jobs_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM viewing_requests EXCEPT SELECT * FROM est17_viewing_requests_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_viewing_requests_backup EXCEPT SELECT * FROM viewing_requests);

DROP TABLE est17_viewing_requests_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM drive_imports EXCEPT SELECT * FROM est17_drive_imports_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_drive_imports_backup EXCEPT SELECT * FROM drive_imports);

DROP TABLE est17_drive_imports_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM chats EXCEPT SELECT * FROM est17_chats_backup);

INSERT INTO est17_integrity_guard SELECT count(*) FROM (SELECT * FROM est17_chats_backup EXCEPT SELECT * FROM chats);

DROP TABLE est17_chats_backup;

DROP TABLE est17_listing_backup;

INSERT INTO est17_integrity_guard SELECT count(*) FROM pragma_foreign_key_check;

DROP TABLE est17_integrity_guard;

PRAGMA defer_foreign_keys = OFF;
