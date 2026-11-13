const test=require('node:test');
const assert=require('node:assert/strict');
const {existsSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const React=require('react');

test('withdrawal dialog requires a reason and keeps the note after a conflict',async()=>{
  assert.ok(existsSync('admin/src/WithdrawalDialog.jsx'),'withdrawal dialog is not implemented yet');
  const {createServer}=await import('vite');
  const dom=new JSDOM('<div id="root"></div>',{url:'https://hampton.test/',pretendToBeVisual:true});
  const saved={window:global.window,document:global.document,Event:global.Event,fetch:global.fetch,
    addEventListener:global.addEventListener,removeEventListener:global.removeEventListener,
    IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT};
  global.window=dom.window;global.document=dom.window.document;global.Event=dom.window.Event;
  global.addEventListener=dom.window.addEventListener.bind(dom.window);global.removeEventListener=dom.window.removeEventListener.bind(dom.window);
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const {createRoot}=require('react-dom/client');
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const calls=[];
  global.fetch=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return {ok:false,status:409,json:async()=>({error:'The listing changed. Reload before trying again.'})};
  };
  const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
  let root;
  try{
    const {default:WithdrawalDialog,WithdrawalHistory}=await vite.ssrLoadModule('/admin/src/WithdrawalDialog.jsx');
    root=createRoot(dom.window.document.getElementById('root'));
    await React.act(async()=>{root.render(React.createElement(WithdrawalDialog,{listing:{id:'HE-R001',updated_at:'2026-01-01T00:00:00.000Z'},onClose:()=>{},onSaved:()=>{}}));});
    const form=dom.window.document.querySelector('form');assert.ok(form);
    await React.act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(calls.length,0);
    assert.match(dom.window.document.querySelector('[role="alert"]').textContent,/reason/i);
    assert.equal(dom.window.document.querySelector('select').getAttribute('aria-invalid'),'true');
    const select=dom.window.document.querySelector('select');
    await React.act(async()=>{select.value='other';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    await React.act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(calls.length,0);
    assert.match(dom.window.document.querySelector('[role="alert"]').textContent,/note/i);
    assert.equal(dom.window.document.querySelector('textarea').getAttribute('aria-invalid'),'true');
    const note=dom.window.document.querySelector('textarea');
    const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set;
    await React.act(async()=>{setter.call(note,'Keep this private');note.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
    await React.act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(calls.length,1);
    assert.equal(calls[0].body.reason_code,'other');assert.equal(calls[0].body.note,'Keep this private');
    assert.equal(note.value,'Keep this private');
    assert.match(dom.window.document.querySelector('[role="alert"]').textContent,/changed/i);
    global.fetch=async()=>({ok:true,json:async()=>({current_publication:{published:false,published_at:null},
      metrics:{views:{value:null,since:null}},withdrawal_history:[{id:'fixture-id',withdrawal_id:'fixture-id',revision:1,
        current_revision:1,at:'2026-01-01T00:00:00.000Z',reason_code:'owner_request',actor:'fixture-actor'}],next_cursor:null})});
    await React.act(async()=>{root.render(React.createElement(WithdrawalHistory,{listing:{id:'HE-R001'}}));});
    assert.match(dom.window.document.querySelector('section').textContent,/fixture-actor/);
  }finally{
    if(root)await React.act(async()=>root.unmount());await vite.close();dom.window.close();
    for(const [key,value] of Object.entries(saved))value===undefined?delete global[key]:global[key]=value;
  }
});
