const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
let vite, ResearchDuplicateReview;

test.before(async()=>{
  const {createServer}=await import('vite');
  const react=(await import('@vitejs/plugin-react')).default;
  vite=await createServer({configFile:false,plugins:[react()],server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  ({default:ResearchDuplicateReview}=await vite.ssrLoadModule('/admin/src/ResearchDuplicateReview.jsx'));
});
test.after(async()=>{if(vite)await vite.close();});
const render=props=>new JSDOM(renderToStaticMarkup(React.createElement(ResearchDuplicateReview,props))).window.document;

test('historical candidates link to existing listing IDs and ask for human comparison',()=>{
  const doc=render({review:{source:'historical_research_group',candidates:[
    {listing_id:'HE-R002',operation:'rent',match_conflict:'present'}],unavailable:false,truncated:false}});
  assert.equal(doc.querySelector('a').getAttribute('href'),'#/p/HE-R002');
  assert.match(doc.body.textContent,/historical research/i);
  assert.match(doc.body.textContent,/does not confirm/i);
  assert.match(doc.body.textContent,/different reviews/i);
  assert.equal(doc.querySelectorAll('button').length,0);
});

test('incomplete results and unavailable records are identified without fabricating links',()=>{
  const doc=render({review:{source:'historical_research_group',candidates:[
    {listing_id:'HE-R002',operation:'__proto__',match_conflict:'incomplete'},
    {listing_id:'HE-R003?other',operation:'sale',match_conflict:'not_found'}],unavailable:true,truncated:true}});
  assert.equal(doc.querySelectorAll('a').length,1);
  assert.match(doc.body.textContent,/not complete/i);
  assert.match(doc.body.textContent,/unavailable/i);
  assert.match(doc.body.textContent,/not all/i);
  assert.match(doc.body.textContent,/unknown operation/i);
  assert.doesNotMatch(doc.body.innerHTML,/HE-R003\?other/);
});

test('older or malformed responses do not create unverified links',()=>{
  const legacy=render({legacyIds:['HE-R003']});
  assert.equal(legacy.querySelectorAll('a').length,0);
  assert.match(legacy.body.textContent,/reload/i);
  const wrong=render({review:{source:'unknown',candidates:[{listing_id:'HE-R002'}]}});
  assert.equal(wrong.querySelectorAll('a').length,0);
});

test('a conflict found in an incomplete review set reports both facts',()=>{
  const doc=render({review:{source:'historical_research_group',candidates:[
    {listing_id:'HE-R002',operation:'sale',match_conflict:'present_incomplete'}],unavailable:false,truncated:false}});
  assert.match(doc.body.textContent,/different reviews/i);
  assert.match(doc.body.textContent,/not complete/i);
});
