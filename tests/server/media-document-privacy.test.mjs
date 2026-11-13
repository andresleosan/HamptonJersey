import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, seedListing, seedMedia, call, adminCookie, ORIGIN } from './helpers.mjs';
import { serveMedia } from '../../server/media.js';

// Synthetic bytes only. No fixture content is logged or used against a real account.
const jpeg = readFileSync(new URL('../fixtures/photo.jpg', import.meta.url));
const pdf = new TextEncoder().encode('%PDF-1.7\nsynthetic-document\n%%EOF');
const make = async ({ kind = 'photo', contentType = 'image/jpeg', key = 'synthetic/photo.jpg', objectType = contentType,
  body = jpeg, thumbKey = null, thumbType = objectType, thumbBody = body } = {}) => {
  const env = makeEnv(); seedListing(env, { cover_media_id: 'A00001' });
  seedMedia(env, { kind, content_type: contentType, r2_key: key, thumb_key: thumbKey, public: 1 });
  await env.MEDIA.put(key, body, { httpMetadata: { contentType: objectType } });
  if (thumbKey) await env.MEDIA.put(thumbKey, thumbBody, { httpMetadata: { contentType: thumbType } });
  return env;
};
const get = async (env, { thumb = false, cookie = null } = {}) => serveMedia(
  new Request(`${ORIGIN}/media/A00001${thumb ? '?thumb' : ''}`, { headers: cookie ? { cookie } : {} }), env, 'A00001');
const publicListing = async env => (await call(env, 'GET', '/listings')).data[0];

test('known document rows stay out of the public DTO and anonymous full and thumbnail responses', async () => {
  const env = await make({ kind: 'document', contentType: 'application/pdf', key: 'synthetic/file.pdf', body: pdf,
    thumbKey: 'synthetic/thumb.jpg', thumbType: 'image/jpeg', thumbBody: jpeg });
  assert.equal((await publicListing(env)).image, null);
  const original = await get(env), thumbnail = await get(env, { thumb: true });
  assert.equal(original.status, 404);
  assert.equal(thumbnail.status, 404);
  assert.match(original.headers.get('cache-control') ?? '', /no-store/);
  const staff = await get(env, { cookie: await adminCookie() });
  assert.equal(staff.status, 200);
  assert.equal(staff.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await staff.arrayBuffer()), Buffer.from(pdf));
});

test('a document remains private if its kind is changed to photo but its recorded type is PDF', async () => {
  const env = await make({ kind: 'photo', contentType: 'Application/PDF; charset=binary', key: 'synthetic/file.jpg', body: pdf });
  assert.equal((await publicListing(env)).image, null);
  assert.equal((await get(env)).status, 404);
});

test('a known document filename is private even if the recorded type is missing', async () => {
  const env = await make({ kind: 'photo', contentType: null, objectType: null, key: 'synthetic/file.PDF', body: pdf });
  assert.equal((await publicListing(env)).image, null);
  assert.equal((await get(env)).status, 404);
});

test('a known document object type stays private even if the row claims an image', async () => {
  const env = await make({ contentType: 'image/jpeg', objectType: 'application/pdf', key: 'synthetic/file.jpg', body: pdf });
  const publicResponse = await get(env);
  assert.equal(publicResponse.status, 404);
  const staff = await get(env, { cookie: await adminCookie() });
  assert.equal(staff.status, 200);
  assert.equal(staff.headers.get('cache-control'), 'private, no-store');
});

test('PDF header bytes are blocked even under image labels and a JPEG-looking filename', async () => {
  const env = await make({ contentType: 'image/jpeg', objectType: 'image/jpeg', key: 'synthetic/file.jpg', body: pdf });
  assert.equal((await get(env)).status, 404);
  const staff = await get(env, { cookie: await adminCookie() });
  assert.equal(staff.status, 200);
  assert.equal(staff.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await staff.arrayBuffer()), Buffer.from(pdf));
});

test('a known document thumbnail is not served even when its original is a photo', async () => {
  const env = await make({ thumbKey: 'synthetic/thumb.jpg', thumbType: 'application/pdf', thumbBody: pdf });
  assert.equal((await get(env)).status, 200);
  assert.equal((await get(env, { thumb: true })).status, 404);
});

test('legacy photos with null type keep their bytes, public DTO, thumbnail and cache policy', async () => {
  const env = await make({ contentType: null, objectType: null, thumbKey: 'synthetic/thumb.jpg', thumbType: null });
  assert.equal((await publicListing(env)).image, '/media/A00001');
  for (const thumb of [false, true]) {
    const response = await get(env, { thumb });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=86400');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
  }
});

test('legacy photos with generic object type are not rejected solely for an absent MIME', async () => {
  const env = await make({ contentType: null, objectType: 'application/octet-stream' });
  assert.equal((await publicListing(env)).image, '/media/A00001');
  assert.equal((await get(env)).status, 200);
});

test('a PDF header split between stream chunks is not served anonymously', async () => {
  const env = await make({ contentType: null, objectType: 'application/octet-stream', key: 'synthetic/photo.jpg' });
  const getObject = env.MEDIA.get;
  env.MEDIA.get = async key => {
    const object = await getObject(key);
    return { ...object, body: new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(' '.repeat(24) + '%P'));
      controller.enqueue(new TextEncoder().encode('DF-1.7\nsynthetic-document'));
      controller.close();
    } }) };
  };
  assert.equal((await get(env)).status, 404);
});

test('real synthetic PNG and WebP images still stream with their supported types', async () => {
  const images = [
    ['image/png', 'png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlOX2sAAAAASUVORK5CYII='],
    ['image/webp', 'webp', 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'],
  ];
  for (const [type, suffix, encoded] of images) {
    const bytes = Buffer.from(encoded, 'base64');
    const env = await make({ contentType: type, objectType: type, key: `synthetic/photo.${suffix}`, body: bytes });
    assert.equal((await publicListing(env)).image, '/media/A00001');
    const response = await get(env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), type);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
});

test('a document kind alone prevents public exposure even when its type claims a photo', async () => {
  const env = await make({ kind: 'document', contentType: 'image/jpeg', objectType: 'image/jpeg', key: 'synthetic/photo.jpg' });
  assert.equal((await publicListing(env)).image, null);
  assert.equal((await get(env)).status, 404);
});

test('known non-image MIME types are hidden even when a row claims a visual kind', async () => {
  for (const contentType of ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/svg+xml']) {
    const env = await make({ contentType, objectType: 'image/jpeg', key: 'synthetic/photo.jpg' });
    assert.equal((await publicListing(env)).image, null);
    assert.equal((await get(env)).status, 404);
  }
});

test('known office document signatures are blocked even if the object is mislabeled', async () => {
  const signatures = [Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0]),
    Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])];
  for (const body of signatures) {
    const env = await make({ contentType: null, objectType: 'application/octet-stream', key: 'synthetic/photo.jpg', body });
    assert.equal((await get(env)).status, 404);
  }
});

test('rejecting a known document object type cancels the unconsumed response body', async () => {
  const env = await make({ contentType: 'image/jpeg', objectType: 'application/pdf', key: 'synthetic/photo.jpg', body: pdf });
  const getObject = env.MEDIA.get;
  let cancelled = false;
  env.MEDIA.get = async key => {
    const object = await getObject(key);
    return { ...object, body: new ReadableStream({ cancel() { cancelled = true; } }) };
  };
  assert.equal((await get(env)).status, 404);
  assert.equal(cancelled, true);
});

test('public photo inspection reads only a prefix before returning and preserves the streamed bytes', async () => {
  const env = await make({ contentType: null, objectType: null });
  const getObject = env.MEDIA.get;
  let pulls = 0;
  env.MEDIA.get = async key => {
    const object = await getObject(key);
    let position = 0;
    return { ...object, body: new ReadableStream({ pull(controller) {
      if (position >= jpeg.length) return controller.close();
      pulls++;
      controller.enqueue(jpeg.subarray(position, position + 1024)); position += 1024;
    } }, { highWaterMark: 0 }) };
  };
  const response = await get(env);
  assert.equal(response.status, 200);
  assert.equal(pulls, 1, 'the remainder was not read before the response was returned');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
});

test('cancelling a valid photo response cancels its underlying stream', async () => {
  const env = await make({ contentType: null, objectType: null });
  const getObject = env.MEDIA.get;
  let cancelled = false;
  env.MEDIA.get = async key => {
    const object = await getObject(key);
    return { ...object, body: new ReadableStream({
      pull(controller) { controller.enqueue(jpeg.subarray(0, 1024)); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 }) };
  };
  const response = await get(env);
  assert.equal(response.status, 200);
  await response.body.cancel();
  assert.equal(cancelled, true);
});

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

// Pause the first public-body read while keeping the remaining synthetic photo available to stream.
function pausePublicBody(env) {
  const started = deferred(), release = deferred(), getObject = env.MEDIA.get;
  let cancelled = false;
  env.MEDIA.get = async key => {
    const object = await getObject(key);
    let position = 0;
    return { ...object, body: new ReadableStream({
      async pull(controller) {
        if (position === 0) { started.resolve(); await release.promise; }
        if (position >= jpeg.length) { controller.close(); return; }
        controller.enqueue(jpeg.subarray(position, position + 1024)); position += 1024;
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 }) };
  };
  return { started: started.promise, release: release.resolve, get cancelled() { return cancelled; } };
}

test('a visual label with a known document extension is private in the DTO and anonymous service', async () => {
  const env = await make();
  env.DB.raw.prepare('UPDATE media SET label=? WHERE id=?').run('Synthetic file.PDF  ', 'A00001');
  assert.equal((await publicListing(env)).image, null);
  assert.equal((await get(env)).status, 404);
  const staff = await get(env, { cookie: await adminCookie() });
  assert.equal(staff.status, 200);
  assert.equal(staff.headers.get('cache-control'), 'private, no-store');
});

test('a valid JPEG with a comment containing a PDF marker remains available unchanged', async () => {
  const comment = Buffer.from('Synthetic photo note: %PDF- is ordinary text', 'utf8');
  const header = Buffer.from([0xff, 0xfe, 0, 0]); header.writeUInt16BE(comment.length + 2, 2);
  const image = Buffer.concat([jpeg.subarray(0, 2), header, comment, jpeg.subarray(2)]);
  const env = await make({ body: image });
  const response = await get(env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=86400');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
});

test('public access revoked while the prefix is read fails closed and cancels the stream', async () => {
  for (const statement of [
    "UPDATE media SET public=0 WHERE id='A00001'",
    "UPDATE listings SET published=0 WHERE id='HE-R001'",
    "UPDATE listings SET archived_at='2026-11-13T00:00:00.000Z' WHERE id='HE-R001'",
  ]) {
    const env = await make(), paused = pausePublicBody(env);
    const pending = get(env); await paused.started;
    env.DB.raw.exec(statement); paused.release();
    const response = await pending;
    assert.equal(response.status, 404);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(paused.cancelled, true);
  }
});

test('a changed original or selected thumbnail key is not served from a stale object', async () => {
  for (const thumb of [false, true]) {
    const env = await make({ thumbKey: 'synthetic/thumb.jpg' }), paused = pausePublicBody(env);
    const pending = get(env, { thumb }); await paused.started;
    env.DB.raw.prepare(`UPDATE media SET ${thumb ? 'thumb_key' : 'r2_key'}=? WHERE id=?`).run('synthetic/replacement.jpg', 'A00001');
    paused.release();
    assert.equal((await pending).status, 404);
    assert.equal(paused.cancelled, true);
  }
});

test('a media row deleted while reading its prefix is not served', async () => {
  const env = await make(), paused = pausePublicBody(env);
  const pending = get(env); await paused.started;
  env.DB.raw.prepare('DELETE FROM media WHERE id=?').run('A00001'); paused.release();
  assert.equal((await pending).status, 404);
  assert.equal(paused.cancelled, true);
});

test('a staff request becomes private and no-store when public visibility changes during the prefix', async () => {
  const env = await make(), paused = pausePublicBody(env), cookie = await adminCookie();
  const pending = get(env, { cookie }); await paused.started;
  env.DB.raw.prepare('UPDATE media SET public=0 WHERE id=?').run('A00001'); paused.release();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
});

test('private media access is refused when staff access is revoked during object retrieval', async () => {
  const env = await make(); env.DB.raw.prepare('UPDATE media SET public=0 WHERE id=?').run('A00001');
  const started = deferred(), release = deferred(), getObject = env.MEDIA.get, cookie = await adminCookie();
  env.MEDIA.get = async key => { const object = await getObject(key); started.resolve(); await release.promise; return object; };
  const pending = get(env, { cookie }); await started.promise;
  env.DB.raw.prepare('DELETE FROM admins WHERE email=?').run('admin@example.test'); release.resolve();
  const response = await pending;
  assert.equal(response.status, 404);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
});

test('unchanged private media remains available to authorized staff after object retrieval', async () => {
  const env = await make(); env.DB.raw.prepare('UPDATE media SET public=0 WHERE id=?').run('A00001');
  const started = deferred(), release = deferred(), getObject = env.MEDIA.get, cookie = await adminCookie();
  env.MEDIA.get = async key => { const object = await getObject(key); started.resolve(); await release.promise; return object; };
  const pending = get(env, { cookie }); await started.promise; release.resolve();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
});

test('a documentary label added while reading a public prefix revokes anonymous access', async () => {
  const env = await make(), paused = pausePublicBody(env);
  const pending = get(env); await paused.started;
  env.DB.raw.prepare('UPDATE media SET label=? WHERE id=?').run('Synthetic document.docx', 'A00001');
  paused.release();
  assert.equal((await pending).status, 404);
  assert.equal(paused.cancelled, true);
});

test('staff access is rechecked if a public item becomes private while reading its prefix', async () => {
  const env = await make(), paused = pausePublicBody(env), cookie = await adminCookie();
  const pending = get(env, { cookie }); await paused.started;
  env.DB.raw.prepare('UPDATE media SET public=0 WHERE id=?').run('A00001');
  env.DB.raw.prepare('DELETE FROM admins WHERE email=?').run('admin@example.test'); paused.release();
  assert.equal((await pending).status, 404);
  assert.equal(paused.cancelled, true);
});

test('a private resource key changed during retrieval is not served to staff from the stale object', async () => {
  const env = await make(); env.DB.raw.prepare('UPDATE media SET public=0 WHERE id=?').run('A00001');
  const started = deferred(), release = deferred(), getObject = env.MEDIA.get, cookie = await adminCookie();
  env.MEDIA.get = async key => { const object = await getObject(key); started.resolve(); await release.promise; return object; };
  const pending = get(env, { cookie }); await started.promise;
  env.DB.raw.prepare('UPDATE media SET r2_key=? WHERE id=?').run('synthetic/replacement.jpg', 'A00001'); release.resolve();
  assert.equal((await pending).status, 404);
});
