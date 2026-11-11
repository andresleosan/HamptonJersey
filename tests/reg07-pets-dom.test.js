const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const React=require('react');
const {createRoot}=require('react-dom/client');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
async function environment(run){
  const dom=new JSDOM('<main id="root"></main>',{url:'http://localhost/',pretendToBeVisual:true});
  const names=['window','document','sessionStorage','fetch','Event','jerseyToday','addEventListener','location','IS_REACT_ACT_ENVIRONMENT'];
  const old=Object.fromEntries(names.map(k=>[k,global[k]]));
  global.window=dom.window;global.document=dom.window.document;global.sessionStorage=dom.window.sessionStorage;
  global.Event=dom.window.Event;global.IS_REACT_ACT_ENVIRONMENT=true;
  global.jerseyToday=()=>new Date().toISOString().slice(0,10);
  global.addEventListener=dom.window.addEventListener.bind(dom.window);global.location=dom.window.location;
  try{await run(dom.window);}finally{dom.window.close();for(const [k,v] of Object.entries(old))v===undefined?delete global[k]:global[k]=v;}
}
const choice=(doc,name,value)=>{
  const el=[...doc.querySelectorAll(`[name="${name}"]`)].find(x=>x.value===value);
  assert.ok(el,`missing ${name} ${value}`);el.click();return el;
};

test('public form keeps declared pets essential, preserves counts on Back, and leaves parking independent',async()=>environment(async w=>{
  const {OPTIONS}=await import('../server/applicants.js');global.fetch=async()=>({ok:true,json:async()=>OPTIONS});
  const {renderApply,toBody}=await import('../site/apply.js');
  renderApply(w.document.getElementById('root'),{esc:escape,tsKey:'',tsReady:Promise.resolve()});await tick();
  const form=w.document.querySelector('form'),next=()=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  choice(w.document,'search_category','residential');choice(w.document,'operation','rent');next();
  choice(w.document,'area_answer','any');next();choice(w.document,'bedrooms_min','2');next();
  choice(w.document,'parking_spaces','1');choice(w.document,'pets','dog');
  assert.ok(!w.document.querySelector('[aria-label="Pets must-have"]'),'pets cannot be toggled into a preference');
  assert.match(form.textContent,/Pets must be accommodated/i);
  const parking=w.document.querySelector('[aria-label="Parking must-have"]');assert.ok(parking&&!parking.disabled);
  parking.click();assert.equal(parking.getAttribute('aria-checked'),'true');
  const count=w.document.querySelector('[name=pets_dog]');count.value='0';count.dispatchEvent(new w.Event('input',{bubbles:true}));next();
  assert.equal(count.getAttribute('aria-invalid'),'true');assert.equal(w.document.activeElement,count);
  count.value='2';count.dispatchEvent(new w.Event('input',{bubbles:true}));next();form.querySelector('.apply-back').click();
  assert.equal(count.value,'2');assert.equal(w.document.querySelector('[name=pets][value=dog]').checked,true);
  choice(w.document,'pets','unknown');next();
  assert.equal(w.document.querySelectorAll('fieldset.step')[4].hidden,false,'advance to budget');
  const budget=w.document.querySelector('[name=budget_max]');budget.value='2000';budget.dispatchEvent(new w.Event('input',{bubbles:true}));next();
  assert.equal(w.document.querySelectorAll('fieldset.step')[5].hidden,false,'advance to household');next();
  assert.equal(w.document.querySelectorAll('fieldset.step')[6].hidden,false,'advance to contact');
  const b=toBody({operation:'rent',pets:['dog'],pets_dog:'2',requirement_priorities:{version:1,values:{pets:'preferred',parking:'preferred'},unknown:[]}});
  assert.equal(b.requirement_priorities.values.pets,'must');assert.equal(b.requirement_priorities.values.parking,'preferred');
}));

test('staff form does not let a known household pet be downgraded',async()=>environment(async w=>{
  const {createServer}=await import('vite');const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
  let root,current;
  try{
    const {default:ApplicantFields,toForm,toBody}=await vite.ssrLoadModule('/admin/src/ApplicantFields.jsx');
    const initial={...toForm(),operation:'rent',search_category:'residential'};
    function Harness(){const [value,setValue]=React.useState(initial);return React.createElement(ApplicantFields,{value,onChange:v=>{current=v;setValue(v);},operation:'rent'});}
    root=createRoot(w.document.getElementById('root'));await React.act(async()=>{root.render(React.createElement(Harness));await tick();});
    const dog=[...w.document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Dog')?.querySelector('input');assert.ok(dog);
    await React.act(async()=>{dog.click();await tick();});
    assert.ok(!w.document.querySelector('[aria-label="Pets must-have"]'),'pets cannot be toggled into a preference');
    assert.match(w.document.body.textContent,/Pets must be accommodated/i);
    assert.equal(toBody(current).requirement_priorities.values.pets,'must');
    assert.ok(w.document.querySelector('[aria-label="Parking must-have"]'));
  }finally{if(root)await React.act(async()=>root.unmount());await vite.close();}
}));

const refusedMatch=()=>({id:7,status:'found',score:70,requirements_status:'excluded',requirements_refresh_needed:true,pets_refused:true,
  checks:[{key:'pets',result:'fails',priority:'must',reason:'Must-have not met'}],
  listing:{id:'PET-7',title:'Fixture home',operation:'rent',availability:'to_let',published:1,has_public_photo:0}});

test('a confirmed pet refusal disables Shortlist and explains why while keeping Reject available',async()=>environment(async w=>{
  const {createServer}=await import('vite');const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
  let root,actions=0;
  try{
    const {default:MatchCard}=await vite.ssrLoadModule('/admin/src/MatchCard.jsx');
    root=createRoot(w.document.getElementById('root'));
    await React.act(async()=>{root.render(React.createElement(MatchCard,{match:refusedMatch(),onReview:()=>actions++,shortcuts:true}));await tick();});
    const buttons=[...w.document.querySelectorAll('.match-actions button')];
    assert.equal(buttons[0].disabled,true);assert.equal(buttons[1].disabled,false);
    assert.match(w.document.body.textContent,/Pets are not allowed.*Recalculate matches/i);
    buttons[0].click();assert.equal(actions,0);
  }finally{if(root)await React.act(async()=>root.unmount());await vite.close();}
}));

test('Review keyboard shortcut cannot shortlist a known pet refusal',async()=>environment(async w=>{
  const {createServer}=await import('vite');const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
  let root,writes=0;const match=refusedMatch(),listing=match.listing;
  global.fetch=async(url,options={})=>{
    if(options.method==='PUT'){writes++;return {ok:false,status:409,json:async()=>({error:'Pets are not allowed.'})};}
    return {ok:true,json:async()=>({match,listing,applicant:{id:1,name:'Local fixture',operation:'rent',matches_revision:1},remaining:1})};
  };
  try{
    const {default:Review}=await vite.ssrLoadModule('/admin/src/Review.jsx');
    root=createRoot(w.document.getElementById('root'));await React.act(async()=>{root.render(React.createElement(Review));await tick();});
    const card=w.document.getElementById('match-7');assert.ok(card);card.focus();
    await React.act(async()=>{card.dispatchEvent(new w.KeyboardEvent('keydown',{key:'a',bubbles:true}));await tick();});
    assert.equal(writes,0,'the A shortcut must respect the disabled Shortlist action');
    assert.match(w.document.body.textContent,/Pets are not allowed.*Recalculate matches/i);
  }finally{if(root)await React.act(async()=>root.unmount());await vite.close();}
}));

test('an old failed check alone does not disable Shortlist without a current refusal',async()=>environment(async w=>{
  const {createServer}=await import('vite');const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
  let root;
  try{
    const {default:MatchCard}=await vite.ssrLoadModule('/admin/src/MatchCard.jsx');
    const match=refusedMatch();delete match.pets_refused;match.requirements_status='pending';
    root=createRoot(w.document.getElementById('root'));
    await React.act(async()=>{root.render(React.createElement(MatchCard,{match,onReview:()=>{}}));await tick();});
    assert.equal(w.document.querySelector('.match-actions button').disabled,false);
  }finally{if(root)await React.act(async()=>root.unmount());await vite.close();}
}));
