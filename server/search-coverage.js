import { isFullAvailableCandidate } from './search-eligibility.js';

// Disconnected, provisional contract: the adapter must provide a trusted DTO
// from one current transactionally consistent snapshot and revalidate it before
// any effect. No producer yet proves complete inventory/evaluation coverage;
// consequently this function never reports certified absence.
const unknown = () => ({state:'unknown'});
const scope = ['searchId','episodeId','criteriaRevision','ruleVersion'];
const keys = [...scope,'candidateKey','candidateRevision'];
const fields = {
  current:[...keys,'episodeStatus'],
  evaluation:[...keys,'classification','mustsConfirmed','essentialsConfirmed','caseConditions','legal','excluded'],
  availability:[...keys,'status','current','evidenceRef'],
  staffDecision:[...keys,'status'],
  clientDecision:[...keys,'status'],
};
function record(value, names) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const proto=Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  const result=Object.create(null);
  for (const name of names) {
    const descriptor=Object.getOwnPropertyDescriptor(value,name);
    if (!descriptor || !Object.hasOwn(descriptor,'value')) return null;
    result[name]=descriptor.value;
  }
  return result;
}
function list(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype) return null;
  const length=Object.getOwnPropertyDescriptor(value,'length')?.value;
  if (!Number.isSafeInteger(length) || length<0) return null;
  const result=[];
  for (let i=0;i<length;i++) {
    const item=Object.getOwnPropertyDescriptor(value,String(i));
    if (!item || !Object.hasOwn(item,'value')) return null;
    result.push(item.value);
  }
  return result;
}
export function aggregateFullAvailability(input) {
  try {
    const root=record(input,['current','candidates']);
    if (!root || Reflect.ownKeys(input).some(k=>k!=='current' && k!=='candidates')) return unknown();
    const current=record(root.current,[...scope,'episodeStatus']);
    if (!current || current.episodeStatus!=='active' ||
      !['searchId','episodeId','ruleVersion'].every(k=>typeof current[k]==='string' && current[k].trim()) ||
      !Number.isSafeInteger(current.criteriaRevision) || current.criteriaRevision<0) return unknown();
    const candidates=list(root.candidates);
    if (!candidates) return unknown();
    let full=false;
    const seen=new Set();
    for (const item of candidates) {
      const parts=record(item,Object.keys(fields));
      if (!parts) return unknown();
      const copy=Object.create(null);
      for (const [part,names] of Object.entries(fields)) {
        copy[part]=record(parts[part],names);
        if (!copy[part]) return unknown();
      }
      const candidate=copy.current;
      if (candidate.episodeStatus!=='active' || !scope.every(k=>candidate[k]===current[k]) ||
          typeof candidate.candidateKey!=='string' || !candidate.candidateKey.trim() ||
          !Number.isSafeInteger(candidate.candidateRevision) || candidate.candidateRevision<0 ||
          seen.has(candidate.candidateKey) ||
          !['evaluation','availability','staffDecision','clientDecision'].every(part=>keys.every(k=>copy[part][k]===candidate[k]))) return unknown();
      seen.add(candidate.candidateKey);
      // The boolean predicate cannot separate an invalid DTO from a proven
      // negative. Be conservative even when another candidate is full.
      if (!isFullAvailableCandidate(copy)) return unknown();
      full=true;
    }
    return full ? {state:'full_available'} : unknown();
  } catch { return unknown(); }
}
