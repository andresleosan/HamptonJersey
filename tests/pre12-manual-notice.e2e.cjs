// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/pre12-manual-notice.e2e.cjs npm run test:e2e:isolated
// PRE-12 (Q05, migration 0119, PRE12_RETENTION_NOTICE_READY on for this run only): a contact in Expiring whose retention
// notice failed shows the Retention notice card on its applicant page; recording a manual notice keeps the record and says so.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.PRE12_RETENTION_NOTICE_READY,'1');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),origin=new URL(base).origin,ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  for(const width of [1280,390]){
   const name=`PRE12 Manual ${width}`;
   const made=await ctx.request.post(base+'api/admin/applicants',{headers:{origin},data:{name,email:`pre12-manual-${width}@example.test`,
    operation:'rent',source:'phone',budget_max:2000,bedrooms_min:2}});
   assert.equal(made.status(),201);const id=(await made.json()).id;
   // Last active 11½ months ago, search resolved: the contact is in Expiring and its notice email failed.
   const last=new Date(Date.now()-350*864e5).toISOString(),now=new Date().toISOString();
   const [{contact_id:contact}]=d1(`SELECT contact_id FROM applicants WHERE id=${id}`);
   d1(`UPDATE applicants SET search_state='resolved',resolved_at='${now}',resolved_by='${ADMIN}',resolution_reason='Found elsewhere' WHERE id=${id}; UPDATE contacts SET last_activity_at='${last}' WHERE id=${contact};
    INSERT INTO retention_notices(contact_id,activity_at,delete_after,state,created_at,updated_at)
     VALUES(${contact},'${last}',date('${last}','+12 months','+1 day'),'failed','${now}','${now}');`);

   const errors=[],page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async what=>{if(shots)await page.screenshot({path:join(shots,`pre12-manual-${what}-${width}.png`),fullPage:true});};

   await page.goto(base+`admin/#/applicants/${id}`);
   const card=page.locator('section').filter({has:page.getByRole('heading',{name:'Retention notice',exact:true})});
   await card.getByText('could not be delivered').waitFor();
   await fits('card');await shot('card');
   // Without evidence the form names the field; with it, the review is recorded and nothing is deleted.
   await card.getByLabel('Day they were told').fill(new Date(Date.now()-2*864e5).toISOString().slice(0,10));
   await card.getByRole('button',{name:'Record manual notice'}).click();
   await card.getByRole('alert').getByText('Please check the highlighted fields.').waitFor();
   await card.getByLabel('Evidence').fill('Letter posted to the address on file, copy in the office file');
   await card.getByRole('button',{name:'Record manual notice'}).click();
   await card.getByRole('status').getByText('Manual notice recorded. Nothing has been deleted').waitFor();
   await card.getByText('Manual notice recorded',{exact:true}).waitFor();
   assert.equal(await card.getByRole('button',{name:'Record manual notice'}).count(),0);
   assert.equal(d1(`SELECT resolution_code FROM retention_notice_reviews WHERE contact_id=${contact}`)[0].resolution_code,'manual_notice_documented');
   assert.equal(d1(`SELECT count(*) AS n FROM contacts WHERE id=${contact}`)[0].n,1);
   await fits('recorded');await shot('recorded');
   assert.deepEqual(errors,[]);
   await page.close();
  }
 } finally { await browser.close(); }
 console.log('PRE-12 manual notice: card, validation and recorded review at 1280/390 PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
