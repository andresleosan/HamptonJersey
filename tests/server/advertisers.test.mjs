import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, adminCookie, seedListing } from './helpers.mjs';

const request = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const entry = { name: 'Example agency', kind: 'agency', contacts: [{ name: 'Alex', phones: [{ label: 'Office', number: '01534 123456' }, { label: 'Mobile', number: '07700 900123' }], email: 'alex@example.test' }], channels: [{ label: 'Website', url: 'https://example.test/' }], source_ids: [], listing_ids: [], commission: '', photo_permission: '' };

test('directory is private and preserves contacts and phones, with versioned updates', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'GET', '/admin/advertisers')).status, 401);
  const created = await request(env, 'POST', '/admin/advertisers', entry);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const { id, version } = created.data.advertiser;
  const found = await request(env, 'GET', `/admin/advertisers/${id}`);
  assert.deepEqual(found.data.advertiser.contacts[0].phones, entry.contacts[0].phones);
  assert.equal((await request(env, 'PUT', `/admin/advertisers/${id}`, { ...entry, version })).status, 200);
  assert.equal((await request(env, 'PUT', `/admin/advertisers/${id}`, { ...entry, version })).status, 409);
  assert.equal((await request(env, 'POST', '/admin/advertisers', { ...entry, channels: [{ label: 'Bad', url: 'javascript:alert(1)' }] })).status, 400);
});

test('manual retention action removes personal data and stale updates cannot restore it', async () => {
  const env = makeEnv();
  const made = await request(env, 'POST', '/admin/advertisers', { ...entry, kind: 'individual', name: 'Private person' });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const { id, version } = made.data.advertiser;
  assert.equal((await request(env, 'POST', `/admin/advertisers/${id}/retain`, { version, reason: '' })).status, 400);
  assert.equal((await request(env, 'POST', `/admin/advertisers/${id}/erase`, { version })).status, 200);
  const after = (await request(env, 'GET', `/admin/advertisers/${id}`)).data.advertiser;
  assert.equal(after.name, 'Personal data removed');
  assert.deepEqual(after.contacts, []);
  assert.equal((await request(env, 'PUT', `/admin/advertisers/${id}`, { ...entry, version })).status, 409);
});

test('calendar review dates, manual reasons, reference validation and no automated deletion', async () => {
  const env = makeEnv(); seedListing(env);
  assert.equal((await request(env, 'POST', '/admin/advertisers', { ...entry, listing_ids: ['missing'] })).status, 400);
  const made = await request(env, 'POST', '/admin/advertisers', { ...entry, name_personal: false, commission: 'Fixed fee', commission_personal: false, channels: [{label:'Website',url:'https://example.test',personal:false}], listing_ids: ['HE-R001'] });
  const id = made.data.advertiser.id;
  env.DB.raw.prepare('UPDATE advertisers SET activity_on = ? WHERE id = ?').run('2024-03-31', id);
  let a = (await request(env, 'GET', `/admin/advertisers/${id}`)).data.advertiser;
  assert.equal(a.review_on, '2025-02-28');
  assert.equal(a.due_on, '2025-03-31');
  const retained = await request(env, 'POST', `/admin/advertisers/${id}/retain`, { version: a.version, reason: 'Open case' });
  assert.equal(retained.status, 200);
  a = (await request(env, 'GET', `/admin/advertisers/${id}`)).data.advertiser;
  assert.equal(a.due_on, '2025-03-31');
  assert.equal(a.last_review_action, 'retained');
  assert.ok(a.last_review_on >= a.due_on);
  assert.equal(a.contacts.length, 1);
  assert.equal((await request(env, 'POST', `/admin/advertisers/${id}/erase`, { version: a.version })).status, 200);
  const final = (await request(env, 'GET', `/admin/advertisers/${id}`)).data;
  assert.ok(final.reviews.every(r => r.reason === null));
  assert.deepEqual(final.advertiser.listing_ids, ['HE-R001']);
  assert.equal(final.advertiser.name, 'Example agency');
  assert.equal(final.advertiser.commission, 'Fixed fee');
  assert.equal(final.advertiser.channels.length, 1);
});

test('all advertisers of a research property retain their separate phones', async () => {
  const env = makeEnv();
  env.DB.raw.prepare('INSERT INTO research_sources(source_id, property_id) VALUES (?, ?), (?, ?)').run('source-1','property-1','source-2','property-1');
  for (const [name, source] of [['First','source-1'],['Second','source-2']]) {
    assert.equal((await request(env,'POST','/admin/advertisers',{...entry,name,source_ids:[source]})).status,201);
  }
  const found = await request(env,'GET','/admin/advertisers?property_id=property-1');
  assert.equal(found.data.advertisers.length,2);
  assert.deepEqual(found.data.advertisers.map(a => a.contacts[0].phones.length),[2,2]);
});

test('invalid inputs and concurrent saves do not corrupt the record', async () => {
  const env = makeEnv();
  assert.equal((await request(env, 'POST', '/admin/advertisers', { ...entry, contacts: [{ name: 'Person', email: 'invalid', phones: [] }] })).status, 400);
  assert.equal((await call(env, 'POST', '/admin/advertisers', { body: entry, cookie: await adminCookie(), origin: 'https://attacker.test' })).status, 403);
  const created = await request(env, 'POST', '/admin/advertisers', entry);
  const { id, version } = created.data.advertiser;
  const updates = await Promise.all(['First', 'Second'].map(name => request(env, 'PUT', `/admin/advertisers/${id}`, { ...entry, name, version })));
  assert.deepEqual(updates.map(r => r.status).sort(), [200, 409]);
  assert.ok(['First', 'Second'].includes((await request(env, 'GET', `/admin/advertisers/${id}`)).data.advertiser.name));
});
