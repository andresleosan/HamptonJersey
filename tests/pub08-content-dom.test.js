const test=require('node:test');
const assert=require('node:assert/strict');
const {existsSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const React=require('react');

test('content editor presents closed tags and preserves a draft while showing validation',async()=>{
  assert.ok(existsSync('admin/src/ListingContentFields.jsx'),'PUB-08 content editor is not implemented');
  const {createServer}=await import('vite');
  const dom=new JSDOM('<div id="root"></div>',{url:'https://hampton.test/',pretendToBeVisual:true});
  const saved={window:global.window,document:global.document,Event:global.Event,IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT};
  global.window=dom.window;global.document=dom.window.document;global.Event=dom.window.Event;global.IS_REACT_ACT_ENVIRONMENT=true;
  const {createRoot}=require('react-dom/client');
  const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});let root;
  try {
    const {default:Fields}=await vite.ssrLoadModule('/admin/src/ListingContentFields.jsx');
    function Harness(){const [value,setValue]=React.useState({tags:[],video_url:''});return React.createElement(Fields,{value,onChange:setValue,errors:{video_url:'Use a supported video'},busy:false});}
    root=createRoot(dom.window.document.getElementById('root'));
    await React.act(async()=>root.render(React.createElement(Harness)));
    const labels=[...document.querySelectorAll('label')].map(x=>x.textContent.trim());
    assert.ok(labels.includes('Renovated'));assert.ok(labels.includes('Sea view'));assert.ok(labels.includes('Town centre'));
    assert.equal(document.querySelectorAll('input[type=checkbox]').length,3);
    const sea=[...document.querySelectorAll('label')].find(x=>x.textContent.includes('Sea view')).querySelector('input');
    await React.act(async()=>sea.click());assert.equal(sea.checked,true);
    const url=document.querySelector('#f-video_url');assert.ok(url);assert.equal(url.getAttribute('aria-invalid'),'true');
    assert.match(document.querySelector('#e-video_url').textContent,/supported/i);
    assert.equal(document.querySelectorAll('iframe').length,0);
  } finally {
    if(root)await React.act(async()=>root.unmount());await vite.close();dom.window.close();
    for(const [key,value] of Object.entries(saved))value===undefined?delete global[key]:global[key]=value;
  }
});
