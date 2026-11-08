import { CRITERIA, asList, hasAnswer, notApplicable, parsePriorities } from '../site/requirements.js';

export function requirementChecks(a, l, original) {
  const p = parsePriorities(a.requirement_priorities);
  if (!p) return original;
  let evidence = {};
  try { evidence = JSON.parse(l.feat_evidence || '{}'); } catch { /* No usable derived evidence. */ }
  const facts = evidence._requirements?.version === 1 ? evidence._requirements : {};
  const checks = original.filter(c => !Object.hasOwn(CRITERIA, c.key) && c.key !== 'outdoor');
  for (const key of Object.keys(CRITERIA)) {
    if (notApplicable(key, a)) continue;
    const active = hasAnswer(key,a) || p.values[key] === 'must' || p.unknown?.includes(key);
    if (!active) continue;
    const priority = p.values[key] ?? 'unknown';
    let c = original.find(c => c.key === key) ?? { key, result:'unknown', evidence:null };
    if (key === 'parking') {
      const f = facts.parking, wanted = a.parking_spaces;
      const known = f && ['exact','minimum'].includes(f.kind) && Number.isInteger(f.value) && f.value >= 0;
      c = { key, result: !known || wanted == null ? 'unknown' : f.value >= wanted ? 'meets'
        : f.kind === 'exact' ? 'fails' : 'unknown', evidence:evidence.parking ?? null };
    } else if (key === 'pets') {
      c = { key, result: facts.pets === 'yes' ? 'meets' : facts.pets === 'no' ? 'fails' : 'unknown', evidence:evidence.pets ?? null };
    } else if (['garden','terrace','balcony'].includes(key)) {
      c = { key, result: facts.outdoor?.[key] === 'yes' ? 'meets' : facts.outdoor?.[key] === 'no' ? 'fails' : 'unknown', evidence:evidence.outdoor ?? null };
    } else if (['children','move_in_date','lease_term_months','near','requirements'].includes(key)) {
      c = { key, result:'unknown', evidence: key === 'children' ? 'Household suitability needs confirmation'
        : 'The team needs to check this requirement' };
    }
    if (p.unknown?.includes(key)) c = { ...c, result:'unknown' };
    // A known household fact is never silently removed by making its acceptance negotiable.
    checks.push({ ...c, priority, reason: priority === 'unknown' ? 'Confirm how important this requirement is'
      : c.result === 'unknown' ? 'Needs confirmation' : c.result === 'fails' ? (priority === 'must' ? 'Must-have not met' : 'Preference not met') : 'Meets the stated requirement' });
  }
  return checks;
}
export function requirementsSummary(checks, pass = true, legacy = false) {
  const incompatible = checks.some(c => c.result === 'fails' && (c.priority === 'must' || c.key === 'pets'));
  const pending = legacy || checks.some(c => c.priority === 'unknown' || (c.priority === 'must' && c.result === 'unknown'));
  const requirements_status = !pass ? 'excluded' : incompatible ? 'alternative' : pending ? 'pending' : 'meets';
  return { requirements_status, requirements_rank: {meets:0,pending:1,alternative:2,excluded:3}[requirements_status] };
}
export function compareRequirements(a,b) {
  const rank = m => m.requirements_rank ?? requirementsSummary(typeof m.checks === 'string' ? JSON.parse(m.checks) : m.checks || [], true,
    !(typeof m.checks === 'string' ? m.checks.includes('"priority"') : m.checks?.some(c => c.priority))).requirements_rank;
  return rank(a)-rank(b) || b.score-a.score || String(a.listing_id ?? a.listing?.id ?? a.id).localeCompare(String(b.listing_id ?? b.listing?.id ?? b.id));
}
