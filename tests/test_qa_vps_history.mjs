import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const suiteUrl=new URL('../docs/qa/vps-runner/history-b.mjs',import.meta.url);
const BUILD='a'.repeat(64),SOURCE='80ad03df7e095750f455aa4aa668573e9aac5db4';
const ORIGIN='https://hamptonjersey-qa.pages.dev';
const run=async(...args)=>(await import(suiteUrl)).runHistoryB(...args);
const row=(id,type,extra={})=>({id,at:'2026-11-01T12:00:00.000Z',actor:'qa-agent@example.test',type,
  revision:null,source:null,changes:[],related:{},evidence:[],details_unavailable:false,...extra});
function fixture(change=()=>{}) {
  const rows=[row(64,'offer.recorded',{related:{offer_id:2}}),row(63,'viewing.requested'),
    row(62,'match.reviewed',{decision:{from:'found',to:'shortlisted',reason:null}}),
    ...Array.from({length:60},(_,i)=>row(61-i,'listing.updated',{revision:61-i,source:'panel',
      changes:[{field:'bedrooms',derived:false,before:3,after:2}]})),row(1,'listing.created',{revision:1,source:'panel'})];
  const sale=[row(66,'sale.milestone',{related:{sale_id:1},milestone:'passing',milestone_state:'planned'}),
    row(65,'listing.created',{revision:1,source:'panel'})];
  const calls=[];
  const client={async request(path,options={}) {
    calls.push({path,...options});
    let response={status:200,data:{}};
    if(path==='/api/qa-app/state')response.data={source_sha:SOURCE,build_id:BUILD,origin:ORIGIN,
      project:'hamptonjersey-qa',guard:'verified',email:'qa-agent@example.test'};
    else if(options.anonymous)response.status=401;
    else if(path.endsWith('/validate'))response.data={valid:true};
    else if(path.includes('cursor=invalid')||path.includes('HE-Q006/history?cursor='))response.status=400;
    else if(path.startsWith('/api/admin/listings/HE-Q001/history'))response.data={listing:{id:'HE-Q001',state:'present'},
      items:structuredClone(path.includes('?')?rows.slice(50):rows.slice(0,50)),next_cursor:path.includes('?')?null:'fixture_cursor'};
    else if(path==='/api/admin/listings/HE-Q006/history')response.data={listing:{id:'HE-Q006',state:'present'},items:structuredClone(sale),next_cursor:null};
    else throw Error('Unexpected offline request');
    change(response,path,options);return response;
  }};
  return {client,calls};
}
test('B traverses the real fixture contract and allows only history validation POSTs',async()=>{
  const f=fixture(),result=await run(f.client,{buildId:BUILD});
  assert.ok(result.checks.length>=10);assert.ok(result.checks.every(check=>check.passed));
  assert.match(result.scope,/revocation/i);
  assert.ok(f.calls.some(c=>c.path.endsWith('/history?cursor=fixture_cursor')));
  assert.ok(f.calls.some(c=>c.path.endsWith('/history/validate')&&c.json.ids.length===64));
  assert.ok(f.calls.every(c=>!c.method||c.method==='GET'||c.method==='POST'&&c.path.endsWith('/history/validate')));
  assert.ok(!JSON.stringify(result).includes('fixture_cursor'));
});
test('B refuses wrong source, build, identity or guard before fixture requests',async()=>{
  for(const [key,value] of [['source_sha','b'.repeat(40)],['build_id','b'.repeat(64)],['email','other@example.test'],['guard','disabled'],['origin','https://example.test']]){
    const f=fixture((r,p)=>{if(p==='/api/qa-app/state')r.data[key]=value;});
    await assert.rejects(run(f.client,{buildId:BUILD}),/QA_CASE_FAILED:history-state/);
    assert.equal(f.calls.length,1);
  }
});
test('B rejects malformed, incomplete or duplicate pagination and bad order',async()=>{
  const changes=[
    r=>{delete r.data.next_cursor;},r=>{r.data.next_cursor=null;},r=>{r.data.items=[];},
    r=>{r.data.items[0].id=r.data.items[1].id;},r=>{r.data.items.reverse();},
    r=>{r.data.listing.id='HE-Q006';},r=>{r.data.items[0].at='broken';},
  ];
  for(const change of changes){const f=fixture((r,p)=>{if(p==='/api/admin/listings/HE-Q001/history')change(r);});
    await assert.rejects(run(f.client,{buildId:BUILD}),/QA_CASE_FAILED:history-/);}
  const duplicate=fixture((r,p)=>{if(p.includes('HE-Q001/history?cursor=fixture_cursor'))r.data.items[0].id=64;});
  await assert.rejects(run(duplicate.client,{buildId:BUILD}),/QA_CASE_FAILED:history-/);
});
test('B rejects free data and unexpected fields at every projection layer',async()=>{
  const changes=[r=>r.data.raw='private',r=>r.data.listing.title='private',r=>r.data.items[0].amount=500000,
    r=>r.data.items[0].related.amount=500000,r=>r.data.items[2].decision.note='private',
    r=>r.data.items[3].changes[0].note='private',r=>r.data.items[3].changes[0].field='description',
    r=>r.data.items[0].evidence=[{note:'private'}],r=>r.data.items[0].actor='private@example.test'];
  for(const change of changes){const f=fixture((r,p)=>{if(p==='/api/admin/listings/HE-Q001/history')change(r);});
    await assert.rejects(run(f.client,{buildId:BUILD}),/QA_CASE_FAILED:history-/);}
});
test('B requires existing related types, scoped sale and Planned milestone projection',async()=>{
  for(const type of ['match.reviewed','viewing.requested','offer.recorded']){
    const f=fixture((r,p)=>{if(p==='/api/admin/listings/HE-Q001/history')r.data.items=r.data.items.filter(i=>i.type!==type);});
    await assert.rejects(run(f.client,{buildId:BUILD}),/QA_CASE_FAILED:history-/);
  }
  for(const change of [r=>{r.data.items[0].milestone_state='completed';},r=>{r.data.items[0].related.sale_id=2;},
    r=>{r.data.items[0].planned_on='2026-11-20';}]){
    const f=fixture((r,p)=>{if(p==='/api/admin/listings/HE-Q006/history')change(r);});
    await assert.rejects(run(f.client,{buildId:BUILD}),/QA_CASE_FAILED:history-/);
  }
  const crossed=fixture((r,p)=>{if(p==='/api/admin/listings/HE-Q001/history')r.data.items[0]=row(64,'sale.milestone',{related:{sale_id:1},milestone:'passing',milestone_state:'planned'});});
  await assert.rejects(run(crossed.client,{buildId:BUILD}),/QA_CASE_FAILED:history-/);
});
test('B fails closed on invalid cursor acceptance, revoked snapshot, anonymous access and raw transport errors',async()=>{
  for(const change of [(r,p)=>{if(p.includes('cursor=invalid'))r.status=200;},
    (r,p)=>{if(p.includes('HE-Q006/history?cursor='))r.status=200;},
    (r,p)=>{if(p.endsWith('/validate'))r.status=409;},(r,p,o)=>{if(o.anonymous)r.status=200;},
    ()=>{throw Error('PRIVATE transport details');}]){
    const f=fixture(change);
    await assert.rejects(run(f.client,{buildId:BUILD}),error=>{
      assert.match(error.message,/^QA_CASE_FAILED:history-/);assert.ok(!error.message.includes('PRIVATE'));
      assert.ok(!JSON.stringify(error.qaReport).includes('PRIVATE'));
      assert.deepEqual(error.qaReport.cleanup,{attempted:false,errors:[]});return true;
    });
  }
});

test('B validates widths before opening any UI page',async()=>{
  const {runHistoryBUI}=await import(suiteUrl);
  await assert.rejects(runHistoryBUI({newPage(){throw Error('page opened');}},{widths:[100]}),/Invalid QA viewport widths/);
});

// Intercept imports only: the driver executes unchanged, with no browser, secrets or Linux filesystem.
async function driver({suite='history-b',input={},uid=1000,gid=1000,mount='tmpfs',directoryMode=0o40700,
  directoryOwner=1000,fileMode=0o100600,fileOwner=1000,collision=false,replaced=false,failSuite=false,closeFailed=false}={}) {
  const driverUrl=new URL('../docs/qa/vps-runner/vps-live.mjs',import.meta.url).href;
  const captures={writes:[],removed:[],selected:[],cookies:[],stdout:''};
  const valid={accessClientId:'synthetic-client-id',accessClientSecret:'synthetic-client-secret',sessionSecret:'b'.repeat(64),runId:'run-offline',buildId:BUILD,...input};
  const fs={stat:async()=>({uid:directoryOwner,mode:directoryMode}),readFile:async()=>`1 0 0:1 / /run/qa rw - ${mount} tmpfs rw`,
    open:async(path,flags,mode)=>{assert.equal(flags,'wx');assert.equal(mode,0o600);if(collision)throw Error('PRIVATE exists');return {
      stat:async()=>({uid:fileOwner,ino:7,dev:2,mode:fileMode}),writeFile:async()=>{},close:async()=>{}};},
    lstat:async()=>({ino:replaced?8:7,dev:2,isSymbolicLink:()=>false}),unlink:async path=>captures.removed.push(path),
    writeFile:async(path,body,opts)=>captures.writes.push({path,report:JSON.parse(body),opts})};
  const close=async()=>{captures.closeCalls=(captures.closeCalls??0)+1;
    if(closeFailed===true||closeFailed===captures.closeCalls)throw Error('PRIVATE close error');};
  const ctx={addCookies:async c=>captures.cookies.push(...c),close};
  const chromium={launch:async opts=>{captures.launch=opts;return {newContext:async()=>ctx,close};}};
  const checks={checks:[{case:'offline',passed:true}]};
  const selected=name=>async()=>{captures.selected.push(name);if(failSuite)throw Error('PRIVATE error');return checks;};
  const {validateInput}=await import('../docs/qa/full-app/publish/runner/input.mjs');
  globalThis.__qaVpsDriver={fs,chromium,signSession:async()=> 'synthetic-cookie',COOKIE:'__Host-hs',validateInput,
    ORIGIN,wireBrowser:async()=>({off_origin_attempts:0,redirects:0,transport_failures:0}),liveClient:()=>({}),
    runApiSmoke:selected('smoke-api'),runUiSmoke:selected('smoke-ui'),runHistoryB:selected('history-api'),runHistoryBUI:selected('history-ui')};
  const names={ 'node:fs/promises':['fs'], 'playwright-core':['chromium'], './auth.mjs':['signSession','COOKIE'],
    './input.mjs':['validateInput'], './transport.mjs':['ORIGIN','wireBrowser','liveClient'],
    './cases.mjs':['runApiSmoke'], './ui-cases.mjs':['runUiSmoke'], './history-b.mjs':['runHistoryB','runHistoryBUI']};
  const hook=registerHooks({resolve(specifier,context,next){
    if(context.parentURL?.startsWith(driverUrl)&&names[specifier]){
      const body=names[specifier].map(n=>`export ${n==='fs'?'default':'const '+n+'='} globalThis.__qaVpsDriver.${n};`).join('\n')+'\n//'+Math.random();
      return {url:'data:text/javascript,'+encodeURIComponent(body),shortCircuit:true};
    }return next(specifier,context);
  }});
  const original={argv:process.argv,stdin:Object.getOwnPropertyDescriptor(process,'stdin'),getuid:process.getuid,getgid:process.getgid,
    write:process.stdout.write,exitCode:process.exitCode};
  try {
    process.argv=['node','vps-live.mjs',suite];process.getuid=()=>uid;process.getgid=()=>gid;
    Object.defineProperty(process,'stdin',{value:{async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(valid));}},configurable:true});
    process.stdout.write=value=>{captures.stdout+=value;return true;};
    await import(driverUrl+'?offline='+Math.random());
    captures.exitCode=process.exitCode;
  } finally {
    hook.deregister();process.argv=original.argv;process.getuid=original.getuid;process.getgid=original.getgid;
    Object.defineProperty(process,'stdin',original.stdin);process.stdout.write=original.write;process.exitCode=original.exitCode;
    delete globalThis.__qaVpsDriver;
  }
  captures.summary=JSON.parse(captures.stdout);return captures;
}
test('VPS driver selects B, preserves proxy/cookie contract and emits a sanitized report with cleanup',async()=>{
  const f=await driver();assert.deepEqual(f.selected,['history-api','history-ui']);assert.equal(f.summary.passed,true);
  assert.equal(f.summary.credentials_removed,true);assert.equal(f.summary.api_checks,1);assert.equal(f.summary.ui_checks,1);
  assert.equal(f.launch.proxy.server,'http://172.30.230.2:3128');assert.equal(f.cookies[0].name,'__Host-hs');
  assert.deepEqual(f.removed,['/run/qa/run-offline.json']);assert.equal(f.writes[0].path,'/results/full-app-run-offline.json');
  assert.equal(f.writes[0].report.suite,'history-b');assert.equal(f.writes[0].opts.mode,0o600);
  assert.ok(!JSON.stringify(f.writes).includes('synthetic-client'));assert.ok(!JSON.stringify(f.writes).includes('synthetic-cookie'));
});
test('VPS driver selects the original smoke API/UI when requested',async()=>{
  const f=await driver({suite:'smoke'});assert.deepEqual(f.selected,['smoke-api','smoke-ui']);assert.equal(f.summary.passed,true);
  assert.equal(f.writes[0].report.suite,'smoke');
});
test('VPS driver rejects malformed input, identity and unsafe secret storage before launch',async()=>{
  for(const options of [{input:{extra:'rejected'}},{suite:'untrusted'},{uid:0},{gid:0},{mount:'ext4'},
    {directoryMode:0o40701},{directoryOwner:0},{fileMode:0o100640},{fileOwner:0},{collision:true}]){
    const f=await driver(options);assert.equal(f.summary.passed,false);assert.equal(f.launch,undefined);assert.equal(f.selected.length,0);
    assert.deepEqual(Object.keys(f.summary),['passed','runId','api_checks','ui_checks','credentials_removed']);
    assert.equal(f.summary.runId,null);assert.equal(f.summary.api_checks,0);assert.equal(f.summary.ui_checks,0);
    if(options.collision)assert.deepEqual(f.removed,[]);
  }
});
test('VPS driver never unlinks a replaced inode and never reports raw errors',async()=>{
  const replaced=await driver({replaced:true});assert.equal(replaced.summary.passed,false);assert.equal(replaced.summary.credentials_removed,false);
  assert.deepEqual(replaced.removed,[]);
  const failed=await driver({failSuite:true});assert.equal(failed.summary.passed,false);assert.equal(failed.summary.credentials_removed,true);
  assert.deepEqual(failed.writes[0].report.network,{off_origin_attempts:0,redirects:0,transport_failures:0});
  assert.ok(!JSON.stringify(failed.writes).includes('PRIVATE'));
});
test('VPS driver marks cleanup unconfirmed if browser teardown fails, while still removing its own secret file',async()=>{
  for(const closeFailed of [true,1,2,3]){
    const failed=await driver({closeFailed});
    assert.equal(failed.summary.passed,false);assert.equal(failed.summary.credentials_removed,false);
    assert.equal(failed.exitCode,1);assert.equal(failed.closeCalls,3);
    assert.deepEqual(failed.removed,['/run/qa/run-offline.json']);
    assert.equal(failed.writes[0].report.passed,false);assert.equal(failed.writes[0].report.credentials_removed,false);
    assert.ok(!JSON.stringify(failed.writes).includes('PRIVATE'));
  }
});
