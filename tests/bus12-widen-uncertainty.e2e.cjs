// Synthetic data only; run with test:e2e:isolated.
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {join,dirname}=require('node:path');
const {chromium}=require(process.env.PW||'playwright-core');
(async()=>{
 const base=new URL(process.env.BASE);
 assert.equal(base.protocol,'https:');assert.ok(['127.0.0.1','localhost','[::1]'].includes(base.hostname));
 assert.ok(process.env.E2E_PERSIST?.startsWith('/tmp/')&&process.env.E2E_VARS?.startsWith('/tmp/'));
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
 const {signSession,COOKIE}=await import('../server/auth.js');
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const sql=command=>execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,'--command',command],{stdio:'pipe'});
 const browser=await chromium.launch({executablePath:process.env.CHROME});
 try {for(const width of [1280,390]){
  sql(`UPDATE listings SET matchable=0; INSERT INTO listings(id,title,use,operation,availability,matchable,sale_price,currency,country,published,created_at,updated_at,updated_by) VALUES ('UNC-${width}','Unknown fixture','residential','sale','for_sale',1,950000,NULL,'Jersey',0,'2026-11-13','2026-11-13','fixture'),('GBP-${width}','Known fixture','residential','sale','for_sale',1,950000,'GBP','Jersey',0,'2026-11-13','2026-11-13','fixture')`);
  const context=await browser.newContext({viewport:{width,height:900}});
  try{
   await context.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:base.hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
   await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
   const made=await context.request.post(new URL('api/admin/applicants',base).href,{headers:{origin:base.origin},data:{name:`Widen fixture ${width}`,email:`widen-${width}@example.test`,source:'phone',operation:'buy',budget_max:900000,area_answer:'any',pets:[{kind:'none'}],requirement_priorities:{version:1,values:{budget:'must'},unknown:[]}}});
   assert.equal(made.status(),201);const {id}=await made.json();const page=await context.newPage();
   await page.goto(new URL(`admin/#/applicants/${id}/matches`,base).href);
   const row=page.locator('section.widen li').filter({hasText:'Budget up 10%'});
   await row.getByText('1 property has a price to confirm before comparing the budget.').waitFor();
   await row.getByText('0 new, 1 already found').waitFor();
   const button=row.getByRole('button',{name:/Use this/});await button.focus();assert.equal(await button.evaluate(e=>e===document.activeElement),true);
   await page.keyboard.press('Enter');await page.waitForFunction(()=>document.activeElement?.id==='a-budget_max');
   assert.equal(await page.locator('#a-budget_max').inputValue(),'990000');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
