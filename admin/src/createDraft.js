import { api } from "./api.js";
import { uploadPhoto } from "./image.js";
import { qualitySuggestions } from "./photo-quality.js";
import { pickCover } from "../../server/listing-import.js";

// A new draft with its photos, for Add new property (PUB-01) and Properties Queue (PUB-21). photos: { name, kind, label,
// file } or { …, load: () => Promise<Blob> } (fetched when its turn comes). The POST's error is thrown; a photo that
// fails is listed. path: where the draft is created (the queue's own route ties it to its row on the server).
export async function createDraft(body, photos, { alive = () => true, onProgress = () => {}, path = "/admin/listings" } = {}) {
  const { id } = await api(path, { method: "POST", body });
  // One at a time and in order: the server gives each photo the next position as it arrives.
  const uploaded = [], failed = [], qualityWarnings = [];
  for (const [i, p] of photos.entries()) {
    if (!alive()) break; // left the page: stop, and never pull them back to the editor
    onProgress(i, photos.length);
    try {
      let report;
      const media = await uploadPhoto(id, p.file ?? await p.load(), { kind: p.kind, label: p.label, onQuality: value => { report = value; } });
      uploaded.push({ ...p, media });
      const messages = report ? qualitySuggestions(report) : [];
      if (messages.length) qualityWarnings.push({ id: media.id, name: p.name, text: messages.join(" ") });
    }
    catch (x) { failed.push(`${p.name}: ${x.message}`); }
  }
  let coverFailed = false;
  const c = pickCover(uploaded);
  if (alive() && c !== null) {
    try {
      const { listing } = await api(`/admin/listings/${id}`);
      await api(`/admin/listings/${id}/media`, { method: "PUT",
        body: { items: [], cover_media_id: uploaded[c].media.id, updated_at: listing.updated_at } });
    } catch { coverFailed = true; }
  }
  return { id, uploaded: uploaded.length, total: photos.length, failed, coverFailed, qualityWarnings };
}
