import { HttpError, sha256 } from './http.js';

// Only reviewed, versioned channel decisions may change the BUS-06 source row.
// This service performs no acquisition and treats unclassified sources as pending.
const bad = () => { throw new HttpError(400, 'Invalid source access review'); };
const conflict = () => { throw new HttpError(409, 'Source access changed or cannot be enabled'); };
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const reference = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(value);
const iso = value => {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
};
const primary = db => typeof db.withSession === 'function' ? db.withSession('first-primary') : db;

function hosts(values) {
  if (!Array.isArray(values) || values.length > 25) bad();
  return values.map(value => {
    if (typeof value !== 'string' || value.length > 253 || value !== value.toLowerCase() ||
        !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value) ||
        /(^|\.)(localhost|local|internal)(\.|$)/.test(value)) bad();
    return value;
  });
}
function paths(values) {
  if (!Array.isArray(values) || values.length > 25) bad();
  return values.map(value => {
    if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('/') || value.startsWith('//') ||
        /[?#%\\\u0000-\u001f\u007f]/.test(value) || value.split('/').some(part => part === '.' || part === '..')) bad();
    return value;
  });
}
function normalized(input) {
  if (!input || !identifier(input.source_ref) || !identifier(input.channel_id) || !uuid(input.operation_id) ||
      !['pending','allowed','manual_only','denied','paused'].includes(input.status) ||
      ![null,'internal','manual','http'].includes(input.method ?? null) ||
      !Number.isSafeInteger(input.min_interval_s) || input.min_interval_s < 60 || input.min_interval_s > 31536000) bad();
  const allowedHosts = hosts(input.allowed_hosts ?? []), allowedPaths = paths(input.allowed_paths ?? []);
  const redirectHosts = hosts(input.allowed_redirect_hosts ?? []);
  if (input.evidence_ref != null && !reference(input.evidence_ref)) bad();
  if (input.retention_ref != null && !reference(input.retention_ref)) bad();
  if (input.review_due_at != null && !iso(input.review_due_at)) bad();
  if (['allowed','manual_only'].includes(input.status)) {
    if (!input.method || !reference(input.evidence_ref) || !reference(input.retention_ref) ||
        !iso(input.review_due_at)) bad();
    if (input.status === 'manual_only' && input.method !== 'manual') bad();
    if (input.method === 'http' && (!allowedHosts.length || !allowedPaths.length)) bad();
  }
  return { source_ref: input.source_ref, channel_id: input.channel_id, operation_id: input.operation_id,
    status: input.status, method: input.method ?? null, allowed_hosts: allowedHosts, allowed_paths: allowedPaths,
    allowed_redirect_hosts: redirectHosts, min_interval_s: input.min_interval_s, evidence_ref: input.evidence_ref ?? null,
    retention_ref: input.retention_ref ?? null, review_due_at: input.review_due_at ?? null };
}

const sourceSql = `SELECT s.*,m.status AS manifest_status,strftime('%Y-%m-%dT%H:%M:%fZ','now') AS database_now FROM market_sources s
  LEFT JOIN market_directory_manifests m ON m.revision=s.directory_revision WHERE s.source_ref=? AND s.channel_id=?`;
const source = (db, ref, channel) => primary(db).prepare(sourceSql).bind(ref, channel).first();
function project(row) {
  return { source_ref: row.source_ref, channel_id: row.channel_id, version: row.policy_version, status: row.access_status,
    method: row.method, allowed_hosts: JSON.parse(row.allowed_hosts), allowed_paths: JSON.parse(row.allowed_paths),
    allowed_redirect_hosts: JSON.parse(row.allowed_redirect_hosts), min_interval_s: row.min_interval_s,
    checked_at: row.reviewed_at, review_due_at: row.review_due_at, evidence_ref: row.evidence_ref, retention_ref: row.retention_ref };
}

export async function getSourceAccess(env, sourceRef, channelId) {
  if (!identifier(sourceRef) || !identifier(channelId)) bad();
  const row = await source(env.DB, sourceRef, channelId);
  if (!row) return { source_ref: sourceRef, channel_id: channelId, status: 'pending', version: null };
  const decision = project(row);
  if (['allowed','manual_only'].includes(row.access_status) &&
      (row.reviewed_at > row.database_now || row.review_due_at <= row.database_now ||
       (row.source_kind === 'external' && row.manifest_status !== 'accepted'))) {
    return { ...decision, recorded_status: decision.status, status: 'pending', method: null,
      allowed_hosts: [], allowed_paths: [], allowed_redirect_hosts: [] };
  }
  return decision;
}

export async function reviewSourceAccess(env, input, actor, expectedVersion, clock = () => new Date()) {
  if (!identifier(actor) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) bad();
  const date = new Date(clock());
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid policy clock');
  const at = date.toISOString(), next = normalized(input), db = env.DB;
  const requestHash = await sha256(JSON.stringify({ next, actor, expectedVersion }));
  const receipt = () => primary(db).prepare('SELECT request_sha256,snapshot_json FROM market_source_policy_history WHERE operation_id=?')
    .bind(next.operation_id).first();
  const resolve = row => {
    if (!row) return null;
    if (row.request_sha256 !== requestHash) conflict();
    return JSON.parse(row.snapshot_json);
  };
  const previous = resolve(await receipt());
  if (previous) return previous;
  const granting = ['allowed','manual_only'].includes(next.status);
  if (granting && next.review_due_at <= at) bad();
  const current = await source(db, next.source_ref, next.channel_id);
  if (!current || current.policy_version !== expectedVersion) conflict();
  if (granting && (current.source_kind === 'external' ?
    current.source_class !== 'general' || current.manifest_status !== 'accepted' || next.method === 'internal' :
    current.source_class !== 'internal' || next.method !== 'internal')) conflict();
  const snapshot = { source_ref: next.source_ref, channel_id: next.channel_id, version: expectedVersion + 1,
    status: next.status, method: next.method, allowed_hosts: next.allowed_hosts, allowed_paths: next.allowed_paths,
    allowed_redirect_hosts: next.allowed_redirect_hosts, min_interval_s: next.min_interval_s,
    checked_at: at, review_due_at: next.review_due_at, evidence_ref: next.evidence_ref, retention_ref: next.retention_ref };
  const guard = crypto.randomUUID();
  const condition = `SELECT 1 FROM market_sources s LEFT JOIN market_directory_manifests m ON m.revision=s.directory_revision
    WHERE s.source_ref=? AND s.channel_id=? AND s.policy_version=? AND
      (?=0 OR (? > strftime('%Y-%m-%dT%H:%M:%fZ','now') AND
       ((s.source_kind='internal' AND s.source_class='internal' AND ?='internal') OR
        (s.source_kind='external' AND s.source_class='general' AND m.status='accepted' AND ?<>'internal'))))`;
  const conditionArgs = [next.source_ref, next.channel_id, expectedVersion, granting ? 1 : 0, next.review_due_at, next.method, next.method];
  try {
    await db.batch([
      db.prepare(`INSERT INTO market_commit_guard(id,allowed) SELECT ?,CASE WHEN EXISTS (${condition}) THEN 1 ELSE 0 END`)
        .bind(guard, ...conditionArgs),
      db.prepare(`UPDATE market_sources SET access_status=?,method=?,policy_version=policy_version+1,
        evidence_ref=?,retention_ref=?,reviewed_at=?,review_due_at=?,allowed_hosts=?,allowed_paths=?,allowed_redirect_hosts=?,min_interval_s=?
        WHERE source_ref=? AND channel_id=? AND policy_version=?`)
        .bind(next.status, next.method, next.evidence_ref, next.retention_ref, at, next.review_due_at,
          JSON.stringify(next.allowed_hosts), JSON.stringify(next.allowed_paths), JSON.stringify(next.allowed_redirect_hosts),
          next.min_interval_s, next.source_ref, next.channel_id, expectedVersion),
      db.prepare(`INSERT INTO market_source_policy_history
        (source_ref,channel_id,decision_version,operation_id,request_sha256,snapshot_json,actor,reviewed_at)
        VALUES (?,?,?,?,?,?,?,?)`).bind(next.source_ref, next.channel_id, expectedVersion + 1, next.operation_id,
          requestHash, JSON.stringify(snapshot), actor, at),
      db.prepare('DELETE FROM market_commit_guard WHERE id=?').bind(guard),
    ]);
  } catch (error) {
    const saved = resolve(await receipt());
    if (saved) return saved;
    if (!await primary(db).prepare(condition).bind(...conditionArgs).first()) conflict();
    throw error;
  }
  return snapshot;
}
