// Synthetic policy only: inputs have no authoritative producer yet. This
// function never authorizes deletion, including when it returns 'pending'.
function canonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}

export function assessPhotoPurge(input) {
  const { scope, asset, now } = input ?? {};
  const entered = canonicalInstant(scope?.enteredAt);
  const clock = canonicalInstant(now);
  const photoRole = asset?.role === 'photo' ||
    (asset?.role === 'photo_derivative' && asset?.originalRole === 'photo');
  if (entered === null || clock === null || clock < entered ||
      scope?.state !== 'trashed' || scope?.versionConfirmed !== true ||
      !photoRole || asset?.origin !== 'external' || asset?.belongsToScope !== true ||
      asset?.personalData !== false || asset?.referencesComplete !== true || asset?.activeReferences !== false) {
    return 'blocked';
  }
  // The spec says six calendar months in Jersey but does not resolve the
  // local-time gap/fold cases; the older UTC plan conflicts with that spec.
  return 'pending';
}
