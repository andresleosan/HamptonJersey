// A read-only projection of saved residential criteria. It does not evaluate matches or search progress.
import { CRITERIA, RENT_CRITERIA, hasAnswer, notApplicable, parsePriorities } from '../site/requirements.js';

const keys = Object.keys(CRITERIA);
const known = key => Object.hasOwn(CRITERIA, key);
const prioritiesValid = p => p && Array.isArray(p.unknown)
  && Object.keys(p).every(key => ['version', 'values', 'unknown'].includes(key))
  && p.unknown.every(known) && new Set(p.unknown).size === p.unknown.length
  && Object.entries(p.values).every(([key, value]) => known(key) && ['must', 'preferred', 'unknown'].includes(value));
const missing = (key, reason) => ({ key, field: CRITERIA[key][1][0], reason, label: CRITERIA[key][0] });

// null means the residential projection is not applicable, not that no data needs review.
export function missingSearchEssentials(applicant) {
  if (!applicant || applicant.search_category !== 'residential' || !['rent', 'buy'].includes(applicant.operation)) return null;
  const priorities = parsePriorities(applicant.requirement_priorities);
  if (!prioritiesValid(priorities)) return [{ key: 'requirement_priorities', field: 'requirement_priorities',
    reason: 'priority_missing', label: 'Must-have priorities' }];
  const result = [];
  for (const key of keys) {
    if (applicant.operation === 'buy' && RENT_CRITERIA.includes(key)) continue;
    const priority = priorities.values[key];
    // A stored unknown remains unresolved even if the accompanying answer is contradictory.
    if (priority === 'must' && priorities.unknown.includes(key)) result.push(missing(key, 'answer_missing'));
    else if (notApplicable(key, applicant)) continue;
    else if (priority === 'must' && !hasAnswer(key, applicant)) result.push(missing(key, 'answer_missing'));
    else if (priority === 'unknown' && hasAnswer(key, applicant)) result.push(missing(key, 'priority_missing'));
  }
  return result;
}
