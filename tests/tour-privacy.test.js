const {test} = require('node:test');
const assert = require('node:assert/strict');
const {tourProvider, privateEmbedUrl} = require('../site/tour-privacy.js');

test('only approved HTTPS providers can be embedded; Vimeo retains parameters and forces dnt', () => {
  assert.equal(tourProvider('https://my.matterport.com/show/?m=abc'), 'Matterport');
  assert.equal(tourProvider('https://www.youtube-nocookie.com/embed/abc'), 'YouTube');
  const url = new URL(privateEmbedUrl('https://player.vimeo.com/video/123?h=abc&dnt=0'));
  assert.equal(url.searchParams.get('h'), 'abc');
  assert.equal(url.searchParams.get('dnt'), '1');
  for (const value of ['http://player.vimeo.com/video/123', 'https://player.vimeo.com.evil.test/video/123', 'javascript:alert(1)', 'https://user:pass@player.vimeo.com/video/123']) {
    assert.equal(privateEmbedUrl(value), null);
    assert.equal(tourProvider(value), null);
  }
});

test('gate waits for a click, can unload, and offers retry or unload on timeout', () => {
  const {JSDOM} = require('jsdom');
  const {mountTourGate} = require('../site/tour-privacy.js');
  const dom = new JSDOM('<div id="stage"></div>');
  const old = {document:global.document, requestAnimationFrame:global.requestAnimationFrame,
    setTimeout:global.setTimeout, clearTimeout:global.clearTimeout};
  let timeout, loads = 0;
  try {
    global.document = dom.window.document;
    global.requestAnimationFrame = fn => fn();
    global.setTimeout = fn => {timeout=fn; return 1;}; global.clearTimeout = () => {};
    const stage = dom.window.document.querySelector('#stage');
    const cleanup = mountTourGate(stage,{url:'https://player.vimeo.com/video/123?h=abc',title:'Fixture',onLoaded:()=>loads++});
    assert.equal(stage.querySelector('iframe'),null);
    Object.defineProperty(dom.window.navigator, 'onLine', {value:false, configurable:true});
    stage.querySelector('button').click();
    assert.equal(stage.querySelector('iframe'),null); assert.equal(loads,0);
    assert.match(stage.querySelector('[role=alert]').textContent, /offline/);
    Object.defineProperty(dom.window.navigator, 'onLine', {value:true, configurable:true});
    [...stage.querySelectorAll('[role=alert] button')].find(b=>b.textContent === 'Try again').click();
    assert.equal(loads,1); assert.equal(new URL(stage.querySelector('iframe').src).searchParams.get('dnt'),'1');
    timeout(); assert.equal(stage.querySelector('[role=alert]') !== null,true);
    [...stage.querySelectorAll('[role=alert] button')].find(b=>b.textContent === 'Unload tour').click();
    assert.equal(stage.querySelector('iframe'),null); assert.match(stage.textContent,/Load Vimeo tour/);
    cleanup(); assert.equal(stage.children.length,0);
  } finally { Object.assign(global,old); dom.window.close(); }
});
