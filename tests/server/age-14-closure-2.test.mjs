// AGE-14 removal: tombstone, CAS, idempotency, queued email and references. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { call, adminCookie, seedListing } from './helpers.mjs';
import { person, ready, request, made, outbound } from './age-14-fixtures.mjs';

const path = id => `/admin/advertisers/${id}/suppression`;
const secrets = ['Synthetic Private Person', 'Synthetic Contact', 'person.one@example.test', '07700 900111'];
const leaks = value => secrets.filter(s => JSON.stringify(value).toLowerCase().includes(s.toLowerCase()));
async function suppress(env, id, over = {}) {
  const p = (await request(env, 'GET', path(id))).data;
  return request(env, 'POST', path(id), { version: p.version, preview_hash: p.preview_hash, reason: 'no_longer_needed', ...over });
}

test('removal scrubs personal fields, keeps references and review dates, and records no personal data', async () => {
  const env = ready(); seedListing(env);
  const a = await made(env, { ...person, listing_ids: ['HE-R001'] });
  assert.equal((await request(env, 'POST', `/admin/advertisers/${a.id}/retain`, { version: a.version, reason: 'Open case' })).status, 200);
  const before = (await request(env, 'GET', `/admin/advertisers/${a.id}`)).data;
  const r = await suppress(env, a.id);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const x = r.data.advertiser;
  assert.equal(x.name, 'Personal data removed'); assert.deepEqual(x.contacts, []); assert.ok(x.suppressed_at);
  assert.deepEqual([x.kind, x.listing_ids, x.channels, x.commission], ['individual', ['HE-R001'], person.channels, 'Fixed fee']);
  // retain_reason_not_fake_activity: the 11/12-month dates and the human decision history are unchanged.
  assert.deepEqual([x.activity_on, x.review_on, x.due_on], [before.advertiser.activity_on, before.advertiser.review_on, before.advertiser.due_on]);
  const after = (await request(env, 'GET', `/admin/advertisers/${a.id}`)).data;
  assert.deepEqual(after.reviews, before.reviews);
  assert.deepEqual(leaks(after), []);
  assert.deepEqual(leaks((await request(env, 'GET', '/admin/advertisers')).data), []);
  assert.deepEqual(leaks((await request(env, 'GET', '/admin/advertisers?listing_id=HE-R001')).data.advertisers.map(r => r.id)), []);
  assert.equal((await request(env, 'GET', '/admin/advertisers?listing_id=HE-R001')).data.advertisers.length, 1);
  // no_pii_before_snapshot_in_audit
  const audit = env.DB.raw.prepare('SELECT advertiser_id, reason, actor FROM advertiser_suppressions').all();
  assert.deepEqual(audit.map(r => ({ ...r })), [{ advertiser_id: a.id, reason: 'no_longer_needed', actor: 'admin@example.test' }]);
  assert.deepEqual(leaks(env.DB.raw.prepare('SELECT * FROM advertisers').all()), []);
  // preview of a removed record: nothing left to remove
  const p = (await request(env, 'GET', path(a.id))).data;
  assert.deepEqual([p.suppressed, p.affected_fields], [true, []]);
});

test('pending_put_cannot_restore: stale and current saves, activity and reasons are refused after removal', async () => {
  const env = ready(), a = await made(env);
  assert.equal((await suppress(env, a.id)).status, 200);
  for (const version of [a.version, a.version + 1]) {
    const put = await request(env, 'PUT', `/admin/advertisers/${a.id}`, { ...person, version });
    assert.equal(put.status, 409, JSON.stringify(put.data));
  }
  assert.equal((await request(env, 'POST', `/admin/advertisers/${a.id}/activity`, { version: a.version + 1 })).status, 409);
  assert.equal((await request(env, 'POST', `/admin/advertisers/${a.id}/retain`, { version: a.version + 1, reason: 'Synthetic Private Person' })).status, 409);
  assert.deepEqual(leaks((await request(env, 'GET', `/admin/advertisers/${a.id}`)).data), []);
});

test('stale version or preview is refused with 409 and no write; repeat is idempotent', async () => {
  const env = ready(), a = await made(env);
  const p = (await request(env, 'GET', path(a.id))).data;
  assert.equal((await request(env, 'PUT', `/admin/advertisers/${a.id}`, { ...person, commission: 'Changed', version: a.version })).status, 200);
  assert.equal((await request(env, 'POST', path(a.id), { version: p.version, preview_hash: p.preview_hash, reason: 'person_request' })).status, 409);
  const fresh = (await request(env, 'GET', path(a.id))).data;
  outbound(env, 'person.one@example.test', 'accepted');
  assert.equal((await request(env, 'POST', path(a.id), { version: fresh.version, preview_hash: fresh.preview_hash, reason: 'person_request' })).status, 409);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM advertiser_suppressions').get().n, 0);
  assert.equal((await request(env, 'GET', `/admin/advertisers/${a.id}`)).data.advertiser.name, person.name);
  for (const bad of [{ reason: 'other' }, { version: 'x' }, { preview_hash: 'abc' }]) assert.equal((await suppress(env, a.id, bad)).status, 400);
  assert.equal((await call(env, 'POST', path(a.id), { body: {}, cookie: await adminCookie(), origin: 'https://attacker.test' })).status, 403);
  assert.equal((await call(env, 'POST', path(a.id), { body: {} })).status, 401);
  const first = await suppress(env, a.id, { reason: 'person_request' });
  assert.equal(first.status, 200);
  const again = await request(env, 'POST', path(a.id), { version: fresh.version, preview_hash: fresh.preview_hash, reason: 'no_longer_needed' });
  assert.equal(again.status, 200); assert.equal(again.data.already, true);
  assert.deepEqual(again.data.advertiser, first.data.advertiser);
  assert.equal(env.DB.raw.prepare('SELECT reason FROM advertiser_suppressions').get().reason, 'person_request');
});

test('queued_outbound_invalidated: pending email to the removed address is cancelled, other mail untouched', async () => {
  const env = ready(), a = await made(env);
  outbound(env, 'person.one@example.test', 'queued'); outbound(env, 'person.one@example.test', 'draft');
  outbound(env, 'someone.else@example.test', 'queued'); outbound(env, 'person.one@example.test', 'accepted');
  const r = await suppress(env, a.id);
  assert.equal(r.status, 200);
  assert.equal(r.data.cancelled_outbound, 2); assert.equal(r.data.complete, false);
  assert.deepEqual(r.data.blockers, [{ source: 'outbound_sent', reason: 'kept_by_email_retention' }]);
  const rows = env.DB.raw.prepare('SELECT recipient, status FROM outbound ORDER BY id').all().map(r => `${r.recipient}:${r.status}`);
  assert.deepEqual(rows, ['person.one@example.test:cancelled', 'person.one@example.test:cancelled', 'someone.else@example.test:queued', 'person.one@example.test:accepted']);
});

test('concurrent removal and save of the same version: one wins and personal data is never restored', async () => {
  const env = ready(), a = await made(env);
  const p = (await request(env, 'GET', path(a.id))).data;
  const [s, put] = await Promise.all([
    request(env, 'POST', path(a.id), { version: p.version, preview_hash: p.preview_hash, reason: 'no_longer_needed' }),
    request(env, 'PUT', `/admin/advertisers/${a.id}`, { ...person, name: 'Synthetic Private Person 2', version: a.version })]);
  assert.deepEqual([s.status, put.status].sort(), [200, 409]);
  const row = (await request(env, 'GET', `/admin/advertisers/${a.id}`)).data.advertiser;
  if (s.status === 200) { assert.equal(row.name, 'Personal data removed'); assert.deepEqual(row.contacts, []); }
  else assert.equal(row.suppressed_at, null);
});
