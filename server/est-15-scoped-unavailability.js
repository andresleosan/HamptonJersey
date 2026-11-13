// Pure and disconnected. No caller, authority, evidence or completeness is verified.
// Neither absence of a block nor a review result permits an action.
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const operations = new Set(['sale', 'rent', 'business']);
const scopeKeys = ['property_id', 'operation', 'advertiser_id', 'publication_id'];
const commonKeys = ['id', 'scope', 'kind', 'status', 'observed_at', 'received_at'];

// Copy each own data descriptor once; never evaluate caller-controlled getters.
function dto(value, keys) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Invalid declaration');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))
      || ownKeys.some(key => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value'))) throw new TypeError('Invalid declaration');
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}
function scopeValue(value) {
  const scope = dto(value, scopeKeys);
  if (typeof scope.property_id !== 'string' || !ID.test(scope.property_id)
      || !(scope.operation === null || operations.has(scope.operation))
      || !['advertiser_id', 'publication_id'].every(key => scope[key] === null || (typeof scope[key] === 'string' && ID.test(scope[key])))
      || (scope.operation === null && (scope.advertiser_id !== null || scope.publication_id !== null))
      || (scope.advertiser_id === null && scope.publication_id !== null)) throw new TypeError('Invalid scope');
  return scope;
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) throw new TypeError('Invalid instant');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new TypeError('Invalid instant');
}
function validate(value) {
  // Snapshot the complete set first, then choose and validate its schema.
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Invalid fact');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some(key => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value'))) throw new TypeError('Invalid fact');
  const fact = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
  const expected = fact.kind === 'human' ? [...commonKeys, 'reason', 'evidence_ref'] : commonKeys;
  if (keys.length !== expected.length || expected.some(key => !Object.hasOwn(fact, key))) throw new TypeError('Invalid fact');
  fact.scope = scopeValue(fact.scope);
  if (typeof fact.id !== 'string' || !ID.test(fact.id)) throw new TypeError('Invalid id');
  if (fact.kind === 'human') {
    if (!['available', 'unavailable'].includes(fact.status) || typeof fact.reason !== 'string' || !fact.reason.trim()
        || fact.reason.length > 500 || typeof fact.evidence_ref !== 'string' || !ID.test(fact.evidence_ref)) throw new TypeError('Invalid human confirmation');
  } else if (fact.kind !== 'web' || !['visible', 'modified', 'not_found', 'source_failed'].includes(fact.status)) throw new TypeError('Invalid observation');
  instant(fact.observed_at); instant(fact.received_at);
  if (fact.received_at < fact.observed_at) throw new TypeError('Receipt precedes observation');
  return fact;
}
function covers(parent, child) {
  return parent.property_id === child.property_id && scopeKeys.slice(1).every(key => parent[key] === null || parent[key] === child[key]);
}
function calculate(input, options) {
  const { scope, as_of } = dto(options, ['scope', 'as_of']);
  const target = scopeValue(scope);
  instant(as_of);
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) throw new TypeError('Invalid facts');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > 5000 || Reflect.ownKeys(descriptors).length !== length + 1) throw new TypeError('Invalid facts');
  const ids = new Set(), relevant = [];
  for (let index = 0; index < length; index++) {
    const descriptor = descriptors[index];
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Incomplete facts');
    const fact = validate(descriptor.value);
    if (ids.has(fact.id)) throw new TypeError('Duplicate id');
    ids.add(fact.id);
    if (fact.observed_at <= as_of && fact.received_at <= as_of && (covers(fact.scope, target) || covers(target, fact.scope))) relevant.push(fact);
  }
  const base = { scope: target, disposition: 'not_confirmed', confirmed_at: null, evidence_ref: null, needs_review: false };
  const negatives = relevant.filter(fact => fact.kind === 'human' && fact.status === 'unavailable' && covers(fact.scope, target));
  if (!negatives.length) return base;
  // Every negative covers target; every relevant fact covers target or is
  // covered by it. In this strict hierarchy, each relevant fact therefore
  // overlaps every negative. The earliest negative detects every unresolved
  // contradiction without comparing all pairs; a later negative cannot clear it.
  let latest = negatives[0], earliest = latest.observed_at;
  for (const negative of negatives) {
    if (negative.observed_at < earliest) earliest = negative.observed_at;
    if (negative.observed_at > latest.observed_at
        || (negative.observed_at === latest.observed_at && negative.id.localeCompare(latest.id) < 0)) latest = negative;
  }
  const needsReview = relevant.some(fact => fact.observed_at >= earliest
    && ((fact.kind === 'web' && ['visible', 'modified'].includes(fact.status))
      || (fact.kind === 'human' && fact.status === 'available')));
  return { scope: target, disposition: 'blocked', confirmed_at: latest.observed_at, evidence_ref: latest.evidence_ref, needs_review: needsReview };
}
export function resolveScopedUnavailability(facts, options) {
  try { return calculate(facts, options); }
  catch { throw new TypeError('Invalid scoped unavailability input'); }
}
