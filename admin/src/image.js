import { api } from "./api.js";
import { analysePhoto, PHOTO_QUALITY_VERSION } from "./photo-quality.js";

// Downscale in the browser before upload: the server stores what it gets (max 10 MB) and never re-encodes.
// 6-nov-2026 (Luis): the photo shown in a listing's details keeps its full resolution. Only the browser's canvas limit
// (Safari: 16.7 million pixels) and the server's 10 MB per file can make it smaller, and then by as little as possible.
export const MAX_PIXELS = 16_000_000, MAX_FILE = 9.5 * 1024 * 1024;
export const fullScale = (w, h) => Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));

async function encode(bmp, s, quality) {
  let w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  // Rounding both sides up can cross the agreed canvas limit even when the scale is exact.
  if (w * h > MAX_PIXELS) { w = Math.max(1, Math.floor(bmp.width * s)); h = Math.max(1, Math.floor(bmp.height * s)); }
  if (w * h > MAX_PIXELS) {
    if (w >= h) w = Math.floor(MAX_PIXELS / h); else h = Math.floor(MAX_PIXELS / w);
  }
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  // JPEG has no transparency: without a white ground a transparent PNG (often a floor plan) comes out black.
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return { blob: await canvas.convertToBlob({ type: "image/jpeg", quality }), width: canvas.width, height: canvas.height };
}

// max = longest side in px, or null for the full-resolution copy.
export async function resizeImage(file, max, quality = 0.85, inspect = null) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("couldn't read the image (use JPG, PNG or WebP)"); }
  try {
    inspect?.(bmp);
    let s = max ? Math.min(1, max / Math.max(bmp.width, bmp.height)) : fullScale(bmp.width, bmp.height);
    let out = await encode(bmp, s, quality);
    while (!max && out.blob.size > MAX_FILE && s > 0.2) out = await encode(bmp, (s *= 0.85), quality);
    return out;
  } finally { bmp.close(); }
}

// Panel uploads send canvas-encoded copies. Direct API uploads have separate, currently incomplete metadata validation.
export async function uploadPhoto(listingId, file, { kind = "photo", label = null, onQuality = () => {}, isCurrent = () => true } = {}) {
  if (!isCurrent()) throw new DOMException("Photo upload no longer current", "AbortError");
  if (file.size > 40 * 1024 * 1024) throw new Error("is larger than 40 MB");
  let quality;
  const inspect = bitmap => {
    try { quality = analysePhoto(bitmap, { kind }); }
    catch { quality = { width: bitmap.width, height: bitmap.height, version: PHOTO_QUALITY_VERSION, unavailable: true,
      warnings: Math.max(bitmap.width, bitmap.height) < 1200 ? ["resolution"] : [] }; }
  };
  const [big, small] = await Promise.all([resizeImage(file, null, 0.9, inspect), resizeImage(file, 640, 0.8)]);
  const form = new FormData();
  form.append("file", big.blob, "photo.jpg"); form.append("thumb", small.blob, "thumb.jpg");
  if (label) form.append("label", label);
  form.append("kind", kind); form.append("width", big.width); form.append("height", big.height);
  if (!isCurrent()) throw new DOMException("Photo upload no longer current", "AbortError");
  const media = (await api(`/admin/listings/${listingId}/media`, { method: "POST", form })).media;
  // A presentation callback must never turn a successful upload into a reported failure.
  try { onQuality(quality); } catch { /* the upload has already succeeded */ }
  return media;
}
