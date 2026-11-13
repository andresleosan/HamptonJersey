// Pure BUS-17 planning foundation. No persistence, task creation, or delivery.
// fullAvailable must come from the future BUS-12 isFullAvailableCandidate
// aggregation over a complete, current snapshot; score or approval is not that
// contract. Until that dependency exists there must be no active consumer.
// Absence must be evidenced for this episode: activation with no prior option,
// the recorded loss of the last full option, or an explicit legacy baseline.
// review, when provided, belongs to the same episode; a transactional owner must
// enforce episode identity, uniqueness, and current snapshot revisions.
const ISO = /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SOURCES = new Set(['activation', 'last_full_lost', 'legacy_baseline']);
const HOUR = 3600000;
const DAY = 24 * HOUR;
const pending = reason => ({state:'pending', reason});

function instant(value) {
  if (typeof value !== 'string' || !ISO.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : null;
}

// Treat a Jersey wall clock as a UTC number for comparisons only. Milliseconds
// are retained independently because Intl.DateTimeFormat may omit them.
function localNumber(formatter, ms) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(ms)).map(p => [p.type,p.value]));
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  if (year < 100 || !year || !month || !day) return null;
  const result = Date.UTC(year, month-1, day, Number(parts.hour), Number(parts.minute), Number(parts.second), ((ms%1000)+1000)%1000);
  return Number.isFinite(result) ? result : null;
}

function calendarDeadline(start, days) {
  const formatter = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Jersey', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'});
  const local = localNumber(formatter, start);
  if (local === null) return null;
  const target = local + days*DAY;
  if (!Number.isFinite(target)) return null;
  const offsetAt = ms => {
    const wall = localNumber(formatter, ms);
    return wall === null ? null : wall-ms;
  };
  const samples = [];
  for (let h=-48; h<=48; h+=3) {
    const ms = target+h*HOUR, offset = offsetAt(ms);
    if (offset === null) return null;
    samples.push({ms,offset});
  }
  const changes = samples.slice(1).flatMap((sample,i) => sample.offset === samples[i].offset ? [] : [[samples[i],sample]]);
  if (changes.length > 1) return null;
  const matches = [...new Set(samples.map(s => s.offset))].map(offset => target-offset)
    .filter(ms => localNumber(formatter,ms) === target);
  if (matches.length) return Math.min(...matches); // fold: first occurrence
  if (changes.length !== 1) return null;
  const [before,after] = changes[0];
  let lo=before.ms, hi=after.ms;
  while (hi-lo>1) {
    const mid=lo+Math.floor((hi-lo)/2), offset=offsetAt(mid);
    if (offset===before.offset) lo=mid;
    else if (offset===after.offset) hi=mid;
    else return null;
  }
  const prior=localNumber(formatter,hi-1), next=localNumber(formatter,hi);
  return prior !== null && next !== null && prior < target && next > target ? hi : null;
}

export function searchReviewClock(snapshot) {
  const now=instant(snapshot?.now);
  if (now === null) return pending('invalid_clock');
  if (snapshot.fullAvailable === true) return {state:'held', noFullSince:null};
  if (snapshot.fullAvailable !== false) return pending('eligibility_unknown');
  if (snapshot.absence == null) return pending('absence_baseline_required');
  const start=instant(snapshot.absence.at);
  if (start === null || start>now || !SOURCES.has(snapshot.absence.source)) return pending('invalid_absence');
  let anchor=start, days=21;
  if (snapshot.review != null) {
    if (snapshot.review.status === 'open') return {state:'review_open'};
    if (snapshot.review.status !== 'closed') return pending('invalid_review');
    const closed=instant(snapshot.review.closedAt);
    if (closed === null || closed>now) return pending('invalid_review');
    if (closed<start) return pending('review_before_absence');
    anchor=closed; days=7;
  }
  try {
    const deadline=calendarDeadline(anchor,days);
    if (deadline === null) return pending('timezone_unavailable');
    const dueAt=new Date(deadline).toISOString();
    if (instant(dueAt) === null) return pending('timezone_unavailable');
    return {state:now>=deadline?'due':'waiting',dueAt};
  } catch { return pending('timezone_unavailable'); }
}
