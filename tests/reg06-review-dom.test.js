const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const React=require('react');
const {createRoot}=require('react-dom/client');

test('Review keeps decisions and Undo coherent, then restarts when a preference changes',async()=>{
  const {createServer}=await import('vite');
  const {makeEnv,seedListing,call,adminCookie,T0}=await import('./server/helpers.mjs');
  const {recomputeForApplicant}=await import('../server/match-store.js');
  const env=makeEnv(),cookie=await adminCookie();
  env.DB.raw.prepare('INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run('Review fixture','review-fixture@example.test',T0,T0,T0);
  env.DB.raw.prepare('INSERT INTO applicants(contact_id,operation,stage,source,budget_max,pets,requirement_priorities,area_answer,parishes_wanted,preferred_parish,created_at,updated_at) VALUES(1,?,?,?,?,?,?,?,?,?,?,?)')
    .run('buy','searching','phone',1000000,'[{"kind":"none"}]',JSON.stringify({version:1,values:{area:'must'},unknown:[]}),
      'selected','["St Helier","Trinity"]','Trinity',T0,T0);
  seedListing(env,{id:'AREA-DOM-1',matchable:1,sale_price:900000,parish:'St Helier'});
  seedListing(env,{id:'AREA-DOM-2',matchable:1,sale_price:900000,parish:'Trinity'});
  await recomputeForApplicant(env,1,'system');
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
  const old={window:global.window,document:global.document,fetch:global.fetch,Event:global.Event,
    IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT};
  global.window=dom.window;global.document=dom.window.document;global.Event=dom.window.Event;global.IS_REACT_ACT_ENVIRONMENT=true;
  const calls=[];
  global.fetch=async(url,options={})=>{
    const result=await call(env,options.method??'GET',String(url).replace(/^\/api/,''),
      {cookie,...(options.body ? {body:JSON.parse(options.body)} : {})});
    calls.push({method:options.method??'GET',status:result.status});
    return {ok:result.status>=200&&result.status<300,status:result.status,json:async()=>result.data};
  };
  const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
  let root;
  const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
  const click=async(label,selector='button')=>{
    const button=[...dom.window.document.querySelectorAll(selector)].find(b=>b.textContent.trim().startsWith(label));
    assert.ok(button,`missing ${label}`);await React.act(async()=>{button.click();await tick();});
  };
  try{
    const {default:Review}=await vite.ssrLoadModule('/admin/src/Review.jsx');
    root=createRoot(dom.window.document.getElementById('root'));
    await React.act(async()=>{root.render(React.createElement(Review));await tick();});
    await React.act(async()=>{await tick();});
    assert.match(dom.window.document.querySelector('.review-who').textContent,/Preferred parishTrinity/);
    await click('Skip','.match-actions button');await click('Undo');
    await click('Shortlist','.match-actions button');await click('Undo');await click('Shortlist','.match-actions button');
    assert.deepEqual(calls.filter(c=>c.method==='PUT').map(c=>c.status),[200,200,200]);
    env.DB.raw.prepare('UPDATE applicants SET preferred_parish=? WHERE id=1').run('St Helier');
    await recomputeForApplicant(env,1,'system');
    await click('Skip','.match-actions button');
    assert.equal(calls.at(-1).status,409);
    assert.match(dom.window.document.querySelector('[role="alert"]').textContent,/changed/i);
    await click('Start again');
    assert.match(dom.window.document.querySelector('.review-who').textContent,/Preferred parishSt Helier/);
  }finally{
    if(root)await React.act(async()=>root.unmount());await vite.close();dom.window.close();
    for(const [k,v] of Object.entries(old))v===undefined?delete global[k]:global[k]=v;
  }
});
