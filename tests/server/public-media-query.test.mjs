import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,seedListing,seedMedia,call} from './helpers.mjs';
import {readLive} from '../../server/routes/public.js';

// The public photos are read from the live listings by media_listing, not by walking the whole media table. The
// answers are the same as with the earlier join, switched off and on (PUB-16).
const OLD = 'SELECT m.* FROM media m JOIN listings l ON l.id = m.listing_id';
const NEW = 'SELECT m.* FROM listings l CROSS JOIN media m ON m.listing_id = l.id';
function world(on) {
  const env = makeEnv(); if (on) env.PUB16_TIMED_CLOSURE_READY = '1';
  for (let i = 1; i <= 12; i++) {
    const id = `HE-R${String(i).padStart(3, '0')}`;
    seedListing(env, { id, title: `Synthetic ${i}`, published: i <= 4 ? 1 : 0, archived_at: i === 4 ? '2026-01-01T00:00:00.000Z' : null });
    for (let n = 0; n < 6; n++) seedMedia(env, { id: `M${i}-${n}`, listing_id: id, r2_key: `k/${i}/${n}`, thumb_key: null,
      public: n % 3 ? 1 : 0, position: (n * 5 + i) % 4 });
  }
  return env;
}
const withJoin = (env, from, to) => { const prepare = env.DB.prepare.bind(env.DB); let used = 0;
  env.DB.prepare = sql => { if (sql.includes(from)) { used++; sql = sql.replace(from, to); } return prepare(sql); }; return () => used; };

for (const on of [false, true]) test(`the public listings answer as before with the indexed photo read (PUB-16 ${on ? 'on' : 'off'})`, async () => {
  const now = world(on), before = world(on), used = withJoin(before, NEW, OLD);
  const a = await call(now, 'GET', '/listings'), b = await call(before, 'GET', '/listings');
  assert.equal(a.status, 200); assert.equal(a.data.length, 3); assert.deepEqual(a.data, b.data);
  assert.deepEqual((await readLive(now, 'HE-R002')).map(x => x.pub), (await readLive(before, 'HE-R002')).map(x => x.pub));
  assert.ok(used() >= 2, 'the earlier query was really run');
  const live = `l.published = 1 AND l.archived_at IS NULL AND m.public = 1 ORDER BY m.position, m.id`;
  const plan = now.DB.raw.prepare(`EXPLAIN QUERY PLAN ${NEW} WHERE ${live}`).all().map(r => r.detail).join(' | ');
  assert.match(plan, /SEARCH m USING INDEX media_listing \(listing_id=\?\)/); assert.doesNotMatch(plan, /SCAN m\b/);
});
