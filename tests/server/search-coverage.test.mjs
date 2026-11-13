import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateFullAvailability } from '../../server/search-coverage.js';

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

test('a malformed or unresolved second candidate prevents a positive aggregate', () => {
  for (const mutate of [c=>c.evaluation.classification=null,c=>c.availability.status='unknown',c=>c.staffDecision.status='rejected']) {
    const s=snapshot(), second=candidate();
    for (const part of Object.values(second)) part.candidateKey='other:rent';
    mutate(second); s.candidates.push(second);
    assert.deepEqual(aggregateFullAvailability(s), {state:'unknown'});
  }
});
