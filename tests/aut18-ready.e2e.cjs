// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/aut18-ready.e2e.cjs npm run test:e2e:isolated
// AUT-18: Ready for the team on the applicant's record. Marking, Done, a stage change and a criteria change, each in the
// search's history, and Hermes's door counting the current marks as a number, never who.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.AUT18_TEAM_READY,'1');assert.ok(vars.HERMES_KEY?.length>=32);
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
  // Hermes's door, as the key's custodian calls it: the key, no Origin.
  const door=async()=>{const r=await ctx.request.get(base+'api/hermes/status',{headers:{authorization:`Bearer ${vars.HERMES_KEY}`}});
   assert.equal(r.status(),200);return r.json();};
  const before=(await door()).counts.applicants_ready;assert.equal(before,0);
  for(const width of [1280,390]){
   console.log('AUT18 width',width);
   const name=`AUT18 Quarrington ${width}`,email=`aut18-${width}@example.test`;
   const made=await post('applicants',{name,email,operation:'rent',source:'phone',budget_max:2000,bedrooms_min:2});
   assert.equal(made.status(),201);const id=(await made.json()).id;
   const search=()=>d1(`SELECT stage,search_state,updated_at FROM applicants WHERE id=${id}`)[0];
   const mark=()=>d1(`SELECT marked_by FROM applicant_team_ready WHERE applicant_id=${id}`);
   const history=()=>d1(`SELECT type,data FROM events WHERE entity_type='applicant' AND entity_id='${id}' AND type LIKE 'applicant.team_ready%' ORDER BY id`);
   const counted=async n=>{const s=await door();assert.equal(s.counts.applicants_ready,n);
    if(n)assert.match(s.summary,new RegExp(`^- ${n} applicants? with proposals ready for the team$`,'m'));
    else assert.doesNotMatch(s.summary,/ready for the team/);
    const text=JSON.stringify(s);for(const secret of [name,email,'Quarrington'])assert.ok(!text.includes(secret),`door leaks ${secret}`);};

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   // The refused Done answers 409 on purpose; any other console error fails the run.
   page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource.*409/.test(m.text()))errors.push(m.text());});
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async what=>{if(shots)await page.screenshot({path:join(shots,`aut18-${what}-${width}.png`),fullPage:true});};
   const open=async(tab='')=>{await page.goto(base+`admin/#/applicants/${id}${tab}`);await page.getByRole('heading',{name,exact:true}).waitFor();};
   const panel=page.locator('section.team-ready');
   const button=label=>panel.getByRole('button',{name:label,exact:true});
   const status=text=>panel.getByRole('status').filter({hasText:text}).waitFor();

   // Not marked: what it does, and the one button.
   await open();
   await panel.getByRole('heading',{name:'Ready for the team',exact:true}).waitFor();
   await panel.getByText('Mark this search once its proposals are reviewed.',{exact:false}).waitFor();
   assert.equal(await button('Done').count(),0);
   await fits('Not marked');await shot('unmarked');

   // By keyboard: the button takes the focus and Enter marks it; the focus goes to the section's heading.
   await button('Ready for the team').focus();await page.keyboard.press('Enter');
   await status('Marked ready for the team.');
   await page.locator('#team-ready-h:focus').waitFor();
   await panel.locator('.badge',{hasText:'Ready'}).waitFor();
   await panel.getByText(/^Marked by .+ · .+The 08:00 team summary counts it, without names\./).waitFor();
   assert.equal(await button('Ready for the team').count(),0);
   assert.deepEqual(mark(),[{marked_by:ADMIN}]);
   await counted(1);
   await fits('Marked');await shot('marked');

   // Done: the mark is off, the search stays active and at its stage.
   const stage=search().stage;
   await button('Done').click();
   await status('Done. The search stays as it is.');
   await button('Ready for the team').waitFor();
   assert.deepEqual(mark(),[]);assert.deepEqual([search().stage,search().search_state],[stage,'active']);
   await counted(0);

   // A stage change takes a new mark off in the same save.
   await button('Ready for the team').click();await status('Marked ready for the team.');
   await counted(1);
   await page.getByLabel('Stage').selectOption('viewing');
   await page.getByRole('button',{name:'Apply stage',exact:true}).click();
   await page.getByRole('status').filter({hasText:'Stage changed to Viewing.'}).waitFor();
   await button('Ready for the team').waitFor();
   assert.deepEqual(mark(),[]);
   await counted(0);

   // A criteria change leaves a mark out of date: shown, not counted, until marked again.
   await button('Ready for the team').click();await status('Marked ready for the team.');
   const edited=await ctx.request.put(base+`api/admin/applicants/${id}`,{headers:{origin},
    data:{updated_at:search().updated_at,budget_max:2500,criteria_confirmation:{confirmed:true}}});
   assert.equal(edited.status(),200);
   await page.reload();await page.getByRole('heading',{name,exact:true}).waitFor();
   await panel.locator('.badge',{hasText:'Criteria changed'}).waitFor();
   await panel.getByText('The criteria changed after it was marked, so the summary leaves it out.',{exact:false}).waitFor();
   await counted(0);
   await fits('Out of date');await shot('out-of-date');
   await button('Mark ready again').click();await status('Marked ready for the team.');
   await counted(1);

   // Someone else saved since this page loaded: Done is refused, says why and reloads.
   const owner=await ctx.request.put(base+`api/admin/applicants/${id}`,{headers:{origin},data:{updated_at:search().updated_at,assigned_to:ADMIN}});
   assert.equal(owner.status(),200);
   await button('Done').click();
   const alert=panel.getByRole('alert');
   await alert.getByText('Someone else saved changes to this applicant.',{exact:false}).waitFor();
   assert.equal(mark().length,1,'nothing changed');
   await fits('Conflict');await shot('conflict');
   await alert.getByRole('button',{name:'Reload search',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('section.team-ready [role=alert]'));
   await button('Done').click();await status('Done. The search stays as it is.');
   assert.deepEqual(mark(),[]);
   await counted(0);

   // The history: each step, with ids only.
   assert.deepEqual(history().map(e=>e.type),['applicant.team_ready','applicant.team_ready_done','applicant.team_ready',
    'applicant.team_ready_cleared','applicant.team_ready','applicant.team_ready','applicant.team_ready_done']);
   for(const e of history())for(const secret of [name,email])assert.ok(!String(e.data).includes(secret));
   await page.goto(base+`admin/#/applicants/${id}/timeline`);
   const timeline=page.locator('ol.timeline');
   await timeline.getByText('Marked ready for the team',{exact:true}).first().waitFor();
   await timeline.getByText('Ready for the team: done',{exact:true}).first().waitFor();
   await timeline.getByText('Ready for the team removed: stage changed',{exact:true}).waitFor();
   await fits('Timeline');await shot('timeline');
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('AUT18 ready for the team ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
