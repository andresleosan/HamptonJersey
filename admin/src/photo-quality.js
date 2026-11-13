// Heuristics are suggestions, calibrated against synthetic patterns rather than a quality guarantee.
export const PHOTO_QUALITY_VERSION = '2026-11-v1';
const SIDE = 128, DARK = 25, BRIGHT = 235, CLIPPED_FRACTION = 0.85, SOFT_VARIANCE = 45;

export function analysePhotoPixels(pixels, { width, height, kind = 'photo' }) {
  const warnings = [];
  if (Math.max(width, height) < 1200) warnings.push('resolution');
  const { data, width: w, height: h } = pixels;
  if (kind !== 'floorplan' && w > 0 && h > 0 && data.length === w * h * 4) {
    const light = new Float32Array(w * h);
    let dark = 0, bright = 0;
    for (let i = 0; i < light.length; i++) {
      const j = i * 4, value = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2];
      light[i] = value;
      if (value < DARK) dark++;
      if (value > BRIGHT) bright++;
    }
    if (dark / light.length >= CLIPPED_FRACTION) warnings.push('exposure_dark');
    else if (bright / light.length >= CLIPPED_FRACTION) warnings.push('exposure_bright');
    else if (w >= 3 && h >= 3) {
      let sum = 0, square = 0, n = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        const lap = 4 * light[p] - light[p - 1] - light[p + 1] - light[p - w] - light[p + w];
        sum += lap; square += lap * lap; n++;
      }
      if (square / n - (sum / n) ** 2 < SOFT_VARIANCE) warnings.push('focus');
    }
  }
  return { width, height, warnings, version: PHOTO_QUALITY_VERSION };
}

// The bounded sample is local, does not alter the uploaded bitmap, and is never sent to the server.
export function analysePhoto(bitmap, { kind = 'photo' } = {}) {
  const scale = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return analysePhotoPixels(ctx.getImageData(0, 0, canvas.width, canvas.height), { width: bitmap.width, height: bitmap.height, kind });
}

const MESSAGES = {
  resolution: 'The longest side is under 1,200 px; consider a higher-resolution photo.',
  exposure_dark: 'This photo may be too dark; check its exposure.',
  exposure_bright: 'This photo may be too bright; check its exposure.',
  focus: 'This photo may be soft; check its focus.',
};
export const qualitySuggestions = report => [
  ...report.warnings.map(code => MESSAGES[code]).filter(Boolean),
  ...(report.unavailable ? ['The quality check could not be completed; review the photo.'] : []),
];
