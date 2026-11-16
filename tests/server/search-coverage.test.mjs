import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateFullAvailability } from '../../server/search-coverage.js';
import { searchReviewClock } from '../../server/search-review-clock.js';

const scope = () => ({searchId:'s', episodeId:'e', criteriaRevision:1, ruleVersion:'v'});
const candidate = () => {
  const keys={...scope(),candidateKey:'p:rent',candidateRevision:2};
  return {current:{...keys,episodeStatus:'active'}, evaluation:{...keys,classification:'meets',mustsConfirmed:true,essentialsConfirmed:true,caseConditions:'satisfied',legal:'satisfied',excluded:false}, availability:{...keys,status:'confirmed',current:true,evidenceRef:'proof'}, staffDecision:{...keys,status:'pending'}, clientDecision:{...keys,status:'pending'}};
};
const snapshot = () => ({current:{...scope(),episodeStatus:'active'}, candidates:[candidate()]});

test('a coherent complete candidate establishes a provisional option', () => {
  assert.deepEqual(aggregateFullAvailability(snapshot()), {state:'full_available'});
});

test('empty input or negative candidates do not establish absence without a coverage producer', () => {
  const empty=snapshot(); empty.candidates=[];
  assert.deepEqual(aggregateFullAvailability(empty), {state:'unknown'});
  for (const [part,field,value] of [['evaluation','classification','alternative'],['availability','current',false],['staffDecision','status','rejected'],['clientDecision','status','declined']]) {
    const s=snapshot(); s.candidates[0][part][field]=value;
    assert.deepEqual(aggregateFullAvailability(s), {state:'unknown'});
  }
});

test('missing pages, failed reads and untrusted coverage claims cannot establish absence', () => {
  for (const extra of [{pages:[]},{pages:null},{failed:true},{coverage:'complete'},{complete:true,total:0}]) {
    const s={...snapshot(),...extra,candidates:[]};
    assert.deepEqual(aggregateFullAvailability(s), {state:'unknown'});
  }
});

test('inconsistent or malformed snapshots cannot establish an option', () => {
  for (const change of [s=>s.current.episodeId='other',s=>s.current.criteriaRevision++,s=>s.current.episodeStatus='closed',s=>s.candidates[0].availability.current=false,s=>delete s.candidates[0].clientDecision,s=>s.candidates.push({...candidate(),current:{...candidate().current,episodeId:'other'}})]) {
    const s=snapshot(); change(s); assert.deepEqual(aggregateFullAvailability(s), {state:'unknown'});
  }
  for (const s of [null,{},[],{current:null,candidates:[]},{current:snapshot().current,candidates:null}]) assert.deepEqual(aggregateFullAvailability(s), {state:'unknown'});
});

test('accessors and revoked proxies fail closed', () => {
  const s=snapshot(); let calls=0;
  Object.defineProperty(s,'candidates',{get(){calls++;return [candidate()];}});
  assert.deepEqual(aggregateFullAvailability(s), {state:'unknown'}); assert.equal(calls,0);
  const revoked=Proxy.revocable({},{}); revoked.revoke();
  assert.deepEqual(aggregateFullAvailability(revoked.proxy), {state:'unknown'});
  const t=snapshot(); t.candidates.push(revoked.proxy);
  assert.deepEqual(aggregateFullAvailability(t), {state:'unknown'});
});

test('one full option establishes existence alongside unrelated negative or pending candidates in either order', () => {
  for (const mutate of [c=>c.evaluation.classification='pending',c=>c.availability.status='unavailable',c=>c.staffDecision.status='rejected',c=>c.clientDecision.status='declined']) {
    for (const reverse of [false,true]) {
      const s=snapshot(), other=candidate();
      for (const part of Object.values(other)) part.candidateKey='other:rent';
      mutate(other); s.candidates.push(other); if (reverse) s.candidates.reverse();
      assert.deepEqual(aggregateFullAvailability(s), {state:'full_available'});
      s.candidates=[other]; assert.deepEqual(aggregateFullAvailability(s), {state:'unknown'});
    }
  }
});

test('duplicates, inconsistent scope and malformed positive evidence remain unknown in either order', () => {
  for (const change of [c=>{},c=>{for (const part of Object.values(c)) part.candidateKey='other:rent'; c.evaluation.episodeId='old';},c=>{for (const part of Object.values(c)) part.candidateKey='other:rent'; delete c.availability.evidenceRef;}]) {
    for (const reverse of [false,true]) {
      const s=snapshot(), other=candidate(); change(other); s.candidates.push(other);
      if (reverse) s.candidates.reverse();
      assert.deepEqual(aggregateFullAvailability(s), {state:'unknown'});
    }
  }
  const s=snapshot(); delete s.candidates[0].availability.evidenceRef;
  assert.deepEqual(aggregateFullAvailability(s), {state:'unknown'});
});

test('explicit test-only translation holds the clock for full and keeps unknown pending', () => {
  const toClock = result => result.state === 'full_available' ? true : null;
  const clock = input => searchReviewClock({now:'2026-11-13T12:00:00.000Z',fullAvailable:toClock(aggregateFullAvailability(input)),absence:{source:'activation',at:'2026-01-01T00:00:00.000Z'}});
  assert.deepEqual(clock(snapshot()), {state:'held',noFullSince:null});
  const s=snapshot(); s.candidates=[];
  assert.deepEqual(clock(s), {state:'pending',reason:'eligibility_unknown'});
  assert.equal(toClock(aggregateFullAvailability(s)), null);
});

test('certified absence needs a coverage record of the same scope and size; a full option still wins', () => {
  const cover = (s, extra={}) => ({...s, coverage:{...scope(), complete:true, candidates:s.candidates.length, ...extra}});
  const negative = snapshot(); negative.candidates[0].availability.current=false;
  assert.deepEqual(aggregateFullAvailability(cover(negative)), {state:'absent'});
  const empty = snapshot(); empty.candidates=[];
  assert.deepEqual(aggregateFullAvailability(cover(empty)), {state:'absent'});
  assert.deepEqual(aggregateFullAvailability(cover(snapshot())), {state:'full_available'});
  for (const extra of [{complete:false},{candidates:2},{candidates:'1'},{episodeId:'other'},{criteriaRevision:2}])
    assert.deepEqual(aggregateFullAvailability(cover(negative, extra)), {state:'unknown'}, JSON.stringify(extra));
  const partial = cover(negative); delete partial.coverage.complete;
  assert.deepEqual(aggregateFullAvailability(partial), {state:'unknown'});
  const getter = {...negative}; let calls=0;
  Object.defineProperty(getter,'coverage',{enumerable:true,get(){calls++;return {...scope(),complete:true,candidates:1};}});
  assert.deepEqual(aggregateFullAvailability(getter), {state:'unknown'}); assert.equal(calls,0);
  const dup = cover(negative); dup.candidates.push(dup.candidates[0]); dup.coverage.candidates=2;
  assert.deepEqual(aggregateFullAvailability(dup), {state:'unknown'});
});
