// Pure, disconnected calculation over caller-supplied declarations. It does not
// verify identity, authorization, evidence, completeness or permit any action.
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const operations = new Set(['sale', 'rent', 'business']);
const scopeKeys = ['property_id', 'operation', 'advertiser_id', 'publication_id'];
const commonKeys = ['id', 'scope', 'kind', 'status', 'observed_at', 'received_at'];

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new TypeError('Invalid declaration');
  }
}
function scopeValue(scope) {
  exactObject(scope, scopeKeys);
  if (!ID.test(scope.property_id) || typeof scope.property_id !== 'string' || !operations.has(scope.operation)
      || !['advertiser_id', 'publication_id'].every(key => scope[key] === null
        || (typeof scope[key] === 'string' && ID.test(scope[key])))) throw new TypeError('Invalid scope');
  return Object.fromEntries(scopeKeys.map(key => [key, scope[key]]));
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) throw new TypeError('Invalid instant');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new TypeError('Invalid instant');
}
function validate(fact) {
  if (!fact || typeof fact !== 'object') throw new TypeError('Invalid fact');
  const human = fact.kind === 'human';
  exactObject(fact, human ? [...commonKeys, 'reason', 'evidence_ref'] : commonKeys);
  const scope = scopeValue(fact.scope);
  if (typeof fact.id !== 'string' || !ID.test(fact.id)) throw new TypeError('Invalid id');
  if (human) {
    if (!['available', 'unavailable'].includes(fact.status) || typeof fact.reason !== 'string'
        || !fact.reason.trim() || fact.reason.length > 500 || typeof fact.evidence_ref !== 'string'
        || !ID.test(fact.evidence_ref)) throw new TypeError('Invalid human confirmation');
  } else if (fact.kind !== 'web' || !['visible', 'modified', 'not_found', 'source_failed'].includes(fact.status)) {
    throw new TypeError('Invalid observation');
  }
  instant(fact.observed_at); instant(fact.received_at);
  if (fact.received_at < fact.observed_at) throw new TypeError('Receipt precedes observation');
  return { ...fact, scope };
}

export function resolveScopedUnavailability(facts, { scope, as_of } = {}) {
  const target = scopeValue(scope);
  instant(as_of);
  if (!Array.isArray(facts) || facts.length > 5000) throw new TypeError('Invalid facts');
  const ids = new Set(), relevant = [];
  for (let index = 0; index < facts.length; index++) {
    if (!Object.hasOwn(facts, index)) throw new TypeError('Incomplete facts');
    const fact = validate(facts[index]);
    if (ids.has(fact.id)) throw new TypeError('Duplicate id');
    ids.add(fact.id);
    if (scopeKeys.every(key => fact.scope[key] === target[key]) && fact.observed_at <= as_of && fact.received_at <= as_of) relevant.push(fact);
  }
  const confirmations = relevant.filter(fact => fact.kind === 'human');
  const base = { scope: target, disposition: 'not_confirmed', confirmed_at: null, evidence_ref: null, needs_review: false };
  if (!confirmations.length) return base;
  const latest = confirmations.reduce((max, fact) => fact.observed_at > max ? fact.observed_at : max, confirmations[0].observed_at);
  const current = confirmations.filter(fact => fact.observed_at === latest);
  if (new Set(current.map(fact => fact.status)).size > 1) return { ...base, disposition: 'review', needs_review: true };
  if (current[0].status !== 'unavailable') return base;
  const evidence = current.map(fact => fact.evidence_ref).sort()[0];
  const needsReview = relevant.some(fact => fact.kind === 'web' && ['visible', 'modified'].includes(fact.status) && fact.observed_at >= latest);
  return { scope: target, disposition: 'blocked', confirmed_at: latest, evidence_ref: evidence, needs_review: needsReview };
}
