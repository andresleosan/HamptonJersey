// Presentation only: consume a single authorized server snapshot, never infer a check from counts.
const validIso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const countValid = value => Number.isSafeInteger(value) && value >= 0;
const dateFormat = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Jersey', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});

function formatDate(value, serverTime) {
  if (!validIso(value) || !validIso(serverTime) || value > serverTime) return null;
  const minutes = Math.floor((Date.parse(serverTime) - Date.parse(value)) / 60000);
  let relative;
  if (minutes < 1) relative = 'less than a minute ago';
  else if (minutes < 60) relative = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  else if (minutes < 1440) { const hours = Math.floor(minutes / 60); relative = `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`; }
  else { const days = Math.floor(minutes / 1440); relative = `${days} ${days === 1 ? 'day' : 'days'} ago`; }
  return {dateTime:value, text:`${relative} (${dateFormat.format(new Date(value))}, Jersey time)`};
}

export function presentSearchProgress(progress, counts, serverTime, {stale=false}={}) {
  const attempt = formatDate(progress?.last_attempt_at, serverTime);
  const successDate = formatDate(progress?.last_success_at, serverTime);
  const success = successDate ? {...successDate, earlierVersion:progress.last_success_current === false} : null;
  const validContract = progress?.version === 1 && progress.scope === 'hampton_inventory';
  const validCounts = counts && ['found','shortlisted','rejected'].every(key => countValid(counts[key]));
  let message = 'Inventory check status cannot be verified.';
  if (validContract) {
    if (progress.state === 'unsupported') message = 'Commercial matching is not available yet. Review this search manually.';
    else if (progress.state === 'historical') message = ({resolved:'Search resolved', archived:'Archived search', needs_review:'Search needs review'})[progress.lifecycle] || message;
    else if (progress.state === 'unrecorded') message = 'No inventory check recorded';
    else if (progress.state === 'running') message = 'Checking saved Hampton inventory…';
    else if (progress.state === 'interrupted') message = 'A check started, but its completion has not been recorded.';
    else if (progress.state === 'needs_recheck') message = 'The current saved search has not been checked yet.';
    else if (progress.state === 'failed') message = success ? 'Last inventory check failed. The last successful check is shown below.' : 'Last inventory check failed. No successful inventory check has been recorded.';
    else if (progress.state === 'succeeded' && progress.lifecycle === 'active' && progress.last_success_current === true && success && attempt) {
      message = validCounts && counts.found === 0 && counts.shortlisted === 0
        ? counts.rejected ? 'No matches left to review.' : 'No matches yet in the saved Hampton inventory.'
        : 'Inventory check completed.';
    }
  }
  return {message:stale ? 'Last recorded status' : message, attempt, success,
    scope:'Scope: saved Hampton inventory. External sources and availability confirmations are not covered by this check.'};
}
