import test from 'node:test';
import assert from 'node:assert/strict';
import { isFullAvailableCandidate } from '../../server/search-eligibility.js';

const scope = () => ({ searchId:'search-1', candidateKey:'property-1:rent', episodeId:'episode-1', criteriaRevision:2, candidateRevision:3, ruleVersion:'rules-1' });
const valid = () => ({
  current: { ...scope(), episodeStatus:'active' },
  evaluation: { ...scope(), classification:'meets', mustsConfirmed:true, essentialsConfirmed:true, caseConditions:'satisfied', legal:'satisfied', excluded:false },
  availability: { ...scope(), status:'confirmed', current:true, evidenceRef:'evidence-1' },
  staffDecision: { ...scope(), status:'pending' },
  clientDecision: { ...scope(), status:'pending' },
});

test('a fully confirmed candidate does not require staff approval or presentation', () => {
  assert.equal(isFullAvailableCandidate(valid()), true);
  const approved = valid(); approved.staffDecision.status = 'approved';
  assert.equal(isFullAvailableCandidate(approved), true);
});

test('pending, failing, excluded or unconfirmed requirements cannot be full', () => {
  for (const [field, value] of [ ['classification','pending'], ['classification','alternative'], ['classification','excluded'], ['mustsConfirmed',false], ['essentialsConfirmed',false], ['caseConditions','pending'], ['legal','pending'], ['legal','excluded'], ['excluded',true] ]) {
    const s=valid(); s.evaluation[field]=value;
    assert.equal(isFullAvailableCandidate(s), false, `${field}=${value}`);
  }
});

test('availability needs positive current confirmation and evidence', () => {
  for (const [field, value] of [['status','unknown'], ['status','unavailable'], ['current',false], ['evidenceRef',''], ['evidenceRef',null]]) {
    const s=valid(); s.availability[field]=value;
    assert.equal(isFullAvailableCandidate(s), false, `${field}=${value}`);
  }
});

test('rejected or declined candidates do not count even with a high score or publication', () => {
  for (const [component, status] of [['staffDecision','rejected'], ['clientDecision','declined']]) {
    const s=valid(); s[component].status=status; s.evaluation.score=100; s.published=true;
    assert.equal(isFullAvailableCandidate(s), false);
  }
});

test('stale episodes, scope, and revisions do not count', () => {
  const stale=valid(); stale.current.episodeStatus='closed';
  assert.equal(isFullAvailableCandidate(stale), false);
  for (const component of ['evaluation','availability','staffDecision','clientDecision']) {
    for (const [key,value] of [['searchId','other'], ['candidateKey','other'], ['episodeId','other'], ['criteriaRevision',1], ['candidateRevision',1], ['ruleVersion','old']]) {
      const s=valid(); s[component][key]=value;
      assert.equal(isFullAvailableCandidate(s), false, `${component}.${key}`);
    }
  }
});

test('incomplete or malformed snapshots fail closed', () => {
  for (const input of [undefined, null, {}, {current:null}, 'invalid']) assert.equal(isFullAvailableCandidate(input), false);
  for (const component of ['current','evaluation','availability','staffDecision','clientDecision']) {
    const s=valid(); delete s[component]; assert.equal(isFullAvailableCandidate(s), false, component);
  }
  for (const [key,value] of [['searchId',' '],['candidateKey',''],['episodeId',null],['criteriaRevision',-1],['candidateRevision',NaN],['ruleVersion','']]) {
    const s=valid(); s.current[key]=value; assert.equal(isFullAvailableCandidate(s), false, key);
  }
  for (const component of ['staffDecision','clientDecision']) {
    const s=valid(); s[component].status='unknown'; assert.equal(isFullAvailableCandidate(s), false);
  }
});

test('a failed preference and low score do not override a complete evaluation', () => {
  const s=valid();
  s.evaluation.checks=[{key:'parking', priority:'preferred', result:'fails'}];
  s.evaluation.score=0;
  assert.equal(isFullAvailableCandidate(s), true);
});

test('inherited records and required properties cannot establish eligibility', () => {
  const inheritedRoot=Object.create(valid());
  assert.equal(isFullAvailableCandidate(inheritedRoot), false);
  for (const part of ['current','evaluation','availability','staffDecision','clientDecision']) {
    const s=valid(); s[part]=Object.create(s[part]);
    assert.equal(isFullAvailableCandidate(s), false, part);
  }
  const s=valid();
  const proto={classification:'meets'};
  s.evaluation=Object.assign(Object.create(proto), s.evaluation);
  delete s.evaluation.classification;
  assert.equal(isFullAvailableCandidate(s), false);
});

test('accessors are never trusted even if they change or throw', () => {
  const changing=valid(); let calls=0;
  Object.defineProperty(changing.current, 'criteriaRevision', {get() { return ++calls === 1 ? 2 : 1; }});
  assert.equal(isFullAvailableCandidate(changing), false);
  assert.equal(calls, 0);
  const throwing=valid();
  Object.defineProperty(throwing, 'availability', {get() { throw new Error('unavailable'); }});
  assert.equal(isFullAvailableCandidate(throwing), false);
});

test('arrays, functions and revoked proxies fail closed without throwing', () => {
  const revoked=Proxy.revocable({}, {}); revoked.revoke();
  for (const invalid of [[], () => {}, revoked.proxy]) {
    assert.equal(isFullAvailableCandidate(invalid), false);
    const s=valid(); s.evaluation=invalid;
    assert.equal(isFullAvailableCandidate(s), false);
  }
  const s=valid();
  s.current=new Proxy(s.current, { getPrototypeOf() { throw new Error('bad proxy'); } });
  assert.equal(isFullAvailableCandidate(s), false);
});
