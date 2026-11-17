// AGE-09: the evidence of what an enquiry shared, as staff read it on the property's Enquiries card. Synthetic data only.
const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const React=require('react');

const SENT='2026-11-10T10:00:00.000Z';
const base={consultation:{id:7,kind:'general',status:'sent',revision:1,listing_id:'HE-R001',operation:'rent',prepared_by:'fixture-preparer',
  prepared_at:'2026-11-10T09:00:00.000Z',recipient:{id:3,name:'Fixture Agency',kind:'agency'}},
 shared:null,general_checks:[],presentations:[],approvals:[],emails:[],responses:[],latest_response:null,calls:{events:[],task:null},
 attempts:[{type:'prepared',at:'2026-11-10T09:00:00.000Z',by:'fixture-preparer'}],
 matches:[{match_id:41,applicant_id:5,linked_by:'fixture-preparer',linked_at:'2026-11-10T09:00:00.000Z',before_sending:false,
  approval:{by:'fixture-reviewer',at:'2026-11-09T09:00:00.000Z'}}],matches_total:1,next_cursor:null};

async function mount(pages){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://hampton.test/',pretendToBeVisual:true});
 const saved={window:global.window,document:global.document,fetch:global.fetch,IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT};
 global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
 const calls=[];
 global.fetch=async url=>{calls.push(url);const next=pages.shift();
  return next instanceof Error?{ok:false,status:500,json:async()=>({error:next.message})}:{ok:true,status:200,json:async()=>next};};
 const {createServer}=await import('vite');
 const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
 const {default:ConsultationEvidence}=await vite.ssrLoadModule('/admin/src/ConsultationEvidence.jsx');
 const {createRoot}=require('react-dom/client');
 const root=createRoot(dom.window.document.getElementById('root'));
 await React.act(async()=>{root.render(React.createElement(ConsultationEvidence,{consultationId:7}));});
 const text=()=>dom.window.document.getElementById('root').textContent.replace(/\s+/g,' ');
 const close=async()=>{await React.act(async()=>root.unmount());await vite.close();dom.window.close();
  for(const [k,v] of Object.entries(saved))v===undefined?delete global[k]:global[k]=v;};
 return {dom,calls,text,close};
}

test('an email that failed, or a text never recorded as sent, shows that nothing was shared and presents no client',async()=>{
 const failed={...base,approvals:[{type:'send',revision:1,by:'fixture-approver',at:'2026-11-10T09:30:00.000Z'}],
  emails:[{ref:'abc',version:1,status:'failed',approved_by:'fixture-approver',approved_at:'2026-11-10T09:30:00.000Z',created_at:SENT,updated_at:SENT}],
  attempts:[...base.attempts,{type:'email_queued',at:SENT,by:'fixture-approver'},{type:'email_not_sent',at:SENT,by:'system',reason:'failed'}]};
 const v=await mount([failed]);
 try{
  assert.equal(v.calls[0],'/api/admin/consultations/7/evidence');
  assert.match(v.text(),/Nothing has been shared/);
  assert.match(v.text(),/No client was presented/);
  assert.match(v.text(),/Sending approved by fixture-approver/);
  assert.match(v.text(),/Email not sent/);
  assert.doesNotMatch(v.text(),/Text sent/);
 }finally{await v.close();}
});

test('a sent check shows its date, the text that went out, what each case carried and no commercial right',async()=>{
 const sent={...base,shared:{text:'Hello,\n\nFixture text sent',revision:2,sent_at:SENT,via:'phone',by:'fixture-sender',evidence_ref:'Call log FIXTURE',
   property:'HE-R001',household_size:3,client_identity:false},
  approvals:[{type:'send',revision:1,by:'fixture-approver',at:SENT,of_sent_version:false}],events_truncated:true,
  general_checks:[{asked:['availability','viewing_times'],identifies_client:false,sent_at:SENT,via:'phone',by:'fixture-sender',matches_at_sending:1}],
  presentations:[{match_id:41,applicant_id:5,shared:['household_size'],household_size:3,identifies_client:false,sent_at:SENT,via:'phone'}],
  attempts:[...base.attempts,{type:'sent_manually',at:SENT,by:'fixture-sender',via:'phone',sent_at:SENT,evidence_ref:'Call log FIXTURE'}],
  matches:[{...base.matches[0],before_sending:true,has_note:true}],
  responses:[{type:'response_recorded',at:SENT,by:'fixture-recorder',outcome:'available',via:'phone',scope:'property'}],
  latest_response:{outcome:'available',at:SENT,via:'phone',from:'Lettings desk',scope:'property',evidence_ref:'Call log FIXTURE 2',by:'fixture-recorder',recorded_at:SENT},
  calls:{events:[{type:'call_due',at:SENT}],task:{created_at:SENT,due_at:SENT,resolved_at:SENT,resolved_by:'fixture-recorder',task_action:'source_resolved'}},
  next_cursor:41,matches_total:2};
 const more={...base,matches:[{...base.matches[0],match_id:42,applicant_id:6,before_sending:false}],next_cursor:null,matches_total:2};
 const v=await mount([sent,more]);
 try{
  const t=v.text(),date=new Date(SENT).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  assert.ok(t.includes(date),'the date it was sent');
  assert.match(t,/General check/);
  assert.match(t,/names no client/i);
  assert.match(t,/Fixture text sent/);
  assert.match(t,/household size \(3\)/i);
  assert.match(t,/no name or contact/i);
  assert.match(t,/Call log FIXTURE/);
  assert.match(t,/Available/);
  assert.match(t,/Lettings desk/);
  assert.match(t,/Call due/);
  assert.match(t,/version 2/);
  assert.match(t,/version 1 \(not the version sent\)/);
  assert.match(t,/Partial list/);
  assert.match(t,/said something about this search: see its match/);
  assert.match(t,/does not establish any commission/i);
  assert.doesNotMatch(t.replace(/does not establish any commission[^.]*\./i,''),/commission/i,'no commission right inferred');
  const link=v.dom.window.document.querySelector('a[href="#/applicants/5/matches"]');
  assert.ok(link,'the search presented, for staff');
  const button=[...v.dom.window.document.querySelectorAll('button')].find(b=>/more matches/i.test(b.textContent));
  await React.act(async()=>button.click());
  assert.equal(v.calls[1],'/api/admin/consultations/7/evidence?cursor=41');
  assert.ok(v.dom.window.document.querySelector('a[href="#/applicants/6/matches"]'));
  assert.match(v.text(),/joined after it was sent/i);
 }finally{await v.close();}
});

test('an email whose outcome was not confirmed is not counted as shared',async()=>{
 const v=await mount([{...base,consultation:{...base.consultation,status:'needs_review'},attempts:[...base.attempts,{type:'email_unknown',at:SENT,by:'system'}]}]);
 try{
  assert.match(v.text(),/did not confirm whether the email went out/);
  assert.doesNotMatch(v.text(),/Nothing has been shared/);
  assert.doesNotMatch(v.text(),/Partial list/);
 }finally{await v.close();}
});

test('a read that fails says so and can be retried',async()=>{
 const v=await mount([new Error('Server unavailable'),base]);
 try{
  assert.match(v.dom.window.document.querySelector('[role="alert"]').textContent,/Server unavailable/);
  const retry=[...v.dom.window.document.querySelectorAll('button')].find(b=>/try again/i.test(b.textContent));
  await React.act(async()=>retry.click());
  assert.match(v.text(),/Nothing has been shared/);
 }finally{await v.close();}
});
