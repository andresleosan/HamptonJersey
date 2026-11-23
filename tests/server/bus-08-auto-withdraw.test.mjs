// BUS-09: a market advert missing from two complete reads of its channel is no longer offered (MARKET_AUTO_WITHDRAW_READY);
// nothing is deleted and a later read brings it back. Synthetic sources, adverts and people only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, call, adminCookie } from './helpers.mjs';
import { RECOMPUTE_FLAGS, SourceReadError, marketSweepPass } from '../../server/market-daily-sweep.js';
import { marketRematchPass } from '../../server/market-rematch.js';

const DAY0 = Date.parse(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) + 'T03:00:00.000Z');
const at = (day, minutes = 0) => new Date(DAY0 + day * 86400000 + minutes * 60000).toISOString();
const one = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a);
const n = (env, sql, ...a) => one(env, sql, ...a).n;
const rest = env => env.DB.raw.exec(`UPDATE market_source_activity SET last_acquired_at=NULL;
  UPDATE market_source_runs SET next_due='2000-01-01T00:00:00.000Z' WHERE next_due IS NOT NULL;`);

function world(on) {
  const env = makeEnv(), db = env.DB.raw;
  Object.assign(env, { BUS08_SWEEP_READY: '1', MARKET_INVENTORY_READY: '1', EST01_SEARCH_STATE_READY: '1', BUS04_REMATCH_READY: '1' });
  for (const flag of RECOMPUTE_FLAGS) env[flag] = '1';
  if (on) env.MARKET_AUTO_WITHDRAW_READY = '1';
  db.prepare("INSERT INTO market_directory_manifests VALUES ('rev-1',?,'2000-01-01T00:00:00.000Z','fixture','accepted')").run('a'.repeat(64));
  db.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,source_class,access_status,method,
    policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at,allowed_hosts,allowed_paths)
    VALUES ('agency-a','site','rev-1','external','general','allowed','http',1,'fixture-evidence','fixture-retention',
    '2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z','["agency-a.example.test"]','["/properties"]')`).run();
  return env;
}
// The channel's adverts today; down: the read fails.
function site(keys) {
  const state = { keys, down: false };
  state.readers = { 'agency-a': { async readPage() {
    if (state.down) throw new SourceReadError('unavailable');
    return { exhausted: true, next_cursor: null, records: state.keys.map(key => ({ external_key: key,
      raw: { listing_url: `https://agency-a.example.test/properties/${key}` },
      observation: { country_code: 'JE', territory_evidence: 'Address on the listing: Jersey', operation: 'rent',
        title: `Synthetic flat ${key}`, parish: 'St Helier', bedrooms: 2, bathrooms: 1,
        financial_terms: [{ kind: 'rent', amount_minor: 150000, currency: 'GBP', period: 'month' }] } })) };
  } } };
  return state;
}
// One Jersey day swept to its comparison, then BUS-04 drained.
async function day(env, d, readers) {
  for (let i = 0; i < 12; i++) { rest(env); if ((await marketSweepPass(env, at(d, i * 10), { readers })).compared) break; }
  for (let i = 0; i < 10; i++) {
    const out = await marketRematchPass(env, at(d, 300 + i));
    if (!out.consumed && !out.crossed.length) break;
  }
}
const held = (env, id) => env.DB.raw.prepare('SELECT home_key FROM market_matches WHERE applicant_id=? ORDER BY home_key')
  .all(id).map(r => JSON.parse(r.home_key)[2]);
const reason = (env, d) => one(env, `SELECT n.task_reason FROM notifications n JOIN market_runs r ON n.task_key='bus08:sweep:'||r.id
  WHERE r.kind='daily' AND r.jersey_day=?`, at(d).slice(0, 10))?.task_reason;

async function scenario(on) {
  const env = world(on), s = site(['A-1', 'A-2', 'A-3']);
  const r = await call(env, 'POST', '/admin/applicants', { cookie: await adminCookie(), body: { name: 'Jane Le Brocq',
    email: 'jane@example.je', phone: '07797 100001', source: 'phone', operation: 'rent', budget_max: 2000, bedrooms_min: 2 } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const id = r.data.id, out = { env, id, held: [], reasons: [] };
  const record = d => { out.held.push(held(env, id)); out.reasons.push(reason(env, d)); };
  await day(env, 0, s.readers); record(0);
  s.keys = ['A-1', 'A-3']; // A-2 leaves the site
  await day(env, 1, s.readers); record(1);
  s.down = true; // a failed day between the two misses
  await day(env, 2, s.readers); record(2);
  s.down = false;
  await day(env, 3, s.readers); record(3);
  s.keys = ['A-1', 'A-2', 'A-3']; // it comes back
  await day(env, 4, s.readers); record(4);
  return out;
}

test('two complete reads without an advert withdraw it from searches; a failed day counts for nothing; it comes back', async () => {
  const { env, held: h, reasons } = await scenario(true);
  assert.deepEqual(h[0], ['A-1', 'A-2', 'A-3']);
  assert.deepEqual(h[1], ['A-1', 'A-2', 'A-3'], 'one miss: still proposed');
  assert.deepEqual(h[2], ['A-1', 'A-2', 'A-3'], 'a failed read is not a miss');
  assert.deepEqual(h[3], ['A-1', 'A-3'], 'two complete reads without it: withdrawn');
  assert.deepEqual(h[4], ['A-1', 'A-2', 'A-3'], 'read again: back on its own');
  assert.equal(reasons[1], `${at(1).slice(0, 10)}: 1 adverts not found, 0 withdrawn after two complete reads without them, ` +
    '0 sources not read in full. Nothing was deleted; a withdrawn advert comes back when it is read again.');
  assert.match(reasons[2], /0 withdrawn after two complete reads without them, 1 sources not read in full/);
  assert.match(reasons[3], /: 0 adverts not found, 1 withdrawn after two complete reads without them, 0 sources/);
  assert.equal(reasons[4], undefined);
  // Nothing deleted nor tombstoned, never an unavailability; BUS-04 was told through the outbox, once each way.
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_observations WHERE external_key='A-2'"), 2);
  assert.equal(one(env, "SELECT gone FROM market_latest_observations WHERE external_key='A-2'").gone, 0);
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM availability_confirmations'), 0);
  assert.deepEqual(env.DB.raw.prepare(`SELECT o.external_key,x.observation_version AS v FROM market_change_outbox x
    JOIN market_observations o ON o.id=x.observation_id WHERE x.observation_version>1 ORDER BY v`).all().map(r => ({ ...r })),
  [{ external_key: 'A-2', v: 2 }, { external_key: 'A-2', v: 3 }]);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_change_outbox WHERE consumer_state='pending'"), 0);
});

test('off: nothing is withdrawn and the day reads as before', async () => {
  const { env, held: h, reasons } = await scenario(false);
  for (const d of [0, 1, 2, 3, 4]) assert.deepEqual(h[d], ['A-1', 'A-2', 'A-3']);
  assert.equal(reasons[1], `${at(1).slice(0, 10)}: 1 adverts not found, 0 sources not read in full. Nothing was marked unavailable.`);
  assert.equal(reasons[3], undefined, 'the second miss is no review while off');
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_change_outbox WHERE observation_version>1'), 0);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_daily_sweeps WHERE changes>0"), 1);
});

test('the switch is declared off in both wrangler files', () => {
  for (const file of ['wrangler.toml', 'jobs/wrangler.toml'])
    assert.match(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), /^MARKET_AUTO_WITHDRAW_READY = "0"$/m);
});
