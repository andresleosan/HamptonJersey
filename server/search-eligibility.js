// Pure provisional BUS-12 contract. This does not load or validate evidence,
// calculate its expiry, or make a snapshot atomic. Producers must establish
// those facts and bind every record to the current search/candidate/episode.
const text = value => typeof value === 'string' && value.trim().length > 0;
const revision = value => Number.isSafeInteger(value) && value >= 0;
const keys = ['searchId', 'candidateKey', 'episodeId', 'criteriaRevision', 'candidateRevision', 'ruleVersion'];

export function isFullAvailableCandidate(state) {
  const current = state?.current;
  if (!current || !text(current.searchId) || !text(current.candidateKey) ||
      !text(current.episodeId) || !revision(current.criteriaRevision) ||
      !revision(current.candidateRevision) || !text(current.ruleVersion) ||
      current.episodeStatus !== 'active') return false;

  const { evaluation, availability, staffDecision, clientDecision } = state;
  if (![evaluation, availability, staffDecision, clientDecision].every(record =>
    record && keys.every(key => record[key] === current[key]))) return false;

  return evaluation.classification === 'meets' && evaluation.mustsConfirmed === true &&
    evaluation.essentialsConfirmed === true && evaluation.caseConditions === 'satisfied' &&
    evaluation.legal === 'satisfied' && evaluation.excluded === false &&
    availability.status === 'confirmed' && availability.current === true &&
    text(availability.evidenceRef) &&
    ['pending', 'approved'].includes(staffDecision.status) &&
    ['pending', 'accepted'].includes(clientDecision.status);
}
