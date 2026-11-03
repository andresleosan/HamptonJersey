import { api } from "./api.js";

// Downscale in the browser before upload: the server stores what it gets (max 10 MB) and never re-encodes.
export async function resizeImage(file, max, quality = 0.85) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("couldn't read the image (use JPG, PNG or WebP)"); }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
  const ctx = canvas.getContext("2d");
  // JPEG has no transparency: without a white ground a transparent PNG (often a floor plan) comes out black.
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return { blob: await canvas.convertToBlob({ type: "image/jpeg", quality }), width: canvas.width, height: canvas.height };
}

// One photo for a listing (editor and Add new property): only the re-encoded copies go up, so no GPS or other metadata.
export async function uploadPhoto(listingId, file, { kind = "photo", label = null } = {}) {
  if (file.size > 40 * 1024 * 1024) throw new Error("is larger than 40 MB");
  const [big, small] = await Promise.all([resizeImage(file, 1600), resizeImage(file, 640, 0.8)]);
  const form = new FormData();
  form.append("file", big.blob, "photo.jpg"); form.append("thumb", small.blob, "thumb.jpg");
  if (label) form.append("label", label);
  form.append("kind", kind); form.append("width", big.width); form.append("height", big.height);
  return (await api(`/admin/listings/${listingId}/media`, { method: "POST", form })).media;
}
