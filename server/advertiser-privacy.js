// AGE-14: staff removal of an advertiser's personal data (individual's name; contact names, emails and phones).
// The record, its links and its 11/12-month review history stay. Copies held elsewhere are reported, never claimed
// as removed. Mounted only with AGE14_SUPPRESSION_READY=1 and migration 0057.
import { json, fail, readJson, now, sha256 } from './http.js';
import { get, output } from './routes/advertisers.js';

const REASONS = ['no_longer_needed', 'person_request'];
const KEPT = ['kind', 'channels', 'source_ids', 'listing_ids', 'commission', 'photo_permission', 'reviews'];
const REMOVED_NAME = 'Personal data removed';
const lower = v => String(v ?? '').trim().toLowerCase();
const uniq = values => [...new Set(values.filter(Boolean))];

function needles(row) {
  const d = JSON.parse(row.details);
  return { d, emails: uniq(d.contacts.map(c => lower(c.email))),
    phones: uniq(d.contacts.flatMap(c => c.phones.map(p => lower(p.number))).filter(p => p.length >= 6)),
    names: uniq([row.kind === 'individual' ? lower(row.name) : '', ...d.contacts.map(c => lower(c.name))]) };
}

// Each copy location: a COUNT query, its arguments and what happens to it on removal. Values never leave the server.
const CHECKS = [
  ['outbound_pending', 'cancelled_on_removal', n => [`SELECT COUNT(*) AS n FROM outbound WHERE status IN ('draft','queued')
    AND lower(recipient) IN (SELECT value FROM json_each(?))`, JSON.stringify(n.emails)]],
  ['outbound_sent', 'kept_by_email_retention', n => [`SELECT COUNT(*) AS n FROM outbound WHERE status NOT IN ('draft','queued')
    AND lower(recipient) IN (SELECT value FROM json_each(?))`, JSON.stringify(n.emails)]],
  ['email_inbound', 'kept_by_email_retention', n => [`SELECT COUNT(*) AS n FROM email_inbound i WHERE EXISTS (SELECT 1 FROM json_each(?) e
    WHERE lower(i.sender) = e.value OR lower(i.recipient) = e.value OR instr(lower(i.header_from), e.value) > 0)`, JSON.stringify(n.emails)]],
  ['research_sources', 'kept_with_source', n => [`SELECT COUNT(*) AS n FROM research_sources WHERE source_id IN (SELECT value FROM json_each(?))
    AND lower(trim(agent_or_site)) IN (SELECT value FROM json_each(?))`, JSON.stringify(n.d.source_ids), JSON.stringify(n.names)]],
  ['market_observations', 'kept_with_source', n => [`SELECT COUNT(*) AS n FROM market_observations o WHERE EXISTS
    (SELECT 1 FROM json_each(?) x WHERE instr(lower(o.raw_json), x.value) > 0)`, JSON.stringify([...n.emails, ...n.phones])]],
];

async function copies(env, n) {
  const out = [];
  for (const [source, handling, query] of CHECKS) {
    const [sql, ...args] = query(n);
    try { out.push({ source, count: (await env.DB.prepare(sql).bind(...args).first()).n, handling }); }
    // Market tables come with a migration not applied everywhere (0043): no table means no copy.
    catch (e) { out.push(/no such table/i.test(e.message) ? { source, count: 0, handling: 'not_installed' } : { source, count: null, handling: 'could_not_check' }); }
  }
  return out;
}

export async function previewAdvertiserSuppression(env, id) {
  const row = await get(env, id);
  if (row.suppressed_at) return { suppressed: true, version: row.version, affected_fields: [], kept_fields: KEPT, related_materializations: [], blockers: [], complete: true };
  const n = needles(row);
  const affected_fields = [...(row.kind === 'individual' ? ['name'] : []), ...n.d.contacts.flatMap((c, i) => [`contacts.${i}.name`,
    ...(c.email ? [`contacts.${i}.email`] : []), ...c.phones.map((_, j) => `contacts.${i}.phones.${j}`)])];
  const related_materializations = await copies(env, n);
  const blockers = related_materializations.filter(m => m.handling === 'could_not_check' || (m.count > 0 && m.handling.startsWith('kept')))
    .map(m => ({ source: m.source, reason: m.handling }));
  const preview_hash = await sha256(JSON.stringify([row.id, row.version, affected_fields, related_materializations]));
  return { suppressed: false, version: row.version, affected_fields, kept_fields: KEPT, related_materializations, blockers, complete: !blockers.length, preview_hash };
}

export async function suppressAdvertiserPersonalData(env, id, body, actor) {
  const { version, reason, preview_hash } = body ?? {};
  if (!Number.isInteger(version) || !REASONS.includes(reason) || !/^[0-9a-f]{64}$/.test(preview_hash ?? '')) fail(400, 'Send version, reason and preview');
  const row = await get(env, id);
  if (row.suppressed_at) return { advertiser: output(row), already: true };
  const changed = 'This record or its copies changed. Review the removal again.';
  if (row.version !== version) fail(409, changed);
  const p = await previewAdvertiserSuppression(env, id);
  if (p.version !== version || p.preview_hash !== preview_hash) fail(409, changed);
  const n = needles(row), t = now();
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE advertisers SET name=?, details=?, suppressed_at=?, updated_at=?, updated_by=?, version=version+1
      WHERE id=? AND version=? AND suppressed_at IS NULL`).bind(row.kind === 'individual' ? REMOVED_NAME : row.name,
      JSON.stringify({ ...n.d, contacts: [] }), t, t, actor, row.id, version),
    env.DB.prepare('INSERT INTO advertiser_suppressions(advertiser_id,reason,actor,created_at) SELECT ?,?,?,? WHERE changes() = 1').bind(row.id, reason, actor, t),
    // Email still waiting for a send to a removed address is cancelled with the removal, in the same transaction.
    env.DB.prepare(`UPDATE outbound SET status='cancelled', updated_at=? WHERE status IN ('draft','queued') AND lower(recipient) IN
      (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM advertiser_suppressions WHERE advertiser_id=? AND created_at=? AND actor=?)`)
      .bind(t, JSON.stringify(n.emails), row.id, t, actor),
  ]);
  const fresh = await get(env, id);
  if (!result[0].meta.changes) { if (fresh.suppressed_at) return { advertiser: output(fresh), already: true }; fail(409, changed); }
  return { advertiser: output(fresh), complete: p.complete, blockers: p.blockers, cancelled_outbound: result[2].meta.changes };
}

export default [
  ['GET', /^\/admin\/advertisers\/(\d+)\/suppression$/, async ({ env, params: [id] }) => json(await previewAdvertiserSuppression(env, id)), true],
  ['POST', /^\/admin\/advertisers\/(\d+)\/suppression$/, async ({ request, env, admin, params: [id] }) =>
    json(await suppressAdvertiserPersonalData(env, id, await readJson(request), admin)), true],
];
