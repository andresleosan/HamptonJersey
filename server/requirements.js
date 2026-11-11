import { CRITERIA, asList, hasAnswer, hasHouseholdPets, notApplicable, parsePriorities } from '../site/requirements.js';

export function parseFeatureEvidence(value) {
  try {
    const parsed=JSON.parse(value || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const evidence={};
    for (const key of ['pets','parking','furnished','outdoor','type'])
      if (typeof parsed[key] === 'string') evidence[key]=parsed[key];
    if (parsed._requirements && typeof parsed._requirements === 'object' && !Array.isArray(parsed._requirements))
      evidence._requirements=parsed._requirements;
    return evidence;
  } catch { return {}; }
}

// Only a consistent structured policy can confirm or deny pets; old or conflicting evidence stays unknown.
export function petPolicy(l, evidence = parseFeatureEvidence(l.feat_evidence)) {
  const facts = evidence._requirements;
  const policy = facts?.version === 1 ? facts.pets : null;
  if (!['yes','no'].includes(policy)) return 'unknown';
  if (['yes','no'].includes(l.feat_pets) && l.feat_pets !== policy) return 'unknown';
  return policy;
}

export function requirementChecks(a, l, original) {
  const p = parsePriorities(a.requirement_priorities);
  if (!p) return original;
  const evidence = parseFeatureEvidence(l.feat_evidence);
  const facts = evidence._requirements?.version === 1 ? evidence._requirements : {};
  const checks = original.filter(c => !Object.hasOwn(CRITERIA, c.key) && c.key !== 'outdoor');
  for (const key of Object.keys(CRITERIA)) {
    if (notApplicable(key, a) && !(key === 'area' && asList(a.parishes_excluded).length)) continue;
    // Missing pet details are not the same as a household without pets.
    const missingPets = key === 'pets' && !hasAnswer(key,a);
    const missingArea = key === 'area' && (a.area_answer === 'unknown' || (a.area_answer == null && !hasAnswer(key,a) && p.values[key] === 'must'));
    const excludedAreaUnknown = key === 'area' && l.parish == null && asList(a.parishes_excluded).length > 0;
    const active = missingPets || missingArea || excludedAreaUnknown || hasAnswer(key,a) || p.values[key] === 'must' || p.unknown?.includes(key);
    if (!active) continue;
    const priority = key === 'pets' && hasHouseholdPets(a) ? 'must' : p.values[key] ?? 'unknown';
    let c = original.find(c => c.key === key) ?? { key, result:'unknown', evidence:null };
    if (key === 'parking') {
      const f = facts.parking, wanted = a.parking_spaces;
      const known = f && ['exact','minimum'].includes(f.kind) && Number.isInteger(f.value) && f.value >= 0;
      c = { key, result: !known || wanted == null ? 'unknown' : f.value >= wanted ? 'meets'
        : f.kind === 'exact' ? 'fails' : 'unknown', evidence:evidence.parking ?? null };
    } else if (key === 'pets') {
      const policy = petPolicy(l,evidence);
      c = { key, result: missingPets ? 'unknown' : policy === 'yes' ? 'meets' : policy === 'no' ? 'fails' : 'unknown', evidence:evidence.pets ?? null };
    } else if (['garden','terrace','balcony'].includes(key)) {
      c = { key, result: facts.outdoor?.[key] === 'yes' ? 'meets' : facts.outdoor?.[key] === 'no' ? 'fails' : 'unknown', evidence:evidence.outdoor ?? null };
    } else if (['children','move_in_date','lease_term_months','near','requirements'].includes(key)) {
      c = { key, result:'unknown', evidence: key === 'children' ? 'Household suitability needs confirmation'
        : 'The team needs to check this requirement' };
    }
    if (p.unknown?.includes(key) && !(key === 'pets' && hasHouseholdPets(a))) c = { ...c, result:'unknown' };
    if ((missingArea && (a.area_answer === 'unknown' || priority === 'must')) || excludedAreaUnknown) c = { ...c, confirmation_required:true };
    // A known household fact is never silently removed by making its acceptance negotiable.
    checks.push({ ...c, priority, reason: missingPets ? 'Confirm whether the household has pets'
      : missingArea ? 'Confirm which areas are suitable' : excludedAreaUnknown ? 'Confirm the property is outside excluded areas'
      : priority === 'unknown' ? 'Confirm how important this requirement is'
      : c.result === 'unknown' ? 'Needs confirmation' : c.result === 'fails' ? (priority === 'must' ? 'Must-have not met' : 'Preference not met') : 'Meets the stated requirement' });
  }
  return checks;
}
export function requirementsSummary(checks, pass = true, legacy = false) {
  const incompatible = checks.some(c => c.result === 'fails' && (c.priority === 'must' || c.key === 'pets'));
  const pending = legacy || checks.some(c => c.confirmation_required || c.priority === 'unknown' || ((c.priority === 'must' || c.key === 'pets') && c.result === 'unknown'));
  const requirements_status = !pass ? 'excluded' : incompatible ? 'alternative' : pending ? 'pending' : 'meets';
  return { requirements_status, requirements_rank: {meets:0,pending:1,alternative:2,excluded:3}[requirements_status] };
}
export function areaPreferenceRank(a,l) {
  return a.area_answer === 'selected' && a.preferred_parish && a.preferred_parish === l.parish ? 0 : 1;
}
export function compareRequirements(a,b) {
  const rank = m => m.requirements_rank ?? requirementsSummary(typeof m.checks === 'string' ? JSON.parse(m.checks) : m.checks || [], true,
    !(typeof m.checks === 'string' ? m.checks.includes('"priority"') : m.checks?.some(c => c.priority))).requirements_rank;
  return rank(a)-rank(b) || b.score-a.score || (a.area_preference_rank ?? 1)-(b.area_preference_rank ?? 1)
    || String(a.listing_id ?? a.listing?.id ?? a.id).localeCompare(String(b.listing_id ?? b.listing?.id ?? b.id));
}
