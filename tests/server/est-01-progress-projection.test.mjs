import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSearchProgress} from '../../server/search-progress.js';

const A='2026-11-10T10:00:00.000Z',B='2026-11-10T10:01:00.000Z',C='2026-11-10T10:02:00.000Z';
const applicant={id:1,updated_at:A,match_inputs_revision:2,search_category:'residential',search_state:'active',archived_at:null};
const succeeded={applicant_id:1,attempt_seq:1,attempt_token:'synthetic-token',last_attempt_at:A,last_attempt_updated_at:A,
  last_attempt_inputs_revision:2,attempt_state:'succeeded',attempt_finished_at:B,error_code:null,last_success_at:B,
  last_success_updated_at:A,last_success_inputs_revision:2,last_success_seq:1,last_success_checked_count:0};

test('no row is unrecorded, never an empty market or an invented successful check',()=>{
  const progress=projectSearchProgress(applicant,null,C);
  assert.equal(progress.state,'unrecorded');assert.equal(progress.scope,'hampton_inventory');
  assert.equal(progress.coverage_pending,true);assert.equal(progress.last_attempt_at,null);
  assert.equal(progress.last_success_at,null);assert.equal(progress.last_success_checked_count,null);
});

test('zero local candidates is a recorded success while external coverage remains pending',()=>{
  const progress=projectSearchProgress(applicant,succeeded,C);
  assert.equal(progress.state,'succeeded');assert.equal(progress.last_success_checked_count,0);
  assert.equal(progress.last_success_current,true);assert.equal(progress.coverage_pending,true);
  assert.equal(Object.hasOwn(progress,'attempt_token'),false);
});

test('a current failed attempt preserves the last successful check',()=>{
  const row={...succeeded,attempt_seq:2,last_attempt_at:B,attempt_state:'failed',attempt_finished_at:C,error_code:'check_failed'};
  const progress=projectSearchProgress(applicant,row,C);
  assert.equal(progress.state,'failed');assert.equal(progress.last_attempt_at,B);assert.equal(progress.last_success_at,B);
  assert.equal(progress.last_success_checked_count,0);assert.equal(progress.last_success_current,true);
});

test('a changed input revision makes a previously completed check stale even at the same updated_at',()=>{
  const progress=projectSearchProgress({...applicant,match_inputs_revision:3},succeeded,C);
  assert.equal(progress.state,'needs_recheck');assert.equal(progress.last_attempt_current,false);
  assert.equal(progress.last_success_current,false);
});

test('running becomes interrupted only after the full two-minute boundary',()=>{
  const running={...succeeded,attempt_state:'running',attempt_finished_at:null,last_success_at:null,last_success_updated_at:null,
    last_success_inputs_revision:null,last_success_seq:null,last_success_checked_count:null};
  assert.equal(projectSearchProgress(applicant,running,'2026-11-10T10:02:00.000Z').state,'running');
  assert.equal(projectSearchProgress(applicant,running,'2026-11-10T10:02:00.001Z').state,'interrupted');
});

test('resolved and archived searches remain historical; commercial searches are unsupported',()=>{
  assert.equal(projectSearchProgress({...applicant,search_state:'resolved'},succeeded,C).state,'historical');
  assert.equal(projectSearchProgress({...applicant,archived_at:B},succeeded,C).lifecycle,'archived');
  assert.equal(projectSearchProgress({...applicant,search_category:'commercial'},succeeded,C).state,'unsupported');
  assert.equal(projectSearchProgress({...applicant,search_state:'needs_review'},null,C).state,'unrecorded');
});

test('invalid, future or contradictory timestamps never produce a verified success',()=>{
  for(const row of [
    {...succeeded,last_attempt_at:'2026-02-30T10:00:00.000Z'},
    {...succeeded,last_success_at:'2026-11-11T10:00:00.000Z'},
    {...succeeded,attempt_finished_at:A,last_success_at:B},
    {...succeeded,last_success_checked_count:-1},
    {...succeeded,last_success_updated_at:B},
    {...succeeded,last_success_inputs_revision:3},
    {...succeeded,attempt_state:'running'},
  ]){
    const progress=projectSearchProgress(applicant,row,C);
    assert.equal(progress.state,'unverifiable');assert.equal(progress.coverage_pending,true);
    assert.equal(progress.last_success_current,false);
  }
});

test('unknown search category or lifecycle is unverifiable, not a normal empty search',()=>{
  assert.equal(projectSearchProgress({...applicant,search_category:'unknown'},null,C).state,'unverifiable');
  assert.equal(projectSearchProgress({...applicant,search_state:'unknown'},null,C).state,'unverifiable');
});
