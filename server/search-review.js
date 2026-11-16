// BUS-17: the internal review of an active search with no complete option. A complete option is a match the canonical
// predicate accepts (server/search-eligibility.js through the tri-state aggregate of server/search-coverage.js): every
// must-have and legal check met, not rejected by the team nor declined by the client, and its availability confirmed by
// a person (EST-16). Market homes are never one: an advert confirms no availability (SPR-07 would change that).
// Absence is only certified when the search's last full run succeeded (EST-01), its ranking is current and every stored
// match agrees with evaluate() over the listings as they are now (a listing's own recompute is not recorded, so a failed
// one shows here as a difference); otherwise nothing starts or advances. A clock off for over an hour restarts every
// absence from its resumption as a new episode, as nothing was watched meanwhile, and records when and how many.
// 21 Jersey calendar days into an absence one review opens: an Inbox task with up to 20 explained alternatives. The
// team's Done on that task closes it, and 7 days later, still with none, the next opens. A complete option, or the
// search stopping, closes an open review by its source and ends the absence; a later one is a new episode.
// Each tick also notices a rejected match whose price dropped by 5% or more since the clock first saw it after that
// rejection: one open Inbox task per match for a person to look again. The match stays rejected; only a person moves it
// back to Found.
// Nothing is sent, no criteria change and no match decision is touched. Off (BUS17_REVIEW_READY not "1") nothing runs.
import { activeSql } from './applicants.js';
import { aggregateFullAvailability } from './search-coverage.js';
import { searchReviewClock } from './search-review-clock.js';
import { searchRunState } from './search-state.js';
import { CHECK_LABEL } from './candidate-state.js';
import { evaluate } from './matching.js';
import { APPLICANT, CANDIDATES_SQL, COMMERCIAL_SQL, offeredListing, operationFor } from './match-store.js';
import { notConfirmedUnavailable } from './property-facts.js';

export const reviewReady = env => env?.BUS17_REVIEW_READY === '1';
// What the clock must read as the website does: each search's run record (EST-01), confirmed availability (EST-16) and
// the candidates a recompute offers (EST-15 keeps a property confirmed not available out).
export const REVIEW_FLAGS = ['EST01_SEARCH_STATE_READY', 'EST16_AVAILABILITY_READY', 'EST15_UNAVAILABILITY_READY'];
// OPENS_PER_TICK spreads the reviews that fall due together (searches baselined the same day) over several ticks.
export const SEARCHES_PER_TICK = 50, ALTERNATIVES_LIMIT = 20, PRICE_DROP = 0.05, OPENS_PER_TICK = 10, GAP_MS = 3600000;
export const REVIEW_EVENT = 'applicant.search_review', PRICE_EVENT = 'applicant.rejected_price_drop';
const RULE_VERSION = 'matching-1';
const CONTENDED = /search_review_progress\.enabled_at/;

// The confirmation in force for listing l says available: the latest about the whole property or its operation, with
// none of the same moment saying otherwise (EST-15's standsUnavailable, for the other answer).
const AVAILABLE_REF = `(SELECT c.id FROM availability_confirmations c WHERE c.listing_id=l.id
  AND (c.operation IS NULL OR c.operation=l.operation) AND c.status='available' AND NOT EXISTS (
    SELECT 1 FROM availability_confirmations newer WHERE newer.listing_id=c.listing_id
      AND (newer.operation IS NULL OR newer.operation=l.operation)
      AND (newer.confirmed_at>c.confirmed_at OR (newer.confirmed_at=c.confirmed_at AND newer.status<>'available')))
  ORDER BY c.id DESC LIMIT 1)`;
// Everything the decision about search a reads: its inputs and matches (matches_revision moves with any of them or any
// matched listing), its run record, the confirmations of its listings (never rewritten), the client's answers, and any
// listing added or changed (a new one may now fit).
// Compared again inside the write, so a decision made on a stale read changes nothing.
const FINGERPRINT = `json_array(a.matches_revision,a.match_inputs_revision,${activeSql('a')},
  (SELECT json_array(last_attempt_at,last_success_at,last_failure_at) FROM applicant_search_runs WHERE applicant_id=a.id),
  (SELECT COALESCE(MAX(c.id),0) FROM availability_confirmations c WHERE c.listing_id IN (SELECT listing_id FROM matches WHERE applicant_id=a.id)),
  (SELECT COUNT(*) FROM presentation_options p WHERE p.answered_at IS NOT NULL AND p.match_id IN (SELECT id FROM matches WHERE applicant_id=a.id)),
  (SELECT COUNT(*)||':'||COALESCE(MAX(updated_at),'') FROM listings),(SELECT COALESCE(SUM(version),0) FROM listing_match_inputs))`;

const CLASSIFICATION = ['meets', 'pending', 'alternative', 'excluded'];
const STAFF = { found: 'pending', shortlisted: 'approved', rejected: 'rejected' };
const CLIENT = { not_for_me: 'declined', interested: 'accepted', request_viewing: 'accepted', call_me: 'pending' };
const OFFERED = ['for_sale', 'to_let', 'lease']; // as AVAILABLE in match-pages.js: a let, sold or archived home is no option

// Whether the stored matches of search a are what a recompute would store now: its ranking is current, every listing
// that would pass is stored, no Found one has stopped passing, and every one not rejected has the rank it would get.
// listings: the candidates and the matched listings, with the columns a recompute reads. Any doubt answers false.
export function storedMatchesCurrent(a, listings, matches) {
  try {
    if (a.match_ranking_version !== 1) return false;
    const stored = new Map(matches.map(m => [m.listing_id, m])), read = new Set(listings.map(l => l.id)), op = operationFor(a);
    for (const l of listings) {
      const m = stored.get(l.id);
      if (!m && l.operation !== op) continue;
      const r = evaluate(a, l), passing = l.candidate === 1 && (l.use === 'commercial') === (a.search_category === 'commercial') && r.pass;
      if (!m) { if (passing) return false; continue; }
      if (m.status === 'rejected') continue;
      if ((m.status === 'found' && !passing) || m.requirements_rank !== r.requirements_rank) return false;
    }
    return matches.every(m => m.status === 'rejected' || read.has(m.listing_id));
  } catch { return false; }
}

// The tri-state of one search from its stored matches: full, absent or unknown.
export function searchAvailability(s, matches, episodeId, ts) {
  const scope = { searchId: String(s.id), episodeId, criteriaRevision: s.match_inputs_revision, ruleVersion: RULE_VERSION };
  const candidates = matches.map(m => {
    const offered = m.listing_archived == null && (m.listing_availability == null || OFFERED.includes(m.listing_availability));
    const keys = { ...scope, candidateKey: m.listing_id, candidateRevision: m.version }, meets = offered && m.requirements_rank === 0;
    return { current: { ...keys, episodeStatus: 'active' },
      evaluation: { ...keys, classification: CLASSIFICATION[m.requirements_rank] ?? 'unknown', mustsConfirmed: meets,
        essentialsConfirmed: meets, caseConditions: meets ? 'satisfied' : 'pending', legal: meets ? 'satisfied' : 'pending',
        excluded: !offered || m.requirements_rank === 3 },
      availability: { ...keys, status: m.available_ref != null ? 'confirmed' : 'not_confirmed', current: m.available_ref != null,
        evidenceRef: m.available_ref != null ? `confirmation:${m.available_ref}` : '' },
      staffDecision: { ...keys, status: STAFF[m.status] ?? 'unknown' },
      clientDecision: { ...keys, status: CLIENT[m.client_choice] ?? 'pending' } };
  });
  const run = searchRunState(s.recorded == null ? null : s, ts);
  const { state } = aggregateFullAvailability({ current: { ...scope, episodeStatus: 'active' }, candidates,
    ...(run.state === 'searched' && { coverage: { ...scope, complete: true, candidates: candidates.length } }) });
  return state === 'full_available' ? 'full' : state;
}

// What the clock does with one search. s: its row (cycle columns null when the clock has not seen it), review: its open
// review, with the Inbox task's resolution. Returns null when nothing changes.
export function plan(s, review, availability, ts, enabledAt) {
  const seen = s.state != null, cleared = state => ({ state, episode: s.episode ?? 1, no_full_since: null, source: null, last_closed_at: null });
  if (!s.live || availability === 'full') {
    const state = s.live ? 'held' : 'inactive';
    if (s.state === state || (!seen && !s.live)) return null;
    return { cycle: cleared(state), close: review && { outcome: s.live ? 'full_option_found' : 'search_inactive', at: ts, by: 'system', source: true } };
  }
  if (availability !== 'absent') return null; // unknown: neither start nor advance
  let cycle;
  if (s.state === 'absent') cycle = { state: 'absent', episode: s.episode, no_full_since: s.no_full_since, source: s.source, last_closed_at: s.last_closed_at };
  else {
    const source = !seen ? (s.created_at >= enabledAt ? 'activation' : 'legacy_baseline') : s.state === 'held' ? 'last_full_lost' : 'activation';
    cycle = { state: 'absent', episode: seen ? s.episode + 1 : 1, no_full_since: !seen && source === 'activation' ? s.created_at : ts,
      source, last_closed_at: null };
  }
  let close = null, reviews = cycle.episode === s.episode ? s.reviews : 0;
  if (review?.resolved_at) {
    close = { outcome: 'reviewed', at: review.resolved_at, by: review.resolved_by ?? 'system', source: false };
    // A review of an earlier episode (open when the clock restarted): the next is due 21 days from that restart.
    cycle.last_closed_at = review.episode === cycle.episode ? review.resolved_at : null;
  }
  let open = null;
  if (!review || close) {
    const clock = searchReviewClock({ now: ts, fullAvailable: false, absence: { at: cycle.no_full_since, source: cycle.source },
      review: cycle.last_closed_at ? { status: 'closed', closedAt: cycle.last_closed_at } : null });
    if (clock.state === 'due') open = { cycle: reviews + 1, due_at: clock.dueAt };
  }
  const same = s.state === 'absent' && ['episode', 'no_full_since', 'source', 'last_closed_at'].every(k => cycle[k] === s[k]);
  return same && !close && !open ? null : { cycle, close, open };
}

const isMust = c => c.priority === 'must' || c.key === 'pets' || c.key === 'housing';
const label = c => CHECK_LABEL[c.key] ?? c.key;
const marketTitle = key => { try { const [source, , external] = JSON.parse(key); return `${source} · ${external}`; } catch { return key; } };
// Up to limit alternatives for an internal review, the closest first: fewest unmet must-haves, then unmet checks, then
// facts to confirm, Hampton's own listings before market homes, then score and key. Gaps are never summed across units:
// each unmet check keeps its own evidence. Unknown (pets included) is something to confirm, never a criterion to relax.
// own: the search's matches not rejected nor declined by the client, nor excluded; market: its market_matches.
export function buildAlternatives(own, market, limit = ALTERNATIVES_LIMIT) {
  const item = (kind, id, title, checksText, score, confirmed) => {
    let checks = [];
    try { checks = JSON.parse(checksText) ?? []; } catch { /* shown with nothing to explain */ }
    const unmet = checks.filter(c => c.result === 'fails').map(c => ({ label: label(c), must: isMust(c), detail: c.evidence ?? null }));
    const verify = checks.filter(c => c.result === 'unknown').map(c => ({ label: label(c), detail: c.evidence ?? null }));
    if (!confirmed) verify.push({ label: 'Availability', detail: 'Not confirmed by a person' });
    return { kind, id, title, satisfied: checks.filter(c => c.result === 'meets').map(label), unmet, verify,
      order: [unmet.filter(u => u.must).length, unmet.length, verify.length, kind === 'listing' ? 0 : 1, -(score ?? 0)] };
  };
  const all = [...own.map(m => item('listing', m.listing_id, m.title ?? m.listing_id, m.checks, m.score, m.available_ref != null)),
    ...market.map(m => item('market', m.home_key, marketTitle(m.home_key), m.checks, m.score, false))];
  all.sort((a, b) => a.order.reduce((d, v, i) => d || v - b.order[i], 0) || String(a.id).localeCompare(String(b.id)));
  return all.slice(0, limit).map(({ order, ...rest }) => rest);
}

// A listing's price as [amount, currency, period], or null when it has none.
const priceOf = l => {
  const rent = l.operation === 'rent', amount = rent ? l.rent : l.sale_price;
  return typeof amount === 'number' && amount > 0 && l.currency && (!rent || l.rent_period)
    ? [amount, l.currency, rent ? l.rent_period : null] : null;
};
const PER_YEAR = { month: 12, year: 1 };
// Whether now is at least PRICE_DROP below before, in the same currency: a sale price, or rents compared over a year.
export function materialDrop(now, before) {
  if (!now || !before || now[1] !== before[1]) return false;
  const yearly = p => (p[2] == null ? p[0] : PER_YEAR[p[2]] ? p[0] * PER_YEAR[p[2]] : null);
  if ((now[2] == null) !== (before[2] == null)) return false;
  const [n, b] = [yearly(now), yearly(before)];
  return n != null && b != null && n <= b * (1 - PRICE_DROP);
}
const money = p => `${p[1] === 'GBP' ? '£' : `${p[1]} `}${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(p[0])}` +
  (p[2] === 'month' ? ' a month' : p[2] === 'year' ? ' a year' : '');

function reviewTask(name, open, count) {
  const first = open.cycle === 1, title = first ? `21-day search review for ${name}` : `Search review (7 days on) for ${name}`;
  const reason = (first ? 'No home has met every must-have with availability confirmed by a person for 21 days. '
    : '7 days after the last review, still no home has met every must-have with availability confirmed by a person. ') +
    (count ? `${count} ${count === 1 ? 'alternative is' : 'alternatives are'} listed in Matches: choose what to take up with the client.`
      : 'No alternative was found among the saved listings and the market inventory.') +
    ' Nothing was sent and the criteria did not change.';
  return { title, reason };
}

async function applyPlan(env, s, review, p, ts) {
  const { cycle } = p, stmts = [], token = crypto.randomUUID();
  const values = [cycle.state, cycle.episode, cycle.no_full_since, cycle.source, cycle.last_closed_at];
  stmts.push(s.state != null
    ? env.DB.prepare(`UPDATE search_review_cycles SET state=?,episode=?,no_full_since=?,source=?,last_closed_at=?,
        revision=revision+1,updated_at=?,write_token=? WHERE applicant_id=? AND revision=? AND (SELECT ${FINGERPRINT} FROM applicants a WHERE a.id=?)=?`)
      .bind(...values, ts, token, s.id, s.revision, s.id, s.fingerprint)
    : env.DB.prepare(`INSERT INTO search_review_cycles(applicant_id,state,episode,no_full_since,source,last_closed_at,updated_at,write_token)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT ${FINGERPRINT} FROM applicants a WHERE a.id=?)=? ON CONFLICT DO NOTHING`)
      .bind(s.id, ...values, ts, token, s.id, s.fingerprint));
  // Rolls the whole batch back when the search or its cycle changed since the read (this write's token is not there):
  // the progress row always exists, and its NOT NULL aborts the batch.
  stmts.push(env.DB.prepare(`UPDATE search_review_progress SET enabled_at=NULL WHERE id=1
    AND NOT EXISTS (SELECT 1 FROM search_review_cycles WHERE applicant_id=? AND write_token=?)`).bind(s.id, token));
  if (p.close) stmts.push(env.DB.prepare('UPDATE search_reviews SET closed_at=?,closed_by=?,outcome=? WHERE id=? AND closed_at IS NULL')
    .bind(p.close.at, p.close.by, p.close.outcome, review.id));
  // A review closed by its source, or one superseded by the next: every earlier review task of the search still open
  // (one reopened after its Done included) is resolved by its source, so at most the newest stays open.
  if (p.close?.source || p.open) stmts.push(env.DB.prepare(`UPDATE notifications SET resolved_at=?,resolved_by='system',
      closed_by_source=1,task_actor='system',task_action='source_resolved' WHERE resolved_at IS NULL AND task_key GLOB 'bus17:review:*'
      AND event_id IN (SELECT id FROM events WHERE entity_type='applicant' AND entity_id=? AND type='${REVIEW_EVENT}')`).bind(ts, String(s.id)));
  if (p.open) {
    const { items, coverage_pending } = await alternativesFor(env, s);
    const { title, reason } = reviewTask(s.name, p.open, items.length);
    stmts.push(env.DB.prepare(`INSERT INTO search_reviews(applicant_id,episode,cycle,due_at,opened_at,alternatives,coverage_pending)
        VALUES (?,?,?,?,?,?,?)`).bind(s.id, cycle.episode, p.open.cycle, p.open.due_at, ts, JSON.stringify(items),
        coverage_pending.length ? JSON.stringify(coverage_pending) : null),
      env.DB.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES (?,'system','applicant',?,'${REVIEW_EVENT}',
        json_object('review_id',last_insert_rowid(),'episode',?,'cycle',?,'alternatives',?))`)
        .bind(ts, String(s.id), cycle.episode, p.open.cycle, items.length),
      env.DB.prepare(`INSERT INTO notifications(event_id,category,title,task_reason,action_required,created_at,task_key)
        SELECT e.id,'task',?,?,1,e.at,'bus17:review:'||json_extract(e.data,'$.review_id') FROM events e WHERE e.id=last_insert_rowid()`)
        .bind(title, reason));
  }
  await env.DB.batch(stmts);
}

// The alternatives of a review that opens now: its own matches as read, and its market homes when they can be read.
async function alternativesFor(env, s) {
  const own = s.matches.filter(m => m.status !== 'rejected' && m.client_choice !== 'not_for_me' && m.requirements_rank !== 3);
  let market = [], coverage_pending = [];
  try {
    const [homes, [run]] = (await env.DB.batch([
      env.DB.prepare(`SELECT home_key,result,score,checks FROM market_matches WHERE applicant_id=? AND result IN ('meets','pending','alternative')`).bind(s.id),
      env.DB.prepare('SELECT market_state FROM applicant_search_runs WHERE applicant_id=?').bind(s.id)])).map(r => r.results);
    market = homes;
    if (run?.market_state !== 'searched') coverage_pending = ['market_inventory'];
  } catch { coverage_pending = ['market_inventory']; }
  return { items: buildAlternatives(own, market), coverage_pending };
}

// The statements for the rejected matches of a live search, run in one batch. Each one's price is recorded the first
// time after its rejection (again after a new rejection, or when its currency or kind of price changes); a material
// drop from it opens a task unless one for that match is still open, and becomes the price compared next. A rise
// changes nothing, so going back to the old price notices nothing. A match no longer rejected loses its record.
function priceStatements(env, s, ts) {
  const stmts = [], open = `SELECT 1 FROM notifications WHERE task_key GLOB 'bus17:price:'||?||':*' AND resolved_at IS NULL`;
  let drops = 0;
  if (s.matches.some(m => m.status !== 'rejected' && m.seen_price)) stmts.push(env.DB.prepare(`DELETE FROM search_rejected_prices
    WHERE applicant_id=? AND match_id NOT IN (SELECT id FROM matches WHERE applicant_id=? AND status='rejected')`).bind(s.id, s.id));
  for (const m of s.matches.filter(m => m.status === 'rejected')) {
    const now = priceOf(m);
    if (!now) continue;
    const before = m.seen_price ? JSON.parse(m.seen_price) : null;
    if (!before || m.seen_rejected_at !== m.reviewed_at || before[1] !== now[1] || (before[2] == null) !== (now[2] == null)) {
      stmts.push(env.DB.prepare(`INSERT INTO search_rejected_prices(match_id,applicant_id,rejected_at,price,seen_at) VALUES (?,?,?,?,?)
        ON CONFLICT(match_id) DO UPDATE SET rejected_at=excluded.rejected_at,price=excluded.price,seen_at=excluded.seen_at`)
        .bind(m.id, s.id, m.reviewed_at ?? null, JSON.stringify(now), ts));
      continue;
    }
    if (!materialDrop(now, before)) continue;
    const reason = `${m.title ?? m.listing_id} (${m.listing_id}) was rejected at ${money(before)}; it is now ${money(now)}. ` +
      'If it is worth another look, move it back to Found in Matches. Nothing was changed or sent.';
    stmts.push(env.DB.prepare('UPDATE search_rejected_prices SET price=?,seen_at=? WHERE match_id=? AND price=?')
        .bind(JSON.stringify(now), ts, m.id, m.seen_price),
      env.DB.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data) SELECT ?,'system','applicant',?,'${PRICE_EVENT}',
        json_object('match_id',?,'listing_id',?,'from',json(?),'to',json(?)) WHERE changes()=1 AND NOT EXISTS (${open})`)
        .bind(ts, String(s.id), m.id, m.listing_id, m.seen_price, JSON.stringify(now), m.id),
      env.DB.prepare(`INSERT INTO notifications(event_id,category,title,task_reason,action_required,created_at,task_key)
        SELECT e.id,'task',?,?,1,e.at,'bus17:price:'||?||':'||e.id FROM events e WHERE e.id=last_insert_rowid()
          AND e.type='${PRICE_EVENT}' AND json_extract(e.data,'$.match_id')=? AND NOT EXISTS (SELECT 1 FROM notifications WHERE event_id=e.id)`)
        .bind(`Price dropped on a rejected home for ${s.name}`, reason, m.id, m.id));
    drops++;
  }
  return { stmts, drops };
}

// One tick: a page of searches (the active ones and those the clock still holds), in id order, wrapping round.
export async function searchReviewPass(env, ts) {
  if (!reviewReady(env)) return null;
  if (!REVIEW_FLAGS.every(flag => env[flag] === '1')) return { waiting: true };
  await env.DB.prepare('INSERT INTO search_review_progress(id,enabled_at) VALUES (1,?) ON CONFLICT DO NOTHING').bind(ts).run();
  const progress = await env.DB.prepare('SELECT enabled_at,last_tick_at,after_id FROM search_review_progress WHERE id=1').first();
  // Off, or waiting for its flags, for over an hour: nothing was watched, so every absence restarts now as a new episode
  // with no history assumed, and a search registered meanwhile is not taken as watched since its registration. The
  // progress row keeps when that last happened and how many absences it restarted. Both run only while last_tick_at is
  // still the one read (they precede its update), so two ticks resuming at once restart once.
  const resumed = progress.last_tick_at != null && Date.parse(ts) - Date.parse(progress.last_tick_at) > GAP_MS;
  const read = '(SELECT last_tick_at FROM search_review_progress WHERE id=1) IS ?';
  await env.DB.batch([
    ...(resumed ? [env.DB.prepare(`UPDATE search_review_progress SET enabled_at=?,last_restart_at=?,
        last_restart_absences=(SELECT COUNT(*) FROM search_review_cycles WHERE state='absent') WHERE id=1 AND ${read}`)
        .bind(ts, ts, progress.last_tick_at),
      env.DB.prepare(`UPDATE search_review_cycles SET source='legacy_baseline',no_full_since=?,last_closed_at=NULL,episode=episode+1,
        revision=revision+1,updated_at=? WHERE state='absent' AND ${read}`).bind(ts, ts, progress.last_tick_at)] : []),
    env.DB.prepare('UPDATE search_review_progress SET last_tick_at=? WHERE id=1 AND (last_tick_at IS NULL OR last_tick_at<?)').bind(ts, ts)]);
  if (resumed) progress.enabled_at = ts;
  const { results: page } = await env.DB.prepare(`SELECT a.id FROM applicants a LEFT JOIN search_review_cycles y ON y.applicant_id=a.id
    WHERE a.id>? AND (${activeSql('a')} OR y.state IN ('absent','held')) ORDER BY a.id LIMIT ?`).bind(progress.after_id, SEARCHES_PER_TICK).all();
  const ids = JSON.stringify(page.map(r => r.id));
  const [searches, applicants, listings, matches, reviews] = (await env.DB.batch([
    env.DB.prepare(`SELECT a.id,${activeSql('a')} AS live,a.created_at,a.match_inputs_revision,c.name,${FINGERPRINT} AS fingerprint,
        r.applicant_id AS recorded,r.last_attempt_at,r.last_success_at,r.last_failure_at,
        y.state,y.episode,y.no_full_since,y.source,y.last_closed_at,y.revision,
        (SELECT COUNT(*) FROM search_reviews v WHERE v.applicant_id=a.id AND v.episode=y.episode) AS reviews
      FROM applicants a JOIN contacts c ON c.id=a.contact_id LEFT JOIN applicant_search_runs r ON r.applicant_id=a.id
        LEFT JOIN search_review_cycles y ON y.applicant_id=a.id WHERE a.id IN (SELECT value FROM json_each(?)) ORDER BY a.id`).bind(ids),
    env.DB.prepare(`SELECT a.match_ranking_version,${APPLICANT} WHERE a.id IN (SELECT value FROM json_each(?))`).bind(ids),
    env.DB.prepare(`SELECT ${offeredListing(env)} FROM listings WHERE (((${CANDIDATES_SQL}) OR (${COMMERCIAL_SQL}))${notConfirmedUnavailable(env)})
      OR id IN (SELECT listing_id FROM matches WHERE applicant_id IN (SELECT value FROM json_each(?)))`).bind(ids),
    env.DB.prepare(`SELECT m.id,m.applicant_id,m.listing_id,m.status,m.requirements_rank,m.score,m.checks,m.reviewed_at,l.title,l.operation,
        l.archived_at AS listing_archived,l.availability AS listing_availability,
        l.sale_price,l.rent,l.rent_period,l.currency,COALESCE((SELECT version FROM listing_match_inputs WHERE listing_id=l.id),0) AS version,
        ${AVAILABLE_REF} AS available_ref,(SELECT p.choice FROM presentation_options p WHERE p.match_id=m.id AND p.choice IS NOT NULL
          ORDER BY p.answered_at DESC,p.grant_id DESC LIMIT 1) AS client_choice,
        (SELECT price FROM search_rejected_prices WHERE match_id=m.id) AS seen_price,
        (SELECT rejected_at FROM search_rejected_prices WHERE match_id=m.id) AS seen_rejected_at
      FROM matches m JOIN listings l ON l.id=m.listing_id WHERE m.applicant_id IN (SELECT value FROM json_each(?))`).bind(ids),
    env.DB.prepare(`SELECT v.id,v.applicant_id,v.episode,n.resolved_at,n.resolved_by FROM search_reviews v
      LEFT JOIN notifications n ON n.task_key='bus17:review:'||v.id WHERE v.closed_at IS NULL AND v.applicant_id IN (SELECT value FROM json_each(?))`).bind(ids),
  ])).map(r => r.results);
  const out = { searched: searches.length, opened: 0, closed: 0, deferred: 0, price_drops: 0, unchanged: 0, contended: 0, failed: 0 };
  for (const s of searches) {
    s.matches = matches.filter(m => m.applicant_id === s.id);
    const review = reviews.find(v => v.applicant_id === s.id), a = applicants.find(x => x.id === s.id);
    try {
      const current = s.live && a && storedMatchesCurrent(a, listings, s.matches);
      const availability = current ? searchAvailability(s, s.matches, String(s.episode ?? 1), ts) : 'unknown';
      const p = plan(s, review, availability, ts, progress.enabled_at);
      if (p?.open && out.opened >= OPENS_PER_TICK) out.deferred++; // its turn comes when the cursor wraps round
      else if (p) {
        await applyPlan(env, s, review, p, ts);
        out.opened += p.open ? 1 : 0; out.closed += p.close ? 1 : 0;
      } else out.unchanged++;
      if (s.live) {
        const { stmts, drops } = priceStatements(env, s, ts);
        if (stmts.length) { await env.DB.batch(stmts); out.price_drops += drops; }
      }
    } catch (e) {
      if (CONTENDED.test(String(e?.message))) out.contended++;
      else { out.failed++; console.error('Search review not recorded'); } // no search or person in the logs
    }
  }
  await env.DB.prepare('UPDATE search_review_progress SET after_id=? WHERE id=1')
    .bind(page.length < SEARCHES_PER_TICK ? 0 : page.at(-1).id).run();
  return out;
}

// The panel: the open review of a search, with its alternatives, or null (off, none open, or not migrated). since only
// when the review belongs to the current absence (one opened before a restart has none to show).
export async function openSearchReview(env, applicantId) {
  if (!reviewReady(env)) return undefined;
  try {
    const r = await env.DB.prepare(`SELECT v.id,v.cycle,v.opened_at,v.alternatives,v.coverage_pending,
        CASE WHEN v.episode=y.episode THEN y.no_full_since END AS since
      FROM search_reviews v LEFT JOIN search_review_cycles y ON y.applicant_id=v.applicant_id
      WHERE v.applicant_id=? AND v.closed_at IS NULL`).bind(applicantId).first();
    return r ? { ...r, alternatives: JSON.parse(r.alternatives), coverage_pending: r.coverage_pending ? JSON.parse(r.coverage_pending) : [] } : null;
  } catch { return null; }
}
