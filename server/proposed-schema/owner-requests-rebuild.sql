-- PROPOSAL ONLY: inspect before migration; requires exact baseline through 0051 and a D1 trial.

PRAGMA defer_foreign_keys=ON;

CREATE TABLE pub10_guard(n INTEGER NOT NULL CHECK(n=0));

INSERT INTO pub10_guard SELECT COUNT(*) FROM pragma_foreign_key_check;

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='history_viewing_event_insert' AND tbl_name='events' AND sql='CREATE TRIGGER history_viewing_event_insert AFTER INSERT ON events
  WHEN NEW.entity_type=''viewing'' AND NEW.type IN (''viewing.requested'',''viewing.booked'',''viewing.confirmed'',
    ''viewing.rescheduled'',''viewing.cancelled'',''viewing.completed'',''viewing.no_show'')
BEGIN
  INSERT INTO history_viewing_events(event_id,viewing_id,listing_id,at)
    SELECT NEW.id,v.id,v.listing_id,NEW.at FROM viewing_requests v
    JOIN listings l ON l.id=v.listing_id WHERE CAST(v.id AS TEXT)=NEW.entity_id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='history_viewing_relink' AND tbl_name='viewing_requests' AND sql='CREATE TRIGGER history_viewing_relink AFTER UPDATE OF listing_id ON viewing_requests
  WHEN OLD.listing_id IS NOT NEW.listing_id
BEGIN
  DELETE FROM history_viewing_events WHERE viewing_id=NEW.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='listing_event_delete' AND tbl_name='listings' AND sql='CREATE TRIGGER listing_event_delete AFTER DELETE ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=OLD.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,''listing'',OLD.id,''listing.deleted'',json_object(
    ''revision'',(SELECT COALESCE(MAX(CAST(json_extract(data,''$.revision'') AS INTEGER)),0)+1
      FROM events WHERE entity_type=''listing'' AND entity_id=OLD.id),
    ''source'',c.source,
    ''fields'',json(json(''[]'')),
    ''before'',json(json(''{}'')),
    ''after'',json(json(''{}'')),
    ''derived_fields'',json(json(''[]'')),
    ''related'',json(c.related))
  FROM listing_event_context c
  WHERE c.listing_id=OLD.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='listing_event_insert' AND tbl_name='listings' AND sql='CREATE TRIGGER listing_event_insert AFTER INSERT ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=NEW.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,''listing'',NEW.id,''listing.created'',json_object(
    ''revision'',(SELECT COALESCE(MAX(CAST(json_extract(data,''$.revision'') AS INTEGER)),0)+1
      FROM events WHERE entity_type=''listing'' AND entity_id=NEW.id),
    ''source'',c.source,
    ''fields'',json(json_array(''review_requested_at'',''review_requested_by'',''published'',''archived_at'',''availability'',''published_at'',''confirmed_at'',''use'',''operation'',''sale_price'',''rent'',''rent_period'',''premium'',''currency'',''parish'',''tenure_type'',''housing_category'',''restriction'',''bedrooms'',''bathrooms'',''matchable'',''viewings_enabled'',''viewing_hours'',''featured_rank'',''cover_media_id'',''feat_pets'',''feat_parking'',''feat_furnished'',''feat_outdoor'',''feat_type'',''title'',''property_type'',''country'',''location'',''road_name'',''tenure'',''price_text'',''price_per_sqft'',''rental_deposit'',''parish_rates'',''service_charge'',''utilities_included'',''available_on'',''summary'',''description'',''tour_url'',''specs'',''feat_evidence'',''property_condition'',''interior_area_sqft'',''separate_wcs'',''reception_rooms'',''has_garage'',''has_storage'',''has_lift'',''double_glazing'',''floor_level'',''building_floors'',''year_built'',''heating_types'',''amenities'',''feature_overrides'')),
    ''before'',json(json(''{}'')),
    ''after'',json(json_object(
      ''review_requested_at'', NEW.review_requested_at,
      ''review_requested_by'', NEW.review_requested_by,
      ''published'', NEW.published,
      ''archived_at'', NEW.archived_at,
      ''availability'', NEW.availability,
      ''published_at'', NEW.published_at,
      ''confirmed_at'', NEW.confirmed_at,
      ''use'', NEW.use,
      ''operation'', NEW.operation,
      ''sale_price'', NEW.sale_price,
      ''rent'', NEW.rent,
      ''rent_period'', NEW.rent_period,
      ''premium'', NEW.premium,
      ''currency'', NEW.currency,
      ''parish'', NEW.parish,
      ''tenure_type'', NEW.tenure_type,
      ''housing_category'', NEW.housing_category,
      ''restriction'', NEW.restriction,
      ''bedrooms'', NEW.bedrooms,
      ''bathrooms'', NEW.bathrooms,
      ''matchable'', NEW.matchable,
      ''viewings_enabled'', NEW.viewings_enabled,
      ''viewing_hours'', json(COALESCE(NEW.viewing_hours,''null'')),
      ''featured_rank'', NEW.featured_rank,
      ''cover_media_id'', NEW.cover_media_id,
      ''feat_pets'', NEW.feat_pets,
      ''feat_parking'', NEW.feat_parking,
      ''feat_furnished'', NEW.feat_furnished,
      ''feat_outdoor'', json(COALESCE(NEW.feat_outdoor,''null'')),
      ''feat_type'', NEW.feat_type,
      ''property_condition'', NEW.property_condition,
      ''interior_area_sqft'', NEW.interior_area_sqft,
      ''separate_wcs'', NEW.separate_wcs,
      ''reception_rooms'', NEW.reception_rooms,
      ''has_garage'', NEW.has_garage,
      ''has_storage'', NEW.has_storage,
      ''has_lift'', NEW.has_lift,
      ''double_glazing'', NEW.double_glazing,
      ''floor_level'', NEW.floor_level,
      ''building_floors'', NEW.building_floors,
      ''year_built'', NEW.year_built,
      ''heating_types'', json(COALESCE(NEW.heating_types,''null'')),
      ''amenities'', json(COALESCE(NEW.amenities,''null'')),
      ''feature_overrides'', json(COALESCE(NEW.feature_overrides,''null'')))),
    ''derived_fields'',json(json(c.derived_fields)),
    ''related'',json(c.related))
  FROM listing_event_context c
  WHERE c.listing_id=NEW.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='listing_event_update' AND tbl_name='listings' AND sql='CREATE TRIGGER listing_event_update AFTER UPDATE ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=NEW.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,''listing'',NEW.id,''listing.'' || CASE WHEN c.action=''published'' AND OLD.published=1 THEN ''confirmed'' ELSE c.action END,json_object(
    ''revision'',(SELECT COALESCE(MAX(CAST(json_extract(data,''$.revision'') AS INTEGER)),0)+1
      FROM events WHERE entity_type=''listing'' AND entity_id=NEW.id),
    ''source'',c.source,
    ''fields'',json((SELECT json_group_array(value) FROM (
      SELECT key AS value FROM json_each(d.changed) WHERE value=1
      UNION SELECT value FROM json_each(c.extra_fields)
    ))),
    ''before'',json((SELECT json_group_object(key, CASE WHEN type IN (''array'',''object'') THEN json(value) ELSE value END)
      FROM json_each(d.before_values) WHERE key IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    ''after'',json((SELECT json_group_object(key, CASE WHEN type IN (''array'',''object'') THEN json(value) ELSE value END)
      FROM json_each(d.after_values) WHERE key IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    ''derived_fields'',json((SELECT json_group_array(value) FROM json_each(c.derived_fields)
      WHERE value IN (SELECT key FROM json_each(d.changed) WHERE value=1))),
    ''related'',json(c.related))
  FROM listing_event_context c, (SELECT
    json_object(
      ''review_requested_at'', OLD.review_requested_at,
      ''review_requested_by'', OLD.review_requested_by,
      ''published'', OLD.published,
      ''archived_at'', OLD.archived_at,
      ''availability'', OLD.availability,
      ''published_at'', OLD.published_at,
      ''confirmed_at'', OLD.confirmed_at,
      ''use'', OLD.use,
      ''operation'', OLD.operation,
      ''sale_price'', OLD.sale_price,
      ''rent'', OLD.rent,
      ''rent_period'', OLD.rent_period,
      ''premium'', OLD.premium,
      ''currency'', OLD.currency,
      ''parish'', OLD.parish,
      ''tenure_type'', OLD.tenure_type,
      ''housing_category'', OLD.housing_category,
      ''restriction'', OLD.restriction,
      ''bedrooms'', OLD.bedrooms,
      ''bathrooms'', OLD.bathrooms,
      ''matchable'', OLD.matchable,
      ''viewings_enabled'', OLD.viewings_enabled,
      ''viewing_hours'', json(COALESCE(OLD.viewing_hours,''null'')),
      ''featured_rank'', OLD.featured_rank,
      ''cover_media_id'', OLD.cover_media_id,
      ''feat_pets'', OLD.feat_pets,
      ''feat_parking'', OLD.feat_parking,
      ''feat_furnished'', OLD.feat_furnished,
      ''feat_outdoor'', json(COALESCE(OLD.feat_outdoor,''null'')),
      ''feat_type'', OLD.feat_type,
      ''property_condition'', OLD.property_condition,
      ''interior_area_sqft'', OLD.interior_area_sqft,
      ''separate_wcs'', OLD.separate_wcs,
      ''reception_rooms'', OLD.reception_rooms,
      ''has_garage'', OLD.has_garage,
      ''has_storage'', OLD.has_storage,
      ''has_lift'', OLD.has_lift,
      ''double_glazing'', OLD.double_glazing,
      ''floor_level'', OLD.floor_level,
      ''building_floors'', OLD.building_floors,
      ''year_built'', OLD.year_built,
      ''heating_types'', json(COALESCE(OLD.heating_types,''null'')),
      ''amenities'', json(COALESCE(OLD.amenities,''null'')),
      ''feature_overrides'', json(COALESCE(OLD.feature_overrides,''null''))) AS before_values,
    json_object(
      ''review_requested_at'', NEW.review_requested_at,
      ''review_requested_by'', NEW.review_requested_by,
      ''published'', NEW.published,
      ''archived_at'', NEW.archived_at,
      ''availability'', NEW.availability,
      ''published_at'', NEW.published_at,
      ''confirmed_at'', NEW.confirmed_at,
      ''use'', NEW.use,
      ''operation'', NEW.operation,
      ''sale_price'', NEW.sale_price,
      ''rent'', NEW.rent,
      ''rent_period'', NEW.rent_period,
      ''premium'', NEW.premium,
      ''currency'', NEW.currency,
      ''parish'', NEW.parish,
      ''tenure_type'', NEW.tenure_type,
      ''housing_category'', NEW.housing_category,
      ''restriction'', NEW.restriction,
      ''bedrooms'', NEW.bedrooms,
      ''bathrooms'', NEW.bathrooms,
      ''matchable'', NEW.matchable,
      ''viewings_enabled'', NEW.viewings_enabled,
      ''viewing_hours'', json(COALESCE(NEW.viewing_hours,''null'')),
      ''featured_rank'', NEW.featured_rank,
      ''cover_media_id'', NEW.cover_media_id,
      ''feat_pets'', NEW.feat_pets,
      ''feat_parking'', NEW.feat_parking,
      ''feat_furnished'', NEW.feat_furnished,
      ''feat_outdoor'', json(COALESCE(NEW.feat_outdoor,''null'')),
      ''feat_type'', NEW.feat_type,
      ''property_condition'', NEW.property_condition,
      ''interior_area_sqft'', NEW.interior_area_sqft,
      ''separate_wcs'', NEW.separate_wcs,
      ''reception_rooms'', NEW.reception_rooms,
      ''has_garage'', NEW.has_garage,
      ''has_storage'', NEW.has_storage,
      ''has_lift'', NEW.has_lift,
      ''double_glazing'', NEW.double_glazing,
      ''floor_level'', NEW.floor_level,
      ''building_floors'', NEW.building_floors,
      ''year_built'', NEW.year_built,
      ''heating_types'', json(COALESCE(NEW.heating_types,''null'')),
      ''amenities'', json(COALESCE(NEW.amenities,''null'')),
      ''feature_overrides'', json(COALESCE(NEW.feature_overrides,''null''))) AS after_values,
    json_object(
      ''review_requested_at'', NEW.review_requested_at IS NOT OLD.review_requested_at,
      ''review_requested_by'', NEW.review_requested_by IS NOT OLD.review_requested_by,
      ''published'', NEW.published IS NOT OLD.published,
      ''archived_at'', NEW.archived_at IS NOT OLD.archived_at,
      ''availability'', NEW.availability IS NOT OLD.availability,
      ''published_at'', NEW.published_at IS NOT OLD.published_at,
      ''confirmed_at'', NEW.confirmed_at IS NOT OLD.confirmed_at,
      ''use'', NEW.use IS NOT OLD.use,
      ''operation'', NEW.operation IS NOT OLD.operation,
      ''sale_price'', NEW.sale_price IS NOT OLD.sale_price,
      ''rent'', NEW.rent IS NOT OLD.rent,
      ''rent_period'', NEW.rent_period IS NOT OLD.rent_period,
      ''premium'', NEW.premium IS NOT OLD.premium,
      ''currency'', NEW.currency IS NOT OLD.currency,
      ''price_per_sqft'', NEW.price_per_sqft IS NOT OLD.price_per_sqft,
      ''rental_deposit'', NEW.rental_deposit IS NOT OLD.rental_deposit,
      ''parish_rates'', NEW.parish_rates IS NOT OLD.parish_rates,
      ''service_charge'', NEW.service_charge IS NOT OLD.service_charge,
      ''utilities_included'', NEW.utilities_included IS NOT OLD.utilities_included,
      ''available_on'', NEW.available_on IS NOT OLD.available_on,
      ''parish'', NEW.parish IS NOT OLD.parish,
      ''tenure_type'', NEW.tenure_type IS NOT OLD.tenure_type,
      ''housing_category'', NEW.housing_category IS NOT OLD.housing_category,
      ''restriction'', NEW.restriction IS NOT OLD.restriction,
      ''bedrooms'', NEW.bedrooms IS NOT OLD.bedrooms,
      ''bathrooms'', NEW.bathrooms IS NOT OLD.bathrooms,
      ''matchable'', NEW.matchable IS NOT OLD.matchable,
      ''viewings_enabled'', NEW.viewings_enabled IS NOT OLD.viewings_enabled,
      ''viewing_hours'', NEW.viewing_hours IS NOT OLD.viewing_hours,
      ''featured_rank'', NEW.featured_rank IS NOT OLD.featured_rank,
      ''cover_media_id'', NEW.cover_media_id IS NOT OLD.cover_media_id,
      ''feat_pets'', NEW.feat_pets IS NOT OLD.feat_pets,
      ''feat_parking'', NEW.feat_parking IS NOT OLD.feat_parking,
      ''feat_furnished'', NEW.feat_furnished IS NOT OLD.feat_furnished,
      ''feat_outdoor'', NEW.feat_outdoor IS NOT OLD.feat_outdoor,
      ''feat_type'', NEW.feat_type IS NOT OLD.feat_type,
      ''property_condition'', NEW.property_condition IS NOT OLD.property_condition,
      ''interior_area_sqft'', NEW.interior_area_sqft IS NOT OLD.interior_area_sqft,
      ''separate_wcs'', NEW.separate_wcs IS NOT OLD.separate_wcs,
      ''reception_rooms'', NEW.reception_rooms IS NOT OLD.reception_rooms,
      ''has_garage'', NEW.has_garage IS NOT OLD.has_garage,
      ''has_storage'', NEW.has_storage IS NOT OLD.has_storage,
      ''has_lift'', NEW.has_lift IS NOT OLD.has_lift,
      ''double_glazing'', NEW.double_glazing IS NOT OLD.double_glazing,
      ''floor_level'', NEW.floor_level IS NOT OLD.floor_level,
      ''building_floors'', NEW.building_floors IS NOT OLD.building_floors,
      ''year_built'', NEW.year_built IS NOT OLD.year_built,
      ''heating_types'', NEW.heating_types IS NOT OLD.heating_types,
      ''amenities'', NEW.amenities IS NOT OLD.amenities,
      ''feature_overrides'', NEW.feature_overrides IS NOT OLD.feature_overrides,
      ''title'', NEW.title IS NOT OLD.title,
      ''property_type'', NEW.property_type IS NOT OLD.property_type,
      ''country'', NEW.country IS NOT OLD.country,
      ''location'', NEW.location IS NOT OLD.location,
      ''road_name'', NEW.road_name IS NOT OLD.road_name,
      ''tenure'', NEW.tenure IS NOT OLD.tenure,
      ''price_text'', NEW.price_text IS NOT OLD.price_text,
      ''summary'', NEW.summary IS NOT OLD.summary,
      ''description'', NEW.description IS NOT OLD.description,
      ''tour_url'', NEW.tour_url IS NOT OLD.tour_url,
      ''specs'', NEW.specs IS NOT OLD.specs,
      ''feat_evidence'', NEW.feat_evidence IS NOT OLD.feat_evidence) AS changed) d
  WHERE c.listing_id=NEW.id
    AND (EXISTS(SELECT 1 FROM json_each(d.changed) WHERE value=1)
      OR EXISTS(SELECT 1 FROM json_each(c.extra_fields))
      OR c.action IN (''confirmed'',''published''));
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_applicant_deleted' AND tbl_name='applicants' AND sql='CREATE TRIGGER notification_applicant_deleted AFTER DELETE ON applicants BEGIN
  UPDATE notifications SET title=''Deleted applicant'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE (target_kind=''applicant'' AND target_id=CAST(OLD.id AS TEXT)) OR event_id IN(SELECT id FROM events WHERE entity_type=''applicant'' AND entity_id=CAST(OLD.id AS TEXT));
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_check_deleted' AND tbl_name='compliance_items' AND sql='CREATE TRIGGER notification_check_deleted AFTER DELETE ON compliance_items BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,''$.compliance_kind'')=OLD.kind);
  UPDATE notifications SET title=''Deleted check'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,''$.compliance_kind'')=OLD.kind;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_contact_deleted' AND tbl_name='contacts' AND sql='CREATE TRIGGER notification_contact_deleted AFTER DELETE ON contacts BEGIN
  UPDATE notifications SET title=''Deleted applicant'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE (target_kind=''contact'' AND target_id=CAST(OLD.id AS TEXT)) OR event_id IN(SELECT id FROM events WHERE entity_type=''contact'' AND entity_id=CAST(OLD.id AS TEXT));
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_event_feed' AND tbl_name='events' AND sql='CREATE TRIGGER notification_event_feed AFTER INSERT ON events BEGIN
  INSERT INTO notifications(task_key,event_id,source_version,category,title,action_required,created_at,
    target_kind,target_id,target_context,target_deleted)
    SELECT ''event:''||id,id,id,category,title,0,at,target_kind,target_id,target_context,target_deleted
    FROM notification_event_projection WHERE id=NEW.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_listing_deleted' AND tbl_name='listings' AND sql='CREATE TRIGGER notification_listing_deleted AFTER DELETE ON listings BEGIN
  DELETE FROM notification_observations WHERE target_kind=''listing'' AND target_id=OLD.id;
  UPDATE notifications SET title=''Deleted property'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE (target_kind=''listing'' AND target_id=OLD.id) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type=''listing'' AND entity_id=OLD.id));
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_milestone_deleted' AND tbl_name='sale_milestones' AND sql='CREATE TRIGGER notification_milestone_deleted AFTER DELETE ON sale_milestones BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind=''sale'' AND target_id=CAST(OLD.sale_id AS TEXT) AND json_extract(target_context,''$.milestone'')=OLD.key);
  UPDATE notifications SET title=''Deleted milestone'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''sale'' AND target_id=CAST(OLD.sale_id AS TEXT) AND json_extract(target_context,''$.milestone'')=OLD.key;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_offer_deleted' AND tbl_name='offers' AND sql='CREATE TRIGGER notification_offer_deleted AFTER DELETE ON offers BEGIN
  DELETE FROM notification_observations WHERE target_kind=''offer'' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title=''Deleted offer'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''offer'' AND target_id=CAST(OLD.id AS TEXT);
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_payment_deleted' AND tbl_name='payments' AND sql='CREATE TRIGGER notification_payment_deleted AFTER DELETE ON payments BEGIN
  DELETE FROM notification_observations WHERE target_kind=''payment'' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title=''Deleted payment'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''payment'' AND target_id=CAST(OLD.id AS TEXT);
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_rental_bridge' AND tbl_name='rental_events' AND sql='CREATE TRIGGER notification_rental_bridge AFTER INSERT ON rental_events
WHEN NEW.type IN (''rental.created'',''rental.updated'',''rental.archived'',''rental.restored'',
  ''tenancy.created'',''tenancy.updated'',''tenancy.renewed'',''tenancy.ended'',''tenancy.end_cancelled'',
  ''rent.changed'',''notice.recorded'',''arrears.step_done'',''charge.edited'',''compliance.updated'',
  ''repair.created'',''repair.updated'',''payment.recorded'',''payment.updated'',''payments.imported'')
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data,rental_event_id)
  SELECT NEW.at,COALESCE(NEW.actor,''system''),
    CASE WHEN NEW.type IN (''payment.recorded'',''payment.updated'') THEN ''payment''
      WHEN NEW.type=''payments.imported'' AND NEW.rental_id IS NULL THEN ''collection'' ELSE ''rental'' END,
    CASE WHEN NEW.type IN (''payment.recorded'',''payment.updated'') THEN CAST(json_extract(NEW.data,''$.payment_id'') AS TEXT)
      WHEN NEW.type=''payments.imported'' AND NEW.rental_id IS NULL THEN ''unmatched-payments'' ELSE CAST(NEW.rental_id AS TEXT) END,
    NEW.type,json_object(''version'',1,''tenancy_id'',NEW.tenancy_id,''repair_id'',json_extract(NEW.data,''$.repair_id''),
      ''compliance_kind'',CASE WHEN NEW.type=''compliance.updated'' THEN json_extract(NEW.data,''$.kind'') END,
      ''state'',CASE WHEN NEW.type=''repair.updated'' THEN json_extract(NEW.data,''$.after.status'') END,
      ''urgency'',CASE WHEN NEW.type=''repair.updated'' THEN json_extract(NEW.data,''$.after.urgency'') END,
      ''unmatched'',CASE WHEN NEW.type IN (''payment.recorded'',''payment.updated'') THEN
        (SELECT tenancy_id IS NULL FROM payments WHERE id=json_extract(NEW.data,''$.payment_id'')) END),NEW.id
  WHERE (NEW.rental_id IS NOT NULL OR NEW.type IN (''payment.recorded'',''payment.updated'',''payments.imported''))
    AND (NEW.type NOT IN (''payment.recorded'',''payment.updated'') OR EXISTS(
      SELECT 1 FROM payments p WHERE p.id=json_extract(NEW.data,''$.payment_id'')
        AND (p.tenancy_id IS NEW.tenancy_id OR (p.tenancy_id IS NULL
          AND json_type(NEW.data,''$.after.tenancy_id'')=''null''
          AND json_extract(NEW.data,''$.before.tenancy_id'')=NEW.tenancy_id))));
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_rental_deleted' AND tbl_name='rentals' AND sql='CREATE TRIGGER notification_rental_deleted AFTER DELETE ON rentals BEGIN
  DELETE FROM notification_observations WHERE target_kind=''rental'' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title=''Deleted rental'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.id AS TEXT);
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_repair_deleted' AND tbl_name='repairs' AND sql='CREATE TRIGGER notification_repair_deleted AFTER DELETE ON repairs BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,''$.repair_id'')=OLD.id);
  UPDATE notifications SET title=''Deleted repair'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,''$.repair_id'')=OLD.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_sale_deleted' AND tbl_name='sales' AND sql='CREATE TRIGGER notification_sale_deleted AFTER DELETE ON sales BEGIN
  DELETE FROM notification_observations WHERE target_kind=''sale'' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title=''Deleted sale'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''sale'' AND target_id=CAST(OLD.id AS TEXT);
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_task_changed' AND tbl_name='notifications' AND sql='CREATE TRIGGER notification_task_changed AFTER UPDATE OF event_id,category,title,action_required,
  resolved_at,resolved_by,assigned_to,due_at,task_reason,source_version,urgency,closed_by_source,
  target_kind,target_id,target_context,target_deleted ON notifications
WHEN OLD.task_key IS NOT NULL BEGIN
  UPDATE notifications SET revision=OLD.revision+1,
    closed_by_source=CASE WHEN NEW.resolved_at IS NULL THEN 0
      WHEN OLD.resolved_at IS NULL THEN CASE WHEN NEW.task_action=''done'' THEN 0 ELSE 1 END
      ELSE NEW.closed_by_source END
    WHERE id=NEW.id AND (OLD.event_id IS NOT NEW.event_id OR OLD.category IS NOT NEW.category
      OR OLD.title IS NOT NEW.title OR OLD.action_required IS NOT NEW.action_required
      OR OLD.resolved_at IS NOT NEW.resolved_at OR OLD.resolved_by IS NOT NEW.resolved_by
      OR OLD.assigned_to IS NOT NEW.assigned_to OR OLD.due_at IS NOT NEW.due_at
      OR OLD.task_reason IS NOT NEW.task_reason OR OLD.source_version IS NOT NEW.source_version
      OR OLD.urgency IS NOT NEW.urgency OR OLD.closed_by_source IS NOT NEW.closed_by_source
      OR OLD.target_kind IS NOT NEW.target_kind OR OLD.target_id IS NOT NEW.target_id
      OR OLD.target_context IS NOT NEW.target_context OR OLD.target_deleted IS NOT NEW.target_deleted);
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    SELECT NEW.id,revision,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now''),
      COALESCE(NEW.task_actor,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN NEW.resolved_by END,''system''),
      COALESCE(NEW.task_action,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN ''source_resolved'' ELSE ''source_update'' END)
    FROM notifications WHERE id=NEW.id AND revision>OLD.revision;
  UPDATE notifications SET task_actor=NULL,task_action=NULL WHERE id=NEW.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_task_created' AND tbl_name='notifications' AND sql='CREATE TRIGGER notification_task_created AFTER INSERT ON notifications BEGIN
  UPDATE notifications SET task_key=COALESCE(NEW.task_key,''legacy:'' || NEW.id),
    source_version=CASE WHEN NEW.source_version=0 THEN NEW.event_id ELSE NEW.source_version END,
    task_actor=NULL,task_action=NULL WHERE id=NEW.id;
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    VALUES(NEW.id,1,NEW.created_at,COALESCE(NEW.task_actor,(SELECT actor FROM events WHERE id=NEW.event_id),''system''),''created'');
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_tenancy_deleted' AND tbl_name='tenancies' AND sql='CREATE TRIGGER notification_tenancy_deleted AFTER DELETE ON tenancies BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,''$.tenancy_id'')=OLD.id);
  UPDATE notifications SET title=''Deleted tenancy'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE target_kind=''rental'' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,''$.tenancy_id'')=OLD.id;
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='notification_viewing_deleted' AND tbl_name='viewing_requests' AND sql='CREATE TRIGGER notification_viewing_deleted AFTER DELETE ON viewing_requests BEGIN
  UPDATE notifications SET title=''Deleted viewing request'',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime(''%Y-%m-%dT%H:%M:%fZ'',''now'')),resolved_by=COALESCE(resolved_by,''system''),closed_by_source=1
    WHERE (target_kind=''viewing'' AND target_id=CAST(OLD.id AS TEXT)) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type=''viewing'' AND entity_id=CAST(OLD.id AS TEXT)));
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='rental_events_count' AND tbl_name='rental_events' AND sql='CREATE TRIGGER rental_events_count AFTER INSERT ON rental_events BEGIN
  DELETE FROM app_settings WHERE key = ''rentals_count'';
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='trigger' AND name='weekly_insights_notice' AND tbl_name='weekly_insights' AND sql='CREATE TRIGGER weekly_insights_notice AFTER INSERT ON weekly_insights BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(NEW.generated_at,''system'',''admin'',''weekly-insights:''||NEW.week_start,''analytics.weekly_created'',
      json_object(''version'',1,''from'',NEW.week_start,''until'',NEW.week_until));
  INSERT INTO notifications(event_id,category,title,action_required,created_at,task_key,source_version,target_kind,target_id)
    VALUES(last_insert_rowid(),''message'',''Weekly Insights · ''||NEW.week_start||''–''||date(NEW.week_until,''-1 day''),
      0,NEW.generated_at,''insights:weekly:''||NEW.week_start,last_insert_rowid(),''collection'',''weekly-insights:''||NEW.week_start);
END';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='view' AND name='notification_event_projection' AND tbl_name='notification_event_projection' AND sql='CREATE VIEW notification_event_projection AS
SELECT e.id,e.at,e.actor,
  CASE WHEN e.entity_type=''applicant'' AND e.type LIKE ''offer.%'' THEN ''offer''
    WHEN e.entity_type=''applicant'' AND e.type LIKE ''sale.%'' THEN ''sale'' ELSE e.entity_type END AS target_kind,
  CASE WHEN e.entity_type=''applicant'' AND e.type LIKE ''offer.%'' THEN CAST(json_extract(e.data,''$.offer_id'') AS TEXT)
    WHEN e.entity_type=''applicant'' AND e.type LIKE ''sale.%'' THEN CAST(json_extract(e.data,''$.sale_id'') AS TEXT) ELSE e.entity_id END AS target_id,
  CASE WHEN e.entity_type=''applicant'' AND e.type=''sale.milestone'' THEN json_object(''milestone'',json_extract(e.data,''$.key''))
    WHEN e.entity_type=''rental'' THEN json_patch(''{}'',json_object(
    ''tenancy_id'',json_extract(e.data,''$.tenancy_id''),''repair_id'',json_extract(e.data,''$.repair_id''),
    ''compliance_kind'',json_extract(e.data,''$.compliance_kind''))) END AS target_context,
  CASE WHEN e.type=''compliance.updated'' AND e.entity_type=''rental'' THEN ''compliance'' WHEN e.entity_type=''viewing'' THEN ''viewing'' ELSE ''task'' END AS category,
  CASE e.type
    WHEN ''viewing.booked'' THEN ''Viewing booked'' WHEN ''viewing.confirmed'' THEN ''Viewing confirmed''
    WHEN ''viewing.rescheduled'' THEN ''Viewing rescheduled'' WHEN ''viewing.cancelled'' THEN ''Viewing cancelled''
    WHEN ''viewing.completed'' THEN ''Viewing completed'' WHEN ''viewing.no_show'' THEN ''Viewing missed''
    WHEN ''offer.recorded'' THEN ''Offer recorded'' WHEN ''offer.updated'' THEN ''Offer updated''
    WHEN ''offer.countered'' THEN ''Offer countered'' WHEN ''offer.rejected'' THEN ''Offer rejected''
    WHEN ''offer.withdrawn'' THEN ''Offer withdrawn'' WHEN ''offer.accepted'' THEN ''Offer accepted''
    WHEN ''sale.updated'' THEN ''Sale updated'' WHEN ''sale.milestone'' THEN ''Sale milestone updated''
    WHEN ''sale.completed'' THEN ''Sale completed'' WHEN ''sale.fallen_through'' THEN ''Sale fell through''
    WHEN ''listing.review_requested'' THEN ''Property ready for review'' WHEN ''listing.review_returned'' THEN ''Property returned to draft'' WHEN ''listing.created'' THEN ''Property created'' WHEN ''listing.updated'' THEN ''Property updated''
    WHEN ''listing.published'' THEN ''Property published'' WHEN ''listing.unpublished'' THEN ''Property unpublished''
    WHEN ''listing.archived'' THEN ''Property archived'' WHEN ''listing.restored'' THEN ''Property restored''
    WHEN ''listing.confirmed'' THEN ''Property confirmed'' WHEN ''listing.availability_changed'' THEN ''Property availability changed''
    WHEN ''listing.featured_changed'' THEN ''Featured property changed'' WHEN ''listing.cover_changed'' THEN ''Property cover changed''
    WHEN ''listing.recalculated'' THEN ''Property recalculated'' WHEN ''listing.deleted'' THEN ''Property deleted''
    WHEN ''payment.recorded'' THEN ''Payment recorded'' WHEN ''payment.updated'' THEN ''Payment updated''
    WHEN ''payments.imported'' THEN ''Payments imported'' WHEN ''rental.created'' THEN ''Rental created''
    WHEN ''rental.updated'' THEN ''Rental updated'' WHEN ''rental.archived'' THEN ''Rental archived''
    WHEN ''rental.restored'' THEN ''Rental restored'' WHEN ''tenancy.created'' THEN ''Tenancy created''
    WHEN ''tenancy.updated'' THEN ''Tenancy updated'' WHEN ''tenancy.renewed'' THEN ''Tenancy renewed''
    WHEN ''tenancy.ended'' THEN ''Tenancy ended'' WHEN ''tenancy.end_cancelled'' THEN ''Tenancy end cancelled''
    WHEN ''rent.changed'' THEN ''Rent changed'' WHEN ''notice.recorded'' THEN ''Notice recorded''
    WHEN ''arrears.step_done'' THEN ''Arrears step completed'' WHEN ''charge.edited'' THEN ''Charge edited''
    WHEN ''compliance.updated'' THEN ''Compliance updated'' WHEN ''repair.created'' THEN ''Repair reported''
    WHEN ''repair.updated'' THEN ''Repair updated'' END AS title,
  e.type=''listing.deleted'' AS target_deleted
FROM events e
WHERE (e.entity_type=''viewing'' AND e.type IN (''viewing.booked'',''viewing.confirmed'',''viewing.rescheduled'',''viewing.cancelled'',''viewing.completed'',''viewing.no_show''))
 OR (e.entity_type=''applicant'' AND (e.type IN (''offer.recorded'',''offer.updated'',''offer.countered'',''offer.rejected'',''offer.withdrawn'',''offer.accepted'')
   AND EXISTS(SELECT 1 FROM offers WHERE id=json_extract(e.data,''$.offer_id'') AND applicant_id=e.entity_id)
   OR e.type IN (''sale.updated'',''sale.milestone'',''sale.completed'',''sale.fallen_through'')
   AND EXISTS(SELECT 1 FROM sales WHERE id=json_extract(e.data,''$.sale_id'') AND applicant_id=e.entity_id)
   AND (e.type<>''sale.milestone'' OR (json_extract(e.data,''$.key'') IN (''lawyers'',''due_diligence'',''questionnaire'',''searches'',''mortgage'',''contract'',''funds'',''passing'',''settled'')
     AND EXISTS(SELECT 1 FROM sale_milestones WHERE sale_id=json_extract(e.data,''$.sale_id'') AND key=json_extract(e.data,''$.key''))))))
 OR (e.entity_type=''listing'' AND e.type IN (''listing.review_requested'',''listing.review_returned'',''listing.created'',''listing.updated'',''listing.published'',''listing.unpublished'',''listing.archived'',''listing.restored'',''listing.confirmed'',''listing.availability_changed'',''listing.featured_changed'',''listing.cover_changed'',''listing.recalculated'',''listing.deleted''))
 OR (e.rental_event_id IS NOT NULL AND e.entity_type IN (''rental'',''payment'',''collection''))';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='events_entity' AND tbl_name='events' AND sql='CREATE INDEX events_entity ON events(entity_type,entity_id,at)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='events_listing_related' AND tbl_name='events' AND sql='CREATE INDEX events_listing_related ON events(
  (CASE WHEN json_valid(data) THEN json_extract(data, ''$.listing_id'') END),
  at DESC, id DESC
) WHERE entity_type = ''applicant''';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='events_listing_revision' AND tbl_name='events' AND sql='CREATE UNIQUE INDEX events_listing_revision ON events(entity_id,CAST(json_extract(data,''$.revision'') AS INTEGER)) WHERE entity_type=''listing''';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='notifications_created' AND tbl_name='notifications' AND sql='CREATE INDEX notifications_created ON notifications(created_at)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='notifications_event' AND tbl_name='notifications' AND sql='CREATE INDEX notifications_event ON notifications(event_id)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='notifications_open' AND tbl_name='notifications' AND sql='CREATE INDEX notifications_open ON notifications(resolved_at,category,created_at)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='notifications_owner_due' AND tbl_name='notifications' AND sql='CREATE INDEX notifications_owner_due ON notifications(assigned_to,due_at) WHERE resolved_at IS NULL';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='notifications_source_cursor' AND tbl_name='notifications' AND sql='CREATE INDEX notifications_source_cursor ON notifications(source_version,id)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='index' AND name='notifications_target' AND tbl_name='notifications' AND sql='CREATE INDEX notifications_target ON notifications(target_kind,target_id)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='events' AND tbl_name='events' AND sql='CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL, actor TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN (''applicant'',''contact'',''viewing'',''admin'',''listing'',''rental'',''payment'',''collection'')),
  entity_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT,
  rental_event_id INTEGER UNIQUE REFERENCES rental_events(id) ON DELETE SET NULL
)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='notifications' AND tbl_name='notifications' AND sql='CREATE TABLE "notifications" (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL CHECK(category IN (''new_applicant'',''viewing'',''matched'',''task'',''agency_reply'',''message'',''compliance'')),
  title TEXT NOT NULL,
  action_required INTEGER NOT NULL CHECK(action_required IN (0,1)),
  created_at TEXT NOT NULL,
  resolved_at TEXT, resolved_by TEXT,
  task_key TEXT UNIQUE,
  source_version INTEGER NOT NULL DEFAULT 0 CHECK(source_version >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  assigned_to TEXT,
  due_at TEXT,
  task_reason TEXT CHECK(task_reason IS NULL OR length(task_reason) <= 500),
  urgency TEXT NOT NULL DEFAULT ''normal'' CHECK(urgency IN (''normal'',''urgent'')),
  closed_by_source INTEGER NOT NULL DEFAULT 0 CHECK(closed_by_source IN (0,1)),
  task_actor TEXT, task_action TEXT
, target_kind TEXT CHECK(target_kind IS NULL OR target_kind IN (''applicant'',''contact'',''viewing'',''listing'',''offer'',''sale'',''rental'',''payment'',''collection'')), target_id TEXT, target_context TEXT CHECK(target_context IS NULL OR (json_valid(target_context) AND json_type(target_context)=''object'')), target_deleted INTEGER NOT NULL DEFAULT 0 CHECK(target_deleted IN (0,1)))';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='notification_task_history' AND tbl_name='notification_task_history' AND sql='CREATE TABLE notification_task_history (
  task_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  PRIMARY KEY(task_id,revision)
)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='notification_task_operations' AND tbl_name='notification_task_operations' AND sql='CREATE TABLE notification_task_operations (
  actor TEXT NOT NULL, operation_id TEXT NOT NULL,
  task_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  payload_hash TEXT NOT NULL, result_revision INTEGER NOT NULL,
  PRIMARY KEY(actor,operation_id)
)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='notification_reads' AND tbl_name='notification_reads' AND sql='CREATE TABLE notification_reads (
  admin TEXT NOT NULL REFERENCES admins(email) ON DELETE CASCADE,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  read_revision INTEGER NOT NULL CHECK(read_revision >= 1),
  PRIMARY KEY(admin,notification_id)
)';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='notification_observations' AND tbl_name='notification_observations' AND sql='CREATE TABLE notification_observations (
  task_key TEXT PRIMARY KEY REFERENCES notifications(task_key) ON DELETE CASCADE,
  kind TEXT NOT NULL, entity_id TEXT NOT NULL, cycle TEXT NOT NULL,
  signature TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
  target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
  event_id INTEGER NOT NULL REFERENCES events(id)
) WITHOUT ROWID';

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='table' AND name='history_viewing_events' AND tbl_name='history_viewing_events' AND sql='CREATE TABLE history_viewing_events (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  viewing_id INTEGER NOT NULL REFERENCES viewing_requests(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  at TEXT NOT NULL
)';

INSERT INTO pub10_guard SELECT COUNT(*)<>23 FROM sqlite_master WHERE type='trigger' AND (instr(lower(sql),'events')>0 OR instr(lower(sql),'notifications')>0);

INSERT INTO pub10_guard SELECT COUNT(*)<>1 FROM sqlite_master WHERE type='view' AND (instr(lower(sql),'events')>0 OR instr(lower(sql),'notifications')>0);

INSERT INTO pub10_guard SELECT COUNT(*)<>9 FROM sqlite_master WHERE type='index' AND tbl_name IN ('events','notifications') AND sql IS NOT NULL;

CREATE TABLE pub10_backup_events AS SELECT * FROM events;

CREATE TABLE pub10_backup_notifications AS SELECT * FROM notifications;

CREATE TABLE pub10_backup_notification_task_history AS SELECT * FROM notification_task_history;

CREATE TABLE pub10_backup_notification_task_operations AS SELECT * FROM notification_task_operations;

CREATE TABLE pub10_backup_notification_reads AS SELECT * FROM notification_reads;

CREATE TABLE pub10_backup_notification_observations AS SELECT * FROM notification_observations;

CREATE TABLE pub10_backup_history_viewing_events AS SELECT * FROM history_viewing_events;

DROP TRIGGER "history_viewing_event_insert";

DROP TRIGGER "history_viewing_relink";

DROP TRIGGER "listing_event_delete";

DROP TRIGGER "listing_event_insert";

DROP TRIGGER "listing_event_update";

DROP TRIGGER "notification_applicant_deleted";

DROP TRIGGER "notification_check_deleted";

DROP TRIGGER "notification_contact_deleted";

DROP TRIGGER "notification_event_feed";

DROP TRIGGER "notification_listing_deleted";

DROP TRIGGER "notification_milestone_deleted";

DROP TRIGGER "notification_offer_deleted";

DROP TRIGGER "notification_payment_deleted";

DROP TRIGGER "notification_rental_bridge";

DROP TRIGGER "notification_rental_deleted";

DROP TRIGGER "notification_repair_deleted";

DROP TRIGGER "notification_sale_deleted";

DROP TRIGGER "notification_task_changed";

DROP TRIGGER "notification_task_created";

DROP TRIGGER "notification_tenancy_deleted";

DROP TRIGGER "notification_viewing_deleted";

DROP TRIGGER "rental_events_count";

DROP TRIGGER "weekly_insights_notice";

DROP VIEW "notification_event_projection";

DROP TABLE notifications;

DROP TABLE events;

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL, actor TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('applicant','contact','viewing','admin','listing','rental','payment','collection','owner_request')),
  entity_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT,
  rental_event_id INTEGER UNIQUE REFERENCES rental_events(id) ON DELETE SET NULL
);

CREATE TABLE "notifications" (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL CHECK(category IN ('new_applicant','viewing','matched','task','agency_reply','message','compliance')),
  title TEXT NOT NULL,
  action_required INTEGER NOT NULL CHECK(action_required IN (0,1)),
  created_at TEXT NOT NULL,
  resolved_at TEXT, resolved_by TEXT,
  task_key TEXT UNIQUE,
  source_version INTEGER NOT NULL DEFAULT 0 CHECK(source_version >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  assigned_to TEXT,
  due_at TEXT,
  task_reason TEXT CHECK(task_reason IS NULL OR length(task_reason) <= 500),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','urgent')),
  closed_by_source INTEGER NOT NULL DEFAULT 0 CHECK(closed_by_source IN (0,1)),
  task_actor TEXT, task_action TEXT
, target_kind TEXT CHECK(target_kind IS NULL OR target_kind IN ('applicant','contact','viewing','listing','offer','sale','rental','payment','collection','owner_request')), target_id TEXT, target_context TEXT CHECK(target_context IS NULL OR (json_valid(target_context) AND json_type(target_context)='object')), target_deleted INTEGER NOT NULL DEFAULT 0 CHECK(target_deleted IN (0,1)));

INSERT INTO events SELECT * FROM pub10_backup_events;

INSERT INTO notifications SELECT * FROM pub10_backup_notifications;

INSERT INTO notification_task_history SELECT * FROM pub10_backup_notification_task_history;

INSERT INTO notification_task_operations SELECT * FROM pub10_backup_notification_task_operations;

INSERT INTO notification_reads SELECT * FROM pub10_backup_notification_reads;

INSERT INTO notification_observations SELECT * FROM pub10_backup_notification_observations;

INSERT INTO history_viewing_events SELECT * FROM pub10_backup_history_viewing_events;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM events EXCEPT SELECT * FROM pub10_backup_events);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_events EXCEPT SELECT * FROM events);

DROP TABLE pub10_backup_events;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM notifications EXCEPT SELECT * FROM pub10_backup_notifications);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_notifications EXCEPT SELECT * FROM notifications);

DROP TABLE pub10_backup_notifications;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM notification_task_history EXCEPT SELECT * FROM pub10_backup_notification_task_history);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_notification_task_history EXCEPT SELECT * FROM notification_task_history);

DROP TABLE pub10_backup_notification_task_history;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM notification_task_operations EXCEPT SELECT * FROM pub10_backup_notification_task_operations);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_notification_task_operations EXCEPT SELECT * FROM notification_task_operations);

DROP TABLE pub10_backup_notification_task_operations;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM notification_reads EXCEPT SELECT * FROM pub10_backup_notification_reads);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_notification_reads EXCEPT SELECT * FROM notification_reads);

DROP TABLE pub10_backup_notification_reads;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM notification_observations EXCEPT SELECT * FROM pub10_backup_notification_observations);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_notification_observations EXCEPT SELECT * FROM notification_observations);

DROP TABLE pub10_backup_notification_observations;

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM history_viewing_events EXCEPT SELECT * FROM pub10_backup_history_viewing_events);

INSERT INTO pub10_guard SELECT COUNT(*) FROM (SELECT * FROM pub10_backup_history_viewing_events EXCEPT SELECT * FROM history_viewing_events);

DROP TABLE pub10_backup_history_viewing_events;

CREATE INDEX events_entity ON events(entity_type,entity_id,at);

CREATE INDEX events_listing_related ON events(
  (CASE WHEN json_valid(data) THEN json_extract(data, '$.listing_id') END),
  at DESC, id DESC
) WHERE entity_type = 'applicant';

CREATE UNIQUE INDEX events_listing_revision ON events(entity_id,CAST(json_extract(data,'$.revision') AS INTEGER)) WHERE entity_type='listing';

CREATE INDEX notifications_created ON notifications(created_at);

CREATE INDEX notifications_event ON notifications(event_id);

CREATE INDEX notifications_open ON notifications(resolved_at,category,created_at);

CREATE INDEX notifications_owner_due ON notifications(assigned_to,due_at) WHERE resolved_at IS NULL;

CREATE INDEX notifications_source_cursor ON notifications(source_version,id);

CREATE INDEX notifications_target ON notifications(target_kind,target_id);

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
  CASE WHEN e.type='compliance.updated' AND e.entity_type='rental' THEN 'compliance' WHEN e.entity_type='viewing' THEN 'viewing' ELSE 'task' END AS category,
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

CREATE TRIGGER history_viewing_event_insert AFTER INSERT ON events
  WHEN NEW.entity_type='viewing' AND NEW.type IN ('viewing.requested','viewing.booked','viewing.confirmed',
    'viewing.rescheduled','viewing.cancelled','viewing.completed','viewing.no_show')
BEGIN
  INSERT INTO history_viewing_events(event_id,viewing_id,listing_id,at)
    SELECT NEW.id,v.id,v.listing_id,NEW.at FROM viewing_requests v
    JOIN listings l ON l.id=v.listing_id WHERE CAST(v.id AS TEXT)=NEW.entity_id;
END;

CREATE TRIGGER history_viewing_relink AFTER UPDATE OF listing_id ON viewing_requests
  WHEN OLD.listing_id IS NOT NEW.listing_id
BEGIN
  DELETE FROM history_viewing_events WHERE viewing_id=NEW.id;
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

CREATE TRIGGER listing_event_insert AFTER INSERT ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=NEW.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,'listing',NEW.id,'listing.created',json_object(
    'revision',(SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0)+1
      FROM events WHERE entity_type='listing' AND entity_id=NEW.id),
    'source',c.source,
    'fields',json(json_array('review_requested_at','review_requested_by','published','archived_at','availability','published_at','confirmed_at','use','operation','sale_price','rent','rent_period','premium','currency','parish','tenure_type','housing_category','restriction','bedrooms','bathrooms','matchable','viewings_enabled','viewing_hours','featured_rank','cover_media_id','feat_pets','feat_parking','feat_furnished','feat_outdoor','feat_type','title','property_type','country','location','road_name','tenure','price_text','price_per_sqft','rental_deposit','parish_rates','service_charge','utilities_included','available_on','summary','description','tour_url','specs','feat_evidence','property_condition','interior_area_sqft','separate_wcs','reception_rooms','has_garage','has_storage','has_lift','double_glazing','floor_level','building_floors','year_built','heating_types','amenities','feature_overrides')),
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
      'feat_type', NEW.feat_type,
      'property_condition', NEW.property_condition,
      'interior_area_sqft', NEW.interior_area_sqft,
      'separate_wcs', NEW.separate_wcs,
      'reception_rooms', NEW.reception_rooms,
      'has_garage', NEW.has_garage,
      'has_storage', NEW.has_storage,
      'has_lift', NEW.has_lift,
      'double_glazing', NEW.double_glazing,
      'floor_level', NEW.floor_level,
      'building_floors', NEW.building_floors,
      'year_built', NEW.year_built,
      'heating_types', json(COALESCE(NEW.heating_types,'null')),
      'amenities', json(COALESCE(NEW.amenities,'null')),
      'feature_overrides', json(COALESCE(NEW.feature_overrides,'null')))),
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
    'fields',json((SELECT json_group_array(value) FROM (
      SELECT key AS value FROM json_each(d.changed) WHERE value=1
      UNION SELECT value FROM json_each(c.extra_fields)
    ))),
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
      'feat_type', OLD.feat_type,
      'property_condition', OLD.property_condition,
      'interior_area_sqft', OLD.interior_area_sqft,
      'separate_wcs', OLD.separate_wcs,
      'reception_rooms', OLD.reception_rooms,
      'has_garage', OLD.has_garage,
      'has_storage', OLD.has_storage,
      'has_lift', OLD.has_lift,
      'double_glazing', OLD.double_glazing,
      'floor_level', OLD.floor_level,
      'building_floors', OLD.building_floors,
      'year_built', OLD.year_built,
      'heating_types', json(COALESCE(OLD.heating_types,'null')),
      'amenities', json(COALESCE(OLD.amenities,'null')),
      'feature_overrides', json(COALESCE(OLD.feature_overrides,'null'))) AS before_values,
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
      'feat_type', NEW.feat_type,
      'property_condition', NEW.property_condition,
      'interior_area_sqft', NEW.interior_area_sqft,
      'separate_wcs', NEW.separate_wcs,
      'reception_rooms', NEW.reception_rooms,
      'has_garage', NEW.has_garage,
      'has_storage', NEW.has_storage,
      'has_lift', NEW.has_lift,
      'double_glazing', NEW.double_glazing,
      'floor_level', NEW.floor_level,
      'building_floors', NEW.building_floors,
      'year_built', NEW.year_built,
      'heating_types', json(COALESCE(NEW.heating_types,'null')),
      'amenities', json(COALESCE(NEW.amenities,'null')),
      'feature_overrides', json(COALESCE(NEW.feature_overrides,'null'))) AS after_values,
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
      'price_per_sqft', NEW.price_per_sqft IS NOT OLD.price_per_sqft,
      'rental_deposit', NEW.rental_deposit IS NOT OLD.rental_deposit,
      'parish_rates', NEW.parish_rates IS NOT OLD.parish_rates,
      'service_charge', NEW.service_charge IS NOT OLD.service_charge,
      'utilities_included', NEW.utilities_included IS NOT OLD.utilities_included,
      'available_on', NEW.available_on IS NOT OLD.available_on,
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
      'property_condition', NEW.property_condition IS NOT OLD.property_condition,
      'interior_area_sqft', NEW.interior_area_sqft IS NOT OLD.interior_area_sqft,
      'separate_wcs', NEW.separate_wcs IS NOT OLD.separate_wcs,
      'reception_rooms', NEW.reception_rooms IS NOT OLD.reception_rooms,
      'has_garage', NEW.has_garage IS NOT OLD.has_garage,
      'has_storage', NEW.has_storage IS NOT OLD.has_storage,
      'has_lift', NEW.has_lift IS NOT OLD.has_lift,
      'double_glazing', NEW.double_glazing IS NOT OLD.double_glazing,
      'floor_level', NEW.floor_level IS NOT OLD.floor_level,
      'building_floors', NEW.building_floors IS NOT OLD.building_floors,
      'year_built', NEW.year_built IS NOT OLD.year_built,
      'heating_types', NEW.heating_types IS NOT OLD.heating_types,
      'amenities', NEW.amenities IS NOT OLD.amenities,
      'feature_overrides', NEW.feature_overrides IS NOT OLD.feature_overrides,
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
    AND (EXISTS(SELECT 1 FROM json_each(d.changed) WHERE value=1)
      OR EXISTS(SELECT 1 FROM json_each(c.extra_fields))
      OR c.action IN ('confirmed','published'));
END;

CREATE TRIGGER notification_applicant_deleted AFTER DELETE ON applicants BEGIN
  UPDATE notifications SET title='Deleted applicant',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='applicant' AND target_id=CAST(OLD.id AS TEXT)) OR event_id IN(SELECT id FROM events WHERE entity_type='applicant' AND entity_id=CAST(OLD.id AS TEXT));
END;

CREATE TRIGGER notification_check_deleted AFTER DELETE ON compliance_items BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.compliance_kind')=OLD.kind);
  UPDATE notifications SET title='Deleted check',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.compliance_kind')=OLD.kind;
END;

CREATE TRIGGER notification_contact_deleted AFTER DELETE ON contacts BEGIN
  UPDATE notifications SET title='Deleted applicant',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='contact' AND target_id=CAST(OLD.id AS TEXT)) OR event_id IN(SELECT id FROM events WHERE entity_type='contact' AND entity_id=CAST(OLD.id AS TEXT));
END;

CREATE TRIGGER notification_event_feed AFTER INSERT ON events BEGIN
  INSERT INTO notifications(task_key,event_id,source_version,category,title,action_required,created_at,
    target_kind,target_id,target_context,target_deleted)
    SELECT 'event:'||id,id,id,category,title,0,at,target_kind,target_id,target_context,target_deleted
    FROM notification_event_projection WHERE id=NEW.id;
END;

CREATE TRIGGER notification_listing_deleted AFTER DELETE ON listings BEGIN
  DELETE FROM notification_observations WHERE target_kind='listing' AND target_id=OLD.id;
  UPDATE notifications SET title='Deleted property',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='listing' AND target_id=OLD.id) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type='listing' AND entity_id=OLD.id));
END;

CREATE TRIGGER notification_milestone_deleted AFTER DELETE ON sale_milestones BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='sale' AND target_id=CAST(OLD.sale_id AS TEXT) AND json_extract(target_context,'$.milestone')=OLD.key);
  UPDATE notifications SET title='Deleted milestone',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='sale' AND target_id=CAST(OLD.sale_id AS TEXT) AND json_extract(target_context,'$.milestone')=OLD.key;
END;

CREATE TRIGGER notification_offer_deleted AFTER DELETE ON offers BEGIN
  DELETE FROM notification_observations WHERE target_kind='offer' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted offer',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='offer' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_payment_deleted AFTER DELETE ON payments BEGIN
  DELETE FROM notification_observations WHERE target_kind='payment' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted payment',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='payment' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_rental_bridge AFTER INSERT ON rental_events
WHEN NEW.type IN ('rental.created','rental.updated','rental.archived','rental.restored',
  'tenancy.created','tenancy.updated','tenancy.renewed','tenancy.ended','tenancy.end_cancelled',
  'rent.changed','notice.recorded','arrears.step_done','charge.edited','compliance.updated',
  'repair.created','repair.updated','payment.recorded','payment.updated','payments.imported')
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data,rental_event_id)
  SELECT NEW.at,COALESCE(NEW.actor,'system'),
    CASE WHEN NEW.type IN ('payment.recorded','payment.updated') THEN 'payment'
      WHEN NEW.type='payments.imported' AND NEW.rental_id IS NULL THEN 'collection' ELSE 'rental' END,
    CASE WHEN NEW.type IN ('payment.recorded','payment.updated') THEN CAST(json_extract(NEW.data,'$.payment_id') AS TEXT)
      WHEN NEW.type='payments.imported' AND NEW.rental_id IS NULL THEN 'unmatched-payments' ELSE CAST(NEW.rental_id AS TEXT) END,
    NEW.type,json_object('version',1,'tenancy_id',NEW.tenancy_id,'repair_id',json_extract(NEW.data,'$.repair_id'),
      'compliance_kind',CASE WHEN NEW.type='compliance.updated' THEN json_extract(NEW.data,'$.kind') END,
      'state',CASE WHEN NEW.type='repair.updated' THEN json_extract(NEW.data,'$.after.status') END,
      'urgency',CASE WHEN NEW.type='repair.updated' THEN json_extract(NEW.data,'$.after.urgency') END,
      'unmatched',CASE WHEN NEW.type IN ('payment.recorded','payment.updated') THEN
        (SELECT tenancy_id IS NULL FROM payments WHERE id=json_extract(NEW.data,'$.payment_id')) END),NEW.id
  WHERE (NEW.rental_id IS NOT NULL OR NEW.type IN ('payment.recorded','payment.updated','payments.imported'))
    AND (NEW.type NOT IN ('payment.recorded','payment.updated') OR EXISTS(
      SELECT 1 FROM payments p WHERE p.id=json_extract(NEW.data,'$.payment_id')
        AND (p.tenancy_id IS NEW.tenancy_id OR (p.tenancy_id IS NULL
          AND json_type(NEW.data,'$.after.tenancy_id')='null'
          AND json_extract(NEW.data,'$.before.tenancy_id')=NEW.tenancy_id))));
END;

CREATE TRIGGER notification_rental_deleted AFTER DELETE ON rentals BEGIN
  DELETE FROM notification_observations WHERE target_kind='rental' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted rental',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_repair_deleted AFTER DELETE ON repairs BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.repair_id')=OLD.id);
  UPDATE notifications SET title='Deleted repair',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.repair_id')=OLD.id;
END;

CREATE TRIGGER notification_sale_deleted AFTER DELETE ON sales BEGIN
  DELETE FROM notification_observations WHERE target_kind='sale' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted sale',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='sale' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_task_changed AFTER UPDATE OF event_id,category,title,action_required,
  resolved_at,resolved_by,assigned_to,due_at,task_reason,source_version,urgency,closed_by_source,
  target_kind,target_id,target_context,target_deleted ON notifications
WHEN OLD.task_key IS NOT NULL BEGIN
  UPDATE notifications SET revision=OLD.revision+1,
    closed_by_source=CASE WHEN NEW.resolved_at IS NULL THEN 0
      WHEN OLD.resolved_at IS NULL THEN CASE WHEN NEW.task_action='done' THEN 0 ELSE 1 END
      ELSE NEW.closed_by_source END
    WHERE id=NEW.id AND (OLD.event_id IS NOT NEW.event_id OR OLD.category IS NOT NEW.category
      OR OLD.title IS NOT NEW.title OR OLD.action_required IS NOT NEW.action_required
      OR OLD.resolved_at IS NOT NEW.resolved_at OR OLD.resolved_by IS NOT NEW.resolved_by
      OR OLD.assigned_to IS NOT NEW.assigned_to OR OLD.due_at IS NOT NEW.due_at
      OR OLD.task_reason IS NOT NEW.task_reason OR OLD.source_version IS NOT NEW.source_version
      OR OLD.urgency IS NOT NEW.urgency OR OLD.closed_by_source IS NOT NEW.closed_by_source
      OR OLD.target_kind IS NOT NEW.target_kind OR OLD.target_id IS NOT NEW.target_id
      OR OLD.target_context IS NOT NEW.target_context OR OLD.target_deleted IS NOT NEW.target_deleted);
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    SELECT NEW.id,revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      COALESCE(NEW.task_actor,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN NEW.resolved_by END,'system'),
      COALESCE(NEW.task_action,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN 'source_resolved' ELSE 'source_update' END)
    FROM notifications WHERE id=NEW.id AND revision>OLD.revision;
  UPDATE notifications SET task_actor=NULL,task_action=NULL WHERE id=NEW.id;
END;

CREATE TRIGGER notification_task_created AFTER INSERT ON notifications BEGIN
  UPDATE notifications SET task_key=COALESCE(NEW.task_key,'legacy:' || NEW.id),
    source_version=CASE WHEN NEW.source_version=0 THEN NEW.event_id ELSE NEW.source_version END,
    task_actor=NULL,task_action=NULL WHERE id=NEW.id;
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    VALUES(NEW.id,1,NEW.created_at,COALESCE(NEW.task_actor,(SELECT actor FROM events WHERE id=NEW.event_id),'system'),'created');
END;

CREATE TRIGGER notification_tenancy_deleted AFTER DELETE ON tenancies BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.tenancy_id')=OLD.id);
  UPDATE notifications SET title='Deleted tenancy',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.tenancy_id')=OLD.id;
END;

CREATE TRIGGER notification_viewing_deleted AFTER DELETE ON viewing_requests BEGIN
  UPDATE notifications SET title='Deleted viewing request',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='viewing' AND target_id=CAST(OLD.id AS TEXT)) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type='viewing' AND entity_id=CAST(OLD.id AS TEXT)));
END;

CREATE TRIGGER rental_events_count AFTER INSERT ON rental_events BEGIN
  DELETE FROM app_settings WHERE key = 'rentals_count';
END;

CREATE TRIGGER weekly_insights_notice AFTER INSERT ON weekly_insights BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(NEW.generated_at,'system','admin','weekly-insights:'||NEW.week_start,'analytics.weekly_created',
      json_object('version',1,'from',NEW.week_start,'until',NEW.week_until));
  INSERT INTO notifications(event_id,category,title,action_required,created_at,task_key,source_version,target_kind,target_id)
    VALUES(last_insert_rowid(),'message','Weekly Insights · '||NEW.week_start||'–'||date(NEW.week_until,'-1 day'),
      0,NEW.generated_at,'insights:weekly:'||NEW.week_start,last_insert_rowid(),'collection','weekly-insights:'||NEW.week_start);
END;

INSERT INTO pub10_guard SELECT COUNT(*) FROM pragma_foreign_key_check;

DROP TABLE pub10_guard;
