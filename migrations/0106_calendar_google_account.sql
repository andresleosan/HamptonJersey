-- VIS-12 review (M1): the Google account each negotiator's calendar was connected with (the verified address in Google's
-- ID token), shown in Settings. Additive; read only with VIS12_CALENDAR_READY = "1", after 0105.
ALTER TABLE calendar_connections ADD COLUMN google_email TEXT CHECK (google_email IS NULL OR length(google_email) <= 320);
