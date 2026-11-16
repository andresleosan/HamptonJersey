// BUS-08: the daily market sweep. From 01:00 Jersey time the clock opens one BUS-06 daily run per Jersey day on the
// latest accepted directory and reads, a few channels per tick, the channels reviewed as allowed for automatic reading.
// Each read page goes through BUS-06's lease and commit (pages, observations, the change outbox BUS-04 consumes), every
// attempt is recorded, and a failure keeps the inventory as it was. When no channel is left to read, the day is compared
// with each channel's previous full pass: an advert not found is a review for a person, never a confirmed
// unavailability, and a day with adverts not found or sources not read in full leaves one Inbox task. After a day with
// changes, the active searches are recomputed a few per tick, only with the website's availability rules (EST-15);
// with BUS-04 on (BUS04_REMATCH_READY), it crosses instead only the searches each change affects (market-rematch.js).
// Photos are never downloaded here: an advert's readings are data. Off (BUS08_SWEEP_READY not "1") nothing runs.
import { json, sha256 } from './http.js';
import { jerseyNow } from './viewings.js';
import { normalizeObservation } from './market-extraction.js';
import { claimSourcePage, closeInventoryRun, commitObservationPage, createInventoryRun } from './market-inventory-store.js';
import { activeSql } from './applicants.js';
import { recomputeForApplicant } from './search-state.js';

export const sweepReady = env => env?.BUS08_SWEEP_READY === '1';
export const CHANNELS_PER_TICK = 3, RECOMPUTE_PER_TICK = 2, MAX_FAILURES = 3, READ_TIMEOUT_MS = 10000;
// The flags a recompute reads on the website. Without the same answer in the clock it would match differently, and
// could propose again a home confirmed not available (EST-15), so the clock waits for them.
export const RECOMPUTE_FLAGS = ['BUS01_MARKET_MATCHING_READY', 'BUS10_IDENTITY_READY', 'EST15_UNAVAILABILITY_READY',
  'EST16_AVAILABILITY_READY'];
// No automatic reader exists yet: each one is built with its source's reviewed contract (BUS-09, BUS-19). A reader is
// { readPage({ source_ref, channel_id, cursor, allowed_hosts, allowed_paths, signal }) } returning
// { records: [{ external_key, source_at?, raw, observation }], exhausted, next_cursor } or throwing SourceReadError.
export const READERS = Object.freeze({});

const CODES = new Set(['rate_limited', 'access_denied', 'unavailable', 'invalid_response']);
export class SourceReadError extends Error {
  constructor(code, retryAfterS = null) {
    super(code);
    this.code = CODES.has(code) ? code : 'unavailable';
    this.retryAfterS = retryAfterS;
  }
}

const TASK_TYPE = 'market.sweep_review';
const taskKey = runId => `bus08:sweep:${runId}`, entity = runId => `market-sweep:${runId}`;
const later = (ts, seconds) => new Date(Date.parse(ts) + seconds * 1000).toISOString();
const clockAt = ts => () => new Date(ts);
// The channels reviewed for automatic reading; one of them not read in full is in the day's review, read or not.
const REVIEWED = "s.access_status='allowed' AND s.method='http'";
// The ones the sweep reads: those claimSourcePage (BUS-06) would lease now, so one it would refuse is not taken
// again and again, nor waited for. sr: the channel's row in the run.
const AUTOMATIC = `${REVIEWED} AND s.evidence_ref IS NOT NULL AND s.retention_ref IS NOT NULL
  AND s.reviewed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND s.review_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
  AND EXISTS (SELECT 1 FROM market_runs r JOIN market_directory_manifests m ON m.revision=r.manifest_revision
    WHERE r.id=sr.run_id AND s.directory_revision=r.manifest_revision AND m.status='accepted' AND m.sha256=r.manifest_sha256)`;

// Due from the first tick at or after 01:00 Jersey time (a spring-forward day: the first instant after it), once per
// Jersey day: market_runs keeps one daily run per day, so a repeated 01:00 or a later manifest makes no second one.
export function dailyRunDue(ts) {
  const local = jerseyNow(new Date(ts));
  return { due: local.time >= '01:00', jersey_day: local.date };
}

const dailyRun = (env, day) => env.DB.prepare(
  "SELECT id,status,version,jersey_day FROM market_runs WHERE kind='daily' AND jersey_day=?").bind(day).first();

// Today's run, opened if due. Earlier daily runs still open are compared and closed first, also when today's was
// opened by hand: a missed day is not made up, and a day never overlaps another.
async function openToday(env, ts) {
  const { due, jersey_day } = dailyRunDue(ts);
  if (!due) return (await env.DB.prepare(`SELECT id,status,version,jersey_day FROM market_runs
    WHERE kind='daily' AND status IN ('open','paused') ORDER BY jersey_day DESC LIMIT 1`).first());
  const { results: older } = await env.DB.prepare(`SELECT id,version,jersey_day FROM market_runs
    WHERE kind='daily' AND status IN ('open','paused') AND jersey_day<?`).bind(jersey_day).all();
  for (const run of older) {
    await compare(env, run, ts);
    try { await closeInventoryRun(env, { run_id: run.id, version: run.version }); } catch { /* moved meanwhile */ }
  }
  const existing = await dailyRun(env, jersey_day); // also one a person opened by hand
  if (existing) return existing;
  const manifest = await env.DB.prepare(`SELECT m.revision FROM market_directory_manifests m WHERE m.status='accepted'
    AND EXISTS (SELECT 1 FROM market_sources s WHERE s.directory_revision=m.revision AND s.source_kind='external')
    ORDER BY m.accepted_at DESC,m.revision DESC LIMIT 1`).first();
  if (!manifest) return null; // no directory: no sources, which is not an empty market
  try {
    await createInventoryRun(env, { kind: 'daily', manifest_revision: manifest.revision, operation_id: crypto.randomUUID() },
      'system', clockAt(ts));
  } catch (error) { if (error?.status !== 409) throw error; } // another tick opened it
  return dailyRun(env, jersey_day);
}

const attempt = (env, runId, c, ts, outcome, records = null, skipped = null) => env.DB.prepare(`INSERT INTO market_sweep_attempts
  (id,run_id,source_ref,channel_id,attempted_at,outcome,records,skipped) VALUES (?,?,?,?,?,?,?,?)`)
  .bind(crypto.randomUUID(), runId, c.source_ref, c.channel_id, ts, outcome, records, skipped);

// A failed read keeps the inventory as it was. Access refused is not retried that day; a rate limit waits as asked
// (the channel's interval at least, as every wait); a network or page failure, or a lease BUS-06 refuses, is retried on later ticks, MAX_FAILURES
// times in all. lease: the one held, or null when none could be taken (then only an expired one is released).
function failed(env, runId, c, lease, error, ts) {
  const code = error instanceof SourceReadError ? error.code : 'unavailable';
  const wait = Math.max(c.min_interval_s ?? 60, code === 'rate_limited' ? Number(error.retryAfterS) || 0 : 1200);
  return env.DB.batch([attempt(env, runId, c, ts, code),
    env.DB.prepare(`UPDATE market_source_runs SET lease_token=NULL,lease_until=NULL,next_due=?,
      status=CASE WHEN ?='access_denied' THEN 'blocked' WHEN ?='rate_limited' THEN 'pending'
        WHEN (SELECT COUNT(*) FROM market_sweep_attempts a WHERE a.run_id=market_source_runs.run_id
          AND a.source_ref=market_source_runs.source_ref AND a.channel_id=market_source_runs.channel_id
          AND a.outcome IN ('unavailable','invalid_response'))>=? THEN 'blocked' ELSE 'failed' END
      WHERE run_id=? AND source_ref=? AND channel_id=? AND status IN ('pending','running','failed')
        AND (lease_token=? OR (? IS NULL AND (lease_token IS NULL OR lease_until<=?)))`)
      .bind(later(ts, wait), code, code, MAX_FAILURES, runId, c.source_ref, c.channel_id, lease?.token ?? null,
        lease?.token ?? null, ts)]);
}

const validKey = v => typeof v === 'string' && v.length > 0 && v.length <= 160 && !/[\u0000-\u001f\u007f]/.test(v);
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const validTime = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

// The reader's answer as a BUS-06 page: observations normalised by BUS-09, the processing time as reading time.
async function toPage(read, lease, ts) {
  if (!read || typeof read !== 'object' || !Array.isArray(read.records) || read.records.length > 10 ||
      typeof read.exhausted !== 'boolean') throw new SourceReadError('invalid_response');
  // An advert BUS-06 or BUS-09 would refuse is left out (and counted on the attempt), not the whole page with it.
  const records = [], keys = new Set();
  for (const r of read.records) {
    try {
      if (!validKey(r?.external_key) || keys.has(r.external_key) || !plain(r.raw) || !plain(r.observation) ||
          (r.source_at !== undefined && !validTime(r.source_at)) ||
          (r.raw.description !== undefined && (typeof r.raw.description !== 'string' || r.raw.description.length > 4000)))
        throw new TypeError('Invalid advert');
      const normalized = normalizeObservation({ ...r.observation, observed_at: ts });
      records.push({ external_key: r.external_key, source_at: r.source_at ?? ts, raw: r.raw, normalized });
      keys.add(r.external_key);
    } catch { /* skipped */ }
  }
  const page = { page_key: `c-${(await sha256(lease.cursor ?? '')).slice(0, 40)}`, cursor: lease.cursor,
    next_cursor: read.exhausted ? null : read.next_cursor ?? null, exhausted: read.exhausted, observed_at: ts, records: [] };
  // BUS-06 refuses a page over 131072 bytes: an advert that would take it over is left out too.
  for (const record of records)
    if (new TextEncoder().encode(JSON.stringify({ ...page, records: [...page.records, record] })).byteLength <= 131072)
      page.records.push(record);
  return { ...page, skipped: read.records.length - page.records.length };
}

async function readChannel(env, run, c, readers, ts) {
  const reader = readers[c.source_ref];
  if (!reader) {
    await env.DB.batch([attempt(env, run.id, c, ts, 'no_reader'), env.DB.prepare(`UPDATE market_source_runs
      SET status='blocked',lease_token=NULL,lease_until=NULL
      WHERE run_id=? AND source_ref=? AND channel_id=? AND status IN ('pending','running','failed')
        AND (lease_token IS NULL OR lease_until<=?)`).bind(run.id, c.source_ref, c.channel_id, ts)]);
    return 'no_reader';
  }
  let lease;
  try { lease = await claimSourcePage(env, { run_id: run.id, source_ref: c.source_ref, channel_id: c.channel_id }, clockAt(ts)); }
  catch (error) {
    // Refused because the channel was read too recently or is leased by another run: wait until it can be, uncounted.
    const paced = await env.DB.prepare(`UPDATE market_source_runs SET next_due=(SELECT MAX(COALESCE(a.lease_until,''),
        COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',a.last_acquired_at,'+'||s.min_interval_s||' seconds'),''))
        FROM market_source_activity a JOIN market_sources s ON s.source_ref=a.source_ref AND s.channel_id=a.channel_id
        WHERE a.source_ref=market_source_runs.source_ref AND a.channel_id=market_source_runs.channel_id)
      WHERE run_id=? AND source_ref=? AND channel_id=? AND EXISTS (SELECT 1 FROM market_source_activity a
        JOIN market_sources s ON s.source_ref=a.source_ref AND s.channel_id=a.channel_id
        WHERE a.source_ref=market_source_runs.source_ref AND a.channel_id=market_source_runs.channel_id
          AND (a.lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') OR strftime('%Y-%m-%dT%H:%M:%fZ','now')<
            strftime('%Y-%m-%dT%H:%M:%fZ',a.last_acquired_at,'+'||s.min_interval_s||' seconds')))
      RETURNING next_due`).bind(run.id, c.source_ref, c.channel_id).first();
    if (paced) return 'waiting';
    await failed(env, run.id, c, null, error, ts); return 'failed'; // refused otherwise: counted, retried later
  }
  let page, skipped;
  try {
    const read = await reader.readPage({ source_ref: c.source_ref, channel_id: c.channel_id, cursor: lease.cursor,
      allowed_hosts: JSON.parse(c.allowed_hosts), allowed_paths: JSON.parse(c.allowed_paths),
      signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
    ({ skipped, ...page } = await toPage(read, lease, ts));
    // A first page that says the channel is empty when it had adverts is a broken reader, not a market with none.
    if (page.exhausted && !page.records.length && c.page_no === 0 && await env.DB.prepare(`SELECT 1 FROM
      market_latest_observations WHERE source_ref=? AND channel_id=? AND gone=0 LIMIT 1`).bind(c.source_ref, c.channel_id).first())
      throw new SourceReadError('invalid_response');
  } catch (error) { await failed(env, run.id, c, lease, error, ts); return 'failed'; }
  try {
    await commitObservationPage(env, { lease, page, material_compare: true }, 'system', clockAt(ts));
  } catch (error) {
    // A page BUS-06 refuses counts as a failed read; a state that moved (pause, review) just ends this attempt.
    if ([400, 413].includes(error?.status)) { await failed(env, run.id, c, lease, new SourceReadError('invalid_response'), ts); return 'failed'; }
    // A state that moved under the read (pause, review): counted like a failed read; the other channels go on.
    if (error?.status === 409) { await failed(env, run.id, c, lease, new SourceReadError('unavailable'), ts); return 'failed'; }
    throw error;
  }
  await attempt(env, run.id, c, ts, page.exhausted ? 'complete' : 'page', page.records.length, skipped || null).run();
  return page.exhausted ? 'complete' : 'page';
}

// The day's comparison, once per run. An advert of the channel's previous full pass (initial or daily) not read in
// this one's full pass is kept as not found; a channel without a full pass today says nothing about its adverts.
// One Inbox task when adverts were not found or a source was not read in full. Nothing is marked unavailable.
async function compare(env, run, ts) {
  if (await env.DB.prepare('SELECT 1 FROM market_daily_sweeps WHERE run_id=?').bind(run.id).first()) return;
  const unread = `(SELECT COUNT(*) FROM market_source_runs sr JOIN market_sources s ON s.source_ref=sr.source_ref
    AND s.channel_id=sr.channel_id WHERE sr.run_id=? AND ${REVIEWED} AND sr.status<>'complete')`;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO market_sweep_missing(run_id,source_ref,channel_id,external_key,observation_id)
      SELECT run_id,source_ref,channel_id,external_key,id FROM (
        SELECT sr.run_id,o.source_ref,o.channel_id,o.external_key,o.id,
          ROW_NUMBER() OVER (PARTITION BY o.source_ref,o.channel_id,o.external_key ORDER BY o.sequence DESC) AS n
        FROM market_source_runs sr
        JOIN market_pages pp ON pp.source_ref=sr.source_ref AND pp.channel_id=sr.channel_id AND pp.run_id=(
          SELECT p2.run_id FROM market_source_runs p2 JOIN market_runs r2 ON r2.id=p2.run_id
          WHERE p2.source_ref=sr.source_ref AND p2.channel_id=sr.channel_id AND p2.run_id<>sr.run_id
            AND p2.status='complete' AND r2.kind IN ('initial','daily') AND p2.last_full_pass_at<sr.last_full_pass_at
          ORDER BY p2.last_full_pass_at DESC LIMIT 1)
        JOIN market_observations o ON o.page_id=pp.id
        WHERE sr.run_id=? AND sr.status='complete' AND NOT EXISTS (SELECT 1 FROM market_pages cp
          JOIN market_observations co ON co.page_id=cp.id WHERE cp.run_id=sr.run_id AND cp.source_ref=sr.source_ref
            AND cp.channel_id=sr.channel_id AND co.external_key=o.external_key)) WHERE n=1`).bind(run.id),
    env.DB.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT ?,'system','collection',?,'${TASK_TYPE}',json_object('day',?,'missing',m,'unread',u) FROM (SELECT
        (SELECT COUNT(*) FROM market_sweep_missing WHERE run_id=?) AS m, ${unread} AS u)
      WHERE (m>0 OR u>0) AND NOT EXISTS (SELECT 1 FROM notifications WHERE task_key=?)`)
      .bind(ts, entity(run.id), run.jersey_day, run.id, run.id, taskKey(run.id)),
    env.DB.prepare(`INSERT INTO notifications(event_id,category,title,task_reason,action_required,created_at,task_key)
      SELECT e.id,'task','Daily market sweep needs review',json_extract(e.data,'$.day')||': '||json_extract(e.data,'$.missing')||
        ' adverts not found, '||json_extract(e.data,'$.unread')||' sources not read in full. Nothing was marked unavailable.',1,e.at,?
      FROM events e WHERE e.entity_type='collection' AND e.entity_id=? AND e.type='${TASK_TYPE}'
        AND NOT EXISTS (SELECT 1 FROM notifications WHERE task_key=?) ORDER BY e.id DESC LIMIT 1`)
      .bind(taskKey(run.id), entity(run.id), taskKey(run.id)),
    env.DB.prepare(`INSERT INTO market_daily_sweeps(run_id,jersey_day,compared_at,changes)
      SELECT ?,?,?,(SELECT COUNT(*) FROM market_change_outbox x JOIN market_observations o ON o.id=x.observation_id
        JOIN market_pages p ON p.id=o.page_id WHERE p.run_id=?) ON CONFLICT DO NOTHING`).bind(run.id, run.jersey_day, ts, run.id),
  ]);
}

// After the newest day with changes, the active searches in order of applicant id, a few per tick. One that fails is
// left for the next day or "Recalculate all"; the order moves on. Finishing it also covers older days still waiting.
async function recompute(env, ts) {
  const sweep = await env.DB.prepare(`SELECT run_id,jersey_day,recompute_after FROM market_daily_sweeps
    WHERE changes>0 AND recomputed_at IS NULL ORDER BY jersey_day DESC LIMIT 1`).first();
  if (!sweep) return null;
  // BUS-04 crosses only the searches each change affects; the day counts as recomputed once its changes are crossed.
  if (env.BUS04_REMATCH_READY === '1') {
    await env.DB.prepare(`UPDATE market_daily_sweeps SET recomputed_at=? WHERE changes>0 AND recomputed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM market_change_outbox WHERE consumer_state='pending')
      AND NOT EXISTS (SELECT 1 FROM market_rematch_queue)`).bind(ts).run();
    return 'rematch';
  }
  if (!RECOMPUTE_FLAGS.every(flag => env[flag] === '1')) return 'waiting';
  const { results } = await env.DB.prepare(`SELECT a.id FROM applicants a WHERE ${activeSql('a')} AND a.id>?
    ORDER BY a.id LIMIT ?`).bind(sweep.recompute_after, RECOMPUTE_PER_TICK).all();
  for (const { id } of results) {
    try { await recomputeForApplicant(env, id, 'system'); } catch { /* counted by the search's own state (EST-01) */ }
  }
  const done = results.length < RECOMPUTE_PER_TICK;
  await env.DB.prepare(`UPDATE market_daily_sweeps SET recompute_after=CASE WHEN run_id=? THEN ? ELSE recompute_after END,
      recomputed_at=CASE WHEN ? THEN ? END
    WHERE recomputed_at IS NULL AND ((run_id=? AND recompute_after=?) OR (? AND jersey_day<?))`)
    .bind(sweep.run_id, results.at(-1)?.id ?? sweep.recompute_after, done ? 1 : 0, ts,
      sweep.run_id, sweep.recompute_after, done ? 1 : 0, sweep.jersey_day).run();
  return done ? 'done' : 'partial';
}

// One tick: open or continue the day, read up to CHANNELS_PER_TICK channels one after another, compare when nothing
// is left to read, then recompute a few searches. ts: processing time, so a late tick never reads as an earlier day.
export async function marketSweepPass(env, ts, { readers = READERS } = {}) {
  const out = { run: null, read: [], compared: false, recompute: null };
  const run = await openToday(env, ts);
  if (run?.status === 'open') {
    out.run = run.id;
    const { results: channels } = await env.DB.prepare(`SELECT sr.source_ref,sr.channel_id,sr.page_no,s.allowed_hosts,s.allowed_paths,s.min_interval_s
      FROM market_source_runs sr JOIN market_sources s ON s.source_ref=sr.source_ref AND s.channel_id=sr.channel_id
      WHERE sr.run_id=? AND sr.status IN ('pending','running','failed') AND ${AUTOMATIC}
        AND (sr.lease_until IS NULL OR sr.lease_until<=?) AND (sr.next_due IS NULL OR sr.next_due<=?)
      ORDER BY sr.next_due IS NOT NULL,sr.next_due,sr.paging_key LIMIT ?`).bind(run.id, ts, ts, CHANNELS_PER_TICK).all();
    for (const c of channels) out.read.push(await readChannel(env, run, c, readers, ts));
    const left = await env.DB.prepare(`SELECT 1 FROM market_source_runs sr JOIN market_sources s ON s.source_ref=sr.source_ref
      AND s.channel_id=sr.channel_id WHERE sr.run_id=? AND sr.status IN ('pending','running','failed') AND ${AUTOMATIC} LIMIT 1`)
      .bind(run.id).first();
    if (!left) { await compare(env, run, ts); out.compared = true; }
  }
  out.recompute = await recompute(env, ts);
  return out;
}

// GET /admin/market/daily-sweep: the last days, and for the newest one each automatic channel's last attempt, last
// correct reading and last full sweep, and the adverts not found (50 at most). Read only.
async function dailySweep({ env }) {
  const { results: days } = await env.DB.prepare(`SELECT r.id AS run_id,r.jersey_day,r.status,d.compared_at,d.changes,
      d.recomputed_at,(SELECT COUNT(*) FROM market_sweep_missing m WHERE m.run_id=r.id) AS missing
    FROM market_runs r LEFT JOIN market_daily_sweeps d ON d.run_id=r.id WHERE r.kind='daily' ORDER BY r.jersey_day DESC LIMIT 7`).all();
  const latest = days[0]?.run_id ?? null;
  const { results: channels } = latest ? await env.DB.prepare(`SELECT sr.source_ref,sr.channel_id,sr.status,
      (SELECT outcome FROM market_sweep_attempts a WHERE a.run_id=sr.run_id AND a.source_ref=sr.source_ref AND a.channel_id=sr.channel_id
        ORDER BY a.attempted_at DESC LIMIT 1) AS last_outcome,
      (SELECT MAX(attempted_at) FROM market_sweep_attempts a WHERE a.source_ref=sr.source_ref AND a.channel_id=sr.channel_id
        AND a.outcome IN ('page','complete')) AS last_correct_at,
      (SELECT MAX(attempted_at) FROM market_sweep_attempts a WHERE a.source_ref=sr.source_ref AND a.channel_id=sr.channel_id
        AND a.outcome='complete') AS last_full_sweep_at
    FROM market_source_runs sr JOIN market_sources s ON s.source_ref=sr.source_ref AND s.channel_id=sr.channel_id
    WHERE sr.run_id=? AND ${REVIEWED} ORDER BY sr.paging_key LIMIT 50`).bind(latest).all() : { results: [] };
  const { results: missing } = latest ? await env.DB.prepare(`SELECT source_ref,channel_id,external_key,observation_id
    FROM market_sweep_missing WHERE run_id=? ORDER BY source_ref,channel_id,external_key LIMIT 50`).bind(latest).all() : { results: [] };
  return json({ days, channels, missing });
}
export const dailySweepRoutes = [['GET', /^\/admin\/market\/daily-sweep$/, dailySweep, true]];
