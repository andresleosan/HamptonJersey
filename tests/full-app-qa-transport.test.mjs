import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaUrl,qaHeaders,requireNoRedirect} from '../docs/qa/full-app/publish/runner/transport.mjs';
test('only relative exact-QA HTTPS paths are accepted before credentials are read',()=>{
  assert.equal(qaUrl('/api/me').origin,'https://hamptonjersey-qa.pages.dev');
  for(const path of ['https://outside.example.test/','//outside.example.test/','/\\outside.example.test/','http://hamptonjersey-qa.pages.dev/'])
    assert.throws(()=>qaUrl(path));
  let read=0;const secret={get accessClientId(){read++;return 'unused';}};
  assert.throws(()=>qaHeaders('//outside.example.test/',secret,{runId:'run-unit'}));assert.equal(read,0);
});
test('headers are origin-scoped and replace untrusted copies without global browser headers',()=>{
  const h=qaHeaders('/api/me',{accessClientId:'unit-id-placeholder',accessClientSecret:'unit-value-placeholder'},
    {runId:'run-unit',baseHeaders:{'CF-Access-Client-Secret':'untrusted','accept':'application/json'}});
  assert.equal(h.get('cf-access-client-secret'),'unit-value-placeholder');
  assert.equal(h.get('origin'),'https://hamptonjersey-qa.pages.dev');assert.equal(h.get('x-qa-run'),'run-unit');
  assert.equal(h.get('accept'),'application/json');
});
test('CSRF negative option omits Origin without changing destination or identity',()=>{
  const h=qaHeaders('/api/admin/users',{accessClientId:'unit-id-placeholder',accessClientSecret:'unit-value-placeholder'},
    {runId:'run-unit',csrf:false,baseHeaders:{origin:'https://outside.example.test'}});
  assert.equal(h.has('origin'),false);
});
test('redirects are never automatically followed by authenticated transports',()=>{
  assert.doesNotThrow(()=>requireNoRedirect(200));assert.doesNotThrow(()=>requireNoRedirect(409));
  for(const status of [301,302,303,307,308])assert.throws(()=>requireNoRedirect(status));
});
