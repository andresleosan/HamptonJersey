// PRE-06: the panel reads every file through the Staff API (behind Access when it is on); /media is the public site's.
export const adminMediaUrl = (id, { thumb = false } = {}) =>
  `/api/admin/media/${encodeURIComponent(id)}/content${thumb ? "?thumb" : ""}`;
