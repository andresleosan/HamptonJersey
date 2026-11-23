// BUS-09 (contract of 23-nov-2026): Hermes as a market reader. Its custodian (hermes/mercado.mjs) asks for the channels
// of the open daily run assigned to Hermes, claims one, posts its adverts in slices of ten on the lease, or reports why
// it could not read it. The same lease, commit and failure accounting as the sweep's code readers (market-daily-sweep.js),
// so a channel's pace (min_interval_s) and the 120 s lease hold. Opened by routes/hermes.js with its own key.
import { json, fail, readJson, now, sha256 } from '../http.js';
import { claimSourcePage } from '../market-inventory-store.js';
import { AUTOMATIC, SUB_CHANNEL, SourceReadError, commitRead, failed, hermesChannels } from '../market-daily-sweep.js';
import { advertRecord, normaliseUrl } from '../market-hermes.js';

export const marketReady = env => env?.HERMES_MARKET_READY === '1';
const REASONS = ['access_denied', 'unavailable', 'invalid_response', 'rate_limited'];
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 160;
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Hermes's channels of a daily run, sub-channels left out (the sweep completes those empty). where: SQL on sr.
async function channels(env, where, ...args) {
  const h = hermesChannels(env);
  if (!h) return [];
  const { results } = await env.DB.prepare(`SELECT sr.run_id,sr.source_ref,sr.channel_id,sr.page_no,sr.status,s.allowed_hosts,
      s.allowed_paths,s.min_interval_s FROM market_source_runs sr JOIN market_runs mr ON mr.id=sr.run_id AND mr.kind='daily'
    JOIN market_sources s ON s.source_ref=sr.source_ref AND s.channel_id=sr.channel_id
    WHERE ${where} AND ${AUTOMATIC} AND ${h.sql} AND NOT ${SUB_CHANNEL} ORDER BY sr.paging_key LIMIT 200`).bind(...args, ...h.args).all();
  return results;
}
const channel = async (env, b) => (await channels(env, 'sr.run_id=? AND sr.source_ref=? AND sr.channel_id=?',
  b.run_id, b.source_ref, b.channel_id))[0] ?? fail(404, 'Not a channel for Hermes');

// 409 with the seconds until the channel can be claimed again: its lease, its pace, or its next due time.
async function wait(env, c, ts) {
  const row = await env.DB.prepare(`SELECT MAX(COALESCE(sr.next_due,''),COALESCE(sr.lease_until,''),COALESCE(a.lease_until,''),
      COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',a.last_acquired_at,'+'||s.min_interval_s||' seconds'),'')) AS until
    FROM market_source_runs sr JOIN market_sources s ON s.source_ref=sr.source_ref AND s.channel_id=sr.channel_id
    JOIN market_source_activity a ON a.source_ref=sr.source_ref AND a.channel_id=sr.channel_id
    WHERE sr.run_id=? AND sr.source_ref=? AND sr.channel_id=?`).bind(c.run_id, c.source_ref, c.channel_id).first();
  const s = Math.ceil((Date.parse(row?.until) - Date.parse(ts)) / 1000);
  return json({ retry_after_s: s > 0 ? s : c.min_interval_s }, 409);
}

async function work({ env }) {
  const run = await env.DB.prepare(`SELECT id,jersey_day FROM market_runs WHERE kind='daily' AND status='open'
    ORDER BY jersey_day DESC LIMIT 1`).first();
  if (!run) return json({ day: null, run_id: null, items: [] });
  const items = (await channels(env, "sr.run_id=? AND sr.status IN ('pending','running','failed')", run.id)).map(c => ({
    source_ref: c.source_ref, channel_id: c.channel_id, hosts: JSON.parse(c.allowed_hosts), paths: JSON.parse(c.allowed_paths),
    status: c.status, min_interval_s: c.min_interval_s }));
  return json({ day: run.jersey_day, run_id: run.id, items });
}

async function claim({ request, env }) {
  const b = await readJson(request);
  if (!plain(b) || ![b.run_id, b.source_ref, b.channel_id].every(text)) fail(400, 'Send run_id, source_ref and channel_id');
  const c = await channel(env, b), ts = now();
  try {
    return json({ lease: await claimSourcePage(env, { run_id: c.run_id, source_ref: c.source_ref, channel_id: c.channel_id }, () => new Date(ts)) });
  } catch (error) { if (error?.status !== 409) throw error; return wait(env, c, ts); } // too soon, leased or closed: uncounted
}

async function page({ request, env }) {
  const b = await readJson(request, 65536), l = b?.lease;
  if (!plain(b) || !plain(l) || ![l.run_id, l.source_ref, l.channel_id, l.token].every(text) || !Number.isSafeInteger(l.generation) ||
      !Array.isArray(b.records) || b.records.length > 10 || typeof b.exhausted !== 'boolean' || (!b.exhausted && !b.records.length))
    fail(400, 'Send the lease, up to 10 records and exhausted');
  const c = await channel(env, l), ts = now();
  // A lease commits one page: the same slice sent again is answered as already taken.
  if (await env.DB.prepare(`SELECT 1 FROM market_pages WHERE run_id=? AND source_ref=? AND channel_id=? AND lease_token=?
      AND lease_generation=?`).bind(c.run_id, c.source_ref, c.channel_id, l.token, l.generation).first())
    return json({ accepted: true, skipped: 0, replayed: true });
  // A lease no longer held (expired, taken again) is refused before reading anything, and not counted as a failure.
  if (!(await env.DB.prepare(`SELECT 1 FROM market_source_runs WHERE run_id=? AND source_ref=? AND channel_id=? AND lease_token=?
      AND lease_generation=? AND lease_until>?`).bind(c.run_id, c.source_ref, c.channel_id, l.token, l.generation, ts).first()))
    return wait(env, c, ts);
  const hosts = JSON.parse(c.allowed_hosts), paths = JSON.parse(c.allowed_paths);
  // The channel's known homes by listing URL, so one a code reader or an earlier day saw keeps its key.
  const { results } = await env.DB.prepare(`SELECT l.external_key,json_extract(o.raw_json,'$.listing_url') AS url
    FROM market_latest_observations l JOIN market_observations o ON o.id=l.observation_id WHERE l.source_ref=? AND l.channel_id=?`)
    .bind(c.source_ref, c.channel_id).all();
  const known = new Map(results.map(r => [normaliseUrl(r.url), r.external_key]));
  // An advert off the channel or without what a record needs goes as null, which the sweep counts as skipped.
  const records = await Promise.all(b.records.map(async a => {
    const r = advertRecord(a, hosts, paths);
    return r && { external_key: known.get(r.url) ?? `hermes:${(await sha256(r.url)).slice(0, 32)}`, raw: r.raw, observation: r.observation };
  }));
  // The cursor is the door's: the offset of adverts received (a code reader's cursor from earlier today counts as 0).
  const offset = /^\d{1,9}$/.test(l.cursor ?? '') ? Number(l.cursor) : 0;
  const { outcome, skipped } = await commitRead(env, c.run_id, c, l,
    { records, exhausted: b.exhausted, next_cursor: b.exhausted ? null : String(offset + b.records.length) }, ts);
  return outcome === 'failed' ? wait(env, c, ts) : json({ accepted: true, skipped });
}

async function failure({ request, env }) {
  const b = await readJson(request);
  if (!plain(b) || ![b.run_id, b.source_ref, b.channel_id].every(text) || !REASONS.includes(b.reason) ||
      (b.lease != null && !(plain(b.lease) && text(b.lease.token)))) fail(400, 'Send the channel, its lease or null, and a reason');
  const c = await channel(env, b);
  // ponytail: a channel already complete or blocked keeps its count; nothing to record.
  if (!['pending', 'running', 'failed'].includes(c.status)) return json({ ok: true });
  await failed(env, c.run_id, c, b.lease ? { token: b.lease.token } : null, new SourceReadError(b.reason), now());
  return json({ ok: true });
}

export const marketDoor = [
  ['GET', /^\/market\/work$/, work],
  ['POST', /^\/market\/claim$/, claim],
  ['POST', /^\/market\/page$/, page],
  ['POST', /^\/market\/fail$/, failure],
];
