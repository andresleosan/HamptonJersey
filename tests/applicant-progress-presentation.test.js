const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../admin/src/searchProgressPresentation.js');
const now = '2026-11-10T10:05:00.000Z';
const start = '2026-11-10T10:00:00.000Z', end = '2026-11-10T10:01:00.000Z';
const empty = {version:1,scope:'hampton_inventory',lifecycle:'active',state:'unrecorded',coverage_pending:true,
  last_attempt_at:null,attempt_finished_at:null,last_success_at:null,last_success_checked_count:null,last_attempt_current:false,last_success_current:false};
const base = {...empty,state:'succeeded',last_attempt_at:start,attempt_finished_at:end,last_success_at:end,
  last_success_checked_count:0,last_attempt_current:true,last_success_current:true};
const running = {...empty,state:'running',last_attempt_at:'2026-11-10T10:04:00.000Z',last_attempt_current:true};
const failed = {...base,state:'failed',last_attempt_at:'2026-11-10T10:02:00.000Z',attempt_finished_at:'2026-11-10T10:03:00.000Z'};
const counts = {found:0,shortlisted:0,rejected:0};
const invalid = 'Inventory check status cannot be verified.';

test('unrecorded and running never claim that zero results were found', async () => {
  const {presentSearchProgress:p} = await load();
  assert.equal(p(empty,counts,now).message,'No inventory check recorded');
  assert.equal(p(running,counts,now).message,'Checking saved Hampton inventory…');
});

test('only a successful check with valid global counts may describe an empty result', async () => {
  const {presentSearchProgress:p} = await load();
  assert.equal(p(base,counts,now).message,'No matches yet in the saved Hampton inventory.');
  assert.equal(p(base,{...counts,rejected:1},now).message,'No matches left to review.');
  assert.equal(p(base,{...counts,found:1},now).message,'Inventory check completed.');
  for(const bad of [null,{...counts,found:-1},{...counts,rejected:'0'}]) assert.equal(p(base,bad,now).message,'Inventory check completed.');
  assert.equal(p(failed,counts,now).message,'Last inventory check failed. The last successful check is shown below.');
});

test('dates use server time and Jersey time and do not fabricate invalid or future values', async () => {
  const {presentSearchProgress:p} = await load();
  const view=p(base,counts,now);
  assert.equal(view.success.dateTime,end); assert.match(view.success.text,/10\/11\/2026/);
  assert.match(view.success.text,/Jersey time/); assert.match(view.success.text,/4 minutes ago/);
  for(const date of ['2026-11-11T00:00:00.000Z','invalid']) assert.equal(p({...base,last_success_at:date},counts,now).success,null);
  assert.equal(p(base,counts,'invalid').success,null);
  const summer='2026-07-10T10:00:00.000Z';
  assert.match(p({...base,last_attempt_at:summer,attempt_finished_at:summer,last_success_at:summer},counts,now).success.text,/11:00/);
});

test('historical and failed statuses retain context', async () => {
  const {presentSearchProgress:p} = await load();
  assert.equal(p({...base,lifecycle:'resolved',state:'historical',last_success_current:false},counts,now).message,'Search resolved');
  assert.equal(p({...failed,last_success_current:false},counts,now).success.earlierVersion,true);
  assert.equal(p({...failed,last_success_at:null,last_success_checked_count:null,last_success_current:false},counts,now).message,'Last inventory check failed. No successful inventory check has been recorded.');
});

test('contradictory success and unrecorded snapshots fail closed', async () => {
  const {presentSearchProgress:p} = await load();
  for(const progress of [
    {...base,last_success_at:null}, {...base,last_success_current:false}, {...base,last_attempt_current:false},
    {...base,lifecycle:'resolved'}, {...base,attempt_finished_at:start}, {...base,last_attempt_at:end,attempt_finished_at:start},
    {...base,last_success_checked_count:-1}, {...empty,last_attempt_at:start}, {...empty,last_success_current:true}
  ]) assert.equal(p(progress,counts,now).message,invalid,JSON.stringify(progress));
});

test('inconsistent active states and inherited lifecycle names fail closed', async () => {
  const {presentSearchProgress:p} = await load();
  for(const progress of [
    {...running,last_attempt_current:false}, {...running,attempt_finished_at:end}, {...running,lifecycle:'resolved'},
    {...running,state:'interrupted'}, {...running,state:'failed'}, {...failed,attempt_finished_at:start},
    {...failed,last_attempt_current:false}, {...base,state:'needs_recheck'}, {...empty,state:'needs_recheck'},
    {...base,state:'historical',lifecycle:'constructor'}, {...base,state:'historical',lifecycle:'__proto__'}
  ]) assert.equal(p(progress,counts,now).message,invalid,JSON.stringify(progress));
  assert.equal(p({...running,state:'interrupted',last_attempt_at:start},counts,now).message,'A check started, but its completion has not been recorded.');
  assert.equal(p({...base,state:'needs_recheck',last_attempt_current:false},counts,now).message,'The current saved search has not been checked yet.');
});

test('unsupported versions do not expose dates; unverifiable dates are history without version claims', async () => {
  const {presentSearchProgress:p} = await load();
  for(const progress of [{...base,version:2},{...base,scope:'other'}]) {
    const view=p(progress,counts,now); assert.equal(view.message,invalid); assert.equal(view.attempt,null); assert.equal(view.success,null);
  }
  const view=p({...base,state:'unverifiable',last_success_current:false},counts,now);
  assert.equal(view.message,invalid); assert.equal(view.success.earlierVersion,false); assert.equal(view.success.unverified,true);
});

test('stale snapshot retains its status as historical, without live running or relative time', async () => {
  const {presentSearchProgress:p} = await load();
  const view=p(running,counts,now,{stale:true});
  assert.equal(view.message,'Last recorded status');
  assert.doesNotMatch(JSON.stringify(view),/Checking saved|ago|now/);
  assert.equal(view.attempt.dateTime,running.last_attempt_at); assert.match(view.attempt.text,/Jersey time/);
  const previous=p(base,counts,now,{stale:true});
  assert.equal(previous.recordedMessage,'No matches yet in the saved Hampton inventory.');
  assert.doesNotMatch(previous.success.text,/ago/);
});
