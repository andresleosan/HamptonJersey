// PUB-01: the legal lines of property.txt are saved by the editor's own route once the draft exists. Synthetic data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDraft } from '../admin/src/createDraft.js';

const LEGAL = { occupancy: 'tenanted', rental_licence: 'provided', rental_licence_ref: 'LIC-FIXTURE-0001' };
async function run(options, putStatus = 200) {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (path, { method = 'GET', body } = {}) => {
    calls.push([method, path, body ? JSON.parse(body) : undefined]);
    if (method === 'POST') return Response.json({ id: 'HE-R123' }, { status: 201 });
    if (method === 'PUT') return Response.json(putStatus === 200 ? {} : { error: 'Nothing to save' }, { status: putStatus });
    return Response.json({ listing: { updated_at: 'synthetic-version' } });
  };
  try { return { result: await createDraft({ title: 'Fixture' }, [], options), calls }; } finally { globalThis.fetch = original; }
}

test('the legal details follow the creation through the listing save, with its version', async () => {
  const { result, calls } = await run({ legal: LEGAL });
  assert.deepEqual(calls, [['POST', '/api/admin/listings', { title: 'Fixture' }], ['GET', '/api/admin/listings/HE-R123', undefined],
    ['PUT', '/api/admin/listings/HE-R123', { ...LEGAL, updated_at: 'synthetic-version' }]]);
  assert.deepEqual([result.id, result.legalFailed], ['HE-R123', false]);
});

test('a refused legal save is reported and the draft is kept', async () => {
  const { result } = await run({ legal: LEGAL }, 400);
  assert.deepEqual([result.id, result.legalFailed], ['HE-R123', true]);
});

test('without legal details nothing else is sent, as in Properties Queue', async () => {
  const { result, calls } = await run({ path: '/admin/queue/7/draft' });
  assert.deepEqual(calls.map(c => c.slice(0, 2)), [['POST', '/api/admin/queue/7/draft']]);
  assert.equal(result.legalFailed, false);
});
