// Synthetic policy only: inputs have no authoritative producer yet. This
// function never authorizes deletion, including when it returns 'pending'.
function canonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}

// Same gap/fold resolution as BUS-17, with a six-calendar-month wall target.
function deadline(start) {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const wall = ms => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    const y = Number(p.year), m = Number(p.month), d = Number(p.day);
    if (y < 100 || y > 9998 || !m || !d) return null;
    return Date.UTC(y, m - 1, d, Number(p.hour), Number(p.minute), Number(p.second), ((ms % 1000) + 1000) % 1000);
  };
  const local = wall(start);
  if (local === null) return null;
  const date = new Date(local), month = date.getUTCMonth() + 6;
  const year = date.getUTCFullYear() + Math.floor(month / 12), normalized = month % 12;
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, normalized + 1, 0)).getUTCDate());
  const target = Date.UTC(year, normalized, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());
  const offsetAt = ms => { const value = wall(ms); return value === null ? null : value - ms; };
  const samples = [];
  for (let h = -48; h <= 48; h += 3) {
    const ms = target + h * 3600000, offset = offsetAt(ms);
    if (offset === null) return null;
    samples.push({ms, offset});
  }
  const changes = samples.slice(1).flatMap((sample, i) => sample.offset === samples[i].offset ? [] : [[samples[i], sample]]);
  if (changes.length > 1) return null;
  const matches = [...new Set(samples.map(s => s.offset))].map(offset => target - offset).filter(ms => wall(ms) === target);
  if (matches.length) return Math.min(...matches);
  if (changes.length !== 1) return null;
  const [before, after] = changes[0];
  let lo = before.ms, hi = after.ms;
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2), offset = offsetAt(mid);
    if (offset === before.offset) lo = mid;
    else if (offset === after.offset) hi = mid;
    else return null;
  }
  const prior = wall(hi - 1), next = wall(hi);
  return prior !== null && next !== null && prior < target && next > target ? hi : null;
}

export function assessPhotoPurge(input) {
  const { scope, asset, now } = input ?? {};
  const entered = canonicalInstant(scope?.enteredAt);
  const clock = canonicalInstant(now);
  const photoRole = asset?.role === 'photo' ||
    (asset?.role === 'photo_derivative' && asset?.originalRole === 'photo');
  if (entered === null || clock === null || clock < entered ||
      scope?.enteredAtReliable !== true || input?.clockReliable !== true ||
      scope?.state !== 'trashed' || scope?.versionConfirmed !== true ||
      !photoRole || asset?.origin !== 'external' || asset?.belongsToScope !== true ||
      asset?.personalData !== false || asset?.referencesComplete !== true || asset?.activeReferences !== false) {
    return 'blocked';
  }
  try {
    const due = deadline(entered);
    return due === null ? 'pending' : clock >= due ? 'eligible' : 'blocked';
  } catch { return 'pending'; }
}
