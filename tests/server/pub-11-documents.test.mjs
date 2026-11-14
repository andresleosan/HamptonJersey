// PUB-11: private PDF documents per listing. Synthetic bytes and fictitious staff only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, seedListing, seedMedia, call, adminCookie, ORIGIN, T0 } from './helpers.mjs';
import { handleApi } from '../../server/api.js';
import { serveMedia } from '../../server/media.js';

const MiB = 1024 * 1024;
const pdf = (body = 'synthetic-document') => new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF\n`);
const jpeg = readFileSync(new URL('../fixtures/photo.jpg', import.meta.url));
const ready = () => { const env = makeEnv(); env.PUB11_DOCUMENTS_READY = '1'; seedListing(env); seedListing(env, { id: 'HE-R002' }); return env; };
const rows = env => env.DB.raw.prepare('SELECT * FROM listing_documents ORDER BY id').all();
const docEvents = env => env.DB.raw.prepare("SELECT * FROM events WHERE type LIKE 'listing_document.%' ORDER BY id").all();

async function send(env, path, bytes, { type = 'application/pdf', label, cookie, origin = ORIGIN, method = 'POST' } = {}) {
  const headers = new Headers();
  if (origin) headers.set('origin', origin);
  if (cookie) headers.set('cookie', cookie);
  if (type) headers.set('content-type', type);
  if (label !== undefined) headers.set('x-document-label', encodeURIComponent(label));
  const res = await handleApi(new Request(`${ORIGIN}/api${path}`, { method, headers, body: bytes }), env, path.slice(1).split('/'));
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, data, text };
}
const upload = async (env, bytes = pdf(), opts = {}) =>
  send(env, `/admin/listings/${opts.listing ?? 'HE-R001'}/documents`, bytes, { cookie: await adminCookie(), ...opts });
const download = async (env, id, listing = 'HE-R001', cookie) => {
  const headers = { cookie: cookie ?? await adminCookie() };
  const path = `/admin/listings/${listing}/documents/${id}`;
  return handleApi(new Request(`${ORIGIN}/api${path}`, { headers }), env, path.slice(1).split('/'));
};

test('without PUB11_DOCUMENTS_READY the document routes do not exist', async () => {
  const env = makeEnv(); seedListing(env);
  const cookie = await adminCookie();
  assert.equal((await call(env, 'GET', '/admin/listings/HE-R001/documents', { cookie })).status, 404);
  assert.equal((await send(env, '/admin/listings/HE-R001/documents', pdf(), { cookie })).status, 404);
  const listing = await call(env, 'GET', '/admin/listings/HE-R001', { cookie });
  assert.equal(listing.data.documents_enabled, undefined);
});

test('staff session and same origin are required', async () => {
  const env = ready();
  assert.equal((await call(env, 'GET', '/admin/listings/HE-R001/documents')).status, 401);
  assert.equal((await send(env, '/admin/listings/HE-R001/documents', pdf())).status, 401);
  assert.equal((await upload(env, pdf(), { origin: 'https://evil.test' })).status, 403);
  assert.equal(rows(env).length, 0);
  assert.equal(env.MEDIA.store.size, 0);
});

test('upload, list and download a private PDF with attachment, nosniff and no-store', async () => {
  const env = ready(), cookie = await adminCookie();
  const before = env.DB.raw.prepare('SELECT * FROM listings WHERE id = ?').get('HE-R001');
  const bytes = pdf();
  const res = await upload(env, bytes, { label: 'Floor survey "v2"\r\nX-Evil: 1 Ñ' });
  assert.equal(res.status, 201, res.text);
  const doc = res.data.document;
  assert.match(doc.id, /^D[0-9a-f]{16}$/);
  assert.equal(doc.label, 'Floor survey "v2" X-Evil: 1 Ñ');
  assert.equal(doc.bytes, bytes.byteLength);
  assert.equal(doc.r2_key, undefined);
  const [row] = rows(env);
  assert.equal(row.status, 'stored');
  assert.equal(row.visibility, 'staff');
  assert.equal(row.r2_key, `private-docs/${doc.id}.pdf`);
  assert.equal(row.created_by, 'admin@example.test');
  assert.deepEqual([...env.MEDIA.store.keys()], [row.r2_key]);

  const list = await call(env, 'GET', '/admin/listings/HE-R001/documents', { cookie });
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.documents.map(d => d.id), [doc.id]);
  assert.equal(list.headers.get('cache-control'), 'no-store');

  const file = await download(env, doc.id);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/pdf');
  assert.match(file.headers.get('content-disposition'), /^attachment; filename="[A-Za-z0-9 ._-]+\.pdf"$/);
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
  assert.match(file.headers.get('cache-control'), /no-store/);
  assert.match(file.headers.get('content-security-policy'), /sandbox/);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);

  // No auto publication: the listing row itself is untouched.
  assert.deepEqual(env.DB.raw.prepare('SELECT * FROM listings WHERE id = ?').get('HE-R001'), before);
  // The event is metadata only: no label, key or contents.
  const [event] = docEvents(env);
  assert.equal(event.type, 'listing_document.added');
  assert.deepEqual(JSON.parse(event.data), { listing_id: 'HE-R001', document_id: doc.id, bytes: bytes.byteLength });
  assert.doesNotMatch(event.data, /survey|private-docs|PDF/);
});

test('the type is verified from the bytes, not the declared MIME or name', async () => {
  const env = ready();
  assert.equal((await upload(env, jpeg)).status, 400, 'JPEG bytes declared as PDF');
  assert.equal((await upload(env, pdf(), { type: 'image/jpeg' })).status, 415, 'PDF bytes declared as JPEG');
  assert.equal((await upload(env, pdf(), { type: 'text/html' })).status, 415);
  assert.equal((await upload(env, new TextEncoder().encode('<html>%PDF-1.7 %%EOF'))).status, 400);
  assert.equal((await upload(env, new TextEncoder().encode('%PDF-1.7\ntruncated'))).status, 400, 'no %%EOF');
  assert.equal((await upload(env, new Uint8Array())).status, 400);
  assert.equal(rows(env).length, 0);
  assert.equal(env.MEDIA.store.size, 0);
});

test('a document over 20 MiB is refused while streaming, even without a declared length', async () => {
  const env = ready();
  const big = new Uint8Array(20 * MiB + 1); big.set(pdf(), 0); big.set(new TextEncoder().encode('%%EOF'), big.length - 5);
  assert.equal((await upload(env, big)).status, 413);
  const stream = new ReadableStream({ start(c) { c.enqueue(big.subarray(0, 10 * MiB)); c.enqueue(big.subarray(10 * MiB)); c.close(); } });
  const headers = { origin: ORIGIN, cookie: await adminCookie(), 'content-type': 'application/pdf' };
  const res = await handleApi(new Request(`${ORIGIN}/api/admin/listings/HE-R001/documents`,
    { method: 'POST', headers, body: stream, duplex: 'half' }), env, ['admin', 'listings', 'HE-R001', 'documents']);
  assert.equal(res.status, 413);
  assert.equal(rows(env).length, 0);
  assert.equal(env.MEDIA.store.size, 0);
  const exact = new Uint8Array(20 * MiB); exact.set(pdf(), 0); exact.set(new TextEncoder().encode('%%EOF'), exact.length - 5);
  assert.equal((await upload(env, exact)).status, 201);
});

test('another listing cannot list, download or remove the document', async () => {
  const env = ready(), cookie = await adminCookie();
  const { document: doc } = (await upload(env)).data;
  assert.equal((await download(env, doc.id, 'HE-R002')).status, 404);
  assert.equal((await call(env, 'DELETE', `/admin/listings/HE-R002/documents/${doc.id}`, { cookie })).status, 404);
  assert.deepEqual((await call(env, 'GET', '/admin/listings/HE-R002/documents', { cookie })).data.documents, []);
  assert.equal((await call(env, 'GET', '/admin/listings/HE-R404/documents', { cookie })).status, 404);
  assert.equal((await upload(env, pdf(), { listing: 'HE-R404' })).status, 404);
  assert.equal(rows(env).length, 1);
  assert.equal((await download(env, doc.id)).status, 200);
});

test('remove deletes the row and the object and logs a metadata event', async () => {
  const env = ready(), cookie = await adminCookie();
  const { document: doc } = (await upload(env)).data;
  const res = await call(env, 'DELETE', `/admin/listings/HE-R001/documents/${doc.id}`, { cookie });
  assert.equal(res.status, 200);
  assert.equal(rows(env).length, 0);
  assert.equal(env.MEDIA.store.size, 0);
  assert.equal((await download(env, doc.id)).status, 404);
  assert.equal((await call(env, 'DELETE', `/admin/listings/HE-R001/documents/${doc.id}`, { cookie })).status, 404);
  assert.deepEqual(docEvents(env).map(e => [e.type, JSON.parse(e.data).document_id]),
    [['listing_document.added', doc.id], ['listing_document.removed', doc.id]]);
});

test('documents never reach the public API or public media delivery', async () => {
  const env = ready();
  seedMedia(env);
  const { document: doc } = (await upload(env, pdf(), { label: 'Synthetic private lease' })).data;
  const listings = await call(env, 'GET', '/listings');
  assert.equal(listings.status, 200);
  assert.doesNotMatch(listings.text, new RegExp(`${doc.id}|private lease|private-docs`));
  const staff = await adminCookie();
  for (const cookie of [null, staff]) {
    const res = await serveMedia(new Request(`${ORIGIN}/media/${doc.id}`, { headers: cookie ? { cookie } : {} }), env, doc.id);
    assert.equal(res.status, 404);
  }
  // Even a media row pointing at the private prefix is never served, to anyone.
  seedMedia(env, { id: 'A00002', r2_key: rows(env)[0].r2_key, thumb_key: null, content_type: 'image/jpeg' });
  seedMedia(env, { id: 'A00003', r2_key: 'media/hampton/b.jpg', thumb_key: rows(env)[0].r2_key });
  await env.MEDIA.put('media/hampton/b.jpg', jpeg, { httpMetadata: { contentType: 'image/jpeg' } });
  for (const cookie of [null, staff]) {
    const headers = cookie ? { cookie } : {};
    assert.equal((await serveMedia(new Request(`${ORIGIN}/media/A00002`, { headers }), env, 'A00002')).status, 404);
    assert.equal((await serveMedia(new Request(`${ORIGIN}/media/A00003?thumb`, { headers }), env, 'A00003')).status, 404);
  }
});

test('a failed object write leaves neither row nor object', async () => {
  const env = ready(), put = env.MEDIA.put;
  env.MEDIA.put = async (key, ...rest) => { await put(key, ...rest); throw new Error('synthetic R2 failure'); };
  assert.equal((await upload(env)).status, 500);
  assert.equal(rows(env).length, 0);
  assert.equal(env.MEDIA.store.size, 0);
});

test('a failed final commit removes the stored object and the intent', async () => {
  const env = ready();
  env.DB.raw.exec(`CREATE TRIGGER fixture_doc_commit_abort BEFORE UPDATE ON listing_documents WHEN NEW.status='stored'
    BEGIN SELECT RAISE(ABORT,'synthetic commit failure'); END`);
  assert.equal((await upload(env)).status, 500);
  assert.equal(rows(env).length, 0);
  assert.equal(env.MEDIA.store.size, 0);
  assert.equal(docEvents(env).length, 0);
});

test('a failed object delete hides the document and is reconciled on the next change', async () => {
  const env = ready(), cookie = await adminCookie(), del = env.MEDIA.delete;
  const { document: doc } = (await upload(env)).data;
  env.MEDIA.delete = async () => { throw new Error('synthetic R2 failure'); };
  assert.equal((await call(env, 'DELETE', `/admin/listings/HE-R001/documents/${doc.id}`, { cookie })).status, 200);
  assert.equal(rows(env)[0].status, 'removing');
  assert.deepEqual((await call(env, 'GET', '/admin/listings/HE-R001/documents', { cookie })).data.documents, []);
  assert.equal((await download(env, doc.id)).status, 404);
  env.MEDIA.delete = del;
  const next = (await upload(env)).data.document;
  assert.deepEqual(rows(env).map(r => r.id), [next.id]);
  assert.deepEqual([...env.MEDIA.store.keys()], [`private-docs/${next.id}.pdf`]);
});

test('a stale pending intent is cleaned without touching recent ones or other listings', async () => {
  const env = ready();
  const intent = (id, listing, at) => {
    env.DB.raw.prepare(`INSERT INTO listing_documents(id,listing_id,r2_key,bytes,sha256,status,created_at,created_by)
      VALUES(?,?,?,10,?,'pending',?,'admin@example.test')`).run(id, listing, `private-docs/${id}.pdf`, 'a'.repeat(64), at);
    env.MEDIA.store.set(`private-docs/${id}.pdf`, { body: pdf() });
  };
  intent('Dstale', 'HE-R001', T0); intent('Dfresh', 'HE-R001', new Date().toISOString()); intent('Dother', 'HE-R002', T0);
  const { document: doc } = (await upload(env)).data;
  assert.deepEqual(rows(env).map(r => r.id).sort(), [doc.id, 'Dfresh', 'Dother'].sort());
  assert.ok(!env.MEDIA.store.has('private-docs/Dstale.pdf'));
  assert.ok(env.MEDIA.store.has('private-docs/Dfresh.pdf') && env.MEDIA.store.has('private-docs/Dother.pdf'));
});

test('an archived listing with private documents is not deleted', async () => {
  const env = ready(), cookie = await adminCookie();
  env.DB.raw.prepare('UPDATE listings SET archived_at = ? WHERE id = ?').run(T0, 'HE-R001');
  await upload(env);
  const res = await call(env, 'DELETE', '/admin/listings/HE-R001', { cookie, body: { confirm: 'HE-R001' } });
  assert.equal(res.status, 409);
  assert.ok(env.DB.raw.prepare('SELECT 1 FROM listings WHERE id = ?').get('HE-R001'));
  assert.equal(rows(env).length, 1);
});

test('the listing editor learns the flag from the listing response', async () => {
  const env = ready();
  const res = await call(env, 'GET', '/admin/listings/HE-R001', { cookie: await adminCookie() });
  assert.equal(res.data.documents_enabled, true);
});
