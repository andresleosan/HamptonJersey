INSERT INTO listings (id, use, title, property_type, operation, availability, country, location, bedrooms, bathrooms,
  sale_price, rent, rent_period, premium, currency, price_text, summary, description, tour_url, specs, published, archived_at, created_at, updated_at, updated_by) VALUES
('HE-R001','residential','Le Bernage','House','sale','for_sale','Jersey','St Saviour',3,1,779000,NULL,NULL,NULL,'GBP','£779,000',
 'Semi-detached home' || char(10) || 'Garage and parking','A quiet private development.' || char(10) || 'Close to town.','https://my.matterport.com/show/?m=TEST',
 '[{"group":"Interior","label":"Heating","value":"Oil-fired"}]',1,NULL,'2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import'),
('HE-R002','residential','Trinity rental','Flat','rent','to_let','Jersey','Trinity',2,1,NULL,1900,'month',NULL,'GBP','£1,900 pcm',NULL,'Bright flat.',NULL,'[]',1,NULL,'2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import'),
('HE-R018','residential','Pathfield Road','House','sale','for_sale','United Kingdom','London',4,2,520000,NULL,NULL,NULL,'GBP','£520,000',NULL,'London home.',NULL,'[]',1,NULL,'2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import'),
('HE-C001','commercial','Café and Accommodation','Cafe','business','for_sale','Jersey','St Helier',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Negotiable',NULL,'Going concern.',NULL,'[]',1,NULL,'2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import'),
('HE-R003','residential','Hidden draft','House','sale','sold','Jersey','St Brelade',3,2,650000,NULL,NULL,NULL,'GBP','£650,000',NULL,'Draft.',NULL,'[]',0,NULL,'2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import');
INSERT INTO media (id, listing_id, r2_key, thumb_key, origin, kind, label, public, position, content_type, created_at) VALUES
('A00001','HE-R001','media/hampton/p1.jpg','thumbs/hampton/p1.jpg','hampton','photo','Front',1,0,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00002','HE-R001','media/hampton/p2.jpg','thumbs/hampton/p2.jpg','hampton','photo','Kitchen.png',1,1,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00003','HE-R001','media/hampton/p3.jpg','thumbs/hampton/p3.jpg','hampton','aerial','From above',1,2,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00004','HE-R001','media/hampton/p4.jpg','thumbs/hampton/p4.jpg','hampton','floorplan','Ground floor',1,3,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00005','HE-R001','media/external/x1.jpg','thumbs/external/x1.jpg','external','photo','Other agency',0,4,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00006','HE-R002','media/hampton/p5.jpg','thumbs/hampton/p5.jpg','hampton','photo','Flat',1,0,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00007','HE-R018','media/hampton/p6.jpg','thumbs/hampton/p6.jpg','hampton','photo','London',1,0,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00008','HE-C001','media/hampton/p7.jpg','thumbs/hampton/p7.jpg','hampton','photo','Café',1,0,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00009','HE-R003','media/hampton/p8.jpg','thumbs/hampton/p8.jpg','hampton','photo','Draft photo',1,0,'image/jpeg','2026-10-07T00:00:00.000Z');
UPDATE listings SET cover_media_id = 'A00002' WHERE id = 'HE-R001';
-- F1-A inventory to match, as right after migration 0009: parish and features still unread (features_at NULL), so
-- "Recalculate all" reads them from the text. Four drafts made in the panel (offered by default) and one agency
-- listing archived on 7-oct but still co-listed, so still offered. The text exercises the features: a furnished rent with
-- a balcony (St Helier through Havre des Pas), a yearly rent that says no pets, a house with parking for 2 (St Brelade
-- through St Aubin), a pet-friendly cottage whose place is no parish (Gorey: area Unknown) and a specs row for parking.
INSERT INTO listings (id, use, title, property_type, operation, availability, country, location, bedrooms, bathrooms,
  sale_price, rent, rent_period, currency, price_text, summary, description, specs, published, matchable, archived_at,
  created_at, updated_at, updated_by) VALUES
('HE-R004','residential','Havre des Pas apartment','Apartment','rent','to_let','Jersey','Havre des Pas',2,1,NULL,2100,'month',
 'GBP','£2,100 pcm','Fully furnished, sea views','Fully furnished two-bedroom apartment on the seafront with a balcony.'
 || char(10) || 'Pets considered. One allocated parking space.','[]',0,1,NULL,
 '2026-10-22T09:00:00.000Z','2026-10-22T09:00:00.000Z','luismadef45@gmail.com'),
('HE-R005','residential','Town flat near the Parade','Flat','rent','to_let','Jersey','St Helier',2,1,NULL,21600,'year',
 'GBP','£21,600 per annum',NULL,'Unfurnished two-bedroom flat close to town, with a communal garden. No pets.','[]',0,1,NULL,
 '2026-10-22T09:10:00.000Z','2026-10-22T09:10:00.000Z','luismadef45@gmail.com'),
('HE-R006','residential','St Aubin family house','House','sale','for_sale','Jersey','St Aubin',4,2,695000,NULL,NULL,
 'GBP','£695,000','Detached, four bedrooms','Detached family house with a south-facing garden and parking for 2 cars.','[]',0,1,NULL,
 '2026-10-22T09:20:00.000Z','2026-10-22T09:20:00.000Z','luismadef45@gmail.com'),
('HE-R007','residential','Gorey harbour cottage','Cottage','rent','to_let','Jersey','Gorey',3,1,NULL,1950,'month',
 'GBP','£1,950 pcm',NULL,'Pet friendly cottage a short walk from the harbour. Garage.','[]',0,1,NULL,
 '2026-10-22T09:30:00.000Z','2026-10-22T09:30:00.000Z','luismadef45@gmail.com'),
('HE-R040','residential','Millbrook stone cottage','Cottage','sale','for_sale','Jersey','Millbrook',3,1,640000,NULL,NULL,
 'GBP','£640,000',NULL,'Granite cottage with a sunny patio, marketed jointly with another agency.',
 '[{"group":"Outside","label":"Parking Spaces","value":"2"}]',0,1,'2026-10-07T00:00:00.000Z',
 '2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import');
INSERT INTO media (id, listing_id, r2_key, thumb_key, origin, kind, label, public, position, content_type, created_at) VALUES
('A00010','HE-R004','media/hampton/p5.jpg','thumbs/hampton/p5.jpg','hampton','photo','Living room',1,0,'image/jpeg','2026-10-22T09:00:00.000Z'),
('A00011','HE-R040','media/hampton/p6.jpg','thumbs/hampton/p6.jpg','hampton','photo','Front',1,0,'image/jpeg','2026-10-07T00:00:00.000Z');
-- Migration 0009 offers every published listing (B9).
UPDATE listings SET matchable = 1 WHERE published = 1;
-- Jersey fields (spec 2026-10-25 J1-J3): Le Bernage keeps a legacy tenure text that 0015 leaves unread (shown as
-- "Was: …" in the editor and as the tenure on the website), and the town flat is a Qualified home.
UPDATE listings SET tenure = 'Freehold / share transfer' WHERE id = 'HE-R001';
UPDATE listings SET housing_category = 'qualified' WHERE id = 'HE-R005';
-- F0 applicants: one To Let from the website (open "New applicant" notice), one To Buy entered by the team (Feed only),
-- a pending "registered again" from the To Buy contact (flat submission, as the public API receives it) and a new
-- viewing request from the same contact, so it shows in the Inbox and on his Timeline.
INSERT INTO contacts (id, name, email, phone, preferred_channel, best_time, privacy_ack_at, marketing_opt_in_at, consent_source,
  last_activity_at, created_at, updated_at, updated_by) VALUES
(1,'Sarah Vibert','sarah.vibert@example.je','+447797111222','whatsapp','After 6pm','2026-10-20T09:00:00.000Z',NULL,'web',
 '2026-10-20T09:00:00.000Z','2026-10-20T09:00:00.000Z','2026-10-20T09:00:00.000Z','public'),
(2,'Tom Renouf','tom.renouf@example.je','+447700900321','call',NULL,'2026-10-21T10:00:00.000Z',NULL,'phone',
 '2026-10-22T18:30:00.000Z','2026-10-21T10:00:00.000Z','2026-10-21T10:00:00.000Z','luismadef45@gmail.com');
INSERT INTO applicants (id, contact_id, operation, stage, source, assigned_to, budget_min, budget_max, property_types, bedrooms_min,
  parking_spaces, outdoor, furnished, pets, parishes_wanted, move_in_date, lease_term_months, buyer_position, mortgage_aip,
  housing_status, household_adults, household_children, requirements, created_at, updated_at, updated_by) VALUES
(1,1,'rent','new','web',NULL,NULL,2200,'["flat","house"]',2,1,NULL,'either','[{"kind":"dog","count":1}]','["St Helier","St Saviour"]',
 '2026-12-01',12,NULL,NULL,'entitled',2,0,NULL,'2026-10-20T09:00:00.000Z','2026-10-20T09:00:00.000Z','public'),
(2,2,'buy','searching','phone','luismadef45@gmail.com',500000,750000,'["house"]',3,2,'["garden"]',NULL,NULL,'["St Brelade","St Lawrence"]',
 NULL,NULL,'needs_to_sell','in_progress','entitled',2,1,'Quiet road, room for a home office','2026-10-21T10:00:00.000Z',
 '2026-10-21T10:00:00.000Z','luismadef45@gmail.com');
-- F1-A: a To Let search with no pets that wants a furnished flat with a balcony in St Helier and never St Ouen.
INSERT INTO contacts (id, name, email, phone, preferred_channel, best_time, privacy_ack_at, marketing_opt_in_at, consent_source,
  last_activity_at, created_at, updated_at, updated_by) VALUES
(3,'Claire Le Sueur','claire.lesueur@example.je',NULL,'email',NULL,'2026-10-22T11:00:00.000Z',NULL,'email',
 '2026-10-22T11:00:00.000Z','2026-10-22T11:00:00.000Z','2026-10-22T11:00:00.000Z','luismadef45@gmail.com');
INSERT INTO applicants (id, contact_id, operation, stage, source, assigned_to, budget_min, budget_max, property_types, bedrooms_min,
  parking_spaces, outdoor, furnished, pets, parishes_wanted, parishes_excluded, move_in_date, lease_term_months, housing_status,
  household_adults, household_children, created_at, updated_at, updated_by) VALUES
(3,3,'rent','searching','email','luismadef45@gmail.com',1500,2300,'["flat"]',2,0,'["balcony"]','yes','[{"kind":"none"}]',
 '["St Helier"]','["St Ouen"]','2026-11-15',12,'licensed',1,0,'2026-10-22T11:00:00.000Z','2026-10-22T11:00:00.000Z',
 'luismadef45@gmail.com');
-- Jersey fields: a To Let search with Registered status (value standard) that fits the Qualified town flat (HE-R005) in every other way,
-- so the housing check alone keeps them apart (Claire Le Sueur, Licensed, is matched with it).
INSERT INTO contacts (id, name, email, phone, preferred_channel, best_time, privacy_ack_at, marketing_opt_in_at, consent_source,
  last_activity_at, created_at, updated_at, updated_by) VALUES
(6,'Daniel Hamon','daniel.hamon@example.je',NULL,'email',NULL,'2026-10-22T13:00:00.000Z',NULL,'email',
 '2026-10-22T13:00:00.000Z','2026-10-22T13:00:00.000Z','2026-10-22T13:00:00.000Z','luismadef45@gmail.com');
INSERT INTO applicants (id, contact_id, operation, stage, source, assigned_to, budget_max, property_types, bedrooms_min,
  parishes_wanted, housing_status, household_adults, household_children, created_at, updated_at, updated_by) VALUES
(6,6,'rent','searching','email','luismadef45@gmail.com',2000,'["flat"]',2,'["St Helier"]','standard',1,0,
 '2026-10-22T13:00:00.000Z','2026-10-22T13:00:00.000Z','luismadef45@gmail.com');
-- F3-A: a viewing in each state, dated from the day the seed is loaded so they never go stale. Upcoming ones fall on a
-- weekday (inside the seeded hours) at least two days ahead; 'weekday N' is the next such day (Tue 2 … Fri 5).
INSERT INTO viewing_requests (id, listing_id, listing_ref, listing_title_snapshot, agent, negotiator_id, kind, date, time, end_time,
  name, email, phone, status, outcome, outcome_note, created_at) VALUES
(1,'HE-R001','HE-R001','Le Bernage','Joshua Franco',(SELECT id FROM negotiators WHERE name = 'Joshua Franco'),'In person',
 date('now','+2 days','weekday 2'),'10:00','10:30','Tom Renouf','tom.renouf@example.je','07700 900321','requested',NULL,NULL,'2026-10-22T14:00:00.000Z'),
(2,'HE-C001','HE-C001','Café and Accommodation','Gilberto Franco',(SELECT id FROM negotiators WHERE name = 'Gilberto Franco'),'In person',
 date('now','+2 days','weekday 3'),'11:00','11:30','Paul Le Feuvre','paul.lefeuvre@example.je',NULL,'confirmed',NULL,NULL,'2026-10-21T09:30:00.000Z'),
(3,'HE-R002','HE-R002','Trinity rental','Gilberto Franco',(SELECT id FROM negotiators WHERE name = 'Gilberto Franco'),'Live video call',
 date('now','-1 day'),'14:00','14:30','Ann Mourant',NULL,'07797 400500','confirmed',NULL,NULL,'2026-10-19T16:00:00.000Z'),
(4,'HE-R001','HE-R001','Le Bernage','Joshua Franco',(SELECT id FROM negotiators WHERE name = 'Joshua Franco'),'In person',
 date('now','-3 days'),'11:00','11:30','Mark Querée','mark.queree@example.je',NULL,'completed','proceed',
 'Wants a second viewing with their partner','2026-10-15T10:00:00.000Z'),
(5,'HE-R002','HE-R002','Trinity rental','Joshua Franco',(SELECT id FROM negotiators WHERE name = 'Joshua Franco'),'In person',
 date('now','-4 days'),'15:00','15:30','Lucy Bisson','lucy.bisson@example.je',NULL,'no_show',NULL,NULL,'2026-10-14T12:00:00.000Z'),
(6,'HE-R018','HE-R018','Pathfield Road','Joshua Franco',(SELECT id FROM negotiators WHERE name = 'Joshua Franco'),'Live video call',
 date('now','+2 days','weekday 4'),'10:00','10:30','Ben Gallichan','ben.gallichan@example.je',NULL,'cancelled',NULL,NULL,'2026-10-18T08:00:00.000Z');
-- Gilberto is away one day: no website times that date.
INSERT INTO negotiator_exceptions (negotiator_id, date, kind, note, created_at, created_by) VALUES
((SELECT id FROM negotiators WHERE name = 'Gilberto Franco'),date('now','+2 days','weekday 5'),'block','Holiday',
 '2026-10-22T09:00:00.000Z','luismadef45@gmail.com');
INSERT INTO events (id, at, actor, entity_type, entity_id, type, data) VALUES
(1,'2026-10-20T09:00:00.000Z','public','applicant','1','applicant.created','{"operation":"rent","source":"web"}'),
(2,'2026-10-21T10:00:00.000Z','luismadef45@gmail.com','applicant','2','applicant.created','{"operation":"buy","source":"phone"}'),
(3,'2026-10-22T14:00:00.000Z','public','viewing','1','viewing.requested',
 '{"listing_id":"HE-R001","date":"' || date('now','+2 days','weekday 2') || '","time":"10:00","kind":"In person"}'),
(4,'2026-10-22T18:30:00.000Z','public','contact','2','applicant.duplicate_submitted',
 '{"operation":"buy","name":"Tom Renouf","email":"tom.renouf@example.je","phone":"+447700900321","preferred_channel":"whatsapp","best_time":"Weekday mornings","budget_max":800000,"property_types":["house","cottage"],"bedrooms_min":4,"parking_spaces":2,"outdoor":["garden"],"parishes_wanted":["St Brelade","St Lawrence","St Peter"],"buyer_position":"needs_to_sell","mortgage_aip":"yes","housing_status":"entitled","requirements":"Quiet road, room for a home office","privacy":true,"marketing":true}'),
(5,'2026-10-22T11:00:00.000Z','luismadef45@gmail.com','applicant','3','applicant.created','{"operation":"rent","source":"email"}');
INSERT INTO notifications (id, event_id, category, title, action_required, created_at) VALUES
(1,1,'new_applicant','New applicant: Sarah Vibert · To Let',1,'2026-10-20T09:00:00.000Z'),
(2,2,'new_applicant','New applicant: Tom Renouf · To Buy',0,'2026-10-21T10:00:00.000Z'),
(3,3,'viewing','Viewing request: Tom Renouf',1,'2026-10-22T14:00:00.000Z'),
(4,4,'new_applicant','Tom Renouf registered again',1,'2026-10-22T18:30:00.000Z'),
(5,5,'new_applicant','New applicant: Claire Le Sueur · To Let',0,'2026-10-22T11:00:00.000Z');
-- F7-A: website opens a day ago and forty days ago, so 30 and 90 days differ. The owner report's weekly bars: a few more
-- of Le Bernage's within the last two weeks.
INSERT INTO daily_stats (day, listing_id, metric, n) VALUES
(date('now','-1 day'),'HE-R001','view',12),(date('now','-1 day'),'HE-R001','photos',5),(date('now','-1 day'),'HE-R001','tour',3),
(date('now','-3 day'),'HE-R001','view',8),(date('now','-3 day'),'HE-R001','photos',3),(date('now','-9 day'),'HE-R001','view',5),
(date('now','-9 day'),'HE-R001','tour',1),(date('now','-13 day'),'HE-R001','view',6),
(date('now','-1 day'),'HE-R002','view',4),(date('now','-1 day'),'HE-R002','photos',2),
(date('now','-40 day'),'HE-R001','view',7),(date('now','-40 day'),'HE-R002','view',9),(date('now','-40 day'),'HE-R002','photos',1);
-- F3-C: a published listing for sale and a buyer used only by the offer-to-completion flow, so HE-R001 stays for sale
-- for every other check.
INSERT INTO listings (id, use, title, property_type, operation, availability, country, location, bedrooms, bathrooms,
  sale_price, currency, price_text, description, specs, published, matchable, archived_at, created_at, updated_at, updated_by) VALUES
('HE-R050','residential','Rozel Bay house','House','sale','for_sale','Jersey','St Martin',3,2,850000,'GBP','£850,000',
 'Granite house above Rozel Bay.','[]',1,1,NULL,'2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import');
INSERT INTO media (id, listing_id, r2_key, thumb_key, origin, kind, label, public, position, content_type, created_at) VALUES
('A00012','HE-R050','media/hampton/p1.jpg','thumbs/hampton/p1.jpg','hampton','photo','Front',1,0,'image/jpeg','2026-10-07T00:00:00.000Z');
INSERT INTO contacts (id, name, email, phone, preferred_channel, best_time, privacy_ack_at, marketing_opt_in_at, consent_source,
  last_activity_at, created_at, updated_at, updated_by) VALUES
(4,'Helen Picot','helen.picot@example.je','+447700900456','email',NULL,'2026-10-22T12:00:00.000Z',NULL,'phone',
 '2026-10-22T12:00:00.000Z','2026-10-22T12:00:00.000Z','2026-10-22T12:00:00.000Z','luismadef45@gmail.com');
INSERT INTO applicants (id, contact_id, operation, stage, source, assigned_to, budget_max, property_types, bedrooms_min,
  parishes_wanted, buyer_position, mortgage_aip, housing_status, household_adults, household_children, created_at, updated_at, updated_by) VALUES
(4,4,'buy','viewing','phone','luismadef45@gmail.com',900000,'["house"]',3,'["St Martin"]','nothing_to_sell','yes','entitled',2,0,
 '2026-10-22T12:00:00.000Z','2026-10-22T12:00:00.000Z','luismadef45@gmail.com');
INSERT INTO events (id, at, actor, entity_type, entity_id, type, data) VALUES
(6,'2026-10-22T12:00:00.000Z','luismadef45@gmail.com','applicant','4','applicant.created','{"operation":"buy","source":"phone"}');
-- G2 (E8): a contact last active 11 and a half months ago, dated from the day the seed is loaded, so it is Expiring: the
-- 12-month pass deletes it in about two weeks. Its To Let search fits no listing.
INSERT INTO contacts (id, name, email, phone, preferred_channel, best_time, privacy_ack_at, marketing_opt_in_at, consent_source,
  last_activity_at, created_at, updated_at, updated_by) VALUES
(5,'Rachel Le Cornu','rachel.lecornu@example.je',NULL,'email',NULL,NULL,NULL,'phone',
 strftime('%Y-%m-%dT%H:%M:%fZ','now','-11 months','-15 days'),'2025-10-01T09:00:00.000Z','2025-10-01T09:00:00.000Z','luismadef45@gmail.com');
INSERT INTO applicants (id, contact_id, operation, stage, source, assigned_to, budget_max, property_types, bedrooms_min,
  parishes_wanted, housing_status, household_adults, household_children, created_at, updated_at, updated_by) VALUES
(5,5,'rent','searching','phone',NULL,600,'["flat"]',1,'["St Ouen"]','entitled',1,0,
 '2025-10-01T09:00:00.000Z','2025-10-01T09:00:00.000Z','luismadef45@gmail.com');
-- F5-A managed rentals, dated from the day the seed is loaded. A full-management property whose tenant hasn't paid the
-- first two months (the oldest unpaid charge a month and more old, so the Formal letter step is due) and whose gas check
-- ran out ten days ago; a let-only flat whose fixed term ends in 60 days (Renewal due); and a deposit the bank import
-- couldn't match. Every other check is recorded and in date, and the deposits and check-ins are done.
INSERT INTO landlords (id, name, email, phone, approval_limit, notes, created_at, created_by, updated_at, updated_by) VALUES
(1,'Margaret Le Brun','margaret.lebrun@example.je','07797 711222',500,NULL,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com','2026-09-01T09:00:00.000Z','luismadef45@gmail.com'),
(2,'Peter Gallienne','peter.gallienne@example.je',NULL,NULL,NULL,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com','2026-09-01T09:00:00.000Z','luismadef45@gmail.com');
INSERT INTO rentals (id, landlord_id, address, parish, service, fee_percent, has_gas, notes, created_at, created_by, updated_at, updated_by) VALUES
(1,1,'Rose Cottage, La Rue du Moulin','St Lawrence','full',10,1,NULL,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com','2026-09-01T09:00:00.000Z','luismadef45@gmail.com'),
(2,2,'Flat 2, 14 Bath Street','St Helier','let_only',NULL,0,NULL,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com','2026-09-01T09:00:00.000Z','luismadef45@gmail.com');
INSERT INTO compliance_items (rental_id, kind, done_on, expires_on, note, updated_at, updated_by) VALUES
(1,'licence',date('now','-6 months'),date('now','-6 months','+2 years'),NULL,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com'),
(1,'eicr',date('now','-1 year'),date('now','-1 year','+5 years'),NULL,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com'),
(1,'gas',date('now','-10 days','-1 year'),date('now','-10 days'),NULL,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com'),
(1,'alarms',date('now','-2 months'),date('now','-2 months','+1 year'),NULL,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com'),
(2,'licence',date('now','-3 months'),date('now','-3 months','+2 years'),NULL,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com'),
(2,'eicr',date('now','-2 years'),date('now','-2 years','+5 years'),NULL,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com'),
(2,'alarms',date('now','-4 months'),date('now','-4 months','+1 year'),NULL,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com');
INSERT INTO tenancies (id, rental_id, payment_ref, tenant_name, tenant_email, tenant_phone, kind, regime, start_on, end_on, rent, due_day,
  deposit, deposit_received_on, deposit_protected_on, deposit_ref, inventory_in_on, collect_from, created_at, created_by, updated_at, updated_by) VALUES
(1,1,'HE-T0001','James Vautier','james.vautier@example.je','07700 900777','periodic','2025',date('now','-8 days','-1 month'),NULL,1250,
 min(CAST(strftime('%d',date('now','-8 days','-1 month')) AS INTEGER),28),1250,date('now','-8 days','-1 month'),
 date('now','-8 days','-1 month','+10 days'),'MD-48213',date('now','-8 days','-1 month'),date('now','-8 days','-1 month'),
 '2026-09-01T09:00:00.000Z','luismadef45@gmail.com','2026-09-01T09:00:00.000Z','luismadef45@gmail.com'),
(2,2,'HE-T0002','Sophie Martin','sophie.martin@example.je',NULL,'fixed','2011',date('now','+60 days','-1 year'),date('now','+60 days'),1900,1,
 1900,date('now','+60 days','-1 year'),date('now','+60 days','-1 year','+7 days'),'MD-39114',date('now','+60 days','-1 year'),NULL,
 '2026-09-01T09:00:00.000Z','luismadef45@gmail.com','2026-09-01T09:00:00.000Z','luismadef45@gmail.com');
INSERT INTO rent_changes (tenancy_id, effective_on, rent, created_at, created_by) VALUES
(1,date('now','-8 days','-1 month'),1250,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com'),
(2,date('now','+60 days','-1 year'),1900,'2026-09-01T09:00:00.000Z','luismadef45@gmail.com');
INSERT INTO payments (id, tenancy_id, received_on, amount, description, kind, source, created_at, created_by) VALUES
(1,NULL,date('now','-2 days'),190000,'S MARTIN DEPOSIT FLAT 2 BATH ST','rent','import','2026-10-22T09:00:00.000Z','luismadef45@gmail.com');
-- ADM-04: two listings on the website left unconfirmed for 4 months (a sale and a business), so the panel asks for a
-- call to their owners.
UPDATE listings SET confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 months') WHERE id IN ('HE-R018', 'HE-C001');
