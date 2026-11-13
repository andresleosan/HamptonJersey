const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const React = require('react');

async function withPoll(t, run) {
  const dom = new JSDOM('<div id="root"></div>', {url:'https://hampton.test/'});
  const saved = {window:global.window, document:global.document, IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT};
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let visibility = 'hidden';
  Object.defineProperty(dom.window.document, 'visibilityState', {configurable:true, get:()=>visibility});
  const {createRoot} = require('react-dom/client');
  const {usePoll} = await import('../admin/src/poll.js');
  const calls = [];
  const callback = () => calls.push('poll');
  function Probe({ms}) { usePoll(callback, ms); return null; }
  const root = createRoot(dom.window.document.getElementById('root'));
  t.mock.timers.enable({apis:['setInterval']});
  const render = ms => React.act(async()=>root.render(React.createElement(Probe, {ms})));
  const setVisibility = state => React.act(async()=>{
    visibility = state;
    dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
  });
  const advance = ms => React.act(async()=>t.mock.timers.tick(ms));
  try { await run({calls, render, setVisibility, advance, root}); }
  finally {
    await React.act(async()=>root.unmount());
    dom.window.close();
    for (const [key,value] of Object.entries(saved)) value === undefined ? delete global[key] : global[key] = value;
  }
}

test('poll starts only while visible, resumes immediately and cleans up', async t => {
  await withPoll(t, async ({calls, render, setVisibility, advance, root}) => {
    await render(30000);
    assert.equal(calls.length, 0, 'mounting a hidden tab must not poll');
    await advance(30000);
    assert.equal(calls.length, 0, 'hidden interval must not poll');
    await setVisibility('visible');
    assert.equal(calls.length, 1, 'becoming visible reloads immediately');
    await advance(30000);
    assert.equal(calls.length, 2, 'visible interval reloads');
    await setVisibility('hidden');
    await advance(60000);
    assert.equal(calls.length, 2, 'hidden tab remains paused');
    await setVisibility('visible');
    assert.equal(calls.length, 3, 'returning visible reloads immediately');
    await React.act(async()=>root.unmount());
    await advance(30000);
    await setVisibility('hidden');
    await setVisibility('visible');
    assert.equal(calls.length, 3, 'unmount clears timer and listener');
  });
});

test('null interval pauses polling and removing the pause respects visibility', async t => {
  await withPoll(t, async ({calls, render, setVisibility, advance}) => {
    await render(null);
    await setVisibility('visible');
    await advance(60000);
    assert.equal(calls.length, 0, 'null disables timer and visibility listener');
    await setVisibility('hidden');
    await render(30000);
    assert.equal(calls.length, 0, 'resuming in a hidden tab remains paused');
    await setVisibility('visible');
    assert.equal(calls.length, 1);
    await render(null);
    await advance(30000);
    await setVisibility('hidden');
    await setVisibility('visible');
    assert.equal(calls.length, 1, 'pausing cleans up existing timer and listener');
  });
});

test('an initially visible tab polls immediately and continues on its interval', async t => {
  await withPoll(t, async ({calls, render, setVisibility, advance}) => {
    await setVisibility('visible');
    await render(30000);
    assert.equal(calls.length, 1, 'visible mount is not delayed');
    await advance(30000);
    assert.equal(calls.length, 2);
  });
});
