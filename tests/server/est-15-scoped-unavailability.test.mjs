import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveScopedUnavailability } from '../../server/est-15-scoped-unavailability.js';

const scope = { property_id: 'property-1', operation: 'rent', advertiser_id: 'advertiser-1', publication_id: 'publication-1' };
const at = day => `2026-01-${String(day).padStart(2, '0')}T12:00:00.000Z`;
const human = (id, status, day, extra = {}) => ({ id, scope, kind: 'human', status, observed_at: at(day), received_at: at(day), reason: 'Confirmed by advertiser', evidence_ref: `evidence-${id}`, ...extra });
const web = (id, status, day, extra = {}) => ({ id, scope, kind: 'web', status, observed_at: at(day), received_at: at(day), ...extra });
const resolve = (facts, options = {}) => resolveScopedUnavailability(facts, { scope, as_of: at(20), ...options });

test('a human negative with reason and evidence blocks the exact scope', () => {
  assert.deepEqual(resolve([human('h1', 'unavailable', 10)]), { scope, disposition: 'blocked', confirmed_at: at(10), evidence_ref: 'evidence-h1', needs_review: false });
  for (const change of [{reason:''}, {evidence_ref:null}, {kind:'web'}]) assert.throws(() => resolve([human('h1', 'unavailable', 10, change)]));
});

test('older or late web observation never reactivates; newer reappearance only requests review', () => {
  const negative = human('h1', 'unavailable', 10);
  const old = resolve([negative, web('w1', 'visible', 9, {received_at:at(19)})]);
  assert.equal(old.disposition, 'blocked'); assert.equal(old.needs_review, false);
  const newer = resolve([negative, web('w2', 'visible', 11)]);
  assert.equal(newer.disposition, 'blocked'); assert.equal(newer.needs_review, true);
});

test('a web absence or failure never confirms commercial unavailability', () => {
  for (const status of ['not_found', 'source_failed']) assert.equal(resolve([web('w1', status, 10)]).disposition, 'not_confirmed');
});

test('no fact crosses property, operation, advertiser or publication scope', () => {
  for (const changed of [{property_id:'property-2'}, {operation:'sale'}, {advertiser_id:'advertiser-2'}, {publication_id:'publication-2'}]) {
    assert.equal(resolve([human('h1','unavailable',10,{scope:{...scope,...changed}})]).disposition, 'not_confirmed');
  }
});

test('future or unreceived facts do not take effect; malformed, duplicate and incomplete input fails closed', () => {
  assert.equal(resolve([human('h1','unavailable',10,{received_at:at(19)})], {as_of:at(12)}).disposition, 'not_confirmed');
  assert.equal(resolve([human('h1','unavailable',21)]).disposition, 'not_confirmed');
  assert.throws(() => resolve([human('h1','unavailable',10),human('h1','available',11)]));
  assert.throws(() => resolve([human('h1','unavailable',10,{received_at:at(9)})]));
  assert.throws(() => resolve([human('h1','unavailable',10,{scope:{...scope,extra:'x'}})]));
  const sparse = [human('h1','unavailable',10)]; sparse.length = 2; assert.throws(() => resolve(sparse));
});

test('a property or operation negative covers only its descendants', () => {
  const property = {...scope, operation:null, advertiser_id:null, publication_id:null};
  const rental = {...scope, advertiser_id:null, publication_id:null};
  const advertiser = {...scope, publication_id:null};
  for (const broad of [property, rental, advertiser, scope]) {
    assert.equal(resolve([human('h1','unavailable',10,{scope:broad})]).disposition, 'blocked');
  }
  assert.equal(resolve([human('h1','unavailable',10,{scope:rental})], {scope:{...scope, operation:'sale'}}).disposition, 'not_confirmed');
  assert.equal(resolve([human('h1','unavailable',10,{scope})], {scope:rental}).disposition, 'not_confirmed');
  assert.throws(() => resolve([], {scope:{...scope, advertiser_id:null}}));
  assert.throws(() => resolve([], {scope:{...scope, operation:null, publication_id:null}}));
});

test('available is not a reviewed reactivation and tied conflict retains an exclusion', () => {
  const negative = human('h1','unavailable',10);
  for (const positive of [human('h2','available',10), human('h2','available',11)]) {
    for (const facts of [[negative,positive],[positive,negative]]) {
      const result = resolve(facts);
      assert.equal(result.disposition,'blocked');
      assert.equal(result.needs_review,true);
      assert.equal(result.evidence_ref,'evidence-h1');
    }
  }
});

test('accessors, inherited values and hostile proxies cannot change validated facts', () => {
  const flipping = human('h1','unavailable',10);
  Object.defineProperty(flipping, 'status', {enumerable:true, get() { return 'unavailable'; }});
  assert.throws(() => resolve([flipping]));
  const inherited = Object.assign(Object.create({injected:true}),human('h1','unavailable',10));
  assert.throws(() => resolve([inherited]));
  const scopeGetter = {...scope}; Object.defineProperty(scopeGetter,'operation',{enumerable:true,get(){return 'rent';}});
  assert.throws(() => resolve([human('h1','unavailable',10,{scope:scopeGetter})]));
  assert.throws(() => resolve([new Proxy({}, {ownKeys(){throw new Error('hostile');}})]), TypeError);
  const sparse = [human('h1','unavailable',10)]; Object.defineProperty(sparse,'0',{get(){return human('h1','unavailable',10);}});
  assert.throws(() => resolve(sparse));
});
