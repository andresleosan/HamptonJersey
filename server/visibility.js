// Public media are visual media only. Missing or generic MIME is retained for legacy photos;
// known document types and names are never made public merely by toggling a visibility flag.
const VISUAL_KINDS = new Set(['photo', 'floorplan', 'aerial']);
const VISUAL_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_NAME = /\.(?:pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|csv|html?|xml|svg)$/i;

export const publicMediaTypeAllowed = type => {
  if (type == null || type === '') return true;
  if (typeof type !== 'string') return false;
  const normalized = type.split(';', 1)[0].trim().toLowerCase();
  return normalized === '' || normalized === 'application/octet-stream' || VISUAL_TYPES.has(normalized);
};
const documentName = key => typeof key === 'string' && DOCUMENT_NAME.test(key);

// The one rule for what the public may see. External reference media never qualify
// (also enforced by a CHECK constraint in D1).
export const isPublicMedia = (m, l) =>
  m.origin !== 'external' && m.public === 1 && !!m.r2_key && l.published === 1 && !l.archived_at &&
  VISUAL_KINDS.has(m.kind) && publicMediaTypeAllowed(m.content_type) &&
  !documentName(m.r2_key) && !documentName(m.thumb_key);
