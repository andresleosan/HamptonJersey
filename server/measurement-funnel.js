import { OPTIONS } from './applicants.js';
import { jerseyDayStart } from './insights.js';
import { plusDays, realDate } from './viewings.js';
import { fail } from './http.js';

const STAGES = OPTIONS.stages.map(([stage]) => stage);
const KINDS = ['viewing_completed', 'offer', 'agreed', 'completed'];
const OPERATIONS = ['all', 'rent', 'buy', 'transfer'];
const CATEGORIES = ['all', 'residential', 'commercial'];
const MAX_SEARCHES = 5000, MAX_EVENTS = 50000, MAX_EVENT_BYTES = 131072;

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

// No producer in this base is approved to establish a search-to-business-event link.
export async function readVerifiedSearchFacts(_env, _scope) {
  return { facts: [], coverage: 'not_integrated' };
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
const QUERY = `WITH cohort AS MATERIALIZED (
  SELECT a.id,a.created_at,a.operation,a.search_operation,a.search_category FROM applicants a INDEXED BY applicants_operation
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
), eligible AS MATERIALIZED (
  SELECT * FROM candidate_events e WHERE e.type IN ('applicant.stage_changed','applicant.updated')
    AND valid_at AND julianday(e.at)>=julianday(e.created_at) AND julianday(e.at)<julianday(?4)
)
SELECT (SELECT COUNT(*) FROM selected) AS search_count,
  (SELECT COUNT(*) FROM cohort) AS candidate_count,
  (SELECT COUNT(*) FROM candidate_events) AS event_count,
  (SELECT COALESCE(SUM(oversized),0) FROM eligible) AS oversized_count,
  (SELECT COALESCE(SUM(invalid_data),0) FROM eligible) +
    (SELECT COUNT(*) FROM candidate_events WHERE type IN ('applicant.stage_changed','applicant.updated')
      AND NOT COALESCE(valid_at,0) AND at>=?3 AND at<?4) AS invalid_count,
  ${STAGES.map(stage => `(SELECT COUNT(DISTINCT applicant_id) FROM eligible
    WHERE stage='${stage}') AS ${stage}_count`).join(',\n  ')}`;

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
  if (!row || row.candidate_count > MAX_SEARCHES || row.event_count > MAX_EVENTS || row.oversized_count > 0)
    fail(503, 'Search measurement exceeds its safe reading budget');
  const verified_business = Object.fromEntries(KINDS.map(kind => [kind,
    {count:null, source:null, coverage:'not_integrated'}]));
  return {
    enabled:true,
    cohort:{unit:'search_record',count:row.search_count,from,to,operation,category},
    observed_stages:STAGES.map(stage => ({stage,count:row[`${stage}_count`]})),
    verified_business,
    coverage:{measured_from:null,observed_until:cutoff,excluded_invalid:row.invalid_count,
      missing_producers:KINDS,deleted_history_unknown:true},
  };
}
