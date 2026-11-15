import { qrcodegen } from '../shared/vendor/nayuki-qrcodegen.mjs';

// ANA-10: pure rendering of a window poster's QR, in the panel. Only a listing page with the QR mark, as
// server/poster-qr.js builds it from SITE_URL; anything else throws.
const POSTER = /^https?:\/\/[a-z0-9.-]+(?::\d+)?\/p\/HE-[A-Z]\d{3,}\?src=qr$/;
export function propertyQrSvg(url) {
  if (typeof url !== 'string' || !POSTER.test(url)) throw new TypeError('Invalid poster QR address');
  const segments = qrcodegen.QrSegment.makeSegments(url);
  const qr = qrcodegen.QrCode.encodeSegments(segments, qrcodegen.QrCode.Ecc.MEDIUM, 1, 40, -1, false);
  const margin = 4, size = qr.size + margin * 2, runs = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size;) {
      if (!qr.getModule(x, y)) { x++; continue; }
      const start = x;
      while (x < qr.size && qr.getModule(x, y)) x++;
      const width = x - start;
      runs.push(`M${start + margin},${y + margin}h${width}v1h-${width}z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="30mm" height="30mm" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${runs.join('')}" fill="#000"/></svg>`;
}
