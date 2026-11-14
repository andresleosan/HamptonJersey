// PUB-11 documents on disposable local D1 and R2 (Miniflare): no remote database or bucket, synthetic bytes only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, adminCookie, ORIGIN, T0 } from './helpers.mjs';
import { handleApi } from '../../server/api.js';

const ROOT = new URL('../../', import.meta.url);
const require = createRequire(new URL('package.json', ROOT));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery: split } = require('wrangler');
const pdf = new TextEncoder().encode('%PDF-1.7\nsynthetic-d1-document\n%%EOF\n');

test('D1 local: documents commit, roll back and reconcile with real D1 and R2', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, host: '127.0.0.1', port: 0,
    compatibilityDate: '2025-10-01', script: 'export default {fetch(){return new Response("fixture")}}',
    d1Databases: { DB: 'pub11-documents-synthetic' }, r2Buckets: { MEDIA: 'pub11-documents-synthetic' } }));
  try {
    const DB = await mf.getD1Database('DB'), MEDIA = await mf.getR2Bucket('MEDIA'), dir = new URL('migrations/', ROOT);
    for (const file of readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
      const statements = split(readFileSync(new URL(file, dir), 'utf8'));
      if (statements.length) await DB.batch(statements.map(sql => DB.prepare(sql)));
    }
    await DB.prepare("INSERT INTO admins(email,added_at) VALUES('admin@example.test',?)").bind(T0).run();
    await DB.prepare(`INSERT INTO listings(id,use,title,operation,availability,archived_at,created_at,updated_at)
      VALUES('HE-R900','residential','Synthetic document fixture','sale','for_sale',?,?,?)`).bind(T0, T0, T0).run();
    const env = { ...makeEnv(), DB, MEDIA, PUB11_DOCUMENTS_READY: '1' }, cookie = await adminCookie();
    const request = (method, path, body) => {
      const headers = { origin: ORIGIN, cookie, ...(body ? { 'content-type': 'application/pdf' } : {}) };
      return handleApi(new Request(`${ORIGIN}/api${path}`, { method, headers, body }), env, path.slice(1).split('/'));
    };
    const rows = async () => (await DB.prepare('SELECT id,status FROM listing_documents ORDER BY id').all()).results;
    const objects = async () => (await MEDIA.list({ prefix: 'private-docs/' })).objects.map(o => o.key);
    const base = '/admin/listings/HE-R900/documents';

    await t.test('the schema refuses keys outside the private prefix and public visibility', async () => {
      const insert = (key, visibility = 'staff') => DB.prepare(`INSERT INTO listing_documents
        (id,listing_id,r2_key,bytes,sha256,visibility,created_at,created_by) VALUES('Dx','HE-R900',?,1,?,?,?,'t')`)
        .bind(key, 'a'.repeat(64), visibility, T0).run();
      await assert.rejects(insert('uploads/x.pdf'), /CHECK/);
      await assert.rejects(insert('private-docs/x.pdf', 'public'), /CHECK/);
    });

    await t.test('upload stores the verified bytes and a stored row; download returns them', async () => {
      const res = await request('POST', base, pdf);
      assert.equal(res.status, 201);
      const { document } = await res.json();
      assert.deepEqual(await rows(), [{ id: document.id, status: 'stored' }]);
      assert.deepEqual(await objects(), [`private-docs/${document.id}.pdf`]);
      const file = await request('GET', `${base}/${document.id}`);
      assert.equal(file.status, 200);
      assert.equal(file.headers.get('content-disposition'), `attachment; filename="${document.id}.pdf"`);
      assert.deepEqual(new Uint8Array(await file.arrayBuffer()), pdf);
    });

    await t.test('the archived listing with a document is not deleted (409, foreign key behind it)', async () => {
      const res = await handleApi(new Request(`${ORIGIN}/api/admin/listings/HE-R900`, { method: 'DELETE',
        headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'HE-R900' }) }),
      env, ['admin', 'listings', 'HE-R900']);
      assert.equal(res.status, 409);
      await assert.rejects(DB.prepare("DELETE FROM listings WHERE id='HE-R900'").run(), /FOREIGN KEY/);
    });

    await t.test('remove deletes row and object together', async () => {
      const [{ id }] = await rows();
      assert.equal((await request('DELETE', `${base}/${id}`)).status, 200);
      assert.deepEqual(await rows(), []);
      assert.deepEqual(await objects(), []);
    });

    await t.test('a failed commit on D1 rolls back the event and removes the object and intent', async () => {
      await DB.prepare(`CREATE TRIGGER fixture_doc_abort BEFORE UPDATE ON listing_documents WHEN NEW.status='stored'
        BEGIN SELECT RAISE(ABORT,'synthetic commit failure'); END`).run();
      const events = (await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type LIKE 'listing_document.%'").first()).n;
      assert.equal((await request('POST', base, pdf)).status, 500);
      assert.deepEqual(await rows(), []);
      assert.deepEqual(await objects(), []);
      assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type LIKE 'listing_document.%'").first()).n, events);
      await DB.prepare('DROP TRIGGER fixture_doc_abort').run();
    });

    await t.test('R2 refuses bytes that do not match the recorded digest', async () => {
      await assert.rejects(MEDIA.put('private-docs/check.pdf', pdf, { sha256: '0'.repeat(64) }));
      assert.deepEqual(await objects(), []);
    });
  } finally { await mf.dispose(); }
});
