// A synthetic, pure policy calculation only. Its inputs are not yet backed by
// an authoritative producer; an eligible result never authorizes deletion.
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || year > 9998 || month < 1 || month > 12 || day < 1) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay ? { year, month, day } : null;
}

function sixMonthsAfter({ year, month, day }) {
  const targetMonth = month + 6;
  const targetYear = year + (targetMonth > 12 ? 1 : 0);
  const normalizedMonth = ((targetMonth - 1) % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function assessPhotoPurge(input) {
  const { scope, asset, todayJersey } = input ?? {};
  const start = calendarDate(scope?.trashedOnJersey);
  if (!start || !calendarDate(todayJersey) || scope?.state !== 'trashed' || scope?.versionConfirmed !== true ||
      todayJersey <= sixMonthsAfter(start) ||
      !['photo', 'photo_derivative'].includes(asset?.role) || asset?.origin !== 'external' ||
      asset?.belongsToScope !== true || asset?.personalData !== false || asset?.referencesComplete !== true || asset?.activeReferences !== false) {
    return 'blocked';
  }
  return 'eligible';
}
