import { HttpError, sha256 } from './http.js';

// This module owns the operational source projection. It creates no sources, grants
// no permissions and makes no network requests; BUS-19 owns access review.
const conflict = () => { throw new HttpError(409, 'Inventory state changed or is not available'); };
const bad = () => { throw new HttpError(400, 'Invalid inventory request'); };
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const cursor = value => value === null || (typeof value === 'string' && value.length <= 2048);
const iso = value => {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};
const clockTime = clock => {
  const date = new Date(clock());
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid inventory clock');
  return date.toISOString();
};
const jerseyDay = timestamp => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

function canonical(value, depth = 0) {
  if (depth > 32) bad();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => canonical(item, depth + 1)).join(',')}]`;
  if (typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`).join(',')}}`;
  }
  return bad();
}

function validatePage(page) {
  if (!page || typeof page !== 'object' || Array.isArray(page) || !id(page.page_key) ||
      !cursor(page.cursor) || !cursor(page.next_cursor) || typeof page.exhausted !== 'boolean' ||
      !iso(page.observed_at) || !Array.isArray(page.records) || page.records.length > 10 ||
      (!page.exhausted && (page.next_cursor === null || page.next_cursor === page.cursor))) bad();
  const keys = new Set();
  for (const record of page.records) {
    if (!record || typeof record !== 'object' || Array.isArray(record) || !id(record.external_key) ||
        keys.has(record.external_key) || !iso(record.source_at) || !record.raw || !record.normalized ||
        Array.isArray(record.raw) || Array.isArray(record.normalized) ||
        typeof record.raw !== 'object' || typeof record.normalized !== 'object') bad();
    if ([record.raw.description, record.normalized.description].some(value => value !== undefined &&
      (typeof value !== 'string' || value.length > 4000))) bad();
    keys.add(record.external_key);
  }
  const body = canonical(page);
  if (new TextEncoder().encode(body).byteLength > 131072) throw new HttpError(413, 'Inventory page is too large');
  return body;
}

const primary = db => typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
const getRunByOperation = (db, operation) => db.prepare('SELECT * FROM market_runs WHERE operation_id=?').bind(operation).first();
const sameRun = (run, input, actor) => run && run.kind === input.kind &&
  run.manifest_revision === (input.manifest_revision ?? null) && run.created_by === actor;

export async function createInventoryRun(env, input, actor, clock = () => new Date()) {
  if (!input || !['own_pilot','initial','daily'].includes(input.kind) || !uuid(input.operation_id) || !id(actor) ||
      (input.kind === 'own_pilot' ? input.manifest_revision != null : !id(input.manifest_revision))) bad();
  const at = clockTime(clock), day = input.kind === 'daily' ? jerseyDay(at) : null;
  const existing = await getRunByOperation(primary(env.DB), input.operation_id);
  if (existing) return sameRun(existing, input, actor) ? existing : conflict();
  let manifest = null;
  if (input.kind !== 'own_pilot') {
    manifest = await primary(env.DB).prepare(`SELECT revision,sha256 FROM market_directory_manifests
      WHERE revision=? AND status='accepted'`).bind(input.manifest_revision).first();
    if (!manifest) conflict();
  }
  const runId = crypto.randomUUID();
  try {
    await env.DB.prepare(`INSERT INTO market_runs
      (id,kind,jersey_day,manifest_revision,manifest_sha256,status,version,operation_id,created_at,created_by)
      VALUES (?,?,?,?,?,'open',1,?,?,?)`).bind(runId, input.kind, day, manifest?.revision ?? null,
      manifest?.sha256 ?? null, input.operation_id, at, actor).run();
  } catch (error) {
    // Reconcile a lost response and races by reading the primary, never by blindly inserting again.
    const db = primary(env.DB), receipt = await getRunByOperation(db, input.operation_id);
    if (receipt) return sameRun(receipt, input, actor) ? receipt : conflict();
    const blocker = input.kind === 'initial' ? await db.prepare("SELECT id FROM market_runs WHERE kind='initial' AND status IN ('open','paused')").first()
      : input.kind === 'daily' ? await db.prepare("SELECT id FROM market_runs WHERE kind='daily' AND jersey_day=?").bind(day).first() : null;
    if (blocker || /accepted external directory required|internal source required/.test(String(error?.message))) conflict();
    throw error;
  }
  return await getRunByOperation(primary(env.DB), input.operation_id);
}

export async function claimSourcePage(env, input, clock = () => new Date()) {
  if (!input || !uuid(input.run_id) || !id(input.source_ref) || !id(input.channel_id)) bad();
  const at = clockTime(clock), until = new Date(Date.parse(at) + 120000).toISOString(), token = crypto.randomUUID();
  const row = await env.DB.prepare(`UPDATE market_source_runs SET status='running', lease_token=?,
    lease_generation=lease_generation+1, lease_until=?,
    policy_version=(SELECT policy_version FROM market_sources s WHERE s.source_ref=market_source_runs.source_ref AND s.channel_id=market_source_runs.channel_id),
    run_version=(SELECT version FROM market_runs r WHERE r.id=market_source_runs.run_id)
    WHERE run_id=? AND source_ref=? AND channel_id=?
      AND status IN ('pending','running','manual_pending','failed')
      AND (lease_until IS NULL OR (lease_until<=? AND lease_until<=strftime('%Y-%m-%dT%H:%M:%fZ','now')))
      AND (next_due IS NULL OR (next_due<=? AND next_due<=strftime('%Y-%m-%dT%H:%M:%fZ','now')))
      AND EXISTS (SELECT 1 FROM market_runs r JOIN market_sources s
        ON s.source_ref=market_source_runs.source_ref AND s.channel_id=market_source_runs.channel_id
        JOIN market_source_activity a ON a.source_ref=s.source_ref AND a.channel_id=s.channel_id
        LEFT JOIN market_directory_manifests m ON m.revision=r.manifest_revision
        WHERE r.id=market_source_runs.run_id AND r.status='open'
          AND (a.lease_until IS NULL OR a.lease_until<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          AND (a.last_acquired_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ','now')>=
            strftime('%Y-%m-%dT%H:%M:%fZ',a.last_acquired_at,'+'||s.min_interval_s||' seconds'))
          AND s.access_status IN ('allowed','manual_only') AND s.evidence_ref IS NOT NULL AND s.retention_ref IS NOT NULL
          AND s.reviewed_at<=? AND s.review_due_at>?
          AND s.reviewed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND s.review_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
          AND ((r.kind='own_pilot' AND s.source_kind='internal') OR
               (r.kind IN ('initial','daily') AND s.source_kind='external' AND s.directory_revision=r.manifest_revision
                AND m.status='accepted' AND m.sha256=r.manifest_sha256)))
    RETURNING lease_generation,policy_version,run_version,cursor`).bind(token, until, input.run_id, input.source_ref,
      input.channel_id, at, at, at, at).first();
  if (!row) conflict();
  return { run_id: input.run_id, source_ref: input.source_ref, channel_id: input.channel_id, token,
    generation: row.lease_generation, policy_version: row.policy_version, run_version: row.run_version, cursor: row.cursor };
}

const receiptSql = `SELECT content_sha256,next_cursor,lease_token,lease_generation FROM market_pages
  WHERE run_id=? AND source_ref=? AND channel_id=? AND page_key=?`;
async function readReceipt(db, lease, page) {
  return primary(db).prepare(receiptSql).bind(lease.run_id, lease.source_ref, lease.channel_id, page.page_key).first();
}
function replay(receipt, lease, hash) {
  if (!receipt) return null;
  if (receipt.content_sha256 !== hash || receipt.lease_token !== lease.token || receipt.lease_generation !== lease.generation) conflict();
  return { accepted: true, replayed: true, next_cursor: receipt.next_cursor };
}

const eligible = `SELECT 1 FROM market_source_runs sr
  JOIN market_runs r ON r.id=sr.run_id
  JOIN market_sources s ON s.source_ref=sr.source_ref AND s.channel_id=sr.channel_id
  JOIN market_source_activity a ON a.source_ref=sr.source_ref AND a.channel_id=sr.channel_id
  LEFT JOIN market_directory_manifests m ON m.revision=r.manifest_revision
  WHERE sr.run_id=? AND sr.source_ref=? AND sr.channel_id=? AND sr.status='running'
    AND sr.lease_token=? AND sr.lease_generation=? AND sr.policy_version=? AND sr.run_version=?
    AND sr.cursor IS ? AND sr.lease_until>? AND sr.lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND a.lease_token=sr.lease_token AND a.lease_until>? AND a.lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND r.status='open' AND r.version=sr.run_version
    AND s.policy_version=sr.policy_version AND s.access_status IN ('allowed','manual_only')
    AND s.evidence_ref IS NOT NULL AND s.retention_ref IS NOT NULL AND s.reviewed_at<=? AND s.review_due_at>?
    AND s.reviewed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND s.review_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND ((r.kind='own_pilot' AND s.source_kind='internal') OR
         (r.kind IN ('initial','daily') AND s.source_kind='external' AND s.directory_revision=r.manifest_revision
          AND m.status='accepted' AND m.sha256=r.manifest_sha256))`;

export async function commitObservationPage(env, input, actor, clock = () => new Date()) {
  const lease = input?.lease, page = input?.page;
  if (!lease || !uuid(lease.run_id) || !id(lease.source_ref) || !id(lease.channel_id) || !uuid(lease.token) ||
      !Number.isSafeInteger(lease.generation) || lease.generation < 1 ||
      !Number.isSafeInteger(lease.policy_version) || lease.policy_version < 1 ||
      !Number.isSafeInteger(lease.run_version) || lease.run_version < 1 || !cursor(lease.cursor) || !id(actor)) bad();
  const body = validatePage(page), hash = await sha256(body);
  if (page.cursor !== lease.cursor) conflict();
  const previous = replay(await readReceipt(env.DB, lease, page), lease, hash);
  if (previous) return previous;
  const at = clockTime(clock), db = env.DB;
  const args = [lease.run_id, lease.source_ref, lease.channel_id, lease.token, lease.generation,
    lease.policy_version, lease.run_version, page.cursor, at, at, at, at];
  const policy = await primary(db).prepare('SELECT method FROM market_sources WHERE source_ref=? AND channel_id=?')
    .bind(lease.source_ref, lease.channel_id).first();
  // Manual completeness requires a separate accepted scope/evidence authority, not yet implemented.
  if (page.exhausted && policy?.method === 'manual') conflict();
  const guardId = crypto.randomUUID(), pageId = crypto.randomUUID();
  const guardIds = [guardId];
  const statements = [db.prepare(`INSERT INTO market_commit_guard(id,allowed)
    SELECT ?,CASE WHEN EXISTS (${eligible}) THEN 1 ELSE 0 END`).bind(guardId, ...args)];
  // Deleted observations are never resurrected by a delayed or repeated page.
  for (const record of page.records) {
    const recordGuardId = crypto.randomUUID();
    guardIds.push(recordGuardId);
    statements.push(db.prepare(`INSERT INTO market_commit_guard(id,allowed)
      SELECT ?,CASE WHEN NOT EXISTS (SELECT 1 FROM market_observations
        WHERE source_ref=? AND channel_id=? AND external_key=? AND deleted_tombstone=1) THEN 1 ELSE 0 END`)
      .bind(recordGuardId, lease.source_ref, lease.channel_id, record.external_key));
  }
  statements.push(db.prepare(`INSERT INTO market_pages
    (id,run_id,source_ref,channel_id,page_key,content_sha256,previous_cursor,next_cursor,exhausted,observed_at,
     committed_at,committed_by,lease_token,lease_generation,policy_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(pageId, lease.run_id, lease.source_ref, lease.channel_id,
      page.page_key, hash, page.cursor, page.next_cursor, page.exhausted ? 1 : 0, page.observed_at, at, actor,
      lease.token, lease.generation, lease.policy_version));
  for (const record of page.records) {
    const observationId = crypto.randomUUID(), raw = canonical(record.raw), normalized = canonical(record.normalized);
    const normalizedHash = await sha256(normalized), originHash = await sha256(raw);
    statements.push(db.prepare(`INSERT INTO market_observations
      (id,page_id,source_ref,channel_id,external_key,raw_json,normalized_json,normalized_sha256,source_at,origin_sha256)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(observationId, pageId, lease.source_ref, lease.channel_id,
      record.external_key, raw, normalized, normalizedHash, record.source_at, originHash));
    statements.push(db.prepare(`INSERT INTO market_change_outbox(id,observation_id,observation_version,kind)
      SELECT ?,?,1,'observation_changed' WHERE COALESCE((SELECT
        CASE WHEN old.source_at<=? AND old.normalized_sha256<>? THEN 1 ELSE 0 END
        FROM market_observations old WHERE old.source_ref=? AND old.channel_id=? AND old.external_key=? AND old.id<>?
        ORDER BY old.source_at DESC,old.sequence DESC LIMIT 1),1)=1`).bind(crypto.randomUUID(), observationId,
      record.source_at, normalizedHash, lease.source_ref, lease.channel_id, record.external_key, observationId));
  }
  statements.push(db.prepare(`UPDATE market_source_runs SET cursor=?,page_no=page_no+1,
    status=CASE WHEN ?=1 THEN 'complete' ELSE 'pending' END,lease_token=NULL,lease_until=NULL,
    last_capture_at=?,last_full_pass_at=CASE WHEN ?=1 THEN ? ELSE last_full_pass_at END,
    next_due=strftime('%Y-%m-%dT%H:%M:%fZ',?, '+' ||
      (SELECT min_interval_s FROM market_sources WHERE source_ref=? AND channel_id=?) || ' seconds')
    WHERE run_id=? AND source_ref=? AND channel_id=?`).bind(page.next_cursor, page.exhausted ? 1 : 0, at,
      page.exhausted ? 1 : 0, at, at, lease.source_ref, lease.channel_id, lease.run_id, lease.source_ref, lease.channel_id));
  statements.push(db.prepare(`DELETE FROM market_commit_guard WHERE id IN (${guardIds.map(() => '?').join(',')})`).bind(...guardIds));
  try {
    await db.batch(statements);
  } catch (error) {
    const found = replay(await readReceipt(db, lease, page), lease, hash);
    if (found) return found;
    const allowed = await primary(db).prepare(eligible).bind(...args).first();
    if (!allowed || /CHECK constraint failed: allowed=1/.test(String(error?.message))) conflict();
    throw error;
  }
  return { accepted: true, replayed: false, next_cursor: page.next_cursor };
}

export async function getInventoryCoverage(env, { run_id, after = null } = {}) {
  if (!uuid(run_id) || (after !== null && (typeof after !== 'string' || !/^[0-9a-f]{32}$/.test(after)))) bad();
  const db = primary(env.DB), run = await db.prepare('SELECT id,kind,status,version,created_at FROM market_runs WHERE id=?').bind(run_id).first();
  if (!run) throw new HttpError(404, 'Inventory run not found');
  const { results } = await db.prepare(`SELECT sr.paging_key,sr.source_ref,sr.channel_id,sr.status,sr.last_capture_at,
    sr.last_full_pass_at,s.access_status,s.method,s.review_due_at FROM market_source_runs sr
    JOIN market_sources s ON s.source_ref=sr.source_ref AND s.channel_id=sr.channel_id
    WHERE sr.run_id=? AND (? IS NULL OR sr.paging_key>?)
    ORDER BY sr.paging_key LIMIT 51`).bind(run_id, after, after).all();
  const entries = results.slice(0, 50), last = entries.at(-1);
  const sources = entries.map(({ paging_key, ...source }) => source);
  const totals = await db.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN sr.status='complete' AND sr.policy_version=s.policy_version AND s.access_status IN ('allowed','manual_only')
      AND s.evidence_ref IS NOT NULL AND s.retention_ref IS NOT NULL AND s.reviewed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND s.review_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND s.source_kind='external'
      AND s.directory_revision=r.manifest_revision AND m.status='accepted' AND m.sha256=r.manifest_sha256
      THEN 1 ELSE 0 END) AS complete FROM market_source_runs sr
    JOIN market_runs r ON r.id=sr.run_id
    JOIN market_sources s ON s.source_ref=sr.source_ref AND s.channel_id=sr.channel_id
    LEFT JOIN market_directory_manifests m ON m.revision=r.manifest_revision WHERE sr.run_id=?`).bind(run_id).first();
  return { run, sources, next: results.length > 50 ? last.paging_key : null,
    overall: { scope: run.kind, external_coverage: run.kind === 'own_pilot' ? 'unknown' :
      totals.total > 0 && totals.complete === totals.total ? 'complete' : 'unknown' } };
}

export async function listInventoryRuns(env, after = null) {
  if (after !== null && !uuid(after)) bad();
  const { results } = await primary(env.DB).prepare(`SELECT id,kind,jersey_day,status,version,created_at
    FROM market_runs WHERE (? IS NULL OR id>?) ORDER BY id LIMIT 51`).bind(after, after).all();
  const runs = results.slice(0, 50);
  return { runs, next: results.length > 50 ? runs.at(-1).id : null };
}

export async function transitionInventoryRun(env, input, actor, clock = () => new Date()) {
  if (!input || !uuid(input.run_id) || !uuid(input.operation_id) || !['pause','resume'].includes(input.action) ||
      !Number.isSafeInteger(input.version) || input.version < 1 || !id(actor)) bad();
  const db = env.DB, at = clockTime(clock), before = input.action === 'pause' ? 'open' : 'paused';
  const status = input.action === 'pause' ? 'paused' : 'open';
  const priorAction = () => primary(db).prepare('SELECT * FROM market_run_actions WHERE operation_id=?').bind(input.operation_id).first();
  const resolve = action => {
    if (!action) return null;
    if (action.run_id !== input.run_id || action.action !== input.action || action.expected_version !== input.version || action.actor !== actor) conflict();
    return { id: action.run_id, status: action.result_status, version: action.result_version };
  };
  const old = resolve(await priorAction());
  if (old) return old;
  const guard = crypto.randomUUID();
  const eligibleRun = 'SELECT 1 FROM market_runs WHERE id=? AND version=? AND status=?';
  try {
    await db.batch([
      db.prepare(`INSERT INTO market_commit_guard(id,allowed) SELECT ?,CASE WHEN EXISTS (${eligibleRun}) THEN 1 ELSE 0 END`)
        .bind(guard, input.run_id, input.version, before),
      db.prepare('UPDATE market_runs SET status=?,version=version+1 WHERE id=? AND version=? AND status=?')
        .bind(status, input.run_id, input.version, before),
      db.prepare(`INSERT INTO market_run_actions
        (operation_id,run_id,action,expected_version,result_version,result_status,actor,created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(input.operation_id, input.run_id, input.action, input.version, input.version+1, status, actor, at),
      db.prepare('DELETE FROM market_commit_guard WHERE id=?').bind(guard),
    ]);
  } catch (error) {
    const receipt = resolve(await priorAction());
    if (receipt) return receipt;
    if (!await primary(db).prepare(eligibleRun).bind(input.run_id, input.version, before).first()) conflict();
    throw error;
  }
  return { id: input.run_id, status, version: input.version+1 };
}
