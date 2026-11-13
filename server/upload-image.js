import { fail } from './http.js';

const MAX_BYTES = 10 * 1024 * 1024, MAX_PIXELS = 16_000_000;
const invalid = () => fail(400, 'The photo file is invalid or unsupported. Use JPG, PNG or WebP.');
const metadata = () => fail(400, 'Photo metadata is not accepted. Upload the image through Photos to remove it.');
const ascii = (b, p, n) => String.fromCharCode(...b.subarray(p, p + n));
const u16 = (b, p) => b[p] * 256 + b[p + 1];
const le16 = (b, p) => b[p] + b[p + 1] * 256;
const u32 = (b, p) => b[p] * 0x1000000 + b[p + 1] * 0x10000 + b[p + 2] * 256 + b[p + 3];
const le24 = (b, p) => b[p] + b[p + 1] * 256 + b[p + 2] * 0x10000;
const le32 = (b, p) => le24(b, p) + b[p + 3] * 0x1000000;

function dimensions(width, height, thumbnail) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) invalid();
  if (width * height > MAX_PIXELS) fail(413, 'The photo exceeds 16 million pixels. Upload it through Photos to resize it.');
  if (thumbnail && Math.max(width, height) > 640) fail(400, 'The thumbnail must be at most 640 pixels per side.');
  return { width, height };
}

// This checks container structure, dimensions and permitted metadata. It deliberately does
// not decode JPEG entropy, PNG deflate or WebP pixels, nor claim that arbitrary pixel data
// or ICC profiles are safe. The panel re-encodes images before calling this upload route.
export function inspectUploadImage(buffer, { thumbnail = false } = {}) {
  let b;
  if (buffer instanceof ArrayBuffer) b = new Uint8Array(buffer);
  else if (ArrayBuffer.isView(buffer)) b = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  else invalid();
  if (b.length > MAX_BYTES) fail(413, 'The photo is larger than 10 MB');
  if (b[0] === 0xff && b[1] === 0xd8) return { contentType: 'image/jpeg', extension: 'jpg', ...jpeg(b, thumbnail) };
  if (b.length >= 8 && ascii(b, 0, 8) === '\x89PNG\r\n\x1a\n') return { contentType: 'image/png', extension: 'png', ...png(b, thumbnail) };
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP')
    return { contentType: 'image/webp', extension: 'webp', ...webp(b, thumbnail) };
  invalid();
}

function jpeg(b, thumbnail) {
  let p = 2, frame, progressive = false, scans = 0, restart = 0;
  const components = new Map(), quant = new Set(), dc = new Set(), ac = new Set(), initial = new Set();
  while (p < b.length) {
    if (b[p++] !== 0xff) invalid();
    while (b[p] === 0xff) p++;
    const code = b[p++];
    if (code === 0xd9) {
      if (!frame || !scans || initial.size !== components.size || p !== b.length) invalid();
      return frame;
    }
    if (code === undefined || code === 0 || code === 0xd8 || (code >= 0xd0 && code <= 0xd7) || p + 2 > b.length) invalid();
    const length = u16(b, p), start = p + 2, end = p + length;
    if (length < 2 || end > b.length) invalid();
    const n = length - 2;
    if (code >= 0xe0 && code <= 0xef || code === 0xfe) {
      // JFIF and Adobe have fixed numeric fields. Embedded thumbnails, profiles,
      // EXIF/XMP/IPTC, comments and all other application payloads are rejected.
      if (code === 0xe0 && n === 14 && ascii(b, start, 5) === 'JFIF\0' && b[start + 5] === 1 &&
          b[start + 6] <= 2 && b[start + 7] <= 2 && b[start + 12] === 0 && b[start + 13] === 0) { /* fixed JFIF header */ }
      else if (code === 0xee && n === 12 && ascii(b, start, 5) === 'Adobe' && b[start + 11] <= 2) { /* fixed Adobe colour transform */ }
      else metadata();
    } else if (code === 0xc0 || code === 0xc1 || code === 0xc2) {
      if (frame || n < 6 || b[start] !== 8) invalid();
      const count = b[start + 5];
      if (![1, 3, 4].includes(count) || n !== 6 + 3 * count) invalid();
      frame = dimensions(u16(b, start + 3), u16(b, start + 1), thumbnail); progressive = code === 0xc2;
      for (let c = start + 6; c < end; c += 3) {
        const sampling = b[c + 1];
        if (components.has(b[c]) || !(sampling >> 4) || (sampling >> 4) > 4 || !(sampling & 15) || (sampling & 15) > 4 || b[c + 2] > 3) invalid();
        components.set(b[c], b[c + 2]);
      }
    } else if (code === 0xdb) {
      if (!n) invalid();
      for (let q = start; q < end;) {
        const info = b[q++], precision = info >> 4;
        if (precision > 1 || (info & 15) > 3 || q + 64 * (precision + 1) > end) invalid();
        for (let i = 0; i < 64; i++, q += precision + 1) if ((precision ? u16(b, q) : b[q]) === 0) invalid();
        quant.add(info & 15);
      }
    } else if (code === 0xc4) {
      if (!n) invalid();
      for (let h = start; h < end;) {
        if (h + 17 > end) invalid();
        const info = b[h++];
        if ((info >> 4) > 1 || (info & 15) > 3) invalid();
        let count = 0;
        for (let i = 0; i < 16; i++) count += b[h++];
        if (!count || count > 256 || h + count > end) invalid();
        (info >> 4 ? ac : dc).add(info & 15); h += count;
      }
    } else if (code === 0xdd) {
      if (n !== 2) invalid();
      restart = u16(b, start);
    } else if (code === 0xda) {
      const count = b[start];
      if (!frame || !count || count > components.size || n !== 4 + 2 * count) invalid();
      const ss = b[end - 3], se = b[end - 2], ah = b[end - 1] >> 4, al = b[end - 1] & 15;
      if (!progressive && (ss !== 0 || se !== 63 || ah !== 0 || al !== 0)) invalid();
      if (progressive && (ss > 63 || se < ss || se > 63 || (ss === 0 && se !== 0) || (ss > 0 && count !== 1) ||
          ah > 13 || al > 13 || (ah !== 0 && ah !== al + 1))) invalid();
      const seen = new Set();
      for (let c = start + 1; c < end - 3; c += 2) {
        const id = b[c], tables = b[c + 1], d = tables >> 4, a = tables & 15;
        if (seen.has(id) || !components.has(id) || !quant.has(components.get(id)) || d > 3 || a > 3) invalid();
        if ((!progressive || ss === 0 && ah === 0) && !dc.has(d)) invalid();
        if ((!progressive || ss > 0) && !ac.has(a)) invalid();
        if (!progressive || ss === 0 && ah === 0) {
          if (initial.has(id)) invalid();
          initial.add(id);
        }
        seen.add(id);
      }
      let entropy = 0; p = end;
      while (p < b.length) {
        if (b[p] !== 0xff) { entropy++; p++; continue; }
        let next = p + 1;
        while (b[next] === 0xff) next++;
        if (b[next] === 0) { if (next !== p + 1) invalid(); entropy++; p = next + 1; continue; }
        if (b[next] >= 0xd0 && b[next] <= 0xd7) {
          if (!restart) invalid();
          p = next + 1; continue;
        }
        break;
      }
      if (!entropy) invalid();
      scans++; continue;
    } else invalid();
    p = end;
  }
  invalid();
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc32(b, start, end) {
  let crc = 0xffffffff;
  for (let p = start; p < end; p++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ b[p]) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
const PNG_ALLOWED = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'pHYs', 'sBIT', 'bKGD']);
function png(b, thumbnail) {
  let p = 8, frame, colour, depth, palette = 0, dataBytes = 0, dataEnded = false;
  const seen = new Set(), zlib = [];
  while (p < b.length) {
    if (p + 12 > b.length) invalid();
    const n = u32(b, p), start = p + 8, end = start + n, type = ascii(b, p + 4, 4);
    if (n > 0x7fffffff || end + 4 > b.length || crc32(b, p + 4, end) !== u32(b, end)) invalid();
    if (!PNG_ALLOWED.has(type)) metadata();
    if (!frame && type !== 'IHDR' || seen.has(type) && type !== 'IDAT') invalid();
    if (seen.has('IDAT') && type !== 'IDAT') dataEnded = true;
    if (type === 'IHDR') {
      if (p !== 8 || n !== 13) invalid();
      frame = dimensions(u32(b, start), u32(b, start + 4), thumbnail);
      depth = b[start + 8]; colour = b[start + 9];
      if (!({ 0: [1,2,4,8,16], 2: [8,16], 3: [1,2,4,8], 4: [8,16], 6: [8,16] }[colour]?.includes(depth)) ||
          b[start + 10] !== 0 || b[start + 11] !== 0 || b[start + 12] > 1) invalid();
    } else if (type === 'PLTE') {
      if (seen.has('IDAT') || colour === 0 || colour === 4 || n === 0 || n % 3 || n > 768 || colour === 3 && n / 3 > 2 ** depth) invalid();
      palette = n / 3;
    } else if (type === 'IDAT') {
      if (dataEnded || colour === 3 && !palette) invalid();
      for (let i = start; i < end && zlib.length < 2; i++) zlib.push(b[i]);
      dataBytes += n;
    } else if (type === 'IEND') {
      if (n !== 0 || dataBytes < 6 || end + 4 !== b.length || zlib[0] % 16 !== 8 || zlib[0] >> 4 > 7 ||
          (zlib[0] * 256 + zlib[1]) % 31 || zlib[1] & 32) invalid();
      return frame;
    } else {
      if (seen.has('IDAT')) invalid();
      if (['gAMA', 'cHRM', 'sRGB', 'sBIT'].includes(type) && palette) invalid();
      const lengths = { gAMA: 4, cHRM: 32, sRGB: 1, pHYs: 9,
        sBIT: {0:1,2:3,3:3,4:2,6:4}[colour], bKGD: colour === 3 ? 1 : [0,4].includes(colour) ? 2 : 6 };
      if (type === 'tRNS') {
        if (colour === 3 ? !palette || n < 1 || n > palette : colour === 0 ? n !== 2 : colour === 2 ? n !== 6 : true) invalid();
      } else if (n !== lengths[type]) invalid();
      if (type === 'gAMA' && u32(b, start) === 0 || type === 'sRGB' && b[start] > 3 || type === 'pHYs' && b[start + 8] > 1) invalid();
      if (type === 'sBIT') for (let i = start; i < end; i++) if (!b[i] || b[i] > (colour === 3 ? 8 : depth)) invalid();
      if (type === 'bKGD' && colour === 3 && (!palette || b[start] >= palette)) invalid();
    }
    seen.add(type); p = end + 4;
  }
  invalid();
}

function webp(b, thumbnail) {
  if (le32(b, 4) !== b.length - 8) invalid();
  let p = 12, canvas, image, extended = false, alpha = false, alphaFlag = false;
  while (p < b.length) {
    if (p + 8 > b.length) invalid();
    const type = ascii(b, p, 4), n = le32(b, p + 4), start = p + 8, end = start + n;
    if (end + (n & 1) > b.length || n & 1 && b[end] !== 0) invalid();
    if (type === 'VP8X') {
      if (p !== 12 || extended || n !== 10) invalid();
      const flags = b[start];
      if (flags & 0x2e) metadata(); // ICC/EXIF/XMP and animation are outside photo uploads.
      if (flags & 0xc1 || b[start + 1] || b[start + 2] || b[start + 3]) invalid();
      alphaFlag = Boolean(flags & 0x10); extended = true;
      canvas = dimensions(le24(b, start + 4) + 1, le24(b, start + 7) + 1, thumbnail);
    } else if (type === 'ALPH') {
      if (!extended || !alphaFlag || alpha || image || n < 2 || b[start] & 0xc0 || (b[start] & 3) > 1 || (b[start] >> 4 & 3) > 1) invalid();
      if ((b[start] & 3) === 0 && n !== 1 + canvas.width * canvas.height) invalid();
      alpha = true;
    } else if (type === 'VP8 ' || type === 'VP8L') {
      if (image) invalid();
      if (type === 'VP8 ') {
        if (n < 11 || b[start] & 1 || (b[start] >> 1 & 7) > 3 || !(b[start] & 0x10) || ascii(b, start + 3, 3) !== '\x9d\x01\x2a') invalid();
        const partition = le24(b, start) >>> 5;
        if (!partition || partition > n - 10 || alphaFlag !== alpha) invalid();
        image = dimensions(le16(b, start + 6) & 0x3fff, le16(b, start + 8) & 0x3fff, thumbnail);
      } else {
        if (n < 6 || b[start] !== 0x2f || b[start + 4] >> 5 || alpha) invalid();
        const bits = le32(b, start + 1);
        image = dimensions((bits & 0x3fff) + 1, (bits >>> 14 & 0x3fff) + 1, thumbnail);
        if (extended && alphaFlag !== Boolean(bits & 0x10000000)) invalid();
      }
    } else metadata();
    p = end + (n & 1);
  }
  if (!image || canvas && (canvas.width !== image.width || canvas.height !== image.height)) invalid();
  return image;
}
