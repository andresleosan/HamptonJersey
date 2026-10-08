-- Order of listings on the home page (carousel, portfolio, Featured blocks), set by dragging rows in the panel. NULL = after the ordered ones.
ALTER TABLE listings ADD COLUMN home_order INTEGER CHECK (home_order IS NULL OR home_order >= 1);
