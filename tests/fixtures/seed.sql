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
INSERT INTO viewing_requests (id, listing_id, listing_ref, listing_title_snapshot, agent, kind, date, time, name, email, phone, status, created_at) VALUES
(1,'HE-R001','HE-R001','Le Bernage',NULL,'In person','2026-10-28','10:00','Tom Renouf','tom.renouf@example.je','07700 900321','new','2026-10-22T14:00:00.000Z');
INSERT INTO events (id, at, actor, entity_type, entity_id, type, data) VALUES
(1,'2026-10-20T09:00:00.000Z','public','applicant','1','applicant.created','{"operation":"rent","source":"web"}'),
(2,'2026-10-21T10:00:00.000Z','luismadef45@gmail.com','applicant','2','applicant.created','{"operation":"buy","source":"phone"}'),
(3,'2026-10-22T14:00:00.000Z','public','viewing','1','viewing.requested','{"listing_id":"HE-R001","date":"2026-10-28","time":"10:00","kind":"In person"}'),
(4,'2026-10-22T18:30:00.000Z','public','contact','2','applicant.duplicate_submitted',
 '{"operation":"buy","name":"Tom Renouf","email":"tom.renouf@example.je","phone":"+447700900321","preferred_channel":"whatsapp","best_time":"Weekday mornings","budget_max":800000,"property_types":["house","cottage"],"bedrooms_min":4,"parking_spaces":2,"outdoor":["garden"],"parishes_wanted":["St Brelade","St Lawrence","St Peter"],"buyer_position":"needs_to_sell","mortgage_aip":"yes","housing_status":"entitled","requirements":"Quiet road, room for a home office","privacy":true,"marketing":true}');
INSERT INTO notifications (id, event_id, category, title, action_required, created_at) VALUES
(1,1,'new_applicant','New applicant: Sarah Vibert · To Let',1,'2026-10-20T09:00:00.000Z'),
(2,2,'new_applicant','New applicant: Tom Renouf · To Buy',0,'2026-10-21T10:00:00.000Z'),
(3,3,'viewing','Viewing request: Tom Renouf',1,'2026-10-22T14:00:00.000Z'),
(4,4,'new_applicant','Tom Renouf registered again',1,'2026-10-22T18:30:00.000Z');
