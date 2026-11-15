// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/aut19-criteria-proposal.e2e.cjs npm run test:e2e:isolated
// AUT-19: criteria changed after talking to the client wait as a proposal with its before and after; the search and its
// matches change only when an employee confirms it.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.AUT19_CRITERIA_PROPOSALS_READY,'1');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),origin=new URL(base).origin,ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  const errors=[],post=(path,data)=>ctx.request.post(base+'api/admin/'+path,{headers:{origin},data});
  for(const width of [1280,390]){
   console.log('AUT19 width',width);
   const name=`AUT19 Jane ${width}`,home=`AUT19-${width}`;
   // A home above the stored budget and within the proposed one.
   d1(`INSERT INTO listings(id,title,use,operation,availability,matchable,rent,rent_period,currency,bedrooms,published,created_at,updated_at,updated_by) VALUES('${home}','AUT19 ${width} home','residential','rent','to_let',1,2400,'month','GBP',2,0,'2026-11-09T10:00:00.000Z','2026-11-09T10:00:00.000Z','fixture');`);
   const made=await post('applicants',{name,email:`aut19-${width}@example.test`,operation:'rent',source:'phone',budget_max:2000,bedrooms_min:2,parking_spaces:1,
    requirement_priorities:{version:1,values:{parking:'must',budget:'must'},unknown:[]}});
   assert.equal(made.status(),201);const id=(await made.json()).id;
   const search=()=>d1(`SELECT budget_max,bedrooms_min,parking_spaces,json_extract(requirement_priorities,'$.values.parking') AS parking,match_inputs_revision AS revision,updated_at FROM applicants WHERE id=${id}`)[0];
   const budgetCheck=()=>d1(`SELECT m.id,(SELECT json_extract(value,'$.result') FROM json_each(m.checks) WHERE json_extract(value,'$.key')='budget') AS budget FROM matches m WHERE m.applicant_id=${id} AND m.listing_id='${home}'`);
   const matchCount=()=>d1(`SELECT COUNT(*) AS n,COUNT(DISTINCT listing_id) AS listings FROM matches WHERE applicant_id=${id}`)[0];
   const proposals=()=>d1(`SELECT status,source,note,proposed_by,decided_by FROM criteria_proposals WHERE applicant_id=${id} ORDER BY id`);
   const task=()=>d1(`SELECT title,action_required,resolved_at IS NOT NULL AS closed FROM notifications WHERE task_key='work:dictation:applicant:${id}:criteria-proposal'`);
   const saved=search(),[match]=budgetCheck(),counted=matchCount();
   assert.equal(match.budget,'fails');assert.equal(counted.n,counted.listings);

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async what=>{if(shots)await page.screenshot({path:join(shots,`aut19-${what}-${width}.png`),fullPage:true});};
   const open=async(tab='')=>{await page.goto(base+`admin/#/applicants/${id}${tab}`);await page.getByRole('heading',{name,exact:true}).waitFor();};
   const strip=page.locator('section.dup').filter({has:page.getByRole('heading',{name:'Proposed changes waiting for confirmation',exact:true})});
   const review=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Confirm changes to search criteria',exact:true})});
   const budget=page.locator('#a-budget_max'),status=text=>page.getByRole('status').filter({hasText:text}).waitFor();
   const change=async(scope,label)=>(await scope.locator("dl div").filter({has:page.locator("dt",{hasText:new RegExp(`^${label}$`)})}).locator("dd").innerText()).replace(/\s+/g," ");

   // Nothing waits yet. Raising the budget in the search form shows its before and after, and offers to propose it.
   await open();
   await budget.waitFor();assert.equal(await budget.inputValue(),'2000');
   assert.equal(await strip.count(),0);
   await budget.fill('2500');
   await review.waitFor();
   assert.match(await change(review,"Maximum budget"),/£2,000 → £2,500/);
   assert.equal(await review.locator('dl div').count(),1);
   await review.getByText('everything not listed here stays as it is',{exact:false}).waitFor();
   await review.getByLabel('Where this came from (optional)').fill('Call with client 14 Nov');
   await fits('Review before proposing');await shot('review');
   // By keyboard: the button takes the focus and Enter proposes.
   const proposeButton=review.getByRole('button',{name:'Propose changes',exact:true});
   await proposeButton.focus();await page.keyboard.press('Enter');
   await status('Proposal saved. Nothing changes until it is confirmed.');
   await strip.waitFor();
   await page.locator('#proposal-h:focus').waitFor();
   assert.match(await change(strip,"Maximum budget"),/£2,000 → to £2,500/);
   assert.equal(await strip.locator('dl div').count(),1);
   await strip.getByText('Call with client 14 Nov',{exact:false}).waitFor();
   await strip.getByText('Nothing is saved until you confirm. Everything not listed here stays as it is.',{exact:true}).waitFor();
   // The search, its matches and its version are as they were; the form is back to the saved budget.
   assert.equal(await budget.inputValue(),'2000');assert.equal(await review.count(),0);
   assert.deepEqual(search(),saved);assert.deepEqual(budgetCheck(),[match]);assert.deepEqual(matchCount(),counted);
   assert.deepEqual(proposals(),[{status:'pending',source:'staff',note:'Call with client 14 Nov',proposed_by:ADMIN,decided_by:null}]);
   assert.deepEqual(task(),[{title:'Confirm proposed criteria changes',action_required:1,closed:0}]);
   await fits('Record with a proposal');await shot('proposal');

   // The list and the Inbox say it is waiting.
   await page.goto(base+'admin/#/applicants');
   const row=page.locator('table.applicants tbody tr').filter({has:page.getByRole('link',{name,exact:true})});
   await row.getByText('Changes to confirm',{exact:true}).waitFor();
   await fits('Applicants');await shot('applicants');
   await page.goto(base+'admin/#/');
   await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
   await page.getByText('Confirm proposed criteria changes',{exact:true}).first().waitFor();
   await fits('Inbox');await shot('inbox');

   // Correcting it: its values go to the form, and proposing again replaces it.
   await open();await strip.waitFor();
   await strip.getByRole('button',{name:'Edit proposal',exact:true}).click();
   await review.waitFor();assert.equal(await budget.inputValue(),'2500');
   assert.ok(await strip.getByRole('button',{name:'Confirm changes',exact:true}).isDisabled());
   await strip.getByText('Save or discard your unsaved changes first.',{exact:true}).waitFor();
   await budget.fill('2600');
   await review.getByText('It replaces the proposal already waiting.',{exact:false}).waitFor();
   await review.getByRole('button',{name:'Propose changes',exact:true}).click();
   await status('Proposal saved. Nothing changes until it is confirmed.');
   await page.waitForFunction(()=>/£2,000 → to £2,600/.test((document.querySelector("section.dup dl")?.innerText??"").replace(/\s+/g," ")));
   assert.deepEqual(search(),saved);
   assert.deepEqual(proposals().map(p=>p.status),['discarded','pending']);

   // Confirming saves exactly that field, keeps parking a must-have and evaluates the same matches again.
   await strip.getByRole('button',{name:'Confirm changes',exact:true}).click();
   await status('Changes confirmed and saved. Matches recalculated.');
   await page.waitForFunction(()=>!document.getElementById('proposal-h'));
   assert.equal(await budget.inputValue(),'2600');
   const after=search();
   assert.deepEqual({...after,updated_at:null},{...saved,budget_max:2600,revision:saved.revision+1,updated_at:null});
   assert.deepEqual(budgetCheck(),[{id:match.id,budget:'meets'}]);assert.deepEqual(matchCount(),counted);
   assert.deepEqual(proposals().at(-1),{status:'confirmed',source:'staff',note:null,proposed_by:ADMIN,decided_by:ADMIN});
   assert.deepEqual(task(),[{title:'Confirm proposed criteria changes',action_required:1,closed:1}]);
   await page.goto(base+`admin/#/applicants/${id}/timeline`);
   const timeline=page.locator('ol.timeline');
   await timeline.getByText('Criteria changes proposed',{exact:true}).first().waitFor();
   await timeline.getByText(/^Proposed by .+, confirmed by .+$/).waitFor();
   await fits('Timeline');await shot('timeline');

   // A proposal made before a colleague changed the search can no longer be confirmed, only redone or discarded.
   assert.equal((await post(`applicants/${id}/criteria-proposals`,{changes:{bedrooms_min:1},note:'Second call'})).status(),201);
   const edited=await ctx.request.put(base+`api/admin/applicants/${id}`,{headers:{origin},data:{updated_at:after.updated_at,parking_spaces:2,criteria_confirmation:{confirmed:true}}});
   assert.equal(edited.status(),200);
   // The record is already open on its Timeline: a reload reads it again.
   await open();await page.reload();await page.getByRole('heading',{name,exact:true}).waitFor();await strip.waitFor();
   await strip.getByText('The search changed after this proposal was made',{exact:false}).waitFor();
   assert.equal(await strip.getByRole('button',{name:'Confirm changes',exact:true}).count(),0);
   await fits('Outdated proposal');await shot('outdated');
   await strip.getByRole('button',{name:'Discard proposal',exact:true}).click();
   await status('Proposal discarded. Nothing was changed.');
   await page.waitForFunction(()=>!document.getElementById('proposal-h'));
   assert.equal(search().bedrooms_min,2);assert.equal(search().parking_spaces,2);
   assert.equal(proposals().at(-1).status,'discarded');assert.equal(task()[0].closed,1);
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('AUT-19 E2E passed: 1280/390; a proposed budget shows its before and after and changes nothing; the list and the Inbox flag it; it can be corrected, confirmed (one field saved, parking kept, same matches re-evaluated) or, once outdated, only discarded.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
