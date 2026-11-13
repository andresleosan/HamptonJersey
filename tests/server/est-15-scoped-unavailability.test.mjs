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

test('a narrower newer negative does not clear a broader negative reappearance review', () => {
  const broad = {...scope, advertiser_id:null, publication_id:null};
  const negative = human('broad','unavailable',1,{scope:broad});
  const observation = web('web','visible',2);
  const narrow = human('narrow','unavailable',3);
  for (const facts of [[negative,observation,narrow], [narrow,observation,negative]]) {
    const result = resolve(facts);
    assert.equal(result.disposition,'blocked'); assert.equal(result.needs_review,true);
  }
});

test('a positive on an overlapping descendant requires review of a broad negative', () => {
  const property = {...scope, operation:null, advertiser_id:null, publication_id:null};
  const negative = human('broad','unavailable',1,{scope:property});
  const positive = human('positive','available',2);
  for (const facts of [[negative,positive],[positive,negative]]) {
    const result = resolve(facts, {scope:property});
    assert.equal(result.disposition,'blocked'); assert.equal(result.needs_review,true);
  }
});

test('contradictions in sibling advertisers or other operations do not affect a specific target', () => {
  const negative = human('negative','unavailable',1);
  for (const other of [{...scope,advertiser_id:'advertiser-2'}, {...scope,operation:'sale'}]) {
    for (const item of [web('web','visible',2,{scope:other}), human('positive','available',2,{scope:other})]) {
      assert.equal(resolve([negative,item]).needs_review,false);
    }
  }
});

test('multiple nested negatives preserve only overlapping contradictions after a negative', () => {
  const property = {...scope,operation:null,advertiser_id:null,publication_id:null};
  const operation = {...scope,advertiser_id:null,publication_id:null};
  const advertiser = {...scope,publication_id:null};
  const negatives = [human('property','unavailable',5,{scope:property}),human('operation','unavailable',8,{scope:operation}),human('advertiser','unavailable',12,{scope:advertiser}),human('publication','unavailable',15)];
  for (const overlap of [property,operation,advertiser,scope]) {
    for (const day of [4,5,10,16]) {
      const contradiction = human('positive','available',day,{scope:overlap});
      for (const facts of [[...negatives,contradiction],[contradiction,...negatives].reverse()]) {
        assert.equal(resolve(facts).needs_review,day >= 5, `day ${day}, scope ${JSON.stringify(overlap)}`);
      }
    }
  }
  for (const unrelated of [{...scope,publication_id:'publication-2'}, {...scope,advertiser_id:'advertiser-2'}, {...scope,operation:'sale'}]) {
    assert.equal(resolve([...negatives,web('other','visible',16,{scope:unrelated})]).needs_review,false);
  }
});

test('bounded 5000 declarations preserve temporal and scope semantics', () => {
  const negativeScope = {...scope,advertiser_id:null,publication_id:null};
  const negatives = Array.from({length:2500},(_,i)=>human(`n${i}`,'unavailable',15,{scope:negativeScope}));
  const old = Array.from({length:2500},(_,i)=>human(`p${i}`,'available',5));
  for (const facts of [[...negatives,...old],[...old,...negatives]]) {
    const result = resolve(facts);
    assert.equal(result.disposition,'blocked'); assert.equal(result.needs_review,false);
  }
});
