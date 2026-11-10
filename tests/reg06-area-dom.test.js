const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const React=require('react');
const {createRoot}=require('react-dom/client');

async function environment(run){
  const dom=new JSDOM('<main id="root"></main>',{url:'http://localhost/',pretendToBeVisual:true});
  const old={window:global.window,document:global.document,sessionStorage:global.sessionStorage,fetch:global.fetch,
    Event:global.Event,jerseyToday:global.jerseyToday,addEventListener:global.addEventListener,location:global.location,
    IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT};
  global.window=dom.window;global.document=dom.window.document;global.sessionStorage=dom.window.sessionStorage;
  global.Event=dom.window.Event;global.IS_REACT_ACT_ENVIRONMENT=true;
  global.jerseyToday=()=>new Date().toISOString().slice(0,10);
  global.addEventListener=dom.window.addEventListener.bind(dom.window);global.location=dom.window.location;
  try{await run(dom.window);}finally{dom.window.close();for(const [k,v] of Object.entries(old))v===undefined?delete global[k]:global[k]=v;}
}
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const click=(doc,name,value)=>{
  const input=[...doc.querySelectorAll(`[name="${name}"]`)].find(el=>el.value===value);
  assert.ok(input,`missing ${name} ${value}`);input.click();return input;
};
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));

test('public wizard requires an area answer and preserves selected data when a change is cancelled',async()=>environment(async w=>{
  const {OPTIONS}=await import('../server/applicants.js');
  global.fetch=async()=>({ok:true,json:async()=>OPTIONS});
  const {renderApply}=await import('../site/apply.js');
  renderApply(w.document.getElementById('root'),{esc:escape,tsKey:'',tsReady:Promise.resolve()});await tick();
  const form=w.document.querySelector('form');assert.ok(form);
  click(w.document,'search_category','residential');click(w.document,'operation','rent');
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.ok(w.document.querySelector('[name="area_answer"][aria-invalid="true"]'));
  click(w.document,'area_answer','selected');click(w.document,'parishes_wanted','St Helier');click(w.document,'parishes_wanted','Trinity');
  click(w.document,'parishes_excluded','St Ouen');
  const preferred=w.document.querySelector('[name="preferred_parish"]');assert.ok(preferred);
  preferred.value='Trinity';preferred.dispatchEvent(new w.Event('change',{bubbles:true}));
  w.confirm=()=>false;click(w.document,'parishes_wanted','St Helier');
  assert.equal(w.document.querySelectorAll('[name="parishes_wanted"]:checked').length,2);
  preferred.value='';preferred.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(preferred.value,'Trinity');
  click(w.document,'area_answer','any');
  assert.equal(w.document.querySelector('[name="area_answer"]:checked').value,'selected');
  assert.equal(w.document.querySelectorAll('[name="parishes_wanted"]:checked').length,2);
  assert.equal(preferred.value,'Trinity');assert.equal(w.document.querySelector('[name="parishes_excluded"]:checked').value,'St Ouen');
  w.confirm=()=>true;click(w.document,'area_answer','unknown');
  assert.equal(w.document.querySelectorAll('[name="parishes_wanted"]:checked').length,0);
  assert.equal(preferred.value,'');assert.equal(w.document.querySelector('[name="parishes_excluded"]:checked').value,'St Ouen');
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(w.document.querySelectorAll('fieldset.step')[2].hidden,false);
  w.document.querySelector('.apply-back').click();
  assert.equal(w.document.querySelector('[name="area_answer"]:checked').value,'unknown');
  assert.equal(w.document.querySelector('[name="parishes_excluded"]:checked').value,'St Ouen');
}));

test('an older public draft returns to the unanswered area step without losing saved areas',async()=>environment(async w=>{
  const {OPTIONS}=await import('../server/applicants.js');global.fetch=async()=>({ok:true,json:async()=>OPTIONS});
  w.sessionStorage.setItem('hampton-apply',JSON.stringify({step:4,a:{operation:'rent',search_category:'residential',parishes_wanted:['Trinity'],parishes_excluded:['St Ouen']}}));
  const {renderApply}=await import('../site/apply.js');renderApply(w.document.getElementById('root'),{esc:escape,tsKey:'',tsReady:Promise.resolve()});await tick();
  assert.equal(w.document.querySelectorAll('fieldset.step')[1].hidden,false);
  assert.equal(w.document.querySelector('[name="parishes_wanted"]:checked').value,'Trinity');
  assert.equal(w.document.querySelector('[name="parishes_excluded"]:checked').value,'St Ouen');
  assert.equal(w.document.querySelector('[name="area_answer"]:checked'),null);
}));

test('new staff searches require an explicit area answer but accept not sure yet',async()=>environment(async w=>{
  const {createServer}=await import('vite');const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
  let root, calls=[];
  global.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:false,status:400,json:async()=>({error:'Other details are required'})};};
  try{
    const {default:NewApplicant}=await vite.ssrLoadModule('/admin/src/NewApplicant.jsx');
    root=createRoot(w.document.getElementById('root'));await React.act(async()=>{root.render(React.createElement(NewApplicant));await tick();});
    const form=w.document.querySelector('form');
    await React.act(async()=>{form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();});
    assert.equal(calls.length,0);assert.ok(w.document.querySelector('[name="a-area_answer"][aria-invalid="true"]'));
    await React.act(async()=>{click(w.document,'a-area_answer','unknown');await tick();});
    await React.act(async()=>{form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();});
    assert.equal(calls.length,1);assert.equal(calls[0].body.area_answer,'unknown');
  }finally{if(root)await React.act(async()=>root.unmount());await vite.close();}
}));

test('duplicate area copy is grouped, confirms removal and preserves exclusions',async()=>{
  const {areaCopy}=await import('../admin/src/area-copy.js');
  const current={area_answer:'selected',parishes_wanted:['St Helier','Trinity'],preferred_parish:'Trinity',parishes_excluded:['St Ouen']};
  const before=structuredClone(current),sent={area_answer:'unknown',parishes_excluded:['St Helier']};
  assert.deepEqual(areaCopy(current,sent,()=>false),{cancelled:true});assert.deepEqual(current,before);
  const accepted=areaCopy(current,sent,()=>true);
  assert.deepEqual({...current,...accepted.patch},{...before,area_answer:'unknown',parishes_wanted:[],preferred_parish:'',parishes_excluded:['St Ouen','St Helier']});
  assert.match(areaCopy(current,{area_answer:'selected',parishes_wanted:['St Ouen']},()=>true).error,/excluded/);
  assert.deepEqual(areaCopy(current,{parishes_wanted:['St Helier']},()=>true).patch,
    {area_answer:'',parishes_wanted:['St Helier'],preferred_parish:''});
  const extra=areaCopy(current,{area_answer:'unknown',parishes_excluded:['St Brelade']},()=>true);
  assert.deepEqual(extra.patch.parishes_excluded,['St Ouen','St Brelade']);
  assert.match(areaCopy(current,{parishes_excluded:['Trinity']},()=>true).error,/excluded/);
});

test('duplicate review offers a copy when the submitted preference is blank',async()=>environment(async w=>{
  const {createServer}=await import('vite');const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
  let root,copied;
  try{
    const {Duplicate}=await vite.ssrLoadModule('/admin/src/ApplicantDetail.jsx');
    const stored={operation:'rent',search_category:'residential',area_answer:'selected',parishes_wanted:['St Helier','Trinity'],preferred_parish:'Trinity',parishes_excluded:[]};
    const dup={id:1,title:'Registered again',created_at:'2026-11-10T00:00:00Z',data:{operation:'rent',area_answer:'selected',parishes_wanted:['St Helier','Trinity']}};
    root=createRoot(w.document.getElementById('root'));
    await React.act(async()=>{root.render(React.createElement(Duplicate,{dup,stored,nameOf:String,contactId:1,onCopy:s=>{copied=s;},onDismiss:()=>{},onConfirmMarketing:()=>{}}));await tick();});
    assert.match(w.document.querySelector('.changes').textContent,/Preferred parish/);
    const button=[...w.document.querySelectorAll('button')].find(x=>x.textContent==='Copy fields');assert.ok(button);
    await React.act(async()=>{button.click();await tick();});assert.equal(copied.area_answer,'selected');
    const {areaCopy}=await import('../admin/src/area-copy.js');
    assert.deepEqual(areaCopy(stored,copied,()=>false),{cancelled:true});
    assert.equal(areaCopy(stored,copied,()=>true).patch.preferred_parish,'');
  }finally{if(root)await React.act(async()=>root.unmount());await vite.close();}
}));

test('staff area controls preserve exclusions and the draft when a destructive change is cancelled',async()=>environment(async w=>{
  const {createServer}=await import('vite');const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
  let root,current;
  try{
    const {default:ApplicantFields,toForm,toBody}=await vite.ssrLoadModule('/admin/src/ApplicantFields.jsx');
    const initial={...toForm(),operation:'rent',search_category:'residential',area_answer:'selected',
      parishes_wanted:['St Helier','Trinity'],parishes_excluded:['St Ouen'],preferred_parish:'Trinity'};
    function Harness(){const [value,setValue]=React.useState(initial);return React.createElement(ApplicantFields,{value,onChange:v=>{current=v;setValue(v);},operation:'rent'});}
    root=createRoot(w.document.getElementById('root'));await React.act(async()=>{root.render(React.createElement(Harness));await tick();});
    w.confirm=()=>false;await React.act(async()=>{click(w.document,'a-area_answer','any');await tick();});
    assert.equal(w.document.querySelector('[name="a-area_answer"]:checked').value,'selected');
    assert.equal(w.document.querySelectorAll('[name="a-parishes_wanted"]:checked').length,2);
    assert.equal(w.document.querySelector('#a-preferred_parish').value,'Trinity');
    assert.equal(w.document.querySelector('[name="a-parishes_excluded"]:checked').value,'St Ouen');
    await React.act(async()=>{click(w.document,'a-parishes_wanted','St Helier');await tick();});
    assert.equal(w.document.querySelectorAll('[name="a-parishes_wanted"]:checked').length,2);
    const preferred=w.document.querySelector('#a-preferred_parish');
    await React.act(async()=>{preferred.value='';preferred.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();});
    assert.equal(preferred.value,'Trinity');
    await React.act(async()=>{w.document.querySelector('[aria-label="Location must-have"]').click();await tick();});
    w.confirm=()=>true;await React.act(async()=>{click(w.document,'a-area_answer','unknown');await tick();});
    const body=toBody(current);
    assert.equal(body.requirement_priorities.values.area,'must');assert.ok(body.requirement_priorities.unknown.includes('area'));
    const {validateApplicant}=await import('../server/applicants.js');
    const valid=validateApplicant({...body,name:'Fixture',email:'fixture@example.test',source:'phone'},{publicForm:false},'2026-11-10T00:00:00.000Z');
    assert.equal(valid.errors,undefined,JSON.stringify(valid.errors));
  }finally{if(root)await React.act(async()=>root.unmount());await vite.close();}
}));
