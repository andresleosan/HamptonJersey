import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { loadCriteriaSnapshot } from '../../server/search-criteria.js';
import { makeEnv, call, adminCookie } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery } = require('wrangler');
const migrations = new URL('../../migrations/', import.meta.url);
const proposal = new URL('../../docs/roadmap/work/BUS-12/criteria-revision.proposed.sql', import.meta.url);

async function apply(DB, url) {
  const statements = unstable_splitSqlQuery(readFileSync(url, 'utf8')).map(sql => DB.prepare(sql));
  if (statements.length) await DB.batch(statements);
}

test('D1 local preserves existing rows and proposed revision is atomic; a test-only conditional write has one winner', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: "export default { fetch() { return new Response('fixture') } }", compatibilityDate: '2025-10-01',
    host: '127.0.0.1', port: 0, d1Databases: { DB: 'bus12-criteria-synthetic' } }));
  try {
    const DB = await mf.getD1Database('DB');
    for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort())
      await apply(DB, new URL(file, migrations));
    const ts = '2026-01-01T12:00:00.000Z';
    await DB.prepare(`INSERT INTO contacts (name,email,last_activity_at,created_at,updated_at)
      VALUES ('Synthetic','person@example.test',?,?,?)`).bind(ts, ts, ts).run();
    await DB.prepare(`INSERT INTO applicants (contact_id,operation,source,search_state,parking_spaces,created_at,updated_at)
      VALUES (1,'rent','phone','needs_review',0,?,?)`).bind(ts, ts).run();
    const baseline = await DB.prepare('UPDATE applicants SET household_total=1 WHERE id=1').run();
    assert.equal(baseline.meta.changes, 1);
    const before = await DB.prepare('SELECT * FROM applicants WHERE id=1').first();
    await apply(DB, proposal);
    const { criteria_revision, ...after } = await DB.prepare('SELECT * FROM applicants WHERE id=1').first();
    assert.equal(criteria_revision, 0);
    assert.deepEqual(after, before);
    // D1 metadata includes the extra trigger write, whereas SQLite changes()
    // after the statement retains the count of rows directly updated.
    const [changed, directCount] = await DB.batch([
      DB.prepare('UPDATE applicants SET household_total=2 WHERE id=1'),
      DB.prepare('SELECT changes() AS count'),
    ]);
    assert.equal(changed.meta.changes, 2);
    assert.equal(directCount.results[0].count, 1);
    const initial = await loadCriteriaSnapshot({ DB }, 1);
    assert.equal(initial.search_state, 'needs_review');
    assert.equal(initial.criteria.parking_spaces, 0);
    assert.equal(initial.criteria.requirement_priorities, null);

    // This SQL is deliberately test-only: no production writer yet consumes
    // criteria_revision. It tests the proposal, not an operational CAS API.
    const write = value => DB.prepare('UPDATE applicants SET budget_max=? WHERE id=? AND criteria_revision=?')
      .bind(value, 1, initial.criteria_revision).run();
    const results = await Promise.all([write(2000), write(2200)]);
    assert.equal(results.filter(r => r.meta.changes === 0).length, 1);
    assert.equal(results.filter(r => r.meta.changes > 0).length, 1);
    const committed = await loadCriteriaSnapshot({ DB }, 1);
    assert.equal(committed.criteria_revision, initial.criteria_revision + 1);
    assert.ok([2000, 2200].includes(committed.criteria.budget_max));
    await assert.rejects(DB.batch([
      DB.prepare('UPDATE applicants SET budget_max=2500 WHERE id=1'),
      DB.prepare('UPDATE applicants SET budget_max=-1 WHERE id=1'),
    ]));
    const afterRollback = await loadCriteriaSnapshot({ DB }, 1);
    assert.equal(afterRollback.criteria_revision, committed.criteria_revision);
    assert.equal(afterRollback.criteria.budget_max, committed.criteria.budget_max);
    assert.equal(afterRollback.search_state, 'needs_review');
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results, []);

    // Exercise the existing writer on D1 with the proposal present. It still
    // uses updated_at, not criteria_revision, for its real optimistic lock.
    await DB.prepare('INSERT INTO admins(email,added_at) VALUES (?,?)').bind('admin@example.test', ts).run();
    const env = { ...makeEnv(), DB }, cookie = await adminCookie('admin@example.test');
    const seen = (await DB.prepare('SELECT updated_at FROM applicants WHERE id=1').first()).updated_at;
    const save = budget_max => call(env, 'PUT', '/admin/applicants/1',
      { cookie, body: { updated_at: seen, budget_max } });
    const saves = await Promise.all([save(3000), save(3200)]);
    assert.deepEqual(saves.map(response => response.status).sort(), [200, 409]);
    const afterSaves = await loadCriteriaSnapshot({ DB }, 1);
    assert.equal(afterSaves.criteria_revision, afterRollback.criteria_revision + 1);
    assert.equal(afterSaves.search_state, 'needs_review');
    const events = await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_type='applicant' AND entity_id='1' AND type='applicant.updated'").first();
    assert.equal(events.n, 1);
  } finally { await mf.dispose(); }
});
