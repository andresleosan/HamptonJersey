// A read-only projection of a saved search's criteria. It does not evaluate matches or search progress.
import { CRITERIA, RENT_CRITERIA, hasAnswer, notApplicable, parsePriorities } from '../site/requirements.js';

const keys = Object.keys(CRITERIA);
const known = key => Object.hasOwn(CRITERIA, key);
const prioritiesValid = p => p && Array.isArray(p.unknown)
  && Object.keys(p).every(key => ['version', 'values', 'unknown'].includes(key))
  && p.unknown.every(known) && new Set(p.unknown).size === p.unknown.length
  && Object.entries(p.values).every(([key, value]) => known(key) && ['must', 'preferred', 'unknown'].includes(value));
const missing = (key, reason) => ({ key, field: CRITERIA[key][1][0], reason, label: CRITERIA[key][0] });

// REG-12: a commercial search has no priority switches and its matching (BUS-12, server/matching.js) compares only
// what the search states. So the details that matching can compare and the client did not give are the pending ones:
// kind, location, use and the money terms of the operation; a rent needs its period and a floor area its unit.
const COMMERCIAL = { commercial_kind: 'Property or business', commercial_use: 'Intended use', area_unit: 'Area unit',
  commercial_purchase: 'Maximum purchase price', commercial_rent: 'Maximum rent', commercial_rent_period: 'Rent period',
  commercial_premium: 'Maximum business transfer' };
const COMMERCIAL_TERMS = { buy: ['commercial_purchase'], rent: ['commercial_rent'], transfer: ['commercial_premium', 'commercial_rent'] };
function commercialEssentials(a) {
  const terms = COMMERCIAL_TERMS[a.search_operation ?? a.operation];
  if (!terms) return null;
  const blank = key => a[key] == null || a[key] === '';
  const pending = { commercial_kind: blank('commercial_kind'), area: !hasAnswer('area', a), commercial_use: blank('commercial_use'),
    area_unit: (!blank('area_min') || !blank('area_max')) && blank('area_unit'),
    ...Object.fromEntries(terms.map(key => [key, blank(key)])),
    commercial_rent_period: terms.includes('commercial_rent') && !blank('commercial_rent') && blank('commercial_rent_period') };
  return Object.keys(pending).filter(key => pending[key]).map(key => (key === 'area' ? missing(key, 'answer_missing')
    : { key, field: key, reason: 'answer_missing', label: COMMERCIAL[key] }));
}

// null means no projection applies to this search, not that no data needs review.
export function missingSearchEssentials(applicant) {
  if (applicant?.search_category === 'commercial') return commercialEssentials(applicant);
  if (!applicant || applicant.search_category !== 'residential' || !['rent', 'buy'].includes(applicant.operation)) return null;
  const priorities = parsePriorities(applicant.requirement_priorities);
  if (!prioritiesValid(priorities)) return [{ key: 'requirement_priorities', field: 'requirement_priorities',
    reason: 'priority_missing', label: 'Must-have priorities' }];
  const result = [];
  for (const key of keys) {
    if (applicant.operation === 'buy' && RENT_CRITERIA.includes(key)) continue;
    const priority = priorities.values[key], answered = hasAnswer(key, applicant);
    const unknown = priorities.unknown.includes(key), inapplicable = notApplicable(key, applicant);
    // An explicit unknown conflicting with a saved answer is unresolved even for an otherwise optional criterion.
    if (unknown && answered) result.push(missing(key, 'answer_missing'));
    if (priority === 'must' && !answered) result.push(missing(key, 'answer_missing'));
    else if (priority === 'must' && inapplicable && !unknown) result.push(missing(key, 'priority_missing'));
    // Missing priority metadata never turns an explicit unknown answer into a preferred requirement.
    if ((priority === 'unknown' || (unknown && !Object.hasOwn(priorities.values, key))) && (!inapplicable || unknown))
      result.push(missing(key, 'priority_missing'));
  }
  return result;
}
