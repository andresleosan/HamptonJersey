// BUS-04: when the market inventory changes (a new advert, or a change to what a search reads of one), the clock
// crosses again only the active home searches the change can affect, instead of every search after a day with changes
// (BUS-08). It consumes BUS-06's market_change_outbox in pages, queues each affected search once however many changes
// touch it, and marks the changes consumed in the same transaction, so a tick that dies before that reads them again
// and one that dies after it leaves the searches queued. A few searches are crossed per tick with the website's own
// recompute (search-state.js), only when the clock has the website's availability rules (as BUS-08 waits for them).
// market_matches is replaced by every full run (BUS-01), with no human decision; what a search was already told is kept
// apart (market_match_proposals, 0097): a home already proposed to a search is never proposed again, nor noticed again,
// unless it comes back at a lower comparable price. One open Inbox task per search covers all of them. A visit, an
// enquiry or a negotiation does not stop the crossing: only the search's own state does (EST-09).
// Nothing is sent, shortlisted or approved. Off (BUS04_REMATCH_READY not "1") nothing runs.
import { activeSql } from './applicants.js';
import { advertPrice, readMarketHomePrices } from './market-identity.js';
import { recomputeForApplicant } from './search-state.js';
import { RECOMPUTE_FLAGS, RECOMPUTE_PER_TICK } from './market-daily-sweep.js';

export const rematchReady = env => env?.BUS04_REMATCH_READY === '1';
export const CHANGES_PER_TICK = 50, MAX_ATTEMPTS = 3;
export const EVENT = 'applicant.market_matched';
// An advert's operation, as the searches that may be offered it state theirs. A business advert concerns none (BUS-12:
// commercial searches are not crossed with the market).
const SEARCHES_OF = { rent: 'rent', sale: 'buy' };

// What a search reads of an advert (marketHomeFacts): a change to anything else, a title, a text, a date, crosses nothing.
const facts = n => { const f = n.fields ?? {};
  return JSON.stringify([n.operation ?? null, f.parish ?? null, f.bedrooms ?? null, f.bathrooms ?? null, f.pets ?? null,
    f.parking ?? null, advertPrice(n)]); };
// One outbox change: before and after as their normalized JSON text (before null for a new advert), gone when the
// reading withdraws the advert. A reading that cannot be read is material for both operations: never a missed search.
export function classifyMarketChange({ before, after, gone }) {
  let a, b;
  try { a = JSON.parse(after); b = before == null ? null : JSON.parse(before); } catch { a = null; }
  if (!a || typeof a !== 'object' || (b !== null && typeof b !== 'object')) return { material: true, operations: ['rent', 'sale'] };
  const operations = [...new Set([b?.operation, a.operation])].filter(o => o in SEARCHES_OF);
  return { material: !b || !!gone || facts(b) !== facts(a), operations };
}

// Whether a home's price now is lower than when it was proposed: the same currency and period, or a monthly and a
// yearly rent compared over a year. Another currency, an unknown figure or a period that does not convert is not lower.
const PER_YEAR = { month: 12, year: 1 };
const triple = text => { try { const p = JSON.parse(text); return Array.isArray(p) && p.length === 3 ? p : null; } catch { return null; } };
export function lowerPrice(now, before) {
  const n = now == null ? null : triple(now), b = before == null ? null : triple(before);
  if (!n || !b || !Number.isSafeInteger(n[0]) || !Number.isSafeInteger(b[0]) || !n[1] || n[1] !== b[1]) return false;
  if (n[2] === b[2]) return n[0] < b[0];
  return n[2] in PER_YEAR && b[2] in PER_YEAR && n[0] * PER_YEAR[n[2]] < b[0] * PER_YEAR[b[2]];
}

// A page of pending changes, oldest reading first, each with the reading it changed. The searches they affect are
// queued and the changes marked consumed in one transaction.
async function consume(env, ts) {
  const { results } = await env.DB.prepare(`SELECT x.id,o.normalized_json AS after,o.deleted_tombstone AS gone,
      (SELECT p.normalized_json FROM market_observations p WHERE p.source_ref=o.source_ref AND p.channel_id=o.channel_id
        AND p.external_key=o.external_key AND p.sequence<o.sequence ORDER BY p.source_at DESC,p.sequence DESC LIMIT 1) AS before
    FROM market_change_outbox x JOIN market_observations o ON o.id=x.observation_id
    WHERE x.consumer_state='pending' ORDER BY o.sequence LIMIT ?`).bind(CHANGES_PER_TICK).all();
  if (!results.length) return 0;
  const searches = new Set();
  for (const change of results) {
    const { material, operations } = classifyMarketChange(change);
    if (material) for (const o of operations) searches.add(SEARCHES_OF[o]);
  }
  await env.DB.batch([
    ...(searches.size ? [env.DB.prepare(`INSERT INTO market_rematch_queue(applicant_id,queued_at)
      SELECT a.id,? FROM applicants a WHERE ${activeSql('a')} AND a.search_category='residential'
        AND a.operation IN (SELECT value FROM json_each(?))
      ON CONFLICT(applicant_id) DO UPDATE SET queued_at=excluded.queued_at,attempts=0`).bind(ts, JSON.stringify([...searches]))] : []),
    env.DB.prepare(`UPDATE market_change_outbox SET consumer_state='consumed'
      WHERE consumer_state='pending' AND id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(results.map(r => r.id))),
  ]);
  return results.length;
}

const OPEN_NOTICE = `SELECT 1 FROM notifications n JOIN events x ON x.id=n.event_id WHERE x.entity_type='applicant'
  AND x.entity_id=? AND x.type='${EVENT}' AND n.resolved_at IS NULL`;
const REASON = 'Homes from the market inventory newly fit this search, or came back at a lower price. ' +
  'See them in Automations, Market inventory. Nothing was sent, shortlisted or approved.';
const PROPOSAL = 'applicant_id=? AND home_key=? AND operation=?';

// After a crossing: each meets or to-confirm result not proposed before is proposed; one proposed before is proposed
// again only at a lower comparable price; otherwise the price it had is only recorded. A notice when anything was
// proposed and the search has none open. Every write checks what was read, so a crossing that overlaps changes nothing twice.
async function propose(env, id, ts) {
  const { results: rows } = await env.DB.prepare(`SELECT m.home_key,m.operation,m.changed_at,p.price,p.match_changed_at,
      p.applicant_id IS NOT NULL AS known FROM market_matches m LEFT JOIN market_match_proposals p
      ON p.applicant_id=m.applicant_id AND p.home_key=m.home_key AND p.operation=m.operation
    WHERE m.applicant_id=? AND m.result IN ('meets','pending')
      AND (p.applicant_id IS NULL OR p.price IS NULL OR m.changed_at>p.match_changed_at)`).bind(id).all();
  if (!rows.length) return;
  const prices = await readMarketHomePrices(env, rows.map(r => [r.home_key, r.operation])), stmts = [];
  for (const r of rows) {
    const key = [id, r.home_key, r.operation], price = prices.get(JSON.stringify([r.home_key, r.operation])) ?? null;
    if (!r.known) stmts.push(env.DB.prepare(`INSERT INTO market_match_proposals(applicant_id,home_key,operation,reason,price,
      proposed_at,match_changed_at) VALUES (?,?,?,'new',?,?,?) ON CONFLICT DO NOTHING`).bind(...key, price, ts, r.changed_at));
    else if (lowerPrice(price, r.price)) stmts.push(env.DB.prepare(`UPDATE market_match_proposals SET reason='lower_price',
      price=?,proposed_at=?,match_changed_at=? WHERE ${PROPOSAL} AND price=?`).bind(price, ts, r.changed_at, ...key, r.price));
    else stmts.push(env.DB.prepare(`UPDATE market_match_proposals SET price=COALESCE(price,?),match_changed_at=?
      WHERE ${PROPOSAL} AND price IS ? AND match_changed_at=?`).bind(price, r.changed_at, ...key, r.price, r.match_changed_at));
  }
  const fresh = reason => `SELECT COUNT(*) FROM market_match_proposals WHERE applicant_id=? AND proposed_at=? AND reason='${reason}'`;
  stmts.push(env.DB.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT ?,'system','applicant',?,'${EVENT}',json_object('new',n,'lower_price',l) FROM (SELECT (${fresh('new')}) AS n,
        (${fresh('lower_price')}) AS l) WHERE n+l>0 AND EXISTS (SELECT 1 FROM applicants a WHERE a.id=? AND ${activeSql('a')})
        AND NOT EXISTS (${OPEN_NOTICE})`).bind(ts, String(id), id, ts, id, ts, id, String(id)),
    env.DB.prepare(`INSERT INTO notifications(event_id,category,title,task_reason,action_required,created_at,task_key)
      SELECT e.id,'task','New market homes for '||c.name,?,1,e.at,'bus04:market:'||e.id FROM events e
        JOIN applicants a ON a.id=? JOIN contacts c ON c.id=a.contact_id
      WHERE e.entity_type='applicant' AND e.entity_id=? AND e.type='${EVENT}' AND e.at=?
        AND NOT EXISTS (SELECT 1 FROM notifications WHERE event_id=e.id) ORDER BY e.id DESC LIMIT 1`)
      .bind(REASON, id, String(id), ts));
  await env.DB.batch(stmts);
}

// A few queued searches, oldest first. What a search already held before this crossing is its baseline: never noticed.
// A search queued again while it was crossed stays queued; one that fails waits behind the others, MAX_ATTEMPTS times.
async function cross(env, ts) {
  const { results } = await env.DB.prepare('SELECT applicant_id,queued_at FROM market_rematch_queue ORDER BY queued_at,applicant_id LIMIT ?')
    .bind(RECOMPUTE_PER_TICK).all();
  const out = [];
  for (const { applicant_id: id, queued_at: queued } of results) {
    try {
      await env.DB.prepare(`INSERT INTO market_match_proposals(applicant_id,home_key,operation,reason,price,proposed_at,match_changed_at)
        SELECT applicant_id,home_key,operation,'baseline',NULL,?,changed_at FROM market_matches
        WHERE applicant_id=? AND result IN ('meets','pending') ON CONFLICT DO NOTHING`).bind(ts, id).run();
      await recomputeForApplicant(env, id, 'system');
      await propose(env, id, ts);
      await env.DB.prepare('DELETE FROM market_rematch_queue WHERE applicant_id=? AND queued_at=?').bind(id, queued).run();
      out.push('crossed');
    } catch {
      await env.DB.batch([env.DB.prepare(`UPDATE market_rematch_queue SET attempts=attempts+1,queued_at=?
          WHERE applicant_id=? AND queued_at=?`).bind(ts, id, queued),
        env.DB.prepare('DELETE FROM market_rematch_queue WHERE applicant_id=? AND attempts>=?').bind(id, MAX_ATTEMPTS)]);
      out.push('failed');
    }
  }
  return out;
}

// One tick: a page of changes, then a few searches. ts: processing time.
export async function marketRematchPass(env, ts) {
  if (!rematchReady(env)) return null;
  if (!RECOMPUTE_FLAGS.every(flag => env[flag] === '1')) return { waiting: true };
  const consumed = await consume(env, ts);
  return { consumed, crossed: await cross(env, ts) };
}
