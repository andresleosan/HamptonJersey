// Presentation only: consume a single authorized server snapshot, never infer a check from counts.
const validIso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const countValid = value => Number.isSafeInteger(value) && value >= 0;
const dateFormat = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Jersey', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
const invalidMessage = 'Inventory check status cannot be verified.';
const scope = 'Scope: saved Hampton inventory. External sources and availability confirmations are not covered by this check.';

function formatDate(value, serverTime, historical) {
  if (!validIso(value) || !validIso(serverTime) || value > serverTime) return null;
  const exact = `${dateFormat.format(new Date(value))}, Jersey time`;
  if (historical) return {dateTime:value, text:exact};
  const minutes = Math.floor((Date.parse(serverTime) - Date.parse(value)) / 60000);
  let relative;
  if (minutes < 1) relative = 'less than a minute ago';
  else if (minutes < 60) relative = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  else if (minutes < 1440) { const hours = Math.floor(minutes / 60); relative = `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`; }
  else { const days = Math.floor(minutes / 1440); relative = `${days} ${days === 1 ? 'day' : 'days'} ago`; }
  return {dateTime:value, text:`${relative} (${exact})`};
}

// Validate what the v1 DTO can prove. Inconsistency degrades the whole state; dates may remain as unverified history.
function validState(p, now) {
  if (!validIso(now) || !['active','resolved','archived','needs_review','unsupported'].includes(p.lifecycle)
    || typeof p.last_attempt_current !== 'boolean' || typeof p.last_success_current !== 'boolean') return false;
  const date = x => x === null || (validIso(x) && x <= now);
  if (![p.last_attempt_at,p.attempt_finished_at,p.last_success_at].every(date)) return false;
  const attempt = p.last_attempt_at !== null, finish = p.attempt_finished_at !== null, success = p.last_success_at !== null;
  if ((finish && (!attempt || p.attempt_finished_at < p.last_attempt_at))
    || (success && (!attempt || !countValid(p.last_success_checked_count)))
    || (!success && (p.last_success_checked_count !== null || p.last_success_current))
    || (!attempt && p.last_attempt_current)
    || (success && p.last_success_at > p.last_attempt_at && (!finish || p.last_success_at !== p.attempt_finished_at))) return false;
  const noRecord = !attempt && !finish && !success && !p.last_attempt_current && !p.last_success_current;
  if (p.state === 'unrecorded') return p.lifecycle !== 'unsupported' && noRecord;
  if (p.state === 'unsupported') return p.lifecycle === 'unsupported' && noRecord;
  if (p.state === 'historical') return ['resolved','archived','needs_review'].includes(p.lifecycle) && attempt;
  if (p.lifecycle !== 'active' || !attempt) return false;
  if (p.state === 'needs_recheck') return !p.last_attempt_current;
  if (!p.last_attempt_current) return false;
  if (p.state === 'succeeded') return finish && success && p.last_success_current && p.last_success_at === p.attempt_finished_at;
  if (p.state === 'failed') return finish && (!success || p.last_success_at <= p.last_attempt_at);
  if (p.state === 'running' || p.state === 'interrupted') {
    if (finish || (success && p.last_success_at > p.last_attempt_at)) return false;
    const age = Date.parse(now) - Date.parse(p.last_attempt_at);
    return p.state === 'running' ? age <= 120000 : age > 120000;
  }
  return false;
}

export function presentSearchProgress(progress, counts, serverTime, {stale=false}={}) {
  const validContract = progress?.version === 1 && progress.scope === 'hampton_inventory';
  const verified = validContract && validState(progress, serverTime);
  const history = stale || !verified;
  const attemptDate = validContract ? formatDate(progress.last_attempt_at, serverTime, history) : null;
  const successDate = validContract ? formatDate(progress.last_success_at, serverTime, history) : null;
  const attempt = attemptDate && !verified ? {...attemptDate,unverified:true} : attemptDate;
  const success = successDate ? {...successDate, earlierVersion:verified && progress.last_success_current === false,
    ...(!verified ? {unverified:true} : {})} : null;
  const validCounts = counts && ['found','shortlisted','rejected'].every(key => countValid(counts[key]));
  let message = invalidMessage;
  if (verified) {
    if (progress.state === 'unsupported') message = 'Commercial matching is not available yet. Review this search manually.';
    else if (progress.state === 'historical') {
      if (progress.lifecycle === 'resolved') message = 'Search resolved';
      else if (progress.lifecycle === 'archived') message = 'Archived search';
      else message = 'Search needs review';
    }
    else if (progress.state === 'unrecorded') message = 'No inventory check recorded';
    else if (progress.state === 'running') message = 'Checking saved Hampton inventory…';
    else if (progress.state === 'interrupted') message = 'A check started, but its completion has not been recorded.';
    else if (progress.state === 'needs_recheck') message = 'The current saved search has not been checked yet.';
    else if (progress.state === 'failed') message = success ? 'Last inventory check failed. The last successful check is shown below.' : 'Last inventory check failed. No successful inventory check has been recorded.';
    else if (progress.state === 'succeeded') message = validCounts && counts.found === 0 && counts.shortlisted === 0
      ? counts.rejected ? 'No matches left to review.' : 'No matches yet in the saved Hampton inventory.'
      : 'Inventory check completed.';
  }
  const recordedMessage = stale ? (verified && progress.state === 'running' ? 'A check was in progress when last recorded.' : message) : null;
  return {message:stale ? 'Last recorded status' : message, recordedMessage, attempt, success, scope};
}
