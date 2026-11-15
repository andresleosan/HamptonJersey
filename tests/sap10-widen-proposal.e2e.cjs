// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/sap10-widen-proposal.e2e.cjs npm run test:e2e:isolated
// SAP-10, with AUT-19 on (wrangler.toml): a Widen alternative and Use this leave the saved search as it was; it changes
// only when an employee proposes the change and confirms it, through the same save as the form.
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {join,dirname}=require('node:path');
const {chromium}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const base=new URL(process.env.BASE),vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
 const {signSession,COOKIE}=await import('../server/auth.js');
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const browser=await chromium.launch({executablePath:process.env.CHROME});
 try{for(const width of [1280,390]){
  d1(`UPDATE listings SET matchable=0; INSERT INTO listings(id,title,use,operation,availability,matchable,sale_price,currency,country,parish,published,created_at,updated_at,updated_by)
   VALUES('SAP10-${width}','SAP10 fixture','residential','sale','for_sale',1,950000,'GBP','Jersey','St Helier',0,'2026-11-15','2026-11-15','fixture')`);
  const context=await browser.newContext({viewport:{width,height:900}});
  try{
   await context.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:base.hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
   await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
   const made=await context.request.post(new URL('api/admin/applicants',base).href,{headers:{origin:base.origin},data:{name:`SAP10 buyer ${width}`,
    email:`sap10-${width}@example.test`,source:'phone',operation:'buy',budget_max:900000,area_answer:'any',pets:[{kind:'none'}],
    requirement_priorities:{version:1,values:{budget:'must'},unknown:[]}}});
   assert.equal(made.status(),201);const {id}=await made.json();
   const saved=()=>d1(`SELECT a.budget_max,a.match_inputs_revision AS revision,a.updated_at,a.search_state,a.stage,c.last_activity_at,
    (SELECT COUNT(*) FROM matches WHERE applicant_id=a.id AND listing_id='SAP10-${width}') AS fixture_match,
    (SELECT COUNT(*) FROM events WHERE entity_type='applicant' AND entity_id=CAST(a.id AS TEXT)) AS events
    FROM applicants a JOIN contacts c ON c.id=a.contact_id WHERE a.id=${id}`)[0];
   const proposals=()=>d1(`SELECT status FROM criteria_proposals WHERE applicant_id=${id} ORDER BY id`).map(p=>p.status);
   const before=saved();
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const status=text=>page.getByRole('status').filter({hasText:text}).waitFor();

   // Seeing the alternative writes nothing.
   await page.goto(new URL(`admin/#/applicants/${id}/matches`,base).href);
   const row=page.locator('section.widen li').filter({hasText:'Budget up 10%'});
   await row.getByRole('button',{name:/Use this/}).waitFor();
   assert.deepEqual(saved(),before);await fits('Widen');
   // Use this only fills the form: by keyboard, focus lands on the budget, and the search is still the saved one.
   const use=row.getByRole('button',{name:/Use this/});await use.focus();await page.keyboard.press('Enter');
   await page.waitForFunction(()=>document.activeElement?.id==='a-budget_max');
   assert.equal(await page.locator('#a-budget_max').inputValue(),'990000');
   const review=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Confirm changes to search criteria',exact:true})});
   await review.waitFor();
   assert.deepEqual(saved(),before);assert.deepEqual(proposals(),[]);await fits('Use this');

   // Proposed: still nothing changes in the search, its matches or its activity.
   await review.getByRole('button',{name:'Propose changes',exact:true}).click();
   await status('Proposal saved. Nothing changes until it is confirmed.');
   assert.equal(await page.locator('#a-budget_max').inputValue(),'900000');
   const proposed=saved();
   assert.deepEqual({...proposed,events:null,last_activity_at:null},{...before,events:null,last_activity_at:null});
   assert.deepEqual(proposals(),['pending']);

   // Confirmed: the one save of the form runs, the version moves once, the matches are recalculated, the search stays active.
   const strip=page.locator('section.dup').filter({has:page.getByRole('heading',{name:'Proposed changes waiting for confirmation',exact:true})});
   await strip.getByRole('button',{name:'Confirm changes',exact:true}).click();
   await status('Changes confirmed and saved. Matches recalculated.');
   const after=saved();
   assert.deepEqual([after.budget_max,after.revision,after.search_state,after.stage,after.fixture_match],
    [990000,before.revision+1,'active',before.stage,1]);
   assert.deepEqual(proposals(),['confirmed']);
   assert.equal(await page.locator('#a-budget_max').inputValue(),'990000');
   await fits('Confirmed');
   assert.deepEqual(errors,[]);
   console.log(`SAP-10 ${width}px: Widen and Use this changed nothing; proposal confirmed through the same save.`);
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
