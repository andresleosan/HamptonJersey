import { api } from "./api.js";

// Downscale in the browser before upload: the server stores what it gets (max 10 MB) and never re-encodes.
// 6-nov-2026 (Luis): the photo shown in a listing's details keeps its full resolution. Only the browser's canvas limit
// (Safari: 16.7 million pixels) and the server's 10 MB per file can make it smaller, and then by as little as possible.
export const MAX_PIXELS = 16_000_000, MAX_FILE = 9.5 * 1024 * 1024;
export const fullScale = (w, h) => Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));

async function encode(bmp, s, quality) {
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * s)), Math.max(1, Math.round(bmp.height * s)));
  const ctx = canvas.getContext("2d");
  // JPEG has no transparency: without a white ground a transparent PNG (often a floor plan) comes out black.
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return { blob: await canvas.convertToBlob({ type: "image/jpeg", quality }), width: canvas.width, height: canvas.height };
}

// max = longest side in px, or null for the full-resolution copy.
export async function resizeImage(file, max, quality = 0.85) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("couldn't read the image (use JPG, PNG or WebP)"); }
  try {
    let s = max ? Math.min(1, max / Math.max(bmp.width, bmp.height)) : fullScale(bmp.width, bmp.height);
    let out = await encode(bmp, s, quality);
    while (!max && out.blob.size > MAX_FILE && s > 0.2) out = await encode(bmp, (s *= 0.85), quality);
    return out;
  } finally { bmp.close(); }
}

// One photo for a listing (editor and Add new property): only the re-encoded copies go up, so no GPS or other metadata.
export async function uploadPhoto(listingId, file, { kind = "photo", label = null } = {}) {
  if (file.size > 40 * 1024 * 1024) throw new Error("is larger than 40 MB");
  const [big, small] = await Promise.all([resizeImage(file, null, 0.9), resizeImage(file, 640, 0.8)]);
  const form = new FormData();
  form.append("file", big.blob, "photo.jpg"); form.append("thumb", small.blob, "thumb.jpg");
  if (label) form.append("label", label);
  form.append("kind", kind); form.append("width", big.width); form.append("height", big.height);
  return (await api(`/admin/listings/${listingId}/media`, { method: "POST", form })).media;
}
