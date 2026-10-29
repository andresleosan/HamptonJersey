-- VIS-02: the team's corrections to a listing's interest count (C10), kept on each viewing of the person. Removed: when,
-- why (a closed list) and an optional note, required for 'other'. Joined ("Counted twice"): the key of the person the
-- viewing counts as, an email or a phone's last 10 digits. Each column's CHECK names only columns added before it.
ALTER TABLE viewing_requests ADD COLUMN interest_removed_at TEXT;
ALTER TABLE viewing_requests ADD COLUMN interest_reason TEXT
  CHECK ((interest_reason IS NULL) = (interest_removed_at IS NULL)
    AND (interest_reason IS NULL OR interest_reason IN ('no_longer_interested','not_buyer','other')));
ALTER TABLE viewing_requests ADD COLUMN interest_note TEXT
  CHECK ((interest_note IS NULL OR (interest_reason IS NOT NULL AND length(interest_note) <= 200))
    AND (interest_reason IS NOT 'other' OR interest_note IS NOT NULL));
ALTER TABLE viewing_requests ADD COLUMN interest_same_as TEXT
  CHECK (interest_same_as IS NULL OR length(interest_same_as) BETWEEN 1 AND 254);
