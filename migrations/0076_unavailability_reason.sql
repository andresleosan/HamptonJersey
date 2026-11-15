-- EST-15: why a property was confirmed not available, kept in the confirmation itself (0072) with its date, source,
-- channel, evidence, scope and who recorded it. Read and written by server/availability-confirmations.js with
-- EST15_UNAVAILABILITY_READY=1; the website never reads this table.
-- Additive: one nullable column; no existing row changes (the confirmations recorded before it have no reason) and
-- the append-only trigger of 0072 stays as it is.
ALTER TABLE availability_confirmations ADD COLUMN reason TEXT
  CHECK(reason IS NULL OR (status = 'unavailable' AND reason IN ('sold','let','under_offer','withdrawn','other')));
