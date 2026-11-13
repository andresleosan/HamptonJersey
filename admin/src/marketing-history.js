// A missing or malformed consent event is not evidence that there was no
// withdrawal. Callers may show a later opt-in only with an interpretable history.
export function marketingHistory(events, contactId) {
  if (!Array.isArray(events)) return { known: false, lastWithdrawalId: 0 };
  let known = true, lastWithdrawalId = 0;
  for (const event of events) {
    if (event?.entity_type !== 'contact' || String(event.entity_id) !== String(contactId)
      || event.type !== 'contact.consent_changed') continue;
    const before = event.data?.before, after = event.data?.after;
    if (!Number.isSafeInteger(event.id) || event.id < 1 || !before || !after ||
        typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after) ||
        !Object.hasOwn(before, 'marketing_opt_in_at') || !Object.hasOwn(after, 'marketing_opt_in_at')) {
      known = false; continue;
    }
    const recorded = value => value === null || (typeof value === 'string' && value.trim() !== '');
    if (!recorded(before.marketing_opt_in_at) || !recorded(after.marketing_opt_in_at)) { known = false; continue; }
    if (before.marketing_opt_in_at != null && after.marketing_opt_in_at === null)
      lastWithdrawalId = Math.max(lastWithdrawalId, event.id);
  }
  return { known, lastWithdrawalId };
}
