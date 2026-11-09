import test from 'node:test';
import assert from 'node:assert/strict';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
  const tabs=[],sent=[],messages=[],requests=[];let owner=null,clock=0;
  class Channel{constructor(){this.onmessage=null;tabs.push(this);}postMessage(data){messages.push(data);for(const t of tabs)if(t!==this)queueMicrotask(()=>t.onmessage?.({data}));}close(){tabs.splice(tabs.indexOf(this),1);}}
  class Native{static permission='default';static prompts=0;static async requestPermission(){this.prompts++;return this.permission='granted';}constructor(title,options){sent.push({title,options,notification:this});}close(){}}
  const locks={async request(name,options,fn){if(owner)return fn(null);const identity={};owner=identity;try{return await fn(identity);}finally{if(owner===identity)owner=null;}}};
  function tab(){const document=new EventTarget();document.visibilityState='visible';const timers=new Set();
    const pending=[];const env={Notification:Native,BroadcastChannel:Channel,locks,document,now:()=>clock,
      setInterval:fn=>(timers.add(fn),fn),clearInterval:fn=>timers.delete(fn),onOpen:()=>requests.push('open'),onExpired:()=>requests.push('expired'),
      fetch:async(url,options)=>{requests.push(url);return new Promise(resolve=>pending.push({resolve,signal:options.signal}));}};
    const reply=async data=>{assert.ok(pending.length);pending.shift().resolve(Response.json(data));await settle();};
    const visible=async value=>{document.visibilityState=value?'visible':'hidden';document.dispatchEvent(new Event('visibilitychange'));await settle();};
    return {env,pending,reply,visible,tick:async()=>{clock+=30000;for(const fn of timers)fn();await settle();}};
  }return {tab,Native,sent,messages,requests};
}

test('alerts never request permission automatically; unsupported and denied browsers stay off',async()=>{
  const {createBrowserAlerts}=await import('../admin/src/browser-alerts.js');const h=harness(),t=h.tab();
  const c=createBrowserAlerts(t.env);c.start();await settle();assert.equal(h.Native.prompts,0);assert.equal(h.requests.length,0);
  h.Native.permission='denied';await c.enable();assert.equal(h.Native.prompts,0);assert.equal(h.requests.length,0);c.stop();
  const unsupported=createBrowserAlerts({...t.env,locks:null});unsupported.start();await unsupported.enable();assert.equal(h.Native.prompts,0);unsupported.stop();
});

test('global baseline is silent; later metadata produces only generic text and a technical tag',async()=>{
  const {createBrowserAlerts}=await import('../admin/src/browser-alerts.js');const h=harness(),t=h.tab(),c=createBrowserAlerts(t.env);
  c.start();await c.enable();await settle();assert.equal(h.Native.prompts,1);
  await t.reply({alerts:[],cursor:{version:900,id:230},hasMore:false});assert.equal(h.sent.length,0);
  await t.tick();assert.match(h.requests.at(-1),/version=900&id=230/);
  await t.reply({alerts:[{version:901,id:231}],cursor:{version:901,id:231},hasMore:false});
  assert.equal(h.sent.length,1);assert.equal(h.sent[0].title,'Hampton needs your attention');assert.equal(h.sent[0].options.body,'Open Inbox to review a task.');
  assert.equal(h.sent[0].options.tag,'hampton-task:231:901');h.sent[0].notification.onclick();assert.equal(h.requests.at(-1),'open');
  assert.ok(h.messages.every(m=>Object.keys(m).every(k=>['cursor','hello'].includes(k))));c.stop();
});

test('two visible tabs have one leader and handoff continues its composite cursor, including equal-version siblings',async()=>{
  const {createBrowserAlerts}=await import('../admin/src/browser-alerts.js');const h=harness(),a=h.tab(),b=h.tab(),ca=createBrowserAlerts(a.env),cb=createBrowserAlerts(b.env);
  h.Native.permission='granted';ca.start();cb.start();await ca.enable();await cb.enable();await settle();assert.equal(a.pending.length+b.pending.length,1);
  const leader=a.pending.length?a:b,follower=leader===a?b:a;
  await leader.reply({alerts:[],cursor:{version:1000,id:200},hasMore:false});
  await leader.visible(false);await follower.tick();assert.equal(follower.pending.length,1);assert.match(h.requests.at(-1),/version=1000&id=200/);
  await follower.reply({alerts:[{version:1000,id:201}],cursor:{version:1000,id:201},hasMore:true});assert.equal(h.sent.length,1);
  await follower.tick();assert.match(h.requests.at(-1),/version=1000&id=201/);
  await follower.reply({alerts:[{version:1000,id:202}],cursor:{version:1000,id:202},hasMore:false});assert.equal(h.sent.length,2);ca.stop();cb.stop();
});

test('hiding, disabling, session expiry and unmount abort fetch and ignore late urgent results',async()=>{
  const {createBrowserAlerts}=await import('../admin/src/browser-alerts.js');
  for(const action of ['hide','disable','stop','expired']){
    const h=harness(),t=h.tab(),c=createBrowserAlerts(t.env);h.Native.permission='granted';c.start();await c.enable();await settle();
    await t.reply({alerts:[],cursor:{version:1,id:1},hasMore:false});await t.tick();const pending=t.pending.shift();
    if(action==='hide')await t.visible(false);else if(action==='expired'){pending.resolve(new Response(null,{status:401}));await settle();assert.ok(h.requests.includes('expired'));c.stop();continue;}
    else c[action]();assert.equal(pending.signal.aborted,true);
    pending.resolve(Response.json({alerts:[{version:2,id:2}],cursor:{version:2,id:2},hasMore:false}));await settle();assert.equal(h.sent.length,0);c.stop();
  }
});

test('a shared cursor arriving during baseline fetch is consumed before its later watermark',async()=>{
  const {createBrowserAlerts}=await import('../admin/src/browser-alerts.js');const h=harness(),t=h.tab(),c=createBrowserAlerts(t.env);
  h.Native.permission='granted';c.start();await c.enable();await settle();
  const peer=new t.env.BroadcastChannel('hampton:urgent-alert-cursor');peer.postMessage({cursor:{version:100,id:10}});await settle();
  await t.reply({alerts:[],cursor:{version:101,id:11},hasMore:false});assert.equal(h.sent.length,0);
  await t.tick();assert.match(h.requests.at(-1),/version=100&id=10/);
  await t.reply({alerts:[{version:101,id:11}],cursor:{version:101,id:11},hasMore:false});assert.equal(h.sent.length,1);
  peer.close();c.stop();
});
