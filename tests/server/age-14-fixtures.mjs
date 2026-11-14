// AGE-14 shared synthetic fixtures (not a test file).
import assert from 'node:assert/strict';
import { makeEnv, call, adminCookie, T0 } from './helpers.mjs';

export const person = { name: 'Synthetic Private Person', kind: 'individual', contacts: [{ name: 'Synthetic Contact', email: 'Person.One@Example.test',
  phones: [{ label: 'Mobile', number: '07700 900111' }] }], channels: [{ label: 'Website', url: 'https://example.test/' }],
  source_ids: [], listing_ids: [], commission: 'Fixed fee', photo_permission: '' };
export const ready = () => ({ ...makeEnv(), AGE14_SUPPRESSION_READY: '1' });
export const request = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
export async function made(env, entry = person) {
  const r = await request(env, 'POST', '/admin/advertisers', entry); assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.advertiser;
}
export const outbound = (env, recipient, status) => env.DB.raw.prepare(`INSERT INTO outbound(ref,dedupe_key,template,entity_id,version,recipient,
  recipient_hash,status,approved_at,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?,?,?,?)`).run(`ref-${status}-${recipient}`, `key-${status}-${recipient}`,
  'synthetic', '1', recipient, 'hash', status, status === 'draft' ? null : T0, T0, T0);
