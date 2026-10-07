// The one rule for what the public may see. External reference media never qualify
// (also enforced by a CHECK constraint in D1).
export const isPublicMedia = (m, l) =>
  m.origin !== "external" && m.public === 1 && !!m.r2_key && l.published === 1 && !l.archived_at;
