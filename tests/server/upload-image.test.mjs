import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectUploadImage } from '../../server/upload-image.js';

const fixture = name => readFileSync(new URL(`../fixtures/media-upload/${name}`, import.meta.url));
const jpeg = fixture('baseline.jpg'), png = fixture('rgb.png'), webp = fixture('lossy.webp');
const rejected = (bytes, options, status = 400) => assert.throws(() => inspectUploadImage(bytes, options), e => e.status === status);
const marker = (bytes, code) => bytes.findIndex((v, i) => v === 0xff && bytes[i + 1] === code);
const jpegSegment = (code, data) => Buffer.concat([Buffer.from([0xff, code, (data.length + 2) >> 8, (data.length + 2) & 255]), data]);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}
function pngChunks(bytes) {
  const out = [];
  for (let p = 8; p < bytes.length;) {
    const length = bytes.readUInt32BE(p), type = bytes.toString('ascii', p + 4, p + 8);
    out.push({ type, data: bytes.subarray(p + 8, p + 8 + length) }); p += 12 + length;
  }
  return out;
}
const makePng = chunks => Buffer.concat([png.subarray(0, 8), ...chunks.map(c => pngChunk(c.type, c.data))]);
function webpChunk(type, data) {
  const header = Buffer.alloc(8); header.write(type, 0, 4, 'ascii'); header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, ...(data.length & 1 ? [Buffer.from([0])] : [])]);
}
function makeWebp(chunks) {
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const header = Buffer.alloc(8); header.write('RIFF'); header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
const baseWebpChunk = webp.subarray(12);

for (const [name, contentType, extension, width, height] of [
  ['baseline.jpg', 'image/jpeg', 'jpg', 32, 24], ['progressive.jpg', 'image/jpeg', 'jpg', 32, 24],
  ['thumb.jpg', 'image/jpeg', 'jpg', 16, 12], ['rgb.png', 'image/png', 'png', 32, 24],
  ['lossy.webp', 'image/webp', 'webp', 32, 24], ['lossless.webp', 'image/webp', 'webp', 32, 24],
  ['alpha.webp', 'image/webp', 'webp', 32, 24],
]) {
  test(`accepts real synthetic ${name} and derives dimensions from the bytes`, () => {
    assert.deepEqual(inspectUploadImage(fixture(name)), { contentType, extension, width, height });
    assert.deepEqual(inspectUploadImage(fixture(name), { thumbnail: true }), { contentType, extension, width, height });
  });
}

test('accepts a typed array view without including unrelated buffer bytes', () => {
  const wrapped = Buffer.concat([Buffer.from('prefix'), jpeg, Buffer.from('suffix')]);
  assert.equal(inspectUploadImage(wrapped.subarray(6, 6 + jpeg.length)).width, 32);
  assert.equal(inspectUploadImage(Uint8Array.from(jpeg).buffer).height, 24);
});

test('rejects unsupported types, fake signatures and empty files', () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from('%PDF-1.7'), Buffer.from([255,216,255,217]),
    png.subarray(0,8), Buffer.from('RIFF\x04\0\0\0WEBP'), Buffer.from('<svg/>')]) rejected(bytes);
});

test('rejects every truncated prefix of the encoded fixture files', () => {
  for (const name of ['baseline.jpg','progressive.jpg','rgb.png','lossy.webp','lossless.webp','alpha.webp']) {
    const bytes = fixture(name);
    for (let end = 0; end < bytes.length; end++) assert.throws(() => inspectUploadImage(bytes.subarray(0, end)), e => e.status === 400, `${name} at byte ${end}`);
  }
});

test('rejects extra bytes and a second file after each image end', () => {
  for (const bytes of [jpeg, png, webp]) {
    rejected(Buffer.concat([bytes, Buffer.from([0])]));
    rejected(Buffer.concat([bytes, jpeg]));
  }
});

test('enforces the existing ten MiB file limit before inspecting a container', () => {
  rejected(Buffer.alloc(10 * 1024 * 1024 + 1), undefined, 413);
});

test('accepts 16 million pixels without downscaling and rejects larger JPEG dimensions', () => {
  const bytes = Buffer.from(jpeg), p = marker(bytes, 0xc0);
  bytes.writeUInt16BE(4000,p+5); bytes.writeUInt16BE(4000,p+7);
  assert.equal(inspectUploadImage(bytes).width, 4000);
  bytes.writeUInt16BE(4001,p+7); rejected(bytes, undefined, 413);
});

test('rejects an oversize thumbnail while accepting the same full image dimensions', () => {
  const bytes = Buffer.from(jpeg), p = marker(bytes,0xc0);
  bytes.writeUInt16BE(640,p+7); assert.equal(inspectUploadImage(bytes,{thumbnail:true}).width,640);
  bytes.writeUInt16BE(641,p+7); rejected(bytes,{thumbnail:true});
  assert.equal(inspectUploadImage(bytes).width,641);
});

test('rejects zero dimensions and oversize PNG/WebP canvases', () => {
  const chunks = pngChunks(png), ihdr = Buffer.from(chunks[0].data);
  ihdr.writeUInt32BE(0,0); rejected(makePng([{type:'IHDR',data:ihdr},...chunks.slice(1)]));
  ihdr.writeUInt32BE(5000,0); ihdr.writeUInt32BE(4000,4);
  rejected(makePng([{type:'IHDR',data:ihdr},...chunks.slice(1)]),undefined,413);
  const bytes = Buffer.from(webp); bytes.writeUInt16LE(5000,26); bytes.writeUInt16LE(4000,28);
  rejected(bytes,undefined,413);
});

for (const [code, label, payload] of [[0xe1,'EXIF',Buffer.from('Exif\0\0synthetic')],
  [0xe1,'XMP',Buffer.from('http://ns.adobe.com/xap/1.0/\0synthetic')], [0xe2,'ICC',Buffer.from('ICC_PROFILE\0synthetic')],
  [0xed,'IPTC',Buffer.from('Photoshop 3.0\0synthetic')], [0xfe,'comments',Buffer.from('synthetic text')],
  [0xe0,'unknown APP0',Buffer.from('arbitrary payload')], [0xef,'unknown APP15',Buffer.from('arbitrary payload')]]) {
  test(`rejects JPEG ${label} metadata instead of retaining it`, () => {
    const bytes = Buffer.concat([jpeg.subarray(0,2),jpegSegment(code,payload),jpeg.subarray(2)]);
    assert.throws(()=>inspectUploadImage(bytes), e=>e.status===400&&/metadata/i.test(e.message));
  });
}

test('rejects JPEG metadata inserted between scans and its final EOI', () => {
  rejected(Buffer.concat([jpeg.subarray(0,-2),jpegSegment(0xfe,Buffer.from('synthetic text')),jpeg.subarray(-2)]));
});

test('rejects JPEG bad lengths, duplicate frames, missing scans and unknown tables', () => {
  const badLength = Buffer.from(jpeg);badLength.writeUInt16BE(65535,4); rejected(badLength);
  const sof = marker(jpeg,0xc0), end = sof + 2 + jpeg.readUInt16BE(sof+2);
  rejected(Buffer.concat([jpeg.subarray(0,end),jpeg.subarray(sof,end),jpeg.subarray(end)]));
  const sos = marker(jpeg,0xda);rejected(Buffer.concat([jpeg.subarray(0,sos),Buffer.from([255,217])]));
  const unknownQuant = Buffer.from(jpeg);unknownQuant[sof+12]=3;rejected(unknownQuant);
  const unknownHuffman = Buffer.from(jpeg);unknownHuffman[sos+6]=0x33;rejected(unknownHuffman);
});

for (const type of ['eXIf','tEXt','zTXt','iTXt','iCCP','tIME','vpAg']) {
  test(`rejects PNG ${type} metadata or unknown ancillary data`, () => {
    const chunks = pngChunks(png);chunks.splice(1,0,{type,data:Buffer.from('synthetic')});
    assert.throws(()=>inspectUploadImage(makePng(chunks)),e=>e.status===400&&/metadata/i.test(e.message));
  });
}

test('accepts fixed numeric PNG colour information without text metadata', () => {
  const chunks = pngChunks(png);chunks.splice(1,0,{type:'sRGB',data:Buffer.from([0])});
  assert.equal(inspectUploadImage(makePng(chunks)).width,32);
});

test('rejects PNG CRC errors, missing image data and invalid colour/depth combinations', () => {
  const crcError = Buffer.from(png);crcError[29]^=1; rejected(crcError);
  rejected(makePng(pngChunks(png).filter(c=>c.type!=='IDAT')));
  const chunks = pngChunks(png), header = Buffer.from(chunks[0].data);header[8]=1;header[9]=2;
  rejected(makePng([{type:'IHDR',data:header},...chunks.slice(1)]));
});

test('rejects PNG chunks with impossible lengths or nonconsecutive IDAT chunks', () => {
  const badLength=Buffer.from(png);badLength.writeUInt32BE(0xffffffff,8);rejected(badLength);
  const chunks=pngChunks(png), compressed=chunks.find(c=>c.type==='IDAT').data;
  rejected(makePng([chunks[0],{type:'IDAT',data:compressed.subarray(0,3)},
    {type:'pHYs',data:Buffer.alloc(9)},{type:'IDAT',data:compressed.subarray(3)},chunks.at(-1)]));
});

test('rejects an empty PNG IDAT followed by a chunk before the remaining image data', () => {
  const chunks = pngChunks(png);
  rejected(makePng([chunks[0], { type: 'IDAT', data: Buffer.alloc(0) },
    { type: 'pHYs', data: Buffer.alloc(9) }, ...chunks.slice(1)]));
});

for (const type of ['EXIF','XMP ','ICCP','ANIM','ANMF','JUNK']) {
  test(`rejects WebP ${type.trim()} metadata, animation or unknown chunks`, () => {
    assert.throws(()=>inspectUploadImage(makeWebp([baseWebpChunk,webpChunk(type,Buffer.from('synthetic'))])),
      e=>e.status===400&&/metadata|animated/i.test(e.message));
  });
}

test('rejects WebP incorrect RIFF lengths and duplicate image payloads', () => {
  const bytes=Buffer.from(webp);bytes.writeUInt32LE(bytes.length-9,4);rejected(bytes);
  rejected(makeWebp([baseWebpChunk,baseWebpChunk]));
});

test('rejects WebP extended metadata flags and inconsistent canvas dimensions', () => {
  const extended=Buffer.alloc(10);extended[0]=8;extended.writeUIntLE(31,4,3);extended.writeUIntLE(23,7,3);
  rejected(makeWebp([webpChunk('VP8X',extended),baseWebpChunk]));
  extended[0]=0;extended.writeUIntLE(32,4,3);
  rejected(makeWebp([webpChunk('VP8X',extended),baseWebpChunk]));
});

test('rejects WebP invalid VP8 signatures, VP8L versions and unsupported reserved bits', () => {
  const vp8=Buffer.from(webp);vp8[23]=0;rejected(vp8);
  const vp8l=fixture('lossless.webp');vp8l[24]|=0xe0;rejected(vp8l);
  const alpha=fixture('alpha.webp');alpha[20]|=0x80;rejected(alpha);
});
