import { OPTIONS } from './applicants.js';
import { jerseyDayStart } from './insights.js';
import { plusDays, realDate } from './viewings.js';
import { fail } from './http.js';

const STAGES = OPTIONS.stages.map(([stage]) => stage);
// ANA-05: each verified milestone and the record that proves it for a search, by the search's own id. Offers and sales
// exist only for buying. A viewing carries no search id (VIS-17 owns that link), so it stays not recorded; it is
// never joined by email or phone.
const SOURCES = {viewing_completed:null, offer:'offers', agreed:'sales', completed:'sales', search_closed:'search_state'};
const BUYING_ONLY = ['offers', 'sales'];
const OPERATIONS = ['all', 'rent', 'buy', 'transfer'];
const CATEGORIES = ['all', 'residential', 'commercial'];
const MAX_SEARCHES = 5000, MAX_EVENTS = 50000, MAX_EVENT_BYTES = 131072, MAX_FACTS = 20000;

// Events written by the app use UTC ISO timestamps. The pure projection also accepts ISO offsets.
function validIso(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return false;
  const [, y, mo, d, h, mi, s, zone] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  if (!year || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
      Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return false;
  if (zone !== 'Z' && (Number(zone.slice(1,3)) > 14 || Number(zone.slice(4,6)) > 59 ||
      (zone.slice(1,3) === '14' && zone.slice(4,6) !== '00'))) return false;
  return Number.isFinite(Date.parse(value));
}

// One observed entry per search/stage, at the first valid explicit event; never infer earlier stages.
export function observedStageEntries(events) {
  const first = new Map();
  for (const e of events) {
    if (!['applicant.stage_changed','applicant.updated'].includes(e.type) ||
        (e.entity_type != null && e.entity_type !== 'applicant') || !validIso(e.at)) continue;
    const id = e.applicant_id ?? e.entity_id;
    if (id == null) continue;
    let data;
    try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { continue; }
    const stage = data?.after?.stage;
    if (!STAGES.includes(stage)) continue;
    if (!first.has(id)) first.set(id, new Map());
    const entries = first.get(id), previous = entries.get(stage);
    if (!previous || Date.parse(e.at) < Date.parse(previous.at) ||
        (Date.parse(e.at) === Date.parse(previous.at) && Number(e.id ?? 0) < Number(previous.id ?? 0)))
      entries.set(stage, {at:e.at, id:e.id});
  }
  return new Map([...first].map(([id, entries]) => [id, new Map([...entries].map(([stage, entry]) => [stage, entry.at]))]));
}

// Validate ISO calendar, clock and offset before using julianday; a malformed timestamp cannot be
// assigned confidently to a period. Only the aggregate invalid count leaves the database.
const ISO_VALID = `length(e.at)>=20 AND substr(e.at,1,4) GLOB '[0-9][0-9][0-9][0-9]'
  AND substr(e.at,1,4)<>'0000' AND substr(e.at,5,1)='-' AND substr(e.at,8,1)='-'
  AND substr(e.at,6,2) GLOB '[0-9][0-9]' AND substr(e.at,9,2) GLOB '[0-9][0-9]'
  AND strftime('%Y-%m-%d',substr(e.at,1,10),'+0 days')=substr(e.at,1,10)
  AND substr(e.at,11,1)='T' AND substr(e.at,14,1)=':' AND substr(e.at,17,1)=':'
  AND substr(e.at,12,2) GLOB '[0-9][0-9]' AND substr(e.at,15,2) GLOB '[0-9][0-9]'
  AND substr(e.at,18,2) GLOB '[0-9][0-9]' AND substr(e.at,12,2) BETWEEN '00' AND '23'
  AND substr(e.at,15,2) BETWEEN '00' AND '59' AND substr(e.at,18,2) BETWEEN '00' AND '59'
  AND (substr(e.at,-1)='Z' OR (substr(e.at,-6,1) IN ('+','-')
    AND substr(e.at,-5,2) GLOB '[0-9][0-9]' AND substr(e.at,-3,1)=':'
    AND substr(e.at,-2,2) GLOB '[0-9][0-9]' AND substr(e.at,-5,2) BETWEEN '00' AND '14'
    AND substr(e.at,-2,2) BETWEEN '00' AND '59' AND (substr(e.at,-5,2)<>'14' OR substr(e.at,-2,2)='00')))
  AND (length(e.at)-19-(CASE WHEN substr(e.at,-1)='Z' THEN 1 ELSE 6 END)=0 OR
    (length(e.at)-19-(CASE WHEN substr(e.at,-1)='Z' THEN 1 ELSE 6 END)>=2 AND substr(e.at,20,1)='.'
      AND substr(e.at,21,length(e.at)-20-(CASE WHEN substr(e.at,-1)='Z' THEN 1 ELSE 6 END)) NOT GLOB '*[^0-9]*'))
  AND julianday(e.at) IS NOT NULL`;

// Both indexed range reads are widened one UTC day to admit valid ISO offsets, then checked by instant.
// MATERIALIZED and LIMIT bound the intermediate rows, not just the final response. Event bodies are
// reduced to short stage values and error flags before materialization. Overflow fails closed.
const ELIGIBLE = `type IN ('applicant.stage_changed','applicant.updated') AND valid_at
  AND julianday(at)>=julianday(created_at) AND julianday(at)<julianday(?4)`;
const QUERY = `WITH cohort AS MATERIALIZED (
  SELECT a.id,a.created_at,a.operation,a.search_operation,a.search_category,a.search_state,a.resolved_at FROM applicants a INDEXED BY applicants_operation
  WHERE a.operation IN ('rent','buy') AND a.created_at>=?1 AND a.created_at<?2 LIMIT ${MAX_SEARCHES + 1}
), selected AS MATERIALIZED (
  SELECT * FROM cohort a WHERE julianday(a.created_at)>=julianday(?3) AND julianday(a.created_at)<julianday(?4)
    AND (?5='all' OR COALESCE(a.search_operation,a.operation)=?5) AND (?6='all' OR a.search_category=?6)
), candidate_events AS MATERIALIZED (
  SELECT a.id AS applicant_id,a.created_at,e.at,e.type,(${ISO_VALID}) AS valid_at,
    CASE WHEN e.type IN ('applicant.stage_changed','applicant.updated') AND e.data IS NOT NULL
      THEN CASE WHEN length(CAST(e.data AS BLOB))>${MAX_EVENT_BYTES} THEN 1 ELSE 0 END ELSE 0 END AS oversized,
    CASE WHEN e.type IN ('applicant.stage_changed','applicant.updated') AND e.data IS NOT NULL
      THEN CASE WHEN length(CAST(e.data AS BLOB))>${MAX_EVENT_BYTES} THEN 0 WHEN json_valid(e.data) THEN 0 ELSE 1 END
      ELSE 0 END AS invalid_data,
    CASE WHEN e.type IN ('applicant.stage_changed','applicant.updated') AND e.data IS NOT NULL THEN
      CASE WHEN length(CAST(e.data AS BLOB))>${MAX_EVENT_BYTES} THEN NULL
        WHEN json_valid(e.data) THEN CASE WHEN json_extract(e.data,'$.after.stage') IN (${STAGES.map(stage => `'${stage}'`).join(',')})
          THEN json_extract(e.data,'$.after.stage') ELSE NULL END ELSE NULL END ELSE NULL END AS stage
  FROM selected a CROSS JOIN events e INDEXED BY events_entity
  WHERE e.entity_type='applicant' AND e.entity_id=CAST(a.id AS TEXT) AND e.at>=?1 AND e.at<?2
  LIMIT ${MAX_EVENTS + 1}
), offer_facts AS MATERIALIZED (
  SELECT o.applicant_id,o.created_at AS at FROM selected a CROSS JOIN offers o INDEXED BY offers_applicant
  WHERE o.applicant_id=a.id AND julianday(o.created_at)>=julianday(a.created_at) AND julianday(o.created_at)<julianday(?4)
  LIMIT ${MAX_FACTS + 1}
), sale_facts AS MATERIALIZED (
  SELECT s.applicant_id,s.created_at AS at,
    CASE WHEN s.status='completed' AND julianday(s.closed_at)<julianday(?4) THEN s.closed_at END AS completed_at
  FROM selected a CROSS JOIN sales s INDEXED BY sales_applicant
  WHERE s.applicant_id=a.id AND julianday(s.created_at)>=julianday(a.created_at) AND julianday(s.created_at)<julianday(?4)
  LIMIT ${MAX_FACTS + 1}
), event_groups AS MATERIALIZED (
  -- One pass over the events: stage counts of eligible events, plus the error and size flags.
  SELECT CASE WHEN ${ELIGIBLE} THEN stage END AS stage,COUNT(*) AS n_rows,
    COUNT(DISTINCT CASE WHEN ${ELIGIBLE} THEN applicant_id END) AS n,
    COALESCE(SUM(CASE WHEN ${ELIGIBLE} THEN oversized END),0) AS oversized,
    COALESCE(SUM(CASE WHEN ${ELIGIBLE} THEN invalid_data END),0) AS invalid_data,
    COALESCE(SUM(CASE WHEN type IN ('applicant.stage_changed','applicant.updated') AND NOT COALESCE(valid_at,0)
      AND at>=?3 AND at<?4 THEN 1 ELSE 0 END),0) AS invalid_at
  FROM candidate_events GROUP BY 1
)
-- Each intermediate table is read once: D1 bills every row a step reads, so one pass per table, not one per figure.
SELECT s.*,k.*,e.*,o.*,f.*,
  ${STAGES.map(stage => `COALESCE((SELECT n FROM event_groups WHERE stage='${stage}'),0) AS ${stage}_count`).join(',\n  ')}
FROM (SELECT COUNT(*) AS search_count,
    COUNT(CASE WHEN search_state='resolved' AND julianday(resolved_at)<julianday(?4) THEN 1 END) AS fact_search_closed_count,
    MAX(CASE WHEN search_state='resolved' AND julianday(resolved_at)<julianday(?4) THEN resolved_at END) AS fact_search_closed_latest
    FROM selected) s,
  (SELECT COUNT(*) AS candidate_count FROM cohort) k,
  (SELECT COALESCE(SUM(n_rows),0) AS event_count,COALESCE(SUM(oversized),0) AS oversized_count,
    COALESCE(SUM(invalid_data)+SUM(invalid_at),0) AS invalid_count FROM event_groups) e,
  (SELECT COUNT(*) AS offer_rows,COUNT(DISTINCT applicant_id) AS fact_offer_count,MAX(at) AS fact_offer_latest FROM offer_facts) o,
  (SELECT COUNT(*) AS sale_rows,COUNT(DISTINCT applicant_id) AS fact_agreed_count,MAX(at) AS fact_agreed_latest,
    COUNT(DISTINCT CASE WHEN completed_at IS NOT NULL THEN applicant_id END) AS fact_completed_count,
    MAX(completed_at) AS fact_completed_latest FROM sale_facts) f`;

export async function getSearchMilestones(env, {from, to, operation='all', category='all'}) {
  if (!realDate(from) || !realDate(to) || from > to ||
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 >= 90 ||
      !OPERATIONS.includes(operation) || !CATEGORIES.includes(category)) fail(400, 'Invalid measurement filters');
  // Default closed: no measurement SQL runs unless the server is explicitly enabled.
  if (env.SEARCH_MILESTONES_READY !== '1') return {enabled:false,reason:'not_configured'};
  const start = jerseyDayStart(from), cutoff = jerseyDayStart(plusDays(to,1));
  const lower = new Date(Date.parse(start)-86400000).toISOString();
  const upper = new Date(Date.parse(cutoff)+86400000).toISOString();
  const row = await env.DB.prepare(QUERY).bind(lower,upper,start,cutoff,operation,category).first();
  if (!row || row.candidate_count > MAX_SEARCHES || row.event_count > MAX_EVENTS || row.oversized_count > 0 ||
      row.offer_rows > MAX_FACTS || row.sale_rows > MAX_FACTS)
    fail(503, 'Search measurement exceeds its safe reading budget');
  const recorded = source => source && !(operation === 'rent' && BUYING_ONLY.includes(source));
  const verified_business = Object.fromEntries(Object.entries(SOURCES).map(([kind, source]) => [kind, recorded(source)
    ? {count:row[`fact_${kind}_count`], source, latest_at:row[`fact_${kind}_latest`], coverage:'recorded'}
    : {count:null, source:null, latest_at:null, coverage:'not_recorded'}]));
  return {
    enabled:true,
    cohort:{unit:'search_record',count:row.search_count,from,to,operation,category},
    observed_stages:STAGES.map(stage => ({stage,count:row[`${stage}_count`]})),
    verified_business,
    coverage:{measured_from:null,observed_until:cutoff,excluded_invalid:row.invalid_count,
      missing_producers:Object.keys(verified_business).filter(kind => verified_business[kind].count == null),deleted_history_unknown:true},
  };
}
