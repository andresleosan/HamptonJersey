-- Homepage order for promoted listings: 1 shows first and in the hero; NULL means not featured.
ALTER TABLE listings ADD COLUMN featured_rank INTEGER CHECK (featured_rank IS NULL OR featured_rank BETWEEN 1 AND 99);
