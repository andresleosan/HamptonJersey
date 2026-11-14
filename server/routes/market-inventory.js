import { fail, json, readJson } from '../http.js';
import { acceptDirectoryManifest, claimSourcePage, closeInventoryRun, createInventoryRun, getInventoryCoverage,
  listDirectoryManifests, listInventoryRuns, transitionInventoryRun } from '../market-inventory-store.js';
import { getSourceAccess, reviewSourceAccess } from '../market-source-policy.js';
import { manualScopeAllows, prepareManualObservationPage } from '../market-manual-contract.js';
import { ingestManualObservationPage } from '../market-observation-ingest.js';

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
  const run = params[1] === 'close' ? await closeInventoryRun(env, { version: body.version, run_id: params[0] })
    : await transitionInventoryRun(env, { ...body, run_id: params[0], action: params[1] }, admin);
  return json({ run });
}

// BUS-06: the directory enters only here, as the exact text an admin confirmed by its fingerprint.
async function manifests({ env }) {
  return json(await listDirectoryManifests(env));
}
async function acceptManifest({ request, env, admin }) {
  const body = await readJson(request, 1048576);
  if (!allowedKeys(body, ['manifest','sha256'])) fail(400, 'Invalid inventory request');
  const { replayed, ...manifest } = await acceptDirectoryManifest(env, body, admin);
  return json({ manifest }, replayed ? 200 : 201);
}

// BUS-06/BUS-09: a batch of listings typed in by staff for one reviewed channel. Never a reader: it
// fetches nothing, and it cannot declare a channel fully read.
async function manualPage({ request, env, admin }) {
  const body = await readJson(request, 131072);
  if (!allowedKeys(body, ['schema_version','run_id','source_ref','channel_id','policy_version','page_key','observed_at','records']) ||
      body.schema_version !== 1 || typeof body.run_id !== 'string' || !new RegExp(`^${uuid}$`).test(body.run_id))
    fail(400, 'Invalid manual observation page');
  const { run_id, source_ref, channel_id } = body;
  // BUS-19 decides: the version the admin saw must still be the effective manual decision.
  const decision = await getSourceAccess(env, source_ref, channel_id);
  const sourceRun = await primary(env.DB).prepare('SELECT cursor FROM market_source_runs WHERE run_id=? AND source_ref=? AND channel_id=?')
    .bind(run_id, source_ref, channel_id).first();
  if (!sourceRun) fail(404, 'Inventory run or channel not found');
  const page = { page_key: body.page_key, cursor: sourceRun.cursor, next_cursor: body.page_key, exhausted: false,
    observed_at: body.observed_at, records: body.records };
  // Everything is checked before the channel is taken, so a refused batch does not use up its interval.
  const urls = prepareManualObservationPage(page).records.map(record => record.raw.listing_url);
  if (decision.version !== body.policy_version || decision.method !== 'manual' || !['allowed','manual_only'].includes(decision.status))
    fail(409, 'This channel is not open for manual upload');
  if (!manualScopeAllows(JSON.stringify(decision.allowed_hosts), JSON.stringify(decision.allowed_paths), urls))
    fail(400, 'Listing links must be on the hosts and paths reviewed for this channel');
  const lease = await claimSourcePage(env, { run_id, source_ref, channel_id });
  await ingestManualObservationPage(env, { lease, page }, admin);
  return json({ accepted: true, records: urls.length }, 201);
}

// Cursor contains only public source/channel identifiers, never evidence references.
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const encodeCursor = pair => btoa(encodeURIComponent(JSON.stringify(pair))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function decodeCursor(raw) {
  if (raw === null) return null;
  if (typeof raw !== 'string' || raw.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(raw)) fail(400, 'Invalid source cursor');
  try {
    const pair = JSON.parse(decodeURIComponent(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))));
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(identifier) || encodeCursor(pair) !== raw) throw new Error();
    return pair;
  } catch { fail(400, 'Invalid source cursor'); }
}
const primary = db => typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
async function sources({ request, env }) {
  const after = decodeCursor(new URL(request.url).searchParams.get('after'));
  const db = primary(env.DB);
  const { results } = await db.prepare(`SELECT s.source_ref,s.channel_id,s.source_kind,s.source_class,s.next_action,s.policy_version AS version,
      CASE WHEN s.access_status IN ('allowed','manual_only') AND
        (s.reviewed_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') OR s.review_due_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         OR (s.source_kind='external' AND (m.status IS NULL OR m.status<>'accepted')))
        THEN 'pending' ELSE s.access_status END AS status,
      CASE WHEN s.access_status IN ('allowed','manual_only') AND
        s.reviewed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND s.review_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
        AND (s.source_kind='internal' OR m.status='accepted') THEN s.method ELSE NULL END AS method,
      s.reviewed_at AS checked_at,s.review_due_at
    FROM market_sources s LEFT JOIN market_directory_manifests m ON m.revision=s.directory_revision
    WHERE (? IS NULL OR s.source_ref>? OR (s.source_ref=? AND s.channel_id>?))
    ORDER BY s.source_ref,s.channel_id LIMIT 51`).bind(after?.[0] ?? null, after?.[0] ?? null, after?.[0] ?? null, after?.[1] ?? null).all();
  const page = results.slice(0, 50), last = page.at(-1);
  return json({ sources: page, next: results.length > 50 ? encodeCursor([last.source_ref,last.channel_id]) : null });
}
async function sourceDetail({ request, env }) {
  const query = new URL(request.url).searchParams;
  const source = query.get('source_ref'), channel = query.get('channel_id');
  const decision = await getSourceAccess(env, source, channel);
  if (decision.version === null) fail(404, 'Source channel not found');
  return json({ decision });
}
async function sourceReview({ request, env, admin }) {
  const body = await readJson(request, 16384);
  const fields = ['source_ref','channel_id','version','operation_id','source_class','status','method','allowed_hosts','allowed_paths',
    'allowed_redirect_hosts','min_interval_s','evidence_ref','retention_ref','review_due_at'];
  if (!allowedKeys(body, fields)) fail(400, 'Invalid source access review');
  const { version, ...input } = body;
  const receipt = await reviewSourceAccess(env, input, admin, version);
  // An idempotent replay can refer to a historical grant after revocation. Return
  // the current effective decision and retain the committed version separately.
  const decision = await getSourceAccess(env, input.source_ref, input.channel_id);
  return json({ decision, recorded_version: receipt.version });
}

export default [
  ['GET', /^\/admin\/market\/sources$/, sources, true],
  ['GET', /^\/admin\/market\/sources\/detail$/, sourceDetail, true],
  ['POST', /^\/admin\/market\/sources\/review$/, sourceReview, true],
  ['GET', /^\/admin\/market\/runs$/, runs, true],
  ['POST', /^\/admin\/market\/runs$/, create, true],
  ['GET', new RegExp(`^/admin/market/runs/(${uuid})/coverage$`), coverage, true],
  ['POST', new RegExp(`^/admin/market/runs/(${uuid})/(pause|resume|close)$`), transition, true],
  ['GET', /^\/admin\/market\/manifests$/, manifests, true],
  ['POST', /^\/admin\/market\/manifests$/, acceptManifest, true],
  ['POST', /^\/admin\/market\/manual-pages$/, manualPage, true],
];
