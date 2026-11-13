// `updated_at` is also the contact's optimistic-lock token. Compute its next
// value from the row inside the write, including when clocks repeat or move back.
// Two clock parameters contain the same canonical UTC time. A malformed legacy
// token cannot be safely parsed: extend it instead of inventing its past date.
export const CONTACT_NEXT_VERSION = `CASE
  WHEN strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds') IS NULL THEN updated_at || '!'
  WHEN julianday(updated_at) >= julianday(?) THEN strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds')
  ELSE ? END`;
