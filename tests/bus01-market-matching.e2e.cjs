// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/bus01-market-matching.e2e.cjs npm run test:e2e:isolated
// BUS-01 / BUS-03: listings typed in for two synthetic agencies are linked as one home; a search registered in the panel
// crosses the market inventory at once; Automations › Homes found shows each home with its listings and what the
// search made of it, and the applicant's record says what its last search covered. Real routes and D1.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.deepEqual([vars.BUS01_MARKET_MATCHING_READY,vars.BUS10_IDENTITY_READY,vars.EST01_SEARCH_STATE_READY],['1','1','1']);
 const base=process.env.BASE.replace('127.0.0.1','localhost'),origin=new URL(base).origin,ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  const post=async(path,data,expected)=>{const r=await ctx.request.post(base+'api/admin/'+path,{headers:{origin},data});
   assert.equal(r.status(),expected,`${path}: ${await r.text()}`);return r.json();};
  const id=()=>require('node:crypto').randomUUID(),AGENCIES=['agency-a','agency-b'];
  // The inventory as staff load it: a directory, each channel reviewed for manual upload, one batch, one upload per channel.
  const manifest=JSON.stringify({schema_version:1,status:'candidate_not_authorized',revision:'bus01-e2e',channels:AGENCIES.map(source_ref=>(
   {source_ref,channel_id:'web',source_kind:'external',source_class:'unclassified',access_status:'pending',coverage_claim:'unknown',
    channel_url_known:true,review_state:'terms_and_method_review',handoff_row:2}))})+'\n';
  await post('market/manifests',{manifest,sha256:createHash('sha256').update(manifest).digest('hex')},201);
  for(const source_ref of AGENCIES)await post('market/sources/review',{source_ref,channel_id:'web',version:1,operation_id:id(),source_class:'general',
   status:'manual_only',method:'manual',allowed_hosts:[`${source_ref}.example.test`],allowed_paths:['/properties'],allowed_redirect_hosts:[],
   min_interval_s:60,evidence_ref:'fixture-evidence',retention_ref:'fixture-retention',review_due_at:'2999-01-01T00:00:00.000Z'},200);
  const run=(await post('market/runs',{kind:'initial',manifest_revision:'bus01-e2e',operation_id:id()},201)).run;
  const seen=new Date(Date.now()-5000).toISOString(),PARISH={1280:'St Helier',390:'Grouville'};
  // Per width: one flat on both agencies, and a dearer one on the first.
  const record=(source_ref,key,parish,amount=150000)=>({external_key:key,source_at:seen,listing_url:`https://${source_ref}.example.test/properties/${key.toLowerCase()}`,
   observation:{country_code:'JE',territory_evidence:`Address on the listing: Synthetic Court, ${parish}, Jersey`,operation:'rent',observed_at:seen,
    title:`Synthetic Court flat seen by ${source_ref}`,parish,bedrooms:2,bathrooms:1,
    financial_terms:[{kind:'rent',amount_minor:amount,currency:'GBP',period:'month'}]}});
  for(const source_ref of AGENCIES)await post('market/manual-pages',{schema_version:1,run_id:run.id,source_ref,channel_id:'web',policy_version:2,
   page_key:'batch-1',observed_at:seen,records:Object.entries(PARISH).flatMap(([width,parish])=>[record(source_ref,`W${width}-HOME`,parish),
    ...(source_ref==='agency-a'?[record(source_ref,`W${width}-DEAR`,parish,350000)]:[])])},201);
  for(const width of Object.keys(PARISH)){
   const [left,right]=d1(`SELECT id FROM market_observations WHERE external_key='W${width}-HOME' ORDER BY source_ref`).map(r=>r.id);
   await post('market/identity/decisions',{action:'same_property',left_observation_id:left,right_observation_id:right,operation_id:id()},201);
  }

  const errors=[];
  for(const width of [1280,390]){
   console.log('BUS01 width',width);
   const parish=PARISH[width],name=`Synthetic Applicant ${width}`;
   // Registered in the panel: the first search runs at once, against the listings and the market inventory.
   const applicant=(await post('applicants',{name,email:`applicant-${width}@example.test`,phone:`07797 00${width}`,source:'phone',
    operation:'rent',budget_max:2000,bedrooms_min:2,parishes_wanted:[parish]},201)).id;
   assert.deepEqual(d1(`SELECT result,COUNT(*) AS n FROM market_matches WHERE applicant_id=${applicant} GROUP BY result ORDER BY result`),
    [{result:'excluded',n:2},{result:'pending',n:2}]);
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);

   await page.goto(base+'admin/#/automations');
   const section=page.getByRole('region',{name:'Homes found'});
   await section.waitFor();
   // Wait for the list with this search's results, never for a count read while the old one is still on screen.
   await assert.doesNotReject(page.waitForFunction(([who,where])=>{
     const list=[...document.querySelectorAll('ul')].find(ul=>ul.getAttribute('aria-label')==='Homes found');
     return (list?[...list.children].filter(li=>li.textContent.includes(where)&&li.textContent.includes(who)).length:0)===2;},[name,parish],{timeout:15000}),
    `two homes compared with ${name} at ${width}`);
   const homes=section.getByRole('list',{name:'Homes found'}).locator(':scope > li').filter({hasText:`Rent · ${parish} · 2 bedrooms`});
   const shared=homes.filter({hasText:'£1,500.00 per month'}),dear=homes.filter({hasText:'£3,500.00 per month'});
   assert.equal(await shared.count(),1);assert.equal(await dear.count(),1);
   await shared.getByText('2 listings').waitFor();
   await shared.getByText(/Availability not confirmed/).waitFor();
   const mine=list=>list.getByRole('list',{name:'Searches compared'}).getByRole('listitem').filter({hasText:name});
   await mine(shared).getByText('To confirm',{exact:true}).waitFor();
   await mine(dear).getByText('Outside search criteria',{exact:true}).waitFor();
   assert.match(await mine(dear).innerText(),/Budget not met \(£3,500 a month, over £2,000\)/);
   assert.equal(await mine(shared).getByRole('link',{name}).getAttribute('href'),`#/applicants/${applicant}`);
   // The listings behind a home, each with its source and link, on request.
   await shared.getByText('2 listings').click();
   for(const agency of AGENCIES)await shared.getByText(`${agency} · Channel web · Ref W${width}-HOME`).waitFor();
   await fits('homes');
   if(shots)await page.screenshot({path:join(shots,`bus01-homes-${width}.png`),fullPage:true});

   // The record says what the last search covered.
   await page.goto(base+`admin/#/applicants/${applicant}/matches`);
   await page.locator('.search-run').getByText("· Hampton's listings and the market inventory",{exact:true}).waitFor();
   await fits('record');
   if(shots)await page.screenshot({path:join(shots,`bus01-record-${width}.png`),fullPage:true});
   await page.close();
  }
  assert.deepEqual(d1('SELECT market_state,market_homes FROM applicant_search_runs WHERE market_state IS NOT NULL ORDER BY applicant_id'),
   [{market_state:'searched',market_homes:4},{market_state:'searched',market_homes:4}]);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
 console.log('BUS-01/BUS-03 market matching: registered search crosses the inventory, homes found with listings and results, record scope, 1280/390 PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
