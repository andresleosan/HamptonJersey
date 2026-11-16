import { isFullAvailableCandidate } from './search-eligibility.js';

// The tri-state aggregate of one search: full_available, absent or unknown. The adapter (BUS-17,
// server/search-review.js) provides a trusted DTO from one consistent snapshot and revalidates it in the transaction
// before any effect. absent needs a coverage record of the same scope that states the snapshot is complete and how
// many candidates it holds; a false candidate alone may only mean missing data, so without that record, or with any
// malformed, duplicated or inconsistent record, the answer stays unknown.
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
    if (!root || Reflect.ownKeys(input).some(k=>!['current','candidates','coverage'].includes(k))) return unknown();
    const stated=Object.getOwnPropertyDescriptor(input,'coverage');
    const coverage=stated && Object.hasOwn(stated,'value') ? record(stated.value,[...scope,'complete','candidates']) : null;
    if (stated && !coverage) return unknown();
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
      // A positive establishes existence, but every record must still pass
      // the global snapshot/identity checks above, even after a positive.
      if (isFullAvailableCandidate(copy)) full=true;
    }
    if (full) return {state:'full_available'};
    return coverage && coverage.complete===true && coverage.candidates===candidates.length &&
      scope.every(k=>coverage[k]===current[k]) ? {state:'absent'} : unknown();
  } catch { return unknown(); }
}
