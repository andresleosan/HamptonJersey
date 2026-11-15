// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/bus18-property-followup.e2e.cjs npm run test:e2e:isolated
// BUS-18: a listing's Matched applicants show each search as its own row with its EST-13 states, at 1280 and 390.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.EST16_AVAILABILITY_READY,'1');assert.equal(vars.AGE03_ENQUIRIES_READY,'1');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),ADMIN='admin@example.test',T='2026-11-14T10:00:00.000Z';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const value=v=>v==null?'NULL':typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
 const insert=(table,row)=>`INSERT INTO ${table}(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  await ctx.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const errors=[];
  for(const width of [1280,390]){
   console.log('BUS18 width',width);
   // One home for sale, confirmed available, and four searches to buy it: approved now, approved before a change,
   // not decided and rejected.
   const lid=`HE-S18${width}`,names=['Approved','Outdated','Undecided','Rejected'].map(n=>`BUS18 ${n} ${width}`);
   d1(insert('listings',{id:lid,title:`BUS18 ${width} home`,use:'residential',operation:'sale',availability:'for_sale',sale_price:790000,currency:'GBP',
     country:'Jersey',parish:'St Saviour',bedrooms:3,bathrooms:2,published:0,matchable:1,specs:'[]',created_at:T,updated_at:T,updated_by:'fixture'})
    +insert('availability_confirmations',{listing_id:lid,operation:'sale',status:'available',confirmed_at:T,source:'owner',channel:'phone',
      evidence_ref:'BUS18 fixture call',recorded_at:T,recorded_by:ADMIN})
    +names.map((name,i)=>insert('contacts',{name,email:`bus18-${i}-${width}@example.test`,last_activity_at:T,created_at:T,updated_at:T})).join(''));
   const contacts=d1(`SELECT id,name FROM contacts WHERE name LIKE 'BUS18 % ${width}'`);
   const contact=name=>contacts.find(c=>c.name===name).id;
   d1(names.map(name=>insert('applicants',{contact_id:contact(name),stage:'searching',source:'phone',operation:'buy',budget_max:1000000,created_at:T,updated_at:T})).join(''));
   const search=name=>d1(`SELECT id FROM applicants WHERE contact_id=${contact(name)}`)[0].id;
   const ids=names.map(search),[approved,outdated,undecided,rejected]=ids;
   const match=(a,status,extra={})=>insert('matches',{applicant_id:a,listing_id:lid,score:80,checks:'[]',status,created_at:T,updated_at:T,...extra});
   d1(match(approved,'shortlisted',{reviewed_by:ADMIN,reviewed_at:T})+match(outdated,'shortlisted',{reviewed_by:ADMIN,reviewed_at:T})
    +match(undecided,'found')+match(rejected,'rejected',{reject_reason:'price',reviewed_by:ADMIN,reviewed_at:T})
    // The approved one's review event covers the search and the listing as they are now (BUS-15); the outdated one has none.
    +`INSERT INTO events(at,actor,entity_type,entity_id,type,data) SELECT m.reviewed_at,m.reviewed_by,'applicant',CAST(m.applicant_id AS TEXT),
      'match.reviewed',json_object('listing_id',m.listing_id,'from','found','to','shortlisted','search_version',a.match_inputs_revision,
      'listing_version',COALESCE((SELECT version FROM listing_match_inputs WHERE listing_id=m.listing_id),0))
      FROM matches m JOIN applicants a ON a.id=m.applicant_id WHERE m.applicant_id=${approved} AND m.listing_id='${lid}';`);

   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   await page.goto(base+`admin/#/p/${lid}`);
   const section=page.locator('#s-applicants');
   await section.getByRole('heading',{name:'Matched applicants (4)'}).waitFor();
   if(width===1280)assert.deepEqual(await section.locator('thead th').allInnerTexts(),
     ['Applicant','Looking','Evaluation','Decision','Availability','Enquiry','Score']);
   const row=name=>section.locator('tbody tr').filter({has:page.getByRole('link',{name})});
   const cell=(name,label)=>row(name).locator(`td[data-label="${label}"]`);
   const says=async(name,label,expected)=>assert.equal((await cell(name,label).innerText()).replace(/^\w+: /,'').replace(/\s+/g,' ').trim(),expected,`${name} ${label}`);
   await says(names[0],'Decision','Shortlisted');
   await says(names[1],'Decision','Shortlisted Approval out of date');
   await says(names[2],'Decision','Found');
   await says(names[3],'Decision','Rejected');
   for(const [i,name] of names.entries()){
    await says(name,'Availability','Confirmed');
    await says(name,'Enquiry','Not sent');
    assert.match(await cell(name,'Evaluation').innerText(),/Stated must-haves met|Requirements to confirm|Requirements not met/);
    assert.equal(await row(name).getByRole('link',{name}).getAttribute('href'),`#/applicants/${ids[i]}/matches`);
   }
   // No contact details of the applicants on the listing.
   assert.equal((await section.innerText()).includes('example.test'),false);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll at ${width}`);
   // Keyboard: the first applicant's link is reachable and opens that search's matches.
   await row(names[0]).getByRole('link').focus();
   await page.keyboard.press('Enter');
   await page.waitForURL(`**/#/applicants/${approved}/matches`);
   if(shots){await page.goBack();await section.getByRole('heading',{name:'Matched applicants (4)'}).waitFor();
    await section.screenshot({path:join(shots,`bus18-matched-${width}.png`)});}
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('BUS-18 property follow-up: ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
