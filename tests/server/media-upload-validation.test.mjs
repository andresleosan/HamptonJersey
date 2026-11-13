import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, seedListing, call, adminCookie } from './helpers.mjs';

const fixture = name => readFileSync(new URL(`../fixtures/media-upload/${name}`, import.meta.url));
const JPEG = fixture('baseline.jpg'), THUMB = fixture('thumb.jpg');
const PATH = '/admin/listings/HE-R001/media';

function form({ full = JPEG, thumb = THUMB, type = 'image/jpeg', thumbType = 'image/jpeg' } = {}) {
  const data = new FormData();
  data.append('file', new File([full], 'photo.jpg', { type }));
  data.append('thumb', new File([thumb], 'thumb.jpg', { type: thumbType }));
  data.append('kind', 'floorplan');
  data.append('label', 'Synthetic plan');
  // These are deliberately wrong: stored dimensions must come from the file.
  data.append('width', '999999'); data.append('height', 'not-a-dimension');
  return data;
}

async function world() {
  const env = makeEnv(); seedListing(env);
  return { env, cookie: await adminCookie() };
}

const mediaCount = env => env.DB.raw.prepare('SELECT COUNT(*) AS n FROM media').get().n;

test('photo upload stores dimensions and format from image bytes for each supported static format', async t => {
  for (const [filename, type, extension] of [
    ['baseline.jpg', 'image/jpeg', 'jpg'], ['progressive.jpg', 'image/jpeg', 'jpg'],
    ['rgb.png', 'image/png', 'png'], ['lossy.webp', 'image/webp', 'webp'],
    ['lossless.webp', 'image/webp', 'webp'], ['alpha.webp', 'image/webp', 'webp'],
  ]) await t.test(filename, async () => {
    const { env, cookie } = await world();
    const bytes = fixture(filename);
    const result = await call(env, 'POST', PATH, { cookie, form: form({ full: bytes, type }) });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    const media = result.data.media;
    assert.deepEqual([media.width, media.height, media.content_type, media.bytes], [32, 24, type, bytes.length]);
    assert.deepEqual([media.kind, media.label, media.origin], ['floorplan', 'Synthetic plan', 'upload']);
    assert.ok(media.r2_key.endsWith(`.${extension}`));
    assert.deepEqual(Buffer.from(env.MEDIA.store.get(media.r2_key).body), bytes);
    assert.deepEqual(Buffer.from(env.MEDIA.store.get(media.thumb_key).body), THUMB);
    assert.equal(env.MEDIA.store.get(media.r2_key).type, type);
    assert.equal(mediaCount(env), 1);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  });
});

test('photo uploads without a declared MIME still use the verified format', async () => {
  const { env, cookie } = await world();
  const result = await call(env, 'POST', PATH, { cookie, form: form({ type: '', thumbType: '' }) });
  assert.equal(result.status, 201);
  assert.deepEqual([result.data.media.width, result.data.media.height, result.data.media.content_type], [32, 24, 'image/jpeg']);
});

test('malformed photos and thumbnails fail before any media row or object is stored', async t => {
  const prefix = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  for (const [name, options] of [
    ['signature alone', { full: prefix }], ['truncated image', { full: JPEG.subarray(0, JPEG.length - 2) }],
    ['trailing payload', { full: Buffer.concat([JPEG, Buffer.from('extra')]) }],
    ['invalid thumbnail', { thumb: prefix }], ['empty thumbnail', { thumb: Buffer.alloc(0) }],
    ['MIME disagrees with bytes', { type: 'image/png' }], ['non-image MIME', { type: 'text/html' }],
    ['thumbnail MIME disagrees', { thumbType: 'image/webp' }],
  ]) await t.test(name, async () => {
    const { env, cookie } = await world();
    const result = await call(env, 'POST', PATH, { cookie, form: form(options) });
    assert.equal(result.status, 400);
    assert.equal(mediaCount(env), 0); assert.equal(env.MEDIA.store.size, 0);
  });
});

test('EXIF on either image is rejected without preserving the metadata or starting storage', async t => {
  const payload = Buffer.from('Exif\0\0synthetic-private-location');
  const marker = Buffer.from([0xff, 0xe1, 0, payload.length + 2]);
  const withExif = image => Buffer.concat([image.subarray(0, 2), marker, payload, image.subarray(2)]);
  for (const field of ['full', 'thumb']) await t.test(field, async () => {
    const { env, cookie } = await world();
    const result = await call(env, 'POST', PATH, { cookie,
      form: form({ [field]: withExif(field === 'full' ? JPEG : THUMB) }) });
    assert.equal(result.status, 400);
    assert.ok(!JSON.stringify(result.data).includes('synthetic-private-location'));
    assert.equal(mediaCount(env), 0); assert.equal(env.MEDIA.store.size, 0);
  });
});

test('the existing size, session, origin and listing checks still reject uploads without effects', async t => {
  const huge = new Uint8Array(10 * 1024 * 1024 + 1);
  for (const [name, options, expected] of [
    ['large original', { options: { full: huge } }, 413],
    ['large thumbnail', { options: { thumb: huge } }, 413],
    ['anonymous', { cookie: null }, 401],
    ['cross-origin', { origin: 'https://different.example.test' }, 403],
    ['missing listing', { path: '/admin/listings/HE-R999/media' }, 404],
  ]) await t.test(name, async () => {
    const { env, cookie } = await world();
    const result = await call(env, 'POST', options.path ?? PATH, {
      cookie: options.cookie === null ? undefined : cookie, ...(options.origin ? { origin: options.origin } : {}),
      form: form(options.options),
    });
    assert.equal(result.status, expected);
    assert.equal(mediaCount(env), 0); assert.equal(env.MEDIA.store.size, 0);
  });
});
