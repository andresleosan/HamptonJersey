// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/bus10-identity.e2e.cjs npm run test:e2e:isolated
// BUS-10: listings typed in for three synthetic agencies are proposed as possible duplicates; a person links
// three of them into one home, keeps the second flat apart, and takes both decisions back. Real routes and D1.
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
 assert.equal(vars.BUS10_IDENTITY_READY,'1');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),origin=new URL(base).origin,ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  const post=async(path,data,expected)=>{const r=await ctx.request.post(base+'api/admin/market/'+path,{headers:{origin},data});
   assert.equal(r.status(),expected,`${path}: ${await r.text()}`);return r.json();};
  const id=()=>require('node:crypto').randomUUID(),AGENCIES=['agency-a','agency-b','agency-c'];
  // The inventory as staff load it: a directory, each channel reviewed for manual upload, one batch, one upload per channel.
  const manifest=JSON.stringify({schema_version:1,status:'candidate_not_authorized',revision:'bus10-e2e',channels:AGENCIES.map(source_ref=>(
   {source_ref,channel_id:'web',source_kind:'external',source_class:'unclassified',access_status:'pending',coverage_claim:'unknown',
    channel_url_known:true,review_state:'terms_and_method_review',handoff_row:2}))})+'\n';
  await post('manifests',{manifest,sha256:createHash('sha256').update(manifest).digest('hex')},201);
  for(const source_ref of AGENCIES)await post('sources/review',{source_ref,channel_id:'web',version:1,operation_id:id(),source_class:'general',
   status:'manual_only',method:'manual',allowed_hosts:[`${source_ref}.example.test`],allowed_paths:['/properties'],allowed_redirect_hosts:[],
   min_interval_s:60,evidence_ref:'fixture-evidence',retention_ref:'fixture-retention',review_due_at:'2999-01-01T00:00:00.000Z'},200);
  const run=(await post('runs',{kind:'initial',manifest_revision:'bus10-e2e',operation_id:id()},201)).run;
  const seen=new Date(Date.now()-5000).toISOString(),PARISH={1280:'St Helier',390:'Grouville'};
  // Per width: one home on the three agencies, and a second flat at the same address on the first one.
  const record=(source_ref,key,parish)=>({external_key:key,source_at:seen,listing_url:`https://${source_ref}.example.test/properties/${key.toLowerCase()}`,
   observation:{country_code:'JE',territory_evidence:`Address on the listing: Synthetic Court, ${parish}, Jersey`,operation:'rent',observed_at:seen,
    title:`Synthetic Court flat seen by ${source_ref}`,parish,bedrooms:2,bathrooms:1,
    financial_terms:[{kind:'rent',amount_minor:150000,currency:'GBP',period:'month',raw_text:'£1,500 pcm'}]}});
  for(const source_ref of AGENCIES)await post('manual-pages',{schema_version:1,run_id:run.id,source_ref,channel_id:'web',policy_version:2,
   page_key:'batch-1',observed_at:seen,records:Object.entries(PARISH).flatMap(([width,parish])=>[record(source_ref,`W${width}-HOME`,parish),
    ...(source_ref==='agency-a'?[record(source_ref,`W${width}-FLAT2`,parish)]:[])])},201);
  assert.deepEqual(d1('SELECT COUNT(*) AS n FROM market_observations'),[{n:8}]);
  assert.deepEqual(d1('SELECT COUNT(*) AS n FROM market_properties'),[{n:0}]);

  const errors=[];
  for(const width of [1280,390]){
   console.log('BUS10 width',width);
   const parish=PARISH[width],home=`W${width}-HOME`,flat=`W${width}-FLAT2`;
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   await page.goto(base+'admin/#/automations');
   const section=page.getByRole('region',{name:'Possible duplicate homes'});
   await section.waitFor();
   const mine=name=>section.getByRole('list',{name}).getByRole('listitem').filter({hasText:parish});
   // Wait for the reloaded list itself, never for a count read while the old one is still on screen.
   const settled=async(name,n)=>{await assert.doesNotReject(page.waitForFunction(([label,text,expected])=>{
     const list=[...document.querySelectorAll('ul')].find(ul=>ul.getAttribute('aria-label')===label);
     return (list?[...list.children].filter(li=>li.textContent.includes(text)).length:0)===expected;},[name,parish,n],{timeout:15000}),
    `${name}: expected ${n} for ${parish} at ${width}`);};

   // Proposed with their evidence; nothing is linked by reading.
   await settled('Possible duplicates',6);
   const first=mine('Possible duplicates').filter({hasText:`agency-a · Channel web · Ref ${home}`}).filter({hasText:`agency-b · Channel web · Ref ${home}`});
   assert.equal(await first.count(),1);
   const text=await first.innerText();
   assert.match(text,/Same operation, parish, bedrooms, price and title|Same operation, parish, bedrooms and price/);
   assert.equal((text.match(new RegExp(`Rent · ${parish} · 2 bedrooms · 1 bathroom · £1,500\\.00 per month`,'g'))||[]).length,2);
   assert.match(text,new RegExp(`Address on the listing: Synthetic Court, ${parish}, Jersey · Seen `));
   assert.equal(await first.getByRole('link',{name:'Synthetic Court flat seen by agency-b'}).getAttribute('href'),`https://agency-b.example.test/properties/${home.toLowerCase()}`);
   await fits('candidates');
   if(shots)await page.screenshot({path:join(shots,`bus10-candidates-${width}.png`),fullPage:true});
   if(width===1280)assert.deepEqual(d1('SELECT COUNT(*) AS n FROM market_properties'),[{n:0}]);

   // One home on three sites: two "Same home" decisions, by mouse and by keyboard.
   await section.getByRole('button',{name:`Same home: agency-a ${home} and agency-b ${home}`}).click();
   await section.getByText('Linked as one home. Both listings are kept. You can undo it under Linked homes.').waitFor();
   await settled('Possible duplicates',3);await settled('Linked homes',1);
   const third=section.getByRole('button',{name:`Same home: agency-a ${home} and agency-c ${home}`});
   await third.focus();await page.keyboard.press('Enter');
   await settled('Possible duplicates',1);
   const linked=mine('Linked homes');
   await linked.getByText('One home · 3 listings').waitFor();
   for(const agency of AGENCIES)await linked.getByText(`${agency} · Channel web · Ref ${home}`).waitFor();

   // The second flat at the same address stays a different home, and is not proposed again.
   await section.getByRole('button',{name:`Different homes: agency-a ${flat} and agency-a ${home}`}).click();
   await section.getByText('Kept as different homes. You can reopen it under Kept apart.').waitFor();
   await settled('Possible duplicates',0);await settled('Kept apart',1);
   assert.equal(await linked.getByText(flat).count(),0);
   await linked.getByText('One home · 3 listings').waitFor();
   await fits('decided');
   if(shots)await page.screenshot({path:join(shots,`bus10-decided-${width}.png`),fullPage:true});
   // At 200% the review itself must not push the page sideways; anything else on Automations that does is named, not hidden.
   await page.evaluate(()=>{document.body.style.zoom='2'});
   const wide=await section.evaluate(el=>{const root=document.documentElement,shown=root.scrollWidth;
    el.style.display='none';const hidden=root.scrollWidth;el.style.display='';
    return {inside:el.scrollWidth<=el.clientWidth+1,widens:shown>hidden,pageAlready:hidden>root.clientWidth+1};});
   assert.deepEqual([wide.inside,wide.widens],[true,false],`the review fits at 200% at ${width}`);
   if(wide.pageAlready)console.log(`BUS10 note: without the review, Automations is already wider than the page at 200% at ${width}`);
   await page.evaluate(()=>{document.body.style.zoom='1'});

   // It survives a reload, and both decisions can be taken back.
   await page.reload();await section.waitFor();await settled('Linked homes',1);await settled('Kept apart',1);
   await mine('Kept apart').getByRole('button',{name:/^Reopen: /}).click();
   await section.getByText('Reopened. The pair is back under possible duplicates.').waitFor();
   await settled('Kept apart',0);await settled('Possible duplicates',1);
   await mine('Linked homes').getByRole('button',{name:/^Undo last link: /}).click();
   await section.getByText('Last link undone. The homes it joined are separate again.').waitFor();
   await mine('Linked homes').getByText('One home · 2 listings').waitFor();
   await settled('Possible duplicates',3);
   await page.close();
  }
  // Every decision is on record, and identity never rewrote or removed what was captured.
  assert.deepEqual(d1("SELECT action,COUNT(*) AS n FROM market_identity_decisions GROUP BY action ORDER BY action"),
   [{action:'same_property',n:4},{action:'undo',n:2}]);
  assert.deepEqual(d1("SELECT action,COUNT(*) AS n FROM market_identity_separations GROUP BY action ORDER BY action"),
   [{action:'different_properties',n:2},{action:'reopen',n:2}]);
  assert.deepEqual(d1('SELECT COUNT(*) AS n,SUM(deleted_tombstone) AS gone,MAX(revision) AS revision FROM market_observations'),[{n:8,gone:0,revision:1}]);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
 console.log('BUS-10 identity review: proposed with evidence, three sites one home, second flat kept apart, reload, reopen and undo, keyboard, 1280/390 and 200% PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
