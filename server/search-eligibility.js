// Pure provisional BUS-12 contract. The adapter must supply a trusted DTO from
// a transactionally consistent snapshot, validate evidence/currentness, and
// revalidate before any effect. Proxies can impersonate ordinary records.
// false does not establish absence: BUS-17 requires separate complete coverage
// and a tri-state aggregate; incomplete or failed input must remain unknown.
const text = value => typeof value === 'string' && value.trim().length > 0;
const revision = value => Number.isSafeInteger(value) && value >= 0;
const keys = ['searchId', 'candidateKey', 'episodeId', 'criteriaRevision', 'candidateRevision', 'ruleVersion'];

// Read each required own data property once, without invoking accessors.
function snapshot(record, fields) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return null;
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const copy = Object.create(null);
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(record, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    copy[field] = descriptor.value;
  }
  return copy;
}

export function isFullAvailableCandidate(state) {
  try {
    const root = snapshot(state, ['current', 'evaluation', 'availability', 'staffDecision', 'clientDecision']);
    if (!root) return false;
    const current = snapshot(root.current, [...keys, 'episodeStatus']);
    const evaluation = snapshot(root.evaluation, [...keys, 'classification', 'mustsConfirmed', 'essentialsConfirmed', 'caseConditions', 'legal', 'excluded']);
    const availability = snapshot(root.availability, [...keys, 'status', 'current', 'evidenceRef']);
    const staffDecision = snapshot(root.staffDecision, [...keys, 'status']);
    const clientDecision = snapshot(root.clientDecision, [...keys, 'status']);
    if (!current || !text(current.searchId) || !text(current.candidateKey) ||
        !text(current.episodeId) || !revision(current.criteriaRevision) ||
        !revision(current.candidateRevision) || !text(current.ruleVersion) ||
        current.episodeStatus !== 'active') return false;
    if (![evaluation, availability, staffDecision, clientDecision].every(record =>
      record && keys.every(key => record[key] === current[key]))) return false;
    return evaluation.classification === 'meets' && evaluation.mustsConfirmed === true &&
      evaluation.essentialsConfirmed === true && evaluation.caseConditions === 'satisfied' &&
      evaluation.legal === 'satisfied' && evaluation.excluded === false &&
      availability.status === 'confirmed' && availability.current === true &&
      text(availability.evidenceRef) &&
      ['pending', 'approved'].includes(staffDecision.status) &&
      ['pending', 'accepted'].includes(clientDecision.status);
  } catch {
    return false;
  }
}
