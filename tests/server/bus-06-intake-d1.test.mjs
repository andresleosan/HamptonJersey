// BUS-06 on a real local D1: manifest intake, per-channel review, a manual batch, coverage and closing the batch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, call, adminCookie } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery } = require('wrangler');
const op = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('D1 local: a directory is accepted atomically, one channel is opened and read by hand, the rest stay pending', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('fixture')}}",
    compatibilityDate: '2025-10-01', host: '127.0.0.1', port: 0, d1Databases: { DB: 'bus06-intake-fixture' } }));
  try {
    const db = await mf.getD1Database('DB'), dir = new URL('../../migrations/', import.meta.url);
    for (const name of readdirSync(dir).filter(name => name.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), 'utf8')).map(q => db.prepare(q)));
    await db.prepare("INSERT INTO admins (email,added_by,added_at) VALUES ('admin@example.test','fixture','2026-01-01T00:00:00.000Z')").run();
    const env = makeEnv(); env.DB = db; env.MARKET_INVENTORY_READY = '1'; const cookie = await adminCookie();
    const channels = Array.from({ length: 240 }, (_, n) => ({ source_ref: `agency-${String(n).padStart(3, '0')}`, channel_id: 'web',
      source_kind: 'external', source_class: 'unclassified', access_status: 'pending', review_state: 'terms_and_method_review' }));
    const manifest = JSON.stringify({ schema_version: 1, revision: 'bus23-fixture-d1', channels }) + '\n';
    const sha256 = createHash('sha256').update(manifest).digest('hex');
    // One invalid channel refuses the whole file: no manifest and no channel is left behind.
    const broken = JSON.stringify({ schema_version: 1, revision: 'bus23-broken', channels: [...channels, { source_ref: 'x', channel_id: 'y', source_class: 'internal' }] });
    assert.equal((await call(env, 'POST', '/admin/market/manifests', { cookie, body: { manifest: broken, sha256: createHash('sha256').update(broken).digest('hex') } })).status, 400);
    const both = await Promise.all([1, 2].map(() => call(env, 'POST', '/admin/market/manifests', { cookie, body: { manifest, sha256 } })));
    assert.deepEqual(both.map(r => r.status).sort(), [200, 201]);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM market_sources').first()).n, 240);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM market_sources WHERE access_status<>'pending'").first()).n, 0);
    const reviewed = await call(env, 'POST', '/admin/market/sources/review', { cookie, body: { source_ref: 'agency-000', channel_id: 'web',
      version: 1, operation_id: op(1), source_class: 'general', status: 'manual_only', method: 'manual',
      allowed_hosts: ['agency-000.example.test'], allowed_paths: ['/'], allowed_redirect_hosts: [], min_interval_s: 60,
      evidence_ref: 'fixture-evidence', retention_ref: 'fixture-retention', review_due_at: '2999-01-01T00:00:00.000Z' } });
    assert.equal(reviewed.status, 200);
    const run = (await call(env, 'POST', '/admin/market/runs', { cookie,
      body: { kind: 'initial', manifest_revision: 'bus23-fixture-d1', operation_id: op(2) } })).data.run;
    const at = new Date(Date.now() - 3000).toISOString();
    const saved = await call(env, 'POST', '/admin/market/manual-pages', { cookie, body: { schema_version: 1, run_id: run.id,
      source_ref: 'agency-000', channel_id: 'web', policy_version: 2, page_key: 'batch-1', observed_at: at,
      records: [{ external_key: 'ref-1', source_at: at, listing_url: 'https://agency-000.example.test/one',
        observation: { country_code: 'JE', territory_evidence: 'fixture:territory', operation: 'sale', observed_at: at, title: 'Synthetic house',
          financial_terms: [{ kind: 'sale_price', amount_minor: 50000000, currency: 'GBP', period: 'sale' }] } }] } });
    assert.equal(saved.status, 201);
    const coverage = (await call(env, 'GET', `/admin/market/runs/${run.id}/coverage`, { cookie })).data;
    assert.ok(coverage.sources.every(s => s.source_ref === 'agency-000' ? s.listings === 1 : s.listings === null));
    assert.equal(coverage.sources.length, 50); assert.ok(coverage.next); assert.equal(coverage.overall.external_coverage, 'unknown');
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM market_observations').first()).n, 1);
    const closed = await call(env, 'POST', `/admin/market/runs/${run.id}/close`, { cookie, body: { version: run.version, operation_id: op(3) } });
    assert.equal(closed.status, 200); assert.equal(closed.data.run.status, 'partial');
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  } finally { await mf.dispose(); }
});
