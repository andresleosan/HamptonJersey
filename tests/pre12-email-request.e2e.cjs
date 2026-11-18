// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/pre12-email-request.e2e.cjs npm run test:e2e:isolated
// PRE-12 (PRE12_REQUESTS_READY, on in wrangler.toml): a privacy request recorded from a received email in the panel takes
// its channel, day and reference from the email, copies nothing of it, and leaves the email in place.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  for(const width of [1280,390]){
   const subject=`Please send me my data ${width}`,at=new Date().toISOString();
   d1(`INSERT INTO email_inbound(dedupe_key,sender,recipient,subject,text,html_only,truncated,received_at)
    VALUES('pre12-email-${width}','person${width}@example.test','team@example.test','${subject}','Synthetic body',0,0,'${at}')`);
   const id=d1(`SELECT id FROM email_inbound WHERE dedupe_key='pre12-email-${width}'`)[0].id;

   const errors=[],page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async what=>{if(shots)await page.screenshot({path:join(shots,`pre12-email-${what}-${width}.png`),fullPage:true});};

   await page.goto(base+'admin/#/email');
   await page.getByRole('button',{name:'Received',exact:true}).click();
   await page.locator('.email-list').getByRole('button').filter({hasText:subject}).click();
   const link=page.getByRole('link',{name:'Record a privacy request',exact:true});
   await link.waitFor();await fits('email');await shot('email');
   await link.click();
   await page.getByRole('heading',{name:`Record a request from email HE-IN-${id}`,exact:true}).waitFor();
   assert.equal(await page.getByLabel('How it arrived').count(),0);
   await page.getByLabel('Type of request').selectOption('access');
   await fits('form');await shot('form');
   await page.getByRole('button',{name:'Save request',exact:true}).click();
   await page.getByText(`Email HE-IN-${id}`).first().waitFor();
   const [r]=d1(`SELECT received_via,reference,contact_id FROM privacy_requests ORDER BY rowid DESC LIMIT 1`);
   assert.equal(r.received_via,'email');assert.match(r.reference,new RegExp(`^Email HE-IN-${id}, received \\d{4}-\\d\\d-\\d\\d$`));
   assert.equal(r.contact_id,null);
   assert.equal(r.reference.includes(subject),false);
   assert.equal(d1(`SELECT count(*) AS n FROM email_inbound WHERE id=${id}`)[0].n,1);
   await fits('request');await shot('request');
   assert.deepEqual(errors,[]);
   await page.close();
  }
 } finally { await browser.close(); }
 console.log('PRE-12 privacy request from an email: link, prefilled form, stored channel and reference at 1280/390 PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
