// Downscale in the browser before upload: the server stores what it gets (max 10 MB) and never re-encodes.
export async function resizeImage(file, max, quality = 0.85) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("couldn't read the image (use JPG, PNG or WebP)"); }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return { blob: await canvas.convertToBlob({ type: "image/jpeg", quality }), width: canvas.width, height: canvas.height };
}
