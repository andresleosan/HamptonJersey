// Synthetic staff fixture; run only through test:e2e:isolated.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {parseEnv} = require('node:util');
const {chromium} = require(process.env.PW || 'playwright-core');
(async () => {
  const vars = parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
  const {signSession,COOKIE} = await import('../server/auth.js');
  const base = process.env.BASE.replace('127.0.0.1','localhost');
  const browser = await chromium.launch({executablePath:process.env.CHROME});
  try {
    const ctx = await browser.newContext();
    await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
    const made = await ctx.request.post(base+'api/admin/applicants',{headers:{origin:new URL(base).origin},data:{name:'SAP10 fixture',email:'sap10@example.test',operation:'buy',source:'phone',budget_max:900000}});
    assert.equal(made.status(),201); const {id} = await made.json();
    for (const width of [1280,390]) {
      const page = await ctx.newPage(); await page.setViewportSize({width,height:900});
      await page.goto(base+`admin/#/applicants/${id}`); await page.locator('#a-budget_max').waitFor();
      let writes=0; page.on('request', r => { if (r.method()==='PUT' && r.url().includes(`/admin/applicants/${id}`)) writes++; });
      const input=page.locator('#a-budget_max'), checkbox=page.getByRole('checkbox',{name:'I confirm the applicant agreed to these changes.'});
      await input.fill(String(width*1000)); await page.getByRole('button',{name:'Save',exact:true}).click();
      await page.getByText('Confirm the applicant agreed to these changes',{exact:true}).waitFor(); assert.equal(writes,0);
      await checkbox.check(); await input.fill(String(width*1000+1)); assert.equal(await checkbox.isChecked(),false);
      await checkbox.check(); await page.getByRole('button',{name:'Save',exact:true}).click(); await page.getByText('Changes saved.',{exact:true}).waitFor(); assert.equal(writes,1);
      await page.close();
    }
    console.log('SAP-10 confirmation: 1280/390 passed');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
