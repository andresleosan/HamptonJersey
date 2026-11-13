const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {JSDOM} = require('jsdom');
const load = () => import('../admin/src/SearchProgress.js');
const now='2026-11-10T10:05:00.000Z', start='2026-11-10T10:04:00.000Z';
const progress={version:1,scope:'hampton_inventory',lifecycle:'active',state:'running',last_attempt_at:start,
  attempt_finished_at:null,last_success_at:null,last_success_checked_count:null,last_attempt_current:true,last_success_current:false};
const snapshot={search_progress:progress,match_counts:{found:0,shortlisted:0,rejected:0},server_time:now};

test('full view renders scope, a time element, and one optional live region', async () => {
  const {default:SearchProgress}=await load();
  const html=renderToStaticMarkup(React.createElement(SearchProgress,{snapshot,announce:true}));
  assert.match(html,/Checking saved Hampton inventory/); assert.match(html,/External sources/);
  assert.match(html,/<time dateTime="2026-11-10T10:04:00.000Z"/i); assert.match(html,/Last recorded attempt/);
  assert.equal((html.match(/aria-live="polite"/g)||[]).length,1);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(SearchProgress,{snapshot,compact:true})),/aria-live|External sources/);
});

test('stale and unverified dates remain labelled and include a retry control', async () => {
  const {default:SearchProgress}=await load();
  const broken={...snapshot,search_progress:{...progress,state:'unverifiable'}};
  const html=renderToStaticMarkup(React.createElement(SearchProgress,{snapshot:broken,stale:true,onReload:()=>{}}));
  assert.match(html,/Couldn&#x27;t refresh search status/); assert.match(html,/Last recorded status/);
  assert.match(html,/Inventory check status cannot be verified/); assert.match(html,/Unverified historical date/);
  assert.match(html,/Reload status/); assert.doesNotMatch(html,/minutes? ago|Checking saved/);
});

test('reload action calls the provided read-only retry callback', async () => {
  const {default:SearchProgress}=await load();
  const dom=new JSDOM('<div id="root"></div>',{url:'https://hampton.test/'});
  const saved={window:global.window,document:global.document,IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT};
  global.window=dom.window; global.document=dom.window.document; global.IS_REACT_ACT_ENVIRONMENT=true;
  const {createRoot}=require('react-dom/client'); const root=createRoot(document.getElementById('root')); let calls=0;
  try {
    await React.act(async()=>root.render(React.createElement(SearchProgress,{snapshot,stale:true,onReload:()=>{calls++;}})));
    await React.act(async()=>document.querySelector('button').click()); assert.equal(calls,1);
  } finally {
    await React.act(async()=>root.unmount()); dom.window.close();
    for(const [key,value] of Object.entries(saved)) value===undefined?delete global[key]:global[key]=value;
  }
});
