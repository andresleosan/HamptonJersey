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
