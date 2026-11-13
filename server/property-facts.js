// EST-16, pure and disconnected: callers must authenticate and verify provenance before supplying facts.
// This calculation does not authorize a booking, contact, capture or change to a property.
const OPERATIONS = new Set(['sale', 'rent', 'business']);
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const SCOPE_KEYS = new Set(['property_id', 'operation', 'advertiser_id', 'publication_id']);
const FACT_KEYS = new Set(['id', 'scope', 'dimension', 'status', 'source_kind', 'observed_at', 'received_at']);
const PUBLICATION_STATES = new Set(['visible', 'modified', 'not_found', 'source_failed']);
const AVAILABILITY_STATES = new Set(['unknown', 'available', 'unavailable']);

function object(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !allowed.has(key))) throw new TypeError(`Invalid ${label}`);
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))
    throw new TypeError('Invalid UTC instant');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new TypeError('Invalid UTC instant');
  return value;
}
function normalizedScope(scope) {
  object(scope, SCOPE_KEYS, 'scope');
  const { property_id, operation, advertiser_id = null, publication_id = null } = scope;
  if (typeof property_id !== 'string' || !ID.test(property_id) || !OPERATIONS.has(operation)
      || (advertiser_id !== null && (typeof advertiser_id !== 'string' || !ID.test(advertiser_id)))
      || (publication_id !== null && (typeof publication_id !== 'string' || !ID.test(publication_id))))
    throw new TypeError('Invalid scope');
  return { property_id, operation, advertiser_id, publication_id };
}
const sameScope = (a, b) => Object.keys(a).every(key => a[key] === b[key]);

function validateFact(fact) {
  object(fact, FACT_KEYS, 'fact');
  const scope = normalizedScope(fact.scope);
  if (typeof fact.id !== 'string' || !ID.test(fact.id)) throw new TypeError('Invalid fact id');
  const publication = fact.dimension === 'publication' && fact.source_kind === 'web'
    && PUBLICATION_STATES.has(fact.status);
  const availability = fact.dimension === 'availability' && fact.source_kind === 'human'
    && AVAILABILITY_STATES.has(fact.status);
  if (!publication && !availability) throw new TypeError('Invalid fact dimension or source');
  instant(fact.observed_at);
  instant(fact.received_at);
  if (fact.received_at < fact.observed_at) throw new TypeError('Receipt precedes observation');
  return { ...fact, scope };
}

// Never break simultaneous contradictory observations by input order.
function latest(facts) {
  if (!facts.length) return { at: null, states: [] };
  const at = facts.reduce((max, fact) => fact.observed_at > max ? fact.observed_at : max, facts[0].observed_at);
  const states = [...new Set(facts.filter(fact => fact.observed_at === at).map(fact => fact.status))].sort();
  return { at, states };
}

export function resolveCommercialFacts(facts, { scope, as_of } = {}) {
  const target = normalizedScope(scope);
  instant(as_of);
  if (!Array.isArray(facts) || facts.length > 5000) throw new TypeError('Invalid facts');
  for (let i = 0; i < facts.length; i++) {
    if (!Object.hasOwn(facts, i)) throw new TypeError('Incomplete facts');
  }
  const ids = new Set();
  const inScope = facts.map(validateFact).filter(fact => {
    if (ids.has(fact.id)) throw new TypeError('Duplicate fact id');
    ids.add(fact.id);
    return sameScope(fact.scope, target) && fact.observed_at <= as_of && fact.received_at <= as_of;
  });
  const confirmations = inScope.filter(fact => fact.dimension === 'availability');
  const observations = inScope.filter(fact => fact.dimension === 'publication');
  const confirmation = latest(confirmations), observation = latest(observations), reasons = [];
  if (confirmation.states.length > 1) reasons.push('conflicting_confirmations');
  if (observation.states.length > 1) reasons.push('conflicting_publication_observations');
  const confirmed = confirmation.states.length === 1 ? confirmation.states[0] : 'unknown';
  const hasConfirmation = confirmed === 'available' || confirmed === 'unavailable';
  // A later change in an advert warrants human review, not an automatic commercial decision.
  const contradiction = hasConfirmation && observations.some(fact => fact.observed_at >= confirmation.at
    && ((confirmed === 'unavailable' && ['visible', 'modified'].includes(fact.status))
      || (confirmed === 'available' && fact.status === 'not_found')));
  if (contradiction) reasons.push('publication_conflicts_with_confirmation');
  return {
    scope: target,
    availability: {
      status: contradiction || confirmation.states.length > 1 ? 'unknown' : confirmed,
      last_confirmed: hasConfirmation ? confirmed : null,
      confirmed_at: hasConfirmation ? confirmation.at : null,
    },
    publication: {
      status: observation.states.length === 1 ? observation.states[0] : 'unknown',
      observed_at: observation.at,
    },
    needs_review: reasons.length > 0,
    reasons,
  };
}
