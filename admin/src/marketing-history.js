// A missing or malformed consent event is not evidence that there was no
// withdrawal. Callers may show a later opt-in only with an interpretable history.
function validRecordedAt(value) {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?([Zz]|[+-]\d{2}:?\d{2})?)?$/.exec(value.trim());
  if (!match) return false;
  const [, y, m, d, h, minute, sec, fraction, offset] = match;
  const year=Number(y), month=Number(m), day=Number(d);
  const leap=year%4===0 && (year%100!==0 || year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if (month<1 || month>12 || day<1 || day>days[month-1]) return false;
  if (h !== undefined) {
    const hour=Number(h), minutes=Number(minute), seconds=Number(sec ?? 0);
    if (hour>24 || minutes>59 || seconds>59 ||
        (hour===24 && (minutes!==0 || seconds!==0 || /[1-9]/.test(fraction ?? '')))) return false;
    if (offset && !/^[Zz]$/.test(offset)) {
      const digits=offset.slice(1).replace(':','');
      if (Number(digits.slice(0,2))>23 || Number(digits.slice(2))>59) return false;
    }
  }
  return true;
}

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
    if (!validRecordedAt(before.marketing_opt_in_at) || !validRecordedAt(after.marketing_opt_in_at)) { known = false; continue; }
    if (after.marketing_opt_in_at === null &&
        (before.marketing_opt_in_at !== null || event.data.objection_to_pending === true ||
         event.data.objection_with_incomplete_history === true))
      lastWithdrawalId = Math.max(lastWithdrawalId, event.id);
    else if (before.marketing_opt_in_at === null && after.marketing_opt_in_at === null) known = false;
  }
  return { known, lastWithdrawalId };
}
