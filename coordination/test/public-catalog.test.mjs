import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalogBoard, CATALOG_URL } from '../src/public-catalog.mjs';
const catalog = JSON.parse(await readFile(new URL('../../docs/roadmap/catalog.json', import.meta.url), 'utf8'));
const ok = data => async url => { assert.equal(url, CATALOG_URL); return Response.json(data); };
test('public catalogue projects real main states, without claiming live activity', async () => {
  const board = await catalogBoard(ok(catalog), () => new Date('2026-11-12T12:00:00Z'));
  assert.equal(board.source, 'github');
  assert.equal(board.tasks.length, 250);
  assert.equal(board.tasks.find(t => t.code === 'PUB-06').state, 'hecho');
  assert.ok(board.tasks.every(t => t.activity === 'unavailable' && !t.work));
  assert.ok(board.lists.every(l => l.activeCount === null));
});
test('an unavailable or malformed catalogue fails closed', async () => {
  await assert.rejects(() => catalogBoard(async () => new Response('', { status: 503 })));
  await assert.rejects(() => catalogBoard(ok({ schemaVersion: 1, tasks: [] })));
  await assert.rejects(() => catalogBoard(async () => new Response('x', { headers: { 'content-length': '3000000' } })));
});
