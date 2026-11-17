// Synthetic local-only fixture: PUB-10's Staff view of an owner's request (status, related, erase) at 1280 and 390.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
const {readFileSync}=require('node:fs');
const {dirname,join}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');

(async()=>{
  assert.ok(process.env.E2E_PERSIST&&process.env.E2E_VARS&&process.env.BASE,'isolated local fixture required');
  const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
  const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
  const sql=statement=>execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local',
    '--persist-to',process.env.E2E_PERSIST,'--json','--command',statement],{encoding:'utf8'});
  const {signSession,COOKIE}=await import('../server/auth.js');
  let browser;
  try {
    const base=process.env.BASE,at=new Date().toISOString();
    sql(`INSERT OR REPLACE INTO app_settings(key,value,updated_at,updated_by) VALUES('owner_enquiries','{"enabled":true,"privacy_version":"fixture-v1"}','${at}','fixture')`);
    browser=await(process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
    for(const width of [1280,390]){
      const [a,b]=[crypto.randomUUID(),crypto.randomUUID()];
      for(const [id,n] of [[a,1],[b,2]])sql(`INSERT INTO owner_requests(id,request_id,payload_hash,name,phone,email,address,operation,valuation_requested,privacy_version,created_at,updated_at)
        VALUES('${id}','${crypto.randomUUID()}','fixture','Synthetic Owner','07700123456','owner-${width}@example.test','${n} Example Road','sale',1,'fixture-v1','${at}','${at}')`);
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
      await context.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),
        domain:new URL(base).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`${base}admin/#/owners/${a}`);
      await page.getByRole('heading',{name:'Property owner request'}).waitFor();
      await page.getByText('1 Example Road').waitFor();
      await page.getByRole('heading',{name:'Other requests with the same email or telephone'}).waitFor();
      assert.equal(await page.locator(`a[href="#/owners/${b}"]`).count(),1);
      const save=page.getByRole('button',{name:'Save status'});assert.equal(await save.isDisabled(),true);
      await page.getByLabel('Status').selectOption('contacted');await save.click();
      await page.getByRole('status').filter({hasText:'Status saved.'}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Erase request'}).click();
      await page.getByText('Request erased. Its Inbox task is closed.').waitFor();
      const left=JSON.parse(sql(`SELECT COUNT(*) n FROM owner_requests WHERE id='${a}'`))[0].results[0].n;assert.equal(left,0);
      assert.deepEqual(errors,[]);await context.close();
    }
  } finally {await browser?.close();}
  console.log('PUB-10 Staff owner request: status, related, erase, 390/1280 PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
