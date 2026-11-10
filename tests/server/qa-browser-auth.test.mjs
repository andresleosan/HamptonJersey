import test from 'node:test';
import assert from 'node:assert/strict';
import auth from '../../scripts/qa-browser-auth.cjs';
const origin='https://www.hamptonestatesjersey.com',key='synthetic-key-for-tests-0123456789012345';
function fake(url,method='GET',status=200){
  const events=[];
  const route={
    request:()=>({url:()=>url,method:()=>method,headers:()=>({authorization:'Bearer OLD',accept:'application/json'})}),
    abort:async()=>events.push(['abort']),
    fetch:async options=>{events.push(['fetch',options]);return {status:()=>status};},
    fulfill:async options=>events.push(['fulfill',options]),
  };
  return {route,events};
}
test('QA browser identity is attached only to exact same-origin History operations',async()=>{
  for(const [url,method] of [
    [origin+'/api/qa/production-check','GET'],[origin+'/api/qa/history/validate','GET'],
    [origin+'/api/qa/history','DELETE'],[origin+'/api/qa/%68istory','GET'],
    [origin+'/api/qa/history?unexpected=1','GET'],[origin+'/api/qa/history?cursor=x&cursor=y','GET'],
    ['https://evil.example/api/qa/history','GET'],
  ]){
    const {route,events}=fake(url,method);
    await auth.forwardQa(route,{origin,key,authorised:true});
    assert.deepEqual(events,[['abort']],url);
  }
  for(const [url,method] of [[origin+'/api/qa/history','GET'],
    [origin+'/api/qa/history?cursor=abc','GET'],[origin+'/api/qa/history/validate','POST']]){
    const {route,events}=fake(url,method);
    await auth.forwardQa(route,{origin,key,authorised:true});
    assert.equal(events[0][1].headers.authorization,'Bearer '+key);
    assert.equal(events[0][1].maxRedirects,0);
    assert.equal(events[1][0],'fulfill');
  }
});
test('QA browser aborts redirections without forwarding them and drops revoked identity',async()=>{
  const {route,events}=fake(origin+'/api/qa/history','GET',302);
  await auth.forwardQa(route,{origin,key,authorised:true});
  assert.equal(events[0][1].maxRedirects,0);
  assert.deepEqual(events[1],['abort']);
  const revoked=fake(origin+'/api/qa/history');
  await auth.forwardQa(revoked.route,{origin,key,authorised:false});
  assert.equal(Object.hasOwn(revoked.events[0][1].headers,'authorization'),false);
});
test('Cloudflare Access identity is scoped to the same two operations and never follows a redirect',async()=>{
  const access={'cf-access-client-id':'synthetic-id','cf-access-client-secret':'synthetic-secret'};
  const outside=fake('https://evil.example/api/qa/history');
  await auth.forwardQa(outside.route,{origin,key,authorised:true,access});
  assert.deepEqual(outside.events,[['abort']]);
  const redirected=fake(origin+'/api/qa/history','GET',302);
  await auth.forwardQa(redirected.route,{origin,key,authorised:true,access});
  assert.equal(redirected.events[0][1].headers['cf-access-client-id'],access['cf-access-client-id']);
  assert.equal(redirected.events[0][1].headers['cf-access-client-secret'],access['cf-access-client-secret']);
  assert.equal(redirected.events[0][1].maxRedirects,0);
  assert.deepEqual(redirected.events[1],['abort']);
  const local=fake(origin+'/api/qa/history');
  await auth.forwardQa(local.route,{origin,key,authorised:true});
  assert.equal(Object.hasOwn(local.events[0][1].headers,'cf-access-client-id'),false);
});
