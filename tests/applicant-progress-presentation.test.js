const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../admin/src/searchProgressPresentation.js');
const now = '2026-11-10T10:02:00.000Z';
const successAt = '2026-11-10T10:00:00.000Z';
const base = {version:1, scope:'hampton_inventory', lifecycle:'active', state:'succeeded', coverage_pending:true,
  last_attempt_at:successAt, last_success_at:successAt, last_success_current:true};
const counts = {found:0, shortlisted:0, rejected:0};

test('unrecorded and running never claim that zero results were found', async () => {
  const {presentSearchProgress} = await load();
  for (const [state, expected] of [['unrecorded','No inventory check recorded'], ['running','Checking saved Hampton inventory…']]) {
    const view = presentSearchProgress({...base,state,last_attempt_at:null,last_success_at:null}, counts, now);
    assert.equal(view.message, expected);
    assert.equal(view.attempt, null); assert.equal(view.success, null);
  }
});

test('only a successful check with valid global counts may describe an empty result', async () => {
  const {presentSearchProgress} = await load();
  assert.equal(presentSearchProgress(base,counts,now).message,'No matches yet in the saved Hampton inventory.');
  assert.equal(presentSearchProgress(base,{...counts,rejected:1},now).message,'No matches left to review.');
  assert.equal(presentSearchProgress(base,{...counts,found:1},now).message,'Inventory check completed.');
  assert.equal(presentSearchProgress(base,null,now).message,'Inventory check completed.');
  assert.equal(presentSearchProgress({...base,state:'failed'},counts,now).message,'Last inventory check failed. The last successful check is shown below.');
});

test('dates use server time, Jersey time and never fabricate invalid or future values', async () => {
  const {presentSearchProgress} = await load();
  const view=presentSearchProgress(base,counts,now);
  assert.equal(view.success.dateTime,successAt); assert.match(view.success.text,/10\/11\/2026/);
  assert.match(view.success.text,/Jersey time/); assert.match(view.success.text,/2 minutes ago/);
  assert.equal(presentSearchProgress({...base,last_success_at:'2026-11-11T00:00:00.000Z'},counts,now).success,null);
  assert.equal(presentSearchProgress({...base,last_success_at:'invalid'},counts,now).success,null);
  assert.equal(presentSearchProgress(base,counts,'invalid').success,null);
  assert.match(presentSearchProgress({...base,last_success_at:'2026-07-10T10:00:00.000Z'},counts,now).success.text,/11:00/);
});

test('historical and failed statuses retain honest context without false current claims', async () => {
  const {presentSearchProgress} = await load();
  assert.equal(presentSearchProgress({...base,lifecycle:'resolved',state:'historical',last_success_current:false},counts,now).message,'Search resolved');
  assert.equal(presentSearchProgress({...base,state:'failed',last_success_current:false},counts,now).success.earlierVersion,true);
  assert.equal(presentSearchProgress({...base,state:'failed',last_success_at:null},counts,now).message,'Last inventory check failed. No successful inventory check has been recorded.');
  assert.equal(presentSearchProgress({...base,state:'running'},counts,now,{stale:true}).message,'Last recorded status');
});

 test('malformed success cannot claim a completed check', async () => {
  const {presentSearchProgress} = await load();
  for (const progress of [{...base,last_success_at:null}, {...base,last_success_current:false}, {...base,lifecycle:'resolved'}, {...base,version:2}]) {
    assert.equal(presentSearchProgress(progress,counts,now).message,'Inventory check status cannot be verified.');
  }
});
