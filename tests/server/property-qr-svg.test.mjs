import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { propertyQrSvg } from '../../server/property-qr-svg.js';
import { createPropertyQrCode, propertyQrUrl } from '../../server/property-qr.js';

const codeA = 'AAAAAAAAAAAAAAAAAAAAAA';
const codeB = 'AAAAAAAAAAAAAAAAAAAAAQ';

test('property QR is a self-contained, deterministic monochrome SVG with a four-module margin', () => {
  const svg = propertyQrSvg(codeA);
  assert.equal(svg, propertyQrSvg(codeA));
  assert.notEqual(svg, propertyQrSvg(codeB));
  const view = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(view);
  const size = Number(view[1]);
  assert.equal(size, Number(view[2]));
  assert.ok(size >= 29 && size <= 185);
  assert.match(svg, /<rect[^>]*fill="#fff"/);
  assert.match(svg, /<path[^>]*fill="#000"/);
  assert.match(svg, /width="30mm" height="30mm"/);
  assert.doesNotMatch(svg, /<(?:script|image|foreignObject)\b|\s(?:href|onload)=/i);
  const path = svg.match(/<path\s+d="([^"]+)"/);
  assert.ok(path);
  const runs = [...path[1].matchAll(/M(\d+),(\d+)h(\d+)v1h-(\d+)z/g)];
  assert.ok(runs.length > 0);
  assert.equal(runs.map(m => m[0]).join(''), path[1]);
  for (const [, x, y, width, back] of runs) {
    assert.equal(width, back);
    assert.ok(Number(x) >= 4 && Number(y) >= 4 && Number(y) < size - 4);
    assert.ok(Number(x) + Number(width) <= size - 4);
  }
});

test('an independent reader decodes the rendered SVG as the exact property URL at correction level M', () => {
  for (const code of [codeA, codeB, ...Array.from({length: 6}, createPropertyQrCode)]) {
    const svg = propertyQrSvg(code), size = Number(svg.match(/viewBox="0 0 (\d+) \d+"/)[1]);
    const path = svg.match(/<path\s+d="([^"]+)"/)[1];
    const scale = 5, width = size * scale, pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (const [, x, y, run] of path.matchAll(/M(\d+),(\d+)h(\d+)v1h-\d+z/g))
      for (let py = Number(y) * scale; py < (Number(y) + 1) * scale; py++)
        for (let px = Number(x) * scale; px < (Number(x) + Number(run)) * scale; px++) {
          const offset = (py * width + px) * 4;
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
        }
    const decoded = jsQR(pixels, width, width);
    assert.equal(decoded?.data, propertyQrUrl(code));
    // The unmasked format information carries the actual error-correction level (M = 00).
    const dark = (x, y) => pixels[((y + 4) * scale * width + (x + 4) * scale) * 4] === 0;
    let format = 0;
    for (let bit = 0; bit <= 5; bit++) if (dark(8, bit)) format |= 1 << bit;
    if (dark(8, 7)) format |= 1 << 6;
    if (dark(8, 8)) format |= 1 << 7;
    if (dark(7, 8)) format |= 1 << 8;
    for (let bit = 9; bit < 15; bit++) if (dark(14 - bit, 8)) format |= 1 << bit;
    assert.equal((format ^ 0x5412) >>> 13, 0);
  }
});

test('property QR rejects arbitrary URLs and malformed codes', () => {
  for (const invalid of [null, '', 'https://example.test/', `${codeA}\n`, `${codeA}"><script/>`])
    assert.throws(() => propertyQrSvg(invalid), TypeError);
});
