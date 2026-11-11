const test = require('node:test');
const assert = require('node:assert/strict');
const {permitsRequest} = require('./production-readonly-e2e.cjs');
const base = 'https://www.hamptonestatesjersey.com';

test('production browser policy permits only the exact anonymous smoke routes', () => {
  for (const path of ['/', '/apply.js', '/requirements.js', '/requirements.css', '/lib.js',
    '/data/team.json', '/api/listings', '/api/config', '/api/tours', '/api/applicants/options']) {
    assert.equal(permitsRequest('GET', base + path), true, path);
    assert.equal(permitsRequest('HEAD', base + path), true, path);
  }
  for (const [method, url] of [
    ['POST', base + '/api/applicants'], ['POST', base + '/api/stats'],
    ['GET', base + '/api/chat'], ['GET', base + '/api/availability'], ['GET', base + '/api/admin/applicants'],
    ['GET', base + '/api/%63hat'], ['GET', base + '/apply.js/other'],
    ['GET', 'https://example.invalid/apply.js'], ['GET', 'not a URL'],
  ]) assert.equal(permitsRequest(method, url), false, `${method} ${url}`);
});

test('production smoke blocks query strings on otherwise allowed routes',()=>{
  for(const method of ['GET','HEAD']) for(const path of ['/','/api/config','/api/applicants/options'])
    assert.equal(permitsRequest(method,base+path+'?draft=example'),false,`${method} ${path}`);
});
