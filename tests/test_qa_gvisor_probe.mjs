import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sandboxChecks,probe,awaitGate} from '../docs/qa/vps-runner/gvisor-probe/probe.mjs';

const rows=[['Layer 1 Sandbox','Namespace'],['PID namespaces','Yes'],['Network namespaces','Yes'],['Seccomp-BPF sandbox','Yes'],['Seccomp-BPF sandbox supports TSYNC','Yes']];
test('gate requires exact GO token and does not depend on Docker stdin EOF',async()=>{
  await awaitGate((async function*(){yield 'G';yield 'O\n';throw Error('must-not-read-past-token');})());
  for(const input of ['', 'NO\n','GO\nPRIVATE','GO'])await assert.rejects(()=>awaitGate((async function*(){yield input;})()));
});
test('requires namespace isolation and seccomp with TSYNC',()=>{
  assert.ok(Object.values(sandboxChecks(rows)).every(Boolean));
  for(let i=0;i<rows.length;i++){
    assert.ok(Object.values(sandboxChecks(rows.filter((_,n)=>n!==i))).some(x=>!x));
    assert.ok(Object.values(sandboxChecks(rows.map((r,n)=>n===i?[r[0],'No']:r))).some(x=>!x));
  }
});
test('rejects ambiguous duplicates and affirmative substrings',()=>{
  assert.throws(()=>sandboxChecks([...rows,rows[0]]));
  for(const bad of ['No Yes','Yes, disabled','Unknown'])assert.equal(sandboxChecks(rows.map((r,n)=>n===1?[r[0],bad]:r)).pid_namespace,false);
});
function fake(teardownFailure=false){
  let calls=0,closed=0,launchOptions;
  const page={goto:async()=>{},waitForFunction:async()=>{},evaluate:async()=>++calls===1?rows:true,title:async()=> 'QA offline sandbox probe'};
  const context={route:async()=>{},newPage:async()=>page,close:async()=>{closed++;if(teardownFailure)throw Error('PRIVATE');}};
  const browser={newContext:async()=>context,close:async()=>{closed++;}};
  return {chromium:{launch:async options=>{launchOptions=options;return browser;}},state:()=>({closed,launchOptions})};
}
const status=async()=> 'CapEff:\t0000000000000000\nNoNewPrivs:\t1\n';
test('offline driver requires Chromium sandbox and closes context and browser',async()=>{
  const f=fake();const result=await probe(f.chromium,status,()=>1000,()=>1000);
  assert.equal(result.passed,true);assert.equal(result.published_requests,0);assert.equal(result.credentials_loaded,false);
  assert.equal(f.state().launchOptions.chromiumSandbox,true);assert.equal(f.state().closed,2);
});
test('teardown failure cannot report PASS or leak exception text',async()=>{
  const f=fake(true);const result=await probe(f.chromium,status,()=>1000,()=>1000);
  assert.equal(result.passed,false);assert.equal(result.checks.browser_closed,false);assert.equal(f.state().closed,2);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('unsafe credentials boundary stops before browser launch',async()=>{
  const f=fake();const result=await probe(f.chromium,status,()=>0,()=>0);
  assert.equal(result.passed,false);assert.equal(f.state().launchOptions,undefined);
});
