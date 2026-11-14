-- PUB-06 / SPR-01: structured property terms and minimized date/amount history.
-- Additive on 0042; independent of pending 0043-0047 and 0049-0051.
-- Apply only after comparing the existing 0042 audit triggers and reviewing this migration.
ALTER TABLE listings ADD COLUMN rental_deposit_amount REAL CHECK (rental_deposit_amount IS NULL OR (typeof(rental_deposit_amount) IN ('integer','real') AND rental_deposit_amount >= 0 AND rental_deposit_amount < 10000000000 AND round(rental_deposit_amount,2) = rental_deposit_amount));
ALTER TABLE listings ADD COLUMN parish_rates_amount REAL CHECK (parish_rates_amount IS NULL OR (typeof(parish_rates_amount) IN ('integer','real') AND parish_rates_amount >= 0 AND parish_rates_amount < 10000000000 AND round(parish_rates_amount,2) = parish_rates_amount));
ALTER TABLE listings ADD COLUMN service_charge_amount REAL CHECK (service_charge_amount IS NULL OR (typeof(service_charge_amount) IN ('integer','real') AND service_charge_amount >= 0 AND service_charge_amount < 10000000000 AND round(service_charge_amount,2) = service_charge_amount));
ALTER TABLE listings ADD COLUMN parish_rates_period TEXT CHECK (parish_rates_period IS NULL OR parish_rates_period IN ('month','year'));
ALTER TABLE listings ADD COLUMN service_charge_period TEXT CHECK (service_charge_period IS NULL OR service_charge_period IN ('month','year'));

-- Keep direct SQL writers consistent with the API; periods alone may be known.
CREATE TRIGGER pub06_costs_guard_insert BEFORE INSERT ON listings
WHEN ((NEW.rental_deposit_amount IS NOT NULL OR NEW.parish_rates_amount IS NOT NULL OR NEW.service_charge_amount IS NOT NULL)
      AND (NEW.currency IS NULL OR NEW.currency NOT IN ('GBP','EUR')))
  OR (NEW.parish_rates_amount IS NOT NULL AND NEW.parish_rates_period IS NULL)
  OR (NEW.service_charge_amount IS NOT NULL AND NEW.service_charge_period IS NULL)
BEGIN SELECT RAISE(ABORT,'Incomplete structured costs'); END;
CREATE TRIGGER pub06_costs_guard_update BEFORE UPDATE OF currency,rental_deposit_amount,parish_rates_amount,service_charge_amount,parish_rates_period,service_charge_period ON listings
WHEN ((NEW.rental_deposit_amount IS NOT NULL OR NEW.parish_rates_amount IS NOT NULL OR NEW.service_charge_amount IS NOT NULL)
      AND (NEW.currency IS NULL OR NEW.currency NOT IN ('GBP','EUR')))
  OR (NEW.parish_rates_amount IS NOT NULL AND NEW.parish_rates_period IS NULL)
  OR (NEW.service_charge_amount IS NOT NULL AND NEW.service_charge_period IS NULL)
BEGIN SELECT RAISE(ABORT,'Incomplete structured costs'); END;

DROP TRIGGER listing_event_insert;
CREATE TRIGGER listing_event_insert AFTER INSERT ON listings
WHEN EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=NEW.id)
BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT c.at,c.actor,'listing',NEW.id,'listing.created',json_object(
    'revision',(SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0)+1
      FROM events WHERE entity_type='listing' AND entity_id=NEW.id),
    'source',c.source,
    'fields',json(json_array('review_requested_at','review_requested_by','published','archived_at','availability','published_at','confirmed_at','use','operation','sale_price','rent','rent_period','premium','currency','parish','tenure_type','housing_category','restriction','bedrooms','bathrooms','matchable','viewings_enabled','viewing_hours','featured_rank','cover_media_id','feat_pets','feat_parking','feat_furnished','feat_outdoor','feat_type','title','property_type','country','location','road_name','tenure','price_text','price_per_sqft','rental_deposit','parish_rates','service_charge','utilities_included','available_on','rental_deposit_amount','parish_rates_amount','service_charge_amount','parish_rates_period','service_charge_period','summary','description','tour_url','specs','feat_evidence','property_condition','interior_area_sqft','separate_wcs','reception_rooms','has_garage','has_storage','has_lift','double_glazing','floor_level','building_floors','year_built','heating_types','amenities','feature_overrides')),
    'before',json(json('{}')),
    'after',json(json_object(
      /* SPR01_AVAILABLE_ON_BEGIN */
      'available_on', CASE WHEN NEW.available_on IS NULL THEN NULL
        WHEN typeof(NEW.available_on)='text' AND length(NEW.available_on)=10 AND length(CAST(NEW.available_on AS BLOB))=10
          AND NEW.available_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND CAST(substr(NEW.available_on,1,4) AS INTEGER) BETWEEN 1 AND 9999
          AND CAST(substr(NEW.available_on,6,2) AS INTEGER) BETWEEN 1 AND 12
          AND CAST(substr(NEW.available_on,9,2) AS INTEGER) BETWEEN 1 AND CASE CAST(substr(NEW.available_on,6,2) AS INTEGER)
            WHEN 2 THEN CASE WHEN CAST(substr(NEW.available_on,1,4) AS INTEGER)%4=0 AND (CAST(substr(NEW.available_on,1,4) AS INTEGER)%100<>0 OR CAST(substr(NEW.available_on,1,4) AS INTEGER)%400=0) THEN 29 ELSE 28 END
            WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END
        THEN NEW.available_on ELSE json('{"unknown":true}') END,
      /* SPR01_AVAILABLE_ON_END */
      /* PUB06_STRUCTURED_BEGIN */
      'rental_deposit_amount', NEW.rental_deposit_amount,
      'parish_rates_amount', NEW.parish_rates_amount,
      'service_charge_amount', NEW.service_charge_amount,
      'parish_rates_period', NEW.parish_rates_period,
      'service_charge_period', NEW.service_charge_period,
      /* PUB06_STRUCTURED_END */
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


DROP TRIGGER listing_event_update;

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
      /* SPR01_AVAILABLE_ON_BEGIN */
      'available_on', CASE WHEN OLD.available_on IS NULL THEN NULL
        WHEN typeof(OLD.available_on)='text' AND length(OLD.available_on)=10 AND length(CAST(OLD.available_on AS BLOB))=10
          AND OLD.available_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND CAST(substr(OLD.available_on,1,4) AS INTEGER) BETWEEN 1 AND 9999
          AND CAST(substr(OLD.available_on,6,2) AS INTEGER) BETWEEN 1 AND 12
          AND CAST(substr(OLD.available_on,9,2) AS INTEGER) BETWEEN 1 AND CASE CAST(substr(OLD.available_on,6,2) AS INTEGER)
            WHEN 2 THEN CASE WHEN CAST(substr(OLD.available_on,1,4) AS INTEGER)%4=0 AND (CAST(substr(OLD.available_on,1,4) AS INTEGER)%100<>0 OR CAST(substr(OLD.available_on,1,4) AS INTEGER)%400=0) THEN 29 ELSE 28 END
            WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END
        THEN OLD.available_on ELSE json('{"unknown":true}') END,
      /* SPR01_AVAILABLE_ON_END */
      /* PUB06_STRUCTURED_BEGIN */
      'rental_deposit_amount', OLD.rental_deposit_amount,
      'parish_rates_amount', OLD.parish_rates_amount,
      'service_charge_amount', OLD.service_charge_amount,
      'parish_rates_period', OLD.parish_rates_period,
      'service_charge_period', OLD.service_charge_period,
      /* PUB06_STRUCTURED_END */
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
      /* SPR01_AVAILABLE_ON_BEGIN */
      'available_on', CASE WHEN NEW.available_on IS NULL THEN NULL
        WHEN typeof(NEW.available_on)='text' AND length(NEW.available_on)=10 AND length(CAST(NEW.available_on AS BLOB))=10
          AND NEW.available_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND CAST(substr(NEW.available_on,1,4) AS INTEGER) BETWEEN 1 AND 9999
          AND CAST(substr(NEW.available_on,6,2) AS INTEGER) BETWEEN 1 AND 12
          AND CAST(substr(NEW.available_on,9,2) AS INTEGER) BETWEEN 1 AND CASE CAST(substr(NEW.available_on,6,2) AS INTEGER)
            WHEN 2 THEN CASE WHEN CAST(substr(NEW.available_on,1,4) AS INTEGER)%4=0 AND (CAST(substr(NEW.available_on,1,4) AS INTEGER)%100<>0 OR CAST(substr(NEW.available_on,1,4) AS INTEGER)%400=0) THEN 29 ELSE 28 END
            WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END
        THEN NEW.available_on ELSE json('{"unknown":true}') END,
      /* SPR01_AVAILABLE_ON_END */
      /* PUB06_STRUCTURED_BEGIN */
      'rental_deposit_amount', NEW.rental_deposit_amount,
      'parish_rates_amount', NEW.parish_rates_amount,
      'service_charge_amount', NEW.service_charge_amount,
      'parish_rates_period', NEW.parish_rates_period,
      'service_charge_period', NEW.service_charge_period,
      /* PUB06_STRUCTURED_END */
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
    json_patch(json_object(
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
      'feat_evidence', NEW.feat_evidence IS NOT OLD.feat_evidence),
    json_object(
      'rental_deposit_amount', NEW.rental_deposit_amount IS NOT OLD.rental_deposit_amount,
      'parish_rates_amount', NEW.parish_rates_amount IS NOT OLD.parish_rates_amount,
      'service_charge_amount', NEW.service_charge_amount IS NOT OLD.service_charge_amount,
      'parish_rates_period', NEW.parish_rates_period IS NOT OLD.parish_rates_period,
      'service_charge_period', NEW.service_charge_period IS NOT OLD.service_charge_period)) AS changed) d
  WHERE c.listing_id=NEW.id
    AND (EXISTS(SELECT 1 FROM json_each(d.changed) WHERE value=1)
      OR EXISTS(SELECT 1 FROM json_each(c.extra_fields))
      OR c.action IN ('confirmed','published'));
END;

-- Marker is compatibility metadata, not permission or evidence of deployment.
CREATE TABLE pub06_structured_costs (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version=1));
INSERT INTO pub06_structured_costs(singleton,version) VALUES(1,1);
