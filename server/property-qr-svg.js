import { qrcodegen } from '../shared/vendor/nayuki-qrcodegen.mjs';
import { propertyQrUrl } from './property-qr.js';

// Pure rendering only: callers must establish the authorized, stable association first.
// The input is a canonical QR code, never a caller-supplied URL or SVG fragment.
export function propertyQrSvg(code) {
  const url = propertyQrUrl(code);
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
