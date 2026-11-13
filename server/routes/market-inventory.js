import { fail, json, readJson } from '../http.js';
import { createInventoryRun, getInventoryCoverage, listInventoryRuns, transitionInventoryRun } from '../market-inventory-store.js';

const uuid = '[0-9a-fA-F-]{36}';
const allowedKeys = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
  Object.keys(object).every(key => keys.includes(key));

async function runs({ request, env }) {
  const after = new URL(request.url).searchParams.get('after');
  return json(await listInventoryRuns(env, after));
}

async function create({ request, env, admin }) {
  const body = await readJson(request, 16384);
  if (!allowedKeys(body, ['kind','manifest_revision','operation_id'])) fail(400, 'Invalid inventory request');
  const { id, kind, jersey_day, status, version, created_at } = await createInventoryRun(env, body, admin);
  return json({ run: { id, kind, jersey_day, status, version, created_at } }, 201);
}

async function coverage({ request, env, params }) {
  const after = new URL(request.url).searchParams.get('after');
  return json(await getInventoryCoverage(env, { run_id: params[0], after }));
}

async function transition({ request, env, params, admin }) {
  const body = await readJson(request, 16384);
  if (!allowedKeys(body, ['version','operation_id'])) fail(400, 'Invalid inventory request');
  const run = await transitionInventoryRun(env, { ...body, run_id: params[0], action: params[1] }, admin);
  return json({ run });
}

export default [
  ['GET', /^\/admin\/market\/runs$/, runs, true],
  ['POST', /^\/admin\/market\/runs$/, create, true],
  ['GET', new RegExp(`^/admin/market/runs/(${uuid})/coverage$`), coverage, true],
  ['POST', new RegExp(`^/admin/market/runs/(${uuid})/(pause|resume)$`), transition, true],
];
